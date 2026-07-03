"""
Gold Bot V2 — Max-style confluence trading for XAU/USD, level-matrix edition.

V2 of Gold/main.py (V1 stays running untouched — versioned, not overwritten).
What changed and why is documented in GoldV2/README.md; headlines:

  * HTF bias: structure-first (H4 HH/HL sequence + price-vs-EMA daily),
    stands down on Daily/4H disagreement instead of calling it a trend.
  * Zones: valid-extreme fib MATRIX → level clustering → distinct-leg
    scoring. The golden pocket (.618–.650) is a BAND with a confluence
    bonus; other fibs are lines.
  * Exits: SL anchored to the M5 confirmation swing (skip if it doesn't fit
    the risk cap — never truncate); TPs level-to-level with a σ-forecast
    range cap (/api/vol-forecast, ATR fallback).
  * VuManChu: WT mandatory, MF exhaustion-only, fuel veto.
  * Portfolio: several armed zones + concurrent trades under AGGREGATE risk
    caps; per-zone cooldowns; trades_today resets on UTC rollover;
    state persists across restarts and live MT5 positions are adopted.

Two-speed loop:
  State refresh (--state-interval, default 120s): bars, HTF bias, volume
    profile, session levels, trendlines, σ forecast, level matrix, scoring.
  Price tick (--price-interval, default 3s): manage open trades, arm/disarm
    zones, run VuManChu on armed zones, fire entries.

Usage:
  python main.py                    # paper mode
  python main.py --live             # real MT5 orders (magic 20260005)
  python main.py --once             # single cycle then exit

Environment (.env or shell):
  MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER / MT5_PATH   fallback credentials —
      the primary source is KV key gold_v2_credentials saved from the
      bot-config page (keys mt5_account/mt5_password/mt5_server/mt5_path).
  DASHBOARD_URL   override base URL (default: Railway deployment)
"""

from __future__ import annotations
import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

# GoldV2/modules must take priority over bot/modules (both use 'modules.*').
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(1, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bot'))

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
from modules.trade_manager import TradeManager, ManagedTrade
from modules.exits import plan_exits

from journal import GoldV2Journal

load_dotenv()

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Constants ─────────────────────────────────────────────────────────────────

SYMBOL = 'XAUUSD'
MAGIC  = 20260005          # V2 magic — distinct from V1's 20260004
PIP    = 1.0               # XAU/USD: 1 pip = $1

KV_CONFIG = 'gold_v2_config'
KV_STATUS = 'gold_v2_status'
KV_ZONES  = 'gold_v2_zones'
KV_CREDS  = 'gold_v2_credentials'

# ── Default config (overridden via KV key gold_v2_config) ─────────────────────

DEFAULT_CFG: dict = {
    'enabled':                     True,
    'paper_mode':                  True,

    # Zone matrix
    'zone_tfs':                    ['H4', 'M30'],
    'cluster_tolerance':           3.0,    # $ — level lines within this collapse to one zone
    'min_zone_score':              4.0,
    'min_distinct_legs':           1,      # fib legs required (retest/GP-only zones pass with 1)
    'proximity_pips':              5.0,
    'max_armed_zones':             3,
    'include_retests':             True,

    # Confirmation
    'vu_min_components':           2,
    'vu_require_wt':               True,
    'mf_fuel_veto':                True,

    # Risk / portfolio
    'risk_pct':                    0.5,    # % balance per trade
    'max_trades_per_day':          4,
    'max_concurrent_trades':       2,
    'max_open_risk_pct':           1.0,    # aggregate — gold trades are ~100% correlated
    'max_per_direction':           2,
    'min_entry_separation_pips':   15,
    'cooldown_minutes':            30,     # per zone cluster after a close
    'global_cooldown_minutes':     10,     # spacing between consecutive entries

    # Exits
    'max_sl_pips':                 40,     # SKIP filter, never a truncation
    'min_sl_pips':                 4,
    'sl_buffer_atr':               0.3,
    'tp1_r_min':                   1.0,
    'tp2_r_min':                   1.5,
    'tp2_r_max':                   4.0,
    'range_cap_mult':              1.2,
    'be_after_tp1':                True,
    'allow_overnight_htf_aligned': True,   # HTF-aligned trades may run past the window

    # Session
    'trade_window_start':          '07:00',
    'trade_window_end':            '20:00',

    # Gates
    'gold_macro_gate':             True,
    'ml_gate':                     False,  # own flag now (V1 tied it to the macro gate)
    'htf_block':                   True,
    'htf_block_confidence':        0.5,
    'use_vol_forecast':            True,   # /api/vol-forecast for range cap + confluence

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
            logging.FileHandler(os.path.join(log_dir, 'gold_v2_bot.log'), encoding='utf-8'),
        ],
    )

log = logging.getLogger(__name__)

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
    """
    KV gold_v2_credentials first (saved from the bot-config page:
    mt5_account / mt5_password / mt5_server / mt5_path), env fallback.
    """
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


def _live_price(base_url: str) -> float | None:
    if HAS_MT5:
        tick = mt5.symbol_info_tick(SYMBOL)
        if tick:
            return round((tick.bid + tick.ask) / 2, 2)
    return fetch_quote('XAU/USD', base_url)


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


# ── Gates ─────────────────────────────────────────────────────────────────────

def _macro_allows(direction: str, base_url: str) -> tuple[bool, str]:
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


def _ml_allows(zone_id: str, base_url: str) -> tuple[bool, str]:
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


# ── Lot sizing ────────────────────────────────────────────────────────────────

def _calc_lot_size(balance: float, risk_pct: float, sl_pips: float) -> float:
    """XAU/USD: 1 lot = 100 oz → $100 P&L per $1 move per lot."""
    if sl_pips <= 0:
        return 0.01
    risk_dollars = balance * (risk_pct / 100.0)
    lots = risk_dollars / (sl_pips * 100.0)
    return round(max(0.01, round(lots / 0.01) * 0.01), 2)


# ── ATR helpers ───────────────────────────────────────────────────────────────

def _atr_from_list(bars: list[dict], alpha: float = 0.15) -> float:
    if len(bars) < 2:
        return 5.0
    tr = abs(bars[1]['high'] - bars[1]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * tr
    return round(tr, 4)


def _atr_squeeze(bars: list[dict]) -> float:
    if len(bars) < 100:
        return 1.0
    short  = _atr_from_list(bars[-14:])
    medium = _atr_from_list(bars[-100:])
    return round(short / medium, 3) if medium > 0 else 1.0


# ── Live order helpers ────────────────────────────────────────────────────────

def _filling_mode() -> int:
    info = mt5.symbol_info(SYMBOL)
    mode = mt5.ORDER_FILLING_IOC
    if info:
        f = info.filling_mode
        if   f & 1: mode = mt5.ORDER_FILLING_FOK
        elif f & 2: mode = mt5.ORDER_FILLING_IOC
        elif f & 4: mode = mt5.ORDER_FILLING_RETURN
    return mode


def _place_live_order(direction: str, sl: float, tp: float,
                      lots: float, zone_id: str) -> Optional[int]:
    if not HAS_MT5:
        return None
    tick = mt5.symbol_info_tick(SYMBOL)
    if not tick:
        log.error('[LIVE] Cannot get tick — order skipped')
        return None
    exec_price = tick.ask if direction == 'LONG' else tick.bid
    order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL

    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       SYMBOL,
        'volume':       float(lots),
        'type':         order_type,
        'price':        exec_price,
        'sl':           round(sl, 2),
        'tp':           round(tp, 2),
        'deviation':    30,
        'magic':        MAGIC,
        'comment':      f'GoldV2 {direction[0]} {zone_id[:16]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(),
    })
    if res is None:
        log.error(f'[LIVE] order_send returned None: {mt5.last_error()}')
        return None
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f'[LIVE] order failed retcode={res.retcode} {res.comment}')
        return None
    log.info(f'[LIVE] Order placed ticket={res.order}  exec={exec_price:.2f}  '
             f'sl={sl:.2f}  tp={tp:.2f}  lots={lots}')
    return int(res.order)


def _close_live_position(ticket: int) -> bool:
    """Market-close an open position by ticket (used for EOD expiry)."""
    if not HAS_MT5:
        return False
    pos = (mt5.positions_get(ticket=ticket) or [None])[0]
    if not pos:
        return True   # already gone
    tick = mt5.symbol_info_tick(SYMBOL)
    if not tick:
        return False
    close_type  = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
    close_price = tick.bid if pos.type == 0 else tick.ask
    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       SYMBOL,
        'volume':       float(pos.volume),
        'type':         close_type,
        'position':     ticket,
        'price':        close_price,
        'deviation':    30,
        'magic':        MAGIC,
        'comment':      'GoldV2 EOD expiry',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(),
    })
    return bool(res and res.retcode == mt5.TRADE_RETCODE_DONE)


# ── Serialization for the dashboard positions tab ─────────────────────────────

def _serialize_open_positions(magic: int) -> list:
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
        from datetime import timedelta
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        deals = mt5.history_deals_get(today, today + timedelta(days=1)) or []
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
                'comment':     str(ind.comment if ind else last_out.comment or ''),
            })
        return sorted(result, key=lambda t: t['time_close'])
    except Exception:
        return []


def _serialize_paper_trades(trades: list[ManagedTrade], price: float) -> list:
    out = []
    for t in trades:
        sign = 1 if t.direction == 'LONG' else -1
        out.append({
            'ticket':     0,
            'symbol':     SYMBOL,
            'direction':  'BUY' if t.direction == 'LONG' else 'SELL',
            'lots':       t.lot_size,
            'open_price': round(t.entry_price, 2),
            'price':      round(price, 2),
            'profit':     round(sign * (price - t.entry_price) * t.lot_size * 100, 2),
            'swap':       0.0,
            'time_open':  int(t.entry_dt().timestamp()),
            'comment':    f'paper {t.trade_id} {t.zone_id}',
            'sl':         round(t.sl, 2),
            'tp1':        round(t.tp1, 2),
            'tp2':        round(t.tp2, 2),
            'tp1_hit':    t.tp1_hit,
        })
    return out


# ── Main bot class ────────────────────────────────────────────────────────────

class GoldBotV2:
    def __init__(self, args: argparse.Namespace):
        self.args     = args
        self.base_url = os.getenv('DASHBOARD_URL', DASHBOARD_URL)
        self.cfg      = DEFAULT_CFG.copy()
        self.journal  = GoldV2Journal(args.log_dir)
        self.tm       = TradeManager(os.path.join(args.log_dir, 'gold_v2_state.json'))

        self.zones: list[ZoneV2] = []
        self.trendlines: list[Trendline] = []
        self.htf_bias  = None
        self.vol_prof  = None
        self.sess_lvls = None
        self.atr_15m   = 5.0
        self.daily_atr = 30.0
        self.squeeze_ratio = 1.0
        self.vol_fc: Optional[dict] = None      # σ forecast (price units)
        self.vol_levels: list[tuple[float, str]] = []
        self.last_state_refresh = 0.0
        self._mt5_ok = False
        # Live "why hasn't this armed zone entered" snapshots, keyed by zone_id.
        # Updated every confirmation tick, logged on state change, pushed with
        # status so the zones page can show the verdict next to the armed card.
        self._watch: dict[str, dict] = {}
        self._watch_dirty = False
        self._last_watch_push = 0.0

    # ── lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        log.info('=' * 70)
        log.info('GOLD BOT V2 starting  (XAU/USD — level-matrix edition)')
        log.info(f'Mode: {"PAPER" if self.cfg.get("paper_mode", True) else "LIVE"}   magic={MAGIC}')
        log.info('=' * 70)

        if HAS_MT5:
            creds = _load_mt5_creds(self.base_url)
            self._mt5_ok = _init_mt5(creds)
            if self._mt5_ok:
                info = mt5.account_info()
                if info:
                    log.info(f'[V2] MT5 connected  account={info.login}  '
                             f'balance={info.balance:.2f} {info.currency}  server={info.server}')
            else:
                log.warning('MT5 unavailable — price from dashboard, no execution')
        else:
            log.info('MT5 not installed — paper mode only')

        # Restore state; in live mode adopt any MT5 positions we aren't tracking
        self.tm.load()
        if self._mt5_ok and not self.cfg.get('paper_mode', True):
            adopted = self.tm.adopt_mt5_positions(mt5.positions_get() or [], MAGIC)
            if adopted:
                self.tm.save()

        try:
            self._main_loop()
        except KeyboardInterrupt:
            log.info('Interrupted — printing session summary')
        finally:
            self.tm.save()
            self.journal.print_summary()
            if HAS_MT5 and self._mt5_ok:
                mt5.shutdown()

    def _main_loop(self) -> None:
        while True:
            now = time.time()
            if now - self.last_state_refresh >= self.args.state_interval:
                self._state_refresh()
                self.last_state_refresh = now

            self._price_tick()

            if self.args.once:
                break
            time.sleep(self.args.price_interval)

    # ── State refresh (slow path) ─────────────────────────────────────────────

    def _state_refresh(self) -> None:
        self.cfg = _load_config(self.base_url)
        self.tm.roll_day_if_needed()
        if not self.cfg.get('enabled', True):
            log.info('[REFRESH] Bot disabled via config — skipping')
            self._push_status(None)
            return

        log.info('[REFRESH] Fetching bars and recomputing level matrix...')

        daily_bars = _bars(SYMBOL, 'D1',  60)
        h4_bars    = _bars(SYMBOL, 'H4',  200)
        h1_bars    = _bars(SYMBOL, 'H1',  96)
        m30_bars   = _bars(SYMBOL, 'M30', 150)
        m15_bars   = _bars(SYMBOL, 'M15', 150)
        m1_multiday = _bars(SYMBOL, 'M1', 18_500)

        if not m15_bars and not m30_bars:
            log.warning('[REFRESH] No bar data — MT5 not connected and no fallback')
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
            log.info(f'[VOL]    No bars today — using {most_recent} profile ({len(vol_m1)} M1 bars)')

        # ── ATRs + squeeze ────────────────────────────────────────────────────
        if m15_bars:
            self.atr_15m = _atr_from_list(m15_bars)
        if daily_bars:
            self.daily_atr = _atr_from_list(daily_bars[-20:])
        if m15_bars and len(m15_bars) >= 100:
            self.squeeze_ratio = _atr_squeeze(m15_bars)
            if self.squeeze_ratio < 0.65:
                log.info(f'[ATR]    Squeeze {self.squeeze_ratio:.2f} — min score raised')

        # ── HTF bias (structure-first) ────────────────────────────────────────
        if daily_bars and h4_bars:
            self.htf_bias = compute_htf_bias(daily_bars, h4_bars)
            log.info(f'[HTF]    {self.htf_bias.bias} ({self.htf_bias.confidence:.0%}) '
                     f'— {self.htf_bias.reason}')

        price_now = self._get_price()
        if not price_now:
            log.warning('[REFRESH] price unavailable — matrix skipped this cycle')
            return

        # ── Volume profile + session levels + trendlines ─────────────────────
        if vol_m1:
            self.vol_prof = compute_volume_profile(vol_m1, prev_m1, price_now,
                                                   all_m1_bars=m1_multiday, max_npoc_days=12)
            if self.vol_prof.npoc_stack:
                ages = ', '.join(f'{n.price:.1f}({n.age_days}d)'
                                 for n in self.vol_prof.npoc_stack[:4])
                log.info(f'[nPOC]   {len(self.vol_prof.npoc_stack)} naked POCs: {ages}')

        if h1_bars:
            prev_d1 = daily_bars[-2] if len(daily_bars) >= 2 else None
            self.sess_lvls = compute_session_levels(h1_bars, prev_d1, price_now,
                                                    m1_bars_multiday=m1_multiday)

        self.trendlines = []
        for tf, bars in [('H4', h4_bars), ('H1', h1_bars)]:
            if bars:
                self.trendlines.extend(detect_trendlines(bars, tf))

        # ── σ forecast (/api/vol-forecast) ────────────────────────────────────
        self._refresh_vol_forecast()

        # ── Level matrix ──────────────────────────────────────────────────────
        zone_tfs   = self.cfg.get('zone_tfs', ['H4', 'M30'])
        tf_bar_map = {'D1': daily_bars, 'H4': h4_bars, 'H1': h1_bars,
                      'M30': m30_bars, 'M15': m15_bars}
        bars_by_tf = {tf: tf_bar_map.get(tf) or [] for tf in zone_tfs}

        try:
            zones, debug = build_level_matrix(
                bars_by_tf, price_now,
                cluster_tolerance=float(self.cfg.get('cluster_tolerance', 3.0)),
                include_retests=bool(self.cfg.get('include_retests', True)),
            )
            log.info(f'[MATRIX] legs={debug["legs"]}  lines={debug["lines"]}  '
                     f'bands={debug["bands"]}  zones={debug["zones"]}')
        except Exception as exc:
            log.error(f'[MATRIX] build failed: {exc}', exc_info=True)
            return

        missing = [n for n, v in [('vol_prof', self.vol_prof),
                                  ('sess_lvls', self.sess_lvls),
                                  ('htf_bias', self.htf_bias)] if not v]
        if zones and not missing:
            zones = score_zones(zones, self.vol_prof, self.sess_lvls, self.htf_bias,
                                trendlines=self.trendlines,
                                vol_levels=self.vol_levels)
            min_legs = int(self.cfg.get('min_distinct_legs', 1))
            zones = [z for z in zones
                     if z.distinct_legs >= min_legs or 'retest' in z.line_kinds]
            self.zones = zones
            self.journal.log_zone_map(self.zones, self.htf_bias,
                                      self.vol_prof, self.sess_lvls, debug)
        elif zones:
            log.warning(f'[ZONES]  Scoring skipped — missing: {missing}')
            self.zones = []
        else:
            self.zones = []

        # Prune armed zones that no longer exist / are inactive
        live_ids = {z.zone_id for z in self.zones if z.active}
        for zid in list(self.tm.armed.keys()):
            if zid not in live_ids:
                self.tm.disarm(zid)

        self.tm.save()
        self._push_status(price_now)
        self._push_zones_kv()

    def _refresh_vol_forecast(self) -> None:
        """GET /api/vol-forecast → GOLD hl/oc percentiles → price levels."""
        self.vol_fc = None
        self.vol_levels = []
        if not self.cfg.get('use_vol_forecast', True):
            return
        try:
            r = requests.get(f'{self.base_url}/api/vol-forecast', timeout=10)
            if r.status_code != 200:
                return
            f = (r.json().get('instruments') or {}).get('GOLD')
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
            self.vol_fc = {
                'expected_range': anchor * hl_med / 100.0,
                'upper_oc_med':   round(anchor * (1 + oc_med / 100.0), 2),
                'lower_oc_med':   round(anchor * (1 - oc_med / 100.0), 2),
                'upper_oc_75':    round(anchor * (1 + oc_75 / 100.0), 2),
                'lower_oc_75':    round(anchor * (1 - oc_75 / 100.0), 2),
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
            log.info(f'[σ]      Forecast range {self.vol_fc["expected_range"]:.1f}p '
                     f'(HL med {hl_med:.2f}%)  OC75 '
                     f'{self.vol_fc["lower_oc_75"]:.1f}/{self.vol_fc["upper_oc_75"]:.1f}')
        except Exception as exc:
            log.debug(f'[σ] vol-forecast fetch failed: {exc}')

    # ── Price tick (fast path) ────────────────────────────────────────────────

    def _price_tick(self) -> None:
        price = self._get_price()
        if not price:
            return

        if self.sess_lvls:
            self.sess_lvls.current_price = price
            if price > self.sess_lvls.today_high:
                self.sess_lvls.today_high = round(price, 2)
            if price < self.sess_lvls.today_low:
                self.sess_lvls.today_low = round(price, 2)

        self.tm.roll_day_if_needed()

        # 1) Manage every open trade
        self._manage_trades(price)

        # 2) EOD expiry for trades not allowed to run overnight
        self._expire_trades(price)

        # 3) New entries only inside the window
        if not _in_trade_window(self.cfg):
            return

        # 4) Update armed zones (confirm or disarm), then scan for new arms
        self._check_armed_zones(price)
        self._scan_zones(price)

    # ── trade management ──────────────────────────────────────────────────────

    def _manage_trades(self, price: float) -> None:
        for trade in list(self.tm.open_trades):
            trade.update_excursion(price)

            if trade.mode == 'LIVE' and trade.ticket and self._mt5_ok:
                self._manage_live_trade(trade, price)
            else:
                event = trade.check_outcome(price, self.cfg.get('be_after_tp1', True))
                if event == 'TP1_HIT':
                    self.journal.log_tp1_hit(trade, price)
                elif event in ('TP2_HIT', 'SL_HIT', 'BE_STOP'):
                    self.journal.log_trade_closed(trade, price, event)
                    self._on_trade_closed(trade, price, event)

    def _manage_live_trade(self, trade: ManagedTrade, price: float) -> None:
        ticket = trade.ticket

        # TP1 → SL to breakeven
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
                            'sl':       round(trade.entry_price, 2),
                            'tp':       round(trade.tp2, 2),
                        })
                        trade.be_moved = True
                        trade.sl = trade.entry_price
                        log.info(f'[LIVE] TP1 — SL → breakeven {trade.entry_price:.2f}')
                    except Exception as exc:
                        log.warning(f'[LIVE] BE move failed: {exc}')
                self.tm.save()

        if mt5.positions_get(ticket=ticket):
            return   # still open

        # Position gone — find the exit deal
        from datetime import timedelta as _td
        deals = mt5.history_deals_get(
            trade.entry_dt() - _td(minutes=1),
            datetime.now(timezone.utc) + _td(minutes=1),
        ) or []
        exit_deals = [d for d in deals if d.position_id == ticket and d.entry in (1, 3)]
        if exit_deals:
            last  = max(exit_deals, key=lambda d: d.time)
            px    = float(last.price)
            if trade.be_moved and abs(px - trade.entry_price) < max(1.0, self.atr_15m * 0.2):
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
            if trade.mode == 'LIVE' and trade.ticket and self._mt5_ok:
                if not _close_live_position(trade.ticket):
                    log.warning(f'[EXPIRE] Live close failed for {trade.ticket} — will retry')
                    continue
            self.journal.log_trade_closed(trade, price, 'EXPIRED')
            self._on_trade_closed(trade, price, 'EXPIRED')

    def _on_trade_closed(self, trade: ManagedTrade, close_price: float,
                         reason: str) -> None:
        self.tm.close_trade(trade)
        self.tm.start_zone_cooldown(trade.zone_id,
                                    int(self.cfg.get('cooldown_minutes', 30)))
        self.tm.save()
        self._push_trade_kv(trade, close_price, reason)

    def _push_trade_kv(self, trade: ManagedTrade, close_price: float,
                       reason: str) -> None:
        """
        Append the closed trade to KV gold_v2_trades (rolling list, newest
        last) so gold-zones.html can show the V2 trade history regardless of
        which host the bot runs on. Field names mirror the V1 CSV columns the
        page already renders.
        """
        try:
            sign = 1 if trade.direction == 'LONG' else -1
            pnl  = round(sign * (close_price - trade.entry_price), 1)
            if reason == 'BE_STOP':
                result = 'BREAKEVEN'
            elif reason == 'EXPIRED':
                result = 'EXPIRED'
            else:
                result = 'WIN' if pnl > 0 else ('LOSS' if pnl < 0 else 'BREAKEVEN')
            entry_dt = trade.entry_dt()
            rec = {
                'trade_id':     trade.trade_id,
                'date':         entry_dt.strftime('%Y-%m-%d'),
                'time':         entry_dt.strftime('%H:%M:%S'),
                'zone_id':      trade.zone_id,
                'direction':    trade.direction,
                'score':        trade.zone_score,
                'entry':        trade.entry_price,
                'sl_pips':      round(abs(trade.entry_price - trade.sl), 1),
                'close_reason': reason,
                'close_price':  round(close_price, 2),
                'pnl_pips':     pnl,
                'mfe_pips':     trade.mfe_pips,
                'mae_pips':     trade.mae_pips,
                'result':       result,
                'mode':         trade.mode,
                'sl_basis':     trade.sl_basis,
                'tp_basis':     trade.tp_basis,
            }
            existing = _kv_get('gold_v2_trades', self.base_url) or {}
            trades = existing.get('trades', [])
            trades = [t for t in trades if t.get('trade_id') != rec['trade_id']]
            trades.append(rec)
            trades = trades[-400:]
            _kv_put('gold_v2_trades',
                    {'updated_at': datetime.now(timezone.utc).isoformat(),
                     'trades': trades},
                    self.base_url)
        except Exception as exc:
            log.debug(f'[KV] trade history push failed: {exc}')

    # ── arming & confirmation ─────────────────────────────────────────────────

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
        prox = float(self.cfg.get('proximity_pips', 5.0)) * PIP
        htf  = self.htf_bias
        block_conf = float(self.cfg.get('htf_block_confidence', 0.5))

        for zone in self.zones:   # sorted best-score first
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
                self.journal.log_zone_approached(zone, price, dist / PIP)

    def _update_watch(self, zone: ZoneV2, vu) -> None:
        """Record the live confirmation verdict; log + journal on state change."""
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
        """Watch snapshots change every few seconds — push at most every 30s."""
        now = time.time()
        if self._watch_dirty and now - self._last_watch_push >= 30:
            self._push_status(price)
            self._watch_dirty = False
            self._last_watch_push = now

    def _check_armed_zones(self, price: float) -> None:
        # Prune watch entries for zones no longer armed (disarmed / entered)
        for zid in list(self._watch.keys()):
            if zid not in self.tm.armed:
                del self._watch[zid]
                self._watch_dirty = True
        if not self.tm.armed:
            return

        m5_bars = _bars(SYMBOL, 'M5', 60)

        for zid, armed in list(self.tm.armed.items()):
            zone = next((z for z in self.zones if z.zone_id == zid and z.active), None)
            if not zone:
                self.tm.disarm(zid)
                continue

            # Disarm when price genuinely leaves (ATR buffer, not flat pips)
            prox = max(float(self.cfg.get('proximity_pips', 5.0)) * PIP * 2,
                       self.atr_15m * 1.0)
            dist = max(0.0, max(zone.gp_low - price, price - zone.gp_high))
            if dist > prox:
                log.info(f'[ARMED]  {zid} — price {price:.2f} left proximity, disarming')
                self.tm.disarm(zid)
                continue

            # First tick inside the window anchors the divergence search
            if zone.gp_low <= price <= zone.gp_high and armed.gp_entry_time is None:
                armed.gp_entry_time = time.time()
                log.info(f'[ARMED]  Price entered window {zone.gp_low:.1f}–{zone.gp_high:.1f} '
                         f'@ {price:.2f} — divergence anchored')

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
            if vu.vetoed:
                # Fuel remaining against the zone — keep watching, don't enter
                continue
            if vu.direction == 'NEUTRAL':
                continue

            self._try_enter(zone, vu, price)

        self._push_watch_if_due(price)

    def _try_enter(self, zone: ZoneV2, vu, price: float) -> None:
        direction = vu.direction

        # ── Gates ─────────────────────────────────────────────────────────────
        if self.cfg.get('gold_macro_gate', True):
            ok, reason = _macro_allows(direction, self.base_url)
            if not ok:
                self.journal.log_skip(zone.zone_id, 'macro', reason)
                self.tm.disarm(zone.zone_id)
                self.tm.start_zone_cooldown(zone.zone_id, 15)
                return
            log.info(f'[MACRO]  {reason}')

        if self.cfg.get('ml_gate', False):
            ok, reason = _ml_allows(zone.zone_id, self.base_url)
            if not ok:
                self.journal.log_skip(zone.zone_id, 'ml', reason)
                self.tm.disarm(zone.zone_id)
                return
            log.info(f'[ML]     {reason}')

        # ── Exit plan (may skip: risk box / no room) ──────────────────────────
        plan, skip = plan_exits(
            zone, direction, price,
            confirm_swing=vu.confirm_swing,
            atr_15m=self.atr_15m, daily_atr=self.daily_atr,
            today_high=self.sess_lvls.today_high if self.sess_lvls else price,
            today_low=self.sess_lvls.today_low if self.sess_lvls else price,
            zones=self.zones, vol=self.vol_prof, session=self.sess_lvls,
            cfg=self.cfg, vol_fc=self.vol_fc,
        )
        if plan is None:
            self.journal.log_skip(zone.zone_id, 'exits', skip)
            self.tm.disarm(zone.zone_id)
            self.tm.start_zone_cooldown(zone.zone_id, 15)
            return

        # ── Portfolio gate ────────────────────────────────────────────────────
        risk_pct = float(self.cfg.get('risk_pct', 0.5))
        ok, reason = self.tm.can_open(direction, risk_pct, price, self.cfg)
        if not ok:
            self.journal.log_skip(zone.zone_id, 'portfolio', reason)
            return   # stay armed — the block may clear (e.g. a trade closes)

        balance  = _mt5_balance()
        lot_size = _calc_lot_size(balance, risk_pct, plan.sl_dist)

        paper_mode = self.cfg.get('paper_mode', True)
        ticket = None
        if not paper_mode and self._mt5_ok:
            ticket = _place_live_order(direction, plan.sl, plan.tp2, lot_size, zone.zone_id)
            if not ticket:
                self.journal.log_skip(zone.zone_id, 'live_order', 'order placement failed')
                self.tm.disarm(zone.zone_id)
                self.tm.start_zone_cooldown(zone.zone_id, 5)
                return

        trade = ManagedTrade(
            trade_id=self.tm.next_trade_id(),
            zone_id=zone.zone_id,
            direction=direction,
            entry_price=price,
            sl=plan.sl, tp1=plan.tp1, tp2=plan.tp2,
            lot_size=lot_size, risk_pct=risk_pct,
            entry_time=datetime.now(timezone.utc).isoformat(),
            mode='LIVE' if ticket else 'PAPER',
            ticket=ticket,
            htf_aligned=zone.htf_aligned,
            sl_basis=plan.sl_basis, tp_basis=plan.tp2_basis,
            zone_score=zone.score,
        )
        self.tm.open_trade(trade)
        self.tm.start_global_cooldown(int(self.cfg.get('global_cooldown_minutes', 10)))
        self.tm.save()
        self.journal.log_entry(trade, zone, vu, plan)
        self._push_status(price)

    # ── Utilities ─────────────────────────────────────────────────────────────

    def _get_price(self) -> float | None:
        return _live_price(self.base_url)

    def _push_status(self, price: Optional[float]) -> None:
        paper_mode = self.cfg.get('paper_mode', True)
        positions = _serialize_open_positions(MAGIC)
        if not positions and price is not None:
            positions = _serialize_paper_trades(
                [t for t in self.tm.open_trades if t.mode == 'PAPER'], price)

        status = {
            'bot': 'gold_v2',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'state': ('MANAGING' if self.tm.open_trades
                      else 'ARMED' if self.tm.armed else 'WAITING'),
            'htf_bias': self.htf_bias.bias if self.htf_bias else 'UNKNOWN',
            'htf_detail': (f'{self.htf_bias.daily_trend}/{self.htf_bias.h4_trend}'
                           if self.htf_bias else ''),
            'zones_active': len([z for z in self.zones if z.active]),
            'top_zones': [
                {'zone_id': z.zone_id, 'score': z.score,
                 'entry_window': f'{z.gp_low:.1f}–{z.gp_high:.1f}',
                 'in_gp': z.in_gp, 'legs': z.distinct_legs,
                 'tf': z.tf, 'dir': z.direction}
                for z in self.zones[:5]
            ],
            'trades_today':  self.tm.trades_today,
            'open_trades':   len(self.tm.open_trades),
            'armed_zones':   list(self.tm.armed.keys()),
            # Per armed zone: when price first entered the window ('t', unix)
            # and the live confirmation verdict ('watch') — the zones page
            # renders this so "armed but not entered" is self-explaining.
            'armed_detail':  {zid: {'t': a.gp_entry_time,
                                    'watch': self._watch.get(zid)}
                              for zid, a in self.tm.armed.items()},
            'paper_mode':    paper_mode,
            'squeeze_ratio': self.squeeze_ratio,
            'account_login': _mt5_account_login(),
            'mt5_positions':        positions,
            'today_closed_trades': _serialize_closed_trades(MAGIC),
            'vol_forecast': ({'expected_range': round(self.vol_fc['expected_range'], 1),
                              'oc75_up': self.vol_fc['upper_oc_75'],
                              'oc75_dn': self.vol_fc['lower_oc_75']}
                             if self.vol_fc else None),
        }
        _kv_put(KV_STATUS, status, self.base_url)

    @staticmethod
    def _zone_kv_dict(z: ZoneV2, existing_detected: dict, now_iso: str) -> dict:
        """
        Zone → KV dict for gold_v2_zones. Includes the raw contributing legs
        (the "where did this zone come from" markup for gold-zones.html) plus
        primary-leg compat fields (fib ladder, swing times, impulse size) so
        the V1 zone viewer's overlays work unchanged in V2 mode.
        """
        d = {
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
            'detected_at':   existing_detected.get(z.zone_id, now_iso),
            'legs': [
                {
                    'leg_id':      lg.leg_id,
                    'tf':          lg.tf,
                    'origin':      lg.origin,
                    'end':         lg.end,
                    'origin_time': lg.origin_time,
                    'end_time':    lg.end_time,
                    'size':        lg.size,
                }
                for lg in z.legs
            ],
        }
        p = z.primary
        if p:
            r    = p.size
            sign = -1 if z.direction == 'long' else 1
            base = p.end
            d.update({
                'swing_origin_time': p.origin_time,
                'swing_end_time':    p.end_time,
                'impulse_size':      p.size,
                'level_382':         round(base + sign * 0.382 * r, 2),
                'level_500':         round(base + sign * 0.500 * r, 2),
                'level_618':         round(base + sign * 0.618 * r, 2),
                'level_650':         round(base + sign * 0.650 * r, 2),
                'level_786':         round(base + sign * 0.786 * r, 2),
                'level_886':         round(base + sign * 0.886 * r, 2),
            })
        return d

    def _push_zones_kv(self) -> None:
        try:
            existing_detected: dict[str, str] = {}
            old = _kv_get(KV_ZONES, self.base_url)
            if old:
                for ez in old.get('zones', []):
                    if ez.get('zone_id') and ez.get('detected_at'):
                        existing_detected[ez['zone_id']] = ez['detected_at']

            now_iso = datetime.now(timezone.utc).isoformat()
            payload = {
                'timestamp':      now_iso,
                'atr':            round(self.atr_15m, 2),
                'daily_atr':      round(self.daily_atr, 2),
                'htf_bias':       self.htf_bias.bias if self.htf_bias else 'UNKNOWN',
                'htf_confidence': round(self.htf_bias.confidence, 2) if self.htf_bias else 0.0,
                'session':        self.sess_lvls.current_session if self.sess_lvls else 'UNKNOWN',
                'vwap':           self.sess_lvls.vwap if self.sess_lvls else 0.0,
                'armed_zones':    list(self.tm.armed.keys()),
                'open_trades':    len(self.tm.open_trades),
                'squeeze_ratio':  self.squeeze_ratio,
                'vol_forecast':   self.vol_fc,
                'zones': [self._zone_kv_dict(z, existing_detected, now_iso)
                          for z in self.zones if z.active],
                'npoc_stack': [
                    {'price': n.price, 'age_days': n.age_days, 'date': n.date}
                    for n in (self.vol_prof.npoc_stack if self.vol_prof else [])
                ],
                'vwap_anchors': [
                    {'price': a.price, 'session': a.session, 'age_days': a.age_days,
                     'direction': a.direction, 'drive_size': a.drive_size, 'date': a.date}
                    for a in (self.sess_lvls.vwap_anchors if self.sess_lvls else [])
                ],
                'trendlines': [
                    {'tf': tl.tf, 'kind': tl.kind, 'touches': tl.touches,
                     'projected': tl.projected, 'slope': tl.slope}
                    for tl in self.trendlines
                ],
                'pivot_levels': {
                    'pp': self.sess_lvls.pivot,
                    'r1': self.sess_lvls.r1, 'r2': self.sess_lvls.r2,
                    's1': self.sess_lvls.s1, 's2': self.sess_lvls.s2,
                    'vah': self.vol_prof.vah if self.vol_prof else None,
                    'val': self.vol_prof.val if self.vol_prof else None,
                    'poc': self.vol_prof.poc if self.vol_prof else None,
                    'vwap': self.sess_lvls.vwap,
                    'daily_open': self.sess_lvls.daily_open,
                } if self.sess_lvls else None,
            }
            _kv_put(KV_ZONES, payload, self.base_url)
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Gold Bot V2 — XAU/USD level-matrix strategy')
    p.add_argument('--live',           action='store_true',
                   help='Send real orders to MT5 (default: paper)')
    p.add_argument('--price-interval', type=float, default=3.0, metavar='SECS',
                   help='Price tick interval (default 3s)')
    p.add_argument('--state-interval', type=float, default=120.0, metavar='SECS',
                   help='State refresh interval (default 120s)')
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

    bot = GoldBotV2(args)
    bot.cfg['paper_mode'] = not args.live
    bot.start()
