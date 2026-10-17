from ._wb import *
from math import sqrt

# ── Dupire local volatility (institutional-dupire-local-vol) ─────────────────
# The lesson's worked example: Black-Scholes call prices from a flat 20% world (S = 100, r = 5%)
# on a five-point stencil around K = 100, T = 1.0, h = 5, dt = 0.1. The "bumped" case moves the
# centre quote from 10.4506 to 10.50 to show how the second strike derivative amplifies noise.
K, H, DT, R = 100, 5, 0.1, 0.05
P = dict(km=13.3465, k=10.4506, kp=8.0214, tm=9.7982, tp=11.0820)
def dupire(ck):
    d1 = (P['kp'] - P['km']) / (2 * H)
    d2 = (P['kp'] - 2 * ck + P['km']) / H ** 2
    dt = (P['tp'] - P['tm']) / (2 * DT)
    s2 = (dt + R * K * d1) / (0.5 * K * K * d2)
    return d1, d2, dt, s2, sqrt(s2) * 100
D1, D2, DTT, S2, SIG = dupire(P['k'])
assert (round(D1, 4), round(D2, 5), round(DTT, 4), round(S2, 5), round(SIG, 2)) == (-0.5325, 0.01867, 6.419, 0.04024, 20.06)
_, D2B, _, _, SIGB = dupire(10.50)
assert round(D2B, 5) == 0.01472 and round(SIGB, 2) == 22.59

DUP = dict(w=600, h=680, intro="Three ways to handle a smile, then Dupire's formula run on the lesson's own five call prices. Press play, or step through.", steps=[
    step('Black-Scholes glues the volatility dial in place: one number, forever. Real option markets never quote one flat volatility, so something has to give.',
         box('bs', 10, 10, 180, 92, 'Black-Scholes\nσ fixed', 'blue', size=19)),
    step('Heston and SABR let the dial wander on its own: volatility gets its own random shock, a second source of randomness alongside the price.',
         box('sv', 210, 10, 180, 92, 'Heston / SABR\nσ random: 2 shocks', 'purple', size=19)),
    step('Dupire\'s local vol does something else. The dial is not random at all: it is read off a map, σ_local(S, t). Know the spot and the time, and the volatility is a number you look up. One source of randomness.',
         box('lv', 410, 10, 180, 92, 'Local vol\nσ(S, t): a lookup', 'green', size=19)),
    step('Dupire (1994): hand me every call price C(K, T), and there is exactly one such map that reprices them all. It comes straight from the slopes of the price surface. Here are five prices around strike 100, one year, from a world with a flat 20% vol.',
         box('c', 120, 246, 100, 60, 'K, T', 'amber', sub='10.4506', size=18),
         box('l', 10, 246, 100, 60, 'K − 5', 'blue', sub='13.3465', size=18),
         box('r', 230, 246, 100, 60, 'K + 5', 'blue', sub='8.0214', size=18),
         box('u', 120, 170, 100, 60, 'T + 0.1', 'green', sub='11.0820', size=18),
         box('d', 120, 322, 100, 60, 'T − 0.1', 'green', sub='9.7982', size=18),
         note('ax', 170, 148, 'strike across · maturity up', None, 17)),
    step('Across strikes: the slope is (8.0214 − 13.3465) ÷ 10 = −0.5325, and the curvature is 0.01867. That curvature is the risk-neutral density at 100, the denominator of the formula.',
         box('dk', 350, 170, 240, 52, '∂C/∂K ≈ −0.5325', 'blue', size=19),
         box('dkk', 350, 234, 240, 52, '∂²C/∂K² ≈ 0.01867', 'blue', size=19),
         dict(pulse='l'), dict(pulse='r')),
    step('Across time: the calendar slope is (11.0820 − 9.7982) ÷ 0.2 = 6.4190. A call for a little longer costs a little more.',
         box('dt', 350, 298, 240, 52, '∂C/∂T ≈ 6.4190', 'green', size=19),
         dict(pulse='u'), dict(pulse='d')),
    step('Assemble: numerator 6.4190 − 0.05 × 100 × 0.5325 = 3.7564; denominator ½ × 100² × 0.01867 = 93.33. Local variance 0.04025, so local vol ≈ 20.06%. The true flat vol was 20%: the formula hands it back.',
         box('res', 350, 362, 240, 66, 'σ_local ≈ 20.06%', 'green', sub='true: 20%', size=21)),
    step('Real quotes are noisy. Nudge just the middle price by 5 cents, from 10.4506 to 10.50. The curvature drops to 0.01472 and local vol jumps to 22.59%. A second derivative amplifies noise.',
         dict(sub='c', text='10.50 (+5¢)'), dict(pulse='c'),
         box('nz', 10, 448, 580, 58, '5¢ on one quote: σ_local 20.06% → 22.59%', 'red', size=20)),
    step('So production desks never differentiate raw quotes. They fit a smooth, arbitrage-free surface first, a spline or a SABR smile, and differentiate that.',
         dict(sub='c', text='10.4506'),
         box('sm', 10, 522, 285, 70, 'smooth the surface\nfirst, then differentiate', 'amber', size=18)),
    step('Local vol reprices every vanilla today by construction, like tracing paper. But its forward smile is typically too flat. That is why desks use it to price exotics consistently, and blend it with stochastic vol in SLV hybrids.',
         box('fw', 305, 522, 285, 70, 'exact today,\ntoo flat tomorrow', 'red', size=18),
         note('end', 300, 636, 'a calibration device, not a model of how smiles move', 'green', 19)),
])


BOARD = dict(name='institutional_dupire_local_vol', lesson='institutional-dupire-local-vol',
             title="Dupire: reading local vol off the price surface", cfg=DUP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
