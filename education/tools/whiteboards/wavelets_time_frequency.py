from ._wb import *
import numpy as np

# ── Which cycles, and when (wavelets-time-frequency) ─────────────────────────
# A synthetic two-regime series (illustrative, computed here): 256 steps, a period-8 cycle for the
# first 128 steps, then a period-32 cycle. Its periodogram (|X|^2/N) has two equal spikes of 16.0 at
# periods 8 and 32, with no timing. Morlet (w0 = 6) wavelet power at the period-8 and period-32
# scales, each shown relative to its own maximum, switches over at step 128; the long-scale power
# fades near the end of the sample, the cone of influence.
# The Haar part is the lesson's worked example: x = [0.10, -0.10, 0.05, -0.05, 3.00, -0.05, 0.05, -0.10],
# details d = [0.100, 0.050, 1.525, 0.075].
N = 256
t = np.arange(N)
x = np.where(t < 128, np.sin(2 * np.pi * t / 8), np.sin(2 * np.pi * t / 32))
I = np.abs(np.fft.fft(x)) ** 2 / N
assert round(float(I[32]), 1) == 16.0 and round(float(I[8]), 1) == 16.0
PG = [[round(k / N, 4), round(float(I[k]), 3)] for k in range(0, 49)]

def mpow(P):
    a = P / 1.033; tt = np.arange(-4 * a, 4 * a + 1)
    psi = np.pi ** -0.25 * np.exp(1j * 6 * tt / a) * np.exp(-0.5 * (tt / a) ** 2) / np.sqrt(a)
    p = np.abs(np.convolve(x, np.conj(psi)[::-1], mode='same')) ** 2
    return p / p.max()
S8, S32 = mpow(8), mpow(32)
E8 = [[int(i), round(float(S8[i]), 3)] for i in range(0, N, 4)]
E32 = [[int(i), round(float(S32[i]), 3)] for i in range(0, N, 4)]
TS = [[int(i), round(float(x[i]), 3)] for i in range(N)]

HX = [0.10, -0.10, 0.05, -0.05, 3.00, -0.05, 0.05, -0.10]
D = [round((HX[2 * i] - HX[2 * i + 1]) / 2, 3) for i in range(4)]
assert D == [0.1, 0.05, 1.525, 0.075]

WAV = dict(w=600, h=790, intro='Why "which cycles" is not enough, and how a short, stretchable ripple adds "when". Press play, or step through.', steps=[
    step('A made-up series in two halves: a fast cycle, every 8 steps, for the first 128 steps, then a slow cycle, every 32 steps, for the rest.',
         chart('ts', (10, 10, 580, 190), 'The series: fast cycle, then slow cycle', [0, 256], [-1.3, 1.5], [[-1, '−1'], [0, '0'], [1, '1']],
               [[0, '0'], [128, '128'], [256, '256']], zero=True, pl=40),
         series('xs', 'ts', TS, 'blue', ms=1600)),
    step('Its periodogram shows two equal spikes, at periods 8 and 32. It cannot say that one cycle ran first and the other second: a series with both cycles all the way through would look much the same.',
         chart('pg', (10, 214, 280, 230), 'Periodogram', [0, 0.19], [0, 18.5], [[0, '0'], [16, '16']],
               [[1 / 32, '1/32'], [0.125, '1/8']], pl=36, pr=12),
         series('pgs', 'pg', PG, 'purple', ms=1200),
         cnote('pgn', 'pg', [0.08, 12], 'no "when"', 'red', 17)),
    step('A wavelet is a short ripple that switches itself off. Slide a small, fast one along the series and record how well it matches at each step.',
         chart('en', (310, 214, 280, 230), 'Wavelet power over time', [0, 256], [0, 1.25], [[0, '0'], [1, 'max']],
               [[0, '0'], [128, '128'], [256, '256']], pl=40, pr=12),
         series('e8', 'en', E8, 'green', ms=1500, label='fast', lat=[64, 1.0], ldy=-12)),
    step('The fast ripple lights up for the first half only, and goes dark once the fast cycle stops at step 128.',
         dict(pulse='e8'),
         series('cut', 'ts', [[128, -1.3], [128, 1.5]], 'red', dash=True, ms=500)),
    step('Stretch the ripple to match the slow cycle and slide it again. Now the second half lights up. That is the scalogram idea: which cycle, and when.',
         series('e32', 'en', E32, 'amber', ms=1500, label='slow', lat=[192, 1.0], ldy=-12)),
    step('Look at the right-hand end: the slow ripple fades before the data does, though the slow cycle never stops. Near the edges the ripple hangs off the data. That is the cone of influence: trust edge readings less.',
         dict(gap='coi', chart='en', top=[[212, 1.2], [256, 1.2]], bot=[[212, 0], [256, 0]], tone='amber', op=0.22),
         cnote('coil', 'en', [234, 0.12], 'edge', 'amber', 16)),
    step('Now the lesson\'s worked example: eight daily returns, all tiny except a 3.00% shock at step 4.',
         chart('hx', (10, 460, 280, 230), 'Returns (%)', [-0.6, 7.6], [-0.4, 3.5], [[0, '0'], [3, '3']],
               [[0, '0'], [4, '4'], [7, '7']], zero=True, pl=36),
         dict(bars='hxb', chart='hx', data=[[i, v, '3.00' if i == 4 else '', 'red' if i == 4 else 'blue'] for i, v in enumerate(HX)], bw=22, ms=900)),
    step('Haar: pair the days up and take half the difference of each pair. Three pairs give 0.100 or less. Pair 3, steps 4 and 5, gives 1.525: more than ten times the rest, right where the shock is.',
         chart('hd', (310, 460, 280, 230), 'Haar details', [0.4, 4.6], [0, 1.8], [[0, '0'], [1.5, '1.5']],
               [[1, '1'], [2, '2'], [3, '3'], [4, '4']], pl=36),
         dict(bars='hdb', chart='hd', data=[[i + 1, d, f'{d:.3f}', 'red' if i == 2 else 'blue'] for i, d in enumerate(D)], bw=34, ms=1000)),
    step('There is no free lunch. A step-shaped Haar wavelet pins down a jump sharply in time but blurs frequency. A smooth Morlet wavelet separates nearby cycles well but blurs timing.',
         box('haar', 10, 704, 280, 80, 'Haar: sharp in time', 'red', size=19),
         box('mor', 310, 704, 280, 80, 'Morlet: sharp in frequency', 'green', size=19)),
    step('And a big map has many cells, so some will light up by chance. A bright patch is a hint to test, not a signal. Wavelets tell you which cycles, and roughly when.',
         dict(pulse='e8'), dict(pulse='e32'), dict(pulse='hdb')),
])


BOARD = dict(name='wavelets_time_frequency', lesson='wavelets-time-frequency', title='Wavelets: which cycles, and when', cfg=WAV,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
