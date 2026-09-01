"""fib_atlas_bot — Asia + Monday range-extension vote portfolio, live/paper on MT5.

Same "server computes + freezes a plan to KV, the bot only polls + executes"
architecture as `volatility_bot_v2/volatility_bot_v2.py` (this bot's own
template — mirror it file-for-file for anything not called out below), built
entirely from `pylego/` bricks. `server.js`'s `_refreshFibAtlasPlan` already
runs the validated Fib Atlas vote/pricing math (`js/asiaFibAtlasRoutes.js`'s
`asiaLivePlanZones` + `js/mondayFibAtlasRoutes.js`'s `mondayLivePlanZones`,
both over the SAME already-frozen `voteDecision`/rung math the backtest and
portfolio pages use) and writes the result to `fib_atlas_bot_plan`. This bot
NEVER computes a vote, a level, a stop, or a direction from strategy logic —
see `engine.py`'s own docstring for the two things it genuinely does own
(rearm state, chandelier trailing) and why those are left to it.

  python fib_atlas_bot/fib_atlas_bot.py            # paper mode (default)
  python fib_atlas_bot/fib_atlas_bot.py --live      # live MT5 (needs creds in fib_atlas_bot_credentials)

Universe: whatever (pair, ladder) keys the plan actually carries — the
server-side plan producer is already the real enabled_pairs gate (it only
ever computes zones for its own configured universe), so this bot never
hardcodes a pair list; see DEFAULT_CFG's `enabled_pairs` doc below. Config /
credentials / status / trade log / decision log all flow through the
dashboard KV exactly like every other bot (fib_atlas_bot_config / _credentials
/ _status / _trade_log / _decision_log / _state).
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

from pylego.kv import KvClient                                   # noqa: E402
from pylego import instruments as I                               # noqa: E402
from pylego import point_values as PV                              # noqa: E402
from pylego.sizing import position_size                            # noqa: E402
from pylego.broker.paper import PaperBroker                        # noqa: E402
from pylego.quotes import QuoteFeed                                 # noqa: E402
from pylego.costs import expected_fill, max_spread                  # noqa: E402
from pylego.risk_guard import RiskGuard, log_block_transition, block_category  # noqa: E402
from pylego.telegram import send_telegram                           # noqa: E402
from pylego.drawdown_throttle import DrawdownThrottle                # noqa: E402
from fib_atlas_bot.engine import (                                    # noqa: E402
    RearmTracker, rearm_distance, zone_is_long, chandelier_stop,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fib_atlas_bot")

MAGIC = 20260831                                                 # must match pylego/magics.py — pylego/magics_test.py enforces it
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
REJECT_COOLDOWN_SECS = 60

# Frozen, validated per-ladder chandelier trail multipliers — analysis/
# fib_atlas_chandelier_exit_backtest.mjs + analysis/fib_atlas_chandelier_
# walkforward.mjs (SHIPPED_MULT = { asia: 3, monday: 1.5 }). NOT configurable
# on purpose (these are validated constants, same discipline as this bot's
# other frozen levers — stop-tighten frac, cost-efficiency ratios — which
# also live server-side, not in this bot's own config).
CHANDELIER_MULT = {"asia": 3.0, "monday": 1.5}
CHANDELIER_ATR_PERIOD = 60
# A modify the broker keeps rejecting (e.g. SL inside its minimum stop
# distance) must NOT be retried every single tick forever — found 2026-09-01
# spamming "Invalid stops" every ~3s for 15+ min on one ticket with zero
# back-off. Mt5Broker.modify() itself now clamps to the broker's minimum
# distance, but this cooldown is a second line of defence for whatever
# clamping can't fix (e.g. tick/symbol_info unavailable).
CHANDELIER_MODIFY_COOLDOWN_SECS = 60
# How much M1 history to hand chandelier_stop() so its Wilder-EMA ATR has
# room to converge before its value is trusted (see engine.chandelier_stop's
# own doc on why a short "since entry" window alone carries real seed bias).
# 8h of M1 = 480 bars, comfortably > a few multiples of the 60-bar period.
CHANDELIER_LOOKBACK_SECS = 8 * 3600

DEFAULT_CFG = {
    "kill_switch": False,
    "paper_mode": True,             # HARDCODED default — same discipline as volatility_bot_v2: never start a fresh bot live.
    "enabled_pairs": [],            # [] -> whatever (pair,ladder) keys the plan carries (server.js's FIB_ATLAS_DEFAULT_PAIRS
                                     # 16-pair universe is the REAL gate -- it already only computes zones for its own
                                     # configured pairs). Non-empty here further restricts which of the plan's pairs THIS
                                     # bot instance acts on -- a checkbox-array of lowercase canonical keys, like eurusd.
    "ladders": {"asia": True, "monday": True},   # which ladder(s) this bot instance trades -- filters plan keys by the
                                                  # "|asia" / "|monday" suffix.
    "risk_pct": 0.5,
    "max_lot": 5.0,
    "max_open": 20,
    "max_concurrent_per_pair": 4,   # both ladders + both directions can legitimately be open on one pair at once.
    "max_spread_pips": 2.0,
    # Spread-guard window — added 2026-09-02 after a real live incident the
    # PREVIOUS day (2026-09-01): 3 positions (EURGBP x2, AUDJPY) stopped out
    # within 16 minutes of each other around 00:00 UTC (the broker's daily
    # rollover), plus a separate EURUSD stop at 22:05 UTC with ZERO recorded
    # adverse excursion beforehand (mae_pips=0) — the signature of a quote
    # gap, not a real price move. A FOURTH incident the same evening: EURGBP
    # entered fresh at 21:54 UTC, ~11 minutes before the danger window even
    # starts here, so a freshly-opened position had essentially no room to
    # move favorably before getting caught. Unlike volatility_bot_v2's EOD
    # close (which targets the STRATEGY's own day boundary for backtest
    # fidelity), this targets the observed low-liquidity window around the
    # NY interbank close (~21:00 UTC) through the daily broker rollover
    # (~00:00 UTC): Mt5Broker.modify()/enter() have zero spread awareness
    # for an ALREADY-OPEN position's resting stop order — max_spread_pips
    # only ever gated brand-new entries. `spread_guard_start_utc` is
    # deliberately set well BEFORE the observed incidents (not just at the
    # first one) so a fresh entry never lands right at the edge of the
    # window the way the 21:54 EURGBP one did. Wraps past midnight UTC;
    # start/end are configurable since the exact worst minutes can vary by
    # broker/day and this is early live observation, not a frozen backtest
    # constant.
    "spread_guard_enabled": True,
    "spread_guard_start_utc": "21:30",   # no NEW entries from here...
    "spread_guard_end_utc": "00:30",     # ...through here — flattens anything still open once the window starts
    "ddlimit": 3.0,
    "monthlydd": 5.0,
    "lockout": 3,
    "cooldown": 60,
    "throttle_enabled": False,      # off by default even though validated -- this repo's convention for a new lever
                                     # shipping unchecked (matches how the JS backtest pages ship every new lever off).
    "throttle_trigger_dd": -8.0,
    "throttle_restore_dd": -2.0,
    "throttle_mult": 0.25,
    "max_open_risk_pct": 0,         # 0 = off -- matches the OOS finding that no heat cap improved drawdown once the
                                     # chandelier exit is running (analysis/fib_atlas_chandelier_*).
    "plan_max_age_hours": 2,
    "tick_secs": 3,
    "status_secs": 30,
    "plan_secs": 45,
    "tg_enabled": True,
    # Empty by default -- same convention as volatility_bot_v2's own
    # DEFAULT_CFG (tg_token/tg_chat_id unset): a real bot token is a
    # credential, never a literal in source. Set via fib_atlas_bot_config
    # in KV (the config page's Telegram fields), not here.
    "tg_token": "",
    "tg_chat_id": "",
}

# Broker symbol routing — identity stays shared (pylego.instruments), routing
# is local, same convention as volatility_bot_v2's own _BROKER_OVERRIDE. Fib
# Atlas's universe is FX pairs + gold only (no indices), and the registry's
# own `mt5` field already resolves every one of those correctly (gold ->
# XAUUSD) -- this table exists for the one instrument that traditionally
# needs a broker-specific spelling on SOME brokers, kept explicit rather than
# silently relying on the registry default staying right forever.
_BROKER_OVERRIDE = {"gold": "XAUUSD"}


def _parse_hhmm_secs(s: str) -> int:
    h, m = str(s).split(":")
    return int(h) * 3600 + int(m) * 60


def _in_spread_guard_window(now_epoch: float, start_utc: str, end_utc: str) -> bool:
    """True if the current UTC time-of-day falls in [start_utc, end_utc) —
    plain HH:MM clock times, not a strategy day-boundary (see DEFAULT_CFG's
    own doc for why this is a different concept from volatility_bot_v2's
    EOD close). Wraps past midnight when start > end (the normal case here:
    21:30 -> 00:30)."""
    now = datetime.fromtimestamp(now_epoch, timezone.utc)
    now_secs = now.hour * 3600 + now.minute * 60 + now.second
    start_secs, end_secs = _parse_hhmm_secs(start_utc), _parse_hhmm_secs(end_utc)
    if start_secs <= end_secs:
        return start_secs <= now_secs < end_secs
    return now_secs >= start_secs or now_secs < end_secs


def _mt5_sym(pair: str) -> str:
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
    if cfg.get("paper_mode", True):
        return PaperBroker(balance=10_000.0), True
    from pylego.broker.mt5 import Mt5Broker
    broker = Mt5Broker(MAGIC, _mt5_sym, I.pip_size, log=log)
    if not broker.available:
        log.warning("live requested but MetaTrader5 missing — falling back to PAPER")
        return PaperBroker(balance=10_000.0), True
    return broker, False


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


def _pair_ladder(key: str) -> tuple[str, str]:
    """"eurusd|asia" -> ("eurusd", "asia")."""
    pair, _, ladder = key.partition("|")
    return pair, ladder


def _enabled_keys(cfg: dict, plan: dict) -> list[str]:
    """The (pair, ladder) instrument keys this bot instance acts on this
    tick: every key the plan carries, filtered by `enabled_pairs` (empty =
    no bot-side pair restriction — the plan's own universe already is the
    real gate, see DEFAULT_CFG's doc) and by which ladder(s) `ladders` has
    turned on."""
    wanted_pairs = {str(p).lower() for p in (cfg.get("enabled_pairs") or [])}
    ladders_on = cfg.get("ladders") or {"asia": True, "monday": True}
    out = []
    for key in _plan_instruments(plan).keys():
        pair, ladder = _pair_ladder(key)
        if wanted_pairs and pair not in wanted_pairs:
            continue
        if not ladders_on.get(ladder, True):
            continue
        out.append(key)
    return out


def _instr_lines(plan: dict, rearm: RearmTracker) -> list:
    """Per-zone snapshot for the config page's "Today's Levels & Live
    Decisions" table: every zone the plan currently carries, whether it's
    armed right now, and the vote's own rationale."""
    out = []
    for key, slice_ in _plan_instruments(plan).items():
        pair, ladder = _pair_ladder(key)
        for z in slice_.get("zones", []):
            rkey = f"{key}|{z.get('dedupeTag')}"
            out.append({
                "pair": pair, "ladder": ladder, "side": z.get("side"), "rung": z.get("rung"),
                "decision": z.get("decision"), "margin": z.get("margin"),
                "entry": z.get("entry"), "sl": z.get("sl"), "tp": z.get("tp"),
                "armed": rearm.is_armed(rkey), "touchedToday": z.get("touchedToday"),
                "dedupeTag": z.get("dedupeTag"), "rationale": z.get("rationale"),
            })
    return out


# ── Telegram — entered/skipped/rejected decisions + SL/TP close outcomes ────
# Bot-local send (mirrors volatility_bot_v2._tg_send exactly): needs the sent
# message_id back for reply-threading a close alert onto its entry alert,
# which `pylego.telegram.send_telegram`'s simple bool contract doesn't carry
# (see that bot's own doc on why this stays a small local variant instead of
# widening the shared brick for a contract only one caller uses so far).
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


def _fmt_entry_alert(pair: str, ladder: str, z: dict, is_long: bool, lots: float, mode_tag: str) -> str:
    direction = "LONG" if is_long else "SHORT"
    icon = "🟢" if is_long else "🔴"
    return (f"{icon} <b>{pair.upper()}</b> [{ladder.upper()}] {direction} entered{mode_tag}\n"
            f"{z.get('side')}/{z.get('rung')} · {z.get('decision')} · {z.get('rationale') or ''}\n"
            f"Entry <code>{_fmt_px(z.get('entry'))}</code>  "
            f"SL <code>{_fmt_px(z.get('sl'))}</code>  TP <code>{_fmt_px(z.get('tp'))}</code>\n"
            f"Lots {lots}")


def _fmt_skip_alert(pair: str, ladder: str, z: dict, reason: str, mode_tag: str) -> str:
    return (f"⏸️ <b>{pair.upper()}</b> [{ladder.upper()}] {z.get('side')}/{z.get('rung')} touch skipped{mode_tag}\n"
            f"{z.get('decision')} · {z.get('rationale') or ''}\n"
            f"Reason: {reason}")


def _fmt_close_alert(pair: str, row: dict, mode_tag: str) -> str:
    reason = (row.get("reason") or "").lower()
    tag = "✅ <b>TP HIT</b>" if reason == "tp" else "🛑 <b>SL HIT</b>" if reason == "sl" else "⚪ closed manually"
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


def build_status(cfg, broker, plan, paper, rearm: RearmTracker, throttle=None, guard=None,
                  risk_ledger=None, plan_age_blocked=False, spread_guard_blocked=False):
    bal = broker.account_balance()
    open_risk_pct = round(sum((risk_ledger or {}).values()), 2)
    heat_cap = float(cfg.get("max_open_risk_pct", 0) or 0)
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "balance": round(bal, 2) if bal is not None else None,
        "strategy": (plan or {}).get("strategy", "fib-atlas-vote"),
        "generatedAt": (plan or {}).get("generatedAt"),
        "universe": list(_plan_instruments(plan).keys()),
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
        "lines": _instr_lines(plan, rearm),
        "throttle": throttle.snapshot() if throttle is not None else None,
        "risk_guard": guard.snapshot(bal) if guard is not None else None,
        "portfolio_heat_pct": open_risk_pct,
        "portfolio_heat_cap_pct": heat_cap,
        "plan_age_blocked": bool(plan_age_blocked),
        "spread_guard_blocked": bool(spread_guard_blocked),
    }


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    try:
        cfg = _deep_merge(DEFAULT_CFG, kv.get_json("fib_atlas_bot_config") or {})
    except Exception as e:
        log.error(f"could not reach dashboard at {base_url} to read config: {e} — exiting")
        return
    if force_live:
        cfg["paper_mode"] = False
    broker, paper = make_broker(cfg)
    quotes = QuoteFeed(base_url, log=log) if paper else None

    # First plan fetch happens BEFORE live symbol verification (and before
    # the main loop's own cadence check) specifically so verify_symbols has
    # a real pair list to check without this bot ever hardcoding one (see
    # DEFAULT_CFG's enabled_pairs doc) -- best-effort: a cold/failed fetch
    # here just means verification is deferred to whenever the first plan
    # DOES land (main loop's own plan-poll branch runs it through
    # _sync-equivalent bookkeeping the same as any later refresh).
    try:
        plan = kv.get_json("fib_atlas_bot_plan")
    except Exception as e:
        log.warning(f"initial plan fetch failed: {e} — continuing, will retry in the main loop")
        plan = None

    if not paper:
        try:
            creds = kv.get_json("fib_atlas_bot_credentials") or {}
        except Exception as e:
            log.error(f"could not reach dashboard to read credentials: {e} — exiting")
            return
        if not creds.get("mt5_account"):
            log.error("live mode but no mt5_account in fib_atlas_bot_credentials — refusing to start. "
                      "Save MT5 credentials on the bot config page first.")
            return
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed — exiting")
            return
        verify_pairs = sorted({str(p).lower() for p in (cfg.get("enabled_pairs") or [])} or
                               {_pair_ladder(k)[0] for k in _plan_instruments(plan).keys()})
        if not verify_pairs:
            log.warning("no enabled_pairs configured and no plan loaded yet — skipping startup symbol "
                        "verification (a bad broker symbol will surface as an order rejection instead)")
        else:
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
                          f"those pairs will fail every live order until fixed.")
            else:
                log.info(f"symbol check OK — all {len(verify_pairs)} pair(s) resolve to a real symbol on this account")

    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}
    throttle = DrawdownThrottle()
    throttle.sync_cfg(cfg)
    throttle_was_on = False

    # Central "Alerts" modal master switch — same per-sender kill-switch every
    # other Telegram alert in this codebase respects (TG_SENDERS/tgOn() in
    # server.js), under sender key 'fibAtlas'. This bot is a separate process
    # from server.js's in-memory state, so it reads the SAME underlying KV key
    # (`ai_alert_cfg`, public-read via its 'ai_' prefix) directly. Missing/
    # unset reads as ON, only an explicit `false` turns it off. Fails OPEN on
    # a fetch error (alerts are informational, not a risk control).
    tg_master_on = True

    rearm = RearmTracker()
    reject_until: dict[str, float] = {}
    budget_skips: dict[str, bool] = {}
    risk_ledger: dict[int, float] = {}
    ticket_ladder: dict[int, str] = {}     # ticket -> 'asia'/'monday', for picking the right chandelier_mult
    ticket_pair: dict[int, str] = {}       # ticket -> canonical pair key, for session_bars()
    chand_sl: dict[int, float] = {}        # ticket -> the tightest SL this bot has itself set/seen (never loosened)
    chand_reject_until: dict[int, float] = {}  # ticket -> epoch to stop retrying a broker-rejected modify until
    sym_key: dict[str, str] = {}           # broker-symbol spelling -> canonical pair key
    tg_entry_msgid: dict[int, int] = {}    # ticket -> entry alert's Telegram message_id (reply-threads the close alert)
    tg_closed_alerted: set[int] = set()    # position_ids already sent a close alert for
    plan = plan                            # from the pre-verify_symbols fetch above (may be None)
    last_plan = last_status = 0.0
    plan_age_blocked = False
    spread_guard_blocked = False
    spread_guard_closed_tickets: set[int] = set()  # tickets already flattened this window — don't re-close every tick

    try:
        saved_state = kv.get_json("fib_atlas_bot_state") or {}
    except Exception:
        saved_state = {}
    for k, v in (saved_state.get("risk_ledger") or {}).items():
        try:
            risk_ledger[int(k)] = float(v)
        except (TypeError, ValueError):
            pass
    for k, v in (saved_state.get("ticket_ladder") or {}).items():
        try:
            ticket_ladder[int(k)] = str(v)
        except (TypeError, ValueError):
            pass
    for k, v in (saved_state.get("ticket_pair") or {}).items():
        try:
            ticket_pair[int(k)] = str(v)
        except (TypeError, ValueError):
            pass
    for k, v in (saved_state.get("chand_sl") or {}).items():
        try:
            chand_sl[int(k)] = float(v)
        except (TypeError, ValueError):
            pass
    throttle.restore(saved_state.get("throttle"))
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
    # NOTE: RearmTracker's armed/date state is DELIBERATELY NOT persisted
    # across a restart. Its own priming behavior (see engine.RearmTracker's
    # doc) already makes a fresh start safe: the first observation of any
    # (pair,ladder,side,rung) after a restart never retro-fires even if
    # price is already sitting past the rung, it just re-primes from
    # whatever the CURRENT price is. The only real cost of not persisting is
    # losing a rearm-in-progress countdown across a restart (a rung that was
    # unarmed and partway back toward its rearm distance goes back to
    # "primed" instead) -- a conservative loss (fewer re-entries, never
    # extra/duplicate ones), not a safety issue, so not worth the extra
    # persisted-state surface for a first version.

    def _save_state() -> None:
        try:
            kv.put_json("fib_atlas_bot_state", {
                "generatedAt": (plan or {}).get("generatedAt"),
                "risk_ledger": {str(k): v for k, v in risk_ledger.items()},
                "ticket_ladder": {str(k): v for k, v in ticket_ladder.items()},
                "ticket_pair": {str(k): v for k, v in ticket_pair.items()},
                "chand_sl": {str(k): v for k, v in chand_sl.items()},
                "throttle": throttle.snapshot(),
                "tg_entry_msgid": {str(k): v for k, v in tg_entry_msgid.items()},
                "tg_closed_alerted": list(tg_closed_alerted)[-500:],
            })
        except Exception as e:
            log.warning(f"one-shot state save failed: {e} (restart double-entry protection degraded)")

    # ── Decision audit log — "why wasn't this taken" (same convention as
    # volatility_bot_v2 — see that bot's own doc). ──────────────────────────
    try:
        decision_events: list[dict] = list((kv.get_json("fib_atlas_bot_decision_log") or {}).get("events") or [])
    except Exception:
        decision_events = []
    DECISION_LOG_MAX_EVENTS = 5000

    def _record_decision(pair: str, ladder: str, status: str, *, side: str | None = None, rung=None,
                          dedupe_tag: str | None = None, decision: str | None = None, margin: int | None = None,
                          reason: str | None = None) -> None:
        decision_events.append({"t": int(time.time()), "pair": pair, "ladder": ladder, "side": side, "rung": rung,
                                 "dedupeTag": dedupe_tag, "decision": decision, "margin": margin,
                                 "status": status, "reason": reason})
        if len(decision_events) > DECISION_LOG_MAX_EVENTS:
            del decision_events[:len(decision_events) - DECISION_LOG_MAX_EVENTS]

    def _flush_decision_log() -> None:
        try:
            kv.put_json("fib_atlas_bot_decision_log", {"events": decision_events})
        except Exception as e:
            log.warning(f"decision log flush failed: {e}")

    def _register_pair(pair: str) -> None:
        for s in {pair, pair.upper(), _mt5_sym(pair), _mt5_sym(pair).upper()}:
            sym_key[s] = pair

    for key in _plan_instruments(plan).keys():
        _register_pair(_pair_ladder(key)[0])

    while True:
        nowt = time.time()

        # (a) Plan — every plan_secs (this plan is near-real-time, same
        # rationale as volatility_bot_v2's own doc).
        if nowt - last_plan >= cfg.get("plan_secs", 45) or last_plan == 0.0:
            try:
                new_plan = kv.get_json("fib_atlas_bot_plan")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} — keeping current plan")
                new_plan = None
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                for key in _plan_instruments(plan).keys():
                    _register_pair(_pair_ladder(key)[0])
                log.info(f"new plan loaded · {plan.get('generatedAt')} · "
                         f"{len(_plan_instruments(plan))} (pair,ladder) constituents")
            last_plan = nowt

        # (b) Config + status — medium cadence.
        if nowt - last_status >= cfg.get("status_secs", 30):
            try:
                cfg = _deep_merge(DEFAULT_CFG, kv.get_json("fib_atlas_bot_config") or cfg)
                guard.sync_cfg(cfg)
                throttle.sync_cfg(cfg)
            except Exception as e:
                log.warning(f"config fetch failed: {e}")
            try:
                master_cfg = kv.get_json("ai_alert_cfg") or {}
                tg_master_on = master_cfg.get("tgMaster", {}).get("fibAtlas", None) is not False
            except Exception as e:
                log.warning(f"ai_alert_cfg fetch failed: {e} (Telegram master switch check skipped this cycle)")
            try:
                status = build_status(cfg, broker, plan, paper, rearm, throttle,
                                       guard=guard, risk_ledger=risk_ledger, plan_age_blocked=plan_age_blocked,
                                       spread_guard_blocked=spread_guard_blocked)
                kv.put_status("fib_atlas_bot_status", status)
            except Exception as e:
                log.warning(f"status push failed: {e}")
            _save_state()
            _flush_decision_log()
            last_status = nowt

        # (c) Tight loop.
        bal = broker.account_balance() or 0.0
        if bal:
            guard.update_balance(bal)
        guard_bal = bal if bal else 1_000_000.0
        size_mult = throttle.update(bal) if cfg.get("throttle_enabled", False) else 1.0
        if (size_mult < 1.0) != throttle_was_on:
            throttle_was_on = size_mult < 1.0
            if throttle_was_on:
                log.warning(f"DRAWDOWN THROTTLE: engaged — sizing at {size_mult:g}x "
                            f"until balance recovers to {throttle.restore_dd}% from peak")
            else:
                log.info("DRAWDOWN THROTTLE: recovered — full size resumed")

        # ── Spread-guard window — see DEFAULT_CFG's own doc for the incident
        # this responds to. Blocks NEW entries starting well before the
        # observed danger window and flattens every currently open position,
        # once each (spread_guard_closed_tickets dedupes the same way EOD
        # close's eod_closed_tickets does in volatility_bot_v2). Chandelier
        # trailing below is also skipped while the window is active — a
        # modify() call reading a spread-widened bid/ask mid-spike could
        # itself place a worse stop than doing nothing, and the position is
        # being flattened anyway. ────────────────────────────────────────
        sg_on = bool(cfg.get("spread_guard_enabled", True))
        sg_block = sg_on and _in_spread_guard_window(
            nowt, cfg.get("spread_guard_start_utc", "21:30"), cfg.get("spread_guard_end_utc", "00:30"))
        if sg_block != spread_guard_blocked:
            spread_guard_blocked = sg_block
            if sg_block:
                log.warning(f"SPREAD GUARD: within the {cfg.get('spread_guard_start_utc', '21:30')}-"
                            f"{cfg.get('spread_guard_end_utc', '00:30')} UTC low-liquidity window — "
                            f"flattening open positions, NEW entries blocked until it clears.")
                _record_decision("*", "*", "pair_blocked", reason="spread_guard: low-liquidity window")
            else:
                spread_guard_closed_tickets.clear()
                log.info("SPREAD GUARD: window cleared — entries resumed")

        open_book = broker.serialize_open_positions()
        open_tickets = {p.get("ticket") for p in open_book}

        if spread_guard_blocked:
            for p in open_book:
                tid = p.get("ticket")
                if tid is None or tid in spread_guard_closed_tickets:
                    continue
                pair = ticket_pair.get(tid) or sym_key.get(p.get("symbol"))
                if pair is None:
                    continue
                if broker.stop(tid, pair, paper, reason="spread_guard"):
                    spread_guard_closed_tickets.add(tid)
                    log.info(f"SPREAD GUARD: {pair} ticket {tid} flattened")
                    _record_decision(pair, ticket_ladder.get(tid) or "*", "closed", reason="spread_guard: low-liquidity window")

        # ── Chandelier trailing stop — runs EVERY tick, UNCONDITIONALLY
        # (regardless of kill_switch / plan staleness / anything else that
        # gates NEW entries) EXCEPT the spread guard above. This only ever
        # TIGHTENS an existing position's stop, so it is a risk-reducing
        # action, not new risk — the same discipline as a broker-native
        # SL/TP always running regardless of plan age. ──────────────────
        for p in open_book:
            if spread_guard_blocked:
                break   # positions are being flattened above, not trailed
            tid = p.get("ticket")
            if tid is None:
                continue
            ladder = ticket_ladder.get(tid)
            pair = ticket_pair.get(tid) or sym_key.get(p.get("symbol"))
            if ladder is None or pair is None:
                continue   # opened before this bot tracked it (or state not yet restored) — skip, don't guess
            is_long = p.get("direction") == "BUY"
            try:
                bars = broker.session_bars(pair, int(nowt - CHANDELIER_LOOKBACK_SECS))
            except Exception as e:
                log.warning(f"session_bars failed for {pair}: {e}")
                bars = []
            new_sl = chandelier_stop(bars, CHANDELIER_MULT.get(ladder, 3.0),
                                      period=CHANDELIER_ATR_PERIOD, is_long=is_long)
            if new_sl is None:
                continue
            cur_sl = chand_sl.get(tid)
            improves = cur_sl is None or (new_sl > cur_sl if is_long else new_sl < cur_sl)
            if not improves:
                continue
            if chand_reject_until.get(tid, 0) > nowt:
                continue   # broker rejected this ticket recently — cooling down, not retrying every tick
            try:
                if broker.modify(tid, pair, sl=new_sl, paper_mode=paper):
                    chand_sl[tid] = new_sl
                    chand_reject_until.pop(tid, None)
                else:
                    chand_reject_until[tid] = nowt + CHANDELIER_MODIFY_COOLDOWN_SECS
            except Exception as e:
                log.warning(f"chandelier modify failed for ticket {tid} ({pair}): {e}")
                chand_reject_until[tid] = nowt + CHANDELIER_MODIFY_COOLDOWN_SECS
        for t in list(chand_sl):
            if t not in open_tickets:
                chand_sl.pop(t, None)
                ticket_ladder.pop(t, None)
                ticket_pair.pop(t, None)
        for t in list(chand_reject_until):
            if t not in open_tickets:
                chand_reject_until.pop(t, None)

        # Close alerts + risk_ledger pruning — every tick, independent of
        # kill_switch/plan (a fill can close at any time).
        for c in broker.serialize_closed_trades():
            pid = c.get("position_id") or c.get("ticket")
            if cfg.get("tg_enabled", True) and tg_master_on and pid is not None and pid not in tg_closed_alerted:
                tg_closed_alerted.add(pid)
                reply_to = tg_entry_msgid.pop(pid, None)
                key = sym_key.get(c.get("symbol")) or str(c.get("symbol", "")).lower()
                _tg_send(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                         _fmt_close_alert(key, c, " [PAPER]" if paper else ""), reply_to=reply_to)
        for t in [t for t in risk_ledger if t not in open_tickets]:
            risk_ledger.pop(t, None)

        age = _plan_age_hours(plan, nowt)
        max_age = float(cfg.get("plan_max_age_hours", 2) or 0)
        age_block = bool(max_age > 0 and age is not None and age > max_age)
        if age_block != plan_age_blocked:
            plan_age_blocked = age_block
            if age_block:
                log.warning(f"PLAN-AGE GATE: plan is {age:.2f}h old (> {max_age}h) — NEW entries blocked "
                            f"until a fresh plan lands (fail-closed). Chandelier trail keeps running.")
                _record_decision("*", "*", "pair_blocked", reason=f"plan_age: {age:.2f}h old (> {max_age}h), all pairs")
            else:
                log.info("PLAN-AGE GATE: fresh plan — entries resumed")

        if plan and not cfg.get("kill_switch") and not plan_age_blocked and not spread_guard_blocked:
            for key in _enabled_keys(cfg, plan):
                pair, ladder = _pair_ladder(key)
                slice_ = _plan_instruments(plan).get(key) or {}
                zones = slice_.get("zones") or []
                if not zones:
                    continue
                px = quotes.price(pair) if quotes is not None else broker.price(pair)
                if px is None:
                    continue
                if not broker.tradable(pair):
                    continue
                if len(open_book) >= cfg.get("max_open", 20):
                    continue
                pair_sym_set = {pair, pair.upper(), _mt5_sym(pair), _mt5_sym(pair).upper()}
                open_for_pair = sum(1 for p in open_book if p.get("symbol") in pair_sym_set)
                if open_for_pair >= cfg.get("max_concurrent_per_pair", 4):
                    continue
                guard_key = f"{pair}_{ladder}"
                guard_why = guard.block_reason(guard_bal, guard_key)
                was_blocked = guard_blocks.get(guard_key)
                log_block_transition(log, guard_blocks, guard_key, guard_why)
                if guard_why and block_category(guard_why) != block_category(was_blocked):
                    _record_decision(pair, ladder, "pair_blocked", reason=f"risk_guard: {guard_why}")
                if guard_why:
                    continue

                for z in zones:
                    # Re-checked per zone, not just once before this loop: two
                    # distinct rungs on the SAME (pair, ladder) can both get a
                    # genuine fresh touch within one tick, and open_book/
                    # open_for_pair must reflect a fill from EARLIER in this
                    # same loop before the cap is judged against the next one.
                    if len(open_book) >= cfg.get("max_open", 20):
                        break
                    if open_for_pair >= cfg.get("max_concurrent_per_pair", 4):
                        break
                    if z.get("sl") is None or z.get("tp") is None:
                        continue
                    dedupe_tag = z.get("dedupeTag")
                    if not dedupe_tag:
                        continue
                    rkey = f"{key}|{dedupe_tag}"
                    dist = rearm_distance(z)
                    fired = rearm.touch(rkey, z.get("side"), float(z["entry"]), slice_.get("date"), px, dist)
                    if not fired:
                        continue
                    if reject_until.get(rkey, 0) > nowt:
                        continue

                    is_long = zone_is_long(z)
                    direction = "LONG" if is_long else "SHORT"
                    exp_px = expected_fill(z["entry"], is_long, pair, broker)
                    # Size off `sizingSl` (the FULL, untightened stop
                    # distance the plan always carries), NEVER off `sl` —
                    # `sl` may be a fade-zone's TIGHTENED stop (a validated
                    # server-side lever, see the plan's own field doc).
                    # Sizing off a tightened stop is implicit leverage:
                    # fixed-fractional sizing scales lots UP to compensate
                    # for a smaller stop distance, silently doubling the
                    # trade's real dollar risk for the same configured
                    # risk_pct. The actual broker bracket still uses the
                    # real (possibly tighter) `sl`/`tp` below.
                    sizing_dist = abs(exp_px - float(z["sizingSl"]))
                    lots = size_for(pair, bal, cfg.get("risk_pct", 0.5) * size_mult, sizing_dist,
                                    cfg.get("max_lot", 5.0))
                    risk_cap = float(cfg.get("max_open_risk_pct", 0) or 0)
                    cand_risk = _position_risk_pct(pair, lots, exp_px, z["sl"], bal) if bal else 0.0
                    if risk_cap > 0 and bal:
                        open_risk = sum(risk_ledger.get(t, 0.0) for t in (open_tickets & set(risk_ledger)))
                        if open_risk + cand_risk > risk_cap:
                            if not budget_skips.get(rkey):
                                budget_skips[rkey] = True
                                skip_reason = f"risk_budget: open {open_risk:.2f}% + candidate {cand_risk:.2f}% > cap {risk_cap}%"
                                log.info(f"RISK BUDGET [{pair}|{ladder}] {dedupe_tag} deferred — {skip_reason}")
                                _record_decision(pair, ladder, "skipped", side=z.get("side"), rung=z.get("rung"),
                                                  dedupe_tag=dedupe_tag, decision=z.get("decision"),
                                                  margin=z.get("margin"), reason=skip_reason)
                                if cfg.get("tg_enabled", True) and tg_master_on:
                                    send_telegram(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                                  _fmt_skip_alert(pair, ladder, z, skip_reason, " [PAPER]" if paper else ""))
                            continue
                    budget_skips.pop(rkey, None)

                    tid = broker.enter(pair, direction, z["sl"], z["tp"], lots,
                                       max_spread(pair, cfg), paper,
                                       comment=f"FA[{dedupe_tag}]", dedupe_tag=dedupe_tag)
                    filled = tid is not None and tid != -1
                    if filled:
                        guard.record_trade(guard_key)
                        reject_until.pop(rkey, None)
                        ticket_ladder[tid] = ladder
                        ticket_pair[tid] = pair
                        chand_sl[tid] = float(z["sl"])
                        open_book.append({"symbol": _mt5_sym(pair), "direction": ("BUY" if is_long else "SELL"),
                                          "open_price": exp_px, "ticket": tid})
                        open_tickets.add(tid)
                        open_for_pair += 1
                        risk_ledger[tid] = cand_risk
                        _save_state()
                        log.info(f"{'[PAPER] ' if paper else ''}{pair} [{ladder}] {z['decision'].upper()} "
                                 f"{direction} @~{z['entry']} SL {z['sl']} TP {z['tp']} → ticket {tid} "
                                 f"lots {lots} (margin {z['margin']})")
                        _record_decision(pair, ladder, "entered", side=z.get("side"), rung=z.get("rung"),
                                          dedupe_tag=dedupe_tag, decision=z.get("decision"), margin=z.get("margin"))
                        if cfg.get("tg_enabled", True) and tg_master_on:
                            mid = _tg_send(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                           _fmt_entry_alert(pair, ladder, z, is_long, lots, " [PAPER]" if paper else ""))
                            if mid:
                                tg_entry_msgid[tid] = mid
                    else:
                        first = reject_until.get(rkey, 0) <= nowt
                        reject_until[rkey] = nowt + REJECT_COOLDOWN_SECS
                        if first:
                            reject_reason = getattr(broker, "last_reject_reason", None)
                            log.warning(f"{pair} [{ladder}] {z['decision']} {dedupe_tag} entry REJECTED — "
                                        f"backing off {REJECT_COOLDOWN_SECS}s")
                            _record_decision(pair, ladder, "rejected", side=z.get("side"), rung=z.get("rung"),
                                              dedupe_tag=dedupe_tag, decision=z.get("decision"),
                                              margin=z.get("margin"), reason=reject_reason)
                            if cfg.get("tg_enabled", True) and tg_master_on:
                                send_telegram(cfg.get("tg_token", ""), cfg.get("tg_chat_id", ""),
                                              _fmt_skip_alert(pair, ladder, z, reject_reason or "order rejected",
                                                              " [PAPER]" if paper else ""))

        if plan and not cfg.get("kill_switch") and quotes is not None:
            # Feed the paper broker's own barrier check off whatever pairs
            # are actually enabled this tick (paper mode only — MT5 executes
            # SL/TP natively).
            for key in _enabled_keys(cfg, plan):
                pair, _ladder = _pair_ladder(key)
                q = quotes.price(pair)
                if q is not None:
                    broker.set_price(pair, q)
        if hasattr(broker, "check_barriers"):
            broker.check_barriers()

        time.sleep(max(cfg.get("tick_secs", 3), 1))


def main():
    ap = argparse.ArgumentParser(description="MacroFX fib_atlas_bot (Asia + Monday range-extension vote)")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
