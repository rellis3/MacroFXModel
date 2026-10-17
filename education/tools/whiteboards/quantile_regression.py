from ._wb import *

# ── Quantile regression: change the penalty, change what the line estimates (quantile-regression) ──
# The 40 points are the lesson's own toy scatter, read back from its chart (x = (cx-60)/52.375,
# y = (260-cy)/11.5); refitting them reproduces the lesson's lines:
#   OLS 2.172 + 1.464x, tau=0.1: 2.062 + 1.194x, tau=0.9: 2.395 + 1.658x
#   80% band width 0.80 at x = 1, 4.97 at x = 10.
# Pinball loss rho_tau(u) = u (tau - 1{u<0}).
# "Vulnerable Growth" (Adrian, Boyarchenko & Giannone, AER 2019) and IMF Growth-at-Risk (GFSR Oct 2017)
# as told in the lesson.
DATA = [(1.39, 4.58), (1.57, 4.74), (1.85, 4.27), (2.15, 5.42), (2.17, 5.35), (2.39, 5.77), (2.71, 6.88), (2.75, 6.34),
        (3.04, 7.25), (3.05, 6.63), (3.93, 8.25), (4.19, 9.09), (4.33, 6.6), (4.34, 8.09), (4.95, 8.75), (4.99, 8.57),
        (5.05, 9.17), (5.2, 12.03), (5.23, 8.54), (5.28, 11.38), (5.99, 8.18), (6.69, 11.42), (6.8, 12.5), (7.03, 13.65),
        (7.15, 14.09), (7.28, 14.46), (7.7, 12.84), (7.82, 12.77), (7.85, 15.56), (7.97, 13.55), (8.01, 11.31), (8.08, 11.7),
        (8.41, 12.58), (8.45, 15.77), (8.73, 15.42), (9.04, 17.17), (9.34, 14.98), (9.71, 16.96), (9.74, 18.17), (9.78, 15.9)]
OLS, Q1, Q9 = (2.172, 1.464), (2.062, 1.194), (2.395, 1.658)


def ln(c, x):
    return round(c[0] + c[1] * x, 3)


W1 = round(ln(Q9, 1) - ln(Q1, 1), 2)
W10 = round(ln(Q9, 10) - ln(Q1, 10), 2)
assert len(DATA) == 40 and W1 == 0.80 and W10 == 4.97


def pin(t, u):
    return round(u * (t - (1 if u < 0 else 0)), 3)


SC = (10, 10, 580, 380)
PB = (10, 400, 285, 220)
QR = dict(w=600, h=770, intro='The lesson\'s 40 toy points, one ordinary regression, and two lines fitted with a lopsided penalty instead. Press play, or step through.', steps=[
    step('Forty points from the lesson\'s toy dataset. As x grows, the outcomes spread out: the risk itself changes with x.',
         chart('sc', SC, 'Toy data: outcome y against predictor x', [0, 10.5], [0, 20],
               [[0, '0'], [10, '10'], [20, '20']], [[1, '1'], [4, '4'], [7, '7'], [10, '10']], pl=50, pr=74),
         *[dot('p%d' % i, 'sc', [x, y], '', None) for i, (x, y) in enumerate(DATA)]),
    step('Ordinary least squares punishes a miss above the line exactly as hard as a miss below it. The best line then runs through the middle: the conditional mean, ŷ = 2.172 + 1.464x.',
         series('ols', 'sc', [[1, ln(OLS, 1)], [10, ln(OLS, 10)]], None, ms=1100, label='mean', lat=[10, ln(OLS, 10)], ldx=8, ldy=0, lanchor='start', lsize=17)),
    step('Now make the penalty lopsided. At τ = 0.1, a guess that comes out too high costs 0.9 per unit, a guess too low only 0.1. That is the pinball loss.',
         chart('pb', PB, 'Pinball loss', [-2, 2], [0, 2.2],
               [[0, '0'], [1, '1'], [2, '2']], [[-1.6, 'too high'], [0, '0'], [1.6, 'too low']], pl=40, pr=20),
         series('pb1', 'pb', [[-2, pin(0.1, -2)], [0, 0], [2, pin(0.1, 2)]], 'blue', ms=900),
         cnote('pl1', 'pb', [-1.0, 1.75], 'τ = 0.1', 'blue', 17)),
    step('Minimizing that penalty drags the line down to the bottom edge of the cloud: the conditional 10th percentile, 2.062 + 1.194x. Only a few points sit below it.',
         series('q1', 'sc', [[1, ln(Q1, 1)], [10, ln(Q1, 10)]], 'blue', ms=1100, label='τ = 0.1', lat=[10, ln(Q1, 10)], ldx=8, ldy=0, lanchor='start', lsize=17)),
    step('Flip the weights for τ = 0.9: now guessing too low is the expensive side, 0.9 per unit against 0.1.',
         series('pb9', 'pb', [[-2, pin(0.9, -2)], [0, 0], [2, pin(0.9, 2)]], 'amber', ms=900),
         cnote('pl9', 'pb', [0.9, 1.75], 'τ = 0.9', 'amber', 17),
         dict(dim='pb1')),
    step('That line rides the top edge: the 90th percentile, 2.395 + 1.658x. Three lines with three different slopes, all from the same points.',
         series('q9', 'sc', [[1, ln(Q9, 1)], [10, ln(Q9, 10)]], 'amber', ms=1100, label='τ = 0.9', lat=[10, ln(Q9, 10)], ldx=8, ldy=0, lanchor='start', lsize=17)),
    step('The band between the two is the story. At x = 1 it is 0.80 wide. At x = 10 it is 4.97 wide, roughly six times wider. Risk grows with x.',
         dict(gap='band', chart='sc', top=[[1, ln(Q9, 1)], [10, ln(Q9, 10)]], bot=[[1, ln(Q1, 1)], [10, ln(Q1, 10)]], tone='amber', op=0.2),
         cnote('w1', 'sc', [1.2, ln(Q9, 1) + 2.2], '0.80', 'amber', 17),
         cnote('w10', 'sc', [8.6, 19.2], '4.97 wide', 'amber', 17)),
    step('The mean line reports one number at every x. It has no way to say that the outcomes got riskier. That needs a line aimed at the tail.',
         box('one', 310, 410, 280, 96, 'mean: one number per x\nno word on the spread', None, size=18)),
    step('The real version: "Vulnerable Growth" (2019) fitted quantile regressions of future US growth on a financial conditions index. As conditions tightened, as in 2008, the median barely moved.',
         icon('fci', 'thermo', 70, 636, 0.6, 'red', 'financial\nconditions\ntighten', lsize=16),
         box('med', 240, 636, 345, 54, 'median growth: barely moves', 'blue', size=18),
         arrow('fci', 'med', None, 'blue')),
    step('But the lower quantiles of next year\'s growth fell sharply. Tight conditions changed how bad things could get, not the typical outcome.',
         box('low', 240, 704, 345, 54, '5th percentile: falls sharply', 'red', size=18),
         arrow('fci', 'low', None, 'red')),
    step('The IMF built its Growth-at-Risk framework on it, from October 2017. Honest postscript: out-of-sample, the tail signal looked weaker, and the index tightens as a crisis unfolds, not years before it.',
         box('gar', 310, 520, 280, 96, 'Growth-at-Risk:\nthe 5th percentile, given x', 'amber', size=18)),
])


BOARD = dict(name='quantile_regression', lesson='quantile-regression',
             title='Three lines through the same points: quantile regression step by step', cfg=QR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: "Vulnerable Growth" and the 2008 recession</h2>',
             deck_after=5)
