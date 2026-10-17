from ._wb import *
import numpy as np

# ── How the Fourier transform finds a cycle (fourier-analysis-frequency-domain) ──
# Worked example from the lesson: N = 10, x_t = cos(2*pi*2*t/10): a period-5 cycle.
#   Products with the k = 2 test wave are all >= 0 and sum to X(2) = 5; with k = 3 they sum to 0.
#   Periodogram I(k) = |X(k)|^2 / N: I(2) = I(8) = 2.5, zero elsewhere.
# The noise steps use simulated white noise (numpy seed 7, unit variance), labelled as such:
#   raw periodogram of 100 points (bars swing from 0.07 to 2.88; true level 1), and the average of
#   the periodograms of 10 segments of 20 points (0.45 to 1.09).
N = 10
t = np.arange(N)
x = np.cos(2 * np.pi * 2 * t / N)
P2 = x * np.cos(2 * np.pi * 2 * t / N)
P3 = x * np.cos(2 * np.pi * 3 * t / N)
assert abs(P2.sum() - 5) < 1e-9 and abs(P3.sum()) < 1e-9
I = np.abs(np.fft.fft(x)) ** 2 / N
assert abs(I[2] - 2.5) < 1e-9
fine = np.linspace(0, 9, 91)
def wave(k): return [[round(float(s), 2), round(float(np.cos(2 * np.pi * k * s / N)), 3)] for s in fine]
XS = [[int(i), round(float(v), 3)] for i, v in zip(t, x)]

rng = np.random.default_rng(7)
w = rng.standard_normal(200)
RAW = np.abs(np.fft.fft(w[:100])) ** 2 / 100
AVG = np.mean(np.abs(np.fft.fft(w.reshape(10, 20), axis=1)) ** 2 / 20, axis=0)
RAWP = [[round(k / 100, 3), round(float(RAW[k]), 3)] for k in range(1, 51)]
AVGP = [[round(k / 20, 3), round(float(AVG[k]), 3)] for k in range(1, 11)]
KMAX = int(np.argmax(RAW[1:50])) + 1     # 33 -> a period of about 3 days, pure noise
assert KMAX == 33

def bars(id, ch, prods, tone_fn):
    return dict(bars=id, chart=ch, data=[[int(i), round(float(p), 3), '', tone_fn(p)] for i, p in enumerate(prods)], bw=26, ms=1000)

FOUR = dict(w=600, h=800, intro='How the transform finds a hidden cycle, using the lesson\'s ten-point example, then what happens on noise. Press play, or step through.', steps=[
    step('Two trading weeks of a series with a day-of-week pattern: 1.000, 0.309, −0.809, −0.809, 0.309, and then the same five again. To the eye, just a wiggle.',
         chart('ts', (10, 10, 580, 230), 'The series, 10 steps', [-0.5, 9.5], [-1.3, 1.45], [[-1, '−1'], [0, '0'], [1, '1']],
               [[0, '0'], [5, '5'], [9, '9']], zero=True, pl=40),
         series('xs', 'ts', XS, 'blue', ms=1300),
         *[dot(f'd{i}', 'ts', p, '', 'blue') for i, p in enumerate(XS)]),
    step('The question for one speed at a time: does the series contain a wave that does 2 cycles in 10 steps? Hold that test wave against it.',
         series('w2', 'ts', wave(2), 'green', dash=True, ms=900),
         cnote('w2l', 'ts', [9.4, 1.2], 'test: 2 cycles', 'green', 17, 'end')),
    step('Multiply the two, step by step. Every product is zero or positive, because the test wave matches the series. They add up to 5.',
         chart('pr', (10, 256, 580, 236), 'Series × test wave, each step', [-0.5, 9.5], [-1.2, 1.3], [[-1, '−1'], [0, '0'], [1, '1']],
               [[0, '0'], [5, '5'], [9, '9']], zero=True, pl=40),
         bars('p2', 'pr', P2, lambda p: 'green'),
         box('sum', 420, 276, 160, 60, 'sum', 'green', sub='5', size=18)),
    step('Now test a wave that does 3 cycles in 10 steps. The products swing positive and negative, and they cancel exactly: the sum is 0. That speed is not in the series.',
         dict(hide='w2'), dict(hide='w2l'), dict(hide='p2'),
         series('w3', 'ts', wave(3), 'red', dash=True, ms=900),
         cnote('w3l', 'ts', [9.4, 1.2], 'test: 3 cycles', 'red', 17, 'end'),
         bars('p3', 'pr', P3, lambda p: 'green' if p >= 0 else 'red'),
         dict(count='sum', **{'from': 5, 'to': 0, 'dp': 0, 'ms': 900})),
    step('Do that for every speed and square each total, divided by the 10 steps. That is the periodogram: 5² / 10 = 2.5 at speed 2, and exactly 0 everywhere else.',
         dict(hide='w3'), dict(hide='w3l'),
         chart('pg', (10, 510, 280, 280), 'Periodogram, k = 0 to 5', [-0.6, 5.6], [0, 3.1], [[0, '0'], [2.5, '2.5']],
               [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], pl=44),
         dict(bars='pgb', chart='pg', data=[[k, round(float(I[k]), 3), '2.5' if k == 2 else '', 'red' if k == 2 else 'blue'] for k in range(6)], bw=26, ms=1000)),
    step('One spike, at 2 cycles in 10 steps: a cycle every 10 / 2 = 5 steps. The transform found the 5-day pattern without being told it was there.',
         cnote('per', 'pg', [2.4, 2.75], 'period 5', 'red', 18, 'start')),
    step('Real returns look more like noise. Here is simulated white noise, 100 points. Its raw periodogram jumps around the true flat level of 1, from 0.07 up to 2.88.',
         chart('wn', (310, 510, 280, 280), 'Noise: raw periodogram', [0, 0.5], [0, 3.2], [[0, '0'], [1, '1'], [2, '2'], [3, '3']],
               [[0, '0'], [0.25, '0.25'], [0.5, '0.5']], pl=36, pr=14),
         series('raw', 'wn', RAWP, 'amber', ms=1500),
         series('one', 'wn', [[0, 1], [0.5, 1]], 'blue', dash=True, ms=500)),
    step('Its tallest bar, at a period of about 3 steps, is pure noise. Each raw bar is roughly chi-squared with 2 degrees of freedom, and more data does not make any one bar less noisy.',
         dot('pk', 'wn', [KMAX / 100, round(float(RAW[KMAX]), 3)], 'noise, not a cycle', 'red', dx=-6, dy=-14, anchor='end')),
    step('The fix: cut the noise into 10 segments, compute a periodogram for each, and average them. The averaged spectrum stays between 0.45 and 1.09, close to the flat truth. A noise spike melts; a real cycle would survive.',
         dict(dim='raw'),
         series('avg', 'wn', AVGP, 'green', ms=1200),
         dict(pulse='one')),
    step('This is the classic finding for raw stock and FX returns, going back to Granger and Morgenstern in 1963: a spectrum close to flat. The tool earns its keep on volume, volatility and seasonal series.',
         note('gm', 300, 500, 'raw returns: close to flat', 'amber', 18)),
    step('One thing it can never say: when. The periodogram pools the whole sample, so a cycle that ran only in the first week looks like one that ran all year. Wavelets fix that.',
         dict(hide='gm'),
         note('wh', 300, 500, 'which cycles, how strong, never when', 'purple', 18),
         dict(pulse='pgb')),
])


BOARD = dict(name='fourier_analysis_frequency_domain', lesson='fourier-analysis-frequency-domain', title='How the Fourier transform finds a cycle', cfg=FOUR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
