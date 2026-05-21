"""
Trade journal: records per-trade lifecycle; stores up to 200 records in KV as
backtestsystem_journal. Uses in-memory bar accumulation to avoid per-poll KV overhead.
"""
import json
import time
import urllib.request
import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)

_MAX_RECORDS   = 200
_journal:       list = []   # trade dicts, newest first
_pending_bars:  dict = {}   # ticket → [{t,o,h,l,c}] chronological
_entry_meta:    dict = {}   # ticket → {sl, tp, pip, entry_price, direction, be_price}
_dashboard_url: str  = ''


def init(dashboard_url: str) -> None:
    global _dashboard_url, _journal
    _dashboard_url = dashboard_url
    if not dashboard_url:
        return
    try:
        url = f'{dashboard_url.rstrip("/")}/api/kv/get?key=backtestsystem_journal'
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        if not data.get('miss') and isinstance(data.get('data'), list):
            _journal = data['data']
            open_count = sum(1 for r in _journal if r.get('status') == 'open')
            log.info(f'[Journal] Loaded {len(_journal)} records ({open_count} open) from KV')
    except Exception as exc:
        log.warning(f'[Journal] Could not load from KV: {exc}')


def _push_to_kv() -> None:
    if not _dashboard_url:
        return
    try:
        payload = json.dumps({
            'key':       'backtestsystem_journal',
            'data':      _journal,
            'timestamp': int(time.time() * 1000),
        }).encode()
        req = urllib.request.Request(
            f'{_dashboard_url.rstrip("/")}/api/kv/set',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception as exc:
        log.warning(f'[Journal] KV push failed: {exc}')


def _find_record(ticket: int) -> dict | None:
    for rec in _journal:
        if rec.get('ticket') == ticket:
            return rec
    return None


def record_open(ticket: int, pair: str, direction: str,
                entry_price: float, sl: float, tp: float,
                lots: float, pip: float,
                level_price: float, level_fib,
                conviction: float, confirms: int,
                features_fired: list) -> None:
    now_ms  = int(time.time() * 1000)
    now_iso = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    date    = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
    sl_pips = round(abs(entry_price - sl) / pip, 1)
    tp_pips = round(abs(entry_price - tp) / pip, 1)

    rec = {
        'ticket':       ticket,
        'pair':         pair,
        'direction':    direction,
        'date':         date,
        'entry_time':   now_iso,
        'entry_ts_ms':  now_ms,
        'entry_price':  entry_price,
        'sl':           sl,
        'tp':           tp,
        'sl_dist_pips': sl_pips,
        'tp_dist_pips': tp_pips,
        'lots':         lots,
        'pip':          pip,
        'level_price':  level_price,
        'level_fib':    level_fib,
        'conviction':   round(conviction, 3),
        'confirms':     confirms,
        'features':     features_fired,
        'be_moved_at':  None,
        'be_price':     None,
        'exit_time':    None,
        'exit_price':   None,
        'exit_type':    None,
        'pnl_r':        None,
        'pnl_pips':     None,
        'bars':         [],
        'status':       'open',
    }
    _journal.insert(0, rec)
    if len(_journal) > _MAX_RECORDS:
        _journal[:] = _journal[:_MAX_RECORDS]

    _entry_meta[ticket]   = {
        'sl': sl, 'tp': tp, 'pip': pip,
        'entry_price': entry_price, 'direction': direction, 'be_price': None,
    }
    _pending_bars[ticket] = []
    log.info(f'[Journal] Opened #{ticket} {pair} {direction} @{entry_price}  '
             f'SL={sl_pips}p TP={tp_pips}p  features={features_fired}')
    _push_to_kv()


def accumulate_bars(ticket: int, bars_5m_newest_first: list, entry_ts_ms: int) -> None:
    """
    bars_5m_newest_first: list of bar dicts with 'ts' (ms), 'open', 'high', 'low', 'close'.
    Accumulates bars at or after (entry_ts_ms - one bar period) so the entry bar is included.
    """
    if ticket not in _pending_bars:
        return
    cutoff = entry_ts_ms - 300_000   # one 5m bar back so entry candle is captured
    existing    = _pending_bars[ticket]
    existing_ts = {b['t'] for b in existing}
    new_bars = [
        {'t': b['ts'], 'o': b['open'], 'h': b['high'], 'l': b['low'], 'c': b['close']}
        for b in bars_5m_newest_first
        if b['ts'] >= cutoff and b['ts'] not in existing_ts
    ]
    if new_bars:
        existing.extend(new_bars)
        existing.sort(key=lambda b: b['t'])


def record_be_move(ticket: int, be_price: float) -> None:
    rec = _find_record(ticket)
    if not rec:
        return
    now_iso = datetime.fromtimestamp(time.time(), tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    rec['be_moved_at'] = now_iso
    rec['be_price']    = be_price
    if ticket in _entry_meta:
        _entry_meta[ticket]['be_price'] = be_price
    log.info(f'[Journal] BE move #{ticket} → {be_price}')
    _push_to_kv()


def record_close(ticket: int, exit_price: float) -> None:
    rec = _find_record(ticket)
    if not rec:
        _pending_bars.pop(ticket, None)
        _entry_meta.pop(ticket, None)
        return

    pip         = rec.get('pip', 0.0001)
    entry_price = rec['entry_price']
    sl          = rec['sl']
    tp          = rec['tp']
    be_price    = rec.get('be_price')
    direction   = rec['direction']
    sl_dist     = abs(entry_price - sl)

    # Infer exit type — 10% of SL distance as tolerance (min 2 pips)
    tol = max(sl_dist * 0.10, pip * 2)
    if   abs(exit_price - tp) <= tol:
        exit_type = 'tp'
    elif abs(exit_price - sl) <= tol:
        exit_type = 'sl'
    elif be_price is not None and abs(exit_price - be_price) <= tol:
        exit_type = 'be'
    else:
        exit_type = 'manual'

    raw      = (exit_price - entry_price) if direction == 'long' else (entry_price - exit_price)
    pnl_pips = round(raw / pip, 1)
    pnl_r    = round(raw / sl_dist, 2) if sl_dist > 0 else 0.0

    now_iso = datetime.fromtimestamp(time.time(), tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    bars    = _pending_bars.pop(ticket, [])
    _entry_meta.pop(ticket, None)

    rec.update({
        'exit_time':  now_iso,
        'exit_price': exit_price,
        'exit_type':  exit_type,
        'pnl_r':      pnl_r,
        'pnl_pips':   pnl_pips,
        'bars':       bars,
        'status':     'closed',
    })
    log.info(f'[Journal] Closed #{ticket} → {exit_type}  P&L={pnl_r:+.2f}R  {pnl_pips:+.1f}p')
    _push_to_kv()


def get_entry_ts_ms(ticket: int) -> int | None:
    """Return entry_ts_ms for a tracked open trade, or None if not found."""
    rec = _find_record(ticket)
    if rec and rec.get('status') == 'open':
        return rec.get('entry_ts_ms')
    return None
