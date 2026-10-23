from ._wb import *
from math import erf, exp, log, sqrt

# ── From view to trade (options-trade-selection) ──────────────────────────────
# The lesson's own inputs: spot 100, implied volatility 22%, interest 2%, no dividends.
# Funnel = spot ± S σ √(t/365). Option values, breakevens and daily decay are Black-Scholes arithmetic.
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def _call(K, days, S=100.0, v=0.22, r=0.02):
    t = days / 365; d1 = (log(S / K) + (r + v * v / 2) * t) / (v * sqrt(t)); d2 = d1 - v * sqrt(t)
    return S * _N(d1) - K * exp(-r * t) * _N(d2)
def _theta_pct(days):   # share of premium lost per day, spot unchanged (closed-form theta)
    t = days / 365; v = 0.22; r = 0.02; K = 100.0; S = 100.0
    d1 = (log(S / K) + (r + v * v / 2) * t) / (v * sqrt(t)); d2 = d1 - v * sqrt(t)
    phi = exp(-d1 * d1 / 2) / sqrt(2 * 3.141592653589793)
    th = (-S * phi * v / (2 * sqrt(t)) - r * K * exp(-r * t) * _N(d2)) / 365
    return -th / _call(K, days) * 100
UP = [[d, round(100 + 100 * 0.22 * sqrt(d / 365), 2)] for d in range(0, 57, 4)]
LO = [[d, round(100 - 100 * 0.22 * sqrt(d / 365), 2)] for d in range(0, 57, 4)]
C28, C56, C105 = _call(100, 28), _call(100, 56), _call(105, 56)
BE56, BE105 = 100 + C56, 105 + C105
M28 = 100 * 0.22 * sqrt(28 / 365)
CH = dict(x=10, y=150, w=580, h=272)
CHR = (CH['x'], CH['y'], CH['w'], CH['h'])
TH = {d: _theta_pct(d) for d in (7, 28, 56, 90)}

BOARD_CFG = dict(w=600, h=660, intro='One $100 stock, one view, and the questions that turn it into a contract. Spot 100, implied volatility 22%. Press play, or step through.', steps=[
    step('Your view, in four parts: direction up; size about +4%, to $104; window 28 days; confidence moderate. The stock is at $100. A view is not yet a trade.',
         icon('you', 'person', 40, 14, 0.7, 'blue', 'you', lsize=18),
         note('view', 340, 60, 'up to ~$104\nwithin 28 days', 'blue', 22)),
    step('First ask what the options market already expects. At 22% implied volatility a typical move grows with the square root of time: a funnel around today\'s price.',
         chart('cone', CHR, 'Stock price, and the market\'s typical range', [0, 58], [90, 111], [[90, '90'], [100, '100'], [110, '110']],
               [[0, 'today'], [28, 'day 28'], [56, 'day 56']], pl=40, pr=22),
         series('up', 'cone', UP, 'blue', ms=1500), series('lo', 'cone', LO, 'blue', ms=1500),
         ),
    step(f'At day 28 one standard deviation is ±${M28:.2f}. Your target, $104, is inside the funnel: the market already expects wobbles bigger than your move.',
         dot('tgt', 'cone', [28, 104], 'your target $104', 'green', dx=-12, dy=26, anchor='end'),
         dot('sd', 'cone', [28, round(100 + M28, 2)], f'+1σ ${100 + M28:.2f}', 'blue', dx=-10, dy=-12, anchor='end')),
    step(f'The market\'s price for "how far, either way" is the at-the-money straddle: about $4.86 for 28 days, roughly 0.8 of a typical move. So direction alone is no edge. Yours is that the centre sits higher.',
         box('st', 310, 446, 280, 92, 'straddle ≈ $4.86\n≈ 0.8 × $6.09', 'purple', size=19)),
    step('Pick an expiry. A 28-day option ends exactly when your window ends. If the move arrives on day 30, a correct view finds a dead option.',
         series('x28', 'cone', [[28, 90], [28, 111]], 'red', dash=True, ms=700),
         cnote('x28l', 'cone', [28, 92.6], '28-day expiry', 'red', 17, anchor='end', dx=-8)),
    step(f'A 56-day option outlasts the window. It costs more, ${C56:.2f} against ${C28:.2f}, but it still has value if you are late.',
         dot('e56', 'cone', [56, 100], '56-day expiry', 'green', dx=-12, dy=26, anchor='end')),
    step(f'The rent per dollar: the 28-day call loses {TH[28]:.2f}% of its value a day with the stock unchanged. The 56-day call loses {TH[56]:.2f}%. The shortest options are the most expensive to hold.',
         chart('bar', (10, 446, 280, 200), 'Daily decay, % of premium', [0, 5], [0, 9.5], [[0, '0'], [4, '4%'], [8, '8%']],
               [[1, '7d'], [2, '28d'], [3, '56d'], [4, '90d']], pl=44),
         dict(bars='tb', chart='bar', data=[[1, round(TH[7], 2), f'{TH[7]:.1f}', 'red'], [2, round(TH[28], 2), f'{TH[28]:.2f}', 'amber'], [3, round(TH[56], 2), f'{TH[56]:.2f}', 'blue'], [4, round(TH[90], 2), f'{TH[90]:.2f}', 'blue']], bw=40, ms=1200)),
    step(f'Pick a strike by its breakeven. The 56-day at-the-money call: strike 100 plus premium ${C56:.2f} gives ${BE56:.2f}, a {C56:.1f}% rise. That is {C56 / (100 * 0.22 * sqrt(56 / 365)):.2f} of a typical move (R).',
         series('be', 'cone', [[0, round(BE56, 2)], [56, round(BE56, 2)]], 'amber', dash=True, ms=900),
         cnote('bel', 'cone', [56, round(BE56, 2)], f'breakeven ${BE56:.2f}', 'amber', 17, anchor='end', dx=0, dy=22)),
    step(f'Cheaper strikes need more. The 105 call costs ${C105:.2f} but breaks even at ${BE105:.2f}, above your $104 target, so it loses even if you are exactly right.',
         series('be105', 'cone', [[0, round(BE105, 2)], [56, round(BE105, 2)]], 'red', dash=True, ms=900),
         cnote('b105l', 'cone', [1, round(BE105, 2)], f'105 call: ${BE105:.2f}', 'red', 17, anchor='start', dx=0, dy=-12)),
    step('Check the volatility you pay. You buy 22%, you expect 18%. The same call would cost $2.96 at your volatility, so you pay about 21% more for the gap.',
         box('vol', 310, 554, 280, 92, 'pay 22% · expect 18%\n≈ 21% overpay', 'amber', size=18)),
    step('Check costs. A $0.05 spread is 1.4% of the $3.59 call but 22.6% of a 22-cent far-out call. Cheap contracts are expensive to cross.',
         dict(hide='st'), dict(hide='vol'),
         box('cost', 310, 446, 280, 92, '$0.05 spread:\n1.4% of $3.59\n22.6% of $0.22', 'red', size=18)),
    step(f'Size by the worst case. The most you can lose is the premium, ${C56 * 100:.2f} a contract. Against a $500 risk budget that is one contract.',
         box('size', 310, 554, 280, 92, 'max loss $358.68\nbudget $500 → 1 contract', 'green', size=18)),
    step('Trade it only if your numbers beat the market\'s by more than the costs. Otherwise the right trade is no trade.',
         dict(pulse='size'), dict(pulse='cost')),
])

BOARD = dict(name='options_trade_selection', lesson='options-trade-selection', title='From view to trade: choosing the contract', cfg=BOARD_CFG,
             before='  <div class="tl-box scenario">\n    <div class="tl-icon-badge amber">🎯</div>\n    <div class="tl-box-label">Real-world trading scenario (illustrative numbers)</div>',
             deck_after=7)
