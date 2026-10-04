from ._wb import *

# ── Disposition effect (disposition-effect) ───────────────────────────────────
# The lesson's six made-up holdings (Section 03) and its worked example:
#   Alder 100 × 40→52 = $5,200 (+1,200)   Birch 100 × 80→60 = $6,000 (−2,000)
#   Cedar 200 × 25→31 = $6,200 (+1,200)   Delta 100 × 50→38 = $3,800 (−1,200)
#   Elm   100 × 60→66 = $6,600 (+600)     Fir   150 × 30→24 = $3,600 (−900)
# Instinct: Alder + Cedar = $11,400, +$2,400 realised, $480 tax at 20%, PGR 2/3, PLR 0.
# Tax-aware: Birch + Delta = $9,800, −$3,200 realised, up to $640 saved, PGR 0, PLR 2/3.
# Odean (1998): PGR 0.148 vs PLR 0.098 (≈1.5×); sold winners beat kept losers by ~3.4 pp.
HW, HH, HS = 186, 76, 19
COL = [10, 207, 404]
def hold(id, i, row, name, pnl, worth, tone):
    return box(id, COL[i], 130 + row * 92, HW, HH, f'{name} {pnl}', tone, sub=f'worth {worth}', size=HS)
IN = [(90, 356), (324, 356)]          # two slots in the "sold today" tray
DAY = (10, 462, 285, 220)
OD = (305, 462, 285, 220)
DE = dict(w=600, h=860, intro='Six stocks, one cash need, two ways to raise it, and what 10,000 real accounts did. Press play, or step through.', steps=[
    step('You hold six stocks (made-up names, round numbers) and need $9,500 in cash by Friday. Something has to be sold.',
         icon('you', 'person', 20, 6, 0.62, None, 'you'),
         box('cash', 200, 14, 200, 76, 'cash by Friday', 'amber', sub='need $9,500', size=20),
         icon('tax', 'govt', 500, 6, 0.62, None, 'tax office', lsize=17)),
    step('Each is measured against its own buy price. Three are winners: Alder and Cedar up $1,200 each, Elm up $600. Three are losers: Birch down $2,000, Delta $1,200, Fir $900.',
         hold('al', 0, 0, 'Alder', '+$1,200', '$5,200', 'green'),
         hold('ce', 1, 0, 'Cedar', '+$1,200', '$6,200', 'green'),
         hold('el', 2, 0, 'Elm', '+$600', '$6,600', 'green'),
         hold('bi', 0, 1, 'Birch', '−$2,000', '$6,000', 'red'),
         hold('de', 1, 1, 'Delta', '−$1,200', '$3,800', 'red'),
         hold('fi', 2, 1, 'Fir', '−$900', '$3,600', 'red')),
    step('Instinct says sell the two big winners, Alder and Cedar. Selling a winner feels like being right. Together they raise $11,400.',
         box('tray', 10, 324, 580, 120, '', None),
         note('trayl', 24, 342, 'sold today', None, 18, anchor='start'),
         move('al', *IN[0], 900), move('ce', *IN[1], 900),
         dict(count='cash', **{'from': 0, 'to': 11400, 'dp': 0, 'pre': '$', 'ms': 900}),
         dict(sub='cash', text='$11,400 ✔')),
    step('But that realises +$2,400 of gains. At an illustrative 20% tax rate, that is a $480 bill, paid now.',
         chip('tx1', 300, 110, '−$480 tax', 'red'),
         move('tx1', 531, 110, 1000),
         dict(pulse='tax')),
    step('Score the sale day. Three winners could have been sold and you sold two: PGR = 2/3 = 0.67. Three losers could have been sold and you sold none: PLR = 0.',
         chart('day', DAY, 'This sale day', [0, 2], [0, 1], [[0, '0'], [0.5, '0.5'], [1, '1']], [[0.5, 'PGR'], [1.5, 'PLR']], pt=42),
         dict(bars='b1', chart='day', data=[[0.5, 2 / 3, '0.67', 'green'], [1.5, 0, '0', 'red']], bw=44, ms=900)),
    step('Now the other way. Put the winners back and sell the two biggest losers, Birch and Delta. They raise $9,800: still enough.',
         dict(hide='tx1'), dict(hide='b1'),
         move('al', COL[0], 130, 700), move('ce', COL[1], 130, 700),
         move('bi', *IN[0], 900), move('de', *IN[1], 900),
         dict(count='cash', **{'from': 0, 'to': 9800, 'dp': 0, 'pre': '$', 'ms': 900}),
         dict(sub='cash', text='$9,800 ✔')),
    step('That realises −$3,200, which at 20% is worth up to $640 of tax saved against gains elsewhere. This time PGR = 0 and PLR = 2/3.',
         chip('tx2', 531, 110, 'up to $640 saved', 'green'),
         move('tx2', 92, 110, 1000),
         dict(bars='b2', chart='day', data=[[0.5, 0, '0', 'green'], [1.5, 2 / 3, '0.67', 'red']], bw=44, ms=900)),
    step('Same cash need, same total portfolio value either way, yet the tax outcome is $1,120 apart. Tax logic says defer gains and take losses: the opposite of the instinct.',
         note('gap', 576, 342, 'tax gap: $480 + $640 = $1,120', 'amber', 18, anchor='end'),
         dict(pulse='tx2')),
    step('Real investors? Terrance Odean (1998) studied about 10,000 accounts at a US discount broker, 1987–1993. On sale days they realised 14.8% of the gains available but only 9.8% of the losses.',
         chart('od', OD, 'Odean: 10,000 accounts', [0, 2], [0, 0.2], [[0, '0'], [0.1, '0.10'], [0.2, '0.20']], [[0.5, 'PGR'], [1.5, 'PLR']], pl=52, pt=42),
         dict(bars='b3', chart='od', data=[[0.5, 0.148, '0.148', 'green'], [1.5, 0.098, '0.098', 'red']], bw=44, ms=1100)),
    step('So a winner was roughly 1.5 times as likely to be sold as a loser on any sale day. If the entry price did not matter, the two bars would be about equal.',
         cnote('x15', 'od', [1.0, 0.055], '≈1.5×', 'amber', 20),
         dict(pulse='b3')),
    step('And it cost them. Over the following year the winners they sold beat the losers they kept by about 3.4 percentage points (returns above the market). The losers were not "due a bounce".',
         box('cost', 10, 700, 285, 104, 'next year, sold winners\nbeat kept losers by', 'red', sub='≈ 3.4 pp', size=19),
         dict(pulse='cost')),
    step('The one month it flipped was December, the tax-loss-selling month: with a deadline, the same investors took losses readily. The fix: write exits at entry, and ask "if this were cash, would I buy it today?"',
         box('dec', 305, 700, 285, 104, 'in December only,\nlosses were sold\nmore readily', 'green', size=19),
         chip('fix', 300, 834, 'exits written at entry · fresh-eyes test', 'green'),
         dict(pulse='you')),
])


BOARD = dict(name='disposition', lesson='disposition-effect', title='Selling winners, holding losers, drawn step by step', cfg=DE,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>It actually happened: 10,000 accounts, seven years</h2>',
             deck_after=6)
