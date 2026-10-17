from ._wb import *

# ── Execution algorithms: slice it, then score it (execution-algorithms) ──────
# The lesson's worked example. Part 1: X = 40,000 shares, U-shaped volume profile 35/15/15/35%
# → VWAP 14,000 / 6,000 / 6,000 / 14,000; TWAP 10,000 each. Part 2: 10,000-share buy, decision
# $50.00, start $50.05, fills 6,000 @ 50.10 + 3,000 @ 50.20 (avg ≈ 50.1333), 1,000 unfilled,
# close $50.30 → delay $450 + impact $750 + opportunity $300 = $1,500 (30 bp of $500,000).
# 6 May 2010 (SEC/CFTC staff report, as told in the lesson): 75,000 E-mini contracts (≈ $4.1bn),
# POV at 9% of the previous minute's volume, no price or time limit; 27,000+ contracts in 14 s for
# a net change of ≈ 200; done in ≈ 20 minutes vs > 5 hours for a similar earlier sale.
X = 40000
W = [0.35, 0.15, 0.15, 0.35]
VW = [round(X * w) for w in W]
assert VW == [14000, 6000, 6000, 14000] and sum(VW) == X
PAVG = (6000 * 50.10 + 3000 * 50.20) / 9000
DELAY = round((50.05 - 50.00) * 9000)
IMPACT = round((PAVG - 50.05) * 9000)
OPP = round((50.30 - 50.00) * 1000)
assert (DELAY, IMPACT, OPP) == (450, 750, 300) and DELAY + IMPACT + OPP == 1500
assert round(1500 / 500000 * 10000) == 30

BK = [[1, 'Open'], [2, 'Mid'], [3, 'Mid'], [4, 'Close']]
PART1 = ['pm', 'order', 'q', 'vol', 'volb', 'sched', 'twap', 'vwb', 'pov']
PART2 = ['is', 'isd', 'isi', 'iso', 'ist', 'tot']

EXEC = dict(w=600, h=866, intro='One order, three ways to slice it, one honest way to score it, and the day a slicing rule fed on itself. The lesson\'s own numbers, step by step.', steps=[
    step('A portfolio manager decides to buy 40,000 shares. Send it all at once and you push the price up against yourself. Spread it out and the price can drift away while you wait. Every schedule here answers one question: spread it how?',
         icon('pm', 'person', 50, 10, 0.7, 'blue', 'portfolio manager', lsize=16),
         chip('order', 160, 46, 'buy 40,000', 'blue'),
         move('order', 236, 46, 900),
         note('q', 446, 46, 'all at once, or spread out?', 'amber', 19)),
    step('The market\'s own volume isn\'t flat. A typical liquid stock trades heavily at the open and close and lightly at midday: here 35%, 15%, 15% and 35% of the day. That is the U shape.',
         chart('vol', (10, 120, 280, 260), 'Market volume, % of day', [0.4, 4.6], [0, 42], [[0, '0'], [20, '20%'], [40, '40%']], BK, pl=50),
         dict(bars='volb', chart='vol', data=[[i + 1, W[i] * 100, f'{round(W[i] * 100)}%', 'blue'] for i in range(4)], bw=34, ms=1000)),
    step('TWAP slices by the clock: 40,000 ÷ 4 = 10,000 shares in every bucket. Simple and easy to check, but at midday 10,000 is a much bigger slice of a thin market than at the open.',
         chart('sched', (310, 120, 280, 260), 'Your shares per bucket', [0.4, 4.6], [0, 16500], [[0, '0'], [10000, '10k']], BK, pl=50),
         series('twap', 'sched', [[0.5, 10000], [4.5, 10000]], 'amber', dash=True, ms=700, label='TWAP', lat=[2.5, 10000], ldy=-14)),
    step('VWAP follows the volume curve instead: 40,000 × 35% = 14,000 at the open, 6,000 in each midday bucket and 14,000 at the close. Your order is never an outsized part of a quiet stretch.',
         dict(bars='vwb', chart='sched', data=[[i + 1, VW[i], f'{VW[i] // 1000}k', 'green'] for i in range(4)], bw=34, ms=1100)),
    step('POV drops the schedule altogether and trades a fixed share of the volume that actually happens, say 10%. A busy market speeds it up and a quiet one slows it down, so you no longer know when you will finish.',
         box('pov', 40, 398, 520, 66, 'POV: trade 10% of whatever volume happens', 'purple', size=19)),
    step('Afterwards, score it with Implementation Shortfall. A separate order: 10,000 shares, decided at $50.00, but trading only began at $50.05. That drift, $0.05 on the 9,000 shares that filled, is delay cost: $450.',
         chart('is', (10, 482, 580, 280), 'Implementation Shortfall, $', [0.4, 4.6], [0, 1750], [[0, '$0'], [500, '500'], [1000, '1,000'], [1500, '1,500']],
               [[1, 'delay'], [2, 'impact'], [3, 'unfilled'], [4, 'total']], pl=62),
         dict(bars='isd', chart='is', data=[[1, DELAY, '$450', 'blue']], bw=60, ms=800)),
    step('The order filled in two clips, 6,000 at $50.10 and 3,000 at $50.20, an average of about $50.1333. The gap above the $50.05 start is your own footprint: about $0.0833 × 9,000 = $750 of market impact.',
         dict(bars='isi', chart='is', data=[[2, IMPACT, '$750', 'amber']], bw=60, ms=800)),
    step('1,000 shares never filled, and the stock closed at $50.30. Charged against the $50.00 decision price, that is $0.30 × 1,000 = $300 of opportunity cost: the price of not finishing.',
         dict(bars='iso', chart='is', data=[[3, OPP, '$300', 'purple']], bw=60, ms=800)),
    step('Total: $450 + $750 + $300 = $1,500, or 30 basis points of a $500,000 order. One headline number would hide three different causes: hesitation, footprint and giving up.',
         dict(bars='ist', chart='is', data=[[4, 1500, '$1,500', 'red']], bw=60, ms=900),
         box('tot', 40, 780, 520, 66, '$1,500 = 30 bp of $500,000', 'red', size=20)),
    step('Now a real POV order. 6 May 2010: a fund complex hedges by selling 75,000 E-mini contracts, about $4.1 billion, with an algorithm set to sell 9% of the previous minute\'s volume, without regard to price or time.',
         *[dict(hide=i) for i in PART1 + PART2],
         icon('fund', 'bank', 40, 10, 0.7, 'red', 'fund, hedging', sym='$', lsize=17),
         box('algo', 200, 18, 360, 66, 'POV: sell 9% of last minute\'s\nvolume, no price or time limit', 'red', size=18)),
    step('Intermediaries buy the first contracts, then pass them among themselves: more than 27,000 in 14 seconds for a net change of about 200. That volume tells the algorithm to sell faster, which feeds more contracts into the loop.',
         box('vol2', 200, 196, 360, 66, 'volume soars: 27,000+ contracts\nin 14 s, net change ≈ 200', 'amber', size=18),
         arrow('algo', 'vol2', 'sells into', 'red', bend=-50),
         arrow('vol2', 'algo', 'sell faster', 'amber', bend=-50, id='loop'),
         icon('h1', 'crowd', 40, 170, 0.66, 'amber', 'fast traders', lsize=17)),
    step('The 75,000 contracts went through in about 20 minutes. A similar sale before had taken more than five hours. Volume is not liquidity: E-mini buy-side depth fell below 1% of the morning\'s. A price limit and a participation cap stop that loop.',
         chart('mins', (10, 320, 580, 260), 'Time to sell the same-size order, minutes', [0.4, 2.6], [0, 360], [[0, '0'], [120, '120'], [240, '240']],
               [[1, '6 May 2010, POV'], [2, 'earlier sale']], pl=56),
         dict(bars='minb', chart='mins', data=[[1, 20, '≈ 20 min', 'red'], [2, 300, 'more than 5 hours', 'blue']], bw=90, ms=1100),
         box('lim', 40, 600, 520, 66, 'volume ≠ liquidity · give POV a price limit', 'green', size=19)),
])


BOARD = dict(name='execution_algorithms', lesson='execution-algorithms', title='Slice it, score it: TWAP, VWAP, POV and the shortfall', cfg=EXEC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: a POV order in the Flash Crash</h2>',
             deck_after=7)
