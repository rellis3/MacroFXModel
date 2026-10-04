from ._wb import *
from math import erf, exp, log, pi, sqrt

# ── Theta decay (theta-decay) ─────────────────────────────────────────────────
# The lesson's own inputs: S = K = 100, r = 2%, sigma = 20%, at the money. Option values
# below are exact arithmetic from the lesson's closed-form price C = S N(d1) - K e^(-r tau) N(d2);
# daily theta (0.0408 / 0.0816 / 0.2115) is the lesson's worked example.
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def _call(dte):
    if dte <= 0: return 0.0
    t = dte / 365; d1 = (log(1) + (0.02 + 0.02) * t) / (0.2 * sqrt(t)); d2 = d1 - 0.2 * sqrt(t)
    return 100 * _N(d1) - 100 * exp(-0.02 * t) * _N(d2)
def _path(days):  # x = days elapsed (0 = 30 days left), y = option value
    return [[d, round(_call(30 - d), 3)] for d in days]

P1 = _path([0, 3, 6, 9, 12, 15, 18, 21, 23])
P2 = _path([23, 24, 25, 26, 27, 28, 29])
P3 = _path([29, 29.4, 29.7, 29.9, 29.97, 30])
V = dict(x=10, y=150, w=580, h=270)
VAL = (V['x'], V['y'], V['w'], V['h'])

THETA = dict(w=600, h=660, intro='One at-the-money call, 30 days from expiry, using the lesson\'s numbers. Watch its time value melt, slowly at first, then fast. Press play, or step through.', steps=[
    step('Meet the option: an at-the-money call with spot and strike both at 100, 20% volatility, 2% rates and 30 days left. Being at the money, its whole price, about $2.37, is time value. Picture it as an ice cube.',
         icon('ice', 'ice', 250, 6, 0.9, 'blue', 'time value ≈ $2.37', lsize=18)),
    step('You own the cube. The dealer who sold it to you is on the other side. Each day a little of it melts, and that melt is theta: rent you pay for the right to gain from big moves.',
         icon('you', 'person', 40, 14, 0.7, 'blue', 'you (long call)', lsize=17),
         icon('dealer', 'person', 490, 14, 0.7, 'green', 'seller (short call)', lsize=17),
         icon('rent', 'coin', 120, 30, 0.38, 'amber', sym='$'),
         move('rent', 440, 30, 1500),
         note('rl', 300, 140, 'theta = daily rent →', 'amber', 17)),
    step('Now let the days pass, spot stuck at 100. From 30 days left down to 7, the option slides from $2.37 to $1.12. At the start it loses about 4 cents a day: theta is −$0.041 per day.',
         dict(hide='rent'), dict(hide='rl'),
         chart('val', VAL, 'Call value ($) as the days run out', [0, 30], [0, 2.75], [[0, '$0'], [1, '$1'], [2, '$2']],
               [[0, '30 days'], [16, '14'], [23, '7'], [30, '0 left']], pl=44, pr=22),
         series('v1', 'val', P1, 'blue', ms=1600),
         dot('d30', 'val', [0, 2.368], '$2.37 · −$0.041/day', 'blue', dx=12, dy=-14, anchor='start'),
         dict(hide='ice'),
         icon('ice2', 'ice', 262, 18, 0.66, 'blue', '$1.12', lsize=18)),
    step('With 7 days left, theta is −$0.082 per day: roughly twice the 30-day rate, for the same option.',
         dot('d7', 'val', [23, 1.124], '$1.12 · −$0.082/day', 'amber', dx=-12, dy=22, anchor='end')),
    step('Then the final week. The curve bends sharply down: $1.12 with 7 days left, $0.42 with 1 day left. Nearly half the option\'s value melts in the last week.',
         series('v2', 'val', P2, 'red', ms=1300),
         dict(hide='ice2'),
         icon('ice3', 'ice', 274, 30, 0.42, 'red', '$0.42', lsize=18)),
    step('On the last day theta is −$0.21 per day: another 2.6 times jump, and about 5 times the 30-day rate. At expiry, with spot still at 100, the call is worth nothing. The cube is gone.',
         dot('d1', 'val', [29, 0.42], '$0.42 · −$0.21/day', 'red', dx=-14, dy=12, anchor='end'),
         series('v3', 'val', P3, 'red', ms=600),
         dict(hide='ice3'),
         note('pud', 300, 92, '💧 melted', 'red', 20)),
    step('Side by side: the daily melt at 30, 7 and 1 day to expiry. It doesn\'t drip steadily like a leaky tap. It speeds up like a countdown timer.',
         chart('bar', (10, 446, 280, 200), 'Theta, $ lost per day', [0, 4], [0, 0.27], [[0, '0'], [0.1, '0.10'], [0.2, '0.20']],
               [[1, '30d'], [2, '7d'], [3, '1d']], pl=46),
         dict(bars='tb', chart='bar', data=[[1, 0.0408, '0.041', 'blue'], [2, 0.0816, '0.082', 'amber'], [3, 0.2115, '0.212', 'red']], bw=40, ms=1200)),
    step('Trap: don\'t multiply today\'s theta by the days left. 30 days × $0.041 is only $1.22 (the dashed line), yet the option loses its whole $2.37 by expiry. The straight line understates the end and overstates the start.',
         series('lin', 'val', [[0, 2.368], [30, round(2.368 - 0.0408 * 30, 3)]], 'amber', dash=True, ms=800),
         cnote('linl', 'val', [30, 1.146], '30 × $0.041\n= $1.22 only', 'amber', 17, anchor='end', dx=-4, dy=-78)),
    step('Why it speeds up: theta has the same 1/√τ term as gamma. For a hedged option, theta ≈ −½σ²S²Γ. Theta is the rent, gamma is the convexity it buys. Theta pays for gamma.',
         box('id', 310, 446, 280, 92, 'θ ≈ −½σ²S²Γ\ntheta pays for gamma', 'purple', size=20)),
    step('Is the rent fair? It was priced at 20% implied volatility. If the price actually moves more than that, your hedging gains beat the melt and you win. If it stays calmer, you lose, even with no directional view at all.',
         box('vs', 310, 554, 280, 92, 'realised > 20% → you win\nrealised < 20% → seller wins', 'green', size=18),
         dict(pulse='you'), dict(pulse='dealer')),
    step('Calendar spread: sell a near-dated option (a fast-melting cube) and buy a later one at the same strike (a slow-melting cube). You pocket the difference in melt speed, as long as the price stays near the strike.',
         dict(hide='pud'),
         icon('near', 'ice', 196, 34, 0.48, 'red', 'SELL near', lsize=17),
         icon('far', 'ice', 318, 14, 0.7, 'blue', 'BUY far', lsize=17)),
    step('The catch, for every seller of rent: being long theta means being short gamma. Small steady melt comes in daily; one big move can take it all back and more. Picking up nickels in front of a steamroller.',
         icon('roller', 'warn', 412, 44, 0.42, 'red'),
         dict(pulse='dealer'), dict(pulse='near')),
])


BOARD = dict(name='theta', lesson='theta-decay', title='Theta: watch time value melt', cfg=THETA,
             before='  <div class="tl-box scenario">\n    <div class="tl-icon-badge amber">🎯</div>\n    <div class="tl-box-label">Real-world trading scenario</div>',
             deck_after=9)
