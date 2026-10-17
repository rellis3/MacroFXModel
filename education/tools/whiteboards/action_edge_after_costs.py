from ._wb import *
from math import sqrt, log10

# ── Does the edge survive costs? (action-edge-after-costs) ───────────────────
# The lesson's fast EUR/USD fade: n = 3,000 trades (1,000 a year), μ = 0.9 pips gross,
# σ = 15 pips, t = 3.29. Cost c = 0.4 spread + 2 × 0.2 slippage + 0.5 commission + 0 = 1.3
# pips → net −0.4 pips, net t −1.46; per year 900 gross, 1,300 cost, −400 net pips.
# Same signal three ways (ρ = μ/c): fast 0.69, filtered 2.31, slow USD/JPY swing 13.3.
# Spread/ATR on a ~4-pip 5-minute ATR = 0.10, inside the 0.15 line, yet it still loses.
MU, SD, N, C = 0.9, 15, 3000, 0.4 + 2 * 0.2 + 0.5 + 0
assert round(C, 2) == 1.3 and round(MU / (SD / sqrt(N)), 2) == 3.29 and round((MU - C) / (SD / sqrt(N)), 2) == -1.46
assert [round(r, 2) for r in (0.9 / 1.3, 3.0 / 1.3)] == [0.69, 2.31] and round(40 / 3.0, 1) == 13.3
NS = [100, 200, 500, 1000, 2000, 3000, 5000, 10000]
TG = [[round(log10(n), 3), round(MU / SD * sqrt(n), 2)] for n in NS]
TN = [[round(log10(n), 3), round((MU - C) / SD * sqrt(n), 2)] for n in NS]

LEFT = [[1, 0.9, '+0.9', 'blue'], [2, 0.5, '0.5', 'amber'], [3, 0.1, '0.1', 'amber'], [4, -0.4, '−0.4', 'red']]
COSTS = dict(w=600, h=790, intro='A real edge, and everything it costs to collect it. Watch what is left after each step. Press play, or step through.', steps=[
    step('A backtest of an intraday EUR/USD fade: 3,000 trades over three years out of sample, about 1,000 a year. Average gross profit 0.9 pips a trade, with a standard deviation of 15 pips.',
         icon('bt', 'up', 20, 10, 0.75, 'blue', 'backtest', lsize=17),
         chip('mu', 130, 40, '+0.9 pips a trade', 'blue')),
    step('Is the edge real? The standard error is 15 ÷ √3,000 = 0.27 pips, so t = 0.9 ÷ 0.27 = 3.29. Very probably not zero. Hold that thought.',
         box('treal', 330, 18, 260, 76, 't = 3.29\nreal', 'green', size=19)),
    step('Now the costs of one round trip, starting from the 0.9-pip gross edge. Watch what is left after each one.',
         chart('wf', (10, 130, 280, 260), 'Pips left per trade', [0.4, 4.6], [-0.7, 1.15], [[0.9, '0.9'], [0, '0'], [-0.4, '−0.4']],
               [[1, 'gross'], [2, 'spread'], [3, 'slip'], [4, 'comm.']], zero=True, pl=50, pr=10),
         dict(bars='w1', chart='wf', data=LEFT[:1], bw=40, ms=700)),
    step('The spread: you buy at the ask and sell at the bid, so one full spread per round trip. 0.4 pips. 0.5 left.',
         dict(bars='w2', chart='wf', data=LEFT[1:2], bw=40, ms=700)),
    step('Slippage, paid twice: 0.2 pips on the way in and 0.2 on the way out. 0.1 left.',
         dict(bars='w3', chart='wf', data=LEFT[2:3], bw=40, ms=700)),
    step('Commission: $5 a standard lot round trip is 0.5 pips. Total cost 1.3 pips, and the net edge is −0.4 pips a trade. Over a year: 900 pips gross, 1,300 of cost, −400 net.',
         dict(bars='w4', chart='wf', data=LEFT[3:], bw=40, ms=700),
         box('year', 330, 18, 260, 76, 'a year: +900 gross\n−1,300 cost = −400', 'red', size=18)),
    step('Significance is not size. As trades pile up, t grows with the square root of their number, but the edge per trade stays at 0.9 pips. Gross t climbs past 2; net t sinks the other way. At 3,000 trades: +3.29 and −1.46.',
         dict(hide='treal'),
         chart('tn', (300, 130, 290, 260), 't as trades pile up', [2, 4], [-3.2, 6.6], [[2, '+2'], [0, '0'], [-2, '−2']],
               [[2, '100'], [3, '1,000'], [4, '10,000']], zero=True, pl=40, pr=12),
         series('t2', 'tn', [[2, 2], [4, 2]], None, dash=True, ms=400),
         series('tg', 'tn', TG, 'blue', ms=1300, label='gross', lat=[4, TG[-1][1]], ldx=-4, ldy=-14, lanchor='end', lsize=15),
         series('tnn', 'tn', TN, 'red', ms=1300, label='net', lat=[2.3, -0.38], ldx=0, ldy=18, lanchor='start', lsize=15),
         dot('g3', 'tn', [round(log10(3000), 3), 3.29], '3.29', 'blue', dx=-8, dy=-12, anchor='end'),
         dot('n3', 'tn', [round(log10(3000), 3), -1.46], '−1.46', 'red', dx=-6, dy=18, anchor='end')),
    step('The gross edge is the break-even cost. Pay more than 0.9 pips a round trip and the strategy loses. The useful ratio is edge ÷ cost: here 0.9 ÷ 1.3 = 0.69, below 1.',
         chart('rho', (10, 410, 280, 240), 'edge ÷ cost', [0.4, 3.6], [0, 4.6], [[1, '1'], [2, '2'], [4, '4']],
               [[1, 'fast'], [2, 'filtered'], [3, 'slow']], pl=40, pr=10),
         series('r1', 'rho', [[1.45, 1], [3.6, 1]], None, dash=True, ms=400),
         series('r2', 'rho', [[0.4, 2], [3.6, 2]], 'green', dash=True, ms=400),
         dict(bars='rb1', chart='rho', data=[[1, 0.69, '0.69', 'red']], bw=44, ms=800)),
    step('Trade the same signal differently. Keep only the strongest fifth of setups: 3 pips a trade for the same 1.3 of cost, a ratio of 2.31. A slow USD/JPY daily swing makes 40 pips and pays 3: a ratio of 13.3, far off this scale.',
         dict(bars='rb2', chart='rho', data=[[2, 2.31, '2.31', 'amber'], [3, 4.4, '13.3 ↑', 'green']], bw=44, ms=1000)),
    step('A quick gate: spread ÷ ATR. On 5-minute bars with an ATR of about 4 pips, 0.4 ÷ 4 = 0.10, inside the 0.15 line. The fast fade passes the gate and still loses. The gate is necessary, not sufficient.',
         box('gate', 300, 410, 290, 110, 'spread ÷ ATR = 0.10\npasses the gate…\n…still loses', 'amber', size=18)),
    step('It happened. Value Line\'s stock rankings did well on paper for decades; its real fund, trading the same rankings, earned far less. André Perold used that gap in 1988 to define implementation shortfall.',
         box('vl', 300, 540, 290, 110, 'Value Line, 1988:\npaper beat real,\ncosts took the gap', 'blue', size=18)),
    step('The habit: compare the edge per trade with the full round-trip cost. Ask for an edge at least twice the cost, a net t of 2 or more, and a profit that survives double the cost.',
         note('card', 300, 700, 'edge ≥ 2 × cost · net t ≥ 2 · survives 2 × cost', 'green', 19),
         note('card2', 300, 740, 'real is not the same as tradeable', 'amber', 19)),
])


BOARD = dict(name='action_edge_after_costs', lesson='action-edge-after-costs', title='Does the edge survive costs? Drawn step by step', cfg=COSTS,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>',
             deck_after=8)
