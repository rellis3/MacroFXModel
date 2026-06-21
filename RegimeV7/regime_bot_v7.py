"""
RegimeV7 — HMM regime bot with regime-exit debounce + optional HTF confirmation.

Strategy (ported from simulateV7() in regime-backtest.html)
-------------------------------------------------------------
Signals are computed on M30 (MTF) bars — same resolution the backtester calls
"30m bars". An optional 4x HTF (H2) regime gate can be required before entry.

Entry (all must agree, evaluated once per completed M30 bar)
  - regime is BULL or BEAR (not RANGE/CHOP)
  - effective confidence (conf x session_mult) >= entry_conf
  - composite 7-component score (same as V4/V5) >= entry_score_min
  - trend slope matches direction (BULL needs slope>0, BEAR needs slope<0)
  - optional: 4x HTF regime agrees with direction (htf_require)
  - debounce: candle_hold consecutive M30 bars passing all of the above

Exit cascade (checked every poll on live price; first match wins)
  1. REGIME_FLIP   — regime flips to the opposite direction (immediate)
  2. CONF_FLOOR    — confidence drops below conf_floor (immediate)
  3. MFE_RETRACE   — once MFE >= mfe_min_r, exit if price gives back
                     mfe_retrace_pct of the peak favourable move
  4. REGIME_RANGE  — exit_regime_bars consecutive non-trend M30 bars
                     (each trend-direction bar resets the counter to 0)
  5. MAX_HOLD      — backstop: max_hold_bars M30 bars held
  SL_HIT is checked every poll from live price/MT5 ticket state.
  Breakeven (SL -> entry) fires automatically once MFE >= 1.0R (hardcoded,
  matches the backtester).

MTF bar-gating
--------------
The bot polls every interval_secs (default 30s) — far more often than the
30-minute bar resolution the strategy parameters are defined in. Wall-clock
time is bucketed into 1800s buckets to detect "new M30 bar" boundaries.
Only candle_hold (entry debounce), exit_regime_bars (range-exit counter),
max_hold_bars (hold-timeout counter) and post_exit_cooldown advance once per
new bar — matching the backtester's once-per-bar resolution exactly. All
price-driven checks (SL, MFE, breakeven, regime-flip, conf-floor, MFE-retrace)
run every poll using live data, which is at least as responsive as, and often
safer than, the backtest.

Since computeHMM5mV2() (the only regime feed the server exposes) does not
return the `slope` or `atrSL` features the V7 entry gate needs, this bot
fetches raw M30 bars directly from MT5 and reproduces buildATR_hmm() and the
linreg-slope-delta feature locally (see compute_m30_features()).

Audit log (new vs V2/V4)
-------------------------
Every entry and exit is appended to the `regime_bot_v7_audit_log` KV key,
recording the pair, direction, prices, exit reason and — crucially — a
snapshot + hash of the strategy config that was ACTIVE AT ENTRY TIME (stored
on the position itself so a later config reload can't retroactively change
what an exit record reports). This lets the user later group live/paper
trades by exact config version and compare the realised distribution against
what the backtester predicted for that same config.

Config key  : regime_bot_v7_config
Creds key   : regime_bot_v7_credentials
Status key  : regime_bot_v7_status
Unlock key  : rgv7_force_unlock
Audit key   : regime_bot_v7_audit_log

Usage:
  python RegimeV7/regime_bot_v7.py
  python RegimeV7/regime_bot_v7.py --live
  python RegimeV7/regime_bot_v7.py --dashboard-url https://macrofxmodel-production.up.railway.app
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from collections import deque
from datetime import datetime, timezone, date as date_type
from typing import Optional

import requests

# ── path so relative imports work from repo root or RegimeV7/ ─────────────────
_HERE   = os.path.dirname(os.path.abspath(__file__))
_V2_DIR = os.path.join(_HERE, '..', 'RegimeV2')
_V4_DIR = os.path.join(_HERE, '..', 'RegimeV4')
sys.path.insert(0, _HERE)
sys.path.insert(0, _V2_DIR)   # bocpd, macro_overlay, formatter live in RegimeV2
sys.path.insert(0, _V4_DIR)   # regime_score_v4 lives in RegimeV4

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

MAGIC = 20260007   # V1=20260002, main=20260001, Gold=20260004, V2bot=20260005, V4=20260006

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
_MT5_SYMBOL: dict[str, str] = {
    'NAS100_USD':  'USTECH100M',
    'US2000_USD':  'US2000',
    'SPX500_USD':  'SP500',
    'DE30_USD':    'DAX',
    'UK100_GBP':   'FTSE100',
    'US30_USD':    'US30',
}

# Per-symbol linreg window (mirrors HMM_V2_CONFIG.linregN in hmm5m-v2.js) —
# needed to reproduce the backtest's `slope` feature exactly.
_LINREG_N: dict[str, int] = {
    'XAU/USD':    40,
    'NAS100_USD': 60,
    'SPX500_USD': 55, 'DE30_USD': 55, 'UK100_GBP': 55,
    'US30_USD':   55, 'US2000_USD': 55,
}
_LINREG_N_DEFAULT = 50

MTF_SECS = 1800   # M30 bar size in seconds — the bot's bar-gating resolution


def _mt5_sym(pair: str) -> str:
    return _MT5_SYMBOL.get(pair, pair.replace('/', ''))


def _linreg_n(pair: str) -> int:
    return _LINREG_N.get(pair, _LINREG_N_DEFAULT)


# ── Logging ────────────────────────────────────────────────────────────────────
os.makedirs(os.path.join(_HERE, '..', 'logs'), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [RGV7] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            os.path.join(_HERE, '..', 'logs', 'regime_bot_v7.log'),
            encoding='utf-8',
        ),
    ],
)
log = logging.getLogger(__name__)

# ── Default config — mirrors V7_PARAMS / V7_BOOLS in regime-backtest.html ─────
DEFAULT_CFG: dict = {
    'enabled':       True,
    'paper_mode':    True,
    'pairs':         ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    'interval_secs': 30,

    # ── V7 strategy params (MTF = M30 bars unless noted) ─────────────────────
    'entry_conf':         54.0,
    'entry_score_min':    58.0,
    'sl_atr_mult':        2.3,
    'candle_hold':        3,      # MTF bars regime+gates must persist before entry
    'conf_floor':         55.0,
    'mfe_retrace_pct':    0.27,
    'mfe_min_r':          1.1,
    'max_hold_bars':      49,     # MTF bars — backstop timeout
    'exit_regime_bars':   4,      # consecutive non-trend MTF bars before exit
    'window_start':       7,      # UTC hour, entries only
    'window_end':         19,     # UTC hour, entries only
    'post_exit_cooldown': 4,      # MTF bars blocked after any close
    'htf_require':        False,  # require 4x HTF (H2) regime to agree

    # ── BOCPD (feeds the composite score's bocpd component only — no exit gate) ─
    'use_bocpd':        True,
    'bocpd_run_length': 150,

    # ── Position sizing ───────────────────────────────────────────────────────
    'risk_pct':        1.0,
    'max_lot':         5.0,
    'max_spread_pips': 3.0,

    # ── RiskGuard ─────────────────────────────────────────────────────────────
    'ddlimit':   3.0,
    'monthlydd': 5.0,
    'lockout':   3,

    # ── Macro overlay (used for score inputs + telegram context only) ────────
    'fomc_window_hours': 48.0,

    # ── Telegram ──────────────────────────────────────────────────────────────
    'heartbeat_min': 60,

    # ── Order retry ───────────────────────────────────────────────────────────
    'entry_fail_cooldown_secs': 300,
}

# Whitelist of strategy-param keys captured in the audit log's config snapshot.
# Secrets (mt5/telegram credentials) are excluded by construction — they are
# never part of DEFAULT_CFG's strategy section and are loaded from a separate
# KV key entirely (regime_bot_v7_credentials).
_AUDIT_CFG_KEYS = [
    'entry_conf', 'entry_score_min', 'sl_atr_mult', 'candle_hold',
    'conf_floor', 'mfe_retrace_pct', 'mfe_min_r', 'max_hold_bars',
    'exit_regime_bars', 'window_start', 'window_end',
    'post_exit_cooldown', 'htf_require',
    'risk_pct', 'max_lot', 'max_spread_pips',
    'ddlimit', 'monthlydd', 'lockout',
]
_AUDIT_LOG_MAX = 500


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
            json={'bot': 'v7', 'ts': int(time.time()), 'states': states, 'events': events},
            timeout=6,
        )
    except Exception:
        pass


def load_config(url: str) -> dict:
    stored = _kv_get('regime_bot_v7_config', url)
    cfg = dict(DEFAULT_CFG)
    if stored:
        cfg.update(stored)
    return cfg


def load_credentials(url: str) -> None:
    creds = _kv_get('regime_bot_v7_credentials', url)
    if not creds:
        return
    for env_key, cfg_key in [
        ('MT5_ACCOUNT', 'mt5_account'), ('MT5_PASSWORD', 'mt5_password'),
        ('MT5_SERVER',  'mt5_server'),  ('MT5_PATH',     'mt5_path'),
    ]:
        if val := creds.get(cfg_key):
            os.environ[env_key] = str(val)
    log.info(f'Credentials loaded: account={creds.get("mt5_account")}  server={creds.get("mt5_server")}')


def check_force_unlock(url: str, rg: 'RiskGuardV7') -> None:
    data = _kv_get('rgv7_force_unlock', url)
    if data and data.get('force_unlock'):
        log.info('Force unlock received — clearing lockout')
        rg.force_unlock()
        _kv_put('rgv7_force_unlock', {'force_unlock': False}, url)


def load_tg_config(url: str, v7_cfg: Optional[dict] = None) -> dict:
    v7 = v7_cfg or {}
    token   = v7.get('tg_token', '').strip()
    chat_id = v7.get('tg_chat_id', '').strip()
    if token and chat_id:
        return {'token': token, 'chat_id': chat_id}
    shared = _kv_get('tg_config', url) or {}
    return {'token': shared.get('token', ''), 'chat_id': shared.get('chatId', '')}


# ── Audit log ──────────────────────────────────────────────────────────────────

def _config_snapshot(cfg: dict) -> dict:
    return {k: cfg.get(k) for k in _AUDIT_CFG_KEYS}


def _config_hash(snapshot: dict) -> str:
    blob = json.dumps(snapshot, sort_keys=True)
    return hashlib.sha1(blob.encode()).hexdigest()[:12]


def _load_audit_log(url: str) -> list:
    data = _kv_get('regime_bot_v7_audit_log', url)
    if not data or not isinstance(data.get('records'), list):
        return []
    return data['records']


def _append_audit_record(url: str, record: dict) -> None:
    records = _load_audit_log(url)
    records.append(record)
    if len(records) > _AUDIT_LOG_MAX:
        records = records[-_AUDIT_LOG_MAX:]
    _kv_put('regime_bot_v7_audit_log', {'records': records, 'updated_at': time.time()}, url)


# ── Telegram ───────────────────────────────────────────────────────────────────

def _v7_tag(msg: str) -> str:
    """formatter.py hardcodes [V2] in entry/exit/lockout/macro alerts — retag for V7."""
    return msg.replace('[V2]', '[V7]', 1)


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
        log.warning('MetaTrader5 not installed — paper mode only, no slope/ATR data')
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


# ── Price / balance ────────────────────────────────────────────────────────────

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


def get_balance(paper_mode: bool) -> float:
    if HAS_MT5 and not paper_mode:
        info = mt5.account_info()
        if info:
            return info.balance
    return 10_000.0


# ── M30 feature computation (slope + ATR-for-SL) ──────────────────────────────
# computeHMM5mV2() does not return `slope` or `atrSL` — reproduce both locally
# from raw MT5 bars so the V7 entry gate matches the backtest exactly.

def _build_atr(bars: list[dict], n: int) -> list[float]:
    """Port of buildATR_hmm(bars, n) from regime-backtest.html — EMA-style ATR."""
    if not bars:
        return []
    k   = 1.0 / n
    out = [abs(bars[0]['high'] - bars[0]['low'])]
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = max(h - l, abs(h - pc), abs(l - pc))
        out.append(k * tr + (1 - k) * out[-1] if tr > 0 else out[-1])
    return out


def _ols_slope(values: list[float]) -> float:
    """Port of linregSlopeAt() — OLS slope of values vs index (also used for bocpd_trend)."""
    n = len(values)
    if n < 2:
        return 0.0
    xm  = (n - 1) / 2.0
    sXY = sum((i - xm) * v for i, v in enumerate(values))
    sX2 = sum((i - xm) ** 2 for i in range(n))
    return sXY / sX2 if sX2 > 0 else 0.0


def fetch_m30_bars(pair: str, count: int = 300) -> Optional[list]:
    if not HAS_MT5:
        return None
    try:
        bars = mt5.copy_rates_from_pos(_mt5_sym(pair), mt5.TIMEFRAME_M30, 0, count)
        if bars is None or len(bars) < 80:
            return None
        return [{'high': float(b['high']), 'low': float(b['low']), 'close': float(b['close'])} for b in bars]
    except Exception:
        return None


def compute_m30_features(pair: str) -> Optional[dict]:
    """Returns {'atrSL': float, 'slope': float} or None if insufficient MT5 data."""
    bars = fetch_m30_bars(pair)
    if not bars:
        return None
    ln = _linreg_n(pair)
    if len(bars) < ln + 3:
        return None
    closes = [b['close'] for b in bars]
    n      = len(closes)
    atr_sl = _build_atr(bars, 70)[-1]
    trend_now  = _ols_slope(closes[n - ln:n])
    trend_prev = _ols_slope(closes[n - 3 - ln:n - 3])
    slope  = (trend_now - trend_prev) * 1000
    return {'atrSL': atr_sl, 'slope': slope}


# ── Regime fetch (with stale-data fallback) ────────────────────────────────────

_last_regimes:     dict = {}
_last_regimes_ts:  float = 0.0
_last_htf_regimes:    dict = {}
_last_htf_regimes_ts: float = 0.0


def fetch_regimes(url: str, stale_max_secs: float = 600.0) -> dict:
    global _last_regimes, _last_regimes_ts
    try:
        r = requests.get(f'{url}/api/hmm30m-v2', timeout=10)
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


def fetch_htf_regimes(url: str, stale_max_secs: float = 1800.0) -> dict:
    global _last_htf_regimes, _last_htf_regimes_ts
    try:
        r = requests.get(f'{url}/api/hmm2h-v2', timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data:
                _last_htf_regimes    = data
                _last_htf_regimes_ts = time.time()
            return data
    except Exception as exc:
        age = time.time() - _last_htf_regimes_ts
        if _last_htf_regimes and age <= stale_max_secs:
            log.warning(f'fetch_htf_regimes failed ({exc}) — using cached ({age:.0f}s old)')
            return _last_htf_regimes
        log.error(f'fetch_htf_regimes failed ({exc}) — no valid cache')
    return {}


# ── Cross-pair consensus ───────────────────────────────────────────────────────

def peer_directional_count(pair: str, pairs: list[str], all_regimes: dict) -> tuple[int, int]:
    """Returns (count, total): other configured pairs in BULL or BEAR (any direction)."""
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
        'magic':        MAGIC,                 'comment': f'RgV7 {direction[0]}',
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
            'comment':      (''.join(c for c in f'RgV7 {reason}' if c.isalnum() or c == ' '))[:31],
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


# ── Trade window (UTC hour ints, matches V7_PARAMS window_start/window_end) ───

def within_window_v7(cfg: dict) -> bool:
    h  = datetime.now(timezone.utc).hour
    ws = int(cfg.get('window_start', 7))
    we = int(cfg.get('window_end', 20))
    return ws <= h < we


# ── RiskGuard V7 (simplified — no per-pair cooldown, post_exit_cooldown's own
#    bar counter replaces it; keeps only daily/monthly drawdown lockout) ──────

class RiskGuardV7:
    def __init__(self):
        self.dd_limit_pct:   float = 3.0
        self.monthly_dd_pct: float = 5.0
        self.lockout_secs:   float = 3 * 3600
        self._day_start:     Optional[float] = None
        self._month_start:   Optional[float] = None
        self._locked_until:  float = 0.0
        self._reset_date:    Optional[date_type] = None
        self._reset_month:   Optional[str] = None

    def sync_cfg(self, cfg: dict) -> None:
        self.dd_limit_pct   = float(cfg.get('ddlimit',   3.0))
        self.monthly_dd_pct = float(cfg.get('monthlydd', 5.0))
        self.lockout_secs   = float(cfg.get('lockout',   3)) * 3600

    def update_balance(self, bal: float) -> None:
        today      = datetime.now(timezone.utc).date()
        this_month = today.strftime('%Y-%m')
        if self._day_start is None:
            self._day_start = bal; self._reset_date = today
        if self._month_start is None:
            self._month_start = bal; self._reset_month = this_month
        if self._reset_date and today > self._reset_date:
            log.info(f'[RGV7] Daily reset: {self._day_start:.2f} → {bal:.2f}')
            self._day_start = bal; self._reset_date = today
        if self._reset_month != this_month:
            log.info(f'[RGV7] Month reset: {self._month_start:.2f} → {bal:.2f}')
            self._month_start = bal; self._reset_month = this_month

    def force_unlock(self) -> None:
        self._locked_until = 0.0
        self._day_start    = None
        log.info('[RGV7] RiskGuard force-unlocked')

    def block_reason(self, bal: float) -> Optional[str]:
        now = time.time()
        if now < self._locked_until:
            return f'Locked out — {(self._locked_until - now) / 60:.0f}m remaining'
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


def push_status(pairs_status: dict, balance: float, paper_mode: bool,
                url: str, riskguard_locked: bool = False) -> None:
    _kv_put('regime_bot_v7_status', {
        'pairs':                pairs_status,
        'balance':              round(balance, 2),
        'paper_mode':           paper_mode,
        'riskguard_locked':     riskguard_locked,
        'pushed_at':            time.time(),
        'version':              'v7',
        'mt5_positions':        _serialize_open_positions(),
        'today_closed_trades':  _serialize_closed_trades(),
    }, url)


# ── Main loop ──────────────────────────────────────────────────────────────────

def run(url: str, paper_mode: bool) -> None:
    log.info(f'RegimeV7 starting  paper={paper_mode}  dashboard={url}')

    load_credentials(url)
    # Unlike V2/V4, V7 needs raw MT5 bars (slope/atrSL) for its entry gate even
    # in paper mode — there is no REST fallback for that data. So we always try
    # to connect when MT5 is available; we only *force* paper mode if live
    # trading was requested and the connection attempt failed.
    if HAS_MT5:
        mt5_connected = mt5_connect()
        if not mt5_connected and not paper_mode:
            log.warning('MT5 connection failed — falling back to paper mode')
            paper_mode = True
    elif not paper_mode:
        log.warning('MetaTrader5 not installed — falling back to paper mode')
        paper_mode = True

    cfg = load_config(url)
    tg  = load_tg_config(url, cfg)

    log.info(
        f'Config: pairs={cfg["pairs"]}  hold={cfg["candle_hold"]}MTF  '
        f'entry_conf={cfg["entry_conf"]}%  score_min={cfg["entry_score_min"]}  '
        f'interval={cfg["interval_secs"]}s  htf_require={cfg["htf_require"]}'
    )

    # ── Per-pair state ───────────────────────────────────────────────────────
    debounce_ctr:     dict[str, int]   = {}   # consecutive new-bar passes of entry gate
    cooldown_ctr:      dict[str, int]   = {}   # post_exit_cooldown bars remaining
    range_count:       dict[str, int]   = {}   # consecutive non-trend bars (exit_regime_bars)
    bars_held:         dict[str, int]   = {}   # bars held (max_hold_bars)
    running_mfe:       dict[str, float] = {}   # peak favourable move, price units
    be_activated:      dict[str, bool]  = {}
    bocpd_hist:        dict[str, deque] = {}
    open_pos:          dict[str, dict]  = {}
    last_regimes:      dict[str, str]   = {}
    run_lengths:       dict[str, int]   = {}
    regime_start_t:    dict[str, float] = {}
    prev_regime_dur:   dict[str, float] = {}
    momentum_start_t:  dict[str, float] = {}
    momentum_regime:   dict[str, str]   = {}
    failed_entry_t:    dict[str, float] = {}

    risk_guard = RiskGuardV7()
    bocpd_reg  = BOCPRegistry(expected_run_length=cfg.get('bocpd_run_length', 150))
    macro      = MacroOverlay(fomc_window_hours=cfg.get('fomc_window_hours', 48.0))

    def _init_pair(pair: str) -> None:
        debounce_ctr[pair]     = 0
        cooldown_ctr[pair]     = 0
        range_count[pair]      = 0
        bars_held[pair]        = 0
        running_mfe[pair]      = 0.0
        be_activated[pair]     = False
        bocpd_hist[pair]       = deque(maxlen=5)
        last_regimes[pair]     = ''
        run_lengths[pair]      = 0
        regime_start_t[pair]   = time.time()
        prev_regime_dur[pair]  = 0.0
        momentum_start_t[pair] = time.time()
        momentum_regime[pair]  = ''

    for pair in cfg['pairs']:
        _init_pair(pair)

    last_heartbeat:  dict[str, float] = {p: 0.0 for p in cfg['pairs']}
    last_cfg_reload  = time.time()
    last_mtf_bucket: Optional[int]    = None
    cycle            = 0
    pairs_status:    dict[str, dict]  = {}
    _cycle_states:   list[dict]       = []
    _cycle_events:   list[dict]       = []

    # regime / confidence / reg_score are set fresh each pass through the
    # per-pair loop below; _close_trade is only ever invoked synchronously
    # within that same pass, so reading them here via closure is safe.
    regime, confidence, reg_score = '', 0.0, None

    def _close_trade(pair: str, pos: dict, code: str, detail: str, exit_price: float) -> None:
        reason = f'{code}: {detail}'
        if not close_position(pos['ticket'], pair, paper_mode, reason):
            log.error(f'[{pair}] close_position failed for {code} — will retry next poll')
            return

        direction = pos['direction']
        sign      = 1 if direction == 'LONG' else -1
        pip       = _PIP_SIZES.get(pair, 0.0001)
        sl_dist   = pos.get('orig_sl_dist') or 0.0
        pnl_pips  = round((exit_price - pos['entry_price']) * sign / pip, 1)
        pnl_r     = round((exit_price - pos['entry_price']) * sign / sl_dist, 3) if sl_dist > 0 else 0.0
        dur_secs  = time.time() - pos.get('opened_at', time.time())

        _cycle_events.append({'pair': pair, 'type': 'close', 'reason': reason, 'direction': direction})

        _append_audit_record(url, {
            'event':         'exit',
            'pair':          pair,
            'direction':     direction,
            'ts':            time.time(),
            'exit_code':     code,
            'exit_reason':   detail,
            'entry_price':   pos['entry_price'],
            'exit_price':    round(exit_price, 5),
            'sl':            round(pos.get('sl', 0.0), 5),
            'orig_sl_dist':  round(sl_dist, 5),
            'pnl_pips':      pnl_pips,
            'pnl_r':         pnl_r,
            'duration_secs': round(dur_secs, 0),
            'entry_regime':  pos.get('entry_regime'),
            'exit_regime':   regime,
            'entry_conf':    round(pos.get('entry_conf', 0), 1),
            'exit_conf':     round(confidence, 1),
            'entry_score':   round(pos.get('entry_score', 0), 1),
            'exit_score':    round(reg_score.total, 1) if reg_score else None,
            'paper_mode':    paper_mode,
            'cfg_hash':      pos.get('cfg_hash'),
            'cfg_snapshot':  pos.get('cfg_snapshot'),
        })

        msg = _v7_tag(exit_alert(
            pair=pair, direction=direction, exit_reason=reason,
            conf_at_exit=confidence, regime_at_exit=regime,
            pnl_pips=pnl_pips, duration_secs=dur_secs,
            paper_mode=paper_mode,
            entry_price=pos['entry_price'], close_price=exit_price,
            opened_at=pos.get('opened_at'),
        ))
        send_telegram(tg['token'], tg['chat_id'], msg)

        log.info(
            f'[{pair}] EXIT {direction}  {reason}  '
            f'pnl={pnl_pips:+.1f}p ({pnl_r:+.2f}R)  dur={dur_secs / 60:.0f}m'
        )

        open_pos.pop(pair, None)
        for d in (range_count, bars_held, running_mfe, be_activated, debounce_ctr):
            d.pop(pair, None)
        cooldown_ctr[pair] = int(cfg.get('post_exit_cooldown', 4))

        pairs_status[pair] = {
            'status': 'closed', 'reason': code,
            'pnl_pips': pnl_pips, 'pnl_r': pnl_r, 'regime': regime,
        }

    while True:
        cycle     += 1
        loop_start = time.time()
        pairs_status  = {}
        _cycle_states = []
        _cycle_events = []

        # Reload config every 5 min
        if time.time() - last_cfg_reload > 300:
            new_cfg = load_config(url)
            cfg.update(new_cfg)
            tg    = load_tg_config(url, cfg)
            macro = MacroOverlay(fomc_window_hours=cfg.get('fomc_window_hours', 48.0))
            last_cfg_reload = time.time()
            for pair in cfg['pairs']:
                if pair not in debounce_ctr:
                    _init_pair(pair)
                    last_heartbeat[pair] = 0.0

        if not cfg.get('enabled', True):
            time.sleep(cfg['interval_secs'])
            continue

        check_force_unlock(url, risk_guard)
        macro.refresh()

        now_t      = time.time()
        cur_bucket = int(now_t // MTF_SECS)
        new_bar    = last_mtf_bucket is not None and cur_bucket != last_mtf_bucket
        last_mtf_bucket = cur_bucket

        all_regimes = fetch_regimes(url)
        htf_regimes = fetch_htf_regimes(url)
        balance     = get_balance(paper_mode)
        risk_guard.sync_cfg(cfg)
        risk_guard.update_balance(balance)

        if not all_regimes:
            log.warning(f'Cycle {cycle}: no regime data — skipping')
            time.sleep(cfg['interval_secs'])
            continue

        # Adopt orphaned MT5 positions (e.g. after a bot restart)
        if HAS_MT5 and not paper_mode:
            try:
                sym_to_pair = {_mt5_sym(p): p for p in cfg['pairs']}
                for mt5p in (mt5.positions_get() or []):
                    if mt5p.magic != MAGIC:
                        continue
                    pk = sym_to_pair.get(mt5p.symbol)
                    if not pk or pk in open_pos:
                        continue
                    direction = 'LONG' if mt5p.type == 0 else 'SHORT'
                    log.warning(f'[{pk}] Adopting orphaned position ticket={mt5p.ticket} {direction}')
                    sl_dist = abs(float(mt5p.price_open) - float(mt5p.sl)) if mt5p.sl else 0.0
                    snap    = _config_snapshot(cfg)
                    open_pos[pk] = {
                        'ticket':       mt5p.ticket,
                        'direction':    direction,
                        'entry_price':  float(mt5p.price_open),
                        'sl':           float(mt5p.sl),
                        'orig_sl_dist': sl_dist,
                        'opened_at':    float(mt5p.time),
                        'entry_regime': all_regimes.get(pk, {}).get('regime', '').upper() or direction[:4],
                        'entry_conf':   float(all_regimes.get(pk, {}).get('confidence', 0)),
                        'entry_score':  0.0,
                        'cfg_snapshot': snap,
                        'cfg_hash':     _config_hash(snap),
                    }
                    range_count[pk]  = 0
                    bars_held[pk]    = 0
                    running_mfe[pk]  = 0.0
                    be_activated[pk] = False
            except Exception as exc:
                log.debug(f'Orphan scan failed: {exc}')

        for pair in cfg['pairs']:
            rd          = all_regimes.get(pair) or {}
            regime      = rd.get('regime', 'RANGE').upper()
            confidence  = float(rd.get('confidence', 0))
            vol_z       = float(rd.get('volZ', rd.get('vol_z', 0.0)))
            session_lbl = rd.get('sessionLabel', '')

            htf_rd     = htf_regimes.get(pair) or {}
            htf_regime = htf_rd.get('regime', '').upper() if htf_rd else None

            # BOCPD + trend
            bocpd_prob  = 0.0
            bocpd_trend = 0.0
            if cfg.get('use_bocpd', True):
                bocpd_prob = bocpd_reg.update(pair, confidence, regime)
            bocpd_hist[pair].append(bocpd_prob)
            if len(bocpd_hist[pair]) >= 3:
                bocpd_trend = _ols_slope(list(bocpd_hist[pair]))

            # Run length / regime-change telemetry + alert
            prev_regime = last_regimes.get(pair, '')
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
                        h1_regime=htf_regime, bocpd_prob=bocpd_prob,
                        macro=macro.snapshot(pair),
                    )
                    send_telegram(tg['token'], tg['chat_id'], _v7_tag(msg))
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
                entry_score_min=cfg.get('entry_score_min', 62.0),
            )

            log.info(
                f'[{pair}] reg={regime}  conf={confidence:.0f}%  vz={vol_z:+.2f}  '
                f'rl={run_length}  bocpd={bocpd_prob:.1f}%(Δ{bocpd_trend:+.1f})  '
                f'score={reg_score.total:.0f}'
                + (f'  htf={htf_regime}' if htf_regime else '')
                + (f'  held={bars_held.get(pair, 0)}' if pair in open_pos else '')
            )

            _cycle_states.append({
                'pair': pair, 'regime': regime, 'conf': round(confidence, 1),
                'vz': round(vol_z, 3), 'rl': run_length,
                'bocpd': round(bocpd_prob, 1), 'bocpd_trend': round(bocpd_trend, 2),
                'score': round(reg_score.total, 1), 'htf': htf_regime or '',
            })

            # ──────────────────────────────────────────────────────────────────
            # OPEN POSITION MANAGEMENT
            # ──────────────────────────────────────────────────────────────────
            if pair in open_pos:
                pos       = open_pos[pair]
                direction = pos['direction']
                sign      = 1 if direction == 'LONG' else -1
                price_now = get_price(pair, url) or pos['entry_price']
                pip       = _PIP_SIZES.get(pair, 0.0001)
                sl_dist   = pos.get('orig_sl_dist') or abs(pos['entry_price'] - pos.get('sl', pos['entry_price']))

                # ── SL check — price-based so it works in paper mode too;
                #    the MT5 ticket-gone check is a backstop for live mode
                #    (broker-side margin call, manual close, etc). ──────────
                sl_hit = (direction == 'LONG'  and price_now <= pos['sl']) or \
                         (direction == 'SHORT' and price_now >= pos['sl'])
                if not sl_hit and HAS_MT5 and not paper_mode:
                    mt5_sym    = _mt5_sym(pair)
                    still_open = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                                  if p.ticket == pos['ticket']]
                    if not still_open:
                        sl_hit = True
                if sl_hit:
                    _close_trade(pair, pos, 'SL_HIT', 'Stop-loss hit', price_now)
                    continue

                # ── MFE update (every poll, live price) ─────────────────────
                fav = (price_now - pos['entry_price']) * sign
                if fav > running_mfe.get(pair, 0.0):
                    running_mfe[pair] = fav
                mfe_dist = running_mfe.get(pair, 0.0)
                mfe_r    = mfe_dist / sl_dist if sl_dist > 0 else 0.0

                # ── Breakeven at 1.0R (hardcoded, matches simulateV7) ────────
                if mfe_r >= 1.0:
                    moves_to_be = (direction == 'LONG'  and pos['sl'] < pos['entry_price']) or \
                                  (direction == 'SHORT' and pos['sl'] > pos['entry_price'])
                    if moves_to_be and modify_sl(pos['ticket'], pair, pos['entry_price'], paper_mode):
                        pos['sl']          = pos['entry_price']
                        be_activated[pair] = True
                        log.info(f'[{pair}] SL -> breakeven {pos["entry_price"]:.5f} (MFE {mfe_r:.2f}R)')

                close_reason: Optional[str] = None
                exit_code:    str           = ''

                # 1. REGIME_FLIP — immediate, no debounce
                if (direction == 'LONG' and regime == 'BEAR') or (direction == 'SHORT' and regime == 'BULL'):
                    exit_code, close_reason = 'REGIME_FLIP', f'Regime flipped to {regime}'

                # 2. CONF_FLOOR
                if not close_reason and confidence < cfg.get('conf_floor', 45.0):
                    exit_code, close_reason = 'CONF_FLOOR', f'Confidence {confidence:.1f}% < {cfg["conf_floor"]:.0f}%'

                # 3. MFE_RETRACE
                if not close_reason and mfe_r >= cfg.get('mfe_min_r', 1.5) and mfe_dist > 0:
                    peak_price   = pos['entry_price'] + mfe_dist if direction == 'LONG' else pos['entry_price'] - mfe_dist
                    retrace_dist = (peak_price - price_now) if direction == 'LONG' else (price_now - peak_price)
                    if retrace_dist / mfe_dist >= cfg.get('mfe_retrace_pct', 0.25):
                        exit_code, close_reason = (
                            'MFE_RETRACE',
                            f'Retraced {retrace_dist / mfe_dist * 100:.0f}% of {mfe_r:.2f}R peak',
                        )

                # 4/5. Bar-gated checks — only advance once per new M30 bar
                if not close_reason and new_bar:
                    is_trend = (direction == 'LONG' and regime == 'BULL') or \
                               (direction == 'SHORT' and regime == 'BEAR')
                    if is_trend:
                        range_count[pair] = 0
                    else:
                        range_count[pair] = range_count.get(pair, 0) + 1
                        if range_count[pair] >= cfg.get('exit_regime_bars', 3):
                            exit_code, close_reason = (
                                'REGIME_RANGE', f'{range_count[pair]} non-trend M30 bars',
                            )
                    if not close_reason:
                        bars_held[pair] = bars_held.get(pair, 0) + 1
                        if bars_held[pair] >= cfg.get('max_hold_bars', 24):
                            exit_code, close_reason = ('MAX_HOLD', f'{bars_held[pair]} M30 bars held')

                if close_reason:
                    _close_trade(pair, pos, exit_code, close_reason, price_now)
                    continue

                # ── Position still open — status + heartbeat ────────────────
                dur_secs = now_t - pos.get('opened_at', now_t)
                pnl_pips = round((price_now - pos['entry_price']) * sign / pip, 1)
                pairs_status[pair] = {
                    'status':      'open',
                    'direction':   direction,
                    'entry':       pos['entry_price'],
                    'sl':          pos.get('sl'),
                    'ticket':      pos['ticket'],
                    'pnl_pips':    pnl_pips,
                    'mfe_r':       round(mfe_r, 2),
                    'be_active':   be_activated.get(pair, False),
                    'range_count': range_count.get(pair, 0),
                    'bars_held':   bars_held.get(pair, 0),
                    'regime':      regime,
                    'conf':        round(confidence, 1),
                    'score':       round(reg_score.total, 1),
                    'htf_regime':  htf_regime,
                    'session':     session_lbl,
                    'dur_secs':    round(dur_secs, 0),
                    'mfe_pips':    round(mfe_dist / pip, 1),
                    'cfg_hash':    pos.get('cfg_hash'),
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
                        slope=0.0, vol_z=vol_z,
                        regime_secs=regime_secs, momentum_secs=momentum_secs,
                        change_prob=bocpd_prob, open_pos=pos_info,
                        h1_regime=htf_regime, bocpd_prob=bocpd_prob,
                        exhaustion_score=0.0,
                        consensus=p_cnt, consensus_total=p_tot + 1,
                        macro=macro.snapshot(pair), session_label=session_lbl,
                        reg_score=reg_score.to_dict(),
                    )
                    state_note = (
                        f'\n  MFE      : {mfe_dist / pip:.1f}p ({mfe_r:.2f}R)'
                        f'\n  RangeCtr : {range_count.get(pair, 0)}/{cfg.get("exit_regime_bars", 3)}'
                        f'\n  BarsHeld : {bars_held.get(pair, 0)}/{cfg.get("max_hold_bars", 24)}'
                        + ('\n  BE       : active' if be_activated.get(pair) else '')
                    )
                    send_telegram(tg['token'], tg['chat_id'], _v7_tag(msg + state_note))
                    last_heartbeat[pair] = now_t

                continue  # position managed — skip entry logic

            # ──────────────────────────────────────────────────────────────────
            # ENTRY LOGIC (gate cascade re-evaluated once per new M30 bar)
            # ──────────────────────────────────────────────────────────────────
            if cooldown_ctr.get(pair, 0) > 0:
                if new_bar:
                    cooldown_ctr[pair] -= 1
                pairs_status[pair] = {
                    'status': 'cooldown', 'bars_left': cooldown_ctr.get(pair, 0), 'regime': regime,
                }
                continue

            if not within_window_v7(cfg):
                debounce_ctr[pair] = 0
                pairs_status[pair] = {'status': 'window', 'regime': regime}
                continue

            block = risk_guard.block_reason(balance)
            if block:
                if cycle % 10 == 0:
                    log.info(f'[{pair}] RiskGuard: {block}')
                pairs_status[pair] = {'status': 'blocked', 'reason': block, 'regime': regime}
                continue

            fail_cd = cfg.get('entry_fail_cooldown_secs', 300)
            if time.time() - failed_entry_t.get(pair, 0) < fail_cd:
                remaining = int(fail_cd - (time.time() - failed_entry_t[pair]))
                pairs_status[pair] = {'status': f'order_fail_cd ({remaining}s)', 'regime': regime}
                continue

            if not new_bar:
                # Gate cascade (and the MT5 bar fetch it needs) only re-runs
                # once per new M30 bar — between bars we just report state.
                pairs_status[pair] = {
                    'status': 'watching', 'regime': regime, 'debounce': debounce_ctr.get(pair, 0),
                    'conf': round(confidence, 1), 'score': round(reg_score.total, 1),
                }
                continue

            is_dir   = regime in TRADEABLE
            ok_conf  = eff_conf >= cfg.get('entry_conf', 70.0)
            ok_score = reg_score.entry_allowed

            feats  = compute_m30_features(pair)
            slope  = feats['slope']  if feats else 0.0
            atr_sl = feats['atrSL'] if feats else 0.0
            ok_slope = (regime == 'BULL' and slope > 0) or (regime == 'BEAR' and slope < 0)

            # HTF confirmation — fails OPEN (defaults true) if data is missing,
            # exactly matching simulateV7's `let okHTF = true` default.
            ok_htf = True
            if cfg.get('htf_require', False) and htf_rd:
                ok_htf = (htf_regime == regime)

            if is_dir and ok_conf and ok_score and ok_slope and ok_htf:
                debounce_ctr[pair] = debounce_ctr.get(pair, 0) + 1
            else:
                debounce_ctr[pair] = 0

            hold = cfg.get('candle_hold', 2)
            if debounce_ctr[pair] < hold or atr_sl <= 0:
                pairs_status[pair] = {
                    'status': 'hold_pending' if (is_dir and ok_conf and ok_score and ok_slope and ok_htf) else 'gated',
                    'regime': regime, 'debounce': debounce_ctr[pair],
                    'conf': round(confidence, 1), 'score': round(reg_score.total, 1),
                }
                continue

            # ── ENTRY ─────────────────────────────────────────────────────────
            direction = 'LONG' if regime == 'BULL' else 'SHORT'
            price     = get_price(pair, url)
            if price is None:
                log.warning(f'[{pair}] No price — skip entry')
                continue

            sl_dist = atr_sl * cfg.get('sl_atr_mult', 2.0)
            sl      = (price - sl_dist) if direction == 'LONG' else (price + sl_dist)
            size    = position_size(balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot'])

            ticket = open_position(pair, direction, sl, size, cfg['max_spread_pips'], paper_mode)

            if ticket is not None:
                snap     = _config_snapshot(cfg)
                cfg_hash = _config_hash(snap)
                open_pos[pair] = {
                    'ticket':       ticket,
                    'direction':    direction,
                    'entry_price':  price,
                    'sl':           sl,
                    'orig_sl_dist': sl_dist,
                    'opened_at':    time.time(),
                    'entry_regime': regime,
                    'entry_conf':   confidence,
                    'entry_score':  reg_score.total,
                    'cfg_snapshot': snap,
                    'cfg_hash':     cfg_hash,
                }
                range_count[pair]  = 0
                bars_held[pair]    = 0
                running_mfe[pair]  = 0.0
                be_activated[pair] = False
                debounce_ctr[pair] = 0

                _cycle_events.append({
                    'pair': pair, 'type': 'entry',
                    'direction': direction, 'lots': size, 'sl': round(sl, 5),
                })

                _append_audit_record(url, {
                    'event':        'entry',
                    'pair':         pair,
                    'direction':    direction,
                    'ts':           time.time(),
                    'price':        price,
                    'sl':           round(sl, 5),
                    'orig_sl_dist': round(sl_dist, 5),
                    'lots':         size,
                    'regime':       regime,
                    'confidence':   round(confidence, 1),
                    'score':        round(reg_score.total, 1),
                    'slope':        round(slope, 3),
                    'atr_sl':       round(atr_sl, 5),
                    'paper_mode':   paper_mode,
                    'cfg_hash':     cfg_hash,
                    'cfg_snapshot': snap,
                })

                msg = _v7_tag(entry_alert(
                    pair=pair, direction=direction, regime=regime,
                    confidence=confidence, price=price, sl=sl,
                    lots=size, paper_mode=paper_mode,
                    consensus=peer_cnt, consensus_total=peer_tot + 1,
                    h1_regime=htf_regime, vol_z=vol_z,
                    reg_score=reg_score.to_dict(),
                ))
                send_telegram(tg['token'], tg['chat_id'], msg)

                log.info(
                    f'[{pair}] ENTRY {direction}  conf={confidence:.0f}%  score={reg_score.total:.0f}  '
                    f'slope={slope:+.2f}  atrSL={atr_sl:.5f}  lots={size}  SL={sl:.5f}  cfg={cfg_hash}'
                )
                pairs_status[pair] = {
                    'status': 'opened', 'direction': direction, 'entry': price,
                    'sl': sl, 'regime': regime, 'conf': round(confidence, 1),
                    'reg_score': reg_score.to_dict(),
                }
            else:
                failed_entry_t[pair] = time.time()
                debounce_ctr[pair]   = 0
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
                f'Cycle {cycle}  balance={balance:.2f}  open={list(open_pos.keys())}  '
                f'macro={macro.label()}  new_bar={new_bar}  sleep={sleep_t:.1f}s'
            )
        time.sleep(sleep_t)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='RegimeV7 bot')
    parser.add_argument('--dashboard-url', default='http://localhost:3000',
                        help='Base URL of the MacroFX Railway server')
    parser.add_argument('--live', action='store_true',
                        help='Disable paper mode — places real MT5 orders')
    args = parser.parse_args()

    paper = not args.live
    if paper:
        log.info('PAPER MODE — no real orders will be placed')

    run(args.dashboard_url, paper)


if __name__ == '__main__':
    main()
