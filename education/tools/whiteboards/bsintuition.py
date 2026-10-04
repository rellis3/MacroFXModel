from ._wb import *
from math import erf, exp, log, sqrt

# ── Black-Scholes intuition: the hedged book (black-scholes) ──────────────────
# The lesson's worked example: S = K = 100, r = 2%, sigma = 20%, T = 1 year:
# d1 = 0.20, d2 = 0.00, N(d1) = 0.5793, C = 57.93 − 49.01 = $8.92. Every other number is
# exact Black-Scholes arithmetic from those inputs (sigma = 40% → $16.70 is the lesson's
# Q4 case; S = 110, K = 110 and T = 0.5 change one input at a time). 1987: Dow −22.6%.
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def bs(S, K=100, r=0.02, s=0.2, T=1.0):
    d1 = (log(S / K) + (r + s * s / 2) * T) / (s * sqrt(T)); d2 = d1 - s * sqrt(T)
    return S * _N(d1) - K * exp(-r * T) * _N(d2), _N(d1)
C0, D0 = bs(100)                    # 8.916, 0.5793
CURVE = [[S, round(bs(S)[0], 3)] for S in range(76, 125, 2)]
def hedge(S): return round(C0 + D0 * (S - 100), 3)
HLINE = [[86, hedge(86)], [124, hedge(124)]]
GAP_X = [x for x in range(86, 116)]
GTOP = [[x, round(bs(x)[0], 3)] for x in GAP_X]
GBOT = [[x, hedge(x)] for x in GAP_X]
up1, dn1 = bs(101)[0] - C0, C0 - bs(99)[0]          # +0.589, −0.569
up10, dn10 = bs(110)[0] - hedge(110), bs(90)[0] - hedge(90)   # 0.90, 1.02
assert round(up10, 2) == 0.90 and round(dn10, 2) == 1.02

BARS = [[1, round(C0, 2), '$8.92', 'blue'], [2, round(bs(100, s=0.4)[0], 2), '$16.70', 'green'],
        [3, round(bs(100, T=0.5)[0], 2), '$6.12', 'red'], [4, round(bs(110)[0], 2), '$15.61', 'green'],
        [5, round(bs(100, K=110)[0], 2), '$4.94', 'red'], [6, round(C0, 2), '$8.92', 'purple']]
assert [b[2] for b in BARS] == ['$8.92', '$16.70', '$6.12', '$15.61', '$4.94', '$8.92'], BARS

VC = (10, 222, 580, 300)

BS = dict(w=600, h=890, intro='Sell a call, then hedge it with shares: watch the direction cancel out and volatility be the only thing left to pay for. The lesson\'s worked example, step by step.', steps=[
    step('You sell a call: a promise to deliver a $100 stock at a strike of $100 any time over the next year. The stock is at $100 today. If it rockets to $200, you lose $100 a share. What should you charge?',
         icon('you', 'person', 50, 6, 0.7, 'blue', 'you (seller)', lsize=17),
         icon('buyer', 'person', 470, 6, 0.7, 'green', 'buyer', lsize=17),
         icon('call', 'scroll', 130, 14, 0.5, 'purple'),
         move('call', 395, 14, 1300),
         note('cl', 262, 40, 'call · K = 100 · 1 year', 'purple', 18),
         note('q', 262, 82, 'price = ?', 'amber', 20)),
    step('Don\'t guess the direction. Build a copy instead, out of the stock itself plus cash earning the risk-free rate (2%). Hold Δ shares per option sold and keep adjusting.',
         icon('shares', 'up', 60, 100, 0.48, 'green', 'Δ shares', lsize=17),
         icon('cash', 'cash', 190, 100, 0.48, 'amber', 'cash at 2%', sym='$', lsize=17),
         dict(hide='q')),
    step('Here is the option\'s value today against the stock price (σ = 20%, one year left). At $100 it is worth $8.92, and it rises faster the higher the stock goes.',
         chart('v', VC, 'Call value today vs stock price', [76, 124], [0, 27], [[0, '$0'], [10, '$10'], [20, '$20']],
               [[80, '80'], [90, '90'], [100, '100'], [110, '110'], [120, '120']], pl=50, pr=14),
         series('cv', 'v', CURVE, 'purple', ms=1400, label='call value', lat=[118, bs(118)[0]], ldx=-10, ldy=-8, lanchor='end'),
         dot('at', 'v', [100, C0], '$8.92', 'purple', dx=-10, dy=-16, anchor='end')),
    step('How many shares? Delta, N(d1) = 0.58: the slope of that curve at $100. Hold 0.58 shares per call and the shares (the straight line) track the option for small moves.',
         series('hl', 'v', HLINE, 'green', dash=True, ms=800, label='0.58 shares + cash', lat=[106, hedge(106)], ldx=6, ldy=24, lanchor='start'),
         cnote('dl', 'v', [79, 22], 'Δ = N(d1) = 0.58', 'green', 19, anchor='start')),
    step('Nudge the stock up $1: the call gains $0.59, your shares gain $0.58. Nudge it down $1: the call loses $0.57, the shares lose $0.58. Either way your hedged book moves by only about one cent. Direction is gone.',
         icon('scale', 'scales', 440, 96, 0.5, 'blue', '±$1 → about −1¢', lsize=16),
         dict(pulse='hl')),
    step('What is left is the bend. Move $10 either way and the curve pulls away from the straight line: at $110 the call is $0.90 above the hedge, at $90 it is $1.02 above. You lose either way: the size of the move costs you, not its sign. That is gamma.',
         dict(gap='bend', chart='v', top=GTOP, bot=GBOT, tone='red', op=0.3),
         dot('g1', 'v', [110, bs(110)[0]], '+$0.90', 'red', dx=-12, dy=-8, anchor='end'),
         dot('g2', 'v', [90, bs(90)[0]], '+$1.02', 'red', dx=10, dy=18, anchor='start')),
    step('So your forecast of where the stock is going, its expected return μ, drops out entirely. The only thing that matters is how much it wanders: volatility σ. Bigger σ, bigger bends, a dearer option.',
         box('mu', 18, 534, 168, 64, 'μ: your forecast', 'red', size=18),
         dict(cross='mu'),
         box('sig', 200, 534, 175, 64, 'σ: how it wanders', 'green', size=18)),
    step('A hedged book with no direction is riskless, and a riskless book must earn the risk-free rate, or someone gets a free lunch. Solve that and out comes the formula: d1 = 0.20, d2 = 0.00, C = 57.93 − 49.01 = $8.92.',
         box('price', 390, 534, 200, 64, 'C = 57.93 − 49.01', 'purple', sub='$0.00', size=18),
         dict(count='price', **{'from': 0, 'to': 8.92, 'dp': 2, 'pre': '$', 'ms': 1200})),
    step('The hedge goes stale as the price moves. At $110 delta is 0.75, at $90 it is 0.37. Having sold the call, you must buy shares as the stock rises and sell as it falls: the short-gamma dealer\'s rebalancing.',
         dot('d110', 'v', [110, bs(110)[0]], 'Δ 0.75', 'green', dx=12, dy=8, anchor='start'),
         dot('d90', 'v', [90, bs(90)[0]], 'Δ 0.37', 'green', dx=8, dy=18, anchor='start'),
         dict(hide='g1'), dict(hide='g2')),
    step('What pushes the price, one input at a time from $8.92. Double σ to 40%: $16.70. Halve the time to six months: $6.12. Spot up to $110: $15.61. Strike up to $110: $4.94.',
         chart('in', (10, 612, 580, 270), 'Call price, one input changed', [0.4, 6.6], [0, 20], [[0, '$0'], [10, '$10']],
               [[1, 'worked'], [2, 'σ 40%'], [3, 'T ½ yr'], [4, 'S 110'], [5, 'K 110'], [6, 'any μ']], pl=50, pr=14),
         dict(bars='ib', chart='in', data=BARS[:5], bw=46, ms=1300)),
    step('And your view on direction? Bullish, bearish, it makes no difference: still $8.92. The formula has no slot for it.',
         dict(bars='ib2', chart='in', data=[[6, round(C0, 2), '$8.92', 'purple']], bw=46, ms=600),
         dict(pulse='mu')),
    step('The catch: all this assumes you can rehedge smoothly at prices close to the last one. On 19 October 1987 portfolio insurers\' deltas told them to sell more as prices fell; the Dow fell 22.6% and fills came in far below the model\'s prices.',
         icon('warn', 'warn', 545, 104, 0.42, 'red'),
         dict(pulse='bend')),
])


BOARD = dict(name='bsintuition', lesson='black-scholes', title='Hedge away direction, and volatility is what\'s left', cfg=BS,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>',
             deck_after=7)
