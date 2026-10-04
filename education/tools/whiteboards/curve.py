from ._wb import *
from math import sqrt

# ── The yield curve, drawn and redrawn (yield-curve-growth-expectations) ─────
# Maturity on a square-root scale, as in the lesson's curve morpher. Curves are the
# lesson's illustrative shapes: "normal" and "flat" presets (3m, 2y, 5y, 10y) and the
# worked-example inverted curve (3m 5.30, 2y 4.50, 5y 4.00, 10y 4.10).
#   normal 2s10s = 3.70 − 2.60 = +110bp;  flat 2s10s = 4.05 − 4.05 = 0
#   inverted 2s10s = 4.10 − 4.50 = −40bp, 3m10y = 4.10 − 5.30 = −120bp
#   f(2→5) ≈ (5×4.00 − 2×4.50)/3 = 11/3 ≈ 3.67%; minus a +0.30% premium ≈ 3.37%
#   → 5.30 − 3.37 ≈ 1.93, "roughly two percentage points of cuts priced"
#   un-inverting (self-test Q2): 2y −30bp, 10y −10bp → 2s10s −40 → −20bp (bull steepening)
M = [0.25, 2, 5, 10]
X = [sqrt(m) for m in M]
def cv(ys): return [[x, y] for x, y in zip(X, ys)]
NORM, FLAT, INV = [2.0, 2.6, 3.2, 3.7], [4.0, 4.05, 4.0, 4.05], [5.30, 4.50, 4.00, 4.10]
X2, X5, X10 = X[1], X[2], X[3]
CH = (10, 150, 580, 410)
CURVE = dict(w=600, h=640, intro='The Treasury curve drawn, then redrawn as the Fed hikes: normal, flattening, inverted — and what each shape says the market expects for growth and policy. Press play, or step through.', steps=[
    step('Meet the cast. The Fed sets the short rate. The bond market lends to the government for anything from three months to ten years. And the economy, whose growth and inflation the Fed is watching.',
         icon('fed', 'bank', 36, 4, 0.66, 'amber', 'the Fed\nsets short rates', sym='$', lsize=16),
         icon('bm', 'crowd', 262, 4, 0.66, 'blue', 'bond market\nlends 3m to 10y', lsize=16),
         icon('eco', 'factory', 505, 4, 0.66, 'green', 'the economy', lsize=16),
         arrow('fed', 'bm', 'short rate', 'amber', size=17)),
    step('Lend for ten years, or lend for two and re-lend? Investors compare the two, so a long yield ends up near the average short rate expected over its life, plus a term premium for waiting.',
         note('rule', 300, 124, 'long yield ≈ average expected short rate + term premium', 'purple', 18)),
    step('Plot each maturity\'s yield and you have the curve. Normally it slopes up: rates are expected to rise or stay put, with growth and inflation holding up. Here the 10-year sits 110bp over the 2-year.',
         chart('yc', CH, 'Treasury yields (illustrative)', [0, 3.4], [1.5, 6.2],
               [[2, '2%'], [3, '3%'], [4, '4%'], [5, '5%'], [6, '6%']], [[X[0], '3m'], [X2, '2y'], [X5, '5y'], [X10, '10y']], pl=46, pt=38),
         series('cN', 'yc', cv(NORM), 'green', ms=1200),
         cnote('lN', 'yc', [X10, 3.7], 'normal', 'green', 17, anchor='end', dy=24),
         cnote('sN', 'yc', [1.9, 5.7], '2s10s = 3.70 − 2.60 = +110bp', 'green', 17)),
    step('Now inflation is the worry and the Fed starts hiking. The 2-year, the market\'s vote on the next few meetings, gets dragged up with it.',
         chip('hike', 70, 40, 'hike!', 'amber'), move('hike', 120, 300, 1200),
         dict(pulse='fed')),
    step('The front end rises much more than the long end: the 2-year jumps 145bp, the 10-year only 35bp. That is a bear flattening — hikes being priced. The slope is gone.',
         dict(hide='hike'), dict(dim='cN'), dict(hide='sN'),
         series('cF', 'yc', cv(FLAT), 'amber', label='flat', lat=[X[0], 4.0], ldy=18, lanchor='start', ldx=-10, ms=1200),
         cnote('sF', 'yc', [1.9, 5.7], '2s10s = 4.05 − 4.05 = 0', 'amber', 17)),
    step('The Fed keeps going. The 3-month bill climbs to 5.30% and the 2-year to 4.50%, above the 10-year at 4.10%. The curve has inverted — built at the front end, which is how most inversions are made.',
         dict(dim='cF'), dict(hide='sF'),
         series('cI', 'yc', cv(INV), 'red', label='inverted', lat=[X[0], 5.30], ldy=-18, lanchor='start', ldx=-6, ms=1200),
         cnote('sI', 'yc', [1.9, 5.85], '2s10s −40bp · 3m10y −120bp', 'red', 17)),
    step('What is it pricing? From the 2- and 5-year yields: (5 × 4.00 − 2 × 4.50) ÷ 3 ≈ 3.67%. That is the average rate the market is locking in for years 2 to 5 — well under today\'s 5.30% bill.',
         series('bill', 'yc', [[X[0], 5.30], [X10, 5.30]], 'chalk', dash=True, ms=600),
         series('fwd', 'yc', [[X2, 3.67], [X5, 3.67]], 'purple', width=4, ms=800),
         cnote('fwdl', 'yc', [X2 + 0.42 * (X5 - X2), 3.67], 'yrs 2–5 ≈ 3.67%', 'purple', 17, dy=-15)),
    step('Take out a term premium of, say, +0.30% and the expected rate is nearer 3.37%: roughly two percentage points of cuts priced from the bill rate.',
         dict(hide='cN'), dict(hide='lN'),
         dict(gap='cuts', chart='yc', top=[[X2, 5.30], [X5, 5.30]], bot=[[X2, 3.37], [X5, 3.37]], tone='purple', op=0.2),
         dot('exp', 'yc', [X2, 3.37], '≈ 3.37%', 'purple', dx=-10, dy=0, anchor='end'),
         cnote('cutl', 'yc', [(X2 + X5) / 2, 2.95], '≈ 2 points of\ncuts priced', 'purple', 17)),
    step('Why would the Fed cut? Usually because the economy weakens. So an inverted curve reads as an expected slowdown. Notice the word: expected.',
         icon('slow', 'down', 432, 14, 0.45, 'red'),
         dict(pulse='eco')),
    step('How do inversions usually end? A bull steepening: as cuts get priced, the front end falls faster. Say the 2-year drops 30bp and the 10-year 10bp — 2s10s rises from −40bp to −20bp.',
         series('d2', 'yc', [[X2, 4.50], [X2, 4.20]], 'green', width=4, ms=700),
         dot('d2d', 'yc', [X2, 4.20], '−30bp', 'green', dx=-10, dy=-8, anchor='end'),
         series('d10', 'yc', [[X10, 4.10], [X10, 4.00]], 'green', width=4, ms=500),
         dot('d10d', 'yc', [X10, 4.00], '−10bp', 'green', dx=-8, dy=-34, anchor='end')),
    step('The curve measures what is expected, not what will happen. In 2006–07 it was right, but more than a year early. In 2022–24 came the longest inversion in the series — and, as of the lesson\'s writing, no recession has been dated to follow it. The NBER dates recessions only in hindsight.',
         box('end', 40, 574, 520, 58, 'Inverted = cuts EXPECTED, a slowdown EXPECTED\n— a measurement, not a timing signal', 'green', size=19)),
])


BOARD = dict(name='curve', lesson='yield-curve-growth-expectations', title='The yield curve, drawn and redrawn', cfg=CURVE,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=5)
