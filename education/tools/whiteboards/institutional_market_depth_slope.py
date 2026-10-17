from ._wb import *

# ── Market depth, slope and depth imbalance (institutional-market-depth-slope) ──
# The lesson's three-level toy FX book at 1.10040 / 1.10050. Bids 300 / 250 / 400 at
# 1.10040 / 1.10030 / 1.10020; asks 200 / 150 / 180 at 1.10050 / 1.10060 / 1.10070.
# Cumulative D_b 300 / 550 / 950, D_a 200 / 350 / 530; slope (Næs-Skjeltorp style) bid 287.5,
# ask 157.5, ratio 1.825; R(3) 3.167 / 2.65; DI(1) 0.20, DI(3) ≈ 0.284; microprice 1.100460.
# 15 Oct 2014: 10-year yield fell ~16 bp and came back between ~9:33 and 9:45 ET; the joint
# staff report documented thin order-book depth around the event.
QB, QA = [300, 250, 400], [200, 150, 180]
DB = [sum(QB[:i + 1]) for i in range(3)]; DA = [sum(QA[:i + 1]) for i in range(3)]
def slope(D): return sum((D[i] - D[0]) / i for i in (1, 2)) / 2
SB, SA = slope(DB), slope(DA)
DI1 = (QB[0] - QA[0]) / (QB[0] + QA[0]); DI3 = (DB[2] - DA[2]) / (DB[2] + DA[2])
assert DB == [300, 550, 950] and DA == [200, 350, 530]
assert (SB, SA, round(SB / SA, 3)) == (287.5, 157.5, 1.825)
assert round(DI1, 3) == 0.2 and round(DI3, 3) == 0.284
assert round(1.10045 + 0.00005 * DI1, 6) == 1.10046

BOOK = (10, 92, 580, 236)
CUM = (10, 344, 290, 224)

MDS = dict(w=600, h=800, intro="What sits behind a one-pip quote: the lesson's own three-level book, measured three ways. Press play, or step through.", steps=[
    step('A screen quote: 1.10040 bid, 1.10050 offer, one pip apart. That is all most screens show. It says nothing about how much you can trade there.',
         box('bid', 70, 10, 200, 64, 'bid 1.10040', 'green', size=20),
         box('ask', 330, 10, 200, 64, 'offer 1.10050', 'red', size=20)),
    step('Behind the quote sits a ladder of resting orders. Bids: 300 at the touch, then 250 and 400 one and two ticks below. Offers: 200, then 150 and 180 above.',
         chart('bk', BOOK, 'Resting size by price', [-3.7, 3.7], [0, 470], [[200, '200'], [400, '400']],
               [[-3, '.10020'], [-2, '.10030'], [-1, '.10040'], [1, '.10050'], [2, '.10060'], [3, '.10070']], pl=44, pr=10),
         dict(bars='bb', chart='bk', data=[[-1 - i, q, str(q), 'green'] for i, q in enumerate(QB)], bw=50, ms=900),
         dict(bars='ba', chart='bk', data=[[1 + i, q, str(q), 'red'] for i, q in enumerate(QA)], bw=50, ms=900)),
    step('Level-1 depth is just the size at the touch: 300 on the bid, 200 on the offer. Sell more than 300 and you must reach further down the bid ladder.',
         dict(pulse='bid'), dict(pulse='ask')),
    step('Cumulative depth adds up the levels as you step away: bids 300, 550, 950; offers 200, 350, 530. This is how much you can fill before the price is n ticks worse.',
         chart('cm', CUM, 'Cumulative depth D(n)', [0.6, 3.4], [0, 1050], [[500, '500'], [1000, '1000']], [[1, 'n=1'], [2, 'n=2'], [3, 'n=3']], pl=50, pr=14),
         series('cb', 'cm', [[i + 1, d] for i, d in enumerate(DB)], 'green', ms=1000, label='bids 950', lat=[3, 950], ldx=-6, ldy=-14, lanchor='end'),
         series('ca', 'cm', [[i + 1, d] for i, d in enumerate(DA)], 'red', ms=1000, label='offers 530', lat=[3, 530], ldx=-4, ldy=30, lanchor='end')),
    step('Slope: the extra depth gained per tick from the touch, averaged. Bids: (250 + 325) ÷ 2 = 287.5. Offers: (150 + 165) ÷ 2 = 157.5. The bid side builds about 1.8 times faster.',
         box('sl', 320, 344, 270, 70, 'slope: bid 287.5\noffer 157.5', 'purple', size=18)),
    step('A cheaper cross-check, the ratio of depth three levels out to depth at the touch: 950 ÷ 300 ≈ 3.17 for bids, 530 ÷ 200 = 2.65 for offers. Same story.',
         box('r', 320, 426, 270, 60, 'R(3): 3.17 vs 2.65', 'blue', size=18)),
    step('The word trap: here a bigger slope means a deeper book. But a trader walking the book plots price against size filled, and then a thin book looks steep. Always ask which axis "slope" runs on.',
         box('st', 320, 498, 270, 70, '"steep" = deep here,\nthin when walking it', 'amber', size=17)),
    step('Depth imbalance at the touch: (300 − 200) ÷ (300 + 200) = 0.20, mildly bid-heavy. It is exactly the queue imbalance from the order-flow lesson.',
         box('d1', 10, 590, 280, 64, 'DI at the touch\n= 0.20', 'blue', sub=None, size=18)),
    step('Across three levels: (950 − 530) ÷ (950 + 530) = 420 ÷ 1480 ≈ 0.284. More bid-heavy deeper in the book. Which depth you measure over is a real choice.',
         box('d3', 310, 590, 280, 64, 'DI over 3 levels\n≈ 0.284', 'purple', size=18)),
    step('The touch imbalance feeds the microprice: mid 1.100450 plus half-spread 0.00005 × 0.20 = 1.100460, a tenth of a pip above the mid.',
         note('mp', 300, 684, 'microprice = 1.100450 + 0.00005 × 0.20 = 1.100460', 'chalk', 18)),
    step('Depth imbalance is a photograph of what rests now. Order flow imbalance is a flip-book of how the book has been changing. A heavy side can still be draining fast.',
         note('ph', 300, 722, 'photo (depth)  ≠  flip-book (order flow)', 'amber', 19)),
    step('Real stakes: on 15 October 2014 the 10-year Treasury yield fell about 16 bp and came back in roughly 12 minutes, and the official report documented thin book depth around it. Size child orders to the depth, not the quote.',
         note('end', 300, 770, 'size to the depth, not to the quote', 'green', 21)),
])


BOARD = dict(name='institutional_market_depth_slope', lesson='institutional-market-depth-slope',
             title='Depth, slope and imbalance: what sits behind the quote', cfg=MDS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=5)
