"""Volatility Bot — the per-line fade strategy, live.

Assembled entirely from pylego bricks: it consumes the frozen volatility_bot_plan
(survivor universe + fade/follow policy + per-pair σ/open + band fractions),
tracks each pair's session intraday, and on a forecast-line touch decides
fade/follow via the golden-tested engine, sizes with pylego.sizing, and routes
the order to a Broker (PaperBroker by default; the canonical Mt5Broker when --live).

  python volatility_bot/volatility_bot.py            # paper mode (default)
  python volatility_bot/volatility_bot.py --live      # live MT5 (needs creds in config)

Config/credentials/status flow through the dashboard KV exactly like the other
bots (volatility_bot_config / volatility_bot_credentials / volatility_bot_status).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                              # noqa: E402
from pylego import instruments as I                          # noqa: E402
from pylego import point_values as PV                        # noqa: E402
from pylego.sizing import position_size                      # noqa: E402
from pylego.broker.paper import PaperBroker                  # noqa: E402
from volatility_bot.engine import SessionTracker, decide, session_open_epoch  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("volatility_bot")

MAGIC = 20260099
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")

DEFAULT_CFG = {
    "kill_switch": False,          # hard stop — no new entries
    "paper_mode": True,            # flip to live from the config page
    "risk_pct": 0.5,               # % of balance risked per trade
    "max_lot": 2.0,
    "max_open": 12,                # cap concurrent positions
    # Three DECOUPLED cadences (see run()): σ/fractions/open only change once per
    # session, so the plan is pulled slowly; config/status on a medium timer; the
    # actual level-watch + touch detection is the tight local loop off live price.
    "plan_secs": 600,              # re-pull the daily plan (trackers reset only on a NEW session)
    "status_secs": 30,            # read config (kill/paper toggle) + push status
    "tick_secs": 3,               # local price watch + touch detection
    "enabled_pairs": [],           # [] = use the plan's survivor universe
}


# ── broker symbol resolution (instrument identity shared; routing is local) ────
_BROKER_OVERRIDE = {"de30": "GER40", "uk100": "UK100", "us2000": "US2000", "spx": "SP500", "nq": "USTECH100"}


def _broker_sym(pair: str) -> str:
    p = pair.lower()
    if p in _BROKER_OVERRIDE:
        return _BROKER_OVERRIDE[p]
    try:
        return I.mt5_symbol(pair) or pair.upper()
    except Exception:
        return pair.upper()


def _deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = _deep_merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def make_broker(cfg: dict):
    """PaperBroker unless live + MT5 available. Uses the canonical pylego
    `Mt5Broker` brick (shared with the regime bots) for the live path; PaperBroker
    exposes the same surface so the loop is broker-agnostic."""
    if cfg.get("paper_mode", True):
        return PaperBroker(balance=10_000.0), True
    from pylego.broker.mt5 import Mt5Broker
    broker = Mt5Broker(MAGIC, _broker_sym, I.pip_size, log=log)
    if not broker.available:
        log.warning("live requested but MetaTrader5 missing — falling back to PAPER")
        return PaperBroker(balance=10_000.0), True
    return broker, False


def size_for(pair: str, balance: float, risk_pct: float, sl_dist: float, max_lot: float) -> float:
    try:
        pip = I.pip_size(pair)
        pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    return position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)


def build_status(cfg: dict, broker, plan, paper: bool) -> dict:
    bal = broker.account_balance()
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "balance": round(bal, 2) if bal is not None else None,
        "universe": (plan or {}).get("universe", []),
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
    }


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    cfg = _deep_merge(DEFAULT_CFG, kv.get_json("volatility_bot_config") or {})
    if force_live:
        cfg["paper_mode"] = False
    broker, paper = make_broker(cfg)

    if not paper:
        creds = kv.get_json("volatility_bot_credentials") or {}
        # Credential keys match the config page (_saveCreds): mt5_account/password/server/path.
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed — exiting")
            return

    trackers: dict[str, SessionTracker] = {}
    plan = None
    last_plan = last_status = last_minute = 0.0

    # The trading loop runs at tick_secs off LIVE price. σ/fractions/open and the
    # policy come from the daily plan (pulled slowly, trackers reset only when a
    # NEW session's plan appears) — the OC lines are then static off the open and
    # the HL lines are recomputed LOCALLY each tick from the bot's own running
    # extremes, so a level is watched in real time with no server in the path.
    while True:
        nowt = time.time()

        # (a) Session plan — slow. Reset trackers only on a genuinely new plan.
        if nowt - last_plan >= cfg.get("plan_secs", 600) or plan is None:
            new_plan = kv.get_json("volatility_bot_plan")
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                trackers = {}
                since = session_open_epoch(nowt)
                for p in plan.get("universe", []):
                    tr = SessionTracker(plan["pairs"][p]["open"])
                    # Walk the session so far (open → now) to sync extremes + velocity,
                    # then dry-run prime so lines already crossed aren't retro-traded.
                    try:
                        tr.catch_up(broker.session_bars(p, since))
                        px0 = broker.price(p)
                        if px0 is not None:
                            tr.on_price(px0)
                            decide(plan["pairs"][p], plan.get("policy", {}), tr, px0, dry_run=True)
                    except Exception as e:
                        log.warning(f"{p}: catch-up failed: {e}")
                    trackers[p] = tr
                log.info(f"new session plan: {len(trackers)} pairs synced · {plan.get('generatedAt')}")
            last_plan = nowt

        # (b) Config + status — medium. Picks up kill-switch / paper↔live promptly.
        if nowt - last_status >= cfg.get("status_secs", 30):
            cfg = _deep_merge(DEFAULT_CFG, kv.get_json("volatility_bot_config") or cfg)
            try:
                kv.put_status("volatility_bot_status", build_status(cfg, broker, plan, paper))
            except Exception as e:
                log.warning(f"status push failed: {e}")
            last_status = nowt

        # (c) Price watch + touch detection — tight, local, off live price.
        if plan and not cfg.get("kill_switch"):
            pairs = cfg.get("enabled_pairs") or plan.get("universe", [])
            sample_minute = (nowt - last_minute) >= 60
            for pair in pairs:
                tr, pp = trackers.get(pair), plan["pairs"].get(pair)
                if tr is None or pp is None:
                    continue
                px = broker.price(pair)
                if px is None:
                    continue
                tr.on_price(px)                       # updates running extremes → moves the HL lines
                if sample_minute:
                    tr.on_minute(px)                  # feeds the approach-velocity buffer
                if hasattr(broker, "check_barriers"):
                    broker.check_barriers()           # paper triple-barrier (MT5 does it natively)
                if len(broker.serialize_open_positions()) >= cfg.get("max_open", 12):
                    continue
                bal = broker.account_balance() or 0.0
                for spec in decide(pp, plan.get("policy", {}), tr, px):
                    lots = size_for(pair, bal, cfg.get("risk_pct", 0.5),
                                    spec["entry"] - spec["sl"], cfg.get("max_lot", 2.0))
                    direction = "LONG" if spec["side"] == "buy" else "SHORT"
                    tid = broker.enter(pair, direction, spec["sl"], spec["tp"], lots,
                                       cfg.get("max_spread_pips", 1e9), paper,
                                       comment=f"Vol {spec['line']} {spec['decision'][0]}")
                    log.info(f"{'[PAPER] ' if paper else ''}{pair} {spec['decision'].upper()} "
                             f"{spec['line']} {spec['bucket']} → ticket {tid} lots {lots}")
            if sample_minute:
                last_minute = nowt

        time.sleep(max(cfg.get("tick_secs", 3), 1))


def main():
    ap = argparse.ArgumentParser(description="MacroFX Volatility Bot")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
