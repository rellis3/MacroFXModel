"""
MT5 helpers: bar fetching and London time conversion with DST.
"""
import logging
import sys
from datetime import datetime, timezone, timedelta, date as date_type
from pathlib import Path

log = logging.getLogger(__name__)

_root = str(Path(__file__).resolve().parents[1])
if _root not in sys.path:
    sys.path.insert(0, _root)                    # repo root → pylego
from pylego.instruments import pip_sizes_for     # noqa: E402  (shared pip table — single source of truth)
from pylego.broker.clock import ServerClock      # noqa: E402  (broker-clock offset — MT5 stamps aren't UTC)

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

_SERVER_CLOCK = None


def tz_offset_sec():
    """Seconds the broker's clock runs ahead of UTC. MT5 stamps `.time` fields on
    the SERVER's wall clock, so a position's `time_open` is shifted by this much
    — pushed alongside the stamp so the dashboard renders the real instant
    instead of assuming UTC. See pylego/broker/clock.py."""
    global _SERVER_CLOCK
    if _SERVER_CLOCK is None:
        _SERVER_CLOCK = ServerClock(mt5 if HAS_MT5 else None, log=log)
    return _SERVER_CLOCK.offset_sec()

# Keys unchanged; values identical to the former inline literal (golden-tested
# in pylego/instruments_test.py). 'US100' resolves via the registry's broker
# aliases (EXTRA_ALIASES in js/instrumentRegistry.js → instruments.json).
PIP_SIZES = pip_sizes_for([
    'EURUSD', 'GBPUSD', 'USDJPY',
    'AUDUSD', 'XAUUSD', 'EURGBP',
    'USDCAD', 'USDCHF', 'GBPJPY',
    'NAS100', 'US100',
])

SYMBOL_ALIASES = {
    'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY',
    'AUD/USD': 'AUDUSD', 'XAU/USD': 'XAUUSD', 'EUR/GBP': 'EURGBP',
    'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF', 'GBP/JPY': 'GBPJPY',
}


def resolve_symbol(symbol: str) -> str:
    return SYMBOL_ALIASES.get(symbol, symbol.replace('/', ''))


def pip_size(symbol: str) -> float:
    mt5_sym = resolve_symbol(symbol)
    for key, val in PIP_SIZES.items():
        if key in mt5_sym.upper() or mt5_sym.upper() in key:
            return val
    return PIP_SIZES.get(mt5_sym, 0.0001)


# ── London DST conversion ─────────────────────────────────────────────────────

def _dst_bounds(year: int) -> tuple:
    """Return (dst_start_utc, dst_end_utc) as aware datetimes for London DST."""
    # Last Sunday of March at 01:00 UTC
    march_31 = datetime(year, 3, 31, 1, 0, 0, tzinfo=timezone.utc)
    days_back = (march_31.weekday() + 1) % 7  # weekday: 0=Mon 6=Sun → days to prior Sunday
    dst_start = march_31 - timedelta(days=days_back)

    # Last Sunday of October at 01:00 UTC
    oct_31   = datetime(year, 10, 31, 1, 0, 0, tzinfo=timezone.utc)
    days_back = (oct_31.weekday() + 1) % 7
    dst_end   = oct_31 - timedelta(days=days_back)

    return dst_start, dst_end


_DST_CACHE: dict = {}


def ts_to_london(ts_ms: int) -> dict:
    """Convert Unix millisecond timestamp to London local-time fields."""
    ts_s   = ts_ms / 1000
    dt_utc = datetime.fromtimestamp(ts_s, tz=timezone.utc)
    year   = dt_utc.year

    if year not in _DST_CACHE:
        _DST_CACHE[year] = _dst_bounds(year)
    dst_start, dst_end = _DST_CACHE[year]

    offset = 1 if dst_start <= dt_utc < dst_end else 0
    london = dt_utc + timedelta(hours=offset)

    # JS-compatible day-of-week: 0=Sunday, 1=Monday, ..., 6=Saturday
    js_day = (london.weekday() + 1) % 7

    return {
        'ts':    ts_ms,
        'lDate': london.strftime('%Y-%m-%d'),
        'lHour': london.hour,
        'lMin':  london.minute,
        'lDay':  js_day,
        'open':  None, 'high': None, 'low': None, 'close': None,  # filled by callers
    }


def london_now() -> dict:
    """Current London time."""
    return ts_to_london(int(datetime.now(timezone.utc).timestamp() * 1000))


# ── Bar fetching ──────────────────────────────────────────────────────────────

def _mt5_bars(symbol: str, timeframe, count: int) -> list:
    if not HAS_MT5:
        return []
    mt5_sym = resolve_symbol(symbol)
    rates = mt5.copy_rates_from_pos(mt5_sym, timeframe, 0, count)
    if rates is None or len(rates) == 0:
        log.warning(f'MT5: no bars for {mt5_sym} tf={timeframe}')
        return []
    bars = []
    for r in rates:
        info = ts_to_london(int(r['time']) * 1000)
        info['open']  = float(r['open'])
        info['high']  = float(r['high'])
        info['low']   = float(r['low'])
        info['close'] = float(r['close'])
        bars.append(info)
    return bars  # oldest-first (MT5 default)


def fetch_bars_5m(symbol: str, count: int = 350) -> list:
    """Newest-first 5m bars (matches JS bar5mRev)."""
    bars = _mt5_bars(symbol, mt5.TIMEFRAME_M5, count) if HAS_MT5 else []
    return list(reversed(bars))


def fetch_bars_30m(symbol: str, count: int = 350) -> list:
    """Oldest-first 30m bars (matches JS bars30m)."""
    return _mt5_bars(symbol, mt5.TIMEFRAME_M30, count) if HAS_MT5 else []


def fetch_bars_daily(symbol: str, count: int = 150) -> list:
    """Oldest-first daily bars (matches JS dailyBars)."""
    return _mt5_bars(symbol, mt5.TIMEFRAME_D1, count) if HAS_MT5 else []


def fetch_price(symbol: str) -> float | None:
    """Live mid price from MT5 tick."""
    if not HAS_MT5:
        return None
    mt5_sym = resolve_symbol(symbol)
    tick = mt5.symbol_info_tick(mt5_sym)
    if tick and tick.bid > 0:
        return round((tick.bid + tick.ask) / 2, 6)
    return None


def get_balance() -> float:
    if not HAS_MT5:
        return 10_000.0
    acct = mt5.account_info()
    return acct.balance if acct else 10_000.0


def connect(account: int = 0, password: str = '', server: str = '', path: str = '') -> bool:
    if not HAS_MT5:
        log.error('MetaTrader5 package not installed')
        return False
    ok = mt5.initialize(path=path) if path else mt5.initialize()
    if not ok:
        log.error(f'MT5 initialize() failed: {mt5.last_error()}')
        return False
    if account and password and server:
        if not mt5.login(login=int(account), password=password, server=server):
            log.error(f'MT5 login failed: {mt5.last_error()}')
            return False
    info = mt5.account_info()
    if info:
        log.info(f'MT5 connected  account={info.login}  balance={info.balance:.2f} {info.currency}  server={info.server}')
    return True


def place_order(symbol: str, direction: str, volume: float,
                sl: float, tp: float, comment: str = 'BSys') -> int | None:
    if not HAS_MT5:
        return None
    mt5_sym  = resolve_symbol(symbol)
    tick     = mt5.symbol_info_tick(mt5_sym)
    if not tick:
        log.error(f'No tick for {mt5_sym}')
        return None

    # Pick a filling mode the broker actually supports for this symbol
    info = mt5.symbol_info(mt5_sym)
    filling_mode = mt5.ORDER_FILLING_IOC  # fallback
    if info:
        allowed = info.filling_mode  # bitmask: 1=FOK, 2=IOC, 4=Return
        if allowed & 1:
            filling_mode = mt5.ORDER_FILLING_FOK
        elif allowed & 2:
            filling_mode = mt5.ORDER_FILLING_IOC
        elif allowed & 4:
            filling_mode = mt5.ORDER_FILLING_RETURN

    order_type = mt5.ORDER_TYPE_BUY if direction == 'long' else mt5.ORDER_TYPE_SELL
    price      = tick.ask if direction == 'long' else tick.bid
    res = mt5.order_send({
        'action':       mt5.TRADE_ACTION_DEAL,
        'symbol':       mt5_sym,
        'volume':       volume,
        'type':         order_type,
        'price':        price,
        'sl':           sl,
        'tp':           tp,
        'deviation':    20,
        'magic':        20260099,
        'comment':      comment,
        'type_time':    mt5.ORDER_TIME_GTC,
        'type_filling': filling_mode,
    })
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f'Order failed: retcode={res.retcode}  {res.comment}')
        return None
    log.info(f'Order placed: ticket={res.order}  {symbol} {direction}  price={price}  vol={volume}')
    return res.order


def get_open_positions(magic: int = 20260099) -> list:
    if not HAS_MT5:
        return []
    return [p for p in (mt5.positions_get() or []) if p.magic == magic]


def fetch_close_price(ticket: int) -> float | None:
    """Return the closing deal price for a position by its position ticket ID."""
    if not HAS_MT5:
        return None
    date_from = datetime.now(timezone.utc) - timedelta(days=7)
    date_to   = datetime.now(timezone.utc) + timedelta(hours=1)
    try:
        deals = mt5.history_deals_get(date_from, date_to)
    except Exception:
        return None
    if not deals:
        return None
    for d in reversed(deals):
        if d.position_id == ticket and d.entry == mt5.DEAL_ENTRY_OUT:
            return float(d.price)
    return None


def modify_sl(position, new_sl: float) -> float | None:
    """
    Ratchet an open position's SL to ``new_sl``, keeping its TP unchanged. The
    stop is rounded to the INSTRUMENT's own price digits (3 for JPY, 5 for most
    FX, …) — a hardcoded rounding makes MT5 reject a sub-tick modify as a no-op
    (retcode 10025) and spam a warning every poll. Only sends the request when the
    new stop is STRICTLY more favourable than the current one (higher for a long,
    lower for a short) so it can never loosen a stop.

    Returns the rounded SL price that was set, or None if nothing was sent.
    """
    if not HAS_MT5:
        return None

    info    = mt5.symbol_info(position.symbol)
    digits  = info.digits if info else 5
    nsl     = round(new_sl, digits)
    is_long = position.type == 0  # 0 = BUY

    # Favourable-only ratchet (a short's SL sits above price → tighter = lower).
    if is_long and nsl <= position.sl:
        return None
    if not is_long and position.sl != 0 and nsl >= position.sl:
        return None

    res = mt5.order_send({
        'action':   mt5.TRADE_ACTION_SLTP,
        'position': position.ticket,
        'sl':       nsl,
        'tp':       position.tp,
    })
    if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
        err = res.retcode if res else mt5.last_error()
        log.warning(f'SL modify failed ticket={position.ticket}: {err}')
        return None
    return nsl


def move_sl_to_be(position, pip: float, be_buffer_pips: float = 1.0) -> bool:
    """
    Move the SL of an open position to breakeven (entry price + small buffer).
    Returns True if the modification was sent successfully. Delegates the actual
    ratchet + rounding to ``modify_sl`` so BE and the chandelier trail share one
    stop-modify path.
    """
    if not HAS_MT5:
        return False

    entry   = position.price_open
    is_long = position.type == 0  # 0 = BUY
    buf     = be_buffer_pips * pip
    new_sl  = entry + buf if is_long else entry - buf

    set_sl = modify_sl(position, new_sl)
    if set_sl is None:
        return False

    log.info(f'SL → BE  ticket={position.ticket}  new_sl={set_sl}  (entry={entry})')
    return True
