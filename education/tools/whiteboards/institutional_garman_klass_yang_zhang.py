from ._wb import *
from math import log, sqrt

# ── Garman-Klass & Yang-Zhang (institutional-garman-klass-yang-zhang) ─────────
# The lesson's eight synthetic EURUSD-style bars (prior close 1.0815, a 38-pip gap into day 5).
# The four annualised readings are recomputed here with the lesson's own formulas and checked
# against its printed 3.08 / 3.56 / 3.81 / 4.27%. The 25-days-vs-5-days figure is the lesson's
# own Monte Carlo result.
PREV = 1.0815
O = [1.0820, 1.0833, 1.0858, 1.0821, 1.0843, 1.0828, 1.0833, 1.0819]
H = [1.0845, 1.0858, 1.0866, 1.0833, 1.0851, 1.0847, 1.0844, 1.0829]
L = [1.0808, 1.0820, 1.0826, 1.0791, 1.0798, 1.0812, 1.0803, 1.0795]
C = [1.0838, 1.0851, 1.0828, 1.0805, 1.0822, 1.0840, 1.0811, 1.0817]
A = sqrt(252) * 100

def _var(x):
    m = sum(x) / len(x); return sum((v - m) ** 2 for v in x) / (len(x) - 1)
CC = sqrt(_var([log(C[i] / C[i - 1]) for i in range(1, 8)])) * A
PK = sqrt(sum(log(h / l) ** 2 / (4 * log(2)) for h, l in zip(H, L)) / 8) * A
GK = sqrt(sum(max(0.5 * log(h / l) ** 2 - (2 * log(2) - 1) * log(c / o) ** 2, 0) for o, h, l, c in zip(O, H, L, C)) / 8) * A
RS = sum(log(h / c) * log(h / o) + log(l / c) * log(l / o) for o, h, l, c in zip(O, H, L, C)) / 8
K = 0.34 / (1.34 + 9 / 7)
ON = _var([log(O[i] / (PREV if i == 0 else C[i - 1])) for i in range(8)])
OC = _var([log(c / o) for o, c in zip(O, C)])
YZ = sqrt(ON + K * OC + (1 - K) * RS) * A
VALS = [round(v, 2) for v in (CC, PK, GK, YZ)]
assert VALS == [3.08, 3.56, 3.81, 4.27], VALS

def _candle(i, dim=False):
    x = i + 1; up = C[i] >= O[i]; tone = 'green' if up else 'red'
    return [series(f'w{i}', 'px', [[x, L[i]], [x, H[i]]], tone, ms=250),
            dict(gap=f'k{i}', chart='px', top=[[x - 0.28, max(O[i], C[i])], [x + 0.28, max(O[i], C[i])]],
                 bot=[[x - 0.28, min(O[i], C[i])], [x + 0.28, min(O[i], C[i])]], tone=tone, op=0.55)]

PX = (10, 14, 580, 290)
GKYZ = dict(w=600, h=690, intro="The lesson's eight EURUSD-style daily bars, read four ways. Watch what each estimator looks at, and what it misses. Press play, or step through.", steps=[
    step('Eight daily bars from the lesson. Each bar has four prices: where it opened, the highest and lowest it reached, and where it closed.',
         chart('px', PX, 'Eight daily bars (synthetic EURUSD)', [0.3, 8.7], [1.0782, 1.0893],
               [[1.08, '1.0800'], [1.085, '1.0850']], [[i, str(i)] for i in range(1, 9)], pl=66, pr=10),
         *[op for i in range(8) for op in _candle(i)]),
    step('Close-to-close volatility looks at one price a day: the close. Seven returns between eight closes. It reads 3.08% a year.',
         *[dot(f'c{i}', 'px', [i + 1, C[i]], '', 'amber') for i in range(8)],
         series('cl', 'px', [[i + 1, C[i]] for i in range(8)], 'amber', dash=True, ms=900)),
    step('Parkinson looks at how far each day travelled, high to low, and ignores the open and close. Day 4, for example, ranged 42 pips. About 5 times as efficient as closes alone: 3.56%.',
         dict(dim='cl'),
         cnote('r4', 'px', [4, 1.0833], '42 pips', 'blue', 17, anchor='middle', dx=0, dy=-14),
         dict(pulse='w3')),
    step('Garman-Klass adds where each bar opened and closed, weighted so the noise is as small as possible. About 7.4 times as efficient: 3.81%.',
         dict(pulse='k0'), dict(pulse='k5')),
    step('But look between day 4 and day 5. Day 4 closed at 1.0805. Day 5 opened at 1.0843: a 38-pip gap, like a weekend headline. It happened between two bars.',
         series('gp', 'px', [[4.15, C[3]], [4.85, O[4]]], 'amber', dash=True, ms=700),
         cnote('gpl', 'px', [4.5, 1.0879], '38-pip gap', 'amber', 18, anchor='middle')),
    step('Parkinson and Garman-Klass only look inside each bar, so the gap is invisible to both. That is Garman-Klass\'s real blind spot: it assumes no gap between bars.',
         cnote('eye', 'px', [5.5, 1.0879], '← blind spot', 'red', 18, anchor='start')),
    step('Yang-Zhang adds an overnight term: the spread of the close-to-open jumps. It also uses Rogers-Satchell\'s range measure, which a trending day does not fool.',
         box('yz', 10, 324, 580, 60, 'Yang-Zhang = overnight + k · open-close + (1 − k) · Rogers-Satchell', 'green', size=17)),
    step('For an 8-day window the weight k = 0.34 / (1.34 + 9/7) ≈ 0.13. Put together, the four readings on the same eight bars:',
         chart('rd', (10, 400, 360, 210), 'Annualised σ, same 8 bars (%)', [0.4, 4.6], [0, 5],
               [[0, '0'], [2, '2'], [4, '4']], [[1, 'close'], [2, 'Park.'], [3, 'GK'], [4, 'YZ']], pl=34, pr=6),
         dict(bars='rb', chart='rd', data=[[1, VALS[0], f'{VALS[0]:.2f}', 'amber'], [2, VALS[1], f'{VALS[1]:.2f}', 'blue'],
                                          [3, VALS[2], f'{VALS[2]:.2f}', 'purple'], [4, VALS[3], f'{VALS[3]:.2f}', 'green']], bw=40, ms=1200)),
    step('Yang-Zhang reads highest, 4.27%, because it is the only one that saw day 5\'s gap.',
         dict(pulse='yz'), dict(pulse='gp')),
    step('Why bother: in the lesson\'s own simulation, close-to-close needed about 25 days of data to be as precise as the range estimators were after just 5.',
         box('days', 390, 420, 200, 110, 'same precision:\nclose-close 25 days\nrange-based 5 days', 'blue', size=17)),
    step('One limit for all four: they measure how much bars already moved. Turning that into tomorrow\'s forecast is a separate job.',
         note('end', 300, 660, 'a measurement, not a forecast', 'amber', 20)),
])


BOARD = dict(name='institutional_garman_klass_yang_zhang', lesson='institutional-garman-klass-yang-zhang',
             title='Four ways to read a daily bar', cfg=GKYZ,
             before='  <div class="tl-chart interactive">\n    <div class="tl-chart-label">A synthetic 8-day EURUSD-style series',
             deck_after=8)
