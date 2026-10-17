from ._wb import *
from math import sqrt

# ── Roll's implicit spread estimator (institutional-roll-spread-estimator) ────
# The lesson's worked example: true price m_t = 100.00 + 0.02t (t = 0..13), spread 0.10,
# the lesson's ask/bid pattern, observed prints, 13 price changes, lag-1 covariance
# -0.002431 (divide by 12 pairs) and s = 0.0986. The trending series is the calculator's
# "Load a trending series" button: covariance +0.001192, so Roll is undefined.
SIDE = 'ABBAAABAABABBA'
M = [round(100 + 0.02 * t, 2) for t in range(14)]
P = [round(m + (0.05 if s == 'A' else -0.05), 2) for m, s in zip(M, SIDE)]
assert P == [100.05, 99.97, 99.99, 100.11, 100.13, 100.15, 100.07, 100.19, 100.21, 100.13, 100.25, 100.17, 100.19, 100.31]
D = [round(b - a, 2) for a, b in zip(P, P[1:])]
def cov1(d):
    x, y = d[1:], d[:-1]; n = len(x); mx, my = sum(x) / n, sum(y) / n
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / n
C = cov1(D); S = 2 * sqrt(-C)
assert abs(C + 0.002431) < 1e-6 and round(S, 4) == 0.0986
TR = [100.00, 100.01, 100.03, 100.06, 100.10, 100.15, 100.21, 100.28, 100.36, 100.45, 100.55, 100.66, 100.78, 100.91]
CT = cov1([b - a for a, b in zip(TR, TR[1:])])
assert abs(CT - 0.001192) < 1e-6
after_dn = [b for a, b in zip(D, D[1:]) if a == -0.08]
after_up = [b for a, b in zip(D, D[1:]) if a == 0.12]
assert round(sum(after_dn) / len(after_dn), 3) == 0.07 and round(sum(after_up) / len(after_up), 3) == -0.013

CFG = dict(w=600, h=730, intro='Fourteen trade prints, no quotes. The spread still leaves a fingerprint: each bounce tends to undo the last. Press play, or step through.', steps=[
    step('Start with the true price nobody sees. It drifts up 0.02 a trade, from 100.00 to 100.26, smoothly and with no bounce.',
         chart('px', (10, 10, 580, 262), 'Price, 14 trades', [0, 13], [99.9, 100.36], [[100, '100.00'], [100.2, '100.20']],
               [[0, '0'], [13, '13']], pl=74, pr=56),
         series('m', 'px', [[t, m] for t, m in enumerate(M)], None, dash=True, ms=900, label='true', lat=[13, M[-1]], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('Quotes sit half a spread either side. The spread is 0.10, so the ask is 0.05 above the true price and the bid 0.05 below.',
         dict(gap='band', chart='px', top=[[t, m + 0.05] for t, m in enumerate(M)], bot=[[t, m - 0.05] for t, m in enumerate(M)], tone='purple', op=0.2),
         note('half', 210, 70, 'ask = true + 0.05 · bid = true − 0.05', 'purple', 17)),
    step('Each trade lands on the ask (a buyer crossed) or the bid (a seller crossed). The printed price jumps between the two edges of the band.',
         series('p', 'px', [[t, p] for t, p in enumerate(P)], 'blue', ms=1500, label='printed', lat=[13, P[-1]], ldx=6, ldy=0, lanchor='start', lsize=16),
         *[dot(f'd{t}', 'px', [t, p], '', 'green' if SIDE[t] == 'A' else 'red', r=4.5) for t, p in enumerate(P)]),
    step('The printed moves: −0.08, +0.02, +0.12 and so on. A flip from ask to bid adds a full spread of fake move on top of the real +0.02 drift. Same side twice adds nothing.',
         chart('dp', (10, 286, 580, 214), 'Printed price change, trade to trade', [0.4, 13.6], [-0.12, 0.16], [[0.12, '+0.12'], [0.02, '+0.02'], [-0.08, '−0.08']],
               [[1, '1'], [13, '13']], zero=True, pl=74, pr=14),
         dict(bars='db', chart='dp', data=[[i + 1, d, '', 'green' if d > 0.05 else 'red' if d < 0 else 'blue'] for i, d in enumerate(D)], bw=24, ms=1100)),
    step('The fingerprint: after a −0.08 move, the next move averaged +0.07. After a +0.12 move, it averaged about −0.01. Moves tend to undo the move before.',
         note('pat', 300, 528, 'after −0.08 → next averages +0.07 · after +0.12 → about −0.01', 'amber', 17)),
    step('Measure it as the covariance of each move with the move before, over the 12 pairs: −0.002431. Negative, as Roll predicts: −s²/4.',
         note('cov', 300, 564, 'Cov(ΔPₜ, ΔPₜ₋₁) = −0.02917 ÷ 12 = −0.002431', 'purple', 19)),
    step('Solve for the spread: s = 2 × √0.002431 ≈ 0.0986. The true spread was 0.10, so the prints alone got within about 1.4%. The drift added nothing.',
         box('s', 110, 588, 380, 54, 's = 2√0.002431 ≈ 0.0986  (true 0.10)', 'green', size=20)),
    step('Now a series that only trends, with no bounce: every move a bit bigger than the last. Its covariance is +0.001192, positive. There is no square root of a negative number to take.',
         box('tr', 10, 656, 280, 64, 'trending series:\nCov = +0.001192', 'red', size=18)),
    step('So Roll returns nothing at all, which is common in short or trending windows. Record that window as missing, never as zero, and cross-check with a high-low estimator such as Corwin and Schultz (2012).',
         box('na', 310, 656, 280, 64, 'Roll: undefined\nmissing, not zero', 'amber', size=18)),
])


BOARD = dict(name='institutional_roll_spread_estimator', lesson='institutional-roll-spread-estimator',
             title="Roll's estimator: a spread from the bounce", cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=10)
