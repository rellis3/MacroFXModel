from ._wb import *
from math import comb, sqrt

# ── Convex optimization: a bowl versus an egg carton (convex-optimization) ────
# Bowl: the lesson's own chart curve f(x) = 0.15x², chord from x = 1 to x = 8; at θ = 0.5,
# P = 4.5, curve 3.04, chord 4.87 (0.5·0.15 + 0.5·9.6 = 4.875; the lesson's readout prints 4.87).
# Egg carton: an illustrative wavy curve g(x) = (x² − 1)² + 0.3x with a deeper dip at
# x ≈ −1.04 (g ≈ −0.31) and a shallower one at x ≈ 0.96 (g ≈ 0.29). Halfway between the dips
# the curve is ≈ 0.99 and the chord ≈ −0.01, so the curve pokes above its chord.
# Portfolio bowl: the lesson's worked Σ (σ1 = 20%, σ2 = 30%, ρ = 0.2). Minimum-variance weight
# w1 = (0.09 − 0.012)/(0.13 − 0.024) = 73.6%, vol 18.06%. With ρ = 0.9 (the try-it box's "push ρ
# towards 1"): unconstrained w1 = 164% (short asset 2), vol 17.6%; with no shorting the answer is
# pinned at w1 = 100%, vol 20%. C(60, 10) = 75,394,027,566 ways to pick 10 names from 60.
f = lambda x: 0.15 * x * x
g = lambda x: (x * x - 1) ** 2 + 0.3 * x
GL, LO = -1.0355803, 0.9601496                   # deeper (global) and shallower (local) dips
MID = (GL + LO) / 2
assert round(f(4.5), 2) == 3.04 and abs(0.5 * f(1) + 0.5 * f(8) - 4.875) < 1e-9
assert round(g(MID), 2) == 0.99 and abs((g(GL) + g(LO)) / 2) < 0.01


def pvol(w, rho):
    s12 = rho * 0.2 * 0.3
    return 100 * sqrt(0.04 * w * w + 0.09 * (1 - w) ** 2 + 2 * s12 * w * (1 - w))
def wmin(rho):
    s12 = rho * 0.06
    return (0.09 - s12) / (0.13 - 2 * s12)
assert round(wmin(0.2), 3) == 0.736 and round(pvol(wmin(0.2), 0.2), 2) == 18.06
assert round(wmin(0.9), 2) == 1.64 and round(pvol(1, 0.9), 1) == 20.0
N_SUBSETS = comb(60, 10)
assert N_SUBSETS == 75394027566

BOWL = (10, 10, 285, 230)
EGG = (305, 10, 285, 230)
PV = (10, 300, 580, 250)
# canvas position of a data point in the two top charts (chart defaults pl 40, pr 12, pt 34, pb 26)
def bx(t): return 10 + 40 + t / 9 * (285 - 52)
def by(v): return 10 + 230 - 26 - v / 13 * (230 - 60)
def ex(t): return 305 + 40 + (t + 1.6) / 3.2 * (285 - 52)
def ey(v): return 10 + 230 - 26 - (v + 1.0) / 4.0 * (230 - 60)

BOWL_PTS = [[x / 4, round(f(x / 4), 3)] for x in range(0, 37)]
EGG_PTS = [[round(-1.6 + i * 0.08, 2), round(g(-1.6 + i * 0.08), 3)] for i in range(41)]
PV2 = [[w / 20, round(pvol(w / 20, 0.2), 2)] for w in range(-10, 41)]
PV9 = [[w / 20, round(pvol(w / 20, 0.9), 2)] for w in range(-10, 41)]

CONVEX = dict(w=600, h=700, intro='A bowl has one bottom; an egg carton has many. The chord test that tells them apart, then the lesson\'s own two-asset portfolio. Press play, or step through.', steps=[
    step('Two landscapes for a solver to search. On the left, a bowl: the curve f(x) = 0.15x². On the right, an egg carton: a wavy curve with two dips (an illustrative shape).',
         chart('bowl', BOWL, 'A bowl (convex)', [0, 9], [0, 13], [[0, '0'], [6, '6'], [12, '12']], [[0, '0'], [1, '1'], [4.5, '4.5'], [8, '8']]),
         series('fb', 'bowl', BOWL_PTS, 'blue', ms=1100),
         chart('egg', EGG, 'An egg carton (not convex)', [-1.6, 1.6], [-1.0, 3.0], [[0, '0'], [2, '2']], [[-1, '−1'], [0, '0'], [1, '1']]),
         series('fe', 'egg', EGG_PTS, 'red', ms=1100)),
    step('A solver only feels the slope under its feet, like a marble. Dropped in the bowl, it rolls to the one bottom. Dropped on the egg carton\'s right side, it settles in the nearer dip and stops: zero slope, every sign of success.',
         chip('m1', round(bx(8.5)), round(by(f(8.5)) - 18), 'solver', 'blue'),
         move('m1', round(bx(0.6)), round(by(f(0.6)) - 18), 1200),
         chip('m2', round(ex(1.5)), round(ey(g(1.5)) - 18), 'solver', 'amber'),
         move('m2', round(ex(LO)), round(ey(g(LO)) - 18), 1200)),
    step('But the egg carton has a deeper dip on the left. From inside the right-hand dip, the solver has no way to know it is there.',
         dot('glob', 'egg', [GL, round(g(GL), 3)], 'deeper dip', 'green', dy=20),
         dict(pulse='m2')),
    step('The test for a bowl: join two points with a straight line, a chord. Here x = 1 and x = 8. Halfway along, at x = 4.5, the curve sits at 3.04 and the chord at 4.87. The curve stays under its chord, and that holds for every pair of points.',
         dict(hide='m1'),
         series('cb', 'bowl', [[1, f(1)], [8, f(8)]], 'purple', dash=True, ms=600),
         dot('cb1', 'bowl', [4.5, 4.875], '4.87', 'purple', dx=-8, dy=-16, anchor='end'),
         dot('cb2', 'bowl', [4.5, round(f(4.5), 3)], '3.04', 'blue', dx=10, dy=14, anchor='start')),
    step('Try it on the egg carton, joining its two dips. Halfway between them the curve rises to about 1.0, while the chord sits near 0. The curve pokes above its own chord: not convex.',
         dict(hide='m2'),
         series('ce', 'egg', [[GL, round(g(GL), 3)], [LO, round(g(LO), 3)]], 'purple', dash=True, ms=600),
         dot('loc', 'egg', [LO, round(g(LO), 3)], '', 'amber'),
         dot('ce1', 'egg', [round(MID, 3), round(g(MID), 3)], 'curve ≈ 1.0', 'red', dy=-16)),
    step('That is the payoff. If a lower point existed anywhere in a bowl, the chord towards it would dip below your spot, right next to you. So in a convex problem any bottom you find is the bottom.',
         note('pay', 300, 268, 'convex: any local bottom is the global bottom', 'green', 20)),
    step('Portfolio risk is always a bowl. The lesson\'s two assets: 20% and 30% volatility, correlation 0.2. Risk bottoms out with 73.6% in asset 1, at 18.1% volatility.',
         chart('pv', PV, 'Portfolio volatility vs weight in asset 1', [-0.5, 2.0], [8, 46],
               [[10, '10%'], [20, '20%'], [30, '30%'], [40, '40%']], [[-0.5, '−50%'], [0, '0%'], [0.5, '50%'], [1, '100%'], [1.5, '150%'], [2, '200%']], pl=52),
         series('v2', 'pv', PV2, 'blue', ms=1200, label='correlation 0.2', lat=[1.7, 36.2], ldx=-10, ldy=0, lanchor='end'),
         dot('m02', 'pv', [round(wmin(0.2), 3), round(pvol(wmin(0.2), 0.2), 2)], '73.6% · 18.1%', 'blue', dx=-10, dy=18, anchor='end')),
    step('Add the rule "no shorting": the weight in asset 1 must sit between 0% and 100% (shaded). The bottom is already inside, so the rule is slack. Complementary slackness says its multiplier is zero: it shapes nothing.',
         dict(gap='ok', chart='pv', top=[[0, 45], [1, 45]], bot=[[0, 9], [1, 9]], tone='green', op=0.14),
         cnote('okl', 'pv', [0.5, 42], 'no shorting', 'green', 17)),
    step('Push the correlation to 0.9. Now the bowl\'s bottom sits at 164% in asset 1, which means shorting asset 2. The no-short rule binds: the answer is pinned at 100%, with 20% volatility, and the rule\'s multiplier turns positive.',
         dict(dim='v2'), dict(dim='m02'),
         series('v9', 'pv', PV9, 'amber', ms=1200, label='correlation 0.9', lat=[-0.45, 33], ldx=4, ldy=-16, lanchor='start'),
         dot('m09', 'pv', [round(wmin(0.9), 3), round(pvol(wmin(0.9), 0.9), 2)], '164%: not allowed', 'red', dy=-18),
         dot('pin', 'pv', [1, 20], 'pinned at 100%', 'green', dx=8, dy=27, anchor='start')),
    step('Straight-line rules like these keep the problem a bowl. Now the mandate says: hold at most 10 of 60 names. That is a choice of which names, and there are over 75 billion ways to pick 10 from 60.',
         icon('dice', 'dice', 14, 568, 0.62, 'red'),
         box('subs', 90, 566, 500, 64, 'ways to choose 10 of 60 names', 'red', sub='0', size=19),
         dict(count='subs', **{'from': 0, 'to': N_SUBSETS, 'dp': 0, 'ms': 1500})),
    step('Each choice is its own separate piece, so the allowed set shatters and the bowl becomes an egg carton. The usual fix: keep the convex solver as the engine, pick the names greedily or with a mixed-integer solver, then re-solve on the chosen 10. A good candidate, not a proven best.',
         dict(pulse='fe'),
         box('fix', 90, 640, 500, 52, 'greedy pick of 10, then a convex re-solve', 'amber', size=19)),
])


BOARD = dict(name='convex_optimization', lesson='convex-optimization', title='A bowl, an egg carton and a portfolio', cfg=CONVEX,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=11)
