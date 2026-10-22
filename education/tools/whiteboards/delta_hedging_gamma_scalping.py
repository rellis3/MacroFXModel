from ._wb import *

# ── Delta hedging and gamma scalping (delta-hedging-gamma-scalping) ───────────────────────────────
# The lesson's option: long one 21-day at-the-money call, S = K = 100, 20% implied, r = 0, hedged once a
# day. The path is the lesson's own seeded simulation (seed 10): realised volatility parameter 26%
# (sample 25.4%) and, on the same shocks, 12%. Series values are the model's full-revaluation hedged P&L.
SPOT = [100, 101.67, 100.69, 101.14, 99.78, 97.85, 98.48, 100.99, 102.47, 106.91, 106.81, 107.28, 107.78,
        105.94, 107.47, 109.48, 108.44, 109.42, 106.81, 107.15, 107.67, 106.84]
PNL26 = [0, 0.041, 0.017, -0.034, -0.027, 0.06, 0.014, 0.206, 0.232, 0.775, 0.752, 0.736, 0.725, 0.73, 0.745,
         0.757, 0.756, 0.756, 0.756, 0.756, 0.756, 0.756]
PNL12 = [0, -0.035, -0.085, -0.142, -0.187, -0.217, -0.277, -0.287, -0.334, -0.233, -0.291, -0.347, -0.4,
         -0.444, -0.483, -0.501, -0.544, -0.574, -0.6, -0.641, -0.657, -0.659]
def _s(v): return [[i, v[i]] for i in range(len(v))]

DH = dict(w=600, h=790, intro='One long call, hedged with shares once a day, over one simulated month. Watch what the hedge trades, what it earns, and what it cannot protect you from. Press play, or step through.', steps=[
    step('You buy a 21-day at-the-money call on a $100 stock, priced at 20% implied volatility. It costs $2.30 a share.',
         icon('you', 'person', 20, 20, 0.7, 'blue', 'you', lsize=18),
         box('call', 140, 28, 190, 78, 'long 1 call', 'blue', sub='$2.30')),
    step('Its delta is 0.51: it moves like owning 51 shares. So you sell 51 shares against it. Now small price moves barely change your total.',
         box('sh', 395, 28, 190, 78, 'short 51 shares', 'amber'),
         arrow('call', 'sh', None, 'amber'),
         note('nd', 300, 142, 'net delta ≈ 0', 'green', 20)),
    step('Now let the stock move. This is one simulated month in which the stock moves at about 25% volatility, above the 20% you paid for.',
         chart('sp', (10, 168, 580, 250), 'Stock price, one simulated month', [0, 21], [96, 110],
               [[100, '$100'], [105, '$105'], [110, '$110']], [[0, '0'], [10, 'day 10'], [21, 'day 21']], pl=58, pr=26),
         series('k', 'sp', [[0, 100], [21, 100]], None, dash=True, ms=300),
         series('spot', 'sp', _s(SPOT), 'blue', ms=2200)),
    step('Day 1: the stock rises 1.7%. The option now acts like 63 shares, so you sell 11 more, higher.',
         dot('d1', 'sp', [1, 101.67], 'sell 11', 'green', dx=-8, dy=-18, anchor='end')),
    step('Day 5: it falls 1.9%. Delta drops to 0.34, so you buy 15 shares back, lower. Sell high, buy low: that is gamma paying you.',
         dot('d5', 'sp', [5, 97.85], 'buy back 15', 'green', dx=10, dy=22, anchor='start')),
    step('Day 9: a 4.3% jump. Delta goes from 0.71 to 0.94 and you sell 23 more shares. One big move pays more than all the small ones.',
         dot('d9', 'sp', [9, 106.91], 'sell 23', 'green', dx=-10, dy=-18, anchor='end')),
    step('Add up every hedge trade and the option\'s change: about +$0.76 a share by day 21, roughly a third of the premium. Most of it came on day 9.',
         chart('pl', (10, 436, 580, 226), 'Hedged P&L, $ per share, cumulative', [0, 21], [-1.0, 1.0],
               [[0.5, '+0.5'], [0, '0'], [-0.5, '−0.5']], [[0, '0'], [10, 'day 10'], [21, 'day 21']], zero=True, pl=58, pr=26),
         series('g26', 'pl', _s(PNL26), 'green', ms=2200, label='+$0.76', lat=[21, 0.756], ldx=-6, ldy=-16, lanchor='end', lsize=16)),
    step('After day 9 the stock sits far above the strike. Delta is near 1 and gamma has gone, so there is nothing left to scalp. The line goes flat.',
         dict(dim='spot'),
         note('flat', 400, 560, 'gamma gone: flat', 'amber', 18)),
    step('Same random shocks, but a quiet stock at 12% volatility. The rent is paid every day, and the stock hangs near the strike, so you hold lots of gamma and pay more: about −$0.66.',
         dict(hide='flat'),
         series('g12', 'pl', _s(PNL12), 'red', ms=2200, label='−$0.66', lat=[21, -0.659], ldx=-6, ldy=-16, lanchor='end', lsize=16)),
    step('And the hedge cannot protect you from the implied volatility moving. If it falls 3 points while you hold, that is about −$0.35 a share more, whatever the stock did.',
         box('iv', 10, 676, 285, 100, 'implied vol falls 3 points', 'red', sub='about −$0.35 a share', size=18)),
    step('The rule of the whole game: breakeven is the implied volatility divided by the square root of 252, 1.26% a day at 20%. Move more than that on average and gamma wins. Move less and the rent wins.',
         box('be', 305, 676, 285, 100, 'breakeven: 1.26% a day', 'green', sub='20% ÷ √252', size=18)),
])

BOARD = dict(name='delta_hedging_gamma_scalping', lesson='delta-hedging-gamma-scalping',
             title='A month of delta hedging, step by step', cfg=DH,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: 19 October 1987, hedging an option you do not own</h2>',
             deck_after=5)
