from ._wb import *
from math import log10, sqrt
import random

# ── Correlated shocks by Cholesky mixing (multivariate-correlated-sdes) ──────
# Numbers are the lesson's own: rho = 0.6 → L21 = 0.6, L22 = √(1 − 0.36) = 0.8; the scratchpad's
# z1 = z2 = 1 → 1.000 and 1.400; realized correlation vs paths 0.655 (50), 0.623 (200), 0.604 (1,000),
# 0.600 (5,000), 0.606 (20,000), 0.602 (100,000); the EUR/USD, GBP/USD, EUR/GBP VaR scenario;
# Higham (2002) nearest-correlation repair. The two scatter clouds are 60 illustrative standard-normal
# draws (Python random, seed 11), mixed with the lesson's weights; their sample correlations are computed.
RHO = 0.6
L22 = sqrt(1 - RHO ** 2)
assert abs(L22 - 0.8) < 1e-12
rng = random.Random(11)
Z = [(rng.gauss(0, 1), rng.gauss(0, 1)) for _ in range(60)]
Z = [(a, b) for a, b in Z if abs(a) < 2.6 and abs(b) < 2.6]
Y = [(a, RHO * a + L22 * b) for a, b in Z]


def corr(p):
    n = len(p); mx = sum(a for a, _ in p) / n; my = sum(b for _, b in p) / n
    sxy = sum((a - mx) * (b - my) for a, b in p); sx = sqrt(sum((a - mx) ** 2 for a, _ in p)); sy = sqrt(sum((b - my) ** 2 for _, b in p))
    return sxy / (sx * sy)


CZ, CY = corr(Z), corr(Y)
CONV = [(50, 0.655), (200, 0.623), (1000, 0.604), (5000, 0.600), (20000, 0.606), (100000, 0.602)]
TOP = ['d1', 'd2', 'L', 'y1', 'y2', 'chk', 'a1', 'a2', 'a3', 'a4']
SC = ['ind', 'mix', 'ci', 'cm'] + [f'zi{i}' for i in range(len(Z))] + [f'ym{i}' for i in range(len(Y))]

MV = dict(w=600, h=640, intro='How two independent random shocks become two correlated ones, using the lesson\'s own ρ = 0.6, then what can break it on a risk desk. Press play, or step through.', steps=[
    step('Start with two completely independent random shocks, like two separate dice: z₁ and z₂. On their own they say nothing about each other.',
         icon('d1', 'dice', 20, 14, 0.75, 'blue', 'z₁', lsize=18),
         icon('d2', 'dice', 20, 140, 0.75, 'blue', 'z₂', lsize=18)),
    step('We want a correlation of 0.6. The Cholesky factor of that target is a 2×2 mixing recipe: the second row is 0.6 and √(1 − 0.6²) = 0.8.',
         box('L', 205, 70, 190, 110, 'Cholesky L\nrow 1:  1,  0\nrow 2:  0.6,  0.8', 'amber', size=19),
         arrow('d1', 'L', tone='blue', id='a1'), arrow('d2', 'L', tone='blue', id='a2')),
    step('The first output just passes the first shock through: y₁ = z₁.',
         box('y1', 440, 20, 150, 70, 'y₁ = z₁', 'purple', size=19),
         arrow('L', 'y1', tone='purple', id='a3')),
    step('The second re-uses 0.6 of the first shock and adds 0.8 of a fresh one: y₂ = 0.6 z₁ + 0.8 z₂. Because it shares part of z₁, it moves with y₁.',
         box('y2', 440, 160, 150, 70, 'y₂ = 0.6z₁\n+ 0.8z₂', 'purple', size=18),
         arrow('L', 'y2', tone='purple', id='a4')),
    step('Try it with both raw shocks at 1.00: y₁ = 1.000 and y₂ = 0.6 + 0.8 = 1.400, exactly what the lesson\'s scratchpad shows.',
         dict(sub='y1', text='= 1.000'), dict(sub='y2', text='= 1.400')),
    step('Check the recipe: the variance of y₂ is 0.6² + 0.8² = 0.36 + 0.64 = 1, and its correlation with y₁ is 0.6. Right by construction, not by trial and error.',
         note('chk', 300, 262, 'variance 0.36 + 0.64 = 1 · correlation 0.6', 'green', 19)),
    step(f'Here are {len(Z)} illustrative random draws. Left, the raw shocks: a round cloud, sample correlation {CZ:.2f}. Right, the same draws after mixing: the cloud tilts, sample correlation {CY:.2f}, near the 0.6 target.',
         chart('ind', (10, 290, 285, 320), f'raw: z₁ vs z₂ · corr {CZ:.2f}', [-2.8, 2.8], [-2.8, 2.8], [[0, '0']], [[0, '0']], pl=30, pr=10, zero=True),
         chart('mix', (305, 290, 285, 320), f'mixed: y₁ vs y₂ · corr {CY:.2f}', [-2.8, 2.8], [-2.8, 2.8], [[0, '0']], [[0, '0']], pl=30, pr=10, zero=True),
         *[dot(f'zi{i}', 'ind', [round(a, 3), round(b, 3)], '', 'blue') for i, (a, b) in enumerate(Z)],
         *[dot(f'ym{i}', 'mix', [round(a, 3), round(b, 3)], '', 'purple') for i, (a, b) in enumerate(Y)],
         ),
    step('A small run will not hit 0.6 exactly. In the lesson\'s simulation, 50 paths gave 0.655, 5,000 gave 0.600 and 100,000 gave 0.602. That is ordinary sampling noise shrinking.',
         *[dict(hide=i) for i in SC],
         chart('cv', (10, 290, 580, 320), 'Realized correlation vs number of paths', [1.5, 5.2], [0.55, 0.68],
               [[0.56, '0.56'], [0.6, '0.60'], [0.64, '0.64'], [0.68, '0.68']], [[log10(n), f'{n:,}'] for n, _ in CONV if n != 20000], pl=56, pr=20),
         series('tg', 'cv', [[1.6, 0.6], [5.1, 0.6]], 'amber', dash=True, ms=600, label='target 0.6', lat=[5.1, 0.6], ldx=0, ldy=16, lanchor='end', lsize=16),
         series('rc', 'cv', [[round(log10(n), 3), c] for n, c in CONV], 'green', ms=1400),
         dot('c50', 'cv', [log10(50), 0.655], '0.655', 'green', dx=12, dy=0, anchor='start')),
    step('On a desk: hold EUR/USD, GBP/USD and EUR/GBP and you have three pairs but only two independent sources of risk. Simulate them from one correlated set of shocks, built from the 3×3 matrix, or the VaR ignores how they move together.',
         *[dict(hide=i) for i in TOP + ['cv', 'tg', 'rc', 'c50']],
         chip('eu', 100, 50, 'EUR/USD', 'blue'), chip('gu', 300, 50, 'GBP/USD', 'blue'), chip('eg', 500, 50, 'EUR/GBP', 'purple'),
         box('m3', 150, 100, 300, 80, '3×3 correlation\n→ Cholesky → shocks', 'amber', size=18)),
    step('Pieced together from sources with different closing times, a correlation matrix can be invalid, and the Cholesky step fails outright. Higham\'s 2002 nearest-correlation repair, which came straight from this problem, is now a standard step before simulating.',
         dict(cross='m3'),
         box('fix', 150, 220, 300, 80, 'repair to nearest\nvalid matrix (Higham 2002)', 'green', size=18)),
    step('The rule: keep the raw shocks independent, and put all the correlation into one mixing step you can check.',
         note('rule', 300, 360, 'independent shocks, one checked mix', 'green', 22)),
])


BOARD = dict(name='multivariate_correlated_sdes', lesson='multivariate-correlated-sdes',
             title='Mixing independent shocks into correlated ones, step by step', cfg=MV,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)
