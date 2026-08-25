"""
Confluence Bot — Max-style level-matrix confluence trading for ANY instrument.

A generalisation of GoldV2/main.py (which stays running untouched — versioned,
not overwritten, per the house rule). Same strategy engine — wait for price to
come to a high-confluence level, confirm exhaustion on M5 VuManChu, trade it
with structure-anchored SL and level-to-level TP under aggregate risk caps —
but it runs a CONFIGURABLE LIST OF INSTRUMENTS at once, from FX majors/crosses
through gold to indices, instead of gold only.

How the gold-only code was opened up:
  * Every symbol-specific constant (pip size, price digits, volume-profile
    bucket, MT5 symbol, lot point-value) is resolved per instrument from the
    shared `pylego` bricks (`instruments` / `point_values` / `sizing`) — the
    ONE source of truth the dashboard also uses, so a pip can never silently
    disagree (a wrong pip is a 10× PnL bug).
  * Every DISTANCE in config is expressed in PIPS and scaled by the
    instrument's pip size at run time. Gold (pip=1.0) reproduces the GoldV2
    numbers exactly; EUR/USD (pip=0.0001) and indices (pip=1.0 point) scale
    automatically through the same code path.
  * Each instrument gets its own SymbolEngine (its own zones / HTF bias /
    volume profile / session levels / TradeManager state file / journal). The
    orchestrator shares one MT5 connection + one config + one credentials set,
    enforces GLOBAL portfolio caps across all instruments, and pushes ONE
    aggregated status to KV so every position lands in the bot-config
    Positions tab exactly like GoldV2.

KV keys: confluence_bot_config / confluence_bot_credentials /
         confluence_bot_status / confluence_bot_zones / confluence_bot_trades.
MT5 magic: 20260006 (distinct from GoldV2's 20260005).

Usage:
  python main.py                    # paper mode (default)
  python main.py --live             # real MT5 orders (magic 20260006)
  python main.py --once             # single cycle then exit
  python main.py --pairs EUR/USD,GBP/USD,GOLD   # override the configured list

Environment (.env or shell):
  MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER / MT5_PATH   fallback credentials —
      primary source is KV confluence_bot_credentials from the bot-config page.
  DASHBOARD_URL   override base URL (default: Railway deployment)
"""

from __future__ import annotations
import argparse
import logging
import os
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Optional

# ConfluenceBot/modules must take priority over bot/modules (both use 'modules.*').
# Insert this dir first, then bot/ for utils/, then the repo root for pylego/.
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(1, os.path.join(_HERE, '..', 'bot'))
sys.path.insert(2, os.path.join(_HERE, '..'))

import requests
from dotenv import load_dotenv

from utils.state_reader import fetch_quote, DASHBOARD_URL

from modules.htf_bias import compute_htf_bias
from modules.level_matrix import (build_level_matrix, score_zones,
                                  update_zone_activity, ZoneV2)
from modules.volume_profile import compute_volume_profile
from modules.session_engine import compute_session_levels
from modules.vumanchu import compute_vumanchu
from modules.trendline_engine import detect_trendlines, Trendline
from modules.trade_manager import TradeManager, ManagedTrade, paper_close_exec
from modules.exits import plan_exits

# Shared multi-instrument bricks — never re-inline a pip table or a sizing formula.
from pylego.instruments import instrument, oanda_symbol
from pylego.broker.clock import ServerClock, closes_on_utc_day, history_window   # broker-clock offset — MT5 stamps aren't UTC
from pylego.point_values import point_value, DEFAULT_POINT_VALUE
from pylego.sizing import position_size

from journal import ConfluenceJournal

load_dotenv()

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Constants ─────────────────────────────────────────────────────────────────

MAGIC  = 20260006          # Confluence bot magic — distinct from GoldV2's 20260005

KV_CONFIG = 'confluence_bot_config'
KV_STATUS = 'confluence_bot_status'
KV_ZONES  = 'confluence_bot_zones'
KV_CREDS  = 'confluence_bot_credentials'
KV_TRADES = 'confluence_bot_trades'

# Canonical instrument key → the name /api/vol-forecast exposes (js/volForecastScheduler).
# FX keys already match the uppercased key (eurusd → EURUSD); metals/indices differ.
_VOL_FORECAST_NAME = {
    'gold': 'GOLD', 'nq': 'NQ', 'spx': 'SPX500', 'dax': 'DE30',
    'ftse': 'UK100', 'dow': 'US30', 'rut': 'US2000',
}

# Default instrument universe — the registry the other bots trade. Fully
# overridable from the config page (`pairs`) or --pairs. Broad on purpose: the
# whole point of this bot is to open the gold strategy up to everything and see
# where (if anywhere) it has edge — paper-first, judged on OOS per the house rule.
_DEFAULT_PAIRS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'USD/CHF',
    'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'EUR/AUD',
    'GOLD',
    'NQ', 'SPX', 'DAX', 'DOW',
]

# ── Default config (overridden via KV confluence_bot_config) ──────────────────

DEFAULT_CFG: dict = {
    'enabled':                     True,
    'paper_mode':                  True,

    # Instrument universe
    'pairs':                       list(_DEFAULT_PAIRS),
    'broker_overrides':            {},     # {canonical_key or symbol: broker MT5 symbol}

    # Zone matrix (all distances in PIPS — scaled by each instrument's pip size)
    'zone_tfs':                    ['H4', 'M30'],
    'cluster_tolerance':           3.0,    # pips — level lines within this collapse to one zone
    'min_zone_score':              4.0,
    'min_distinct_legs':           1,
    'proximity_pips':              5.0,
    'max_armed_zones':             3,       # per instrument
    'include_retests':             True,
    'bucket_pips':                 0.5,     # volume-profile histogram bucket, in pips

    # Confirmation
    'vu_min_components':           2,
    'vu_require_wt':               True,
    'mf_fuel_veto':                True,

    # Paper fills — costs on by default (live MT5 already pays the real
    # bid/ask; paper must too or thin edges get flattered). Full round-trip
    # bid/ask spread in PIPS by asset class, scaled by each instrument's
    # registry pip size: a paper BUY fills at mid + spread/2, a SELL at
    # mid − spread/2, at entry AND at close — one full spread per round trip —
    # and TP/SL touches are checked on the exit-side price. Override per
    # class here or per instrument via paper_spread_overrides (canonical key
    # → pips, e.g. {'gold': 0.4, 'eurusd': 0.6}).
    'paper_spread_fx':             0.8,    # pips — FX majors/crosses
    'paper_spread_fx_jpy':         1.0,    # pips — JPY-quoted crosses (pip=0.01)
    'paper_spread_commodity':      0.3,    # pips — gold: 0.3 × $1 pip = $0.30
    'paper_spread_index':          2.0,    # pips — indices: 2 points
    'paper_spread_overrides':      {},
    # Overnight financing PLACEHOLDER for paper holds (pending real per-pair
    # swap rates): this % of notional charged per UTC midnight crossed while
    # a paper position is open, regardless of direction. Appears as 'swap' in
    # the audit/KV trade records. Set 0 to disable.
    'paper_swap_pct':              0.001,  # % of notional per night

    # Risk / portfolio — PER INSTRUMENT caps
    'risk_pct':                    0.5,
    'max_lot':                     5.0,
    'max_trades_per_day':          4,       # per instrument
    'max_concurrent_trades':       2,       # per instrument
    'max_open_risk_pct':           1.0,     # per instrument (sum of open risk)
    'max_per_direction':           2,       # per instrument
    'min_entry_separation_pips':   15,
    'cooldown_minutes':            30,
    'global_cooldown_minutes':     10,      # per instrument, between consecutive entries

    # Risk / portfolio — GLOBAL caps across ALL instruments
    'max_total_open_trades':       6,
    'max_total_open_risk_pct':     3.0,
    'max_total_per_direction':     5,
    'max_currency_risk_pct':       1.5,     # |net signed risk| cap per single CURRENCY
                                            # (long EUR/USD = +EUR/−USD risk; catches the
                                            # stacked-USD-bet the LONG/SHORT label caps miss)

    # Exits (SL caps in pips)
    'max_sl_pips':                 40,
    'max_sl_atr_mult':             0,       # 0 = disabled; if > 0, widens (never tightens)
                                             # max_sl to atr_15m * mult when that's bigger —
                                             # keeps the cap from silently drifting too tight
                                             # as an instrument's price/vol rises (see exits.py)
    'min_sl_pips':                 4,
    'sl_buffer_atr':               0.3,
    'tp1_r_min':                   1.0,
    'tp2_r_min':                   1.5,
    'tp2_r_max':                   4.0,
    'range_cap_mult':              1.2,
    'be_after_tp1':                True,
    'allow_overnight_htf_aligned': True,

    # Session
    'trade_window_start':          '07:00',
    'trade_window_end':            '20:00',

    # Gates
    'gold_macro_gate':             True,    # gold only — reads ai_goldmodel KV
    'ml_gate':                     False,   # gold only — reads gold_ml_signal KV
    'htf_block':                   True,
    'htf_block_confidence':        0.5,
    'use_vol_forecast':            True,
    # Options-OI confluence: strengthen a zone that lines up with the day's
    # put/call walls / max pain / HVL / gamma flip (the OI you paste into the
    # analyser each morning → KV oi_store → /api/oi-levels). Re-scored every
    # state refresh, so a fresh morning paste flows through automatically on the
    # next cycle — no manual "refresh zones" step. NOTE: real on indices, weak-
    # to-unproven on spot FX (OTC, no consolidated OI) — paper-first, measurable.
    'use_oi':                      True,

    # Data
    'm1_lookback_bars':            18_500,  # per instrument, for the nPOC stack (~13 days)

    'log_dir':                     '.',
}

# ── Logging ───────────────────────────────────────────────────────────────────

def _setup_logging(log_dir: str) -> None:
    os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(message)s',
        datefmt='%H:%M:%S',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(os.path.join(log_dir, 'confluence_bot.log'), encoding='utf-8'),
        ],
    )

log = logging.getLogger(__name__)

# ── Instrument context ────────────────────────────────────────────────────────

@dataclass
class InstrCtx:
    input_symbol: str      # what the user configured (e.g. 'EUR/USD', 'GOLD')
    key: str               # canonical registry key (e.g. 'eurusd', 'gold')
    display: str           # registry display form (e.g. 'EUR/USD', 'XAU/USD')
    symbol: str            # broker MT5 symbol to trade / query
    oanda: str             # OANDA symbol (for the dashboard's candle/quote fetch)
    pip: float
    digits: int
    point_val: float       # cash per pip per lot (for sizing / paper PnL)
    asset_class: str
    vol_name: Optional[str]   # /api/vol-forecast instrument name, or None

    def bucket(self, cfg: dict) -> float:
        # Volume-profile histogram bucket, in price units. bucket_pips × pip so
        # gold (pip=1.0, bucket_pips=0.5) reproduces GoldV2's $0.50 bucket exactly.
        return max(1e-9, float(cfg.get('bucket_pips', 0.5)) * self.pip)


def build_instr(input_symbol: str, broker_overrides: dict) -> Optional[InstrCtx]:
    """Resolve a configured symbol into a full instrument context, or None if
    the registry doesn't know it (fail loud in the log, skip the instrument)."""
    try:
        rec = instrument(input_symbol)
    except Exception:
        log.warning(f'[INSTR]  Unknown instrument {input_symbol!r} — skipped '
                    f'(not in the shared registry)')
        return None
    key = rec['key']
    # Broker override may be keyed by canonical key OR by the input symbol.
    override = (broker_overrides.get(key)
                or broker_overrides.get(input_symbol)
                or broker_overrides.get(input_symbol.upper()))
    # The registry's display is the nice pair form for FX/metals (EUR/USD,
    # XAU/USD) but the oanda symbol for indices (NAS100_USD) — for those, the
    # short code the user typed (NQ, DAX) reads better.
    reg_display = rec.get('display', input_symbol)
    display = reg_display if '/' in reg_display else input_symbol.upper()
    # Pip VALUE is an approximate sizing input and the shared table doesn't cover
    # every FX cross this bot can trade. Use the documented default fallback
    # (mirrors the live bots' `.get(pair, 10.0)`) instead of failing loud, and
    # warn so it's clear sizing is approximate for that pair (paper-first).
    try:
        point_val = float(point_value(input_symbol))
    except KeyError:
        point_val = float(DEFAULT_POINT_VALUE)
        log.warning(f'[INSTR]  {input_symbol}: no point value in the sizing table — '
                    f'using default ${point_val}/pip/lot (approximate sizing; paper-first)')
    return InstrCtx(
        input_symbol=input_symbol,
        key=key,
        display=display,
        symbol=override or rec.get('mt5') or input_symbol,
        oanda=rec.get('oanda') or oanda_symbol(input_symbol),
        pip=float(rec['pip']),
        digits=int(rec['digits']),
        point_val=point_val,
        asset_class=rec.get('assetClass', 'fx'),
        vol_name=_VOL_FORECAST_NAME.get(key, key.upper()),
    )


def _ccy_legs(display: str) -> tuple[str, str] | None:
    """(base, quote) currency legs of a display pair ('EUR/USD' → ('EUR','USD'),
    'XAU/USD' → ('XAU','USD')), or None for non-pair instruments (indices) —
    those carry no FX-currency legs for the netting guard."""
    if '/' in (display or ''):
        base, quote = display.split('/', 1)
        if len(base) == 3 and len(quote) == 3:
            return base.upper(), quote.upper()
    return None


# ── KV helpers ────────────────────────────────────────────────────────────────

def _kv_get(key: str, base_url: str) -> dict | None:
    try:
        r = requests.get(f'{base_url}/api/kv/get?key={key}', timeout=10)
        if r.status_code == 200:
            j = r.json()
            if not j.get('miss') and j.get('data'):
                return j['data']
    except Exception:
        pass
    return None


def _kv_put(key: str, data: dict, base_url: str) -> None:
    try:
        requests.post(
            f'{base_url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=5,
        )
    except Exception:
        pass


def _load_config(base_url: str) -> dict:
    remote = _kv_get(KV_CONFIG, base_url) or {}
    return {**DEFAULT_CFG, **remote}


# ── MT5 helpers ───────────────────────────────────────────────────────────────

_TF_MAP: dict = {}


def _load_mt5_creds(base_url: str) -> dict:
    creds = _kv_get(KV_CREDS, base_url) or {}
    return {
        'account':  creds.get('mt5_account')  or os.getenv('MT5_ACCOUNT'),
        'password': creds.get('mt5_password') or os.getenv('MT5_PASSWORD'),
        'server':   creds.get('mt5_server')   or os.getenv('MT5_SERVER'),
        'path':     creds.get('mt5_path')     or os.getenv('MT5_PATH'),
    }


def _init_mt5(creds: dict) -> bool:
    if not HAS_MT5:
        return False
    global _TF_MAP
    _TF_MAP = {
        'D1': mt5.TIMEFRAME_D1, 'H4': mt5.TIMEFRAME_H4, 'H1': mt5.TIMEFRAME_H1,
        'M30': mt5.TIMEFRAME_M30, 'M15': mt5.TIMEFRAME_M15,
        'M5': mt5.TIMEFRAME_M5,   'M1': mt5.TIMEFRAME_M1,
    }
    kw: dict = {}
    if creds.get('path'):
        kw['path'] = creds['path']
    if creds.get('account') and creds.get('password') and creds.get('server'):
        kw.update({'login': int(creds['account']), 'password': creds['password'],
                   'server': creds['server']})
    ok = mt5.initialize(**kw)
    if not ok:
        log.warning(f'MT5 init failed: {mt5.last_error()}')
        return False
    if creds.get('account'):
        info = mt5.account_info()
        if info and int(info.login) != int(creds['account']):
            log.error(f'MT5 attached to account {info.login}, expected '
                      f'{creds["account"]} — refusing to trade the wrong account')
            mt5.shutdown()
            return False
    return True


def _run_with_timeout(fn, timeout: float, *args, **kwargs):
    """Run fn in a fresh daemon thread and enforce a wall-clock timeout.

    Used to bound per-instrument state_refresh() calls: a hang inside one
    (an MT5 IPC call with no native timeout, or a runaway compute loop) would
    otherwise freeze the whole bot forever. On timeout the worker thread is
    abandoned (Python can't force-kill a thread) rather than reused, so a
    single stuck call can't permanently block subsequent cycles.
    """
    result: dict = {}

    def _target():
        try:
            result['value'] = fn(*args, **kwargs)
        except Exception as exc:
            result['exc'] = exc

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        raise TimeoutError(f'{fn!r} did not complete within {timeout}s')
    if 'exc' in result:
        raise result['exc']
    return result.get('value')


def _bars(symbol: str, tf: str, count: int) -> list[dict]:
    if not HAS_MT5 or tf not in _TF_MAP:
        return []
    rates = mt5.copy_rates_from_pos(symbol, _TF_MAP[tf], 0, count)
    if rates is None or len(rates) == 0:
        return []
    return [
        {'time': int(r['time']), 'open': float(r['open']), 'high': float(r['high']),
         'low': float(r['low']), 'close': float(r['close']),
         'tick_volume': float(r['tick_volume'])}
        for r in reversed(rates)
    ]


def _live_price(instr: InstrCtx, base_url: str) -> float | None:
    if HAS_MT5:
        tick = mt5.symbol_info_tick(instr.symbol)
        if tick and tick.bid and tick.ask:
            return round((tick.bid + tick.ask) / 2, instr.digits)
    return fetch_quote(instr.display, base_url)


def _mt5_balance() -> float:
    if HAS_MT5:
        info = mt5.account_info()
        if info:
            return info.balance
    return 10000.0


def _mt5_account_login() -> Optional[int]:
    if HAS_MT5:
        info = mt5.account_info()
        if info:
            return int(info.login)
    return None


# ── Gates (gold-specific KV models apply to gold only) ────────────────────────

def _macro_allows(direction: str, base_url: str, instr: InstrCtx) -> tuple[bool, str]:
    if instr.key != 'gold':
        return True, 'macro gate — gold only, N/A'
    model = _kv_get('ai_goldmodel', base_url)
    if not model:
        return True, 'Gold macro model not in KV — skipping gate'
    signal   = model.get('signal', 'NEUTRAL')
    strength = model.get('strength', 'WEAK')
    regime   = model.get('regimeLabel', model.get('regime', ''))
    long_ok  = signal in ('BULLISH', 'NEUTRAL')
    short_ok = signal in ('BEARISH', 'NEUTRAL')
    if direction == 'LONG' and not long_ok and strength == 'STRONG':
        return False, f'Gold macro BLOCK: {signal} {strength} ({regime}) vs LONG'
    if direction == 'SHORT' and not short_ok and strength == 'STRONG':
        return False, f'Gold macro BLOCK: {signal} {strength} ({regime}) vs SHORT'
    return True, f'Macro OK: {signal} {strength} ({regime})'


def _ml_allows(zone_id: str, base_url: str, instr: InstrCtx) -> tuple[bool, str]:
    if instr.key != 'gold':
        return True, 'ML gate — gold only, N/A'
    signal = _kv_get('gold_ml_signal', base_url)
    if not signal:
        return True, 'ML signal not in KV — skipping ML gate'
    for z in signal.get('zones', []):
        if z.get('zone_id') == zone_id:
            sig  = z.get('signal', 'LOW')
            prob = z.get('prob', 0.5)
            if sig == 'PASS':
                return False, f'ML gate BLOCK: zone {zone_id} prob={prob:.2f} [{sig}]'
            return True, f'ML gate OK: prob={prob:.2f} [{sig}]'
    return True, 'Zone not in ML signal — skipping gate'


# ── Trade window ──────────────────────────────────────────────────────────────

def _in_trade_window(cfg: dict) -> bool:
    now = datetime.now(timezone.utc)
    # Weekend gate: FX/metals are closed Sat + Sun until ~21:00 UTC, but the
    # paper path still gets a (stale) quote and would stamp a phantom fill at
    # a price the market never traded (seen: EUR/AUD "opened" Sat 07:00 UTC).
    # The Sunday-evening reopen is outside the intraday window anyway.
    if now.weekday() >= 5:  # Sat=5, Sun=6
        return False
    try:
        start_h, start_m = map(int, cfg['trade_window_start'].split(':'))
        end_h,   end_m   = map(int, cfg['trade_window_end'].split(':'))
    except Exception:
        return True
    start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    end   = now.replace(hour=end_h,   minute=end_m,   second=0, microsecond=0)
    return start <= now <= end


def _past_window_end(cfg: dict) -> bool:
    now = datetime.now(timezone.utc)
    try:
        end_h, end_m = map(int, cfg['trade_window_end'].split(':'))
    except Exception:
        return False
    end = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
    return now > end


# ── Lot sizing (shared pylego brick) ──────────────────────────────────────────

def _calc_lot_size(balance: float, risk_pct: float, sl_dist: float,
                   instr: InstrCtx, max_lot: float) -> float:
    """Risk-based lots via the shared sizing brick. sl_dist is in price units;
    position_size converts to pips with the instrument pip and divides by the
    per-pip cash value (point_value). Gold reproduces GoldV2's 100-oz math."""
    return position_size(balance, risk_pct, sl_dist,
                         pip=instr.pip, pip_value=instr.point_val, max_lot=max_lot)


# ── Paper transaction costs ───────────────────────────────────────────────────

def paper_spread_price(instr: InstrCtx, cfg: dict) -> float:
    """Full paper round-trip bid/ask spread in PRICE units for an instrument.

    Class defaults (config-overridable, plus per-instrument overrides keyed by
    canonical registry key): FX majors/crosses 0.8 pips, JPY-quoted crosses
    1.0 pips, gold 0.3 pips (= $0.30 at pip $1), indices 2.0 points. Pips
    scale by the instrument's registry pip size — the same pip/digits
    threading the rest of the bot uses, so a wrong pip can't sneak in here.
    """
    overrides = cfg.get('paper_spread_overrides') or {}
    pips = overrides.get(instr.key)
    if pips is None:
        if instr.asset_class == 'fx':
            key = 'paper_spread_fx_jpy' if instr.pip >= 0.01 else 'paper_spread_fx'
        elif instr.asset_class == 'index':
            key = 'paper_spread_index'
        else:
            key = 'paper_spread_commodity'
        pips = cfg.get(key, DEFAULT_CFG.get(key, 1.0))
    return max(0.0, float(pips)) * instr.pip


def paper_swap_pips(trade: ManagedTrade, instr: InstrCtx, cfg: dict) -> float:
    """Overnight financing PLACEHOLDER for paper holds, in PIPS (≥ 0).

    Simplest honest version pending real per-pair swap rates: paper_swap_pct %
    of notional per UTC midnight crossed while the position was open, charged
    regardless of direction. Since notional = entry × point_val / pip × lots
    and pip value = point_val × lots per pip, the per-lot terms cancel and the
    charge reduces to entry_price × pct% × nights ÷ pip — lot-independent in
    pips. Convert to money with instr.point_val × lots where needed.
    """
    pct = float(cfg.get('paper_swap_pct', 0.001))
    if pct <= 0:
        return 0.0
    nights = (datetime.now(timezone.utc).date() - trade.entry_dt().date()).days
    if nights <= 0:
        return 0.0
    return trade.entry_price * (pct / 100.0) * nights / instr.pip


# ── ATR helpers ───────────────────────────────────────────────────────────────

def _atr_from_list(bars: list[dict], alpha: float = 0.15) -> float:
    if len(bars) < 2:
        return 0.0
    tr = abs(bars[1]['high'] - bars[1]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * tr
    return round(tr, 6)


def _atr_squeeze(bars: list[dict]) -> float:
    if len(bars) < 100:
        return 1.0
    short  = _atr_from_list(bars[-14:])
    medium = _atr_from_list(bars[-100:])
    return round(short / medium, 3) if medium > 0 else 1.0


# ── Live order helpers ────────────────────────────────────────────────────────

def _filling_mode(symbol: str) -> int:
    info = mt5.symbol_info(symbol)
    mode = mt5.ORDER_FILLING_IOC
    if info:
        f = info.filling_mode
        if   f & 1: mode = mt5.ORDER_FILLING_FOK
        elif f & 2: mode = mt5.ORDER_FILLING_IOC
        elif f & 4: mode = mt5.ORDER_FILLING_RETURN
    return mode


def _place_live_order(instr: InstrCtx, direction: str, sl: float, tp: float,
                      lots: float, zone_id: str) -> Optional[int]:
    if not HAS_MT5:
        return None
    tick = mt5.symbol_info_tick(instr.symbol)
    if not tick:
        log.error(f'[LIVE] {instr.symbol}: no tick — order skipped')
        return None
    exec_price = tick.ask if direction == 'LONG' else tick.bid
    order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       instr.symbol,
        'volume':       float(lots),
        'type':         order_type,
        'price':        exec_price,
        'sl':           round(sl, instr.digits),
        'tp':           round(tp, instr.digits),
        'deviation':    30,
        'magic':        MAGIC,
        'comment':      f'Confl {direction[0]} {zone_id[:14]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(instr.symbol),
    })
    if res is None:
        log.error(f'[LIVE] {instr.symbol}: order_send None: {mt5.last_error()}')
        return None
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f'[LIVE] {instr.symbol}: order failed retcode={res.retcode} {res.comment}')
        return None
    log.info(f'[LIVE] {instr.symbol} placed ticket={res.order} exec={exec_price} '
             f'sl={sl} tp={tp} lots={lots}')
    return int(res.order)


def _close_live_position(instr: InstrCtx, ticket: int) -> bool:
    if not HAS_MT5:
        return False
    pos = (mt5.positions_get(ticket=ticket) or [None])[0]
    if not pos:
        return True
    tick = mt5.symbol_info_tick(instr.symbol)
    if not tick:
        return False
    close_type  = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
    close_price = tick.bid if pos.type == 0 else tick.ask
    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       instr.symbol,
        'volume':       float(pos.volume),
        'type':         close_type,
        'position':     ticket,
        'price':        close_price,
        'deviation':    30,
        'magic':        MAGIC,
        'comment':      'Confl EOD expiry',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(instr.symbol),
    })
    return bool(res and res.retcode == mt5.TRADE_RETCODE_DONE)


# ── Serialization for the dashboard positions tab ─────────────────────────────

_SERVER_CLOCK = None


def _tz_offset_sec():
    """Seconds the broker's clock runs ahead of UTC. MT5 stamps `.time` fields on
    the SERVER's wall clock, so every time_open/time_close below is shifted by
    this much — the serialisers ship it so the dashboard renders the real instant
    instead of assuming UTC. See pylego/broker/clock.py."""
    global _SERVER_CLOCK
    if _SERVER_CLOCK is None:
        _SERVER_CLOCK = ServerClock(mt5 if HAS_MT5 else None, log=log)
    return _SERVER_CLOCK.offset_sec()


def _serialize_open_positions(magic: int) -> list:
    """All live MT5 positions carrying our magic, across every instrument."""
    if not HAS_MT5:
        return []
    try:
        return [
            {
                'ticket':     int(p.ticket),
                'symbol':     p.symbol,
                'direction':  'BUY' if p.type == 0 else 'SELL',
                'lots':       round(float(p.volume), 2),
                'open_price': round(float(p.price_open), 5),
                'price':      round(float(p.price_current), 5),
                'profit':     round(float(p.profit), 2),
                'swap':       round(float(p.swap), 2),
                'time_open':  int(p.time),
                'tz_offset_sec': _tz_offset_sec(),
                'comment':    str(p.comment or ''),
            }
            for p in (mt5.positions_get() or [])
            if p.magic == magic
        ]
    except Exception:
        return []


def _serialize_closed_trades(magic: int) -> list:
    if not HAS_MT5:
        return []
    try:
        # Window vs bucket, two clocks that disagree. MT5 reads these date args
        # on the BROKER clock, so a plain UTC-midnight window is really
        # 21:00->21:00 UTC on a +3h broker: every trade closing in the last
        # three hours of a UTC day falls outside it and is then filed a day
        # late. Ask wide, keep only today's real-UTC closes — the filter in
        # the loop below (pylego/broker/clock.py).
        win_from, win_to = history_window()
        deals = mt5.history_deals_get(win_from, win_to) or []
        by_pos: dict = {}
        for d in deals:
            if d.magic != magic:
                continue
            pid = int(d.position_id)
            by_pos.setdefault(pid, {'in': None, 'out': []})
            if d.entry == 0:
                by_pos[pid]['in'] = d
            elif d.entry in (1, 3):
                by_pos[pid]['out'].append(d)
        result = []
        for pid, grp in by_pos.items():
            outs = grp['out']
            if not outs:
                continue
            ind      = grp['in']
            last_out = max(outs, key=lambda d: d.time)
            # The wide window also returns other days' closes, so bucket on the
            # close's REAL-UTC date rather than its raw broker stamp.
            if not closes_on_utc_day(int(last_out.time), _tz_offset_sec()):
                continue
            if ind:
                direction, open_price, time_open = \
                    ('BUY' if ind.type == 0 else 'SELL'), round(float(ind.price), 5), int(ind.time)
            else:
                direction, open_price, time_open = \
                    ('BUY' if last_out.type == 1 else 'SELL'), None, None
            result.append({
                'position_id': pid,
                'symbol':      last_out.symbol,
                'direction':   direction,
                'lots':        round(sum(d.volume     for d in outs), 2),
                'open_price':  open_price,
                'close_price': round(float(last_out.price), 5),
                'profit':      round(sum(d.profit     for d in outs), 2),
                'swap':        round(sum(d.swap       for d in outs), 2),
                'commission':  round(sum(d.commission for d in outs), 2),
                'time_open':   time_open,
                'time_close':  int(last_out.time),
                'tz_offset_sec': _tz_offset_sec(),
                'comment':     str(ind.comment if ind else last_out.comment or ''),
            })
        return sorted(result, key=lambda t: t['time_close'])
    except Exception:
        return []


def _serialize_paper_trades(trades: list[ManagedTrade], price: float,
                            instr: InstrCtx, spread: float = 0.0) -> list:
    out = []
    for t in trades:
        sign = 1 if t.direction == 'LONG' else -1
        # Floating PnL marked at the exit-side executable price (bid for a
        # LONG, ask for a SHORT), not at mid — same spread the close will pay.
        exec_px = paper_close_exec(t.direction, price, spread)
        pnl  = sign * (exec_px - t.entry_price) / instr.pip * instr.point_val * t.lot_size
        out.append({
            'ticket':     0,
            'symbol':     instr.symbol,
            'direction':  'BUY' if t.direction == 'LONG' else 'SELL',
            'lots':       t.lot_size,
            'open_price': round(t.entry_price, instr.digits),
            'price':      round(price, instr.digits),
            'profit':     round(pnl, 2),
            'swap':       0.0,
            'time_open':  int(t.entry_dt().timestamp()),
            'tz_offset_sec': 0,   # paper stamps are already true UTC (unlike MT5's)
            'comment':    f'paper {t.trade_id} {t.zone_id}',
            'sl':         round(t.sl, instr.digits),
            'tp1':        round(t.tp1, instr.digits),
            'tp2':        round(t.tp2, instr.digits),
            'tp1_hit':    t.tp1_hit,
        })
    return out


# ── Per-instrument engine ─────────────────────────────────────────────────────

class SymbolEngine:
    """The full GoldV2 strategy pipeline for ONE instrument. Shares the MT5
    connection, config and credentials with the orchestrator; owns its own
    zones / bias / volume profile / session levels / TradeManager / journal."""

    def __init__(self, bot: 'ConfluenceBot', instr: InstrCtx):
        self.bot   = bot
        self.instr = instr
        state_path = os.path.join(bot.log_dir, f'confluence_{instr.key}_state.json')
        self.tm      = TradeManager(state_path)
        self.journal = ConfluenceJournal(bot.log_dir, instr.symbol, instr.pip, instr.digits)

        self.zones: list[ZoneV2] = []
        self.trendlines: list[Trendline] = []
        self.htf_bias  = None
        self.vol_prof  = None
        self.sess_lvls = None
        self.atr_15m   = 0.0
        self.daily_atr = 0.0
        self.squeeze_ratio = 1.0
        self.vol_fc: Optional[dict] = None
        self.vol_levels: list[tuple[float, str]] = []
        self.oi_levels: list[tuple[float, str]] = []
        self.last_price: Optional[float] = None
        self._watch: dict[str, dict] = {}
        self._watch_dirty = False
        self._last_watch_push = 0.0
        # First-seen timestamp per zone_id, so the viewer can draw the zone box
        # from when it was detected (mirrors GoldV2's detected_at).
        self._zone_detected: dict[str, str] = {}
        # Today's PAPER closes in the dashboard positions-tab schema, so paper
        # trades reach the Positions → Trade History audit (live closes come from
        # MT5 deals). Cleared on UTC rollover so each day files under its date.
        self.closed_today: list[dict] = []

    @property
    def cfg(self) -> dict:
        return self.bot.cfg

    # ── lifecycle ──────────────────────────────────────────────────────────────

    def load_state(self) -> None:
        self.tm.load()
        if self.bot._mt5_ok and not self.cfg.get('paper_mode', True):
            adopted = self.tm.adopt_mt5_positions(mt5.positions_get() or [], MAGIC)
            if adopted:
                self.tm.save()

    # ── State refresh (slow path) ──────────────────────────────────────────────

    def state_refresh(self) -> None:
        instr = self.instr
        if self.tm.roll_day_if_needed():
            self.closed_today.clear()

        m1_n = int(self.cfg.get('m1_lookback_bars', 18_500))
        daily_bars = _bars(instr.symbol, 'D1',  60)
        h4_bars    = _bars(instr.symbol, 'H4',  200)
        h1_bars    = _bars(instr.symbol, 'H1',  96)
        m30_bars   = _bars(instr.symbol, 'M30', 150)
        m15_bars   = _bars(instr.symbol, 'M15', 150)
        m1_multiday = _bars(instr.symbol, 'M1', m1_n)

        if not m15_bars and not m30_bars:
            log.warning(f'[{instr.symbol}] No bar data — MT5 not connected / symbol missing')
            return

        now_utc  = datetime.now(timezone.utc)
        today_m1 = [b for b in m1_multiday
                    if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() == now_utc.date()]
        prev_m1  = [b for b in m1_multiday
                    if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() <
                       now_utc.date()][-1440:]

        vol_m1 = today_m1
        if not vol_m1 and m1_multiday:
            most_recent = max(datetime.fromtimestamp(b['time'], tz=timezone.utc).date()
                              for b in m1_multiday)
            vol_m1 = [b for b in m1_multiday
                      if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() == most_recent]

        # ── ATRs + squeeze ──────────────────────────────────────────────────────
        if m15_bars:
            self.atr_15m = _atr_from_list(m15_bars) or instr.pip * 10
        if daily_bars:
            self.daily_atr = _atr_from_list(daily_bars[-20:]) or instr.pip * 100
        if m15_bars and len(m15_bars) >= 100:
            self.squeeze_ratio = _atr_squeeze(m15_bars)

        # ── HTF bias ────────────────────────────────────────────────────────────
        if daily_bars and h4_bars:
            self.htf_bias = compute_htf_bias(daily_bars, h4_bars)

        price_now = self._get_price()
        if not price_now:
            log.warning(f'[{instr.symbol}] price unavailable — matrix skipped this cycle')
            return

        # ── Volume profile + session levels + trendlines ────────────────────────
        bucket = instr.bucket(self.cfg)
        if vol_m1:
            self.vol_prof = compute_volume_profile(
                vol_m1, prev_m1, price_now, all_m1_bars=m1_multiday,
                max_npoc_days=12, bucket=bucket)

        if h1_bars:
            prev_d1 = daily_bars[-2] if len(daily_bars) >= 2 else None
            self.sess_lvls = compute_session_levels(h1_bars, prev_d1, price_now,
                                                    m1_bars_multiday=m1_multiday,
                                                    digits=instr.digits)

        self.trendlines = []
        for tf, bars in [('H4', h4_bars), ('H1', h1_bars)]:
            if bars:
                self.trendlines.extend(detect_trendlines(bars, tf,
                                                         pip=instr.pip,
                                                         digits=instr.digits))

        self._refresh_vol_forecast()
        self._refresh_oi()

        # ── Level matrix ────────────────────────────────────────────────────────
        zone_tfs   = self.cfg.get('zone_tfs', ['H4', 'M30'])
        tf_bar_map = {'D1': daily_bars, 'H4': h4_bars, 'H1': h1_bars,
                      'M30': m30_bars, 'M15': m15_bars}
        bars_by_tf = {tf: tf_bar_map.get(tf) or [] for tf in zone_tfs}

        cluster_tol = float(self.cfg.get('cluster_tolerance', 3.0)) * instr.pip
        proximity   = float(self.cfg.get('proximity_pips', 5.0)) * instr.pip
        try:
            zones, debug = build_level_matrix(
                bars_by_tf, price_now,
                cluster_tolerance=cluster_tol,
                include_retests=bool(self.cfg.get('include_retests', True)),
                pip=instr.pip, digits=instr.digits,
            )
        except Exception as exc:
            log.error(f'[{instr.symbol}] matrix build failed: {exc}', exc_info=True)
            return

        missing = [n for n, v in [('vol_prof', self.vol_prof),
                                  ('sess_lvls', self.sess_lvls),
                                  ('htf_bias', self.htf_bias)] if not v]
        if zones and not missing:
            zones = score_zones(zones, self.vol_prof, self.sess_lvls, self.htf_bias,
                                trendlines=self.trendlines,
                                vol_levels=self.vol_levels,
                                oi_levels=self.oi_levels,
                                pip=instr.pip,
                                proximity=proximity)
            min_legs = int(self.cfg.get('min_distinct_legs', 1))
            zones = [z for z in zones
                     if z.distinct_legs >= min_legs or 'retest' in z.line_kinds]
            self.zones = zones
            self.journal.log_zone_map(self.zones, self.htf_bias,
                                      self.vol_prof, self.sess_lvls, debug)
        else:
            self.zones = []

        live_ids = {z.zone_id for z in self.zones if z.active}
        for zid in list(self.tm.armed.keys()):
            if zid not in live_ids:
                self.tm.disarm(zid)

        # Track first-seen time per active zone (for the viewer's zone box) and
        # drop entries for zones that no longer exist.
        now_iso = datetime.now(timezone.utc).isoformat()
        for zid in live_ids:
            self._zone_detected.setdefault(zid, now_iso)
        for zid in list(self._zone_detected.keys()):
            if zid not in live_ids:
                del self._zone_detected[zid]

        self.tm.save()

    def _refresh_vol_forecast(self) -> None:
        instr = self.instr
        self.vol_fc = None
        self.vol_levels = []
        if not self.cfg.get('use_vol_forecast', True) or not instr.vol_name:
            return
        try:
            r = requests.get(f'{self.bot.base_url}/api/vol-forecast', timeout=10)
            if r.status_code != 200:
                return
            f = (r.json().get('instruments') or {}).get(instr.vol_name)
            if not f:
                return
            anchor = self.sess_lvls.daily_open if self.sess_lvls else None
            if not anchor:
                return
            hl_med = float(f.get('hl_median') or 0)
            oc_med = float(f.get('oc_median') or 0)
            oc_75  = float(f.get('oc_75') or 0)
            if hl_med <= 0:
                return
            d = instr.digits
            self.vol_fc = {
                'expected_range': anchor * hl_med / 100.0,
                'upper_oc_med':   round(anchor * (1 + oc_med / 100.0), d),
                'lower_oc_med':   round(anchor * (1 - oc_med / 100.0), d),
                'upper_oc_75':    round(anchor * (1 + oc_75 / 100.0), d),
                'lower_oc_75':    round(anchor * (1 - oc_75 / 100.0), d),
                'anchor':         anchor,
                'hl_median_pct':  hl_med,
                'oc_75_pct':      oc_75,
            }
            self.vol_levels = [
                (self.vol_fc['upper_oc_med'], 'OC med ↑'),
                (self.vol_fc['lower_oc_med'], 'OC med ↓'),
                (self.vol_fc['upper_oc_75'],  'OC 75 ↑'),
                (self.vol_fc['lower_oc_75'],  'OC 75 ↓'),
            ]
        except Exception as exc:
            log.debug(f'[{instr.symbol}] vol-forecast fetch failed: {exc}')

    def _refresh_oi(self) -> None:
        """Pull today's options-OI levels for this instrument from the dashboard
        (KV oi_store → the JS oiConfluence.oiStoreToLevels brick, served by
        /api/oi-levels — the ONE source of truth, no Python re-port). The user
        pastes OI into the analyser each morning; this reads whatever is current
        each state refresh, so a fresh paste flows through on the next cycle.
        Levels are [(price, type)] where type ∈ put_wall/call_wall/max_pain/
        gamma_flip/hvl; score_zones credits a zone sitting on one."""
        instr = self.instr
        self.oi_levels = []
        if not self.cfg.get('use_oi', True):
            return
        try:
            r = requests.get(f'{self.bot.base_url}/api/oi-levels', timeout=10)
            if r.status_code != 200:
                return
            by_instr = r.json().get('byInstrument') or {}
            raw = by_instr.get(instr.key)
            if not raw:
                # Fall back to a slash/underscore-stripped display match
                # (e.g. 'EUR/USD' → 'eurusd') if the store keyed it differently.
                alt = instr.display.lower().replace('/', '').replace('_', '')
                raw = by_instr.get(alt)
            if not raw:
                return
            self.oi_levels = [(float(l['price']), str(l.get('type') or 'oi'), l.get('tier'))
                              for l in raw
                              if isinstance(l, dict) and l.get('price') is not None]
        except Exception as exc:
            log.debug(f'[{instr.symbol}] oi-levels fetch failed: {exc}')

    # ── Price tick (fast path) ─────────────────────────────────────────────────

    def price_tick(self) -> None:
        price = self._get_price()
        if not price:
            return
        self.last_price = price

        if self.sess_lvls:
            self.sess_lvls.current_price = price
            if price > self.sess_lvls.today_high:
                self.sess_lvls.today_high = round(price, self.instr.digits)
            if price < self.sess_lvls.today_low:
                self.sess_lvls.today_low = round(price, self.instr.digits)

        if self.tm.roll_day_if_needed():
            self.closed_today.clear()
        self._manage_trades(price)
        self._expire_trades(price)

        if not _in_trade_window(self.cfg):
            return
        self._check_armed_zones(price)
        self._scan_zones(price)

    # ── trade management ───────────────────────────────────────────────────────

    def _paper_spread(self) -> float:
        """Full paper round-trip spread in PRICE units for this instrument."""
        return paper_spread_price(self.instr, self.cfg)

    def _manage_trades(self, price: float) -> None:
        spread = self._paper_spread()
        for trade in list(self.tm.open_trades):
            trade.update_excursion(price, self.instr.pip)
            if trade.mode == 'LIVE' and trade.ticket and self.bot._mt5_ok:
                self._manage_live_trade(trade, price)
            else:
                # Paper outcomes + closes use the exit-side executable price
                # (LONG closes at bid, SHORT at ask) so the recorded PnL pays
                # the exit half-spread; entry already paid the other half.
                event = trade.check_outcome(price, self.cfg.get('be_after_tp1', True),
                                            spread=spread)
                exec_px = round(paper_close_exec(trade.direction, price, spread),
                                self.instr.digits)
                if event == 'TP1_HIT':
                    self.journal.log_tp1_hit(trade, exec_px)
                elif event in ('TP2_HIT', 'SL_HIT', 'BE_STOP'):
                    self.journal.log_trade_closed(trade, exec_px, event)
                    self._on_trade_closed(trade, exec_px, event)

    def _manage_live_trade(self, trade: ManagedTrade, price: float) -> None:
        instr  = self.instr
        ticket = trade.ticket
        if not trade.tp1_hit:
            hit = (trade.direction == 'LONG' and price >= trade.tp1) or \
                  (trade.direction == 'SHORT' and price <= trade.tp1)
            if hit:
                trade.tp1_hit = True
                self.journal.log_tp1_hit(trade, price)
                if self.cfg.get('be_after_tp1', True):
                    try:
                        mt5.order_send({
                            'action':   mt5.TRADE_ACTION_SLTP,
                            'position': ticket,
                            'sl':       round(trade.entry_price, instr.digits),
                            'tp':       round(trade.tp2, instr.digits),
                        })
                        trade.be_moved = True
                        trade.sl = trade.entry_price
                        log.info(f'[LIVE] {instr.symbol} TP1 — SL → BE {trade.entry_price}')
                    except Exception as exc:
                        log.warning(f'[LIVE] {instr.symbol} BE move failed: {exc}')
                self.tm.save()

        if mt5.positions_get(ticket=ticket):
            return

        deals = mt5.history_deals_get(
            trade.entry_dt() - timedelta(minutes=1),
            datetime.now(timezone.utc) + timedelta(minutes=1),
        ) or []
        exit_deals = [d for d in deals if d.position_id == ticket and d.entry in (1, 3)]
        if exit_deals:
            last  = max(exit_deals, key=lambda d: d.time)
            px    = float(last.price)
            if trade.be_moved and abs(px - trade.entry_price) < max(instr.pip, self.atr_15m * 0.2):
                reason = 'BE_STOP'
            elif (trade.direction == 'LONG' and px >= trade.tp2 * 0.999) or \
                 (trade.direction == 'SHORT' and px <= trade.tp2 * 1.001):
                reason = 'TP2_HIT'
            else:
                reason = 'SL_HIT'
            self.journal.log_trade_closed(trade, px, reason)
            self._on_trade_closed(trade, px, reason)
            return
        event = trade.check_outcome(price, self.cfg.get('be_after_tp1', True))
        if event not in ('TP2_HIT', 'SL_HIT', 'BE_STOP'):
            return
        self.journal.log_trade_closed(trade, price, event)
        self._on_trade_closed(trade, price, event)

    def _expire_trades(self, price: float) -> None:
        if not _past_window_end(self.cfg):
            return
        for trade in list(self.tm.open_trades):
            allowed_overnight = (self.cfg.get('allow_overnight_htf_aligned', True)
                                 and trade.htf_aligned)
            if allowed_overnight:
                continue
            close_px = price
            if trade.mode == 'LIVE' and trade.ticket and self.bot._mt5_ok:
                if not _close_live_position(self.instr, trade.ticket):
                    log.warning(f'[EXPIRE] {self.instr.symbol} live close failed {trade.ticket}')
                    continue
            else:
                # Paper EOD close pays the exit half-spread like any other close.
                close_px = round(paper_close_exec(trade.direction, price,
                                                  self._paper_spread()),
                                 self.instr.digits)
            self.journal.log_trade_closed(trade, close_px, 'EXPIRED')
            self._on_trade_closed(trade, close_px, 'EXPIRED')

    def _on_trade_closed(self, trade: ManagedTrade, close_price: float, reason: str) -> None:
        self.tm.close_trade(trade)
        self.tm.start_zone_cooldown(trade.zone_id, int(self.cfg.get('cooldown_minutes', 30)))
        self.tm.save()
        self._record_closed_for_audit(trade, close_price, reason)
        self._push_trade_kv(trade, close_price, reason)

    def _record_closed_for_audit(self, trade: ManagedTrade, close_price: float,
                                 reason: str) -> None:
        """Append a PAPER close to closed_today in the dashboard positions-tab
        schema (real $ P&L) so it lands in Positions → Trade History. Live
        closes are already carried by _serialize_closed_trades(MAGIC)."""
        if trade.mode != 'PAPER':
            return
        instr = self.instr
        sign  = 1 if trade.direction == 'LONG' else -1
        # close_price is already the exit-side exec (spread paid both sides);
        # the overnight swap placeholder is charged here as an explicit
        # 'swap' line, exactly like MT5 reports it for live positions.
        swap_money = paper_swap_pips(trade, instr, self.cfg) * instr.point_val * trade.lot_size
        profit = (sign * (close_price - trade.entry_price) / instr.pip
                  * instr.point_val * trade.lot_size) - swap_money
        entry_dt = trade.entry_dt()
        self.closed_today.append({
            # position_id is unique+stable per trade so repeated status pushes
            # dedupe idempotently in the worker's mergeTradeHistory.
            'position_id': f'cf_{instr.key}_{trade.trade_id}',
            'symbol':      instr.symbol,
            'direction':   'BUY' if trade.direction == 'LONG' else 'SELL',
            'lots':        trade.lot_size,
            'open_price':  round(trade.entry_price, instr.digits),
            'close_price': round(close_price, instr.digits),
            'profit':      round(profit, 2),
            'swap':        round(-swap_money, 2),
            'commission':  0.0,   # spread already paid via bid/ask exec prices
            'time_open':   int(entry_dt.timestamp()),
            'time_close':  int(datetime.now(timezone.utc).timestamp()),
            'tz_offset_sec': 0,   # paper stamps are already true UTC (unlike MT5's)
            'comment':     f'paper {trade.trade_id} {reason} [{instr.display}]',
        })

    def _push_trade_kv(self, trade: ManagedTrade, close_price: float, reason: str) -> None:
        """Append the closed trade to KV confluence_bot_trades (rolling history)."""
        try:
            instr = self.instr
            sign = 1 if trade.direction == 'LONG' else -1
            pnl  = sign * (close_price - trade.entry_price) / instr.pip
            # Paper trades: subtract the overnight swap placeholder (close_price
            # already carries the spread via exit-side exec). Live pnl stays as
            # recorded — MT5 reports live swap/commission separately.
            swap_pips = paper_swap_pips(trade, instr, self.cfg) if trade.mode == 'PAPER' else 0.0
            pnl = round(pnl - swap_pips, 1)
            if reason == 'BE_STOP':
                result = 'BREAKEVEN'
            elif reason == 'EXPIRED':
                result = 'EXPIRED'
            else:
                result = 'WIN' if pnl > 0 else ('LOSS' if pnl < 0 else 'BREAKEVEN')
            entry_dt = trade.entry_dt()
            rec = {
                'trade_id':     trade.trade_id,
                'symbol':       instr.symbol,
                'instrument':   instr.display,
                'date':         entry_dt.strftime('%Y-%m-%d'),
                'time':         entry_dt.strftime('%H:%M:%S'),
                'zone_id':      trade.zone_id,
                'direction':    trade.direction,
                'score':        trade.zone_score,
                'entry':        trade.entry_price,
                'sl_pips':      round(abs(trade.entry_price - trade.sl) / instr.pip, 1),
                'close_reason': reason,
                'close_price':  round(close_price, instr.digits),
                'pnl_pips':     pnl,
                'swap_pips':    round(-swap_pips, 2),
                'mfe_pips':     trade.mfe_pips,
                'mae_pips':     trade.mae_pips,
                'result':       result,
                'mode':         trade.mode,
                'sl_basis':     trade.sl_basis,
                'tp_basis':     trade.tp_basis,
            }
            existing = _kv_get(KV_TRADES, self.bot.base_url) or {}
            trades = existing.get('trades', [])
            trades = [t for t in trades if t.get('trade_id') != rec['trade_id']]
            trades.append(rec)
            trades = trades[-800:]
            _kv_put(KV_TRADES,
                    {'updated_at': datetime.now(timezone.utc).isoformat(), 'trades': trades},
                    self.bot.base_url)
        except Exception as exc:
            log.debug(f'[KV] trade history push failed: {exc}')

    # ── arming & confirmation ──────────────────────────────────────────────────

    def _min_score(self) -> float:
        base = float(self.cfg.get('min_zone_score', 4.0))
        if self.squeeze_ratio < 0.65:
            return base + 1.5
        if self.squeeze_ratio < 0.75:
            return base + 0.75
        return base

    def _scan_zones(self, price: float) -> None:
        if len(self.tm.armed) >= int(self.cfg.get('max_armed_zones', 3)):
            return
        min_score = self._min_score()
        prox = float(self.cfg.get('proximity_pips', 5.0)) * self.instr.pip
        htf  = self.htf_bias
        block_conf = float(self.cfg.get('htf_block_confidence', 0.5))

        for zone in self.zones:
            if len(self.tm.armed) >= int(self.cfg.get('max_armed_zones', 3)):
                break
            if not zone.active or zone.score < min_score:
                continue
            if self.tm.is_armed(zone.zone_id) or self.tm.in_zone_cooldown(zone.zone_id):
                continue
            if self.tm.zone_has_open_trade(zone.zone_id):
                continue
            if (self.cfg.get('htf_block', True) and htf and htf.bias != 'NEUTRAL'
                    and htf.confidence >= block_conf):
                if htf.bias == 'BULL' and zone.direction == 'short':
                    continue
                if htf.bias == 'BEAR' and zone.direction == 'long':
                    continue
            dist = max(0.0, max(zone.gp_low - price, price - zone.gp_high))
            if dist <= prox:
                inside = zone.gp_low <= price <= zone.gp_high
                self.tm.arm(zone.zone_id, time.time(), inside)
                self.journal.log_zone_approached(zone, price, dist / self.instr.pip)

    def _update_watch(self, zone: ZoneV2, vu) -> None:
        min_comp = int(self.cfg.get('vu_min_components', 2))
        if vu.vetoed:
            verdict = vu.reason
        elif vu.direction != 'NEUTRAL':
            verdict = f'CONFIRMED {vu.direction} — {vu.reason}'
        else:
            parts = []
            if self.cfg.get('vu_require_wt', True) and not vu.wt_confirmed:
                parts.append('WT missing (need OS/OB or divergence)')
            if vu.components_aligned < min_comp:
                parts.append(f'{vu.components_aligned}/{min_comp} aligned'
                             + (f' ({vu.reason})' if vu.reason != 'No alignment' else ''))
            verdict = ' · '.join(parts) or vu.reason

        snap = {
            'wt1': vu.wt1, 'wt': vu.wt_signal, 'wt_ok': vu.wt_confirmed,
            'mf': vu.mf_value, 'mf_sig': vu.mf_signal,
            'vwap': vu.vwap_signal, 'vwap_div': vu.vwap_divergence,
            'aligned': vu.components_aligned, 'veto': vu.vetoed,
            'verdict': verdict,
            'at': datetime.now(timezone.utc).strftime('%H:%M:%SZ'),
        }
        prev = self._watch.get(zone.zone_id)
        state_key = (vu.wt_signal, vu.mf_signal, vu.vwap_signal, vu.vwap_divergence,
                     vu.components_aligned, vu.vetoed)
        prev_key = (prev['wt'], prev['mf_sig'], prev['vwap'], prev['vwap_div'],
                    prev['aligned'], prev['veto']) if prev else None
        self._watch[zone.zone_id] = snap
        if state_key != prev_key:
            self._watch_dirty = True
            self.journal.log_vu_watch(zone.zone_id, snap)

    def _push_watch_if_due(self, price: float) -> None:
        now = time.time()
        if self._watch_dirty and now - self._last_watch_push >= 30:
            self.bot.push_status()
            self._watch_dirty = False
            self._last_watch_push = now

    def _check_armed_zones(self, price: float) -> None:
        for zid in list(self._watch.keys()):
            if zid not in self.tm.armed:
                del self._watch[zid]
                self._watch_dirty = True
        if not self.tm.armed:
            return

        m5_bars = _bars(self.instr.symbol, 'M5', 60)

        for zid, armed in list(self.tm.armed.items()):
            zone = next((z for z in self.zones if z.zone_id == zid and z.active), None)
            if not zone:
                self.tm.disarm(zid)
                continue

            prox = max(float(self.cfg.get('proximity_pips', 5.0)) * self.instr.pip * 2,
                       self.atr_15m * 1.0)
            dist = max(0.0, max(zone.gp_low - price, price - zone.gp_high))
            if dist > prox:
                self.tm.disarm(zid)
                continue

            if zone.gp_low <= price <= zone.gp_high and armed.gp_entry_time is None:
                armed.gp_entry_time = time.time()

            if not m5_bars:
                continue

            vu = compute_vumanchu(
                m5_bars, zone.direction,
                min_components=int(self.cfg.get('vu_min_components', 2)),
                entry_time=armed.gp_entry_time,
                require_wt=bool(self.cfg.get('vu_require_wt', True)),
                fuel_veto=bool(self.cfg.get('mf_fuel_veto', True)),
            )
            self._update_watch(zone, vu)
            if vu.vetoed or vu.direction == 'NEUTRAL':
                continue
            self._try_enter(zone, vu, price)

        self._push_watch_if_due(price)

    def _try_enter(self, zone: ZoneV2, vu, price: float) -> None:
        instr = self.instr
        direction = vu.direction

        if self.cfg.get('gold_macro_gate', True):
            ok, reason = _macro_allows(direction, self.bot.base_url, instr)
            if not ok:
                self.journal.log_skip(zone.zone_id, 'macro', reason)
                self.tm.disarm(zone.zone_id)
                self.tm.start_zone_cooldown(zone.zone_id, 15)
                return

        if self.cfg.get('ml_gate', False):
            ok, reason = _ml_allows(zone.zone_id, self.bot.base_url, instr)
            if not ok:
                self.journal.log_skip(zone.zone_id, 'ml', reason)
                self.tm.disarm(zone.zone_id)
                return

        plan, skip = plan_exits(
            zone, direction, price,
            confirm_swing=vu.confirm_swing,
            atr_15m=self.atr_15m, daily_atr=self.daily_atr,
            today_high=self.sess_lvls.today_high if self.sess_lvls else price,
            today_low=self.sess_lvls.today_low if self.sess_lvls else price,
            zones=self.zones, vol=self.vol_prof, session=self.sess_lvls,
            cfg=self.cfg, vol_fc=self.vol_fc,
            pip=instr.pip, digits=instr.digits,
        )
        if plan is None:
            self.journal.log_skip(zone.zone_id, 'exits', skip)
            self.tm.disarm(zone.zone_id)
            self.tm.start_zone_cooldown(zone.zone_id, 15)
            return

        risk_pct = float(self.cfg.get('risk_pct', 0.5))

        # Per-instrument portfolio gate, then the global cross-instrument gate.
        ok, reason = self.tm.can_open(direction, risk_pct, price, self.cfg, pip=instr.pip)
        if not ok:
            self.journal.log_skip(zone.zone_id, 'portfolio', reason)
            return
        ok, reason = self.bot.global_can_open(direction, risk_pct, self.instr)
        if not ok:
            self.journal.log_skip(zone.zone_id, 'global', reason)
            return

        balance  = _mt5_balance()
        lot_size = _calc_lot_size(balance, risk_pct, plan.sl_dist, instr,
                                  float(self.cfg.get('max_lot', 5.0)))

        paper_mode = self.cfg.get('paper_mode', True)
        ticket = None
        if not paper_mode and self.bot._mt5_ok:
            ticket = _place_live_order(instr, direction, plan.sl, plan.tp2, lot_size, zone.zone_id)
            if not ticket:
                self.journal.log_skip(zone.zone_id, 'live_order', 'order placement failed')
                self.tm.disarm(zone.zone_id)
                self.tm.start_zone_cooldown(zone.zone_id, 5)
                return

        # Paper entries pay the entry half-spread: a BUY fills at the ask =
        # mid + spread/2, a SELL at the bid = mid − spread/2. Live orders
        # already fill at the broker's real bid/ask (_place_live_order), so
        # the recorded live entry stays the mid exactly as before.
        entry_exec = price
        if not ticket:
            half = self._paper_spread() / 2.0
            entry_exec = round(price + half if direction == 'LONG' else price - half,
                               instr.digits)

        trade = ManagedTrade(
            trade_id=self.tm.next_trade_id(),
            zone_id=zone.zone_id,
            direction=direction,
            entry_price=entry_exec,
            sl=plan.sl, tp1=plan.tp1, tp2=plan.tp2,
            lot_size=lot_size, risk_pct=risk_pct,
            entry_time=datetime.now(timezone.utc).isoformat(),
            mode='LIVE' if ticket else 'PAPER',
            ticket=ticket,
            htf_aligned=zone.htf_aligned,
            sl_basis=plan.sl_basis, tp_basis=plan.tp2_basis,
            zone_score=zone.score,
            symbol=instr.symbol,
        )
        self.tm.open_trade(trade)
        self.tm.start_global_cooldown(int(self.cfg.get('global_cooldown_minutes', 10)))
        self.tm.save()
        self.journal.log_entry(trade, zone, vu, plan)
        self.bot.push_status()

    # ── Utilities ───────────────────────────────────────────────────────────────

    def _get_price(self) -> float | None:
        return _live_price(self.instr, self.bot.base_url)

    # ── Status / zones payloads (assembled by the orchestrator) ─────────────────

    def status_detail(self) -> dict:
        return {
            'symbol':       self.instr.symbol,
            'instrument':   self.instr.display,
            'key':          self.instr.key,
            'state': ('MANAGING' if self.tm.open_trades
                      else 'ARMED' if self.tm.armed else 'WAITING'),
            'htf_bias':     self.htf_bias.bias if self.htf_bias else 'UNKNOWN',
            'htf_detail': (f'{self.htf_bias.daily_trend}/{self.htf_bias.h4_trend}'
                           if self.htf_bias else ''),
            'zones_active': len([z for z in self.zones if z.active]),
            'top_zones': [
                {'zone_id': z.zone_id, 'score': z.score,
                 'entry_window': f'{z.gp_low}–{z.gp_high}',
                 'in_gp': z.in_gp, 'legs': z.distinct_legs,
                 'tf': z.tf, 'dir': z.direction}
                for z in self.zones[:3]
            ],
            'trades_today': self.tm.trades_today,
            'open_trades':  len(self.tm.open_trades),
            'armed_zones':  list(self.tm.armed.keys()),
            'armed_detail': {zid: {'t': a.gp_entry_time, 'watch': self._watch.get(zid)}
                             for zid, a in self.tm.armed.items()},
            'squeeze_ratio': self.squeeze_ratio,
            'price':        self.last_price,
        }

    def _zone_kv_dict(self, z: ZoneV2) -> dict:
        """Zone → KV dict, shaped identically to GoldV2's gold_v2_zones entry
        (raw legs + primary-leg fib ladder / swing times) so the gold-zones.html
        V2 viewer renders a Confluence pair with no renderer changes. Prices are
        rounded to this instrument's digit precision."""
        d = self.instr.digits
        out = {
            'zone_id':       z.zone_id,
            'tf':            z.tf,
            'direction':     z.direction,
            'in_gp':         z.in_gp,
            'zone_variant':  'gp' if z.in_gp else ('+'.join(z.line_kinds) or 'cluster'),
            'gp_low':        z.gp_low,
            'gp_high':       z.gp_high,
            'centre':        z.centre,
            'distinct_legs': z.distinct_legs,
            'line_kinds':    z.line_kinds,
            'swing_origin':  z.swing_origin,
            'swing_end':     z.swing_end,
            'score':         z.score,
            'htf_aligned':   z.htf_aligned,
            'composition':   z.composition,
            'detected_at':   self._zone_detected.get(z.zone_id),
            'legs': [
                {'leg_id': lg.leg_id, 'tf': lg.tf, 'origin': lg.origin, 'end': lg.end,
                 'origin_time': lg.origin_time, 'end_time': lg.end_time, 'size': lg.size}
                for lg in z.legs
            ],
        }
        p = z.primary
        if p:
            r    = p.size
            sign = -1 if z.direction == 'long' else 1
            base = p.end
            out.update({
                'swing_origin_time': p.origin_time,
                'swing_end_time':    p.end_time,
                'impulse_size':      p.size,
                'level_382':         round(base + sign * 0.382 * r, d),
                'level_500':         round(base + sign * 0.500 * r, d),
                'level_618':         round(base + sign * 0.618 * r, d),
                'level_650':         round(base + sign * 0.650 * r, d),
                'level_786':         round(base + sign * 0.786 * r, d),
                'level_886':         round(base + sign * 0.886 * r, d),
            })
        return out

    def zone_payload(self) -> dict:
        """Full per-symbol payload, shaped like gold_v2_zones plus page meta
        (oanda symbol, digits, pip) so gold-zones.html can fetch the right
        candles/quote and format prices for this instrument."""
        s = self.sess_lvls
        v = self.vol_prof
        return {
            'timestamp':      datetime.now(timezone.utc).isoformat(),
            # ── page meta (per-instrument fetch + formatting) ──
            'instrument':     self.instr.display,
            'symbol':         self.instr.symbol,
            'oanda':          self.instr.oanda,
            'digits':         self.instr.digits,
            'pip':            self.instr.pip,
            # ── v2-shaped payload ──
            'atr':            round(self.atr_15m, self.instr.digits),
            'daily_atr':      round(self.daily_atr, self.instr.digits),
            'htf_bias':       self.htf_bias.bias if self.htf_bias else 'UNKNOWN',
            'htf_confidence': round(self.htf_bias.confidence, 2) if self.htf_bias else 0.0,
            'session':        s.current_session if s else 'UNKNOWN',
            'vwap':           s.vwap if s else 0.0,
            'armed_zones':    list(self.tm.armed.keys()),
            'open_trades':    len(self.tm.open_trades),
            'squeeze_ratio':  self.squeeze_ratio,
            'vol_forecast':   self.vol_fc,
            'zones':          [self._zone_kv_dict(z) for z in self.zones if z.active],
            'npoc_stack': [
                {'price': n.price, 'age_days': n.age_days, 'date': n.date}
                for n in (v.npoc_stack if v else [])
            ],
            'vwap_anchors': [
                {'price': a.price, 'session': a.session, 'age_days': a.age_days,
                 'direction': a.direction, 'drive_size': a.drive_size, 'date': a.date}
                for a in (s.vwap_anchors if s else [])
            ],
            'trendlines': [
                {'tf': tl.tf, 'kind': tl.kind, 'touches': tl.touches,
                 'projected': tl.projected, 'slope': tl.slope}
                for tl in self.trendlines
            ],
            'pivot_levels': {
                'pp': s.pivot, 'r1': s.r1, 'r2': s.r2, 's1': s.s1, 's2': s.s2,
                'vah': v.vah if v else None, 'val': v.val if v else None,
                'poc': v.poc if v else None, 'vwap': s.vwap,
                'daily_open': s.daily_open,
            } if s else None,
        }

    def paper_positions(self) -> list:
        if self.last_price is None:
            return []
        return _serialize_paper_trades(
            [t for t in self.tm.open_trades if t.mode == 'PAPER'],
            self.last_price, self.instr, spread=self._paper_spread())


# ── Orchestrator ──────────────────────────────────────────────────────────────

class ConfluenceBot:
    def __init__(self, args: argparse.Namespace):
        self.args     = args
        self.base_url = os.getenv('DASHBOARD_URL', DASHBOARD_URL)
        self.log_dir  = args.log_dir
        self.cfg      = DEFAULT_CFG.copy()
        if args.pairs:
            self.cfg['pairs'] = [p.strip() for p in args.pairs.split(',') if p.strip()]
        self.cfg['paper_mode'] = not args.live
        self.engines: dict[str, SymbolEngine] = {}
        self._mt5_ok  = False
        self.last_state_refresh = 0.0
        # Latch for the live-guard warning — warn once per KV state change,
        # not on every 120s refresh.
        self._live_blocked_warned = False

    def _enforce_live_guard(self) -> None:
        """LIVE requires BOTH the --live flag AND KV paper_mode:false. Without
        --live, a paper_mode:false arriving via the KV config refresh must
        never silently flip a locally-started paper bot live."""
        kv_wants_live = not self.cfg.get('paper_mode', True)
        if kv_wants_live and not self.args.live:
            self.cfg['paper_mode'] = True
            if not self._live_blocked_warned:
                log.warning('[SAFETY] KV config requests LIVE (paper_mode: false) but the '
                            'bot was started WITHOUT --live — staying in PAPER mode. '
                            'Restart with --live to allow live orders.')
                self._live_blocked_warned = True
        elif not kv_wants_live:
            self._live_blocked_warned = False   # re-warn on the next KV live flip

    # ── engine wiring ───────────────────────────────────────────────────────────

    def _rebuild_engines(self) -> None:
        """(Re)build the per-instrument engines to match cfg['pairs']. Engines
        for pairs that stay configured are preserved (state kept in memory)."""
        overrides = self.cfg.get('broker_overrides', {}) or {}
        wanted: dict[str, InstrCtx] = {}
        for sym in self.cfg.get('pairs', []):
            instr = build_instr(sym, overrides)
            if instr:
                wanted[instr.key] = instr

        for key in list(self.engines.keys()):
            if key not in wanted:
                log.info(f'[INSTR]  {key} removed from configured pairs — engine dropped')
                del self.engines[key]

        for key, instr in wanted.items():
            if key not in self.engines:
                eng = SymbolEngine(self, instr)
                eng.load_state()
                self.engines[key] = eng
                log.info(f'[INSTR]  {instr.display} ({instr.symbol}) '
                         f'pip={instr.pip} pt=${instr.point_val} → engine ready')

    # ── global portfolio gate ────────────────────────────────────────────────────

    def _currency_risk_map(self) -> dict:
        """Signed net risk-% per CURRENCY across all open trades: a LONG on
        base/quote adds +risk to the base currency and −risk to the quote
        (short reversed). BE-moved trades carry no remaining risk, matching
        the max_total_open_risk_pct accounting. Non-pair instruments (indices)
        contribute only the legs _ccy_legs can name."""
        net: dict[str, float] = {}
        for e in self.engines.values():
            legs = _ccy_legs(e.instr.display)
            if not legs:
                continue
            base, quote = legs
            for t in e.tm.open_trades:
                if t.be_moved:
                    continue
                sign = 1.0 if t.direction == 'LONG' else -1.0
                net[base]  = net.get(base, 0.0)  + sign * t.risk_pct
                net[quote] = net.get(quote, 0.0) - sign * t.risk_pct
        return net

    def global_can_open(self, direction: str, risk_pct: float,
                        instr: InstrCtx | None = None) -> tuple[bool, str]:
        cfg = self.cfg
        total_open = sum(len(e.tm.open_trades) for e in self.engines.values())
        if total_open >= int(cfg.get('max_total_open_trades', 6)):
            return False, f'global max open trades ({total_open})'
        total_risk = sum(t.risk_pct for e in self.engines.values()
                         for t in e.tm.open_trades if not t.be_moved)
        cap = float(cfg.get('max_total_open_risk_pct', 3.0))
        if total_risk + risk_pct > cap + 1e-9:
            return False, f'global open risk {total_risk + risk_pct:.2f}% > cap {cap:.2f}%'
        same = sum(1 for e in self.engines.values()
                   for t in e.tm.open_trades if t.direction == direction)
        if same >= int(cfg.get('max_total_per_direction', 5)):
            return False, f'global max {direction} positions ({same})'
        # Per-currency netting — the LONG/SHORT label caps above can't see that
        # long EUR/USD + long GBP/USD + short USD/JPY are ONE stacked short-USD
        # bet. Each trade contributes signed risk to its base and quote
        # currencies; block if this entry pushes any single currency's |net|
        # over the cap (never blocks an entry that REDUCES that |net|).
        ccy_cap = float(cfg.get('max_currency_risk_pct', 1.5))
        legs = _ccy_legs(instr.display) if instr else None
        if legs and ccy_cap > 0:
            net = self._currency_risk_map()
            sign = 1.0 if direction == 'LONG' else -1.0
            for ccy, delta in ((legs[0], sign * risk_pct), (legs[1], -sign * risk_pct)):
                before = net.get(ccy, 0.0)
                after = before + delta
                if abs(after) > ccy_cap + 1e-9 and abs(after) > abs(before):
                    return False, (f'currency risk cap: net {ccy} {before:+.2f}% '
                                   f'→ {after:+.2f}% exceeds ±{ccy_cap:.2f}%')
        return True, ''

    # ── lifecycle ─────────────────────────────────────────────────────────────────

    def start(self) -> None:
        log.info('=' * 70)
        log.info('CONFLUENCE BOT starting  (multi-instrument level-matrix strategy)')
        log.info(f'Mode: {"PAPER" if self.cfg.get("paper_mode", True) else "LIVE"}   magic={MAGIC}')
        log.info('=' * 70)

        if HAS_MT5:
            creds = _load_mt5_creds(self.base_url)
            self._mt5_ok = _init_mt5(creds)
            if self._mt5_ok:
                info = mt5.account_info()
                if info:
                    log.info(f'[MT5] connected  account={info.login}  '
                             f'balance={info.balance:.2f} {info.currency}  server={info.server}')
            else:
                log.warning('MT5 unavailable — price from dashboard, no execution')
        else:
            log.info('MT5 not installed — paper mode only')

        self.cfg = _load_config(self.base_url)
        self._enforce_live_guard()
        if self.args.pairs:
            self.cfg['pairs'] = [p.strip() for p in self.args.pairs.split(',') if p.strip()]
        self._rebuild_engines()
        log.info(f'[INIT]  {len(self.engines)} instrument engine(s) active: '
                 f'{", ".join(e.instr.display for e in self.engines.values())}')

        try:
            self._main_loop()
        except KeyboardInterrupt:
            log.info('Interrupted — printing session summaries')
        finally:
            for e in self.engines.values():
                e.tm.save()
                e.journal.print_summary()
            if HAS_MT5 and self._mt5_ok:
                mt5.shutdown()

    def _main_loop(self) -> None:
        while True:
            now = time.time()
            if now - self.last_state_refresh >= self.args.state_interval:
                self._state_refresh_all()
                self.last_state_refresh = now

            self._price_tick_all()

            if self.args.once:
                break
            time.sleep(self.args.price_interval)

    def _state_refresh_all(self) -> None:
        self.cfg = _load_config(self.base_url)
        self._enforce_live_guard()
        if self.args.pairs:
            self.cfg['pairs'] = [p.strip() for p in self.args.pairs.split(',') if p.strip()]
        if not self.cfg.get('enabled', True):
            log.info('[REFRESH] Bot disabled via config — skipping')
            self.push_status()
            return
        self._rebuild_engines()
        log.info(f'[REFRESH] {len(self.engines)} instrument(s)...')
        for e in self.engines.values():
            try:
                _run_with_timeout(e.state_refresh, self.args.refresh_timeout)
            except TimeoutError as exc:
                log.error(f'[{e.instr.symbol}] state refresh TIMED OUT — skipping this cycle: {exc}')
            except Exception as exc:
                log.error(f'[{e.instr.symbol}] state refresh failed: {exc}', exc_info=True)
        self.push_status()
        self.push_zones()

    def _price_tick_all(self) -> None:
        if not self.cfg.get('enabled', True):
            return
        for e in self.engines.values():
            try:
                e.price_tick()
            except Exception as exc:
                log.error(f'[{e.instr.symbol}] price tick failed: {exc}', exc_info=True)

    # ── KV push ───────────────────────────────────────────────────────────────────

    def push_status(self) -> None:
        paper_mode = self.cfg.get('paper_mode', True)
        positions = _serialize_open_positions(MAGIC)
        if not positions:
            for e in self.engines.values():
                positions += e.paper_positions()

        symbols = [e.status_detail() for e in self.engines.values()]
        total_open  = sum(s['open_trades'] for s in symbols)
        total_armed = sum(len(s['armed_zones']) for s in symbols)
        state = ('MANAGING' if total_open else 'ARMED' if total_armed else 'WAITING')

        # Live closes come from MT5 deals; paper closes are carried per engine so
        # both flow into the Positions → Trade History audit.
        closed_today = _serialize_closed_trades(MAGIC)
        for e in self.engines.values():
            closed_today += e.closed_today

        status = {
            'bot': 'confluence_bot',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'pushed_at': int(time.time()),
            'state': state,
            'paper_mode': paper_mode,
            'instruments': len(self.engines),
            'open_trades': total_open,
            'armed_total': total_armed,
            'trades_today': sum(s['trades_today'] for s in symbols),
            'symbols': symbols,
            'account_login': _mt5_account_login(),
            'mt5_positions': positions,
            'today_closed_trades': closed_today,
        }
        _kv_put(KV_STATUS, status, self.base_url)

    def push_zones(self) -> None:
        try:
            payload = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'symbols': {e.instr.key: e.zone_payload() for e in self.engines.values()},
            }
            _kv_put(KV_ZONES, payload, self.base_url)
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Confluence Bot — multi-instrument level-matrix strategy')
    p.add_argument('--live',           action='store_true',
                   help='Send real orders to MT5 (default: paper)')
    p.add_argument('--pairs',          default=None, metavar='LIST',
                   help='Comma-separated instrument list override (e.g. "EUR/USD,GOLD,NQ")')
    p.add_argument('--price-interval', type=float, default=3.0, metavar='SECS',
                   help='Price tick interval (default 3s)')
    p.add_argument('--state-interval', type=float, default=120.0, metavar='SECS',
                   help='State refresh interval (default 120s)')
    p.add_argument('--refresh-timeout', type=float, default=30.0, metavar='SECS',
                   help='Max seconds for a single instrument\'s state refresh before it is '
                        'skipped this cycle (default 30s) — guards against a hung MT5 call '
                        'or runaway compute freezing the whole bot')
    p.add_argument('--once',           action='store_true',
                   help='Run a single state refresh + price tick then exit')
    p.add_argument('--log-dir',        default='.', metavar='DIR',
                   help='Directory for journal / CSV / state files')
    p.add_argument('--dashboard-url',  default=None, metavar='URL',
                   help='Override dashboard base URL')
    return p.parse_args()


if __name__ == '__main__':
    args = _parse_args()
    _setup_logging(args.log_dir)

    if args.dashboard_url:
        os.environ['DASHBOARD_URL'] = args.dashboard_url

    bot = ConfluenceBot(args)
    bot.start()
