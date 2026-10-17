from ._wb import *
from math import log

# ── The Hill estimator (institutional-hill-estimator) ────────────────────────
# Worked example: six sorted daily losses (bps) 187 152 134 121 109 98, k = 5, reference 98:
# log-ratios 0.6461 0.4389 0.3129 0.2108 0.1064, sum 1.7151, mean 0.3430, alpha ≈ 2.92.
# The Hill plot uses the lesson's own simulated top-30 order statistics (Pareto, alpha = 3, n = 300).
V = [187, 152, 134, 121, 109, 98]
LR = [log(v / V[5]) for v in V[:5]]
MEAN = sum(LR) / 5
assert [round(x, 4) for x in LR] == [0.6461, 0.4389, 0.3129, 0.2108, 0.1064]
assert round(MEAN, 4) == 0.343 and round(1 / MEAN, 2) == 2.92
def hill(xs, k): return k / sum(log(xs[i] / xs[k]) for i in range(k))
BYK = [round(hill(V, k), 2) for k in range(1, 6)]
assert BYK == [4.83, 4.35, 3.92, 3.38, 2.92], BYK
OS = [11.17, 8.649, 7.405, 6.365, 6.351, 6.023, 5.907, 4.57, 4.279, 4.083,
      3.982, 3.338, 3.258, 3.183, 3.173, 2.943, 2.861, 2.859, 2.787, 2.661,
      2.597, 2.539, 2.509, 2.494, 2.483, 2.465, 2.416, 2.386, 2.353, 2.27]
HP = [[k, round(hill(OS, k), 3)] for k in range(2, 28)]
assert HP[4][1] == 4.252 and HP[5][1] == 2.182

HILL = dict(w=600, h=720, intro="The lesson's six worked-example losses run through the Hill recipe, then the same recipe at different k. Press play, or step through.", steps=[
    step('Six of the worst daily losses in the lesson\'s toy sample, in basis points, sorted largest first: 187, 152, 134, 121, 109 and 98. How fat is the tail they come from?',
         chart('v', (10, 10, 285, 270), 'Top losses (bps)', [0.4, 6.6], [0, 215],
               [[0, '0'], [100, '100'], [200, '200']], [[k, str(k)] for k in range(1, 7)], pl=48, pr=10),
         dict(bars='vb', chart='v', data=[[k + 1, V[k], str(V[k]), 'blue'] for k in range(6)], bw=26, ms=1100)),
    step('Pick k = 5. The top five feed the estimate. The sixth, 98, is the reference that every one of them is measured against.',
         series('ref', 'v', [[0.5, 98], [6.5, 98]], 'amber', dash=True, ms=600),
         dict(bars='rb', chart='v', data=[[6, 98, '', 'amber']], bw=26, ms=500)),
    step('For each of the top five, ask how many times bigger it is than 98, and take the log. 187 is 1.91 times 98, and its log is 0.65. The five logs are 0.65, 0.44, 0.31, 0.21 and 0.11.',
         chart('lr', (305, 10, 285, 270), 'ln(loss ÷ 98)', [0.4, 5.6], [0, 0.75],
               [[0, '0'], [0.25, '.25'], [0.5, '.50']], [[k, str(k)] for k in range(1, 6)], pl=46, pr=10),
         dict(bars='lb', chart='lr', data=[[k + 1, round(LR[k], 4), f'{LR[k]:.2f}', 'purple'] for k in range(5)], bw=26, ms=1100)),
    step('Average the five logs: 1.715 ÷ 5 = 0.343. A thin tail gives small logs, because the top values are not much bigger than the reference. A fat tail gives big ones.',
         series('avg', 'lr', [[3.55, round(MEAN, 4)], [5.6, round(MEAN, 4)]], 'green', dash=True, ms=700),
         cnote('avgl', 'lr', [5.6, round(MEAN, 4)], 'average 0.343', 'green', 17, anchor='end', dy=-16)),
    step('Flip the average: α̂ = 1 ÷ 0.343 ≈ 2.92. That is the tail index. As a GPD shape it is ξ = 1/α ≈ 0.34: the same fact in another unit.',
         box('res', 10, 296, 580, 58, 'α̂ = 1 ÷ 0.343 ≈ 2.92 · so ξ̂ = 1/α̂ ≈ 0.34', 'green', size=21)),
    step('Why logs? If the tail is a power law, those log-ratios behave like draws from an exponential distribution whose rate is α. The textbook estimate of that rate is one over the average. Hill is exactly that.',
         dict(pulse='avg'), dict(pulse='res')),
    step('Now the catch. Same six numbers, different k. k = 1 gives 4.83, k = 2 gives 4.35, k = 3 gives 3.92, k = 4 gives 3.38 and k = 5 gives 2.92. The answer depends on how many points you trust.',
         chart('bk', (10, 370, 285, 270), 'α̂ at each k', [0.4, 5.6], [0, 5.6],
               [[0, '0'], [2, '2'], [4, '4']], [[k, f'k={k}'] for k in range(1, 6)], pl=40, pr=10),
         dict(bars='kb', chart='bk', data=[[k + 1, BYK[k], f'{BYK[k]:.2f}', 'green' if k == 4 else 'amber'] for k in range(5)], bw=28, ms=1200)),
    step('On a bigger sample it gets worse. The lesson simulates 300 draws with a true tail index of 3. The Hill plot jumps to 4.25 at k = 6, falls to 2.18 at k = 7, then wanders near 2.',
         chart('hp', (305, 370, 285, 270), 'Hill plot, n = 300', [2, 27], [1.5, 4.5],
               [[2, '2'], [3, '3'], [4, '4']], [[2, '2'], [7, '7'], [27, '27']], pl=36, pr=12),
         series('true', 'hp', [[2, 3], [27, 3]], 'green', dash=True, ms=500, label='true 3', lat=[27, 3], lanchor='end', ldy=-12),
         series('hc', 'hp', HP, 'red', ms=1500),
         dot('k6', 'hp', [6, 4.252], '4.25', 'red', dx=14, dy=-2, anchor='start'),
         dot('k7', 'hp', [7, 2.182], '2.18', 'red', dx=10, dy=18, anchor='start')),
    step('Small k: built from a handful of points, so it jumps. Large k: ordinary days leak into the "tail" and bias it. No formula picks the right k, so show the estimate across a range.',
         note('kk', 300, 666, 'small k → noisy · large k → biased', 'amber', 20)),
    step('Hill gives only the exponent, never a loss level at a chosen confidence. Its job is the cheap screen: rank the tails, then build a full GPD fit for the fat ones.',
         note('end', 300, 700, 'a ruler for tail heaviness, not a VaR', 'green', 20)),
])


BOARD = dict(name='institutional_hill_estimator', lesson='institutional-hill-estimator',
             title='The Hill estimator: sort, average, flip', cfg=HILL,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
