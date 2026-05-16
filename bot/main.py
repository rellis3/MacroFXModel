"""
MacroFX Trading Bot  —  two-speed orchestrator

State refresh  (default 120s): re-reads dashboard KV — config, entries, regime,
               COT, OI. Dashboard data changes slowly; no need to hit the API
               every few seconds.

Price tick     (default 3s): fetches live price for each pair and checks it
               against the already-loaded entry levels. On MT5 this is a local
               memory call (microseconds). Full module evaluation only runs when
               price actually enters proximity of a level — otherwise the tight
               loop is just cheap math.

Usage:
  python main.py                             # paper, 3s tick, 120s refresh
  python main.py --live                      # send real orders to MT5
  python main.py --price-interval 5          # slower tick
  python main.py --state-interval 60         # faster state refresh
  python main.py --once                      # single state + price cycle then exit

Environment variables (copy bot/.env.example → bot/.env):
  MT5_ACCOUNT    integer account number
  MT5_PASSWORD   account password
  MT5_SERVER     broker server e.g. ICMarkets-Demo01
  MT5_PATH       optional full path to terminal64.exe
  DASHBOARD_URL  override dashboard base URL
"""

import argparse
import logging
import math
import os
import time
from datetime import datetime, timezone, date as date_type

from utils.state_reader import fetch_state, fetch_quote, check_staleness, push_bot_status, trigger_refresh, StaleDataError
from utils.sl_tp_engine import SLTPEngine
from utils.indicators import compute_atr, compute_wt1, atr_to_tol_pips
from utils.config_helpers import resolve_min_stars, session_threshold_mult
from utils.persistence import load_bot_state, save_bot_state
from position_manager import manage_positions, MAGIC
from modules.vol_gate import VolGateModule
from modules.macro_regime import MacroRegimeModule
from modules.confluence import ConfluenceModule
from modules.oi_walls import OIWallsModule
from modules.cot_filter import COTFilterModule
from modules.news_risk import NewsRiskModule

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('bot.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)

# ── Module registry ────────────────────────────────────────────────────────────

MODULE_ORDER = ['vol_gate', 'macro_regime', 'confluence', 'oi_walls', 'cot_filter', 'news_risk']

MODULE_REGISTRY = {
    'vol_gate':     VolGateModule,
    'macro_regime': MacroRegimeModule,
    'confluence':   ConfluenceModule,
    'oi_walls':     OIWallsModule,
    'cot_filter':   COTFilterModule,
    'news_risk':    NewsRiskModule,
}

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}

# resolve_min_stars and session_threshold_mult live in utils/config_helpers.py


# ── Live price (fast path) ────────────────────────────────────────────────────

def fetch_current_price(pair: str, base_url: str) -> float | None:
    """
    Priority 1 — MT5 tick: local memory call, sub-millisecond, no network.
    Priority 2 — Dashboard /api/quote: ~100ms network round-trip, used in
                 paper mode or when MT5 isn't available.
    """
    if HAS_MT5:
        try:
            tick = mt5.symbol_info_tick(pair.replace('/', ''))
            if tick and tick.bid > 0:
                return round((tick.bid + tick.ask) / 2, 6)
        except Exception:
            pass
    return fetch_quote(pair, base_url)


def fetch_bars(pair: str, count: int = 30, timeframe=None):
    """
    Fetches recent bars from MT5 (local memory, no network).
    Defaults to TIMEFRAME_M5. Pass timeframe=mt5.TIMEFRAME_H1 etc. for MTF.
    Returns the numpy structured array or None if MT5 unavailable.
    """
    if not HAS_MT5:
        return None
    try:
        tf   = timeframe if timeframe is not None else mt5.TIMEFRAME_M5
        bars = mt5.copy_rates_from_pos(pair.replace('/', ''), tf, 0, count)
        if bars is not None and len(bars) >= 2:
            return bars
    except Exception:
        pass
    return None


# ── Pre-screen: dynamic ATR tolerance + WT1 direction filter ─────────────────

def _prox_pips(pair: str, exec_cfg: dict) -> float:
    cfg = exec_cfg.get('prox_pips', 8)
    if isinstance(cfg, dict):
        return cfg.get(pair) or cfg.get('default', 8)
    return cfg


def pre_screen(state: dict, pair: str, config: dict, live_price: float) -> tuple[int, float, float]:
    """
    Two-condition pre-screen, runs every price tick (cheap — just math + local MT5 calls).

    Condition 1  (+1): any qualifying entry is within the dynamic ATR tolerance.
                       ATR is fetched from MT5 5m bars; falls back to config prox_pips
                       if bars are unavailable (paper mode).

    Condition 2  (+1): WT1 momentum direction aligns with the qualifying entry direction.
                       Skipped (auto-pass) when bars are unavailable so paper mode still works.

    Returns (score 0-2, tol_pips used, wt1 value).
    Full module evaluation only runs when score == 2.
    """
    snap      = state.get('regime_snapshot') or {}
    pair_data = (snap.get('pairs') or {}).get(pair) or {}
    entries   = pair_data.get('entries') or []
    exec_cfg  = config.get('execution') or {}
    min_stars = resolve_min_stars(exec_cfg)
    bardir    = (exec_cfg.get('bardir') or 'auto').lower()
    wt_thresh = exec_cfg.get('wtthreshold', 35)
    pip_size  = _PIP_SIZES.get(pair, 0.0001)

    # Dynamic ATR tolerance from MT5 5m bars; falls back to config when unavailable
    bars_5m = fetch_bars(pair, count=30)
    if bars_5m is not None:
        atr      = compute_atr(bars_5m)
        tol_pips = atr_to_tol_pips(atr, pip_size)
    else:
        tol_pips = _prox_pips(pair, exec_cfg)

    # Publish tol_pips so confluence module uses the same ATR-derived value
    if '_tol_pips' not in state:
        state['_tol_pips'] = {}
    state['_tol_pips'][pair] = tol_pips

    tol_dist = tol_pips * pip_size

    # Condition 1: any qualifying entry within ATR tolerance
    near_entries = [
        e for e in entries
        if (e.get('totalStars') or 0) >= min_stars
        and abs((e.get('price') or 0) - live_price) <= tol_dist
    ]

    if not near_entries:
        return 0, tol_pips, float('nan')

    score = 1

    # Condition 2: WT1 direction aligns with near entries
    # Multi-timeframe: 5m + 1H must both agree when bardir='on'
    # bardir='off'  → skip entirely
    # bardir='auto' → only filter when abs(WT1_5m) >= wt_thresh
    # bardir='on'   → always filter; require 5m + 1H agreement
    wt1_5m = compute_wt1(bars_5m) if bars_5m is not None else float('nan')
    bars_1h = fetch_bars(pair, count=50, timeframe=mt5.TIMEFRAME_H1) if HAS_MT5 else None
    wt1_1h  = compute_wt1(bars_1h) if bars_1h is not None else float('nan')

    if bardir == 'off' or math.isnan(wt1_5m):
        score = 2
    else:
        wt1_significant = abs(wt1_5m) >= wt_thresh
        if bardir == 'auto' and not wt1_significant:
            score = 2
        else:
            entry_dirs: set[str] = set()
            for e in near_entries:
                d = (e.get('direction') or e.get('signalAligned') or '').lower()
                if d in ('buy', 'long'):
                    entry_dirs.add('LONG')
                elif d in ('sell', 'short'):
                    entry_dirs.add('SHORT')

            if not entry_dirs:
                score = 2
            else:
                dir_ok_5m = (('LONG' in entry_dirs and wt1_5m > 0) or
                             ('SHORT' in entry_dirs and wt1_5m < 0))

                if bardir == 'on' and not math.isnan(wt1_1h):
                    # Require 5m + 1H to agree
                    dir_ok_1h = (('LONG' in entry_dirs and wt1_1h > 0) or
                                 ('SHORT' in entry_dirs and wt1_1h < 0))
                    if dir_ok_5m and dir_ok_1h:
                        score = 2
                elif dir_ok_5m:
                    score = 2

    return score, tol_pips, wt1_5m


# ── Full module evaluation (runs only when price is near a level) ─────────────

def run_modules(state: dict, pair: str, config: dict) -> tuple:
    """Returns (results_dict, ctx_dict). ctx is None on hard block."""
    enabled = config.get('modules') or {}
    modules = [
        MODULE_REGISTRY[name]()
        for name in MODULE_ORDER
        if enabled.get(name, False) and name in MODULE_REGISTRY
    ]

    results: dict = {}
    ctx: dict = {}

    for module in modules:
        try:
            result = module.evaluate(state, pair, config, ctx)
        except Exception as exc:
            log.error(f'  [{pair}] {module.name} raised: {exc}', exc_info=True)
            continue

        results[module.name] = result
        ctx[module.name] = result
        status = 'PASS' if result.passed else 'BLOCK'
        log.info(f'  [{pair}] {module.name:14s} {status:5s} {result.signal:7s} {result.confidence:6s} {result.reason}')

        if not result.passed and result.signal == 'BLOCK':
            log.info(f'  [{pair}] Hard block from {module.name} — pair skipped')
            return results, None

    return results, ctx


def composite_decision(results: dict) -> tuple:
    passing     = {k: v for k, v in results.items() if v and v.passed}
    long_scores  = [v.score for v in passing.values() if v.signal == 'LONG']
    short_scores = [v.score for v in passing.values() if v.signal == 'SHORT']

    if not passing:
        return None, 0.0, 'No modules passed'
    if long_scores and short_scores:
        return None, 0.0, 'Mixed LONG + SHORT signals — no trade'
    if long_scores:
        avg = sum(long_scores) / len(long_scores)
        return 'LONG', avg, f'LONG {avg:.2f} composite ({len(long_scores)} modules)'
    if short_scores:
        avg = sum(short_scores) / len(short_scores)
        return 'SHORT', avg, f'SHORT {avg:.2f} composite ({len(short_scores)} modules)'
    return None, 0.0, 'All passing modules NEUTRAL'


def handle_actions(results: dict, paper_mode: bool) -> None:
    for name, result in results.items():
        if not result or not result.action:
            continue
        log.info(f'Action from {name}: {result.action}')
        if paper_mode:
            return
        if result.action == 'move_sl_to_breakeven':
            _mt5_move_sl_to_be()
        elif result.action == 'close_all':
            _mt5_close_all()


# ── Helpers ───────────────────────────────────────────────────────────────────

def within_trade_window(config: dict) -> bool:
    s   = config.get('safety') or {}
    now = datetime.now(timezone.utc).strftime('%H:%M')
    return s.get('trade_window_start', '06:05') <= now <= s.get('trade_window_end', '21:00')


class RiskGuard:
    """
    Enforces per-session risk limits drawn from bot_config execution settings.

    ddlimit    — max daily drawdown % before lockout
    monthlydd  — max monthly drawdown % before lockout
    lockout    — hours to lock after a DD breach
    cooldown   — minutes between trades, tracked per-pair independently
    sizing     — position size multiplier applied on top of vol_gate size_mult

    State is persisted to disk so restarts don't reset DD tracking or cooldowns.
    """

    def __init__(self, config: dict):
        ec = config.get('execution') or {}
        self.dd_limit_pct   = ec.get('ddlimit', 3)
        self.monthly_dd_pct = ec.get('monthlydd', 5)
        self.lockout_hours  = ec.get('lockout', 3)
        self.cooldown_secs  = ec.get('cooldown', 60) * 60  # config in minutes
        self.sizing_mult    = ec.get('sizing', 1.0)

        self._day_start_bal:   float | None = None
        self._month_start_bal: float | None = None
        self._locked_until:    float = 0.0
        self._last_trade_by_pair: dict[str, float] = {}  # pair → unix timestamp
        self._last_reset_date:   date_type | None = None

    def update_balance(self, balance: float) -> None:
        today = datetime.now(timezone.utc).date()
        if self._day_start_bal is None:
            self._day_start_bal = balance
            self._last_reset_date = today
        if self._month_start_bal is None:
            self._month_start_bal = balance

        # Midnight daily reset
        if self._last_reset_date and today > self._last_reset_date:
            log.info(f'Midnight reset: day_start_bal {self._day_start_bal:.2f} → {balance:.2f}')
            self._day_start_bal   = balance
            self._last_reset_date = today

    def reset_daily(self, balance: float) -> None:
        self._day_start_bal   = balance
        self._last_reset_date = datetime.now(timezone.utc).date()

    def record_trade(self, pair: str) -> None:
        self._last_trade_by_pair[pair] = time.time()

    def block_reason(self, balance: float, pair: str = '') -> str | None:
        now = time.time()

        if now < self._locked_until:
            remaining_m = (self._locked_until - now) / 60
            return f'Locked out — {remaining_m:.0f}m remaining'

        # Per-pair cooldown
        if pair and pair in self._last_trade_by_pair:
            elapsed = now - self._last_trade_by_pair[pair]
            if elapsed < self.cooldown_secs:
                remaining_m = (self.cooldown_secs - elapsed) / 60
                return f'[{pair}] Cooldown — {remaining_m:.1f}m remaining'

        if self._day_start_bal:
            dd_pct = (self._day_start_bal - balance) / self._day_start_bal * 100
            if dd_pct >= self.dd_limit_pct:
                self._locked_until = now + self.lockout_hours * 3600
                return (f'Daily DD {dd_pct:.1f}% ≥ limit {self.dd_limit_pct}%'
                        f' — locked {self.lockout_hours}h')

        if self._month_start_bal:
            mdd_pct = (self._month_start_bal - balance) / self._month_start_bal * 100
            if mdd_pct >= self.monthly_dd_pct:
                self._locked_until = now + self.lockout_hours * 3600
                return (f'Monthly DD {mdd_pct:.1f}% ≥ limit {self.monthly_dd_pct}%'
                        f' — locked {self.lockout_hours}h')

        return None

    def to_dict(self) -> dict:
        return {
            'day_start_bal':      self._day_start_bal,
            'month_start_bal':    self._month_start_bal,
            'locked_until':       self._locked_until,
            'last_trade_by_pair': self._last_trade_by_pair,
            'last_reset_date':    self._last_reset_date.isoformat() if self._last_reset_date else None,
        }

    def restore_from_dict(self, d: dict) -> None:
        self._day_start_bal        = d.get('day_start_bal')
        self._month_start_bal      = d.get('month_start_bal')
        self._locked_until         = d.get('locked_until') or 0.0
        self._last_trade_by_pair   = d.get('last_trade_by_pair') or {}
        raw_date = d.get('last_reset_date')
        if raw_date:
            try:
                self._last_reset_date = date_type.fromisoformat(raw_date)
            except (ValueError, TypeError):
                self._last_reset_date = None


# ── Credentials from KV ───────────────────────────────────────────────────────

def load_credentials_from_kv(base_url: str) -> None:
    """Pull MT5 credentials from dashboard KV, falling back to env vars silently."""
    import requests as _req
    try:
        resp = _req.get(f'{base_url}/api/kv/get?key=bot_credentials', timeout=10)
        if resp.status_code != 200:
            return
        j = resp.json()
        if j.get('miss') or not j.get('data'):
            return
        creds = j['data']
        if creds.get('mt5_account'):
            os.environ['MT5_ACCOUNT'] = str(creds['mt5_account'])
        if creds.get('mt5_password'):
            os.environ['MT5_PASSWORD'] = creds['mt5_password']
        if creds.get('mt5_server'):
            os.environ['MT5_SERVER'] = creds['mt5_server']
        if creds.get('mt5_path'):
            os.environ['MT5_PATH'] = creds['mt5_path']
        log.info('MT5 credentials loaded from KV')
    except Exception as exc:
        log.warning(f'Could not load credentials from KV ({exc}) — using env vars')


# ── MT5 ───────────────────────────────────────────────────────────────────────

def mt5_connect() -> bool:
    mt5_path    = os.environ.get('MT5_PATH') or None
    initialized = mt5.initialize(path=mt5_path) if mt5_path else mt5.initialize()
    if not initialized:
        log.error(f'MT5 initialize() failed: {mt5.last_error()}')
        return False

    account  = os.environ.get('MT5_ACCOUNT', '')
    password = os.environ.get('MT5_PASSWORD', '')
    server   = os.environ.get('MT5_SERVER', '')

    if account and password and server:
        try:
            ok = mt5.login(login=int(account), password=password, server=server)
        except Exception as exc:
            log.error(f'MT5 login() raised: {exc}')
            return False
        if not ok:
            log.error(f'MT5 login failed: {mt5.last_error()}')
            return False

    info = mt5.account_info()
    if info:
        log.info(
            f'MT5 connected  account={info.login}  balance={info.balance:.2f} {info.currency}'
            f'  server={info.server}  leverage=1:{info.leverage}'
        )
    else:
        log.warning('MT5 connected but account_info() returned None')
    return True


def _mt5_move_sl_to_be() -> None:
    for pos in mt5.positions_get() or []:
        if pos.sl != pos.price_open:
            mt5.order_send({'action': mt5.TRADE_ACTION_SLTP, 'position': pos.ticket,
                            'sl': pos.price_open, 'tp': pos.tp})
            log.info(f'SL → breakeven: ticket {pos.ticket}')


def _mt5_close_all() -> None:
    for pos in mt5.positions_get() or []:
        t    = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(pos.symbol)
        px   = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
        mt5.order_send({'action': mt5.TRADE_ACTION_DEAL, 'symbol': pos.symbol,
                        'volume': pos.volume, 'type': t, 'position': pos.ticket,
                        'price': px, 'deviation': 20, 'magic': 20260001,
                        'comment': 'MacroFX emergency close'})
        log.info(f'Emergency close: ticket {pos.ticket}')


# ── Trade execution ───────────────────────────────────────────────────────────

def execute_trade(pair: str, direction: str, entry: dict,
                  sl_tp, size: float, live_price: float, paper_mode: bool,
                  config: dict | None = None) -> bool:
    level_price = entry.get('price', 0)
    pip_size    = _PIP_SIZES.get(pair, 0.0001)
    dist_pips   = abs(live_price - level_price) / pip_size

    log.info(
        f'TRADE {pair} {direction}  level={level_price}  live={live_price}  '
        f'dist={dist_pips:.1f}pips  SL={sl_tp.sl}  TP={sl_tp.tp}  '
        f'R:R={sl_tp.rr_ratio}  lot={size}'
        + ('  [SL CAPPED]' if sl_tp.sl_capped else '')
        + ('  [TP CAPPED]' if sl_tp.tp_capped else '')
    )

    if sl_tp.sl_capped:
        log.warning(f'SL capped at max_sl_pips — verify entry quality for {pair}')
    if sl_tp.tp_capped:
        log.warning(f'TP capped at max_tp_pips — verify entry quality for {pair}')

    if paper_mode:
        log.info('[PAPER] Signal logged — no order sent')
        return True

    if not HAS_MT5:
        log.error('MetaTrader5 not installed and --live mode is on')
        return False

    mt5_sym = pair.replace('/', '')
    tick    = mt5.symbol_info_tick(mt5_sym)
    if not tick:
        log.error(f'MT5: no tick for {mt5_sym}')
        return False

    # Spread gate — reject when spread is excessive (illiquid / pre-event)
    pip_size    = _PIP_SIZES.get(pair, 0.0001)
    spread_pips = (tick.ask - tick.bid) / pip_size
    max_spread  = (config.get('execution') or {}).get('max_spread_pips', 3.0)
    if spread_pips > max_spread:
        log.warning(f'SPREAD BLOCK {pair}: {spread_pips:.1f}p > max {max_spread}p — skipping')
        return False

    # Duplicate position guard — never open a second position on the same pair
    existing = [p for p in (mt5.positions_get() or [])
                if p.symbol == mt5_sym and p.magic == MAGIC]
    if existing:
        log.warning(f'DUPLICATE BLOCK {pair}: open position {existing[0].ticket} already exists')
        return False

    order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    exec_price = tick.ask if direction == 'LONG' else tick.bid

    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       mt5_sym,
        'volume':       size,
        'type':         order_type,
        'price':        exec_price,
        'sl':           sl_tp.sl,
        'tp':           sl_tp.tp,
        'deviation':    20,
        'magic':        20260001,
        'comment':      f'MacroFX {direction[0]} {entry.get("totalStars", 0)}★',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    })

    if res.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f'MT5 order failed: retcode={res.retcode}  {res.comment}')
        return False

    log.info(f'MT5 order placed: ticket={res.order}  exec_price={exec_price}')
    return res.order  # return ticket int (truthy) so caller can store position meta


# ── Pair evaluation (full pipeline, only called when price is near a level) ───

def evaluate_pair(state: dict, pair: str, config: dict, live_price: float,
                  sl_tp_engine: SLTPEngine, paper_mode: bool,
                  sizing_mult: float = 1.0) -> dict:
    """
    Runs all modules and executes if the composite score clears the threshold.
    Returns a pair_status dict for the status report.
    """
    snap = state.get('regime_snapshot') or {}
    exec_cfg       = config.get('execution') or {}
    base_threshold = exec_cfg.get('composite_threshold', 0.60)
    comp_threshold = base_threshold * session_threshold_mult()
    min_agree      = exec_cfg.get('min_agree', 3)
    pair_status    = {'pair': pair, 'action': 'skip', 'live_price': live_price, 'reason': ''}

    results, ctx = run_modules(state, pair, config)
    handle_actions(results, paper_mode)

    if ctx is None:
        pair_status['reason'] = 'hard block'
        return pair_status

    direction, comp_score, comp_reason = composite_decision(results)
    log.info(f'  [{pair}] Composite: {comp_reason}')

    if direction is None or comp_score < comp_threshold:
        pair_status['reason'] = comp_reason
        return pair_status

    passing_dir = sum(1 for v in results.values() if v and v.passed and v.signal == direction)
    if passing_dir < min_agree:
        pair_status['reason'] = f'Only {passing_dir}/{min_agree} modules agree on {direction}'
        log.info(f'  [{pair}] {pair_status["reason"]}')
        return pair_status

    conf_result = results.get('confluence')
    if not conf_result or not conf_result.metadata.get('entry'):
        pair_status['reason'] = 'No entry from confluence module'
        return pair_status

    entry       = conf_result.metadata['entry']
    level_price = float(entry.get('price') or 0)
    pair_snap   = (snap.get('pairs') or {}).get(pair) or {}
    pip_size    = _PIP_SIZES.get(pair, 0.0001)
    dist_pips   = abs(live_price - level_price) / pip_size

    sl_tp = sl_tp_engine.calculate(
        entry=entry, pair=pair, pair_data=pair_snap,
        direction=direction.lower(), price=live_price,
    )

    vol_result = results.get('vol_gate')
    vol_mult   = vol_result.metadata.get('size_mult', 1.0) if vol_result else 1.0
    risk_pct   = (config.get('position') or {}).get('risk_pct', 1.0) * vol_mult

    balance = 10_000
    if HAS_MT5 and not paper_mode:
        acct    = mt5.account_info()
        balance = acct.balance if acct else 10_000

    sl_dist = abs(live_price - sl_tp.sl)
    size    = sl_tp_engine.position_size(balance, risk_pct, sl_dist, pair, sizing_mult)

    log.info(
        f'  [{pair}] ENTRY {direction} {entry.get("totalStars", 0)}★  '
        f'level={level_price}  live={live_price}  dist={dist_pips:.1f}pips  '
        f'SL={sl_tp.sl}  TP={sl_tp.tp}  R:R={sl_tp.rr_ratio}  lot={size}  score={comp_score:.2f}'
    )

    ticket = execute_trade(pair, direction, entry, sl_tp, size, live_price,
                           paper_mode, config=config)

    pair_status.update({
        'action':   'trade',      'direction': direction,  'score': round(comp_score, 2),
        'stars':    entry.get('totalStars'), 'level': level_price, 'live': live_price,
        'dist_pips': round(dist_pips, 1),  'sl': sl_tp.sl, 'tp': sl_tp.tp,
        'tp1':      sl_tp.tp1,    'tp1_close_pct': sl_tp.tp1_close_pct,
        'trailoffset_dist': sl_tp.trailoffset_dist,
        'rr':       sl_tp.rr_ratio, 'lot': size, 'executed': bool(ticket),
        'ticket':   ticket if isinstance(ticket, int) else None,
    })
    return pair_status


# ── Main loop — two-speed ─────────────────────────────────────────────────────

def main_loop(paper_mode: bool, state_interval: int, price_interval: int,
              run_once: bool = False) -> None:
    base_url = os.environ.get('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app')

    log.info(
        f'MacroFX Bot  paper={paper_mode}  '
        f'state_refresh={state_interval}s  price_tick={price_interval}s  '
        f'dashboard={base_url}'
    )

    # ── MT5 startup ───────────────────────────────────────────────────────────
    load_credentials_from_kv(base_url)  # overlay KV creds onto env vars
    if not paper_mode:
        if HAS_MT5:
            if not mt5_connect():
                log.error('MT5 connection failed — falling back to paper mode')
                paper_mode = True
        else:
            log.error('MetaTrader5 package not installed — falling back to paper mode')
            paper_mode = True

    # ── Restore persisted state (survives restarts) ───────────────────────────
    persisted = load_bot_state()
    log.info(f'Loaded persisted state: {list(persisted.keys())}')

    # ── State cache ───────────────────────────────────────────────────────────
    cached_state: dict | None = None
    last_state_refresh: float = 0.0
    last_status_push:   float = 0.0
    last_state_save:    float = 0.0
    status: dict = {'loop_at': '', 'paper': paper_mode, 'pairs_evaluated': [], 'errors': []}
    risk_guard: RiskGuard | None = None
    _last_risk_config_hash: int = 0

    # Position metadata — keyed by MT5 ticket int, holds TP1/trail state
    position_meta: dict[int, dict] = {
        int(k): v for k, v in (persisted.get('position_meta') or {}).items()
    }

    # State save interval (every 60s to avoid disk churn)
    STATE_SAVE_INTERVAL = 60

    last_window_warn:  float = 0.0
    last_stale_warn:   float = 0.0
    last_heartbeat:    float = 0.0
    HEARTBEAT_INTERVAL = 5 * 60  # log alive message every 5 min when monitoring quietly

    # ── Two-speed loop ────────────────────────────────────────────────────────
    while True:
        tick_start = time.time()

        # ── Slow path: refresh dashboard state ────────────────────────────────
        if tick_start - last_state_refresh >= state_interval or cached_state is None:
            try:
                cached_state = fetch_state(base_url)
                # events_today is now included in the /api/state response
                last_state_refresh = tick_start
                log.info('State refreshed from dashboard KV')
            except Exception as exc:
                log.error(f'State refresh failed: {exc}')
                if cached_state is None:
                    # No state at all yet — wait before retrying
                    time.sleep(min(price_interval * 5, 30))
                    continue

        config         = cached_state.get('bot_config') or {}
        snap           = cached_state.get('regime_snapshot') or {}
        enabled_pairs  = config.get('enabled_pairs') or []
        exec_cfg       = config.get('execution') or {}

        # Re-create RiskGuard whenever execution config changes (picks up /tier, /sizing etc.)
        risk_cfg_hash = hash(str(exec_cfg))
        if risk_guard is None or risk_cfg_hash != _last_risk_config_hash:
            prev = risk_guard
            risk_guard = RiskGuard(config)

            # First creation: restore from persisted state
            if prev is None and persisted.get('risk_guard'):
                risk_guard.restore_from_dict(persisted['risk_guard'])
                log.info('RiskGuard restored from disk')
            elif prev is not None:
                # Config changed mid-session: carry forward DD tracking
                risk_guard.restore_from_dict(prev.to_dict())
                log.info(f'RiskGuard updated — tier={exec_cfg.get("tier","balanced")}  '
                         f'sizing={risk_guard.sizing_mult}  cooldown={exec_cfg.get("cooldown",60)}m  '
                         f'ddlimit={risk_guard.dd_limit_pct}%')

            _last_risk_config_hash = risk_cfg_hash

        # ── Kill switch (checked every tick so it takes effect fast) ──────────
        if config.get('kill_switch', False):
            if tick_start - last_status_push >= 30:
                log.warning('KILL SWITCH ACTIVE — no trades will be placed')
                push_bot_status({'loop_at': datetime.now(timezone.utc).isoformat(),
                                 'paper': paper_mode, 'kill_switch': True,
                                 'pairs_evaluated': [], 'errors': []}, base_url)
                last_status_push = tick_start
            if run_once:
                break
            time.sleep(price_interval)
            continue

        # ── Trade window ──────────────────────────────────────────────────────
        if not within_trade_window(config):
            if tick_start - last_window_warn >= 30 * 60:
                s = config.get('safety') or {}
                win_start = s.get('trade_window_start', '07:00')
                win_end   = s.get('trade_window_end',   '20:00')
                now_utc   = datetime.now(timezone.utc).strftime('%H:%M')
                log.info(
                    f'Market hours: outside trade window {win_start}–{win_end} UTC '
                    f'(now {now_utc} UTC) — monitoring, no trades'
                )
                last_window_warn = tick_start
            if run_once:
                break
            time.sleep(price_interval)
            continue

        # ── Staleness gate ────────────────────────────────────────────────────
        try:
            check_staleness(snap)
        except StaleDataError as exc:
            if tick_start - last_stale_warn >= 5 * 60:
                log.warning(f'STALE DATA: {exc}')
                ok, refreshed = trigger_refresh(base_url)
                if ok:
                    log.info(f'Server refresh triggered — touched {len(refreshed)} pairs {refreshed}  forcing state re-fetch')
                    last_state_refresh = 0  # force immediate re-fetch next tick
                else:
                    log.warning('Refresh request failed — dashboard may have no entry data yet; open it to push levels to KV')
                push_bot_status({'loop_at': datetime.now(timezone.utc).isoformat(),
                                 'paper': paper_mode, 'errors': [str(exc)],
                                 'pairs_evaluated': []}, base_url)
                last_stale_warn = tick_start
                last_status_push = tick_start
            if run_once:
                break
            time.sleep(price_interval)
            continue

        # ── Fast path: fetch live prices (MT5 tick = sub-ms, no network) ─────
        live_prices: dict = {}
        for pair in enabled_pairs:
            price = fetch_current_price(pair, base_url)
            if price:
                live_prices[pair] = price

        # Attach to state so confluence module can read them
        cached_state['_live_prices'] = live_prices

        # ── Position management (runs every tick, before new entries) ─────────
        mgmt_actions = manage_positions(position_meta, paper_mode)
        if mgmt_actions:
            log.info(f'Position actions this tick: {mgmt_actions}')

        # ── Pre-screen: ATR proximity + WT1 direction (cheap, runs every tick) ──
        near_level: dict = {}
        for pair in enabled_pairs:
            if pair not in live_prices:
                continue
            live_price = live_prices[pair]
            score, tol_pips, wt1 = pre_screen(cached_state, pair, config, live_price)
            if score > 0:
                wt1_str = f'{wt1:.2f}' if not math.isnan(wt1) else 'n/a'
                log.info(
                    f'[{pair}] pre_screen {score}/2  tol={tol_pips:.2f}pips'
                    f'  WT1={wt1_str}  live={live_price}'
                )
            if score >= 2:
                near_level[pair] = live_price

        if near_level:
            log.info(f'Near level (2/2): {", ".join(near_level)}')
        else:
            if tick_start - last_heartbeat >= HEARTBEAT_INTERVAL:
                prices_str = '  '.join(f'{p}={v}' for p, v in live_prices.items()) or 'no prices'
                log.info(f'Monitoring {len(enabled_pairs)} pairs — no level approach  [{prices_str}]')
                last_heartbeat = tick_start

        # ── Full evaluation only for pairs where price is at a level ──────────
        max_trades      = exec_cfg.get('max_trades', 2)
        sl_tp_engine    = SLTPEngine(config)
        trades_this_tick = 0
        tick_evaluated  = []

        # Fetch balance once per tick for risk guard (live only; paper uses placeholder)
        live_balance = 10_000.0
        if HAS_MT5 and not paper_mode:
            acct = mt5.account_info()
            if acct:
                live_balance = acct.balance
        risk_guard.update_balance(live_balance)

        # Per-pair risk check — filter near_level to only unblocked pairs
        blocked_pairs: list[str] = []
        for pair in list(near_level.keys()):
            block = risk_guard.block_reason(live_balance, pair=pair)
            if block:
                log.warning(f'RiskGuard [{pair}]: {block}')
                blocked_pairs.append(pair)
                del near_level[pair]

        # Session-level checks (lockout, DD) — clear everything if triggered
        session_block = risk_guard.block_reason(live_balance, pair='')
        if session_block and not blocked_pairs:
            log.warning(f'RiskGuard SESSION: {session_block}')
            near_level = {}

        for pair, live_price in near_level.items():
            if trades_this_tick >= max_trades:
                break

            log.info(f'--- {pair}  live={live_price} ---')
            try:
                pair_status = evaluate_pair(
                    cached_state, pair, config, live_price, sl_tp_engine, paper_mode,
                    sizing_mult=risk_guard.sizing_mult,
                )
            except Exception as exc:
                log.error(f'evaluate_pair [{pair}]: {exc}', exc_info=True)
                pair_status = {'pair': pair, 'action': 'error', 'reason': str(exc)}

            tick_evaluated.append(pair_status)
            if pair_status.get('executed'):
                trades_this_tick += 1
                risk_guard.record_trade(pair)
                # Register position meta so position_manager can manage it
                ticket = pair_status.get('ticket')
                if ticket:
                    position_meta[ticket] = {
                        'tp1':              pair_status.get('tp1'),
                        'tp1_close_pct':    pair_status.get('tp1_close_pct') or 50,
                        'trailoffset_dist': pair_status.get('trailoffset_dist'),
                        'tp1_hit':          False,
                        'trail_active':     False,
                        'trail_sl':         None,
                    }
                    log.info(f'Position meta registered: ticket={ticket}  '
                             f'tp1={pair_status.get("tp1")}  trailoffset={pair_status.get("trailoffset_dist")}')

        # ── Status report pushed on slow cadence (not every tick) ─────────────
        if tick_evaluated or mgmt_actions or tick_start - last_status_push >= state_interval:
            status = {
                'loop_at':           datetime.now(timezone.utc).isoformat(),
                'paper':             paper_mode,
                'pairs_evaluated':   tick_evaluated,
                'pairs_near':        list(near_level.keys()),
                'pairs_blocked':     blocked_pairs,
                'mgmt_actions':      mgmt_actions,
                'open_positions':    len(position_meta),
                'tier':              exec_cfg.get('tier', 'balanced'),
                'min_stars':         resolve_min_stars(exec_cfg),
                'bardir':            exec_cfg.get('bardir', 'auto'),
                'wtthreshold':       exec_cfg.get('wtthreshold', 35),
                'sizing':            risk_guard.sizing_mult,
                'ddlimit':           risk_guard.dd_limit_pct,
                'monthlydd':         risk_guard.monthly_dd_pct,
                'cooldown_min':      exec_cfg.get('cooldown', 60),
                'balance':           live_balance,
                'errors':            [],
            }
            push_bot_status(status, base_url)
            last_status_push = tick_start

        # ── Periodic state persistence (every 60s) ────────────────────────────
        if tick_start - last_state_save >= STATE_SAVE_INTERVAL:
            save_bot_state({
                'risk_guard':    risk_guard.to_dict() if risk_guard else {},
                'position_meta': {str(k): v for k, v in position_meta.items()},
            })
            last_state_save = tick_start

        if run_once:
            break

        elapsed  = time.time() - tick_start
        sleep_s  = max(0, price_interval - elapsed)
        log.debug(f'Tick done in {elapsed*1000:.0f}ms  sleeping {sleep_s:.1f}s')
        time.sleep(sleep_s)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='MacroFX Trading Bot')
    ap.add_argument('--live',           action='store_true',
                    help='Send real orders to MT5 (default: paper mode)')
    ap.add_argument('--paper',          action='store_true',
                    help='Paper mode — log signals only')
    ap.add_argument('--once',           action='store_true',
                    help='Single evaluation cycle then exit')
    ap.add_argument('--price-interval', type=int, default=3,
                    help='Price tick interval in seconds (default: 3)')
    ap.add_argument('--state-interval', type=int, default=120,
                    help='Dashboard state refresh interval in seconds (default: 120)')
    args = ap.parse_args()

    paper = not args.live or args.paper

    main_loop(
        paper_mode     = paper,
        state_interval = args.state_interval,
        price_interval = args.price_interval,
        run_once       = args.once,
    )
