"""
Position Hedge Bot — auto-hedges positions opened by other bots.

When a monitored bot opens a new position this bot immediately opens a
partial hedge in the most correlated instrument to dampen drawdown.
When the monitored position closes the hedge is closed automatically.

Sizing:
  Leg size = main_lots × |corr| × hedge_ratio × (pip_val_main / pip_val_hedge)
  This equalises the dollar exposure scaled by correlation strength and ratio.

SL: Wide tail-risk SL only (default 300 pips). The hedge is NOT managed
    by price targets — it exits when the main position exits.

KV key:   position_hedge_bot_status
Config:   position_hedge_bot_config
Magic:    20260008
Log:      position_hedge_bot.log

Usage:
  python position_hedge_bot.py                     # paper mode
  python position_hedge_bot.py --live              # real MT5 orders
  python position_hedge_bot.py --dashboard-url https://...
"""

import argparse
import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Constants ──────────────────────────────────────────────────────────────────

MAGIC      = 20260008
BOT_KEY    = 'position_hedge_bot_status'
CFG_KEY    = 'position_hedge_bot_config'
STATE_FILE = Path('position_hedge_bot_state.json')

# Bots this system can monitor — keys match _POS_BOTS in bot-config.html
KNOWN_BOTS = [
    {'key': 'bot_status',           'label': 'MacroFX V1'},
    {'key': 'regime_bot_status',    'label': 'Regime V1'},
    {'key': 'gold_bot_status',      'label': 'Gold'},
    {'key': 'regime_bot_v2_status', 'label': 'Regime V2'},
    {'key': 'backtestsystem_status','label': 'Backtest'},
    {'key': 'dyn_anchor_status',    'label': 'DynAnchor'},
]

# ── Pip tables ─────────────────────────────────────────────────────────────────

_PIP_SIZES: dict[str, float] = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'AUD/USD': 0.0001, 'NZD/USD': 0.0001,
    'USD/JPY': 0.01,   'USD/CAD': 0.0001, 'USD/CHF': 0.0001,
    'GBP/JPY': 0.01,   'EUR/JPY': 0.01,   'AUD/JPY': 0.01,
    'EUR/GBP': 0.0001, 'EUR/CHF': 0.0001, 'EUR/AUD': 0.0001,
    'EUR/NZD': 0.0001, 'EUR/CAD': 0.0001,
    'GBP/CHF': 0.0001, 'GBP/AUD': 0.0001, 'GBP/NZD': 0.0001, 'GBP/CAD': 0.0001,
    'AUD/NZD': 0.0001, 'AUD/CAD': 0.0001, 'AUD/CHF': 0.0001,
    'NZD/JPY': 0.01,   'CAD/JPY': 0.01,   'CHF/JPY': 0.01,
    'XAU/USD': 1.0,
}

_PIP_VALUES: dict[str, float] = {
    'EUR/USD': 10.0,  'GBP/USD': 10.0,  'AUD/USD': 10.0,  'NZD/USD': 10.0,
    'USD/JPY': 9.0,   'USD/CAD': 7.5,   'USD/CHF': 10.5,
    'GBP/JPY': 9.0,   'EUR/JPY': 6.5,   'AUD/JPY': 6.5,
    'EUR/GBP': 12.5,  'EUR/CHF': 11.0,  'EUR/AUD': 6.5,
    'EUR/NZD': 5.8,   'EUR/CAD': 7.5,
    'GBP/CHF': 11.0,  'GBP/AUD': 6.5,   'GBP/NZD': 5.8,   'GBP/CAD': 7.5,
    'AUD/NZD': 6.5,   'AUD/CAD': 7.5,   'AUD/CHF': 11.0,
    'NZD/JPY': 6.5,   'CAD/JPY': 6.5,   'CHF/JPY': 6.5,
    'XAU/USD': 100.0,
}

DEFAULT_CFG: dict = {
    'enabled':          True,
    'paper_mode':       True,
    'hedge_ratio':      0.5,      # fraction of corr exposure to hedge (0.0–1.0)
    'sl_pips':          300,      # tail-risk SL for FX pairs
    'sl_pips_gold':     2000,     # tail-risk SL for XAU/USD
    'max_lot':          5.0,
    'max_spread_pips':  3.0,
    'interval_secs':    30,
    'monitored_bots':   ['bot_status', 'regime_bot_status', 'regime_bot_v2_status',
                         'gold_bot_status', 'dyn_anchor_status'],
}

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('position_hedge_bot.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)

# ── Pair utilities ─────────────────────────────────────────────────────────────

def _to_slash(sym: str) -> str:
    """'EURUSD' → 'EUR/USD', 'XAUUSD' → 'XAU/USD'"""
    s = sym.upper().replace('/', '')
    return f'{s[:3]}/{s[3:]}' if len(s) == 6 else s


def _mt5_sym(pair_slash: str) -> str:
    return pair_slash.replace('/', '')


def _pip_size(pair_slash: str) -> float:
    return _PIP_SIZES.get(pair_slash, 0.0001)


def _pip_value(pair_slash: str) -> float:
    return _PIP_VALUES.get(pair_slash, 10.0)

# ── KV / API helpers ───────────────────────────────────────────────────────────

def _kv_get(key: str, base_url: str) -> dict | None:
    try:
        r = requests.get(f'{base_url}/api/kv/get?key={key}', timeout=10)
        j = r.json()
        return j['data'] if not j.get('miss') and j.get('data') else None
    except Exception as e:
        log.warning(f'kv_get({key}): {e}')
        return None


def _kv_put(key: str, data: dict, base_url: str) -> None:
    try:
        requests.post(
            f'{base_url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=10,
        )
    except Exception as e:
        log.warning(f'kv_put({key}): {e}')


def _load_config(base_url: str) -> dict:
    stored = _kv_get(CFG_KEY, base_url)
    return {**DEFAULT_CFG, **stored} if stored else dict(DEFAULT_CFG)


def _fetch_corr_data(base_url: str) -> dict | None:
    """Returns the hedge_alerts_cache with avg_corr, pairs, etc."""
    data = _kv_get('hedge_alerts_cache', base_url)
    if data:
        return data
    try:
        r = requests.get(f'{base_url}/api/hedge-alerts', timeout=15)
        return r.json() if r.ok else None
    except Exception as e:
        log.warning(f'fetch_corr_data: {e}')
        return None


def _find_best_hedge(symbol: str, corr_data: dict) -> dict | None:
    """Find the highest-|corr| pair for the given symbol."""
    if not corr_data:
        return None
    avg_corr = corr_data.get('avg_corr', {})
    pairs    = corr_data.get('pairs', [])
    sym      = symbol.upper().replace('/', '')

    best_score, best = 0.0, None
    for i, pa in enumerate(pairs):
        for pb in pairs[i+1:]:
            key  = f'{pa}_{pb}'
            corr = avg_corr.get(key)
            if corr is None:
                continue
            hedge_sym = None
            if pa.upper().replace('/', '') == sym:
                hedge_sym = pb
            elif pb.upper().replace('/', '') == sym:
                hedge_sym = pa
            if not hedge_sym:
                continue
            if abs(corr) > best_score:
                best_score = abs(corr)
                best = {'symbol': hedge_sym, 'corr': corr}
    return best


def _log_audit_entry(entry: dict, base_url: str) -> None:
    try:
        requests.post(f'{base_url}/api/hedge-audit/entries', json=[entry], timeout=10)
    except Exception as e:
        log.warning(f'log_audit_entry: {e}')


def _patch_audit_close(ticket: int, close_price: float, base_url: str) -> None:
    try:
        requests.patch(
            f'{base_url}/api/hedge-audit/entries/{ticket}',
            json={'hedge_close_price': close_price,
                  'closed_at': datetime.now(timezone.utc).isoformat()},
            timeout=10,
        )
    except Exception as e:
        log.warning(f'patch_audit_close({ticket}): {e}')

# ── MT5 serialisers ────────────────────────────────────────────────────────────

def _serialize_open_positions() -> list:
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


def _serialize_closed_trades() -> list:
    if not HAS_MT5:
        return []
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
        result.append({
            'position_id': pid,
            'symbol':      last_out.symbol,
            'direction':   'BUY' if (ind.type == 0 if ind else True) else 'SELL',
            'lots':        round(sum(d.volume for d in outs), 2),
            'open_price':  round(float(ind.price), 5) if ind else None,
            'close_price': round(float(last_out.price), 5),
            'profit':      round(sum(d.profit for d in outs), 2),
            'swap':        round(sum(d.swap for d in outs), 2),
            'commission':  round(sum(d.commission for d in outs), 2),
            'time_open':   int(ind.time) if ind else None,
            'time_close':  int(last_out.time),
            'comment':     str(ind.comment if ind else last_out.comment or ''),
        })
    return sorted(result, key=lambda t: t['time_close'])

# ── Account helpers ────────────────────────────────────────────────────────────

def _get_account_login() -> int | None:
    if not HAS_MT5:
        return None
    info = mt5.account_info()
    return int(info.login) if info else None


def _get_balance() -> float:
    if not HAS_MT5:
        return 10_000.0
    info = mt5.account_info()
    return float(info.balance) if info else 10_000.0


def _push_status(state: dict, base_url: str, balance: float, cfg: dict) -> None:
    hedged = list(state.get('hedged', {}).values())
    _kv_put(BOT_KEY, {
        'pushed_at':           int(time.time()),
        'paper_mode':          cfg.get('paper_mode', True),
        'balance':             round(balance, 2),
        'hedged_count':        len(hedged),
        'hedged_pairs':        [f'{h["main_symbol"]}→{h["hedge_symbol"]}' for h in hedged],
        'mt5_positions':       _serialize_open_positions(),
        'today_closed_trades': _serialize_closed_trades(),
        'account_login':       _get_account_login(),
    }, base_url)

# ── MT5 execution ──────────────────────────────────────────────────────────────

def _get_tick(pair_slash: str) -> tuple[float, float] | None:
    if not HAS_MT5:
        return None
    tick = mt5.symbol_info_tick(_mt5_sym(pair_slash))
    return (tick.ask, tick.bid) if tick else None


def _open_order(pair_slash: str, direction: str, lots: float, sl: float,
                 paper_mode: bool, max_spread: float) -> int | None:
    sym  = _mt5_sym(pair_slash)
    tick = _get_tick(pair_slash)

    if tick is None:
        if paper_mode:
            fake = int(time.time() * 1000) % 1_000_000_000
            log.info(f'[PAPER] {direction} {lots} {sym} SL={sl:.5f} → ticket={fake}')
            return fake
        log.error(f'No tick for {sym}')
        return None

    ask, bid      = tick
    exec_price    = ask if direction == 'BUY' else bid
    spread_pips   = (ask - bid) / _pip_size(pair_slash)
    if spread_pips > max_spread:
        log.warning(f'{sym} spread {spread_pips:.1f}p > max {max_spread}p — skip')
        return None

    if paper_mode:
        fake = int(time.time() * 1000) % 1_000_000_000
        log.info(f'[PAPER] {direction} {lots} {sym} @ {exec_price:.5f} SL={sl:.5f} → ticket={fake}')
        return fake

    order_type = mt5.ORDER_TYPE_BUY if direction == 'BUY' else mt5.ORDER_TYPE_SELL
    info       = mt5.symbol_info(sym)
    filling    = mt5.ORDER_FILLING_IOC
    if info:
        if info.filling_mode & 1:
            filling = mt5.ORDER_FILLING_FOK
        elif info.filling_mode & 4:
            filling = mt5.ORDER_FILLING_RETURN

    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       sym,
        'volume':       float(lots),
        'type':         order_type,
        'price':        exec_price,
        'sl':           sl,
        'tp':           0.0,
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      f'PosHedge {direction[0]}',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': filling,
    })
    if res is None:
        log.error(f'order_send None for {sym}')
        return None
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f'{sym} retcode={res.retcode} {res.comment}')
        return None
    log.info(f'Opened {direction} {lots} {sym} @ {exec_price:.5f} ticket={res.order}')
    return res.order


def _close_order(ticket: int, pair_slash: str, paper_mode: bool) -> bool:
    sym = _mt5_sym(pair_slash)
    if paper_mode:
        log.info(f'[PAPER] Close {sym} ticket={ticket}')
        return True
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        log.info(f'Ticket {ticket} already gone')
        return True
    pos         = positions[0]
    tick        = _get_tick(pair_slash)
    if tick is None:
        return False
    close_price = tick[1] if pos.type == 0 else tick[0]
    close_type  = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
    info        = mt5.symbol_info(sym)
    filling     = mt5.ORDER_FILLING_IOC
    if info:
        if info.filling_mode & 1:
            filling = mt5.ORDER_FILLING_FOK
        elif info.filling_mode & 4:
            filling = mt5.ORDER_FILLING_RETURN
    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       sym,
        'volume':       float(pos.volume),
        'type':         close_type,
        'price':        close_price,
        'position':     ticket,
        'deviation':    20,
        'magic':        MAGIC,
        'comment':      'PosHedge close',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': filling,
    })
    if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
        err = f'{res.retcode} {res.comment}' if res else 'None'
        log.error(f'Close ticket {ticket} failed: {err}')
        return False
    log.info(f'Closed {sym} ticket={ticket}')
    return True

# ── State persistence ──────────────────────────────────────────────────────────

def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {'hedged': {}, 'seen_tickets': []}


def _save_state(state: dict) -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2))
    except Exception as e:
        log.warning(f'save_state: {e}')

# ── Main loop ──────────────────────────────────────────────────────────────────

def _fetch_all_positions(monitored_bots: list[str], base_url: str) -> list[dict]:
    """Pull mt5_positions from every enabled bot's KV key."""
    positions = []
    for key in monitored_bots:
        data = _kv_get(key, base_url)
        if not data:
            continue
        bot_label = next((b['label'] for b in KNOWN_BOTS if b['key'] == key), key)
        for p in data.get('mt5_positions', []):
            positions.append({**p, '_bot_key': key, '_bot_label': bot_label})
    return positions


def run(base_url: str, live: bool) -> None:
    if HAS_MT5:
        if not mt5.initialize():
            log.error(f'MT5 initialize failed: {mt5.last_error()}')
            return
        log.info(f'MT5 connected — account {mt5.account_info().login}')
    else:
        log.warning('MetaTrader5 not installed — paper mode only')

    state = _load_state()
    # hedged: main_ticket(str) → {hedge_ticket, hedge_symbol, main_symbol, ...}
    hedged: dict       = state.get('hedged', {})
    seen_tickets: set  = set(state.get('seen_tickets', []))

    cycle = 0
    while True:
        cycle += 1
        cfg        = _load_config(base_url)
        paper_mode = not live or cfg.get('paper_mode', True)
        balance    = _get_balance()

        if not cfg.get('enabled', True):
            log.info('Bot disabled — sleeping')
            time.sleep(cfg.get('interval_secs', 30))
            continue

        monitored = cfg.get('monitored_bots', DEFAULT_CFG['monitored_bots'])
        positions = _fetch_all_positions(monitored, base_url)
        live_tickets = {str(p['ticket']) for p in positions if p.get('ticket')}

        # ── 1. Close hedges for positions that have disappeared ───────────────
        for main_tk_str in list(hedged.keys()):
            if main_tk_str not in live_tickets:
                h          = hedged[main_tk_str]
                hedge_sym  = _to_slash(h['hedge_symbol'])
                log.info(f'Main {h["main_symbol"]} ticket={main_tk_str} closed — closing hedge {h["hedge_symbol"]} ticket={h["hedge_ticket"]}')
                ok = _close_order(h['hedge_ticket'], hedge_sym, paper_mode)
                if ok:
                    tick = _get_tick(hedge_sym)
                    if tick:
                        mid = round((tick[0] + tick[1]) / 2, 5)
                        _patch_audit_close(int(main_tk_str), mid, base_url)
                    del hedged[main_tk_str]

        # ── 2. Open hedges for new positions ─────────────────────────────────
        corr_data = None
        for pos in positions:
            tk_str = str(pos.get('ticket', ''))
            if not tk_str or tk_str in seen_tickets:
                continue
            seen_tickets.add(tk_str)

            # Already hedged (e.g. from a previous run loaded from state file)
            if tk_str in hedged:
                continue

            # Lazy-load corr data once per cycle (only if we actually need it)
            if corr_data is None:
                corr_data = _fetch_corr_data(base_url)
            if not corr_data:
                log.warning('No corr data available — cannot find hedge instrument')
                continue

            main_sym   = (pos.get('symbol') or '').upper()
            main_dir   = pos.get('direction', 'BUY')   # 'BUY' or 'SELL'
            main_lots  = float(pos.get('lots') or 0)
            bot_label  = pos.get('_bot_label', '?')

            if not main_sym or main_lots <= 0:
                continue

            h = _find_best_hedge(main_sym, corr_data)
            if not h:
                log.info(f'No hedge found for {main_sym} — skip')
                continue

            corr       = h['corr']
            hedge_sym  = h['symbol'].upper()
            # Positive corr → hedge is opposite; negative → same direction
            hedge_long = (not (main_dir == 'BUY')) if corr > 0 else (main_dir == 'BUY')
            hedge_dir  = 'BUY' if hedge_long else 'SELL'

            main_slash  = _to_slash(main_sym)
            hedge_slash = _to_slash(hedge_sym)
            sl_pips     = cfg['sl_pips_gold'] if 'XAU' in hedge_sym else cfg['sl_pips']
            hedge_ratio = cfg.get('hedge_ratio', 0.5)

            pip_ratio  = _pip_value(main_slash) / max(_pip_value(hedge_slash), 0.01)
            hedge_lots = round(
                min(max(main_lots * abs(corr) * hedge_ratio * pip_ratio, 0.01), cfg['max_lot']),
                2,
            )

            tick = _get_tick(hedge_slash)
            hedge_price = ((tick[0] if hedge_dir == 'BUY' else tick[1]) if tick else 1.0)
            dist  = sl_pips * _pip_size(hedge_slash)
            sl    = hedge_price - dist if hedge_dir == 'BUY' else hedge_price + dist

            log.info(
                f'New {bot_label} position: {main_sym} {main_dir} {main_lots}L  '
                f'→ hedge {hedge_sym} {hedge_dir} {hedge_lots}L  '
                f'corr={corr:+.3f}  ratio={hedge_ratio}'
            )

            hedge_ticket = _open_order(hedge_slash, hedge_dir, hedge_lots, sl,
                                        paper_mode, cfg['max_spread_pips'])
            if hedge_ticket is None:
                log.error(f'Failed to open hedge for {main_sym} ticket={tk_str}')
                continue

            hedged[tk_str] = {
                'main_ticket':   int(tk_str),
                'main_symbol':   main_sym,
                'main_direction': main_dir,
                'main_lots':     main_lots,
                'bot_label':     bot_label,
                'hedge_ticket':  hedge_ticket,
                'hedge_symbol':  hedge_sym,
                'hedge_direction': hedge_dir,
                'hedge_lots':    hedge_lots,
                'corr':          corr,
                'hedge_ratio':   hedge_ratio,
                'opened_at':     datetime.now(timezone.utc).isoformat(),
            }

            # Log to hedge audit so it appears in the Hedge Audit tab
            tick_main = _get_tick(main_slash)
            _log_audit_entry({
                'ticket':            int(tk_str),
                'symbol':            main_sym,
                'direction':         main_dir,
                'lots':              main_lots,
                'open_price':        round(pos.get('open_price') or 0, 5),
                'bot':               f'PosHedge({bot_label})',
                'bot_key':           BOT_KEY,
                'hedge_symbol':      hedge_sym,
                'hedge_direction':   hedge_dir,
                'hedge_corr':        corr,
                'hedge_entry_price': round(hedge_price, 5),
                'account_login':     _get_account_login(),
            }, base_url)

        # ── 3. Save state and push status ─────────────────────────────────────
        state = {'hedged': hedged, 'seen_tickets': list(seen_tickets)}
        _save_state(state)
        _push_status(state, base_url, balance, cfg)

        interval = max(cfg.get('interval_secs', 30), 5)
        log.info(f'Cycle {cycle} — monitoring {len(monitored)} bots, {len(hedged)} active hedges — sleeping {interval}s')
        time.sleep(interval)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='MacroFX Position Hedge Bot')
    parser.add_argument('--live',          action='store_true',
                        help='Enable live MT5 orders (default: paper)')
    parser.add_argument('--dashboard-url', default=os.getenv('DASHBOARD_URL', 'http://localhost:3000'),
                        help='MacroFX server URL')
    args = parser.parse_args()
    run(base_url=args.dashboard_url.rstrip('/'), live=args.live)


if __name__ == '__main__':
    main()
