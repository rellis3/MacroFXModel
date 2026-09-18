"""motif_bot — touch-motif strategy, live/paper on MT5.

Same "server computes + freezes a plan to KV, the bot only polls + executes"
architecture as `fib_atlas_bot/fib_atlas_bot.py` / `volatility_bot_v2/
volatility_bot_v2.py` (mirror them for anything not called out below), built
entirely from `pylego/` bricks -- with one deliberate adaptation. Fib Atlas
and Vote Atlas's engines are native JS, so a NEW server.js interval computes
their plan. The touch-motif engine (`pylego.motif_touch`, `pylego.
barrier_race`) is native Python, and it ALREADY runs hourly on Railway as
`AnalogML/motif_track.py` -- the exact code path the backtest replays too. So
rather than port that detection logic into JS (the thing CLAUDE.md's Lego
Principle exists to prevent), `motif_track.py` itself pushes `motif_bot_plan`
at the end of every scan it already does. Zero new background jobs, zero
duplicated strategy logic -- there is structurally only ONE implementation of
"is this a confirmed touch-motif", which is the whole point of asking "how do
we know the engine is safe": there is nothing for this bot to disagree with.

This bot NEVER computes a vote, a level, a stop, or a direction from strategy
logic. `motif_bot_plan`'s entries carry a pip DISTANCE (the frozen sl_pips/
tp_r grid), never an absolute price -- the plan is rebuilt hourly and a
tracked reference price can be up to that hour stale, so this bot prices its
own SL/TP off its OWN fill at act time, never off the plan's stale reference
(see `_sl_tp_from_fill`'s own doc).

Deliberately SIMPLER than fib_atlas_bot.py -- not padded out to match its
scope for parity's own sake. The touch-motif signal resolves once per H1 bar
close (already fully decided by the time motif_track.py's hourly scan runs),
so there is no local tick-driven decision loop reacting to live price the way
Fib Atlas's zone-touch engine needs. No ladders (one strategy). No trailing/
chandelier exit: this session tested a tighter stop, a breakeven stop and a
Chandelier trail on the M1 path and NONE beat simply trading smaller once
verified out-of-sample (see AnalogML/motif-alert-backtest.html's own findings)
-- so the SL/TP placed at entry is the whole exit, exactly as validated.

  python motif_bot/motif_bot.py            # paper mode (default)
  python motif_bot/motif_bot.py --live      # live MT5 (needs creds in motif_bot_credentials)

Config / credentials / status / plan / decision log all flow through the
dashboard KV exactly like every other bot: motif_bot_config / _credentials /
_status / _plan / _state / _decision_log.
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                                     # noqa: E402
from pylego import instruments as I                                 # noqa: E402
from pylego import point_values as PV                                # noqa: E402
from pylego.sizing import position_size                              # noqa: E402
from pylego.broker.paper import PaperBroker                          # noqa: E402
from pylego.quotes import QuoteFeed                                   # noqa: E402
from pylego.costs import expected_fill, max_spread                    # noqa: E402
from pylego.risk_guard import RiskGuard, block_category  # noqa: E402
from pylego.telegram import send_telegram                             # noqa: E402
from pylego.motif_policy import RISK_GUARD_DEFAULTS, RETAIL_SPREAD_PIPS  # noqa: E402
from pylego.spread_stats import update_pair_stats                     # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("motif_bot")

MAGIC = 20260916                                                 # must match pylego/magics.py -- pylego/magics_test.py enforces it
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
REJECT_COOLDOWN_SECS = 300   # the plan only refreshes hourly, so a rejected entry
                              # need not be retried nearly as often as Fib Atlas's 60s

DEFAULT_CFG = {
    "kill_switch": False,
    "paper_mode": True,             # HARDCODED default -- same discipline as every other bot: never start fresh live.
    "enabled_pairs": [],            # [] -> whatever pairs motif_bot_plan carries (the plan's own best-config
                                     # filter -- skip swing_regime=with, spread<=2.0p -- is the REAL strategy gate).
                                     # Non-empty here further restricts which of the plan's pairs THIS instance acts on.
    "risk_pct": 0.25,               # matches this session's OOS-validated sizing: skip-with-trend + spread<=2.0
                                     # at 0.25%/trade -> OOS PF 1.268, +46.5%/yr, worst drawdown -12.5%.
    "max_lot": 5.0,
    "max_open": 20,
    "max_concurrent_per_pair": 2,   # distinct confirmed motifs (different touch runs) CAN legitimately overlap
                                     # on one pair -- this is not a re-arming zone, each motif_key fires once ever.
    "max_spread_pips": 3.0,         # bot-local execution safety net -- the PLAN already excludes pairs whose
                                     # modelled spread exceeds 2.0p (pylego.motif_policy.BEST_CONFIG); this guards
                                     # an included pair whose spread has temporarily widened, same role
                                     # max_spread_pips plays in every other bot's config.
    **RISK_GUARD_DEFAULTS,           # ddlimit/monthlydd/lockout/cooldown -- shared with the backtest's
                                     # --replay-risk-guard default (pylego.motif_policy) so the two never drift.
    "risk_guard_enabled": False,     # OFF by default (2026-09-16): with this off, the guard is still tracked
                                     # (balance/DD/cooldown state, visible on the dashboard) but never blocks an
                                     # entry -- the bot trades exactly the population motif_alert_backtest.py's
                                     # UNGATED export does (best-config filter only). Flip it on to add the
                                     # daily/monthly DD lockout + per-pair cooldown on top, matching what
                                     # `--replay-risk-guard` simulates. Kept opt-in rather than always-on so the
                                     # live book can match the backtest exactly until/unless the account actually
                                     # needs the protection -- see the user's own ask, 2026-09-16 session.
    "plan_max_age_hours": 3,        # motif_track_loop.sh refreshes hourly; 3x that before failing closed on a stale plan.
    "poll_secs": 60,                # how often this bot re-reads motif_bot_plan / checks for a fill to act on.
    "status_secs": 30,
    "tg_enabled": True,
    # Empty by default -- same convention as every other bot's DEFAULT_CFG:
    # a real bot token is a credential, never a literal in source. Set via
    # motif_bot_config in KV (the config page's Telegram fields).
    "tg_token": "",
    "tg_chat_id": "",
}


def _deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = _deep_merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def _log_guard_transition(log: logging.Logger, state: dict, key: str,
                          reason: str | None, enforced: bool) -> None:
    """`pylego.risk_guard.log_block_transition`, but enforcement-aware: that
    shared helper's own log line always says "NEW entries blocked", which
    would be a straight lie while `risk_guard_enabled` is off (nothing is
    being blocked -- see DEFAULT_CFG's own note on why that flag defaults
    off). Same once-per-state-change dedup, worded honestly either way."""
    prev = state.get(key)
    if block_category(reason) == block_category(prev):
        return
    state[key] = reason
    if reason:
        verb = "NEW entries blocked" if enforced else "would block new entries (risk_guard_enabled=false, NOT enforced)"
        log.warning(f'RiskGuard [{key}]: {verb} — {reason}')
    elif prev:
        log.info(f'RiskGuard [{key}]: clear{" — entries resumed" if enforced else ""}')


def _position_comment(motif_key: str) -> str:
    """Short, FIXED-LENGTH order comment (14 chars) instead of embedding
    `motif_key` verbatim -- caught live 2026-09-18: `MT[{motif_key}]` grows
    with n_touches and with how large the bar index is (the backtest's own
    trade history shows 21.6% of all motifs already produce a comment over
    MT5's 31-char limit, e.g. `MT[audcad:bottom:10045-10069-10092]` = 35
    chars), and only gets worse as more history accumulates. Mt5Broker's
    `_safe_comment` truncates an over-long comment to 31 chars as a backstop,
    but the truncated/mangled result was STILL rejected by the broker as
    "Invalid comment argument" (`order_send` returning None), silently
    skipping real entries -- not a rare edge case, roughly 1 in 5.

    A short hash of `motif_key` is deterministic (same motif always gets the
    same tag) and its length never depends on n_touches or bar index size, so
    it can never grow into this failure again. The full motif_key is not lost
    -- it's still the position's audit identity everywhere else (acted_keys,
    motif_bot_decision_log, the Telegram alert text); the broker comment only
    ever needed to be human-recognisable, not load-bearing."""
    return f"MT[{hashlib.sha1(motif_key.encode()).hexdigest()[:10]}]"


def _mt5_sym(pair: str) -> str:
    try:
        return I.mt5_symbol(pair) or pair.upper()
    except Exception:
        return pair.upper()


def make_broker(cfg: dict):
    if cfg.get("paper_mode", True):
        return PaperBroker(balance=10_000.0), True
    from pylego.broker.mt5 import Mt5Broker
    broker = Mt5Broker(MAGIC, _mt5_sym, I.pip_size, log=log)
    if not broker.available:
        log.warning("live requested but MetaTrader5 missing -- falling back to PAPER")
        return PaperBroker(balance=10_000.0), True
    return broker, False


def size_for(pair: str, balance: float, risk_pct: float, sl_dist: float, max_lot: float) -> float:
    try:
        pip = I.pip_size(pair); pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    lots = position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)
    return round(min(max(lots, 0.01), max_lot), 2)


def _sl_tp_from_fill(entry: dict, fill_price: float, pip: float) -> tuple[float, float]:
    """SL/TP computed from THIS bot's own expected fill, never the plan's
    stale tracked reference (see module docstring). `entry["direction"]` is
    "BUY"/"SELL"; sl/tp are the frozen sl_pips/tp_r grid every backtest
    number in this repo is judged against -- unchanged here, only the anchor
    price differs from a post-hoc backtest (which knows the true next-bar
    open) to a live fill (the fastest this bot can react)."""
    d = 1 if entry["direction"] == "BUY" else -1
    sl_dist = entry["sl_pips"] * pip
    tp_dist = sl_dist * entry["tp_r"]
    sl = fill_price - d * sl_dist
    tp = fill_price + d * tp_dist
    return sl, tp


def _plan_entries(plan: dict | None) -> list[dict]:
    return list((plan or {}).get("entries") or [])


def _plan_age_hours(plan: dict, now_epoch: float) -> float | None:
    ga = (plan or {}).get("generatedAt")
    if not ga:
        return None
    try:
        t = datetime.fromisoformat(str(ga).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return max(0.0, (now_epoch - t.timestamp()) / 3600.0)
    except Exception:
        return None


def _enabled_entries(cfg: dict, plan: dict) -> list[dict]:
    wanted = {str(p).lower() for p in (cfg.get("enabled_pairs") or [])}
    return [e for e in _plan_entries(plan) if not wanted or str(e.get("pair", "")).lower() in wanted]


# ── Telegram — entered/skipped decisions + TP/SL close outcomes ────────────
# Bot-local send (mirrors fib_atlas_bot._tg_send exactly): needs the sent
# message_id back for reply-threading a close alert onto its entry alert,
# which pylego.telegram.send_telegram's simple bool contract doesn't carry.
def _tg_send(token: str, chat_id: str, text: str, *, reply_to: int | None = None) -> int | None:
    if not token or not chat_id:
        return None
    try:
        import requests
        body = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        if reply_to:
            body["reply_to_message_id"] = reply_to
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json=body, timeout=10)
        j = r.json()
        return j.get("result", {}).get("message_id") if j.get("ok") else None
    except Exception as e:
        log.warning(f"Telegram send failed: {e}")
        return None


def _fmt_px(px: float | None) -> str:
    if px is None:
        return "—"
    ax = abs(px)
    dp = 2 if ax >= 100 else 3 if ax >= 10 else 5
    return f"{px:.{dp}f}"


def _fmt_entry_alert(entry: dict, sl: float, tp: float, fill: float, lots: float, mode_tag: str) -> str:
    is_long = entry["direction"] == "BUY"
    icon = "\U0001f7e2" if is_long else "\U0001f534"
    kind = "top" if entry.get("is_top") else "bottom"
    return (f"{icon} <b>{entry['pair'].upper()}</b> {entry['direction']} entered{mode_tag}\n"
            f"{entry.get('n_touches')}-touch {kind} · swing={entry.get('swing_regime')}\n"
            f"Entry <code>{_fmt_px(fill)}</code>  "
            f"SL <code>{_fmt_px(sl)}</code>  TP <code>{_fmt_px(tp)}</code>\n"
            f"Lots {lots}")


def _fmt_skip_alert(entry: dict, reason: str, mode_tag: str) -> str:
    return (f"⏸️ <b>{entry['pair'].upper()}</b> {entry['direction']} motif skipped{mode_tag}\n"
            f"{entry.get('n_touches')}-touch · swing={entry.get('swing_regime')}\n"
            f"Reason: {reason}")


def _fmt_close_alert(pair: str, row: dict, mode_tag: str) -> str:
    reason = (row.get("reason") or "").lower()
    tag = "✅ <b>TP HIT</b>" if reason == "tp" else "\U0001f6d1 <b>SL HIT</b>" if reason == "sl" else "⚪ closed manually"
    profit = row.get("profit")
    pnl_txt = f"{'+' if (profit or 0) >= 0 else ''}{profit:.2f}" if profit is not None else "—"
    dur = ""
    to, tc = row.get("time_open"), row.get("time_close")
    if to and tc:
        mins = max(0, int((tc - to) / 60))
        h, m = divmod(mins, 60)
        dur = f"{h}h {m}m" if h else f"{m}m"
    line2 = f"{_fmt_px(row.get('open_price'))} → {_fmt_px(row.get('close_price'))}"
    line3 = f"P&L {pnl_txt}" + (f" · open {dur}" if dur else "")
    return f"{tag} <b>{pair.upper()}</b>{mode_tag}\n{line2}\n{line3}"


def build_status(cfg, broker, plan, paper, guard=None, plan_age_blocked=False, acted_count=0):
    bal = broker.account_balance()
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "balance": round(bal, 2) if bal is not None else None,
        "strategy": (plan or {}).get("strategy", "motif-touch"),
        "generatedAt": (plan or {}).get("generatedAt"),
        "plan_entries": len(_plan_entries(plan)),
        "acted_entries": acted_count,
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
        "risk_guard": guard.snapshot(bal) if guard is not None else None,
        # The snapshot above reflects the guard's TRACKED state regardless of
        # this flag (so the dashboard can show "would be locked" before you
        # switch it on) -- this flag is what actually decides whether that
        # state is allowed to block a new entry.
        "risk_guard_enabled": bool(cfg.get("risk_guard_enabled", False)),
        "plan_age_blocked": bool(plan_age_blocked),
        "pushed_at": int(time.time()),
    }


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    try:
        cfg = _deep_merge(DEFAULT_CFG, kv.get_json("motif_bot_config") or {})
    except Exception as e:
        log.error(f"could not reach dashboard at {base_url} to read config: {e} -- exiting")
        return
    if force_live:
        cfg["paper_mode"] = False
    broker, paper = make_broker(cfg)
    quotes = QuoteFeed(base_url, log=log) if paper else None

    try:
        plan = kv.get_json("motif_bot_plan")
    except Exception as e:
        log.warning(f"initial plan fetch failed: {e} -- continuing, will retry in the main loop")
        plan = None

    if not paper:
        try:
            creds = kv.get_json("motif_bot_credentials") or {}
        except Exception as e:
            log.error(f"could not reach dashboard to read credentials: {e} -- exiting")
            return
        if not creds.get("mt5_account"):
            log.error("live mode but no mt5_account in motif_bot_credentials -- refusing to start. "
                      "Save MT5 credentials on the bot config page first.")
            return
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed -- exiting")
            return
        verify_pairs = sorted({str(p).lower() for p in (cfg.get("enabled_pairs") or [])} or
                               {str(e.get("pair", "")).lower() for e in _plan_entries(plan)})
        if not verify_pairs:
            log.warning("no enabled_pairs configured and no plan loaded yet -- skipping startup symbol verification")
        else:
            try:
                problems = broker.verify_symbols(verify_pairs)
            except Exception as e:
                problems = []
                log.warning(f"symbol verification failed to run: {e}")
            if problems:
                for p in problems:
                    sugg = f" -- closest matches: {', '.join(p['suggestions'])}" if p["suggestions"] else " -- no close match found on this account"
                    log.error(f"BROKER SYMBOL MISMATCH: {p['pair']} configured as {p['configured']!r} -- "
                              f"not found on this account{sugg}")
            else:
                log.info(f"symbol check OK -- all {len(verify_pairs)} pair(s) resolve to a real symbol on this account")

    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}

    tg_master_on = True
    acted_keys: set[str] = set()
    reject_until: dict[str, float] = {}
    tg_entry_msgid: dict[int, int] = {}
    tg_closed_alerted: set[int] = set()
    sym_key: dict[str, str] = {}
    last_plan = last_status = 0.0
    plan_age_blocked = False

    try:
        saved_state = kv.get_json("motif_bot_state") or {}
    except Exception:
        saved_state = {}
    # Per-pair rolling average of REAL bid/ask spread, sampled from this
    # account's own MT5 ticks -- see pylego/spread_stats.py's own doc for why
    # (RETAIL_SPREAD_PIPS is a modelled estimate, not what this specific
    # broker/account actually charges). Loaded here so it survives a bot
    # restart rather than needing MIN_LIVE_SAMPLES ticks all over again.
    try:
        spread_stats: dict = kv.get_json("motif_bot_spread_stats") or {}
    except Exception:
        spread_stats = {}
    for v in (saved_state.get("acted_keys") or []):
        acted_keys.add(str(v))
    for k, v in (saved_state.get("tg_entry_msgid") or {}).items():
        try:
            tg_entry_msgid[int(k)] = int(v)
        except (TypeError, ValueError):
            pass
    for v in (saved_state.get("tg_closed_alerted") or []):
        try:
            tg_closed_alerted.add(int(v))
        except (TypeError, ValueError):
            pass

    def _register_pair(pair: str) -> None:
        for s in {pair, pair.upper(), _mt5_sym(pair), _mt5_sym(pair).upper()}:
            sym_key[s] = pair

    for e in _plan_entries(plan):
        _register_pair(str(e.get("pair", "")).lower())

    def _save_state() -> None:
        try:
            kv.put_json("motif_bot_state", {
                "generatedAt": (plan or {}).get("generatedAt"),
                "acted_keys": list(acted_keys)[-2000:],
                "tg_entry_msgid": {str(k): v for k, v in tg_entry_msgid.items()},
                "tg_closed_alerted": list(tg_closed_alerted)[-500:],
            })
        except Exception as e:
            log.warning(f"one-shot state save failed: {e} (restart double-entry protection degraded)")

    def _save_spread_stats() -> None:
        try:
            kv.put_json("motif_bot_spread_stats", spread_stats)
        except Exception as e:
            log.warning(f"spread stats save failed: {e}")

    try:
        decision_events: list[dict] = list((kv.get_json("motif_bot_decision_log") or {}).get("events") or [])
    except Exception:
        decision_events = []
    DECISION_LOG_MAX_EVENTS = 5000

    def _record_decision(pair: str, motif_key: str, status: str, *, reason: str | None = None,
                         sl: float | None = None, tp: float | None = None) -> None:
        decision_events.append({"t": int(time.time()), "pair": pair, "motif_key": motif_key,
                                 "status": status, "reason": reason, "sl": sl, "tp": tp})
        if len(decision_events) > DECISION_LOG_MAX_EVENTS:
            del decision_events[:len(decision_events) - DECISION_LOG_MAX_EVENTS]

    def _flush_decision_log() -> None:
        try:
            kv.put_json("motif_bot_decision_log", {"events": decision_events})
        except Exception as e:
            log.warning(f"decision log flush failed: {e}")

    while True:
        nowt = time.time()

        if nowt - last_plan >= cfg.get("poll_secs", 60) or last_plan == 0.0:
            try:
                new_plan = kv.get_json("motif_bot_plan")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} -- keeping current plan")
                new_plan = None
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                for e in _plan_entries(plan):
                    _register_pair(str(e.get("pair", "")).lower())
                log.info(f"new plan loaded · {plan.get('generatedAt')} · {len(_plan_entries(plan))} entries")
            last_plan = nowt

            # Sample REAL spread on every pair the strategy trades, not just
            # this instance's currently-enabled ones -- a pair the static
            # table (or a stale live average) currently excludes still needs
            # fresh ticks flowing in so it can earn its way back in once
            # MIN_LIVE_SAMPLES is reached, rather than being stuck excluded
            # forever for lack of data. Real reads only: paper mode's
            # `broker.spread()` is a configured constant, not a market
            # observation, and would just quietly re-teach the table its own
            # assumption back as if it were measured.
            if not paper:
                for pr in RETAIL_SPREAD_PIPS:
                    spr = broker.spread(pr)
                    if spr is not None and spr > 0:
                        update_pair_stats(spread_stats, pr, spr / I.pip_size(pr), nowt)

        if nowt - last_status >= cfg.get("status_secs", 30):
            try:
                cfg = _deep_merge(DEFAULT_CFG, kv.get_json("motif_bot_config") or cfg)
                guard.sync_cfg(cfg)
            except Exception as e:
                log.warning(f"config fetch failed: {e}")
            try:
                master_cfg = kv.get_json("ai_alert_cfg") or {}
                tg_master_on = master_cfg.get("tgMaster", {}).get("motifBot", None) is not False
            except Exception as e:
                log.warning(f"ai_alert_cfg fetch failed: {e} (Telegram master switch check skipped this cycle)")
            try:
                status = build_status(cfg, broker, plan, paper, guard=guard,
                                      plan_age_blocked=plan_age_blocked, acted_count=len(acted_keys))
                kv.put_status("motif_bot_status", status)
            except Exception as e:
                log.warning(f"status push failed: {e}")
            _save_state()
            _flush_decision_log()
            _save_spread_stats()
            last_status = nowt

        bal = broker.account_balance() or 0.0
        if bal:
            guard.update_balance(bal)
        guard_bal = bal if bal else 1_000_000.0

        if quotes is not None and plan:
            for e in _enabled_entries(cfg, plan):
                q = quotes.price(e["pair"])
                if q is not None:
                    broker.set_price(e["pair"], q)

        # Close alerts -- every tick, independent of kill_switch/plan (a fill
        # can close at any time; MT5/PaperBroker's own SL/TP does the closing,
        # this bot never manages the exit).
        for c in broker.serialize_closed_trades():
            pid = c.get("position_id") or c.get("ticket")
            if cfg.get("tg_enabled", True) and tg_master_on and pid is not None and pid not in tg_closed_alerted:
                tg_closed_alerted.add(pid)
                reply_to = tg_entry_msgid.pop(pid, None)
                key = sym_key.get(c.get("symbol")) or str(c.get("symbol", "")).lower()
                _tg_send(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                        _fmt_close_alert(key, c, " [PAPER]" if paper else ""), reply_to=reply_to)

        age = _plan_age_hours(plan, nowt)
        max_age = float(cfg.get("plan_max_age_hours", 3) or 0)
        age_block = bool(max_age > 0 and age is not None and age > max_age)
        if age_block != plan_age_blocked:
            plan_age_blocked = age_block
            if age_block:
                log.warning(f"PLAN-AGE GATE: plan is {age:.2f}h old (> {max_age}h) -- NEW entries blocked "
                            f"until a fresh plan lands (fail-closed).")
                _record_decision("*", "*", "pair_blocked", reason=f"plan_age: {age:.2f}h old (> {max_age}h)")
            else:
                log.info("PLAN-AGE GATE: fresh plan -- entries resumed")

        open_book = broker.serialize_open_positions()

        if plan and not cfg.get("kill_switch") and not plan_age_blocked:
            for entry in _enabled_entries(cfg, plan):
                motif_key = entry.get("motif_key")
                pair = str(entry.get("pair", "")).lower()
                if not motif_key or motif_key in acted_keys:
                    continue
                if reject_until.get(motif_key, 0) > nowt:
                    continue
                if not broker.tradable(pair):
                    continue
                if len(open_book) >= cfg.get("max_open", 20):
                    continue
                pair_sym_set = {pair, pair.upper(), _mt5_sym(pair), _mt5_sym(pair).upper()}
                open_for_pair = sum(1 for p in open_book if p.get("symbol") in pair_sym_set)
                if open_for_pair >= cfg.get("max_concurrent_per_pair", 2):
                    continue

                # Always evaluated (and always logged/decision-logged on a
                # transition) regardless of risk_guard_enabled -- so the
                # dashboard's risk_guard snapshot and the decision log stay
                # accurate to "what the guard is tracking" even while it is
                # not gating anything, and a lockout/cooldown already in
                # progress is immediately live the moment the flag flips on
                # rather than needing a fresh breach to arm it.
                risk_guard_enabled = bool(cfg.get("risk_guard_enabled", False))
                guard_why = guard.block_reason(guard_bal, pair)
                was_blocked = guard_blocks.get(pair)
                _log_guard_transition(log, guard_blocks, pair, guard_why, risk_guard_enabled)
                if guard_why and block_category(guard_why) != block_category(was_blocked):
                    status = "pair_blocked" if risk_guard_enabled else "would_block"
                    tag = "" if risk_guard_enabled else " (NOT enforced -- risk_guard_enabled=false)"
                    _record_decision(pair, motif_key, status, reason=f"risk_guard: {guard_why}{tag}")
                if guard_why and risk_guard_enabled:
                    continue

                is_long = entry.get("direction") == "BUY"
                px = broker.price(pair)
                if px is None:
                    continue
                exp_px = expected_fill(px, is_long, pair, broker)
                pip = I.pip_size(pair)
                sl, tp = _sl_tp_from_fill(entry, exp_px, pip)
                sl_dist = abs(exp_px - sl)
                lots = size_for(pair, bal, cfg.get("risk_pct", 0.25), sl_dist, cfg.get("max_lot", 5.0))

                # broker.enter() takes "LONG"/"SHORT" (both Mt5Broker and
                # PaperBroker); the plan's own direction field is "BUY"/"SELL"
                # (matching motif_track.py's trade-log convention and the
                # dashboard's serialized-output shape) -- translate here, once,
                # rather than let the two vocabularies leak into each other.
                tid = broker.enter(pair, "LONG" if is_long else "SHORT", sl, tp, lots,
                                   max_spread(pair, cfg), paper, comment=_position_comment(motif_key))
                filled = tid is not None and tid != -1
                if filled:
                    acted_keys.add(motif_key)
                    guard.record_trade(pair)
                    reject_until.pop(motif_key, None)
                    open_book.append({"symbol": _mt5_sym(pair),
                                      "direction": ("BUY" if is_long else "SELL"),
                                      "open_price": exp_px, "ticket": tid})
                    _save_state()
                    log.info(f"{'[PAPER] ' if paper else ''}{pair} {entry['direction']} "
                            f"@~{exp_px:.5f} SL {sl:.5f} TP {tp:.5f} → ticket {tid} lots {lots}")
                    _record_decision(pair, motif_key, "entered", sl=sl, tp=tp)
                    if cfg.get("tg_enabled", True) and tg_master_on:
                        mid = _tg_send(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                      _fmt_entry_alert(entry, sl, tp, exp_px, lots,
                                                       " [PAPER]" if paper else ""))
                        if mid:
                            tg_entry_msgid[tid] = mid
                else:
                    first = reject_until.get(motif_key, 0) <= nowt
                    reject_until[motif_key] = nowt + REJECT_COOLDOWN_SECS
                    if first:
                        reject_reason = getattr(broker, "last_reject_reason", None)
                        log.warning(f"{pair} {motif_key} entry REJECTED -- backing off {REJECT_COOLDOWN_SECS}s")
                        _record_decision(pair, motif_key, "rejected", reason=reject_reason)
                        if cfg.get("tg_enabled", True) and tg_master_on:
                            send_telegram(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                         _fmt_skip_alert(entry, reject_reason or "order rejected",
                                                        " [PAPER]" if paper else ""))

        if hasattr(broker, "check_barriers"):
            broker.check_barriers()

        time.sleep(max(cfg.get("poll_secs", 60) / 20, 1))   # cheap local work (close-alert scan, price feed)
                                                              # runs far more often than the plan/status pulls above


def main():
    ap = argparse.ArgumentParser(description="MacroFX motif_bot (touch-motif structural signal)")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
