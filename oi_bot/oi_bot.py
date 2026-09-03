"""OI Gamma Bot — the dealer-gamma regime-switch strategy, live.

Assembled from pylego bricks. It consumes the frozen ``oi_bot_zones`` plan (built
by the server from `js/oiZones.js buildOIZones` over the shared OI store — ONE
implementation, no JS/Python drift) and executes it: watch live price per
instrument, and when price reaches a planned zone's entry (fade → touch the wall,
break → clear it, max-pain → next tick), open ONE bracketed position (broker-
enforced SL + TP straight from the plan). Sizing via pylego.sizing scaled by the
plan's wall-strength/concentration ``sizeFactor``; orders route to a Broker
(PaperBroker by default; Mt5Broker --live).

  python oi_bot/oi_bot.py            # paper mode (default)
  python oi_bot/oi_bot.py --live      # live MT5 (needs creds in oi_bot_credentials)

Universe = gold + indices; FX only when the plan includes it (fx_enabled on the
config page — the weak-asset opt-in). Config/credentials/status flow through the
dashboard KV like the other bots (oi_bot_config / oi_bot_credentials /
oi_bot_status). This bot NEVER computes a level or a direction — the plan does.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.kv import KvClient                              # noqa: E402
from pylego import instruments as I                          # noqa: E402
from pylego import point_values as PV                        # noqa: E402
from pylego import events as EV                              # noqa: E402
from pylego.sizing import position_size                      # noqa: E402
from pylego.broker.paper import PaperBroker                  # noqa: E402
from pylego.quotes import QuoteFeed                          # noqa: E402
from pylego.costs import expected_fill, max_spread           # noqa: E402
from pylego.risk_guard import RiskGuard, log_block_transition  # noqa: E402
from oi_bot.engine import OISession, stack_conflict, position_mode  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("oi_bot")

MAGIC = 20260714                                            # unique to this bot
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
REJECT_COOLDOWN_SECS = 60                                    # back-off after a rejected entry (anti-spam)

DEFAULT_CFG = {
    "kill_switch": False,
    "paper_mode": True,
    "risk_pct": 0.5,
    "max_lot": 2.0,
    "max_open": 12,
    # RiskGuard — daily/monthly DD lockout + per-pair entry cooldown (blocks NEW
    # entries only; the broker-enforced SL/TP always run).
    "ddlimit": 3.0,               # max daily drawdown % before lockout
    "monthlydd": 5.0,             # max monthly drawdown % before lockout
    "lockout": 3,                 # hours locked out after a DD breach
    "cooldown": 240,              # seconds between entries on the SAME pair
    "max_spread_pips": None,      # None → per-asset-class caps (pylego.costs.max_spread)
    "plan_secs": 600,             # re-pull the zone plan
    "status_secs": 30,            # read config + push status
    "tick_secs": 3,               # local price watch + touch detection
    "enabled_pairs": [],          # [] = every instrument in the plan (already gated by the producer)
    "touch_tol_pips": 2,          # slack (in the pair's pips) around an entry level for the touch test
    # Stack guard: refuse a SECOND same-instrument, same-direction entry within
    # `stack_guard_pips` (the pair's pips) of one already open — two zones clustered
    # near the pin are one bet, not two (see Effective-Bets). Defers, doesn't burn:
    # the deferred zone can still fire once the conflicting position is gone.
    "stack_guard": True,
    "stack_guard_pips": 10,
    # ── 2026-08 quant-review additions ─────────────────────────────────────────
    # Portfolio risk budget: per-trade risk is risk_pct × the zone's sizeFactor
    # (up to ~2×), and max_open alone allowed a worst-case book risking >10%
    # against a 3% daily DD limit. This caps the SUM of open risk-to-SL (% of
    # balance) across this bot's book BEFORE entry — defer (don't burn) when full.
    "max_open_risk_pct": 2.0,      # 0 = off
    # Correlated-group cap: the four indices are ONE macro bet in stress — cap
    # same-direction positions per asset class (registry classes: index/commodity/fx).
    "max_group_positions": {"index": 2},
    # Plan-age gate: the plan IS the strategy and OI is a daily artifact — refuse
    # NEW entries on a plan older than this (fail-CLOSED, unlike the event gate
    # which suppresses and correctly fails open). Brackets always keep running.
    "plan_max_age_hours": 24,      # 0 = off
    # OI-CHAIN age gate: the plan-age gate above only proves the PRODUCER ran, not
    # that the OI it planned from is current. The producer re-plans every 10 min
    # from oi_store, so a forgotten paste gives a minutes-old plan built on a
    # week-old book — fresh by generatedAt, trading a dead chain. Gate on the paste
    # time the plan now carries (per instrument: pairs are pasted separately, so a
    # stale gold paste must not stop NQ trading). 30h matches today.html's
    # OI_FRESH_H, so the page and the bot call the same chain stale.
    "oi_max_age_hours": 30,        # 0 = off
    # Break dwell: a break zone must hold its trigger for N consecutive ticks —
    # a single wick through wall+breakPips on a 3s poll is not a decisive break.
    "break_hold_ticks": 2,         # 0 = fire on first touch (old behaviour)
    # Approach velocity: a fast impulse INTO a wall (move > frac × the plan's
    # refMove within the window) tends to consume the level — trim fades entered
    # on a fast approach. Breaks are untouched (momentum favours the break).
    "approach_window_secs": 120,
    "approach_fast_frac": 0.5,
    "approach_trim": 0.7,          # 1 = no trim
    # Scale-out: the plan publishes TP1 (first structure) AND TP2 (runner) but the
    # bracket only ever used TP1 — TP2 was dead weight. On, a zone with both targets
    # splits into two tickets: half banks at TP1, the runner rides to TP2, and (with
    # be_at_tp1) the runner's stop moves to entry once the TP1 leg closes — the
    # actual wall-to-wall playbook the rationale describes. Default OFF (behaviour
    # change worth an explicit opt-in on the config page).
    "scale_out": False,
    "be_at_tp1": True,
    # Time-based exits: every exit was price-based (SL/TP), but the MECHANISM each
    # mode trades expires — the pin/charm force behind a max-pain reversion is a
    # ≤2-DTE effect, and a wall fade leans on a book that rolls off at expiry. A
    # position that hits neither barrier used to sit as an orphan indefinitely.
    # Per-mode max hold in HOURS (0 = never time-close that mode); the mode is
    # parsed from the position's own comment tag, so it survives plan rolls and
    # bot restarts. Closes at market with reason "time".
    "max_hold_hours": {"fade": 48, "break": 24, "maxpain": 24, "react": 24},
    "paper_spread_pips": {},      # paper-fill spread OVERRIDES, {pair: pips in the pair's own units}
    # Telegram entry alerts (optional). tg_token/tg_chat_id fall back to the shared
    # tg_config (Level bot) if left blank — one alert per fill with the full trade.
    "tg_enabled": False,
    "tg_token": "",
    "tg_chat_id": "",
    # NOTE: the STRATEGY toggles (minTier, breakPips, fade/follow modes,
    # fx_enabled, enabled index/FX universe) live in oi_bot_config and are read by
    # the SERVER plan producer, not here — this bot only executes the resulting
    # plan. Keeping them off the executor is deliberate: one place computes, one
    # place trades (no drift).
}

# Broker symbol routing (identity stays shared; routing is local). Config can
# override per broker via `broker_symbols` (read live each config refresh).
_BROKER_OVERRIDE = {"de30": "GER40", "uk100": "UK100", "us2000": "US2000", "spx": "SP500",
                    "spx500": "SP500", "nq": "USTECH100", "us30": "US30", "dow": "US30",
                    "dax": "GER40", "rut": "US2000"}
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


def _pair_event_ccys(pair: str) -> list[str]:
    """Event currencies for an instrument. Indices/metals ride their denomination
    currency via the instrument registry (OANDA symbol carries the legs, e.g.
    'nq' → NAS100_USD → USD) and fall back to parsing the name itself
    (mirrors volatility_bot)."""
    try:
        sym = I.instrument(pair).get("oanda") or pair
    except Exception:
        sym = pair
    return EV.pair_ccys(sym)


# ── Telegram entry alerts ─────────────────────────────────────────────────────
def _load_tg(cfg: dict, kv: KvClient) -> tuple[str, str]:
    """OI-specific TG creds if set, else fall back to the shared tg_config (Level
    bot) — same convention as the regime bots."""
    tok = str(cfg.get("tg_token", "") or "").strip()
    cid = str(cfg.get("tg_chat_id", "") or "").strip()
    if tok and cid:
        return tok, cid
    try:
        shared = kv.get_json("tg_config") or {}
    except Exception:
        shared = {}
    return str(shared.get("token", "") or "").strip(), str(shared.get("chatId", "") or "").strip()


def send_telegram(token: str, chat_id: str, text: str, *, reply_to: int | None = None) -> int | None:
    """POST one alert; return the sent message's Telegram id (None on any failure).

    The id is the whole point of returning something richer than a bool: a close
    alert threads as a REPLY to its own entry alert, so "closed, +19.50, held 2h"
    sits under "entered, and here is why" instead of scrolling apart in a busy
    chat. (volatility_bot_v2 keeps its own copy of this for the same reason — the
    shared pylego.telegram brick is deliberately fire-and-forget.) Still
    best-effort: never raises, and a failed send only costs the thread link."""
    if not token or not chat_id:
        return None
    try:
        body = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        if reply_to:
            body["reply_to_message_id"] = reply_to
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json=body, timeout=10)
        j = r.json()
        return j.get("result", {}).get("message_id") if j.get("ok") else None
    except Exception as e:
        log.warning(f"Telegram send failed: {e}")
        return None


# Per-instrument icon + a TradingView chart the name links to.
_OI_ICON = {"gold": "🥇", "nq": "💻", "spx": "🇺🇸", "dow": "🏭", "rut": "🐘", "dax": "🇩🇪", "ftse": "🇬🇧"}
_OI_TV = {"gold": "OANDA:XAUUSD", "nq": "OANDA:NAS100USD", "spx": "OANDA:SPX500USD",
          "dow": "OANDA:US30USD", "rut": "OANDA:US2000USD", "dax": "OANDA:DE30EUR", "ftse": "OANDA:UK100GBP"}


def _fmt_price(instr: str, p) -> str:
    if p is None:
        return "—"
    try:
        d = I.price_digits(instr)
    except Exception:
        d = 5
    return f"{p:.{d}f}"


def _pips(instr: str, a, b) -> str:
    """Distance a→b in the pair's pips (blank if either side is missing)."""
    if a is None or b is None:
        return ""
    try:
        n = abs(a - b) / I.pip_size(instr)
    except Exception:
        return ""
    return f"{n:.0f} pips"


def _fmt_duration(t0, t1) -> str:
    """How long a position was open, as "3d 4h" / "2h 05m" / "43m" / "<1m".

    Both stamps come off MT5 on the BROKER's clock (+3h here), but the offset is
    the same on each, so it cancels in the subtraction — this is one of the few
    places that needs no tz conversion (pylego/broker/clock.py bites on ABSOLUTE
    times, not elapsed ones). Missing/backwards stamps give "—", never a lie."""
    try:
        secs = int(t1) - int(t0)
    except (TypeError, ValueError):
        return "—"
    if secs < 0:
        return "—"
    mins = secs // 60
    if mins < 1:
        return "<1m"
    h, m = divmod(mins, 60)
    if h >= 24:
        d, h = divmod(h, 24)
        return f"{d}d {h}h"
    return f"{h}h {m:02d}m" if h else f"{m}m"


def close_alert_text(instr: str, row: dict, paper: bool) -> str:
    """The close alert that threads under its entry alert: which barrier ended the
    trade, how long it was held, and what it made or lost. Pure — unit-testable.

    P&L is NET. MT5 reports the deal profit, the swap and the commission as three
    separate fields, and on a multi-day hold the swap can eat a real slice of a
    small win — so the headline number adds them up, and the gross/swap/commission
    breakdown rides along whenever either of the two is non-zero. The mode comes
    from the position's own comment tag (``OI [maxpain_buy_7701.5]``), which is the
    only durable record of which zone opened it once the plan has rolled."""
    key = instr.lower()
    name = instr.upper()
    icon = _OI_ICON.get(key, "💱")
    tv = _OI_TV.get(key, f"OANDA:{name.replace('/', '')}")
    link = f'<a href="https://www.tradingview.com/chart/?symbol={tv}">{name}</a>'
    reason = str(row.get("reason") or "").lower()
    head = ("🎯 <b>TP HIT</b>" if reason == "tp"
            else "🛑 <b>SL HIT</b>" if reason == "sl"
            else "⚪ <b>CLOSED</b>")
    tag = "📄 Paper" if paper else "🔴 LIVE"
    pid = row.get("position_id")
    tail = f"  ·  🎟 {pid}" if pid else ""
    mode = (position_mode(row.get("comment")) or "").upper()
    side = str(row.get("direction") or "").upper()
    op, cp = row.get("open_price"), row.get("close_price")
    moved = _pips(instr, op, cp)
    move_tail = f"  <i>({moved})</i>" if moved else ""
    gross = float(row.get("profit") or 0.0)
    swap = float(row.get("swap") or 0.0)
    comm = float(row.get("commission") or 0.0)
    net = round(gross + swap + comm, 2)
    verdict = "🟢" if net > 0 else "🔴" if net < 0 else "⚪"
    extras = [f"{lbl} {v:+.2f}" for lbl, v in (("swap", swap), ("comm", comm)) if v]
    pnl_tail = f"  <i>({gross:+.2f} gross · {' · '.join(extras)})</i>" if extras else ""
    head_line = "  ·  ".join(x for x in (side, mode) if x)

    return (
        f"{head}  ·  {tag}{tail}\n"
        f"{icon} <b>{link}</b>{('  ·  ' + head_line) if head_line else ''}\n"
        f"➖➖➖➖➖\n"
        f"📍 <code>{_fmt_price(instr, op)}</code> → <code>{_fmt_price(instr, cp)}</code>{move_tail}\n"
        f"⏱ Held   {_fmt_duration(row.get('time_open'), row.get('time_close'))}\n"
        f"{verdict} P&L    <b>{net:+.2f}</b>{pnl_tail}"
    )


def entry_alert_text(instr: str, spec: dict, lots: float, tid, paper: bool) -> str:
    """A tidy one-message summary of the trade about to open: instrument (icon +
    chart link), direction (with arrow), entry, SL, TP (+ distance / R:R), size,
    and WHY (the plan's rationale). Pure — unit-testable."""
    key = instr.lower()
    name = instr.upper()
    icon = _OI_ICON.get(key, "💱")
    tv = _OI_TV.get(key, f"OANDA:{name.replace('/', '')}")
    link = f'<a href="https://www.tradingview.com/chart/?symbol={tv}">{name}</a>'
    mode = (spec.get("mode") or "").upper()
    regime = spec.get("regime") or ""
    up = spec.get("dir_up")
    side = ("🟢 ▲ <b>BUY</b>" if up else "🔴 ▼ <b>SELL</b>")

    entry, sl, tp = spec.get("entry"), spec.get("sl"), spec.get("tp")
    sl_d = _pips(instr, entry, sl)
    sl_tail = f"  <i>({sl_d})</i>" if sl_d else ""
    rr = ""
    if tp and sl is not None and entry is not None and abs(entry - sl) > 0:
        rr = f"  <i>({abs(tp - entry) / abs(entry - sl):.2f}R)</i>"
    tag = "📄 Paper" if paper else "🔴 LIVE"
    tail = f"  ·  🎟 {tid}" if tid not in (None, -1) else ""

    return (
        f"🧲 <b>OI Gamma</b>  ·  {tag}{tail}\n"
        f"{icon} <b>{link}</b>{('  ·  ' + regime) if regime else ''}\n"
        f"{side}  ·  {mode}\n"
        f"➖➖➖➖➖\n"
        f"📍 Entry  <code>{_fmt_price(instr, entry)}</code>\n"
        f"🛑 SL     <code>{_fmt_price(instr, sl)}</code>{sl_tail}\n"
        f"🎯 TP     <code>{_fmt_price(instr, tp) if tp else '—'}</code>{rr}\n"
        f"📊 Size   {spec.get('size_factor', 1)}× · {lots} lots\n"
        f"➖➖➖➖➖\n"
        f"💡 <i>{spec.get('rationale') or regime}</i>"
    )


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


def size_for(pair: str, balance: float, risk_pct: float, sl_dist: float,
             max_lot: float, size_factor: float = 1.0) -> float:
    """Risk-based lots, then scaled by the plan's wall-strength/concentration
    ``sizeFactor`` and re-clamped to [0.01, max_lot]."""
    try:
        pip = I.pip_size(pair); pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    lots = position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)
    lots = lots * max(size_factor, 0.0)
    return round(min(max(lots, 0.01), max_lot), 2)


def _plan_instruments(plan: dict) -> dict:
    return ((plan or {}).get("instruments")) or {}


def _plan_age_hours(plan: dict, now_epoch: float) -> float | None:
    """Hours since the plan's generatedAt (None when unparseable — treated as
    fresh so a malformed stamp doesn't halt trading; the producer stamps ISO)."""
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


def _oi_age_hours(spec: dict, now_epoch: float) -> float | None:
    """Hours since the OI chain behind this instrument was pasted.

    The plan-age gate above answers "when did the PLANNER last run", which is not
    the same question. The producer re-plans every 10 minutes from whatever sits in
    oi_store, so a chain pasted last week yields a plan stamped minutes ago — fresh
    by generatedAt, trading a dead book. `oiSavedAtMs` is the paste time the producer
    now ships per instrument (pairs are pasted individually, so this is per-pair).

    None when the producer didn't stamp it (an older plan shape) — treated as fresh,
    same convention as _plan_age_hours: a missing stamp must not halt trading.
    """
    ts = (spec or {}).get("oiSavedAtMs")
    if not isinstance(ts, (int, float)) or ts <= 0:
        return None
    return max(0.0, (now_epoch - (ts / 1000.0)) / 3600.0)


def _position_risk_pct(pair: str, lots: float, entry: float, sl: float, balance: float) -> float:
    """A position's risk-to-SL as % of balance (the sizing formula, inverted)."""
    if not balance or sl is None or entry is None:
        return 0.0
    try:
        pip = I.pip_size(pair); pv = PV.point_value(pair)
    except Exception:
        pip, pv = 0.0001, 10.0
    sl_pips = abs(float(entry) - float(sl)) / pip
    return (sl_pips * pv * float(lots)) / balance * 100.0


def _instr_lines(plan, sessions):
    """Per-instrument snapshot for the config/zones page: the plan's regime, spot,
    max pain, the planned zones + which have already fired."""
    out = []
    for instr, slice_ in _plan_instruments(plan).items():
        sess = sessions.get(instr)
        out.append({
            "instrument": instr,
            "regime": slice_.get("regime"),
            "spot": slice_.get("spot"),
            "maxPain": slice_.get("maxPain"),
            "zoneCount": slice_.get("zoneCount", len(slice_.get("zones", []))),
            "entered": sorted(sess.entered) if sess else [],
            # Primed = zones the bot deliberately skipped because price had already
            # passed their entry when the plan armed. Each carries when (`at`) + the
            # price + how far past the entry (`past`) so the page can say WHY nothing
            # traded, and whether it was primed on the level or after price left it.
            "primed": [dict(zone_id=zid, **rec) for zid, rec in sorted(sess.primed.items())] if sess else [],
            # The OI chain's own age, alongside the plan's. Two clocks, both shown: a
            # blocked instrument should be legible on the page, not only in the log.
            # None when the producer didn't stamp a paste time (older plan shape).
            "oiAgeH": (lambda a: round(a, 1) if a is not None else None)(_oi_age_hours(slice_, time.time())),
        })
    return out


def build_status(cfg, broker, plan, paper, sessions, closed=None):
    bal = broker.account_balance()
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "balance": round(bal, 2) if bal is not None else None,
        "strategy": (plan or {}).get("strategy", "oi-bot"),
        "generatedAt": (plan or {}).get("generatedAt"),
        "universe": list(_plan_instruments(plan).keys()),
        "mt5_positions": broker.serialize_open_positions(),
        # `closed` lets the caller hand over the list its close-alert scan already
        # pulled (one history query per cycle instead of two). None = fetch it here,
        # which is also the fallback when that scan FAILED: a transient error must
        # not publish an empty today_closed_trades over a real one.
        "today_closed_trades": broker.serialize_closed_trades() if closed is None else closed,
        "lines": _instr_lines(plan, sessions or {}),
    }


def run(base_url: str, force_live: bool) -> None:
    kv = KvClient(base_url)
    try:
        cfg = _deep_merge(DEFAULT_CFG, kv.get_json("oi_bot_config") or {})
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
            creds = kv.get_json("oi_bot_credentials") or {}
        except Exception as e:
            log.error(f"could not reach dashboard to read credentials: {e} — exiting")
            return
        if not creds.get("mt5_account"):
            log.error("live mode but no mt5_account in oi_bot_credentials — refusing to start. "
                      "Save MT5 credentials on the bot config page first.")
            return
        if not broker.connect(creds.get("mt5_account"), creds.get("mt5_password"),
                              creds.get("mt5_server"), creds.get("mt5_path") or None):
            log.error("broker connect failed — exiting")
            return

    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}
    tg_creds = _load_tg(cfg, kv)                 # refreshed each config cycle

    sessions: dict[str, OISession] = {}
    reject_until: dict[str, float] = {}          # zone_id → epoch to retry after (anti-spam)
    stack_skips: dict[str, int] = {}             # zone_id → conflicting ticket (once-per-change logging)
    budget_skips: dict[str, bool] = {}           # zone_id → deferred-by-risk-budget (once-per-change logging)
    anchor_warned: set[str] = set()              # zone_id → already warned that its stop is plan-anchored
    group_skips: dict[str, bool] = {}            # zone_id → deferred-by-group-cap (once-per-change logging)
    warned_missing: dict[str, bool] = {}         # enabled_pairs entries absent from the plan (warn once)
    runners: dict[int, dict] = {}                # scale-out runner ticket → {pair, be, partner} (BE-at-TP1 watch)
    plan = None
    last_plan = last_status = 0.0
    plan_age_blocked = False                     # plan-age gate state (log transitions once)
    oi_stale_blocked: dict[str, bool] = {}       # instrument → OI-chain-age gate state (log transitions once)
    # One-shot state that must survive a bot RESTART: without this, maxpain re-fires
    # immediately (it is exempt from priming by design) and a stopped-out zone re-arms
    # if price is still beyond its entry — an innocuous redeploy could double today's
    # trades. Persisted to KV per plan generatedAt; restored when the plan matches.
    features: dict[str, dict] = {}               # zone_id → entry-time feature stamp (hold-calibration inputs)
    risk_ledger: dict[int, float] = {}           # ticket → risk-to-SL % of balance at entry (portfolio budget)
    px_hist: dict[str, deque] = {}               # instrument → (epoch, px) samples (approach-velocity window)
    sym_class: dict[str, str] = {}               # broker-symbol spelling → asset class (correlated-group cap)
    sym_key: dict[str, str] = {}                 # broker-symbol spelling → canonical key (time exits / closes)
    tg_entry_msgid: dict[int, int] = {}          # ticket → its entry alert's Telegram message_id (close alert replies to it)
    tg_closed_alerted: set[int] = set()          # position_ids already closed-alerted (the scan re-sees today's closes)
    tg_close_seeded = False                      # first scan of a run seeds silently — see the scan
    try:
        saved_state = kv.get_json("oi_bot_state") or {}
    except Exception:
        saved_state = {}
    if isinstance(saved_state.get("features"), dict):
        features.update(saved_state["features"])
    for k, v in (saved_state.get("risk_ledger") or {}).items():
        try:
            risk_ledger[int(k)] = float(v)
        except (TypeError, ValueError):
            pass
    # Scale-out runners survive a restart too: without this, a bot bounce while a
    # TP1/TP2 pair was open silently dropped the break-even upgrade (positions and
    # brackets were safe; only the BE-at-TP1 move was lost). Stale tickets are
    # pruned by the runner watch the moment they're not in the open book.
    for k, v in (saved_state.get("runners") or {}).items():
        try:
            if isinstance(v, dict) and v.get("pair"):
                runners[int(k)] = v
        except (TypeError, ValueError):
            pass
    # Telegram threading survives a restart too: without this a bot bounce between
    # an entry and its close orphans the close alert (still sent, just not threaded),
    # and — worse — an empty alerted-set would re-announce every trade closed so far
    # today. The seed below is the belt to this braces.
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
            kv.put_json("oi_bot_state", {
                "generatedAt": (plan or {}).get("generatedAt"),
                "entered": {i: sorted(s.entered) for i, s in sessions.items()},
                "features": features,
                "risk_ledger": {str(k): v for k, v in risk_ledger.items()},
                "runners": {str(k): v for k, v in runners.items()},
                # Bounded: ids only ever grow, so the newest N are the ones that can
                # still match a live trade. entry_msgid is popped on close anyway —
                # this only caps the leak from a position that closes outside the
                # history window and never gets claimed.
                "tg_entry_msgid": {str(k): v for k, v in sorted(tg_entry_msgid.items())[-500:]},
                "tg_closed_alerted": sorted(tg_closed_alerted)[-500:],
            })
        except Exception as e:
            log.warning(f"one-shot state save failed: {e} (restart double-entry protection degraded)")
    event_windows = None                    # KV event_windows_v1 payload (or None)
    event_ccys: dict[str, list[str]] = {}   # instrument → event currencies (cached)
    ev_blocks: dict[str, str | None] = {}   # once-per-state-change blackout logging
    warned_events = False                   # log loud, but once per outage

    def _sync_sessions(new_plan) -> None:
        """Adopt a plan: build a session per instrument (preserving one-shot state
        for instruments already present), drop instruments the plan no longer has,
        and PRIME any zone price has already passed (dry_run) so we never
        retro-enter an overnight crossing. Restores KV-persisted `entered` state
        when the plan's generatedAt matches (restart double-entry protection), and
        rebuilds the broker-symbol → asset-class map for the correlated-group cap."""
        instrs = _plan_instruments(new_plan)
        restore = (saved_state.get("entered") or {}) \
            if saved_state.get("generatedAt") == (new_plan or {}).get("generatedAt") else {}
        sym_class.clear()
        for instr, slice_ in instrs.items():
            zones = slice_.get("zones", [])
            spot = slice_.get("spot")
            if instr in sessions:
                sessions[instr].set_zones(spot, zones)
            else:
                sessions[instr] = OISession(instr, spot, zones)
                for zid in restore.get(instr, []):
                    sessions[instr].mark_entered(zid)
                if restore.get(instr):
                    log.info(f"restored {len(restore[instr])} entered zone(s) for {instr} "
                             f"from persisted state (restart protection)")
            try:
                cls = I.asset_class(instr)
                for s in {instr, instr.upper(), _broker_sym(instr), _broker_sym(instr).upper()}:
                    sym_class[s] = cls
                    sym_key[s] = instr
            except Exception:
                pass
            # Prime: mark zones already triggered at the current price (best-effort).
            # Log each NEWLY primed zone with the price + how far past the entry price
            # already was — so a later "hit but no trade" is legible (priming was silent
            # before, the #1 "why didn't it trade" confusion).
            try:
                px0 = (quotes.price(instr) if quotes is not None else broker.price(instr))
                if px0 is not None:
                    _before = set(sessions[instr].primed)
                    sessions[instr].decide(px0, dry_run=True, tol=_tol(cfg, instr), now=time.time())
                    for _zid in sorted(set(sessions[instr].primed) - _before):
                        _r = sessions[instr].primed[_zid]
                        log.info(f"PRIMED {instr} {_zid} @ {_r['price']} — price already {_r['past']} past "
                                 f"entry {_r['entry']} when the plan armed (skip: not chasing a stale break)")
            except Exception:
                pass
        for instr in list(sessions):
            if instr not in instrs:
                del sessions[instr]

    while True:
        nowt = time.time()

        # (a) Plan — slow pull. Only re-sync on a genuinely new plan (generatedAt),
        # preserving one-shot state so an intraday restamp can't double-enter.
        if nowt - last_plan >= cfg.get("plan_secs", 600) or plan is None:
            try:
                new_plan = kv.get_json("oi_bot_zones")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} — keeping current plan")
                new_plan = None
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                _sync_sessions(plan)
                log.info(f"new OI plan loaded · {plan.get('generatedAt')} · "
                         f"{len(_plan_instruments(plan))} instruments")
            last_plan = nowt

        # (b) Config + status — medium.
        if nowt - last_status >= cfg.get("status_secs", 30):
            try:
                cfg = _deep_merge(DEFAULT_CFG, kv.get_json("oi_bot_config") or cfg)
                _apply_broker_symbols(cfg)
                _apply_paper_spreads(broker, cfg)
                guard.sync_cfg(cfg)
                tg_creds = _load_tg(cfg, kv)       # pick up TG edits live
            except Exception as e:
                log.warning(f"config fetch failed: {e}")
            # Event-blackout windows (server publishes hourly). FAIL-OPEN on
            # missing/stale — it's a suppression gate — but say so loudly, once
            # per outage (mirrors volatility_bot).
            try:
                event_windows = kv.get_json("event_windows_v1")
            except Exception as e:
                log.warning(f"event windows fetch failed: {e} — keeping current windows")
            sr = EV.stale_reason(event_windows, nowt * 1000)
            if sr and not warned_events:
                log.warning(f"EVENT GATE INACTIVE (fail-open): {sr} — entries will NOT be "
                            "suppressed around high-impact events until this recovers")
                warned_events = True
            elif not sr and warned_events:
                log.info("event gate active again — blackout windows fresh")
                warned_events = False
            # ── Close alerts — "closed" threaded under the entry that opened it ──
            # serialize_closed_trades() re-returns TODAY's closes on every scan, so
            # the alerted set is what makes this fire once per trade; it is persisted
            # so a restart doesn't re-announce the morning. The FIRST scan of a run
            # seeds that set silently: anything already closed when this process came
            # up was either alerted by the previous one or predates the feature, and
            # neither is news worth pushing to a phone at 3am after a redeploy.
            try:
                closed_now = broker.serialize_closed_trades()
            except Exception as e:
                closed_now = None                  # scan failed — build_status re-fetches (never publish a false empty)
                log.warning(f"closed-trade scan failed: {e} — close alerts skipped this cycle")
            tg_dirty = False
            for c in (closed_now or []):
                pid = c.get("position_id")
                if pid is None or pid in tg_closed_alerted:
                    continue
                tg_closed_alerted.add(pid)
                tg_dirty = True
                if not tg_close_seeded or not cfg.get("tg_enabled"):
                    continue
                ckey = sym_key.get(c.get("symbol")) or str(c.get("symbol") or "").lower()
                # reply_to is the entry alert's id when we still have it (we opened
                # this trade, and MT5 kept the order ticket as the position id — the
                # usual case for a market fill). Missing → the alert still goes, just
                # unthreaded: an orphaned close beats a silent one.
                send_telegram(tg_creds[0], tg_creds[1], close_alert_text(ckey, c, paper),
                              reply_to=tg_entry_msgid.pop(pid, None))
                log.info(f"CLOSE ALERT {ckey} {c.get('comment') or ''} "
                         f"{c.get('reason') or 'closed'} P&L "
                         f"{round(float(c.get('profit') or 0) + float(c.get('swap') or 0) + float(c.get('commission') or 0), 2):+.2f}")
            if not tg_close_seeded and closed_now is not None:
                log.info(f"close-alert scan primed — {len(tg_closed_alerted)} trade(s) already closed today "
                         f"will not be re-announced")
                tg_close_seeded = True
            if tg_dirty:
                _save_state()
            try:
                status = build_status(cfg, broker, plan, paper, sessions, closed_now)
                # Feature stamps ride the status so the server's trade-log rollup can
                # join them onto resolved trades (hold-calibration inputs). Bounded.
                if len(features) > 300:
                    for zid in sorted(features, key=lambda z: features[z].get("ts", 0))[:len(features) - 300]:
                        features.pop(zid, None)
                status["zone_features"] = features
                kv.put_status("oi_bot_status", status)
            except Exception as e:
                log.warning(f"status push failed: {e}")
            # NOTE: oi_bot_state is deliberately NOT saved here — it is durable CF KV
            # (quota ~1000 writes/day) and only changes on a fill, where it IS saved.
            last_status = nowt

        # (c) Tight loop: feed quotes, run barriers, take entries.
        if plan and not cfg.get("kill_switch"):
            instruments = cfg.get("enabled_pairs") or list(_plan_instruments(plan).keys())
            if quotes is not None:
                for instr in instruments:
                    q = quotes.price(instr)
                    if q is not None:
                        broker.set_price(instr, q)
            if hasattr(broker, "check_barriers"):
                broker.check_barriers()             # paper: execute the bracketed SL/TP
            # ── Open-book maintenance: runner BE watch + time-based exits ─────────
            _mh = cfg.get("max_hold_hours") or {}
            _mh_on = any(float(v or 0) > 0 for v in _mh.values()) if isinstance(_mh, dict) else False
            if runners or _mh_on:
                _book = broker.serialize_open_positions()
                _open_tk = {p.get("ticket") for p in _book}
                # Scale-out runner watch: once the TP1 leg has closed, move the
                # runner's stop to break-even (its entry). Both legs share the SL, so
                # a stop-out closes both and there is nothing to move — this only
                # acts on a TP1 bank. Runner changes are persisted (restart-safe).
                _runners_dirty = False
                for _tb in list(runners):
                    r = runners[_tb]
                    if _tb not in _open_tk:
                        runners.pop(_tb, None)          # runner itself is gone
                        _runners_dirty = True
                        continue
                    if r["partner"] not in _open_tk:
                        try:
                            if hasattr(broker, "modify") and broker.modify(_tb, r["pair"], sl=r["be"], paper_mode=paper):
                                log.info(f"SCALE-OUT [{r['pair']}]: TP1 leg closed → runner {_tb} "
                                         f"stop moved to break-even {r['be']}")
                        except Exception as e:
                            log.warning(f"SCALE-OUT [{r['pair']}]: BE move failed for {_tb}: {e}")
                        runners.pop(_tb, None)
                        _runners_dirty = True
                # Time-based exits: the mechanism each mode trades EXPIRES (pin/charm
                # is a ≤2-DTE effect; a faded wall's book rolls off), so a position
                # that hits neither barrier must not sit as an orphan. Mode is parsed
                # from the position's own comment tag — survives plan rolls/restarts.
                # MT5 stamps time_open on the broker clock; tz_offset_sec restores UTC.
                if _mh_on:
                    for p in _book:
                        mode = position_mode(p.get("comment"))
                        cap_h = float((_mh.get(mode) if mode else 0) or 0)
                        t0 = p.get("time_open")
                        if not mode or cap_h <= 0 or not t0:
                            continue
                        held_h = (nowt - (float(t0) - float(p.get("tz_offset_sec") or 0))) / 3600.0
                        if held_h <= cap_h:
                            continue
                        key = sym_key.get(p.get("symbol")) or str(p.get("symbol", "")).lower()
                        try:
                            if broker.stop(p["ticket"], key, paper, reason="time"):
                                log.info(f"TIME EXIT [{key}] ticket {p['ticket']} ({mode}) held "
                                         f"{held_h:.1f}h > {cap_h:g}h cap — closed at market "
                                         f"(the {mode} mechanism has expired)")
                                if runners.pop(p["ticket"], None) is not None:
                                    _runners_dirty = True
                        except Exception as e:
                            log.warning(f"TIME EXIT [{key}] close failed for {p.get('ticket')}: {e}")
                if _runners_dirty:
                    _save_state()
            bal = broker.account_balance() or 0.0
            if bal:
                guard.update_balance(bal)
            guard_bal = bal if bal else 1_000_000.0
            # Usable blackout payload this tick (None when missing/stale → fail open).
            ev_payload = None if EV.stale_reason(event_windows, nowt * 1000) else event_windows
            # Plan-age gate (fail-CLOSED): the plan IS the strategy and OI is a daily
            # artifact — a server outage must not leave the bot trading Friday's walls
            # into Tuesday. New entries only; the broker-enforced SL/TP keep running.
            age = _plan_age_hours(plan, nowt)
            max_age = float(cfg.get("plan_max_age_hours", 24) or 0)
            age_block = bool(max_age > 0 and age is not None and age > max_age)
            if age_block != plan_age_blocked:
                plan_age_blocked = age_block
                if age_block:
                    log.warning(f"PLAN-AGE GATE: plan is {age:.1f}h old (> {max_age}h) — NEW entries "
                                f"blocked until a fresh plan lands (fail-closed). Brackets keep running.")
                else:
                    log.info("PLAN-AGE GATE: fresh plan — entries resumed")

            for instr in instruments:
                sess = sessions.get(instr)
                if sess is None:
                    # A typo'd enabled_pairs entry previously skipped SILENTLY, forever.
                    if instr not in _plan_instruments(plan) and not warned_missing.get(instr):
                        warned_missing[instr] = True
                        log.warning(f"enabled pair {instr!r} is not in the plan — it will never trade "
                                    f"(typo in enabled_pairs, or outside the plan universe?)")
                    continue
                px = quotes.price(instr) if quotes is not None else broker.price(instr)
                if px is None:
                    continue
                # Approach-velocity sample window (used to trim fades hit by a fast impulse).
                hist = px_hist.setdefault(instr, deque(maxlen=600))
                hist.append((nowt, px))
                if plan_age_blocked:
                    continue
                # OI-CHAIN age gate (fail-CLOSED, per instrument). The plan-age gate above
                # only proves the producer ran; it re-plans every 10 min from oi_store, so a
                # forgotten paste yields a fresh plan over a dead chain. Per-instrument
                # because pairs are pasted separately — a stale gold paste must not stop NQ.
                # A missing stamp (older plan shape) reads as fresh, matching _plan_age_hours.
                oi_max_age = float(cfg.get("oi_max_age_hours", 30) or 0)
                oi_age = _oi_age_hours(_plan_instruments(plan).get(instr) or {}, nowt)
                oi_block = bool(oi_max_age > 0 and oi_age is not None and oi_age > oi_max_age)
                if oi_block != oi_stale_blocked.get(instr, False):
                    oi_stale_blocked[instr] = oi_block
                    if oi_block:
                        log.warning(f"OI-CHAIN GATE {instr}: the pasted chain is {oi_age:.1f}h old "
                                    f"(> {oi_max_age}h) — NEW entries blocked until it is re-pasted. "
                                    f"The plan itself is fresh; the OI under it is not. Brackets keep running.")
                    else:
                        log.info(f"OI-CHAIN GATE {instr}: chain re-pasted ({oi_age:.1f}h old) — entries resumed"
                                 if oi_age is not None else f"OI-CHAIN GATE {instr}: entries resumed")
                if oi_block:
                    continue
                if not broker.tradable(instr):
                    continue
                open_book = broker.serialize_open_positions()
                if len(open_book) >= cfg.get("max_open", 12):
                    continue
                # Portfolio risk ledger: drop tickets whose positions have closed —
                # their risk is realized (or banked), not open.
                open_tickets = {p.get("ticket") for p in open_book}
                for t in [t for t in risk_ledger if t not in open_tickets]:
                    risk_ledger.pop(t, None)
                guard_why = guard.block_reason(guard_bal, instr)
                log_block_transition(log, guard_blocks, instr, guard_why)
                if guard_why:
                    continue
                # Event blackout: DEFER new entries (skip decide — zones aren't
                # burned; a zone still triggered re-fires on the first clear tick
                # after the window). The broker-enforced SL/TP above always run.
                if ev_payload:
                    ccys = event_ccys.get(instr)
                    if ccys is None:
                        ccys = event_ccys[instr] = _pair_event_ccys(instr)
                    hit, ev_why = EV.blackout(ccys, nowt * 1000, ev_payload.get("windows"))
                    ev_why = f"event blackout: {ev_why}" if hit else None
                    if ev_why != ev_blocks.get(instr):
                        ev_blocks[instr] = ev_why
                        if ev_why:
                            log.warning(f"EVENT GATE [{instr}]: NEW entries deferred — {ev_why}")
                        else:
                            log.info(f"EVENT GATE [{instr}]: clear — entries resumed")
                    if ev_why:
                        continue
                # Stack guard: this bot's live book, once per instrument-tick. The
                # broker keys positions by canonical (paper) OR venue symbol (MT5),
                # so match on both spellings. New fills below are appended in-loop so
                # two zones firing on the SAME tick can't both slip through.
                stack_on = bool(cfg.get("stack_guard", True))
                sym_set = {instr, instr.upper(), _broker_sym(instr), _broker_sym(instr).upper()}
                stack_d = _stack_dist(cfg, instr)
                # Approach velocity: how far price travelled within the window vs the
                # plan's refMove for this instrument. A fast impulse INTO a level tends
                # to consume it — fades get trimmed below; breaks are left alone.
                fast_approach = False
                ref_move = (_plan_instruments(plan).get(instr) or {}).get("refMove")
                a_win = float(cfg.get("approach_window_secs", 120) or 0)
                if ref_move and a_win > 0:
                    then_px = None
                    for t0, p0 in hist:
                        if nowt - t0 <= a_win:
                            then_px = p0               # oldest sample inside the window
                            break
                    if then_px is not None and abs(px - then_px) > float(cfg.get("approach_fast_frac", 0.5) or 0.5) * float(ref_move):
                        fast_approach = True
                for spec in sess.decide(px, tol=_tol(cfg, instr),
                                        break_confirm=int(cfg.get("break_hold_ticks", 2) or 0)):
                    if spec["sl"] is None:
                        continue
                    zid = spec["zone_id"]
                    # A max-pain stop is re-anchored to live price by the engine (its
                    # planned one is derived from the OI capture's spot and goes stale
                    # over the session). The fallback to the plan's absolute is silent by
                    # construction — say it out loud, once per zone, so a planner that
                    # stops shipping the ingredients shows up here instead of quietly
                    # trading hours-old stops again.
                    if spec["mode"] == "maxpain" and spec.get("sl_anchor") != "live" and zid not in anchor_warned:
                        anchor_warned.add(zid)
                        log.warning(f"{instr} {zid}: stop {spec['sl']} is PLAN-anchored (the plan shipped no "
                                    f"slFrac/slGuardWall/slFloor) — it was computed from the OI capture's "
                                    f"spot and may be stale against live {px}")
                    if reject_until.get(zid, 0) > nowt:
                        continue                       # in reject cooldown — don't hammer the broker
                    # Correlated-group cap: the four indices are one macro bet — cap
                    # same-direction positions per asset class. Defer, don't burn.
                    cls = sym_class.get(instr)
                    gcap = (cfg.get("max_group_positions") or {}).get(cls)
                    if cls and gcap is not None:
                        want = "BUY" if spec["dir_up"] else "SELL"
                        n_same = sum(1 for p in open_book
                                     if sym_class.get(p.get("symbol")) == cls and p.get("direction") == want)
                        if n_same >= int(gcap):
                            if not group_skips.get(zid):
                                group_skips[zid] = True
                                log.info(f"GROUP CAP [{instr}] {zid} deferred — already {n_same} "
                                         f"same-direction {cls} position(s) (cap {gcap}); correlated = one bet")
                            continue
                    group_skips.pop(zid, None)
                    # Refuse a redundant same-direction stack near an open position
                    # (one bet, not two). Defer, don't burn: the zone re-fires once
                    # the conflicting position is gone. Log once per (zone → ticket).
                    if stack_on:
                        conflict = stack_conflict(sym_set, spec["dir_up"], spec["entry"],
                                                  open_book, stack_d)
                        if conflict is not None:
                            ctk = conflict.get("ticket")
                            if stack_skips.get(zid) != ctk:
                                stack_skips[zid] = ctk
                                log.info(f"STACK GUARD [{instr}] {zid} deferred — already "
                                         f"{'LONG' if spec['dir_up'] else 'SHORT'} @ "
                                         f"{conflict.get('open_price')} (ticket {ctk}) within "
                                         f"{cfg.get('stack_guard_pips', 10)}p; would be one bet")
                            continue
                    exp_px = expected_fill(spec["entry"], spec["dir_up"], instr, broker)
                    # Fast approach into a fade/react level → trim (the impulse tends to
                    # consume the level). Breaks keep full size — momentum favours them.
                    size_mult = spec["size_factor"]
                    if fast_approach and spec["mode"] in ("fade", "react"):
                        size_mult = round(size_mult * float(cfg.get("approach_trim", 0.7) or 1.0), 2)
                        log.info(f"APPROACH [{instr}] {zid}: fast approach into the level — "
                                 f"size {spec['size_factor']}× → {size_mult}×")
                    lots = size_for(instr, bal, cfg.get("risk_pct", 0.5), exp_px - spec["sl"],
                                    cfg.get("max_lot", 2.0), size_mult)
                    # Portfolio risk budget: sum of open risk-to-SL must stay under the
                    # cap AFTER this entry. Defer, don't burn — the zone re-fires when
                    # risk is freed (a position closes). max_open stays as the coarse
                    # backstop; this is the actual budget.
                    risk_cap = float(cfg.get("max_open_risk_pct", 0) or 0)
                    cand_risk = _position_risk_pct(instr, lots, exp_px, spec["sl"], bal) if bal else 0.0
                    if risk_cap > 0 and bal:
                        open_risk = sum(risk_ledger.get(t, 0.0) for t in
                                        ({p.get("ticket") for p in open_book} & set(risk_ledger)))
                        if open_risk + cand_risk > risk_cap:
                            if not budget_skips.get(zid):
                                budget_skips[zid] = True
                                log.info(f"RISK BUDGET [{instr}] {zid} deferred — open risk "
                                         f"{open_risk:.2f}% + candidate {cand_risk:.2f}% > cap {risk_cap}%")
                            continue
                    budget_skips.pop(zid, None)
                    direction = "LONG" if spec["dir_up"] else "SHORT"
                    # Short ASCII comment carrying the dedup tag ([zone_id]); the full
                    # rationale rides the Telegram alert + positions tab, not the MT5
                    # comment (which is capped at 31 ASCII chars).
                    # Scale-out (opt-in): with both TP1 and TP2 planned and enough size
                    # to split, bank half at TP1 and let a runner ride to TP2 (BE move
                    # handled by the runner watch above). Falls back to the classic
                    # single bracket when either half would round below 0.01 lots.
                    scale = (bool(cfg.get("scale_out", False)) and spec.get("tp2")
                             and spec["tp"] and lots >= 0.02)
                    tid = tid2 = None
                    if scale:
                        half = max(0.01, round(lots / 2, 2))
                        rest = round(lots - half, 2)
                        if rest >= 0.01:
                            tid = broker.enter(instr, direction, spec["sl"], spec["tp"], half,
                                               max_spread(instr, cfg), paper,
                                               comment=f"OI [{zid}]", dedupe_tag=zid)
                            if tid is not None and tid != -1:
                                tid2 = broker.enter(instr, direction, spec["sl"], spec["tp2"], rest,
                                                    max_spread(instr, cfg), paper,
                                                    comment=f"OI [{zid}~r]", dedupe_tag=f"{zid}~r")
                                if tid2 is not None and tid2 != -1:
                                    if cfg.get("be_at_tp1", True):
                                        runners[tid2] = {"pair": instr, "be": exp_px, "partner": tid}
                                    log.info(f"SCALE-OUT [{instr}] {zid}: {half} lots → TP1 {spec['tp']}, "
                                             f"{rest} lots runner → TP2 {spec['tp2']}")
                                else:
                                    log.warning(f"SCALE-OUT [{instr}] {zid}: runner leg rejected — "
                                                f"continuing with the TP1 leg only")
                        else:
                            scale = False
                    if not scale:
                        tid = broker.enter(instr, direction, spec["sl"], spec["tp"], lots,
                                           max_spread(instr, cfg), paper,
                                           comment=f"OI [{zid}]",
                                           dedupe_tag=zid)
                    filled = tid is not None and tid != -1
                    if filled:
                        guard.record_trade(instr)
                        sess.mark_entered(zid)
                        reject_until.pop(zid, None)
                        stack_skips.pop(zid, None)
                        # Reflect this fill so a second same-tick zone sees it — the
                        # stack guard, group cap and risk budget all read open_book
                        # (paper's book updates immediately; MT5's may lag a tick).
                        open_book.append({"symbol": _broker_sym(instr), "direction":
                                          ("BUY" if spec["dir_up"] else "SELL"),
                                          "open_price": exp_px, "ticket": tid})
                        if tid2 is not None and tid2 != -1:
                            open_book.append({"symbol": _broker_sym(instr), "direction":
                                              ("BUY" if spec["dir_up"] else "SELL"),
                                              "open_price": exp_px, "ticket": tid2})
                            risk_ledger[tid] = risk_ledger[tid2] = round(cand_risk / 2, 4)
                        else:
                            risk_ledger[tid] = cand_risk
                        # Entry-time feature stamp: what the plan/tape knew when this
                        # trade was taken. Joined onto the resolved trade by the server
                        # rollup → the hold-score calibration's training rows.
                        features[zid] = {
                            "ticket": tid, "instrument": instr, "mode": spec["mode"],
                            "side": spec["side"], "regime": spec.get("regime"),
                            "hold": spec.get("hold"), "holdParts": spec.get("hold_parts"),
                            "conviction": spec.get("conviction"),
                            "size_factor": spec["size_factor"], "sized_at": size_mult,
                            "approach_fast": bool(fast_approach),
                            "touches": sess.touches.get(zid, 0),
                            "entry": spec["entry"], "sl": spec["sl"], "tp": spec["tp"],
                            "risk_pct": round(cand_risk, 3), "ts": int(nowt),
                        }
                        _save_state()                  # restart protection: persist the one-shot
                        hold_note = f", hold {spec['hold']}" if spec.get("hold") is not None else ""
                        log.info(f"{'[PAPER] ' if paper else ''}{instr} {spec['mode'].upper()} "
                                 f"{direction} @~{spec['entry']} SL {spec['sl']} TP {spec['tp']} "
                                 f"→ ticket {tid} lots {lots} ({size_mult}×{hold_note})")
                        # Telegram entry alert — what/direction/SL/TP/why, on fill.
                        if cfg.get("tg_enabled"):
                            mid = send_telegram(tg_creds[0], tg_creds[1],
                                                entry_alert_text(instr, spec, lots, tid, paper))
                            # Remember the message this trade announced itself in so its
                            # close can reply to it. A scale-out's two legs share ONE entry
                            # alert, so both tickets point at the same message and each leg's
                            # close threads there. Persisted immediately: a restart between
                            # the entry and the close would otherwise orphan the reply.
                            if mid:
                                for t in (tid, tid2):
                                    if t not in (None, -1):
                                        tg_entry_msgid[t] = mid
                                _save_state()
                    else:
                        # Back off so a hard rejection (invalid volume, market closed,
                        # duplicate) doesn't re-fire every tick. Log once per cooldown.
                        first = reject_until.get(zid, 0) <= nowt
                        reject_until[zid] = nowt + REJECT_COOLDOWN_SECS
                        if first:
                            log.warning(f"{instr} {spec['mode']} {zid} entry REJECTED — "
                                        f"backing off {REJECT_COOLDOWN_SECS}s (zone kept open)")

        time.sleep(max(cfg.get("tick_secs", 3), 1))


def _tol(cfg: dict, instr: str) -> float:
    """Touch tolerance in PRICE units for an instrument (config is in pips)."""
    try:
        return float(cfg.get("touch_tol_pips", 2) or 0) * I.pip_size(instr)
    except Exception:
        return 0.0


def _stack_dist(cfg: dict, instr: str) -> float:
    """Stack-guard proximity in PRICE units for an instrument (config is in pips)."""
    try:
        return float(cfg.get("stack_guard_pips", 10) or 0) * I.pip_size(instr)
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser(description="MacroFX OI Gamma Bot")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
