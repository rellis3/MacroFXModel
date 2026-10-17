from ._wb import *
import random
from math import sin, sqrt

# ── Itô's Lemma (ito-lemma) ───────────────────────────────────────────────────
# Paths: ONE simulated Brownian path on [0, 1] with 256 steps (fixed seed, illustrative)
# and a smooth curve x(t) = 0.6 sin 3t. The sums of squared changes (quadratic variation)
# are computed exactly on those two paths: the Brownian sum stays near the elapsed time 1,
# the smooth sum halves each time the step halves (towards 0).
# Lesson numbers: S0 = K = 100, r = 2%, sigma = 20%, T = 1 -> sigma^2/2 = 0.02, drift 0,
# d2 = 0.00, d1 = 0.20; +10% then -10% -> 0.99; log drift r - sigma^2/2 against sigma.
N = 256
_r = random.Random(57)
W = [0.0]
for _ in range(N): W.append(W[-1] + _r.gauss(0, sqrt(1 / N)))
def sm(t): return 0.6 * sin(3 * t)
BPATH = [[round(i / N, 4), round(W[i], 3)] for i in range(0, N + 1, 2)]
SPATH = [[round(i / 64, 4), round(sm(i / 64), 3)] for i in range(65)]
ZB = [[round(i / N, 5), round(W[i], 4)] for i in range(17)]                 # first 1/16 of the path
ZS = [[round(i / N, 5), round(sm(i / N), 4)] for i in range(17)]
ZLO, ZHI = min(v for _, v in ZB + ZS), max(v for _, v in ZB + ZS)

def _qv(path, n):
    st = N // n
    return sum((path[(i + 1) * st] - path[i * st]) ** 2 for i in range(n))
SMG = [sm(i / N) for i in range(N + 1)]
KS = range(3, 9)                                                              # 8 ... 256 steps
QB = [[k, round(_qv(W, 2 ** k), 3)] for k in KS]
QS = [[k, round(_qv(SMG, 2 ** k), 4)] for k in KS]
QB_LO, QB_HI = min(v for _, v in QB), max(v for _, v in QB)
DRIFT = [[s / 100, round(100 * (0.02 - (s / 100) ** 2 / 2), 3)] for s in range(0, 41, 2)]

P1 = (10, 10, 580, 196)
P2 = (10, 216, 280, 196)
P3 = (310, 216, 280, 196)
P4 = (10, 576, 580, 190)

ITO = dict(w=600, h=780, intro='Why a random path needs a different chain rule, and where Black-Scholes\'s σ²/2 comes from. One simulated path plus the lesson\'s own numbers. Press play, or step through.', steps=[
    step('Two paths over one unit of time: a smooth curve (blue) and one simulated Brownian path (red), the kind of path a price follows in the Black-Scholes model.',
         chart('p1', P1, 'A smooth curve and one random path', [0, 1], [-0.75, 0.75], [[0, '0']], [[0, '0'], [0.5, '½'], [1, '1']], zero=True, pl=30, pr=14),
         series('sp', 'p1', SPATH, 'blue', ms=1100),
         series('bp', 'p1', BPATH, 'red', ms=1500)),
    step('Zoom in 16 times on the first sliver of time. The smooth curve becomes a straight line, which is what ordinary calculus relies on. The random path is just as jagged as before.',
         chart('p2', P2, 'Zoom 16×: first 1/16', [0, 1 / 16], [ZLO - 0.02, ZHI + 0.02], [], [], pl=14, pr=14),
         series('zs', 'p2', ZS, 'blue', ms=700),
         series('zb', 'p2', ZB, 'red', ms=900)),
    step(f'Add up the squared changes over the whole interval, with finer and finer steps. For the smooth curve the sum halves every time the step halves, heading to zero. For the random path it stays near 1, the elapsed time: {QB_LO} to {QB_HI} here.',
         chart('p3', P3, 'Sum of squared changes', [2.6, 8.4], [0, 1.2], [[0, '0'], [1, '1']], [[3, '8'], [5, '32'], [7, '128 steps']], pl=30, pr=16),
         series('qb', 'p3', QB, 'red', ms=900, label='random ≈ 1', lat=[3, QB[0][1]], ldx=4, ldy=-14, lanchor='start', lsize=17),
         series('qs', 'p3', QS, 'blue', ms=900, label='smooth → 0', lat=[8, QS[-1][1]], ldx=-2, ldy=-14, lanchor='end', lsize=17)),
    step('That is the one strange fact, written (dW)² = dt. A random step is about the square root of dt, so its square is about dt itself: with dt = 0.01, about 0.01, not the 0.0001 a smooth step gives.',
         box('qv', 20, 428, 560, 64, '(dW)² = dt     not 0', 'amber', size=24)),
    step('Ordinary calculus expands df = f′ dX + ½ f″ (dX)² and drops the last term. For dX = μ dt + σ dW, that term is ½ f″ σ² dt: the same order as the drift. It has to stay.',
         box('tay', 20, 502, 560, 64, 'df = f′ dX + ½ f″ (dX)²,   (dX)² = σ² dt', 'purple', size=20)),
    step('Collect the terms and that is Itô\'s Lemma: the ordinary chain rule plus exactly one extra drift term, ½ f″ σ².',
         dict(hide='qv'), dict(hide='tay'),
         box('ito', 20, 428, 560, 70, 'df = (f′ μ + ½ f″ σ²) dt + f′ σ dW', 'green', sub='Itô\'s Lemma', size=21)),
    step('Apply it to the log of a price under geometric Brownian motion. f = ln S, so f″ = −1/S² and the extra term is negative. Every S cancels: the log price drifts at μ − σ²/2, not μ.',
         box('ln', 20, 508, 560, 60, 'd(ln S) = (μ − σ²/2) dt + σ dW', 'red', size=21)),
    step('The lesson\'s worked example: r = 2%, σ = 20%. The correction σ²/2 = 0.02 exactly cancels the rate, so the log drift is 0, d₂ = 0.00 and d₁ = 0.00 + 0.20 = 0.20. That is where Black-Scholes\'s σ²/2 comes from.',
         chart('p4', P4, 'Drift of ln S with a 2% drift, vs volatility σ (%)', [0, 0.4], [-6.5, 4],
               [[2, '+2'], [0, '0'], [-4, '−4']], [[0, '0'], [0.1, '10'], [0.2, '20'], [0.3, '30'], [0.4, '40']], zero=True, pl=40, pr=16),
         series('rl', 'p4', [[0, 2], [0.4, 2]], 'blue', dash=True, ms=500, label='price drift 2%', lat=[0, 2], ldx=6, ldy=-14, lanchor='start', lsize=17),
         series('dl', 'p4', DRIFT, 'red', ms=1200),
         dot('d20', 'p4', [0.2, 0], 'σ = 20%: 0', 'green', dx=-10, dy=16, anchor='end')),
    step('More volatility, more drag: at σ = 30% the log drift is 2% − 4.5% = −2.5%, though the rate has not moved. It is the same σ²/2 as volatility drag: up 10% then down 10% leaves 0.99, not 1.',
         dot('d30', 'p4', [0.3, -2.5], '−2.5%', 'red', dx=8, dy=-14, anchor='start'),
         dict(pulse='ln')),
    step('On a desk this term is money. For a delta-hedged option, theta pays for gamma: θ ≈ −½ σ² S² Γ. Earning theta while paying for gamma, or the reverse, is Itô\'s correction read as daily P&L.',
         dict(sub='ito', text='every Greek comes from these terms'), dict(pulse='ito')),
])


BOARD = dict(name='ito_lemma', lesson='ito-lemma', title='Itô\'s Lemma: the term ordinary calculus drops', cfg=ITO,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=8)
