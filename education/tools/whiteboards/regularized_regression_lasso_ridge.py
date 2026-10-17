from ._wb import *
from math import cos, sin, sqrt, radians, pi

# ── Ridge vs LASSO (regularized-regression-lasso-ridge) ───────────────────────
# Numbers: the lesson's worked example (true y = 2.0 x1 + noise; OLS (3.4, -1.3, 0.4),
# Ridge (2.2, -0.2, 0.36), LASSO (1.9, 0, 0)) and its one-coefficient calculator
# (beta_OLS = 3.4: Ridge 3.4/(1+lambda), LASSO max(3.4 - lambda, 0)).
# The two-coefficient geometry is illustrative, like the lesson's own chart: an OLS centre
# at (1.3, 0.9) with tilted elliptical contours, solved numerically so the L1 budget
# |b1|+|b2| <= 1 is touched at its corner (1, 0) and the L2 budget b1^2+b2^2 <= 1 at
# about (0.85, 0.53).
C = (1.3, 0.9); TH = radians(120); A, B = 1.0, 0.5


def _loss(p):
    dx, dy = p[0] - C[0], p[1] - C[1]
    u = dx * cos(TH) + dy * sin(TH); v = -dx * sin(TH) + dy * cos(TH)
    return (u / A) ** 2 + (v / B) ** 2


def _contour(k, n=48):
    r = sqrt(k)
    return [[round(C[0] + cos(TH) * A * r * cos(q) - sin(TH) * B * r * sin(q), 3),
             round(C[1] + sin(TH) * A * r * cos(q) + cos(TH) * B * r * sin(q), 3)]
            for q in [2 * pi * i / n for i in range(n + 1)]]


# numeric tangent points on each budget
_L1 = min(([(1 - s) * sx, s * sy] for s in [i / 2000 for i in range(2001)] for sx in (1, -1) for sy in (1, -1)), key=_loss)
_L2 = min(([cos(q), sin(q)] for q in [2 * pi * i / 4000 for i in range(4000)]), key=_loss)
assert abs(_L1[0] - 1) < 1e-9 and abs(_L1[1]) < 1e-9 and _L2[1] > 0.4
L2P = [round(_L2[0], 3), round(_L2[1], 3)]
CIRCLE = [[round(cos(q), 3), round(sin(q), 3)] for q in [2 * pi * i / 48 for i in range(49)]]
DIAMOND = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]]
LAMS = [i / 10 for i in range(0, 51)]
RIDGE = [[l, round(3.4 / (1 + l), 3)] for l in LAMS]
LASSO = [[l, round(max(3.4 - l, 0), 3)] for l in LAMS]

COEF = (10, 128, 580, 250)

RR = dict(w=600, h=840, intro='The lesson\'s toy regression: one real signal, one near-duplicate, one column of pure noise. Watch plain least squares get it wrong, then two penalties fix it in two different ways. Press play, or step through.', steps=[
    step('Three predictors. x1 is the real driver: the truth is y = 2.0 × x1 plus noise. x2 is a near-duplicate of x1, about 0.9 correlated. x3 is pure noise. The true coefficients are 2, 0 and 0.',
         box('x1', 15, 14, 170, 84, 'x1', 'blue', sub='real signal, β = 2', size=19),
         box('x2', 215, 14, 170, 84, 'x2', 'amber', sub='twin, ρ ≈ 0.9', size=19),
         box('x3', 415, 14, 170, 84, 'x3', 'purple', sub='pure noise', size=19)),
    step('Plain least squares only cares about fit. It gives 3.4, −1.3 and 0.4: a big positive weight on x1, a compensating negative one on x2, and a little weight on the noise.',
         chart('co', COEF, 'Fitted coefficients', [0.4, 9.6], [-2.3, 4.0], [[0, '0'], [2, '2']], [[2, 'OLS'], [5, 'Ridge'], [8, 'LASSO']], zero=True, pl=36),
         dict(bars='ols', chart='co', data=[[1, 3.4, '3.4', 'blue'], [2, -1.3, '−1.3', 'amber'], [3, 0.4, '0.4', 'purple']], bw=34, ms=1100)),
    step('The pair\'s sum, 3.4 − 1.3 = 2.1, is close to the true 2.0. OLS cannot tell which twin deserves the credit, so it splits it wildly. Rerun on a slightly different sample and the split can swing.',
         series('true', 'co', [[0.5, 2.0], [9.5, 2.0]], 'green', dash=True, ms=600),
         cnote('tl', 'co', [9.5, 2.0], 'true 2.0', 'green', 17, anchor='end', dy=-14)),
    step('The fix: make big coefficients cost something. Keep the fit term and add a penalty on coefficient size, scaled by a dial λ. At λ = 0 you are back to plain OLS.',
         box('pen', 110, 392, 380, 56, 'fit error  +  λ × (size of the coefficients)', 'chalk', size=19)),
    step('Ridge measures size as the sum of squares. All three shrink: 2.2, −0.2 and 0.36. The sign-flip almost vanishes, but nothing is exactly zero. Ridge shrinks; it does not select.',
         dict(bars='rdg', chart='co', data=[[4, 2.2, '2.2', 'blue'], [5, -0.2, '−0.2', 'amber'], [6, 0.36, '0.36', 'purple']], bw=34, ms=1100)),
    step('LASSO measures size as the sum of absolute values. It gives 1.9, 0 and 0: the duplicate and the noise are set to exactly zero, and the real signal keeps nearly all its weight.',
         dict(bars='las', chart='co', data=[[7, 1.9, '1.9', 'blue'], [8, 0.0001, '0', 'amber'], [9, 0.0001, '0', 'purple']], bw=34, ms=1100)),
    step('Why the exact zeros? Picture two coefficients. The fit error makes tilted oval contours around the OLS answer. The penalty is a budget: a circle for Ridge, a diamond for LASSO. (Illustrative shapes.)',
         chart('geo', (10, 466, 290, 290), 'Two coefficients (illustrative)', [-1.3, 2.5], [-1.3, 2.4], [[0, '0'], [1, '1']], [[0, '0'], [1, 'β₁ = 1']], pl=40),
         series('ax', 'geo', [[-1.3, 0], [2.5, 0]], None, dash=True, ms=300),
         series('ay', 'geo', [[0, -1.3], [0, 2.4]], None, dash=True, ms=300),
         series('circ', 'geo', CIRCLE, 'blue', ms=900),
         series('dia', 'geo', DIAMOND, 'amber', ms=900),
         dot('ols', 'geo', list(C), 'OLS', None, dx=12, dy=-12, anchor='start')),
    step(f'Grow the oval until it first touches each budget. It meets the smooth circle at a side point, about ({L2P[0]:.2f}, {L2P[1]:.2f}): both coefficients nonzero. It meets the diamond at its corner, (1, 0): β₂ is exactly zero. Corners sit on the axes, and they catch the oval for a wide range of shapes.',
         series('c2', 'geo', _contour(_loss(_L2)), 'purple', ms=900),
         series('c1', 'geo', _contour(_loss(_L1)), None, ms=900),
         dot('t2', 'geo', L2P, 'Ridge', 'blue', dx=-8, dy=-16, anchor='end'),
         dot('t1', 'geo', [1, 0], '', 'amber'),
         cnote('t1l', 'geo', [1.75, -0.95], 'LASSO: β₂ = 0', 'amber', 17)),
    step('One coefficient, the calculator\'s formulas, starting from OLS 3.4. Ridge divides by (1 + λ): it falls but never reaches zero. LASSO subtracts λ: at λ = 3.4 it hits exactly zero and stays there. Ridge is still 0.77 at that point.',
         chart('sh', (310, 466, 280, 290), 'Shrinking β = 3.4', [0, 5], [0, 3.8], [[0, '0'], [1, '1'], [2, '2'], [3, '3']], [[0, 'λ 0'], [3.4, '3.4'], [5, '5']], pl=36),
         series('rp', 'sh', RIDGE, 'blue', ms=1100, label='Ridge', lat=[1.0, 1.7], ldx=-6, ldy=20, lanchor='end'),
         series('lp', 'sh', LASSO, 'amber', ms=1100, label='LASSO', lat=[0.6, 2.8], ldx=10, ldy=-12, lanchor='start'),
         dot('z', 'sh', [3.4, 0], 'exactly 0', 'amber', dy=-18),
         dot('rz', 'sh', [3.4, 0.773], '0.77', 'blue', dy=-16)),
    step('Choose λ by cross-validation, never by in-sample fit: in-sample error is always lowest at λ = 0, so in-sample fit would always say "don\'t regularize". And standardize the predictors first, or the penalty punishes units, not importance.',
         box('cv', 20, 770, 270, 60, 'λ by cross-validation', 'green', size=19)),
    step('One warning. Which twin LASSO keeps is close to a coin flip: a slightly different sample might keep x2 instead. A selected list is not proof of a true driver. Elastic Net blends both penalties so correlated groups survive together.',
         box('en', 310, 770, 270, 60, 'LASSO\'s pick can flip', 'red', size=19),
         dict(pulse='x1'), dict(pulse='x2')),
])


BOARD = dict(name='regularized_regression_lasso_ridge', lesson='regularized-regression-lasso-ridge',
             title='Ridge shrinks, LASSO deletes', cfg=RR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
