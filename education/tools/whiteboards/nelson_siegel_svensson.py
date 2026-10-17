from ._wb import *
from math import exp, sqrt

# ── Nelson-Siegel & Svensson (nelson-siegel-svensson) ─────────────────────────
# Main curve: the lesson's worked parameters b0 4.5, b1 -2.0, b2 1.0, lambda 2.0
#   -> y(1) 3.11, y(2) 3.50, y(5) 4.05, y(10) 4.29, y(30) 4.43; y(0) = b0 + b1 = 2.5.
# Lambda 0.5 and b1 +2.0 are the lesson's own slider experiments (hump moves short; curve inverts).
# 2022 bars are the lesson's figures: 2-year about 0.7% -> about 4.4%; 10-year about 1.5% -> under 4%
# (drawn at 3.9, labelled "under 4%"). The hump-and-dip curve is an ILLUSTRATIVE Svensson shape
# (b0 4.0, b1 0.4, b2 2.5, b3 -2.5, l1 0.3, l2 4), not a fitted historical curve.
def _L(t, l):
    x = t / l
    return (1 - exp(-x)) / x
def ns(t, b0=4.5, b1=-2.0, b2=1.0, l=2.0):
    if t == 0: return b0 + b1
    return b0 + b1 * _L(t, l) + b2 * (_L(t, l) - exp(-t / l))
def sv(t, b0=4.0, b1=0.4, b2=2.5, b3=-2.5, l1=0.3, l2=4.0):
    return b0 + b1 * _L(t, l1) + b2 * (_L(t, l1) - exp(-t / l1)) + b3 * (_L(t, l2) - exp(-t / l2))
TS = [0.02, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 18, 21, 25, 30]
def pts(f): return [[round(sqrt(t), 3), round(f(t), 3)] for t in TS]
assert round(ns(1), 2) == 3.11 and round(ns(2), 2) == 3.50 and round(ns(5), 2) == 4.05 and round(ns(10), 2) == 4.29
XT = [[1, '1y'], [sqrt(2), '2y'], [sqrt(5), '5y'], [sqrt(10), '10y'], [sqrt(30), '30y']]
MAIN = (10, 10, 580, 340)

NSS = dict(w=600, h=760, intro='Four dials draw a whole yield curve. Watch the curve assemble from its three pieces, then watch 2022 turn the slope dial the other way. Press play, or step through.', steps=[
    step('Rates by maturity, from today out to 30 years. Nelson-Siegel draws the whole curve from four numbers. Dial one is the level, β₀ = 4.5%: where the curve settles far out.',
         chart('ns', MAIN, 'Yield by maturity (%)', [0, sqrt(30)], [1.5, 7.2],
               [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']], XT, pl=44, pr=26),
         series('lvl', 'ns', [[0, 4.5], [sqrt(30), 4.5]], None, dash=True, ms=600, label='level β₀ = 4.5%', lat=[0.3, 4.5], ldx=0, ldy=-14, lanchor='start', lsize=16)),
    step('Dial two is the slope, β₁ = −2.0%. Its piece matters fully at the short end and fades with maturity. So the curve starts at β₀ + β₁ = 2.5% and climbs toward the level.',
         series('ls', 'ns', pts(lambda t: ns(t, b2=0)), 'green', ms=1200, dash=True),
         dot('y0', 'ns', [0, 2.5], 'short end 2.5%', 'green', dx=10, dy=16, anchor='start')),
    step('Dial three is the curvature, β₂ = 1.0%. Its piece is zero at both ends and bulges in the middle, lifting the belly. Add it, and that is the full Nelson-Siegel curve.',
         dict(dim='ls'),
         series('full', 'ns', pts(ns), 'blue', ms=1300)),
    step('Read it off at the worked maturities: 3.11% at 1 year, 3.50% at 2, 4.05% at 5 and 4.29% at 10. Smooth everywhere, from four numbers, with no kinks between bonds.',
         dot('d1', 'ns', [1, ns(1)], '3.11', 'blue', dy=18), dot('d2', 'ns', [sqrt(2), ns(2)], '3.50', 'blue', dy=18),
         dot('d5', 'ns', [sqrt(5), ns(5)], '4.05', 'blue', dy=18), dot('d10', 'ns', [sqrt(10), ns(10)], '4.29', 'blue', dy=18)),
    step('Dial four, λ, sets where along the maturities things happen. Drop it from 2.0 to 0.5 and the short-end behaviour fades much faster: the curve reaches 4.24% by 2 years instead of 3.50%.',
         series('lam', 'ns', pts(lambda t: ns(t, l=0.5)), 'purple', dash=True, ms=1000, label='λ = 0.5', lat=[1, ns(1, l=0.5)], ldx=-12, ldy=0, lanchor='end', lsize=16)),
    step('Now turn the slope dial the other way, β₁ = +2.0%. The short end jumps to 6.5%, above the 4.5% level: an inverted curve. One sign change, and the whole shape flips.',
         dict(dim='lam'), dict(dim='d1'), dict(dim='d2'), dict(dim='d5'), dict(dim='d10'),
         series('inv', 'ns', pts(lambda t: ns(t, b1=2.0)), 'red', ms=1300, label='β₁ = +2: inverted', lat=[sqrt(8), ns(8, b1=2.0)], ldx=0, ldy=-26, lanchor='start', lsize=16),
         dot('y0i', 'ns', [0, 6.5], '6.5%', 'red', dx=10, dy=-4, anchor='start')),
    step('That is what 2022 did. As the Fed hiked from near zero, the 2-year yield went from about 0.7% to about 4.4%; the 10-year from about 1.5% to under 4%. The short end rose far more than the long end.',
         chart('yr', (10, 370, 280, 250), '2022, start → end (%)', [0.4, 4.6], [0, 5.2],
               [[0, '0'], [2, '2'], [4, '4']], [[1.5, '2-year'], [3.5, '10-year']], pl=34),
         dict(bars='b22', chart='yr', data=[[1.1, 0.7, '0.7', 'blue'], [1.9, 4.4, '4.4', 'red'], [3.1, 1.5, '1.5', 'blue'], [3.9, 3.9, '<4', 'amber']], bw=30, ms=1200)),
    step('From July 2022 the 2-year stayed above the 10-year. In the lesson\'s terms, β₁ went from negative to positive: the short end now sat above the long-run level.',
         note('flip', 300, 650, 'β₁: negative → positive  (short end above the level)', 'red', 19)),
    step('Then a harder shape: bills above 2-years above 10-years, yet by late 2023 the 30-year back above the 10-year. A rise, a long fall, then a turn up. Here is that kind of shape, illustrative numbers.',
         chart('sv', (310, 370, 280, 250), 'hump and dip (illustrative)', [0, sqrt(30)], [3.0, 5.2],
               [[3.5, '3.5'], [4.5, '4.5']], [[sqrt(0.25), '3m'], [sqrt(2), '2y'], [sqrt(10), '10y'], [sqrt(30), '30y']], pl=40, pr=24),
         series('svc', 'sv', pts(sv), 'amber', ms=1400)),
    step('One Nelson-Siegel hump can fit the rise then fall, but not the turn back up. Svensson adds a second curvature piece with its own λ₂: six dials instead of four, and a hump and a dip.',
         dict(hide='flip'),
         note('svn', 300, 650, 'Svensson: + β₃ × a second hump, placed by λ₂', 'amber', 19)),
    step('The fit is still only a description. Forecasting the dials from the 2010s, when β₁ was almost always negative, assumed a regime that 2022 ended. Smooth curve, honest about its limits.',
         note('end', 300, 700, 'describes any day well · forecasts only within a regime', 'blue', 19)),
])


BOARD = dict(name='nelson_siegel_svensson', lesson='nelson-siegel-svensson',
             title='Four dials draw a curve, and 2022 turns one', cfg=NSS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
