from ._wb import *
import math, random

# ── The Heston model (heston-model) ───────────────────────────────────────────
# The visual guide's worked numbers: kappa = 2, theta = 0.04 (vol 20%), v0 = 0.09 (vol 30%),
# half-life ln2/kappa = 0.347 yr = 126.5 days. The deterministic reversion path is exact.
# The joint price/vol path is ONE illustrative Euler simulation (seed 122, daily steps, one
# year) with an assumed vol of vol xi = 0.3 and rho = -0.7; xi = 0.3 sits inside the Feller
# bound 2*kappa*theta = 0.16 >= xi^2. The smile panel uses the guide's own stylized curve,
# iv = 18 + 6 m^2 + 8 rho m (illustrative vol points), for rho = -0.7 and rho = 0.
K, TH, V0, XI, RHO = 2.0, 0.04, 0.09, 0.3, -0.7
HL = math.log(2) / K
assert round(HL * 365, 1) == 126.5

def _rev(t): return TH + (V0 - TH) * math.exp(-K * t)
REV = [[round(d, 1), round(100 * math.sqrt(_rev(d / 365)), 2)] for d in range(0, 366, 5)]

def _sim(seed=122, n=252):
    r = random.Random(seed); v, s, vs, ss = V0, 100.0, [V0], [100.0]; dt = 1 / n
    for _ in range(n):
        z2 = r.gauss(0, 1); z1 = RHO * z2 + math.sqrt(1 - RHO * RHO) * r.gauss(0, 1)
        vp = max(v, 0.0)
        s *= math.exp(-0.5 * vp * dt + math.sqrt(vp * dt) * z1)
        v = v + K * (TH - vp) * dt + XI * math.sqrt(vp * dt) * z2
        vs.append(max(v, 0.0)); ss.append(s)
    return vs, ss
VS, SS = _sim()
VOL = [100 * math.sqrt(v) for v in VS]
# trading day d -> calendar-ish x in days (252 trading days drawn over 365 calendar days)
def _x(d): return round(d * 365 / 252, 1)
VPATH = [[_x(d), round(VOL[d], 2)] for d in range(0, 253, 3)]
SPATH = [[_x(d), round(SS[d], 2)] for d in range(0, 253, 3)]
PK, SP = 156, 184            # price peak and the vol spike that follows
assert round(SS[PK], 1) == 121.5 and round(VOL[PK], 1) == 18.2
assert round(SS[SP], 1) == 97.6 and round(VOL[SP], 1) == 32.8
DROP = round(100 * (SS[SP] / SS[PK] - 1), 1)   # -19.7

def _iv(m, rho): return 18 + 6 * m * m + rho * 8 * m
SK = [[round(m / 10, 1), round(_iv(m / 10, RHO), 2)] for m in range(-10, 11)]
SM = [[round(m / 10, 1), round(_iv(m / 10, 0.0), 2)] for m in range(-10, 11)]

VC = (10, 10, 580, 230)
PC = (10, 250, 580, 210)
SC = (10, 470, 330, 230)
HESTON = dict(w=600, h=710, intro='Black-Scholes freezes volatility at one number. Heston lets it move, and ties its moves to the price. Watch what that does to a path, and to the smile. Press play, or step through.', steps=[
    step('Black-Scholes: one number for volatility, from today to expiry. Here it is 20%, a flat line.',
         chart('vol', VC, 'Volatility over one year', [0, 365], [10, 36], [[20, '20%'], [30, '30%']],
               [[0, 'today'], [126, '126 d'], [365, '1 yr']], pl=48, pr=14),
         series('bs', 'vol', [[0, 20], [365, 20]], None, dash=True, ms=600, label='Black-Scholes: flat 20%', lat=[365, 20], ldx=-4, ldy=16, lanchor='end')),
    step('Heston: volatility is its own process. Today it is 30% (a variance of 0.09). Its long-run level is 20% (a variance of 0.04).',
         dot('v0', 'vol', [0, 30], 'today 30%', 'blue', dx=8, dy=-14, anchor='start')),
    step('The rubber band: the drift κ(θ − v) pulls variance back toward its long-run level. With κ = 2, half the gap closes in ln 2 ÷ 2 = 0.35 years, about 126 days.',
         series('rev', 'vol', REV, 'green', ms=1400),
         dot('hl', 'vol', [126.5, 25.5], 'half-life: 126 days', 'green', dx=8, dy=-16, anchor='start')),
    step('Add vol of vol: variance also gets its own random shocks, sized ξ√v. Here is one illustrative path, with ξ = 0.3 assumed. It wanders, but the band keeps pulling it back toward 20%.',
         dict(dim='rev'), dict(dim='bs'), dict(hide='hl'),
         series('vp', 'vol', VPATH, 'blue', ms=1800)),
    step('Now the price, on the same days. Its shocks are tied to the vol shocks with correlation ρ = −0.7. This illustrative path starts at 100.',
         chart('px', PC, 'Price, same illustrative year', [0, 365], [85, 130], [[100, '100'], [120, '120']],
               [[0, 'today'], [182, '6 mo'], [365, '1 yr']], pl=48, pr=14),
         series('sp', 'px', SPATH, 'purple', ms=1800)),
    step(f'Look where they line up. After about seven months the price peaks at 121.5 with volatility down at 18%. Over the next six weeks or so it falls {abs(DROP)}% to 97.6, and volatility jumps to 33%.',
         dot('pk', 'px', [_x(PK), 121.5], 'peak 121.5', 'purple', dx=-8, dy=-14, anchor='end'),
         dot('lo', 'px', [_x(SP), 97.6], f'97.6 ({DROP}%)', 'red', dx=8, dy=16, anchor='start'),
         dot('vq', 'vol', [_x(PK), round(VOL[PK], 1)], '18%', 'blue', dy=18),
         dot('vs', 'vol', [_x(SP), round(VOL[SP], 1)], 'spike 33%', 'red', dx=8, dy=-14, anchor='start')),
    step('That is the leverage effect, built in by the negative correlation: falls tend to arrive with a volatility spike. Big down moves happen in wild markets, so the left tail is fatter than the right.',
         dict(pulse='lo'), dict(pulse='vs')),
    step('Price options under these dynamics and back out a Black-Scholes vol for each strike. Low strikes come out higher: a put pays off in exactly the state where volatility has jumped. That is the skew (stylized here).',
         chart('sm', SC, 'Implied vol by strike', [-1, 1], [16, 31], [[18, 'ATM']],
               [[-1, 'puts'], [0, 'ATM'], [1, 'calls']], pl=48, pr=14),
         series('flat', 'sm', [[-1, 18], [1, 18]], None, dash=True, ms=500),
         series('sk', 'sm', SK, 'red', ms=1200, label='ρ = −0.7', lat=[-1, 29.6], ldx=14, ldy=10, lanchor='start')),
    step('Set ρ to zero and the tilt goes: vol of vol alone bends a symmetric smile. Take vol of vol to zero as well and you are back to the flat Black-Scholes line.',
         series('sm0', 'sm', SM, 'purple', dash=True, ms=1000, label='ρ = 0', lat=[1, 24], ldx=-4, ldy=-14, lanchor='end')),
    step('A check on any fit, the Feller condition: 2κθ ≥ ξ² keeps variance off zero. With κ = 2 and θ = 0.04 that is 0.16, so ξ up to 0.4 passes. Many real calibrations break it.',
         box('fel', 360, 470, 230, 104, 'Feller: 2κθ ≥ ξ²\n2 × 2 × 0.04 = 0.16\nξ ≤ 0.4 passes', 'amber', size=18)),
    step('On a desk, five numbers (κ, θ, ξ, ρ, v₀) are fitted to the option surface every day. They are a risk-neutral snapshot, not a law, and a good fit is not a trading edge.',
         box('cal', 360, 590, 230, 110, 'fit κ, θ, ξ, ρ, v₀\nto today\'s surface:\na snapshot, not a law', 'blue', size=18)),
])


BOARD = dict(name='heston_model', lesson='heston-model', title='Heston: when volatility moves with the price',
             cfg=HESTON,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
