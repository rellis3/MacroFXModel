from ._wb import *
from math import exp

# ── Time value of money: a coin today vs the same coin later (time-value-of-money) ──
# The lesson's numbers: $100 now or $100 in a year; at 5% today's $100 becomes $105, so $105 in a
# year is worth exactly $100 today. Worked example: $1,000 at 6% for 5 years → 1,000 × 1.06^5 =
# $1,338.23 (year by year 1,060.00 / 1,123.60 / 1,191.02 / 1,262.48 / 1,338.23); DF = 1/1.06^5 =
# 0.74726 and 1,338.23 × 0.74726 = $1,000.00; continuous 1,000 × e^0.3 = $1,349.86, $11.63 more.
# Simple interest 1,000 × (1 + 0.06 × 5) = $1,300 is our arithmetic from the lesson's PV(1+rt)
# contrast (compounding adds $38.23). Discount-factor chart: e^(−rt) at 3% and 10% (the lesson's
# chart): 20 years → 0.549 vs 0.135. USD/JPY: spot 150.00, USD 5%, JPY 0.1%, 3 months:
# 150 × 1.00025 / 1.0125 ≈ 148.19 (≈ −181 points).
BAL = [round(1000 * 1.06 ** t, 2) for t in range(6)]
assert BAL == [1000.0, 1060.0, 1123.6, 1191.02, 1262.48, 1338.23]
DF5 = 1 / 1.06 ** 5
assert round(DF5, 5) == 0.74726 and round(1000 * 1.06 ** 5 * DF5, 6) == 1000
CONT = 1000 * exp(0.3)
assert round(CONT, 2) == 1349.86 and round(CONT - BAL[5], 2) == 11.63
FWD = 150 * 1.00025 / 1.0125
assert round(FWD, 2) == 148.19
assert round(exp(-0.6), 3) == 0.549 and round(exp(-2), 3) == 0.135

def _lab(v): return f'${v:,.0f}'
BC = (10, 226, 580, 286)          # balance chart
DFC = (10, 740, 580, 210)         # discount-factor chart
def _px(t): return 10 + 70 + (t + 0.5) / 6 * (580 - 70 - 14)    # x of year t on the balance chart

TVM = dict(w=600, h=962, intro='One coin today, the same coin later, and the arithmetic that moves money across time in both directions. Press play, or step through.', steps=[
    step('Someone offers you $100 right now, or a guaranteed $100 exactly one year from today. Same coin, same number. Which is worth more?',
         icon('c0', 'coin', 34, 24, 0.62, 'green', '$100 today', sym='$', lsize=18),
         icon('clk', 'clock', 420, 30, 0.46, 'chalk'),
         icon('c1', 'coin', 480, 24, 0.62, 'amber', '$100 in a year', sym='$', lsize=18),
         note('q', 300, 54, '?', 'chalk', 30)),
    step('Take it now, because of what it can do while you wait. Put it in a bank paying 5% and in a year it has become $105. The person who waited has $100: poorer by $5 for the same promise.',
         dict(hide='q'),
         icon('bank', 'bank', 262, 12, 0.6, 'blue', 'bank pays 5%', sym='$', lsize=18),
         chip('dep', 65, 58, '$100', 'green'),
         move('dep', 292, 50, 1000), dict(hide='dep'),
         chip('out', 292, 50, '$105', 'green'),
         move('out', 530, 140, 900),
         note('vs', 300, 176, 'in a year: $105 beats $100', 'green', 18)),
    step('Now run it backwards. If $100 today grows into $105 in a year, then $105 arriving in a year is worth exactly $100 today. That is discounting: the same formula, run in reverse.',
         dict(hide='out'), dict(hide='vs'),
         dict(line='back', points=[[520, 150], [80, 150], [96, 140], [80, 150], [96, 160]], tone='purple', width=3, ms=1000),
         note('bk', 300, 176, '$105 in a year ÷ 1.05 = $100 today', 'purple', 18)),
    step('The lesson\'s worked example: $1,000 at 6% a year. After year one the balance has grown by its interest, $60, to $1,060.',
         chart('bc', BC, 'Your $1,000 at 6%', [-0.5, 5.5], [0, 1500], [[0, '$0'], [1000, '$1,000']],
               [[0, 'today'], [1, 'yr 1'], [2, 'yr 2'], [3, 'yr 3'], [4, 'yr 4'], [5, 'yr 5']], pl=70, pr=14),
         dict(bars='b01', chart='bc', data=[[0, BAL[0], _lab(BAL[0]), 'blue'], [1, BAL[1], _lab(BAL[1]), 'green']], bw=44, ms=900),
         chip('fw1', _px(0), 534, '× 1.06', 'green'), move('fw1', _px(1), 534, 800)),
    step('Year two pays 6% on the whole $1,060, interest included: $63.60. Interest earns interest, every year. After five years: 1,000 × 1.06⁵ = $1,338.23.',
         move('fw1', _px(5), 534, 1400),
         dict(bars='b25', chart='bc', data=[[t, BAL[t], _lab(BAL[t]), 'green'] for t in range(2, 6)], bw=44, ms=1400),
         box('fv', 10, 558, 280, 76, 'FV = 1,000 × 1.06⁵', 'green', sub='$1,000.00', size=19),
         dict(count='fv', **{'from': 1000, 'to': 1338.23, 'dp': 2, 'pre': '$', 'ms': 1300})),
    step('Compare simple interest, which pays 6% on the original $1,000 only: a straight line to $1,300. Compounding adds $38.23 on top, and the gap keeps widening the longer you wait.',
         series('simp', 'bc', [[0, 1000], [5, 1300]], 'amber', dash=True, ms=800),
         dot('s5', 'bc', [5, 1300], 'simple: $1,300', 'amber', dx=-34, dy=-36, anchor='end')),
    step('Compounding more often helps too. The same stated 6%, compounded continuously, gives 1,000 × e^0.3 = $1,349.86: $11.63 more, purely from how often interest is added.',
         box('ct', 310, 558, 280, 76, 'same 6%, continuously\n1,000 × e^0.3', 'purple', sub='$1,338.23', size=19),
         dict(count='ct', **{'from': 1338.23, 'to': 1349.86, 'dp': 2, 'pre': '$', 'ms': 1100})),
    step('Now walk back along the timeline. Multiply $1,338.23 by the discount factor 1 ÷ 1.06⁵ = 0.74726 and you land back on $1,000, today. Present value is future value run backwards.',
         dict(hide='fw1'),
         chip('bk1', _px(5), 534, '× 0.74726', 'purple'),
         move('bk1', _px(0) + 22, 534, 1500),
         box('pv', 10, 648, 280, 76, 'PV = 1,338.23 × 0.74726', 'purple', sub='$1,338.23', size=19),
         dict(count='pv', **{'from': 1338.23, 'to': 1000.0, 'dp': 2, 'pre': '$', 'ms': 1300})),
    step('The further away the money, the less it is worth today, and a higher rate shrinks it faster. A dollar due in 20 years is worth about 55 cents today at 3%, but only about 13.5 cents at 10%.',
         chart('df', DFC, 'What $1 due later is worth today', [0, 30], [0, 1.05], [[0, '0'], [0.5, '0.5'], [1, '1.0']],
               [[0, 'now'], [10, '10'], [20, '20'], [30, '30 yrs']], pl=50, pr=20),
         series('d3', 'df', [[t, round(exp(-0.03 * t), 4)] for t in range(31)], 'blue', label='r = 3%', lat=[30, exp(-0.9)], ldx=-2, ldy=-14, lanchor='end', ms=1100),
         series('d10', 'df', [[t, round(exp(-0.10 * t), 4)] for t in range(31)], 'red', label='r = 10%', lat=[30, exp(-3)], ldx=-2, ldy=-14, lanchor='end', ms=1100),
         dot('p3', 'df', [20, exp(-0.6)], '0.549', 'blue', dx=0, dy=-16),
         dot('p10', 'df', [20, exp(-2)], '0.135', 'red', dx=0, dy=-16)),
    step('The same idea, run once per currency, prices an FX forward. USD/JPY spot 150.00, dollars earning 5%, yen 0.1%: the fair 3-month forward is 150 × 1.00025 ÷ 1.0125 ≈ 148.19. Not a forecast; just interest, so nobody gets free money.',
         box('fx', 310, 648, 280, 76, 'USD/JPY, 3 months\n150 × 1.00025 ÷ 1.0125', 'amber', sub='150.00', size=18),
         dict(count='fx', **{'from': 150, 'to': 148.19, 'dp': 2, 'ms': 1200})),
])


BOARD = dict(name='tvm', lesson='time-value-of-money', title='A coin today vs the same coin later', cfg=TVM,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>\n    <h3>Recompute the future value',
             deck_after=6)
