"""
Regime Bot — HMM V2 regime-following strategy.

Entry logic:
  BULL  → enter LONG    when regime holds for N consecutive polls at >= min_confidence%
  BEAR  → enter SHORT   (same gate)
  RANGE / CHOP → no trade, stay flat

Exit logic:
  Decay score >= decay_exit threshold → close early (regime collapsing)
  Regime shifts away from entry regime → close immediately.
  Outside trade window → close immediately.
  SL / TP hit in MT5 → position already gone, state is cleaned up next cycle.

Decay detector (ported from regime_bot/decay_detector.py):
  Tracks rolling window of readings per pair.
  Score = conf_decay×0.40 + volz_decay×0.35 + rl_stall×0.25
  Mixed-regime window → 0.90 immediately.
  Vol_z entry gate: blocks entry when vol_z > vol_z_max (spike filter).

Risk management mirrors the Telegram bot:
  - Daily DD limit  → lockout
  - Monthly DD limit → lockout
  - Per-pair cooldown after close
  - Max spread gate before entry

Usage:
  python regime_bot.py                         # paper mode
  python regime_bot.py --live                  # real MT5 orders
  python regime_bot.py --dashboard-url https://macrofxmodel-production.up.railway.app

Config read from KV:       regime_bot_config
Credentials read from KV:  regime_bot_credentials
Status pushed to KV:       regime_bot_status
"""

import argparse
import logging
import math
import os
import time
from collections import deque
from datetime import datetime, timezone, date as date_type

import requests

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Magic number (unique — never collide with main bot's 20260001) ─────────────

MAGIC = 20260002

# ── Pip tables (match main.py) ─────────────────────────────────────────────────

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'NZD/USD': 0.0001, 'USD/CAD': 0.0001,
    'USD/CHF': 0.0001, 'GBP/JPY': 0.01,  'XAU/USD': 1.0, 'NAS100_USD': 1.0,
}
_PIP_VALUES = {
    'EUR/USD': 10.0, 'GBP/USD': 10.0, 'AUD/USD': 10.0, 'NZD/USD': 10.0,
    'USD/JPY': 9.0,  'USD/CAD': 7.5,  'USD/CHF': 10.5, 'GBP/JPY': 9.0,
    'XAU/USD': 100.0, 'NAS100_USD': 1.0,
}

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('regime_bot.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)

# ── Default config ─────────────────────────────────────────────────────────────

DEFAULT_CFG: dict = {
    'enabled':             True,
    'paper_mode':          True,
    'pairs':               ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    'interval_secs':       60,       # poll/cycle cadence
    'min_confidence':      65,       # % — regime must be at least this confident
    'candle_hold':         3,        # N consecutive polls all agreeing before entry
    'sl_atr_mult':         1.8,      # SL = ATR × this
    'sl_atr_tf':           '5m',     # '5m' or '30m' ATR timeframe
    'risk_pct':            1.0,      # % of balance risked per trade
    'max_lot':             5.0,
    'max_spread_pips':     3.0,
    'trade_window_start':  '07:00',
    'trade_window_end':    '20:00',
    'ddlimit':             3.0,      # daily DD % before lockout
    'monthlydd':           5.0,      # monthly DD % before lockout
    'lockout':             3,        # lockout duration (hours)
    'cooldown':            240,      # seconds between trades on same pair
    # Decay / vol filter settings
    'vol_z_max':           2.5,      # block entry when vol_z > this (spike filter)
    'decay_window':        10,       # rolling bar count for decay computation
    'entry_decay_max':     0.25,     # block entry when decay score >= this
    'decay_warning':       0.50,     # log warning when score crosses this
    'decay_exit':          0.70,     # close position early when score >= this
    # Dynamic exit settings
    'exit_on_range':       True,     # close when regime goes RANGE/CHOP (not just full reversal)
    'range_exit_hold':     2,        # consecutive RANGE bars required before closing (whipsaw filter)
}

# ── KV helpers ─────────────────────────────────────────────────────────────────

def _kv_get(key: str, base_url: str) -> dict | None:
    try:
        r = requests.get(f'{base_url}/api/kv/get?key={key}', timeout=10)
        j = r.json()
        if j.get('miss') or not j.get('data'):
            return None
        return j['data']
    except Exception as exc:
        log.warning(f'kv_get({key}): {exc}')
        return None


def _kv_put(key: str, data: dict, base_url: str) -> None:
    try:
        import time as _time
        requests.post(f'{base_url}/api/kv/set', json={'key': key, 'data': data, 'timestamp': int(_time.time() * 1000)}, timeout=10)
    except Exception as exc:
        log.warning(f'kv_put({key}): {exc}')


# ── Config & credential loading ────────────────────────────────────────────────

def load_config(base_url: str) -> dict:
    stored = _kv_get('regime_bot_config', base_url)
    cfg = dict(DEFAULT_CFG)
    if stored:
        cfg.update(stored)
    return cfg


def load_credentials(base_url: str) -> None:
    creds = _kv_get('regime_bot_credentials', base_url)
    if not creds:
        return
    mapping = {
        'MT5_ACCOUNT':  'mt5_account',
        'MT5_PASSWORD': 'mt5_password',
        'MT5_SERVER':   'mt5_server',
        'MT5_PATH':     'mt5_path',
    }
    for env_key, cfg_key in mapping.items():
        val = creds.get(cfg_key)
        if val:
            os.environ[env_key] = str(val)
    log.info(f'Regime bot credentials loaded from KV  account={creds.get("mt5_account")}  server={creds.get("mt5_server")}')


# ── MT5 connection ─────────────────────────────────────────────────────────────

def mt5_connect() -> bool:
    if not HAS_MT5:
        log.warning('MetaTrader5 not installed — paper mode only')
        return False

    mt5_path  = os.environ.get('MT5_PATH') or None
    ok        = mt5.initialize(path=mt5_path) if mt5_path else mt5.initialize()
    if not ok:
        log.error(f'MT5 initialize() failed: {mt5.last_error()}')
        return False

    account  = os.environ.get('MT5_ACCOUNT', '')
    password = os.environ.get('MT5_PASSWORD', '')
    server   = os.environ.get('MT5_SERVER', '')

    if account and password and server:
        try:
            if not mt5.login(int(account), password, server):
                log.error(f'MT5 login() failed: {mt5.last_error()}')
                return False
        except Exception as exc:
            log.error(f'MT5 login() raised: {exc}')
            return False

    info = mt5.account_info()
    if info:
        log.info(
            f'MT5 connected  account={info.login}  balance={info.balance:.2f} {info.currency}'
            f'  server={info.server}  leverage=1:{info.leverage}'
        )
        # Safety check: abort if connected account doesn't match expected account.
        # Prevents trading on the wrong MT5 account when login credentials are
        # missing from KV and MT5 falls back to its currently active session.
        if account and str(info.login) != str(account):
            log.error(
                f'MT5 account mismatch: expected {account} but connected to {info.login} '
                f'— refusing to start. Check regime_bot_credentials in KV.'
            )
            mt5.shutdown()
            return False
    return True


# ── Price & bar helpers ────────────────────────────────────────────────────────

def get_price(pair: str, base_url: str) -> float | None:
    """MT5 tick first (sub-ms), then dashboard API fallback."""
    if HAS_MT5:
        try:
            tick = mt5.symbol_info_tick(pair.replace('/', ''))
            if tick and tick.bid > 0:
                return round((tick.bid + tick.ask) / 2, 6)
        except Exception:
            pass
    try:
        r = requests.get(f'{base_url}/api/quote?symbol={pair}', timeout=5)
        return r.json().get('price')
    except Exception:
        return None


def get_atr(pair: str, tf: str = '5m') -> float | None:
    """EMA-ATR from MT5 bars, alpha=0.15 (matches dashboard vol.js)."""
    if not HAS_MT5:
        return None
    try:
        timeframe = mt5.TIMEFRAME_M5 if tf == '5m' else mt5.TIMEFRAME_M30
        bars = mt5.copy_rates_from_pos(pair.replace('/', ''), timeframe, 0, 30)
        if bars is None or len(bars) < 2:
            return None
        alpha = 0.15
        atr   = abs(float(bars[1]['high']) - float(bars[1]['low']))
        for i in range(1, len(bars)):
            h  = float(bars[i]['high'])
            l  = float(bars[i]['low'])
            pc = float(bars[i - 1]['close'])
            tr = max(h - l, abs(h - pc), abs(l - pc))
            atr = alpha * tr + (1 - alpha) * atr
        return round(atr, 6)
    except Exception:
        return None


def get_balance(paper_mode: bool) -> float:
    if HAS_MT5 and not paper_mode:
        info = mt5.account_info()
        if info:
            return info.balance
    return 10_000.0


# ── Regime fetch ───────────────────────────────────────────────────────────────

def fetch_regimes(base_url: str) -> dict:
    """Returns full /api/hmm5m-v2 payload: { 'EUR/USD': {regime, confidence, vol_z, ...} }"""
    try:
        r = requests.get(f'{base_url}/api/hmm5m-v2', timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as exc:
        log.warning(f'fetch_regimes failed: {exc}')
    return {}


# ── Decay helpers ──────────────────────────────────────────────────────────────

def _ols_slope(values: list[float]) -> float:
    """Ordinary least-squares slope of y=values over x=0..n-1."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n
    sXY    = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    sX2    = sum((i - x_mean) ** 2 for i in range(n))
    return sXY / sX2 if sX2 > 0 else 0.0


def _soft_clamp(slope: float, scale: float) -> float:
    """Normalise slope to [-1, +1]: max(-1, min(1, slope/scale))."""
    if scale == 0:
        return 0.0
    return max(-1.0, min(1.0, slope / scale))


# ── Decay Detector ─────────────────────────────────────────────────────────────

class DecayDetector:
    """
    Rolling window decay score 0.0 (strong) → 1.0 (collapsing) for one pair.

    Score = conf_decay×0.40 + volz_decay×0.35 + rl_stall×0.25
    Mixed-regime window returns 0.90 immediately.

    Ported from regime_bot/decay_detector.py; adapted for API data:
      - confidence is 0-100 (percentage), so _CONF_SCALE = 3.0 (not 0.003)
      - vol_z is a raw z-score, _VOLZ_SCALE = 0.04 unchanged
      - run_length tracked externally and passed in each push()
    """

    _CONF_SCALE = 3.0    # pct/bar drift that maps to full decay
    _VOLZ_SCALE = 0.04   # z-score/bar rise that maps to full decay

    def __init__(self, window: int):
        # Each entry: (regime, confidence_pct, vol_z, run_length)
        self._buf: deque[tuple[str, float, float, int]] = deque(maxlen=window)

    def resize(self, window: int) -> None:
        old = list(self._buf)
        self._buf = deque(old, maxlen=window)

    def push(self, regime: str, confidence: float, vol_z: float, run_length: int) -> None:
        self._buf.append((regime, confidence, vol_z, run_length))

    def score(self) -> float:
        w = list(self._buf)
        if len(w) < 3:
            return 0.0

        regimes = {r for r, _, _, _ in w}
        if len(regimes) > 1:
            return 0.90

        confs = [c for _, c, _, _ in w]
        vzs   = [v for _, _, v, _ in w]
        rls   = [rl for _, _, _, rl in w]

        conf_slope = _ols_slope(confs)
        volz_slope = _ols_slope(vzs)
        conf_decay = max(0.0, _soft_clamp(-conf_slope, self._CONF_SCALE))
        volz_decay = max(0.0, _soft_clamp(volz_slope,  self._VOLZ_SCALE))

        rl_increases = sum(1 for i in range(1, len(rls)) if rls[i] > rls[i - 1])
        rl_stall     = 1.0 - rl_increases / max(1, len(rls) - 1)

        raw = conf_decay * 0.40 + volz_decay * 0.35 + rl_stall * 0.25
        return round(min(1.0, max(0.0, raw)), 3)

    def summary(self) -> dict:
        w = list(self._buf)
        if len(w) < 3:
            return {}
        regimes = {r for r, _, _, _ in w}
        if len(regimes) > 1:
            return {'mixed_regimes': list(regimes)}

        confs = [c for _, c, _, _ in w]
        vzs   = [v for _, _, v, _ in w]
        rls   = [rl for _, _, _, rl in w]

        conf_slope = _ols_slope(confs)
        volz_slope = _ols_slope(vzs)
        conf_decay = max(0.0, _soft_clamp(-conf_slope, self._CONF_SCALE))
        volz_decay = max(0.0, _soft_clamp(volz_slope,  self._VOLZ_SCALE))
        rl_inc     = sum(1 for i in range(1, len(rls)) if rls[i] > rls[i - 1])
        rl_stall   = 1.0 - rl_inc / max(1, len(rls) - 1)
        return {
            'conf_decay':  round(conf_decay,  3),
            'volz_decay':  round(volz_decay,  3),
            'rl_stall':    round(rl_stall,    3),
            'window_size': len(w),
        }


# ── RiskGuard ─────────────────────────────────────────────────────────────────

class RiskGuard:
    """
    Mirrors the RiskGuard in main.py.
    Fields are re-read from config each cycle so live changes take effect.
    """

    def __init__(self):
        self.dd_limit_pct:   float = 3.0
        self.monthly_dd_pct: float = 5.0
        self.lockout_secs:   float = 3 * 3600
        self.cooldown_secs:  float = 240

        self._day_start:   float | None = None
        self._month_start: float | None = None
        self._locked_until: float       = 0.0
        self._last_trade:  dict[str, float] = {}
        self._reset_date:  date_type | None = None

    def sync_cfg(self, cfg: dict) -> None:
        self.dd_limit_pct   = float(cfg.get('ddlimit',    3.0))
        self.monthly_dd_pct = float(cfg.get('monthlydd',  5.0))
        self.lockout_secs   = float(cfg.get('lockout',    3)) * 3600
        self.cooldown_secs  = float(cfg.get('cooldown',   240))

    def update_balance(self, bal: float) -> None:
        today = datetime.now(timezone.utc).date()
        if self._day_start is None:
            self._day_start  = bal
            self._reset_date = today
        if self._month_start is None:
            self._month_start = bal
        if self._reset_date and today > self._reset_date:
            log.info(f'Daily reset — day_start {self._day_start:.2f} → {bal:.2f}')
            self._day_start  = bal
            self._reset_date = today

    def record_trade(self, pair: str) -> None:
        self._last_trade[pair] = time.time()

    def force_unlock(self) -> None:
        self._locked_until = 0.0
        self._day_start    = None

    def block_reason(self, bal: float, pair: str = '') -> str | None:
        now = time.time()

        if now < self._locked_until:
            return f'Locked out — {(self._locked_until - now) / 60:.0f}m remaining'

        if pair and pair in self._last_trade:
            elapsed = now - self._last_trade[pair]
            if elapsed < self.cooldown_secs:
                return f'[{pair}] Cooldown — {(self.cooldown_secs - elapsed) / 60:.1f}m remaining'

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


# ── Position sizing ────────────────────────────────────────────────────────────

def position_size(balance: float, risk_pct: float,
                  sl_dist: float, pair: str, max_lot: float,
                  decay_score: float = 0.0) -> float:
    pip      = _PIP_SIZES.get(pair, 0.0001)
    pv       = _PIP_VALUES.get(pair, 10.0)
    sl_pips  = sl_dist / pip
    risk_amt = balance * (risk_pct / 100)
    if sl_pips <= 0 or pv <= 0:
        return 0.01
    raw_lots = risk_amt / (sl_pips * pv)
    # Decay discount: lots shrink linearly as decay approaches 1
    lots = raw_lots * (1.0 - decay_score)
    return float(max(0.01, min(round(lots, 2), float(max_lot))))


# ── MT5 execution ─────────────────────────────────────────────────────────────

def _filling_mode(mt5_sym: str) -> int:
    info    = mt5.symbol_info(mt5_sym)
    filling = mt5.ORDER_FILLING_IOC
    if info:
        am = info.filling_mode
        if   am & 1: filling = mt5.ORDER_FILLING_FOK
        elif am & 2: filling = mt5.ORDER_FILLING_IOC
        elif am & 4: filling = mt5.ORDER_FILLING_RETURN
    return filling


def open_position(pair: str, direction: str, sl: float, tp: float,
                  size: float, max_spread_pips: float,
                  paper_mode: bool) -> int | None:
    """Returns ticket int on success, -1 for paper, None on failure."""
    pip = _PIP_SIZES.get(pair, 0.0001)
    log.info(
        f'TRADE {pair} {direction}  SL={sl:.5f}  TP={tp:.5f}  lot={size}'
        + ('  [PAPER]' if paper_mode else '')
    )

    if paper_mode:
        return -1

    if not HAS_MT5:
        log.error('MetaTrader5 not installed — cannot place live order')
        return None

    mt5_sym = pair.replace('/', '')
    tick    = mt5.symbol_info_tick(mt5_sym)
    if not tick:
        log.error(f'No tick for {mt5_sym}')
        return None

    spread_pips = (tick.ask - tick.bid) / pip
    if spread_pips > max_spread_pips:
        log.warning(f'SPREAD BLOCK {pair}: {spread_pips:.1f}p > max {max_spread_pips}p')
        return None

    existing = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                if p.magic == MAGIC]
    if existing:
        log.warning(f'DUPLICATE BLOCK {pair}: ticket {existing[0].ticket} already open')
        return None

    order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    exec_price = tick.ask if direction == 'LONG' else tick.bid

    order = {
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       mt5_sym,
        'volume':       size,
        'type':         order_type,
        'price':        exec_price,
        'sl':           round(sl, 5),
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'RegimeBot {direction[0]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(mt5_sym),
    }
    if tp and tp > 0:
        order['tp'] = round(tp, 5)

    res = mt5.order_send(order)

    # order_send returns None when MT5 has a transport error (dropped connection,
    # autotrading disabled). Capture last_error before any further MT5 calls.
    if res is None:
        err = mt5.last_error()
        log.error(f'MT5 order_send returned None (transport error)  last_error={err}')
        # Single retry after re-fetching tick price
        import time as _time
        _time.sleep(0.5)
        tick = mt5.symbol_info_tick(mt5_sym)
        if tick:
            order['price'] = tick.ask if direction == 'LONG' else tick.bid
            res = mt5.order_send(order)
            if res is None:
                log.error(f'MT5 retry also returned None  last_error={mt5.last_error()}')
                return None

    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'MT5 order placed: ticket={res.order}  exec_price={exec_price}')
        return res.order

    err = mt5.last_error()
    log.error(
        f'MT5 order failed: retcode={getattr(res, "retcode", "?")} '
        f'comment={getattr(res, "comment", "")}  last_error={err}'
    )
    return None


def close_position(ticket: int, pair: str, paper_mode: bool, reason: str = '') -> bool:
    log.info(f'CLOSE {pair}  ticket={ticket}  reason={reason}' + ('  [PAPER]' if paper_mode else ''))

    if paper_mode or ticket < 0:
        return True

    if not HAS_MT5:
        return False

    mt5_sym   = pair.replace('/', '')
    positions = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                 if p.ticket == ticket and p.magic == MAGIC]

    if not positions:
        log.warning(f'Ticket {ticket} not found — may already be closed by SL/TP')
        return True

    pos         = positions[0]
    close_type  = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    tick        = mt5.symbol_info_tick(mt5_sym)
    if not tick:
        return False

    close_price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask

    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       mt5_sym,
        'volume':       float(pos.volume),
        'type':         close_type,
        'position':     ticket,
        'price':        close_price,
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'RegimeBot close: {reason[:30]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(mt5_sym),
    })

    if res is None:
        log.error(f'Close failed: order_send returned None  last_error={mt5.last_error()}')
        return False

    if res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'Position {ticket} closed at {close_price}')
        return True

    log.error(
        f'Close failed: retcode={res.retcode}  comment={res.comment}  last_error={mt5.last_error()}'
    )
    return False


# ── Regime debounce ────────────────────────────────────────────────────────────

TRADEABLE = {'BULL', 'BEAR'}


class RegimeDebounce:
    """
    Requires N consecutive regime readings at >= min_confidence% before confirming.
    Returns the confirmed regime string, or None if gate not cleared.
    """

    def __init__(self, hold: int, min_conf: float):
        self.hold     = hold
        self.min_conf = min_conf
        self._hist: list[tuple[str, float]] = []

    def push(self, regime: str, confidence: float) -> str | None:
        self._hist.append((regime, confidence))
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

    def last_regime(self) -> str:
        return self._hist[-1][0] if self._hist else 'RANGE'

    def readings_count(self) -> int:
        return len(self._hist)


# ── Trade window check ─────────────────────────────────────────────────────────

def within_window(cfg: dict) -> bool:
    now = datetime.now(timezone.utc).strftime('%H:%M')
    return cfg.get('trade_window_start', '07:00') <= now <= cfg.get('trade_window_end', '20:00')


# ── Position serialiser ────────────────────────────────────────────────────────

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


# ── Status push ────────────────────────────────────────────────────────────────

def push_status(data: dict, base_url: str) -> None:
    data['pushed_at'] = time.time()
    _kv_put('regime_bot_status', data, base_url)


def push_regime_states(states: list[dict], events: list[dict], base_url: str) -> None:
    """Fire-and-forget POST of per-cycle state to the regime viewer endpoint."""
    try:
        requests.post(
            f'{base_url}/api/regime-append',
            json={'bot': 'v1', 'ts': int(time.time()), 'states': states, 'events': events},
            timeout=6,
        )
    except Exception:
        pass


# ── Main loop ─────────────────────────────────────────────────────────────────

def run(base_url: str, paper_mode: bool) -> None:
    log.info(f'RegimeBot starting  paper={paper_mode}  dashboard={base_url}')

    load_credentials(base_url)

    if not paper_mode:
        if not mt5_connect():
            log.error('MT5 connection failed — cannot start live mode')
            return

    cfg = load_config(base_url)
    log.info(
        f'Initial config: pairs={cfg["pairs"]}  hold={cfg["candle_hold"]}  '
        f'minConf={cfg["min_confidence"]}%  SL={cfg["sl_atr_mult"]}× ATR({cfg["sl_atr_tf"]})  '
        f'interval={cfg["interval_secs"]}s  exit_on_range={cfg["exit_on_range"]}  '
        f'vol_z_max={cfg["vol_z_max"]}  decay_window={cfg["decay_window"]}'
    )

    risk_guard = RiskGuard()

    # Per-pair runtime state
    debounce:      dict[str, RegimeDebounce] = {}
    decay_dets:    dict[str, DecayDetector]  = {}
    run_lengths:   dict[str, int]            = {}   # consecutive polls in same regime
    last_regimes:  dict[str, str]            = {}   # last seen regime per pair
    flip_counts:   dict[str, int]            = {}   # consecutive bars NOT in entry regime (for RANGE debounce)
    open_pos:      dict[str, dict]           = {}   # pair → {ticket, direction, entry_price, sl}
    entry_regime:  dict[str, str]            = {}   # pair → regime string at time of entry

    for pair in cfg['pairs']:
        debounce[pair]     = RegimeDebounce(cfg['candle_hold'], cfg['min_confidence'])
        decay_dets[pair]   = DecayDetector(cfg['decay_window'])
        run_lengths[pair]  = 0
        last_regimes[pair] = ''
        flip_counts[pair]  = 0

    cycle = 0
    _cycle_states: list[dict] = []
    _cycle_events: list[dict] = []

    while True:
        cycle += 1
        _cycle_states = []
        _cycle_events = []
        cfg = load_config(base_url)  # re-read every cycle — live changes take effect immediately

        if not cfg.get('enabled', True):
            log.info('Bot disabled via config — sleeping')
            push_status({'enabled': False, 'paper_mode': paper_mode, 'cycle': cycle, 'positions': {}}, base_url)
            time.sleep(max(cfg.get('interval_secs', 60), 30))
            continue

        # Sync per-pair objects in case config or pair list changed
        for pair in cfg['pairs']:
            if pair not in debounce:
                debounce[pair]     = RegimeDebounce(cfg['candle_hold'], cfg['min_confidence'])
                decay_dets[pair]   = DecayDetector(cfg['decay_window'])
                run_lengths[pair]  = 0
                last_regimes[pair] = ''
                flip_counts[pair]  = 0
            else:
                debounce[pair].hold     = cfg['candle_hold']
                debounce[pair].min_conf = cfg['min_confidence']
                decay_dets[pair].resize(cfg['decay_window'])

        # MT5 reconnect guard — re-establish if terminal_info() returns None
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

        all_regimes = fetch_regimes(base_url)

        status_positions: dict[str, dict] = {}

        for pair in cfg['pairs']:
            rd         = all_regimes.get(pair) or {}
            regime     = rd.get('regime', 'RANGE')
            confidence = float(rd.get('confidence', 0))
            # V2 API returns 'volZ' (camelCase); fall back to 'vol_z' for any future rename
            vol_z      = float(rd.get('volZ', rd.get('vol_z', 0.0)))

            # ── run_length: consecutive polls in current regime ───────────────
            prev_regime = last_regimes.get(pair, '')
            if regime == prev_regime:
                run_lengths[pair] += 1
            else:
                run_lengths[pair]  = 1
                last_regimes[pair] = regime
                # Fresh tradeable regime with no open position — wipe stale decay
                # so a previous exit's 0.9 score doesn't block the new entry gate
                if regime in TRADEABLE and pair not in open_pos:
                    decay_dets[pair] = DecayDetector(cfg['decay_window'])
                    log.info(f'[{pair}] Decay reset — fresh {regime} after {prev_regime}')

            run_length = run_lengths[pair]

            # ── Update decay detector ─────────────────────────────────────────
            decay_dets[pair].push(regime, confidence, vol_z, run_length)
            decay_score = decay_dets[pair].score()

            log.info(
                f'[{pair}] regime={regime}  conf={confidence:.0f}%  '
                f'vol_z={vol_z:+.2f}  rl={run_length}  decay={decay_score:.3f}'
            )

            _cycle_states.append({
                'pair':   pair,
                'regime': regime,
                'conf':   round(confidence, 1),
                'vz':     round(vol_z, 3),
                'rl':     run_length,
                'decay':  round(decay_score, 3),
            })

            # ── Manage existing open position ─────────────────────────────────
            if pair in open_pos:
                pos     = open_pos[pair]
                entry_r = entry_regime.get(pair, '')

                # Check whether MT5 already closed it (SL or TP hit)
                if not paper_mode and HAS_MT5:
                    mt5_sym    = pair.replace('/', '')
                    still_open = [
                        p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                        if p.ticket == pos['ticket'] and p.magic == MAGIC
                    ]
                    if not still_open:
                        log.info(f'[{pair}] Ticket {pos["ticket"]} gone — SL/TP hit')
                        del open_pos[pair]
                        entry_regime.pop(pair, None)
                        debounce[pair].clear()
                        status_positions[pair] = {
                            'status': 'closed_by_sltp', 'direction': pos['direction'],
                        }
                        continue

                should_close = False
                close_reason = ''

                # Decay exit — close early before regime fully flips
                if decay_score >= cfg['decay_exit']:
                    should_close = True
                    close_reason = f'decay_exit score={decay_score:.3f}'
                    flip_counts[pair] = 0
                    log.warning(f'[{pair}] DECAY EXIT  {decay_dets[pair].summary()}')

                # Dynamic regime exit
                if not should_close:
                    in_entry_regime = (regime == entry_r)
                    is_reversal     = (
                        (entry_r == 'BULL' and regime == 'BEAR') or
                        (entry_r == 'BEAR' and regime == 'BULL')
                    )

                    if in_entry_regime:
                        flip_counts[pair] = 0  # regime holding — reset RANGE counter

                    elif is_reversal:
                        # Hard reversal: BULL→BEAR or BEAR→BULL — exit immediately
                        should_close     = True
                        close_reason     = f'regime_reverse {entry_r}→{regime}'
                        flip_counts[pair] = 0

                    elif cfg.get('exit_on_range', True):
                        # Neutral shift: BULL→RANGE/CHOP or BEAR→RANGE/CHOP
                        # Debounce to avoid whipsaw on a single noisy bar
                        flip_counts[pair] += 1
                        hold = int(cfg.get('range_exit_hold', 2))
                        log.info(
                            f'[{pair}] Regime neutral {entry_r}→{regime}  '
                            f'flip_count={flip_counts[pair]}/{hold}'
                        )
                        if flip_counts[pair] >= hold:
                            should_close     = True
                            close_reason     = f'regime_neutral {entry_r}→{regime} ({flip_counts[pair]} bars)'
                            flip_counts[pair] = 0

                if not should_close and not within_window(cfg):
                    should_close = True
                    close_reason = 'outside trade window'
                    flip_counts[pair] = 0

                # Decay warning (log only — not yet at exit threshold)
                if not should_close and decay_score >= cfg['decay_warning']:
                    log.warning(
                        f'[{pair}] Decay WARNING  score={decay_score:.3f}  '
                        + str(decay_dets[pair].summary())
                    )

                if should_close:
                    ok = close_position(pos['ticket'], pair, paper_mode, close_reason)
                    if ok:
                        _cycle_events.append({'pair': pair, 'type': 'close', 'reason': close_reason, 'direction': pos['direction']})
                        del open_pos[pair]
                        entry_regime.pop(pair, None)
                        debounce[pair].clear()
                        flip_counts[pair] = 0
                        risk_guard.record_trade(pair)
                    status_positions[pair] = {
                        'status':    'closed',
                        'reason':    close_reason,
                        'direction': pos['direction'],
                    }
                else:
                    price_now = get_price(pair, base_url) or pos['entry_price']
                    pip       = _PIP_SIZES.get(pair, 0.0001)
                    sign      = 1 if pos['direction'] == 'LONG' else -1
                    pnl_pips  = round((price_now - pos['entry_price']) * sign / pip, 1)
                    status_positions[pair] = {
                        'status':      'open',
                        'direction':   pos['direction'],
                        'entry':       pos['entry_price'],
                        'sl':          pos['sl'],
                        'ticket':      pos['ticket'],
                        'regime':      regime,
                        'entry_regime': entry_r,
                        'flip_count':  flip_counts.get(pair, 0),
                        'conf':        round(confidence, 1),
                        'vol_z':       round(vol_z, 3),
                        'run_length':  run_length,
                        'decay':       decay_score,
                        'pnl_pips':    pnl_pips,
                    }
                continue

            # ── No position — check entry gate ────────────────────────────────
            if not within_window(cfg):
                status_positions[pair] = {'status': 'off_hours', 'regime': regime}
                continue

            block = risk_guard.block_reason(balance, pair)
            if block:
                log.info(f'[{pair}] RiskGuard: {block}')
                status_positions[pair] = {'status': 'blocked', 'reason': block, 'regime': regime}
                continue

            # Vol spike filter — avoid entering into noisy candles
            if vol_z > cfg['vol_z_max']:
                log.info(f'[{pair}] Vol gate blocked: vol_z={vol_z:.2f} > {cfg["vol_z_max"]}')
                status_positions[pair] = {
                    'status': 'vol_blocked', 'regime': regime,
                    'vol_z': round(vol_z, 3), 'vol_z_max': cfg['vol_z_max'],
                }
                continue

            # Decay gate — avoid entering a regime that's already collapsing
            if decay_score >= cfg['entry_decay_max']:
                log.info(f'[{pair}] Decay gate blocked: score={decay_score:.3f} >= {cfg["entry_decay_max"]}')
                status_positions[pair] = {
                    'status': 'decay_blocked', 'regime': regime,
                    'decay': decay_score, 'entry_decay_max': cfg['entry_decay_max'],
                }
                continue

            confirmed = debounce[pair].push(regime, confidence)

            log.info(
                f'[{pair}] debounce {debounce[pair].readings_count()}/{debounce[pair].hold}'
                f'  confirmed={confirmed}'
            )

            if confirmed not in TRADEABLE:
                status_positions[pair] = {
                    'status':      'watching',
                    'regime':      regime,
                    'conf':        round(confidence, 1),
                    'vol_z':       round(vol_z, 3),
                    'run_length':  run_length,
                    'decay':       decay_score,
                    'confirmed':   confirmed or 'pending',
                    'readings':    f'{debounce[pair].readings_count()}/{debounce[pair].hold}',
                }
                continue

            # ── Entry ─────────────────────────────────────────────────────────
            direction = 'LONG' if confirmed == 'BULL' else 'SHORT'
            price     = get_price(pair, base_url)
            if price is None:
                log.warning(f'[{pair}] Could not fetch price — skipping')
                continue

            pip     = _PIP_SIZES.get(pair, 0.0001)
            atr     = get_atr(pair, cfg.get('sl_atr_tf', '5m'))
            sl_dist = (atr * cfg['sl_atr_mult']) if atr else (20 * pip)

            sl = (price - sl_dist) if direction == 'LONG' else (price + sl_dist)
            tp = 0  # no fixed TP — regime shift is the exit

            size = position_size(
                balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot'],
                decay_score=decay_score,
            )

            log.info(
                f'[{pair}] ENTRY {direction}  conf={confidence:.0f}%  '
                f'vol_z={vol_z:+.2f}  rl={run_length}  decay={decay_score:.3f}  '
                f'lots={size}  SL={sl:.5f}  exit=regime_shift'
            )

            ticket = open_position(
                pair, direction, sl, tp, size,
                cfg['max_spread_pips'], paper_mode,
            )

            if ticket is not None:
                _cycle_events.append({'pair': pair, 'type': 'entry', 'direction': direction, 'lots': size, 'sl': round(sl, 5)})
                open_pos[pair] = {
                    'ticket':      ticket,
                    'direction':   direction,
                    'entry_price': price,
                    'sl':          sl,
                }
                entry_regime[pair] = confirmed
                flip_counts[pair]  = 0
                risk_guard.record_trade(pair)
                status_positions[pair] = {
                    'status':      'opened',
                    'direction':   direction,
                    'entry':       price,
                    'sl':          sl,
                    'regime':      confirmed,
                    'conf':        round(confidence, 1),
                    'vol_z':       round(vol_z, 3),
                    'run_length':  run_length,
                    'decay':       decay_score,
                }
            else:
                status_positions[pair] = {
                    'status': 'entry_failed', 'regime': regime,
                    'direction': direction,
                }

        # ── Push status to KV + regime viewer ────────────────────────────────
        push_status({
            'enabled':       cfg.get('enabled', True),
            'paper_mode':    paper_mode,
            'cycle':         cycle,
            'balance':       round(balance, 2),
            'pairs':         cfg['pairs'],
            'positions':     status_positions,
            'mt5_positions': _serialize_open_positions(MAGIC),
        }, base_url)
        push_regime_states(_cycle_states, _cycle_events, base_url)

        interval = max(cfg.get('interval_secs', 60), 10)
        log.info(f'Cycle {cycle} complete — sleeping {interval}s')
        time.sleep(interval)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MacroFX Regime Bot')
    parser.add_argument(
        '--live', action='store_true',
        help='Place real MT5 orders (default: paper mode)',
    )
    parser.add_argument(
        '--dashboard-url',
        default=os.environ.get('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app'),
        help='Dashboard base URL',
    )
    args = parser.parse_args()

    base_url   = args.dashboard_url.rstrip('/')
    paper_mode = not args.live

    try:
        run(base_url, paper_mode)
    except KeyboardInterrupt:
        log.info('RegimeBot stopped by user')
    finally:
        if HAS_MT5 and not paper_mode:
            mt5.shutdown()
