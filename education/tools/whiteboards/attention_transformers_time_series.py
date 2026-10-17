from ._wb import *
from math import exp, sqrt

# ── Attention vs the recurrent relay (attention-transformers-time-series) ─────
# Numbers: the lesson's worked example. Query q = [1, 0], d_k = 2, keys/values
# t-2: k [1,0] v [2,0]; t-1: k [0,1] v [0,2]; t: k [1,1] v [1,1]. Raw scores 1, 0, 1.
# Weights and outputs below are computed, not typed.
V = [[2, 0], [0, 2], [1, 1]]


def _attn(scores, dk=2):
    e = [exp(s / sqrt(dk)) for s in scores]
    w = [x / sum(e) for x in e]
    out = [sum(w[i] * V[i][j] for i in range(3)) for j in range(2)]
    return w, out


W1, O1 = _attn([1, 0, 1])   # 0.401 0.198 0.401 -> [1.203, 0.797]
W3, O3 = _attn([3, 0, 1])   # 0.734 0.088 0.178 -> [1.646, 0.354]
f3 = lambda x: f'{x:.3f}'

ATTN = dict(w=600, h=830, intro='The lesson\'s worked example: one query looking back over three past days. First the old way, a relay; then attention, which looks at every day at once. Press play, or step through.', steps=[
    step('The old way. A recurrent network reads a series one day at a time. Each day\'s memory is built from the day before, so day 4 must wait for day 3, which waits for day 2.',
         box('h1', 20, 30, 100, 60, 'day 1', 'chalk', sub='h₁', size=19),
         box('h2', 165, 30, 100, 60, 'day 2', 'chalk', sub='h₂', size=19),
         box('h3', 310, 30, 100, 60, 'day 3', 'chalk', sub='h₃', size=19),
         box('h4', 455, 30, 100, 60, 'day 4', 'chalk', sub='h₄', size=19),
         arrow('h1', 'h2'), arrow('h2', 'h3'), arrow('h3', 'h4')),
    step('News from day 1 reaches day 4 only by being retold at every step, squeezed a little each time: a game of telephone. And training cannot run the days in parallel.',
         chip('news', 70, 118, 'day-1 news', 'amber'),
         move('news', 505, 118, 1800),
         note('relay', 300, 150, 'three retellings, one after another', 'red', 18)),
    step('Attention throws out the line. Today\'s query, q = [1, 0], looks directly at every past day at once. Each day offers a key (what it contains) and a value (what it would hand over).',
         dict(dim='h1'), dict(dim='h2'), dict(dim='h3'), dict(dim='h4'), dict(hide='news'), dict(hide='relay'),
         box('q', 200, 176, 200, 62, 'query (today)', 'purple', sub='q = [1, 0]', size=19),
         box('k1', 20, 300, 160, 80, 't−2\nkey [1, 0]', 'blue', sub='value [2, 0]', size=18),
         box('k2', 220, 300, 160, 80, 't−1\nkey [0, 1]', 'blue', sub='value [0, 2]', size=18),
         box('k3', 420, 300, 160, 80, 't\nkey [1, 1]', 'blue', sub='value [1, 1]', size=18),
         arrow('q', 'k1', tone='purple'), arrow('q', 'k2', tone='purple'), arrow('q', 'k3', tone='purple')),
    step('Compare the query with each key by a dot product. A bigger number means a better match. The raw scores are 1, 0 and 1: days t−2 and t match, day t−1 does not.',
         note('z1', 100, 400, 'score 1', 'purple', 19),
         note('z2', 300, 400, 'score 0', 'purple', 19),
         note('z3', 500, 400, 'score 1', 'purple', 19)),
    step('Scale the scores down by the square root of the key size. Here d_k = 2, so divide by about 1.414: the scores become 0.707, 0 and 0.707. This keeps softmax from saturating when the vectors are long.',
         dict(hide='z1'), dict(hide='z2'), dict(hide='z3'),
         note('s1', 100, 400, '÷ √2 = 0.707', 'purple', 19),
         note('s2', 300, 400, '0', 'purple', 19),
         note('s3', 500, 400, '÷ √2 = 0.707', 'purple', 19)),
    step(f'Softmax turns the scaled scores into weights that are never negative and add up to 1: {f3(W1[0])}, {f3(W1[1])} and {f3(W1[2])}. The two matching days get about twice the weight of the one that missed.',
         chart('wch', (10, 424, 290, 200), 'softmax weights', [0.4, 3.6], [0, 1], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[1, 't−2'], [2, 't−1'], [3, 't']], pl=46),
         dict(bars='wb1', chart='wch', data=[[1, round(W1[0], 3), f3(W1[0]), 'blue'], [2, round(W1[1], 3), f3(W1[1]), 'blue'],
                                             [3, round(W1[2], 3), f3(W1[2]), 'blue']], bw=42, ms=1100)),
    step(f'The output is the values blended by those weights: {f3(W1[0])} × [2, 0] + {f3(W1[1])} × [0, 2] + {f3(W1[2])} × [1, 1] = [{f3(O1[0])}, {f3(O1[1])}]. One computation, no relay: day t−2 was one hop away, just like day t.',
         box('out', 340, 450, 240, 100, 'output\n= blend of values', 'green', sub=f'[{f3(O1[0])}, {f3(O1[1])}]', size=19),
         arrow('wch', 'out', tone='green')),
    step(f'Softmax is exponential. Lift the first score from 1 to 3 and its weight jumps from {f3(W1[0])} to {f3(W3[0])}. The others shrink to {f3(W3[1])} and {f3(W3[2])}, and the output swings towards day t−2\'s value: [{f3(O3[0])}, {f3(O3[1])}].',
         dict(hide='s1'), note('s1b', 100, 400, '3 ÷ √2 = 2.121', 'amber', 19),
         dict(hide='wb1'),
         dict(bars='wb3', chart='wch', data=[[1, round(W3[0], 3), f3(W3[0]), 'amber'], [2, round(W3[1], 3), f3(W3[1]), 'amber'],
                                             [3, round(W3[2], 3), f3(W3[2]), 'amber']], bw=42, ms=1100),
         dict(sub='out', text=f'[{f3(O3[0])}, {f3(O3[1])}]')),
    step('The price of everyone looking at everyone: n positions make n × n scores. A 60-day window is 3,600 scores; 1,000 bars is a million. Informer and the Temporal Fusion Transformer were built to tame this cost.',
         box('cost', 20, 650, 270, 104, 'n × n scores\n60 days → 3,600\n1,000 bars → 1,000,000', 'amber', size=18)),
    step('For forecasting, mask the future. Each day may attend only to itself and earlier days. Without a causal mask the model can read tomorrow, and the backtest looks brilliant for no real reason.',
         box('mask', 310, 650, 270, 104, 'causal mask\nday t sees only\ndays up to t', 'red', size=18)),
    step('Transformers won on huge text and image datasets. A two-year daily FX series is tiny and noisy by comparison. Use attention where the data is big, often text, and make it beat a tuned LSTM or linear model out of sample first.',
         note('end', 300, 782, 'Big data: attention earns its keep.\nShort series: beat the simple model first.', 'green', 19),
         dict(pulse='mask'), dict(pulse='cost')),
])


BOARD = dict(name='attention_transformers_time_series', lesson='attention-transformers-time-series',
             title='Attention: every day looks at every other day', cfg=ATTN,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=5)
