from ._wb import *

# ── Ledoit-Wolf covariance shrinkage (institutional-ledoit-wolf-shrinkage) ────
# The lesson's worked example: vols 2.0 / 3.0 / 1.5, correlations 0.30 / 0.30 / 0.4667,
# constant-correlation target from the average correlation 0.3556, delta = 0.30.
# Off-diagonals: sample 1.80 / 0.90 / 2.10, target 2.1333 / 1.0667 / 1.6000, shrunk 1.90 / 0.95 / 1.95.
VOL = [2.0, 3.0, 1.5]
RHO = {(0, 1): 0.30, (0, 2): 0.30, (1, 2): 2.1 / 4.5}   # 0.4667 = 2.10 / (3.0 × 1.5)
RBAR = sum(RHO.values()) / 3
PAIRS = [(0, 1), (0, 2), (1, 2)]
SAMP = [RHO[p] * VOL[p[0]] * VOL[p[1]] for p in PAIRS]
TARG = [RBAR * VOL[p[0]] * VOL[p[1]] for p in PAIRS]
D = 0.30
SHR = [D * t + (1 - D) * s for s, t in zip(SAMP, TARG)]
assert round(RBAR, 4) == 0.3556
assert [round(x, 2) for x in SAMP] == [1.8, 0.9, 2.1]
assert [round(x, 4) for x in TARG] == [2.1333, 1.0667, 1.6]
assert [round(x, 2) for x in SHR] == [1.9, 0.95, 1.95]
OFF = {'s': -0.27, 'f': 0.0, 'x': 0.27}
XT = [[1, 'Σ₁₂'], [2, 'Σ₁₃'], [3, 'Σ₂₃']]
def bars(id, vals, key, tone):
    return dict(bars=id, chart='ch', data=[[k + 1 + OFF[key], round(v, 4), f'{v:.2f}', tone] for k, v in enumerate(vals)], bw=26, ms=1000)

LW = dict(w=600, h=720, intro="The lesson's three-asset example: a noisy sample matrix, a stable target, and one dial between them. Press play, or step through.", steps=[
    step('A sample covariance matrix is like a blurry photo of a real face: about the right thing, but noisy, because the history is short. Unbiased on average, unreliable in any one sample.',
         box('samp', 10, 10, 190, 84, 'sample Σ̂\nunbiased · noisy', 'red', size=19)),
    step('A shrinkage target is a clean stock drawing of a face: simple, stable, and wrong in the details. Here every pair gets the basket\'s average correlation, 0.356, and each asset keeps its own variance.',
         box('targ', 400, 10, 190, 84, 'target F\nstable · biased', 'blue', size=19)),
    step('One dial between them: Σ_shrunk = δ F + (1 − δ) Σ̂. At δ = 0 you get the sample, at δ = 1 the target. Anything between blends every entry in the same proportion.',
         box('dial', 245, 18, 110, 68, 'δ', 'green', sub='0.00', size=20),
         arrow('samp', 'dial', None, 'red'), arrow('targ', 'dial', None, 'blue')),
    step('The lesson\'s sample matrix: covariances of 1.80, 0.90 and 2.10 between the three pairs of assets, from volatilities of 2, 3 and 1.5.',
         chart('ch', (10, 120, 580, 300), 'Off-diagonal covariances', [0.5, 3.5], [0, 2.6],
               [[0, '0'], [1, '1'], [2, '2']], XT, pl=40, pr=12),
         bars('sb', SAMP, 's', 'red')),
    step('The constant-correlation target puts 0.356 on every pair: 2.13, 1.07 and 1.60. It pulls the low correlations up and the high one down.',
         bars('fb', TARG, 'f', 'blue')),
    step('Turn the dial to δ = 0.30. Each entry moves 30% of the way from the sample to the target: 1.80 becomes 1.90, 0.90 becomes 0.95, 2.10 becomes 1.95.',
         dict(count='dial', **{'from': 0, 'to': 0.30, 'dp': 2, 'ms': 1000}),
         bars('xb', SHR, 'x', 'green')),
    step('The diagonal does not move. With this target each asset keeps its own variance, 4.00, 9.00 and 2.25. Only the correlation structure is pulled toward the average.',
         note('diag', 300, 446, 'variances 4.00 · 9.00 · 2.25: unchanged', 'green', 20)),
    step('Why a blend can beat both: the target adds a little bias, but removes a lot of noise. Squared error counts bias squared and variance in full, so the right mix has lower total error than either extreme.',
         box('bv', 10, 476, 580, 58, 'a little bias, a lot less noise → lower total error', 'purple', size=19)),
    step('Ledoit and Wolf\'s contribution: a formula for the best δ from the data alone. Noise in the sample, over how wrong the target is, divided by the history length. More history, less shrinkage.',
         box('lw', 10, 548, 580, 58, 'δ̂* ≈ (π̂ − ρ̂) ÷ γ̂ ÷ T, clipped to [0, 1]', 'green', size=20),
         dict(pulse='dial')),
    step('Why traders care: an optimiser inverts this matrix. Shrinkage pulls the smallest eigenvalues up and the largest down, so the inverse is calmer and the weights stop chasing noise.',
         box('opt', 10, 620, 285, 62, 'calmer inverse,\ncalmer weights', 'blue', size=18)),
    step('What it cannot do: fix a regime change inside the data window, or rescue a badly chosen target. It treats estimation noise, nothing more.',
         box('lim', 305, 620, 285, 62, 'not a cure for\nstructural breaks', 'red', size=18)),
])


BOARD = dict(name='institutional_ledoit_wolf_shrinkage', lesson='institutional-ledoit-wolf-shrinkage',
             title='Ledoit-Wolf: one dial between noise and bias', cfg=LW,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>',
             deck_after=8)
