from ._wb import *
import math, random

# ── HMC & NUTS (hamiltonian-monte-carlo-nuts) ─────────────────────────────────
# Part 1, the lesson's worked example: target N(0,1), U = theta^2/2, M = 1, eps = 0.3, L = 3,
# theta0 = 1.0, p0 = 0.5. Positions 1.105, 1.11055, 1.01615 and momenta 0.35 (first half kick),
# 0.0185, -0.314665 (full kicks), -0.4671 (final half kick) are the lesson's own;
# H0 = 0.625, H* = 0.6254, alpha = 0.9996.
# Part 2, an illustrative 2-D ridge (sd 1.6 along the long axis, 0.3 across, tilted 18 deg):
# a 25-step random-walk Metropolis chain (proposal sd 0.25, seed 3) against one true leapfrog
# trajectory (eps 0.12, M = I) run until the NUTS-style check (theta - theta0) . p < 0 first fires.
TH = [1.0, 1.105, 1.11055, 1.01615]; PM = [0.5, 0.0185, -0.314665, -0.4671]
def _lf(t, p, e=0.3, L=3):   # the lesson's own update rule (as in its calculator)
    p -= e / 2 * t                       # first half kick
    for i in range(1, L + 1):
        t += e * p
        if i < L: p -= e * t             # full kicks between moves
    return t, p - e / 2 * t              # final half kick
TS, PS = _lf(1.0, 0.5)
H0 = 0.5 * 1.0 ** 2 + 0.5 * 0.5 ** 2; HS = 0.5 * TS ** 2 + 0.5 * PS ** 2
assert (round(TS, 4), round(PS, 4)) == (1.0162, -0.4671)
assert all(abs(a - b) < 5e-5 for a, b in zip(TH, [1.0, 1.105, 1.11055, TS]))
assert round(H0, 3) == 0.625 and round(HS, 4) == 0.6254 and round(math.exp(H0 - HS), 4) == 0.9996
VALLEY = [[round(-2 + i * 0.05, 2), round(0.5 * (-2 + i * 0.05) ** 2, 4)] for i in range(81)]

SU, SV, ANG, SC = 1.6, 0.3, math.radians(-18), 80
def _xy(u, v):   # picture coordinates, then flipped so "up" is up on the board chart
    x = 300 + SC * (u * math.cos(ANG) - v * math.sin(ANG)); y = 128 + SC * (u * math.sin(ANG) + v * math.cos(ANG))
    return [round(x, 1), round(260 - y, 1)]
def _U(u, v): return 0.5 * (u * u / SU ** 2 + v * v / SV ** 2)
def _traj():
    u, v, pu, pv, e = -2.0, 0.1, 0.6, 0.7, 0.12
    u0, v0 = u, v; out = [_xy(u, v)]
    pu -= e / 2 * u / SU ** 2; pv -= e / 2 * v / SV ** 2
    for k in range(1, 400):
        u += e * pu; v += e * pv; gu, gv = u / SU ** 2, v / SV ** 2
        pu -= e * gu; pv -= e * gv; fu, fv = pu + e / 2 * gu, pv + e / 2 * gv
        out.append(_xy(u, v))
        if (u - u0) * fu + (v - v0) * fv < 0: return out, k, round(u, 2)
def _rw():
    r = random.Random(3); a, b = -2.0, 0.1; out = [_xy(a, b)]
    for _ in range(25):
        na, nb = a + r.gauss(0, 0.25), b + r.gauss(0, 0.25)
        if r.random() < math.exp(_U(a, b) - _U(na, nb)): a, b = na, nb
        out.append(_xy(a, b))
    return out, round(a, 2)
TRAJ, NSTEP, UEND = _traj(); RW, RWEND = _rw()
assert NSTEP == 36 and UEND == 2.22 and RWEND == -2.06
def _ell(k): return [_xy(k * SU * math.cos(t / 40 * 2 * math.pi), k * SV * math.sin(t / 40 * 2 * math.pi)) for t in range(41)]

VC = (10, 10, 362, 300)
HMC = dict(w=600, h=800, intro="A marble rolling on an upside-down posterior: the lesson's three hand-worked leapfrog steps, then why it beats a random walk. Press play, or step through.", steps=[
    step('Flip the posterior upside down. For a standard Normal target, the potential energy is U = ½θ²: a valley whose floor, at 0, is the most likely value. The chain sits at θ = 1.0, at height 0.5.',
         chart('val', VC, 'Potential energy U(θ) = ½θ²', [-2, 2], [0, 2.2], [[0, '0'], [0.5, '0.5'], [1, '1.0'], [2, '2.0']],
               [[-2, '−2'], [-1, '−1'], [0, '0'], [1, '1'], [2, '2']], pl=50, pr=16),
         series('U', 'val', VALLEY, 'purple', ms=1100),
         dot('b0', 'val', [1.0, 0.5], 'θ = 1.0', 'blue', dx=-12, dy=8, anchor='end')),
    step('Give it a random flick: momentum p = 0.5, pointing uphill to the right. Total energy H is height plus ½p²: 0.5 + 0.125 = 0.625.',
         box('h0', 384, 20, 206, 96, 'flick: p = 0.5', 'amber', sub='H = 0.625', size=19)),
    step('Leapfrog step 1. The slope at 1.0 pulls the momentum back by half a step, 0.15, to 0.35. Move: θ = 1.0 + 0.3 × 0.35 = 1.105. A full kick from the new slope leaves almost nothing: 0.35 − 0.3 × 1.105 = 0.0185.',
         dot('b1', 'val', [1.105, 0.6105], '', 'blue'), dict(dim='b0'),
         dict(sub='h0', text='θ 1.105 · p 0.02')),
    step('Step 2. The marble creeps to θ = 1.111, the top of its roll. The next full kick flips the momentum to −0.315: it starts rolling back.',
         dot('b2', 'val', [1.1106, 0.6167], '', 'blue'), dict(dim='b1'),
         dict(sub='h0', text='θ 1.111 · p −0.31')),
    step('Step 3. Rolling back down: θ = 1.016, and a final half kick leaves p = −0.467. That is the proposal: θ* = 1.016, p* = −0.467.',
         dot('b3', 'val', [1.0162, 0.5163], 'θ* = 1.016', 'green', dx=-14, dy=-18, anchor='end'), dict(dim='b2'),
         dict(sub='h0', text='θ* 1.016 · p* −0.47')),
    step('The simulation is approximate, so H drifted, but only a hair: from 0.625 to 0.6254. One Metropolis check fixes that exactly: accept with chance e^(0.625 − 0.6254) ≈ 0.9996.',
         chart('en', (384, 192, 206, 118), 'Energy H', [0.4, 2.6], [0, 0.85], [], [[1, 'start'], [2, 'end']], pl=16, pr=10),
         dict(bars='hb', chart='en', data=[[1, 0.625, '0.625', 'blue'], [2, 0.6254, '0.6254', 'amber']], bw=48, ms=900),
         box('acc', 384, 126, 206, 56, 'accept: α = 0.9996', 'green', size=19)),
    step('Why bother? On a long, narrow, tilted target, a random walk proposes blind steps. After 25 of them, this one is almost exactly where it started.',
         chart('rid', (10, 326, 580, 300), 'A narrow ridge (illustrative)', [40, 560], [10, 250], [], [], pl=10, pr=10, pt=34, pb=10),
         series('e2', 'rid', _ell(2), None, ms=700, width=2), series('e1', 'rid', _ell(1), None, ms=500, width=2),
         series('rw', 'rid', RW, 'red', ms=1500, width=2.4, label='random walk: 25 steps', lat=[555, 40], ldx=0, ldy=0, lanchor='end')),
    step('HMC gives the point a push and lets the gradient steer it. One trajectory of 36 leapfrog steps sweeps the whole ridge, and the energy check still accepts it.',
         series('hm', 'rid', TRAJ, 'blue', ms=1800, width=3.4, label='one HMC proposal: 36 steps', lat=[50, 238], ldx=0, ldy=0, lanchor='start')),
    step('How long to roll? Too short wastes the push; too long rolls back over old ground. NUTS keeps doubling the path and stops the moment it starts heading back toward its start: the U-turn.',
         dot('ut', 'rid', TRAJ[-1], 'U-turn: stop', 'green', dx=-14, dy=-26, anchor='end')),
    step('The dial left to tune is the step size. Too large and the simulated energy blows up mid-roll: the sampler reports a divergent transition, often in a hierarchical funnel\'s narrow neck.',
         box('div', 10, 640, 285, 150, 'step too big →\nenergy blows up\n→ "divergence":\ndon\'t trust the fit', 'red', size=18)),
    step('And the marble needs a slope. HMC and NUTS require a smooth, differentiable log-posterior. That is why they became the default engine in Stan and PyMC for continuous models.',
         box('grad', 305, 640, 285, 150, 'needs a gradient:\nsmooth posterior only\ndefault in Stan, PyMC', 'blue', size=18)),
])


BOARD = dict(name='hamiltonian_monte_carlo_nuts', lesson='hamiltonian-monte-carlo-nuts', title='HMC: roll the marble, check the energy, stop at the U-turn', cfg=HMC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>NUTS: removing HMC\'s hardest dial</h2>',
             deck_after=7)
