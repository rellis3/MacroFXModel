"""
Macro-Regime Equity Bot — Monthly rebalancing bot driven by 5-factor US macro signal.

Reads config from KV (macro_equity_config), connects to MT5, and rebalances
equity index positions on the last trading day of each month based on the
composite macro score from FRED data.

Config key  : macro_equity_config
Creds key   : macro_equity_credentials
Status key  : macro_equity_bot_status

Usage:
  python MacroEquityBot/macro_equity_bot.py
  python MacroEquityBot/macro_equity_bot.py --live
  python MacroEquityBot/macro_equity_bot.py --dashboard-url https://your-app.up.railway.app
  python MacroEquityBot/macro_equity_bot.py --force-rebalance   (skip month-end check)
"""

import argparse
import logging
import math
import os
import sys
import time
from datetime import datetime, date, timedelta, timezone
from typing import Optional

import requests

sys.path.insert(0, os.path.dirname(__file__))
from fred_signal import (
    fetch_all_fred, compute_macro_score,
    compute_target_alloc, _fetch_vix_prices,
)

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

MAGIC = 20260006

KV_CONFIG = 'macro_equity_config'
KV_CREDS  = 'macro_equity_credentials'
KV_STATUS = 'macro_equity_bot_status'

# Instruments: key → (label, is_inverted, eu_mode, default_mt5_symbol)
INSTRUMENT_DEFS = {
    'QQQ':  ('QQQ — Nasdaq-100',     False, False, 'NAS100'),
    'SPY':  ('SPY — S&P 500',        False, False, 'SP500'),
    'IWM':  ('IWM — Russell 2000',   False, False, 'US2000'),
    'TLT':  ('TLT — 20Y+ Treasury',  True,  False, 'USB30Y'),
    'DAX':  ('DAX — Germany 40',     False, True,  'GER40'),
    'GOLD': ('GLD — Gold',           False, False, 'XAUUSD'),
    'BIL':  ('BIL — T-Bills',        True,  False, ''),   # cash position — not traded
}

DEFAULT_CFG: dict = {
    'enabled':             True,
    'paper_mode':          True,
    'dashboard_url':       'http://localhost:3000',
    'poll_interval_s':     3600,
    'rebalance_threshold': 0.05,    # 5pp change triggers rebalance

    # FRED
    'fred_api_key': '',

    # Instrument toggles (QQQ and SPY always on)
    'include_qqq':     True,
    'include_spy':     True,
    'include_russell': False,
    'include_tlt':     False,
    'include_dax':     False,
    'include_gold':    False,
    'include_bil':     False,
    'portfolio_mode':  False,

    # MT5 symbol names (broker-specific — adjust to match your broker)
    'symbol_qqq':     'NAS100',
    'symbol_spy':     'SP500',
    'symbol_russell': 'US2000',
    'symbol_tlt':     'USB30Y',
    'symbol_dax':     'GER40',
    'symbol_gold':    'XAUUSD',

    # Factor weights (must sum to 1.0)
    'w_net_liq':    0.40,
    'w_curve':      0.20,
    'w_credit':     0.20,
    'w_real_yield': 0.15,
    'w_ism':        0.05,

    # Allocation band thresholds
    'band_high':  1.0,
    'band_mid':   0.0,
    'band_low':  -1.0,

    # Minimum allocations (floors)
    'alloc_floor':          0.50,   # equity instruments
    'inverted_alloc_floor': 0.20,   # bond/defensive instruments (portfolio mode)

    # Walk-forward (used by backtester; stored here for consistency)
    'wf_train': 504,
    'wf_test':  252,
    'wf_step':  63,
}

# ── Logging ────────────────────────────────────────────────────────────────────
os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'logs'), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [MEBot] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            os.path.join(os.path.dirname(__file__), '..', 'logs', 'macro_equity_bot.log'),
            encoding='utf-8',
        ),
    ],
)
log = logging.getLogger(__name__)


# ── KV helpers ─────────────────────────────────────────────────────────────────

def _kv_get(key: str, url: str) -> Optional[dict]:
    try:
        r = requests.get(f'{url}/api/kv/get?key={key}', timeout=10)
        if r.status_code == 403:
            log.error(f'KV get {key}: 403 key not permitted — add to _worker.js whitelist')
            return None
        j = r.json()
        if j.get('error'):
            log.warning(f'KV get {key}: server error: {j["error"]}')
            return None
        return None if (j.get('miss') or not j.get('data')) else j['data']
    except Exception as e:
        log.warning(f'KV get {key} failed: {e}')
        return None


def _kv_put(key: str, data: dict, url: str) -> None:
    try:
        requests.post(
            f'{url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=10,
        )
    except Exception as e:
        log.warning(f'KV put {key} failed: {e}')


# ── Config / credentials ───────────────────────────────────────────────────────

def load_config(url: str) -> dict:
    stored = _kv_get(KV_CONFIG, url)
    cfg = dict(DEFAULT_CFG)
    if stored:
        cfg.update(stored)
    return cfg


def load_credentials(url: str) -> None:
    creds = _kv_get(KV_CREDS, url)
    if not creds:
        log.warning('KV credentials not found (key=%s) — will use env vars / already-open MT5 terminal', KV_CREDS)
        return
    log.info('Credentials loaded from KV: account=%s  server=%s',
             creds.get('mt5_account', '?'), creds.get('mt5_server', '?'))
    for env_key, cred_key in [
        ('MT5_ACCOUNT',  'mt5_account'),
        ('MT5_PASSWORD', 'mt5_password'),
        ('MT5_SERVER',   'mt5_server'),
        ('MT5_PATH',     'mt5_path'),
    ]:
        if creds.get(cred_key):
            os.environ[env_key] = str(creds[cred_key])


# ── MT5 connection ─────────────────────────────────────────────────────────────

def mt5_connect() -> bool:
    if not HAS_MT5:
        log.warning('MetaTrader5 package not installed — paper mode only')
        return False
    path = os.environ.get('MT5_PATH') or None
    ok = mt5.initialize(path=path) if path else mt5.initialize()
    if not ok:
        log.error(f'mt5.initialize() failed: {mt5.last_error()}')
        return False
    account = int(os.environ.get('MT5_ACCOUNT', 0))
    password = os.environ.get('MT5_PASSWORD', '')
    server   = os.environ.get('MT5_SERVER', '')
    if account:
        ok = mt5.login(account, password=password, server=server)
        if not ok:
            log.error(f'mt5.login() failed: {mt5.last_error()}')
            mt5.shutdown()
            return False
    info = mt5.account_info()
    log.info(f'MT5 connected: account={info.login}  balance={info.balance}  server={info.server}')
    return True


# ── Price data from MT5 ────────────────────────────────────────────────────────

def get_d1_closes(symbol: str, count: int = 300) -> list[float]:
    """Fetch count daily closing prices for symbol. Returns oldest-first list."""
    if not HAS_MT5:
        return []
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, count)
    if rates is None or len(rates) == 0:
        log.warning(f'No D1 data for {symbol}')
        return []
    return [float(r['close']) for r in rates]


def get_account_equity() -> float:
    if not HAS_MT5:
        return 10000.0
    info = mt5.account_info()
    return float(info.equity) if info else 10000.0


def get_current_lots(symbol: str) -> float:
    """Total long lots currently held for symbol (our MAGIC)."""
    if not HAS_MT5:
        return 0.0
    positions = mt5.positions_get(symbol=symbol) or []
    total = sum(p.volume for p in positions if p.magic == MAGIC and p.type == 0)
    return round(total, 2)


# ── Position sizing ────────────────────────────────────────────────────────────

def compute_target_lots(symbol: str, target_alloc: float, equity: float) -> float:
    """Convert allocation percentage to MT5 lots for symbol."""
    if not HAS_MT5 or not symbol:
        return 0.0
    info = mt5.symbol_info(symbol)
    if info is None:
        log.warning(f'Symbol {symbol} not found in MT5')
        return 0.0
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return 0.0
    price         = tick.ask
    contract_size = info.trade_contract_size
    if price <= 0 or contract_size <= 0:
        return 0.0
    notional    = equity * target_alloc
    raw_lots    = notional / (price * contract_size)
    step        = info.volume_step
    lots        = round(raw_lots / step) * step
    lots        = max(lots, info.volume_min)
    lots        = min(lots, info.volume_max)
    return round(lots, 2)


# ── Order execution ────────────────────────────────────────────────────────────

def _send_order(symbol: str, action: int, lots: float, comment: str, paper_mode: bool) -> bool:
    """Send a market order. action: mt5.ORDER_TYPE_BUY / SELL."""
    if paper_mode:
        log.info(f'[PAPER] {symbol}  {"BUY" if action == 0 else "SELL"}  {lots:.2f} lots  — {comment}')
        return True
    if not HAS_MT5:
        return False
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return False
    price = tick.ask if action == mt5.ORDER_TYPE_BUY else tick.bid
    req = {
        'action':    mt5.TRADE_ACTION_DEAL,
        'symbol':    symbol,
        'volume':    lots,
        'type':      action,
        'price':     price,
        'deviation': 30,
        'magic':     MAGIC,
        'comment':   comment[:31],
        'type_time': mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(req)
    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
        log.info(f'Order OK {symbol} {lots:.2f}L  ticket={result.order}')
        return True
    log.error(f'Order FAILED {symbol}: {result}')
    return False


def rebalance_instrument(
    symbol: str,
    key: str,
    target_alloc: float,
    equity: float,
    paper_mode: bool,
    threshold: float,
) -> dict:
    """
    Adjust position in symbol to match target_alloc.
    Returns action taken: {'action': 'buy'|'sell'|'hold'|'skip', 'lots': ..., 'alloc': ...}
    """
    if not symbol:
        return {'action': 'skip', 'reason': 'no symbol', 'target_alloc': target_alloc}

    current_lots  = get_current_lots(symbol)
    target_lots   = compute_target_lots(symbol, target_alloc, equity)

    info = mt5.symbol_info(symbol) if HAS_MT5 else None
    if info is None and not paper_mode:
        return {'action': 'skip', 'reason': 'symbol unavailable', 'target_alloc': target_alloc}

    diff_lots = round(target_lots - current_lots, 2)
    # Compute approximate alloc% of change to compare vs threshold
    tick = mt5.symbol_info_tick(symbol) if HAS_MT5 else None
    price = tick.ask if tick else 0
    contract_size = info.trade_contract_size if info else 1
    diff_notional = abs(diff_lots) * price * contract_size
    diff_alloc    = diff_notional / equity if equity > 0 else 0

    if diff_alloc < threshold and current_lots > 0:
        log.info(f'{key} ({symbol}): change {diff_alloc:.1%} < threshold {threshold:.0%} — hold')
        return {'action': 'hold', 'current_lots': current_lots,
                'target_lots': target_lots, 'target_alloc': target_alloc}

    if diff_lots > 0:
        ok = _send_order(symbol, mt5.ORDER_TYPE_BUY if HAS_MT5 else 0,
                         diff_lots, f'ME_rebal_{key}', paper_mode)
        return {'action': 'buy', 'lots': diff_lots, 'target_alloc': target_alloc, 'ok': ok}
    elif diff_lots < 0:
        close_lots = abs(diff_lots)
        # For equity-long-only: reduce position by selling existing lots
        if not paper_mode and HAS_MT5:
            positions = [p for p in (mt5.positions_get(symbol=symbol) or [])
                         if p.magic == MAGIC and p.type == 0]
            remaining = close_lots
            for pos in sorted(positions, key=lambda p: p.volume):
                if remaining <= 0:
                    break
                close_vol = min(pos.volume, remaining)
                req = {
                    'action':   mt5.TRADE_ACTION_DEAL,
                    'symbol':   symbol,
                    'volume':   round(close_vol, 2),
                    'type':     mt5.ORDER_TYPE_SELL,
                    'position': pos.ticket,
                    'price':    mt5.symbol_info_tick(symbol).bid,
                    'deviation': 30,
                    'magic':    MAGIC,
                    'comment':  f'ME_reduce_{key}'[:31],
                    'type_time':    mt5.ORDER_TIME_GTC,
                    'type_filling': mt5.ORDER_FILLING_IOC,
                }
                result = mt5.order_send(req)
                if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                    remaining -= close_vol
        else:
            log.info(f'[PAPER] REDUCE {symbol} by {close_lots:.2f} lots  (ME_reduce_{key})')
        return {'action': 'sell', 'lots': close_lots, 'target_alloc': target_alloc}
    else:
        return {'action': 'hold', 'current_lots': current_lots,
                'target_lots': target_lots, 'target_alloc': target_alloc}


# ── Month-end detection ────────────────────────────────────────────────────────

def is_last_trading_day_of_month() -> bool:
    """True if today is the last or second-to-last weekday of the current month."""
    today = date.today()
    # Find last calendar day of month
    if today.month == 12:
        next_month_first = date(today.year + 1, 1, 1)
    else:
        next_month_first = date(today.year, today.month + 1, 1)
    last_cal_day = next_month_first - timedelta(days=1)
    # Walk backwards to find the last weekday (Mon-Fri)
    last_trading = last_cal_day
    while last_trading.weekday() >= 5:  # Sat=5, Sun=6
        last_trading -= timedelta(days=1)
    # Also accept the day before last trading day (to handle early-close days)
    prev_trading = last_trading - timedelta(days=1)
    while prev_trading.weekday() >= 5:
        prev_trading -= timedelta(days=1)
    return today in (last_trading, prev_trading) and today.weekday() < 5


# ── Position serialization (same shape as regimev2) ───────────────────────────

def _serialize_open_positions() -> list[dict]:
    if not HAS_MT5:
        return []
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


def _serialize_closed_trades() -> list[dict]:
    if not HAS_MT5:
        return []
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    deals = mt5.history_deals_get(today, today + timedelta(days=1)) or []
    by_pos: dict[int, list] = {}
    for d in deals:
        if d.magic != MAGIC:
            continue
        by_pos.setdefault(d.position_id, []).append(d)
    out = []
    for pos_id, ds in by_pos.items():
        entries = [d for d in ds if d.entry == 0]
        exits   = [d for d in ds if d.entry == 1]
        if not exits:
            continue
        ex = exits[-1]
        en = entries[0] if entries else None
        out.append({
            'position_id': int(pos_id),
            'symbol':      ex.symbol,
            'direction':   'BUY' if ex.type == 1 else 'SELL',
            'lots':        round(float(ex.volume), 2),
            'open_price':  round(float(en.price), 5) if en else None,
            'close_price': round(float(ex.price), 5),
            'profit':      round(sum(d.profit for d in ds), 2),
            'swap':        round(sum(d.swap   for d in ds), 2),
            'commission':  round(sum(d.commission for d in ds), 2),
            'time_open':   int(en.time) if en else None,
            'time_close':  int(ex.time),
            'comment':     str(ex.comment or ''),
        })
    return out


# ── Status push ────────────────────────────────────────────────────────────────

def push_status(
    signal: dict,
    instrument_status: dict,
    balance: float,
    paper_mode: bool,
    url: str,
    next_rebalance: Optional[str] = None,
    rebalance_log: Optional[list] = None,
) -> None:
    _kv_put(KV_STATUS, {
        'signal':             signal,
        'instruments':        instrument_status,
        'balance':            round(balance, 2),
        'paper_mode':         paper_mode,
        'pushed_at':          time.time(),
        'version':            'v1',
        'next_rebalance':     next_rebalance,
        'rebalance_log':      rebalance_log or [],
        'mt5_positions':      _serialize_open_positions(),
        'today_closed_trades':_serialize_closed_trades(),
    }, url)


# ── Core rebalance cycle ───────────────────────────────────────────────────────

def do_rebalance(cfg: dict, paper_mode: bool, vix_closes: list[float]) -> dict:
    """Fetch FRED data, compute signal, rebalance all enabled instruments."""
    api_key = cfg.get('fred_api_key', '')
    if not api_key:
        log.error('No FRED API key configured — cannot compute macro signal')
        return {}

    weights = {
        'netliq':    cfg.get('w_net_liq',    0.40),
        'curve':     cfg.get('w_curve',      0.20),
        'credit':    cfg.get('w_credit',     0.20),
        'realyield': cfg.get('w_real_yield', 0.15),
        'ism':       cfg.get('w_ism',        0.05),
    }
    bands = {
        'high': cfg.get('band_high',  1.0),
        'mid':  cfg.get('band_mid',   0.0),
        'low':  cfg.get('band_low',  -1.0),
    }
    equity_floor   = cfg.get('alloc_floor',          0.50)
    inverted_floor = cfg.get('inverted_alloc_floor',  0.20)
    threshold      = cfg.get('rebalance_threshold',   0.05)
    portfolio_mode = cfg.get('portfolio_mode',        False)

    # Enabled instruments
    active: dict[str, dict] = {}
    if cfg.get('include_qqq', True):
        active['QQQ'] = {'symbol': cfg.get('symbol_qqq', 'NAS100'), 'inverted': False, 'eu_mode': False}
    if cfg.get('include_spy', True):
        active['SPY'] = {'symbol': cfg.get('symbol_spy', 'SP500'),  'inverted': False, 'eu_mode': False}
    if cfg.get('include_russell'):
        active['IWM'] = {'symbol': cfg.get('symbol_russell', 'US2000'), 'inverted': False, 'eu_mode': False}
    if cfg.get('include_tlt'):
        active['TLT'] = {'symbol': cfg.get('symbol_tlt', 'USB30Y'), 'inverted': True,  'eu_mode': False}
    if cfg.get('include_dax'):
        active['DAX'] = {'symbol': cfg.get('symbol_dax', 'GER40'),  'inverted': False, 'eu_mode': True}
    if cfg.get('include_gold'):
        active['GOLD'] = {'symbol': cfg.get('symbol_gold', 'XAUUSD'), 'inverted': False, 'eu_mode': False}
    if cfg.get('include_bil'):
        active['BIL'] = {'symbol': '', 'inverted': True, 'eu_mode': False}  # cash — not traded

    any_eu = any(v['eu_mode'] for v in active.values())

    # Fetch FRED data (fetch EU PMI if any EU instrument enabled)
    log.info('Fetching FRED macro data…')
    fred_raw = fetch_all_fred(api_key, eu_mode=any_eu)

    # Compute macro scores (US and EU variants)
    signal_us = compute_macro_score(fred_raw, weights, eu_mode=False)
    signal_eu = compute_macro_score(fred_raw, weights, eu_mode=True) if any_eu else signal_us
    log.info(f'Macro score: US={signal_us["score"]:.3f} ({signal_us["regime"]})'
             + (f'  EU={signal_eu["score"]:.3f}' if any_eu else ''))

    equity   = get_account_equity()
    eq_keys  = [k for k, v in active.items() if not v['inverted']]
    inv_keys = [k for k, v in active.items() if v['inverted'] and v['symbol']]

    instrument_status: dict[str, dict] = {}
    actions: list[dict] = []

    for key, inst in active.items():
        symbol    = inst['symbol']
        inverted  = inst['inverted']
        eu_mode   = inst['eu_mode']
        signal    = signal_eu if eu_mode else signal_us
        score     = signal['score']
        floor     = inverted_floor if inverted else equity_floor

        closes = get_d1_closes(symbol, 300) if (HAS_MT5 and symbol) else []

        if portfolio_mode and inv_keys:
            # Portfolio mode: equity alloc driven by signal, bond fills remainder
            if not inverted:
                raw_eq_alloc  = compute_target_alloc(score, closes, vix_closes, bands, equity_floor)
                bond_alloc    = max(inverted_floor, 1.0 - raw_eq_alloc)
                target_alloc  = 1.0 - bond_alloc   # actual equity fraction
            else:
                # All inverted instruments split the bond sleeve equally
                n_inv = len(inv_keys)
                raw_eq_alloc  = compute_target_alloc(signal_us['score'], [], vix_closes, bands, equity_floor)
                bond_total    = max(inverted_floor, 1.0 - raw_eq_alloc)
                target_alloc  = bond_total / n_inv
        else:
            target_alloc = compute_target_alloc(score, closes, vix_closes, bands, floor, inverted)

        instrument_status[key] = {
            'label':        INSTRUMENT_DEFS.get(key, ('', False, False, ''))[0],
            'symbol':       symbol,
            'target_alloc': round(target_alloc, 4),
            'score':        round(score, 3),
            'regime':       signal['regime'],
        }

        if not symbol:
            log.info(f'{key}: cash position (no MT5 symbol) — target {target_alloc:.0%}')
            continue

        action = rebalance_instrument(symbol, key, target_alloc, equity, paper_mode, threshold)
        instrument_status[key]['action'] = action.get('action')
        actions.append({'key': key, **action})
        log.info(f'{key} ({symbol}): target={target_alloc:.0%}  action={action.get("action")}')

    return {
        'signal_us':          signal_us,
        'signal_eu':          signal_eu if any_eu else None,
        'instrument_status':  instrument_status,
        'actions':            actions,
        'equity':             round(equity, 2),
    }


# ── Main loop ──────────────────────────────────────────────────────────────────

def run(url: str, paper_mode: bool, force_rebalance: bool = False, live_override: bool = False) -> None:
    log.info(f'MacroEquityBot starting  paper={paper_mode}  live_override={live_override}  dashboard={url}')

    load_credentials(url)

    if not paper_mode:
        if not mt5_connect():
            log.warning('MT5 connection failed — switching to paper mode')
            paper_mode = True

    cfg         = load_config(url)
    vix_closes  : list[float] = []
    rebalance_log: list[dict] = []
    last_cfg_reload   = time.time()
    last_vix_fetch    = 0.0
    last_rebalance_ym = ''

    log.info(
        f'Config: paper_mode_kv={cfg["paper_mode"]}  effective_paper={paper_mode}  '
        f'QQQ={cfg["include_qqq"]}  SPY={cfg["include_spy"]}  '
        f'Russell={cfg["include_russell"]}  TLT={cfg["include_tlt"]}  '
        f'DAX={cfg["include_dax"]}  Gold={cfg["include_gold"]}  BIL={cfg["include_bil"]}  '
        f'portfolio={cfg["portfolio_mode"]}  '
        f'poll={cfg["poll_interval_s"]}s'
    )

    while True:
        loop_start = time.time()

        # Reload config every 5 minutes
        if time.time() - last_cfg_reload > 300:
            cfg = load_config(url)
            if not live_override:
                paper_mode = cfg.get('paper_mode', paper_mode)
            last_cfg_reload = time.time()

        if not cfg.get('enabled', True):
            log.info('Bot disabled in config — sleeping')
            time.sleep(cfg.get('poll_interval_s', 3600))
            continue

        # Refresh VIX every 6 hours
        if time.time() - last_vix_fetch > 21600:
            log.info('Fetching VIX data…')
            vix_closes = _fetch_vix_prices(300)
            last_vix_fetch = time.time()
            log.info(f'VIX: {len(vix_closes)} bars, latest={vix_closes[-1]:.1f}' if vix_closes else 'VIX: no data')

        today_ym = date.today().strftime('%Y-%m')
        should_rebalance = (
            force_rebalance or
            (is_last_trading_day_of_month() and today_ym != last_rebalance_ym)
        )

        signal_us: dict = {}
        instrument_status: dict = {}

        if should_rebalance:
            log.info('=== REBALANCE TRIGGERED ===')
            result = do_rebalance(cfg, paper_mode, vix_closes)
            if result:
                signal_us         = result.get('signal_us', {})
                instrument_status = result.get('instrument_status', {})
                last_rebalance_ym = today_ym
                force_rebalance   = False
                rebalance_log.insert(0, {
                    'date':        date.today().isoformat(),
                    'score':       signal_us.get('score'),
                    'regime':      signal_us.get('regime'),
                    'instruments': {k: v['target_alloc'] for k, v in instrument_status.items()},
                    'actions':     [a['action'] for a in result.get('actions', [])],
                })
                rebalance_log = rebalance_log[:24]  # keep last 24 months
        else:
            log.info(f'No rebalance today ({date.today()}). Last: {last_rebalance_ym or "never"}')

        # Next expected rebalance date (last trading day of next month)
        today = date.today()
        if today.month == 12:
            nm_first = date(today.year + 1, 1, 1)
        else:
            nm_first = date(today.year, today.month + 1, 1)
        next_month_last = nm_first - timedelta(days=1)
        while next_month_last.weekday() >= 5:
            next_month_last -= timedelta(days=1)
        next_rebalance_str = next_month_last.isoformat()

        balance = get_account_equity() if (HAS_MT5 and not paper_mode) else 0.0
        push_status(signal_us, instrument_status, balance, paper_mode, url,
                    next_rebalance=next_rebalance_str, rebalance_log=rebalance_log)

        elapsed = time.time() - loop_start
        sleep_s = max(0, cfg.get('poll_interval_s', 3600) - elapsed)
        log.info(f'Cycle complete in {elapsed:.1f}s — sleeping {sleep_s:.0f}s')
        time.sleep(sleep_s)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Macro-Regime Equity Bot')
    parser.add_argument('--dashboard-url', default='http://localhost:3000',
                        help='Base URL of the dashboard server')
    parser.add_argument('--live',           action='store_true',
                        help='Disable paper mode and send real orders (overrides KV config)')
    parser.add_argument('--force-rebalance', action='store_true',
                        help='Rebalance immediately without waiting for month-end')
    args = parser.parse_args()

    cfg_initial   = load_config(args.dashboard_url)
    paper         = not args.live and cfg_initial.get('paper_mode', True)
    force_reb     = args.force_rebalance

    run(url=args.dashboard_url, paper_mode=paper, force_rebalance=force_reb, live_override=args.live)
