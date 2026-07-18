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
from pylego import events as EV                              # noqa: E402
from pylego.sizing import position_size                      # noqa: E402
from pylego.broker.paper import PaperBroker                  # noqa: E402
from pylego.quotes import QuoteFeed                          # noqa: E402
from pylego.ohlc_feed import KvOhlcFeed                      # noqa: E402
from pylego.costs import entry_slip_pct, realized_fill, expected_fill, max_spread  # noqa: E402
from pylego.risk_guard import RiskGuard, log_block_transition  # noqa: E402
from pylego.strategy.rangeline import chandelier_stop        # noqa: E402
from range_line_bot.engine import RangeSession, session_anchor_epoch, SRC_MINUTES  # noqa: E402
from volatility_bot.engine import _london_offset_hours       # noqa: E402  (shared DST rule)

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
    # RiskGuard (pylego.risk_guard) — daily/monthly DD lockout + per-pair entry
    # cooldown, matching the other bots' conventions. Blocks NEW entries only;
    # chandelier trailing / barrier exits always run.
    "ddlimit": 3.0,                # max daily drawdown % before lockout
    "monthlydd": 5.0,              # max monthly drawdown % before lockout
    "lockout": 3,                  # hours locked out after a DD breach
    "cooldown": 240,               # seconds between entries on the SAME pair
    "max_spread_pips": None,       # None → per-ASSET-CLASS caps (pylego.costs.max_spread:
                                   # fx 2.0 pips, index/commodity 6×). Set a scalar (FX cap,
                                   # scaled per class) or a {fx,index,commodity} dict to override
                                   # on the config page. (Was 1e9 — no cap at all.)
    "single_position_per_pair": True,  # True = at most one open position per pair
                                        # (today's default). False = one per
                                        # (source, side) ladder slot instead, matching
                                        # the offline backtest's held-position model
                                        # (js/rangeLineAnalyser.js runHeldPosition) —
                                        # lets an Asia-ladder and Monday-ladder trade
                                        # run concurrently on the same pair.
    "plan_secs": 600,              # re-pull the daily plan
    "status_secs": 30,             # read config + push status
    "tick_secs": 3,                # local price watch + touch detection + chandelier trail
    "enabled_pairs": [],           # [] = the plan's universe
    "paper_spread_pips": {},       # paper-fill spread OVERRIDES, {pair: pips/points in the
                                   # pair's OWN pip units}. Blank → per-asset-class
                                   # defaults (pylego.costs.DEFAULT_SPREAD_PIPS)
    "confluence_min": 0,           # structural-confluence entry gate (OOS-validated "trade
                                    # only stronger levels"). 0 = OFF (no behaviour change,
                                    # today's default); 1 = confluent (>=1 source); 2 =
                                    # strong (>=2, the best OOS book). Needs the dashboard's
                                    # range_line_confluence artifact; falls back to OFF if
                                    # it's missing so a stale artifact can't silently halt trading.
    "oi_confluence": False,        # UNVALIDATED, opt-in: count OI levels (walls/max-pain/
                                    # gamma) as extra distinct sources in the confluence_min
                                    # gate, so an OI-backed level ranks stronger. Needs
                                    # range_line_oi_live. The OI forward test scores it.
    "oi_override": False,          # UNVALIDATED, opt-in: at an OI-backed level, flip the
                                    # traded side to the OI read (call wall→sell, put wall→
                                    # buy, max-pain gravity), overriding the learned fade/
                                    # follow direction. Only redirects levels already traded;
                                    # never resurrects a skip. Off = learned direction stands.
    "oi_gamma_regime": False,      # UNVALIDATED, opt-in: the day's dealer-gamma sign sets the
                                    # fade/follow style — PIN (long gamma) → fade, BREAKOUT
                                    # (short gamma) → follow. Needs range_line_oi_live.regimes.
    "oi_hold_break": False,        # UNVALIDATED, opt-in: hold-vs-break — a wall broken by more
                                    # than oi_break_pips flips from fade barrier to squeeze
                                    # (follow). Only affects oi_override.
    "oi_break_pips": 20,           # break distance beyond a wall that counts as decisive.
    "oi_min_tier": "",             # '' = count any wall; 'weak'/'moderate'/'strong' = only walls
                                    # at/above that 3×-rule strength count/override (a strong wall
                                    # trades differently from a weak one). Applies to oi_confluence
                                    # + oi_override.
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


def _pair_event_ccys(pair: str) -> list[str]:
    """Event currencies for a pair. Indices/metals ride their denomination
    currency via the instrument registry (OANDA symbol carries the legs, e.g.
    'us30' → US30_USD → USD) and fall back to parsing the name itself
    (mirrors volatility_bot)."""
    try:
        sym = I.instrument(pair).get("oanda") or pair
    except Exception:
        sym = pair
    return EV.pair_ccys(sym)


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
    """Push the config's paper-fill spread overrides ({pair: pips in the pair's
    own pip units}) onto the PaperBroker (no-op live). Called at startup and on
    every config refresh so an edit applies without a restart."""
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
    return position_size(balance, risk_pct, abs(sl_dist), pip=pip, pip_value=pv, max_lot=max_lot)


def _fill_and_slip(broker, tid, spec, session_open):
    """Entry-slip audit for a just-filled order: (realized fill, slip_pct).
    slip_pct = realized fill vs the modeled ladder level (``spec['entry']``) as
    a signed % of the session open (fallback: the level itself if a Monday-only
    session never saw the Asia window). SIGN CONVENTION: favourable is NEGATIVE,
    adverse POSITIVE (pylego.costs.entry_slip_pct) — the falsifier for the
    book's flat 0.012% round-trip + 0.006% follow-slip cost model."""
    fill = realized_fill(broker, tid)
    slip = entry_slip_pct(spec["dir_up"], fill, spec["entry"], session_open or spec["entry"])
    return fill, slip


def check_plan_boundary_dst(plan, now_epoch: float | None = None) -> bool | None:
    """Startup / plan-refresh DST sanity check (Batch 6).

    The plan ships a FIXED-UTC ``boundaryHour`` frozen when the policy was
    learned (see engine.session_anchor_epoch), but the strategy's session day
    is a LONDON day — after a clock change the frozen hour anchors the ladders
    one hour off the true London midnight until the plan is re-frozen. Compare
    the plan's hour to the currently-correct London-midnight UTC hour (0 in
    GMT, 23 in BST — reuses volatility_bot.engine._london_offset_hours) and
    log LOUDLY on mismatch. WARNING ONLY — the learned policy was frozen on
    those hours, so we never auto-shift.

    Returns True (match) / False (mismatch) / None (no plan or no boundaryHour).
    """
    if not plan or plan.get("boundaryHour") is None:
        return None
    now_utc = datetime.fromtimestamp(now_epoch if now_epoch is not None else time.time(),
                                     tz=timezone.utc)
    offset = _london_offset_hours(now_utc)
    correct = (24 - offset) % 24            # London midnight expressed in UTC
    bh = int(plan["boundaryHour"]) % 24
    if bh == correct:
        return True
    log.warning("=" * 72)
    log.warning(
        f"!!! DST MISMATCH: plan boundaryHour {bh} but London midnight is "
        f"{correct} UTC right now — the frozen ladders anchor off the current "
        f"London day. RE-FREEZE THE PLAN. (Warning only: the learned policy "
        f"was frozen on these hours — NOT auto-shifting.)")
    log.warning("=" * 72)
    return False


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


def _in_formation(plan, now_epoch):
    """True while the Asia range is still FORMING (London 00:00–06:00). No new
    entries fire during this window — not Asia (its ladder isn't built yet) nor
    Monday: trading only starts when the range is pulled at 06:00. Open positions
    keep trailing through it."""
    wc = session_anchor_epoch(now_epoch, plan["boundaryHour"]) + int(plan.get("asiaHrs", 6)) * 3600
    return now_epoch < wc


def _session_window_bars(broker, feed, instr, anchor, secs):
    """Window bars for a ladder build. Live → the broker's own history
    (Mt5Broker.session_bars). Paper → the dashboard KV OHLC feed (PaperBroker
    has no feed of its own): KvOhlcFeed.window_bars returns the window ONLY
    when the payload fully covers it (else None + a once-per-state log naming
    what's missing — never partial/faked bars)."""
    if feed is not None:
        return feed.window_bars(instr, int(anchor), int(secs)) or []
    return _window_bars(broker.session_bars(instr, anchor), anchor, secs)


def _build_ladders(sess: RangeSession, broker, plan, now_epoch, feed=None):
    """Lazily build the Asia (London-window) + Monday ladders once their ranges are
    known. Returns True if anything new was built (→ prime). ``feed`` (paper only)
    is the KvOhlcFeed supplying session bars the PaperBroker cannot."""
    built = False
    bh, ah = plan["boundaryHour"], plan["asiaHrs"]
    sources = plan.get("sources", ["asia", "monday"])
    # Asia / London window: anchor → anchor + asiaHrs; tradeable once the window closed.
    if "asia" in sources and not sess.has_range("A"):
        anchor = session_anchor_epoch(now_epoch, bh)
        if now_epoch >= anchor + ah * 3600:
            try:
                wb = _session_window_bars(broker, feed, sess.instrument, anchor, ah * 3600)
                if sess.set_range("A", wb):
                    built = True
                    # Session open for the entry-slip audit denominator — the
                    # window's first bar opens AT the session anchor, the same
                    # basis as the book's per-touch t.open.
                    sess.session_open = (wb[0] or {}).get("open") if wb else None
            except Exception as e:
                log.warning(f"{sess.instrument}: Asia range build failed: {e}")
    # Monday: the most-recent completed Monday session (24h).
    if "monday" in sources and not sess.has_range("M"):
        manchor = monday_anchor_epoch(now_epoch, bh)
        try:
            mb = _session_window_bars(broker, feed, sess.instrument, manchor, 24 * 3600)
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


def build_status(cfg, broker, plan, paper, sessions, forming=False):
    bal = broker.account_balance()
    return {
        "running": True,
        "mode": "paper" if paper else "live",
        "kill_switch": bool(cfg.get("kill_switch")),
        "forming": bool(forming),                   # Asia range building (00:00–06:00) → no new entries
        "balance": round(bal, 2) if bal is not None else None,
        "universe": (plan or {}).get("universe", []),
        "mt5_positions": broker.serialize_open_positions(),
        "today_closed_trades": broker.serialize_closed_trades(),
        "lines": _instr_lines(plan, sessions or {}, broker),
    }


def _trail_stops(positions, broker, plan, cfg):
    """Trail each open position's stop by the chandelier and push it to the broker
    (modify the NATIVE SL) so the exit is BROKER-ENFORCED — it survives the bot
    going offline or a dashboard 502. The SL only ever ratchets in the favourable
    direction (through break-even and beyond); there is no take-profit. Positions
    the broker has already closed (their trailed SL was hit) are dropped."""
    chand = plan.get("chandFrac", 0.5)
    paper = cfg.get("paper_mode", True)
    open_tickets = {p.get("ticket") for p in broker.serialize_open_positions()}
    for tid in list(positions):
        if tid not in open_tickets:                  # broker closed it (SL hit) → stop tracking
            positions.pop(tid, None)
            continue
        pos = positions[tid]
        px = None
        try: px = broker.price(pos["instr"])
        except Exception: pass
        if px is None:
            continue
        pos["peak"] = max(pos["peak"], px) if pos["dir_up"] else min(pos["peak"], px)
        stop = chandelier_stop(pos["dir_up"], pos["entry"], pos["peak"], pos["rung"], pos["protect"], chand)
        # Round to the INSTRUMENT's own price digits (3 for JPY, 5 for most FX, …),
        # not a hardcoded 5 — a hardcoded 5 sees a sub-tick chandelier nudge as a
        # real tighten, but MT5 rounds a JPY SL to 3 decimals and rejects the modify
        # as a no-op (retcode 10025), spamming a warning every tick until the trail
        # finally moves a full tick.
        try:
            digits = I.price_digits(pos["instr"])
        except Exception:
            digits = 5
        sl_new = round(stop, digits)
        sl_cur = round(pos["sl"], digits)
        tighten = (sl_new > sl_cur) if pos["dir_up"] else (sl_new < sl_cur)
        if tighten:
            try:
                if broker.modify(tid, pos["instr"], stop, paper_mode=paper):
                    pos["sl"] = sl_new          # store the rounded value MT5 holds
                    log.info(f"{pos['instr']} trail SL → {round(stop, 6)} (peak {round(pos['peak'], 6)}) ticket {tid}")
            except Exception as e:
                log.warning(f"{pos['instr']}: trail modify failed: {e}")


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
    _apply_paper_spreads(broker, cfg)
    # Paper has no market feed of its own: pull live quotes off the dashboard
    # (/api/quote — the same MT5-less path the regime bots use) and feed the
    # broker each tick. QuoteFeed caches per pair so the 3s loop stays cheap.
    quotes = QuoteFeed(base_url, log=log) if paper else None
    # Paper also has no BAR history: fresh Asia/Monday ladders come from the
    # dashboard's KV OHLC cache (ohlc5m_{SYM}_{sessionDay} — OANDA M5 via
    # /api/kv/get). Same discipline as QuoteFeed: cached, coverage-gated,
    # fail-loud-once; a window the payload can't fully cover builds NO ladder.
    bar_feed = KvOhlcFeed(base_url, log=log) if paper else None

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

    # RiskGuard (shared brick): daily/monthly DD lockout + per-pair cooldown.
    # Fed the broker balance each tick (PaperBroker's balance MOVES on closed
    # trades since the paper-measurement fix, so paper rehearses the lockout);
    # gates NEW entries only — chandelier trailing / barrier exits always run.
    guard = RiskGuard(log=log)
    guard.sync_cfg(cfg)
    guard_blocks: dict[str, str | None] = {}   # once-per-state-change block logging

    sessions: dict[str, RangeSession] = {}
    positions: dict = {}                                   # ticket -> chandelier state
    plan = None
    conf_art: dict | None = None                           # range_line_confluence artifact
    oi_art: dict | None = None                             # range_line_oi_live artifact (OI levels/day)
    last_anchor = None
    last_plan = last_status = 0.0
    event_windows = None                    # KV event_windows_v1 payload (or None)
    event_ccys: dict[str, list[str]] = {}   # instrument → event currencies (cached)
    ev_blocks: dict[str, str | None] = {}   # once-per-state-change blackout logging
    warned_events = False                   # log loud, but once per outage

    def _attach_conf(sess: RangeSession) -> None:
        """Set today's confluence levels on a freshly-built session (no-op unless
        the artifact has this instrument)."""
        inst = ((conf_art or {}).get("instruments") or {}).get(sess.instrument)
        if inst:
            sess.set_confluence(inst.get("levels") or [], (conf_art or {}).get("tolFrac", 0.1))

    def _attach_oi(sess: RangeSession) -> None:
        """Set today's OI levels (walls/max-pain/gamma) on a session (no-op unless
        the artifact has this instrument). Only USED when oi_confluence/oi_override
        are enabled in config — both opt-in, default off."""
        levels = ((oi_art or {}).get("instruments") or {}).get(sess.instrument)
        if levels:
            try:
                pip = I.pip_size(sess.instrument)
            except Exception:
                pip = 0.0
            regime = ((oi_art or {}).get("regimes") or {}).get(sess.instrument)
            sess.set_oi(levels, (oi_art or {}).get("tolPips", 10), pip, regime=regime,
                        break_pips=cfg.get("oi_break_pips", 20))

    while True:
        nowt = time.time()

        # (a) Plan — slow pull. Adopt a refreshed plan but PRESERVE per-session
        # one-shot state (acted/entered/ladders): only a genuine new session anchor
        # resets it. Wiping `sessions` on every plan refresh (the producer restamps
        # generatedAt intraday) dropped the held-position suppression mid-day, so a
        # level that already had an open position could re-fire → duplicate fills.
        if nowt - last_plan >= cfg.get("plan_secs", 600) or plan is None:
            try:
                new_plan = kv.get_json("range_line_bot_plan")
            except Exception as e:
                log.warning(f"plan fetch failed: {e} — keeping current plan")
                new_plan = None
            if new_plan and new_plan.get("generatedAt") != (plan or {}).get("generatedAt"):
                plan = new_plan
                log.info(f"new plan loaded · {plan.get('generatedAt')} · {len(plan.get('universe', []))} instruments")
                check_plan_boundary_dst(plan, nowt)   # startup + every refresh (Batch 6)
            # Confluence levels (for the optional entry gate). Best-effort: a missing
            # artifact just leaves sessions ungated (with confluence_min>0 that means
            # no trades until it appears — logged once so it's visible).
            try:
                new_conf = kv.get_json("range_line_confluence")
                if new_conf and new_conf.get("generatedAt") != (conf_art or {}).get("generatedAt"):
                    conf_art = new_conf
                    for instr in sessions:                 # refresh already-built sessions in place
                        _attach_conf(sessions[instr])
                    log.info(f"confluence levels loaded · {conf_art.get('generatedAt')} · {len(conf_art.get('instruments', {}))} instruments")
            except Exception as e:
                log.warning(f"confluence fetch failed: {e} — gate ungated this cycle")
            # OI levels (for the opt-in OI strengthen/override). Best-effort; a
            # missing artifact just leaves OI unset (no-op unless the flags are on).
            try:
                new_oi = kv.get_json("range_line_oi_live")
                if new_oi and new_oi.get("generatedAt") != (oi_art or {}).get("generatedAt"):
                    oi_art = new_oi
                    for instr in sessions:
                        _attach_oi(sessions[instr])
                    log.info(f"OI levels loaded · {oi_art.get('generatedAt')} · {len(oi_art.get('instruments', {}))} instruments")
            except Exception as e:
                log.warning(f"OI fetch failed: {e} — OI unset this cycle")
            last_plan = nowt

        if plan:
            anchor = session_anchor_epoch(nowt, plan["boundaryHour"])
            if anchor != last_anchor:                      # new session day → fresh ladders/one-shots
                sessions = {instr: RangeSession(instr, plan["ladderFibs"], chand_frac=plan.get("chandFrac", 0.5))
                            for instr in plan.get("universe", [])}
                for s in sessions.values():
                    _attach_conf(s)
                    _attach_oi(s)
                last_anchor = anchor
            else:
                # Same session, refreshed plan: add sessions for any NEW universe
                # members without disturbing existing one-shot state (drop members
                # no longer in the universe so a stale ladder can't keep firing).
                universe = set(plan.get("universe", []))
                for instr in universe:
                    if instr not in sessions:
                        sessions[instr] = RangeSession(instr, plan["ladderFibs"], chand_frac=plan.get("chandFrac", 0.5))
                        _attach_conf(sessions[instr])
                        _attach_oi(sessions[instr])
                for instr in list(sessions):
                    if instr not in universe:
                        del sessions[instr]

        # (b) Config + status — medium.
        if nowt - last_status >= cfg.get("status_secs", 30):
            try:
                cfg = _deep_merge(DEFAULT_CFG, kv.get_json("range_line_bot_config") or cfg)
                _apply_broker_symbols(cfg)            # pick up broker-symbol edits live
                _apply_paper_spreads(broker, cfg)     # paper spread edits apply live
                guard.sync_cfg(cfg)                   # ddlimit/monthlydd edits apply live
            except Exception as e:
                log.warning(f"config fetch failed: {e}")
            # Event-blackout windows (server publishes hourly; scheduled events are
            # known in advance so this cadence is generous). FAIL-OPEN on missing/
            # stale — it's a suppression gate — but say so loudly, once per outage
            # (mirrors volatility_bot).
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
                forming = _in_formation(plan, nowt) if plan else False
                kv.put_status("range_line_bot_status", build_status(cfg, broker, plan, paper, sessions, forming))
            except Exception as e:
                log.warning(f"status push failed: {e}")
            last_status = nowt

        # (c) Tight loop: build ladders when ready, trail open positions, take entries.
        if plan and not cfg.get("kill_switch"):
            instruments = cfg.get("enabled_pairs") or plan.get("universe", [])
            if quotes is not None:
                # Paper: feed the broker fresh dashboard quotes BEFORE trailing/
                # barriers so the trailed SL and its execution read live prices
                # (QuoteFeed caches per pair — the 3s loop stays cheap). A stale
                # pair keeps its last broker price for trailing (ratchet-only,
                # harmless) but is skipped for NEW entries below.
                for instr in instruments:
                    q = quotes.price(instr)
                    if q is not None:
                        broker.set_price(instr, q)
            _trail_stops(positions, broker, plan, cfg)     # ratchet the native SL (broker-enforced exit)
            if hasattr(broker, "check_barriers"):
                broker.check_barriers()                    # paper: execute the trailed SL
            # Balance once per tick: feeds RiskGuard DD tracking and sizing. No
            # readable balance (MT5 blip) → skip the DD update and use a large
            # placeholder so a bogus 0 can't fire a false lockout (mirrors bot/main.py).
            bal = broker.account_balance() or 0.0
            if bal:
                guard.update_balance(bal)
            guard_bal = bal if bal else 1_000_000.0
            # No new entries while the Asia range is forming (00:00–06:00 London).
            # dry_run still primes levels crossed overnight, so at 06:00 only
            # genuinely-new post-pull crossings fire (no chasing a stale breakout).
            forming = _in_formation(plan, nowt)
            # Usable blackout payload this tick (None when missing/stale → fail open).
            ev_payload = None if EV.stale_reason(event_windows, nowt * 1000) else event_windows
            for instr in instruments:
                sess = sessions.get(instr)
                ip = (plan.get("instruments") or {}).get(instr)
                if sess is None or ip is None:
                    continue
                if _build_ladders(sess, broker, plan, nowt, feed=bar_feed):
                    # prime: mark levels price already crossed so we don't retro-enter
                    try:
                        px0 = broker.price(instr)
                        if px0 is not None:
                            sess.decide(px0, ip["policy"], dry_run=True)
                    except Exception:
                        pass
                # Paper: only act on a FRESH quote (cached — no extra HTTP after the
                # pre-feed above); a stale/missing pair is skipped this tick.
                px = quotes.price(instr) if quotes is not None else broker.price(instr)
                if px is None:
                    continue
                # Skip a closed index market cleanly (MT5 retcode 10017) instead of
                # firing a rejected order off a frozen price. Doesn't apply while
                # forming (that path only primes).
                if not forming and not broker.tradable(instr):
                    continue
                if len(broker.serialize_open_positions()) >= cfg.get("max_open", 12):
                    continue
                # RiskGuard: gate NEW entries only (skip the pair's entry decide —
                # the level isn't burned, like a blackout defer). Never gates the
                # forming-window dry_run (that only primes) or trailing/exits above.
                # Logged once per state change, never per tick.
                if not forming:
                    guard_why = guard.block_reason(guard_bal, instr)
                    log_block_transition(log, guard_blocks, instr, guard_why)
                    if guard_why:
                        continue
                    # Event blackout: DEFER new entries (skip the pair's decide —
                    # the level isn't burned, same semantics as the RiskGuard skip
                    # above), so a level still beyond price re-fires on the first
                    # clear tick after the window. Never gates the forming-window
                    # dry_run (that only primes) or trailing/exits above.
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
                single = cfg.get("single_position_per_pair", True)
                conf_min = int(cfg.get("confluence_min", 0) or 0)
                oi_conf = bool(cfg.get("oi_confluence", False))
                oi_over = bool(cfg.get("oi_override", False))
                oi_reg  = bool(cfg.get("oi_gamma_regime", False))
                oi_hb   = bool(cfg.get("oi_hold_break", False))
                oi_mt   = cfg.get("oi_min_tier") or None
                for spec in sess.decide(px, ip["policy"], dry_run=forming, confluence_min=conf_min,
                                        oi_confluence=oi_conf, oi_override=oi_over,
                                        oi_gamma_regime=oi_reg, oi_hold_break=oi_hb, oi_min_tier=oi_mt):
                    sl = spec["protect_stop"]
                    # Size off the spread-adjusted EXPECTED fill, not the raw ladder
                    # level: a market order can't be sized after it fills, and the
                    # fill pays half the spread — pricing that into the stop distance
                    # makes the risked % right on average (pylego.costs.expected_fill).
                    exp_px = expected_fill(spec["entry"], spec["dir_up"], instr, broker)
                    lots = size_for(instr, bal, cfg.get("risk_pct", 0.5), exp_px - sl, cfg.get("max_lot", 2.0))
                    direction = "LONG" if spec["dir_up"] else "SHORT"
                    slot_tag = f"{spec['src']}{spec['side']}"
                    # single_position_per_pair=True (default): dedupe_tag=None → the
                    # broker blocks on ANY open position for this pair (today's
                    # behaviour). False: dedupe_tag=slot_tag → the broker only blocks
                    # a repeat fill on THIS (source, side) slot, so an Asia-ladder and
                    # Monday-ladder position can run concurrently on the same pair —
                    # matching the offline held-position backtest (js/rangeLineAnalyser.js).
                    dedupe_tag = None if cfg.get("single_position_per_pair", True) else slot_tag
                    # No take-profit — the chandelier-trailed native SL is the exit
                    # (see _trail_stops). tp=0 → MT5 sets no TP.
                    tid = broker.enter(instr, direction, sl, 0.0, lots,
                                       max_spread(instr, cfg), paper,
                                       comment=f"RL [{slot_tag}] {spec['label']} {spec['decision'][0]}",
                                       dedupe_tag=dedupe_tag)
                    filled = tid is not None and tid != -1
                    if filled:
                        # Entry-slip audit (see _fill_and_slip: favourable = NEGATIVE).
                        fill, slip = _fill_and_slip(broker, tid, spec, sess.session_open)
                        # Chandelier state seeded from the REALIZED fill (what was
                        # actually paid), falling back to the modeled ladder level
                        # only if the broker can't show the fill yet — the trail
                        # anchors to the true entry, not the theoretical touch.
                        seed = fill if fill is not None else spec["entry"]
                        positions[tid] = {"instr": instr, "ticket": tid, "dir_up": spec["dir_up"],
                                          "entry": seed, "peak": seed,
                                          "rung": spec["rung"], "protect": sl, "sl": sl,
                                          "fill": fill, "slip_pct": slip}
                        guard.record_trade(instr)                      # arms the per-pair cooldown
                        sess.mark_entered(spec["src"], spec["side"])   # burn the slot ONLY on a fill
                        log.info(f"{'[PAPER] ' if paper else ''}{instr} {spec['decision'].upper()} "
                                 f"{spec['label']} {spec['side']} → ticket {tid} lots {lots}"
                                 f" slip {slip if slip is not None else 'n/a'}%")
                        # One position per pair per tick when single_position_per_pair:
                        # two coincident ladder slots (e.g. Asia + Monday, same side)
                        # could otherwise both fill this tick before the broker's
                        # positions_get reflects the first → identical duplicate fills.
                        if single:
                            break
                    else:
                        log.warning(f"{instr} {spec['decision']} {spec['label']} entry REJECTED — "
                                    f"slot kept open for a later touch")

        time.sleep(max(cfg.get("tick_secs", 3), 1))


def main():
    ap = argparse.ArgumentParser(description="MacroFX Range-Line Bot")
    ap.add_argument("--live", action="store_true", help="trade live on MT5 (default: paper)")
    ap.add_argument("--url", default=DASHBOARD_URL, help="dashboard base URL")
    args = ap.parse_args()
    run(args.url, args.live)


if __name__ == "__main__":
    main()
