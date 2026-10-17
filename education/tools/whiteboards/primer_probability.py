from ._wb import *
import random
from math import exp, pi, sqrt

# ── Probability & random variables (primer-probability) ───────────────────────
# The lesson's worked example: one fair die, E[X] = 3.5, Var(X) = 91/6 - 3.5^2 = 2.9167,
# sigma = 1.71. Average of n draws: variance Var(X)/n (n = 5: 0.583, sigma 0.76; n = 30: 0.097,
# sigma 0.31), drawn as the lesson's own chart does, as a normal approximation N(3.5, Var/n).
# The running average is ONE simulated run of 200 rolls (random.Random(14)), labelled
# illustrative: it averages 4.6 after 5 rolls and 3.46 after 200.
_r = random.Random(14)
ROLLS = [_r.randint(1, 6) for _ in range(200)]
RUN = []
_s = 0
for i, x in enumerate(ROLLS, 1):
    _s += x
    if i <= 20 or i % 4 == 0: RUN.append([i, round(_s / i, 3)])
A5, A200 = round(sum(ROLLS[:5]) / 5, 2), round(sum(ROLLS) / 200, 2)
SD = sqrt(91 / 6 - 3.5 ** 2)
def _pdf(n): s = SD / sqrt(n); return [[round(1 + i * 0.05, 2), round(exp(-((1 + i * 0.05 - 3.5) / s) ** 2 / 2) / (s * sqrt(2 * pi)), 4)] for i in range(101)]

PROB = dict(w=600, h=890, intro='One fair die, the lesson\'s worked example: its expectation, its spread, what happens when you average many rolls, and the one assumption all of it leans on. Press play, or step through.', steps=[
    step('Meet a random variable: one roll of a fair die. You don\'t know the number yet, but you know the rules: faces 1 to 6, each with probability 1 in 6.',
         icon('die', 'dice', 22, 40, 0.8, 'amber', 'one roll', lsize=18),
         chart('face', (150, 10, 440, 236), 'One roll: chance of each face', [0.4, 6.6], [0, 0.26],
               [[0, '0'], [1 / 6, '1/6']], [[f, str(f)] for f in range(1, 7)], pl=44, pr=12),
         dict(bars='fb', chart='face', data=[[f, 1 / 6, '', 'blue'] for f in range(1, 7)], bw=40, ms=900)),
    step('Its expectation: weight each face by 1/6 and add them up. 21 ÷ 6 = 3.5. You can never roll a 3.5. Expectation is the long-run average, not the most likely roll.',
         series('ex', 'face', [[3.5, 0], [3.5, 0.24]], 'green', dash=True, label='E[X] = 3.5', lat=[3.5, 0.24], ldx=0, ldy=-10)),
    step('Its spread: E[X²] − (E[X])² = 91/6 − 12.25 ≈ 2.92. The square root, σ ≈ 1.71, is how far a roll typically lands from 3.5.',
         series('sd', 'face', [[3.5 - SD, 0.205], [3.5 + SD, 0.205]], 'purple', width=4, ms=700),
         cnote('sdl', 'face', [5.35, 0.205], '±1.71', 'purple', 17, anchor='start')),
    step('Now roll it again and again, and track the running average. This is one simulated run of 200 rolls, for illustration.',
         chart('run', (10, 262, 580, 232), 'Running average of the rolls (one simulated run)', [0, 200], [0.6, 5.6],
               [[1, '1'], [3.5, '3.5'], [5, '5']], [[5, '5'], [50, '50'], [100, '100'], [200, '200']], pl=42, pr=24),
         series('e35', 'run', [[0, 3.5], [200, 3.5]], 'green', dash=True, ms=400),
         series('ra', 'run', RUN, 'blue', ms=1800)),
    step(f'After 5 rolls this run averages {A5}, far from 3.5. The Law of Large Numbers makes no promise about small samples. A 5-trade or 20-trade backtest can sit well away from the truth.',
         dot('a5', 'run', [5, A5], f'5 rolls: {A5}', 'red', dx=10, dy=-4, anchor='start')),
    step(f'By 200 rolls the average is {A200}, close to 3.5. Keep rolling and it gets as close as you like. That is the Law of Large Numbers, and why a casino is calm about any single hand.',
         dot('a200', 'run', [200, A200], f'200 rolls: {A200}', 'green', dx=-6, dy=-26, anchor='end')),
    step('A different question: if you average 5 rolls, or 30, and do it many times, what shape do those averages take? Start with a single roll: flat.',
         chart('clt', (10, 512, 580, 250), 'Shape of the average of n rolls (normal approx.)', [1, 6], [0, 1.4],
               [], [[1, '1'], [2, '2'], [3.5, '3.5'], [5, '5'], [6, '6']], pl=16, pr=16),
         series('n1', 'clt', [[1, 1 / 6], [6, 1 / 6]], 'blue', ms=600, label='1 roll: flat', lat=[6, 1 / 6], ldx=-4, ldy=-14, lanchor='end')),
    step('Average 5 rolls and the averages bunch around 3.5 in a rough bell, with σ ≈ 1.71 ÷ √5 ≈ 0.76.',
         series('n5', 'clt', _pdf(5), 'amber', ms=1100, label='5 rolls', lat=[4.3, 0.29], ldx=8, ldy=-6, lanchor='start')),
    step('Average 30 and the bell is tall and narrow: σ ≈ 1.71 ÷ √30 ≈ 0.31, around the same 3.5. A flat die becomes a bell just by averaging. That is the Central Limit Theorem.',
         series('n30', 'clt', _pdf(30), 'green', ms=1200, label='30 rolls: σ ≈ 0.31', lat=[3.85, 0.68], ldx=10, ldy=0, lanchor='start')),
    step('But both promises assume independent draws. Two coin flips are independent: the first says nothing about the second. Market days are not: a wild day makes another wild day more likely. That is volatility clustering.',
         icon('c1', 'coin', 16, 778, 0.42, 'green'),
         icon('c2', 'coin', 70, 778, 0.42, 'green'),
         note('cl', 66, 846, 'coin flips:\nindependent', 'green', 17),
         icon('f1', 'fire', 196, 776, 0.44, 'red'),
         icon('f2', 'fire', 250, 776, 0.44, 'red'),
         note('fl', 244, 846, 'market days:\nwild days cluster', 'red', 17)),
    step('So "returns are roughly normal" is a starting point to correct, not a fact. It breaks worst in a crisis, exactly when big days come in bunches.',
         box('cav', 372, 774, 218, 52, 'normal = a start', 'amber', size=19)),
    step('And expectation is how prices are made. Bachelier priced options as expected payoffs in 1900; Harrison, Kreps and Pliska showed (1979–81) that every arbitrage-free price is a discounted expectation.',
         box('px', 372, 834, 218, 52, 'price = E[payoff]', 'green', size=19)),
])


BOARD = dict(name='primer_probability', lesson='primer-probability',
             title='One die: its average, its spread, and the bell it becomes', cfg=PROB,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
