from ._wb import *

# ── Correlation & linear regression (primer-correlation-regression) ───────────
# The lesson's worked example: x = 1..5, y = 2.1, 3.9, 6.2, 7.8, 10.1.
# Means 3 and 6.02; deviation products 7.84, 2.12, 0, 1.78, 8.16 (sum 19.9); Cov = 3.98;
# Var(x) = 2, sigma_x = 1.4142, sigma_y = 2.8181; r = 0.9986; beta = 1.99, alpha = 0.05;
# residuals 0.06, -0.13, 0.18, -0.21, 0.10; SSR = 0.107, SST = 39.708, R^2 = 0.9973 = r^2.
# The y = x^2 trap uses x = -5..5 (symmetric), where the covariance is exactly zero.
XS = [1, 2, 3, 4, 5]
YS = [2.1, 3.9, 6.2, 7.8, 10.1]
PROD = [7.84, 2.12, 0, 1.78, 8.16]
RES = [0.06, -0.13, 0.18, -0.21, 0.10]
SC = (10, 10, 370, 290)

CORR = dict(w=600, h=862, intro='The lesson\'s five points, taken from "do they move together?" to the best-fit line, and then the two ways a correlation misleads. Press play, or step through.', steps=[
    step('Take the lesson\'s five pairs: x = 1 to 5, and y = 2.1, 3.9, 6.2, 7.8, 10.1. Roughly y = 2x, with a little noise. Do they move together?',
         chart('sc', SC, 'Five paired observations', [0, 6], [0, 11.5], [[0, '0'], [5, '5'], [10, '10']],
               [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], pl=40, pr=14),
         *[dot(f'p{i}', 'sc', [x, y], '', 'blue', r=6) for i, (x, y) in enumerate(zip(XS, YS))]),
    step('Mark the averages: x̄ = 3 and ȳ = 6.02. They split the picture into four corners around the center of the data.',
         series('mx', 'sc', [[3, 0.2], [3, 11.2]], None, dash=True, label='x̄ = 3', lat=[3, 0.2], ldx=8, ldy=-10, lanchor='start'),
         series('my', 'sc', [[0.1, 6.02], [5.9, 6.02]], None, dash=True, label='ȳ = 6.02', lat=[0.1, 6.02], ldx=4, ldy=-12, lanchor='start')),
    step('For each point, multiply its distance from x̄ by its distance from ȳ. Both above, or both below, gives a positive product. Here every product is positive or zero: 7.84, 2.12, 0, 1.78 and 8.16.',
         dict(gap='q1', chart='sc', top=[[3, 11.2], [5.9, 11.2]], bot=[[3, 6.02], [5.9, 6.02]], tone='green', op=0.13),
         dict(gap='q3', chart='sc', top=[[0.1, 6.02], [3, 6.02]], bot=[[0.1, 0.2], [3, 0.2]], tone='green', op=0.13),
         chart('pr', (10, 316, 280, 214), 'Deviation products', [0.4, 5.6], [-1, 10],
               [[0, '0'], [8, '8']], [[1, 'x=1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], zero=True, pl=34, pr=10),
         dict(bars='pb', chart='pr', data=[[x, v, f'{v:g}', 'green'] for x, v in zip(XS, PROD)], bw=30, ms=1100)),
    step('Add them up and average: 19.9 ÷ 5 = 3.98. That is the covariance. Positive, so x and y move together. But its size depends on the units you measure in.',
         box('cov', 392, 14, 198, 62, 'Cov = 19.9 ÷ 5', 'blue', sub='= 3.98', size=18)),
    step('Divide by both standard deviations, 1.41 for x and 2.82 for y, and the units cancel. The result, r ≈ 0.999, lives on a ruler from −1 to +1. That is the correlation.',
         box('r', 392, 86, 198, 62, 'r = Cov ÷ (σx σy)', 'purple', sub='≈ 0.999', size=18)),
    step('Now the best straight line. Divide the covariance by the variance of x alone: 3.98 ÷ 2 = 1.99. That is the least-squares slope. The line runs through the center, so the intercept is 6.02 − 1.99 × 3 = 0.05.',
         series('fit', 'sc', [[0.3, 0.05 + 1.99 * 0.3], [5.6, 0.05 + 1.99 * 5.6]], 'green', ms=1000),
         box('fitb', 392, 158, 198, 62, 'slope = Cov ÷ Var(x)', 'green', sub='3.98 ÷ 2 = 1.99', size=18)),
    step('The gaps from each point to the line are the residuals: +0.06, −0.13, +0.18, −0.21, +0.10. They sum to zero. Squared and added, they make 0.107, against 39.708 of total spread in y. So R² = 1 − 0.107 ÷ 39.708 ≈ 0.997, which is exactly r².',
         chart('rs', (310, 316, 280, 214), 'Residuals (y minus the line)', [0.4, 5.6], [-0.3, 0.3],
               [[0.2, '+0.2'], [-0.2, '−0.2']], [[1, 'x=1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], zero=True, pl=44, pr=10),
         dict(bars='rb', chart='rs', data=[[x, v, f'{v:+.2f}'] for x, v in zip(XS, RES)], bw=30, ms=1000),
         box('r2', 392, 230, 198, 62, 'R² = 1 − SSR ÷ SST', 'amber', sub='≈ 0.997 = r²', size=18)),
    step('Trap one: correlation only sees straight lines. Here y = x², for x from −5 to 5. y is completely fixed by x, yet the best straight line is flat and r = 0. Always look at the scatter.',
         chart('sq', (10, 546, 280, 216), 'y = x²: perfectly linked', [-5.6, 5.6], [0, 27], [], [[-5, '−5'], [0, '0'], [5, '5']], pl=14, pr=14),
         series('pq', 'sq', [[x / 10, (x / 10) ** 2] for x in range(-52, 53, 4)], None, dash=True, ms=800),
         *[dot(f'q{x + 5}', 'sq', [x, x * x], '', 'blue') for x in range(-5, 6)],
         series('flat', 'sq', [[-5.4, 10], [5.4, 10]], 'amber', ms=600, label='r = 0', lat=[0, 10], ldx=0, ldy=-16)),
    step('Trap two: correlation is not causation. Ice cream sales and drownings rise together, but neither causes the other. Warm weather drives both. In markets, two currencies can move together because both follow the dollar.',
         box('sun', 310, 620, 120, 64, 'warm\nweather', 'amber', size=19),
         box('ice', 470, 548, 120, 64, 'ice cream\nsales', 'blue', size=18),
         box('drown', 470, 690, 120, 64, 'drownings', 'blue', size=18),
         arrow('sun', 'ice', None, 'amber'),
         arrow('sun', 'drown', None, 'amber'),
         note('nc', 530, 645, 'r high,\nno cause', 'red', 17)),
    step('On a desk, the slope is the working number. Sharpe (1963–64) made a stock\'s beta a regression slope against the market. Ederington (1979) used the same slope as the hedge ratio for financial futures. What is left over is the alpha, or the spread.',
         box('beta', 10, 778, 580, 74, 'beta and hedge ratio = Cov ÷ Var\nSharpe 1963–64 · Ederington 1979', 'green', size=19)),
])


BOARD = dict(name='primer_correlation_regression', lesson='primer-correlation-regression',
             title='From "move together" to the best-fit line, and two traps', cfg=CORR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
