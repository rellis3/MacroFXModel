from ._wb import *
from math import log10

# ── Newton-Raphson & gradient descent (newton-raphson-gradient-descent) ───────
# The lesson's worked example: 3-year bond, coupon 5, face 100, market price 97.50.
# Newton from y0 = 5%: f = 2.50, slope about -272, y1 = 5.918%, y2 = 5.934% (YTM).
# Wild start (the lesson suggests trying 50%): P(50%) = 36.67, f = -60.83, slope -67.41,
# so the step lands at about -40.2%, and the next at about -23.8%: the method overshoots.
# Gradient descent: f(x) = (x-3)^2 from x0 = 0; alpha 0.3 -> 1.8, 2.52, 2.808, 2.923;
# alpha 0.5 lands on 3 in one step (Newton for a quadratic); alpha 1.1 multiplies the
# error by -1.2 each step, so it diverges (the lesson's slider runs to 1.15).
C, F, NY, PM = 5, 100, 3, 97.5
def P(y): return sum((C + (F if t == NY else 0)) / (1 + y) ** t for t in range(1, NY + 1))
def dP(y): return sum(-t * (C + (F if t == NY else 0)) / (1 + y) ** (t + 1) for t in range(1, NY + 1))
def nstep(y): return y - (P(y) - PM) / dP(y)
Y1 = nstep(0.05); Y2 = nstep(Y1)
W1 = nstep(0.5); W2 = nstep(W1)
assert round(Y1 * 100, 3) == 5.918 and round(Y2 * 100, 3) == 5.934 and round(W1 * 100, 1) == -40.2
ZOOM = [[round(i / 10000, 4), round(P(i / 10000) - PM, 3)] for i in range(480, 621, 5)]
WIDE = [[round(i / 100, 2), round(P(i / 100) - PM, 2)] for i in range(-10, 61, 2)]
def gd(a, n=4, x=0.0):
    out = [[x, (x - 3) ** 2]]
    for _ in range(n):
        x = x - a * 2 * (x - 3); out.append([round(x, 3), round((x - 3) ** 2, 3)])
    return out
BOWL = [[i / 10, round((i / 10 - 3) ** 2, 3)] for i in range(-15, 76, 3)]

NR = dict(w=600, h=820, intro='Newton-Raphson finds a bond\'s yield by sliding down tangent lines. Watch it nail the answer in two steps, then watch a bad start send it flying, then the slower, steadier walk of gradient descent. Press play, or step through.', steps=[
    step('A 3-year bond paying 5 a year on 100 trades at 97.50. Which yield makes the price formula give 97.50? There is no algebra for it, so plot the pricing error: model price minus 97.50. The answer is where it crosses zero.',
         chart('z', (10, 10, 580, 250), 'Pricing error P(y) − 97.50, near the answer', [0.048, 0.062], [-1.2, 3.4],
               [[0, '0'], [1, '1'], [2, '2'], [3, '3']], [[0.05, '5.0%'], [0.055, '5.5%'], [0.06, '6.0%']], zero=True, pl=40, pr=20),
         series('fz', 'z', ZOOM, 'blue', ms=1100)),
    step('Start at the coupon rate, 5%. There the bond prices at exactly 100, so the error is 2.50. The slope of the price is about −272 per unit of yield.',
         dot('p0', 'z', [0.05, 2.5], 'y₀ = 5%: error 2.50', 'amber', dx=10, dy=-14, anchor='start')),
    step('Follow the tangent line, not the curve, down to zero: 5% − 2.50 ÷ (−272) = 5.918%. One step, and the error falls from 2.50 to about 0.04.',
         series('t0', 'z', [[0.05, 2.5], [Y1, 0]], 'amber', dash=True, ms=900),
         dot('p1', 'z', [Y1, P(Y1) - PM], 'y₁ = 5.918%', 'green', dx=10, dy=-24, anchor='start')),
    step('Repeat from 5.918%. The next step lands at 5.934%, with the price within a fraction of a cent of 97.50. Done: the yield to maturity is about 5.934%.',
         dot('p2', 'z', [Y2, 0], 'YTM ≈ 5.934%', 'green', dx=-12, dy=28, anchor='end')),
    step('That is quadratic convergence: near the answer, the error is roughly squared each step, so correct digits roughly double. Bars on a log scale: 2.50, then 0.04, then under a cent.',
         chart('err', (310, 272, 280, 250), 'Pricing error, log scale', [0.4, 3.6], [0, 6],
               [[5, '1'], [3, '0.01'], [1, '0.0001']], [[1, 'start'], [2, 'step 1'], [3, 'step 2']], pl=58),
         dict(bars='eb', chart='err', data=[[1, round(log10(2.5) + 5, 3), '2.50', 'red'], [2, round(log10(P(Y1) - PM) + 5, 3), '0.04', 'amber'], [3, max(0.4, round(log10(abs(P(Y2) - PM)) + 5, 3)), '< 1¢', 'green']], bw=46, ms=1100)),
    step('But the speed is only local. Start instead from a wild guess of 50%. The price there is 36.67, the error −60.83, and the slope only −67.4: a shallow tangent.',
         chart('w', (10, 272, 290, 250), 'From a 50% guess', [-0.45, 0.62], [-70, 62],
               [[-60, '−60'], [0, '0'], [60, '60']], [[-0.4, '−40%'], [0, '0%'], [0.5, '50%']], zero=True, pl=40, pr=14),
         series('fw', 'w', WIDE, 'blue', ms=1000),
         dot('w0', 'w', [0.5, P(0.5) - PM], '50%', 'amber', dx=-8, dy=18, anchor='end')),
    step('The tangent shoots past the answer to a yield of about −40%. The next step jumps to about −24%. Fast, confident, and nowhere near 5.934%. Real solvers bound the step and fall back to bisection.',
         series('tw', 'w', [[0.5, P(0.5) - PM], [W1, 0]], 'red', dash=True, ms=1000),
         dot('w1', 'w', [W1, 0], '−40%', 'red', dx=4, dy=-18, anchor='start')),
    step('Gradient descent asks a different question: where is a function smallest? On the bowl (x − 3)², start at 0 and step downhill by a learning rate times the slope.',
         chart('b', (10, 540, 580, 270), 'Gradient descent on (x − 3)², from x = 0', [-1.5, 7.5], [0, 21],
               [[0, '0'], [9, '9'], [18, '18']], [[0, '0'], [3, '3 (min)'], [6, '6']], pl=40, pr=16),
         series('bowl', 'b', BOWL, None, ms=900)),
    step('With a learning rate of 0.3, each step cuts the error to 0.4 of what it was: 0 → 1.8 → 2.52 → 2.81 → 2.92. Steady, but linear: the error shrinks by a fixed ratio, it is not squared.',
         series('g3', 'b', gd(0.3), 'green', ms=1300, label='α = 0.3', lat=[1.2, 0.8], ldx=0, ldy=0, lanchor='end', lsize=16),
         dot('g3d', 'b', [0, 9], 'x₀', 'green', dx=-10, dy=0, anchor='end')),
    step('A learning rate of 0.5 lands exactly on 3 in one step. That is Newton\'s method for this bowl: the curvature picks the step size for you.',
         series('g5', 'b', gd(0.5, 1), 'purple', dash=True, ms=900, label='α = 0.5: one step', lat=[1.5, 4.5], ldx=12, ldy=-10, lanchor='start', lsize=16)),
    step('Too big a rate, 1.1, overshoots further every time: 0 → 6.6 → −1.3. The error grows by 1.2 times each step and never settles. The learning rate has to be tuned to the problem.',
         series('g11', 'b', gd(1.1, 2), 'red', ms=1300, label='α = 1.1: diverges', lat=[3.6, 19], ldx=0, ldy=0, lanchor='start', lsize=16)),
])


BOARD = dict(name='newton_raphson_gradient_descent', lesson='newton-raphson-gradient-descent',
             title='Tangent lines to a yield, and steps down a bowl', cfg=NR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)
