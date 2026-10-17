from ._wb import *
from math import log

# ── Calculus for finance (calculus-for-finance) ───────────────────────────────
# The lesson's own examples: f(x) = x^2, secant slope from x to x+h is 2x + h, derivative 2x
# (at x = 1: secant slopes 3 for h = 1, 2.5 for h = 0.5, tangent slope 2).
# Fundamental theorem: the area under 2x from 0 to 1 is F(1) - F(0) = 1 with F = x^2.
# Taylor of ln(1+x) at 0: 0, then x, then x - x^2/2; errors 0.00004 at h = 0.05 and
# 0.00736 at h = 0.30. Averaged: g = mu - sigma^2/2, 2% a year at sigma = 20%.
# Delta 0.60 on a $4.30 call with spot $100 (the lesson's trading scenario).
SQ = (10, 10, 580, 300)
LN = (10, 326, 580, 300)
TRUE = [[round(-0.4 + i * 0.05, 2), round(log(0.6 + i * 0.05), 4)] for i in range(25)]
SEC = [[round(-0.4 + i * 0.05, 2), round((-0.4 + i * 0.05) - (-0.4 + i * 0.05) ** 2 / 2, 4)] for i in range(25)]

CALC = dict(w=600, h=760, intro='The lesson\'s three ideas on two curves: a slope found by shrinking a gap, an area found by undoing a slope, and a Taylor guess that turns into volatility drag and delta. Press play, or step through.', steps=[
    step('Take the curve f(x) = x², and stand at x = 1. How steep is it right there? Start with an average: the straight line from x = 1 to x = 2 rises from 1 to 4, a slope of 3.',
         chart('sq', SQ, 'f(x) = x²', [0, 3], [0, 9], [[0, '0'], [4, '4'], [8, '8']], [[0, '0'], [1, '1'], [2, '2'], [3, '3']], pl=36, pr=14),
         series('fx', 'sq', [[i / 10, round((i / 10) ** 2, 3)] for i in range(31)], 'blue', ms=1000, label='x²', lat=[2.9, 8.41], ldx=-10, ldy=0, lanchor='end'),
         dot('p1', 'sq', [1, 1], 'x = 1', 'blue', dx=12, dy=22, anchor='start'),
         series('s1', 'sq', [[2 / 3, 0], [2.3, 4.9]], None, dash=True),
         cnote('n1', 'sq', [0.1, 7.4], 'gap 1: slope 3', None, 17, anchor='start'),
         dot('q1', 'sq', [2, 4], '', None)),
    step('Shrink the gap to 0.5: the line to x = 1.5 has slope 2.5. For x², the average slope over a gap h is always 2x + h, so at x = 1 it is 2 + h.',
         series('s2', 'sq', [[0.6, 0], [2.3, 4.25]], 'purple', dash=True),
         cnote('n2', 'sq', [0.1, 6.3], 'gap 0.5: slope 2.5', 'purple', 17, anchor='start'),
         dot('q2', 'sq', [1.5, 2.25], '', 'purple')),
    step('Let the gap shrink to nothing and the slope settles on exactly 2: the tangent line. That is the derivative, the speedometer reading at one instant: d/dx(x²) = 2x.',
         series('tan', 'sq', [[0.5, 0], [2.3, 3.6]], 'amber', ms=900),
         cnote('n3', 'sq', [0.1, 5.2], 'gap → 0: slope 2', 'amber', 17, anchor='start'),
         dict(pulse='p1')),
    step('The integral goes the other way: add up area. The area under the speed curve 2x from 0 to 1 is a triangle of area 1, which is x² at 1 minus x² at 0. Integrating undoes differentiating.',
         dict(dim='s1'), dict(dim='s2'), dict(dim='q1'), dict(dim='q2'),
         series('d2x', 'sq', [[0, 0], [1.2, 2.4]], 'green', ms=600),
         dict(gap='area', chart='sq', top=[[0, 0], [1, 2]], bot=[[0, 0], [1, 0]], tone='green', op=0.35),
         cnote('al', 'sq', [0.08, 2.4], 'area = 1', 'green', 17, anchor='start')),
    step('Now a Taylor guess. You only know ln(1 + x) at x = 0. First guess: nothing changes, so the value stays 0. Flat.',
         chart('ln', LN, 'Guessing ln(1 + x) from x = 0', [-0.4, 0.8], [-0.55, 0.85], [[0, '0'], [0.5, '0.5']], [[-0.3, '−0.3'], [0, '0'], [0.3, '0.3'], [0.6, '0.6']], pl=36, pr=14, zero=True),
         series('true', 'ln', TRUE, 'blue', ms=1000),
         cnote('lt', 'ln', [0.4, -0.15], 'true ln(1 + x)', 'blue', 17, anchor='start'),
         series('z0', 'ln', [[-0.4, 0], [0.8, 0]], None, width=4, ms=500)),
    step('Second guess: keep going at today\'s slope. The slope of ln(1 + x) at 0 is 1, so the tangent guess is just x. Fine near 0, but it pulls away as the step grows.',
         series('t1', 'ln', [[-0.4, -0.4], [0.8, 0.8]], 'amber', ms=800),
         cnote('l1', 'ln', [0.4, -0.27], '1st order: x', 'amber', 17, anchor='start')),
    step('Third guess: add the bend. The second derivative at 0 is −1, so the correction is −x²/2, and the guess becomes x − x²/2. It hugs the true curve.',
         series('t2', 'ln', SEC, 'green', dash=True, ms=900),
         cnote('l2', 'ln', [0.4, -0.39], '2nd order: x − x²/2', 'green', 17, anchor='start')),
    step('How good? At a 5% step the error is 0.00004. At a 30% step it is 0.007, nearly 200 times bigger. A Taylor guess is local: great for small moves, worse for big ones.',
         dot('h05', 'ln', [0.05, round(log(1.05), 4)], 'h = 0.05', 'purple', dx=8, dy=22, anchor='start'),
         dot('h30', 'ln', [0.3, round(log(1.3), 4)], 'h = 0.30: off by 0.007', 'red', dx=10, dy=24, anchor='start')),
    step('Average ln(1 + R) ≈ R − R²/2 over many periods and you get volatility drag: compound growth g ≈ μ − σ²/2. At 20% volatility that is 0.04 ÷ 2 = 2% a year.',
         box('drag', 10, 642, 186, 106, 'g ≈ μ − σ²/2\n20% vol → 2%', 'amber', size=19)),
    step('An option is a curve too. Delta is its first-order term: with delta 0.60, a $1 move in a $100 stock moves a $4.30 call by about $0.60. Gamma is the bend, the second-order correction for bigger moves.',
         box('dg', 207, 642, 186, 106, 'ΔC ≈ δΔS\n+ ½γ(ΔS)²', 'purple', size=20)),
    step('Merton brought Itô\'s calculus into finance in 1969–71, and in 1973 it gave Black, Scholes and Merton the option price. The second-order term that survives randomness is where volatility enters.',
         box('mer', 404, 642, 186, 106, 'Merton 1969–71\nBSM 1973', 'green', size=19)),
])


BOARD = dict(name='calculus_for_finance', lesson='calculus-for-finance',
             title='Slope, area and a Taylor guess, drawn step by step', cfg=CALC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
