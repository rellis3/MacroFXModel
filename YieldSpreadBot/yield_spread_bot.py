"""Yield-Spread Bot — the yield-spread z-score mean-reversion sleeve, live.

Assembled from pylego bricks. It consumes the frozen ``yield_spread_plan`` (per-pair
US-vs-foreign 2Y yield-spread z-score + the strategy thresholds, computed
server-side by the VALIDATED engine math — single source of truth, never re-run
here) and runs a per-pair daily-swing state machine:

  • FLAT  + |z| ≥ entryThreshold  → enter at market in the z-direction (oriented by
                                    the plan's per-pair ``inverted`` flag),
  • HELD  + |z| ≤ zExit           → exit (z reverted to the mean), OR
  • HELD  + held ≥ maxHoldDays    → exit (time stop).

A WIDE protective stop (``sl_pct`` % of price) is placed as gap insurance only —
the z-reversion / time exit is the primary path (this is a multi-day swing, not an
intraday fade). Sizing is flat risk-% off that stop distance (the backtest showed
z-tier "size up at extremes" is backwards, so we do NOT tier the size).

  python YieldSpreadBot/yield_spread_bot.py                 # paper mode (default)
  python YieldSpreadBot/yield_spread_bot.py --live          # live MT5 (needs creds in config)
  python YieldSpreadBot/yield_spread_bot.py --dashboard-url https://your-app.up.railway.app

Config/credentials/status flow through the dashboard KV exactly like the other
bots (yield_spread_config / yield_spread_credentials / yield_spread_status); the plan is
yield_spread_plan. VALIDATED, NOT forward-proven — defaults to paper.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                                  # noqa: E402
from pylego.instruments import pip_size, mt5_symbol             # noqa: E402
from pylego.point_values import point_value                     # noqa: E402
from pylego.sizing import position_size                         # noqa: E402
from pylego.broker.paper import PaperBroker                     # noqa: E402
from pylego.quotes import QuoteFeed                             # noqa: E402
from pylego.risk_guard import RiskGuard, log_block_transition   # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("yield_spread_bot")

# Registered in pylego/magics.py (checked by pylego/magics_test.py).
MAGIC = 20260012

DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")

KV_CONFIG = "yield_spread_config"
KV_CREDS  = "yield_spread_credentials"
KV_STATUS = "yield_spread_status"
KV_PLAN   = "yield_spread_plan"

# Operational config the bot reads (edited on the bot-config page, re-read every
# ``status_secs``). The z-math thresholds ALSO live in the plan (single source of
# truth); the ones here are the fallback used only if the plan is missing them.
DEFAULT_CFG: dict = {
    "enabled":         True,
    "kill_switch":     False,          # hard stop — no new entries (exits still run)
    "paper_mode":      True,           # flip to live from the config page (validated ≠ proven)
    "risk_pct":        0.5,            # % of balance risked per trade (flat — no z-tier sizing)
    "max_lot":         5.0,            # lot cap
    "sl_pct":          2.5,            # WIDE protective stop as % of price (gap insurance only)
    "entry_threshold": 2.0,           # |z| to enter (sweep's highest honest-Sharpe cell)
    "z_window":        90,            # rolling-z lookback (informational — the plan sets it)
    "z_exit":          1.5,            # |z| to exit on reversion
    "max_hold_days":   20,            # hard time stop if z never reverts
    "max_open":        6,             # cap concurrent positions
    "enabled_pairs":   [],            # [] = use the plan's universe
    "cooldown":        3600,          # seconds between entries on the SAME pair
    # Cadences: the z only changes once a day (plan refreshed nightly), so the
    # plan is pulled slowly; config/status on a medium timer; price watch (for the
    # protective-stop barrier + paper marking) on a light loop.
    "plan_secs":       600,
    "status_secs":     60,
    "tick_secs":       10,
    # Telegram entry/exit alerts (optional). tg_token/tg_chat_id fall back to the
    # shared tg_config (Level bot) if left blank — one message on entry, one on close
    # (with entry/exit, pip move, % and money P&L).
    "tg_enabled":      False,
    "tg_token":        "",
    "tg_chat_id":      "",
}

# A plan older than this many days means the nightly producer has been failing —
# halt NEW entries (its z is stale) but keep managing exits / the protective stop.
MAX_PLAN_AGE_DAYS = 3.0


def _broker_sym(pair: str) -> str:
    try:
        return mt5_symbol(pair) or pair.upper()
    except Exception:
        return pair.upper()


# ── Telegram alerts (mirror oi_bot / DynAnchor) ───────────────────────────────
def _load_tg(cfg: dict, kv: KvClient) -> tuple[str, str]:
    """Bot-specific TG creds if set, else fall back to the shared ``tg_config``
    (the Level bot's) — same convention as the other bots."""
    tok = str(cfg.get("tg_token", "") or "").strip()
    cid = str(cfg.get("tg_chat_id", "") or "").strip()
    if tok and cid:
        return tok, cid
    try:
        shared = kv.get_json("tg_config") or {}
    except Exception:
        shared = {}
    return str(shared.get("token", "") or "").strip(), str(shared.get("chatId", "") or "").strip()


def send_telegram(token: str, chat_id: str, text: str) -> bool:
    if not token or not chat_id:
        return False
    try:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}, timeout=10)
        return r.status_code == 200
    except Exception as e:
        log.warning(f"Telegram send failed: {e}")
        return False


def _digits(pair: str) -> int:
    try:
        return 3 if pip_size(pair) >= 0.01 else 5
    except Exception:
        return 5


def _tg_entry(pair: str, direction: str, entry: float, sl: float, lots: float,
              z: float, paper: bool) -> str:
    icon = "📈" if direction == "LONG" else "📉"
    mode = " [PAPER]" if paper else ""
    d = _digits(pair)
    try:
        sl_p = abs(entry - sl) / pip_size(pair)
    except Exception:
        sl_p = 0.0
    return (
        f"{icon} <b>Yield-Spread {direction} — {pair.upper()}</b>{mode}\n"
        f"Signal: spread-z <b>{z:+.2f}</b> (mean-reversion)\n"
        f"Entry: <code>{entry:.{d}f}</code>  Lots: <code>{lots}</code>\n"
        f"Protective SL: <code>{sl:.{d}f}</code> ({sl_p:.0f}p)  ·  exit on z-revert / time stop"
    )


def _tg_exit(pair: str, direction: str, entry: float, exit_p: float, reason: str,
             pnl_pips, pnl_pct, pnl_money, held_days, paper: bool) -> str:
    won = (pnl_money if pnl_money is not None else (pnl_pips or 0)) > 0
    icon = "✅" if won else "❌"
    mode = " [PAPER]" if paper else ""
    d = _digits(pair)
    money = f"  P&L: <code>{pnl_money:+.2f}</code>" if pnl_money is not None else ""
    pips = f"{pnl_pips:+.0f}p" if pnl_pips is not None else "—"
    pct = f"{pnl_pct:+.2f}%" if pnl_pct is not None else "—"
    held = f"{held_days:.1f}d" if held_days is not None else "—"
    return (
        f"{icon} <b>Yield-Spread CLOSE — {pair.upper()}</b>{mode}\n"
        f"Direction: {direction}  ·  Reason: {reason}  ·  Held: {held}\n"
        f"Entry: <code>{entry:.{d}f}</code>  Exit: <code>{exit_p:.{d}f}</code>\n"
        f"Result: <code>{pips}  ({pct})</code>{money}"
    )


def _closed_by_ticket(broker, ticket):
    """The just-closed trade for ``ticket`` from the broker's closed-trade list
    (both PaperBroker and Mt5Broker expose ticket + position_id + profit)."""
    for c in broker.serialize_closed_trades():
        if c.get("ticket") == ticket or c.get("position_id") == ticket:
            return c
    return None


def make_broker(cfg: dict):
    """PaperBroker unless live + MT5 available. The canonical pylego ``Mt5Broker``
    brick drives the live path; PaperBroker exposes the same surface so the loop is
    broker-agnostic."""
    if cfg.get("paper_mode", True):
        return PaperBroker(balance=10_000.0), True
    from pylego.broker.mt5 import Mt5Broker
    broker = Mt5Broker(MAGIC, _broker_sym, pip_size, log=log)
    if not broker.available:
        log.warning("live requested but MetaTrader5 missing — falling back to PAPER")
        return PaperBroker(balance=10_000.0), True
    return broker, False


def direction_from_z(z: float, inverted: bool = False) -> str:
    """Port of js/yieldSpreadCore.directionFromZ — z>0 → LONG, flipped by ``inverted``
    (USD-quote pairs). The plan already resolves ``inverted`` per pair server-side."""
    d = "LONG" if z > 0 else "SHORT"
    if inverted:
        d = "SHORT" if d == "LONG" else "LONG"
    return d


def size_for(pair: str, balance: float, risk_pct: float, sl_dist: float, max_lot: float) -> float:
    try:
        pip = pip_size(pair)
        pv = point_value(pair, default=10.0)
    except Exception:
        pip, pv = 0.0001, 10.0
    return position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)


def _open_for_pair(broker, pair: str):
    """The bot's single open position for ``pair`` (or None). Matches the serialized
    symbol against the pair name and its broker symbol, case-insensitively, so it
    works in both paper (symbol == pair) and live (symbol == broker MT5 name)."""
    want = {pair.lower(), _broker_sym(pair).lower()}
    for p in broker.serialize_open_positions():
        if str(p.get("symbol", "")).lower() in want:
            return p
    return None


def _plan_age_days(plan, now_epoch: float) -> float | None:
    """Age of the plan in days from its ``generatedAt``. None if unparseable (which
    the caller treats as stale → entries halted, fail-closed)."""
    gen = (plan or {}).get("generatedAt")
    if not gen:
        return None
    try:
        gen_epoch = datetime.fromisoformat(str(gen).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None
    return max(0.0, (now_epoch - gen_epoch) / 86_400.0)


def _pair_view(plan, broker, cfg) -> list[dict]:
    """Per-pair snapshot the config page renders: today's z, the resolved direction,
    whether we hold it and for how long, and the acting thresholds."""
    entry_thr = float(plan.get("entryThreshold", cfg.get("entry_threshold", 2.0)))
    z_exit = float(plan.get("zExit", cfg.get("z_exit", 1.5)))
    max_hold = int(plan.get("maxHoldDays", cfg.get("max_hold_days", 20)))
    now = time.time()
    out = []
    signals = (plan or {}).get("signals", {})
    for pair in (plan or {}).get("universe", []):
        sig = signals.get(pair) or {}
        z = sig.get("z")
        inverted = bool(sig.get("inverted"))
        pos = _open_for_pair(broker, pair)
        hold_days = None
        if pos and pos.get("time_open"):
            hold_days = round((now - float(pos["time_open"])) / 86_400.0, 2)
        out.append({
            "pair": pair,
            "z": z,
            "spread": sig.get("spread"),
            "asOf": sig.get("asOf"),
            "inverted": inverted,
            "direction": direction_from_z(z, inverted) if isinstance(z, (int, float)) else None,
            "signal": ("enter" if isinstance(z, (int, float)) and abs(z) >= entry_thr else "flat"),
            "in_position": bool(pos),
            "hold_days": hold_days,
            "entry_threshold": entry_thr,
            "z_exit": z_exit,
            "max_hold_days": max_hold,
        })
    return out


def build_status(cfg: dict, broker, plan, paper: bool) -> dict:
    bal = broker.account_balance()
    age = _plan_age_days(plan, time.time())
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "enabled": bool(cfg.get("enabled", True)),
        "balance": round(bal, 2) if bal is not None else None,
        "universe": (plan or {}).get("universe", []),
        "plan_generated_at": (plan or {}).get("generatedAt"),
        "plan_age_days": round(age, 2) if age is not None else None,
        "plan_stale": age is None or age > MAX_PLAN_AGE_DAYS,
        "pairs": _pair_view(plan, broker, cfg) if plan else [],
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
        "pushed_at": time.time(),
        "version": "v1",
    }


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    try:
        cfg = {**DEFAULT_CFG, **(kv.get_json(KV_CONFIG) or {})}
    except Exception as e:
        log.error(f"could not reach dashboard at {base_url} to read config: {e} — exiting")
        return
    if force_live:
        cfg["paper_mode"] = False
    broker, paper = make_broker(cfg)
    # Paper has no market feed: pull live quotes off the dashboard (/api/quote — the
    # same MT5-less path the regime bots use) and feed the broker each tick.
    quotes = QuoteFeed(base_url, log=log) if paper else None

    if not paper:
        try:
            creds = kv.get_json(KV_CREDS) or {}
        except Exception as e:
            log.error(f"could not reach dashboard at {base_url} to read credentials: {e} — exiting")
            return
        # Refuse to start live with no account (MT5 would silently attach to whatever
        # account the terminal is logged into) — mirrors volatility_bot.
        if not creds.get("mt5_account"):
            log.error(f"live mode but no mt5_account in {KV_CREDS} — refusing to start. "
                      "Save MT5 credentials on the bot config page first and confirm 'Saved ✓'.")
            return
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed — exiting")
            return

    # RiskGuard (shared brick): per-pair entry cooldown so a plan that lingers at an
    # extreme doesn't re-fire the same pair every cycle. Gates NEW entries only.
    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}

    plan = None
    last_plan = last_status = 0.0
    warned_stale = False
    tg_tok, tg_cid = _load_tg(cfg, kv)          # re-resolved on each config refresh
    log.info(f"YieldSpread bot starting  magic={MAGIC}  mode={'paper' if paper else 'live'}  url={base_url}"
             + (f"  telegram={'on' if cfg.get('tg_enabled') else 'off'}"))

    while True:
        nowt = time.time()

        # (a) Plan — slow. The z changes once a day; pull it on a slow timer.
        if nowt - last_plan >= cfg.get("plan_secs", 600) or plan is None:
            try:
                new_plan = kv.get_json(KV_PLAN)
                if new_plan:
                    if new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                        plan = new_plan
                        log.info(f"plan: {len(plan.get('universe', []))} pairs · {plan.get('generatedAt')}")
                elif plan is None:
                    log.warning(f"no {KV_PLAN} yet — waiting for the server producer "
                                "(POST /api/yield-spread/refresh-plan) to publish one")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} — keeping current plan")
            last_plan = nowt

        # (b) Config + status — medium. Picks up kill-switch / paper↔live / thresholds.
        if nowt - last_status >= cfg.get("status_secs", 60):
            try:
                cfg = {**DEFAULT_CFG, **(kv.get_json(KV_CONFIG) or cfg)}
                guard.sync_cfg(cfg)
                tg_tok, tg_cid = _load_tg(cfg, kv)   # a just-typed token/chat applies live
            except Exception as e:
                log.warning(f"config fetch failed: {e} — keeping current config")
            try:
                kv.put_status(KV_STATUS, build_status(cfg, broker, plan, paper))
            except Exception as e:
                log.warning(f"status push failed: {e}")
            last_status = nowt

        # (c) Manage positions + entries.
        if plan and cfg.get("enabled", True):
            pairs = cfg.get("enabled_pairs") or plan.get("universe", [])
            entry_thr = float(plan.get("entryThreshold", cfg.get("entry_threshold", 2.0)))
            z_exit = float(plan.get("zExit", cfg.get("z_exit", 1.5)))
            max_hold = int(plan.get("maxHoldDays", cfg.get("max_hold_days", 20)))
            signals = plan.get("signals", {})
            age = _plan_age_days(plan, nowt)
            plan_stale = age is None or age > MAX_PLAN_AGE_DAYS
            if plan_stale and not warned_stale:
                log.warning(f"STALE PLAN (age {age} d, generatedAt {plan.get('generatedAt')}) — "
                            "NEW entries halted until a fresh plan lands; exits/stops still run")
                warned_stale = True
            elif not plan_stale and warned_stale:
                log.info("fresh plan active — entries resumed")
                warned_stale = False

            bal = broker.account_balance()
            open_count = len(broker.serialize_open_positions())

            for pair in pairs:
                sig = signals.get(pair) or {}
                z = sig.get("z")
                if not isinstance(z, (int, float)):
                    continue
                inverted = bool(sig.get("inverted"))
                absz = abs(z)

                # Feed the paper broker the live quote (skip the pair on a stale quote).
                if quotes is not None:
                    q = quotes.price(pair)
                    if q is None:
                        continue
                    broker.set_price(pair, q)
                px = broker.price(pair)

                pos = _open_for_pair(broker, pair)

                # ── HELD: exit on z-revert or time stop ──────────────────────────
                if pos:
                    hold_days = ((nowt - float(pos["time_open"])) / 86_400.0
                                 if pos.get("time_open") else 0.0)
                    reason = None
                    if absz <= z_exit:
                        reason = "z-revert"
                    elif hold_days >= max_hold:
                        reason = "max-hold"
                    if reason:
                        try:
                            entry_px = float(pos.get("open_price") or 0.0)
                            pos_dir = pos.get("direction")            # BUY / SELL
                            broker.stop(pos["ticket"], pair, paper, reason=reason)
                            log.info(f"{'[PAPER] ' if paper else ''}{pair} EXIT ({reason}) "
                                     f"z={z:+.2f} held {hold_days:.1f}d ticket {pos['ticket']}")
                            open_count = max(0, open_count - 1)
                            # Telegram close alert — entry/exit, pip move, % and money P&L
                            # (money read from the broker's realized closed-trade record).
                            if cfg.get("tg_enabled") and tg_tok and tg_cid:
                                closed = _closed_by_ticket(broker, pos["ticket"])
                                exit_px = (closed.get("close_price") if closed else None)
                                if exit_px is None:
                                    exit_px = broker.price(pair)
                                pnl_money = closed.get("profit") if closed else None
                                pnl_pips = pnl_pct = None
                                if exit_px and entry_px:
                                    sign = 1 if pos_dir == "BUY" else -1
                                    try:
                                        pnl_pips = (exit_px - entry_px) * sign / pip_size(pair)
                                    except Exception:
                                        pnl_pips = None
                                    pnl_pct = (exit_px - entry_px) / entry_px * sign * 100
                                send_telegram(tg_tok, tg_cid, _tg_exit(
                                    pair, "LONG" if pos_dir == "BUY" else "SHORT", entry_px,
                                    exit_px or entry_px, reason, pnl_pips, pnl_pct, pnl_money,
                                    hold_days, paper))
                        except Exception as e:
                            log.warning(f"{pair}: exit failed: {e}")
                    else:
                        # Paper: enforce the protective stop (MT5 does it natively).
                        if hasattr(broker, "check_barriers"):
                            broker.check_barriers()
                    continue

                # ── FLAT: enter on an extreme z (unless halted) ──────────────────
                if cfg.get("kill_switch") or plan_stale:
                    continue
                if absz < entry_thr:
                    continue
                if open_count >= cfg.get("max_open", 6):
                    continue
                guard_why = guard.block_reason(bal if bal else 1_000_000.0, pair)
                log_block_transition(log, guard_blocks, pair, guard_why)
                if guard_why:
                    continue
                if px is None or not (px > 0):
                    continue

                direction = direction_from_z(z, inverted)
                sl_pct = float(cfg.get("sl_pct", 2.5))
                sl_dist = px * sl_pct / 100.0
                sl = px - sl_dist if direction == "LONG" else px + sl_dist
                lots = size_for(pair, bal or 0.0, float(cfg.get("risk_pct", 0.5)),
                                sl_dist, float(cfg.get("max_lot", 5.0)))
                # tp=0 — NO take-profit; the z-reversion / time exit is the only profit path.
                # No dedupe_tag: Mt5Broker's default blocks on ANY open position for the
                # pair+magic (one position per pair, which is what we want), and the
                # FLAT/HELD branch above already guarantees we never enter while holding.
                tid = broker.enter(pair, direction, sl, 0, lots, 50.0, paper,
                                   comment=f"YS z{z:+.1f} {direction[0]}")
                if tid:
                    guard.record_trade(pair)
                    open_count += 1
                    log.info(f"{'[PAPER] ' if paper else ''}{pair} ENTER {direction} "
                             f"z={z:+.2f} (|z|≥{entry_thr}) SL={sl:.5f} lots {lots} → ticket {tid}")
                    # Telegram entry alert — direction, signal z, fill, lots, protective SL.
                    if cfg.get("tg_enabled") and tg_tok and tg_cid:
                        op = _open_for_pair(broker, pair)
                        fill = float(op["open_price"]) if op and op.get("open_price") else px
                        send_telegram(tg_tok, tg_cid, _tg_entry(pair, direction, fill, sl, lots, z, paper))

        time.sleep(max(cfg.get("tick_secs", 10), 1))


def main():
    ap = argparse.ArgumentParser(description="MacroFX Yield-Spread Bot (yield-spread z mean-reversion)")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", "--dashboard-url", dest="url", default=DASHBOARD_URL,
                    help="dashboard base URL")
    args = ap.parse_args()
    try:
        run(args.url, args.live)
    except KeyboardInterrupt:
        log.info("shutdown requested (Ctrl-C) — stopping cleanly (open positions stay on the broker)")


if __name__ == "__main__":
    main()
