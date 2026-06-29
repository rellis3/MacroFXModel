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

# Repo root on path so we can import the shared Python baseplate (pylego/) —
# bots run from their own dir, so the root isn't on sys.path by default.
import sys as _sys
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in _sys.path:
    _sys.path.insert(0, _REPO_ROOT)
from pylego.instruments import pip_sizes_for          # shared pip-size table
from pylego.point_values import point_values_for      # shared pip-value table
from pylego.sizing import position_size as _position_size_lots
from pylego.risk_guard import RiskGuard                # shared DD/cooldown guard
from pylego.broker import Mt5Broker                    # shared MT5 execution brick

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Magic number (unique — never collide with main bot's 20260001) ─────────────

MAGIC = 20260002

# ── Pip tables ──────────────────────────────────────────────────────────────────
# Sourced from the shared pylego baseplate instead of inline literals: pip SIZE
# from the JS-generated instrument registry (pylego/instruments), pip VALUE from
# the Python-owned point-value table (pylego/point_values). Values are identical
# to the former inline dicts (golden-tested in pylego/instruments_test.py).
_PAIR_KEYS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY',
    'AUD/USD', 'NZD/USD', 'USD/CAD',
    'USD/CHF', 'GBP/JPY', 'EUR/GBP',
    'EUR/JPY', 'EUR/CHF', 'GBP/CHF',
    'AUD/JPY', 'CAD/JPY',
    'XAU/USD', 'NAS100_USD', 'USTECH100M',
    'SPX500_USD', 'DE30_USD', 'UK100_GBP',
    'US30_USD', 'US2000_USD',
]
_PIP_SIZES = pip_sizes_for(_PAIR_KEYS)
_PIP_VALUES = point_values_for(_PAIR_KEYS, default=10.0)

# ── Broker symbol aliases (pair name → actual MT5 symbol) ─────────────────────
# Some demo brokers use different symbol names. Map the canonical pair name used
# in config and API to the real MT5 symbol so all positions_get / order_send
# calls use the correct name.
_MT5_SYMBOL: dict[str, str] = {
    'NAS100_USD':  'USTECH100M',
    'US2000_USD':  'US2000',
    'SPX500_USD':  'SP500',
    'DE30_USD':    'DAX',
    'UK100_GBP':   'FTSE100',
    'US30_USD':    'US30',
}

def _mt5_sym(pair: str) -> str:
    return _MT5_SYMBOL.get(pair, pair.replace('/', ''))

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
    'entry_fail_cooldown_secs': 300,  # cooldown after a failed MT5 order (prevents re-entry spam)
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

# Shared MT5 execution brick (pylego/broker). Connect / price / ATR / balance /
# serialize / enter / stop all live here now; this bot injects its magic, broker
# symbol map (_mt5_sym) and pip table. The module-level functions below are thin
# delegations kept for call-site compatibility — behaviour is unchanged.
_broker = Mt5Broker(
    magic=MAGIC,
    symbol_resolver=_mt5_sym,
    pip_resolver=lambda p: _PIP_SIZES.get(p, 0.0001),
    log=log,
)


def mt5_connect() -> bool:
    return _broker.connect(
        os.environ.get('MT5_ACCOUNT', ''),
        os.environ.get('MT5_PASSWORD', ''),
        os.environ.get('MT5_SERVER', ''),
        os.environ.get('MT5_PATH') or None,
    )


# ── Price & bar helpers ────────────────────────────────────────────────────────

def get_price(pair: str, base_url: str) -> float | None:
    """MT5 tick first (sub-ms, via the broker brick), then dashboard API fallback."""
    p = _broker.price(pair)
    if p is not None:
        return p
    try:
        r = requests.get(f'{base_url}/api/quote?symbol={pair}', timeout=5)
        return r.json().get('price')
    except Exception:
        return None


def get_atr(pair: str, tf: str = '5m') -> float | None:
    """EMA-ATR from MT5 bars, alpha=0.15 (matches dashboard vol.js)."""
    return _broker.atr(pair, tf)


def get_balance(paper_mode: bool) -> float:
    if not paper_mode:
        bal = _broker.account_balance()
        if bal is not None:
            return bal
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

# RiskGuard now lives in the shared baseplate (pylego/risk_guard.py) — imported
# at the top of this file. It is byte-identical to the former inline class.


# ── Position sizing ────────────────────────────────────────────────────────────

def position_size(balance: float, risk_pct: float,
                  sl_dist: float, pair: str, max_lot: float,
                  decay_score: float = 0.0) -> float:
    # Resolve pip/pip-value from the shared tables, delegate the math to the
    # shared sizing primitive (pylego/sizing.py). Keeps this bot's pair-keyed
    # signature; behaviour is identical to the former inline formula.
    pip = _PIP_SIZES.get(pair, 0.0001)
    pv  = _PIP_VALUES.get(pair, 10.0)
    return _position_size_lots(
        balance, risk_pct, sl_dist, pip=pip, pip_value=pv,
        max_lot=max_lot, decay_score=decay_score,
    )


# ── MT5 execution ─────────────────────────────────────────────────────────────
# Order entry/exit now live in the shared broker brick (pylego/broker/mt5.py).
# These wrappers preserve this bot's signatures and its exact order comments
# ('RegimeBot X' / 'RgCls <reason>').

def open_position(pair: str, direction: str, sl: float, tp: float,
                  size: float, max_spread_pips: float,
                  paper_mode: bool) -> int | None:
    """Returns ticket int on success, -1 for paper, None on failure."""
    return _broker.enter(
        pair, direction, sl, tp, size, max_spread_pips, paper_mode,
        comment=f'RegimeBot {direction[0]}',
    )


def close_position(ticket: int, pair: str, paper_mode: bool, reason: str = '') -> bool:
    return _broker.stop(ticket, pair, paper_mode, reason, comment_prefix='RgCls')


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
# Delegated to the shared broker brick — these feed the dashboard positions tab
# (PYTHON_LEGO.md §7); the brick emits the identical magic-filtered field set.

def _serialize_open_positions(magic: int) -> list:
    return _broker.serialize_open_positions()


def _serialize_closed_trades(magic: int) -> list:
    """Return today's closed positions from MT5 deal history for this bot."""
    return _broker.serialize_closed_trades()


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

    risk_guard = RiskGuard(log=log)

    # Per-pair runtime state
    debounce:      dict[str, RegimeDebounce] = {}
    decay_dets:    dict[str, DecayDetector]  = {}
    run_lengths:   dict[str, int]            = {}   # consecutive polls in same regime
    last_regimes:  dict[str, str]            = {}   # last seen regime per pair
    flip_counts:   dict[str, int]            = {}   # consecutive bars NOT in entry regime (for RANGE debounce)
    open_pos:      dict[str, dict]           = {}   # pair → {ticket, direction, entry_price, sl}
    entry_regime:  dict[str, str]            = {}   # pair → regime string at time of entry
    failed_entry_t: dict[str, float]         = {}   # pair → timestamp of last failed MT5 order

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
                    mt5_sym    = _mt5_sym(pair)
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
            fail_cd = cfg.get('entry_fail_cooldown_secs', 300)
            if time.time() - failed_entry_t.get(pair, 0) < fail_cd:
                remaining = int(fail_cd - (time.time() - failed_entry_t[pair]))
                log.info(f'[{pair}] Order-fail cooldown — {remaining}s remaining')
                status_positions[pair] = {'status': 'order_fail_cooldown', 'regime': regime}
                continue

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
                failed_entry_t[pair] = time.time()
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
            'mt5_positions':        _serialize_open_positions(MAGIC),
            'today_closed_trades': _serialize_closed_trades(MAGIC),
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
