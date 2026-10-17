from ._wb import *
import math

# ── The SABR model (sabr-model) ───────────────────────────────────────────────
# The lesson's worked example: beta = 1 (FX convention), rho = -0.25, nu = 0.40, F = 1.2000,
# T = 0.25, ATM quote 10.00% -> alpha = 9.976%; vols 10.09% at 1.18 and 9.92% at 1.22.
# Every curve below is the lesson's own Hagan formula (beta = 1), the same code as its
# "Try it yourself" box. The curvature panel re-solves alpha for each nu with rho = 0 so all
# three curves share a 10% ATM vol, exactly like the lesson's nu chart.
F, T = 1.2, 0.25
def sB(a, rho, nu, K):
    br = 1 + (0.25 * rho * nu * a + (2 - 3 * rho * rho) / 24 * nu * nu) * T
    if abs(F - K) < 1e-12: return a * br
    z = nu / a * math.log(F / K)
    if abs(z) < 1e-10: return a * br
    xz = math.log((math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho))
    return a * z / xz * br
def solve_a(rho, nu, target=0.10):
    a = 0.1
    for _ in range(60): a = target / (1 + (0.25 * rho * nu * a + (2 - 3 * rho * rho) / 24 * nu * nu) * T)
    return a
A = solve_a(-0.25, 0.40)
assert round(100 * A, 2) == 9.98
assert round(100 * sB(A, -0.25, 0.4, 1.18), 2) == 10.09 and round(100 * sB(A, -0.25, 0.4, 1.22), 2) == 9.92
KS = [round(1.08 + i * 0.01, 2) for i in range(25)]
def curve(a, rho, nu): return [[k, round(100 * sB(a, rho, nu, k), 3)] for k in KS]
BASE = curve(A, -0.25, 0.40)
STEEP = curve(A, -0.50, 0.40)          # same alpha, rho doubled: 10.16% / 9.98% / 9.82%
assert round(100 * sB(A, -0.5, 0.4, 1.18), 2) == 10.16 and round(100 * sB(A, -0.5, 0.4, 1.22), 2) == 9.82
NU = {nu: curve(solve_a(0.0, nu), 0.0, nu) for nu in (0.1, 0.4, 0.8)}

SK = (10, 250, 580, 260)
CV = (10, 524, 330, 236)
SABR = dict(w=600, h=770, intro='How an FX options desk turns three live quotes into a vol for every strike, using the lesson\'s 3-month EUR/USD example. Press play, or step through.', steps=[
    step('Per expiry, the broker screens quote just three numbers: the at-the-money vol, the 25-delta risk reversal and the 25-delta butterfly. A client wants a strike nobody is quoting.',
         box('atm', 10, 12, 180, 70, 'ATM vol', 'blue', sub='the level', size=20),
         box('rr', 210, 12, 180, 70, '25Δ risk reversal', 'purple', sub='the skew', size=18),
         box('bf', 410, 12, 180, 70, '25Δ butterfly', 'amber', sub='the curvature', size=18)),
    step('SABR has four dials. Fix the backbone β by convention (FX desks run it at or near 1), and three are left: α, ρ and ν. Three unknowns, three quotes.',
         box('a', 10, 130, 180, 62, 'α: level', 'blue', size=20),
         box('r', 210, 130, 180, 62, 'ρ: skew', 'purple', size=20),
         box('n', 410, 130, 180, 62, 'ν: curvature', 'amber', size=20),
         arrow('atm', 'a'), arrow('rr', 'r'), arrow('bf', 'n'),
         note('beta', 300, 220, 'β = 1, fixed by convention', None, 18)),
    step('The trick is Hagan\'s 2002 formula: four numbers in, implied vol at any strike out. Logs, powers and a square root. No Fourier inversion, so each fit takes a blink.',
         dict(hide='beta'),
         note('alg', 300, 220, 'Hagan formula: pure algebra, no integration', 'green', 18)),
    step('The worked example: forward 1.2000, three months, ρ = −0.25, ν = 0.40. An at-the-money quote of 10.00% needs α = 9.98%. Here is the whole smile that gives.',
         dict(hide='alg'),
         chart('sk', SK, 'Implied vol by strike, 3-month EUR/USD', [1.08, 1.32], [9.1, 11.3],
               [[9.5, '9.5%'], [10.0, '10.0%'], [10.5, '10.5%'], [11.0, '11.0%']], [[1.10, '1.10'], [1.15, '1.15'], [1.20, '1.20'], [1.25, '1.25'], [1.30, '1.30']], pl=62, pr=14),
         series('base', 'sk', BASE, 'purple', ms=1400),
         dot('atmd', 'sk', [1.20, 10.0], 'ATM 10.00%', 'blue', dy=24)),
    step('Read off any strike. 200 pips below the forward, the 1.18 put: 10.09%. 200 pips above, the 1.22 call: 9.92%. Puts richer, as a negative ρ says.',
         dot('p', 'sk', [1.18, 10.091], '1.18: 10.09%', 'red', dx=-10, dy=22, anchor='end'),
         dot('c', 'sk', [1.22, 9.924], '1.22: 9.92%', 'green', dx=10, dy=-16, anchor='start')),
    step('Turn the skew dial: ρ from −0.25 to −0.50, nothing else changed. The put goes to 10.16%, the call to 9.82%, and the at-the-money barely moves. The tilt doubles.',
         dict(dim='base'),
         series('steep', 'sk', STEEP, 'red', dash=True, ms=1200, label='ρ = −0.50', lat=[1.30, round(100 * sB(A, -0.5, 0.4, 1.30), 3)], ldx=0, ldy=-18, lanchor='middle')),
    step('Now the curvature dial, with the skew switched off (ρ = 0) and α re-solved so every curve keeps a 10% at-the-money. ν = 0.1 is nearly flat.',
         chart('cv', CV, 'ν bends the smile (ρ = 0)', [1.08, 1.32], [9.9, 11.1], [[10, '10%'], [11, '11%']],
               [[1.08, '1.08'], [1.20, 'ATM'], [1.32, '1.32']], pl=48, pr=14),
         series('n1', 'cv', NU[0.1], None, ms=800, label='ν 0.1', lat=[1.32, NU[0.1][-1][1]], ldx=-4, ldy=-12, lanchor='end')),
    step('ν = 0.4 lifts both wings a little; ν = 0.8 lifts them a lot, to about 11.0% at 1.08. More doubt about volatility makes big moves either way more likely.',
         series('n4', 'cv', NU[0.4], 'blue', ms=800, label='ν 0.4', lat=[1.32, NU[0.4][-1][1]], ldx=-4, ldy=-14, lanchor='end'),
         series('n8', 'cv', NU[0.8], 'amber', ms=900, label='ν 0.8', lat=[1.32, NU[0.8][-1][1]], ldx=-10, ldy=-2, lanchor='end')),
    step('Spot ticks, the three quotes update, and the desk solves the same three equations again. And again. Fast refitting, not superior realism, is why SABR won.',
         dict(pulse='atm'), dict(pulse='rr'), dict(pulse='bf'),
         icon('clk', 'clock', 380, 528, 0.6, 'green', 'refit every tick', lsize=17)),
    step('The catch: it is an approximation. Far wings, long maturities or a high ν can even imply arbitrage. The authors\' "Arbitrage-Free SABR" (2014) patches that.',
         box('apx', 360, 640, 230, 120, 'approximation:\nwatch the far wings\nand high ν', 'red', size=18)),
])


BOARD = dict(name='sabr_model', lesson='sabr-model', title='SABR: three quotes in, a whole smile out', cfg=SABR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=11)
