from ._wb import *

# ── Forced sellers sell what is liquid, not what is bad (investor-mood-forced-selling) ──
# Numbers: the worked example (A 500, L 400, E 100, λ 5 = lender's max; a 10% fall →
# A' 450, E' 50, leverage 9; S = 450 − 5 × 50 = 200, 44% of holdings) and March 2020
# (Treasuries and even gold fell with stocks; Fed: near-zero rates and at least $700bn of
# purchases on 15 March, open-ended on 23 March).
HX = [222, 316, 410, 504]   # holdings, inside the fund box
FORCED = dict(w=600, h=700, intro='A leveraged fund, a 10% fall and a margin call: watch what it is forced to sell, and why unrelated assets then fall together. Press play, or step through.', steps=[
    step('Meet a leveraged fund. It owns Treasuries, big liquid stocks, some gold, and one holding it now likes least: its worst idea.',
         box('fund', 200, 10, 385, 190, 'Leveraged fund', 'purple', top=True, size=22),
         icon('tsy', 'scroll', HX[0], 62, 0.5, 'blue', 'Treasuries', lsize=16),
         icon('stk', 'up', HX[1], 62, 0.5, 'green', 'big stocks', lsize=16),
         icon('gld', 'gold', HX[2], 62, 0.5, 'amber', 'gold', lsize=16),
         icon('bad', 'factory', HX[3], 62, 0.5, 'red', 'worst idea', lsize=16)),
    step('It paid for 500 of assets with 100 of its own money and 400 borrowed from a lender. That is 5× leverage, the most the lender allows.',
         icon('lend', 'bank', 18, 40, 0.8, 'blue', 'lender', sym='$'),
         icon('loan', 'cash', 102, 128, 0.45, 'green', sym='$'),
         move('loan', 142, 128, 900), dict(hide='loan'),
         arrow('lend', 'fund', 'loan 400', 'blue', id='la', size=17),
         box('A', 20, 228, 170, 70, 'Assets', 'chalk', sub='500', size=20),
         box('L', 215, 228, 170, 70, 'Loan', 'blue', sub='400', size=20),
         box('E', 410, 228, 170, 70, 'Own money', 'green', sub='100', size=20),
         note('lev', 300, 322, 'leverage = 500 ÷ 100 = 5×  (the lender\'s max)', None, 18)),
    step('Prices fall 10%. Assets drop to 450, but the loan is still 400, so the fund\'s own money halves to 50. Leverage jumps to 450 ÷ 50 = 9×.',
         dict(count='A', **{'from': 500, 'to': 450, 'dp': 0, 'ms': 1200}),
         dict(count='E', **{'from': 100, 'to': 50, 'dp': 0, 'ms': 1200}),
         dict(hide='lev'),
         note('lev2', 300, 322, 'leverage = 450 ÷ 50 = 9×', 'red', 19)),
    step('Margin call. To get back to 5× it must sell 450 − 5 × 50 = 200: 44% of everything it owns, because prices fell 10%. And it must sell now.',
         icon('mc', 'megaphone', 60, 348, 0.62, 'red'),
         note('sell', 140, 366, 'margin call: sell 200', 'red', 22, anchor='start'),
         note('sell2', 140, 400, '= 450 − 5 × 50: 44% of the fund, today', 'red', 18, anchor='start')),
    step('Left to choose, it would sell its worst idea, slowly, over days. A forced seller has no such choice: it needs cash fast, at the least cost per dollar raised.',
         dict(pulse='bad'),
         note('slow', HX[3] + 25, 160, 'not today', 'red', 16)),
    step('So it sells what turns into cash fastest, often its winners: Treasuries, big stocks, gold. The good assets go out of the door, and the bad one stays.',
         icon('s1', 'scroll', HX[0], 62, 0.38, 'blue'),
         icon('s2', 'up', HX[1], 62, 0.38, 'green'),
         icon('s3', 'gold', HX[2], 62, 0.38, 'amber'),
         icon('mkt', 'crowd', 510, 360, 0.6, None),
         note('mktl', 540, 346, 'buyers', None, 17),
         move('s1', 512, 400, 900), move('s2', 524, 400, 800), move('s3', 536, 400, 700),
         dict(hide='s1'), dict(hide='s2'), dict(hide='s3'),
         dict(dim='tsy'), dict(dim='stk'), dict(dim='gld'),
         dict(pulse='mkt')),
    step('Every fund like it does the same, at once. In mid-March 2020 Treasuries were sold (their yields rose) while stocks fell, and for a stretch even gold fell. The world\'s safe asset was dumped because it was the easiest thing to sell.',
         chart('px', (20, 470, 360, 190), 'Prices, mid-March 2020 (shape only)', [0, 10], [0, 10], [], [], pt=38, pl=16),
         series('p1', 'px', [[0, 8.6], [3, 7.4], [6, 5.6], [10, 3.4]], 'green', label='stocks', lat=[10, 3.4], ldx=-4, ldy=16, lanchor='end', ms=900),
         series('p2', 'px', [[0, 8.2], [3, 7.6], [6, 6.2], [10, 5.0]], 'blue', label='Treasuries', lat=[10, 5.0], ldx=-4, ldy=-14, lanchor='end', ms=900),
         series('p3', 'px', [[0, 7.0], [3, 6.6], [6, 5.4], [10, 4.4]], 'amber', label='gold', lat=[0, 7.0], ldx=2, ldy=16, lanchor='start', ms=900)),
    step('Assets with nothing in common fall together, because they share a holder who is selling, not a fundamental. That is what "correlations go to one" means.',
         cnote('one', 'px', [0.3, 1.3], 'shared holder, not shared news', 'purple', 17, anchor='start')),
    step('And it feeds itself. Lower prices cut the next fund\'s equity and trigger more margin calls, and lenders cut the leverage they allow when markets get volatile, so the required sale grows just when selling is most costly.',
         arrow('px', 'mc', None, 'red', id='spiral'),
         note('spl', 150, 440, '↺ lower prices → more margin calls', 'red', 18, anchor='start')),
    step('It stopped in March 2020 when a buyer with no risk limit arrived. The Fed cut rates to near zero on 15 March with at least $700bn of purchases, then made them open-ended on 23 March.',
         icon('fed', 'bank', 470, 500, 0.72, 'blue', 'the Fed\nno risk limit', sym='$', lsize=17),
         arrow('fed', 'mkt', 'buys', 'blue', id='fb', size=17)),
    step('Nothing about the Treasuries or the gold changed. The seller did. Forced selling stops when the forcing stops, not when the news improves.',
         note('end', 300, 682, 'Forced sellers sell what is liquid, not what is bad.', 'amber', 20)),
])


BOARD = dict(name='forced', lesson='investor-mood-forced-selling', title='Forced selling, drawn step by step', cfg=FORCED,
             before='  <div class="tl-box scenario">\n    <div class="tl-icon-badge amber">🎯</div>\n    <div class="tl-box-label">Real-world trading scenario</div>\n    <h3>"Is this fear, or is this forced?"</h3>',
             deck_after=8)
