from ._wb import *
from math import cos, sin, radians, sqrt

# ── Linear algebra & matrices (linear-algebra-matrices) ───────────────────────
# The lesson's worked example: A = [[3, 1], [1, 3]], trace 6, det 8, eigenvalues 4 and 2,
# eigenvectors (1, 1) and (1, -1). A(1, 0) = (3, 1), A(0, 1) = (1, 3).
# As a covariance matrix of EUR/USD and GBP/USD: 4/6 = 66.7% shared, 2/6 = 33.3% divergence,
# effective bets (sum lambda)^2 / sum lambda^2 = 36/20 = 1.8. Varying the shared entry b
# (the lesson's calculator) gives eigenvalues 3 + b and 3 - b, effective bets 36 / (18 + 2b^2):
# b = 0 -> 2, b = 1 -> 1.8, b = 2 -> 1.38, b = 3 -> 1.
CX, CY, U = 170, 200, 30
def P(x, y): return [round(CX + U * x, 1), round(CY - U * y, 1)]   # math coords -> board
def ray(x, y): return [P(0, 0), P(x, y)]
R = 1 / sqrt(2)
CIRCLE = [P(cos(radians(a)), sin(radians(a))) for a in range(0, 361, 10)]
ELLIPSE = [P(*(lambda c, s: (3 * c + s, c + 3 * s))(cos(radians(a)), sin(radians(a)))) for a in range(0, 361, 10)]
EFF = [[b / 4, round(36 / (18 + 2 * (b / 4) ** 2), 3)] for b in range(13)]

LA = dict(w=600, h=720, intro='One 2×2 matrix from the lesson, treated as a machine that moves arrows. Watch which directions it turns and which it only stretches, then read it as the risk of a two-pair book. Press play, or step through.', steps=[
    step('Meet a vector: (1, 0), an arrow one step to the right. A vector is just a list of numbers, like two FX pairs\' returns on one day.',
         dict(line='ax', points=[[20, CY], [330, CY]], width=2, ms=400),
         dict(line='ay', points=[[CX, 40], [CX, 362]], width=2, ms=400),
         dict(dim='ax'), dict(dim='ay'),
         dict(line='e1', points=ray(1, 0), tone='blue', width=4, ms=500),
         note('e1l', CX + 36, CY + 22, '(1, 0)', 'blue', 17, anchor='start')),
    step('Meet the machine: A has rows (3, 1) and (1, 3). Each output entry is a row of A times the arrow. So (1, 0) goes in and (3, 1) comes out: longer, and turned upward.',
         box('A', 350, 20, 240, 86, 'A has rows\n(3, 1) and (1, 3)', 'purple', size=20),
         dict(line='o1', points=ray(3, 1), tone=None, width=3, ms=700),
         note('o1l', P(3, 1)[0] + 6, P(3, 1)[1] - 12, '(3, 1)', None, 17, anchor='start')),
    step('Try (0, 1), straight up. It comes out as (1, 3): turned to the right. Most arrows get turned to a new direction.',
         dict(line='e2', points=ray(0, 1), tone='blue', width=4, ms=500),
         dict(line='o2', points=ray(1, 3), tone=None, width=3, ms=700),
         note('o2l', P(1, 3)[0] + 8, P(1, 3)[1] + 2, '(1, 3)', None, 17, anchor='start')),
    step('Now feed it every unit arrow at once, the dashed circle. The machine turns the whole circle into an ellipse.',
         dict(dim='o1'), dict(dim='o2'), dict(hide='o1l'), dict(hide='o2l'), dict(dim='e1'), dict(dim='e2'), dict(hide='e1l'),
         dict(line='circ', points=CIRCLE, tone=None, width=2, ms=700),
         dict(line='ell', points=ELLIPSE, tone='purple', width=3, ms=1100)),
    step('But one direction is not turned. The arrow along (1, 1) comes out as (4, 4): four times as long, on the same line. That is an eigenvector, and 4 is its eigenvalue.',
         dict(line='v1', points=ray(4 * R, 4 * R), tone='amber', width=5, ms=900),
         note('v1l', P(4 * R, 4 * R)[0] + 8, P(4 * R, 4 * R)[1] - 6, '(1, 1): ×4', 'amber', 18, anchor='start')),
    step('The other: (1, −1) comes out as (2, −2), twice as long, same line. Eigenvalue 2. And the two directions sit at right angles, because A is symmetric, as every covariance matrix is.',
         dict(line='v2', points=ray(2 * R, -2 * R), tone='blue', width=5, ms=800),
         note('v2l', P(2 * R, -2 * R)[0] + 10, P(2 * R, -2 * R)[1] + 14, '(1, −1): ×2', 'blue', 18, anchor='start')),
    step('How to find them without guessing: Av = λv means (A − λI)v = 0, so det(A − λI) = 0. For this A that is λ² − 6λ + 8 = 0, which factors to (λ − 4)(λ − 2).',
         box('ch', 350, 122, 240, 110, 'det(A − λI) = 0\nλ² − 6λ + 8 = 0\nλ = 4 or 2', 'green', size=19)),
    step('Now read A as risk: the covariance matrix of EUR/USD and GBP/USD. Each has variance 3; they share 1, a correlation of about a third.',
         chip('eur', 476, 262, 'EUR/USD · var 3', 'blue'),
         chip('gbp', 476, 308, 'GBP/USD · var 3', 'blue'),
         note('cv', 476, 354, 'shared: cov 1', 'purple', 18)),
    step('Total variance is the trace, 3 + 3 = 6. The eigenvalues split it: 4 in the "both move together" direction, 66.7%, and 2 in the "they diverge" direction, 33.3%.',
         chart('split', (10, 390, 280, 220), 'Where the book\'s variance sits', [0.4, 2.6], [0, 5],
               [[0, '0'], [2, '2'], [4, '4']], [[1, 'together'], [2, 'diverge']], pl=34, pr=10),
         dict(bars='sb', chart='split', data=[[1, 4, '4 · 66.7%', 'amber'], [2, 2, '2 · 33.3%', 'blue']], bw=60, ms=1000)),
    step('So two positions are only 6² ÷ (4² + 2²) = 36 ÷ 20 = 1.8 effective bets. Two tickets, but less than two independent bets.',
         chart('eff', (310, 390, 280, 220), 'Effective bets vs shared entry', [0, 3], [0.8, 2.2],
               [[1, '1'], [2, '2']], [[0, '0'], [1, '1'], [2, '2'], [3, '3']], pl=40, pr=14),
         dot('b1', 'eff', [1, 1.8], '1.8', 'amber', dx=10, dy=-14, anchor='start')),
    step('Raise the shared entry and the eigenvalues spread apart: at 2 they are 5 and 1, about 1.4 bets; at 3 they are 6 and 0, a single bet. More co-movement, fewer real bets.',
         series('effc', 'eff', EFF, 'purple', ms=1200),
         dot('b2', 'eff', [2, 1.385], '1.4', 'red', dx=10, dy=-14, anchor='start'),
         dot('b3', 'eff', [3, 1.0], '1', 'red', dx=-10, dy=-14, anchor='end')),
    step('That is portfolio risk as matrix algebra. Markowitz (1952) put the covariance matrix at its heart. Litterman and Scheinkman (1991) found that three eigenvectors, level, slope and curvature, drive almost all yield-curve moves.',
         box('mk', 10, 628, 580, 80, 'covariance matrix → eigenvectors = the real bets\nMarkowitz 1952 · Litterman & Scheinkman 1991', 'green', size=19)),
])


BOARD = dict(name='linear_algebra_matrices', lesson='linear-algebra-matrices',
             title='A matrix moves arrows; eigenvectors only stretch', cfg=LA,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
