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
from datetime import datetime, timezone

from utils.state_reader import fetch_state, fetch_quote, check_staleness, push_bot_status, StaleDataError
from utils.sl_tp_engine import SLTPEngine
from utils.indicators import compute_atr, compute_wt1, atr_to_tol_pips
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

# Named strictness tiers → minimum confluence star count
_TIER_MIN_STARS = {
    'strict':     4,
    'balanced':   3,
    'loose':      2,
    'aggressive': 1,
}


def _resolve_min_stars(exec_cfg: dict) -> int:
    tier = (exec_cfg.get('tier') or 'balanced').lower()
    if tier == 'auto':
        return exec_cfg.get('min_stars', 3)
    return _TIER_MIN_STARS.get(tier, exec_cfg.get('min_stars', 3))


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


def fetch_bars(pair: str, count: int = 30):
    """
    Fetches recent 5m bars from MT5 (local memory, no network).
    Returns the numpy structured array or None if MT5 unavailable.
    """
    if not HAS_MT5:
        return None
    try:
        bars = mt5.copy_rates_from_pos(pair.replace('/', ''), mt5.TIMEFRAME_M5, 0, count)
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
    min_stars = _resolve_min_stars(exec_cfg)
    bardir    = (exec_cfg.get('bardir') or 'auto').lower()
    wt_thresh = exec_cfg.get('wtthreshold', 35)
    pip_size  = _PIP_SIZES.get(pair, 0.0001)

    # Dynamic ATR tolerance from MT5 5m bars; falls back to config when unavailable
    bars = fetch_bars(pair)
    if bars is not None:
        atr      = compute_atr(bars)
        tol_pips = atr_to_tol_pips(atr, pip_size)
    else:
        tol_pips = _prox_pips(pair, exec_cfg)

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

    # Condition 2: WT1 direction aligns with a near entry
    # bardir='off' → skip check entirely
    # bardir='auto' → only filter when abs(WT1) >= wtthreshold (significant momentum)
    # bardir='on'  → always filter
    wt1 = compute_wt1(bars) if bars is not None else float('nan')

    if bardir == 'off' or math.isnan(wt1):
        # WT1 check disabled, or no bars (paper mode) — auto-pass
        score = 2
    else:
        wt1_significant = abs(wt1) >= wt_thresh
        if bardir == 'auto' and not wt1_significant:
            # WT1 is in neutral zone — no conviction either way, let through
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
            elif ('LONG' in entry_dirs and wt1 > 0) or ('SHORT' in entry_dirs and wt1 < 0):
                score = 2

    return score, tol_pips, wt1


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
    return s.get('trade_window_start', '07:00') <= now <= s.get('trade_window_end', '20:00')


class RiskGuard:
    """
    Enforces per-session risk limits drawn from bot_config execution settings.

    ddlimit    — max daily drawdown % before lockout
    monthlydd  — max monthly drawdown % before lockout
    lockout    — hours to lock after a DD breach
    cooldown   — minutes between trades (same pair or any pair)
    sizing     — position size multiplier applied on top of vol_gate size_mult
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
        self._last_trade_at:   float = 0.0

    def update_balance(self, balance: float) -> None:
        if self._day_start_bal is None:
            self._day_start_bal = balance
        if self._month_start_bal is None:
            self._month_start_bal = balance

    def reset_daily(self, balance: float) -> None:
        self._day_start_bal = balance

    def record_trade(self) -> None:
        self._last_trade_at = time.time()

    def block_reason(self, balance: float) -> str | None:
        now = time.time()

        if now < self._locked_until:
            remaining_m = (self._locked_until - now) / 60
            return f'Locked out — {remaining_m:.0f}m remaining'

        if self._last_trade_at and now - self._last_trade_at < self.cooldown_secs:
            remaining_s = self.cooldown_secs - (now - self._last_trade_at)
            return f'Cooldown — {remaining_s / 60:.1f}m remaining'

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
                  sl_tp, size: float, live_price: float, paper_mode: bool) -> bool:
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
    return True


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
    comp_threshold = exec_cfg.get('composite_threshold', 0.60)
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

    ok = execute_trade(pair, direction, entry, sl_tp, size, live_price, paper_mode)

    pair_status.update({
        'action': 'trade', 'direction': direction, 'score': round(comp_score, 2),
        'stars': entry.get('totalStars'), 'level': level_price, 'live': live_price,
        'dist_pips': round(dist_pips, 1), 'sl': sl_tp.sl, 'tp': sl_tp.tp,
        'rr': sl_tp.rr_ratio, 'lot': size, 'executed': ok,
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
    if not paper_mode:
        if HAS_MT5:
            if not mt5_connect():
                log.error('MT5 connection failed — falling back to paper mode')
                paper_mode = True
        else:
            log.error('MetaTrader5 package not installed — falling back to paper mode')
            paper_mode = True

    # ── State cache ───────────────────────────────────────────────────────────
    cached_state: dict | None = None
    last_state_refresh: float = 0.0
    last_status_push:   float = 0.0
    status: dict = {'loop_at': '', 'paper': paper_mode, 'pairs_evaluated': [], 'errors': []}
    risk_guard: RiskGuard | None = None
    _last_risk_config_hash: int = 0

    # ── Two-speed loop ────────────────────────────────────────────────────────
    while True:
        tick_start = time.time()

        # ── Slow path: refresh dashboard state ────────────────────────────────
        if tick_start - last_state_refresh >= state_interval or cached_state is None:
            try:
                cached_state = fetch_state(base_url)
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
            if prev is not None:
                # Carry over the day/month baseline so a config change doesn't reset DD tracking
                risk_guard._day_start_bal   = prev._day_start_bal
                risk_guard._month_start_bal = prev._month_start_bal
                risk_guard._locked_until    = prev._locked_until
                risk_guard._last_trade_at   = prev._last_trade_at
                log.info(f'RiskGuard updated — tier={exec_cfg.get("tier","balanced")}  '
                         f'sizing={risk_guard.sizing_mult}  cooldown={exec_cfg.get("cooldown",60)}m  '
                         f'ddlimit={risk_guard.dd_limit_pct}%')
            _last_risk_config_hash = risk_cfg_hash

        # ── Kill switch (checked every tick so it takes effect fast) ──────────
        if config.get('kill_switch', False):
            if tick_start - last_status_push >= 30:
                log.warning('KILL SWITCH ACTIVE')
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
            if run_once:
                break
            time.sleep(price_interval)
            continue

        # ── Staleness gate ────────────────────────────────────────────────────
        try:
            check_staleness(snap)
        except StaleDataError as exc:
            if tick_start - last_status_push >= 60:
                log.warning(f'STALE: {exc}')
                push_bot_status({'loop_at': datetime.now(timezone.utc).isoformat(),
                                 'paper': paper_mode, 'errors': [str(exc)],
                                 'pairs_evaluated': []}, base_url)
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
            log.debug('No pair at pre_screen 2/2 this tick — monitoring')

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

        # Check session-level risk block before entering the evaluation loop
        rg_block = risk_guard.block_reason(live_balance)
        if rg_block:
            log.warning(f'RiskGuard BLOCK: {rg_block}')
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
                risk_guard.record_trade()

        # ── Status report pushed on slow cadence (not every tick) ─────────────
        if tick_evaluated or tick_start - last_status_push >= state_interval:
            status = {
                'loop_at':         datetime.now(timezone.utc).isoformat(),
                'paper':           paper_mode,
                'pairs_evaluated': tick_evaluated,
                'pairs_near':      list(near_level.keys()),
                'tier':            exec_cfg.get('tier', 'balanced'),
                'min_stars':       _resolve_min_stars(exec_cfg),
                'bardir':          exec_cfg.get('bardir', 'auto'),
                'wtthreshold':     exec_cfg.get('wtthreshold', 35),
                'sizing':          risk_guard.sizing_mult,
                'ddlimit':         risk_guard.dd_limit_pct,
                'monthlydd':       risk_guard.monthly_dd_pct,
                'cooldown_min':    exec_cfg.get('cooldown', 60),
                'balance':         live_balance,
                'errors':          [],
            }
            push_bot_status(status, base_url)
            last_status_push = tick_start

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
