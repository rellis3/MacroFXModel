from ._wb import *
from math import log10, log2

# ── Euler-Maruyama and Milstein (sde-numerical-schemes) ──────────────────────
# Path numbers are the lesson's worked example: GBM mu 0.10, sigma 0.30, X0 100, dt 0.25,
# dW = 0.8453, −0.2330, 0.0164, 0.2038 → 127.8579, 122.1183, 125.7724, 136.6049; exact on the same
# path 135.6271 (error 0.978). Convergence numbers: a re-run of the lesson's study (20,000 GBM paths,
# mu 0.08, sigma 0.25, N = 4..128, reference on 1,024 steps, numpy seed 7): mean |X_N − X(T)|.
# Fitted slopes 0.490 (Euler-Maruyama) and 0.979 (Milstein), matching the lesson's 0.488 / 0.980.
MU, SIG, DT = 0.10, 0.30, 0.25
DW = [0.8453, -0.2330, 0.0164, 0.2038]
X = [100.0, 127.8579, 122.1183, 125.7724, 136.6049]   # the lesson's printed values (4-dp rounding)
for n, d in enumerate(DW):   # recompute each step from the printed previous value
    assert abs(X[n] + MU * X[n] * DT + SIG * X[n] * d - X[n + 1]) < 0.002
EXACT = 135.6271
NS = [4, 8, 16, 32, 64, 128]
EM = [1.817, 1.308, 0.941, 0.672, 0.473, 0.333]
MIL = [0.420, 0.218, 0.111, 0.0562, 0.0282, 0.0142]
CH = (10, 10, 580, 300)


def leg(n):
    """Step n drawn as drift (dashed blue) then shock (amber)."""
    t0, t1 = n * DT, (n + 1) * DT
    xd = X[n] + MU * X[n] * DT
    return [series(f'dr{n}', 'p', [[t0, X[n]], [t1, xd]], 'blue', dash=True, ms=500),
            series(f'sh{n}', 'p', [[t1, xd], [t1, X[n + 1]]], 'amber', ms=600),
            dot(f'x{n + 1}', 'p', [t1, X[n + 1]], f'{X[n + 1]:.2f}', 'green', dy=(-16 if DW[n] > 0 else 18))]


PATH_IDS = ['p', 'x0', 'ex', 'err'] + [f'{k}{n}' for n in range(4) for k in ('dr', 'sh')] + [f'x{n}' for n in range(1, 5)]

NUM = dict(w=600, h=620, intro='The lesson\'s four Euler-Maruyama steps drawn by hand, checked against the exact answer, then what happens to the error as the steps shrink. Press play, or step through.', steps=[
    step('GBM with 10% drift and 30% volatility, starting at 100. No need for a formula: we will step through one year in four quarter-year steps.',
         chart('p', CH, 'One simulated year, four Euler-Maruyama steps', [0, 1], [90, 145],
               [[100, '100'], [120, '120'], [140, '140']], [[0, '0'], [0.25, '0.25'], [0.5, '0.5'], [0.75, '0.75'], [1, 't = 1']], pl=50, pr=24),
         dot('x0', 'p', [0, 100], '100', 'blue', dx=12, dy=-14, anchor='start')),
    step('Step 1. The drift adds 0.10 × 100 × 0.25 = 2.50, a small blue slope. Then the random shock: 0.30 × 100 × 0.8453 = 25.36, the tall amber jump. New value 127.86.',
         *leg(0)),
    step('Step 2. The draw is −0.2330. Drift +3.20, shock −8.94: down to 122.12. The shock decides the direction; the drift barely shows.',
         *leg(1)),
    step('Steps 3 and 4: draws of 0.0164 and 0.2038 take the path to 125.77, then 136.60 at the end of the year.',
         *leg(2), *leg(3)),
    step('The exact GBM answer on the same random path is 135.63. Euler-Maruyama\'s four coarse steps are off by 0.98, about 0.72% of the level.',
         dot('ex', 'p', [1, EXACT], 'exact 135.63', 'purple', dx=-14, dy=0, anchor='end'),
         note('err', 300, 330, 'error 136.60 − 135.63 = 0.98', 'red', 20)),
    step('"How accurate" is two questions. Strong: does each simulated path track the true path? Weak: does the average, like a vanilla price, come out right? Euler-Maruyama is strong order 0.5 but weak order 1.0.',
         box('strong', 20, 380, 270, 96, 'strong: the path\norder 0.5', 'blue', size=19),
         box('weak', 310, 380, 270, 96, 'weak: the average\norder 1.0', 'purple', size=19)),
    step('Here is strong error measured on 20,000 simulated paths, against the number of steps per year, on log scales. Euler-Maruyama falls from 1.82 at 4 steps to 0.33 at 128: about 1.4 times smaller per halving, slope 0.49.',
         *[dict(hide=i) for i in PATH_IDS],
         chart('c', CH, 'Path error vs steps (log scales)', [1.7, 7.3], [-2, 0.4],
               [[0, '1'], [-1, '0.1'], [-2, '0.01']], [[log2(n), str(n)] for n in NS], pl=50, pr=24),
         series('em', 'c', [[log2(n), round(log10(e), 3)] for n, e in zip(NS, EM)], 'blue', ms=1300,
                label='Euler: 1.82 → 0.33', lat=[4.5, -0.07], ldx=0, ldy=-26, lanchor='middle', lsize=16)),
    step('Milstein adds one term, ½σσ′(ΔW² − Δt), the next piece of the Itô-Taylor expansion. Its error falls from 0.42 to 0.014: it halves with every halving of the step. Strong order 1.0, slope 0.98.',
         series('mil', 'c', [[log2(n), round(log10(e), 3)] for n, e in zip(NS, MIL)], 'green', ms=1300,
                label='Milstein: 0.42 → 0.014', lat=[3.6, -1.1], ldx=0, ldy=34, lanchor='middle', lsize=16),
         dict(pulse='strong')),
    step('Why it matters on a desk: a vanilla call only needs the endpoint, so a coarse daily grid is fine. A barrier needs the path: a coarse path can step over the barrier without touching it and misprice the knock-in.',
         dict(hide='weak'), dict(hide='strong'),
         box('van', 20, 380, 270, 96, 'vanilla: endpoint\ncoarse grid is fine', 'green', size=18),
         box('bar', 310, 380, 270, 96, 'barrier: the path\nneeds finer steps', 'red', size=18)),
    step('The rule: match the step size to the payoff, and check it with a convergence study like this one before trusting a new engine. More paths cut noise; only smaller steps cut this bias.',
         note('rule', 300, 530, 'match the step to the payoff', 'green', 22)),
])


BOARD = dict(name='sde_numerical_schemes', lesson='sde-numerical-schemes',
             title='Euler-Maruyama step by step, and why Milstein converges faster', cfg=NUM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
