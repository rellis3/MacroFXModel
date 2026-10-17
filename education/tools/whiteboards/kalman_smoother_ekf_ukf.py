from ._wb import *
import math

# ── Kalman smoother, EKF & UKF (kalman-smoother-ekf-ukf) ──────────────────────
# Smoother: the lesson's two-day hedge-ratio track (x0 = 1.20, P0 = 0.04, Q = 0.0009, R = 0.01):
# filtered Day 1 1.321 (P 0.0080), predicted Day 2 1.321 (P 0.0089), filtered Day 2 1.311
# (P 0.0047); C1 = 0.899, smoothed Day 1 1.312 (P 0.00461).
# EKF/UKF: h(x) = x^2, x_hat = 1.30, P = 0.01, R = 0.02, y = 1.75, lambda = 2, L = 1, using the
# lesson's calculator formulas: EKF 1.3178, UKF 1.3148 (y_hat 1.700); at P = 0.10 they are
# 1.3224 and 1.2855 (gap 0.037).
def _both(P, xh=1.3, R=0.02, y=1.75, lam=2, L=1):
    H = 2 * xh; S = H * H * P + R; xe = xh + P * H / S * (y - xh * xh)
    sp = math.sqrt((L + lam) * P); c = [xh, xh + sp, xh - sp]; W = [lam / (L + lam)] + [1 / (2 * (L + lam))] * 2
    Y = [v * v for v in c]; yh = sum(w * v for w, v in zip(W, Y))
    Pyy = sum(w * (v - yh) ** 2 for w, v in zip(W, Y)) + R; Pxy = sum(w * (a - xh) * (v - yh) for w, a, v in zip(W, c, Y))
    return xe, xh + Pxy / Pyy * (y - yh), yh, c
E1, U1, YH1, C1 = _both(0.01); E2, U2, YH2, C2 = _both(0.10)
assert (round(E1, 4), round(U1, 4), round(YH1, 3)) == (1.3178, 1.3148, 1.7) and round(abs(E2 - U2), 3) == 0.037
assert round(0.0080 / 0.0089, 3) == 0.899 and round(1.321 + 0.899 * (1.311 - 1.321), 3) == 1.312

def ebar(id, ch, x, v, var, tone):
    sd = math.sqrt(var)
    return series(id, ch, [[x, round(v - sd, 4)], [x, round(v + sd, 4)]], tone, ms=500, width=4)
CURVE = [[round(0.6 + i * 0.05, 2), round((0.6 + i * 0.05) ** 2, 4)] for i in range(27)]
TAN = [[0.7, round(1.69 + 2.6 * (0.7 - 1.3), 3)], [1.9, round(1.69 + 2.6 * 0.6, 3)]]

KS = dict(w=600, h=700, intro="Two upgrades to the Kalman filter: hindsight for research, and curves for nonlinear prices. The lesson's own numbers. Press play, or step through.", steps=[
    step('The live filter, Day 1. It starts at 1.20, sees Day 1\'s data, and moves to 1.321. Its uncertainty, shown as a ±1 standard-deviation bar, is still wide: variance 0.0080.',
         chart('sm', (10, 10, 580, 250), 'Hedge ratio: live vs hindsight', [-0.3, 4.2], [1.05, 1.45], [[1.1, '1.10'], [1.2, '1.20'], [1.3, '1.30'], [1.4, '1.40']],
               [[0, 'start'], [1, 'Day 1'], [2, 'Day 2']], pl=56, pr=14),
         dot('d0', 'sm', [0, 1.2], '1.20', None, dx=0, dy=-16),
         ebar('f1b', 'sm', 0.94, 1.321, 0.0080, 'blue'),
         dot('f1', 'sm', [0.94, 1.321], '1.321', 'blue', dx=-12, dy=0, anchor='end')),
    step('Day 2. The new observation, 1.30, is a little below the Day 1 estimate. The live filter moves to 1.311, with variance 0.0047.',
         ebar('f2b', 'sm', 2, 1.311, 0.0047, 'green'),
         dot('f2', 'sm', [2, 1.311], '1.311', 'green', dx=-12, dy=0, anchor='end')),
    step('Now the backward pass. The smoother gain for Day 1 is C = 0.0080 ÷ 0.0089 = 0.899: Day 1 was uncertain, so it should listen to what Day 2 revealed.',
         box('cg', 360, 50, 220, 70, 'C = 0.0080 ÷ 0.0089\n= 0.899', 'purple', size=18)),
    step('Day 2 came in 0.010 below the Day 1 forecast. Hindsight pulls Day 1 down by 0.899 × 0.010: from 1.321 to 1.312. The error bar shrinks too, variance 0.0080 to 0.0046.',
         ebar('s1b', 'sm', 1.08, 1.312, 0.00461, 'green'),
         dot('s1', 'sm', [1.08, 1.312], '1.312', 'green', dx=12, dy=0, anchor='start')),
    step('The trap: nobody trading on Day 1 could have known 1.312. It needs Day 2\'s data. Smoothed paths are for research and post-mortems. Used in a backtest, they are lookahead.',
         box('look', 360, 140, 220, 72, 'smoothed = hindsight\nnever a live signal', 'red', size=18)),
    step('Second upgrade: curves. Suppose what you observe is h(x) = x², a curved function of the hidden state. Your prediction is x̂ = 1.30, so you expect to see 1.69. You actually see 1.75.',
         chart('cv', (10, 276, 580, 300), 'Observation h(x) = x²', [0.6, 1.9], [0, 3.8], [[1, '1'], [2, '2'], [3, '3']],
               [[0.8, '0.8'], [1.0, '1.0'], [1.3, '1.30'], [1.6, '1.6'], [1.8, '1.8']], pl=40, pr=14),
         series('h', 'cv', CURVE, None, ms=1000, width=3.2),
         dot('xh', 'cv', [1.3, 1.69], 'x̂ = 1.30', 'blue', dx=-12, dy=-10, anchor='end')),
    step('The extended Kalman filter lays a straight tangent line on the curve at 1.30, slope 2.6, and runs the ordinary equations on that line. Its update lands at 1.3178.',
         series('tan', 'cv', TAN, 'red', dash=True, ms=700, label='EKF tangent → 1.3178', lat=[1.88, 0.45], ldx=0, ldy=0, lanchor='end')),
    step('The unscented filter instead sends three points onto the real curve: 1.127, 1.30 and 1.473. Averaged, they predict 1.700, not 1.690, because the curve bends upward. The tangent line cannot see that.',
         *[dot(f'sg{i}', 'cv', [round(x, 4), round(x * x, 4)], '', 'purple') for i, x in enumerate(C1)]),
    step('The UKF update lands at 1.3148. With this mild curve and narrow uncertainty, the two methods are only 0.003 apart.',
         box('gap1', 10, 590, 285, 100, 'P = 0.01:\nEKF 1.3178 · UKF 1.3148\ngap 0.003', 'purple', size=18)),
    step('Make the prediction ten times less certain, P = 0.10. The sigma points spread to 0.75 and 1.85, deep into the bend. Now the EKF says 1.3224 and the UKF 1.2855: a gap of 0.037.',
         *[dict(dim=f'sg{i}') for i in range(3)],
         *[dot(f'sw{i}', 'cv', [round(x, 4), round(x * x, 4)], '', 'amber') for i, x in enumerate(C2) if i],
         box('gap2', 305, 590, 285, 100, 'P = 0.10:\nEKF 1.3224 · UKF 1.2855\ngap 0.037', 'amber', size=18)),
    step('Pick the tool by the problem. Linear: the plain Kalman filter. Prices curved in a hidden factor: EKF, or UKF when the bend is strong. A history for research: the smoother. Strongly non-Gaussian: the particle filter.',
         dict(pulse='gap2'), dict(pulse='look')),
])


BOARD = dict(name='kalman_smoother_ekf_ukf', lesson='kalman-smoother-ekf-ukf', title='Hindsight and curves: the smoother, the EKF and the UKF', cfg=KS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=9)
