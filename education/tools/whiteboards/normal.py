from ._wb import *
from math import erf, exp, gamma, pi, sqrt

# ── Descriptive stats & the normal distribution (primer-stats-normal) ─────────
# The lesson's worked example: six daily returns +1, +2, -1, +3, 0, +1 (%) -> mean 1.0%,
# deviations 0, 1, -2, 2, -1, 0 (sum 0), squares sum 10, s^2 = 10 / 5 = 2.0 (%)^2,
# s = 1.414%, best day z = (3 - 1) / 1.414 = 1.41. The 68 / 95 / 99.7 rule and "1-in-370-ish"
# for |z| > 3 are the lesson's. A 3-sigma day for this pair = 1.0 + 3 x 1.414 = 5.24%
# (exact arithmetic from the lesson's numbers). Fat tails: the lesson says real FX returns
# put more weight in the tails than the normal; the fat-tailed curve drawn here is an
# ILLUSTRATIVE shape only (a Student-t with 4 degrees of freedom rescaled to the same
# sigma), not fitted to any data. Bachelier 1900, Mandelbrot 1963, October 1987.
R = [1.0, 2.0, -1.0, 3.0, 0.0, 1.0]
MEAN = sum(R) / len(R)
DEV = [x - MEAN for x in R]
SS = sum(d * d for d in DEV)
S2 = SS / (len(R) - 1)
SD = sqrt(S2)
ZB = (max(R) - MEAN) / SD
assert MEAN == 1.0 and DEV == [0, 1, -2, 2, -1, 0] and SS == 10 and S2 == 2.0
assert round(SD, 3) == 1.414 and round(ZB, 2) == 1.41 and round(MEAN + 3 * SD, 2) == 5.24
def ncdf(z): return 0.5 * (1 + erf(z / sqrt(2)))
assert [round(100 * (2 * ncdf(k) - 1), 1) for k in (1, 2, 3)] == [68.3, 95.4, 99.7]
assert round(1 / (2 * (1 - ncdf(3)))) == 370

def npdf(z): return exp(-z * z / 2) / sqrt(2 * pi)
NU = 4; K = sqrt(NU / (NU - 2))                     # same variance as the normal
def tpdf(z):
    x = z * K
    return K * gamma((NU + 1) / 2) / (sqrt(NU * pi) * gamma(NU / 2)) * (1 + x * x / NU) ** (-(NU + 1) / 2)
def curve(f, a, b, n=80): return [[round(a + (b - a) * i / n, 3), round(f(a + (b - a) * i / n), 5)] for i in range(n + 1)]
def band(k): return dict(top=curve(npdf, -k, k, 60), bot=[[-k, 0], [k, 0]])

RC = (10, 10, 360, 250)      # the six days
BC = (10, 286, 580, 330)     # the bell
TC = (10, 636, 580, 236)     # tail zoom
ZT = [[-3, '−3σ'], [-2, '−2σ'], [-1, '−1σ'], [0, 'μ'], [1, '+1σ'], [2, '+2σ'], [3, '+3σ']]

NORMAL = dict(w=600, h=884, intro='Six days of returns, one bell curve, and what a "3σ day" really means. The lesson\'s worked example, step by step.', steps=[
    step('A currency pair\'s last six daily returns, in percent: +1, +2, −1, +3, 0, +1. Some up, some down, one flat. Two numbers will summarise them: a centre and a spread.',
         chart('ret', RC, 'Six daily returns (%)', [0.4, 7.9], [-1.8, 3.8], [[-1, '−1'], [0, '0'], [1, '1'], [2, '2'], [3, '3']],
               [[i + 1, f'{v:+.0f}' if v else '0'] for i, v in enumerate(R)], zero=True, pl=40, pr=10),
         dict(bars='rb', chart='ret', data=[[i + 1, v, '', 'green' if v > 0 else ('red' if v < 0 else None)] for i, v in enumerate(R)], bw=34, ms=1100),
         icon('dice', 'dice', 446, 40, 0.62, 'amber', 'each day: a new\nrandom draw', lsize=17)),
    step('The centre: add them up and divide by six. 6.0 ÷ 6 = a mean of 1.0%.',
         series('mean', 'ret', [[0.5, MEAN], [7.8, MEAN]], 'blue', dash=True, label='mean', lat=[7.8, MEAN], ldx=0, ldy=-12, lanchor='end'),
         move('dice', 446, 124, 600),
         box('mbox', 386, 14, 204, 70, '6.0 ÷ 6', 'blue', sub='x̄ = 1.0%', size=20)),
    step('The spread. Each day\'s distance from the mean is 0, +1, −2, +2, −1, 0. Those always add up to zero, so averaging them tells you nothing. Square them first: 0, 1, 4, 4, 1, 0, which sum to 10. A miss twice as big counts four times as much.',
         dict(hide='dice'),
         box('sq', 386, 100, 204, 70, 'squares: 0+1+4+4+1+0', None, sub='= 10', size=17)),
    step('Divide by n − 1 = 5, not 6, because the mean came from the same six numbers: variance 10 ÷ 5 = 2.0. Take the square root to get back to percent: σ ≈ 1.414%. That is one standard deviation.',
         box('sd', 386, 186, 204, 70, '√(10 ÷ 5)', 'purple', sub='σ = 0.000%', size=20),
         dict(count='sd', **{'from': 0, 'to': 1.414, 'dp': 3, 'pre': 'σ = ', 'suf': '%', 'ms': 1100}),
         series('up1', 'ret', [[0.5, MEAN + SD], [7.8, MEAN + SD]], 'purple', dash=True, label='+1σ', lat=[7.8, MEAN + SD], ldx=0, ldy=-12, lanchor='end'),
         series('dn1', 'ret', [[0.5, MEAN - SD], [7.8, MEAN - SD]], 'purple', dash=True, label='−1σ', lat=[7.8, MEAN - SD], ldx=0, ldy=14, lanchor='end')),
    step('The normal distribution, the bell curve, is drawn from just those two numbers: the mean μ sets where the peak sits, σ sets how wide it is. Most outcomes land near the middle; fewer and fewer far out.',
         chart('bell', BC, 'The bell curve, measured in σ from the mean', [-4, 4], [0, 0.56], [], ZT, pl=16, pr=16),
         series('pdf', 'bell', curve(npdf, -4, 4), None, ms=1400)),
    step('About 68% of outcomes fall within one σ of the mean: a normal, unremarkable day.',
         dict(gap='b1', chart='bell', tone='blue', op=0.4, **band(1)),
         cnote('n1', 'bell', [0, 0.17], '68%', 'blue', 24)),
    step('About 95% fall within two σ, and 99.7%, nearly everything, within three.',
         dict(gap='b2', chart='bell', tone='blue', op=0.2, **band(2)),
         dict(gap='b3', chart='bell', tone='blue', op=0.1, **band(3)),
         cnote('n2', 'bell', [-2.4, 0.25], '95%\nwithin ±2σ', 'blue', 18),
         cnote('n3', 'bell', [-3.05, 0.1], '99.7%\nwithin ±3σ', 'blue', 18)),
    step('Score the best day on that ruler. z = (3.0 − 1.0) ÷ 1.414 ≈ 1.41: it sits between the 1σ and 2σ marks. Noticeably above average, nowhere near a tail event.',
         dot('best', 'bell', [ZB, npdf(ZB)], 'best day\nz ≈ 1.41', 'green', dx=12, dy=-26, anchor='start'),
         dict(pulse='rb')),
    step('A "3σ day" is a move three standard deviations from the mean. For this pair that is 1.0 + 3 × 1.414 ≈ 5.2% in a day. If returns really were normal, moves beyond ±3σ would come only about 0.3% of the time: roughly 1 day in 370.',
         dot('three', 'bell', [3, npdf(3)], '3σ day\n≈ +5.2%', 'red', dx=8, dy=-46, anchor='start'),
         dict(pulse='b3')),
    step('Zoom in on the far right tail. On the normal curve, beyond 3σ the bell has all but touched zero.',
         chart('tail', TC, 'Zoom: the right tail (2σ to 5σ)', [2, 5], [0, 0.06], [],
               [[2, '2σ'], [3, '3σ'], [4, '4σ'], [5, '5σ']], pl=16, pr=16),
         series('tn', 'tail', curve(npdf, 2, 5, 60), None, label='normal', lat=[2.25, npdf(2.25)], ldx=10, ldy=-6, lanchor='start', ms=1000)),
    step('Real FX and equity returns have fatter tails: extreme moves turn up more often than the bell allows, so a z = 3 move happens more than 0.3% of the time. The red curve has the same σ but a fat-tailed shape (illustrative, not fitted).',
         series('tf', 'tail', curve(tpdf, 2, 5, 60), 'red', label='fat-tailed (illustrative)', lat=[4.1, tpdf(4.1)], ldx=0, ldy=-16, lanchor='middle', ms=1100),
         dict(gap='tg', chart='tail', top=curve(tpdf, 2.9, 5, 40), bot=curve(npdf, 2.9, 5, 40), tone='red', op=0.3),
         series('bf', 'bell', curve(tpdf, -4, 4), 'red', dash=True, ms=800)),
    step('Bachelier modelled prices with the normal in 1900; Mandelbrot showed in 1963 that real prices have fatter tails, and October 1987, a move of many standard deviations, made the point impossible to ignore. Use the bell as the ruler for z-scores, not as a promise about how often the tails will bite.',
         icon('warn', 'warn', 498, 676, 0.5, 'red'),
         dict(pulse='tg')),
])


BOARD = dict(name='normal', lesson='primer-stats-normal', title='Six days, one bell curve, and the 3σ day', cfg=NORMAL,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=10)
