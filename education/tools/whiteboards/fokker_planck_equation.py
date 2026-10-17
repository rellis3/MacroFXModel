from ._wb import *
import math, random

# ── The Fokker-Planck equation (fokker-planck-equation) ──────────────────────
# Illustrative constant-coefficient process dX = 0.5 dt + 1 dW from X0 = 0, sliced at the
# lesson chart's four times (t = 0.4, 1.2, 2.5, 4.5). Exact density: Normal(0.5 t, t).
# The five paths are one seeded Euler simulation (dt = 0.05), purely illustrative.
MU, SIG = 0.5, 1.0
random.seed(31)
PATHS = []
for _ in range(5):
    x, p = 0.0, [[0, 0]]
    for i in range(1, 91):
        x += MU * 0.05 + SIG * math.sqrt(0.05) * random.gauss(0, 1)
        p.append([round(i * 0.05, 2), round(x, 2)])
    PATHS.append(p)
TS = [i * 0.1 for i in range(1, 46)]
BAND_TOP = [[0, 0]] + [[round(t, 2), round(MU * t + 2 * SIG * math.sqrt(t), 3)] for t in TS]
BAND_BOT = [[0, 0]] + [[round(t, 2), round(MU * t - 2 * SIG * math.sqrt(t), 3)] for t in TS]
def dens(t):
    m, s = MU * t, SIG * math.sqrt(t)
    return [[round(-5 + 0.2 * i, 2), round(math.exp(-0.5 * ((-5 + 0.2 * i - m) / s) ** 2) / (s * math.sqrt(2 * math.pi)), 4)] for i in range(61)]
def peak(t): return round(1 / (SIG * math.sqrt(t) * math.sqrt(2 * math.pi)), 3)

FP = dict(w=600, h=790, intro='A cloud of particles, all released from one point. Watch individual paths stay unpredictable while the cloud\'s shape follows a fixed rule. Press play, or step through.', steps=[
    step('Release a cloud of particles, all from the same point, x = 0. Each follows the same rule: a steady drift of 0.5 per unit of time, plus random kicks of size 1. These are illustrative numbers.',
         chart('pc', (10, 10, 580, 250), 'Five particles, position over time', [0, 4.5], [-5, 7],
               [[-4, '−4'], [0, '0'], [4, '4']], [[0, '0'], [1.2, '1.2'], [2.5, '2.5'], [4.5, '4.5 time']], zero=True, pl=40, pr=40),
         dot('st', 'pc', [0, 0], 'start', 'amber', dx=8, dy=-12, anchor='start')),
    step('Here are five of them. Each path is one possible future, jagged and unpredictable. Nothing here tells you where the next particle will go.',
         *[series('p%d' % k, 'pc', PATHS[k], t, ms=700) for k, t in enumerate(['blue', 'green', 'purple', 'amber', None])]),
    step('Now stop following paths and look at the whole cloud. The shaded band holds about 95% of all particles: its centre moves up 0.5 per unit of time, and its half-width grows as 2 times the square root of time.',
         *[dict(dim='p%d' % k) for k in range(5)],
         dict(gap='band', chart='pc', top=BAND_TOP, bot=BAND_BOT, tone='blue', op=0.2),
         series('mid', 'pc', [[0, 0], [4.5, 2.25]], 'blue', dash=True, ms=600)),
    step('Slice the cloud at t = 0.4. Where are the particles? A tall, narrow bell centred at 0.2, with a spread of 0.63.',
         chart('dc', (10, 274, 580, 240), 'Density of the cloud, p(x, t)', [-5, 7], [0, 0.7],
               [[0.25, '0.25'], [0.5, '0.5']], [[-4, '−4'], [0, '0'], [4, '4'], [7, 'x']], pl=48, pr=16),
         series('d1', 'dc', dens(0.4), 'blue', ms=900),
         dot('k1', 'dc', [0.2, peak(0.4)], 't = 0.4', 'blue', dx=10, dy=-4, anchor='start')),
    step('At t = 1.2 the bell has moved to 0.6 (that is the drift) and widened to 1.10 (that is the diffusion). It is lower too, because the area under it is still exactly 1: no probability is lost.',
         series('d2', 'dc', dens(1.2), 'green', ms=900),
         dot('k2', 'dc', [0.6, peak(1.2)], 't = 1.2', 'green', dx=12, dy=-6, anchor='start')),
    step('At t = 2.5 and t = 4.5 the centre reaches 1.25 and 2.25, the spread 1.58 and 2.12. No single particle was predictable, yet the shape changes in a completely predictable way.',
         series('d3', 'dc', dens(2.5), 'amber', ms=800),
         series('d4', 'dc', dens(4.5), 'purple', ms=800),
         dot('k4', 'dc', [2.25, peak(4.5)], 't = 4.5', 'purple', dx=14, dy=-8, anchor='start')),
    step('The Fokker-Planck equation is the rule for that shape, instant by instant. It has no noise term of its own: all the randomness is already soaked into the shape of p.',
         box('fp', 20, 532, 560, 70, '∂p/∂t = −∂ₓ[μp] + ½ ∂ₓ²[σ²p]', 'purple', size=22)),
    step('Two terms, two jobs. The drift term carries the whole bell along without changing its shape, like a breeze moving a puff of smoke. The diffusion term spreads it out, like the smoke blurring on its own.',
         box('dr', 20, 618, 270, 66, '−∂ₓ[μp]\ndrift: shifts', 'blue', size=19),
         box('df', 310, 618, 270, 66, '½ ∂ₓ²[σ²p]\ndiffusion: spreads', 'amber', size=19)),
    step('Its mirror image runs the other way. Forward: start known, get the whole distribution later. Backward: payoff known at expiry, march back to one value today. Black-Scholes is a backward equation, plus a discounting term −rV.',
         box('fw', 20, 704, 270, 70, 'FORWARD\nstart → distribution', 'blue', size=18),
         box('bw', 310, 704, 270, 70, 'BACKWARD\npayoff at T → price now', 'amber', size=18)),
    step('Where desks use the forward direction: calibration. Breeden and Litzenberger (1978) read the market\'s density off option prices; Dupire (1994) wrote the forward equation in strikes, so one forward solve prices every strike and maturity.',
         dict(hide='dr'), dict(hide='df'),
         box('cal', 20, 618, 560, 66, 'calibrate a smile: run forward, once, for every strike', 'green', size=19)),
    step('The trap: reuse a backward pricing solver for a forward risk question and it will not crash. It will give a stable, confident answer to the wrong question. Ask which end you know before you solve.',
         dict(hide='cal'),
         box('trap', 20, 618, 560, 66, 'backward solver + forward question = wrong answer, no crash', 'red', size=18),
         dict(pulse='fw'), dict(pulse='bw')),
])


BOARD = dict(name='fokker_planck_equation', lesson='fokker-planck-equation', title='Fokker-Planck: a cloud of paths, a predictable shape',
             cfg=FP, before='  <div class="tl-section-mark"><span>Section 03</span></div>', deck_after=7)
