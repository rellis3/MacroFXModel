from ._wb import *

# ── One deep tree vs. an averaged forest (decision-trees-random-forests) ─────
# The lesson's worked example: x = 1..8, y = 0 0 0 1 0 1 1 1 (noise at x = 4 and 5).
# Root impurity 0.25. ΔI for every threshold, computed exactly:
#   1.5 0.0357 · 2.5 0.0833 · 3.5 0.15 · 4.5 0.0625 · 5.5 0.15 · 6.5 0.0833 · 7.5 0.0357
# Three depth-1 bootstrap trees split at 3.5, 4.5, 5.5 (the lesson's illustrative outcome);
# their average is 0, 1/3, 2/3, 1. Variance of the average: ρσ² + (1 − ρ)σ²/B with σ² = 1
# and illustrative ρ = 0.6 vs 0.2.

Y = [0, 0, 0, 1, 0, 1, 1, 1]


def var(a):
    m = sum(a) / len(a)
    return sum((v - m) ** 2 for v in a) / len(a)


DI = []
for k in range(1, 8):
    L, R = Y[:k], Y[k:]
    DI.append((k + 0.5, round(var(Y) - (len(L) / 8 * var(L) + len(R) / 8 * var(R)), 4)))

SINGLE = [[0.6, 0], [3.5, 0], [3.5, 1], [4.5, 1], [4.5, 0], [5.5, 0], [5.5, 1], [8.4, 1]]
FOREST = [[0.6, 0], [3.5, 0], [3.5, 1 / 3], [4.5, 1 / 3], [4.5, 2 / 3], [5.5, 2 / 3], [5.5, 1], [8.4, 1]]
FOREST = [[x, round(v, 3)] for x, v in FOREST]


def vcurve(rho):
    return [[b, round(rho + (1 - rho) / b, 4)] for b in range(1, 51)]


DOTS = [dot('p%d' % (i + 1), 'pts', [i + 1, y], 'noise' if i in (3, 4) else '', 'red' if i in (3, 4) else None,
            dy=(-16 if y == 1 else 18)) for i, y in enumerate(Y)]

TREES = dict(w=600, h=745, intro='Eight points, two of them noise. One tree that never stops asking, then three small trees averaged. Press play, or step through.', steps=[
    step('Eight training points, one feature x from 1 to 8. The true rule is a step: 0 on the left, 1 on the right. Two labels are noise: x = 4 flipped to 1, and x = 5 flipped to 0.',
         chart('pts', (10, 8, 580, 240), 'Training data: x and its label y', [0.5, 8.5], [-0.3, 1.35],
               [[0, '0'], [1, '1']], [[i, str(i)] for i in range(1, 9)], pl=36),
         *DOTS),
    step('The root holds all eight points. Four are ones, so its mean is 0.5 and its impurity, the variance around that mean, is 0.25.',
         series('mean', 'pts', [[0.6, 0.5], [8.4, 0.5]], 'blue', dash=True, label='mean 0.5 · impurity 0.25', lat=[6.4, 0.5], ldy=-14, lsize=16)),
    step('The tree tries a cut between every pair of neighbours and scores each by its impurity reduction. Cuts at 3.5 and 5.5 tie for best at 0.15. The middle cut at 4.5 scores only 0.0625, because each side keeps one noisy point.',
         chart('di', (10, 260, 580, 172), 'Impurity reduction for each cut', [1, 8], [0, 0.2],
               [[0, '0'], [0.15, '0.15']], [[t, str(t)] for t, _ in DI], pl=46),
         dict(bars='dib', chart='di', data=[[t, d, '%.4g' % d, 'green' if d >= 0.15 else 'blue'] for t, d in DI], bw=40, ms=1200)),
    step('Greedy: take the best cut, x ≤ 3.5. The left group is {0, 0, 0}, already pure, so it becomes a leaf predicting 0. Then the same search runs again on each side.',
         dict(hide='mean'),
         series('cut', 'pts', [[3.5, -0.25], [3.5, 1.25]], 'green', dash=True, ms=500)),
    step('With no depth limit it never stops. It cuts at 4.5, then at 5.5, until every point sits in a box that matches its label. The red fit passes through every point, both noisy ones included. Training error: zero.',
         dict(hide='cut'),
         series('deep', 'pts', SINGLE, 'red', ms=1600, label='one deep tree', lat=[1.6, 0], ldy=-16, lsize=16)),
    step('That zero is the warning sign. The tree has memorised the noise, so its answer for a new point at x = 4.5 depends on one mislabelled neighbour, not on where the real step is.',
         dot('q', 'pts', [4.5, 0.5], 'x = 4.5: ?', 'red', dx=0, dy=-14)),
    step('Bagging: draw three bootstrap resamples of the eight rows, with replacement, and grow a one-cut tree on each. Each resample leans on different points; say the three cuts land at 3.5, 4.5 and 5.5.',
         dict(dim='deep'), dict(hide='q'),
         series('c1', 'pts', [[3.5, -0.25], [3.5, 1.25]], 'amber', dash=True, ms=400),
         series('c2', 'pts', [[4.5, -0.25], [4.5, 1.25]], 'amber', dash=True, ms=400),
         series('c3', 'pts', [[5.5, -0.25], [5.5, 1.25]], 'amber', dash=True, ms=400)),
    step('Average the three votes. Below 3.5 all three say 0. Between 3.5 and 4.5 one in three says 1; between 4.5 and 5.5, two in three; above 5.5, all three. A gentler step, centred near the true boundary, with neither noise point owning a box.',
         series('avg', 'pts', FOREST, 'green', ms=1600, label='average of 3', lat=[7.4, 1], ldy=-16, lsize=16)),
    step('Why averaging helps, and where it stops. The variance of an average of B trees is ρσ² + (1 − ρ)σ²/B, where ρ is how correlated the trees are. Take one tree\'s variance as 1 (illustrative). Look-alike trees, ρ = 0.6: adding trees flattens out at 0.6.',
         chart('var', (10, 446, 580, 240), 'Variance of the average vs number of trees (illustrative)', [1, 50], [0, 1.08],
               [[0, '0'], [0.2, '0.2'], [0.6, '0.6'], [1, '1']], [[1, '1'], [10, '10'], [25, '25'], [50, '50']], pl=42, pr=16),
         series('f6', 'var', [[1, 0.6], [50, 0.6]], 'amber', dash=True, ms=400),
         series('v6', 'var', vcurve(0.6), 'amber', ms=1400, label='ρ = 0.6', lat=[40, 0.6], ldy=-16, lsize=16)),
    step('Random feature subsets at each split make the trees disagree. With ρ = 0.2 the same number of trees falls to a floor of 0.2. Lowering ρ moves the floor; more trees never do.',
         series('f2', 'var', [[1, 0.2], [50, 0.2]], 'green', dash=True, ms=400),
         series('v2', 'var', vcurve(0.2), 'green', ms=1400, label='ρ = 0.2', lat=[40, 0.2], ldy=-16, lsize=16)),
    step('A forest is strong, general machinery. Whether your own features carry an edge is a separate question, answered only by a purged, walk-forward test with costs.',
         note('end', 300, 716, 'a strong method is not an edge: test it out of sample', 'amber', 19)),
])


BOARD = dict(name='decision_trees_random_forests', lesson='decision-trees-random-forests',
             title='One deep tree vs. an averaged forest, step by step', cfg=TREES,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=10)
