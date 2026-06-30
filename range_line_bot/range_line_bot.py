"""Range-Line Bot — the §13/§15 range-extension strategy, live.

Assembled entirely from pylego bricks: it consumes the frozen range_line_bot_plan
(per-instrument fade/follow policy + ladder spec), builds each instrument's
Asia (London-window) + Monday fib ladders from live session bars (the IDENTICAL
ladder the offline policy learned on), and on a ladder touch opens ONE held
position per (source, side), trailed out by a chandelier stop. Sizing via
pylego.sizing; orders routed to a Broker (PaperBroker by default; Mt5Broker --live).

  python range_line_bot/range_line_bot.py            # paper mode (default)
  python range_line_bot/range_line_bot.py --live      # live MT5 (needs creds in config)

Config/credentials/status flow through the dashboard KV like the other bots
(range_line_bot_config / range_line_bot_credentials / range_line_bot_status).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                              # noqa: E402
from pylego import instruments as I                          # noqa: E402
from pylego import point_values as PV                        # noqa: E402
from pylego.sizing import position_size                      # noqa: E402
from pylego.broker.paper import PaperBroker                  # noqa: E402
from pylego.strategy.rangeline import chandelier_stop        # noqa: E402
from range_line_bot.engine import RangeSession, session_anchor_epoch, SRC_MINUTES  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("range_line_bot")

MAGIC = 20260131                                            # unique to this bot
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")

DEFAULT_CFG = {
    "kill_switch": False,
    "paper_mode": True,
    "risk_pct": 0.5,
    "max_lot": 2.0,
    "max_open": 12,
    "max_spread_pips": 1e9,        # indices: set a real cap on the config page
    "plan_secs": 600,              # re-pull the daily plan
    "status_secs": 30,             # read config + push status
    "tick_secs": 3,                # local price watch + touch detection + chandelier trail
    "enabled_pairs": [],           # [] = the plan's universe
}

# Broker symbol routing (instrument identity stays shared; routing is local).
# Built-in defaults; the config page can override any of these per broker (the
# `broker_symbols` map in range_line_bot_config) — read live into _broker_overrides
# each config refresh, so a symbol change applies WITHOUT a bot restart.
_BROKER_OVERRIDE = {"de30": "GER40", "uk100": "UK100", "us2000": "US2000", "spx": "SP500",
                    "spx500": "SP500", "nq": "USTECH100", "us30": "US30"}
_broker_overrides: dict = {}                    # mutated in place from config (do not reassign)


def _apply_broker_symbols(cfg: dict) -> None:
    """Refresh the runtime broker-symbol overrides from config (blank values ignored
    → fall back to the built-in default). Mutates the shared dict so the resolver
    the broker already holds sees the change."""
    _broker_overrides.clear()
    for k, v in (cfg.get("broker_symbols") or {}).items():
        if v and str(v).strip():
            _broker_overrides[str(k).lower()] = str(v).strip()


def _broker_sym(pair: str) -> str:
    p = pair.lower()
    if p in _broker_overrides:                  # user's per-broker override wins
        return _broker_overrides[p]
    if p in _BROKER_OVERRIDE:                    # built-in default
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
        pip = I.pip_size(pair); pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    return position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)


def monday_anchor_epoch(now_epoch: float, boundary_hour: int) -> int:
    """Start epoch of the most-recent COMPLETED Monday session (never the forming
    one): step back from today's session-open day to this week's Monday, or last
    week's if today's session day is itself Monday."""
    anc = datetime.fromtimestamp(session_anchor_epoch(now_epoch, boundary_hour), tz=timezone.utc)
    wd = anc.weekday()                                     # Mon=0 … Sun=6
    days_back = wd if wd != 0 else 7
    return int((anc - timedelta(days=days_back)).timestamp())


def _window_bars(bars, start_epoch, secs):
    """Bars whose time falls in [start, start+secs)."""
    end = start_epoch + secs
    return [b for b in (bars or []) if start_epoch <= int(b.get("time", 0)) < end]


def _build_ladders(sess: RangeSession, broker, plan, now_epoch):
    """Lazily build the Asia (London-window) + Monday ladders once their ranges are
    known. Returns True if anything new was built (→ prime)."""
    built = False
    bh, ah = plan["boundaryHour"], plan["asiaHrs"]
    sources = plan.get("sources", ["asia", "monday"])
    # Asia / London window: anchor → anchor + asiaHrs; tradeable once the window closed.
    if "asia" in sources and not sess.has_range("A"):
        anchor = session_anchor_epoch(now_epoch, bh)
        if now_epoch >= anchor + ah * 3600:
            try:
                wb = _window_bars(broker.session_bars(sess.instrument, anchor), anchor, ah * 3600)
                if sess.set_range("A", wb):
                    built = True
            except Exception as e:
                log.warning(f"{sess.instrument}: Asia range build failed: {e}")
    # Monday: the most-recent completed Monday session (24h).
    if "monday" in sources and not sess.has_range("M"):
        manchor = monday_anchor_epoch(now_epoch, bh)
        try:
            mb = _window_bars(broker.session_bars(sess.instrument, manchor), manchor, 24 * 3600)
            if mb and sess.set_range("M", mb):
                built = True
        except Exception as e:
            log.warning(f"{sess.instrument}: Monday range build failed: {e}")
    return built


def _instr_lines(plan, sessions, broker):
    """Per-instrument snapshot for the config page: the ladders the bot built + live
    price + which levels have been acted/taken."""
    out = []
    for instr in (plan or {}).get("universe", []):
        sess = sessions.get(instr)
        if sess is None:
            continue
        px = None
        try: px = broker.price(instr)
        except Exception: pass
        ladders = {src: {"low": round(l["low"], 6), "high": round(l["high"], 6),
                         "levels": [{"label": lv["label"], "side": lv["side"], "level": round(lv["level"], 6)}
                                    for lv in l["levels"]]}
                   for src, l in sess.ladders.items()}
        out.append({"instrument": instr, "price": round(px, 6) if px else None,
                    "ladders": ladders, "acted": sorted(f"{a}|{b}" for a, b in sess.acted),
                    "taken": sorted(f"{a}|{b}" for a, b in sess.entered)})
    return out


def build_status(cfg, broker, plan, paper, sessions):
    bal = broker.account_balance()
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "balance": round(bal, 2) if bal is not None else None,
        "universe": (plan or {}).get("universe", []),
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
        "lines": _instr_lines(plan, sessions or {}, broker),
    }


def _manage_chandeliers(positions, broker, plan, cfg):
    """Trail every open position by its chandelier stop; close at market when hit.
    Native SL (= protect stop) is the disaster floor if the bot dies; the bot
    enforces the tighter trailing exit here."""
    chand = plan.get("chandFrac", 0.5)
    for tid in list(positions):
        pos = positions[tid]
        px = None
        try: px = broker.price(pos["instr"])
        except Exception: pass
        if px is None:
            continue
        # advance the favourable peak
        pos["peak"] = max(pos["peak"], px) if pos["dir_up"] else min(pos["peak"], px)
        stop = chandelier_stop(pos["dir_up"], pos["entry"], pos["peak"], pos["rung"], pos["protect"], chand)
        hit = (px <= stop) if pos["dir_up"] else (px >= stop)
        if hit:
            try:
                broker.stop(tid, pos["instr"], cfg.get("paper_mode", True), reason="chandelier")
                log.info(f"{pos['instr']} chandelier exit @ {round(px,6)} (stop {round(stop,6)}) ticket {tid}")
            except Exception as e:
                log.warning(f"{pos['instr']}: chandelier close failed: {e}")
            positions.pop(tid, None)


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    try:
        cfg = _deep_merge(DEFAULT_CFG, kv.get_json("range_line_bot_config") or {})
    except Exception as e:
        log.error(f"could not reach dashboard at {base_url} to read config: {e} — exiting")
        return
    _apply_broker_symbols(cfg)
    if force_live:
        cfg["paper_mode"] = False
    broker, paper = make_broker(cfg)

    if not paper:
        try:
            creds = kv.get_json("range_line_bot_credentials") or {}
        except Exception as e:
            log.error(f"could not reach dashboard to read credentials: {e} — exiting")
            return
        if not creds.get("mt5_account"):
            log.error("live mode but no mt5_account in range_line_bot_credentials — refusing to start. "
                      "Save MT5 credentials on the bot config page first.")
            return
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed — exiting")
            return

    sessions: dict[str, RangeSession] = {}
    positions: dict = {}                                   # ticket -> chandelier state
    plan = None
    last_anchor = None
    last_plan = last_status = 0.0

    while True:
        nowt = time.time()

        # (a) Plan — slow pull. New plan OR new session day → rebuild the ladders.
        if nowt - last_plan >= cfg.get("plan_secs", 600) or plan is None:
            try:
                new_plan = kv.get_json("range_line_bot_plan")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} — keeping current plan")
                new_plan = None
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                sessions = {}
                last_anchor = None
                log.info(f"new plan loaded · {plan.get('generatedAt')} · {len(plan.get('universe', []))} instruments")
            last_plan = nowt

        if plan:
            anchor = session_anchor_epoch(nowt, plan["boundaryHour"])
            if anchor != last_anchor:                      # new session day → fresh ladders/one-shots
                sessions = {instr: RangeSession(instr, plan["ladderFibs"], chand_frac=plan.get("chandFrac", 0.5))
                            for instr in plan.get("universe", [])}
                last_anchor = anchor

        # (b) Config + status — medium.
        if nowt - last_status >= cfg.get("status_secs", 30):
            try:
                cfg = _deep_merge(DEFAULT_CFG, kv.get_json("range_line_bot_config") or cfg)
                _apply_broker_symbols(cfg)            # pick up broker-symbol edits live
            except Exception as e:
                log.warning(f"config fetch failed: {e}")
            try:
                kv.put_status("range_line_bot_status", build_status(cfg, broker, plan, paper, sessions))
            except Exception as e:
                log.warning(f"status push failed: {e}")
            last_status = nowt

        # (c) Tight loop: build ladders when ready, trail open positions, take entries.
        if plan and not cfg.get("kill_switch"):
            _manage_chandeliers(positions, broker, plan, cfg)
            if hasattr(broker, "check_barriers"):
                broker.check_barriers()                    # paper: native SL floor
            instruments = cfg.get("enabled_pairs") or plan.get("universe", [])
            bal = broker.account_balance() or 0.0
            for instr in instruments:
                sess = sessions.get(instr)
                ip = (plan.get("instruments") or {}).get(instr)
                if sess is None or ip is None:
                    continue
                if _build_ladders(sess, broker, plan, nowt):
                    # prime: mark levels price already crossed so we don't retro-enter
                    try:
                        px0 = broker.price(instr)
                        if px0 is not None:
                            sess.decide(px0, ip["policy"], dry_run=True)
                    except Exception:
                        pass
                px = broker.price(instr)
                if px is None:
                    continue
                if len(broker.serialize_open_positions()) >= cfg.get("max_open", 12):
                    continue
                for spec in sess.decide(px, ip["policy"]):
                    sl = spec["protect_stop"]
                    far_tp = spec["entry"] + (1 if spec["dir_up"] else -1) * 100 * spec["rung"]  # chandelier is the real exit
                    lots = size_for(instr, bal, cfg.get("risk_pct", 0.5), spec["entry"] - sl, cfg.get("max_lot", 2.0))
                    direction = "LONG" if spec["dir_up"] else "SHORT"
                    tid = broker.enter(instr, direction, sl, far_tp, lots,
                                       cfg.get("max_spread_pips", 1e9), paper,
                                       comment=f"RL {spec['label']} {spec['decision'][0]}")
                    if tid is not None and tid != -1 or paper:
                        positions[tid] = {"instr": instr, "dir_up": spec["dir_up"], "entry": spec["entry"],
                                          "peak": spec["entry"], "rung": spec["rung"], "protect": sl}
                    log.info(f"{'[PAPER] ' if paper else ''}{instr} {spec['decision'].upper()} "
                             f"{spec['label']} {spec['side']} → ticket {tid} lots {lots}")

        time.sleep(max(cfg.get("tick_secs", 3), 1))


def main():
    ap = argparse.ArgumentParser(description="MacroFX Range-Line Bot")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
