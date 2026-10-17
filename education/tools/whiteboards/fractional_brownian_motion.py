from ._wb import *
import math
import numpy as np

# ── Fractional Brownian motion (fractional-brownian-motion) ───────────────────
# Three ILLUSTRATIVE paths of 250 steps built from the SAME 250 normal shocks
# (numpy default_rng(3)) through the exact fractional-Gaussian-noise covariance (Cholesky),
# for H = 0.5, 0.85 and 0.3. Each path is divided by 250^H so all three have the same
# overall spread and differ only in texture. The covariance numbers (s = 2, t = 5) and the
# decay curves 0.7^k and (k+1)^-0.3 are the lesson's own; the running sums are exact.
N = 250
_Z = np.random.default_rng(3).standard_normal(N)
def _path(H):
    k = np.arange(N)
    g = 0.5 * (np.abs(k + 1) ** (2 * H) - 2 * np.abs(k) ** (2 * H) + np.abs(k - 1) ** (2 * H))
    C = g[np.abs(k[:, None] - k[None, :])]
    p = np.concatenate([[0.0], np.cumsum(np.linalg.cholesky(C) @ _Z)]) / N ** H
    return [[i, round(float(p[i]), 3)] for i in range(0, N + 1, 2)]
P05, P85, P03 = _path(0.5), _path(0.85), _path(0.3)

def cov(s, t, H): return 0.5 * (s ** (2 * H) + t ** (2 * H) - abs(t - s) ** (2 * H))
assert round(cov(2, 5, 0.5), 4) == 2 and round(cov(2, 5, 0.85), 2) == 6.10 and round(cov(2, 5, 0.3), 2) == 1.10
AR = [[k, round(0.7 ** k, 4)] for k in range(0, 61)]
PL = [[k, round((k + 1) ** -0.3, 4)] for k in range(0, 61)]
S_AR = sum(0.7 ** k for k in range(1, 61))             # 2.33, and never more than 2.33
S_PL = {L: sum((k + 1) ** -0.3 for k in range(1, L + 1)) for L in (10, 60)}   # 5.9, 23.6, still growing
assert round(S_AR, 2) == 2.33 and round(S_PL[60], 1) == 23.6

PC = (10, 10, 580, 260)
AC = (10, 290, 580, 250)
FBM = dict(w=600, h=760, intro='One dial, the Hurst index H, sets how much a random walk remembers. Watch three walks built from the same shocks, then see why long memory is a different kind of thing. Press play, or step through.', steps=[
    step('A plain random walk, H = 0.5: every step is a fresh coin flip with no memory of the last. Here are 250 steps (an illustrative path).',
         chart('pth', PC, 'Same 250 shocks, three memory settings (illustrative)', [0, 250], [-1.0, 1.3], [[0, '0']],
               [[0, '0'], [125, '125'], [250, '250']], pl=36, pr=14, zero=True),
         series('p05', 'pth', P05, None, ms=1500, label='H 0.5', lat=[250, P05[-1][1]], ldx=-4, ldy=20, lanchor='end')),
    step('Turn the dial up to H = 0.85, same shocks. Now a move up makes the next move a little more likely to be up, so the path trends in long, smooth swings.',
         series('p85', 'pth', P85, 'red', ms=1500, label='H 0.85', lat=[250, P85[-1][1]], ldx=-4, ldy=-14, lanchor='end')),
    step('Turn it down to H = 0.3. Moves tend to reverse, so the path is jagged and keeps snapping back. Same shocks, three different textures.',
         dict(dim='p05'),
         series('p03', 'pth', P03, 'amber', ms=1500, label='H 0.3', lat=[150, P03[75][1]], ldx=0, ldy=-16)),
    step('The dial lives in one formula: Cov = ½(s^2H + t^2H − |t − s|^2H). At s = 2, t = 5 it gives 2 when H = 0.5, ordinary Brownian motion. At H = 0.85 it triples to 6.10; at H = 0.3 it falls to 1.10.',
         box('cv', 320, 196, 270, 84, 'Cov(2, 5):  H 0.5 → 2\nH 0.85 → 6.10 · H 0.3 → 1.10', 'purple', size=17)),
    step('Now memory over lags. A short-memory AR(1) with coefficient 0.7: its autocorrelation 0.7^k is all but gone by lag 10 (0.03).',
         dict(hide='cv'),
         chart('acf', AC, 'Autocorrelation by lag', [0, 60], [0, 1.05], [[0.5, '0.5'], [1, '1']],
               [[0, '0'], [10, '10'], [30, '30'], [50, '50'], [60, '60']], pl=40, pr=14),
         series('ar', 'acf', AR, 'blue', ms=1200, label='AR(1): 0.7^k', lat=[12, 0.7 ** 12], ldx=6, ldy=-16, lanchor='start')),
    step('A long-memory process decays as a power law instead, here (k + 1)^−0.3 as in the lesson\'s chart. At lag 50 it is still about 0.3.',
         series('pl', 'acf', PL, 'red', ms=1400, label='power law', lat=[40, 41 ** -0.3], ldx=0, ldy=-18),
         dot('l50', 'acf', [50, round(51 ** -0.3, 3)], '0.31 at lag 50', 'red', dy=24)),
    step(f'The real test is the total. Add up the AR(1) correlations and you get {S_AR:.2f}, however far you go. The power law adds up to {S_PL[10]:.1f} by lag 10, {S_PL[60]:.1f} by lag 60, and never stops growing.',
         box('sa', 10, 552, 280, 88, f'AR(1) total: {S_AR:.2f}\nfinite: short memory', 'blue', size=18),
         box('sp', 310, 552, 280, 88, f'power law: {S_PL[60]:.1f} by lag 60\nand still growing', 'red', size=18)),
    step('That never-ending total is the strict definition of long memory, and it happens exactly when H > 0.5. No ARMA model, however many lags, can do it: more lags only change how fast an exponential dies.',
         dict(cross='sa'), dict(pulse='sp')),
    step('ARFIMA fits the same thing to daily data by differencing a fraction of a step: d = H − 0.5. A volatility series at H = 0.85 is d = 0.35.',
         box('arf', 10, 656, 280, 92, 'ARFIMA: d = H − 0.5\nH 0.85 → d 0.35', 'green', size=18)),
    step('Where it lives: in volatility, not in the direction of returns (Lo, 1991; Ding, Granger & Engle, 1993). And check for regime breaks first: stitched-together calm and wild spells can fake a slow decay.',
         box('war', 310, 656, 280, 92, 'memory is in volatility;\nregime breaks can fake it', 'amber', size=18)),
])


BOARD = dict(name='fractional_brownian_motion', lesson='fractional-brownian-motion', title='fBm: one dial for memory', cfg=FBM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
