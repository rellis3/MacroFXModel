from ._wb import *
import random

# ── Kalman filter: tracking a number you can't see (kalman-filter) ─────────────
# The lesson's own story and worked example: a boat tracked by noisy radar pings (the
# intuition box), then a hedge ratio with x̂0 = 1.20, P0 = 0.0400, Q = 0.0009, R = 0.0100,
# H = 1. Day 1: y = 1.35, P = 0.0409, K = 0.0409/0.0509 = 0.804, x̂ = 1.321, P = 0.0080.
# Day 2: y = 1.30, P = 0.0089, K = 0.0089/0.0189 = 0.471, x̂ = 1.311, P = 0.0047.
# Q/R = 0.09; the steady-state gain is exact arithmetic from Q and R:
# P- = (Q + sqrt(Q² + 4QR)) / 2 = 0.003484, K = P- / (P- + R) = 0.258 ≈ 0.26.
# Days 3+ of the gain bars come from the same recursion (unrounded), marked approx.
# The 40-day hidden ratio and its readings are ILLUSTRATIVE (fixed seeds): a random walk
# with sd 0.03 a day (√Q) and readings with sd 0.10 (√R); days 1 and 2 are set to the
# lesson's 1.35 and 1.30, so the drawn filter line starts 1.20 → 1.321 → 1.311.
Q, R, X0, P0 = 0.0009, 0.0100, 1.20, 0.0400
N = 40
_r = random.Random(20)
TRUE = [1.30]
for _ in range(N): TRUE.append(TRUE[-1] + _r.gauss(0, Q ** 0.5))
_o = random.Random(11)
OBS = [None] + [TRUE[i] + _o.gauss(0, R ** 0.5) for i in range(1, N + 1)]
OBS[1], OBS[2] = 1.35, 1.30

def _filter(q, r):
    x, p, xs, ks = X0, P0, [X0], []
    for i in range(1, N + 1):
        pp = p + q; k = pp / (pp + r); x = x + k * (OBS[i] - x); p = (1 - k) * pp
        xs.append(x); ks.append(k)
    return xs, ks
EST, KS = _filter(Q, R)
assert round(EST[1], 3) == 1.320 or round(EST[1], 3) == 1.321, EST[1]
assert round(KS[0], 3) == 0.804 and round(EST[2], 3) == 1.311, (KS[:2], EST[:3])
HOT, _ = _filter(100 * Q, R)          # Q far too big relative to R (illustrative): gain ≈ 1
KSS = ((Q + (Q * Q + 4 * Q * R) ** 0.5) / 2) / ((Q + (Q * Q + 4 * Q * R) ** 0.5) / 2 + R)
assert round(KSS, 2) == 0.26, KSS
def _pts(xs, a=0): return [[i, round(v, 3)] for i, v in enumerate(xs) if i >= a and v is not None]

MAIN = (10, 168, 580, 262)
RUL = (10, 440, 580, 170)
def rx(v): return round(RUL[0] + 30 + (v - 1.15) / 0.25 * (RUL[2] - 60), 1)   # ruler px (pl = pr = 30)
CHIP_Y = 548

KAL = dict(w=600, h=910, intro='A boat you can only see through noisy radar, and a hedge ratio you can only see through noisy prices: the same problem, the same fix. The lesson\'s worked example, step by step.', steps=[
    step('Picture tracking a boat at night with radar. You never see the boat itself, only a ping once a minute, and every ping has error in it. Trust one ping alone and you chase noise.',
         icon('boat', 'ship', 56, 26, 0.72, 'blue', 'the boat (hidden)', lsize=17),
         note('p1', 92, 18, '×', 'amber', 22), note('p2', 154, 44, '×', 'amber', 22),
         note('p3', 40, 70, '×', 'amber', 22), note('p4', 166, 92, '×', 'amber', 22),
         note('pl', 180, 70, 'radar pings', 'amber', 17, anchor='start')),
    step('A hedge ratio is the same problem. There is a true ratio between two assets, it drifts slowly, and you can never observe it directly. Here is one (illustrative), on a chart you will fill in.',
         icon('beta', 'scales', 310, 24, 0.6, 'purple', 'hedge ratio\n(hidden)', lsize=17),
         chart('m', MAIN, 'Hedge ratio, day by day (illustrative)', [0, N], [0.95, 1.85],
               [[1.0, '1.0'], [1.2, '1.2'], [1.4, '1.4'], [1.6, '1.6'], [1.8, '1.8']],
               [[0, '0'], [10, '10'], [20, '20'], [30, '30'], [40, 'day 40']], pl=46, pr=16),
         series('t', 'm', _pts(TRUE), 'purple', dash=True, label='the truth (hidden)', lat=[21, 1.76], ldx=0, ldy=0, lanchor='start', ms=900)),
    step('Each day you get one noisy read on it: today\'s observed ratio. Like a shaky bathroom scale, any single reading can be off by a lot. Here the reading noise is R = 0.0100, a standard deviation of 0.10.',
         series('y', 'm', _pts(OBS, 1), None, width=1.6, label='daily readings', lat=[2, 1.76], ldx=0, ldy=0, lanchor='start', ms=1400)),
    step('Start the filter with a belief: estimate 1.20, uncertainty P = 0.0400, a standard deviation of 0.20, deliberately wide. Here it is on a ruler.',
         chart('rul', RUL, 'One update, on a ruler', [1.15, 1.40], [0, 1], [], [], pl=30, pr=30),
         dot('e0', 'rul', [1.20, 0], '1.20', 'blue', dy=16),
         chip('est', rx(1.20), CHIP_Y, 'estimate', 'blue')),
    step('Predict. Before looking at today\'s reading, carry the estimate forward unchanged: still 1.20. But a day has passed, so the uncertainty grows by the drift variance Q = 0.0009.',
         box('pred', 10, 622, 285, 86, 'predict: P + Q', 'blue', sub='0.0400', size=19),
         dict(count='pred', **{'from': 0.04, 'to': 0.0409, 'dp': 4, 'pre': '0.0400 + 0.0009 = ', 'ms': 900})),
    step('Day 1\'s reading arrives: 1.35. The surprise is 1.35 − 1.20 = 0.15. Trust it fully? Ignore it? Neither.',
         dot('y1', 'rul', [1.35, 0.72], 'reading 1.35', 'amber', dy=-16),
         dot('y1m', 'm', [1, 1.35], '', 'amber')),
    step('The Kalman gain decides how far to move: prediction uncertainty over total uncertainty, 0.0409 ÷ (0.0409 + 0.0100) = 0.804. So the estimate moves 80% of the way to the reading: 1.20 + 0.804 × 0.15 = 1.321. Uncertainty shrinks to 0.0080.',
         box('gain', 305, 622, 285, 86, 'gain K = P ÷ (P + R)', 'green', sub='0.000', size=19),
         dict(count='gain', **{'from': 0, 'to': 0.804, 'dp': 3, 'pre': '0.0409 ÷ 0.0509 = ', 'ms': 900}),
         move('est', rx(1.321), CHIP_Y, 1100),
         dot('e1', 'rul', [1.321, 0], '1.321', 'blue', dx=4, dy=16, anchor='start'),
         note('pct', rx(1.27), 506, '80% of the way', 'green', 17)),
    step('Day 2: carry 1.321 forward, uncertainty 0.0080 + 0.0009 = 0.0089. The reading is 1.30, a surprise of −0.021. Gain: 0.0089 ÷ 0.0189 = 0.471. The estimate eases to 1.311, uncertainty 0.0047.',
         dict(hide='e0'), dict(hide='pct'), dict(dim='y1'),
         dict(sub='pred', text='0.0080 + 0.0009 = 0.0089'),
         dot('y2', 'rul', [1.30, 0.72], '1.30', 'amber', dy=-16),
         dot('y2m', 'm', [2, 1.30], '', 'amber'),
         dict(sub='gain', text='0.0089 ÷ 0.0189 = 0.471'),
         move('est', rx(1.311), CHIP_Y, 900),
         dot('e2', 'rul', [1.311, 0], '1.311', 'blue', dx=-4, dy=16, anchor='end')),
    step('Nobody touched a setting, yet the gain fell from 0.804 to 0.471, because the filter is now surer of itself. Keep going and it settles toward a steady state set only by Q/R = 0.09: about 0.26 here.',
         chart('k', (10, 720, 580, 180), 'The gain, day by day', [0.4, 8.6], [0, 1], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, 'day 8']], pl=46, pr=16),
         dict(bars='kb', chart='k', bw=34, ms=1300, data=[[1, 0.804, '0.804', 'green'], [2, 0.471, '0.471', 'green']] +
              [[d + 1, round(KS[d], 3), '', 'green'] for d in range(2, 8)]),
         series('kss', 'k', [[0.4, round(KSS, 3)], [8.6, round(KSS, 3)]], 'amber', dash=True, label='≈ 0.26 (approx.)', lat=[8.6, KSS], ldx=-4, ldy=-14, lanchor='end', ms=500)),
    step('Run predict-then-update every day. The estimate line smooths through the noise and follows the true ratio as it drifts, with no window length chosen anywhere. Its memory falls out of Q and R.',
         dict(hide='y1m'), dict(hide='y2m'),
         series('xh', 'm', _pts(EST), 'blue', width=3.6, label='filter estimate', lat=[30, EST[30]], ldx=0, ldy=34, lanchor='middle', ms=1800)),
    step('The catch: Q and R are still your choices. Set Q far too big relative to R and the gain heads toward 1: the line re-draws every noisy print (illustrative). Under-damped, not "more adaptive".',
         series('hot', 'm', _pts(HOT), 'red', width=2.2, ms=1400),
         cnote('hotl', 'm', [21, 1.05], 'Q too big: gain ≈ 1', 'red', 17, anchor='start')),
    step('So: predict, then blend by a gain that is derived, not picked. But grid-searching Q and R until a backtest looks good is the same overfitting as tuning a window length, in a smarter-looking disguise.',
         dict(hide='hot'), dict(hide='hotl'),
         box('warn', 420, 20, 170, 108, 'Q, R are\nchosen inputs', 'amber', sub='test out of sample', size=18),
         dict(pulse='xh')),
])


BOARD = dict(name='kalman', lesson='kalman-filter', title='The Kalman filter: blend the guess and the reading', cfg=KAL,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>',
             deck_after=8)
