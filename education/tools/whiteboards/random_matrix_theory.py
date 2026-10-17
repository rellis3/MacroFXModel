from ._wb import *
import math
import numpy as np

# ── Random matrix theory (random-matrix-theory) ───────────────────────────────
# The lesson's worked scenario: N = 30 FX pairs, T = 250 days, q = 0.12, noise band
# [0.43, 1.81]; the real basket's lambda_1 = 8.2. The pure-noise matrix is ONE illustrative
# simulation: 30 independent standard-normal series of 250 draws (numpy default_rng(0)).
# Its 435 pairwise correlations and 30 eigenvalues are computed exactly below. The
# Marchenko-Pastur density is the lesson's law, scaled to the histogram's bin width.
N, T = 30, 250
Q = N / T
LO, HI = (1 - math.sqrt(Q)) ** 2, (1 + math.sqrt(Q)) ** 2
LO4, HI4 = (1 - math.sqrt(30 / 1000)) ** 2, (1 + math.sqrt(30 / 1000)) ** 2   # four years: 0.68, 1.38
_X = np.random.default_rng(0).standard_normal((T, N))
_C = np.corrcoef(_X, rowvar=False)
EV = np.sort(np.linalg.eigvalsh(_C))
OFF = _C[np.triu_indices(N, 1)]
CH = np.histogram(OFF, bins=np.arange(-0.25, 0.2501, 0.05))[0]
EH = np.histogram(EV, bins=np.arange(0.4, 1.8001, 0.1))[0]
assert len(OFF) == 435 and round(float(EV.min()), 2) == 0.45 and round(float(EV.max()), 2) == 1.76
assert round(float(OFF.min()), 2) == -0.21 and round(float(OFF.max()), 2) == 0.2
CBARS = [[round(-0.225 + 0.05 * i, 3), int(c), str(int(c)) if c >= 20 else '', 'blue'] for i, c in enumerate(CH)]
EBARS = [[round(0.45 + 0.1 * i, 2), int(c), '', 'blue'] for i, c in enumerate(EH)]
def _mp(l): return math.sqrt(max((HI - l) * (l - LO), 0)) / (2 * math.pi * Q * l)
MP = [[round(l, 3), round(N * 0.1 * _mp(l), 3)] for l in [LO + (HI - LO) * i / 40 for i in range(41)]]
REST = (N - 8.2) / (N - 1)            # if all 29 other eigenvalues are in the band: 0.75 each

CA = (10, 128, 580, 220)
CB = (10, 360, 580, 250)
RMT = dict(w=600, h=740, intro='What does a correlation matrix look like when there is nothing in it at all? Build one from pure noise, then hold a real basket up against it. Press play, or step through.', steps=[
    step('Start with 30 series that have nothing to do with each other: pure random draws, 250 days each, the shape of a year of returns on 30 FX pairs. Their true correlation is exactly zero.',
         icon('d1', 'dice', 20, 14, 0.62, 'blue'), icon('d2', 'dice', 90, 30, 0.62, 'blue'), icon('d3', 'dice', 160, 14, 0.62, 'blue'),
         note('n30', 140, 104, '× 30 series, 250 days', 'blue', 18),
         box('truth', 330, 20, 260, 76, 'true correlation\nbetween any two: 0', 'green', size=19)),
    step('Measure all 435 pairwise correlations from the 250 days. They are not zero. Most land within ±0.1, but chance alone pushes some out to −0.21 and +0.20.',
         chart('cor', CA, 'Sample correlations, 435 pairs of pure noise', [-0.25, 0.25], [0, 150], [[50, '50'], [100, '100']],
               [[-0.2, '−0.2'], [-0.1, '−0.1'], [0, '0'], [0.1, '+0.1'], [0.2, '+0.2']], pl=48, pr=14),
         dict(bars='cb', chart='cor', data=CBARS, bw=40, ms=1100)),
    step('Put those coincidences into a 30 × 30 matrix and take its eigenvalues. With infinite data they would all be exactly 1. Here they spread from 0.45 to 1.76.',
         chart('eig', CB, 'Eigenvalues of the pure-noise matrix (count per 0.1)', [0.3, 2.0], [0, 5.5], [[2, '2'], [4, '4']],
               [[0.5, '0.5'], [1.0, '1.0'], [1.5, '1.5'], [2.0, '2.0']], pl=48, pr=14),
         dict(bars='eb', chart='eig', data=EBARS, bw=26, ms=1100),
         dot('one', 'eig', [1.0, 5.2], 'all 1.0 with infinite data', None, dy=-2)),
    step('Marchenko and Pastur (1967) say where that spread must fall. It depends only on q = N ÷ T = 30 ÷ 250 = 0.12. The band runs from (1 − √q)² = 0.43 to (1 + √q)² = 1.81.',
         dict(hide='one'),
         dict(gap='band', chart='eig', top=[[LO, 5.5], [HI, 5.5]], bot=[[LO, 0], [HI, 0]], tone='amber', op=0.16),
         dot('lo', 'eig', [LO, 0], '0.43', 'amber', dy=-14),
         dot('hi', 'eig', [HI, 0], '1.81', 'amber', dy=-14)),
    step('Inside the band the law even gives the shape: a hump, highest in the middle, tapering to zero at both edges. Every one of our 30 noise eigenvalues sits inside it.',
         series('mp', 'eig', MP, 'amber', ms=1300)),
    step('More history narrows the band. Four years, T = 1000, gives q = 0.03 and a band of 0.68 to 1.38. It is the ratio that matters, not N or T alone.',
         dict(gap='band4', chart='eig', top=[[LO4, 5.5], [HI4, 5.5]], bot=[[LO4, 0], [HI4, 0]], tone='green', op=0.18),
         cnote('b4', 'eig', [1.03, 4.9], 'T = 1000: 0.68 to 1.38', 'green', 17)),
    step('Now the real 30-pair basket over the same 250 days. Its first eigenvalue is 8.2: far off this chart, about 4.5 times the 1.81 ceiling. That is a real factor, the dollar.',
         dict(hide='band4'), dict(hide='b4'),
         box('l1', 10, 622, 280, 106, 'real basket: λ₁ = 8.2\n4.5 × the ceiling:\na real factor', 'red', size=18)),
    step('Its next eigenvalues, λ₂ to λ₄, all come back between about 0.5 and 1.7: inside the band. This sample cannot tell them apart from the noise matrix above.',
         cnote('in', 'eig', [1.1, 5.0], 'λ₂–λ₄ land in here', 'purple', 18),
         dict(pulse='eb')),
    step(f'Cleaning: keep the eigenvalue above the band, replace the ones inside it with their average. If all 29 others are in the band, each becomes (30 − 8.2) ÷ 29 = {REST:.2f}, since the eigenvalues must sum to 30.',
         box('clean', 310, 622, 280, 106, f'clean: keep 8.2,\nset the 29 others\nto {REST:.2f} each', 'green', size=18)),
    step('Two cautions. An eigenvalue just above 1.81 is a weak signal: the edge is fuzzy at finite size. And overlapping windows inflate T, which makes the band look narrower than the data supports.',
         dict(pulse='hi'), dict(pulse='lo')),
])


BOARD = dict(name='random_matrix_theory', lesson='random-matrix-theory', title='Random matrices: what pure noise looks like', cfg=RMT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
