"""Parse ColezTrades "Signals" messages into structured events.

Pure functions, no network: text in, list of event dicts out. Every format
handled here was copied from real messages (screenshots 2026-10-30, the
history parse report 2026-10-31); see test_parser.py. Anything that looks
like a trade instruction but matches no pattern comes back as a `review`
event so a human looks at it — the parser never guesses.

Line by line, not block by block: Telegram doesn't always keep blank lines
between his trades (the 30 Oct 07:00 message came through with none), so a
trade is an entry line plus the detail lines after it (SL, TP, targets,
cancel/close times, lots), whatever the spacing.

Event kinds
-----------
open     a new trade: market ("now at", or "XAUUSD buy" with no price) or pending (Limit/Stop at)
cancel   cancel a pending order
close    close an open trade (his CLOSE, "target hit", "stopped out")
info     a notice that needs no action ("Filled: … is now open")
header   the daily "Trades, Friday 30 October" banner (context only)
holding  the "Still holding: ..." line (context only)
review   trade-looking text that no pattern understood
"""
import re

# Symbols seen in the channel. Unknown symbols still parse (any 3–10 char
# ticker), this list only feeds the review net.
KNOWN_SYMBOLS = {
    'NAS100', 'US30', 'SP500', 'US500', 'SPX500', 'GER40', 'DAX', 'UK100',
    'XAUUSD', 'GOLD', 'XAGUSD', 'SILVER', 'BTCUSD', 'ETHUSD', 'BITCOIN', 'ETHEREUM', 'USOIL', 'WTI', 'OIL',
    'EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'AUDUSD', 'NZDUSD',
    'USDCAD', 'USDCHF', 'EURGBP', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY',
    'EURAUD', 'GBPAUD', 'EURCHF', 'GBPCHF', 'AUDCAD', 'AUDNZD', 'EURCAD',
}
# words that sit where a symbol would and must never be read as one
NOT_SYMBOLS = {'THE', 'NOW', 'LIMIT', 'STOP', 'FROM', 'AND', 'BUY', 'SELL', 'ALL', 'THIS', 'THAT',
               'TRADE', 'TRADES', 'ORDER', 'ORDERS', 'POSITION', 'HALF', 'PART', 'MARKET', 'AGAIN', 'INSTANT'}

NUM = r'(\d[\d,]*(?:\.\d+)?)'
SYM = r'([A-Za-z][A-Za-z0-9]{2,9})'
TIME = r'(\d{1,2}[:.]\d{2})'
SIDE = r'(buy|sell)'

# entries ────────────────────────────────────────────────────────────────
# "Limit SELL NAS100 at 28,965" · "SELL SP500(normal, NOT futures) now at 7,640.6"
RE_ENTRY = re.compile(r'\b(?:(limit|stop)\s+)?' + SIDE + r'\s+' + SYM +
                      r'\s*(?:\([^)]*\))?\s+(now\s+)?at\s+' + NUM, re.I)
# "SELL STOP GOLD at 4,000" · "BUY LIMIT XAUUSD at 3,990"
RE_ENTRY_AFTER = re.compile(r'\b' + SIDE + r'\s+(limit|stop)\s+' + SYM +
                            r'\s*(?:\([^)]*\))?\s+at\s+' + NUM, re.I)
# "XAUUSD buy" · "XAUUSD instant BUY" · "Instant XAUUSD SELL" · "BTCUSD sell again" · "CL-OIL sell"
# · "XAUUSD SELL LIMIT @ 4344.00" · "NAS100 buy at 29,100" — the whole line
RE_ENTRY_SYM_FIRST = re.compile(r'^\W*(?:instant\s+)?([A-Za-z][A-Za-z0-9-]{2,9})\s*(?:-\s*)?(?:instant\s+)?' + SIDE +
                                r'(?:\s+again)?(?:\s+(limit|stop))?(?:\s+now)?(?:\s*(?:at|@)\s*' + NUM + r')?\W*$', re.I)

# trade detail lines ─────────────────────────────────────────────────────
RE_SL = re.compile(r'(?:stop\s*loss\s*(?:\(SL\))?|\bSL)\s*[:\-]?\s*' + NUM, re.I)       # "SL 29,096" · "SL: 4002" · "SL-4472.30"
RE_TP = re.compile(r'\bTP[123]?\s*[:\-]?\s*' + NUM, re.I)
RE_TARGET = re.compile(r'\btargets?\b\s*:?\s*(?:1\)\s*)?' + NUM, re.I)
RE_NUMBERED = re.compile(r'^\W*(\d)\)\s*' + NUM + r'\W*$')
RE_CANCEL_AT = re.compile(r'cancel\s+at\s+' + TIME + r'\s*(?:UK)?', re.I)
RE_CLOSE_AT = re.compile(r'close[d]?\s+at\s+' + TIME + r'\s*(?:UK)?', re.I)
RE_RISK = re.compile(r'([\d.]+)\s*lots?\s*=\s*\$\s*' + NUM + r'\s*risk', re.I)
RE_DETAIL = re.compile(r'(stop\s*loss|\bSL\b|\bTP\d?\b|\btargets?\b|cancel\s+at|close[d]?\s+at|\blots?\s*=)', re.I)

# instructions about an existing trade ───────────────────────────────────
RE_CANCEL = re.compile(r'\bcancel\s+(?:the\s+)?' + SYM + r'\s+(?:(limit|stop)\s+)?' + SIDE + r'\s+at\s+' + NUM, re.I)
RE_CLOSE = re.compile(r'\bclose\s+(?:the\s+)?' + SYM + r'\s+' + SIDE + r'\s+from\s+' + NUM + r'(.*)$', re.I)
# "Target hit on the SP500 SELL from 7,640.6" · "US30 SELL from 52,445 stopped out"
# · "Stopped the Ethereum SELL from 2,321.38 at 2,346.96"
RE_FROM = re.compile(r'\b' + SYM + r'\s+' + SIDE + r'\s+from\s+' + NUM, re.I)
RE_RESULT_WORD = re.compile(r'(target\s+hit|tp\s+hit|take\s*profit\s+hit|profit\s+hit|hit\s+(?:the\s+)?(?:target|tp)|stopped|sl\s+hit|\bclosed?\b|\bexit)', re.I)
# notices that need no action: a fill, or "has already moved. If you are not in, do not enter now"
RE_FILLED = re.compile(r'^\W*filled\b|\bis\s+now\s+open\b|\balready\s+moved\b|\bdo\s+not\s+enter\b', re.I)

RE_HEADER = re.compile(
    r'trades,\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})\s+([a-z]+)', re.I)
RE_RISK_R = re.compile(r'risk\s+([\d.]+)\s*R\b', re.I)
RE_HOLDING = re.compile(r'still\s+holding\s*:\s*(.*)$', re.I)
RE_SWING = re.compile(r'\bswings?\b', re.I)
RE_DAY = re.compile(r'\bday\s+trades?\b', re.I)

ACTION_WORDS = re.compile(
    r'\b(buy|sell|close|closing|cancel|stop\s*loss|SL|TP|breakeven|break\s*even|BE|move|moving|partial|half|target|stopped)\b', re.I)
# with only a symbol and no price, a message needs a management verb to be flagged:
# "US30 should hit TP soon" / "sad about the US30 SL" are chat, "BTC and GBPJPY both SL to BE" is not
MANAGE_WORDS = re.compile(r'\b(close|closing|cancel|move|moving|breakeven|break\s*even|BE|partial|half|hedge|add|adding)\b', re.I)
PRICE = re.compile(r'\d{3,}|\d+\.\d+')


def num(s):
    return float(s.replace(',', ''))


def hhmm(s):
    return s.replace('.', ':').zfill(5)


def _clean(text):
    text = text.replace('\r', '').replace(' ', ' ').replace(' ', '\n').replace(' ', '\n')
    return re.sub(r'[​-‍️⁠]', '', text)


def _sym(s):
    s = s.upper()
    return None if s in NOT_SYMBOLS else s


def _result_reason(line):
    l = line.lower()
    if re.search(r'target\s+hit|tp\s+hit|take\s*profit\s+hit|profit\s+hit|hit\s+(?:the\s+)?(?:target|tp)', l):
        return 'target hit'
    if 'stopped' in l or re.search(r'\bsl\s+hit', l):
        return 'stopped out'
    return None


def _entry(line):
    """(order, side, symbol, price|None, note) for an entry line, else None."""
    m = RE_ENTRY.search(line)
    if m and _sym(m.group(3)):
        otype, side, sym, now, price = m.groups()
        order = 'market' if now else (otype or 'limit').lower()
    else:
        m = RE_ENTRY_AFTER.search(line)
        if m and _sym(m.group(3)):
            side, otype, sym, price = m.groups()
            order = otype.lower()
        else:
            m = RE_ENTRY_SYM_FIRST.search(line)
            if not (m and _sym(m.group(1))):
                return None
            sym, side, otype, price = m.groups()
            order = (otype or 'market').lower() if price else 'market'
            if order != 'market' and not price:
                return None
    paren = re.search(r'\(([^)]*)\)', line[:m.end()])
    return order, side.upper(), sym.upper(), (num(price) if price else None), (paren.group(1).strip() if paren else None)


def _trade_event(lines, section):
    order, side, sym, price, note = _entry(lines[0])
    rest = '\n'.join(lines)
    ev = {'kind': 'open', 'symbol': sym, 'side': side, 'order': order, 'entry': price,
          'sl': None, 'tp': None, 'targets': [], 'cancel_at': None, 'close_at': None,
          'risk_lots': None, 'risk_usd': None, 'style': section.get('style'), 'note': note}
    if (s := RE_SL.search(rest)):
        ev['sl'] = num(s.group(1))
    targets = [num(t.group(1)) for t in RE_TP.finditer(rest)]
    if not targets and (t := RE_TARGET.search(rest)):
        targets.append(num(t.group(1)))
    for ln in lines[1:]:
        if (n := RE_NUMBERED.match(ln)):
            v = num(n.group(2))
            if v not in targets:
                targets.append(v)
    ev['targets'] = targets
    ev['tp'] = targets[0] if targets else None       # first target is the one the bot uses
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


def _line_events(line):
    """Events from a single line that stands on its own (cancel / close / result / info)."""
    out = []
    if RE_FILLED.search(line):
        return [{'kind': 'info', 'text': line.strip()}]
    for m in RE_CANCEL.finditer(line):
        if _sym(m.group(1)):
            sym, otype, side, price = m.groups()
            out.append({'kind': 'cancel', 'symbol': sym.upper(), 'side': side.upper(),
                        'order': (otype or 'limit').lower(), 'entry': num(price)})
    if out:
        return out
    m = RE_CLOSE.search(line)
    if m and _sym(m.group(1)):
        sym, side, price, tail = m.groups()
        return [{'kind': 'close', 'symbol': sym.upper(), 'side': side.upper(), 'entry': num(price),
                 'reason': tail.strip(' ,.') or None}]
    m = RE_FROM.search(line)
    if m and _sym(m.group(1)) and RE_RESULT_WORD.search(line):
        sym, side, price = m.groups()
        return [{'kind': 'close', 'symbol': sym.upper(), 'side': side.upper(), 'entry': num(price),
                 'reason': _result_reason(line) or 'closed'}]
    return out


def _looks_like_instruction(text):
    if not ACTION_WORDS.search(text):
        return False
    if PRICE.search(text):
        return True
    tokens = set(re.findall(r'[A-Z][A-Z0-9]{2,9}', text.upper()))
    return bool(tokens & KNOWN_SYMBOLS) and bool(MANAGE_WORDS.search(text))


def parse_message(text):
    """Return the list of events in one message, in order."""
    if not text:
        return []
    events, section = [], {}
    trade, loose = None, []

    def flush_trade():
        nonlocal trade
        if trade:
            events.append(_trade_event(trade, section_at[0]))
            trade = None

    def flush_loose():
        if loose and _looks_like_instruction('\n'.join(loose)):
            events.append({'kind': 'review', 'text': '\n'.join(loose).strip()})
        loose.clear()

    section_at = [section]                       # the section in force when the current trade started
    lines = _clean(text).split('\n')
    risk_r = RE_RISK_R.search(text)
    for raw in lines:
        line = raw.strip()
        if not line:
            flush_loose()
            continue

        if (h := RE_HEADER.search(line)):
            flush_trade(); flush_loose()
            events.append({'kind': 'header', 'weekday': h.group(1).title(), 'day': int(h.group(2)),
                           'month': h.group(3).title(), 'risk_r': float(risk_r.group(1)) if risk_r else None})
            continue
        if (h := RE_HOLDING.search(line)):
            flush_trade(); flush_loose()
            events.append({'kind': 'holding', 'text': h.group(1).strip()})
            continue

        standalone = _line_events(line)
        if standalone:
            flush_trade(); flush_loose()
            events.extend(standalone)
            continue

        if _entry(line):
            flush_trade(); flush_loose()
            trade = [line]
            section_at[0] = dict(section)
            continue

        if RE_SWING.search(line) or RE_DAY.search(line):
            flush_trade(); flush_loose()
            section = {'style': 'swing'} if RE_SWING.search(line) else {'style': 'day'}
            if section['style'] == 'day' and (c := RE_CLOSE_AT.search(line)):
                section['close_at'] = hhmm(c.group(1))
            continue

        if trade is not None and (RE_DETAIL.search(line) or RE_NUMBERED.match(line)):
            flush_loose()
            trade.append(line)
            continue

        if RE_RISK_R.fullmatch(line.rstrip('.')) or RE_RISK_R.match(line):
            continue                             # "Risk 1R on each." under the header
        loose.append(line)

    flush_trade()
    flush_loose()
    return events


def has_trade_events(events):
    return any(e['kind'] in ('open', 'cancel', 'close', 'review') for e in events)
