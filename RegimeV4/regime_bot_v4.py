"""
RegimeV4 — HMM regime-following bot with RANGE-hold state machine.

Philosophy
----------
Trade the direction: LONG in BULL, SHORT in BEAR.
RANGE is treated as consolidation, NOT reversal. When a trade is open and the
regime shifts to RANGE, hold the position and wait. Only close on a full
opposite-regime confirmation, a 1H timeframe flip, sustained BOCPD alarm, or
range timeout.

Entry gates (all must pass)
----------------------------
  G1  regime ∈ {BULL, BEAR}
  G2  confidence × session_multiplier ≥ entry_conf           default 70 %
  G3  debounce: candle_hold consecutive polls same regime     default 2
  G4  1H regime not directly opposed                         (use_1h=True)
  G5  peer directional consensus ≥ consensus_min             default 1
      (count of OTHER configured pairs in BULL or BEAR — any direction)
  G6  composite score ≥ entry_score_min                      default 65
  Optional macro gates:
  G7  not inside FOMC window                                 fomc_window_hours=6
  G8  VIX not in stress (VIX ≤ vix_entry_max)               default 25
  G9  not inside high-impact news window                     (use_news=True)

Position state machine
-----------------------
  TREND_HOLD  regime == entry direction.  Full exit set applies.
              X3/X4 suppressed once MFE ≥ mfe_suppress_r.
              SL trailed to breakeven once MFE ≥ mfe_trail_r.

  RANGE_HOLD  regime → RANGE while trade is open.  Hold and wait.
              X3, X4 always suppressed.
              X6 (BOCPD) requires bocpd_exit_bars_range bars (2× normal).
              Timeout closes after max_range_hold_bars bars.
              SL trailed to breakeven (if not already).
              Returns to TREND_HOLD if regime reverts to entry direction.

Exit rules (any fires → close)
-------------------------------
  X1   Regime reverses to OPPOSITE direction     (any state, immediate)
  X2   Confidence < conf_floor                   (any state, hard floor)
  X3   Conf slope deteriorating × slope_bars     (TREND_HOLD + MFE < mfe_suppress_r)
  X4   Single-bar conf drop > drop_thresh        (TREND_HOLD + MFE < mfe_suppress_r)
  X5   SL hit (MT5 position gone)
  X6   BOCPD ≥ bocpd_thresh × bocpd_exit_bars    (TREND_HOLD)
       BOCPD ≥ bocpd_thresh × bocpd_exit_bars_range (RANGE_HOLD, 2× more bars)
  X7   1H regime flipped to opposite             (any state)
  X8   VIX spike > vix_exit_max mid-trade        (optional)
  X9   Outside trade window
  X_rt RANGE hold timeout                        (RANGE_HOLD only)

Config key  : regime_bot_v4_config
Creds key   : regime_bot_v4_credentials
Status key  : regime_bot_v4_status
Unlock key  : rgv4_force_unlock

Usage:
  python RegimeV4/regime_bot_v4.py
  python RegimeV4/regime_bot_v4.py --live
  python RegimeV4/regime_bot_v4.py --dashboard-url https://macrofxmodel-production.up.railway.app
"""

import argparse
import logging
import os
import sys
import time
from collections import deque
from datetime import datetime, timezone, date as date_type
from typing import Optional

import requests

# ── path so relative imports work from repo root or RegimeV4/ ─────────────────
_HERE   = os.path.dirname(os.path.abspath(__file__))
_V2_DIR = os.path.join(_HERE, '..', 'RegimeV2')
sys.path.insert(0, _HERE)
sys.path.insert(0, _V2_DIR)   # bocpd, macro_overlay, formatter live in RegimeV2

from bocpd         import BOCPRegistry           # noqa: E402
from macro_overlay import MacroOverlay            # noqa: E402
from formatter     import (                       # noqa: E402
    regime_change_alert, heartbeat_message,
    entry_alert, exit_alert, lockout_alert,
)
from regime_score_v4 import compute_regime_score_v4  # noqa: E402

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

MAGIC = 20260006   # unique — V1=20260002, main=20260001, Gold=20260004, V2bot=20260005

_PIP_SIZES: dict[str, float] = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'NZD/USD': 0.0001, 'USD/CAD': 0.0001,
    'USD/CHF': 0.0001, 'GBP/JPY': 0.01,   'EUR/GBP': 0.0001,
    'EUR/JPY': 0.01,   'EUR/CHF': 0.0001, 'GBP/CHF': 0.0001,
    'AUD/JPY': 0.01,   'CAD/JPY': 0.01,   'NZD/JPY': 0.01,
    'AUD/CHF': 0.0001, 'AUD/CAD': 0.0001, 'AUD/NZD': 0.0001,
    'GBP/AUD': 0.0001, 'GBP/CAD': 0.0001, 'GBP/NZD': 0.0001,
    'EUR/AUD': 0.0001, 'EUR/CAD': 0.0001, 'EUR/NZD': 0.0001,
    'CHF/JPY': 0.01,   'XAU/USD': 1.0,
    'NAS100_USD': 1.0, 'USTECH100M': 1.0, 'SPX500_USD': 1.0,
    'DE30_USD':   1.0, 'UK100_GBP':  1.0, 'US30_USD':   1.0,
    'US2000_USD': 1.0,
}
_PIP_VALUES: dict[str, float] = {
    'EUR/USD': 10.0, 'GBP/USD': 10.0, 'AUD/USD': 10.0, 'NZD/USD': 10.0,
    'USD/JPY': 9.0,  'USD/CAD': 7.5,  'USD/CHF': 10.5, 'GBP/JPY': 9.0,
    'EUR/GBP': 12.5, 'EUR/JPY': 6.5,  'EUR/CHF': 11.0, 'GBP/CHF': 11.0,
    'AUD/JPY': 6.5,  'CAD/JPY': 6.5,  'NZD/JPY': 6.5,
    'AUD/CHF': 10.5, 'AUD/CAD': 7.5,  'AUD/NZD': 7.0,
    'GBP/AUD': 7.0,  'GBP/CAD': 7.5,  'GBP/NZD': 7.0,
    'EUR/AUD': 7.0,  'EUR/CAD': 7.5,  'EUR/NZD': 7.0,
    'CHF/JPY': 6.5,  'XAU/USD': 100.0,
    'NAS100_USD': 1.0, 'USTECH100M': 1.0, 'SPX500_USD': 1.0,
    'DE30_USD':   1.0, 'UK100_GBP':  1.0, 'US30_USD':   1.0,
    'US2000_USD': 1.0,
}
TRADEABLE   = {'BULL', 'BEAR'}
_OPPOSITE   = {'BULL': 'BEAR', 'BEAR': 'BULL'}
_MT5_SYMBOL: dict[str, str] = {'NAS100_USD': 'USTECH100M'}


def _mt5_sym(pair: str) -> str:
    return _MT5_SYMBOL.get(pair, pair.replace('/', ''))


# ── Logging ────────────────────────────────────────────────────────────────────
os.makedirs(os.path.join(_HERE, '..', 'logs'), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [RGV4] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            os.path.join(_HERE, '..', 'logs', 'regime_bot_v4.log'),
            encoding='utf-8',
        ),
    ],
)
log = logging.getLogger(__name__)

# ── Default config ─────────────────────────────────────────────────────────────
DEFAULT_CFG: dict = {
    # ── Core ──────────────────────────────────────────────────────────────────
    'enabled':       True,
    'paper_mode':    True,
    'pairs':         ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    'interval_secs': 30,

    # ── Entry gates ───────────────────────────────────────────────────────────
    # G2: effective confidence gate (conf × session_mult ≥ entry_conf)
    'entry_conf':    70.0,
    # G3: consecutive polls same regime + min conf before entry
    'candle_hold':   2,
    # G4: 1H timeframe alignment (True = block if 1H opposed)
    'use_1h':        True,
    # G5: peer directional consensus — other pairs in BULL or BEAR (any direction)
    #     1 = at least 1 other pair must be trending; 0 = disabled
    'consensus_min': 1,
    # G6: composite score gate
    'entry_score_min': 65.0,
    # G7: FOMC window (reduced from V2's 48h to 6h)
    'fomc_window_hours': 6.0,
    # G8: VIX entry gate — block if VIX > this value
    'vix_entry_max': 25.0,
    # G9: high-impact news window
    'use_news':      True,
    # macro overlay enabled flags
    'use_bocpd':     True,
    'use_vix':       True,

    # ── RANGE-hold state machine (V4 core feature) ────────────────────────────
    # How many polling bars to hold through a RANGE before timing out
    'max_range_hold_bars': 30,       # 30 × 30s = 15 min default

    # ── Breakeven trail ───────────────────────────────────────────────────────
    # Move SL to entry price when MFE reaches this many × SL distance
    'mfe_trail_r':   1.0,

    # ── X3/X4 suppression ─────────────────────────────────────────────────────
    # Suppress slope/velocity exits once MFE reaches this many × SL distance
    'mfe_suppress_r': 1.5,

    # ── Exit rules ────────────────────────────────────────────────────────────
    # X2: hard confidence floor (any state)
    'conf_floor':    45.0,
    # X3: confidence slope exit (TREND_HOLD + MFE < mfe_suppress_r only)
    'slope_thresh':  -5.0,   # %/bar
    'slope_bars':    5,      # consecutive bars below thresh (at 30s = 2.5 min)
    # X4: single-bar velocity drop (TREND_HOLD + MFE < mfe_suppress_r only)
    'drop_thresh':   15.0,   # %
    # X6: BOCPD exit
    'bocpd_thresh':       80.0,  # % (raised from V2's 70%)
    'bocpd_exit_bars':    4,     # bars in TREND_HOLD (raised from V2's 2)
    'bocpd_exit_bars_range': 8,  # bars in RANGE_HOLD (2× TREND_HOLD)
    # X8: VIX spike mid-trade
    'vix_exit_max':  35.0,   # close if VIX spikes above this (0 = disabled)
    # Hold score exit (simplified — single threshold, no X11/X12)
    'hold_score_min': 35.0,  # close if score < this for hold_score_bars consecutive polls
    'hold_score_bars': 4,    # (not active during RANGE_HOLD)

    # ── BOCPD tuning ──────────────────────────────────────────────────────────
    'bocpd_run_length': 150,   # expected regime run length (bars) for prior

    # ── Position sizing ───────────────────────────────────────────────────────
    'sl_atr_mult':   1.8,
    'sl_atr_tf':     '5m',
    'risk_pct':      1.0,    # % of balance per trade
    'max_lot':       5.0,
    'max_spread_pips': 3.0,

    # ── Trade window (UTC) ────────────────────────────────────────────────────
    'trade_window_start': '07:00',
    'trade_window_end':   '20:00',

    # ── RiskGuard ─────────────────────────────────────────────────────────────
    'ddlimit':   3.0,    # daily drawdown % before lockout
    'monthlydd': 5.0,    # monthly drawdown % before lockout
    'lockout':   3,      # lockout duration hours
    'cooldown':  240,    # per-pair cooldown seconds after any close

    # ── Telegram ──────────────────────────────────────────────────────────────
    'heartbeat_min': 60,  # minutes between heartbeat messages while in trade

    # ── Order retry ───────────────────────────────────────────────────────────
    'entry_fail_cooldown_secs': 300,
}


# ── KV helpers ─────────────────────────────────────────────────────────────────

def _kv_get(key: str, url: str) -> Optional[dict]:
    try:
        r = requests.get(f'{url}/api/kv/get?key={key}', timeout=10)
        j = r.json()
        if j.get('miss') or not j.get('data'):
            return None
        return j['data']
    except Exception as exc:
        log.warning(f'kv_get({key}): {exc}')
        return None


def _kv_put(key: str, data: dict, url: str) -> None:
    try:
        requests.post(
            f'{url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=10,
        )
    except Exception as exc:
        log.warning(f'kv_put({key}): {exc}')


def push_regime_states(states: list[dict], events: list[dict], url: str) -> None:
    try:
        requests.post(
            f'{url}/api/regime-append',
            json={'bot': 'v4', 'ts': int(time.time()), 'states': states, 'events': events},
            timeout=6,
        )
    except Exception:
        pass


def load_config(url: str) -> dict:
    stored = _kv_get('regime_bot_v4_config', url)
    cfg = dict(DEFAULT_CFG)
    if stored:
        cfg.update(stored)
    return cfg


def load_credentials(url: str) -> None:
    creds = _kv_get('regime_bot_v4_credentials', url)
    if not creds:
        return
    for env_key, cfg_key in [
        ('MT5_ACCOUNT', 'mt5_account'), ('MT5_PASSWORD', 'mt5_password'),
        ('MT5_SERVER',  'mt5_server'),  ('MT5_PATH',     'mt5_path'),
    ]:
        if val := creds.get(cfg_key):
            os.environ[env_key] = str(val)
    log.info(f'Credentials loaded: account={creds.get("mt5_account")}  server={creds.get("mt5_server")}')


def check_force_unlock(url: str, rg: 'RiskGuardV4') -> None:
    data = _kv_get('rgv4_force_unlock', url)
    if data and data.get('force_unlock'):
        log.info('Force unlock received — clearing lockout')
        rg.force_unlock()
        _kv_put('rgv4_force_unlock', {'force_unlock': False}, url)


def load_tg_config(url: str, v4_cfg: Optional[dict] = None) -> dict:
    v4 = v4_cfg or {}
    token   = v4.get('tg_token', '').strip()
    chat_id = v4.get('tg_chat_id', '').strip()
    if token and chat_id:
        return {'token': token, 'chat_id': chat_id}
    shared = _kv_get('tg_config', url) or {}
    return {'token': shared.get('token', ''), 'chat_id': shared.get('chatId', '')}


# ── Telegram ───────────────────────────────────────────────────────────────────

def send_telegram(token: str, chat_id: str, text: str) -> bool:
    if not token or not chat_id:
        return False
    try:
        r = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
            timeout=10,
        )
        return r.status_code == 200
    except Exception as exc:
        log.warning(f'Telegram send failed: {exc}')
        return False


# ── MT5 connection ─────────────────────────────────────────────────────────────

def mt5_connect() -> bool:
    if not HAS_MT5:
        log.warning('MetaTrader5 not installed — paper mode only')
        return False
    path = os.environ.get('MT5_PATH') or None
    ok   = mt5.initialize(path=path) if path else mt5.initialize()
    if not ok:
        log.error(f'MT5 initialize() failed: {mt5.last_error()}')
        return False
    account  = os.environ.get('MT5_ACCOUNT', '')
    password = os.environ.get('MT5_PASSWORD', '')
    server   = os.environ.get('MT5_SERVER', '')
    if not (account and password and server):
        log.error('MT5 credentials not set — aborting')
        mt5.shutdown()
        return False
    if not mt5.login(int(account), password, server):
        log.error(f'MT5 login failed: {mt5.last_error()}')
        return False
    info = mt5.account_info()
    if info:
        log.info(f'MT5 connected  account={info.login}  balance={info.balance:.2f}  server={info.server}')
        if str(info.login) != str(account):
            log.error(f'Account mismatch: expected {account} got {info.login} — aborting')
            mt5.shutdown()
            return False
    term = mt5.terminal_info()
    if term and not term.trade_allowed:
        log.error('MT5 AutoTrading DISABLED — enable in MT5 toolbar')
    return True


# ── Price / ATR / balance ──────────────────────────────────────────────────────

def get_price(pair: str, url: str) -> Optional[float]:
    if HAS_MT5:
        try:
            tick = mt5.symbol_info_tick(_mt5_sym(pair))
            if tick and tick.bid > 0:
                return round((tick.bid + tick.ask) / 2, 6)
        except Exception:
            pass
    try:
        r = requests.get(f'{url}/api/quote?symbol={pair}', timeout=5)
        return r.json().get('price')
    except Exception:
        return None


def get_atr(pair: str, tf: str = '5m') -> Optional[float]:
    if not HAS_MT5:
        return None
    try:
        timeframe = mt5.TIMEFRAME_M5 if tf == '5m' else mt5.TIMEFRAME_M30
        bars = mt5.copy_rates_from_pos(_mt5_sym(pair), timeframe, 0, 30)
        if bars is None or len(bars) < 2:
            return None
        alpha = 0.15
        atr   = abs(float(bars[1]['high']) - float(bars[1]['low']))
        for i in range(1, len(bars)):
            h, l, pc = float(bars[i]['high']), float(bars[i]['low']), float(bars[i-1]['close'])
            atr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * atr
        return round(atr, 6)
    except Exception:
        return None


def get_balance(paper_mode: bool) -> float:
    if HAS_MT5 and not paper_mode:
        info = mt5.account_info()
        if info:
            return info.balance
    return 10_000.0


# ── Regime fetch (with stale-data fallback) ────────────────────────────────────

_last_regimes:    dict = {}
_last_regimes_ts: float = 0.0
_last_1h_regimes:    dict = {}
_last_1h_regimes_ts: float = 0.0


def fetch_regimes(url: str, stale_max_secs: float = 120.0) -> dict:
    global _last_regimes, _last_regimes_ts
    try:
        r = requests.get(f'{url}/api/hmm5m-v2', timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data:
                _last_regimes    = data
                _last_regimes_ts = time.time()
            return data
    except Exception as exc:
        age = time.time() - _last_regimes_ts
        if _last_regimes and age <= stale_max_secs:
            log.warning(f'fetch_regimes failed ({exc}) — using cached data ({age:.0f}s old)')
            return _last_regimes
        log.error(f'fetch_regimes failed ({exc}) — no valid cache')
    return {}


def fetch_1h_regimes(url: str, stale_max_secs: float = 300.0) -> dict:
    global _last_1h_regimes, _last_1h_regimes_ts
    try:
        r = requests.get(f'{url}/api/hmm1h-v2', timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data:
                _last_1h_regimes    = data
                _last_1h_regimes_ts = time.time()
            return data
    except Exception as exc:
        age = time.time() - _last_1h_regimes_ts
        if _last_1h_regimes and age <= stale_max_secs:
            log.warning(f'fetch_1h_regimes failed ({exc}) — using cached ({age:.0f}s old)')
            return _last_1h_regimes
        log.error(f'fetch_1h_regimes failed ({exc}) — no valid cache')
    return {}


# ── OLS slope ─────────────────────────────────────────────────────────────────

def _ols_slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    xm  = (n - 1) / 2.0
    ym  = sum(values) / n
    sXY = sum((i - xm) * (v - ym) for i, v in enumerate(values))
    sX2 = sum((i - xm) ** 2 for i in range(n))
    return sXY / sX2 if sX2 > 0 else 0.0


# ── Consensus ─────────────────────────────────────────────────────────────────

def peer_directional_count(pair: str, pairs: list[str], all_regimes: dict) -> tuple[int, int]:
    """
    Returns (count, total) where count = other pairs in BULL or BEAR (any direction),
    total = number of other configured pairs.
    """
    others = [p for p in pairs if p != pair]
    count  = sum(1 for p in others
                 if all_regimes.get(p, {}).get('regime', '').upper() in TRADEABLE)
    return count, len(others)


# ── Position sizing ────────────────────────────────────────────────────────────

def position_size(balance: float, risk_pct: float,
                  sl_dist: float, pair: str, max_lot: float) -> float:
    pip      = _PIP_SIZES.get(pair, 0.0001)
    pv       = _PIP_VALUES.get(pair, 10.0)
    sl_pips  = sl_dist / pip
    risk_amt = balance * (risk_pct / 100)
    if sl_pips <= 0 or pv <= 0:
        return 0.01
    raw = risk_amt / (sl_pips * pv)
    return max(0.01, min(round(raw, 2), max_lot))


# ── MT5 execution ─────────────────────────────────────────────────────────────

def _filling_mode(sym: str) -> int:
    info    = mt5.symbol_info(sym)
    filling = mt5.ORDER_FILLING_IOC
    if info:
        am = info.filling_mode
        if   am & 1: filling = mt5.ORDER_FILLING_FOK
        elif am & 2: filling = mt5.ORDER_FILLING_IOC
        elif am & 4: filling = mt5.ORDER_FILLING_RETURN
    return filling


def _ensure_login() -> bool:
    account  = os.environ.get('MT5_ACCOUNT', '')
    password = os.environ.get('MT5_PASSWORD', '')
    server   = os.environ.get('MT5_SERVER', '')
    if not (account and password and server):
        return True  # no creds = nothing to ensure
    current = mt5.account_info()
    if current and str(current.login) == str(account):
        return True
    return mt5.login(int(account), password, server)


def open_position(pair: str, direction: str, sl: float,
                  size: float, max_spread: float, paper_mode: bool) -> Optional[int]:
    pip = _PIP_SIZES.get(pair, 0.0001)
    log.info(f'TRADE {pair} {direction}  SL={sl:.5f}  lot={size}' + ('  [PAPER]' if paper_mode else ''))
    if paper_mode:
        return -1
    if not HAS_MT5:
        return None
    if not _ensure_login():
        log.error('Re-login failed before open_position')
        return None
    sym  = _mt5_sym(pair)
    tick = mt5.symbol_info_tick(sym)
    if not tick:
        log.error(f'No tick for {sym}')
        return None
    if (tick.ask - tick.bid) / pip > max_spread:
        log.warning(f'SPREAD BLOCK {pair}: {(tick.ask - tick.bid) / pip:.1f}p > {max_spread}p')
        return None
    if any(p.magic == MAGIC for p in (mt5.positions_get(symbol=sym) or [])):
        log.warning(f'DUPLICATE BLOCK {pair}')
        return None
    ot    = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    price = tick.ask if direction == 'LONG' else tick.bid
    order = {
        'action':       mt5.TRADE_ACTION_DEAL, 'symbol': sym, 'volume': size,
        'type':         ot,                    'price':  price,
        'sl':           round(sl, 5),          'deviation': 20,
        'magic':        MAGIC,                 'comment': f'RgV4 {direction[0]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(sym),
    }
    res = mt5.order_send(order)
    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'MT5 order placed: ticket={res.order}  price={price}')
        return res.order
    log.error(
        f'MT5 order failed: retcode={getattr(res, "retcode", "NONE")}  '
        f'comment={getattr(res, "comment", "n/a")!r}  last_error={mt5.last_error()}'
    )
    return None


def close_position(ticket: int, pair: str, paper_mode: bool, reason: str = '') -> bool:
    log.info(f'CLOSE {pair}  ticket={ticket}  reason={reason}' + ('  [PAPER]' if paper_mode else ''))
    if paper_mode or ticket < 0:
        return True
    if not HAS_MT5:
        return False
    sym = _mt5_sym(pair)
    for attempt in range(3):
        if attempt > 0:
            time.sleep(0.5)
            if not _ensure_login():
                continue
        poss = [p for p in (mt5.positions_get(symbol=sym) or []) if p.ticket == ticket]
        if not poss:
            log.info(f'Ticket {ticket} not found — already closed')
            return True
        pos  = poss[0]
        ct   = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(sym)
        if not tick:
            continue
        cp  = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
        res = mt5.order_send({
            'action':       mt5.TRADE_ACTION_DEAL, 'symbol': sym, 'volume': pos.volume,
            'type':         ct,                    'position': ticket, 'price': cp,
            'deviation':    20,                    'magic': MAGIC,
            'comment':      (''.join(c for c in f'RgV4 {reason}' if c.isalnum() or c == ' '))[:31],
            'type_time':    mt5.ORDER_TIME_GTC,
            'type_filling': _filling_mode(sym),
        })
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            log.info(f'Closed ticket={ticket} at {cp}')
            return True
        log.warning(f'Close attempt {attempt + 1} failed: retcode={getattr(res, "retcode", None)}')
    log.error(f'Close FAILED after 3 attempts for ticket={ticket} ({pair}) — SL is protection')
    return False


def modify_sl(ticket: int, pair: str, new_sl: float, paper_mode: bool) -> bool:
    """Move the stop-loss of an open position to new_sl. Returns True on success."""
    if paper_mode or ticket < 0:
        return True   # paper: just update the dict in the caller
    if not HAS_MT5:
        return False
    sym   = _mt5_sym(pair)
    poss  = [p for p in (mt5.positions_get(symbol=sym) or []) if p.ticket == ticket]
    if not poss:
        return False
    pos = poss[0]
    res = mt5.order_send({
        'action':   mt5.TRADE_ACTION_SLTP,
        'position': ticket,
        'symbol':   sym,
        'sl':       round(new_sl, 5),
        'tp':       pos.tp,
        'magic':    MAGIC,
    })
    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'SL modified: ticket={ticket}  {pair}  new_sl={new_sl:.5f}')
        return True
    log.warning(f'modify_sl failed: retcode={getattr(res, "retcode", None)}')
    return False


# ── Trade window ───────────────────────────────────────────────────────────────

def within_window(cfg: dict) -> bool:
    now = datetime.now(timezone.utc).strftime('%H:%M')
    return cfg.get('trade_window_start', '07:00') <= now <= cfg.get('trade_window_end', '20:00')


# ── Regime debounce ────────────────────────────────────────────────────────────

class RegimeDebounce:
    def __init__(self, hold: int, min_conf: float):
        self.hold     = hold
        self.min_conf = min_conf
        self._hist:   list[tuple[str, float]] = []

    def push(self, regime: str, conf: float) -> Optional[str]:
        self._hist.append((regime, conf))
        if len(self._hist) > self.hold:
            self._hist = self._hist[-self.hold:]
        if len(self._hist) < self.hold:
            return None
        regimes = [r for r, _ in self._hist]
        if len(set(regimes)) != 1:
            return None
        if any(c < self.min_conf for _, c in self._hist):
            return None
        return self._hist[-1][0]

    def clear(self) -> None:
        self._hist.clear()


# ── RiskGuard V4 ──────────────────────────────────────────────────────────────

class RiskGuardV4:
    def __init__(self):
        self.dd_limit_pct:   float = 3.0
        self.monthly_dd_pct: float = 5.0
        self.lockout_secs:   float = 3 * 3600
        self.cooldown_secs:  float = 240
        self._day_start:     Optional[float] = None
        self._month_start:   Optional[float] = None
        self._locked_until:  float = 0.0
        self._last_trade:    dict[str, float] = {}
        self._reset_date:    Optional[date_type] = None
        self._reset_month:   Optional[str] = None

    def sync_cfg(self, cfg: dict) -> None:
        self.dd_limit_pct   = float(cfg.get('ddlimit',   3.0))
        self.monthly_dd_pct = float(cfg.get('monthlydd', 5.0))
        self.lockout_secs   = float(cfg.get('lockout',   3)) * 3600
        self.cooldown_secs  = float(cfg.get('cooldown',  240))

    def update_balance(self, bal: float) -> None:
        today      = datetime.now(timezone.utc).date()
        this_month = today.strftime('%Y-%m')
        if self._day_start is None:
            self._day_start = bal; self._reset_date = today
        if self._month_start is None:
            self._month_start = bal; self._reset_month = this_month
        if self._reset_date and today > self._reset_date:
            log.info(f'[RGV4] Daily reset: {self._day_start:.2f} → {bal:.2f}')
            self._day_start = bal; self._reset_date = today
        if self._reset_month != this_month:
            log.info(f'[RGV4] Month reset: {self._month_start:.2f} → {bal:.2f}')
            self._month_start = bal; self._reset_month = this_month

    def record_trade(self, pair: str) -> None:
        self._last_trade[pair] = time.time()

    def force_unlock(self) -> None:
        self._locked_until = 0.0
        self._day_start    = None
        log.info('[RGV4] RiskGuard force-unlocked')

    def block_reason(self, bal: float, pair: str = '') -> Optional[str]:
        now = time.time()
        if now < self._locked_until:
            return f'Locked out — {(self._locked_until - now) / 60:.0f}m remaining'
        if pair and pair in self._last_trade:
            elapsed = now - self._last_trade[pair]
            if elapsed < self.cooldown_secs:
                return f'Cooldown {(self.cooldown_secs - elapsed) / 60:.1f}m'
        if self._day_start:
            dd = (self._day_start - bal) / self._day_start * 100
            if dd >= self.dd_limit_pct:
                self._locked_until = now + self.lockout_secs
                return f'Daily DD {dd:.1f}% ≥ {self.dd_limit_pct}% — locked {self.lockout_secs / 3600:.0f}h'
        if self._month_start:
            mdd = (self._month_start - bal) / self._month_start * 100
            if mdd >= self.monthly_dd_pct:
                self._locked_until = now + self.lockout_secs
                return f'Monthly DD {mdd:.1f}% ≥ {self.monthly_dd_pct}% — locked'
        return None

    def is_locked(self) -> bool:
        return time.time() < self._locked_until

    def lock_remaining_mins(self) -> float:
        return max(0.0, (self._locked_until - time.time()) / 60)


# ── Status push helpers ───────────────────────────────────────────────────────

def _serialize_open_positions() -> list:
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
            }
            for p in (mt5.positions_get() or [])
            if p.magic == MAGIC
        ]
    except Exception:
        return []


def push_status(pairs_status: dict, balance: float, paper_mode: bool,
                url: str, riskguard_locked: bool = False) -> None:
    _kv_put('regime_bot_v4_status', {
        'pairs':            pairs_status,
        'balance':          round(balance, 2),
        'paper_mode':       paper_mode,
        'riskguard_locked': riskguard_locked,
        'pushed_at':        time.time(),
        'version':          'v4',
        'mt5_positions':    _serialize_open_positions(),
    }, url)


# ── Main loop ─────────────────────────────────────────────────────────────────

def run(url: str, paper_mode: bool) -> None:
    log.info(f'RegimeV4 starting  paper={paper_mode}  dashboard={url}')

    load_credentials(url)
    if not paper_mode:
        if not mt5_connect():
            log.warning('MT5 connection failed — falling back to paper mode')
            paper_mode = True

    cfg = load_config(url)
    tg  = load_tg_config(url, cfg)

    log.info(
        f'Config: pairs={cfg["pairs"]}  hold={cfg["candle_hold"]}  '
        f'entry_conf={cfg["entry_conf"]}%  score_min={cfg["entry_score_min"]}  '
        f'interval={cfg["interval_secs"]}s  max_range_bars={cfg["max_range_hold_bars"]}'
    )

    # ── Per-pair state ────────────────────────────────────────────────────────
    debounce:         dict[str, RegimeDebounce]  = {}
    conf_history:     dict[str, deque]           = {}   # rolling 10-bar confidence
    bocpd_hist:       dict[str, deque]           = {}   # rolling 5-bar BOCPD prob
    run_lengths:      dict[str, int]             = {}
    last_regimes:     dict[str, str]             = {}
    regime_start_t:   dict[str, float]           = {}
    prev_regime_dur:  dict[str, float]           = {}
    momentum_start_t: dict[str, float]           = {}
    momentum_regime:  dict[str, str]             = {}
    bocpd_high_bars:  dict[str, int]             = {}
    # Position state
    open_pos:         dict[str, dict]            = {}
    entry_regime:     dict[str, str]             = {}
    pos_state:        dict[str, str]             = {}   # 'TREND_HOLD' | 'RANGE_HOLD'
    range_bar_ctr:    dict[str, int]             = {}   # bars spent in RANGE_HOLD
    running_mfe:      dict[str, float]           = {}   # live MFE in price units
    be_activated:     dict[str, bool]            = {}   # breakeven SL has been set
    hold_score_bars:  dict[str, int]             = {}   # consecutive polls score < hold_min
    failed_entry_t:   dict[str, float]           = {}

    risk_guard = RiskGuardV4()
    bocpd_reg  = BOCPRegistry(expected_run_length=cfg.get('bocpd_run_length', 150))
    macro      = MacroOverlay(fomc_window_hours=cfg.get('fomc_window_hours', 6.0))

    def _init_pair(pair: str) -> None:
        debounce[pair]         = RegimeDebounce(cfg['candle_hold'], cfg['entry_conf'])
        conf_history[pair]     = deque(maxlen=10)
        bocpd_hist[pair]       = deque(maxlen=5)
        run_lengths[pair]      = 0
        last_regimes[pair]     = ''
        regime_start_t[pair]   = time.time()
        prev_regime_dur[pair]  = 0.0
        momentum_start_t[pair] = time.time()
        momentum_regime[pair]  = ''
        bocpd_high_bars[pair]  = 0
        hold_score_bars[pair]  = 0

    for pair in cfg['pairs']:
        _init_pair(pair)

    last_heartbeat:  dict[str, float] = {p: 0.0 for p in cfg['pairs']}
    last_cfg_reload  = time.time()
    cycle            = 0
    _cycle_states:   list[dict] = []
    _cycle_events:   list[dict] = []

    while True:
        cycle     += 1
        loop_start = time.time()
        _cycle_states = []
        _cycle_events = []

        # Reload config every 5 min
        if time.time() - last_cfg_reload > 300:
            new_cfg = load_config(url)
            cfg.update(new_cfg)
            tg  = load_tg_config(url, cfg)
            macro = MacroOverlay(fomc_window_hours=cfg.get('fomc_window_hours', 6.0))
            last_cfg_reload = time.time()
            for pair in cfg['pairs']:
                if pair not in debounce:
                    _init_pair(pair)
                    last_heartbeat[pair] = 0.0

        if not cfg.get('enabled', True):
            time.sleep(cfg['interval_secs'])
            continue

        check_force_unlock(url, risk_guard)

        if cfg.get('use_vix', True) or cfg.get('use_news', True):
            macro.refresh()

        all_regimes = fetch_regimes(url)
        h1_regimes  = fetch_1h_regimes(url) if cfg.get('use_1h', True) else {}
        balance     = get_balance(paper_mode)
        risk_guard.sync_cfg(cfg)
        risk_guard.update_balance(balance)

        if not all_regimes:
            log.warning(f'Cycle {cycle}: no regime data — skipping')
            time.sleep(cfg['interval_secs'])
            continue

        # Adopt orphaned MT5 positions
        if HAS_MT5 and not paper_mode:
            try:
                sym_to_pair = {_mt5_sym(p): p for p in cfg['pairs']}
                for mt5p in (mt5.positions_get() or []):
                    pk = sym_to_pair.get(mt5p.symbol)
                    if not pk or pk in open_pos:
                        continue
                    direction = 'LONG' if mt5p.type == 0 else 'SHORT'
                    log.warning(f'[{pk}] Adopting orphaned position ticket={mt5p.ticket} {direction}')
                    open_pos[pk]     = {
                        'ticket':      mt5p.ticket, 'direction': direction,
                        'entry_price': float(mt5p.price_open), 'sl': float(mt5p.sl),
                        'opened_at':   float(mt5p.time),
                    }
                    entry_regime[pk] = all_regimes.get(pk, {}).get('regime', '').upper() or direction[:4]
                    pos_state[pk]    = 'TREND_HOLD'
                    range_bar_ctr[pk]= 0
                    running_mfe[pk]  = 0.0
                    be_activated[pk] = False
                    hold_score_bars[pk] = 0
            except Exception as exc:
                log.debug(f'Orphan scan failed: {exc}')

        pairs_status: dict[str, dict] = {}

        for pair in cfg['pairs']:
            rd          = all_regimes.get(pair) or {}
            regime      = rd.get('regime', 'RANGE').upper()
            confidence  = float(rd.get('confidence', 0))
            vol_z       = float(rd.get('volZ', rd.get('vol_z', 0.0)))
            session_lbl = rd.get('sessionLabel', '')

            h1_rd       = h1_regimes.get(pair) or {}
            h1_regime   = h1_rd.get('regime', '').upper() if h1_rd else None

            # Confidence history + slope
            conf_history[pair].append(confidence)
            conf_list  = list(conf_history[pair])
            conf_slope = _ols_slope(conf_list) if len(conf_list) >= 3 else 0.0

            # BOCPD + trend
            bocpd_prob  = 0.0
            bocpd_trend = 0.0
            if cfg.get('use_bocpd', True):
                bocpd_prob = bocpd_reg.update(pair, confidence, regime)
            bocpd_hist[pair].append(bocpd_prob)
            if len(bocpd_hist[pair]) >= 3:
                bocpd_trend = _ols_slope(list(bocpd_hist[pair]))

            # Run length / regime change
            prev_regime = last_regimes.get(pair, '')
            now_t       = time.time()

            if regime != prev_regime:
                prev_regime_dur[pair] = now_t - regime_start_t.get(pair, now_t)
                regime_start_t[pair]  = now_t
                run_lengths[pair]     = 1
                last_regimes[pair]    = regime

                prev_mom = momentum_regime.get(pair, '')
                if (prev_mom == 'BULL' and regime == 'BEAR') or \
                   (prev_mom == 'BEAR' and regime == 'BULL'):
                    momentum_start_t[pair] = now_t
                    momentum_regime[pair]  = regime
                elif regime in TRADEABLE and prev_mom == '':
                    momentum_start_t[pair] = now_t
                    momentum_regime[pair]  = regime

                if prev_regime and regime in TRADEABLE:
                    peer_cnt, peer_tot = peer_directional_count(pair, cfg['pairs'], all_regimes)
                    price_now = get_price(pair, url) or 0.0
                    msg = regime_change_alert(
                        pair=pair, prev_regime=prev_regime, new_regime=regime,
                        confidence=confidence, price=price_now, vol_z=vol_z,
                        run_length=run_lengths[pair], change_prob=bocpd_prob,
                        prev_regime_duration_secs=prev_regime_dur[pair],
                        consensus=peer_cnt, consensus_total=peer_tot + 1,
                        h1_regime=h1_regime, bocpd_prob=bocpd_prob,
                        macro=macro.snapshot(pair),
                    )
                    send_telegram(tg['token'], tg['chat_id'], msg)
            else:
                run_lengths[pair] += 1

            run_length    = run_lengths[pair]
            regime_secs   = now_t - regime_start_t.get(pair, now_t)
            momentum_secs = now_t - momentum_start_t.get(pair, now_t)

            sess_mult = macro.session_multiplier(session_lbl)
            eff_conf  = confidence * sess_mult

            peer_cnt, peer_tot = peer_directional_count(pair, cfg['pairs'], all_regimes)

            macro_inputs = macro.score_inputs(pair)
            reg_score = compute_regime_score_v4(
                pair=pair, regime=regime, confidence=confidence,
                bocpd_prob=bocpd_prob, bocpd_trend=bocpd_trend,
                session_mult=sess_mult,
                peer_directional=peer_cnt, peer_total=peer_tot,
                pair_vol_pct=macro_inputs.get('pair_vol_pct'),
                dxy_trend_pct=macro_inputs.get('dxy_trend_pct', 0.0),
                credit_5d_ret=macro_inputs.get('credit_5d_ret', 0.0),
                entry_score_min=cfg.get('entry_score_min', 65.0),
            )

            # Score low counter (used for hold-score exit in TREND_HOLD)
            if reg_score.total < cfg.get('hold_score_min', 35.0):
                hold_score_bars[pair] += 1
            else:
                hold_score_bars[pair]  = 0

            # BOCPD high bar counter
            if bocpd_prob >= cfg.get('bocpd_thresh', 80.0):
                bocpd_high_bars[pair] += 1
            else:
                bocpd_high_bars[pair]  = 0

            log.info(
                f'[{pair}] reg={regime}  conf={confidence:.0f}%  slope={conf_slope:+.1f}  '
                f'vz={vol_z:+.2f}  rl={run_length}  bocpd={bocpd_prob:.1f}%'
                f'(Δ{bocpd_trend:+.1f})  score={reg_score.total:.0f}'
                + (f'  1h={h1_regime}' if h1_regime else '')
                + (f'  state={pos_state.get(pair, "-")}' if pair in open_pos else '')
            )

            _cycle_states.append({
                'pair':   pair, 'regime': regime, 'conf': round(confidence, 1),
                'slope':  round(conf_slope, 2),   'vz':   round(vol_z, 3),
                'rl':     run_length,              'bocpd': round(bocpd_prob, 1),
                'bocpd_trend': round(bocpd_trend, 2),
                'score':  round(reg_score.total, 1),
                'h1':     h1_regime or '',
                'pos_state': pos_state.get(pair, ''),
            })

            # ──────────────────────────────────────────────────────────────────
            # OPEN POSITION MANAGEMENT
            # ──────────────────────────────────────────────────────────────────
            if pair in open_pos:
                pos       = open_pos[pair]
                entry_r   = entry_regime.get(pair, '')
                direction = pos['direction']
                sign      = 1 if direction == 'LONG' else -1
                price_now = get_price(pair, url) or pos['entry_price']
                pip       = _PIP_SIZES.get(pair, 0.0001)
                pnl_pips  = round((price_now - pos['entry_price']) * sign / pip, 1)
                dur_secs  = now_t - pos.get('opened_at', now_t)
                sl_dist   = abs(pos['entry_price'] - pos.get('sl', pos['entry_price']))
                state     = pos_state.get(pair, 'TREND_HOLD')

                # Track MFE
                fav_dist = (price_now - pos['entry_price']) * sign
                if fav_dist > running_mfe.get(pair, 0.0):
                    running_mfe[pair] = fav_dist
                mfe_dist = running_mfe.get(pair, 0.0)
                mfe_r    = mfe_dist / sl_dist if sl_dist > 0 else 0.0

                # X5: SL hit
                if HAS_MT5 and not paper_mode:
                    mt5_sym = _mt5_sym(pair)
                    still_open = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                                  if p.ticket == pos['ticket']]
                    if not still_open:
                        log.info(f'[{pair}] Ticket {pos["ticket"]} gone — SL hit (X5)')
                        _cycle_events.append({'pair': pair, 'type': 'sl_hit'})
                        del open_pos[pair]
                        for d in (entry_regime, pos_state, range_bar_ctr,
                                  running_mfe, be_activated):
                            d.pop(pair, None)
                        hold_score_bars[pair] = 0
                        risk_guard.record_trade(pair)
                        pairs_status[pair] = {'status': 'sl_hit', 'regime': regime}
                        continue

                # Breakeven trail — set once when MFE reaches mfe_trail_r
                mfe_trail_r = cfg.get('mfe_trail_r', 1.0)
                if mfe_r >= mfe_trail_r and not be_activated.get(pair, False):
                    be_price = pos['entry_price']
                    if modify_sl(pos['ticket'], pair, be_price, paper_mode):
                        open_pos[pair]['sl'] = be_price
                        be_activated[pair]   = True
                        sl_dist = abs(pos['entry_price'] - be_price) or sl_dist
                        log.info(f'[{pair}] SL trailed to breakeven {be_price:.5f} (MFE {mfe_r:.2f}R)')

                # ── State transitions ────────────────────────────────────────
                opp_regime = _OPPOSITE.get(entry_r, '')

                if regime == entry_r:
                    if state == 'RANGE_HOLD':
                        pos_state[pair]    = 'TREND_HOLD'
                        range_bar_ctr[pair] = 0
                        state              = 'TREND_HOLD'
                        log.info(f'[{pair}] Regime returned to {entry_r} — continuation, back to TREND_HOLD')
                        send_telegram(
                            tg['token'], tg['chat_id'],
                            f'📈 [V4] <b>{pair}</b> — regime returned to <b>{entry_r}</b> after RANGE hold\n'
                            f'  Conf: {confidence:.1f}%  MFE: {mfe_dist / pip:.1f}p  Score: {reg_score.total:.0f}\n'
                            f'  Continuation in progress — position held'
                        )

                elif regime not in TRADEABLE:
                    # Regime is RANGE/CHOP — enter or continue RANGE_HOLD
                    if state == 'TREND_HOLD':
                        pos_state[pair]    = 'RANGE_HOLD'
                        range_bar_ctr[pair] = 1
                        state              = 'RANGE_HOLD'
                        # Trail SL to BE if we have profit buffer
                        if mfe_r >= mfe_trail_r and not be_activated.get(pair, False):
                            be_price = pos['entry_price']
                            if modify_sl(pos['ticket'], pair, be_price, paper_mode):
                                open_pos[pair]['sl'] = be_price
                                be_activated[pair]   = True
                        be_msg = '  SL → breakeven' if be_activated.get(pair) else '  (no BE yet)'
                        log.info(f'[{pair}] Regime → RANGE — entering RANGE_HOLD bar 1{be_msg}')
                        send_telegram(
                            tg['token'], tg['chat_id'],
                            f'⏸ [V4] <b>{pair}</b> — regime → RANGE  holding position\n'
                            f'  Entry: {entry_r}  Conf: {confidence:.1f}%\n'
                            f'  MFE: {mfe_dist / pip:.1f}p  P&L: {pnl_pips:+.1f}p\n'
                            f'  Max hold: {cfg["max_range_hold_bars"]} bars'
                            + be_msg
                        )
                    else:
                        range_bar_ctr[pair] = range_bar_ctr.get(pair, 0) + 1

                # ── Exit checks ──────────────────────────────────────────────
                close_reason: Optional[str] = None
                exit_code:    str           = ''

                # X1: full reversal (any state, immediate)
                if regime == opp_regime:
                    close_reason = f'Regime reversed → {regime} (X1)'
                    exit_code    = 'X1'

                # X2: confidence hard floor (any state)
                if not close_reason and confidence < cfg.get('conf_floor', 45.0):
                    close_reason = f'Conf floor {confidence:.1f}% < {cfg["conf_floor"]:.0f}% (X2)'
                    exit_code    = 'X2'

                mfe_suppress_r = cfg.get('mfe_suppress_r', 1.5)

                # X3: slope (TREND_HOLD + MFE < mfe_suppress_r)
                if not close_reason and state == 'TREND_HOLD' and mfe_r < mfe_suppress_r:
                    sb = cfg.get('slope_bars', 5)
                    if len(conf_list) >= sb:
                        diffs = [conf_list[i] - conf_list[i-1]
                                 for i in range(max(1, len(conf_list) - sb), len(conf_list))]
                        if diffs and all(d < cfg.get('slope_thresh', -5.0) for d in diffs):
                            close_reason = f'Conf slope × {sb} bars (X3)'
                            exit_code    = 'X3'

                # X4: single-bar drop (TREND_HOLD + MFE < mfe_suppress_r)
                if not close_reason and state == 'TREND_HOLD' and mfe_r < mfe_suppress_r:
                    if len(conf_list) >= 2:
                        drop = conf_list[-2] - conf_list[-1]
                        if drop > cfg.get('drop_thresh', 15.0):
                            close_reason = f'Conf drop {drop:.1f}% in 1 bar (X4)'
                            exit_code    = 'X4'

                # X6: BOCPD sustained high (state-dependent bar count)
                if not close_reason and cfg.get('use_bocpd', True):
                    bars_req = (cfg.get('bocpd_exit_bars', 4) if state == 'TREND_HOLD'
                                else cfg.get('bocpd_exit_bars_range', 8))
                    if bocpd_high_bars[pair] >= bars_req:
                        close_reason = (
                            f'BOCPD {bocpd_prob:.0f}% × {bocpd_high_bars[pair]} bars '
                            f'({state}) (X6)'
                        )
                        exit_code = 'X6'

                # X7: 1H opposed (any state)
                if not close_reason and cfg.get('use_1h', True) and h1_regime:
                    if h1_regime == opp_regime:
                        close_reason = f'1H flipped to {h1_regime} (X7)'
                        exit_code    = 'X7'

                # X8: VIX spike mid-trade (any state)
                if not close_reason and cfg.get('use_vix', True):
                    vix_exit = cfg.get('vix_exit_max', 35.0)
                    if vix_exit > 0 and macro.vix.is_stress and (macro.vix.vix or 0) > vix_exit:
                        close_reason = f'VIX spike {macro.vix.vix:.0f} > {vix_exit:.0f} (X8)'
                        exit_code    = 'X8'

                # X_rt: RANGE hold timeout
                if not close_reason and state == 'RANGE_HOLD':
                    max_rh = cfg.get('max_range_hold_bars', 30)
                    if range_bar_ctr.get(pair, 0) >= max_rh:
                        t_mins = max_rh * cfg['interval_secs'] // 60
                        close_reason = f'RANGE timeout {range_bar_ctr[pair]} bars (~{t_mins}m) (X_rt)'
                        exit_code    = 'X_rt'

                # Hold score exit (TREND_HOLD only — not during range consolidation)
                if not close_reason and state == 'TREND_HOLD':
                    hs_bars = cfg.get('hold_score_bars', 4)
                    if hold_score_bars[pair] >= hs_bars:
                        close_reason = (
                            f'Score {reg_score.total:.0f} < {cfg.get("hold_score_min", 35.0):.0f} '
                            f'× {hold_score_bars[pair]} bars'
                        )
                        exit_code = 'X_score'

                # X9: outside trade window
                if not close_reason and not within_window(cfg):
                    close_reason = 'Outside trade window (X9)'
                    exit_code    = 'X9'

                if close_reason:
                    ok = close_position(pos['ticket'], pair, paper_mode, close_reason)
                    if ok:
                        _cycle_events.append({
                            'pair': pair, 'type': 'close',
                            'reason': f'{exit_code}: {close_reason}',
                            'direction': direction,
                        })
                        msg = exit_alert(
                            pair=pair, direction=direction,
                            exit_reason=f'{exit_code}: {close_reason}',
                            conf_at_exit=confidence, regime_at_exit=regime,
                            pnl_pips=pnl_pips, duration_secs=dur_secs,
                            paper_mode=paper_mode,
                            entry_price=pos['entry_price'],
                            close_price=price_now,
                            opened_at=pos.get('opened_at'),
                        )
                        send_telegram(tg['token'], tg['chat_id'], msg)

                        del open_pos[pair]
                        for d in (entry_regime, pos_state, range_bar_ctr,
                                  running_mfe, be_activated):
                            d.pop(pair, None)
                        hold_score_bars[pair] = 0
                        bocpd_high_bars[pair] = 0
                        risk_guard.record_trade(pair)
                        pairs_status[pair] = {
                            'status': 'closed', 'reason': exit_code,
                            'pnl_pips': pnl_pips, 'regime': regime,
                        }
                        continue

                # Position still open — build status + heartbeat
                pairs_status[pair] = {
                    'status':        'open',
                    'direction':     direction,
                    'pos_state':     state,
                    'range_bar_ctr': range_bar_ctr.get(pair, 0),
                    'be_active':     be_activated.get(pair, False),
                    'entry':         pos['entry_price'],
                    'sl':            pos.get('sl'),
                    'ticket':        pos['ticket'],
                    'pnl_pips':      pnl_pips,
                    'mfe_r':         round(mfe_r, 2),
                    'regime':        regime,
                    'conf':          round(confidence, 1),
                    'slope':         round(conf_slope, 2),
                    'bocpd':         round(bocpd_prob, 1),
                    'bocpd_trend':   round(bocpd_trend, 2),
                    'h1_regime':     h1_regime,
                    'session':       session_lbl,
                    'dur_secs':      round(dur_secs, 0),
                    'mfe_pips':      round(mfe_dist / pip, 1),
                    'reg_score':     reg_score.to_dict(),
                }

                hb_secs = cfg.get('heartbeat_min', 60) * 60
                if hb_secs > 0 and now_t - last_heartbeat.get(pair, 0) >= hb_secs:
                    pos_info = {
                        'direction':     direction,
                        'pnl_pips':      pnl_pips,
                        'duration_secs': dur_secs,
                        'entry_price':   pos['entry_price'],
                        'opened_at':     pos.get('opened_at', 0),
                    }
                    p_cnt, p_tot = peer_directional_count(pair, cfg['pairs'], all_regimes)
                    msg = heartbeat_message(
                        pair=pair, regime=regime, confidence=confidence,
                        slope=conf_slope, vol_z=vol_z,
                        regime_secs=regime_secs, momentum_secs=momentum_secs,
                        change_prob=bocpd_prob, open_pos=pos_info,
                        h1_regime=h1_regime, bocpd_prob=bocpd_prob,
                        exhaustion_score=0.0,
                        consensus=p_cnt, consensus_total=p_tot + 1,
                        macro=macro.snapshot(pair), session_label=session_lbl,
                        reg_score=reg_score.to_dict(),
                    )
                    # Append V4-specific state line
                    state_note = (
                        f'\n  PosState  : {state}'
                        + (f'  (bar {range_bar_ctr.get(pair, 0)}/{cfg["max_range_hold_bars"]})' if state == 'RANGE_HOLD' else '')
                        + (f'\n  BE trail  : active' if be_activated.get(pair) else '')
                        + f'\n  MFE       : {mfe_dist / pip:.1f}p ({mfe_r:.2f}R)'
                    )
                    send_telegram(tg['token'], tg['chat_id'], msg + state_note)
                    last_heartbeat[pair] = now_t

                continue  # position managed — skip entry logic

            # ──────────────────────────────────────────────────────────────────
            # ENTRY LOGIC
            # ──────────────────────────────────────────────────────────────────
            if not within_window(cfg):
                pairs_status[pair] = {'status': 'window', 'regime': regime}
                continue

            block = risk_guard.block_reason(balance, pair)
            if block:
                if cycle % 10 == 0:
                    log.info(f'[{pair}] RiskGuard: {block}')
                pairs_status[pair] = {'status': 'blocked', 'reason': block, 'regime': regime}
                continue

            if regime not in TRADEABLE:
                pairs_status[pair] = {
                    'status': 'watching', 'regime': regime,
                    'conf': round(confidence, 1), 'score': round(reg_score.total, 1),
                }
                debounce[pair].clear()
                continue

            # ── Gate checks ───────────────────────────────────────────────────
            gate_fail: Optional[str] = None

            # G2: effective confidence
            if eff_conf < cfg.get('entry_conf', 70.0):
                gate_fail = f'eff_conf {eff_conf:.1f}% < {cfg["entry_conf"]}% (G2)'

            # G4: 1H not opposed
            if not gate_fail and cfg.get('use_1h', True) and h1_regime:
                if h1_regime == _OPPOSITE.get(regime, ''):
                    gate_fail = f'1H opposed ({h1_regime}) (G4)'

            # G5: peer directional consensus
            if not gate_fail and peer_tot > 0:
                if peer_cnt < cfg.get('consensus_min', 1):
                    gate_fail = f'Peer dir {peer_cnt}/{peer_tot} < {cfg["consensus_min"]} (G5)'

            # G6: composite score
            if not gate_fail and not reg_score.entry_allowed:
                gate_fail = f'Score {reg_score.total:.0f} < {cfg.get("entry_score_min", 65.0):.0f} (G6)'

            # G7: FOMC window
            if not gate_fail and macro.fomc.is_window(cfg.get('fomc_window_hours', 6.0)):
                gate_fail = f'FOMC window {cfg["fomc_window_hours"]:.0f}h (G7)'

            # G8: VIX stress
            if not gate_fail and cfg.get('use_vix', True):
                vix_max = cfg.get('vix_entry_max', 25.0)
                if vix_max > 0 and macro.vix.is_stress:
                    gate_fail = f'VIX stress (>{vix_max:.0f}) (G8)'

            # G9: news window
            if not gate_fail and cfg.get('use_news', True):
                news_blocked, news_reason = macro.news.is_blocked(pair)
                if news_blocked:
                    gate_fail = f'News block: {news_reason} (G9)'

            if gate_fail:
                log.info(f'[{pair}] Gate: {gate_fail}')
                pairs_status[pair] = {
                    'status': 'gated', 'reason': gate_fail,
                    'regime': regime, 'conf': round(confidence, 1),
                    'score': round(reg_score.total, 1),
                }
                continue

            # G3: candle hold debounce
            confirmed = debounce[pair].push(regime, confidence)
            if not confirmed:
                pairs_status[pair] = {
                    'status': 'hold_pending', 'regime': regime,
                    'conf': round(confidence, 1), 'score': round(reg_score.total, 1),
                }
                continue

            # Order fail cooldown
            fail_cd = cfg.get('entry_fail_cooldown_secs', 300)
            if time.time() - failed_entry_t.get(pair, 0) < fail_cd:
                remaining = int(fail_cd - (time.time() - failed_entry_t[pair]))
                pairs_status[pair] = {'status': f'order_fail_cd ({remaining}s)', 'regime': regime}
                continue

            # ── ENTRY ─────────────────────────────────────────────────────────
            direction = 'LONG' if confirmed == 'BULL' else 'SHORT'
            price     = get_price(pair, url)
            if price is None:
                log.warning(f'[{pair}] No price — skip entry')
                continue

            pip     = _PIP_SIZES.get(pair, 0.0001)
            atr     = get_atr(pair, cfg.get('sl_atr_tf', '5m'))
            sl_dist = (atr * cfg['sl_atr_mult']) if atr else (20 * pip)
            sl      = (price - sl_dist) if direction == 'LONG' else (price + sl_dist)
            size    = position_size(balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot'])
            size    = max(0.01, round(size * reg_score.size_pct / 100.0, 2))

            ticket = open_position(pair, direction, sl, size, cfg['max_spread_pips'], paper_mode)

            if ticket is not None:
                _cycle_events.append({
                    'pair': pair, 'type': 'entry',
                    'direction': direction, 'lots': size, 'sl': round(sl, 5),
                })
                open_pos[pair] = {
                    'ticket': ticket, 'direction': direction,
                    'entry_price': price, 'sl': sl, 'opened_at': time.time(),
                }
                entry_regime[pair]    = confirmed
                pos_state[pair]       = 'TREND_HOLD'
                range_bar_ctr[pair]   = 0
                running_mfe[pair]     = 0.0
                be_activated[pair]    = False
                hold_score_bars[pair] = 0
                bocpd_high_bars[pair] = 0
                risk_guard.record_trade(pair)

                msg = entry_alert(
                    pair=pair, direction=direction, regime=confirmed,
                    confidence=confidence, price=price, sl=sl,
                    lots=size, paper_mode=paper_mode,
                    consensus=peer_cnt, consensus_total=peer_tot + 1,
                    h1_regime=h1_regime, vol_z=vol_z,
                    reg_score=reg_score.to_dict(),
                )
                send_telegram(tg['token'], tg['chat_id'], msg)

                log.info(
                    f'[{pair}] ENTRY {direction}  conf={confidence:.0f}%  score={reg_score.total:.0f}  '
                    f'size_pct={reg_score.size_pct:.0f}%  peer_dir={peer_cnt}/{peer_tot}  '
                    f'bocpd={bocpd_prob:.1f}%  lots={size}  SL={sl:.5f}'
                )
                pairs_status[pair] = {
                    'status': 'opened', 'direction': direction, 'entry': price,
                    'sl': sl, 'regime': confirmed, 'conf': round(confidence, 1),
                    'reg_score': reg_score.to_dict(),
                }
            else:
                failed_entry_t[pair] = time.time()
                log.warning(f'[{pair}] MT5 order failed — cooldown {fail_cd}s')
                pairs_status[pair] = {'status': 'entry_failed', 'regime': regime}

        # ── Status push + sleep ───────────────────────────────────────────────
        push_status(pairs_status, balance, paper_mode, url,
                    riskguard_locked=risk_guard.is_locked())
        push_regime_states(_cycle_states, _cycle_events, url)

        elapsed = time.time() - loop_start
        sleep_t = max(0, cfg['interval_secs'] - elapsed)
        if cycle % 20 == 0:
            log.info(
                f'Cycle {cycle}  balance={balance:.2f}  '
                f'open={list(open_pos.keys())}  macro={macro.label()}  '
                f'sleep={sleep_t:.1f}s'
            )
        time.sleep(sleep_t)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='RegimeV4 bot')
    parser.add_argument('--dashboard-url', default='http://localhost:3000',
                        help='Base URL of the MacroFX Railway server')
    parser.add_argument('--live', action='store_true',
                        help='Disable paper mode — places real MT5 orders')
    args = parser.parse_args()

    paper = not args.live
    if paper:
        log.info('PAPER MODE — no real orders will be placed')

    os.makedirs(os.path.join(_HERE, '..', 'logs'), exist_ok=True)
    run(args.dashboard_url, paper)


if __name__ == '__main__':
    main()
