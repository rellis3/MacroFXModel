"""volatility_bot_v2 — Level Atlas Vote Portfolio, live/paper on MT5.

Replaces `volatility_bot` (retired, left running until the owner stops it —
not deleted). Assembled from pylego bricks, same architecture as oi_bot: it
consumes the frozen `volatility_bot_v2_plan` (built server-side by
`server.js`'s `_refreshVolatilityV2Plan` over `js/levelAtlasVoteReview.js`'s
already-validated vote/pricing math — ONE implementation, no JS/Python drift)
and executes it: watch live price per instrument, and when price reaches a
planned zone's entry, open ONE bracketed position (broker-enforced SL + TP
straight from the plan). This bot NEVER computes a vote, a level, or a stop —
the plan does.

The one thing this bot DOES decide for itself is the per-currency daily loss
gate (`currency_gate.CurrencyLossGate`) — deliberately bot-local risk state,
not server-side, because it needs this bot's own real-time realized P&L (see
that module's docstring).

  python volatility_bot_v2/volatility_bot_v2.py            # paper mode (default)
  python volatility_bot_v2/volatility_bot_v2.py --live      # live MT5 (needs creds in volatility_bot_v2_credentials)

Universe = the 17-pair "Select recommended" set by default (all pairs minus
the 10 correlated-risk exclusions — see server.js's VOLATILITY_V2_DEFAULT_PAIRS),
overridable via `enabled_pairs` on the config page (a CHECKBOX ARRAY, not the
free-text override other bots use — matches level-atlas-vote-portfolio.html's
own picker). Config/credentials/status flow through the dashboard KV like
every other bot (volatility_bot_v2_config / _credentials / _status).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                                # noqa: E402
from pylego import instruments as I                           # noqa: E402
from pylego import point_values as PV                         # noqa: E402
from pylego.sizing import position_size                       # noqa: E402
from pylego.broker.paper import PaperBroker                   # noqa: E402
from pylego.quotes import QuoteFeed                            # noqa: E402
from pylego.costs import expected_fill, max_spread             # noqa: E402
from pylego.risk_guard import RiskGuard, log_block_transition  # noqa: E402
from pylego.telegram import send_telegram                     # noqa: E402
from volatility_bot_v2.engine import VoteSession, stack_conflict  # noqa: E402
from volatility_bot_v2.currency_gate import CurrencyLossGate    # noqa: E402
from volatility_bot_v2.drawdown_throttle import DrawdownThrottle  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("volatility_bot_v2")

MAGIC = 20260828                                              # unique to this bot
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
REJECT_COOLDOWN_SECS = 60

# The 17-pair "Select recommended" set — must match server.js's
# VOLATILITY_V2_DEFAULT_PAIRS exactly (both hand-kept in sync with
# level-atlas-vote-portfolio.html's own PAIRS/CORRELATED_RISK_EXCLUDE). This
# copy is only the FALLBACK when enabled_pairs is empty on this side too —
# the real gate is server-side (the plan producer already only ever ships
# zones for its own enabled_pairs), so a mismatch here is cosmetic, not a
# safety issue: this bot only ever trades what's actually IN the plan.
DEFAULT_PAIRS = ["eurusd", "gbpusd", "usdjpy", "audusd", "usdchf", "euraud", "eurchf",
                 "audjpy", "cadjpy", "chfjpy", "gold", "nq", "spx", "dow", "us2000", "de30", "uk100"]

DEFAULT_CFG = {
    "kill_switch": False,
    "paper_mode": True,             # HARDCODED default, not just config default — this strategy has ZERO
                                     # live track record (backtest + OOS only); never start a fresh bot live.
    "risk_pct": 0.5,                # matches the OOS-validated backtest sizing (riskAdjustTrades) --
                                     # was 1.0 until 2026-08-30's live-vs-backtest parity audit found this
                                     # bot had drifted to DOUBLE the validated risk per trade.
    "max_lot": 2.0,
    "max_open": 12,
    "max_concurrent_per_pair": 1,   # matches the backtest's applyConcurrencyCap(maxConcurrent=1) -- added
                                     # 2026-08-30, the audit found this bot had NO per-pair cap at all.
    # RiskGuard — daily/monthly DD lockout + per-pair entry cooldown (blocks NEW
    # entries only; the broker-enforced SL/TP always run).
    "ddlimit": 3.0,
    "monthlydd": 5.0,
    "lockout": 3,
    "cooldown": 240,
    "max_spread_pips": None,
    "plan_secs": 45,                # MUCH faster than oi_bot's 600s — see server.js's
                                     # _refreshVolatilityV2Plan doc for why (near-real-time, bar-close-driven)
    "status_secs": 30,
    "tick_secs": 3,
    "enabled_pairs": [],            # [] -> DEFAULT_PAIRS (a checkbox ARRAY from the config page, not free text)
    "touch_tol_pips": 1,
    # Per-currency daily loss gate — OOS-validated at 1% (scripts/oos_validate_currency_loss_gate.mjs):
    # improved Sharpe/annVol/maxDD/CVaR95 simultaneously on a 70/30 held-out split. Bot-side (see
    # currency_gate.py's own doc for why); server-side fade-stop tightening composes with it, already
    # validated together (scripts/oos_validate_stacked_levers.mjs).
    "ccy_loss_gate": True,
    "max_daily_loss_pct": 1.0,
    # Portfolio risk budget: sum of open risk-to-SL (% of balance) across this
    # bot's book, capped BEFORE entry — same concept as oi_bot's max_open_risk_pct.
    "max_open_risk_pct": 1.0,       # 0 = off -- was 2.0 until 2026-08-30's parity audit found this
                                     # bot had drifted to DOUBLE the validated 1% account-wide heat cap.
    # Stack guard: refuse a second same-instrument, same-direction entry within
    # stack_guard_pips of one already open (two zones near the same level cluster
    # are one bet, not two).
    "stack_guard": True,
    "stack_guard_pips": 5,
    # Plan-age gate: fail-CLOSED on a stale plan (unlike an event gate, which
    # suppresses and fails open) — brackets always keep running regardless.
    # Deliberately far tighter than oi_bot's 24h: this plan is near-real-time,
    # so a stale one should halt NEW entries fast, not tolerate a whole day of drift.
    "plan_max_age_hours": 1,
    "paper_spread_pips": {},
    # Drawdown throttle — added 2026-08-30 (live-vs-backtest parity audit
    # found this lever, validated in analysis/drawdown_throttle_backtest.mjs,
    # had never been implemented live at all). De-risks (scales risk_pct by
    # throttle_mult) once this bot's OWN realized-balance drawdown from its
    # running peak breaches throttle_trigger_dd, restores full size once it
    # recovers to throttle_restore_dd. Different from RiskGuard above: this
    # is a gradual size multiplier reacting to a SUSTAINED losing stretch
    # over the bot's whole life (never resets), not a binary daily/monthly
    # lockout. Validated: ~40% shallower drawdown both IS and OOS, at a
    # real, disclosed Sharpe/CAGR cost -- see drawdown_throttle.py's own doc.
    "throttle_enabled": True,
    "throttle_trigger_dd": -8.0,
    "throttle_restore_dd": -2.0,
    "throttle_mult": 0.25,

    # End-of-day close — added 2026-08-31 after measuring the actual live-vs-
    # backtest gap this creates: the validated backtest only ever scores a
    # touch that resolves (hits target or stop) within its OWN entry session
    # (js/levelAtlasEngine.js's atlasWalk walks `sessions.get(date)`, ONE
    # day's bars — a touch that doesn't resolve by then is dropped from the
    # sample entirely, never scored as a win, loss, or EOD mark). This bot
    # had NO such boundary — a position just sat on its original SL/TP
    # indefinitely, for real, until one was eventually hit, sometimes days
    # later. Measured impact (analysis/neither_population_*.mjs, cost-
    # inclusive, all 17 pairs, real re-walked outcomes not estimates):
    # running with no EOD close at all (this bot's actual prior behavior)
    # measured Sharpe 1.49 / maxDD -26.34% vs the validated 2.01 / -17.76%;
    # flattening at session close instead measured Sharpe 1.52 / maxDD
    # -21.81% — meaningfully shallower drawdown and higher CAGR, so this is
    # a real, quantified improvement over prior behavior (though it does NOT
    # fully close the gap to the validated numbers — that gap is a permanent
    # cost of the touches that just don't resolve same-day, not a bug this
    # lever fixes away).
    #
    # Kill time is computed from the strategy's OWN day boundary (Europe/
    # London midnight — the exact boundary bucketM1IntoSessions uses, DST-
    # aware via zoneinfo, not a fixed UTC clock time that would drift wrong
    # across DST changes), minus `eod_close_buffer_mins` — configurable
    # rather than hardcoded, since a broker can roll its own session/rollover
    # a few minutes earlier than the exchange's real close.
    "eod_close_enabled": True,
    "eod_close_buffer_mins": 5,

    # Telegram — entered/skipped/rejected decisions + SL/TP close outcomes.
    # Added 2026-08-31, REPLACING the old vol-forecast level-proximity alert
    # (js/volLevelAlertCore.js's checkVolLevelAlertsNow — informational-only,
    # no decision/confidence, no enter-or-skip reasoning, no close outcome;
    # switched off server-side, see server.js's DEFAULT_VOL_LEVEL_CFG doc).
    # Same own-dedicated-token convention as oi_bot's tg_token/tg_chat_id
    # (plain per-bot KV config field, not the shared-fallback machinery in
    # pylego/telegram.py — this bot's config KV key already carries MT5
    # creds at the same trust level). Real token/chat baked in as the actual
    # default (not blank) after a "Reset Defaults" + "Save" wiped the live
    # config's tg fields once already -- see server.js's
    # _restoreVolatilityV2Config doc; a blank default is what let that happen
    # silently.
    "tg_enabled": True,
    "tg_token": "8470462785:AAEBm4okIKQrj7CGytRHJdrZ_gdtHih5chA",
    "tg_chat_id": "8397861902",
}

# Broker symbol routing (identity stays shared; routing is local). Config can
# override per broker via `broker_symbols` (read live each config refresh) —
# same convention as oi_bot's _BROKER_OVERRIDE.
_BROKER_OVERRIDE = {"de30": "GER40", "uk100": "UK100", "us2000": "US2000",
                     "spx": "SP500", "nq": "USTECH100", "dow": "US30", "gold": "XAUUSD"}
_broker_overrides: dict = {}


def _apply_broker_symbols(cfg: dict) -> None:
    _broker_overrides.clear()
    for k, v in (cfg.get("broker_symbols") or {}).items():
        if v and str(v).strip():
            _broker_overrides[str(k).lower()] = str(v).strip()


def _broker_sym(pair: str) -> str:
    p = pair.lower()
    if p in _broker_overrides:
        return _broker_overrides[p]
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
    if cfg.get("paper_mode", True):
        return PaperBroker(balance=10_000.0), True
    from pylego.broker.mt5 import Mt5Broker
    broker = Mt5Broker(MAGIC, _broker_sym, I.pip_size, log=log)
    if not broker.available:
        log.warning("live requested but MetaTrader5 missing — falling back to PAPER")
        return PaperBroker(balance=10_000.0), True
    return broker, False


def _apply_paper_spreads(broker, cfg: dict) -> None:
    if not hasattr(broker, "set_spread"):
        return
    for pair, pips in (cfg.get("paper_spread_pips") or {}).items():
        try:
            broker.set_spread(pair, float(pips) * I.pip_size(pair))
        except Exception as e:
            log.warning(f"paper_spread_pips: ignoring {pair!r}: {e}")


def size_for(pair: str, balance: float, risk_pct: float, sl_dist: float, max_lot: float) -> float:
    try:
        pip = I.pip_size(pair); pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    lots = position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)
    return round(min(max(lots, 0.01), max_lot), 2)


def _plan_instruments(plan: dict) -> dict:
    return ((plan or {}).get("instruments")) or {}


_LONDON_TZ = ZoneInfo("Europe/London")


def _eod_kill_epoch(now_epoch: float, buffer_mins: float) -> float:
    """Epoch of today's EOD-close kill time: `buffer_mins` before the next
    Europe/London midnight — the strategy's own day boundary (matches
    js/levelAtlasEngine.js's atlasWalk, which buckets touches via
    `bucketM1IntoSessions(packed, 'Europe/London')`). DST-aware via zoneinfo
    rather than a fixed UTC clock time, which would silently drift an hour
    wrong every time the UK's clocks change."""
    now_ldn = datetime.fromtimestamp(now_epoch, _LONDON_TZ)
    next_midnight = (now_ldn.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1))
    return (next_midnight - timedelta(minutes=buffer_mins)).timestamp()


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


def _position_risk_pct(pair: str, lots: float, entry: float, sl: float, balance: float) -> float:
    if not balance or sl is None or entry is None:
        return 0.0
    try:
        pip = I.pip_size(pair); pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    sl_pips = abs(float(entry) - float(sl)) / pip
    return (sl_pips * pv * float(lots)) / balance * 100.0


def _instr_lines(plan, sessions):
    """Per-instrument snapshot for the config page's "Today's Levels & Live
    Decisions" table: each zone the plan carries, whether it's armed/entered,
    and the vote's own rationale (fade/follow + margin)."""
    out = []
    for instr, slice_ in _plan_instruments(plan).items():
        sess = sessions.get(instr)
        entered = sess.entered if sess else set()
        for z in slice_.get("zones", []):
            out.append({
                "pair": instr, "side": z.get("side"), "rung": z.get("rung"),
                "decision": z.get("decision"), "margin": z.get("margin"),
                "entry": z.get("entry"), "sl": z.get("sl"), "tp": z.get("tp"),
                "status": "entered" if z.get("zone_id") in entered else "armed",
                "rationale": z.get("rationale"),
            })
    return out


# ── Telegram — entered/skipped/rejected decisions + SL/TP close outcomes ────
# `send_telegram` (pylego brick) is fire-and-forget bool — fine for a skip/
# reject alert nobody needs to reply to. The entry alert is different: a
# close alert must thread as a REPLY to it (so "closed" always sits next to
# "why we entered" in the chat), which needs the sent message's own id back —
# something the shared brick doesn't return (and, as of this bot, still has
# no other real caller — see its own docstring — so extending its contract
# wasn't worth the risk to callers that don't exist; a tiny bot-local
# variant is cheaper and keeps the shared brick's simple bool contract
# intact for whoever the next actual caller turns out to be).
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


def _fmt_entry_alert(instr: str, spec: dict, lots: float, mode_tag: str) -> str:
    direction = "LONG" if spec["dir_up"] else "SHORT"
    icon = "🟢" if spec["dir_up"] else "🔴"
    return (f"{icon} <b>{instr.upper()}</b> {direction} entered{mode_tag}\n"
            f"{spec.get('side')}/{spec.get('rung')} · {spec.get('rationale') or ''}\n"
            f"Entry <code>{_fmt_px(spec.get('entry'))}</code>  "
            f"SL <code>{_fmt_px(spec.get('sl'))}</code>  TP <code>{_fmt_px(spec.get('tp'))}</code>\n"
            f"Lots {lots}")


def _fmt_skip_alert(instr: str, spec: dict, reason: str, mode_tag: str) -> str:
    return (f"⏸️ <b>{instr.upper()}</b> {spec.get('side')}/{spec.get('rung')} touch skipped{mode_tag}\n"
            f"{spec.get('rationale') or ''}\n"
            f"Reason: {reason}")


def _fmt_close_alert(instr: str, row: dict, mode_tag: str) -> str:
    reason = (row.get("reason") or "").lower()
    tag = "✅ <b>TP HIT</b>" if reason == "tp" else "🛑 <b>SL HIT</b>" if reason == "sl" else "⚪ closed"
    profit = row.get("profit")
    pnl_txt = f"{'+' if (profit or 0) >= 0 else ''}{profit:.2f}" if profit is not None else "—"
    dur = ""
    to, tc = row.get("time_open"), row.get("time_close")
    if to and tc:
        mins = max(0, int((tc - to) / 60))
        h, m = divmod(mins, 60)
        dur = f"{h}h{m:02d}m" if h else f"{m}m"
    line2 = f"{_fmt_px(row.get('open_price'))} → {_fmt_px(row.get('close_price'))}"
    line3 = f"P&L {pnl_txt}" + (f" · open {dur}" if dur else "")
    return f"{tag} <b>{instr.upper()}</b>{mode_tag}\n{line2}\n{line3}"


def build_status(cfg, broker, plan, paper, sessions, ccy_gate, throttle=None,
                  guard=None, risk_ledger=None, plan_age_blocked=False, eod_close_blocked=False):
    bal = broker.account_balance()
    open_risk_pct = round(sum((risk_ledger or {}).values()), 2)
    heat_cap = float(cfg.get("max_open_risk_pct", 0) or 0)
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "balance": round(bal, 2) if bal is not None else None,
        "strategy": (plan or {}).get("strategy", "level-atlas-vote"),
        "generatedAt": (plan or {}).get("generatedAt"),
        "universe": list(_plan_instruments(plan).keys()),
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
        "lines": _instr_lines(plan, sessions or {}),
        "ccy_gate": ccy_gate.snapshot(),
        "throttle": throttle.snapshot() if throttle is not None else None,
        # Risk-systems detail (2026-08-31) -- previously computed/available
        # but never pushed to status, so the dashboard had no way to show
        # "is anything actually blocking new entries right now" beyond the
        # currency gate.
        "risk_guard": guard.snapshot(bal) if guard is not None else None,
        "portfolio_heat_pct": open_risk_pct,
        "portfolio_heat_cap_pct": heat_cap,
        "plan_age_blocked": bool(plan_age_blocked),
        "eod_close_blocked": bool(eod_close_blocked),
    }


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    try:
        cfg = _deep_merge(DEFAULT_CFG, kv.get_json("volatility_bot_v2_config") or {})
    except Exception as e:
        log.error(f"could not reach dashboard at {base_url} to read config: {e} — exiting")
        return
    _apply_broker_symbols(cfg)
    if force_live:
        cfg["paper_mode"] = False
    broker, paper = make_broker(cfg)
    _apply_paper_spreads(broker, cfg)
    quotes = QuoteFeed(base_url, log=log) if paper else None

    if not paper:
        try:
            creds = kv.get_json("volatility_bot_v2_credentials") or {}
        except Exception as e:
            log.error(f"could not reach dashboard to read credentials: {e} — exiting")
            return
        if not creds.get("mt5_account"):
            log.error("live mode but no mt5_account in volatility_bot_v2_credentials — refusing to start. "
                      "Save MT5 credentials on the bot config page first.")
            return
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed — exiting")
            return
        # Verify every enabled pair's broker_symbols override (or default)
        # actually exists on THIS account before the first order is ever
        # attempted -- a wrong/typo'd symbol otherwise only shows up as a
        # live order silently failing. Never auto-corrects the config.
        verify_pairs = cfg.get("enabled_pairs") or DEFAULT_PAIRS
        try:
            problems = broker.verify_symbols(verify_pairs)
        except Exception as e:
            problems = []
            log.warning(f"symbol verification failed to run: {e}")
        if problems:
            for p in problems:
                sugg = f" — closest matches: {', '.join(p['suggestions'])}" if p["suggestions"] else " — no close match found on this account"
                log.error(f"BROKER SYMBOL MISMATCH: {p['pair']} configured as {p['configured']!r} — "
                          f"not found on this account{sugg}")
            log.error(f"{len(problems)} pair(s) have a broker symbol that doesn't exist on this account — "
                      f"those pairs will fail every live order until fixed in bot-config.html's Broker Symbols card.")
        else:
            log.info(f"symbol check OK — all {len(verify_pairs)} enabled pair(s) resolve to a real symbol on this account")

    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}
    ccy_gate = CurrencyLossGate(max_daily_loss_pct=float(cfg.get("max_daily_loss_pct", 1.0)))
    ccy_blocks: dict[str, str | None] = {}
    throttle = DrawdownThrottle()
    throttle.sync_cfg(cfg)
    throttle_was_on = False

    # Central "Alerts" modal master switch (index.html / any dashboard page —
    # js/alerts.js) — the SAME per-sender kill-switch every other Telegram
    # alert in this codebase already respects (TG_SENDERS/tgOn() in
    # server.js), under sender key 'voteAtlas'. That switch lives in
    # server.js's in-memory state, which this bot (a separate process) has no
    # access to — so it reads the SAME underlying KV key (`ai_alert_cfg`,
    # already on the public-read allowlist via its 'ai_' prefix) directly.
    # Mirrors tgOn()'s exact semantics: missing/unset reads as ON, only an
    # explicit `false` turns it off. Fails OPEN on a fetch error (alerts are
    # informational, not a risk control — losing this check on a transient
    # KV outage should not also lose the entered/skipped/close alerts).
    tg_master_on = True

    sessions: dict[str, VoteSession] = {}
    reject_until: dict[str, float] = {}
    stack_skips: dict[str, int] = {}
    budget_skips: dict[str, bool] = {}
    warned_missing: dict[str, bool] = {}
    missing_since: dict[str, float] = {}
    # A pair being absent from the FIRST plan snapshot(s) after a restart is
    # normal, not a typo -- the plan producer cold-start-throttles to only 3
    # pairs warming concurrently (server.js _refreshVolatilityV2Plan's own
    # doc: a full multi-year M1 load per pair, capped to avoid an OOM crash),
    # so with 17 enabled pairs it can take several 45s ticks for all of them
    # to appear. Found 2026-08-30: this bot warned "will never trade" for
    # MOST of the universe on every redeploy (which happens on every git
    # push), because the original check fired on the very first miss. Now it
    # only warns once a pair has been missing continuously for this long.
    MISSING_GRACE_SECS = 900
    plan = None
    last_plan = last_status = 0.0
    plan_age_blocked = False
    eod_close_blocked = False
    eod_closed_tickets: set[int] = set()
    risk_ledger: dict[int, float] = {}
    sym_key: dict[str, str] = {}      # broker-symbol spelling -> canonical key (currency gate lookups)
    tg_entry_msgid: dict[int, int] = {}   # ticket/position_id -> the entry alert's Telegram message_id (for reply-threading the close alert)
    tg_closed_alerted: set[int] = set()   # position_ids already sent a close alert for (serialize_closed_trades() re-returns today's closes every tick)

    try:
        saved_state = kv.get_json("volatility_bot_v2_state") or {}
    except Exception:
        saved_state = {}
    risk_ledger_saved = saved_state.get("risk_ledger") or {}
    for k, v in risk_ledger_saved.items():
        try:
            risk_ledger[int(k)] = float(v)
        except (TypeError, ValueError):
            pass
    throttle.restore(saved_state.get("throttle"))  # running peak must survive a restart
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

    def _save_state() -> None:
        try:
            kv.put_json("volatility_bot_v2_state", {
                "generatedAt": (plan or {}).get("generatedAt"),
                "entered": {i: sorted(s.entered) for i, s in sessions.items()},
                "risk_ledger": {str(k): v for k, v in risk_ledger.items()},
                "throttle": throttle.snapshot(),
                "tg_entry_msgid": {str(k): v for k, v in tg_entry_msgid.items()},
                # Capped — a restart-surviving record of "don't re-alert this
                # close", not a durable trade log (that's *_trade_log already).
                "tg_closed_alerted": list(tg_closed_alerted)[-500:],
            })
        except Exception as e:
            log.warning(f"one-shot state save failed: {e} (restart double-entry protection degraded)")

    # ── Decision audit log — "why wasn't this taken" ────────────────────────
    # The plan/status snapshots only ever show the CURRENT moment; this is the
    # persistent record of every entered/rejected/skipped/blocked event
    # through the day, so a real touch with a weak vote or a spread/duplicate/
    # risk-budget rejection is visible after the fact, not just in scrollback
    # console logs. Read once at startup (continues the same day's log across
    # a restart, doesn't wipe history); flushed to KV on the same status_secs
    # cadence _save_state already uses (unconditional write, same convention).
    try:
        decision_events: list[dict] = list((kv.get_json("volatility_bot_v2_decision_log") or {}).get("events") or [])
    except Exception:
        decision_events = []
    DECISION_LOG_MAX_EVENTS = 5000

    def _record_decision(pair: str, status: str, *, side: str | None = None, rung: str | None = None,
                          zone_id: str | None = None, decision: str | None = None, margin: int | None = None,
                          reason: str | None = None) -> None:
        decision_events.append({"t": int(time.time()), "pair": pair, "side": side, "rung": rung,
                                 "zone_id": zone_id, "decision": decision, "margin": margin,
                                 "status": status, "reason": reason})
        if len(decision_events) > DECISION_LOG_MAX_EVENTS:
            del decision_events[:len(decision_events) - DECISION_LOG_MAX_EVENTS]

    def _flush_decision_log() -> None:
        try:
            kv.put_json("volatility_bot_v2_decision_log", {"events": decision_events})
        except Exception as e:
            log.warning(f"decision log flush failed: {e}")

    def _sync_sessions(new_plan) -> None:
        """Adopt a plan: build a session per instrument (preserving one-shot
        state for instruments already present), drop instruments the plan no
        longer has, and PRIME any zone price has already passed so we never
        retro-enter an overnight crossing. Restores KV-persisted `entered`
        state when the plan's generatedAt matches (restart double-entry
        protection) — same contract as oi_bot's _sync_sessions."""
        instrs = _plan_instruments(new_plan)
        restore = (saved_state.get("entered") or {}) \
            if saved_state.get("generatedAt") == (new_plan or {}).get("generatedAt") else {}
        for instr, slice_ in instrs.items():
            zones = slice_.get("zones", [])
            if instr in sessions:
                sessions[instr].set_zones(zones)
            else:
                sessions[instr] = VoteSession(instr, zones)
                for zid in restore.get(instr, []):
                    sessions[instr].mark_entered(zid)
                if restore.get(instr):
                    log.info(f"restored {len(restore[instr])} entered zone(s) for {instr} "
                             f"from persisted state (restart protection)")
            for s in {instr, instr.upper(), _broker_sym(instr), _broker_sym(instr).upper()}:
                sym_key[s] = instr
            try:
                px0 = (quotes.price(instr) if quotes is not None else broker.price(instr))
                if px0 is not None:
                    _before = set(sessions[instr].primed)
                    sessions[instr].decide(px0, dry_run=True, tol=_tol(cfg, instr), now=time.time())
                    for _zid in sorted(set(sessions[instr].primed) - _before):
                        _r = sessions[instr].primed[_zid]
                        log.info(f"PRIMED {instr} {_zid} @ {_r['price']} — price already {_r['past']} "
                                 f"past entry {_r['entry']} when the plan armed")
            except Exception:
                pass
        for instr in list(sessions):
            if instr not in instrs:
                del sessions[instr]

    while True:
        nowt = time.time()

        # (a) Plan — pull every plan_secs (much faster than oi_bot: this
        # plan is near-real-time, see server.js's own doc).
        if nowt - last_plan >= cfg.get("plan_secs", 45) or plan is None:
            try:
                new_plan = kv.get_json("volatility_bot_v2_plan")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} — keeping current plan")
                new_plan = None
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                _sync_sessions(plan)
                log.info(f"new plan loaded · {plan.get('generatedAt')} · "
                         f"{len(_plan_instruments(plan))} instruments")
            last_plan = nowt

        # (b) Config + status — medium.
        if nowt - last_status >= cfg.get("status_secs", 30):
            try:
                cfg = _deep_merge(DEFAULT_CFG, kv.get_json("volatility_bot_v2_config") or cfg)
                _apply_broker_symbols(cfg)
                _apply_paper_spreads(broker, cfg)
                guard.sync_cfg(cfg)
                ccy_gate.max_daily_loss_pct = float(cfg.get("max_daily_loss_pct", 1.0))
                throttle.sync_cfg(cfg)
            except Exception as e:
                log.warning(f"config fetch failed: {e}")
            try:
                master_cfg = kv.get_json("ai_alert_cfg") or {}
                tg_master_on = master_cfg.get("tgMaster", {}).get("voteAtlas", None) is not False
            except Exception as e:
                log.warning(f"ai_alert_cfg fetch failed: {e} (Telegram master switch check skipped this cycle)")
            try:
                status = build_status(cfg, broker, plan, paper, sessions, ccy_gate, throttle,
                                       guard=guard, risk_ledger=risk_ledger, plan_age_blocked=plan_age_blocked,
                                       eod_close_blocked=eod_close_blocked)
                kv.put_status("volatility_bot_v2_status", status)
            except Exception as e:
                log.warning(f"status push failed: {e}")
            # Persist throttle/risk_ledger/entered state on this cadence too,
            # not just after a fill -- otherwise the throttle's running peak
            # (and its throttled/not-throttled state) only survives a restart
            # if one happened to land right after a trade.
            _save_state()
            _flush_decision_log()
            last_status = nowt

        # (c) Tight loop: feed quotes, run barriers, take entries.
        if plan and not cfg.get("kill_switch"):
            enabled = cfg.get("enabled_pairs") or list(_plan_instruments(plan).keys())
            if quotes is not None:
                for instr in enabled:
                    q = quotes.price(instr)
                    if q is not None:
                        broker.set_price(instr, q)
            if hasattr(broker, "check_barriers"):
                broker.check_barriers()

            # Fold newly-closed trades into today's currency tally EVERY tick
            # (idempotent by trade_id — see CurrencyLossGate.record_close).
            for c in broker.serialize_closed_trades():
                key = sym_key.get(c.get("symbol")) or str(c.get("symbol", "")).lower()
                pnl = c.get("profit")
                bal = broker.account_balance() or 0.0
                if pnl is not None and bal:
                    ccy_gate.record_close(key, float(pnl) / bal * 100.0, nowt,
                                          trade_id=c.get("position_id") or c.get("ticket"))
                # SL/TP close alert — reply-threaded onto the entry alert when
                # we have its message_id. `serialize_closed_trades()` re-returns
                # today's closes every tick, so dedupe by position_id or this
                # fires once per status_secs forever, not once per close.
                pid = c.get("position_id") or c.get("ticket")
                if cfg.get("tg_enabled", True) and tg_master_on and pid is not None and pid not in tg_closed_alerted:
                    tg_closed_alerted.add(pid)
                    reply_to = tg_entry_msgid.pop(pid, None)
                    _tg_send(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                             _fmt_close_alert(key, c, " [PAPER]" if paper else ""), reply_to=reply_to)

            bal = broker.account_balance() or 0.0
            if bal:
                guard.update_balance(bal)
            guard_bal = bal if bal else 1_000_000.0
            size_mult = throttle.update(bal) if cfg.get("throttle_enabled", True) else 1.0
            if (size_mult < 1.0) != throttle_was_on:
                throttle_was_on = size_mult < 1.0
                if throttle_was_on:
                    log.warning(f"DRAWDOWN THROTTLE: engaged — sizing at {size_mult:g}x "
                                f"until balance recovers to {throttle.restore_dd}% from peak")
                else:
                    log.info("DRAWDOWN THROTTLE: recovered — full size resumed")

            age = _plan_age_hours(plan, nowt)
            max_age = float(cfg.get("plan_max_age_hours", 1) or 0)
            age_block = bool(max_age > 0 and age is not None and age > max_age)
            if age_block != plan_age_blocked:
                plan_age_blocked = age_block
                if age_block:
                    log.warning(f"PLAN-AGE GATE: plan is {age:.2f}h old (> {max_age}h) — NEW entries "
                                f"blocked until a fresh plan lands (fail-closed). Brackets keep running.")
                    _record_decision("*", "pair_blocked", reason=f"plan_age: {age:.2f}h old (> {max_age}h), all pairs")
                else:
                    log.info("PLAN-AGE GATE: fresh plan — entries resumed")

            # EOD close — see DEFAULT_CFG's own doc for why. Blocks NEW
            # entries for the remainder of the window (same fail-closed
            # style as the plan-age gate) and flattens every currently open
            # position, once each (eod_closed_tickets dedupes so a stuck
            # close attempt — e.g. a transient broker error — retries next
            # tick without re-closing an already-flattened position).
            eod_on = bool(cfg.get("eod_close_enabled", True))
            eod_block = eod_on and nowt >= _eod_kill_epoch(nowt, float(cfg.get("eod_close_buffer_mins", 5) or 0))
            if eod_block != eod_close_blocked:
                eod_close_blocked = eod_block
                if eod_block:
                    log.warning(f"EOD CLOSE: within {cfg.get('eod_close_buffer_mins', 5)}min of session close — "
                                f"flattening open positions, NEW entries blocked until the next session.")
                else:
                    eod_closed_tickets.clear()
                    log.info("EOD CLOSE: new session — entries resumed")
            if eod_close_blocked:
                for p in broker.serialize_open_positions():
                    tk = p.get("ticket")
                    if tk in eod_closed_tickets:
                        continue
                    pair = sym_key.get(p.get("symbol")) or str(p.get("symbol", "")).lower()
                    if broker.stop(tk, pair, paper, reason="eod_close"):
                        eod_closed_tickets.add(tk)
                        log.info(f"EOD CLOSE: {pair} ticket {tk} flattened")
                        _record_decision(pair, "closed", reason=f"eod_close: {cfg.get('eod_close_buffer_mins', 5)}min buffer")

            for instr in enabled:
                sess = sessions.get(instr)
                if sess is None:
                    if instr in _plan_instruments(plan):
                        missing_since.pop(instr, None)
                    else:
                        first_seen = missing_since.setdefault(instr, nowt)
                        if nowt - first_seen > MISSING_GRACE_SECS and not warned_missing.get(instr):
                            warned_missing[instr] = True
                            log.warning(f"enabled pair {instr!r} still not in the plan after "
                                        f"{MISSING_GRACE_SECS / 60:.0f}min — check for a typo in "
                                        f"enabled_pairs, or that the plan producer isn't skipping it "
                                        f"(GET volatility_bot_v2_plan's 'skipped' field for the reason)")
                    continue
                px = quotes.price(instr) if quotes is not None else broker.price(instr)
                if px is None:
                    continue
                if plan_age_blocked:
                    continue
                if eod_close_blocked:
                    continue
                if not broker.tradable(instr):
                    continue
                open_book = broker.serialize_open_positions()
                if len(open_book) >= cfg.get("max_open", 12):
                    continue
                open_tickets = {p.get("ticket") for p in open_book}
                for t in [t for t in risk_ledger if t not in open_tickets]:
                    risk_ledger.pop(t, None)
                # Per-pair concurrency cap — matches the backtest's
                # applyConcurrencyCap(maxConcurrent=1): a pair with an
                # existing open position gets NO new entries considered this
                # tick, regardless of side/rung, until that position closes.
                # Added 2026-08-30 (parity audit found this bot had no
                # per-pair cap at all, only a global max_open).
                pair_sym_set = {instr, instr.upper(), _broker_sym(instr), _broker_sym(instr).upper()}
                open_for_pair = sum(1 for p in open_book if p.get("symbol") in pair_sym_set)
                if open_for_pair >= cfg.get("max_concurrent_per_pair", 1):
                    continue
                guard_why = guard.block_reason(guard_bal, instr)
                was_blocked = guard_blocks.get(instr)
                log_block_transition(log, guard_blocks, instr, guard_why)
                if guard_why and guard_why != was_blocked:
                    _record_decision(instr, "pair_blocked", reason=f"risk_guard: {guard_why}")
                if guard_why:
                    continue
                if cfg.get("ccy_loss_gate", True):
                    ccy_why = ccy_gate.blocked(instr, nowt)
                    if ccy_why != ccy_blocks.get(instr):
                        ccy_blocks[instr] = ccy_why
                        if ccy_why:
                            log.warning(f"CURRENCY GATE [{instr}]: NEW entries deferred — {ccy_why}")
                            _record_decision(instr, "pair_blocked", reason=f"currency_gate: {ccy_why}")
                        else:
                            log.info(f"CURRENCY GATE [{instr}]: clear — entries resumed")
                    if ccy_why:
                        continue

                stack_on = bool(cfg.get("stack_guard", True))
                sym_set = pair_sym_set
                stack_d = _stack_dist(cfg, instr)

                for spec in sess.decide(px, tol=_tol(cfg, instr)):
                    if spec["sl"] is None or spec["tp"] is None:
                        continue
                    zid = spec["zone_id"]
                    if reject_until.get(zid, 0) > nowt:
                        continue
                    if stack_on:
                        conflict = stack_conflict(sym_set, spec["dir_up"], spec["entry"], open_book, stack_d)
                        if conflict is not None:
                            ctk = conflict.get("ticket")
                            if stack_skips.get(zid) != ctk:
                                stack_skips[zid] = ctk
                                skip_reason = (f"stack_guard: already {'LONG' if spec['dir_up'] else 'SHORT'} "
                                               f"(ticket {ctk}) within {cfg.get('stack_guard_pips', 5)}p")
                                log.info(f"STACK GUARD [{instr}] {zid} deferred — already "
                                         f"{'LONG' if spec['dir_up'] else 'SHORT'} @ "
                                         f"{conflict.get('open_price')} (ticket {ctk}) within "
                                         f"{cfg.get('stack_guard_pips', 5)}p; would be one bet")
                                _record_decision(instr, "skipped", side=spec.get("side"), rung=spec.get("rung"),
                                                  zone_id=zid, decision=spec.get("decision"), margin=spec.get("margin"),
                                                  reason=skip_reason)
                                if cfg.get("tg_enabled", True) and tg_master_on:
                                    send_telegram(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                                  _fmt_skip_alert(instr, spec, skip_reason, " [PAPER]" if paper else ""))
                            continue
                    exp_px = expected_fill(spec["entry"], spec["dir_up"], instr, broker)
                    # Size off `sizingSl` (the FULL, untightened stop distance
                    # the plan always carries), never the possibly-tighter
                    # `sl` bracket — sizing off a tightened stop is the exact
                    # implicit-leverage mechanism that discredited "Fixed SL
                    # fraction" and made fade_stop_tighten suspect (both
                    # retune the declared stop AND let sizing react to it).
                    # `size_mult` applies the drawdown throttle's de-risking
                    # on top, independent of the stop distance used.
                    sizing_dist = exp_px - spec.get("sizingSl", spec["sl"])
                    lots = size_for(instr, bal, cfg.get("risk_pct", 1.0) * size_mult, sizing_dist, cfg.get("max_lot", 2.0))
                    risk_cap = float(cfg.get("max_open_risk_pct", 0) or 0)
                    cand_risk = _position_risk_pct(instr, lots, exp_px, spec["sl"], bal) if bal else 0.0
                    if risk_cap > 0 and bal:
                        open_risk = sum(risk_ledger.get(t, 0.0) for t in (open_tickets & set(risk_ledger)))
                        if open_risk + cand_risk > risk_cap:
                            if not budget_skips.get(zid):
                                budget_skips[zid] = True
                                skip_reason = f"risk_budget: open {open_risk:.2f}% + candidate {cand_risk:.2f}% > cap {risk_cap}%"
                                log.info(f"RISK BUDGET [{instr}] {zid} deferred — open risk "
                                         f"{open_risk:.2f}% + candidate {cand_risk:.2f}% > cap {risk_cap}%")
                                _record_decision(instr, "skipped", side=spec.get("side"), rung=spec.get("rung"),
                                                  zone_id=zid, decision=spec.get("decision"), margin=spec.get("margin"),
                                                  reason=skip_reason)
                                if cfg.get("tg_enabled", True) and tg_master_on:
                                    send_telegram(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                                  _fmt_skip_alert(instr, spec, skip_reason, " [PAPER]" if paper else ""))
                            continue
                    budget_skips.pop(zid, None)
                    direction = "LONG" if spec["dir_up"] else "SHORT"
                    # Short, MT5-comment-safe dedupe tag -- NOT the full zone_id.
                    # Found 2026-08-31 from real logs: the full zid (up to ~29
                    # chars, e.g. "audcad_2026-08-31_down_p90_12") blew past
                    # MT5's 31-char comment limit once wrapped with ANY prefix,
                    # and Mt5Broker._safe_comment's blind [:31] truncation was
                    # silently chopping the tag's own closing bracket off --
                    # breaking restart-safety dedup with no visible error, and
                    # on the untruncated string, MT5 rejected the order outright
                    # ("Invalid comment argument"). The pair doesn't need to be
                    # IN the tag: Mt5Broker.enter() already scopes its dedup
                    # scan to this symbol's own positions before the substring
                    # check runs, so side+rung+instance is enough to stay
                    # unique within a pair/day.
                    short_tag = f"{spec['side']}{spec['rung']}_{zid.rsplit('_', 1)[-1]}"
                    tid = broker.enter(instr, direction, spec["sl"], spec["tp"], lots,
                                       max_spread(instr, cfg), paper,
                                       comment=f"VA[{short_tag}]", dedupe_tag=short_tag)
                    filled = tid is not None and tid != -1
                    if filled:
                        guard.record_trade(instr)
                        sess.mark_entered(zid)
                        reject_until.pop(zid, None)
                        stack_skips.pop(zid, None)
                        open_book.append({"symbol": _broker_sym(instr), "direction":
                                          ("BUY" if spec["dir_up"] else "SELL"),
                                          "open_price": exp_px, "ticket": tid})
                        risk_ledger[tid] = cand_risk
                        _save_state()
                        log.info(f"{'[PAPER] ' if paper else ''}{instr} {spec['decision'].upper()} "
                                 f"{direction} @~{spec['entry']} SL {spec['sl']} TP {spec['tp']} "
                                 f"→ ticket {tid} lots {lots} (margin {spec['margin']})")
                        _record_decision(instr, "entered", side=spec.get("side"), rung=spec.get("rung"),
                                          zone_id=zid, decision=spec.get("decision"), margin=spec.get("margin"))
                        if cfg.get("tg_enabled", True) and tg_master_on:
                            mid = _tg_send(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                           _fmt_entry_alert(instr, spec, lots, " [PAPER]" if paper else ""))
                            if mid:
                                tg_entry_msgid[tid] = mid
                    else:
                        first = reject_until.get(zid, 0) <= nowt
                        reject_until[zid] = nowt + REJECT_COOLDOWN_SECS
                        if first:
                            reject_reason = getattr(broker, "last_reject_reason", None)
                            log.warning(f"{instr} {spec['decision']} {zid} entry REJECTED — "
                                        f"backing off {REJECT_COOLDOWN_SECS}s (zone kept open)")
                            _record_decision(instr, "rejected", side=spec.get("side"), rung=spec.get("rung"),
                                              zone_id=zid, decision=spec.get("decision"), margin=spec.get("margin"),
                                              reason=reject_reason)
                            if cfg.get("tg_enabled", True) and tg_master_on:
                                send_telegram(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                              _fmt_skip_alert(instr, spec, reject_reason or "order rejected",
                                                              " [PAPER]" if paper else ""))

        time.sleep(max(cfg.get("tick_secs", 3), 1))


def _tol(cfg: dict, instr: str) -> float:
    try:
        return float(cfg.get("touch_tol_pips", 1) or 0) * I.pip_size(instr)
    except Exception:
        return 0.0


def _stack_dist(cfg: dict, instr: str) -> float:
    try:
        return float(cfg.get("stack_guard_pips", 5) or 0) * I.pip_size(instr)
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser(description="MacroFX volatility_bot_v2 (Level Atlas Vote Portfolio)")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
