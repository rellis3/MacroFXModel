from ._wb import *
from math import sqrt

# ── Existence and uniqueness of SDE solutions (sde-existence-uniqueness) ─────
# Numbers are the lesson's own: GBM mu 0.08, sigma 0.20 → K = 0.28; at x = 100,
# |mu x| + |sigma x| = 28 ≤ K(1 + |x|) = 28.28. Square root: slope ratio sigma/√eps (computed
# below for eps = 0.01, 0.0001, 0.000001). ODE examples from the lesson: dx/dt = √|x|, x(0) = 0,
# solved by x ≡ 0 and by x = t²/4; dX/dt = X², X(0) = 1, solved by X = 1/(1 − t), which blows up at t = 1.
EPS = [0.01, 0.0001, 0.000001]
RATIO = [round(1 / sqrt(e)) for e in EPS]          # 10, 100, 1000 (in units of sigma)
NONU = [[t / 4, round((t / 4) ** 2 / 4, 4)] for t in range(0, 17)]   # x = t²/4 on [0, 4]
BLOW = [[t, round(1 / (1 - t), 3)] for t in [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.88, 0.9, 0.92, 0.94, 0.95]]
CH = (10, 250, 580, 350)
TOP = ['sde', 'lip', 'grow']

SDEEU = dict(w=600, h=620, intro='Two conditions decide whether an SDE has exactly one solution. Here is each one passing, then each one failing, with the lesson\'s own examples. Press play, or step through.', steps=[
    step('Every model in this sequence is an SDE: drift plus noise. Writing one down does not prove that any process satisfies it, or that only one does.',
         box('sde', 100, 14, 400, 70, 'dX = μ(X,t) dt + σ(X,t) dW', 'blue', size=21)),
    step('Condition one, Lipschitz: the coefficients cannot change faster than a fixed multiple K of the change in level. No infinitely steep hills. It rules out two solutions from one start.',
         box('lip', 20, 110, 270, 100, 'Lipschitz\nslope ≤ K', 'green', size=20)),
    step('Condition two, linear growth: far out, the coefficients grow no faster than a straight line. No unlimited horsepower. It rules out a race to infinity before your horizon.',
         box('grow', 310, 110, 270, 100, 'linear growth\n≤ K(1 + |x|)', 'amber', size=20)),
    step('GBM passes both. With 8% drift and 20% volatility its coefficients are 0.08x and 0.20x: straight lines, slope K = 0.28 everywhere. At x = 100 they add to 28, under the bound 0.28 × 101 = 28.28.',
         chart('g', CH, 'GBM coefficients: straight lines, slope K = 0.28', [0, 100], [0, 30],
               [[0, '0'], [10, '10'], [20, '20'], [30, '30']], [[0, 'x = 0'], [50, '50'], [100, '100']], pl=50, pr=30),
         series('sum', 'g', [[0, 0], [100, 28]], 'green', ms=1200, label='|μx| + |σx| = 28', lat=[100, 28], ldx=-6, ldy=-16, lanchor='end', lsize=16),
         series('bound', 'g', [[0, 0.28], [100, 28.28]], 'amber', dash=True, ms=900),
         dict(pulse='lip'), dict(pulse='grow')),
    step('Now the square root behind the CIR rate model, σ√x. Near zero it rises straight up. Its slope between 0 and ε is σ ÷ √ε: 10σ at ε = 0.01, 100σ at 0.0001, 1000σ at 0.000001. No fixed K can bound that.',
         *[dict(hide=i) for i in ['g', 'sum', 'bound']],
         chart('sq', CH, 'Slope of √x between 0 and ε (× σ)', [0.4, 3.6], [0, 1100],
               [[0, '0'], [500, '500'], [1000, '1000']], [[1, 'ε = 0.01'], [2, '0.0001'], [3, '0.000001']], pl=58, pr=16),
         dict(bars='sqb', chart='sq', data=[[i + 1, r, f'{r}σ', 'amber'] for i, r in enumerate(RATIO)], bw=70, ms=1200),
         dict(cross='lip')),
    step('Why it matters: a vertical slope is what lets two solutions share a start. In the ODE dx/dt = √|x| from x = 0, both x = 0 forever and x = t²/4 satisfy the equation. Nothing picks one.',
         *[dict(hide=i) for i in ['sq', 'sqb']],
         chart('nu', CH, 'dx/dt = √|x|, x(0) = 0: two solutions', [0, 4], [0, 4.4],
               [[0, '0'], [2, '2'], [4, '4']], [[0, '0'], [2, 't = 2'], [4, '4']], pl=46, pr=16),
         series('z', 'nu', [[0, 0], [4, 0]], 'blue', ms=900, label='x = 0', lat=[3.6, 0], ldy=-16, lsize=16),
         series('p', 'nu', NONU, 'amber', ms=1200, label='x = t²/4', lat=[4, 4], ldx=-8, ldy=0, lanchor='end', lsize=16)),
    step('CIR is still a standard model. Yamada and Watanabe (1971) proved a weaker theorem that covers exactly this square-root shape. Failing Lipschitz means use the more careful theorem, not drop the model.',
         note('yw', 300, 232, 'square root: Yamada–Watanabe (1971) covers it', 'green', 19)),
    step('Break growth instead and it is worse. dX/dt = X², starting at 1, has the exact solution X = 1/(1 − t): 2 at t = 0.5, 10 at t = 0.9, 20 at t = 0.95.',
         *[dict(hide=i) for i in ['nu', 'z', 'p', 'yw']],
         chart('bl', CH, 'dX/dt = X², X(0) = 1: X = 1/(1 − t)', [0, 1.05], [0, 22],
               [[0, '0'], [10, '10'], [20, '20']], [[0, '0'], [0.5, '0.5'], [1, 't = 1']], pl=46, pr=16),
         series('bx', 'bl', BLOW, 'red', ms=1600),
         dot('b9', 'bl', [0.9, 10], '10', 'red', dx=-10, dy=0, anchor='end'),
         dot('b95', 'bl', [0.95, 20], '20', 'red', dx=-10, dy=0, anchor='end'),
         dict(cross='grow')),
    step('At t = 1 it reaches infinity, and after that there is no solution at all, for any method. Not hard to simulate: the road itself ends.',
         series('wall', 'bl', [[1, 0], [1, 22]], 'red', dash=True, ms=700, label='no solution past t = 1', lat=[1, 22], ldx=-8, ldy=8, lanchor='end', lsize=16)),
    step('On a desk this is a pre-flight check. Heston\'s variance is a square-root process too, and Heston parameters fitted to real smiles often break the Feller condition, which decides whether the variance can reach zero. That is why schemes such as Andersen\'s (2008) exist.',
         *[dict(hide=i) for i in TOP],
         box('desk', 60, 30, 480, 120, 'new model?\n1. one solution?  2. stays positive?\n3. finite moments?', 'purple', size=19)),
    step('The rule: before trusting a simulation, check that the equation has exactly one solution to simulate. A clean run proves nothing about that.',
         note('rule', 300, 205, 'one solution first, then simulate', 'green', 22)),
])


BOARD = dict(name='sde_existence_uniqueness', lesson='sde-existence-uniqueness',
             title='When an SDE has one solution, none or many, step by step', cfg=SDEEU,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
