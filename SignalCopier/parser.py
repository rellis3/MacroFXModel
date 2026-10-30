"""Parse ColezTrades "Signals" messages into structured events.

Pure functions, no network: text in, list of event dicts out. Every format
handled here was copied from real messages (screenshots, 2026-10-30); see
test_parser.py. Anything that looks like a trade instruction but matches no
pattern comes back as a `review` event so a human looks at it — the parser
never guesses.

Event kinds
-----------
open     a new trade: market ("now at") or pending (Limit/Stop at)
cancel   cancel a pending order
close    close an open trade
header   the daily "Trades, Friday 30 October" banner (context only)
holding  the "Still holding: ..." line (context only)
review   trade-looking text that no pattern understood
"""
import re

# Symbols seen in the channel. Unknown symbols still parse (any 3–10 char
# ticker), this list only feeds the review net.
KNOWN_SYMBOLS = {
    'NAS100', 'US30', 'SP500', 'US500', 'SPX500', 'GER40', 'DAX', 'UK100',
    'XAUUSD', 'GOLD', 'XAGUSD', 'BTCUSD', 'ETHUSD', 'USOIL', 'WTI',
    'EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'AUDUSD', 'NZDUSD',
    'USDCAD', 'USDCHF', 'EURGBP', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY',
    'EURAUD', 'GBPAUD', 'EURCHF', 'GBPCHF', 'AUDCAD', 'AUDNZD', 'EURCAD',
}

NUM = r'(\d[\d,]*(?:\.\d+)?)'
SYM = r'([A-Z][A-Z0-9]{2,9})'
TIME = r'(\d{1,2}[:.]\d{2})'

RE_ENTRY = re.compile(
    r'\b(?:(limit|stop)\s+)?(buy|sell)\s+' + SYM +
    r'\s*(?:\([^)]*\))?\s+(now\s+)?at\s+' + NUM, re.I)
RE_SL = re.compile(r'(?:stop\s*loss\s*(?:\(SL\))?|\bSL)\s*:?\s*' + NUM, re.I)
RE_TP = re.compile(r'\bTP[123]?\s*:?\s*' + NUM, re.I)
RE_CANCEL_AT = re.compile(r'cancel\s+at\s+' + TIME + r'\s*(?:UK)?', re.I)
RE_CLOSE_AT = re.compile(r'close[d]?\s+at\s+' + TIME + r'\s*(?:UK)?', re.I)
RE_RISK = re.compile(r'([\d.]+)\s*lots?\s*=\s*\$\s*' + NUM + r'\s*risk', re.I)

RE_CANCEL = re.compile(
    r'\bcancel\s+the\s+' + SYM + r'\s+(?:(limit|stop)\s+)?(buy|sell)\s+at\s+' + NUM, re.I)
RE_CLOSE = re.compile(
    r'\bclose\s+the\s+' + SYM + r'\s+(buy|sell)\s+from\s+' + NUM + r'([^\n]*)', re.I)

RE_HEADER = re.compile(
    r'trades,\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})\s+([a-z]+)', re.I)
RE_RISK_R = re.compile(r'risk\s+([\d.]+)\s*R\b', re.I)
RE_HOLDING = re.compile(r'still\s+holding\s*:\s*([^\n]*)', re.I)
RE_SWING = re.compile(r'\bswings?\b[^\n]*', re.I)
RE_DAY = re.compile(r'\bday\s+trades?\b[^\n]*', re.I)

ACTION_WORDS = re.compile(
    r'\b(buy|sell|close|cancel|stop\s*loss|SL|TP|breakeven|break\s*even|move|partial|half)\b', re.I)


def num(s):
    return float(s.replace(',', ''))


def hhmm(s):
    return s.replace('.', ':').zfill(5)


def _blocks(text):
    """Split on blank lines, keeping order."""
    return [b.strip() for b in re.split(r'\n\s*\n', text) if b.strip()]


def _entry_block(block, section):
    m = RE_ENTRY.search(block)
    if not m:
        return None
    otype, side, sym, now, price = m.groups()
    rest = block[m.end():]
    ev = {
        'kind': 'open',
        'symbol': sym.upper(),
        'side': side.upper(),
        'order': 'market' if now else (otype or 'limit').lower(),
        'entry': num(price),
        'sl': None, 'tp': None,
        'cancel_at': None, 'close_at': None,
        'risk_lots': None, 'risk_usd': None,
        'style': section.get('style'),
        'note': None,
    }
    paren = re.search(r'\(([^)]*)\)', block[:m.end()])
    if paren:
        ev['note'] = paren.group(1).strip()
    if (s := RE_SL.search(rest)):
        ev['sl'] = num(s.group(1))
    if (t := RE_TP.search(rest)):
        ev['tp'] = num(t.group(1))
    if (c := RE_CANCEL_AT.search(rest)):
        ev['cancel_at'] = hhmm(c.group(1))
    if (c := RE_CLOSE_AT.search(rest)):
        ev['close_at'] = hhmm(c.group(1))
    elif section.get('close_at'):
        ev['close_at'] = section['close_at']
    if (r := RE_RISK.search(rest)):
        ev['risk_lots'] = float(r.group(1))
        ev['risk_usd'] = num(r.group(2))
    if section.get('style') == 'swing' and not ev['close_at']:
        ev['close_rule'] = 'manual'
    return ev


def parse_message(text):
    """Return the list of events in one message, in order."""
    if not text:
        return []
    events = []
    section = {}
    for block in _blocks(text):
        found = False

        if (h := RE_HEADER.search(block)):
            ev = {'kind': 'header', 'weekday': h.group(1).title(),
                  'day': int(h.group(2)), 'month': h.group(3).title(), 'risk_r': None}
            if (r := RE_RISK_R.search(block)):
                ev['risk_r'] = float(r.group(1))
            events.append(ev)
            found = True

        if (h := RE_HOLDING.search(block)):
            events.append({'kind': 'holding', 'text': h.group(1).strip()})
            found = True

        # Section lines change the defaults for the trade blocks after them.
        if not RE_ENTRY.search(block):
            if RE_SWING.search(block):
                section = {'style': 'swing'}
                found = True
            elif RE_DAY.search(block):
                section = {'style': 'day'}
                if (c := RE_CLOSE_AT.search(block)):
                    section['close_at'] = hhmm(c.group(1))
                found = True

        for m in RE_CANCEL.finditer(block):
            sym, otype, side, price = m.groups()
            events.append({'kind': 'cancel', 'symbol': sym.upper(), 'side': side.upper(),
                           'order': (otype or 'limit').lower(), 'entry': num(price)})
            found = True

        for m in RE_CLOSE.finditer(block):
            sym, side, price, tail = m.groups()
            events.append({'kind': 'close', 'symbol': sym.upper(), 'side': side.upper(),
                           'entry': num(price), 'reason': tail.strip(' ,.') or None})
            found = True

        if not found:
            ev = _entry_block(block, section)
            if ev:
                events.append(ev)
                found = True

        if not found and _looks_like_instruction(block):
            events.append({'kind': 'review', 'text': block})

    return events


def _looks_like_instruction(block):
    if not ACTION_WORDS.search(block):
        return False
    tokens = set(re.findall(r'[A-Z][A-Z0-9]{2,9}', block.upper()))
    return bool(tokens & KNOWN_SYMBOLS) or bool(re.search(r'\d{3,}', block))


def has_trade_events(events):
    return any(e['kind'] in ('open', 'cancel', 'close', 'review') for e in events)
