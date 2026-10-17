from ._wb import *

# ── Boosting round by round on the lesson's five points (gradient-boosting) ──
# y = [3, 5, 6, 9, 12] at x = 1..5, squared error, ν = 0.5, depth-1 trees.
# Round 1 is the lesson's worked example (F0 = 7, h1 = −2.333 | 3.5, F1 = 5.833 | 8.75,
# Σ|r| 14 → 7.333). Later rounds repeat the same four steps exactly (computed below);
# the lesson's own chart shows rounds 2–3 only as an illustrative continuation.

Y = [3, 5, 6, 9, 12]
NU = 0.5


def boost(rounds):
    F = [sum(Y) / len(Y)] * len(Y)
    hist = [(list(F), sum(abs(a - b) for a, b in zip(Y, F)), None)]
    for _ in range(rounds):
        r = [a - b for a, b in zip(Y, F)]
        best = None
        for k in range(1, len(Y)):
            L, R = r[:k], r[k:]
            mL, mR = sum(L) / len(L), sum(R) / len(R)
            sse = sum((v - mL) ** 2 for v in L) + sum((v - mR) ** 2 for v in R)
            if best is None or sse < best[0] - 1e-12:
                best = (sse, k, mL, mR)
        _, k, mL, mR = best
        F = [f + NU * (mL if i < k else mR) for i, f in enumerate(F)]
        hist.append((list(F), sum(abs(a - b) for a, b in zip(Y, F)), (k, mL, mR)))
    return hist


H = boost(6)
ERR = [round(e, 3) for _, e, _ in H]          # 14, 7.333, 5.708, 3.888, 2.053, 1.445, 1.003


def stairs(F):
    """Piecewise-constant fit drawn across x = 0.6 .. 5.4."""
    pts = [[0.6, round(F[0], 3)]]
    for i in range(len(F) - 1):
        pts += [[i + 1.5, round(F[i], 3)], [i + 1.5, round(F[i + 1], 3)]]
    return pts + [[5.4, round(F[-1], 3)]]


R0 = [y - 7 for y in Y]
STICKS = [series('st%d' % i, 'fit', [[i + 1, 7], [i + 1, Y[i]]], 'red', dash=True, ms=300) for i in range(5)]
RLAB = [cnote('rl%d' % i, 'fit', [i + 1, Y[i]], ('%+d' % R0[i]).replace('-', '−'), 'red', 17,
              anchor='start', dx=10, dy=(10 if R0[i] < 0 else -10)) for i in range(5)]

GB = dict(w=600, h=640, intro='Five points, one starting guess, and a chain of small trees, each fit to what the ones before it still get wrong. Press play, or step through.', steps=[
    step('Five training points: y = 3, 5, 6, 9 and 12 at x = 1 to 5. We want a model that predicts y from x, built out of small trees.',
         chart('fit', (10, 8, 580, 260), 'The data and the model so far', [0.5, 5.5], [0, 13.5],
               [[0, '0'], [3, '3'], [6, '6'], [9, '9'], [12, '12']], [[i, str(i)] for i in range(1, 6)], pl=40, pr=46),
         *[dot('p%d' % i, 'fit', [i + 1, Y[i]], '', None) for i in range(5)]),
    step('Round 0: start from one constant guess. For squared error that is the mean, (3 + 5 + 6 + 9 + 12) ÷ 5 = 7. Wrong for every point, but a fair start.',
         series('f0', 'fit', [[0.6, 7], [5.4, 7]], 'amber', dash=True, label='F₀ = 7', lat=[0.6, 7], ldx=-2, ldy=-14, lanchor='start', lsize=16)),
    step('What is still wrong? The residuals, y minus the guess: −4, −2, −1, +2 and +5. These gaps, not the original y values, are what the next tree is trained on.',
         *STICKS, *RLAB),
    step('Fit a one-split tree to the residuals. Its best cut is x ≤ 3: the left leaf averages (−4 − 2 − 1) ÷ 3 = −2.333 and the right leaf (2 + 5) ÷ 2 = 3.5.',
         chart('res', (10, 282, 280, 230), 'Residuals and tree h₁', [0.5, 5.5], [-5, 6],
               [[-4, '−4'], [0, '0'], [5, '+5']], [[i, str(i)] for i in range(1, 6)], zero=True, pl=36),
         dict(bars='rb', chart='res', data=[[i + 1, R0[i], '', 'red'] for i in range(5)], bw=24, ms=800),
         series('h1', 'res', [[0.6, -2.333], [3.5, -2.333], [3.5, 3.5], [5.4, 3.5]], 'amber', ms=900,
                label='h₁', lat=[4, 3.5], ldx=0, ldy=-14, lsize=16)),
    step('Add only half of that correction (shrinkage ν = 0.5): 7 + 0.5 × (−2.333) = 5.833 on the left, 7 + 0.5 × 3.5 = 8.75 on the right. That is F₁.',
         *[dict(hide='st%d' % i) for i in range(5)], *[dict(hide='rl%d' % i) for i in range(5)],
         series('f1', 'fit', stairs(H[1][0]), 'green', ms=1000, label='F₁', lat=[5.4, 8.75], ldx=8, ldy=0, lanchor='start', lsize=16)),
    step('Total leftover error, the sum of the sizes of the residuals, falls from 14 to 7.333 after one round: roughly halved.',
         chart('err', (310, 282, 280, 230), 'Σ|residual| by round', [-0.6, 6.6], [0, 16.5],
               [[0, '0'], [7, '7'], [14, '14']], [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], pl=34),
         dict(bars='e01', chart='err', data=[[0, ERR[0], '14', 'red'], [1, ERR[1], '7.33', 'amber']], bw=26, ms=900)),
    step('Round 2 repeats the same steps on the new residuals. The best cut is now x ≤ 4, and half its correction lifts the last point to 10.375. Error: %.3f.' % ERR[2],
         dict(dim='f1'), dict(dim='h1'), dict(dim='rb'),
         series('f2', 'fit', stairs(H[2][0]), 'blue', ms=1000),
         dict(bars='e2', chart='err', data=[[2, ERR[2], '%.2f' % ERR[2], 'amber']], bw=26, ms=700)),
    step('Rounds 3 to 6, same four steps each time. The error falls to %.2f, %.2f, %.2f and %.2f, and the fit hugs the points ever more closely.' % tuple(ERR[3:7]),
         dict(dim='f2'),
         series('f6', 'fit', stairs(H[6][0]), 'green', ms=1200, label='F₆', lat=[5.4, H[6][0][-1]], ldx=8, ldy=0, lanchor='start', lsize=16),
         dict(bars='e36', chart='err', data=[[m, ERR[m], '%.1f' % ERR[m], 'green'] for m in range(3, 7)], bw=26, ms=1100)),
    step('That is the danger too. Every round can only lower the training error, so with enough rounds a boosted model fits the noise as well as the signal. Stop early, on data held out in time, never on the training curve.',
         note('warn', 300, 552, 'training error always falls: stop on held-out data', 'red', 19)),
    step('XGBoost, LightGBM and CatBoost run this same loop, with penalties on tree size and a lot of speed. A strong method is still not an edge: the features need an honest out-of-sample test with costs.',
         note('end', 300, 598, 'great method ≠ proven signal', 'amber', 20)),
])


BOARD = dict(name='gradient_boosting', lesson='gradient-boosting',
             title='Boosting round by round, on five points', cfg=GB,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=5)
