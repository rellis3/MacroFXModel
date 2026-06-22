"""
Hedge Bot — Pairs trading bot that consumes hedge signals from the MacroFX server.

Strategy:
  Poll /api/hedge-signals every N seconds.
  When a new ACTIVE signal appears, open both legs simultaneously via MT5.
  Leg A: risk-based sizing  (risk_pct × balance ÷ sl_pips ÷ pip_value_a)
  Leg B: pip-value adjusted × correlation  (lots_a × (pip_val_a / pip_val_b) × |corr|)
  Wide tail-risk SL on each leg — positions are NOT managed by price targets.
  Exit is driven entirely by signal status from the server (EXITED or STOPPED).

Signal lifecycle:
  Server marks signal ACTIVE  → bot opens both legs
  Server marks signal EXITED  → spread reverted, bot closes both legs (profit)
  Server marks signal STOPPED → spread diverged further, bot closes both legs (loss)

KV key:    hedge_bot_status   (shows in bot-config positions table)
Creds key: hedge_bot_credentials  (account/password/server set on the Hedge config page)
Magic:     20260007
Log file:  hedge_bot.log

Usage:
  python hedge_bot.py                                    # paper mode
  python hedge_bot.py --live                             # real MT5 orders
  python hedge_bot.py --dashboard-url https://...        # remote server
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

MAGIC    = 20260007
BOT_KEY  = 'hedge_bot_status'
CFG_KEY  = 'hedge_bot_config'
STATE_FILE = Path('hedge_bot_state.json')

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
    'risk_pct':         0.5,     # % of balance risked per leg A
    'sl_pips':          200,     # tail-risk SL (pips) for FX pairs
    'sl_pips_gold':     1500,    # tail-risk SL for XAU/USD
    'max_lot':          5.0,
    'max_spread_pips':  3.0,
    'interval_secs':    30,
    'min_z_score':      2.0,     # skip signal if z has already fallen below this
    'max_open_signals': 3,
}

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('hedge_bot.log', encoding='utf-8'),
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


def _fetch_signals(base_url: str) -> list:
    try:
        r = requests.get(f'{base_url}/api/hedge-signals', timeout=10)
        return r.json().get('signals', []) if r.ok else []
    except Exception as e:
        log.warning(f'fetch_signals: {e}')
        return []


def _load_config(base_url: str) -> dict:
    stored = _kv_get(CFG_KEY, base_url)
    return {**DEFAULT_CFG, **stored} if stored else dict(DEFAULT_CFG)


def load_credentials(base_url: str) -> None:
    creds = _kv_get('hedge_bot_credentials', base_url)
    if not creds:
        return
    for env_key, cfg_key in [
        ('MT5_ACCOUNT', 'mt5_account'), ('MT5_PASSWORD', 'mt5_password'),
        ('MT5_SERVER',  'mt5_server'),  ('MT5_PATH',     'mt5_path'),
    ]:
        if val := creds.get(cfg_key):
            os.environ[env_key] = str(val)
    log.info(f'Credentials loaded: account={creds.get("mt5_account")}  server={creds.get("mt5_server")}')


def _ack_signal(sig_id: str, status: str, base_url: str) -> None:
    try:
        requests.post(
            f'{base_url}/api/hedge-signals/ack',
            json={'id': sig_id, 'status': status},
            timeout=10,
        )
    except Exception as e:
        log.warning(f'ack_signal({sig_id}): {e}')


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

# ── MT5 serialisers (match the shape expected by bot-config positions table) ───

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
        ind = grp['in']
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

# ── Status push ────────────────────────────────────────────────────────────────

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


def _push_status(open_pos: dict, base_url: str, balance: float, cfg: dict) -> None:
    _kv_put(BOT_KEY, {
        'pushed_at':           int(time.time()),
        'paper_mode':          cfg.get('paper_mode', True),
        'balance':             round(balance, 2),
        'open_signals':        len(open_pos),
        'pairs':               [f'{v["pair_a"]}/{v["pair_b"]}' for v in open_pos.values()],
        'mt5_positions':       _serialize_open_positions(),
        'today_closed_trades': _serialize_closed_trades(),
        'account_login':       _get_account_login(),
    }, base_url)

# ── Position sizing ────────────────────────────────────────────────────────────

def _calc_lots_a(balance: float, risk_pct: float, sl_pips: int,
                  pair_slash: str, max_lot: float) -> float:
    risk_amount = balance * risk_pct / 100
    lots = risk_amount / (sl_pips * _pip_value(pair_slash))
    return round(min(max(lots, 0.01), max_lot), 2)


def _calc_lots_b(lots_a: float, pair_a_slash: str, pair_b_slash: str,
                  corr: float, max_lot: float) -> float:
    ratio = _pip_value(pair_a_slash) / max(_pip_value(pair_b_slash), 0.01)
    lots = lots_a * ratio * abs(corr)
    return round(min(max(lots, 0.01), max_lot), 2)


def _sl_price(pair_slash: str, direction: str, entry: float, sl_pips: int) -> float:
    dist = sl_pips * _pip_size(pair_slash)
    return entry - dist if direction == 'LONG' else entry + dist

# ── MT5 execution ──────────────────────────────────────────────────────────────

def _get_tick(pair_slash: str) -> tuple[float, float] | None:
    """Returns (ask, bid) or None."""
    if not HAS_MT5:
        return None
    tick = mt5.symbol_info_tick(_mt5_sym(pair_slash))
    return (tick.ask, tick.bid) if tick else None


def _open_order(pair_slash: str, direction: str, lots: float, sl: float,
                 paper_mode: bool, max_spread_pips: float) -> int | None:
    sym = _mt5_sym(pair_slash)
    tick = _get_tick(pair_slash)
    if tick is None:
        if paper_mode:
            fake = int(time.time() * 1000) % 1_000_000_000
            log.info(f'[PAPER] {direction} {lots} {sym} SL={sl:.5f} → ticket={fake}')
            return fake
        log.error(f'No tick data for {sym}')
        return None

    ask, bid = tick
    exec_price = ask if direction == 'LONG' else bid
    spread = (ask - bid) / _pip_size(pair_slash)
    if spread > max_spread_pips:
        log.warning(f'{sym} spread {spread:.1f}p > max {max_spread_pips}p — skip')
        return None

    if paper_mode:
        fake = int(time.time() * 1000) % 1_000_000_000
        log.info(f'[PAPER] {direction} {lots} {sym} @ {exec_price:.5f} SL={sl:.5f} → ticket={fake}')
        return fake

    order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    info = mt5.symbol_info(sym)
    filling = mt5.ORDER_FILLING_IOC
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
        'comment':      f'HedgeBot {direction[0]}',
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
    pos = positions[0]
    tick = _get_tick(pair_slash)
    if tick is None:
        return False
    close_price = tick[1] if pos.type == 0 else tick[0]  # bid for LONG, ask for SHORT
    close_type  = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
    info = mt5.symbol_info(sym)
    filling = mt5.ORDER_FILLING_IOC
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
        'comment':      'HedgeBot close',
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
    return {'open_positions': {}}


def _save_state(open_positions: dict) -> None:
    try:
        STATE_FILE.write_text(json.dumps({'open_positions': open_positions}, indent=2))
    except Exception as e:
        log.warning(f'save_state: {e}')

# ── Main loop ──────────────────────────────────────────────────────────────────

def run(base_url: str, live: bool) -> None:
    load_credentials(base_url)
    if HAS_MT5:
        path = os.environ.get('MT5_PATH') or None
        if not (mt5.initialize(path=path) if path else mt5.initialize()):
            log.error(f'MT5 initialize failed: {mt5.last_error()}')
            return
        account  = os.environ.get('MT5_ACCOUNT', '')
        password = os.environ.get('MT5_PASSWORD', '')
        server   = os.environ.get('MT5_SERVER', '')
        if account and password and server:
            if not mt5.login(int(account), password, server):
                log.error(f'MT5 login failed: {mt5.last_error()}')
                return
        info = mt5.account_info()
        if info and account and str(info.login) != str(account):
            log.error(f'Account mismatch: expected {account} got {info.login} — aborting')
            mt5.shutdown()
            return
        log.info(f'MT5 connected — account {info.login if info else "?"}')
    else:
        log.warning('MetaTrader5 not installed — paper mode only')

    state = _load_state()
    open_positions: dict = state.get('open_positions', {})
    cycle = 0

    while True:
        cycle += 1
        cfg        = _load_config(base_url)
        paper_mode = not live or cfg.get('paper_mode', True)
        balance    = _get_balance()
        signals    = _fetch_signals(base_url)
        sig_by_id  = {s['id']: s for s in signals}

        # ── 1. Check open positions for exits / SL hits ───────────────────────
        for sig_id, pos in list(open_positions.items()):
            sig = sig_by_id.get(sig_id)
            close_reason: str | None = None

            if sig is None:
                close_reason = 'DISMISSED'
            elif sig['status'] == 'EXITED':
                close_reason = 'EXITED'
            elif sig['status'] == 'STOPPED':
                close_reason = 'STOPPED'

            # Detect MT5-side SL hit (both tickets gone)
            if close_reason is None and HAS_MT5 and not paper_mode:
                open_tkts = {p.ticket for p in (mt5.positions_get() or []) if p.magic == MAGIC}
                if pos['ticket_a'] not in open_tkts and pos['ticket_b'] not in open_tkts:
                    close_reason = 'DISMISSED'  # SL hit — server signal stays active

            if close_reason is None:
                continue

            pa_slash = _to_slash(pos['pair_a'])
            pb_slash = _to_slash(pos['pair_b'])
            log.info(f'Closing {pos["pair_a"]}/{pos["pair_b"]} reason={close_reason}')

            ok_a = _close_order(pos['ticket_a'], pa_slash, paper_mode)
            ok_b = _close_order(pos['ticket_b'], pb_slash, paper_mode)

            if ok_a and ok_b:
                # Record close price on the hedge leg in audit log
                tick_b = _get_tick(pb_slash)
                if tick_b:
                    mid_b = round((tick_b[0] + tick_b[1]) / 2, 5)
                    _patch_audit_close(pos['ticket_a'], mid_b, base_url)

                if close_reason in ('EXITED', 'STOPPED'):
                    _ack_signal(sig_id, close_reason, base_url)

                del open_positions[sig_id]

        # ── 2. Open new positions for fresh ACTIVE signals ────────────────────
        if cfg.get('enabled', True) and len(open_positions) < cfg.get('max_open_signals', 3):
            for sig in signals:
                if sig.get('status') != 'ACTIVE':
                    continue
                sig_id = sig['id']
                if sig_id in open_positions:
                    continue
                if abs(sig.get('z_score', 0)) < cfg.get('min_z_score', 2.0):
                    log.debug(f'Signal {sig_id} z={sig["z_score"]:.2f} < threshold — skip')
                    continue

                pa       = sig['pair_a']   # e.g. 'EURUSD'
                pb       = sig['pair_b']
                pa_slash = _to_slash(pa)
                pb_slash = _to_slash(pb)
                dir_a    = sig['direction_a']   # 'LONG' or 'SHORT'
                dir_b    = sig['direction_b']
                corr     = sig.get('corr_current', 0.5)

                sl_pips_a = cfg['sl_pips_gold'] if 'XAU' in pa else cfg['sl_pips']
                sl_pips_b = cfg['sl_pips_gold'] if 'XAU' in pb else cfg['sl_pips']

                lots_a = _calc_lots_a(balance, cfg['risk_pct'], sl_pips_a, pa_slash, cfg['max_lot'])
                lots_b = _calc_lots_b(lots_a, pa_slash, pb_slash, corr, cfg['max_lot'])

                tick_a = _get_tick(pa_slash)
                tick_b = _get_tick(pb_slash)
                price_a = (tick_a[0] if dir_a == 'LONG' else tick_a[1]) if tick_a else (sig.get('entry_price_a') or 1.0)
                price_b = (tick_b[0] if dir_b == 'LONG' else tick_b[1]) if tick_b else (sig.get('entry_price_b') or 1.0)

                sl_a = _sl_price(pa_slash, dir_a, price_a, sl_pips_a)
                sl_b = _sl_price(pb_slash, dir_b, price_b, sl_pips_b)

                log.info(
                    f'Signal {sig_id}: {pa} {dir_a} {lots_a}L / {pb} {dir_b} {lots_b}L  '
                    f'z={sig["z_score"]:.2f}  corr={corr:.3f}'
                )

                ticket_a = _open_order(pa_slash, dir_a, lots_a, sl_a, paper_mode, cfg['max_spread_pips'])
                if ticket_a is None:
                    log.error(f'Leg A ({pa}) failed — aborting')
                    continue

                ticket_b = _open_order(pb_slash, dir_b, lots_b, sl_b, paper_mode, cfg['max_spread_pips'])
                if ticket_b is None:
                    log.error(f'Leg B ({pb}) failed — rolling back leg A')
                    _close_order(ticket_a, pa_slash, paper_mode)
                    continue

                open_positions[sig_id] = {
                    'signal_id':   sig_id,
                    'pair_a':      pa,
                    'pair_b':      pb,
                    'direction_a': dir_a,
                    'direction_b': dir_b,
                    'lots_a':      lots_a,
                    'lots_b':      lots_b,
                    'ticket_a':    ticket_a,
                    'ticket_b':    ticket_b,
                    'entry_time':  datetime.now(timezone.utc).isoformat(),
                }

                # Log to hedge audit so it appears in the Hedge Audit tab
                _log_audit_entry({
                    'ticket':            ticket_a,
                    'symbol':            pa,
                    'direction':         'BUY' if dir_a == 'LONG' else 'SELL',
                    'lots':              lots_a,
                    'open_price':        round(price_a, 5),
                    'bot':               'HedgeBot',
                    'bot_key':           BOT_KEY,
                    'hedge_symbol':      pb,
                    'hedge_direction':   'BUY' if dir_b == 'LONG' else 'SELL',
                    'hedge_corr':        corr,
                    'hedge_entry_price': round(price_b, 5),
                    'account_login':     _get_account_login(),
                }, base_url)

        _save_state(open_positions)
        _push_status(open_positions, base_url, balance, cfg)

        interval = max(cfg.get('interval_secs', 30), 5)
        log.info(f'Cycle {cycle} — {len(open_positions)} open pairs — sleeping {interval}s')
        time.sleep(interval)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='MacroFX Hedge Bot')
    parser.add_argument('--live',          action='store_true',
                        help='Enable live MT5 orders (default: paper)')
    parser.add_argument('--dashboard-url', default=os.getenv('DASHBOARD_URL', 'http://localhost:3000'),
                        help='MacroFX server URL')
    args = parser.parse_args()
    run(base_url=args.dashboard_url.rstrip('/'), live=args.live)


if __name__ == '__main__':
    main()
