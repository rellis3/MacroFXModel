from ._wb import *

# ── Bootstrapping the yield curve (yield-curve-construction) ──────────────────
# The lesson's worked example: three par bonds (price 100, face 100, annual coupons)
# 1y 3.00%, 2y 3.50%, 3y 4.00%  ->  z1 3.00%, z2 3.51%, z3 4.03%; f12 4.02%, f23 5.07%.
# March 2020 facts are the lesson's: off-the-runs cheapened against on-the-runs as dealer
# balance sheets filled; Fed cut to near zero on 15 Mar with at least $500bn of purchases,
# went unlimited on 23 Mar, and eased the leverage ratio on 1 Apr.
def _boot(c1, c2, c3):
    z1 = c1
    z2 = ((1 + c2) / (1 - c2 / (1 + z1))) ** 0.5 - 1
    z3 = ((1 + c3) / (1 - c3 / (1 + z1) - c3 / (1 + z2) ** 2)) ** (1 / 3) - 1
    return z1, z2, z3, (1 + z2) ** 2 / (1 + z1) - 1, (1 + z3) ** 3 / (1 + z2) ** 2 - 1
Z1, Z2, Z3, F12, F23 = [round(100 * v, 2) for v in _boot(0.03, 0.035, 0.04)]
assert (Z1, Z2, Z3, F12, F23) == (3.0, 3.51, 4.03, 4.02, 5.07)

X1, X2, X3 = 270, 395, 520          # timeline columns for years 1, 2, 3
R1, R2, R3 = 66, 136, 206           # rows for the three bonds
CH = (10, 300, 580, 250)

YC = dict(w=600, h=796, intro='Three bond prices in, one rate per maturity out, solved from the short end outward. Then the forward rates hiding inside, and the month the inputs stopped agreeing. Press play, or step through.', steps=[
    step('Three bonds, each priced at par: 100 for 100 of face, annual coupons. A 1-year at 3.00%, a 2-year at 3.50%, a 3-year at 4.00%. Each is a bundle of payments on different dates.',
         note('h1', X1, 22, 'year 1', None, 18), note('h2', X2, 22, 'year 2', None, 18), note('h3', X3, 22, 'year 3', None, 18),
         box('b1', 10, R1 - 26, 170, 52, '1y bond · 3.00%', 'blue', size=18),
         box('b2', 10, R2 - 26, 170, 52, '2y bond · 3.50%', 'blue', size=18),
         box('b3', 10, R3 - 26, 170, 52, '3y bond · 4.00%', 'blue', size=18),
         chip('c11', X1, R1, '103', 'blue'),
         chip('c21', X1, R2, '3.50', 'blue'), chip('c22', X2, R2, '103.50', 'blue'),
         chip('c31', X1, R3, '4', 'blue'), chip('c32', X2, R3, '4', 'blue'), chip('c33', X3, R3, '104', 'blue')),
    step('Start at the short end. The 1-year bond has one payment, 103 in a year, and costs 100. One equation, one unknown: the 1-year zero rate is 3.00%.',
         dict(pulse='c11'),
         note('calc', 300, 280, '100 = 103 ÷ (1 + z₁)   →   z₁ = 3.00%', 'green', 20),
         note('z1', X2 + 60, R1 + 6, 'z₁ = 3.00%', 'green', 19)),
    step('The 2-year bond pays 3.50 in year 1. You already know the 1-year rate, so discount it: 3.50 ÷ 1.03 = 3.40. Subtract that from the price: 96.60 must be what the year-2 payment is worth today.',
         dict(hide='calc'), dict(pulse='c21'),
         note('calc2', 300, 280, '100 − 3.50 ÷ 1.03 = 96.60', 'amber', 20)),
    step('So 103.50 in two years is worth 96.60 today. Solve for the one unknown left: the 2-year zero rate is about 3.51%, a touch above the bond\'s own 3.50% yield.',
         dict(hide='calc2'), dict(pulse='c22'),
         note('calc3', 300, 280, '96.60 = 103.50 ÷ (1 + z₂)²   →   z₂ ≈ 3.51%', 'green', 20),
         note('z2', X3 + 10, R2 + 6, 'z₂ = 3.51%', 'green', 19)),
    step('Same move again. Discount the 3-year bond\'s first two coupons at the rates already solved: 7.62 in all. That leaves 92.38 for the 104 in year 3, so the 3-year zero rate is about 4.03%.',
         dict(hide='calc3'), dict(pulse='c31'), dict(pulse='c32'),
         note('calc4', 300, 280, '100 − 7.62 = 92.38 = 104 ÷ (1 + z₃)³   →   z₃ ≈ 4.03%', 'green', 18),
         note('z3', X3, R3 + 36, 'z₃ = 4.03%', 'green', 19)),
    step('Plot what you solved. The zero curve sits just above the par yields you started from: 3.00, 3.51, 4.03 against 3.00, 3.50, 4.00. Close, but not the same numbers.',
         chart('yc', CH, 'Rates by maturity (%)', [0.5, 3.5], [2.5, 5.6],
               [[3, '3'], [4, '4'], [5, '5']], [[1, '1y'], [2, '2y'], [3, '3y']]),
         series('par', 'yc', [[1, 3.0], [2, 3.5], [3, 4.0]], None, dash=True, ms=500, label='par (dashed)', lat=[2.5, 3.75], ldx=0, ldy=24, lanchor='middle', lsize=16),
         series('zero', 'yc', [[1, Z1], [2, Z2], [3, Z3]], 'blue', ms=1000, label='zero', lat=[3, Z3], ldx=10, ldy=-8, lanchor='start', lsize=16),
         dot('dz1', 'yc', [1, Z1], '3.00', 'blue', dy=18), dot('dz2', 'yc', [2, Z2], '3.51', 'blue', dy=18), dot('dz3', 'yc', [3, Z3], '4.03', 'blue', dy=20)),
    step('Now the forwards. Investing for two years at 3.51% must pay the same as one year at 3.00% then a 1-year rate locked in today. That pins the 1-year rate starting in a year at 4.02%.',
         note('fid', 300, 580, '(1 + z₂)² = (1 + z₁)(1 + f₁,₂)   →   f₁,₂ ≈ 4.02%', 'amber', 19),
         series('fwd', 'yc', [[1, Z1], [2, F12], [3, F23]], 'amber', ms=1100, label='forward', lat=[3, F23], ldx=10, ldy=0, lanchor='start', lsize=16),
         dot('df2', 'yc', [2, F12], '4.02', 'amber', dy=-16), dot('df3', 'yc', [3, F23], '5.07', 'amber', dx=-12, dy=-4, anchor='end')),
    step('The curve slopes up, so every forward sits above the spot rate for that horizon: 4.02% and 5.07%. That is an arbitrage identity, not a forecast of where rates will go.',
         dict(pulse='fwd'),
         note('notf', 300, 612, 'forwards above spot = an upward slope, not a prophecy', 'amber', 18)),
    step('All of this assumes every bond sits on one curve. In March 2020, in the dash for cash, foreign holders, funds meeting redemptions and levered basis traders all sold Treasuries at once, and dealers ran out of balance sheet.',
         dict(hide='fid'), dict(hide='notf'),
         icon('dealer', 'bank', 250, 628, 0.62, 'red', 'dealers: full', sym='$', lsize=16),
         icon('on', 'scroll', 40, 630, 0.6, 'blue', 'on-the-run', lsize=16),
         icon('off', 'scroll', 480, 630, 0.6, 'red', 'off-the-run', lsize=16)),
    step('Older off-the-run bonds cheapened against on-the-run bonds of almost the same maturity. Near-identical cash flows, two different prices: the zero rates you solve now depend on which bonds you feed in.',
         arrow('on', 'off', 'same cash flows, different curve', 'red', bend=-40, dash=True, size=16),
         dict(pulse='off')),
    step('The Fed cut to near zero on 15 March and bought Treasuries, without limit from 23 March, then freed dealer balance sheet on 1 April. Functioning came back over the following weeks, and the bonds lined up on one curve again.',
         note('fed', 300, 750, 'Fed buys without limit (23 Mar)', 'green', 18),
         note('fed2', 300, 776, 'leverage rule eased (1 Apr) → one curve again', 'green', 18)),
])


BOARD = dict(name='yield_curve_construction', lesson='yield-curve-construction',
             title='Bootstrapping a curve, one maturity at a time', cfg=YC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
