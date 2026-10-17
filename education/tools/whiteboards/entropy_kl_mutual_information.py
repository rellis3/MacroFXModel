from ._wb import *
from math import log2

# ── Surprise, wasted bits and shared bits (entropy-kl-mutual-information) ────
# All numbers are the lesson's, or exact arithmetic from its formulas:
#   binary entropy H(p) = -p log2 p - (1-p) log2(1-p): H(0.5) = 1, H(0.1) = H(0.9) = 0.469, H(0.99) = 0.081
#   KL: P = (0.99, 0.01), Q = (0.5, 0.5): D(P||Q) = 0.919, D(Q||P) = 2.329 bits
#   surprise of tails under the 99% model: -log2(0.01) = 6.64 bits
#   Y = X^2, X uniform on {-2..2}: corr = 0, H(X) = 2.322, H(X|Y) = 0.8, I = 1.522 bits
def Hb(p): return 0.0 if p in (0, 1) else -p * log2(p) - (1 - p) * log2(1 - p)
def kl(a, b): return sum(x * log2(x / y) for x, y in zip(a, b))
assert round(kl((0.99, 0.01), (0.5, 0.5)), 3) == 0.919 and round(kl((0.5, 0.5), (0.99, 0.01)), 3) == 2.329
CURVE = [[i / 50, round(Hb(i / 50), 4)] for i in range(51)]
HX, HXY = log2(5), 0.8
MI = round(HX - HXY, 3)
assert MI == 1.522

EKL = dict(w=600, h=800, intro='Three ideas from the lesson, each built on the last: surprise, the cost of a wrong model, and the information two variables share. Press play, or step through.', steps=[
    step('Start with a fair coin. You have no idea how it will land, so each flip carries the most surprise a coin can: exactly 1 bit.',
         icon('fair', 'coin', 30, 14, 0.8, 'blue', 'fair coin\n1 bit', sym='½', lsize=17)),
    step('Now a coin that lands heads 99 times in 100. You almost always know what is coming, so it carries only about 0.08 bits per flip.',
         icon('bias', 'coin', 30, 150, 0.6, 'amber', '99% heads\n0.08 bits', sym='H', lsize=17)),
    step('Entropy across every coin: zero when the outcome is certain, 1 bit at a fair coin, 0.469 bits at 10% or 90%. Entropy is the average surprise.',
         chart('hc', (190, 10, 400, 270), 'Entropy of a coin, in bits', [0, 1], [0, 1.15], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[0, '0'], [0.5, 'p = 0.5'], [1, '1']], pl=48, pr=18),
         series('hs', 'hc', CURVE, 'purple', ms=1500),
         dot('h5', 'hc', [0.5, 1.0], '1 bit', 'blue', dy=-14),
         dot('h1', 'hc', [0.1, 0.469], '0.469', 'purple', dx=12, dy=12, anchor='start'),
         dot('h99', 'hc', [0.99, round(Hb(0.99), 3)], '0.08', 'amber', dx=-10, dy=-4, anchor='end')),
    step('KL divergence is the cost of the wrong model. The coin is really 99% heads, but you describe it as fair. You waste 0.919 bits per flip.',
         chart('kc', (10, 306, 280, 228), 'Bits wasted per flip', [0.4, 2.6], [0, 2.7], [[0, '0'], [1, '1'], [2, '2']],
               [[1, 'truth 99%'], [2, 'truth fair']], pl=40),
         dict(bars='k1', chart='kc', data=[[1, 0.919, '0.919', 'blue']], bw=64, ms=900),
         box('t1', 320, 306, 270, 100, 'truth: 99% heads\nmodel: fair coin', 'blue', size=18)),
    step('Swap the roles. The coin is really fair, but your model says 99% heads. Now you waste 2.329 bits per flip: same two coins, about 2.5 times the cost.',
         dict(bars='k2', chart='kc', data=[[2, 2.329, '2.329', 'red']], bw=64, ms=900),
         box('t2', 320, 434, 270, 100, 'truth: fair coin\nmodel: 99% heads', 'red', size=18)),
    step('Why so lopsided? The second model calls tails a 1% event, so each tails costs it 6.64 bits of surprise, and tails turn up half the time. Writing off a common event as nearly impossible is the expensive mistake.',
         dict(pulse='t2'), dict(pulse='bias')),
    step('Now two variables. X is −2, −1, 0, 1 or 2, all equally likely, and Y is X squared. The five points sit on a U.',
         chart('xy', (10, 552, 280, 240), 'Y = X²', [-2.6, 2.6], [-0.4, 4.8], [[0, '0'], [1, '1'], [4, '4']],
               [[-2, '−2'], [0, '0'], [2, '2']], pl=36, pr=12),
         dot('p1', 'xy', [-2, 4], '', 'purple'), dot('p2', 'xy', [-1, 1], '', 'purple'), dot('p3', 'xy', [0, 0], '', 'purple'),
         dot('p4', 'xy', [1, 1], '', 'purple'), dot('p5', 'xy', [2, 4], '', 'purple')),
    step('The best straight line through a U is flat. The correlation between X and Y is exactly zero, even though Y is fixed by X.',
         series('fit', 'xy', [[-2.5, 2], [2.5, 2]], 'red', dash=True, ms=600),
         cnote('fl', 'xy', [0, 2], 'correlation = 0', 'red', 17, dy=-16)),
    step('Before you know anything, X holds 2.322 bits of uncertainty. Tell someone Y and they only have to guess the sign: 0.8 bits left on average.',
         chart('bc', (310, 552, 280, 240), 'Uncertainty about X, bits', [0.4, 3.6], [0, 2.7], [[0, '0'], [1, '1'], [2, '2']],
               [[1, 'before'], [2, 'after Y'], [3, 'shared']], pl=40),
         dict(bars='b1', chart='bc', data=[[1, round(HX, 3), '2.322', 'blue'], [2, HXY, '0.8', 'amber']], bw=52, ms=1000)),
    step('The drop, 2.322 − 0.8 = 1.522 bits, is the mutual information. Correlation said nothing is there. Mutual information says Y removes most of the uncertainty about X.',
         dict(bars='b2', chart='bc', data=[[3, MI, '1.522', 'green']], bw=52, ms=900),
         dict(pulse='p1'), dict(pulse='p5')),
    step('In markets: if big up days and big down days both come before busy sessions, the signed return can show near-zero correlation with tomorrow\'s volatility while mutual information is clearly positive.',
         dict(hide='t1'), dict(hide='t2'),
         box('mk', 320, 306, 270, 228, 'signed return vs\ntomorrow\'s volatility:\ncorrelation ≈ 0\nmutual information > 0', 'green', size=18)),
    step('Two cautions. Estimating mutual information from a small, noisy sample can overstate it badly. And a real dependence is not yet a tradeable edge.',
         dict(hide='mk'),
         box('c1', 320, 306, 270, 100, 'small sample:\nestimate biased up', 'amber', size=18),
         box('c2', 320, 434, 270, 100, 'dependence\nis not edge', 'red', size=18)),
])


BOARD = dict(name='entropy_kl_mutual_information', lesson='entropy-kl-mutual-information', title='Entropy, KL and mutual information, drawn', cfg=EKL,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=11)
