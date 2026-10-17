from ._wb import *
from math import sinh, sqrt

# ── Almgren-Chriss: how fast to sell a big order (market-impact-almgren-chriss) ─
# Square-root law, the lesson's chart: I = 200·sqrt(Q/ADV) bps; 100 bps at 0.25 ADV versus ≈ 71 bps
# on the straight chord through 141 bps at 0.5 ADV.
# Worked example: σ² = 0.0004, η = 0.0012, T = 1. λ = 0 → κ = 0, straight line (TWAP).
# λ = 27 → κ = sqrt(27·0.0004/0.0012) = 3; x(t)/X = sinh(3(1 − t))/sinh(3): 46.8% / 21.3% / 8.2% left
# at t = 0.25 / 0.5 / 0.75, against 75 / 50 / 25% on the straight line.
# Archegos, March 2021 (the lesson's episode): Goldman Sachs, Deutsche Bank and Wells Fargo later
# reported no material loss; Credit Suisse lost about $5.5bn, Nomura about $2.9bn.
K = sqrt(27 * 0.0004 / 0.0012)
assert abs(K - 3) < 1e-9
frac = lambda t, k: sinh(k * (1 - t)) / sinh(k)
assert [round(100 * frac(t, 3), 1) for t in (0.25, 0.5, 0.75)] == [46.8, 21.3, 8.2]
assert round(200 * sqrt(0.25)) == 100 and round(200 * sqrt(0.5)) == 141 and round(141.42 / 2) == 71

SQ = [[round(i / 40, 3), round(200 * sqrt(i / 40), 1)] for i in range(21)]
TR3 = [[i / 20, round(frac(i / 20, 3), 4)] for i in range(21)]
SQC = (10, 150, 285, 240)
TRC = (305, 150, 285, 240)
LOSS = (305, 560, 285, 170)

AC = dict(w=600, h=740, intro='A big order, one trading day, and a dial for how much you hate waiting. Then what happens when several sellers share the same exit. The lesson\'s own numbers. Press play, or step through.', steps=[
    step('You have to sell a position far bigger than the visible book, within one trading day. There are two ways to get hurt.',
         icon('pos', 'cash', 250, 10, 0.9, 'blue', 'a big order to sell', sym='$', lsize=17)),
    step('Sell it all at once and you walk deep into the book, paying a big, predictable price for immediacy: impact cost.',
         icon('fast', 'rocket', 30, 10, 0.8, 'red', 'all at once:\nimpact cost', lsize=17),
         arrow('pos', 'fast', tone='red')),
    step('Sell a sliver at a time all day and each sale barely moves the price, but you hold the rest the whole time, exposed to whatever the market does: timing risk.',
         icon('slow', 'clock', 480, 10, 0.8, 'amber', 'slowly:\ntiming risk', lsize=17),
         arrow('pos', 'slow', tone='amber')),
    step('How big is impact? Studies find it grows with the square root of order size against daily volume. At a quarter of a day\'s volume that is about 100 bps, against about 71 on a straight line through the same end point. Small orders cost more per unit than a straight line suggests.',
         chart('sq', SQC, 'Impact (bps) vs size / ADV', [0, 0.5], [0, 160], [[0, '0'], [100, '100']], [[0, '0'], [0.25, '0.25'], [0.5, '0.5']], pl=44),
         series('sqr', 'sq', SQ, 'blue', ms=1100),
         series('lin', 'sq', [[0, 0], [0.5, 141.4]], None, dash=True, ms=500),
         dot('s100', 'sq', [0.25, 100], '100', 'blue', dy=-16),
         dot('s71', 'sq', [0.25, 70.7], '71', 'chalk', dx=10, dy=10, anchor='start')),
    step('Almgren and Chriss put both costs in one sum: an impact cost that grows with the square of your trading speed, plus a risk penalty that grows with the inventory you still hold, weighted by your risk aversion λ. Then they find the schedule that makes the total smallest.',
         note('obj', 447, 500, 'minimise ½η·(speed)²\n+ ½λσ²·(left to sell)²', 'purple', 16)),
    step('With no risk aversion, λ = 0, the answer is a straight line: sell at a constant rate all day. That is TWAP. Half the day gone, half the order left.',
         chart('tr', TRC, 'Share of order left', [0, 1], [0, 1.05], [[0, '0'], [0.5, '50%'], [1, '100%']], [[0, '0'], [0.5, 'half day'], [1, 'close']], pl=50),
         series('tw', 'tr', [[0, 1], [1, 0]], None, dash=True, ms=800, label='λ = 0', lat=[0.72, 0.28], ldx=8, ldy=-4, lanchor='start'),
         dot('h0', 'tr', [0.5, 0.5], '50%', 'chalk', dx=10, dy=-10, anchor='start')),
    step('With 2% daily volatility (σ² = 0.0004), impact coefficient η = 0.0012 and risk aversion λ = 27, the shape number is κ = √(27 × 0.0004 ÷ 0.0012) = √9 = 3.',
         box('kap', 305, 400, 285, 64, 'κ = √(λσ²/η)', 'purple', sub='= √9 = 3', size=19)),
    step('At κ = 3 the schedule front-loads: 46.8% left after a quarter of the day, 21.3% at halfway, 8.2% at three quarters. More impact cost, paid to stop worrying sooner.',
         series('k3', 'tr', TR3, 'green', ms=1300, label='κ = 3', lat=[0.03, 0.18], ldx=0, ldy=0, lanchor='start'),
         dot('h3', 'tr', [0.5, 0.2125], '21.3%', 'green', dy=-14)),
    step('That works when you are the only seller. March 2021: Archegos could not meet its margin calls, and several prime brokers held big blocks of the same few stocks. Talks on an orderly joint wind-down failed.',
         icon('b1', 'bank', 14, 410, 0.55, 'red'), icon('b2', 'bank', 84, 410, 0.55, 'red'), icon('b3', 'bank', 154, 410, 0.55, 'red'), icon('b4', 'bank', 224, 410, 0.55, 'red'),
         note('same', 150, 492, 'same stocks, one exit', 'red', 18)),
    step('Some banks sold billions in large blocks on Friday 26 March, early and at steep discounts. Goldman Sachs, Deutsche Bank and Wells Fargo later reported no material loss.',
         box('fast2', 10, 510, 280, 80, 'sold early, in size', 'green', sub='no material loss', size=18)),
    step('The slower banks sold into prices already pushed down by everyone else. Credit Suisse lost about $5.5 billion and Nomura about $2.9 billion. With rival sellers, timing risk is not noise: it is other people\'s impact on what you still hold.',
         chart('loss', LOSS, 'Slow sellers\' losses ($bn)', [0.4, 2.6], [0, 6.5], [[0, '0'], [5, '5']], [[1, 'Credit Suisse'], [2, 'Nomura']], pl=40),
         dict(bars='lb', chart='loss', data=[[1, 5.5, '≈ 5.5', 'red'], [2, 2.9, '≈ 2.9', 'red']], bw=60, ms=1100),
         box('rule', 10, 610, 280, 120, 'alone: pick your κ\nin a crowd: race\nfor the exit', 'amber', size=19)),
])


BOARD = dict(name='market_impact_almgren_chriss', lesson='market-impact-almgren-chriss', title='How fast to sell, alone and in a crowd', cfg=AC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: Archegos, March 2021</h2>',
             deck_after=12)
