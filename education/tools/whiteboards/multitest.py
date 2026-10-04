from ._wb import *
from math import log10
import random

# ── Multiple testing: seventy rolls of the dice (multiple-testing) ────────────
# The lesson's worked example: 70 slices (7 pairs × 5 regimes × 2 holding periods), every one
# pure noise, each tested at α = 0.05. Expected false positives 70 × 0.05 = 3.5; FWER =
# 1 − 0.95^70 = 97.2%; Bonferroni bar 0.05 / 70 ≈ 0.000714 (about 70× stricter); BH at q = 0.10:
# rank 1 must beat 1/70 × 0.10 ≈ 0.00143, rank 10 must beat 10/70 × 0.10 ≈ 0.0143. Factor zoo:
# Harvey, Liu & Zhu (2016) counted 316 published factors and put the hurdle at t ≈ 3, not 2.
# The 70 p-values are ILLUSTRATIVE: uniform draws (seed 19), which under the null is exactly how
# p-values behave. That draw has 3 below 0.05 (the lesson's "3 out of 70"), smallest 0.0070, and
# none survive Bonferroni or BH.
M, A, Q = 70, 0.05, 0.10
_r = random.Random(19)
P = [_r.random() for _ in range(M)]
S = sorted(P)
WIN = [i for i, p in enumerate(P) if p < A]
BEST = min(range(M), key=lambda i: P[i])
assert len(WIN) == 3 and round(P[BEST], 4) == 0.0070
assert not any(S[k - 1] <= k / M * Q for k in range(1, M + 1)) and S[0] > A / M
assert round(1 - 0.95 ** 70, 3) == 0.972 and round(A / M, 6) == 0.000714
assert round(Q / M, 5) == 0.00143 and round(10 * Q / M, 4) == 0.0143

def h(p): return round(-log10(p), 3)               # bar height: −log10 p (taller = smaller p)
BONF, P05 = h(A / M), h(A)                         # 3.146, 1.301
RAW = [[i + 1, h(p), '', 'red' if p < A else 'blue'] for i, p in enumerate(P)]
SORTED = [[k + 1, h(p), '', 'red' if p < A else 'blue'] for k, p in enumerate(S)]
STAIR = []
for k in range(1, M + 1):
    STAIR += [[k - 0.5, h(k / M * Q)], [k + 0.5, h(k / M * Q)]]

PC = (10, 150, 580, 300)          # the 70 tests
FW = (305, 466, 285, 176)         # FWER curve

MT = dict(w=600, h=822, intro='Seventy backtests of nothing, a 5% bar, and how many "winners" luck hands you. Press play, or step through.', steps=[
    step('You have an idea and test it once, at the usual 5% bar. If there is really nothing there, you still have a 1-in-20 chance of a false alarm. One roll of the dice: fine.',
         icon('you', 'person', 18, 8, 0.7, 'blue', 'you', lsize=17),
         icon('d1', 'dice', 112, 22, 0.5, 'amber'),
         note('one', 136, 100, '1 test: 5%', 'amber', 17)),
    step('But you don\'t run one. You slice: 7 pairs × 5 regimes × 2 holding periods. That is 70 tests, and each one is another roll of the dice.',
         icon('d2', 'dice', 196, 22, 0.42, 'amber'), icon('d3', 'dice', 248, 22, 0.42, 'amber'),
         icon('d4', 'dice', 300, 22, 0.42, 'amber'), icon('d5', 'dice', 352, 22, 0.42, 'amber'),
         note('dots', 420, 46, '…', 'amber', 26),
         note('mult', 290, 100, '7 pairs × 5 regimes × 2 periods = 70', 'amber', 17),
         dict(hide='one')),
    step('Make it pure noise: none of the 70 slices has any real edge. Here are their p-values, one bar each. A taller bar is a smaller p-value, a result that looks luckier.',
         chart('pc', PC, '70 tests on pure noise (illustrative)', [0.3, 70.7], [0, 3.6],
               [[0, 'p = 1'], [P05, '0.05'], [BONF, '0.000714']], [[1, '1'], [35, '35'], [70, '70']], pl=70, pr=12),
         dict(bars='raw', chart='pc', data=[[d[0], d[1], '', 'blue'] for d in RAW], bw=5, ms=1300)),
    step('Now draw the 5% bar. A few slices poke above it: here 3 of the 70 come out "significant". Not one of them is real. That is what noise does.',
         series('a05', 'pc', [[0.3, P05], [70.7, P05]], 'amber', dash=True, label='5% bar', lat=[70.7, P05], ldx=-4, ldy=-12, lanchor='end', ms=500),
         dict(bars='rawhit', chart='pc', data=[RAW[i] for i in WIN], bw=5, ms=600),
         *[dot(f'w{j}', 'pc', [i + 1, h(P[i])], '', 'red') for j, i in enumerate(WIN)]),
    step('How many should you expect? Each slice has a 5% chance of a fluke, so 70 × 0.05 = 3.5 false positives on average. Finding about 3 is not a discovery; it is the expected result.',
         box('efp', 10, 466, 280, 82, 'expected false alarms\n70 × 0.05', 'red', sub='0', size=18),
         dict(count='efp', **{'from': 0, 'to': 3.5, 'dp': 1, 'ms': 1100})),
    step('And the chance of at least one fluke somewhere is 1 − 0.95⁷⁰, about 97.2%. It climbs fast with every test you add, then flattens near 100%.',
         box('fwer', 10, 560, 280, 82, 'chance of at least one\n1 − 0.95⁷⁰', 'red', sub='0%', size=18),
         chart('fw', FW, 'P(≥ 1 fluke)', [0, 100], [0, 1], [[0, '0%'], [1, '100%']], [[0, '0'], [70, '70'], [100, 'm']], pl=52, pr=14),
         series('fc', 'fw', [[m, round(1 - 0.95 ** m, 4)] for m in range(0, 101, 2)], 'red', ms=1200),
         dot('f70', 'fw', [70, 0.972], '97%', 'red', dx=-6, dy=18, anchor='end'),
         dict(count='fwer', **{'from': 0, 'to': 97.2, 'dp': 1, 'suf': '%', 'ms': 1100})),
    step(f'The trap: write up only the winner. The luckiest slice came out at p = {P[BEST]:.3f}, and on its own it looks like an edge. Without the other 69 bars, nobody can tell it is a lottery ticket.',
         icon('rep', 'scroll', 480, 6, 0.6, 'purple', 'the write-up', lsize=17),
         chip('best', 10 + 70 + (BEST + 1 - 0.3) / 70.4 * 498, 216, f'p = {P[BEST]:.3f}', 'red'),
         move('best', 528, 118, 1200),
         dict(pulse='rep')),
    step('Line all 70 up, luckiest first. The best of 70 noise draws is expected to look good: someone has to be the smallest of 70.',
         dict(hide='best'), dict(hide='raw'), dict(hide='rawhit'), *[dict(hide=f'w{j}') for j in range(3)],
         dict(bars='srt', chart='pc', data=SORTED, bw=5, ms=1100),
         note('rk', 104, 328, '← luckiest first', 'chalk', 17, anchor='start')),
    step('Bonferroni raises the bar: divide 5% by the 70 tests. Now each slice needs p below 0.05 ÷ 70 ≈ 0.000714, about 70 times stricter. None of the noise gets over it, and the family-wise risk is back to 5%.',
         dict(dim='a05'),
         series('bf', 'pc', [[0.3, BONF], [70.7, BONF]], 'green', label='Bonferroni: 0.05 ÷ 70', lat=[70.7, BONF], ldx=-4, ldy=-12, lanchor='end', ms=900),
         box('bon', 10, 664, 280, 76, 'Bonferroni bar\n0.05 ÷ 70', 'green', sub='0.05', size=18),
         dict(count='bon', **{'from': 0.05, 'to': 0.000714, 'dp': 6, 'ms': 1200})),
    step('It is strict by design. FX slices share a USD factor, so 70 slices are not 70 independent looks, and the flat bar can also bury real, correlated effects. Benjamini-Hochberg uses a staircase instead: rank 1 must beat 1/70 × 0.10 ≈ 0.00143, rank 10 only 10/70 × 0.10 ≈ 0.0143.',
         series('bh', 'pc', STAIR, 'purple', ms=1300, label='BH staircase (q = 10%)', lat=[46, h(46 / M * Q)], ldx=0, ldy=-24),
         box('bhb', 310, 664, 280, 76, 'BH, q = 10%\nrank k: p ≤ k/70 × 0.10', 'purple', sub='rank 1: 0.00143', size=18)),
    step('On pure noise nothing should survive either bar, and here nothing does. The fix that comes before any formula: count every test you ran, failures included, so the bar can rise to match.',
         dict(sub='bhb', text='rank 10: 0.0143'),
         dict(pulse='srt')),
    step('A whole field ran this experiment. Harvey, Liu & Zhu counted 316 published stock-return factors, all tested on the same shared history, and argued a new one should clear a t-statistic of about 3, not the usual 2.',
         icon('zoo', 'crowd', 18, 744, 0.62, 'amber'),
         note('zl', 92, 774, '316 factors', 'amber', 18, anchor='start'),
         box('tb2', 300, 748, 120, 56, 'bar: t ≈ 2', 'red', size=18),
         box('tb3', 466, 748, 124, 56, 'bar: t ≈ 3', 'green', size=18),
         arrow('tb2', 'tb3', None, 'green'),
         dict(cross='tb2'), dict(pulse='tb3')),
])


BOARD = dict(name='multitest', lesson='multiple-testing', title='Seventy rolls of the dice: why some backtests win by luck', cfg=MT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the factor zoo',
             deck_after=7)
