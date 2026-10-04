from ._wb import *
from math import exp, pi, sqrt
import random

# ── Merton jump-diffusion (merton-jump-diffusion) ─────────────────────────────
# Facts and numbers from the lesson: dS/S = μdt + σdW + dJ; λ (how often), μ_J, σ_J (how
# big, which way); NFP at 8:30am ET moving 50, 100, even 200+ pips in seconds; the deck's
# Poisson example λ = 2 a year, T = 0.5 → λT = 1, P(at least one) = 1 − e^−1 = 63.2%;
# Merton price = Poisson-weighted mix of Black-Scholes prices, never below the no-jump
# price; event vol and vol crush; the SNB's 1.20 EUR/CHF floor (Sept 2011 – 15 Jan 2015):
# below 0.90 within minutes, near parity by the end of the day, deposit rate −0.75%.
# Every path, density and smile below is illustrative (shape only).

# Chart A: an hour around an NFP release, pips from the 8:00 price (illustrative).
random.seed(7)
DIFF, v = [], 0.0
for m in range(0, 61):
    DIFF.append([m, round(v, 1)])
    v += random.gauss(0, 3.2)
JUMPED = [[m, y] for m, y in DIFF if m <= 30] + [[30, DIFF[30][1] + 100]] + \
         [[m, round(y + 100, 1)] for m, y in DIFF if m > 30]

# Chart B: return densities with the same overall variance (illustrative):
# normal N(0,1) vs 90% calm N(0, 0.816²) + 10% jump days N(0, 2²).
def _pdf(x, s): return exp(-x * x / (2 * s * s)) / (s * sqrt(2 * pi))
S0 = sqrt(0.6 / 0.9)
def _mix(x): return 0.9 * _pdf(x, S0) + 0.1 * _pdf(x, 2.0)
XS = [round(-4.5 + 0.15 * i, 2) for i in range(61)]
NORM = [[x, round(_pdf(x, 1), 4)] for x in XS]
MIX = [[x, round(_mix(x), 4)] for x in XS]
TX = [round(2.6 + 0.1 * i, 2) for i in range(25)]
NORM_T = [[x, round(_pdf(x, 1), 5)] for x in TX]
MIX_T = [[x, round(_mix(x), 5)] for x in TX]

# Chart C: implied vol across strikes (illustrative shape).
KX = [round(-1 + 0.1 * i, 1) for i in range(21)]
SMILE = [[k, round(0.42 + 0.42 * k * k, 3)] for k in KX]

# Chart D: jump intensity through NFP morning (illustrative; hours ET).
LAM = [[7, 0.05], [8, 0.05], [8.4, 0.06], [8.5, 0.92], [8.6, 0.06], [9, 0.05], [10.5, 0.05]]

# Chart E: EUR/CHF on its floor (approx. shape) and 15 January 2015.
random.seed(3)
FLOOR, t = [], 2011.70
while t < 2015.03:
    FLOOR.append([round(t, 3), round(1.205 + abs(random.gauss(0, 0.012)), 3)])
    t += 0.09
FLOOR.append([2015.03, 1.201])
JUMPDAY = [[2015.03, 1.201], [2015.04, 0.87], [2015.06, 1.00]]

A = (10, 130, 580, 240)
E = (10, 130, 580, 240)
EXD, EYD = [2011.5, 2015.4], [0.8, 1.3]
def epx(t, ch=E, xd=EXD, pl=56, pr=14): return ch[0] + pl + (t - xd[0]) / (xd[1] - xd[0]) * (ch[2] - pl - pr)
def epy(v, ch=E, yd=EYD, pt=34, pb=26): return ch[1] + ch[3] - pb - (v - yd[0]) / (yd[1] - yd[0]) * (ch[3] - pt - pb)

HIDE_A = ['pa', 'ja', 'jb', 'rel', 'rell', 'gapl']

JUMP = dict(w=600, h=910, intro='Merton\'s model in pictures: a price that wanders smoothly, then suddenly tears, and what that tear does to tails and option prices. Press play, or step through.', steps=[
    step('Merton\'s model stacks two kinds of randomness. A coin flipped every instant: the tiny, smooth wiggle σ·dW that Black-Scholes already has. And a lightning bolt that almost never strikes: the jump term dJ.',
         icon('coin', 'coin', 40, 4, 0.66, 'blue', 'σ·dW: wiggle', sym='±', lsize=17),
         icon('bolt', 'bolt', 186, 4, 0.66, 'red', 'dJ: rare jolt', lsize=17)),
    step('First, diffusion alone, over an hour around a data release. The price wanders, but it never skips a level: zoom in as far as you like and the line never breaks. That is the only kind of path Black-Scholes allows.',
         chart('a', A, 'Price, pips from 8:00 (illustrative)', [0, 60], [-40, 140], [[0, '0'], [50, '+50'], [100, '+100']],
               [[0, '8:00'], [30, '8:30'], [60, '9:00']], pl=56, pr=26),
         series('pa', 'a', DIFF, 'blue', ms=1600, label='pure diffusion', lat=[60, DIFF[60][1]], ldx=-4, ldy=20, lanchor='end')),
    step('Now 8:30am ET on NFP Friday. The number hits the wire and the price gaps: here 100 pips (the lesson says 50, 100, even 200+) in seconds, with nothing trading in between. Same path before, a tear at the release, then ordinary wiggling again.',
         series('rel', 'a', [[30, -40], [30, 140]], None, dash=True, ms=500),
         cnote('rell', 'a', [30, 128], 'NFP 8:30 ET', None, 17, anchor='end', dx=-8),
         series('ja', 'a', JUMPED[:32], 'red', ms=1100),
         series('jb', 'a', JUMPED[31:], 'red', ms=900),
         cnote('gapl', 'a', [30, DIFF[30][1] + 50], '← no trades\nin the gap', 'red', 17, anchor='start', dx=14),
         dict(pulse='bolt')),
    step('Three new dials control the bolt. λ, the jump intensity: how often it strikes (say 0.05 jumps per trading day). μ_J and σ_J: how big each jump is on average, which way, and how much the size varies from one jump to the next.',
         icon('clock', 'clock', 330, 4, 0.62, 'amber', 'λ: how often', lsize=17),
         icon('dice', 'dice', 470, 4, 0.62, 'purple', 'μ_J, σ_J: how big', lsize=17)),
    step('The "when" is a Poisson clock. With λ = 2 jumps a year, over half a year you expect λT = 1 jump, and the chance of at least one is 1 − e^−1 = 63.2%. Turn λ down to zero and Merton collapses back to plain Black-Scholes.',
         box('pois', 10, 384, 285, 70, 'λT = 2 × 0.5 = 1 jump', 'amber', sub='P(≥1 jump) = 63.2%', size=19)),
    step('What jumps do to returns. Most days have no jump, so they cluster tighter around zero than one flat-σ bell curve would say: a taller, narrower middle (red). Both curves here have the same overall variance.',
         chart('b', (10, 468, 285, 214), 'Daily returns (illustrative)', [-4.5, 4.5], [0, 0.56], [], [[0, '0'], [-3, '−3σ'], [3, '+3σ']], pl=16, pr=10),
         series('bn', 'b', NORM, 'blue', ms=1000, label='normal', lat=[-1.6, 0.11], ldx=-4, ldy=-14, lanchor='end'),
         series('bm', 'b', MIX, 'red', ms=1000, label='with jumps', lat=[0.5, 0.42], ldx=8, ldy=-8, lanchor='start')),
    step('Out in the wings, zoomed in: the rare jump days pile up mass where the normal curve has almost none. Tall middle plus fat tails is excess kurtosis, not just a wider bell.',
         chart('bt', (305, 468, 285, 214), 'Right tail, zoomed', [2.6, 5.1], [0, 0.02], [], [[3, '3σ'], [4, '4σ'], [5, '5σ']], pl=16, pr=14),
         dict(gap='tg', chart='bt', top=MIX_T[4:], bot=NORM_T[4:], tone='red', op=0.25),
         series('btn', 'bt', NORM_T, 'blue', ms=900, label='normal', lat=[2.8, 0.0125], ldx=10, ldy=0, lanchor='start'),
         series('btm', 'bt', MIX_T, 'red', ms=900, label='fat tail', lat=[4.2, 0.0035], ldx=6, ldy=-16, lanchor='start')),
    step('Now price options. Plain Black-Scholes uses one flat σ for every strike. But a deep out-of-the-money option is a bet on a surprise, the very move only a jump makes likely. Flat σ prices those bets too cheap.',
         chart('c', (10, 696, 285, 206), 'Implied vol (illustrative)', [-1.1, 1.1], [0, 1], [],
               [[-0.9, 'OTM put'], [0, 'ATM'], [0.9, 'OTM call']], pl=16, pr=10),
         series('flat', 'c', [[-1, 0.42], [1, 0.42]], 'blue', dash=True, ms=600, label='one flat σ', lat=[0, 0.42], ldy=20)),
    step('The market charges for the jump anyway: back out the σ each traded price implies and the line bends up at the wings, the volatility smile. Merton\'s own price does it openly: a Poisson-weighted average of Black-Scholes prices for 0, 1, 2… jumps, so never cheaper than the no-jump price.',
         series('sm', 'c', SMILE, 'red', ms=1100, label='market smile', lat=[0.62, 0.62], ldx=-10, ldy=-8, lanchor='end'),
         box('mert', 305, 384, 285, 70, 'C = Σ P(n jumps) × C_BS(σ_n)', 'purple', sub='≥ the no-jump price', size=18),
         dict(pulse='bolt')),
    step('Jump risk is not spread evenly. λ spikes for the few minutes around a known release and sits near zero on a quiet stretch. So a one-week option that straddles NFP trades at a higher implied vol, and after the print it drops: vol crush.',
         chart('d', (305, 696, 285, 206), 'λ through NFP morning', [7, 10.5], [0, 1.08], [], [[7, '7am'], [8.5, '8:30'], [10, '10am']], pl=16, pr=14),
         series('lam', 'd', LAM, 'amber', ms=1200),
         cnote('ev', 'd', [8.6, 0.84], 'event vol', 'amber', 17, anchor='start', dx=8),
         cnote('cr', 'd', [9.7, 0.42], 'then\nvol crush', 'blue', 17)),
    step('The biggest jump of all. From September 2011 the Swiss National Bank held EUR/CHF above a 1.20 floor. For three years it sat just above 1.20 and its volatility shrank to almost nothing.',
         *[dict(hide=h) for h in HIDE_A], dict(hide='a'),
         chart('e', E, 'EUR/CHF, francs per euro (approx. shape)', EXD, EYD, [[0.9, '0.90'], [1.0, '1.00'], [1.2, '1.20']],
               [[2012, '2012'], [2013, '2013'], [2014, '2014'], [2015, '2015']], pl=56, pr=14),
         series('fl', 'e', [[2011.5, 1.2], [2015.4, 1.2]], None, dash=True, ms=500),
         series('eu', 'e', FLOOR, 'blue', ms=1600),
         cnote('fll', 'e', [2012.2, 1.2], 'SNB floor 1.20', None, 17, dy=18),
         chip('stop', epx(2013.6), epy(1.12), 'stops just under 1.20', 'amber')),
    step('15 January 2015: the SNB dropped the floor without warning and cut its deposit rate to −0.75%. Within minutes EUR/CHF fell below 0.90, with almost nothing trading in between; it ended the day near parity. Stops under 1.20 were filled far below.',
         series('ej', 'e', JUMPDAY, 'red', ms=900),
         dot('lo', 'e', [2015.04, 0.87], 'below 0.90\nin minutes', 'red', dx=-12, dy=-6, anchor='end'),
         dot('par', 'e', [2015.06, 1.0], '≈ parity', 'red', dx=-12, dy=-4, anchor='end'),
         move('stop', epx(2012.7), epy(0.9), 1300),
         dict(pulse='bolt')),
    step('The lesson: those calm years were not low risk. Tiny σ, with nearly all the risk sitting in λ and μ_J. A model fitted to 2012–2014 alone would have put both near zero. On a floored or pegged rate, calm is evidence of jump risk.',
         note('end', 300, 116, 'calm on a floor = hidden jump risk', 'green', 21),
         dict(pulse='clock'), dict(pulse='dice')),
])


BOARD = dict(name='jump', lesson='merton-jump-diffusion', title='A smooth wander, then a jump', cfg=JUMP,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=11)
