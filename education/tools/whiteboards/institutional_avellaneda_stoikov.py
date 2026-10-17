from ._wb import *
from math import log

# ── Avellaneda-Stoikov inventory-aware market making (institutional-avellaneda-stoikov) ──
# The lesson's worked example: s = 100, q = +5, gamma = 0.1, sigma = 2 (variance 4), T − t = 0.5,
# k = 1.5. Shift = 5·0.1·4·0.5 = 1.00, r = 99.00. Spread = 0.20 + (2/0.1)·ln(1 + 0.1/1.5)
# ≈ 0.20 + 1.2908 = 1.4908; bid ≈ 98.2546, ask ≈ 99.7454. Symmetric quotes around s:
# 99.2546 / 100.7454. At T − t = 0 the shift is 0 and the spread is the profit term alone.
S, Q, G, SIG, TT, K = 100.0, 5, 0.1, 2.0, 0.5, 1.5
INV = G * SIG ** 2 * TT
PROF = 2 / G * log(1 + G / K)
SPR = INV + PROF; H = SPR / 2
R = S - Q * INV
assert (round(INV, 2), round(PROF, 4), round(SPR, 4), R) == (0.2, 1.2908, 1.4908, 99.0)
BID0, ASK0, BID1, ASK1 = S - H, S + H, R - H, R + H
assert (round(BID1, 4), round(ASK1, 4), round(BID0, 4)) == (98.2546, 99.7454, 99.2546)
def r(q, tt=TT): return S - q * G * SIG ** 2 * tt

NL = (10, 10, 580, 196)

AS = dict(w=600, h=790, intro="A market maker, a one-sided afternoon, and the price they quote around. The lesson's own worked example. Press play, or step through.", steps=[
    step('A market maker quotes both sides of a mid of 100.00. Flat, the quotes sit symmetrically: bid 99.25, offer 100.75, a spread of 1.4908.',
         chart('nl', NL, 'Quotes on the price line', [97.7, 101.3], [0, 1], [], [[98, '98'], [99, '99'], [100, '100'], [101, '101']], pl=16, pr=16),
         series('mid', 'nl', [[S, 0], [S, 0.92]], None, dash=True, ms=400, label='mid 100', lat=[S, 0.92], ldy=-10),
         dict(gap='w0', chart='nl', top=[[BID0, 0.72], [ASK0, 0.72]], bot=[[BID0, 0.5], [ASK0, 0.5]], tone='blue', op=0.3),
         cnote('b0', 'nl', [BID0, 0.61], '99.25', 'blue', 17, anchor='start', dx=6),
         cnote('a0', 'nl', [ASK0, 0.61], '100.75', 'blue', 17, anchor='end', dx=-6)),
    step('Then the flow turns one-sided. Seller after seller hits the bid. Each fill makes the market maker longer: inventory climbs to +5.',
         icon('sel', 'crowd', 20, 220, 0.6, 'red', 'sellers', lsize=17),
         box('inv', 200, 226, 200, 66, 'inventory', 'amber', sub='0', size=19),
         arrow('sel', 'inv', label='hit bid', tone='red', id='hit'),
         dict(count='inv', **{'from': 0, 'to': 5, 'dp': 0, 'pre': '+', 'ms': 1400})),
    step('Symmetric quotes do nothing about it. The bid is just as attractive as before, so more selling simply adds to the position. There is no brake.',
         note('nb', 500, 260, 'no brake', 'red', 22), dict(pulse='w0')),
    step('The fix is a reservation price: the mid shifted against your inventory. Shift = q × γ × σ² × (T − t) = 5 × 0.1 × 4 × 0.5 = 1.00. So r = 100 − 1 = 99.00.',
         dict(hide='nb'),
         series('rl', 'nl', [[R, 0], [R, 0.92]], 'purple', dash=True, ms=500, label='r = 99.00', lat=[R, 0.92], ldy=-10),
         box('sh', 420, 226, 170, 66, 'shift', 'purple', sub='1.00', size=19)),
    step('Quote the same-width window around r instead of the mid: bid about 98.25, offer about 99.75. Both quotes move a full point lower.',
         dict(dim='w0'), dict(dim='b0'), dict(dim='a0'),
         dict(gap='w1', chart='nl', top=[[BID1, 0.36], [ASK1, 0.36]], bot=[[BID1, 0.14], [ASK1, 0.14]], tone='green', op=0.35),
         cnote('b1', 'nl', [BID1, 0.25], '98.25', 'green', 17, anchor='start', dx=6),
         cnote('a1', 'nl', [ASK1, 0.25], '99.75', 'green', 17, anchor='end', dx=-6)),
    step('The offer is now closer to the mid, so buyers are more likely to take inventory off you. The bid is further away, so sellers are less likely to make you longer. The skew pushes you back to flat.',
         note('ef', 300, 326, 'offer closer → sell down · bid further → stop adding', 'green', 18)),
    step('The width splits into two parts. Inventory risk, γσ²(T − t) = 0.20, pays for holding any position over the time left. The market-making margin, (2/γ)ln(1 + γ/k) ≈ 1.29, comes from how fast fills dry up with distance.',
         chart('sp', (10, 352, 280, 220), 'Spread, two parts', [0.4, 3.6], [0, 1.7], [[0.5, '0.5'], [1, '1.0'], [1.5, '1.5']],
               [[1, 'risk'], [2, 'margin'], [3, 'total']], pl=40, pr=8),
         dict(bars='sb', chart='sp', data=[[1, round(INV, 4), '0.20', 'blue'], [2, round(PROF, 4), '1.29', 'purple'], [3, round(SPR, 4), '1.49', 'green']], bw=46, ms=1000)),
    step('Neither part contains inventory. Sweep q from −10 to +10: the reservation price, bid and offer slide together as parallel lines. Inventory moves the window, never widens it.',
         chart('sw', (310, 352, 280, 220), 'Quotes vs inventory q', [-10, 10], [97, 103], [[98, '98'], [100, '100'], [102, '102']],
               [[-10, '−10'], [0, '0'], [10, '+10']], pl=44, pr=10),
         series('sa', 'sw', [[q, round(r(q) + H, 4)] for q in (-10, 10)], 'green', ms=700),
         series('sr', 'sw', [[q, r(q)] for q in (-10, 10)], 'purple', ms=700),
         series('sbd', 'sw', [[q, round(r(q) - H, 4)] for q in (-10, 10)], 'red', ms=700),
         dot('wk', 'sw', [5, R], 'r at q = +5', 'purple', dx=-10, dy=42, anchor='end')),
    step('Near the close, time left shrinks to zero, so the shift shrinks to zero and r returns to the mid. The spread does not vanish: it falls to the margin part, 1.29.',
         box('tt', 10, 590, 280, 64, 'T − t → 0: r → mid,\nspread → 1.29', 'blue', size=17)),
    step('More risk aversion, more volatility or more time left all mean a bigger shift for the same inventory. The model prices the cost of holding one more unit the same way everywhere.',
         box('gv', 310, 590, 280, 64, 'bigger γ, σ or T − t\n→ bigger skew', 'purple', size=17)),
    step('What it leaves out: adverse selection. If those sellers knew something, being long is worse than just risky. That is the Glosten-Milgrom problem, and desks add a charge for it on top.',
         box('ad', 10, 670, 580, 50, 'missing: informed flow (adverse selection)', 'red', size=18)),
    step('So: quote around the price you would be happy to trade at given what you hold, not around the mid, and let the skew walk you back to flat.',
         note('end', 300, 760, 'centre on r, not the mid · width fixed · skew to flat', 'green', 19)),
])


BOARD = dict(name='institutional_avellaneda_stoikov', lesson='institutional-avellaneda-stoikov',
             title='Inventory skew: quoting around the reservation price', cfg=AS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How this connects to the rest of this Theory Lab</h2>',
             deck_after=4)
