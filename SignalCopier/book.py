"""The signal book: what the channel has told us to hold right now.

The book tracks *instructions*, not broker fills. A limit order is `working`
from the moment it is posted until it is cancelled, expires at its
"Cancel at" time, or is closed; whether it actually filled is the executor's
business (the paper executor cannot know). Pure apart from the JSON file it
saves to — feed it events and clock ticks, it returns transitions.

Statuses: working (pending order) · open (market order) · cancelled ·
expired (cancel-at reached) · closed.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UK = ZoneInfo('Europe/London')
LIVE = ('working', 'open')
PRICE_TOL = 0.0005          # 0.05 % — "from 157.69" must match the 157.69 entry


def _uk_time_after(posted_utc, hhmm):
    """The first UK wall-clock `hhmm` after the post time, as UTC."""
    local = posted_utc.astimezone(UK)
    h, m = map(int, hhmm.split(':'))
    t = local.replace(hour=h, minute=m, second=0, microsecond=0)
    if t <= local:
        t += timedelta(days=1)
    return t.astimezone(timezone.utc)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def _dt(s):
    return datetime.fromisoformat(s) if s else None


class Book:
    def __init__(self, path=None, data=None):
        self.path = path
        self.orders = {}          # id -> order dict
        self.seen = {}            # str(msg_id) -> event signature (for edit detection)
        if data is None and path and os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
        if data:
            self.orders = data.get('orders', {})
            self.seen = data.get('seen', {})

    def to_dict(self):
        return {'orders': self.orders, 'seen': self.seen}

    def save(self):
        if not self.path:
            return
        tmp = self.path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(self.to_dict(), f, indent=1)
        os.replace(tmp, self.path)

    # ── queries ────────────────────────────────────────────────────────
    def live(self):
        return [o for o in self.orders.values() if o['status'] in LIVE]

    def _match(self, ev):
        """Live orders matching a cancel/close event: symbol + side, then entry price.
        A CLOSE also considers limits the book marked `expired`: the book can't
        see fills, and a limit that filled before its cancel time is still open."""
        pool = self.live() + ([o for o in self.orders.values() if o['status'] == 'expired']
                              if ev['kind'] == 'close' else [])
        cands = [o for o in pool
                 if o['symbol'] == ev['symbol'] and o['side'] == ev['side']]
        exact = [o for o in cands
                 if abs(o['entry'] - ev['entry']) <= PRICE_TOL * max(o['entry'], 1e-9)]
        if exact:
            return exact
        return cands if len(cands) == 1 else []

    # ── mutations ──────────────────────────────────────────────────────
    def apply(self, events, msg_id, posted_utc):
        """Apply one message's events. Returns a list of transitions:
        (action, order, detail) with action in place/cancel/close/warn."""
        out = []
        n_open = 0
        for ev in events:
            k = ev['kind']
            if k == 'open':
                oid = f'{msg_id}:{n_open}'
                n_open += 1
                if oid in self.orders:
                    continue
                o = dict(ev)
                o.update({
                    'id': oid, 'msg_id': msg_id, 'posted_at': _iso(posted_utc),
                    'status': 'open' if ev['order'] == 'market' else 'working',
                    'cancel_at_utc': _iso(_uk_time_after(posted_utc, ev['cancel_at'])) if ev.get('cancel_at') else None,
                    'close_at_utc': _iso(_uk_time_after(posted_utc, ev['close_at'])) if ev.get('close_at') else None,
                    'ended_at': None, 'end_reason': None,
                })
                o.pop('kind', None)
                self.orders[oid] = o
                out.append(('place', o, None))
            elif k in ('cancel', 'close'):
                hits = self._match(ev)
                if not hits:
                    out.append(('warn', None, f"{k.upper()} {ev['side']} {ev['symbol']} @ {ev['entry']}: "
                                              f"no matching live order in the book"))
                for o in hits:
                    reason = ev.get('reason') or ('channel cancel' if k == 'cancel' else 'channel close')
                    self._end(o, 'cancelled' if k == 'cancel' else 'closed', posted_utc, reason)
                    out.append((k, o, reason))
            elif k == 'review':
                out.append(('warn', None, 'Unparsed instruction — check manually:\n' + ev['text']))
        return out

    def tick(self, now_utc):
        """Apply cancel-at / close-at times that have passed."""
        out = []
        for o in self.live():
            ca, cl = _dt(o.get('cancel_at_utc')), _dt(o.get('close_at_utc'))
            if o['status'] == 'working' and ca and now_utc >= ca:
                self._end(o, 'expired', ca, f"cancel-at {o['cancel_at']} UK (if not filled)")
                out.append(('cancel', o, o['end_reason']))
            elif cl and now_utc >= cl:
                self._end(o, 'closed', cl, f"close-at {o['close_at']} UK")
                out.append(('close', o, o['end_reason']))
        return out

    def _end(self, o, status, when, reason):
        o['status'] = status
        o['ended_at'] = _iso(when)
        o['end_reason'] = reason


def describe(o):
    bits = [f"{o['side']} {o['symbol']}",
            'now' if o['order'] == 'market' else o['order'],
            f"@ {o['entry']:g}"]
    if o.get('sl') is not None:
        bits.append(f"SL {o['sl']:g}")
    if o.get('tp') is not None:
        bits.append(f"TP {o['tp']:g}")
    if o.get('cancel_at'):
        bits.append(f"cancel {o['cancel_at']} UK")
    if o.get('close_at'):
        bits.append(f"close {o['close_at']} UK")
    elif o.get('close_rule') == 'manual':
        bits.append('swing (manual close)')
    return ' '.join(bits)
