"""
RegimeV2 — HMM V2 regime-following bot with predictive signals.

Entry rules (all must pass):
  E1  regime ∈ {BULL, BEAR}
  E2  confidence × session_multiplier ≥ entry_conf
  E3  confidence RISING across last 2 polls
  E4  vol_z ≤ vol_z_max
  E5  candle_hold consecutive polls agree
  E6  decay_score < entry_decay_max
  E7  1h regime not directly opposed   [Phase 2 — requires /api/hmm1h-v2]
  E8  cross-pair consensus ≥ consensus_min
  E9  not inside FOMC window            [Phase 3]
  E10 VIX not in backwardation          [Phase 3]
  E11 not inside high-impact news window[Phase 3]
  E12 volume exhaustion score < 0.8     [Phase 2]
  E13 session-adjusted confidence gate  [Phase 3]

Exit rules (any fires → close):
  X1  regime flipped away from entry regime
  X2  confidence < conf_floor  (hard exit)
  X3  confidence slope < slope_thresh for slope_bars consecutive polls
  X4  single-bar confidence drop > drop_thresh
  X5  SL hit in MT5
  X6  BOCPD change_prob > bocpd_thresh for 2 consecutive polls  [Phase 2]
  X7  1h regime flipped to opposing   [Phase 2]
  X8  cross-pair consensus collapsed below entry threshold
  X9  VIX flipped to backwardation mid-trade [Phase 3]

Config key : regime_bot_v2_config
Creds key  : regime_bot_v2_credentials
Status key : regime_bot_v2_status
Unlock key : rgv2_force_unlock

Usage:
  python RegimeV2/regime_bot_v2.py
  python RegimeV2/regime_bot_v2.py --live
  python RegimeV2/regime_bot_v2.py --dashboard-url https://macrofxmodel-production.up.railway.app
"""

import argparse
import logging
import math
import os
import sys
import time
from collections import deque
from datetime import datetime, timezone, date as date_type
from typing import Optional

import requests

# ── path so imports work when run from repo root or RegimeV2/ ─────────────────
sys.path.insert(0, os.path.dirname(__file__))

from bocpd        import BOCPRegistry
from macro_overlay import MacroOverlay
from regime_score  import compute_regime_score
from formatter    import (
    regime_change_alert, heartbeat_message,
    entry_alert, exit_alert, lockout_alert,
)

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Magic number (unique — never collide with V1=20260002 or main=20260001) ────
MAGIC = 20260003

# ── Pip / pip-value tables ─────────────────────────────────────────────────────
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
TRADEABLE = {'BULL', 'BEAR'}

# ── Logging ────────────────────────────────────────────────────────────────────
os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'logs'), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [RGV2] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            os.path.join(os.path.dirname(__file__), '..', 'logs', 'regime_bot_v2.log'),
            encoding='utf-8'
        ),
    ],
)
log = logging.getLogger(__name__)

# ── Default config ─────────────────────────────────────────────────────────────
DEFAULT_CFG: dict = {
    # Core
    'enabled':            True,
    'paper_mode':         True,
    'pairs':              ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    'interval_secs':      30,
    # Entry gates
    'entry_conf':         70.0,
    'candle_hold':        2,
    'vol_z_max':          2.5,
    'entry_decay_max':    0.25,
    'consensus_min':      2,
    'entry_fail_cooldown_secs': 300,  # 5 min cooldown after a failed MT5 order
    # Hold / exit
    'hold_conf':          55.0,
    'conf_floor':         45.0,
    'slope_thresh':       -5.0,   # %/bar — exit if slope below this for slope_bars
    'slope_bars':         3,
    'drop_thresh':        15.0,   # single-bar drop → immediate exit
    'bocpd_thresh':       70.0,   # % — BOCPD exit gate
    'bocpd_exit_bars':    2,      # consecutive polls above threshold before exit
    'decay_warning':      0.50,
    'decay_exit':         0.70,
    'decay_window':       10,
    'exit_on_range':      True,
    'range_exit_hold':    2,
    # Position sizing
    'sl_atr_mult':        1.8,
    'sl_atr_tf':          '5m',
    'risk_pct':           1.0,
    'max_lot':            5.0,
    'max_spread_pips':    3.0,
    # Trade window (UTC)
    'trade_window_start': '07:00',
    'trade_window_end':   '20:00',
    # RiskGuard
    'ddlimit':            3.0,
    'monthlydd':          5.0,
    'lockout':            3,
    'cooldown':           240,
    # Telegram heartbeat
    'heartbeat_min':      120,
    # V2 feature flags
    'use_1h':             True,
    'use_bocpd':          True,
    'use_vix':            True,
    'use_news':           True,
    'fomc_window_hours':  48.0,
    # BOCPD tuning
    'bocpd_run_length':   150,
    # Composite regime score
    'entry_score_min':    55.0,  # score gate for new entries
    'hold_score_min':     40.0,  # X11: exit if score below this
    'score_drop_exit':    30.0,  # X12: exit if score drops this many pts from entry
    'score_drop_bars':    2,     # X11: bars below hold_score_min before exit
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


def load_config(url: str) -> dict:
    stored = _kv_get('regime_bot_v2_config', url)
    cfg = dict(DEFAULT_CFG)
    if stored:
        cfg.update(stored)
    return cfg


def load_credentials(url: str) -> None:
    creds = _kv_get('regime_bot_v2_credentials', url)
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


def check_force_unlock(url: str, risk_guard: 'RiskGuardV2') -> None:
    data = _kv_get('rgv2_force_unlock', url)
    if data and data.get('force_unlock'):
        log.info('Force unlock received from dashboard — clearing lockout')
        risk_guard.force_unlock()
        _kv_put('rgv2_force_unlock', {'force_unlock': False}, url)


def load_tg_config(url: str, v2_cfg: dict | None = None) -> dict:
    """
    Returns Telegram token + chat_id for V2 alerts.
    Uses V2-specific values from regime_bot_v2_config if set;
    falls back to the shared tg_config (Level bot) otherwise.
    """
    v2 = v2_cfg or {}
    v2_token   = v2.get('tg_token', '').strip()
    v2_chat_id = v2.get('tg_chat_id', '').strip()
    if v2_token and v2_chat_id:
        return {'token': v2_token, 'chat_id': v2_chat_id}
    # Fall back to shared Level bot Telegram config
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
        log.error('MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER not set — cannot connect safely, aborting')
        mt5.shutdown()
        return False
    if not mt5.login(int(account), password, server):
        log.error(f'MT5 login() failed: {mt5.last_error()}')
        return False
    info = mt5.account_info()
    if info:
        log.info(f'[RegimeV2-Bot] MT5 connected  account={info.login}  balance={info.balance:.2f}  server={info.server}')
        if str(info.login) != str(account):
            log.error(f'MT5 account mismatch: expected {account} got {info.login} — aborting')
            mt5.shutdown()
            return False
    return True


# ── Price & bar helpers ────────────────────────────────────────────────────────

def get_price(pair: str, url: str) -> Optional[float]:
    if HAS_MT5:
        try:
            tick = mt5.symbol_info_tick(pair.replace('/', ''))
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
        bars = mt5.copy_rates_from_pos(pair.replace('/', ''), timeframe, 0, 30)
        if bars is None or len(bars) < 2:
            return None
        alpha = 0.15
        atr   = abs(float(bars[1]['high']) - float(bars[1]['low']))
        for i in range(1, len(bars)):
            h, l, pc = float(bars[i]['high']), float(bars[i]['low']), float(bars[i-1]['close'])
            atr = alpha * max(h-l, abs(h-pc), abs(l-pc)) + (1-alpha) * atr
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

def fetch_regimes(url: str) -> dict:
    try:
        r = requests.get(f'{url}/api/hmm5m-v2', timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as exc:
        log.warning(f'fetch_regimes: {exc}')
    return {}


def fetch_1h_regimes(url: str) -> dict:
    try:
        r = requests.get(f'{url}/api/hmm1h-v2', timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as exc:
        log.warning(f'fetch_1h_regimes: {exc}')
    return {}


# ── OLS slope helper ──────────────────────────────────────────────────────────

def _ols_slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    xm = (n - 1) / 2.0
    ym = sum(values) / n
    sXY = sum((i - xm) * (v - ym) for i, v in enumerate(values))
    sX2 = sum((i - xm) ** 2 for i in range(n))
    return sXY / sX2 if sX2 > 0 else 0.0


# ── Volume exhaustion detector ────────────────────────────────────────────────

class VolExhaustionDetector:
    """
    Detects trend exhaustion: vol_z was elevated → now declining → near zero.
    Price still moving but volume drying up = regime end approaching.
    Score 0.0 (healthy) → 1.0 (exhausting).
    """

    def __init__(self, window: int = 8):
        self._buf: deque[float] = deque(maxlen=window)

    def push(self, vol_z: float) -> float:
        self._buf.append(vol_z)
        return self.score()

    def score(self) -> float:
        w = list(self._buf)
        if len(w) < 4:
            return 0.0
        peak  = max(w[:-2])
        recent = w[-1]
        slope  = _ols_slope(w[-4:])

        # Exhaustion requires: was elevated (>0.5), now near zero, declining slope
        if peak < 0.5:
            return 0.0   # never elevated — compression entry, not exhaustion

        normalised_decline = max(0.0, (peak - recent) / max(0.1, peak))
        slope_component    = max(0.0, min(1.0, -slope / 0.3))
        return round(min(1.0, normalised_decline * 0.6 + slope_component * 0.4), 3)


# ── Decay detector (ported from V1) ──────────────────────────────────────────

def _soft_clamp(v: float, scale: float) -> float:
    return max(-1.0, min(1.0, v / scale)) if scale else 0.0


class DecayDetector:
    _CONF_SCALE = 3.0
    _VOLZ_SCALE = 0.04

    def __init__(self, window: int):
        self._buf: deque[tuple[str, float, float, int]] = deque(maxlen=window)

    def resize(self, w: int) -> None:
        old = list(self._buf)
        self._buf = deque(old, maxlen=w)

    def push(self, regime: str, conf: float, vz: float, rl: int) -> None:
        self._buf.append((regime, conf, vz, rl))

    def score(self) -> float:
        w = list(self._buf)
        if len(w) < 3:
            return 0.0
        if len({r for r, _, _, _ in w}) > 1:
            return 0.90
        confs = [c for _, c, _, _ in w]
        vzs   = [v for _, _, v, _ in w]
        rls   = [rl for _, _, _, rl in w]
        cs = _ols_slope(confs)
        vs = _ols_slope(vzs)
        cd = max(0.0, _soft_clamp(-cs, self._CONF_SCALE))
        vd = max(0.0, _soft_clamp(vs,  self._VOLZ_SCALE))
        ri = sum(1 for i in range(1, len(rls)) if rls[i] > rls[i-1])
        rs = 1.0 - ri / max(1, len(rls)-1)
        return round(min(1.0, max(0.0, cd*0.40 + vd*0.35 + rs*0.25)), 3)


# ── RiskGuard V2 ─────────────────────────────────────────────────────────────

class RiskGuardV2:
    """Independent RiskGuard — completely separate from V1."""

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
        self._reset_month:   Optional[str] = None        # 'YYYY-MM'

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
        if self._month_start is None or self._reset_month is None:
            self._month_start = bal; self._reset_month = this_month
        if self._reset_date and today > self._reset_date:
            log.info(f'[RGV2] Daily reset: {self._day_start:.2f} → {bal:.2f}')
            self._day_start = bal; self._reset_date = today
        if self._reset_month != this_month:
            log.info(f'[RGV2] Month reset: {self._month_start:.2f} → {bal:.2f}')
            self._month_start = bal; self._reset_month = this_month

    def record_trade(self, pair: str) -> None:
        self._last_trade[pair] = time.time()

    def force_unlock(self) -> None:
        self._locked_until = 0.0
        self._day_start    = None
        log.info('[RGV2] RiskGuard force-unlocked')

    def block_reason(self, bal: float, pair: str = '') -> Optional[str]:
        now = time.time()
        if now < self._locked_until:
            return f'Locked out — {(self._locked_until - now)/60:.0f}m remaining'
        if pair and pair in self._last_trade:
            elapsed = now - self._last_trade[pair]
            if elapsed < self.cooldown_secs:
                return f'Cooldown {(self.cooldown_secs - elapsed)/60:.1f}m'
        if self._day_start:
            dd = (self._day_start - bal) / self._day_start * 100
            if dd >= self.dd_limit_pct:
                self._locked_until = now + self.lockout_secs
                return f'Daily DD {dd:.1f}% ≥ {self.dd_limit_pct}% — locked {self.lockout_secs/3600:.0f}h'
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


# ── Position sizing ────────────────────────────────────────────────────────────

def position_size(balance: float, risk_pct: float,
                  sl_dist: float, pair: str, max_lot: float,
                  decay_score: float = 0.0) -> float:
    pip     = _PIP_SIZES.get(pair, 0.0001)
    pv      = _PIP_VALUES.get(pair, 10.0)
    sl_pips = sl_dist / pip
    risk_amt = balance * (risk_pct / 100)
    if sl_pips <= 0 or pv <= 0:
        return 0.01
    raw  = risk_amt / (sl_pips * pv)
    lots = raw * (1.0 - decay_score * 0.5)  # partial decay discount in V2
    return max(0.01, min(round(lots, 2), max_lot))


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


def open_position(pair: str, direction: str, sl: float, tp: float,
                  size: float, max_spread: float, paper_mode: bool) -> Optional[int]:
    pip = _PIP_SIZES.get(pair, 0.0001)
    log.info(f'TRADE {pair} {direction}  SL={sl:.5f}  lot={size}' + ('  [PAPER]' if paper_mode else ''))
    if paper_mode:
        return -1
    if not HAS_MT5:
        return None
    sym  = pair.replace('/', '')
    tick = mt5.symbol_info_tick(sym)
    if not tick:
        log.error(f'No tick for {sym}')
        return None
    if (tick.ask - tick.bid) / pip > max_spread:
        log.warning(f'SPREAD BLOCK {pair}: {(tick.ask-tick.bid)/pip:.1f}p > {max_spread}p')
        return None
    existing = [p for p in (mt5.positions_get(symbol=sym) or []) if p.magic == MAGIC]
    if existing:
        log.warning(f'DUPLICATE BLOCK {pair}')
        return None
    ot    = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    price = tick.ask if direction == 'LONG' else tick.bid
    order = {
        'action': mt5.TRADE_ACTION_DEAL, 'symbol': sym, 'volume': size,
        'type': ot, 'price': price, 'sl': round(sl, 5), 'tp': round(tp, 5) if tp else 0,
        'deviation': 20, 'magic': MAGIC, 'comment': f'RgV2 {direction[0]}',
        'type_time': mt5.ORDER_TIME_GTC, 'type_filling': _filling_mode(sym),
    }
    res = mt5.order_send(order)
    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'MT5 order placed: ticket={res.order}  price={price}')
        return res.order
    log.error(f'MT5 order failed: retcode={getattr(res,"retcode","?")} {getattr(res,"comment","")}')
    return None


def close_position(ticket: int, pair: str, paper_mode: bool, reason: str = '') -> bool:
    log.info(f'CLOSE {pair}  ticket={ticket}  reason={reason}' + ('  [PAPER]' if paper_mode else ''))
    if paper_mode or ticket < 0:
        return True
    if not HAS_MT5:
        return False
    sym  = pair.replace('/', '')
    poss = [p for p in (mt5.positions_get(symbol=sym) or [])
            if p.ticket == ticket and p.magic == MAGIC]
    if not poss:
        log.warning(f'Ticket {ticket} not found — may be SL-closed')
        return True
    pos  = poss[0]
    ct   = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    tick = mt5.symbol_info_tick(sym)
    if not tick:
        return False
    cp = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
    res = mt5.order_send({
        'action': mt5.TRADE_ACTION_DEAL, 'symbol': sym, 'volume': pos.volume,
        'type': ct, 'position': ticket, 'price': cp, 'deviation': 20,
        'magic': MAGIC, 'comment': f'RgV2 close: {reason[:28]}',
        'type_time': mt5.ORDER_TIME_GTC, 'type_filling': _filling_mode(sym),
    })
    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'Closed ticket={ticket} at {cp}')
        return True
    log.error(f'Close failed: {getattr(res,"retcode","?")}')
    return False


# ── Trade window ───────────────────────────────────────────────────────────────

def within_window(cfg: dict) -> bool:
    now = datetime.now(timezone.utc).strftime('%H:%M')
    return cfg.get('trade_window_start', '07:00') <= now <= cfg.get('trade_window_end', '20:00')


# ── Cross-pair consensus ───────────────────────────────────────────────────────

def consensus_score(pairs: list[str], all_regimes: dict, target_regime: str) -> tuple[int, int]:
    """Returns (count_in_regime, total_pairs)."""
    count = sum(
        1 for p in pairs
        if all_regimes.get(p, {}).get('regime', '').upper() == target_regime.upper()
    )
    return count, len(pairs)


# ── Status push ────────────────────────────────────────────────────────────────

def push_status(pairs_status: dict, balance: float,
                paper_mode: bool, url: str,
                riskguard_locked: bool = False) -> None:
    _kv_put('regime_bot_v2_status', {
        'pairs':            pairs_status,
        'balance':          round(balance, 2),
        'paper_mode':       paper_mode,
        'riskguard_locked': riskguard_locked,
        'pushed_at':        time.time(),
        'version':          'v2',
    }, url)


# ── Main loop ─────────────────────────────────────────────────────────────────

def run(url: str, paper_mode: bool) -> None:
    log.info(f'RegimeV2 starting  paper={paper_mode}  dashboard={url}')

    load_credentials(url)

    if not paper_mode:
        if not mt5_connect():
            log.warning('MT5 connection failed — falling back to paper mode')
            paper_mode = True

    cfg = load_config(url)
    tg  = load_tg_config(url, cfg)

    log.info(
        f'Config: pairs={cfg["pairs"]}  hold={cfg["candle_hold"]}  '
        f'entry_conf={cfg["entry_conf"]}%  interval={cfg["interval_secs"]}s  '
        f'use_bocpd={cfg["use_bocpd"]}  use_1h={cfg["use_1h"]}  use_vix={cfg["use_vix"]}'
    )

    # ── Per-pair state ────────────────────────────────────────────────────────
    debounce:        dict[str, RegimeDebounce]       = {}
    decay_dets:      dict[str, DecayDetector]        = {}
    exhaust_dets:    dict[str, VolExhaustionDetector]= {}
    conf_history:    dict[str, deque]                = {}   # rolling confidence
    run_lengths:     dict[str, int]                  = {}
    last_regimes:    dict[str, str]                  = {}
    regime_start_t:  dict[str, float]                = {}   # when current regime started
    prev_regime_dur: dict[str, float]                = {}   # duration of previous regime
    momentum_start_t:dict[str, float]                = {}   # unbroken directional momentum
    momentum_regime: dict[str, str]                  = {}   # regime momentum is tracking
    flip_counts:     dict[str, int]                  = {}
    open_pos:        dict[str, dict]                 = {}
    entry_regime:    dict[str, str]                  = {}
    bocpd_high_bars: dict[str, int]                  = {}   # consecutive bars above bocpd_thresh
    range_exit_ctr:  dict[str, int]                  = {}
    entry_scores:    dict[str, float]                = {}   # regime score at time of entry
    score_low_bars:  dict[str, int]                  = {}   # polls below hold_score_min
    failed_entry_t:  dict[str, float]                = {}   # time of last failed MT5 order per pair

    risk_guard = RiskGuardV2()
    bocpd_reg  = BOCPRegistry(expected_run_length=cfg.get('bocpd_run_length', 150))
    macro      = MacroOverlay(
        fomc_window_hours=cfg.get('fomc_window_hours', 48.0),
    )

    for pair in cfg['pairs']:
        debounce[pair]      = RegimeDebounce(cfg['candle_hold'], cfg['entry_conf'])
        decay_dets[pair]    = DecayDetector(cfg['decay_window'])
        exhaust_dets[pair]  = VolExhaustionDetector()
        conf_history[pair]  = deque(maxlen=10)
        run_lengths[pair]   = 0
        last_regimes[pair]  = ''
        regime_start_t[pair]= time.time()
        prev_regime_dur[pair]= 0.0
        momentum_start_t[pair]= time.time()
        momentum_regime[pair] = ''
        flip_counts[pair]   = 0
        bocpd_high_bars[pair]= 0
        range_exit_ctr[pair] = 0
        score_low_bars[pair] = 0

    last_heartbeat: dict[str, float] = {p: 0.0 for p in cfg['pairs']}
    last_cfg_reload = time.time()
    cycle = 0

    while True:
        cycle += 1
        loop_start = time.time()

        # ── Reload config every 5 min ────────────────────────────────────────
        if time.time() - last_cfg_reload > 300:
            new_cfg = load_config(url)
            cfg.update(new_cfg)
            tg = load_tg_config(url, cfg)
            macro = MacroOverlay(fomc_window_hours=cfg.get('fomc_window_hours', 48.0))
            last_cfg_reload = time.time()
            # Sync new pairs if changed
            for pair in cfg['pairs']:
                if pair not in debounce:
                    debounce[pair]       = RegimeDebounce(cfg['candle_hold'], cfg['entry_conf'])
                    decay_dets[pair]     = DecayDetector(cfg['decay_window'])
                    exhaust_dets[pair]   = VolExhaustionDetector()
                    conf_history[pair]   = deque(maxlen=10)
                    run_lengths[pair]    = 0
                    last_regimes[pair]   = ''
                    regime_start_t[pair] = time.time()
                    momentum_start_t[pair]= time.time()
                    momentum_regime[pair] = ''
                    flip_counts[pair]    = 0
                    bocpd_high_bars[pair]= 0
                    range_exit_ctr[pair] = 0
                    score_low_bars[pair] = 0
                    last_heartbeat[pair] = 0.0

        if not cfg.get('enabled', True):
            time.sleep(cfg['interval_secs'])
            continue

        # ── Check force-unlock ────────────────────────────────────────────────
        check_force_unlock(url, risk_guard)

        # ── Macro overlay refresh (self-throttled) ────────────────────────────
        if cfg.get('use_vix', True) or cfg.get('use_news', True):
            macro.refresh()

        # ── Fetch regimes ─────────────────────────────────────────────────────
        all_regimes  = fetch_regimes(url)
        h1_regimes   = fetch_1h_regimes(url) if cfg.get('use_1h', True) else {}
        balance      = get_balance(paper_mode)
        risk_guard.sync_cfg(cfg)
        risk_guard.update_balance(balance)

        if not all_regimes:
            log.warning(f'Cycle {cycle}: no regime data — skipping')
            time.sleep(cfg['interval_secs'])
            continue

        pairs_status: dict[str, dict] = {}

        for pair in cfg['pairs']:
            rd         = all_regimes.get(pair) or {}
            regime     = rd.get('regime', 'RANGE').upper()
            confidence = float(rd.get('confidence', 0))
            vol_z      = float(rd.get('volZ', rd.get('vol_z', 0.0)))
            session_lbl= rd.get('sessionLabel', '')
            p_change   = 100.0 - confidence   # simple change prob

            h1_rd      = h1_regimes.get(pair) or {}
            h1_regime  = h1_rd.get('regime', '').upper() if h1_rd else None

            # ── Confidence history + slope ─────────────────────────────────
            conf_history[pair].append(confidence)
            conf_list  = list(conf_history[pair])
            conf_slope = _ols_slope(conf_list) if len(conf_list) >= 3 else 0.0

            # ── BOCPD ──────────────────────────────────────────────────────
            bocpd_prob = 0.0
            if cfg.get('use_bocpd', True):
                bocpd_prob = bocpd_reg.update(pair, confidence, regime)

            # ── Volume exhaustion ──────────────────────────────────────────
            exhaust_score = exhaust_dets[pair].push(vol_z)

            # ── Run length + regime start ──────────────────────────────────
            prev_regime = last_regimes.get(pair, '')
            now_t = time.time()

            if regime != prev_regime:
                prev_regime_dur[pair] = now_t - regime_start_t.get(pair, now_t)
                regime_start_t[pair]  = now_t
                run_lengths[pair]     = 1
                last_regimes[pair]    = regime

                # Momentum: reset only on full reversal (BULL↔BEAR), not RANGE blip
                prev_mom = momentum_regime.get(pair, '')
                if (prev_mom == 'BULL' and regime == 'BEAR') or \
                   (prev_mom == 'BEAR' and regime == 'BULL'):
                    momentum_start_t[pair]  = now_t
                    momentum_regime[pair]   = regime
                elif regime in TRADEABLE and prev_mom == '':
                    momentum_start_t[pair]  = now_t
                    momentum_regime[pair]   = regime

                # Decay reset on fresh tradeable regime
                if regime in TRADEABLE and pair not in open_pos:
                    decay_dets[pair] = DecayDetector(cfg['decay_window'])

                # Telegram: regime change alert
                if prev_regime and regime in TRADEABLE:
                    cons, cons_total = consensus_score(cfg['pairs'], all_regimes, regime)
                    price_now = get_price(pair, url) or 0.0
                    macro_snap = macro.snapshot(pair)
                    msg = regime_change_alert(
                        pair=pair, prev_regime=prev_regime, new_regime=regime,
                        confidence=confidence, price=price_now, vol_z=vol_z,
                        run_length=run_lengths[pair], change_prob=bocpd_prob or p_change,
                        prev_regime_duration_secs=prev_regime_dur[pair],
                        consensus=cons, consensus_total=cons_total,
                        h1_regime=h1_regime, bocpd_prob=bocpd_prob,
                        macro=macro_snap,
                    )
                    send_telegram(tg['token'], tg['chat_id'], msg)
                    bocpd_reg.reset(pair)
            else:
                run_lengths[pair] += 1

            run_length    = run_lengths[pair]
            regime_secs   = now_t - regime_start_t.get(pair, now_t)
            momentum_secs = now_t - momentum_start_t.get(pair, now_t)

            # ── Decay detector ─────────────────────────────────────────────
            decay_dets[pair].push(regime, confidence, vol_z, run_length)
            decay_score = decay_dets[pair].score()

            # ── Per-pair inputs shared by score, entry, and exit ───────────
            sess_mult    = macro.session_multiplier(session_lbl)
            eff_conf     = confidence * sess_mult
            cons, cons_total = consensus_score(cfg['pairs'], all_regimes, regime)

            macro_inputs = macro.score_inputs(pair)
            reg_score = compute_regime_score(
                pair=pair, regime=regime, confidence=confidence,
                bocpd_prob=bocpd_prob, session_mult=sess_mult,
                consensus=cons, consensus_total=cons_total,
                pair_vol_pct=macro_inputs.get('pair_vol_pct'),
                dxy_trend_pct=macro_inputs.get('dxy_trend_pct', 0.0),
                credit_5d_ret=macro_inputs.get('credit_5d_ret', 0.0),
                entry_score_min=cfg.get('entry_score_min', 55.0),
            )

            # X11 counter: consecutive polls with score below hold threshold
            if reg_score.total < cfg.get('hold_score_min', 40.0):
                score_low_bars[pair] += 1
            else:
                score_low_bars[pair]  = 0

            log.info(
                f'[{pair}] reg={regime}  conf={confidence:.0f}%  slope={conf_slope:+.1f}  '
                f'vz={vol_z:+.2f}  rl={run_length}  bocpd={bocpd_prob:.1f}%  '
                f'exh={exhaust_score:.2f}  decay={decay_score:.3f}  score={reg_score.total:.0f}'
                + (f'  1h={h1_regime}' if h1_regime else '')
            )

            # ── BOCPD consecutive high counter ─────────────────────────────
            if bocpd_prob >= cfg.get('bocpd_thresh', 70.0):
                bocpd_high_bars[pair] += 1
            else:
                bocpd_high_bars[pair] = 0

            # ── Open position management ────────────────────────────────────
            if pair in open_pos:
                pos       = open_pos[pair]
                entry_r   = entry_regime.get(pair, '')
                price_now = get_price(pair, url) or pos['entry_price']
                pip       = _PIP_SIZES.get(pair, 0.0001)
                sign      = 1 if pos['direction'] == 'LONG' else -1
                pnl_pips  = round((price_now - pos['entry_price']) * sign / pip, 1)
                dur_secs  = now_t - pos.get('opened_at', now_t)

                # Check MT5 SL hit
                if HAS_MT5 and not paper_mode:
                    mt5_sym = pair.replace('/', '')
                    still_open = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                                  if p.ticket == pos['ticket'] and p.magic == MAGIC]
                    if not still_open:
                        log.info(f'[{pair}] Ticket {pos["ticket"]} gone — SL hit (X5)')
                        del open_pos[pair]; entry_regime.pop(pair, None)
                        risk_guard.record_trade(pair)
                        pairs_status[pair] = {'status': 'sl_hit', 'regime': regime}
                        continue

                close_reason: Optional[str] = None
                exit_code:    str           = ''

                # X1 — regime flipped
                if regime != entry_r:
                    if cfg.get('exit_on_range', True):
                        range_exit_ctr[pair] += 1 if regime not in TRADEABLE else 0
                        if regime in TRADEABLE or range_exit_ctr[pair] >= cfg.get('range_exit_hold', 2):
                            close_reason = f'Regime → {regime}'
                            exit_code = 'X1'
                    else:
                        if regime in TRADEABLE:
                            close_reason = f'Regime → {regime}'
                            exit_code = 'X1'
                else:
                    range_exit_ctr[pair] = 0

                # X2 — confidence floor
                if not close_reason and confidence < cfg.get('conf_floor', 45.0):
                    close_reason = f'Conf floor {confidence:.1f}% < {cfg["conf_floor"]:.0f}%'
                    exit_code = 'X2'

                # X3 — confidence slope deterioration
                if not close_reason and len(conf_list) >= cfg.get('slope_bars', 3):
                    recent_slopes = [
                        conf_list[i] - conf_list[i-1]
                        for i in range(max(1, len(conf_list)-cfg['slope_bars']), len(conf_list))
                    ]
                    if recent_slopes and all(s < cfg.get('slope_thresh', -5.0) for s in recent_slopes):
                        close_reason = f'Conf slope {conf_slope:+.1f}%/bar × {len(recent_slopes)} bars (X3)'
                        exit_code = 'X3'

                # X4 — single-bar velocity drop
                if not close_reason and len(conf_list) >= 2:
                    drop = conf_list[-2] - conf_list[-1]
                    if drop > cfg.get('drop_thresh', 15.0):
                        close_reason = f'Conf drop {drop:.1f}% in 1 bar (X4)'
                        exit_code = 'X4'

                # X6 — BOCPD sustained high
                if not close_reason and cfg.get('use_bocpd', True):
                    if bocpd_high_bars[pair] >= cfg.get('bocpd_exit_bars', 2):
                        close_reason = f'BOCPD {bocpd_prob:.0f}% × {bocpd_high_bars[pair]} bars (X6)'
                        exit_code = 'X6'

                # X7 — 1h regime opposed
                if not close_reason and cfg.get('use_1h', True) and h1_regime:
                    opp = {'BULL': 'BEAR', 'BEAR': 'BULL'}
                    if h1_regime == opp.get(entry_r, ''):
                        close_reason = f'1h flipped to {h1_regime} (X7)'
                        exit_code = 'X7'

                # X8 — consensus collapsed (checked against entry regime, not current)
                if not close_reason:
                    cons_x8, cons_x8_total = consensus_score(cfg['pairs'], all_regimes, entry_r)
                    if cons_x8_total > 1 and cons_x8 < cfg.get('consensus_min', 2):
                        close_reason = f'Consensus collapsed {cons_x8}/{cons_x8_total} (X8)'
                        exit_code = 'X8'

                # X9 — VIX backwardation
                if not close_reason and cfg.get('use_vix', True):
                    if macro.vix.is_backwardation:
                        close_reason = f'VIX backwardation (X9)'
                        exit_code = 'X9'

                # X11 — score below hold threshold for N consecutive polls
                if not close_reason:
                    s_bars = cfg.get('score_drop_bars', 2)
                    if score_low_bars[pair] >= s_bars:
                        close_reason = (
                            f'Score {reg_score.total:.0f} < {cfg.get("hold_score_min", 40.0):.0f} '
                            f'× {score_low_bars[pair]} bars (X11)'
                        )
                        exit_code = 'X11'

                # X12 — score dropped sharply from entry level in one poll period
                if not close_reason:
                    entry_s  = entry_scores.get(pair, reg_score.total)
                    s_drop   = entry_s - reg_score.total
                    if s_drop >= cfg.get('score_drop_exit', 30.0):
                        close_reason = f'Score −{s_drop:.0f}pts from entry {entry_s:.0f} (X12)'
                        exit_code = 'X12'

                # Decay exit
                if not close_reason and decay_score >= cfg.get('decay_exit', 0.70):
                    close_reason = f'Decay {decay_score:.3f} ≥ {cfg["decay_exit"]:.2f}'
                    exit_code = 'decay'

                # Outside trade window
                if not close_reason and not within_window(cfg):
                    close_reason = 'Outside trade window'
                    exit_code = 'window'

                if close_reason:
                    ok = close_position(pos['ticket'], pair, paper_mode, close_reason)
                    if ok:
                        # Telegram exit alert
                        msg = exit_alert(
                            pair=pair, direction=pos['direction'],
                            exit_reason=f'{exit_code}: {close_reason}',
                            conf_at_exit=confidence, regime_at_exit=regime,
                            pnl_pips=pnl_pips, duration_secs=dur_secs,
                            paper_mode=paper_mode,
                        )
                        send_telegram(tg['token'], tg['chat_id'], msg)
                        del open_pos[pair]
                        entry_regime.pop(pair, None)
                        entry_scores.pop(pair, None)
                        score_low_bars[pair] = 0
                        risk_guard.record_trade(pair)
                        range_exit_ctr[pair] = 0
                        pairs_status[pair] = {
                            'status': 'closed', 'reason': exit_code,
                            'pnl_pips': pnl_pips, 'regime': regime,
                        }
                        continue

                pairs_status[pair] = {
                    'status':        'open',
                    'direction':     pos['direction'],
                    'entry':         pos['entry_price'],
                    'sl':            pos['sl'],
                    'ticket':        pos['ticket'],
                    'pnl_pips':      pnl_pips,
                    'regime':        regime,
                    'conf':          round(confidence, 1),
                    'slope':         round(conf_slope, 2),
                    'vol_z':         round(vol_z, 3),
                    'bocpd':         round(bocpd_prob, 1),
                    'exhaustion':    round(exhaust_score, 3),
                    'h1_regime':     h1_regime,
                    'session':       session_lbl,
                    'regime_mins':   round(regime_secs / 60, 1),
                    'momentum_mins': round(momentum_secs / 60, 1),
                    'dur_secs':      round(dur_secs, 0),
                    'decay':         round(decay_score, 3),
                    'run_length':    run_length,
                    'reg_score':     reg_score.to_dict(),
                    'entry_score':   entry_scores.get(pair, reg_score.total),
                    'score_low_bars':score_low_bars[pair],
                }

                # Heartbeat
                hb_interval = cfg.get('heartbeat_min', 120) * 60
                if hb_interval > 0 and now_t - last_heartbeat.get(pair, 0) >= hb_interval:
                    cons, cons_total = consensus_score(cfg['pairs'], all_regimes, regime)
                    pos_info = {'direction': pos['direction'], 'pnl_pips': pnl_pips, 'duration_secs': dur_secs}
                    msg = heartbeat_message(
                        pair=pair, regime=regime, confidence=confidence,
                        slope=conf_slope, vol_z=vol_z,
                        regime_secs=regime_secs, momentum_secs=momentum_secs,
                        change_prob=bocpd_prob or p_change,
                        open_pos=pos_info, h1_regime=h1_regime,
                        bocpd_prob=bocpd_prob, exhaustion_score=exhaust_score,
                        consensus=cons, consensus_total=cons_total,
                        macro=macro.snapshot(pair), session_label=session_lbl,
                        reg_score=reg_score.to_dict(),
                    )
                    send_telegram(tg['token'], tg['chat_id'], msg)
                    last_heartbeat[pair] = now_t

                continue  # position managed — skip entry logic

            # ── Entry logic ─────────────────────────────────────────────────
            if not within_window(cfg):
                pairs_status[pair] = {'status': 'window', 'regime': regime}
                continue

            block = risk_guard.block_reason(balance, pair)
            if block:
                if risk_guard.is_locked() and risk_guard.lock_remaining_mins() > 5:
                    # Only log lockout once every 10 cycles to avoid spam
                    if cycle % 10 == 0:
                        log.info(f'[{pair}] RiskGuard: {block}')
                pairs_status[pair] = {'status': 'blocked', 'reason': block, 'regime': regime}
                continue

            if regime not in TRADEABLE:
                pairs_status[pair] = {
                    'status': 'watching', 'regime': regime,
                    'conf': round(confidence, 1), 'vol_z': round(vol_z, 3),
                    'slope': round(conf_slope, 2),
                    'regime_mins': round(regime_secs / 60, 1),
                    'reg_score': reg_score.to_dict(),
                }
                continue

            # ── Gate checks ───────────────────────────────────────────────
            # sess_mult / eff_conf / cons / cons_total already computed above

            gate_fail: Optional[str] = None

            if eff_conf < cfg.get('entry_conf', 70.0):
                gate_fail = f'conf {eff_conf:.1f}% < {cfg["entry_conf"]}% (sess×{sess_mult:.2f})'

            if not gate_fail and len(conf_list) >= 2:
                if conf_list[-1] <= conf_list[-2] and conf_list[-1] < cfg.get('conf_rising_bypass', 85.0):
                    gate_fail = f'conf not rising ({conf_list[-2]:.0f}%→{conf_list[-1]:.0f}%)'

            if not gate_fail and vol_z > cfg.get('vol_z_max', 2.5):
                gate_fail = f'vol_z {vol_z:.2f} > {cfg["vol_z_max"]}'

            if not gate_fail and decay_score >= cfg.get('entry_decay_max', 0.25):
                gate_fail = f'decay {decay_score:.3f} ≥ {cfg["entry_decay_max"]}'

            if not gate_fail and exhaust_score > 0.8:
                gate_fail = f'vol exhaustion {exhaust_score:.2f} > 0.8 (E12)'

            # 1h alignment
            if not gate_fail and cfg.get('use_1h', True) and h1_regime:
                opp = {'BULL': 'BEAR', 'BEAR': 'BULL'}
                if h1_regime == opp.get(regime, ''):
                    gate_fail = f'1h opposed ({h1_regime}) (E7)'

            # Cross-pair consensus (cons/cons_total computed above for current regime)
            if not gate_fail and cons_total > 1 and cons < cfg.get('consensus_min', 2):
                gate_fail = f'consensus {cons}/{cons_total} < {cfg["consensus_min"]} (E8)'

            # Macro gates
            if not gate_fail and cfg.get('use_vix', True) and macro.vix.is_backwardation:
                gate_fail = f'VIX backwardation (E10)'
            if not gate_fail and cfg.get('use_news', True):
                news_blocked, news_reason = macro.news.is_blocked(pair)
                if news_blocked:
                    gate_fail = f'News block: {news_reason} (E11)'
            if not gate_fail and macro.fomc.is_window(cfg.get('fomc_window_hours', 48.0)):
                gate_fail = f'FOMC window (E9)'

            # Composite score gate
            if not gate_fail and not reg_score.entry_allowed:
                gate_fail = f'Score {reg_score.total:.0f} < {cfg.get("entry_score_min", 55.0):.0f} (Escore)'

            if gate_fail:
                log.info(f'[{pair}] Gate: {gate_fail}')
                pairs_status[pair] = {
                    'status': 'gated', 'reason': gate_fail,
                    'regime': regime, 'conf': round(confidence, 1),
                    'slope': round(conf_slope, 2), 'vol_z': round(vol_z, 3),
                    'bocpd': round(bocpd_prob, 1),
                    'regime_mins': round(regime_secs / 60, 1),
                    'reg_score': reg_score.to_dict(),
                }
                continue

            # ── Candle hold debounce ─────────────────────────────────────
            confirmed = debounce[pair].push(regime, confidence)
            if not confirmed:
                pairs_status[pair] = {
                    'status': 'hold_pending', 'regime': regime,
                    'conf': round(confidence, 1), 'slope': round(conf_slope, 2),
                    'vol_z': round(vol_z, 3),
                    'regime_mins': round(regime_secs / 60, 1),
                    'reg_score': reg_score.to_dict(),
                }
                continue

            # ── ENTRY ────────────────────────────────────────────────────
            fail_cd = cfg.get('entry_fail_cooldown_secs', 300)
            if time.time() - failed_entry_t.get(pair, 0) < fail_cd:
                remaining = int(fail_cd - (time.time() - failed_entry_t[pair]))
                pairs_status[pair] = {'status': f'order_fail_cooldown ({remaining}s)', 'regime': regime}
                continue

            direction = 'LONG' if confirmed == 'BULL' else 'SHORT'
            price     = get_price(pair, url)
            if price is None:
                log.warning(f'[{pair}] No price — skip entry')
                continue

            pip     = _PIP_SIZES.get(pair, 0.0001)
            atr     = get_atr(pair, cfg.get('sl_atr_tf', '5m'))
            sl_dist = (atr * cfg['sl_atr_mult']) if atr else (20 * pip)
            sl      = (price - sl_dist) if direction == 'LONG' else (price + sl_dist)
            size    = position_size(balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot'], decay_score)
            # Scale lots by composite score: 50% at entry_score_min, 100% at score=100
            size    = max(0.01, round(size * reg_score.size_pct / 100.0, 2))

            ticket = open_position(pair, direction, sl, 0, size, cfg['max_spread_pips'], paper_mode)

            if ticket is not None:
                open_pos[pair]    = {
                    'ticket':      ticket,
                    'direction':   direction,
                    'entry_price': price,
                    'sl':          sl,
                    'opened_at':   time.time(),
                }
                entry_regime[pair]   = confirmed
                entry_scores[pair]   = reg_score.total
                score_low_bars[pair] = 0
                risk_guard.record_trade(pair)

                # Telegram entry alert
                msg = entry_alert(
                    pair=pair, direction=direction, regime=confirmed,
                    confidence=confidence, price=price, sl=sl,
                    lots=size, paper_mode=paper_mode,
                    consensus=cons, consensus_total=cons_total,
                    h1_regime=h1_regime, vol_z=vol_z,
                    reg_score=reg_score.to_dict(),
                )
                send_telegram(tg['token'], tg['chat_id'], msg)

                log.info(
                    f'[{pair}] ENTRY {direction}  conf={confidence:.0f}%  score={reg_score.total:.0f}  '
                    f'size_pct={reg_score.size_pct:.0f}%  consensus={cons}/{cons_total}  '
                    f'bocpd={bocpd_prob:.1f}%  lots={size}  SL={sl:.5f}'
                )

                pairs_status[pair] = {
                    'status':    'opened',
                    'direction': direction,
                    'entry':     price,
                    'sl':        sl,
                    'regime':    confirmed,
                    'conf':      round(confidence, 1),
                    'slope':     round(conf_slope, 2),
                    'reg_score': reg_score.to_dict(),
                    'entry_score': reg_score.total,
                }
            else:
                failed_entry_t[pair] = time.time()
                log.warning(f'[{pair}] MT5 order failed — cooldown {cfg.get("entry_fail_cooldown_secs", 300)}s')
                pairs_status[pair] = {'status': 'entry_failed', 'regime': regime}

        # ── Status push + sleep ───────────────────────────────────────────────
        push_status(pairs_status, balance, paper_mode, url,
                    riskguard_locked=risk_guard.is_locked())

        elapsed = time.time() - loop_start
        sleep_t = max(0, cfg['interval_secs'] - elapsed)
        if cycle % 20 == 0:
            log.info(f'Cycle {cycle}  balance={balance:.2f}  macro={macro.label()}  sleep={sleep_t:.1f}s')
        time.sleep(sleep_t)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='RegimeV2 bot')
    parser.add_argument('--dashboard-url', default='http://localhost:3000',
                        help='Base URL of the MacroFX Railway server')
    parser.add_argument('--live', action='store_true',
                        help='Disable paper mode — places real MT5 orders')
    args = parser.parse_args()

    paper = not args.live
    if paper:
        log.info('PAPER MODE — no real orders will be placed')

    # Ensure logs directory exists
    logs_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
    os.makedirs(logs_dir, exist_ok=True)

    run(args.dashboard_url, paper)


if __name__ == '__main__':
    main()
