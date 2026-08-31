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
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                                # noqa: E402
from pylego import instruments as I                           # noqa: E402
from pylego import point_values as PV                         # noqa: E402
from pylego.sizing import position_size                       # noqa: E402
from pylego.broker.paper import PaperBroker                   # noqa: E402
from pylego.quotes import QuoteFeed                            # noqa: E402
from pylego.costs import expected_fill, max_spread             # noqa: E402
from pylego.risk_guard import RiskGuard, log_block_transition  # noqa: E402
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


def build_status(cfg, broker, plan, paper, sessions, ccy_gate, throttle=None):
    bal = broker.account_balance()
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

    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}
    ccy_gate = CurrencyLossGate(max_daily_loss_pct=float(cfg.get("max_daily_loss_pct", 1.0)))
    ccy_blocks: dict[str, str | None] = {}
    throttle = DrawdownThrottle()
    throttle.sync_cfg(cfg)
    throttle_was_on = False

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
    risk_ledger: dict[int, float] = {}
    sym_key: dict[str, str] = {}      # broker-symbol spelling -> canonical key (currency gate lookups)

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

    def _save_state() -> None:
        try:
            kv.put_json("volatility_bot_v2_state", {
                "generatedAt": (plan or {}).get("generatedAt"),
                "entered": {i: sorted(s.entered) for i, s in sessions.items()},
                "risk_ledger": {str(k): v for k, v in risk_ledger.items()},
                "throttle": throttle.snapshot(),
            })
        except Exception as e:
            log.warning(f"one-shot state save failed: {e} (restart double-entry protection degraded)")

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
                status = build_status(cfg, broker, plan, paper, sessions, ccy_gate, throttle)
                kv.put_status("volatility_bot_v2_status", status)
            except Exception as e:
                log.warning(f"status push failed: {e}")
            # Persist throttle/risk_ledger/entered state on this cadence too,
            # not just after a fill -- otherwise the throttle's running peak
            # (and its throttled/not-throttled state) only survives a restart
            # if one happened to land right after a trade.
            _save_state()
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
                else:
                    log.info("PLAN-AGE GATE: fresh plan — entries resumed")

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
                log_block_transition(log, guard_blocks, instr, guard_why)
                if guard_why:
                    continue
                if cfg.get("ccy_loss_gate", True):
                    ccy_why = ccy_gate.blocked(instr, nowt)
                    if ccy_why != ccy_blocks.get(instr):
                        ccy_blocks[instr] = ccy_why
                        if ccy_why:
                            log.warning(f"CURRENCY GATE [{instr}]: NEW entries deferred — {ccy_why}")
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
                                log.info(f"STACK GUARD [{instr}] {zid} deferred — already "
                                         f"{'LONG' if spec['dir_up'] else 'SHORT'} @ "
                                         f"{conflict.get('open_price')} (ticket {ctk}) within "
                                         f"{cfg.get('stack_guard_pips', 5)}p; would be one bet")
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
                                log.info(f"RISK BUDGET [{instr}] {zid} deferred — open risk "
                                         f"{open_risk:.2f}% + candidate {cand_risk:.2f}% > cap {risk_cap}%")
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
                    else:
                        first = reject_until.get(zid, 0) <= nowt
                        reject_until[zid] = nowt + REJECT_COOLDOWN_SECS
                        if first:
                            log.warning(f"{instr} {spec['decision']} {zid} entry REJECTED — "
                                        f"backing off {REJECT_COOLDOWN_SECS}s (zone kept open)")

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
