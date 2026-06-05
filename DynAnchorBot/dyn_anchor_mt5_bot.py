"""
DynAnchor Bot — Dynamic Anchor Mean-Reversion Strategy
BULL+BEAR + Counter-regime filter (Calmar 9.97 validated config)

Strategy rules (exact backtest match):
  1. EWMA(λ=0.94) on daily log returns → σ_d (EWMA daily volatility)
  2. EMA-20 slope regime: BULL (slope > 0.002), BEAR (slope < -0.002), RANGE (skip)
  3. Regime filter: skip RANGE days entirely
  4. Direction: BULL day → SELL only · BEAR day → BUY only (counter-regime)
  5. SELL entry = runLow × (1 + HL50), guard: entry > session_open
     BUY  entry = runHigh × (1 - HL50), guard: entry < session_open
  6. TP = session_open | SL = runHigh × (1 + HL75) for SELL, runLow × (1 − HL75) for BUY
  7. One trade per pair per day; EOD close at eod_close_time

Config key : dyn_anchor_config
Creds key  : dyn_anchor_credentials
Status key : dyn_anchor_status

Usage:
  python DynAnchorBot/dyn_anchor_mt5_bot.py
  python DynAnchorBot/dyn_anchor_mt5_bot.py --live
  python DynAnchorBot/dyn_anchor_mt5_bot.py --dashboard-url https://macrofxmodel-production.up.railway.app --live
"""

import argparse
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone, date as date_type
from typing import Optional

import requests

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Magic number (unique — no collision with 20260001/2/4/5) ──────────────────
MAGIC = 20260006

# ── Brownian Motion calibration constants ─────────────────────────────────────
_BM_P50       = 1.572   # 50th percentile BM range multiplier
_BM_P75       = 2.049   # 75th percentile BM range multiplier
_HL50_CORR    = 0.921   # FX empirical correction for 50th pct
_HL75_CORR    = 0.894   # FX empirical correction for 75th pct
_EWMA_LAMBDA  = 0.94    # EWMA decay factor
_EMA_PERIOD   = 20      # EMA period for regime slope
_SLOPE_THRESH = 0.002   # EMA slope threshold for regime classification

# ── Pip / pip-value tables ─────────────────────────────────────────────────────
_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'NZD/USD': 0.0001, 'USD/CAD': 0.0001,
    'USD/CHF': 0.0001, 'GBP/JPY': 0.01,  'EUR/JPY': 0.01,
    'EUR/GBP': 0.0001, 'EUR/CHF': 0.0001, 'AUD/JPY': 0.01,
    'EUR/CAD': 0.0001, 'GBP/AUD': 0.0001, 'AUD/CHF': 0.0001,
    'GBP/CHF': 0.0001, 'GBP/CAD': 0.0001, 'CAD/JPY': 0.01,
    'CHF/JPY': 0.01,   'NZD/JPY': 0.01,   'AUD/NZD': 0.0001,
    'GBP/NZD': 0.0001, 'EUR/NZD': 0.0001, 'EUR/AUD': 0.0001,
    'XAU/USD': 1.0,    'NAS100_USD': 1.0,
}
_PIP_VALUES = {
    'EUR/USD': 10.0,  'GBP/USD': 10.0,  'AUD/USD': 10.0,  'NZD/USD': 10.0,
    'USD/JPY': 9.0,   'USD/CAD': 7.5,   'USD/CHF': 10.5,
    'GBP/JPY': 9.0,   'EUR/JPY': 9.0,   'EUR/GBP': 13.0,
    'EUR/CHF': 10.5,  'AUD/JPY': 9.0,   'EUR/CAD': 7.5,
    'GBP/AUD': 7.0,   'AUD/CHF': 10.5,  'GBP/CHF': 10.5,
    'GBP/CAD': 7.5,   'CAD/JPY': 9.0,   'CHF/JPY': 9.0,
    'NZD/JPY': 9.0,   'AUD/NZD': 7.0,   'GBP/NZD': 7.0,
    'EUR/NZD': 7.0,   'EUR/AUD': 7.0,
    'XAU/USD': 100.0, 'NAS100_USD': 1.0,
}

# ── Logging ────────────────────────────────────────────────────────────────────
os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'logs'), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [DA] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            os.path.join(os.path.dirname(__file__), '..', 'logs', 'dyn_anchor_bot.log'),
            encoding='utf-8',
        ),
    ],
)
log = logging.getLogger(__name__)

# ── Default config ─────────────────────────────────────────────────────────────
DEFAULT_CFG: dict = {
    'enabled':             True,
    'paper_mode':          True,
    'pairs':               ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    'interval_secs':       60,
    'trade_window_start':  '00:00',
    'trade_window_end':    '22:00',
    'eod_close_time':      '22:30',   # close open positions before this UTC time
    'eod_close_mode':      'close',   # 'close' = force-close at EOD; 'run' = let TP/SL play out
    'risk_pct':            1.0,
    'max_lot':             5.0,
    'max_spread_pips':     3.0,
    'daily_bars_needed':   60,        # D1 bars for vol + EMA-20 warmup
    'ewma_lambda':         0.94,
    'ema_period':          20,
    'regime_threshold':    0.002,
    'ddlimit':             3.0,
    'monthlydd':           5.0,
    'lockout':             3,
    'cooldown':            0,         # seconds between trades on same pair
    'tg_token':            '',
    'tg_chat_id':          '',
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


def _kv_put(key: str, data, url: str) -> None:
    try:
        requests.post(
            f'{url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=10,
        )
    except Exception as exc:
        log.warning(f'kv_put({key}): {exc}')


def load_config(url: str) -> dict:
    stored = _kv_get('dyn_anchor_config', url)
    cfg = dict(DEFAULT_CFG)
    if stored:
        cfg.update(stored)
    return cfg


def load_credentials(url: str) -> None:
    creds = _kv_get('dyn_anchor_credentials', url)
    if not creds:
        return
    for env_key, cfg_key in [
        ('MT5_ACCOUNT', 'mt5_account'), ('MT5_PASSWORD', 'mt5_password'),
        ('MT5_SERVER',  'mt5_server'),  ('MT5_PATH',     'mt5_path'),
    ]:
        val = creds.get(cfg_key)
        if val:
            os.environ[env_key] = str(val)
    log.info(f'Credentials loaded: account={creds.get("mt5_account")}  server={creds.get("mt5_server")}')


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
        log.error('MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER not set — aborting')
        mt5.shutdown()
        return False
    if not mt5.login(int(account), password, server):
        log.error(f'MT5 login() failed: {mt5.last_error()}')
        return False
    info = mt5.account_info()
    if info:
        log.info(f'[DynAnchor] MT5 connected  account={info.login}  balance={info.balance:.2f}  server={info.server}')
        if str(info.login) != str(account):
            log.error(f'MT5 account mismatch: expected {account} got {info.login} — aborting')
            mt5.shutdown()
            return False
    return True


# ── Price helpers ──────────────────────────────────────────────────────────────

def get_tick(pair: str) -> Optional[object]:
    """Return MT5 tick object (bid, ask) or None."""
    if not HAS_MT5:
        return None
    try:
        tick = mt5.symbol_info_tick(pair.replace('/', ''))
        if tick and tick.bid > 0:
            return tick
    except Exception:
        pass
    return None


def get_balance(paper_mode: bool) -> float:
    if HAS_MT5 and not paper_mode:
        info = mt5.account_info()
        if info:
            return info.balance
    return 10_000.0


def get_daily_bars(pair: str, n_bars: int) -> Optional[list]:
    """Fetch n_bars D1 OHLC from MT5. Returns list of bar dicts."""
    if not HAS_MT5:
        return None
    try:
        sym  = pair.replace('/', '')
        bars = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_D1, 0, n_bars)
        if bars is None or len(bars) < 2:
            return None
        return bars
    except Exception as exc:
        log.warning(f'get_daily_bars({pair}): {exc}')
        return None


# ── Vol model — EWMA + EMA-20 regime ─────────────────────────────────────────

def _ema_series(values: list, period: int) -> list:
    """Compute full EMA series over values with given period."""
    alpha = 2.0 / (period + 1)
    ema   = [values[0]]
    for v in values[1:]:
        ema.append(alpha * v + (1 - alpha) * ema[-1])
    return ema


def compute_vol_and_regime(bars, cfg: dict) -> tuple:
    """
    Returns (hl50, hl75, regime, sigma_d, ema_slope) from D1 bars.
    hl50/hl75 are price fractions (multiply by price to get distance).
    regime: 'BULL' | 'BEAR' | 'RANGE'
    """
    lam        = float(cfg.get('ewma_lambda',    _EWMA_LAMBDA))
    ema_period = int(cfg.get('ema_period',       _EMA_PERIOD))
    slope_thr  = float(cfg.get('regime_threshold', _SLOPE_THRESH))

    closes = [float(b['close']) for b in bars]
    if len(closes) < ema_period + 2:
        return None, None, 'RANGE', 0.0, 0.0

    # EWMA variance from daily log returns
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
    ewma_var = rets[0] ** 2
    for r in rets[1:]:
        ewma_var = lam * ewma_var + (1 - lam) * r ** 2
    sigma_d = math.sqrt(max(ewma_var, 1e-10))

    hl50 = _BM_P50 * _HL50_CORR * sigma_d
    hl75 = _BM_P75 * _HL75_CORR * sigma_d

    # EMA-20 slope from latest two EMA values
    ema = _ema_series(closes, ema_period)
    if len(ema) < 2:
        return hl50, hl75, 'RANGE', sigma_d, 0.0

    slope = (ema[-1] - ema[-2]) / ema[-2] if ema[-2] != 0 else 0.0

    if slope > slope_thr:
        regime = 'BULL'
    elif slope < -slope_thr:
        regime = 'BEAR'
    else:
        regime = 'RANGE'

    return hl50, hl75, regime, sigma_d, slope


# ── Position sizing ────────────────────────────────────────────────────────────

def position_size(balance: float, risk_pct: float,
                  sl_dist: float, pair: str, max_lot: float) -> float:
    pip     = _PIP_SIZES.get(pair, 0.0001)
    pv      = _PIP_VALUES.get(pair, 10.0)
    sl_pips = sl_dist / pip
    risk_amt = balance * (risk_pct / 100)
    if sl_pips <= 0 or pv <= 0:
        return 0.01
    lots = risk_amt / (sl_pips * pv)
    return max(0.01, min(round(lots, 2), max_lot))


# ── MT5 order execution ────────────────────────────────────────────────────────

def _filling_mode(sym: str) -> int:
    info    = mt5.symbol_info(sym)
    filling = mt5.ORDER_FILLING_IOC
    if info:
        am = info.filling_mode
        if   am & 1: filling = mt5.ORDER_FILLING_FOK
        elif am & 2: filling = mt5.ORDER_FILLING_IOC
        elif am & 4: filling = mt5.ORDER_FILLING_RETURN
    return filling


def open_position(pair: str, direction: str, sl: float, tp: float,
                  size: float, max_spread: float, paper_mode: bool) -> Optional[int]:
    """Returns ticket int, -1 for paper mode, None on failure."""
    pip = _PIP_SIZES.get(pair, 0.0001)
    log.info(
        f'TRADE {pair} {direction}  SL={sl:.5f}  TP={tp:.5f}  lot={size}'
        + ('  [PAPER]' if paper_mode else '')
    )
    if paper_mode:
        return -1
    if not HAS_MT5:
        return None

    sym  = pair.replace('/', '')
    tick = mt5.symbol_info_tick(sym)
    if not tick:
        log.error(f'No tick for {sym}')
        return None

    spread_pips = (tick.ask - tick.bid) / pip
    if spread_pips > max_spread:
        log.warning(f'SPREAD BLOCK {pair}: {spread_pips:.1f}p > {max_spread}p')
        return None

    existing = [p for p in (mt5.positions_get(symbol=sym) or []) if p.magic == MAGIC]
    if existing:
        log.warning(f'DUPLICATE BLOCK {pair}: ticket {existing[0].ticket} already open')
        return None

    ot    = mt5.ORDER_TYPE_BUY if direction == 'BUY' else mt5.ORDER_TYPE_SELL
    price = tick.ask if direction == 'BUY' else tick.bid

    order = {
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       sym,
        'volume':       size,
        'type':         ot,
        'price':        price,
        'sl':           round(sl, 5),
        'tp':           round(tp, 5),
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'DynAnchor {direction[0]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(sym),
    }

    res = mt5.order_send(order)
    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'MT5 order placed: ticket={res.order}  price={price}')
        return res.order

    log.error(
        f'MT5 order failed: retcode={getattr(res,"retcode","?")} '
        f'{getattr(res,"comment","")}  last_error={mt5.last_error()}'
    )
    return None


def close_position(ticket: int, pair: str, paper_mode: bool, reason: str = '') -> bool:
    log.info(f'CLOSE {pair}  ticket={ticket}  reason={reason}' + ('  [PAPER]' if paper_mode else ''))
    if paper_mode or ticket < 0:
        return True
    if not HAS_MT5:
        return False

    sym   = pair.replace('/', '')
    poss  = [p for p in (mt5.positions_get(symbol=sym) or [])
             if p.ticket == ticket and p.magic == MAGIC]
    if not poss:
        log.warning(f'Ticket {ticket} not found — may already be SL/TP closed')
        return True

    pos   = poss[0]
    ct    = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    tick  = mt5.symbol_info_tick(sym)
    if not tick:
        return False

    cp  = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       sym,
        'volume':       pos.volume,
        'type':         ct,
        'position':     ticket,
        'price':        cp,
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'DA close: {reason[:28]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(sym),
    })
    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'Closed ticket={ticket} at {cp}')
        return True
    log.error(f'Close failed: {getattr(res,"retcode","?")}')
    return False


# ── RiskGuard ─────────────────────────────────────────────────────────────────

class RiskGuard:
    def __init__(self):
        self.dd_limit_pct:   float = 3.0
        self.monthly_dd_pct: float = 5.0
        self.lockout_secs:   float = 3 * 3600
        self.cooldown_secs:  float = 0.0
        self._day_start:     Optional[float] = None
        self._month_start:   Optional[float] = None
        self._locked_until:  float = 0.0
        self._last_trade:    dict  = {}
        self._reset_date:    Optional[date_type] = None
        self._reset_month:   Optional[str] = None

    def sync_cfg(self, cfg: dict) -> None:
        self.dd_limit_pct   = float(cfg.get('ddlimit',   3.0))
        self.monthly_dd_pct = float(cfg.get('monthlydd', 5.0))
        self.lockout_secs   = float(cfg.get('lockout',   3)) * 3600
        self.cooldown_secs  = float(cfg.get('cooldown',  0))

    def update_balance(self, bal: float) -> None:
        today      = datetime.now(timezone.utc).date()
        this_month = today.strftime('%Y-%m')
        if self._day_start is None:
            self._day_start = bal; self._reset_date = today
        if self._month_start is None or self._reset_month is None:
            self._month_start = bal; self._reset_month = this_month
        if self._reset_date and today > self._reset_date:
            log.info(f'Daily reset: {self._day_start:.2f} → {bal:.2f}')
            self._day_start = bal; self._reset_date = today
        if self._reset_month != this_month:
            log.info(f'Month reset: {self._month_start:.2f} → {bal:.2f}')
            self._month_start = bal; self._reset_month = this_month

    def record_trade(self, pair: str) -> None:
        self._last_trade[pair] = time.time()

    def force_unlock(self) -> None:
        self._locked_until = 0.0
        self._day_start    = None
        log.info('[DA] RiskGuard force-unlocked')

    def block_reason(self, bal: float, pair: str = '') -> Optional[str]:
        now = time.time()
        if now < self._locked_until:
            return f'Locked out — {(self._locked_until - now) / 60:.0f}m remaining'
        if pair and pair in self._last_trade and self.cooldown_secs > 0:
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


# ── Per-pair daily state ────────────────────────────────────────────────────────

class DailyState:
    """Holds the daily setup and intraday running state for one pair."""

    def __init__(self):
        self.setup_date:      Optional[date_type] = None   # date when setup was done
        self.session_open:    float = 0.0
        self.run_high:        float = 0.0
        self.run_low:         float = 0.0
        self.hl50:            float = 0.0   # fraction (not %)
        self.hl75:            float = 0.0
        self.sigma_d:         float = 0.0
        self.regime:          str   = 'RANGE'
        self.ema_slope:       float = 0.0
        self.tradeable:       bool  = False  # False when RANGE or no data
        self.daily_trade_done: bool = False  # one trade per day
        self.open_positions:  list = []      # open position dicts (list for multi-day carry)
        # Precompute cache — populated by nightly 23:30 forecast call
        self.forecast_params: Optional[dict] = None   # {hl50, hl75, sigma_d, regime, ema_slope}
        self.forecast_date:   Optional[date_type] = None  # date the forecast was run

    @property
    def is_today(self) -> bool:
        return self.setup_date == datetime.now(timezone.utc).date()

    @property
    def has_fresh_forecast(self) -> bool:
        """True when forecast was run last night (yesterday) and is still valid."""
        today = datetime.now(timezone.utc).date()
        return (
            self.forecast_params is not None and
            self.forecast_date is not None and
            self.forecast_date >= today   # forecast from today or yesterday
        )

    def reset_intraday(self) -> None:
        """Reset intraday state (keeps daily params)."""
        self.run_high       = self.session_open
        self.run_low        = self.session_open
        self.daily_trade_done = False
        self.open_positions = []


# ── Trade journal ──────────────────────────────────────────────────────────────

def log_trade_to_journal(trade: dict, url: str) -> None:
    """Append trade record to journal_store KV list."""
    try:
        existing = _kv_get('journal_store', url)
        if not isinstance(existing, list):
            existing = []
        existing.append(trade)
        # Keep last 500 trades
        if len(existing) > 500:
            existing = existing[-500:]
        _kv_put('journal_store', existing, url)
    except Exception as exc:
        log.warning(f'log_trade_to_journal: {exc}')


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


def _tg_entry(pair: str, direction: str, entry: float, sl: float, tp: float,
              lots: float, regime: str, hl50_pct: float, paper: bool) -> str:
    icon = '📉' if direction == 'SELL' else '📈'
    mode = ' [PAPER]' if paper else ''
    pip  = _PIP_SIZES.get(pair, 0.0001)
    sl_p = abs(entry - sl) / pip
    tp_p = abs(tp - entry) / pip
    return (
        f'{icon} <b>DynAnchor {direction} — {pair}</b>{mode}\n'
        f'Regime: <b>{regime}</b> (counter)  HL50: {hl50_pct:.3f}%\n'
        f'Entry: <code>{entry:.5f}</code>  Lots: <code>{lots}</code>\n'
        f'SL: <code>{sl:.5f}</code> ({sl_p:.1f}p)  TP: <code>{tp:.5f}</code> ({tp_p:.1f}p)'
    )


def _tg_exit(pair: str, direction: str, entry: float, exit_p: float,
             reason: str, pnl_pct: float, paper: bool) -> str:
    pip    = _PIP_SIZES.get(pair, 0.0001)
    sign   = 1 if direction == 'BUY' else -1
    pnl_p  = (exit_p - entry) * sign / pip
    icon   = '✅' if pnl_pct > 0 else '❌'
    mode   = ' [PAPER]' if paper else ''
    return (
        f'{icon} <b>DynAnchor CLOSE — {pair}</b>{mode}\n'
        f'Direction: {direction}  Reason: {reason}\n'
        f'Entry: <code>{entry:.5f}</code>  Exit: <code>{exit_p:.5f}</code>  '
        f'PnL: <code>{pnl_p:+.1f}p  ({pnl_pct:+.2f}%)</code>'
    )


# ── Status push ────────────────────────────────────────────────────────────────

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
                'swap':       round(float(p.swap), 2),
                'time_open':  int(p.time),
                'comment':    str(p.comment or ''),
            }
            for p in (mt5.positions_get() or [])
            if p.magic == MAGIC
        ]
    except Exception:
        return []


def _serialize_closed_trades() -> list:
    """Return today's closed positions from MT5 deal history for this bot."""
    if not HAS_MT5:
        return []
    try:
        from datetime import timedelta
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        deals = mt5.history_deals_get(today, today + timedelta(days=1)) or []
        by_pos: dict = {}
        for d in deals:
            if d.magic != MAGIC:
                continue
            pid = int(d.position_id)
            if pid not in by_pos:
                by_pos[pid] = {'in': None, 'out': []}
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
                direction  = 'BUY' if ind.type == 0 else 'SELL'
                open_price = round(float(ind.price), 5)
                time_open  = int(ind.time)
            else:
                direction  = 'BUY' if last_out.type == 1 else 'SELL'
                open_price = None
                time_open  = None
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


def push_status(pairs_state: dict, balance: float,
                paper_mode: bool, url: str) -> None:
    pairs_summary = {}
    for pair, ds in pairs_state.items():
        pip = _PIP_SIZES.get(pair, 0.0001)
        entry_info = {}
        if ds.open_positions:
            pos0 = ds.open_positions[0]
            entry_info = {
                'ticket':      pos0.get('ticket'),
                'direction':   pos0.get('direction'),
                'entry':       pos0.get('entry_price'),
                'sl':          pos0.get('sl'),
                'tp':          pos0.get('tp'),
                'n_positions': len(ds.open_positions),
            }
        pairs_summary[pair] = {
            'regime':            ds.regime,
            'tradeable':         ds.tradeable,
            'daily_trade_done':  ds.daily_trade_done,
            'setup_done':        ds.is_today,
            'session_open':      round(ds.session_open, 5),
            'run_high':          round(ds.run_high, 5),
            'run_low':           round(ds.run_low, 5),
            'hl50_pct':          round(ds.hl50 * 100, 4),
            'hl75_pct':          round(ds.hl75 * 100, 4),
            'sigma_d_pct':       round(ds.sigma_d * 100, 4),
            'ema_slope':         round(ds.ema_slope, 6),
            'sell_entry':        round(ds.run_low * (1 + ds.hl50), 5) if ds.hl50 > 0 else 0,
            'buy_entry':         round(ds.run_high * (1 - ds.hl50), 5) if ds.hl50 > 0 else 0,
            **entry_info,
        }
    _kv_put('dyn_anchor_status', {
        'pairs':          pairs_summary,
        'balance':        round(balance, 2),
        'paper_mode':     paper_mode,
        'pushed_at':      time.time(),
        'mt5_positions':        _serialize_open_positions(),
        'today_closed_trades': _serialize_closed_trades(),
    }, url)


# ── Nightly precompute ─────────────────────────────────────────────────────────

_PRECOMPUTE_START = '23:15'   # UTC — after NY close, D1 candle complete
_PRECOMPUTE_END   = '23:55'


def within_precompute_window() -> bool:
    now = datetime.now(timezone.utc).strftime('%H:%M')
    return _PRECOMPUTE_START <= now <= _PRECOMPUTE_END


def fetch_server_forecast(pairs: list, url: str, cfg: dict) -> Optional[dict]:
    """
    Call /api/dyn-anchor-forecast on the dashboard server.
    Returns dict of pair → forecast params, or None on failure.
    """
    try:
        pairs_str   = ','.join(pairs)
        lam         = cfg.get('ewma_lambda',     _EWMA_LAMBDA)
        ema_period  = cfg.get('ema_period',      _EMA_PERIOD)
        slope_thr   = cfg.get('regime_threshold', _SLOPE_THRESH)
        n_bars      = cfg.get('daily_bars_needed', 70)
        params = {
            'pairs':       pairs_str,
            'lambda':      lam,
            'emaPeriod':   ema_period,
            'slopeThresh': slope_thr,
            'bars':        n_bars,
        }
        r = requests.get(f'{url}/api/dyn-anchor-forecast', params=params, timeout=60)
        if r.status_code != 200:
            log.warning(f'Forecast endpoint returned {r.status_code}: {r.text[:200]}')
            return None
        j = r.json()
        if not j.get('ok'):
            log.warning(f'Forecast endpoint error: {j}')
            return None
        return j.get('forecast', {})
    except Exception as exc:
        log.warning(f'fetch_server_forecast: {exc}')
        return None


def run_nightly_precompute(daily_state: dict, pairs: list, url: str, cfg: dict) -> None:
    """
    Runs at ~23:30 UTC. Fetches next-session forecast params from the
    dashboard server and caches them in each pair's DailyState.
    """
    log.info(f'[Precompute] Running nightly forecast for {len(pairs)} pairs…')
    forecast = fetch_server_forecast(pairs, url, cfg)
    if not forecast:
        log.warning('[Precompute] No forecast data returned — bot will fall back to MT5 bars at session open')
        return

    from datetime import timedelta
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    ok_count = 0
    for pair in pairs:
        f = forecast.get(pair)
        if not f:
            log.warning(f'[Precompute] No forecast for {pair}: {forecast.get("errors", {}).get(pair, "missing")}')
            continue
        ds = daily_state.setdefault(pair, DailyState())
        ds.forecast_params = f
        ds.forecast_date   = tomorrow
        ok_count += 1
        log.info(
            f'[Precompute] {pair}  regime={f["regime"]}  '
            f'sigma_d={f["sigma_d"]*100:.3f}%  '
            f'hl50={f["hl50"]*100:.3f}%  hl75={f["hl75"]*100:.3f}%  '
            f'slope={f["ema_slope"]:.6f}'
        )
    log.info(f'[Precompute] Done — {ok_count}/{len(pairs)} pairs cached')


# ── Trade window helpers ───────────────────────────────────────────────────────

def _utc_hhmm() -> str:
    return datetime.now(timezone.utc).strftime('%H:%M')


def within_window(cfg: dict) -> bool:
    now = _utc_hhmm()
    return cfg.get('trade_window_start', '00:00') <= now <= cfg.get('trade_window_end', '22:00')


def past_eod(cfg: dict) -> bool:
    return _utc_hhmm() >= cfg.get('eod_close_time', '22:30')


# ── Main loop ─────────────────────────────────────────────────────────────────

def run(url: str, paper_mode: bool) -> None:
    log.info(f'DynAnchor bot starting  paper={paper_mode}  dashboard={url}')

    load_credentials(url)
    if not paper_mode:
        if not mt5_connect():
            log.warning('MT5 connection failed — falling back to paper mode')
            paper_mode = True

    cfg   = load_config(url)
    tg_t  = cfg.get('tg_token', '')
    tg_c  = cfg.get('tg_chat_id', '')
    log.info(
        f'Config: pairs={cfg["pairs"]}  interval={cfg["interval_secs"]}s  '
        f'risk={cfg["risk_pct"]}%  window={cfg["trade_window_start"]}–{cfg["trade_window_end"]}'
    )

    risk_guard  = RiskGuard()
    daily_state: dict[str, DailyState] = {p: DailyState() for p in cfg['pairs']}

    last_cfg_reload    = time.time()
    precompute_done_on: Optional[date_type] = None   # date precompute last ran
    cycle = 0

    while True:
        cycle += 1
        loop_start = time.time()

        # ── Config reload every 5 min ─────────────────────────────────────────
        if time.time() - last_cfg_reload > 300:
            cfg  = load_config(url)
            tg_t = cfg.get('tg_token', '')
            tg_c = cfg.get('tg_chat_id', '')
            last_cfg_reload = time.time()
            for pair in cfg['pairs']:
                if pair not in daily_state:
                    daily_state[pair] = DailyState()

        # ── Nightly precompute (23:15–23:55 UTC) ─────────────────────────────
        today = datetime.now(timezone.utc).date()
        if within_precompute_window() and precompute_done_on != today:
            run_nightly_precompute(daily_state, cfg['pairs'], url, cfg)
            precompute_done_on = today

        if not cfg.get('enabled', True):
            time.sleep(max(cfg.get('interval_secs', 60), 30))
            continue

        # ── MT5 reconnect guard ───────────────────────────────────────────────
        if not paper_mode and HAS_MT5:
            if not mt5.terminal_info():
                log.warning('MT5 connection lost — attempting reconnect')
                if not mt5_connect():
                    log.error('MT5 reconnect failed — skipping cycle')
                    time.sleep(30)
                    continue

        balance = get_balance(paper_mode)
        risk_guard.sync_cfg(cfg)
        risk_guard.update_balance(balance)

        # ── EOD close check ───────────────────────────────────────────────────
        if past_eod(cfg):
            if cfg.get('eod_close_mode', 'close') == 'close':
                for pair in cfg['pairs']:
                    ds = daily_state.get(pair)
                    if not ds or not ds.open_positions:
                        continue
                    still_open = []
                    for pos in ds.open_positions:
                        ok = close_position(pos['ticket'], pair, paper_mode, 'EOD')
                        if ok:
                            tick = get_tick(pair)
                            exit_p = ((tick.bid + tick.ask) / 2) if tick else pos['entry_price']
                            pip    = _PIP_SIZES.get(pair, 0.0001)
                            sign   = 1 if pos['direction'] == 'BUY' else -1
                            pnl_p  = (exit_p - pos['entry_price']) * sign / pip
                            pnl_pct = pnl_p * _PIP_VALUES.get(pair, 10.0) * pos.get('lots', 1.0) / balance * 100
                            msg = _tg_exit(pair, pos['direction'], pos['entry_price'],
                                           exit_p, 'EOD', pnl_pct, paper_mode)
                            send_telegram(tg_t, tg_c, msg)
                            log.info(
                                f'[{pair}] EOD close  {pos["direction"]}  '
                                f'entry={pos["entry_price"]:.5f}  exit={exit_p:.5f}  pnl={pnl_p:+.1f}p'
                            )
                            outcome = 'win' if pnl_pct > 0 else 'loss'
                            log_trade_to_journal({
                                'date':        datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                                'pair':        pair,
                                'side':        pos['direction'],
                                'entry_price': pos['entry_price'],
                                'entry_time':  pos.get('entry_time', ''),
                                'sl':          pos['sl'],
                                'tp':          pos['tp'],
                                'exit_price':  exit_p,
                                'exit_time':   datetime.now(timezone.utc).strftime('%H:%M'),
                                'status':      'closed',
                                'filled':      True,
                                'pnl_pct':     round(pnl_pct, 4),
                                'regime':      ds.regime,
                                'outcome':     outcome,
                                'lots':        pos.get('lots', 0),
                                'bot':         'dyn_anchor',
                            }, url)
                            risk_guard.record_trade(pair)
                            ds.daily_trade_done = True
                        else:
                            still_open.append(pos)
                    ds.open_positions = still_open
            time.sleep(max(cfg.get('interval_secs', 60), 30))
            continue

        pairs_state_out = dict(daily_state)

        for pair in cfg['pairs']:
            ds = daily_state.setdefault(pair, DailyState())

            # ── Daily setup ───────────────────────────────────────────────────
            if not ds.is_today and within_window(cfg):
                log.info(f'[{pair}] Running daily setup…')

                # --- Try to use nightly precomputed forecast first -----------
                hl50 = hl75 = sigma_d = slope = 0.0
                regime = 'RANGE'
                source = 'MT5'

                if ds.has_fresh_forecast:
                    fp = ds.forecast_params
                    hl50    = fp['hl50']
                    hl75    = fp['hl75']
                    sigma_d = fp['sigma_d']
                    regime  = fp['regime']
                    slope   = fp['ema_slope']
                    source  = 'forecast'
                    log.info(f'[{pair}] Using precomputed forecast params')
                else:
                    # Fall back: fetch D1 bars from MT5
                    n_bars = int(cfg.get('daily_bars_needed', 60))
                    bars   = get_daily_bars(pair, n_bars + 1)
                    if bars is None or len(bars) < int(cfg.get('ema_period', 20)) + 5:
                        log.warning(f'[{pair}] Insufficient D1 bars — skipping today')
                        ds.setup_date = datetime.now(timezone.utc).date()
                        ds.tradeable  = False
                        continue
                    hl50, hl75, regime, sigma_d, slope = compute_vol_and_regime(bars[:-1], cfg)
                    log.info(f'[{pair}] Computed vol/regime from MT5 bars (no precompute available)')

                # --- session_open = today's D1 open --------------------------
                # Always fetch from MT5/tick — cannot be precomputed since the
                # bar hasn't opened yet at 23:30.
                today_open = 0.0
                if HAS_MT5:
                    bars_today = get_daily_bars(pair, 1)
                    if bars_today and len(bars_today) > 0:
                        today_open = float(bars_today[0]['open'])
                if today_open <= 0:
                    tick = get_tick(pair)
                    today_open = (tick.bid + tick.ask) / 2 if tick else 0.0

                ds.setup_date   = datetime.now(timezone.utc).date()
                ds.session_open = today_open
                ds.run_high     = today_open
                ds.run_low      = today_open
                ds.hl50         = hl50 or 0.0
                ds.hl75         = hl75 or 0.0
                ds.sigma_d      = sigma_d
                ds.regime       = regime
                ds.ema_slope    = slope
                ds.tradeable    = regime in ('BULL', 'BEAR') and hl50 > 0
                ds.daily_trade_done = False
                # In close mode reset any tracked position; in run mode carry positions forward
                if cfg.get('eod_close_mode', 'close') == 'close':
                    ds.open_positions = []

                log.info(
                    f'[{pair}] Setup [{source}]: regime={regime}  sigma_d={sigma_d*100:.3f}%  '
                    f'hl50={hl50*100:.3f}%  hl75={hl75*100:.3f}%  '
                    f'session_open={today_open:.5f}  slope={slope:.6f}'
                )

                if not ds.tradeable:
                    log.info(f'[{pair}] RANGE day — no trading today')

            if not ds.is_today or not within_window(cfg):
                continue

            # ── Open position management ──────────────────────────────────────
            if ds.open_positions:
                remaining = []
                for pos in ds.open_positions:
                    if not paper_mode and HAS_MT5:
                        sym   = pair.replace('/', '')
                        still = [p for p in (mt5.positions_get(symbol=sym) or [])
                                 if p.ticket == pos['ticket'] and p.magic == MAGIC]
                        if not still:
                            tick   = get_tick(pair)
                            exit_p = (tick.bid + tick.ask) / 2 if tick else pos['entry_price']
                            pip    = _PIP_SIZES.get(pair, 0.0001)
                            sign   = 1 if pos['direction'] == 'BUY' else -1
                            pnl_p  = (exit_p - pos['entry_price']) * sign / pip
                            pnl_pct = pnl_p * _PIP_VALUES.get(pair, 10.0) * pos.get('lots', 1.0) / balance * 100
                            log.info(
                                f'[{pair}] Ticket {pos["ticket"]} gone — SL/TP hit  '
                                f'pnl={pnl_p:+.1f}p'
                            )
                            outcome = 'win' if pnl_pct > 0 else 'loss'
                            msg = _tg_exit(pair, pos['direction'], pos['entry_price'],
                                           exit_p, 'SL/TP', pnl_pct, paper_mode)
                            send_telegram(tg_t, tg_c, msg)
                            log_trade_to_journal({
                                'date':        datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                                'pair':        pair,
                                'side':        pos['direction'],
                                'entry_price': pos['entry_price'],
                                'entry_time':  pos.get('entry_time', ''),
                                'sl':          pos['sl'],
                                'tp':          pos['tp'],
                                'exit_price':  exit_p,
                                'exit_time':   datetime.now(timezone.utc).strftime('%H:%M'),
                                'status':      'closed',
                                'filled':      True,
                                'pnl_pct':     round(pnl_pct, 4),
                                'regime':      ds.regime,
                                'outcome':     outcome,
                                'lots':        pos.get('lots', 0),
                                'bot':         'dyn_anchor',
                            }, url)
                            risk_guard.record_trade(pair)
                            continue  # position closed, don't add to remaining
                    remaining.append(pos)
                ds.open_positions = remaining

                # Update running extremes
                tick = get_tick(pair)
                if tick:
                    ds.run_high = max(ds.run_high, float(tick.ask))
                    ds.run_low  = min(ds.run_low,  float(tick.bid))

                # In close mode skip entry check while any position is open
                if cfg.get('eod_close_mode', 'close') == 'close' and ds.open_positions:
                    continue

            # ── Skip if not tradeable or already traded ───────────────────────
            if not ds.tradeable or ds.daily_trade_done:
                tick = get_tick(pair)
                if tick:
                    ds.run_high = max(ds.run_high, float(tick.ask))
                    ds.run_low  = min(ds.run_low,  float(tick.bid))
                continue

            # ── RiskGuard ─────────────────────────────────────────────────────
            block = risk_guard.block_reason(balance, pair)
            if block:
                if cycle % 10 == 0:
                    log.info(f'[{pair}] RiskGuard: {block}')
                tick = get_tick(pair)
                if tick:
                    ds.run_high = max(ds.run_high, float(tick.ask))
                    ds.run_low  = min(ds.run_low,  float(tick.bid))
                continue

            # ── Get current tick ──────────────────────────────────────────────
            tick = get_tick(pair)
            if tick is None:
                log.warning(f'[{pair}] No tick — skipping')
                continue

            ask = float(tick.ask)
            bid = float(tick.bid)
            mid = (ask + bid) / 2.0
            pip = _PIP_SIZES.get(pair, 0.0001)

            # ── Compute entry levels BEFORE updating running extremes ─────────
            sell_entry = ds.run_low  * (1 + ds.hl50)
            buy_entry  = ds.run_high * (1 - ds.hl50)

            allow_sell = ds.regime == 'BULL'
            allow_buy  = ds.regime == 'BEAR'

            sell_valid = allow_sell and sell_entry > ds.session_open
            buy_valid  = allow_buy  and buy_entry  < ds.session_open

            entered = False

            # ── SELL entry check ─────────────────────────────────────────────
            if sell_valid and ask >= sell_entry:
                sl  = ds.run_high * (1 + ds.hl75)
                tp  = ds.session_open
                sl_dist = abs(sell_entry - sl)
                size    = position_size(balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot'])

                log.info(
                    f'[{pair}] SELL entry triggered  entry={sell_entry:.5f}  '
                    f'run_low={ds.run_low:.5f}  sl={sl:.5f}  tp={tp:.5f}  '
                    f'hl50={ds.hl50*100:.3f}%  regime={ds.regime}  lots={size}'
                )

                ticket = open_position(pair, 'SELL', sl, tp, size,
                                       cfg['max_spread_pips'], paper_mode)
                if ticket is not None:
                    actual_entry = bid  # SELL fills at bid
                    ds.open_positions.append({
                        'ticket':      ticket,
                        'direction':   'SELL',
                        'entry_price': actual_entry,
                        'sl':          round(sl, 5),
                        'tp':          round(tp, 5),
                        'lots':        size,
                        'entry_time':  datetime.now(timezone.utc).strftime('%H:%M'),
                    })
                    ds.daily_trade_done = True
                    risk_guard.record_trade(pair)
                    msg = _tg_entry(pair, 'SELL', actual_entry, sl, tp, size,
                                    ds.regime, ds.hl50 * 100, paper_mode)
                    send_telegram(tg_t, tg_c, msg)
                    entered = True

            # ── BUY entry check ──────────────────────────────────────────────
            elif buy_valid and bid <= buy_entry:
                sl  = ds.run_low * (1 - ds.hl75)
                tp  = ds.session_open
                sl_dist = abs(buy_entry - sl)
                size    = position_size(balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot'])

                log.info(
                    f'[{pair}] BUY entry triggered  entry={buy_entry:.5f}  '
                    f'run_high={ds.run_high:.5f}  sl={sl:.5f}  tp={tp:.5f}  '
                    f'hl50={ds.hl50*100:.3f}%  regime={ds.regime}  lots={size}'
                )

                ticket = open_position(pair, 'BUY', sl, tp, size,
                                       cfg['max_spread_pips'], paper_mode)
                if ticket is not None:
                    actual_entry = ask  # BUY fills at ask
                    ds.open_positions.append({
                        'ticket':      ticket,
                        'direction':   'BUY',
                        'entry_price': actual_entry,
                        'sl':          round(sl, 5),
                        'tp':          round(tp, 5),
                        'lots':        size,
                        'entry_time':  datetime.now(timezone.utc).strftime('%H:%M'),
                    })
                    ds.daily_trade_done = True
                    risk_guard.record_trade(pair)
                    msg = _tg_entry(pair, 'BUY', actual_entry, sl, tp, size,
                                    ds.regime, ds.hl50 * 100, paper_mode)
                    send_telegram(tg_t, tg_c, msg)
                    entered = True

            # ── Update running extremes AFTER entry check ────────────────────
            ds.run_high = max(ds.run_high, ask)
            ds.run_low  = min(ds.run_low,  bid)

            if not entered and cycle % 20 == 0:
                log.info(
                    f'[{pair}] Watching  regime={ds.regime}  '
                    f'run_high={ds.run_high:.5f}  run_low={ds.run_low:.5f}  '
                    f'sell_entry={sell_entry:.5f}  buy_entry={buy_entry:.5f}  '
                    f'session_open={ds.session_open:.5f}'
                )

        # ── Status push + sleep ───────────────────────────────────────────────
        push_status(daily_state, balance, paper_mode, url)

        elapsed = time.time() - loop_start
        sleep_t = max(0, cfg.get('interval_secs', 60) - elapsed)
        if cycle % 30 == 0:
            log.info(f'Cycle {cycle}  balance={balance:.2f}  sleep={sleep_t:.1f}s')
        time.sleep(sleep_t)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='DynAnchor MT5 Bot')
    parser.add_argument('--dashboard-url',
                        default=os.environ.get('DASHBOARD_URL',
                                               'https://macrofxmodel-production.up.railway.app'),
                        help='MacroFX Railway dashboard base URL')
    parser.add_argument('--live', action='store_true',
                        help='Place real MT5 orders (default: paper mode)')
    args = parser.parse_args()

    url        = args.dashboard_url.rstrip('/')
    paper_mode = not args.live

    if paper_mode:
        log.info('PAPER MODE — no real orders will be placed')

    logs_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
    os.makedirs(logs_dir, exist_ok=True)

    try:
        run(url, paper_mode)
    except KeyboardInterrupt:
        log.info('DynAnchor bot stopped by user')
    finally:
        if HAS_MT5 and not paper_mode:
            mt5.shutdown()


if __name__ == '__main__':
    main()
