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
A, B, C, D = (10, 40, 262, 175), (328, 40, 262, 175), (10, 300, 262, 175), (328, 300, 262, 175)
def chart(id, r, title, xd, yd, yt, xt, tone=None, **kw):
    d = dict(chart=id, x=r[0], y=r[1], w=r[2], h=r[3], title=title, xd=xd, yd=yd, yt=yt, xt=xt, **kw)
    if tone: d['tone'] = tone
    return d
def series(id, ch, pts, tone, **kw): return dict(series=id, chart=ch, pts=pts, tone=tone, **kw)
def dot(id, ch, at, text, tone, **kw): return dict(dot=id, chart=ch, at=at, text=text, tone=tone, **kw)
# Policy rates, 2024 (months: Jan = 0). Fed upper bound 5.50% all year until the 18 Sept cut;
# BoJ: -0.1% until 19 Mar, 0-0.1% (plotted 0.05) until 31 Jul, then 0.25%.
US_ACT = [[0, 5.5], [7, 5.5]]
JP_ACT = [[0, -0.1], [2.6, -0.1], [2.6, 0.05], [7, 0.05], [7, 0.25]]
US_EXP = [[7, 5.5], [11.5, 4.5]]          # about 1 point of US cuts priced for the rest of 2024
JP_EXP = [[7, 0.25], [11.5, 0.4]]
def cnote(id, ch, at, text, tone, size=17, anchor='middle', dx=0, dy=0):
    return dict(note=id, chart=ch, at=at, text=text, tone=tone, size=size, anchor=anchor, dx=dx, dy=dy)
YEN = dict(w=600, h=580, intro='August 2024, drawn as the charts actually moved: a narrowing rate gap, a soaring yen, a stock crash and a volatility spike. Press play, or step through.', steps=[
    step('Start with what powered the trade. All year the Fed held rates at 5.25–5.50%; Japan only left negative rates in March, to 0–0.1%.',
         chart('rates', A, 'Policy rates, 2024', [0, 11.5], [-1.4, 7], [[0, '0%'], [5, '5%']], [[0, 'Jan'], [3, 'Apr'], [7, 'Aug'], [11, 'Dec']], pt=38),
         series('us', 'rates', US_ACT, 'blue', label='US', lat=[1, 5.5], ldy=-13),
         series('jp', 'rates', JP_ACT, 'amber', label='Japan', lat=[1.3, -0.1], ldy=15, ms=1300)),
    step('That gap of more than 5 percentage points is the carry trade: borrow yen almost free, put the money into dollars and higher-yielding assets.',
         dict(gap='g1', chart='rates', top=US_ACT, bot=[[0, -0.1], [2.6, -0.1], [2.6, 0.05], [7, 0.05]], tone='red', op=0.2),
         cnote('gl', 'rates', [3.5, 2.7], 'the gap\n= the trade', 'red', 18)),
    step('31 July: the Bank of Japan raises its rate to 0.25%. Then on 2 August a weak US jobs report has markets pricing about a percentage point of US cuts by year-end.',
         dot('boj', 'rates', [7, 0.25], 'BoJ hike', 'amber', dx=8, dy=13, anchor='start'),
         series('usx', 'rates', US_EXP, 'blue', dash=True, ms=900),
         series('jpx', 'rates', JP_EXP, 'amber', dash=True, ms=600),
         dot('jobs', 'rates', [7, 5.5], 'weak jobs', 'blue', dy=-14)),
    step('Now the gap is expected to narrow from both ends at once. Watch the shaded band pinch.',
         dict(gap='g2', chart='rates', top=US_EXP, bot=JP_EXP, tone='red', op=0.34),
         cnote('pinch', 'rates', [9.3, 2.4], 'narrowing', 'red', 18), dict(pulse='g2')),
    step('The yen surges. USD/JPY, near 162 in early July, is down to about 142 by 5 August — a huge move for a major currency.',
         chart('fx', B, 'USD/JPY (approx.)', [0, 35], [139, 168], [[140, '140'], [150, '150'], [160, '160']], [[0, '3 Jul'], [17, 'mid-Jul'], [33, '5 Aug']]),
         arrow('rates', 'fx'),
         series('jpy', 'fx', [[0, 161.9], [8, 159], [14, 156], [22, 152.5], [28, 150], [30, 146.5], [33, 141.7]], 'red', ms=1600),
         dot('j0', 'fx', [0, 161.9], '161.9', 'red', dx=8, dy=17, anchor='start'),
         dot('j1', 'fx', [33, 141.7], '141.7', 'red', dx=-10, dy=10, anchor='end')),
    step('Everyone who borrowed yen now owes more than they borrowed. Closing those trades means buying yen back — which pushes the yen up again. The chain has become a loop.',
         cnote('loop', 'fx', [33, 165], 'unwinding = buying yen\n→ yen up again ↺', 'red', 17, anchor='end')),
    step('To raise cash they sell what they can sell fast. The Nikkei 225 falls about 6% on Friday 2 August, then about 12% on Monday 5 August — its worst day since 1987.',
         chart('nik', C, 'Nikkei 225, daily move', [0, 4], [-21, 14], [[-10, '−10%'], [0, '0'], [10, '+10%']], [[1, '2 Aug'], [2, '5 Aug'], [3, '6 Aug']], zero=True, pl=50, pt=38),
         arrow('fx', 'nik', 'sell stocks'),
         dict(bars='nb', chart='nik', data=[[1, -5.8, '−5.8%'], [2, -12.4, '−12.4%']], bw=34, ms=1100)),
    step("Everyone reaches for protection at once. The VIX, Wall Street's volatility gauge, closes at 16 on 31 July and 23 on 2 August, then trades as high as about 65 on the morning of 5 August.",
         chart('vix', D, 'VIX', [0, 3.4], [0, 75], [[20, '20'], [40, '40'], [60, '60']], [[0, '31 Jul'], [1, '2 Aug'], [2, '5 Aug'], [3, '6 Aug']]),
         arrow('nik', 'vix'),
         series('vx', 'vix', [[0, 16.4], [1, 23.4], [2, 38.6]], 'purple', ms=900),
         series('vrange', 'vix', [[2, 38.6], [2, 65.7]], 'purple', dash=True, ms=500),
         dot('vhi', 'vix', [2, 65.7], 'intraday ≈65', 'purple', dx=-10, dy=0, anchor='end'),
         dot('vcl', 'vix', [2, 38.6], 'close ≈39', 'purple', dx=-10, dy=-16, anchor='end')),
    step('Funds that size positions by recent volatility must cut exposure when it jumps: more selling, a second loop.',
         arrow('vix', 'nik', 'vol-target funds sell', 'purple', bend=-55, id='loop2', size=17)),
    step('Then the forced sellers ran out. On 6 August the Nikkei jumped about 10% and the VIX fell back. Leverage turns a chain into a loop — but only until the forced selling is done.',
         dict(bars='nb2', chart='nik', data=[[3, 10.2, '+10.2%']], bw=34, ms=900),
         series('vx2', 'vix', [[2, 38.6], [3, 27.7]], 'green', ms=600),
         note('end', 300, 560, 'Forced sellers done → much of it reversed within days', 'green', 21)),
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

# ── The same boards as a "Watch it" slide in each visual guide (slide deck) ──
DECKS = [  # (deck file, board name, insert after data-slide N)
    ('domino-chain-cross-asset-micro.html', 'yen', 8),
    ('gamma-exposure-dealer-hedging-micro.html', 'squeeze', 7),
    ('qe-qt-balance-sheet-micro.html', 'qe', 6),
]
BY_NAME = {name: (title, cfg) for _, name, title, cfg, _ in BOARDS}

for fn, name, after in DECKS:
    p = L + fn; s = open(p).read()
    s = re.sub(rf'    <!-- WB:{name}-deck:START -->[\s\S]*?<!-- WB:{name}-deck:END -->\n\n', '', s)
    # Restore sequential numbering before locating the insertion point.
    n = [0]
    s = re.sub(r'(<section class="sl-slide(?: active)?" data-slide=")\d+(")', lambda m: m.group(1) + str(n.__setitem__(0, n[0] + 1) or n[0]) + m.group(2), s)
    title, cfg = BY_NAME[name]
    slide = (f'    <!-- WB:{name}-deck:START -->\n    <section class="sl-slide" data-slide="0">\n'
             f'      <div class="sl-kicker">▶ Watch it</div>\n      <h2 class="sl-h2">{title}</h2>\n'
             + block(name, title, cfg).replace('\n  ', '\n      ').replace('  <!--', '      <!--', 1)
             + f'    </section>\n    <!-- WB:{name}-deck:END -->\n\n')
    m = re.search(rf'<section class="sl-slide(?: active)?" data-slide="{after + 1}">', s)
    assert m, (fn, after)
    line_start = s.rfind('\n', 0, m.start()) + 1
    s = s[:line_start] + slide + s[line_start:]
    n = [0]
    s = re.sub(r'(<section class="sl-slide(?: active)?" data-slide=")\d+(")', lambda m: m.group(1) + str(n.__setitem__(0, n[0] + 1) or n[0]) + m.group(2), s)
    if 'assets/whiteboard.css' not in s:
        s = s.replace('<link rel="stylesheet" href="../assets/deck.css', '<link rel="stylesheet" href="../assets/whiteboard.css">\n<link rel="stylesheet" href="../assets/deck.css', 1)
    if 'assets/whiteboard.js' not in s:
        s = s.replace('</body>', '<script src="../assets/whiteboard.js" defer></script>\n</body>', 1)
    open(p, 'w').write(s)
    print('ok', fn, 'slides', n[0])
