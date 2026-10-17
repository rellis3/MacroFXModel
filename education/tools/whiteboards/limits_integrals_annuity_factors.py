from ._wb import *

# ── Limits, integrals & annuity factors (limits-integrals-annuity-factors) ────
# The lesson's worked example: $1 a year for 5 years at 4%. Discount factors 0.9615 ... 0.8219,
# A(5, 4%) = 4.4518, perpetuity limit 1/0.04 = 25, D_mod = 2.8092 years, exact slope
# A'(0.04) = -12.506; secant over h = 400bp = -11.48 (the lesson's chart readout).
# DV01 hedge: $10m short, D_mod 8.50 -> $8,500/bp; illustrative futures DV01 $85 -> 100 contracts.
def A(n, y): return (1 - (1 + y) ** -n) / y
DF = [round(1.04 ** -t, 4) for t in range(1, 6)]
PERP = [[n, round(A(n, 0.04), 3)] for n in range(1, 151)]
PRICE = [[round(y / 1000, 4), round(A(5, y / 1000), 4)] for y in range(30, 101, 5)]   # y from 3% to 10%
A4, A8 = A(5, 0.04), A(5, 0.08)
SLOPE = -12.506
TAN = [[0.03, round(A4 + SLOPE * (0.03 - 0.04), 4)], [0.10, round(A4 + SLOPE * (0.10 - 0.04), 4)]]
SEC_S = (A8 - A4) / 0.04                                     # -11.48
SEC = [[0.03, round(A4 + SEC_S * (0.03 - 0.04), 4)], [0.10, round(A4 + SEC_S * (0.10 - 0.04), 4)]]

LIM = dict(w=600, h=770, intro='One dollar a year for five years, at 4%. Watch it become one number, then a limit, then a duration. Press play, or step through.', steps=[
    step('Start with a stream: $1 at the end of each of the next five years. The yield is 4%. What is the whole stream worth today?',
         *[icon(f'c{t}', 'coin', 18 + (t - 1) * 72, 8, 0.44, 'amber', f'yr {t}', sym='$', lsize=16) for t in range(1, 6)]),
    step('Bring each dollar back to today by dividing by 1.04 once for every year you wait. Year 1 is worth 0.9615, year 5 only 0.8219. Each bar is the one before, divided by 1.04: a geometric series.',
         chart('df', (10, 92, 360, 228), 'Each $1, worth today', [0.4, 5.6], [0, 1.18], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[t, str(t)] for t in range(1, 6)], pl=40, pr=12),
         dict(bars='dfb', chart='df', data=[[t, DF[t - 1], f'{DF[t - 1]:.2f}', 'blue'] for t in range(1, 6)], bw=34, ms=1300)),
    step('Add the five bars: 0.9615 + 0.9246 + 0.8890 + 0.8548 + 0.8219 = 4.4518. That one number is the annuity factor. Multiply any level payment by it to get its value today.',
         box('A', 388, 112, 202, 92, 'annuity factor\nA(5, 4%)', 'purple', sub='0', size=18),
         dict(count='A', **{'from': 0, 'to': 4.4518, 'dp': 4, 'ms': 1300})),
    step('No need to add terms one by one. Multiply the series by 1.04, subtract the original, and every middle term cancels: A = (1 − 1.04⁻⁵) ÷ 0.04 = 4.4518. Same number, in three lines of algebra.',
         note('cf', 489, 238, 'A = (1 − 1.04⁻⁵) ÷ 0.04', 'purple', 18),
         note('cf2', 489, 270, '= 0.17807 ÷ 0.04', 'purple', 18)),
    step('Now let the stream run longer at the same 4%. Ten years is worth 8.11, twenty years 13.59, fifty years 21.48. Each extra year adds a smaller discounted dollar.',
         chart('perp', (10, 334, 580, 196), 'Value of $1 a year, n years, at 4%', [0, 150], [0, 28],
               [[0, '0'], [25, '25']], [[0, '0'], [50, '50'], [100, '100'], [150, '150']], pl=40, pr=16),
         series('pc', 'perp', PERP, 'purple', ms=1800),
         dot('p10', 'perp', [10, 8.111], '10 yrs: 8.11', 'blue', dx=8, dy=4, anchor='start'),
         dot('p50', 'perp', [50, 21.482], '50 yrs: 21.48', 'blue', dx=4, dy=22, anchor='start')),
    step('Push n towards infinity and (1.04)⁻ⁿ shrinks to zero, so the value closes in on 1 ÷ 0.04 = 25, the value of $1 a year forever. 150 years already gives 24.93. It never crosses 25: that approach without arrival is a limit.',
         series('pl', 'perp', [[0, 25], [150, 25]], 'green', dash=True, ms=700, label='perpetuity 1/y = 25', lat=[150, 25], ldx=-4, ldy=-14, lanchor='end'),
         dot('p150', 'perp', [150, 24.930], '', 'green')),
    step('Now hold the five years fixed and move the yield instead. The value falls as the yield rises, along a gently curved line. At 4% it is 4.4518.',
         chart('py', (10, 546, 580, 214), 'A(5, y) as the yield moves', [0.03, 0.10], [3.65, 4.62],
               [[4, '4.0'], [4.5, '4.5']], [[0.04, '4%'], [0.06, '6%'], [0.08, '8%'], [0.10, '10%']], pl=48, pr=16),
         series('pyc', 'py', PRICE, 'chalk', ms=1400),
         dot('y4', 'py', [0.04, round(A4, 4)], '4.45 at 4%', 'amber', dx=8, dy=-16, anchor='start')),
    step('Join 4% to 8%, a 400 basis-point gap, with a straight line. Its slope, −11.48, is the average fall in value per unit of yield over that gap. Honest, but not yet the derivative.',
         series('sec', 'py', SEC, 'blue', ms=900),
         dot('y8', 'py', [0.08, round(A8, 4)], 'secant: −11.48', 'blue', dx=-8, dy=-20, anchor='end')),
    step('Shrink the gap. As it heads to zero the line rotates onto the tangent, whose slope is the exact derivative: −12.51. Bump ±10bp and reprice, and you already get −12.506.',
         dict(dim='sec'), dict(dim='y8'),
         series('tan', 'py', TAN, 'purple', dash=True, ms=800),
         note('tl', 330, 724, 'tangent: −12.51', 'purple', 18)),
    step('Divide by the value and flip the sign: 12.506 ÷ 4.4518 = 2.809 years. That is modified duration: not a separate formula, just this annuity, differentiated.',
         box('D', 388, 240, 202, 76, 'modified duration', 'green', sub='0', size=18),
         dict(hide='cf'), dict(hide='cf2'),
         dict(count='D', **{'from': 0, 'to': 2.809, 'dp': 3, 'suf': ' years', 'ms': 1200})),
    step('Desks put it to work as DV01. A $10 million short in a note with duration 8.50 moves $8,500 per basis point. At an illustrative $85 per futures contract, buy 100 contracts to go flat.',
         box('dv', 388, 112, 202, 92, 'DV01 hedge', 'amber', sub='8,500 ÷ 85 = 100', size=18),
         dict(hide='A')),
    step('One caution: the tangent is straight and the curve is not. Far from 4% the two pull apart, so a duration hedge is exact only for small moves. The bend that duration ignores is convexity.',
         dict(pulse='tan'), dict(pulse='pyc')),
])


BOARD = dict(name='limits_integrals_annuity_factors', lesson='limits-integrals-annuity-factors',
             title='From a stream of dollars to a limit and a duration', cfg=LIM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=10)
