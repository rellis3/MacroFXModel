from ._wb import *
import itertools, collections, random
from math import sqrt

# ── Bootstrapping & Monte Carlo (bootstrapping-monte-carlo) ───────────────────
# The lesson's worked example: five trades x = {2, -1, 3, -2, 1} (%), mean 0.6.
# Its three hand-drawn resamples: draws (1,1,2,5,3) -> 1.4, (4,4,5,2,4) -> -1.2, (3,5,3,1,2) -> 1.6.
# The histogram is EXACT: all 5^5 = 3,125 equally likely resamples, so the bootstrap
# distribution of the mean is known without simulation (middle 95%: -1.0 to 2.2; SE 0.83).
# The day strip (calm/storm) is a schematic of clustering. The Monte Carlo fan is
# ILLUSTRATIVE: 12 paths of 40 trades drawn from a normal with the sample's own mean 0.6
# and standard deviation 1.86 (fixed seed), i.e. a model fitted to the same five trades.
X = [2, -1, 3, -2, 1]
N = len(X)
MEAN = sum(X) / N
SD = sqrt(sum((v - MEAN) ** 2 for v in X) / N)          # 1.855 (plug-in, as the bootstrap uses)
SE = round(SD / sqrt(N), 2)                              # 0.83
CNT = collections.Counter(round(sum(t) / N, 1) for t in itertools.product(X, repeat=N))
HIST = [[m, round(100 * c / 5 ** N, 2), '', 'green' if abs(m - 0.6) < 1e-9 else ('blue' if -1.0 <= m <= 2.2 else 'chalk')] for m, c in sorted(CNT.items())]
DRAWS = [(1, 1, 2, 5, 3), (4, 4, 5, 2, 4), (3, 5, 3, 1, 2)]
RM = [round(sum(X[i - 1] for i in d) / N, 1) for d in DRAWS]   # 1.4, -1.2, 1.6

_rng = random.Random(7)
FAN = []
for k in range(12):
    s, p = 0.0, [[0, 0]]
    for t in range(1, 41):
        s += _rng.gauss(MEAN, SD)
        if t % 4 == 0: p.append([t, round(s, 2)])
    FAN.append(p)

def lab(v): return ('+' if v > 0 else '−' if v < 0 else '') + str(abs(v))
XS = [62 + 72 * i for i in range(5)]

HC = (10, 200, 580, 230)
MC = (10, 560, 580, 220)

BOOT = dict(w=600, h=800, intro='Five real trades, reached into again and again: the lesson\'s worked example, then what Monte Carlo does differently. Press play, or step through.', steps=[
    step('One sample: a strategy has closed five trades, returning +2, −1, +3, −2 and +1 percent. The mean is 0.6%. How much could that number have wobbled?',
         box('bag', 10, 14, 400, 100, 'the one sample', 'purple', top=True, size=19),
         *[chip(f'x{i}', XS[i], 76, lab(v), 'purple') for i, v in enumerate(X)],
         box('mean', 430, 30, 160, 70, 'mean', 'green', sub='0.6%', size=19)),
    step(f'Draw five trades from the bag at random, putting each one back. This resample picked trade 4 three times, trade 5 and trade 2: −2, −2, +1, −1, −2. Its mean is {RM[1]}%.',
         *[chip(f'r{i}', XS[i], 150, lab(X[d - 1]), 'red') for i, d in enumerate(DRAWS[1])],
         dict(count='mean', **{'from': 0.6, 'to': RM[1], 'dp': 1, 'suf': '%', 'ms': 900})),
    step(f'Two more resamples from the same five trades come out at {RM[0]}% and {RM[2]}%. Nothing new entered the bag; only which trades repeated changed.',
         dict(hide='r0'), dict(hide='r1'), dict(hide='r2'), dict(hide='r3'), dict(hide='r4'),
         chart('h', HC, 'Mean of a resample: all 3,125 equally likely', [-2.3, 3.3], [0, 11],
               [[0, '0'], [5, '5%'], [10, '10%']], [[-2, '−2'], [-1, '−1'], [0, '0'], [1, '1'], [2, '2'], [3, '3%']], pl=50, pr=14),
         dot('m2', 'h', [RM[1], 0], f'{RM[1]}', 'red', dy=-16),
         dot('m1', 'h', [RM[0], 0], f'{RM[0]}', 'red', dx=-6, dy=-16, anchor='end'),
         dot('m3', 'h', [RM[2], 0], f'{RM[2]}', 'red', dx=6, dy=-16, anchor='start'),
         dict(count='mean', **{'from': RM[1], 'to': 0.6, 'dp': 1, 'suf': '%', 'ms': 600})),
    step('Do it thousands of times. With five trades there are only 3,125 possible resamples, so here is every one of them: a whole spread of means around your 0.6%.',
         dict(hide='m1'), dict(hide='m2'), dict(hide='m3'),
         dict(bars='hb', chart='h', data=HIST, bw=15, ms=1400)),
    step(f'That spread is the error bar. Its standard deviation, the bootstrap standard error, is {SE} points. The middle 95% of resamples run from about −1.0% to 2.2%. No formula for the mean\'s distribution was needed.',
         cnote('ci', 'h', [0.6, 10.4], 'middle 95%: −1.0 to 2.2', 'amber', 18),
         dict(sub='mean', text=f'0.6% ± {SE}')),
    step('But look in the bag. Every one of those 3,125 resamples is made of the same five trades. No resample ever holds a sixth trade, from a market or a regime the strategy has not traded.',
         note('nos', 210, 150, 'no sixth trade, ever', 'red', 19), dict(pulse='bag')),
    step('Market days add a wrinkle: they cluster. Here a stormy run of days sits together. Resample single days and the storms get scattered among calm days, so the error bar comes out too narrow.',
         note('st0', 20, 470, 'real days:', None, 17, anchor='start'),
         *[chip(f'd{i}', 200 + 72 * i, 470, c, 'red' if c == 'S' else 'blue') for i, c in enumerate('CCSSSC')],
         note('st1', 20, 512, 'single days:', None, 17, anchor='start'),
         *[chip(f'e{i}', 200 + 72 * i, 512, c, 'red' if c == 'S' else 'blue') for i, c in enumerate('SCCSCC')]),
    step('The block bootstrap resamples runs of consecutive days instead, say three at a time. A stormy block stays stormy, so the clustering survives and the error bar stays honest.',
         note('st2', 20, 554, 'blocks of 3:', None, 17, anchor='start'),
         *[chip(f'g{i}', 200 + 72 * i, 554, c, 'red' if c == 'S' else 'blue') for i, c in enumerate('SSSCCS')]),
    step('Monte Carlo is a different move: fit a model to the data, here a normal with the trades\' own mean 0.6% and spread 1.86%, then let it generate brand-new paths. Twelve 40-trade paths (illustrative).',
         *[dict(hide=f'{p}{i}') for p in 'deg' for i in range(6)], dict(hide='nos'), dict(hide='st0'), dict(hide='st1'), dict(hide='st2'),
         chart('mc', (10, 450, 580, 330), 'Cumulative return, % (model fitted to the same 5 trades)', [0, 40], [-25, 65],
               [[-20, '−20'], [0, '0'], [20, '20'], [40, '40'], [60, '60']], [[0, '0'], [20, '20'], [40, '40 trades']], zero=True, pl=48, pr=16),
         *[series(f'f{i}', 'mc', p, 'amber', ms=900) for i, p in enumerate(FAN)]),
    step('Every path inherits the model\'s settings, and those came from the same five trades. If tomorrow\'s market has a different mean or bigger swings, all twelve paths, or ten thousand, share the same blind spot.',
         dict(pulse='mc'), note('fit', 300, 142, 'the model\'s settings came from the same five trades', 'red', 18)),
    step('So both tools answer: given what I already have, what range of outcomes is consistent with it? A fair question for setting expectations. Whether the signal works on unseen data needs data it has never touched.',
         note('end', 300, 178, 'an error bar, not an out-of-sample test', 'green', 20)),
])


BOARD = dict(name='bootstrapping_monte_carlo', lesson='bootstrapping-monte-carlo', title='The bootstrap and Monte Carlo, drawn step by step', cfg=BOOT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=5)
