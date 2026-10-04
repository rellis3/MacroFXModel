"""Builds the three pilot "Watch it" boards and inserts them into their lessons.
Re-runnable: each board sits between <!-- WB:name:START --> / <!-- WB:name:END --> markers."""
import json, re, os
L = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'theory-lab', 'lessons') + '/'

def box(id, x, y, w, h, text, tone=None, sub=None, top=False, size=None):
    d = dict(box=id, x=x, y=y, w=w, h=h, text=text)
    if tone: d['tone'] = tone
    if sub is not None: d['sub'] = sub
    if top: d['top'] = True
    if size: d['size'] = size
    return d
def arrow(a, b, label=None, tone=None, bend=0, dash=False, id=None, size=None):
    d = dict(arrow=[a, b])
    if label: d['label'] = label
    if tone: d['tone'] = tone
    if bend: d['bend'] = bend
    if dash: d['dash'] = True
    if id: d['id'] = id
    if size: d['size'] = size
    return d
def note(id, x, y, text, tone=None, size=20, anchor='middle'):
    d = dict(note=id, x=x, y=y, text=text, size=size, anchor=anchor)
    if tone: d['tone'] = tone
    return d
def step(cap, *ops): return dict(cap=cap, do=list(ops))

# ── 1. Yen carry unwind (domino-chain-cross-asset) ────────────────────────────
YEN = dict(w=600, h=440, intro='August 2024: how a rate decision in Tokyo became the worst day for Japanese stocks since 1987. Press play, or step through.', steps=[
    step('End of July 2024: the Bank of Japan raises interest rates.',
         box('boj', 15, 20, 160, 66, 'BoJ hikes', 'amber', sub='31 July')),
    step('Days later, on 2 August, a weak US jobs report makes US rate cuts look closer.',
         box('us', 15, 112, 160, 66, 'Weak US jobs', 'amber', sub='2 August')),
    step('The gap between US and Japanese rates is the whole reason to borrow in yen and invest elsewhere. Now it is expected to narrow from both ends at once.',
         box('gap', 205, 58, 140, 82, 'US–Japan\nrate gap', 'blue', sub='narrowing'),
         arrow('boj', 'gap'), arrow('us', 'gap')),
    step('The yen strengthens sharply. USD/JPY, near 162 in early July, is down to about 142 by 5 August.',
         box('jpy', 400, 58, 170, 82, 'USD/JPY', 'blue', sub='161.9'),
         arrow('gap', 'jpy'),
         dict(count='jpy', **{'from': 161.9, 'to': 141.7, 'dp': 1, 'ms': 1600})),
    step('Anyone who borrowed yen to buy higher-yielding assets now owes more, in their own currency, than they borrowed. They are losing money on the currency alone.',
         box('carry', 400, 190, 170, 76, 'Yen-funded\ncarry trades', 'red', sub='losing'),
         arrow('jpy', 'carry')),
    step('Closing those trades means buying yen back to repay the loans, which pushes the yen up again. The chain has become a loop.',
         arrow('carry', 'jpy', 'buy yen back', 'red', bend=-32, id='loop1', size=17),
         dict(pulse='jpy')),
    step('Holders cut risk everywhere at once, and they sell what they can sell quickly: what is liquid, not what is bad.',
         box('sell', 220, 190, 130, 76, 'Forced\nselling', 'red'),
         arrow('carry', 'sell')),
    step('Monday 5 August: the Nikkei 225 falls more than 12% in a single session, its worst day since 1987.',
         box('nik', 10, 205, 160, 76, 'Nikkei 225', 'red', sub='−12% in a day'),
         arrow('sell', 'nik')),
    step('Everyone reaches for protection at once. The VIX, Wall Street\'s volatility gauge, briefly trades above 60 intraday.',
         box('vix', 15, 320, 160, 76, 'VIX', 'purple', sub='above 60'),
         arrow('nik', 'vix', 'hedges bid')),
    step('Funds that size their positions by recent volatility must cut exposure when volatility jumps. That is more selling: a second loop.',
         box('vt', 210, 320, 170, 76, 'Vol-target funds\ncut exposure', 'purple', size=20),
         arrow('vix', 'vt'), arrow('vt', 'sell', 'more selling', 'red', id='loop2')),
    step('Then the forced sellers ran out. Much of the move reversed within days, and the Nikkei rebounded sharply the very next session. Leverage turns a chain into a loop, but only until the forced selling is done.',
         note('end', 300, 425, 'Forced sellers done → much of it reversed within days', 'green', 21)),
])

# ── 2. Gamma squeeze (gamma-exposure-dealer-hedging) ─────────────────────────
def py(p): return round(250 - (p - 4470) * 2)  # price → y on the mini chart
GAM = dict(w=600, h=520, intro='A stylised index-futures squeeze: the same open interest that looked like a wall becomes the fuel. Press play, or step through.', steps=[
    step('A big pile of 4,500 calls has built up. Here, customers bought them, so the dealers who sold them are short the calls. That is the opposite of the usual case.',
         box('cust', 20, 14, 240, 66, 'Customers BUY\n4,500 calls', 'blue'),
         box('deal', 340, 14, 240, 66, 'Dealers SELL them\n→ short gamma', 'red'),
         arrow('cust', 'deal')),
    step('Price grinds up from 4,480 toward the 4,500 strike in a quiet session.',
         dict(line='axis', points=[[30, 100], [30, 255], [575, 255]], tone='chalk', width=2, ms=500),
         dict(line='strike', points=[[30, py(4500)], [575, py(4500)]], tone='amber', width=2, ms=600),
         note('sk', 470, py(4500) + 16, '4,500 strike', 'amber', 18),
         dict(line='p1', points=[[40, py(4480)], [90, py(4483)], [140, py(4486)], [190, py(4490)], [240, py(4494)], [270, py(4497)]], tone='blue', width=3.5, ms=1400)),
    step('As price rises, each short call\'s delta rises, from say 0.40 toward 0.50. A short-call position must be hedged with long futures equal to delta, so the dealers\' hedge has to grow.',
         box('up', 20, 290, 165, 66, 'Price rises', 'blue'),
         box('dl', 218, 290, 165, 66, 'Calls\' delta', 'amber', sub='0.40'),
         arrow('up', 'dl'),
         dict(count='dl', **{'from': 0.40, 'to': 0.50, 'dp': 2, 'ms': 1300})),
    step('So the dealers must buy futures. On 1,000 short calls with a 100 multiplier, each 0.10 rise in delta means buying the equivalent of 10,000 more units of the index.',
         box('buy', 415, 290, 165, 66, 'Dealers BUY\nfutures', 'red'),
         arrow('dl', 'buy')),
    step('That buying nudges price higher, which raises delta again and forces more buying. At the strike, delta is about 0.5 and gamma is at its peak, so this loop runs fastest right here.',
         arrow('buy', 'up', 'their buying lifts price', 'red', bend=-48, id='loop'),
         dict(pulse='buy')),
    step('Then a strong data release hits mid-session, and price rips straight through 4,500.',
         dict(line='p2', points=[[270, py(4497)], [290, py(4502)], [305, py(4512)], [325, py(4520)]], tone='red', width=3.5, ms=700)),
    step('The calls are now in the money and gaining delta faster than the dealers\' hedge assumed. The catch-up buying accelerates the move well past the strike.',
         dict(count='dl', **{'from': 0.50, 'to': 0.80, 'dp': 2, 'ms': 1200}),
         dict(line='p3', points=[[325, py(4520)], [355, py(4529)], [385, py(4535)]], tone='red', width=3.5, ms=800),
         dict(pulse='loop')),
    step('Once the calls are deep in the money, delta approaches 1 and gamma fades. The forced buying dies out, and price finds the next level.',
         dict(line='p4', points=[[385, py(4535)], [430, py(4537)], [480, py(4536)], [540, py(4538)]], tone='chalk', width=3, ms=1000)),
    step('Contrast the usual case: if dealers had owned these calls (customers overwriting them), their hedging would sell into the rally hardest right around 4,500, and the move would tend to stall there. Same open interest, opposite flow. Who owns it decides.',
         box('std', 20, 440, 560, 68, 'If dealers OWNED the calls (the usual case):\nthey sell into the rally → it stalls near 4,500', 'green', size=20)),
])

# ── 3. QE and QT through four balance sheets (qe-qt-balance-sheet) ───────────
def acct(id, x, y, title, tone):
    return [box(id, x, y, 285, 200, title, tone, top=True, size=22),
            dict(line=id + '-div', points=[[x + 142, y + 44], [x + 142, y + 188]], tone='chalk', width=1.5, ms=300),
            note(id + '-a', x + 71, y + 52, 'Assets', None, 17),
            note(id + '-l', x + 213, y + 52, 'Liabilities', None, 17)]
FX, FY, BX, BY, PX, PY, TX, TY = 10, 10, 305, 10, 10, 255, 305, 255
def chip(id, x, y, text, tone): return dict(chip=id, x=x, y=y, text=text, tone=tone)
QE = dict(w=600, h=520, intro='One $100bn purchase, followed through four balance sheets — then the same film run backwards for QT. Figures in $bn.', steps=[
    step('Four balance sheets: the Fed, the banking system, a pension fund and the US Treasury. Every one must always balance: assets equal liabilities (plus capital).',
         *acct('fed', FX, FY, 'The Fed', 'amber'), *acct('bank', BX, BY, 'Banking system', 'blue'),
         *acct('pen', PX, PY, 'Pension fund', 'purple'), *acct('tsy', TX, TY, 'US Treasury', 'chalk')),
    step('QE: the Fed buys a $100bn Treasury bond. Most QE bonds came from non-banks like this pension fund, through dealers.',
         chip('bond', PX + 71, PY + 100, 'Bond 100', 'amber')),
    step('The bond moves to the Fed. It is now the Fed\'s asset.',
         dict(move='bond', x=FX + 71, y=FY + 100, ms=1300)),
    step('How does the Fed pay? It credits the seller\'s bank with $100bn of reserves, an entry it creates on its own books. Nothing has to be borrowed first. The Fed\'s assets and liabilities rise together.',
         chip('fres', FX + 213, FY + 100, 'Reserves 100', 'amber')),
    step('The pension fund\'s bank now holds $100bn more reserves (an asset) and owes the fund a $100bn deposit (a liability). Its balance sheet grows on both sides.',
         chip('bres', BX + 71, BY + 100, 'Reserves 100', 'blue'),
         chip('bdep', BX + 213, BY + 100, 'Deposits 100', 'blue')),
    step('The pension fund has swapped a long bond for a bank deposit. Everything balances: no money appeared from nowhere without a matching entry.',
         chip('pdep', PX + 71, PY + 100, 'Deposit 100', 'purple')),
    step('The point: the private sector now holds fewer long bonds and more deposits. Investors who still want duration bid up what is left, so the term premium and long yields fall. That is the portfolio-balance channel.',
         note('ch', 300, 490, 'fewer long bonds in private hands → term premium ↓ → 10-year yield ↓', 'green', 20)),
    step('QT runs the film backwards. In this cycle it has been runoff: a $100bn bond the Fed holds matures and is not replaced.',
         dict(hide='ch'), dict(pulse='bond'),
         note('qt', 300, 490, 'QT: let it mature, do not reinvest', 'red', 21)),
    step('To pay the Fed off, the Treasury sells a new $100bn bond to the public. Here the pension fund buys it.',
         chip('nb', TX + 142, TY + 110, 'New bond 100', 'chalk'),
         dict(move='nb', x=PX + 71, y=PY + 148, ms=1300)),
    step('The fund pays with its deposit, so the deposit leaves the bank and the bank\'s reserves fall with it.',
         dict(dim='pdep'), dict(dim='bdep'), dict(dim='bres')),
    step('The Treasury uses that cash to repay the Fed. The Fed\'s bond and the matching reserves both disappear. Net result: reserves down $100bn, one more long bond in private hands.',
         dict(dim='bond'), dict(dim='fres'), dict(pulse='nb'),
         note('tsyl', TX + 213, TY + 110, 'owes Fed −100\nowes public +100', None, 17)),
    step('Do it slowly and nobody notices, until reserves run short. In September 2019 that is how the Fed found out where "short" was.',
         dict(hide='qt'), note('end', 300, 490, 'Too far, too fast → reserves scarce (Sept 2019)', 'amber', 21)),
])

ANCHORS = {
    'gamma-exposure-dealer-hedging.html': '  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: 5 February 2018',
    'qe-qt-balance-sheet.html': '  <div class="tl-chart interactive">\n    <div class="tl-chart-label">Four balance sheets, one purchase',
}
BOARDS = [
    ('domino-chain-cross-asset.html', 'yen', 'The yen carry unwind, drawn step by step', YEN, '  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧮</div>\n    <div class="tl-box-label">Worked example</div>\n    <h3>One hot print, priced through four assets</h3>'),
    ('gamma-exposure-dealer-hedging.html', 'squeeze', 'A gamma squeeze, drawn step by step', GAM, None),
    ('qe-qt-balance-sheet.html', 'qe', 'One QE purchase — and its QT reverse — through four balance sheets', QE, None),
]

def block(name, title, cfg):
    js = json.dumps(cfg, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (f'  <!-- WB:{name}:START -->\n  <div class="wb" data-title="{title}">\n'
            f'    <script type="application/json">{js}</script>\n  </div>\n  <!-- WB:{name}:END -->\n')

for fn, name, title, cfg, before in BOARDS:
    p = L + fn; s = open(p).read()
    s = re.sub(rf'  <!-- WB:{name}:START -->[\s\S]*?<!-- WB:{name}:END -->\n', '', s)
    b = block(name, title, cfg)
    if before is None:
        before = ANCHORS[fn]
    assert s.count(before) == 1, (fn, s.count(before))
    s = s.replace(before, b + '\n' + before, 1)
    if 'assets/whiteboard.css' not in s:
        s = s.replace('<link rel="stylesheet" href="../assets/theory.css', '<link rel="stylesheet" href="../assets/whiteboard.css">\n<link rel="stylesheet" href="../assets/theory.css', 1)
    if 'assets/whiteboard.js' not in s:
        s = s.replace('</body>', '<script src="../assets/whiteboard.js" defer></script>\n</body>', 1)
    open(p, 'w').write(s)
    print('ok', fn, len(cfg['steps']), 'steps')
