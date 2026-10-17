from ._wb import *
from math import sqrt, floor

# ── From a volatility forecast to a position size (action-vol-to-size) ───────
# The lesson's worked example: HAR variance 0.16 (%²) → σ = 0.40% → 43.4 pips at 1.0850;
# 1.6σ ≈ 69 pips against a 65-pip ATR. Route A, stop 2σ: 87 pips, $500 → 0.57 lots
# ($495.90). Vol doubles to 0.80%: 174 pips → 0.28 lots ($487.20). Double scaling makes the
# position about a quarter. Route B, 5% target: 6.35% a year → $78,743 → 0.72 lots.
# Calm-market scenario: 10% target, forecast 8% → 1.25×, 5% → 2×, then 30% → 0.33×.
SIG = sqrt(0.16)
PIPS = SIG / 100 * 1.0850 / 0.0001
assert round(SIG, 2) == 0.40 and round(PIPS, 1) == 43.4 and round(1.596 * PIPS) == 69
STOP1, STOP2 = round(2 * PIPS), round(2 * 2 * PIPS)
L1, L2 = floor(500 / (STOP1 * 10) * 100 + 1e-9) / 100, floor(500 / (STOP2 * 10) * 100 + 1e-9) / 100
assert (STOP1, STOP2, L1, L2) == (87, 174, 0.57, 0.28)
assert round(L1 * STOP1 * 10, 2) == 495.90 and round(L2 * STOP2 * 10, 2) == 487.20
ANN = 0.40 * sqrt(252)
NOT = 0.05 * 100000 / (ANN / 100)
assert round(ANN, 2) == 6.35 and round(NOT, -1) == 78740 and floor(NOT / 108500 * 100) / 100 == 0.72
LEV = [[x, round(10 / x, 3)] for x in [3.5, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]]

CAT = [[1, '0.40%'], [2, '0.80%']]
VOLSIZE = dict(w=600, h=790, intro='One volatility forecast, turned into pips, a stop and a size, two ways. Then the calm-market trap. Press play, or step through.', steps=[
    step('A HAR model forecasts tomorrow\'s realised variance on EUR/USD at 0.16, in percent squared. Variance, not volatility: take the square root. σ = √0.16 = 0.40%.',
         icon('fc', 'thermo', 20, 12, 0.7, 'purple', 'forecast\n0.16 %²', lsize=16),
         box('sig', 150, 20, 200, 82, 'σ = √0.16 = 0.40%', 'purple', sub=' ', size=18)),
    step('Units next. 0.40% of 1.0850 is 0.004340 in price, which is 43.4 pips: one standard deviation of tomorrow\'s move.',
         dict(sub='sig', text='= 43.4 pips')),
    step('Sanity check: for a random walk the typical high-to-low day is about 1.6σ. 1.6 × 43.4 ≈ 69 pips, close to the pair\'s 65-pip ATR. The units are right.',
         box('atr', 380, 20, 210, 82, '1.6σ ≈ 69 pips\nATR 65 ✓', 'green', size=18)),
    step('Route A, per-trade risk: put the stop at 2σ. 2 × 43.4 = 86.8, rounded to 87 pips.',
         chart('st', (10, 136, 280, 240), 'stop, in pips', [0.4, 2.6], [0, 210], [[87, '87'], [174, '174']], CAT, pl=46, pr=10),
         dict(bars='st1', chart='st', data=[[1, 87, '87', 'blue']], bw=56, ms=800)),
    step('Decide the money first: 0.5% of $100,000 is $500. Lots = $500 ÷ (87 pips × $10) = 0.575, rounded down to 0.57 lots. Loss at the stop: $495.90.',
         chart('lt', (300, 136, 290, 240), 'lots', [0.4, 3.6], [0, 0.72], [[0.57, '0.57'], [0.28, '0.28']], CAT + [[3, 'both cut']], pl=50, pr=10),
         dict(bars='lt1', chart='lt', data=[[1, 0.57, '0.57', 'green']], bw=52, ms=800)),
    step('Volatility doubles to 0.80%. The stop doubles to 174 pips, and the size halves to 0.28 lots. The loss at the stop is $487.20: the same budget, carried in fewer lots.',
         dict(bars='st2', chart='st', data=[[2, 174, '174', 'red']], bw=56, ms=800),
         dict(bars='lt2', chart='lt', data=[[2, 0.28, '0.28', 'green']], bw=52, ms=800),
         box('risk', 10, 388, 580, 58, '≈ $500 at risk both times: lots move with 1 ÷ σ', 'green', size=18)),
    step('Use one route, not two. If you also cut the risk budget when volatility rises, size falls with the square of volatility: volatility doubles and the position quarters, to about 0.14 lots.',
         dict(bars='lt3', chart='lt', data=[[3, 0.14, '≈0.14', 'red']], bw=52, ms=800)),
    step('Route B, volatility targeting, for a position with no natural stop. Target 5% a year. 0.40% a day is 0.40 × √252 = 6.35% a year, so the notional is 5% × $100,000 ÷ 6.35% = $78,743: 0.72 lots.',
         box('rb', 10, 460, 280, 126, 'Route B: 5% target\n6.35% a year\n$78,743 → 0.72 lots', 'purple', size=18)),
    step('The catch: the lower the forecast, the bigger the position. A sleeve with a 10% target holds 10 ÷ 8 = 1.25× at an 8% forecast, and 2× at 5%.',
         chart('lv', (300, 460, 290, 250), 'leverage, 10% target', [3, 32], [0, 3.2], [[1, '1×'], [2, '2×'], [3, '3×']],
               [[5, '5%'], [10, '10%'], [20, '20%'], [30, '30%']], pl=40, pr=12),
         series('lvs', 'lv', LEV, 'purple', ms=1300),
         dot('l8', 'lv', [8, 1.25], '1.25×', 'blue', dx=14, dy=0, anchor='start'),
         dot('l5', 'lv', [5, 2.0], '2×', 'red', dx=10, dy=-6, anchor='start')),
    step('Then volatility jumps to 30% in a week. The trailing forecast catches up only after the move, so the sleeve takes the first leg at 2× and only then cuts to 0.33×, selling into the fall.',
         dot('l30', 'lv', [30, 0.333], '0.33×', 'amber', dx=-4, dy=-16, anchor='end')),
    step('It happened: 2017 was one of the calmest years on record. On 5 February 2018 the VIX more than doubled in a single session, and the biggest inverse-VIX note, XIV, lost almost all its value.',
         box('vm', 10, 598, 280, 112, '5 Feb 2018: VIX\nmore than doubled\nin one session', 'red', size=18)),
    step('The fixes: a leverage cap, a floor under the forecast, and a check against implied volatility, which looks forward where trailing realised looks back.',
         series('cap', 'lv', [[3, 1.5], [32, 1.5]], 'green', dash=True, ms=600, label='cap 1.5×', lat=[32, 1.5], ldx=-4, ldy=-12, lanchor='end', lsize=15),
         note('fix', 300, 752, 'cap the leverage · floor the forecast · check implied', 'green', 19)),
])


BOARD = dict(name='action_vol_to_size', lesson='action-vol-to-size', title='From a volatility forecast to a position size, drawn step by step', cfg=VOLSIZE,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)
