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
from oi_bot.engine import OISession, stack_conflict          # noqa: E402

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
        })
    return out


def build_status(cfg, broker, plan, paper, sessions):
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
        "today_closed_trades": broker.serialize_closed_trades(),
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
    plan = None
    last_plan = last_status = 0.0
    event_windows = None                    # KV event_windows_v1 payload (or None)
    event_ccys: dict[str, list[str]] = {}   # instrument → event currencies (cached)
    ev_blocks: dict[str, str | None] = {}   # once-per-state-change blackout logging
    warned_events = False                   # log loud, but once per outage

    def _sync_sessions(new_plan) -> None:
        """Adopt a plan: build a session per instrument (preserving one-shot state
        for instruments already present), drop instruments the plan no longer has,
        and PRIME any zone price has already passed (dry_run) so we never
        retro-enter an overnight crossing."""
        instrs = _plan_instruments(new_plan)
        for instr, slice_ in instrs.items():
            zones = slice_.get("zones", [])
            spot = slice_.get("spot")
            if instr in sessions:
                sessions[instr].set_zones(spot, zones)
            else:
                sessions[instr] = OISession(instr, spot, zones)
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
            try:
                kv.put_status("oi_bot_status", build_status(cfg, broker, plan, paper, sessions))
            except Exception as e:
                log.warning(f"status push failed: {e}")
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
            bal = broker.account_balance() or 0.0
            if bal:
                guard.update_balance(bal)
            guard_bal = bal if bal else 1_000_000.0
            # Usable blackout payload this tick (None when missing/stale → fail open).
            ev_payload = None if EV.stale_reason(event_windows, nowt * 1000) else event_windows

            for instr in instruments:
                sess = sessions.get(instr)
                if sess is None:
                    continue
                px = quotes.price(instr) if quotes is not None else broker.price(instr)
                if px is None:
                    continue
                if not broker.tradable(instr):
                    continue
                if len(broker.serialize_open_positions()) >= cfg.get("max_open", 12):
                    continue
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
                open_book = broker.serialize_open_positions() if stack_on else []
                sym_set = {instr, instr.upper(), _broker_sym(instr), _broker_sym(instr).upper()}
                stack_d = _stack_dist(cfg, instr)
                for spec in sess.decide(px, tol=_tol(cfg, instr)):
                    if spec["sl"] is None:
                        continue
                    zid = spec["zone_id"]
                    if reject_until.get(zid, 0) > nowt:
                        continue                       # in reject cooldown — don't hammer the broker
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
                    lots = size_for(instr, bal, cfg.get("risk_pct", 0.5), exp_px - spec["sl"],
                                    cfg.get("max_lot", 2.0), spec["size_factor"])
                    direction = "LONG" if spec["dir_up"] else "SHORT"
                    # Short ASCII comment carrying the dedup tag ([zone_id]); the full
                    # rationale rides the Telegram alert + positions tab, not the MT5
                    # comment (which is capped at 31 ASCII chars).
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
                        # Reflect this fill so a second same-tick zone sees it and
                        # the stack guard blocks it (paper's book updates immediately;
                        # MT5's positions_get may lag a tick).
                        if stack_on:
                            open_book.append({"symbol": _broker_sym(instr), "direction":
                                              ("BUY" if spec["dir_up"] else "SELL"),
                                              "open_price": exp_px, "ticket": tid})
                        log.info(f"{'[PAPER] ' if paper else ''}{instr} {spec['mode'].upper()} "
                                 f"{direction} @~{spec['entry']} SL {spec['sl']} TP {spec['tp']} "
                                 f"→ ticket {tid} lots {lots} ({spec['size_factor']}×)")
                        # Telegram entry alert — what/direction/SL/TP/why, on fill.
                        if cfg.get("tg_enabled"):
                            send_telegram(tg_creds[0], tg_creds[1],
                                          entry_alert_text(instr, spec, lots, tid, paper))
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
