from ._wb import *

# ── Limit order books: a market order walks the book (limit-order-books) ─────
# The lesson's hypothetical FX snapshot: asks 1.1005 / 1.1006 / 1.1007 with 200 / 300 / 500
# resting; bids 1.1004 / 1.1003 / 1.1002 with 400 / 250 / 600. Spread 1.1005 − 1.1004 = 1 pip;
# depth at the touch 200 (ask) / 400 (bid). Worked example: a 600-unit market buy takes 200 @
# 1.1005, 300 @ 1.1006, 100 of 500 @ 1.1007 (400 left resting); VWAP = 660.35 / 600 ≈ 1.10058,
# ≈ 0.83 pips worse than the best ask. After the order the best ask is 1.1007, so the spread is
# 3 pips (our arithmetic from the same ladder). Thin book: every level cut to a tenth (the
# lesson's own what-if) holds 20 + 30 + 50 = 100 units, so the same order walks straight through.
# October 2014: 10-year Treasury yield fell about 16 bp and came back within 12 minutes (9:33–9:45).
ASKS = [(1.1005, 200, 264), (1.1006, 300, 222), (1.1007, 500, 180)]   # price, size, row y
BIDS = [(1.1004, 400, 328), (1.1003, 250, 370), (1.1002, 600, 412)]
K, AX, BX = 0.26, 360, 240          # px per unit, ask bars start, bid bars start
VWAP = (200 * 1.1005 + 300 * 1.1006 + 100 * 1.1007) / 600
assert round(200 * 1.1005 + 300 * 1.1006 + 100 * 1.1007, 2) == 660.35
assert round(VWAP, 5) == 1.10058 and round((VWAP - 1.1005) / 0.0001, 2) == 0.83

def _scribble(x0, x1, y, step=5):
    """A hand-scribbled filled bar from x0 to x1 (either direction), 22 units tall."""
    n = max(2, int(abs(x1 - x0) / step))
    return [[round(x0 + (x1 - x0) * i / n, 1), y - 11 if i % 2 == 0 else y + 11] for i in range(n + 1)]
def abar(id, size, y, tone='red', start=0):
    return dict(line=id, points=_scribble(AX + K * start, AX + K * (start + size), y), tone=tone, width=2.4, ms=700)
def bbar(id, size, y):
    return dict(line=id, points=_scribble(BX, BX - K * size, y), tone='green', width=2.4, ms=700)

PW = (10, 446, 580, 226)            # price paid vs units filled

LOB = dict(w=600, h=868, intro='Two ladders of waiting orders, and one impatient order that eats through them. The lesson\'s own small book, step by step.', steps=[
    step('Every quoted price hides a whole ladder of orders waiting underneath it. Buyers wait on one side, sellers on the other, each at a price they chose.',
         icon('buy', 'crowd', 34, 4, 0.6, 'green', 'buyers waiting', lsize=17),
         icon('sell', 'crowd', 470, 4, 0.6, 'red', 'sellers waiting', lsize=17),
         note('hb', 150, 140, 'bids: buy at…', 'green', 18),
         note('ha', 455, 140, 'asks: sell at…', 'red', 18),
         *[note(f'p{i}', 300, y, f'{p:.4f}', 'chalk', 18) for i, (p, s, y) in enumerate(ASKS + BIDS)]),
    step('The ask side: sellers\' resting limit orders. 200 units wait at 1.1005, the best (lowest) ask, then 300 at 1.1006 and 500 at 1.1007. Each bar is the size resting at one price.',
         *[abar(f'a{i}', s, y) for i, (p, s, y) in enumerate(ASKS)],
         *[note(f'as{i}', AX + K * s + 10, y, str(s), 'red', 17, anchor='start') for i, (p, s, y) in enumerate(ASKS)]),
    step('The bid side: buyers\' resting orders. 400 at 1.1004, the best (highest) bid, then 250 at 1.1003 and 600 at 1.1002.',
         *[bbar(f'b{i}', s, y) for i, (p, s, y) in enumerate(BIDS)],
         *[note(f'bs{i}', BX - K * s - 16, y, str(s), 'green', 17, anchor='end') for i, (p, s, y) in enumerate(BIDS)]),
    step('The gap between the two ladders is the spread: 1.1005 − 1.1004 = 1 pip, the cost of demanding a trade right now. The size sitting at the best prices, 200 on the ask and 400 on the bid, is the depth.',
         note('spr', 300, 296, 'spread: 1 pip', 'amber', 18),
         dict(pulse='a0'), dict(pulse='b0')),
    step('A bar is not one order but a queue of them. Better prices fill first; at the same price, whoever arrived first fills first. No cutting in line.',
         *[dict(line=f'q{j}', points=[[x, 168], [x, 192]], tone='chalk', width=2.4, ms=200) for j, x in enumerate((392, 412, 446))],
         note('ql', 300, 108, 'one level = a queue, first in, first out', 'chalk', 17)),
    step('Now an impatient buyer arrives: a market order for 600 units. No price, just "fill me now, whatever it costs". It goes to the cheapest ask first.',
         dict(hide='ql'), dict(hide='q0'), dict(hide='q1'), dict(hide='q2'),
         icon('mkt', 'person', 272, 6, 0.56, 'amber', 'market buy: 600', lsize=17),
         chip('o1', 300, 98, '600', 'amber'),
         move('o1', 566, ASKS[0][2], 1100)),
    step('Level 1: it takes all 200 units at 1.1005. Not nearly enough, so 400 are still to fill.',
         abar('e0', 200, ASKS[0][2], 'amber'),
         chart('pw', PW, 'Price paid, unit by unit', [0, 600], [1.10045, 1.10075],
               [[1.1005, '1.1005'], [1.1006, '1.1006'], [1.1007, '1.1007']], [[0, '0'], [200, '200'], [500, '500'], [600, '600']], pl=72, pr=16),
         series('w1', 'pw', [[0, 1.1005], [200, 1.1005]], 'amber', ms=700),
         box('fill', 10, 686, 280, 76, 'filled / still to fill', 'amber', sub='200 / 400', size=19),
         dict(hide='o1'), chip('o2', 566, ASKS[1][2], '400', 'amber')),
    step('Level 2: the price walks up a step. It takes all 300 at 1.1006: 500 filled, 100 to go.',
         abar('e1', 300, ASKS[1][2], 'amber'),
         series('w2', 'pw', [[200, 1.1005], [200, 1.1006], [500, 1.1006]], 'amber', ms=900),
         dict(sub='fill', text='500 / 100'),
         dict(hide='o2'), chip('o3', 566, ASKS[2][2], '100', 'amber')),
    step('Level 3: it needs only 100 of the 500 at 1.1007 and stops. The other 400 stay resting for the next order. Done: 600 filled across three prices.',
         abar('e2', 100, ASKS[2][2], 'amber'),
         series('w3', 'pw', [[500, 1.1006], [500, 1.1007], [600, 1.1007]], 'amber', ms=700),
         dict(sub='fill', text='600 / 0'),
         dict(hide='o3')),
    step('Average the prices by how much filled at each: (220.10 + 330.18 + 110.07) ÷ 600 = 660.35 ÷ 600 ≈ 1.10058. That is about 0.83 pips worse than the 1.1005 it started at: the cost of walking the book.',
         series('best', 'pw', [[0, 1.1005], [600, 1.1005]], None, dash=True, ms=400),
         series('vw', 'pw', [[0, round(VWAP, 6)], [600, round(VWAP, 6)]], 'purple', dash=True, label='VWAP', lat=[90, VWAP], ldy=-14, ms=600),
         dict(gap='cost', chart='pw', top=[[0, round(VWAP, 6)], [600, round(VWAP, 6)]], bot=[[0, 1.1005], [600, 1.1005]], tone='red', op=0.25),
         box('vwap', 310, 686, 280, 76, 'average price paid', 'purple', sub='1.10050', size=19),
         dict(count='vwap', **{'from': 1.1005, 'to': round(VWAP, 5), 'dp': 5, 'ms': 1200})),
    step('Look at the book now. Levels 1 and 2 are gone and 400 rest at 1.1007, so the best ask has jumped two steps: the spread is now 1.1007 − 1.1004 = 3 pips until new sellers step in.',
         *[dict(hide=x) for x in ('a0', 'a1', 'a2', 'e0', 'e1', 'e2', 'as0', 'as1', 'as2', 'spr')],
         dict(dim='p0'), dict(dim='p1'),
         abar('a2b', 400, ASKS[2][2]),
         note('as2b', AX + K * 400 + 10, ASKS[2][2], '400', 'red', 17, anchor='start'),
         note('spr3', 300, 296, 'spread: 3 pips', 'amber', 18)),
    step('Now cut every level to a tenth: 20, 30 and 50 units. The same 600-unit order eats all three and keeps going, and the last trade becomes the new price. On 15 October 2014, with thin resting depth, the 10-year Treasury yield fell about 16 basis points and came back within 12 minutes.',
         icon('warn', 'warn', 14, 780, 0.6, 'red'),
         box('thin', 90, 778, 500, 78, 'thin book: 20 + 30 + 50 = 100 units\nthe 600-unit order walks straight through', 'red', size=19),
         dict(pulse='a2b')),
])


BOARD = dict(name='lob', lesson='limit-order-books', title='A market order walks the book', cfg=LOB,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>\n    <h3>Walk the book, live',
             deck_after=5)
