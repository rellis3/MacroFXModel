from ._wb import *
from math import erf, sqrt

# ── Order flow toxicity & VPIN (vpin-order-flow-toxicity) ─────────────────────
# The lesson's worked example: V = 1,000 contracts, n = 5 buckets, standardised price moves
# z = +1, -0.5, 0, +2, -1.5 → Z = 0.8413, 0.3085, 0.5000, 0.9772, 0.0668. Buy volume = V·Z,
# imbalance |buy - sell|, sum 2,886.4, VPIN = 2,886.4 / 5,000 ≈ 0.577.
# 6 May 2010 (SEC/CFTC staff report, as told in the lesson): a fund complex hedging sold 75,000
# E-mini contracts (≈ $4.1bn) at a fixed share of the previous minute's volume, no price or time
# limit; intermediaries traded 27,000+ contracts in 14 seconds for a net change of ≈ 200; E-mini
# buy-side depth fell below 1% of its morning level; futures fell roughly 5–9% and largely recovered.
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
V = 1000
ZS = [1.0, -0.5, 0.0, 2.0, -1.5]
BUY = [round(V * round(_N(z), 4), 1) for z in ZS]
OI = [round(abs(2 * b - V), 1) for b in BUY]
VPIN = sum(OI) / (5 * V)
assert BUY == [841.3, 308.5, 500.0, 977.2, 66.8], BUY
assert round(sum(OI), 1) == 2886.4 and round(VPIN, 3) == 0.577

YT = [[0, '0'], [500, '500'], [1000, '1,000']]
XT = [[i + 1, f'#{i + 1}'] for i in range(5)]
FC_IDS = ['split', 'even', 'b1', 'b2', 'oi', 'oib', 'vp', 'scale', 'crowd', 'crowd>mm', 'clk', 'bk']

VPINB = dict(w=600, h=880, intro='A market maker who can\'t see who is informed, and a meter that tries to read it from the tape. First the lesson\'s five buckets, then the real tape of 6 May 2010. Press play, or step through.', steps=[
    step('A market maker quotes both sides of the E-mini future. Some orders come from traders who know something; most come from people trading for other reasons. The market maker can\'t see the informed share. VPIN tries to estimate it live, from the tape.',
         icon('crowd', 'crowd', 20, 8, 0.7, 'blue', 'traders', lsize=18),
         icon('mm', 'person', 482, 8, 0.7, 'green', 'market maker', lsize=18),
         arrow('crowd', 'mm', 'orders'),
         note('who', 300, 128, 'informed, or just noise?', 'amber', 21)),
    step('Step one is a new clock. Don\'t close a bar every five minutes. Close a bucket every time a fixed volume has traded, here 1,000 contracts, however long that takes. Quiet hours make long buckets; busy minutes make short ones.',
         dict(hide='who'),
         icon('clk', 'clock', 26, 118, 0.6, None),
         dict(cross='clk'),
         box('bk', 120, 122, 460, 64, 'one bucket = every 1,000 contracts', 'blue', size=20)),
    step('Step two: who was buying? VPIN never asks. It measures the bucket\'s price change in typical moves and runs it through the normal curve. Bucket 1 rose one typical move; the curve gives 0.84, so 841 contracts are called buys and 159 sells.',
         chart('split', (10, 206, 580, 250), 'Buys per 1,000-contract bucket · dashed = 50/50', [0.4, 5.6], [0, 1100], YT, XT, pl=64),
         series('even', 'split', [[0.4, 500], [5.6, 500]], None, dash=True, ms=400),
         dict(bars='b1', chart='split', data=[[1, BUY[0], '841', 'green']], bw=46, ms=900)),
    step('The rest of the lesson\'s five buckets. Bucket 3 closed flat, so the curve gives exactly one half: 500 buys, 500 sells. Bucket 4 rose two typical moves: 977 buys. Bucket 5 fell one and a half: only 67 buys and 933 sells.',
         dict(bars='b2', chart='split', data=[[i + 1, BUY[i], str(int(BUY[i] + 0.5)), 'green'] for i in range(1, 5)], bw=46, ms=1200)),
    step('Step three: how one-sided was each bucket? Take buys minus sells and drop the sign. For bucket 1 that is about 683 contracts; then 383, 0, 954 and 866. A selling bucket counts the same as a buying one.',
         chart('oi', (10, 470, 580, 236), 'Imbalance |buys − sells| per bucket', [0.4, 5.6], [0, 1100], YT, XT, pl=64),
         dict(bars='oib', chart='oi', data=[[i + 1, OI[i], str(int(OI[i] + 0.5)), 'amber'] for i in range(5)], bw=46, ms=1200)),
    step('Step four: add the five imbalances, 2,886.4 contracts, and divide by the 5,000 contracts in the window. VPIN is about 0.58: on average, 58% of recent volume looked one-sided. Zero would be perfectly balanced; one, all one way.',
         box('vp', 10, 722, 280, 90, 'VPIN = 2,886.4 ÷ 5,000', 'purple', sub='0.000', size=19),
         dict(count='vp', **{'from': 0, 'to': round(VPIN, 3), 'dp': 3, 'ms': 1300}),
         box('scale', 310, 722, 280, 90, '0 = balanced\n1 = all one way', 'blue', size=19)),
    step('Now the real tape: 6 May 2010. A fund complex hedging its stock holdings sells 75,000 E-mini contracts, about $4.1 billion, through an algorithm told to sell a fixed share of the last minute\'s volume, with no limit on price or time.',
         *[dict(hide=i) for i in FC_IDS],
         icon('fund', 'bank', 46, 8, 0.7, 'red', 'fund, hedging', sym='$', lsize=18),
         chip('sell', 130, 44, 'sell 75,000', 'red'),
         move('sell', 420, 44, 1400),
         box('algo', 60, 140, 480, 64, 'sell a fixed share of volume,\nno price limit, no time limit', 'red', size=19)),
    step('High-frequency traders and other intermediaries buy the first contracts, then have to dump them, much of it to each other. In one 14-second stretch they trade more than 27,000 contracts while their net holding changes by only about 200. The regulators called it hot-potato trading.',
         dict(hide='sell'),
         icon('h1', 'person', 110, 232, 0.62, 'amber', 'fast trader A', lsize=17),
         icon('h2', 'person', 428, 232, 0.62, 'amber', 'fast trader B', lsize=17),
         chip('pot', 210, 262, 'contracts', 'amber'),
         move('pot', 390, 262, 600), move('pot', 210, 262, 600), move('pot', 390, 262, 600), move('pot', 300, 262, 500),
         box('hp', 60, 350, 480, 76, '27,000+ contracts in 14 seconds\nnet change: about 200', 'amber', size=20)),
    step('Feed that tape into VPIN. Recycled volume fills 1,000-contract buckets faster, though no news has arrived. Prices are falling inside every bucket, so the normal curve calls most of each one a sell. Imbalances near the maximum push VPIN toward 1.',
         *[box(f's{i}', 22 + i * 71, 470, 60, 54, 'sell', 'red', size=18) for i in range(8)],
         note('fast', 300, 560, 'buckets close faster · each one called a sell', 'red', 19),
         box('vp2', 10, 722, 280, 90, 'VPIN', 'red', sub='pushed toward 1', size=20)),
    step('One-sided flow hurts liquidity providers whoever is behind it, so they pull back. Buy-side depth in the E-mini falls to less than 1% of its morning level. Index futures drop roughly 5 to 9% in minutes, then largely recover the same session.',
         dict(dim='mm'),
         box('depth', 310, 722, 280, 90, 'buy-side depth\n< 1% of the morning', 'red', size=19)),
    step('So VPIN was high. But the seller was hedging, and the hot potato was volume with no news: toxic to market makers without being informed. And Andersen and Bondarenko found the reading shifts with the bucket size, the window and the classifier, and runs high at other times with no crash after.',
         note('end', 300, 846, 'toxic ≠ informed · a description, not a forecast', 'amber', 20),
         dict(pulse='vp2')),
])


BOARD = dict(name='vpin_order_flow_toxicity', lesson='vpin-order-flow-toxicity', title='VPIN: from five buckets to the Flash Crash tape', cfg=VPINB,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: what the flow really was on 6 May 2010</h2>',
             deck_after=8)
