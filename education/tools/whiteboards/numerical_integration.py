from ._wb import *
from math import exp, sqrt, pi, erf
import random, statistics

# ── Numerical integration: strips, parabolas, darts, and the dimension wall ───
# The lesson's integral: the area under φ(z) from 0 to 1, Φ(1) − Φ(0) = 0.34134.
# Composite trapezoidal rule (computed here, matching the lesson's calculator): n = 1 → 0.32046
# (error −0.02089), n = 2 → 0.33626 (−0.00508), n = 4 → 0.34008 (−0.00126, the worked example),
# n = 8 → 0.34103 (−0.00032). Each halving of h cuts the error about fourfold (O(h²)).
# Simpson n = 4 → 0.34136 (error +0.00001). Monte Carlo: ONE illustrative draw of 12 uniform
# points (seed 1) gives 0.34393 (error +0.00258); its standard error is ≈ 0.014.
# Grid cost 10^d: 10, 100, 1,000, ..., 10^10 at d = 10 (the lesson's stat row); Monte Carlo cost
# is N draws in any dimension (the lesson's scenario uses 1 million).
phi = lambda z: exp(-z * z / 2) / sqrt(2 * pi)
TRUE = 0.5 * erf(1 / sqrt(2))
def trap(n):
    h = 1 / n
    return h * ((phi(0) + phi(1)) / 2 + sum(phi(i * h) for i in range(1, n)))
def simp(n):
    h = 1 / n
    return h / 3 * (phi(0) + phi(1) + sum((4 if i % 2 else 2) * phi(i * h) for i in range(1, n)))
assert round(TRUE, 5) == 0.34134 and round(trap(4), 5) == 0.34008 and round(trap(1), 5) == 0.32046
assert round(trap(2), 5) == 0.33626 and round(trap(8), 5) == 0.34103 and round(simp(4) - TRUE, 5) == 0.00001
random.seed(1)
DARTS = [round(random.random(), 3) for _ in range(12)]
MC = sum(phi(z) for z in DARTS) / 12
SE = statistics.stdev([phi(z) for z in DARTS]) / sqrt(12)
assert round(MC, 5) == 0.34393 and round(SE, 3) == 0.014

CURVE = [[round(-0.3 + i * 0.05, 2), round(phi(-0.3 + i * 0.05), 4)] for i in range(33)]
def strips(n):
    return [[i / n, round(phi(i / n), 4)] for i in range(n + 1)]
def outline(n):
    """Trapezoid tops plus their vertical edges, drawn as one path."""
    s = strips(n)
    pts = [[0, 0], s[0]]
    for i, (x, y) in enumerate(s[1:], 1):
        pts += [[x, y], [x, 0]] + ([[x, y]] if i < n else [])
    return pts

PHI = (10, 10, 400, 250)
ERR = (10, 275, 285, 230)
DIM = (305, 275, 285, 230)

NI = dict(w=600, h=640, intro='An area under a curve, measured three ways: straight-topped strips, parabolas, and random darts. Then why the darts win once there are many dimensions. Press play, or step through.', steps=[
    step('Many prices and probabilities are an area under a curve. Here is the normal bell curve. The shaded area from 0 to 1 is the chance a standard normal lands there: Φ(1) − Φ(0) = 0.34134. Pretend we could not look it up.',
         chart('phi', PHI, 'The normal density φ(z)', [-0.3, 1.3], [0, 0.45], [[0.2, '0.2'], [0.4, '0.4']], [[0, 'z = 0'], [0.5, '0.5'], [1, 'z = 1']], pl=48),
         series('c', 'phi', CURVE, 'blue', ms=1100),
         dict(gap='area', chart='phi', top=strips(20), bot=[[0, 0], [1, 0]], tone='blue', op=0.18),
         box('est', 420, 40, 170, 76, 'area estimate', 'blue', sub='true: 0.34134', size=18)),
    step('The trapezoidal rule: replace the curve with a straight line and measure the trapezoid. One strip gives 0.32046, short by 0.02089. The straight top cuts off the bulge of the curve.',
         series('t1', 'phi', [[0, 0], [0, round(phi(0), 4)], [1, round(phi(1), 4)], [1, 0]], 'amber', ms=900),
         dict(sub='est', text='1 strip: 0.32046'),
         chart('err', ERR, 'Error, in thousandths', [0.4, 5.6], [0, 24], [[10, '10'], [20, '20']], [[1, 'n=1'], [2, '2'], [3, '4'], [4, '8'], [5, 'S4']], pl=52),
         dict(bars='e1', chart='err', data=[[1, 20.89, '20.9', 'amber']], bw=30)),
    step('Two strips of half the width: 0.33626, short by 0.00508. Halving the width cut the error to about a quarter.',
         dict(hide='t1'),
         series('t2', 'phi', outline(2), 'amber', ms=1000),
         dict(sub='est', text='2 strips: 0.33626'),
         dict(bars='e2', chart='err', data=[[2, 5.08, '5.1', 'amber']], bw=30)),
    step('Four strips, h = 0.25: the lesson\'s worked example, 0.34008, short by 0.00126. A quarter again. That is the O(h²) rule: halve the step, quarter the error.',
         dict(hide='t2'),
         series('t4', 'phi', outline(4), 'amber', ms=1100),
         dict(sub='est', text='4 strips: 0.34008'),
         dict(bars='e3', chart='err', data=[[3, 1.26, '1.3', 'amber']], bw=30)),
    step('Eight strips: 0.34103, short by 0.00032. Still a quarter each time.',
         dict(bars='e4', chart='err', data=[[4, 0.32, '0.3', 'amber']], bw=30)),
    step('Simpson\'s rule fits a parabola through every three points instead of a straight line. With the same four strips it gives 0.34136, off by only 0.00001: a hundred times closer than the trapezoids, for the same five points. Its error shrinks with h⁴.',
         dict(dim='t4'),
         dict(sub='est', text='Simpson, 4: 0.34136'),
         dict(bars='e5', chart='err', data=[[5, 0.01, '0.01', 'green']], bw=30),
         dict(pulse='c')),
    step('Monte Carlo throws darts instead. Pick 12 random points between 0 and 1, read the curve\'s height at each, and average. Average height times width 1 is the area. This illustrative draw gives 0.34393.',
         dict(hide='t4'),
         *[dot(f'd{i}', 'phi', [z, round(phi(z), 4)], '', 'purple', r=4.5) for i, z in enumerate(DARTS)],
         dict(sub='est', text='12 darts: 0.34393')),
    step('That draw landed close by luck. With 12 darts the typical error is about 0.014, ten times the four-strip trapezoid\'s. Monte Carlo error shrinks like 1 over the square root of N: four times the darts for half the error. In one dimension, the grid wins easily.',
         note('mcse', 505, 160, 'typical error\n≈ 0.014\nat N = 12', 'purple', 18)),
    step('Now add dimensions. A grid with 10 points per axis needs 10 points in one dimension, 100 in two, 1,000 in three, and 10 billion in ten. A basket on ten underlyings is a ten-dimensional integral.',
         chart('dim', DIM, 'Grid points (log scale)', [0.4, 5.6], [0, 11], [[1, '10'], [3, '10³'], [6, '10⁶'], [10, '10¹⁰']], [[1, 'd=1'], [2, '2'], [3, '3'], [5, '10']], pl=52),
         dict(bars='g', chart='dim', data=[[1, 1, '10', 'red'], [2, 2, '100', 'red'], [3, 3, '1,000', 'red'], [5, 10, '10 billion', 'red']], bw=30, ms=1300)),
    step('Monte Carlo\'s cost does not care. A million random draws in ten dimensions is still a million draws, and the error still shrinks like 1 over the square root of N.',
         series('mc', 'dim', [[0.5, 6], [5.5, 6]], 'green', dash=True, ms=600, label='Monte Carlo: 1 million draws', lat=[0.6, 6], ldx=0, ldy=-14, lanchor='start')),
    step('So the rule of thumb: one or two smooth dimensions, use quadrature like Simpson\'s rule; many dimensions, simulate. Either way, the answer is only as good as the curve you hand it.',
         box('rule', 10, 520, 580, 110, 'one or two dimensions: quadrature\nmany dimensions: Monte Carlo', 'green', size=20)),
])


BOARD = dict(name='numerical_integration', lesson='numerical-integration', title='Strips, parabolas and darts', cfg=NI,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=10)
