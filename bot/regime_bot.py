"""
Regime Bot — HMM V2 regime-following strategy.

Entry logic:
  BULL  → enter LONG    when regime holds for N consecutive polls at >= min_confidence%
  BEAR  → enter SHORT   (same gate)
  RANGE / CHOP → no trade, stay flat

Exit logic:
  Regime shifts away from the entry regime → close immediately.
  Outside trade window → close immediately.
  SL / TP hit in MT5 → position already gone, state is cleaned up next cycle.

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
    'tp_rr':               2.0,      # TP = SL distance × this R:R
    'risk_pct':            1.0,      # % of balance risked per trade
    'max_lot':             5.0,
    'max_spread_pips':     3.0,
    'trade_window_start':  '07:00',
    'trade_window_end':    '20:00',
    'ddlimit':             3.0,      # daily DD % before lockout
    'monthlydd':           5.0,      # monthly DD % before lockout
    'lockout':             3,        # lockout duration (hours)
    'cooldown':            240,      # seconds between trades on same pair
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
        requests.post(f'{base_url}/api/kv/put', json={'key': key, 'data': data}, timeout=10)
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
    log.info('Regime bot credentials loaded from KV')


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
    """Returns full /api/hmm5m-v2 payload: { 'EUR/USD': {regime, confidence, ...} }"""
    try:
        r = requests.get(f'{base_url}/api/hmm5m-v2', timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as exc:
        log.warning(f'fetch_regimes failed: {exc}')
    return {}


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
                  sl_dist: float, pair: str, max_lot: float) -> float:
    pip = _PIP_SIZES.get(pair, 0.0001)
    pv  = _PIP_VALUES.get(pair, 10.0)
    sl_pips  = sl_dist / pip
    risk_amt = balance * (risk_pct / 100)
    if sl_pips <= 0 or pv <= 0:
        return 0.01
    return max(0.01, min(round(risk_amt / (sl_pips * pv), 2), max_lot))


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

    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       mt5_sym,
        'volume':       size,
        'type':         order_type,
        'price':        exec_price,
        'sl':           round(sl, 5),
        'tp':           round(tp, 5),
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'RegimeBot {direction[0]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(mt5_sym),
    })

    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'MT5 order placed: ticket={res.order}  exec_price={exec_price}')
        return res.order

    log.error(
        f'MT5 order failed: retcode={getattr(res, "retcode", "?")} '
        f'{getattr(res, "comment", "")}'
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
        'volume':       pos.volume,
        'type':         close_type,
        'position':     ticket,
        'price':        close_price,
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'RegimeBot close: {reason[:30]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': _filling_mode(mt5_sym),
    })

    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'Position {ticket} closed at {close_price}')
        return True

    log.error(
        f'Close failed: retcode={getattr(res, "retcode", "?")} '
        f'{getattr(res, "comment", "")}'
    )
    return False


# ── Regime debounce ────────────────────────────────────────────────────────────

TRADEABLE = {'BULL', 'BEAR'}


class RegimeDebounce:
    """
    Requires N consecutive regime readings at >= min_confidence% before confirming.
    Either condition (candle_hold OR confidence) can be loosened via config.
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
            return None  # regime changed mid-window — reset implicitly

        if any(c < self.min_conf for _, c in self._hist):
            return None  # not confident enough across all readings

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


# ── Status push ────────────────────────────────────────────────────────────────

def push_status(data: dict, base_url: str) -> None:
    data['pushed_at'] = time.time()
    _kv_put('regime_bot_status', data, base_url)


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
        f'TP={cfg["tp_rr"]}R  interval={cfg["interval_secs"]}s'
    )

    risk_guard = RiskGuard()

    # Per-pair runtime state
    debounce:     dict[str, RegimeDebounce] = {}
    open_pos:     dict[str, dict]           = {}   # pair → {ticket, direction, entry_price, sl, tp}
    entry_regime: dict[str, str]            = {}   # pair → regime string at time of entry

    for pair in cfg['pairs']:
        debounce[pair] = RegimeDebounce(cfg['candle_hold'], cfg['min_confidence'])

    cycle = 0

    while True:
        cycle += 1
        cfg = load_config(base_url)  # re-read every cycle — live changes take effect immediately

        if not cfg.get('enabled', True):
            log.info('Bot disabled via config — sleeping')
            push_status({'enabled': False, 'paper_mode': paper_mode, 'cycle': cycle, 'positions': {}}, base_url)
            time.sleep(max(cfg.get('interval_secs', 60), 30))
            continue

        # Sync debounce gates in case config changed
        for pair in cfg['pairs']:
            if pair not in debounce:
                debounce[pair] = RegimeDebounce(cfg['candle_hold'], cfg['min_confidence'])
            else:
                debounce[pair].hold     = cfg['candle_hold']
                debounce[pair].min_conf = cfg['min_confidence']

        balance = get_balance(paper_mode)
        risk_guard.sync_cfg(cfg)
        risk_guard.update_balance(balance)

        all_regimes = fetch_regimes(base_url)

        status_positions: dict[str, dict] = {}

        for pair in cfg['pairs']:
            rd         = all_regimes.get(pair) or {}
            regime     = rd.get('regime', 'RANGE')
            confidence = float(rd.get('confidence', 0))

            log.info(f'[{pair}] regime={regime}  conf={confidence:.0f}%')

            # ── Manage existing open position ─────────────────────────────────
            if pair in open_pos:
                pos      = open_pos[pair]
                entry_r  = entry_regime.get(pair, '')

                # Check whether MT5 already closed it (SL or TP hit)
                if not paper_mode and HAS_MT5:
                    mt5_sym  = pair.replace('/', '')
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

                # Exit when regime shifts away from entry regime
                should_close  = False
                close_reason  = ''
                if entry_r == 'BULL' and regime != 'BULL':
                    should_close = True
                    close_reason = f'regime {entry_r}→{regime}'
                elif entry_r == 'BEAR' and regime != 'BEAR':
                    should_close = True
                    close_reason = f'regime {entry_r}→{regime}'

                if not within_window(cfg):
                    should_close = True
                    close_reason = 'outside trade window'

                if should_close:
                    ok = close_position(pos['ticket'], pair, paper_mode, close_reason)
                    if ok:
                        del open_pos[pair]
                        entry_regime.pop(pair, None)
                        debounce[pair].clear()
                        risk_guard.record_trade(pair)
                    status_positions[pair] = {
                        'status': 'closed', 'reason': close_reason,
                        'direction': pos['direction'],
                    }
                else:
                    # Position holding — report current state
                    price_now = get_price(pair, base_url) or pos['entry_price']
                    pip       = _PIP_SIZES.get(pair, 0.0001)
                    sign      = 1 if pos['direction'] == 'LONG' else -1
                    pnl_pips  = round((price_now - pos['entry_price']) * sign / pip, 1)
                    status_positions[pair] = {
                        'status':    'open',
                        'direction': pos['direction'],
                        'entry':     pos['entry_price'],
                        'sl':        pos['sl'],
                        'tp':        pos['tp'],
                        'ticket':    pos['ticket'],
                        'regime':    regime,
                        'conf':      round(confidence, 1),
                        'pnl_pips':  pnl_pips,
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

            confirmed = debounce[pair].push(regime, confidence)

            log.info(
                f'[{pair}] debounce {debounce[pair].readings_count()}/{debounce[pair].hold}'
                f'  confirmed={confirmed}'
            )

            if confirmed not in TRADEABLE:
                status_positions[pair] = {
                    'status':    'watching',
                    'regime':    regime,
                    'conf':      round(confidence, 1),
                    'confirmed': confirmed or 'pending',
                    'readings':  f'{debounce[pair].readings_count()}/{debounce[pair].hold}',
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
            tp = (price + sl_dist * cfg['tp_rr']) if direction == 'LONG' else (price - sl_dist * cfg['tp_rr'])

            size = position_size(
                balance, cfg['risk_pct'], sl_dist, pair, cfg['max_lot']
            )

            ticket = open_position(
                pair, direction, sl, tp, size,
                cfg['max_spread_pips'], paper_mode,
            )

            if ticket is not None:
                open_pos[pair] = {
                    'ticket':      ticket,
                    'direction':   direction,
                    'entry_price': price,
                    'sl':          sl,
                    'tp':          tp,
                }
                entry_regime[pair] = confirmed
                risk_guard.record_trade(pair)
                log.info(
                    f'[{pair}] ENTERED {direction}  regime={confirmed}'
                    f'  price={price}  SL={sl:.5f}  TP={tp:.5f}'
                    f'  ATR={atr}  lot={size}'
                )
                status_positions[pair] = {
                    'status':    'opened',
                    'direction': direction,
                    'entry':     price,
                    'sl':        sl,
                    'tp':        tp,
                    'regime':    confirmed,
                    'conf':      round(confidence, 1),
                }
            else:
                status_positions[pair] = {
                    'status': 'entry_failed', 'regime': regime,
                    'direction': direction,
                }

        # ── Push status to KV ─────────────────────────────────────────────────
        push_status({
            'enabled':    cfg.get('enabled', True),
            'paper_mode': paper_mode,
            'cycle':      cycle,
            'balance':    round(balance, 2),
            'pairs':      cfg['pairs'],
            'positions':  status_positions,
        }, base_url)

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
