from ._wb import *

# ── Granger causality (institutional-granger-causality) ───────────────────────
# The lesson's toy returns, t = 0..13, regression sample t = 2..13 (n = 12), lag 1.
# Fitted lines are the lesson's: restricted Ŷ = −0.0493 + 0.0747·Y(t−1) (RSS_r 0.4283),
# unrestricted Ŷ = 0.0117 + 0.1770·Y(t−1) + 0.5890·X(t−1) (RSS_u 0.0809).
# F = (0.4283 − 0.0809)/1 ÷ (0.0809/9) ≈ 38.65 (38.66 unrounded); F(1,9) critical values 5.12 (5%), 10.56 (1%).
# Fitted values below are computed here from those coefficients and the lesson's table.
X = [0.10, 0.31, 0.02, -0.21, -0.45, -0.12, -0.09, -0.45, -0.45, 0.50, 0.15, -0.27, -0.07, 0.47]
Y = [0.20, -0.09, 0.15, -0.06, -0.15, -0.27, -0.18, 0.03, -0.15, -0.28, 0.25, 0.31, -0.21, -0.08]
T = range(2, 14)
FR = [[t, round(-0.0493 + 0.0747 * Y[t - 1], 4)] for t in T]
FU = [[t, round(0.0117 + 0.1770 * Y[t - 1] + 0.5890 * X[t - 1], 4)] for t in T]
RSSR, RSSU, Q, N, K = 0.4283, 0.0809, 1, 12, 3
F = ((RSSR - RSSU) / Q) / (RSSU / (N - K))
assert round(F, 2) == 38.65, F

TS = (10, 100, 580, 250)
RB = (10, 366, 250, 220)
FS = (280, 366, 310, 220)

GC = dict(w=600, h=800, intro="Two forecasters, one with an extra clue. Granger's test asks whether the clue really helps, using the lesson's own twelve observations. Press play, or step through.", steps=[
    step('Two return series. The question is narrow: does X\'s past help forecast Y, beyond what Y\'s own past already tells you?',
         box('X', 20, 10, 190, 70, 'X: leader?', 'purple', size=21),
         box('Y', 390, 10, 190, 70, 'Y: follower?', 'blue', size=21),
         arrow('X', 'Y', label='helps?', tone='amber', dash=True, id='xy')),
    step('Y\'s returns over the twelve periods of the toy sample, t = 2 to 13. This is what both forecasters must predict.',
         chart('ts', TS, 'Y returns (%), and two forecasts', [1.5, 13.5], [-0.42, 0.42],
               [[-0.3, '−0.3'], [0, '0'], [0.3, '0.3']], [[2, 't=2'], [5, '5'], [8, '8'], [11, '11'], [13, '13']], zero=True, pl=52, pr=14),
         series('y', 'ts', [[t, Y[t]] for t in T], 'blue', ms=1500, label='Y', lat=[11, 0.31], ldy=-14)),
    step('Forecaster A sees only Y\'s own past. The best fit barely uses it: a slope of 0.075, so the forecast hugs −0.05 and misses almost every move.',
         series('fr', 'ts', FR, 'amber', ms=1200, label='own past only', lat=[3, FR[1][1]], ldy=22, lanchor='start')),
    step('Add up A\'s squared misses: the restricted model leaves RSS = 0.4283.',
         chart('rss', RB, 'Error left over (RSS)', [0.4, 2.6], [0, 0.5], [[0.2, '0.2'], [0.4, '0.4']], [[1, 'A'], [2, 'B']], pl=44, pr=10),
         dict(bars='br', chart='rss', data=[[1, RSSR, '0.4283', 'amber']], bw=46, ms=900)),
    step('Forecaster B also sees X\'s past. X\'s last move gets a weight of 0.59, and the forecast now tracks most of Y\'s swings.',
         dict(dim='fr'),
         series('fu', 'ts', FU, 'green', ms=1400, label='+ X\'s past', lat=[10, FU[8][1]], ldx=-8, ldy=-14, lanchor='end')),
    step('B\'s leftover error: RSS = 0.0809. About 81% of A\'s error is gone.',
         dict(bars='bu', chart='rss', data=[[2, RSSU, '0.0809', 'green']], bw=46, ms=900)),
    step('But any extra regressor helps a little, even a useless one. So weigh the gain per added coefficient against B\'s own noise per spare data point: 12 observations minus 3 parameters leaves 9.',
         box('f', 10, 596, 580, 66, 'F = (0.4283 − 0.0809)/1 ÷ (0.0809/9)', 'purple', sub='', size=20)),
    step('That gives F ≈ 38.65. Under "X adds nothing", F(1, 9) passes 5.12 only 5% of the time and 10.56 only 1% of the time.',
         dict(sub='f', text='≈ 38.65'),
         chart('fs', FS, 'Where F lands', [0, 42], [0, 1], [], [[0, '0'], [20, '20'], [40, '40']], pl=20, pr=14),
         series('c5', 'fs', [[5.12, 0], [5.12, 0.62]], 'amber', dash=True, ms=400),
         series('c1', 'fs', [[10.56, 0], [10.56, 0.86]], 'red', dash=True, ms=400),
         cnote('n5', 'fs', [5.12, 0.62], '5%', 'amber', 16, dy=-12),
         cnote('n1', 'fs', [10.56, 0.86], '1%', 'red', 16, dy=-12),
         dot('fd', 'fs', [38.65, 0.12], 'F ≈ 38.65', 'green', dx=-6, dy=-18, anchor='end')),
    step('Far past both cut-offs: reject. In this toy sample, X Granger-causes Y at lag 1. That means X\'s past helps forecast Y. It does not mean X makes Y move.',
         dict(pulse='fd'),
         dict(hide='xy'),
         arrow('X', 'Y', label='helps', tone='green', id='xy2')),
    step('Trap one: a shared driver. News that reaches X\'s price feed a few seconds before Y\'s gives the same clean result, with no link between X and Y at all.',
         icon('glb', 'globe', 14, 672, 0.6, 'red'),
         box('p1', 80, 676, 210, 76, 'shared driver\nhits X first', 'red', size=18)),
    step('Trap two: timing. If X\'s market closes hours before Y\'s, X\'s recorded price is just older, and it will look like it leads. Check timestamps and market hours first.',
         icon('clk', 'clock', 308, 672, 0.6, 'red'),
         box('p2', 374, 676, 216, 76, 'X closes earlier:\nits price is older', 'red', size=18)),
    step('So: test returns, not levels; choose the lags before testing; run both directions, because feedback is a real outcome. A lead is only real if the leader\'s past still helps after the follower\'s own past has had its say.',
         note('end', 300, 780, 'returns · lags first · both directions · check the clocks', 'green', 19)),
])


BOARD = dict(name='institutional_granger_causality', lesson='institutional-granger-causality',
             title='Granger causality: does the extra clue help?', cfg=GC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=5)
