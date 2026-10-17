from ._wb import *
from math import log2

# ── Hurst exponent & variance ratio (hurst-variance-ratio) ────────────────────
# Range growth uses the lesson's power law (R/S)_n ≈ c·n^H with c = 1, so every point is
# exact arithmetic: at n = 64, 64^0.3 ≈ 3.5, 64^0.5 = 8, 64^0.7 ≈ 18.4. The log-log points
# are log2 of the same numbers, so each line's slope is exactly H. The variance-ratio bars
# are the lesson's worked example: Var(r1) = 0.1289, q = 5, yardstick 5 × 0.1289 = 0.6445,
# actual 0.45 (VR ≈ 0.70) or 0.95 (VR ≈ 1.47).
NS = list(range(0, 65, 2))
def _range(h): return [[n, round(n ** h, 3)] for n in NS]
def _loglog(h): return [[log2(n), round(h * log2(n), 3)] for n in (8, 16, 32, 64)]
VAR1 = 0.1289
YARD = round(5 * VAR1, 4)                 # 0.6445
VR_A, VR_B = round(0.45 / YARD, 2), round(0.95 / YARD, 2)   # 0.70, 1.47

RA = (10, 150, 580, 250)
LL = (10, 418, 280, 222)
VB = (310, 418, 280, 222)

HURST = dict(w=600, h=830, intro='Three walkers, one question: does the path have memory? First the Hurst exponent, then the variance ratio, on the lesson\'s own numbers. Press play, or step through.', steps=[
    step('Three people leave a bar. The first steps at random, each step a coin flip with no memory. The second keeps stumbling the same way: momentum. The third is on a leash held by a friend at the door: every stumble gets pulled back.',
         icon('rw', 'person', 50, 4, 0.7, None, 'random\nno memory', lsize=17),
         icon('tr', 'person', 265, 4, 0.7, 'red', 'stumbler\nmomentum', lsize=17),
         icon('mr', 'person', 480, 4, 0.7, 'blue', 'on a leash\npulled back', lsize=17)),
    step('The random walker\'s distance from the door grows with the square root of the steps. After 64 steps the typical swing is about √64 = 8. That is the Hurst exponent H = 0.5: range grows as n to the power 0.5.',
         chart('rg', RA, 'How far the walk swings: range ∝ n^H', [0, 64], [0, 20],
               [[0, '0'], [8, '8'], [16, '16']], [[8, '8'], [16, '16'], [32, '32'], [64, '64']], pl=44, pr=112),
         series('h5', 'rg', _range(0.5), None, ms=1300, label='H 0.5: 8', lat=[64, 8], ldx=6, ldy=0, lanchor='start'),
         dict(pulse='rw')),
    step('The stumbler\'s moves reinforce each other, so the swing grows faster than the square root. With H = 0.7 the range after 64 steps is about 18, more than twice the random walker\'s.',
         series('h7', 'rg', _range(0.7), 'red', ms=1300, label='H 0.7: 18', lat=[64, 18.4], ldx=6, ldy=0, lanchor='start'),
         dict(pulse='tr')),
    step('The leashed walker keeps getting pulled back, so the swing grows slower than the square root. With H = 0.3 it is only about 3.5 after 64 steps. Same number of steps, three very different spreads.',
         series('h3', 'rg', _range(0.3), 'blue', ms=1300, label='H 0.3: 3.5', lat=[64, 3.48], ldx=6, ldy=0, lanchor='start'),
         dict(pulse='mr')),
    step('To measure H from data, compute the rescaled range R/S on windows of 8, 16, 32 and 64 bars, then plot log of R/S against log of n. A power law becomes a straight line, and its slope is H.',
         chart('ll', LL, 'log(R/S) vs log n', [2.5, 6.5], [0, 4.6], [[1, '1'], [2, '2'], [3, '3'], [4, '4']],
               [[3, '8'], [4, '16'], [5, '32'], [6, '64']], pl=36, pr=46, size=18),
         series('l5', 'll', _loglog(0.5), None, ms=900, label='0.5', lat=[6, 3.0], ldx=6, ldy=0, lanchor='start'),
         series('l7', 'll', _loglog(0.7), 'red', ms=900, label='0.7', lat=[6, 4.2], ldx=6, ldy=0, lanchor='start'),
         series('l3', 'll', _loglog(0.3), 'blue', ms=900, label='0.3', lat=[6, 1.8], ldx=6, ldy=0, lanchor='start')),
    step('The variance ratio asks the same question more directly. If days are independent, variance just adds up: five days should have exactly five times the one-day variance. With the lesson\'s 0.1289, the yardstick is 5 × 0.1289 = 0.6445.',
         chart('vb', VB, 'Five-day variance, %²', [0.4, 3.6], [0, 1.15], [[0.5, '0.5'], [1, '1.0']],
               [[1, 'yardstick'], [2, 'case A'], [3, 'case B']], pl=40, pr=10, size=18),
         dict(bars='by', chart='vb', data=[[1, YARD, '0.64', 'purple']], bw=40, ms=900)),
    step(f'Case A: the real five-day variance is 0.45. VR(5) = 0.45 ÷ 0.6445 ≈ {VR_A:.2f}. Below 1: the days are cancelling each other out, which is mean reversion, the leash.',
         dict(bars='ba', chart='vb', data=[[2, 0.45, f'VR {VR_A:.2f}', 'blue']], bw=40, ms=900),
         dict(pulse='mr')),
    step(f'Case B: the real five-day variance is 0.95. VR(5) = 0.95 ÷ 0.6445 ≈ {VR_B:.2f}. Above 1: the days are teaming up, 47% more variance than independence allows. That is trending, the stumbler.',
         dict(bars='bb', chart='vb', data=[[3, 0.95, f'VR {VR_B:.2f}', 'red']], bw=40, ms=900),
         dict(pulse='tr')),
    step('Why the variance ratio is the one to trust more: Lo and MacKinlay (1988) gave it a standard error and a z-statistic, so you can ask whether a gap from 1 is real or just noise. A Hurst slope is eyeballed.',
         box('se', 10, 660, 186, 112, 'VR has a\nstandard error:\nreal or noise?', 'green', size=18)),
    step('The trap: on short windows, R/S is biased towards finding H above 0.5 even in a pure random walk. A reading from a few dozen bars can flip across 0.5 on noise alone.',
         box('bias', 207, 660, 186, 112, 'short window:\nR/S leans to\n"trending"', 'red', size=18)),
    step('And persistence comes and goes. Trend followers did well in 2008 and very well in 2022, and had a long lean stretch through much of the 2010s, with the same rules. A full-sample H can hide all of that.',
         box('epi', 404, 660, 186, 112, '2008 · 2022: on\n2010s: mostly off', 'amber', size=18)),
    step('So treat H and the variance ratio as a gate, not a forecast. They say whether fade or follow has any right to work right now. They never say which way the next move goes.',
         note('end', 300, 806, 'a gate for fade or follow, never a forecast of direction', 'green', 19)),
])


BOARD = dict(name='hurst_variance_ratio', lesson='hurst-variance-ratio', title='Three walkers and the variance ratio, drawn step by step', cfg=HURST,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: trend following',
             deck_after=6)
