from ._wb import *
import math

# ── Partial derivatives & multivariable calculus (foundation-multivariable-calculus) ──
# The lesson's worked example: V(S, t) = S e^(-delta t), S = 100, delta = 3%, t = 2:
# V = 94.18, dV/dS = e^(-0.06) = 0.9418, dV/dt = -0.03 x 100 x 0.9418 = -2.825.
# The bowl f(x, y) = x^2 + y^2 is an illustrative function for the gradient (its gradient
# is exactly (2x, 2y)); descent steps use x <- x - 0.25 grad f, i.e. halving each step.
D = 0.03
def V(S, t): return S * math.exp(-D * t)
assert round(V(100, 2), 2) == 94.18 and round(math.exp(-0.06), 4) == 0.9418
LINE_S = [[S, round(V(S, 2), 3)] for S in (80, 120)]
CURVE_T = [[t / 2, round(V(100, t / 2), 3)] for t in range(0, 21)]
TAN = [[0, round(94.18 + 2 * 2.825, 3)], [4.5, round(94.18 - 2.5 * 2.825, 3)]]
RING = lambda r: [[round(r * math.cos(math.radians(a)), 3), round(r * math.sin(math.radians(a)), 3)] for a in range(0, 361, 10)]
DESC = [[2.0, 1.0]]
for _ in range(4): DESC.append([DESC[-1][0] / 2, DESC[-1][1] / 2])

CA = (10, 100, 285, 260)
CB = (305, 100, 285, 260)
BW = (10, 374, 300, 316)

MV = dict(w=600, h=700, intro='One value, two dials. Freeze one, turn the other, and read off the slope. Numbers from the lesson\'s worked example. Press play, or step through.', steps=[
    step('A dividend-paying asset\'s forward value depends on two things at once: the spot price S and the horizon t. V(S, t) = S·e^(−0.03t). At S = 100 and t = 2 years, V = 94.18.',
         box('fn', 10, 10, 580, 76, 'V(S, t) = S · e^(−0.03 t)\nat S = 100, t = 2:  V = 94.18', 'blue', size=20)),
    step('First dial: freeze the time at 2 years and turn only the spot. The value moves along a straight line.',
         chart('ca', CA, 'Turn S, freeze t = 2', [78, 122], [70, 118], [[80, '80'], [100, '100']],
               [[80, '80'], [100, '100'], [120, '120']], pl=44, pr=12),
         series('ls', 'ca', LINE_S, 'purple', ms=1000),
         dot('pa', 'ca', [100, 94.18], '94.18', 'blue', dx=-10, dy=-12, anchor='end')),
    step('Its slope is the partial derivative with respect to S: e^(−0.06) = 0.9418. A $1 rise in spot, with time frozen, adds about $0.94.',
         cnote('sa', 'ca', [80.5, 111], '∂V/∂S = 0.9418', 'amber', 17, anchor='start')),
    step('Second dial: freeze the spot at 100 and turn only the time. Now the value falls as the horizon lengthens, because more dividends are given up.',
         chart('cb', CB, 'Turn t, freeze S = 100', [-0.3, 10.3], [70, 104], [[80, '80'], [100, '100']],
               [[0, '0'], [2, '2'], [5, '5'], [10, '10 yrs']], pl=44, pr=16),
         series('ct', 'cb', CURVE_T, 'purple', ms=1200),
         dot('pb', 'cb', [2, 94.18], '94.18', 'blue', dx=10, dy=-10, anchor='start')),
    step('Its slope at 2 years is the partial derivative with respect to t: −0.03 × 100 × 0.9418 = −2.825. Each extra year, with spot frozen, takes about $2.83 off.',
         series('tg', 'cb', TAN, 'green', dash=True, ms=700),
         cnote('sb', 'cb', [5, 98], '∂V/∂t = −2.825', 'green', 17, anchor='start')),
    step('Same function, two different slopes, one per dial. Stack them into one list and you have the gradient: ∇V = (0.9418, −2.825).',
         dict(hide='fn'),
         box('gr', 10, 10, 580, 76, 'gradient  ∇V = (0.9418, −2.825)\none slope per input, the others frozen', 'green', size=20)),
    step('On any surface the gradient points the way it climbs fastest. Take an illustrative bowl, f = x² + y², at the point (2, 1): its gradient (4, 2) points straight up the side.',
         chart('bw', BW, 'Bowl f = x² + y² (illustrative)', [-2.6, 3.6], [-2.6, 2.6], [[-2, '−2'], [0, '0'], [2, '2']], [[-2, '−2'], [0, '0'], [2, '2']], zero=True, pl=34, pr=10),
         *[series(f'r{k}', 'bw', RING(r), None, dash=True, ms=400) for k, r in enumerate((0.75, 1.5, 2.25))],
         dot('p0', 'bw', DESC[0], '(2, 1)', 'purple', dx=12, dy=12, anchor='start'),
         series('up', 'bw', [DESC[0], [2.45, 1.225]], 'red', ms=500),
         cnote('upn', 'bw', [2.45, 1.225], 'uphill', 'red', 16, anchor='start', dx=4, dy=-10)),
    step('Walk the opposite way, −∇f, and you go downhill fastest. Repeat small steps and you reach the bottom. That is gradient descent, the way computers fit models.',
         series('dn', 'bw', DESC, 'green', ms=1200),
         *[dot(f'd{i}', 'bw', p, '', 'green') for i, p in enumerate(DESC[1:], 1)],
         cnote('dnn', 'bw', [0, 0], 'bottom', 'green', 16, dy=24)),
    step('An option\'s value has more dials: spot, time, volatility, rates. Each Greek is one partial derivative of that one value. Delta turns spot, Theta turns time, Vega turns volatility.',
         box('dl', 330, 374, 260, 70, 'Delta = ∂V/∂S', 'blue', size=19),
         box('th', 330, 456, 260, 70, 'Theta = ∂V/∂t', 'green', size=19),
         box('vg', 330, 538, 260, 70, 'Vega = ∂V/∂σ', 'amber', size=19)),
    step('Gamma is a slope of a slope: the second partial derivative in the spot direction, ∂²V/∂S². And when several dials move at once, you add the contribution through each one.',
         box('gm', 330, 620, 260, 70, 'Gamma = ∂²V/∂S²', 'purple', size=19)),
])


BOARD = dict(name='foundation_multivariable_calculus', lesson='foundation-multivariable-calculus',
             title='Partial derivatives: two dials, freeze one, turn the other', cfg=MV,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=10)
