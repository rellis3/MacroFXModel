from ._wb import *
from math import exp, sqrt, erf

# ── Carr-Madan: damp the price, transform once, read off every strike ────────
# Counts are the lesson's worked example: 200 strikes × 500 calibration parameter sets =
# 100,000 one-dimensional integrations the direct way, versus 500 FFT calls (200× fewer).
# N = 4096 is the lesson's "routine" FFT size; the grid rule N·η·λ = 2π is the lesson's.
# The price curves are ILLUSTRATIVE: a Black-Scholes call with spot 1, 20% vol, 1 year, zero
# rates, against log-strike k = ln K. The raw price heads to the spot (≈ 0.98 at k = −4) as the
# strike falls, so it never fades; the damped price e^{1.5k}·C(k) fades at both ends (drawn ×4).
N = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
def call(k, s=0.2, T=1.0):
    d1 = (-k + 0.5 * s * s * T) / (s * sqrt(T))
    return N(d1) - exp(k) * N(d1 - s * sqrt(T))
ALPHA = 1.5
KS = [round(-4 + i * 0.15, 2) for i in range(33)]
RAW = [[k, round(call(k), 4)] for k in KS]
DAMP = [[k, round(4 * exp(ALPHA * k) * call(k), 4)] for k in KS]
GRID = [round(-3.6 + i * 0.3, 2) for i in range(14)]      # an illustrative evenly spaced strike grid
assert round(call(-4), 2) == 0.98 and 200 * 500 == 100000

PR = (10, 140, 580, 250)
CMP = (10, 540, 380, 170)

CM = dict(w=600, h=720, intro='Pricing a whole strike curve at once: why the raw call price needs damping, and how one FFT replaces one integration per strike. Press play, or step through.', steps=[
    step('A model like Heston hands you a characteristic function: a closed-form fingerprint of where the price may end up. From it you can price one call at one strike with one numerical integration.',
         icon('fp', 'key', 14, 8, 0.8, 'blue', 'φ_T(u)', lsize=18),
         box('one', 160, 22, 190, 70, 'one strike =\none integration', 'blue', size=19),
         arrow('fp', 'one')),
    step('Calibration needs much more. Price 200 strikes, at each of 500 candidate parameter sets the optimizer tries: 200 × 500 = 100,000 separate integrations, for one expiry on one day.',
         box('cnt', 395, 22, 195, 70, '200 strikes × 500 sets', 'red', sub='0', size=17),
         dict(count='cnt', **{'from': 0, 'to': 100000, 'dp': 0, 'ms': 1400})),
    step('Carr and Madan wanted all strikes from one Fourier transform. The snag: as the strike falls towards zero, a call price heads up towards the spot price instead of fading. That curve has no clean transform.',
         chart('pr', PR, 'Call price vs log-strike k (illustrative)', [-4, 0.8], [0, 1.3], [[0.5, '0.5'], [1, '1']], [[-4, '−4'], [-2, '−2'], [0, 'k = 0']], pl=46),
         series('raw', 'pr', RAW, 'blue', ms=1200, label='raw price: never fades', lat=[-3.9, 0.98], ldx=0, ldy=-16, lanchor='start')),
    step('The fix: multiply by a damping factor e^(αk), here with α = 1.5. The damped price fades to zero at both ends (drawn four times taller so you can see it). The damping changes nothing about what the call is worth; it is undone at the end.',
         series('damp', 'pr', DAMP, 'green', ms=1200, label='damped (×4): fades both ends', lat=[-2.4, 0.42], ldx=0, ldy=-14, lanchor='middle')),
    step('The damped price has a clean, published transform, ψ_T(v). Only one piece of it depends on the model: the characteristic function, evaluated at a shifted point.',
         box('psi', 10, 420, 170, 76, 'ψ_T(v)\nbuilt from φ_T', 'amber', size=19),
         dict(pulse='fp')),
    step('Turning ψ_T back into prices is an integral over v. Lay it on an evenly spaced grid and that integral becomes exactly a discrete Fourier transform, the shape the FFT computes in N log N steps.',
         box('fft', 215, 420, 150, 76, 'one FFT', 'purple', sub='N log N', size=20),
         arrow('psi', 'fft')),
    step('One FFT call returns the price at every grid strike at once. Undo the damping with e^(−αk) and you have the whole curve, not one point.',
         box('grid', 400, 420, 190, 76, 'every strike\nat once', 'green', size=19),
         arrow('fft', 'grid'),
         *[dot(f'g{i}', 'pr', [k, round(call(k), 4)], '', 'green', r=5) for i, k in enumerate(GRID)]),
    step('Back to the count. The direct way: 100,000 integrations. Carr-Madan: one FFT per parameter set, 500 calls. That is 200 times fewer pricing calls, exactly the strike count, before counting how cheap each FFT is.',
         chart('cmp', CMP, 'Pricing calls in one calibration', [0.4, 2.6], [0, 110000], [[50000, '50k'], [100000, '100k']], [[1, 'direct'], [2, 'FFT']], pl=52),
         dict(bars='cb', chart='cmp', data=[[1, 100000, '100,000', 'red'], [2, 500, '500', 'green']], bw=60, ms=1200)),
    step('It is not free. The grid spacing in v (η) and in log-strike (λ) are tied by N·η·λ = 2π. A finer strike grid forces a wider frequency range, so α, η and λ all need tuning. N = 4096 is a routine size even for 200 strikes.',
         note('tr', 300, 122, 'N · η · λ = 2π: finer strikes cost frequency range', 'amber', 18)),
    step('And it only works when the model has a closed-form characteristic function: Heston, Bates, variance gamma. A model without one has nothing to feed in, and falls back to Monte Carlo or a PDE solve.',
         box('lim', 400, 540, 190, 170, 'needs φ_T\nin closed form\n\nno φ_T:\nMonte Carlo / PDE', 'red', size=17)),
])


BOARD = dict(name='fft_option_pricing_carr_madan', lesson='fft-option-pricing-carr-madan', title='Damp it, transform it, read off every strike', cfg=CM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=9)
