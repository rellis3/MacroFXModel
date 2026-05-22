"""
MT5 connection and order execution.
All MetaTrader5 calls are isolated here — nothing else imports it directly.

Paper mode (LIVE_MODE=false):
  - place_order logs intent and returns a simulated fill dict
  - close_position logs and returns True
  - fetch_bars_1m returns None (caller must handle gracefully)
"""

import logging
from typing import Optional

import config

log = logging.getLogger(__name__)

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False
    log.warning('MetaTrader5 not installed — paper mode only')


# ── Connection ────────────────────────────────────────────────────────────────

def connect() -> bool:
    if not HAS_MT5:
        return False
    kw: dict = dict(
        login=config.MT5_ACCOUNT,
        password=config.MT5_PASSWORD,
        server=config.MT5_SERVER,
    )
    if config.MT5_PATH:
        kw['path'] = config.MT5_PATH
    ok = mt5.initialize(**kw)
    if not ok:
        log.error(f'MT5 init failed: {mt5.last_error()}')
    else:
        info = mt5.account_info()
        log.info(f'MT5 connected: account={info.login}  server={info.server}  balance={info.balance}')
    return ok


def shutdown() -> None:
    if HAS_MT5:
        mt5.shutdown()


# ── Market data ───────────────────────────────────────────────────────────────

def fetch_bars_1m(symbol: str, count: int = 300) -> Optional[list[dict]]:
    """
    Returns the last `count` complete 1m bars as list of dicts (oldest first).
    Drops the still-forming last bar.
    Returns None when MT5 unavailable.
    """
    if not HAS_MT5:
        return None
    try:
        bars = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M1, 0, count)
        if bars is None or len(bars) < 2:
            return None
        return [
            {
                'open':   float(b['open']),
                'high':   float(b['high']),
                'low':    float(b['low']),
                'close':  float(b['close']),
                'time':   int(b['time']),
                'volume': float(b['tick_volume']),
            }
            for b in bars[:-1]  # drop incomplete forming bar
        ]
    except Exception as exc:
        log.warning(f'fetch_bars_1m error: {exc}')
        return None


def get_tick(symbol: str) -> Optional[tuple[float, float]]:
    """Returns (bid, ask) or None."""
    if not HAS_MT5:
        return None
    try:
        tick = mt5.symbol_info_tick(symbol)
        if tick and tick.bid > 0:
            return tick.bid, tick.ask
        return None
    except Exception:
        return None


def get_account_balance() -> float:
    if not HAS_MT5:
        return 0.0
    try:
        info = mt5.account_info()
        return float(info.balance) if info else 0.0
    except Exception:
        return 0.0


# ── Position query ─────────────────────────────────────────────────────────────

def get_open_position(magic: int = None) -> Optional[dict]:
    """Returns the first open position with our magic number, or None."""
    if magic is None:
        magic = config.MAGIC
    if not HAS_MT5:
        return None
    try:
        positions = mt5.positions_get() or []
        for p in positions:
            if p.magic == magic:
                balance = get_account_balance()
                pnl_pct = round(p.profit / balance * 100, 3) if balance > 0 else 0.0
                return {
                    'ticket':     p.ticket,
                    'symbol':     p.symbol,
                    'type':       'BUY' if p.type == mt5.ORDER_TYPE_BUY else 'SELL',
                    'lots':       p.volume,
                    'open_price': p.price_open,
                    'sl':         p.sl,
                    'tp':         p.tp,
                    'profit':     p.profit,
                    'pnl_pct':    pnl_pct,
                }
        return None
    except Exception as exc:
        log.warning(f'get_open_position error: {exc}')
        return None


# ── Sizing ────────────────────────────────────────────────────────────────────

def _compute_lots(decay_score: float) -> float:
    """
    Scale lots inversely with decay — stronger regime gets larger size.
    decay=0.0 → LOT_SIZE_MAX, decay=1.0 → LOT_SIZE_MIN.
    """
    scale = max(0.0, 1.0 - decay_score)
    lots  = config.LOT_SIZE_MIN + (config.LOT_SIZE_MAX - config.LOT_SIZE_MIN) * scale
    return round(max(config.LOT_SIZE_MIN, min(config.LOT_SIZE_MAX, lots)), 2)


# ── Order execution ───────────────────────────────────────────────────────────

def place_order(direction: str, decay_score: float) -> Optional[dict]:
    """
    Places a market BUY or SELL order.
    direction: 'BUY' | 'SELL'
    Returns fill dict with ticket/price/lots/sl/tp, or None on hard failure.
    """
    is_buy  = direction == 'BUY'
    lots    = _compute_lots(decay_score)

    if not config.LIVE_MODE:
        # Paper mode — simulate fill at mid price or 0 if no MT5
        tick = get_tick(config.SYMBOL) if HAS_MT5 else None
        price = ((tick[0] + tick[1]) / 2) if tick else 0.0
        sl_dist = config.SL_PIPS  * config.PIP_SIZE
        tp_dist = config.TP_PIPS  * config.PIP_SIZE
        sl  = round(price - sl_dist if is_buy else price + sl_dist, 6)
        tp  = round(price + tp_dist if is_buy else price - tp_dist, 6)
        log.info(f'[PAPER] {direction} {lots} {config.PAIR}  @ {price:.5f}  SL={sl:.5f}  TP={tp:.5f}')
        return {'ticket': 0, 'direction': direction, 'price': price, 'lots': lots, 'sl': sl, 'tp': tp}

    if not HAS_MT5:
        log.error('Live mode requested but MT5 not available')
        return None

    tick = get_tick(config.PAIR)
    if tick is None:
        log.error('Cannot place order — tick data unavailable')
        return None

    bid, ask  = tick
    price     = ask if is_buy else bid
    sl_dist   = config.SL_PIPS * config.PIP_SIZE
    tp_dist   = config.TP_PIPS * config.PIP_SIZE
    sl = round(price - sl_dist if is_buy else price + sl_dist, 6)
    tp = round(price + tp_dist if is_buy else price - tp_dist, 6)

    req = {
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       config.PAIR,
        'volume':       lots,
        'type':         mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
        'price':        price,
        'sl':           sl,
        'tp':           tp,
        'deviation':    10,
        'magic':        config.MAGIC,
        'comment':      'RegimeBot',
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(req)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        code    = getattr(result, 'retcode', '?')
        comment = getattr(result, 'comment', '')
        log.error(f'MT5 order failed: retcode={code} {comment}')
        return None

    log.info(f'[LIVE] {direction} {lots} {config.PAIR}  @ {result.price}  ticket={result.order}')
    return {
        'ticket':    result.order,
        'direction': direction,
        'price':     result.price,
        'lots':      lots,
        'sl':        sl,
        'tp':        tp,
    }


def close_position(ticket: int) -> bool:
    """Closes an open position by ticket number."""
    if not config.LIVE_MODE:
        log.info(f'[PAPER] Close position ticket={ticket}')
        return True

    if not HAS_MT5:
        log.error('Cannot close — MT5 unavailable')
        return False

    try:
        positions = mt5.positions_get(ticket=ticket) or []
        if not positions:
            log.warning(f'close_position: ticket {ticket} not found (may already be closed)')
            return True  # treat as success — position is gone

        pos    = positions[0]
        is_buy = pos.type == mt5.ORDER_TYPE_BUY
        tick   = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            log.error(f'close_position: no tick data for {pos.symbol}')
            return False

        price = tick.bid if is_buy else tick.ask
        req   = {
            'action':       mt5.TRADE_ACTION_DEAL,
            'symbol':       pos.symbol,
            'volume':       pos.volume,
            'type':         mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
            'position':     ticket,
            'price':        price,
            'deviation':    10,
            'magic':        config.MAGIC,
            'comment':      'RegimeBot close',
            'type_time':    mt5.ORDER_TIME_GTC,
            'type_filling': mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(req)
        ok = result is not None and result.retcode == mt5.TRADE_RETCODE_DONE
        if not ok:
            code    = getattr(result, 'retcode', '?')
            comment = getattr(result, 'comment', '')
            log.error(f'close_position failed: retcode={code} {comment}')
        else:
            log.info(f'Position {ticket} closed at {price}')
        return ok

    except Exception as exc:
        log.error(f'close_position error: {exc}')
        return False
