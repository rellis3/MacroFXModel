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
import json
import logging
import math
import os
import requests
import time
from datetime import datetime, timezone, date as date_type

from utils.state_reader import fetch_state, fetch_quote, check_staleness, push_bot_status, trigger_refresh, StaleDataError
from utils.sl_tp_engine import SLTPEngine
from utils.indicators import compute_atr, compute_wt1, atr_to_tol_pips
from utils.config_helpers import resolve_grade_thresholds, _GRADE_ORDER, session_threshold_mult
from utils.persistence import load_bot_state, save_bot_state
from position_manager import manage_positions, MAGIC
from modules.vol_gate import VolGateModule
from modules.macro_regime import MacroRegimeModule
from modules.confluence import ConfluenceModule
from modules.oi_walls import OIWallsModule
from modules.cot_filter import COTFilterModule
from modules.news_risk import NewsRiskModule
from modules.gold_macro_module import GoldMacroModule
from modules.regime_confidence_module import RegimeConfidenceModule
from modules.beta_estimator import BetaEstimator, push_beta_to_kv, BAR_COUNT, fetch_h4_bars_oanda
from modules.portfolio_beta import compute_portfolio_beta, push_portfolio_beta
from modules.beta_deviation import compute_beta_deviation, push_beta_deviation, fetch_beta_targets
from modules.beta_rebalancer import evaluate_rebalancing, push_rebalance_signal

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

MODULE_ORDER = ['vol_gate', 'regime_confidence', 'gold_macro', 'macro_regime', 'confluence', 'oi_walls', 'cot_filter', 'news_risk']

MODULE_REGISTRY = {
    'vol_gate':          VolGateModule,
    'regime_confidence': RegimeConfidenceModule,  # continuous sizing scalar from HMM+GARCH+ARMA
    'gold_macro':        GoldMacroModule,          # gold-specific two-layer macro model
    'macro_regime':      MacroRegimeModule,
    'confluence':        ConfluenceModule,
    'oi_walls':          OIWallsModule,
    'cot_filter':        COTFilterModule,
    'news_risk':         NewsRiskModule,
}

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
    'SPX500_USD': 1.0, 'DE30_USD': 1.0, 'UK100_GBP': 1.0,
    'US30_USD': 1.0,   'US2000_USD': 1.0,
}

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

# resolve_grade_thresholds and session_threshold_mult live in utils/config_helpers.py

# ── Beta system constants ──────────────────────────────────────────────────────
# Factor proxy pairs for beta estimation — always fetched even if not traded
_BETA_FACTOR_PAIRS = ['EUR/USD', 'USD/JPY', 'USD/CHF']
BETA_PUSH_INTERVAL = 30  # seconds between portfolio beta / deviation KV pushes

_BETA_HISTORY_DIR  = os.path.join(os.path.dirname(__file__), 'data')
_BETA_HISTORY_FILE = os.path.join(_BETA_HISTORY_DIR, 'beta_history.jsonl')


def _serialize_open_positions(magic: int) -> list:
    """Return a serialisable snapshot of all MT5 positions for the given magic number."""
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
    """Return today's closed positions from MT5 deal history for this bot."""
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


def _dominant_regime(state: dict, enabled_pairs: list) -> str:
    """Return the mode HMM regime across enabled pairs. Falls back to RANGE."""
    snap = (state.get('regime_snapshot') or {}).get('pairs') or {}
    regimes = []
    for pair in enabled_pairs:
        r = (snap.get(pair) or {}).get('hmm') or {}
        regime = r.get('regime', 'RANGE')
        if regime:
            regimes.append(regime.upper())
    if not regimes:
        return 'RANGE'
    from collections import Counter
    return Counter(regimes).most_common(1)[0][0]


def _run_beta_estimation(
    beta_estimator: BetaEstimator,
    enabled_pairs: list,
    base_url: str,
) -> dict:
    """
    Fetch H4 bars for all trading pairs + factor proxies, run beta estimation,
    and push results to KV. Runs in the slow path (every 120s).

    Primary source: MT5 copy_rates_from_pos (when connected).
    Fallback/backfill: Oanda REST API using OANDA_KEY env var — eliminates the
    80-hour cold start by pulling historical bars on first run or when MT5 is
    unavailable. Set OANDA_PRACTICE=1 if using a practice account.
    """
    oanda_key      = os.environ.get('OANDA_KEY', '')
    oanda_practice = os.environ.get('OANDA_PRACTICE', '').lower() in ('1', 'true', 'yes')

    all_pairs = list(set(enabled_pairs) | set(_BETA_FACTOR_PAIRS))
    bars_by_symbol: dict = {}

    for pair in all_pairs:
        sym  = _mt5_sym(pair)
        bars = None

        # Primary: MT5 bars
        if HAS_MT5:
            try:
                mt5_bars = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_H4, 0, BAR_COUNT)
                if mt5_bars is not None and len(mt5_bars) >= 21:
                    bars = mt5_bars
            except Exception as exc:
                log.debug(f'BetaEstimator: MT5 fetch failed for {pair}: {exc}')

        # Fallback: Oanda REST API — used on cold start or when MT5 is absent
        if bars is None and oanda_key:
            oanda_bars = fetch_h4_bars_oanda(sym, BAR_COUNT, oanda_key, practice=oanda_practice)
            if oanda_bars is not None:
                bars = oanda_bars
                log.info(f'[BETA] Oanda backfill: {sym} ({len(oanda_bars)} bars)')

        if bars is not None:
            bars_by_symbol[sym] = bars

    if not bars_by_symbol:
        log.debug('BetaEstimator: no bars available (MT5 disconnected, OANDA_KEY missing or failed)')
        return {}

    estimates = beta_estimator.estimate(bars_by_symbol)
    if estimates:
        push_beta_to_kv(estimates, base_url)
        log.info(f'[BETA] Estimates updated for {len(estimates)} symbols')
    return estimates


def _run_beta_portfolio_tracking(
    beta_estimates: dict,
    regime: str,
    base_url: str,
    paper_mode: bool,
    beta_targets: dict,
) -> dict:
    """
    Compute portfolio beta, deviation, and rebalancing signal.
    Pushes all to KV. Runs every BETA_PUSH_INTERVAL seconds.
    Returns the rebalance signal dict.
    """
    portfolio = compute_portfolio_beta(beta_estimates, paper_mode)
    if not portfolio:
        return {}

    deviation = compute_beta_deviation(portfolio, regime, beta_targets)

    open_syms: list[str] = []
    if HAS_MT5 and not paper_mode:
        try:
            open_syms = [p.symbol for p in (mt5.positions_get() or [])
                         if p.magic == MAGIC]
        except Exception:
            pass

    rebalance = evaluate_rebalancing(deviation, beta_estimates, open_syms)

    push_portfolio_beta(portfolio, base_url)
    push_beta_deviation(deviation, base_url)

    if rebalance.get('rebalance_needed'):
        push_rebalance_signal(rebalance, base_url)
        urgency = rebalance.get('urgency', 'LOW')
        if urgency in ('HIGH', 'MEDIUM'):
            log.warning(
                f'[BETA REBALANCE] {urgency}  {rebalance["action"]}'
                f'  dev={rebalance["deviation"]:+.3f}  band={rebalance["band"]:.3f}'
                f'  suggest={rebalance.get("suggested_pairs", [])}'
            )
        if urgency == 'HIGH':
            _send_beta_rebalance_telegram(rebalance, base_url)

    return rebalance


def _send_beta_rebalance_telegram(signal: dict, base_url: str) -> None:
    """Send HIGH urgency beta rebalancing alert via the shared Telegram bot."""
    try:
        import urllib.request as _ur
        # Fetch tg_config from KV (same key used by all bots)
        with _ur.urlopen(f'{base_url.rstrip("/")}/api/kv/get?key=tg_config', timeout=5) as r:
            j = json.loads(r.read())
        if j.get('miss') or not j.get('data'):
            return
        tg = j['data']
        token   = tg.get('token', '')
        chat_id = tg.get('chatId', '')
        if not token or not chat_id:
            return

        action  = signal.get('action', '').replace('_', ' ')
        factor  = signal.get('factor', '?').replace('beta_', '').upper()
        dev     = signal.get('deviation', 0)
        band    = signal.get('band', 0)
        pairs   = ', '.join(signal.get('suggested_pairs', [])) or '—'
        regime  = signal.get('regime', '?')
        align   = signal.get('overall_alignment', 0)

        text = (
            f'⚡ <b>BETA REBALANCE — HIGH</b>\n'
            f'Action: {action}\n'
            f'Factor: {factor}  Deviation: {dev:+.3f}  Band: ±{band:.3f}\n'
            f'Regime: {regime}  Alignment: {align:.0%}\n'
            f'Suggested: {pairs}'
        )

        r = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
            timeout=10,
        )
        if r.status_code == 200:
            log.info('[BETA] Telegram alert sent')
        else:
            log.debug(f'[BETA] Telegram send failed: {r.status_code}')
    except Exception as exc:
        log.debug(f'[BETA] Telegram alert error: {exc}')


def _append_beta_history(regime: str, estimates: dict) -> None:
    """Append current beta snapshot to the rolling history log (for beta_regime_table.py)."""
    try:
        os.makedirs(_BETA_HISTORY_DIR, exist_ok=True)
        record = json.dumps({
            'ts':        int(time.time() * 1000),
            'regime':    regime,
            'estimates': estimates,
        })
        with open(_BETA_HISTORY_FILE, 'a', encoding='utf-8') as f:
            f.write(record + '\n')
    except Exception as exc:
        log.debug(f'BetaEstimator: history append failed: {exc}')


# ── Live price (fast path) ────────────────────────────────────────────────────

def fetch_current_price(pair: str, base_url: str) -> float | None:
    """
    Priority 1 — MT5 tick: local memory call, sub-millisecond, no network.
    Priority 2 — Dashboard /api/quote: ~100ms network round-trip, used in
                 paper mode or when MT5 isn't available.
    """
    if HAS_MT5:
        try:
            tick = mt5.symbol_info_tick(_mt5_sym(pair))
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
        bars = mt5.copy_rates_from_pos(_mt5_sym(pair), tf, 0, count)
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
    exec_cfg            = config.get('execution') or {}
    min_grade, min_stars = resolve_grade_thresholds(exec_cfg)
    bardir               = (exec_cfg.get('bardir') or 'auto').lower()
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

    def __init__(self, config: dict, paper_mode: bool = False):
        ec = config.get('execution') or {}
        self.paper_mode     = paper_mode
        self.bypass         = bool(ec.get('bypass_risk_guard', False))
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
        self._last_reset_month:  str | None = None       # 'YYYY-MM'

    def update_balance(self, balance: float) -> None:
        today       = datetime.now(timezone.utc).date()
        this_month  = today.strftime('%Y-%m')

        if self._day_start_bal is None:
            self._day_start_bal = balance
            self._last_reset_date = today
        if self._month_start_bal is None or self._last_reset_month is None:
            self._month_start_bal  = balance
            self._last_reset_month = this_month

        # Midnight daily reset
        if self._last_reset_date and today > self._last_reset_date:
            log.info(f'Midnight reset: day_start_bal {self._day_start_bal:.2f} → {balance:.2f}')
            self._day_start_bal   = balance
            self._last_reset_date = today

        # Month-start reset
        if self._last_reset_month != this_month:
            log.info(f'Month reset: month_start_bal {self._month_start_bal:.2f} → {balance:.2f}')
            self._month_start_bal  = balance
            self._last_reset_month = this_month

    def reset_daily(self, balance: float) -> None:
        self._day_start_bal   = balance
        self._last_reset_date = datetime.now(timezone.utc).date()

    def record_trade(self, pair: str) -> None:
        self._last_trade_by_pair[pair] = time.time()

    def block_reason(self, balance: float, pair: str = '') -> str | None:
        now = time.time()

        skip_dd = self.paper_mode or self.bypass

        if not skip_dd:
            if now < self._locked_until:
                remaining_m = (self._locked_until - now) / 60
                return f'Locked out — {remaining_m:.0f}m remaining'

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
        else:
            # Log what the guard *would* have blocked so it isn't silently swallowed
            if now < self._locked_until:
                remaining_m = (self._locked_until - now) / 60
                log.warning(f'[RiskGuard BYPASSED] Would be locked out — {remaining_m:.0f}m remaining')
            elif self._day_start_bal:
                dd_pct = (self._day_start_bal - balance) / self._day_start_bal * 100
                if dd_pct >= self.dd_limit_pct:
                    log.warning(f'[RiskGuard BYPASSED] Daily DD {dd_pct:.1f}% ≥ limit {self.dd_limit_pct}% — would have locked')
            if self._month_start_bal:
                mdd_pct = (self._month_start_bal - balance) / self._month_start_bal * 100
                if mdd_pct >= self.monthly_dd_pct:
                    log.warning(f'[RiskGuard BYPASSED] Monthly DD {mdd_pct:.1f}% ≥ limit {self.monthly_dd_pct}% — would have locked')

        # Per-pair cooldown applies regardless of bypass
        if pair and pair in self._last_trade_by_pair:
            elapsed = now - self._last_trade_by_pair[pair]
            if elapsed < self.cooldown_secs:
                remaining_m = (self.cooldown_secs - elapsed) / 60
                return f'[{pair}] Cooldown — {remaining_m:.1f}m remaining'

        return None

    def to_dict(self) -> dict:
        return {
            'day_start_bal':      self._day_start_bal,
            'month_start_bal':    self._month_start_bal,
            'locked_until':       self._locked_until,
            'last_trade_by_pair': self._last_trade_by_pair,
            'last_reset_date':    self._last_reset_date.isoformat() if self._last_reset_date else None,
            'last_reset_month':   self._last_reset_month,
        }

    def restore_from_dict(self, d: dict) -> None:
        today      = datetime.now(timezone.utc).date()
        this_month = today.strftime('%Y-%m')

        self._day_start_bal        = d.get('day_start_bal')
        self._locked_until         = d.get('locked_until') or 0.0
        self._last_trade_by_pair   = d.get('last_trade_by_pair') or {}
        self._last_reset_month     = d.get('last_reset_month')

        # Reject stale month_start_bal: if saved month != this month, treat as None
        # so update_balance() resets it to current balance on the next tick.
        saved_month = d.get('last_reset_month')
        if saved_month == this_month:
            self._month_start_bal = d.get('month_start_bal')
        else:
            self._month_start_bal  = None
            self._last_reset_month = None

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
            f'[MacroFX-Bot] MT5 connected  account={info.login}  balance={info.balance:.2f} {info.currency}'
            f'  server={info.server}  leverage=1:{info.leverage}'
        )
    else:
        log.warning('[MacroFX-Bot] MT5 connected but account_info() returned None')
    return True


def _mt5_move_sl_to_be() -> None:
    for pos in mt5.positions_get() or []:
        if pos.magic != MAGIC:
            continue
        if pos.sl != pos.price_open:
            mt5.order_send({'action': mt5.TRADE_ACTION_SLTP, 'position': pos.ticket,
                            'sl': pos.price_open, 'tp': pos.tp})
            log.info(f'SL → breakeven: ticket {pos.ticket}')


def _mt5_close_all() -> None:
    for pos in mt5.positions_get() or []:
        if pos.magic != MAGIC:
            continue
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

    # R:R gate — skip trades where reward doesn't justify the risk
    min_rr = (config.get('execution') or {}).get('min_rr', 1.0) if config else 1.0
    if sl_tp.rr_ratio < min_rr:
        log.warning(
            f'RR BLOCK {pair}: R:R={sl_tp.rr_ratio} < min_rr={min_rr} — trade skipped'
        )
        return False

    if paper_mode:
        log.info('[PAPER] Signal logged — no order sent')
        return True

    if not HAS_MT5:
        log.error('MetaTrader5 not installed and --live mode is on')
        return False

    mt5_sym = _mt5_sym(pair)
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

    # Auto-detect supported filling mode — bitmask: 1=FOK, 2=IOC, 4=Return
    info         = mt5.symbol_info(mt5_sym)
    filling_mode = mt5.ORDER_FILLING_IOC  # safe fallback
    if info:
        allowed = info.filling_mode
        if   allowed & 1: filling_mode = mt5.ORDER_FILLING_FOK
        elif allowed & 2: filling_mode = mt5.ORDER_FILLING_IOC
        elif allowed & 4: filling_mode = mt5.ORDER_FILLING_RETURN

    if size <= 0:
        log.error(f'Invalid lot size {size} for {mt5_sym} — trade skipped (no SL set?)')
        return False

    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       mt5_sym,
        'volume':       float(size),
        'type':         order_type,
        'price':        exec_price,
        'sl':           sl_tp.sl,
        'tp':           sl_tp.tp,
        'deviation':    20,
        'magic':        20260001,
        'comment':      f'MacroFX {direction[0]} {entry.get("grade","?")} {entry.get("totalStars", 0)}★',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': filling_mode,
    })

    if res is None:
        log.error(f'MT5 order_send returned None for {mt5_sym} — {mt5.last_error()}')
        return False

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

    vol_result  = results.get('vol_gate')
    vol_mult    = vol_result.metadata.get('size_mult', 1.0) if vol_result else 1.0
    # Gold macro regime confidence feeds its own size multiplier — combines with vol sizing
    gold_result = results.get('gold_macro')
    gold_mult   = gold_result.metadata.get('size_mult', 1.0) if (gold_result and gold_result.passed) else 1.0
    # Regime confidence provides a continuous multiplier based on HMM+GARCH+ARMA certainty
    rc_result   = results.get('regime_confidence')
    rc_mult     = rc_result.metadata.get('size_mult', 1.0) if rc_result else 1.0
    risk_pct    = (config.get('position') or {}).get('risk_pct', 1.0) * vol_mult * gold_mult * rc_mult

    balance = 10_000.0
    if HAS_MT5 and not paper_mode:
        acct    = mt5.account_info()
        balance = float(acct.balance) if acct else 10_000.0

    sl_dist = abs(live_price - sl_tp.sl)
    size    = sl_tp_engine.position_size(balance, risk_pct, sl_dist, pair, sizing_mult)

    log.info(
        f'  [{pair}] ENTRY {direction} [{entry.get("grade","?")}] {entry.get("totalStars", 0)}★  '
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
        'ticket':   ticket if isinstance(ticket, int) and not isinstance(ticket, bool) else None,
    })
    return pair_status


# ── Telegram-mode evaluation (entry criteria only, no module pipeline) ────────

def evaluate_pair_telegram(state: dict, pair: str, config: dict, live_price: float,
                            sl_tp_engine: SLTPEngine, paper_mode: bool,
                            sizing_mult: float = 1.0,
                            level_cooldowns: dict | None = None) -> dict:
    """
    Enter when a KV entry matches the same criteria as the dashboard Telegram alert:
    grade ≥ min_grade, totalStars ≥ min_stars, direction set, signalScore ≥ threshold,
    price within ATR proximity.  All module pipeline logic is bypassed.
    Same SL/TP engine, same risk guard, same execution path as full mode.
    """
    snap        = state.get('regime_snapshot') or {}
    exec_cfg    = config.get('execution') or {}
    tg_cfg      = config.get('tg_mode') or {}

    min_grade, min_stars = resolve_grade_thresholds(exec_cfg)
    min_signal           = tg_cfg.get('min_signal_score', 0.55)
    pip_size    = _PIP_SIZES.get(pair, 0.0001)
    tol_pips    = (state.get('_tol_pips') or {}).get(pair) or exec_cfg.get('prox_pips', 8)
    tol_dist    = tol_pips * pip_size

    pair_snap   = (snap.get('pairs') or {}).get(pair) or {}
    entries     = pair_snap.get('entries') or []
    pair_status = {'pair': pair, 'action': 'skip', 'live_price': live_price, 'reason': ''}

    candidates  = [
        e for e in entries
        if (e.get('totalStars') or 0) >= min_stars
        and _GRADE_ORDER.get(e.get('grade') or 'D', 0) >= _GRADE_ORDER.get(min_grade, 3)
        and e.get('direction') in ('long', 'short')
        and (e.get('signalScore') or 0) >= min_signal
        and abs((e.get('price') or 0) - live_price) <= tol_dist
    ]

    if not candidates:
        pair_status['reason'] = (
            f'No entry meets TG criteria '
            f'(grade≥{min_grade} stars≥{min_stars} sig≥{min_signal} prox≤{tol_pips:.1f}p)'
        )
        return pair_status

    # Best candidate: highest stars, then highest signalScore
    entry       = max(candidates, key=lambda e: ((e.get('totalStars') or 0), (e.get('signalScore') or 0)))
    direction   = entry['direction'].upper()
    level_price = float(entry.get('price') or 0)
    dist_pips   = abs(live_price - level_price) / pip_size

    # Per-level deduplication — prevent re-firing same level+direction within cooldown window
    _cooldown_min = (config.get('execution') or {}).get('level_cooldown_min', 10)
    _ck = (pair, round(level_price, 5), direction)
    if level_cooldowns is not None:
        _last = level_cooldowns.get(_ck, 0)
        if time.time() - _last < _cooldown_min * 60:
            pair_status['reason'] = (
                f'LEVEL_COOLDOWN {direction} @ {level_price} '
                f'({(time.time() - _last) / 60:.1f}/{_cooldown_min}m elapsed)'
            )
            return pair_status

    sl_tp = sl_tp_engine.calculate(
        entry=entry, pair=pair, pair_data=pair_snap,
        direction=entry['direction'], price=live_price,
    )

    risk_pct = (config.get('position') or {}).get('risk_pct', 1.0)
    balance  = 10_000.0
    if HAS_MT5 and not paper_mode:
        acct    = mt5.account_info()
        balance = float(acct.balance) if acct else 10_000.0

    sl_dist = abs(live_price - sl_tp.sl) if sl_tp.sl else 0
    size    = sl_tp_engine.position_size(balance, risk_pct, sl_dist, pair, sizing_mult) if sl_dist else 0

    log.info(
        f'  [{pair}] TG-MODE {direction} [{entry.get("grade", "?")}] {entry.get("totalStars", 0)}★  '
        f'sig={entry.get("signalScore", 0):.2f}  '
        f'level={level_price}  live={live_price}  dist={dist_pips:.1f}pips  '
        f'SL={sl_tp.sl}  TP={sl_tp.tp}  R:R={sl_tp.rr_ratio}  lot={size}'
    )

    if not size:
        log.warning(f'[{pair}] TG-mode: size=0 (sl_tp.sl={sl_tp.sl}) — trade skipped')
        pair_status['reason'] = 'size=0 — SL missing from sl_tp calculation'
        return pair_status

    min_rr = (config.get('execution') or {}).get('min_rr', 1.0) if config else 1.0
    if sl_tp.rr_ratio < min_rr:
        log.warning(f'[{pair}] TG-mode RR BLOCK: R:R={sl_tp.rr_ratio} < min_rr={min_rr} — trade skipped')
        pair_status['reason'] = f'RR_BLOCK R:R={sl_tp.rr_ratio} < min_rr={min_rr}'
        return pair_status

    ticket = execute_trade(pair, direction, entry, sl_tp, size, live_price, paper_mode, config=config)

    # Record attempt so the cooldown gate blocks re-entry until window expires
    if level_cooldowns is not None:
        level_cooldowns[_ck] = time.time()

    pair_status.update({
        'action':           'trade',       'direction':       direction,
        'score':            round(entry.get('signalScore') or 0, 2),
        'grade':            entry.get('grade'),
        'stars':            entry.get('totalStars'),  'level':  level_price,
        'live':             live_price,    'dist_pips':       round(dist_pips, 1),
        'sl':               sl_tp.sl,      'tp':              sl_tp.tp,
        'tp1':              sl_tp.tp1,     'tp1_close_pct':   sl_tp.tp1_close_pct,
        'trailoffset_dist': sl_tp.trailoffset_dist,
        'rr':               sl_tp.rr_ratio, 'lot':            size,
        'executed':         bool(ticket),
        'ticket':           ticket if isinstance(ticket, int) and not isinstance(ticket, bool) else None,
        'mode':             'telegram',
    })
    return pair_status


# ── Diagnostic summary ────────────────────────────────────────────────────────

def log_diagnostic_summary(state: dict, live_prices: dict, config: dict, base_url: str) -> None:
    """
    Logs a compact confluence summary every DIAG_INTERVAL seconds.
    Shows each pair's entry levels, current price, and pip distance so the
    operator can verify the bot is reading levels correctly without waiting
    for a trade signal.
    """
    snap        = state.get('regime_snapshot') or {}
    pairs_snap  = snap.get('pairs') or {}
    enabled     = config.get('enabled_pairs') or []
    exec_cfg              = config.get('execution') or {}
    min_grade, min_stars  = resolve_grade_thresholds(exec_cfg)

    all_syms = list(pairs_snap.keys())
    if not all_syms:
        log.info('[DIAG] No entry data in regime_snapshot — push levels from dashboard (📤 Push to Bot)')
        return

    if not enabled:
        log.info('[DIAG] enabled_pairs is empty in bot_config — bot will not trade. '
                 'Configure pairs via the bot-config panel on the dashboard.')

    # Fetch prices for any pair not already in live_prices (covers disabled pairs too)
    prices: dict[str, float] = dict(live_prices)
    for sym in all_syms:
        if sym not in prices:
            p = fetch_quote(sym, base_url)
            if p:
                prices[sym] = p

    lines = []
    for sym in all_syms:
        entries  = pairs_snap[sym].get('entries') or []
        price    = prices.get(sym)
        pip      = _PIP_SIZES.get(sym, 0.0001)
        tag      = '' if sym in enabled else ' [not enabled]'

        if not entries:
            lines.append(f'  {sym}{tag}: no entries')
            continue

        price_str = f'{price}' if price else 'no price'

        entry_parts = []
        for e in sorted(entries, key=lambda x: abs((x.get('price') or 0) - (price or 0))):
            ep     = e.get('price') or 0
            stars  = e.get('totalStars') or 0
            grade  = e.get('grade') or '?'
            dirn   = '↑' if e.get('direction') == 'long' else ('↓' if e.get('direction') == 'short' else '~')
            if price:
                dist = abs(ep - price) / pip
                dist_str = f'{dist:.1f}p'
            else:
                dist_str = '?p'
            skip = '' if (stars >= min_stars and _GRADE_ORDER.get(grade, 0) >= _GRADE_ORDER.get(min_grade, 3)) else f'[skip<{min_grade}]'
            entry_parts.append(f'{dirn}{ep}({grade} {stars}★ {dist_str}){skip}')

        # Show closest 6 entries to keep log lines manageable
        shown   = entry_parts[:6]
        more    = len(entry_parts) - len(shown)
        suffix  = f' +{more} more' if more > 0 else ''
        lines.append(f'  {sym}{tag} @ {price_str} | {" ".join(shown)}{suffix}')

    pushed_at = snap.get('pushed_at', 'unknown')
    log.info(f'[DIAG] Snapshot pushed_at={pushed_at}  min_grade={min_grade} (≥{min_stars}★)\n' + '\n'.join(lines))


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
    level_cooldowns: dict[tuple, float] = {}  # (pair, level_price, direction) → last_attempt_ts

    # Position metadata — keyed by MT5 ticket int, holds TP1/trail state
    position_meta: dict[int, dict] = {
        int(k): v for k, v in (persisted.get('position_meta') or {}).items()
        if str(k).lstrip('-').isdigit()
    }

    # State save interval (every 60s to avoid disk churn)
    STATE_SAVE_INTERVAL = 60

    last_window_warn:  float = 0.0
    last_stale_warn:   float = 0.0
    last_heartbeat:    float = 0.0
    last_diag:         float = 0.0
    HEARTBEAT_INTERVAL = 5 * 60  # log alive message every 5 min when monitoring quietly
    DIAG_INTERVAL      = 30      # diagnostic confluence dump every 30s

    # ── Beta system state ─────────────────────────────────────────────────────
    beta_estimator: BetaEstimator = BetaEstimator()
    cached_beta_estimates: dict = {}
    cached_beta_targets: dict = {}
    last_beta_push: float = 0.0
    last_beta_targets_fetch: float = 0.0
    last_regime_table_build: float = 0.0
    BETA_TARGETS_INTERVAL      = 300          # re-fetch custom targets every 5 min
    REGIME_TABLE_BUILD_INTERVAL = 7 * 24 * 3600  # auto-rebuild regime table weekly

    # ── Two-speed loop ────────────────────────────────────────────────────────
    while True:
        tick_start = time.time()

        # ── Slow path: refresh dashboard state + run beta estimation ─────────
        if tick_start - last_state_refresh >= state_interval or cached_state is None:
            try:
                trigger_refresh(base_url)   # touch KV timestamps — keeps staleness gate clear
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

            # Beta estimation on H4 bars — runs once per state refresh cycle
            try:
                _enabled = (cached_state.get('bot_config') or {}).get('enabled_pairs') or []
                new_estimates = _run_beta_estimation(beta_estimator, _enabled, base_url)
                if new_estimates:
                    cached_beta_estimates = new_estimates
                    _regime_for_history = _dominant_regime(cached_state, _enabled)
                    _append_beta_history(_regime_for_history, new_estimates)
            except Exception as exc:
                log.warning(f'Beta estimation error: {exc}')

            # Periodically re-fetch custom beta targets from KV
            if tick_start - last_beta_targets_fetch >= BETA_TARGETS_INTERVAL:
                try:
                    cached_beta_targets = fetch_beta_targets(base_url)
                    last_beta_targets_fetch = tick_start
                except Exception:
                    pass

            # Weekly auto-rebuild of regime-conditional beta table
            if tick_start - last_regime_table_build >= REGIME_TABLE_BUILD_INTERVAL:
                try:
                    import subprocess as _sp
                    _script = os.path.join(os.path.dirname(__file__), '..', 'RegimeV2', 'beta_regime_table.py')
                    if os.path.exists(_BETA_HISTORY_FILE) and os.path.exists(_script):
                        log.info('[BETA] Weekly regime table rebuild starting…')
                        _sp.Popen(
                            ['python', _script, '--update-targets', '--url', base_url],
                            stdout=_sp.DEVNULL, stderr=_sp.DEVNULL,
                        )
                except Exception as exc:
                    log.debug(f'[BETA] Regime table rebuild error: {exc}')
                last_regime_table_build = tick_start

        config         = cached_state.get('bot_config') or {}
        snap           = cached_state.get('regime_snapshot') or {}
        enabled_pairs  = config.get('enabled_pairs') or []
        exec_cfg       = config.get('execution') or {}

        # Re-create RiskGuard whenever execution config changes (picks up /tier, /sizing etc.)
        risk_cfg_hash = hash(str(exec_cfg))
        if risk_guard is None or risk_cfg_hash != _last_risk_config_hash:
            prev = risk_guard
            risk_guard = RiskGuard(config, paper_mode=paper_mode)

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

            if risk_guard.bypass:
                log.warning('=' * 60)
                log.warning('  !! RiskGuard BYPASSED — bypass_risk_guard=true in config !!')
                log.warning('  DD lockouts and monthly limits are NOT enforced.')
                log.warning('  Remove bypass_risk_guard from execution config when done.')
                log.warning('=' * 60)

        # ── Dashboard override: force-unlock RiskGuard ───────────────────────
        if risk_guard and base_url:
            try:
                import urllib.request as _ur  # stdlib, safe to import inline
                _ov_url = f'{base_url.rstrip("/")}/api/kv/get?key=bot_override'
                with _ur.urlopen(_ov_url, timeout=3) as _r:
                    _ov = json.loads(_r.read())
                if not _ov.get('miss') and _ov.get('data', {}).get('force_unlock'):
                    _ts = _ov['data'].get('timestamp', 0) / 1000
                    if time.time() - _ts < 300:   # only honour if < 5 min old
                        risk_guard._locked_until        = 0.0
                        risk_guard._day_start_bal       = None  # reset DD baseline so block_reason doesn't immediately re-lock
                        risk_guard._last_trade_by_pair  = {}    # also clear per-pair cooldowns
                        log.info('RiskGuard lockout + cooldowns cleared by dashboard override — DD baseline reset')
                        # Acknowledge by writing force_unlock: false
                        _ack = json.dumps({'key': 'bot_override', 'data': {'force_unlock': False},
                                           'timestamp': int(time.time() * 1000)}).encode()
                        _req = _ur.Request(f'{base_url.rstrip("/")}/api/kv/set',
                                           data=_ack, headers={'Content-Type': 'application/json'},
                                           method='POST')
                        with _ur.urlopen(_req, timeout=3):
                            pass
            except Exception:
                pass   # override check is best-effort; never block the main loop

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
            # Always attempt refresh when stale — don't throttle the call itself
            ok, refreshed = trigger_refresh(base_url)
            if ok:
                last_state_refresh = 0  # force immediate re-fetch next tick
            # Only log + push status at most once every 5 min to avoid spam
            if tick_start - last_stale_warn >= 5 * 60:
                log.warning(f'STALE DATA: {exc}')
                if ok:
                    log.info(f'Server refresh triggered — touched {len(refreshed)} pairs {refreshed}  forcing state re-fetch')
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

        # ── Diagnostic confluence dump every 30s ──────────────────────────────
        if tick_start - last_diag >= DIAG_INTERVAL:
            log_diagnostic_summary(cached_state, live_prices, config, base_url)
            last_diag = tick_start

        # ── Position management (runs every tick, before new entries) ─────────
        mgmt_actions = manage_positions(position_meta, paper_mode)
        if mgmt_actions:
            log.info(f'Position actions this tick: {mgmt_actions}')

        # ── Beta portfolio tracking (throttled to BETA_PUSH_INTERVAL) ─────────
        if cached_beta_estimates and tick_start - last_beta_push >= BETA_PUSH_INTERVAL:
            try:
                _regime_now = _dominant_regime(cached_state, enabled_pairs)
                _run_beta_portfolio_tracking(
                    cached_beta_estimates, _regime_now, base_url,
                    paper_mode, cached_beta_targets,
                )
            except Exception as exc:
                log.debug(f'Beta portfolio tracking error: {exc}')
            last_beta_push = tick_start

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
        has_real_balance = False
        if HAS_MT5 and not paper_mode:
            acct = mt5.account_info()
            if acct:
                live_balance = acct.balance
                has_real_balance = True

        # Only update DD baseline when we have a real balance — the 10k fallback
        # would trigger a false lockout against a persisted day_start_bal from
        # a previous session or different account.
        if has_real_balance:
            risk_guard.update_balance(live_balance)

        # For DD checks: use real balance, or a large placeholder so DD stays
        # negative and no lockout fires. Time-based lockout/cooldown checks
        # in block_reason are unaffected by the balance value.
        guard_balance = live_balance if has_real_balance else 1_000_000.0

        # Per-pair risk check — filter near_level to only unblocked pairs
        blocked_pairs: list[str] = []
        for pair in list(near_level.keys()):
            block = risk_guard.block_reason(guard_balance, pair=pair)
            if block:
                log.warning(f'RiskGuard [{pair}]: {block}')
                blocked_pairs.append(pair)
                del near_level[pair]

        # Session-level checks (lockout, DD) — clear everything if triggered
        session_block = risk_guard.block_reason(guard_balance, pair='')
        if session_block and not blocked_pairs:
            log.warning(f'RiskGuard SESSION: {session_block}')
            near_level = {}

        bot_mode = config.get('mode', 'full')

        for pair, live_price in near_level.items():
            if trades_this_tick >= max_trades:
                break

            log.info(f'--- {pair}  live={live_price}  mode={bot_mode} ---')
            try:
                if bot_mode == 'telegram':
                    pair_status = evaluate_pair_telegram(
                        cached_state, pair, config, live_price, sl_tp_engine, paper_mode,
                        sizing_mult=risk_guard.sizing_mult,
                        level_cooldowns=level_cooldowns,
                    )
                else:
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
                'mt5_positions':        _serialize_open_positions(MAGIC),
                'today_closed_trades': _serialize_closed_trades(MAGIC),
                'mode':              config.get('mode', 'full'),
                'min_grade':         exec_cfg.get('min_grade', 'B'),
                'bardir':            exec_cfg.get('bardir', 'auto'),
                'wtthreshold':       exec_cfg.get('wtthreshold', 35),
                'sizing':            risk_guard.sizing_mult,
                'ddlimit':           risk_guard.dd_limit_pct,
                'monthlydd':         risk_guard.monthly_dd_pct,
                'cooldown_min':      exec_cfg.get('cooldown', 60),
                'balance':           live_balance,
                'account_login':     acct.login if has_real_balance else None,
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
