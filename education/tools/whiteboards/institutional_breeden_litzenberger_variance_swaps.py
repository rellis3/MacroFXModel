from ._wb import *
from math import exp, log, sqrt, pi

# ── Breeden-Litzenberger and the variance strip (institutional-breeden-litzenberger-variance-swaps) ──
# The lesson's worked examples: S0 = 100, r = 2%, T = 0.5, prices from a flat 20% Black-Scholes world.
# Part 1: C(95) 8.9470, C(100) 6.1207, C(105) 3.9856, h = 5 -> f_Q(100) ≈ 0.027926 (true 0.028209).
# Part 2: OTM strip 80..120, dK = 10, K0 = 100, F ≈ 101.005 -> variance 0.042520, vol 20.62%;
# the lesson's finer grid (40..160 step 5) gives 20.21%.
S0, R, T, SIG = 100, 0.02, 0.5, 0.2
C95, C100, C105, H = 8.9470, 6.1207, 3.9856, 5
FLY = C95 - 2 * C100 + C105
DENS = exp(R * T) * FLY / H ** 2
assert round(FLY, 4) == 0.6912 and round(DENS, 6) == 0.027926
M, V = log(S0) + (R - SIG ** 2 / 2) * T, SIG * sqrt(T)
def fq(x): return exp(-(log(x) - M) ** 2 / (2 * V * V)) / (x * V * sqrt(2 * pi))
assert round(fq(100), 6) == 0.028209
DENS_PTS = [[k, round(fq(k), 5)] for k in range(64, 151, 4)]
Q = {80: 0.2601, 90: 1.5584, 100: 5.6231, 110: 2.4729, 120: 0.8311}
F = 101.005
CON = {k: 10 / k ** 2 * exp(R * T) * q for k, q in Q.items()}
assert [round(CON[k], 6) for k in sorted(Q)] == [0.00041, 0.001943, 0.00568, 0.002064, 0.000583]
VAR = 2 / T * sum(CON.values()) - (F / 100 - 1) ** 2 / T
assert round(VAR, 4) == 0.0425 and round(sqrt(VAR) * 100, 2) == 20.62
TONE = {80: 'blue', 90: 'blue', 100: 'purple', 110: 'green', 120: 'green'}

BL = dict(w=600, h=740, intro="Three call prices give a probability; five out-of-the-money options give a fair variance. Both from the lesson's own numbers, with no volatility model. Press play, or step through.", steps=[
    step('Three call prices on the same expiry, from the lesson: strike 95 costs $8.9470, strike 100 costs $6.1207, strike 105 costs $3.9856. Each one alone gives you one implied vol. Together they give much more.',
         chart('cp', (10, 10, 285, 230), 'Call prices ($)', [91, 109], [0, 10.5],
               [[0, '0'], [5, '5'], [10, '10']], [[95, '95'], [100, '100'], [105, '105']], pl=36, pr=10),
         dict(bars='cpb', chart='cp', data=[[95, C95, '8.95', 'blue'], [100, C100, '6.12', 'purple'], [105, C105, '3.99', 'blue']], bw=34, ms=1000)),
    step('Build a butterfly: buy the 95 and 105 calls, sell two 100 calls. It pays only if the price ends between 95 and 105, most at exactly 100. A bet on "landing here".',
         dict(hide='cp'), dict(hide='cpb'),
         chart('pay', (10, 10, 285, 230), 'Butterfly payoff ($)', [85, 115], [0, 6.2],
               [[0, '0'], [5, '5']], [[95, '95'], [100, '100'], [105, '105']], pl=32, pr=10),
         series('tent', 'pay', [[85, 0], [95, 0], [100, 5], [105, 0], [115, 0]], 'amber', ms=1200)),
    step('Its price: 8.9470 − 2 × 6.1207 + 3.9856 = $0.6912. Divide by the strike gap squared, 25, and undo the half-year discount: the density at 100 is about 0.0279.',
         box('bf', 10, 254, 580, 56, 'butterfly $0.6912 ÷ 25 × e^0.01 ≈ 0.0279', 'amber', size=20)),
    step('Here is the true density of the price at expiry in this flat 20% world. Its height at 100 is 0.0282. The butterfly got within about 1%, and narrower wings would close the gap: the curvature of call prices is the probability.',
         chart('den', (305, 10, 285, 230), 'Density of price at expiry', [60, 150], [0, 0.032],
               [[0, '0'], [0.015, '.015'], [0.03, '.03']], [[70, '70'], [100, '100'], [130, '130']], pl=44, pr=10),
         series('dc', 'den', DENS_PTS, 'purple', ms=1300),
         dot('d100', 'den', [100, round(fq(100), 5)], '0.0282', 'green', dx=12, dy=-12, anchor='start')),
    step('Part 2. A variance swap pays realised variance against a fixed strike. Pricing it sounds like it needs a volatility forecast. It does not: today\'s options already price it.',
         dict(dim='bf'), dict(dim='tent'), dict(dim='dc')),
    step('The trick: a contract paying the log of the final price pays expected variance, if prices move smoothly. You cannot buy it, but you can build it from out-of-the-money puts and calls at every strike, each weighted by 1/K².',
         note('lw', 300, 336, 'log contract = OTM puts + calls, weighted 1/K²', 'purple', 20)),
    step('The lesson\'s strip: puts at 80 and 90, the average of put and call at 100, calls at 110 and 120. Weight each price by ΔK/K² and multiply by e^(rT). The middle strike counts most.',
         chart('st', (10, 360, 285, 250), 'Weighted contributions', [74, 126], [0, 0.0066],
               [[0, '0'], [0.003, '.003'], [0.006, '.006']], [[80, '80'], [90, '90'], [100, '100'], [110, '110'], [120, '120']], pl=46, pr=10),
         dict(bars='stb', chart='st', data=[[k, round(CON[k], 6), '', TONE[k]] for k in sorted(Q)], bw=30, ms=1200)),
    step('Add them up: 0.010681. Times 2/T is 0.042722; subtract a small forward correction of 0.000202. Fair variance 0.04252, so fair vol is about 20.62%.',
         box('fv', 305, 360, 285, 96, 'fair vol ≈ 20.62%', 'green', sub='true: 20%', size=21)),
    step('Why not exactly 20%? Only five strikes, ten apart. The lesson reruns it on strikes from 40 to 160, five apart, and gets 20.21%. Real markets list a finite range, so some truncation error always remains. CBOE\'s VIX, since 2003, is a discrete strip just like this.',
         box('fg', 305, 470, 285, 96, 'finer, wider grid:\n20.21%', 'blue', size=20)),
    step('Two catches. Differencing prices twice amplifies noise, so a negative density means bad or stale quotes, never a negative probability. And the log-contract result assumes no jumps.',
         box('n1', 10, 630, 285, 62, 'negative density\n= bad data', 'red', size=18),
         box('n2', 305, 630, 285, 62, 'jumps: the strip\nmisses a residual', 'red', size=18)),
    step('Read the whole strike ladder, not one option: its curvature is the market\'s probability, and its 1/K² strip is the market\'s fair variance.',
         note('end', 300, 716, 'model-free: only arbitrage-free prices needed', 'green', 19)),
])


BOARD = dict(name='institutional_breeden_litzenberger_variance_swaps', lesson='institutional-breeden-litzenberger-variance-swaps',
             title='Option prices to probabilities, and to fair variance', cfg=BL,
             before='  <div class="tl-section-mark"><span>Section 06</span></div>',
             deck_after=9)
