from ._wb import *
from math import sqrt

# ── Principal components & factor regimes (pca-factors) ───────────────────────
# Two pairs with correlation r = 0.75 (the lesson's interactive chart): on standardised
# returns the 2-sigma cloud is the ellipse x² − 2rxy + y² = 4(1 − r²); PC1 lies on the
# diagonal with eigenvalue 1 + r = 1.75, PC2 across it with 1 − r = 0.25, so PC1's share
# is (1 + r)/2 = 87.5% (the lesson's exact two-variable formula). Arrow half-lengths are
# 2·sqrt(eigenvalue) along each axis. The three-pair eigenvalues 1.85 / 0.95 / 0.20 and
# their shares (61.7 / 31.7 / 6.7%) are the lesson's worked example and calculator.
R = 0.75
XS = [round(-2 + i * 0.1, 2) for i in range(41)]
def _y(x, s): return round(R * x + s * sqrt(max(0.0, (1 - R * R) * (4 - x * x))), 3)
TOP = [[x, _y(x, 1)] for x in XS]
BOT = [[x, _y(x, -1)] for x in XS]
H1 = round(2 * sqrt(1 + R) / sqrt(2), 3)    # 1.871 along the diagonal
H2 = round(2 * sqrt(1 - R) / sqrt(2), 3)    # 0.707 across it
L = [1.85, 0.95, 0.20]
EVR = [round(100 * v / sum(L), 1) for v in L]   # 61.7, 31.7, 6.7
CURVE = [[r / 20, round(100 * (1 + r / 20) / 2, 2)] for r in range(0, 21)]

CL = (10, 236, 300, 300)
BR = (320, 236, 270, 300)
EV = (10, 552, 580, 200)

PCA = dict(w=600, h=800, intro='Three FX pairs, one shared driver. Watch PCA find it, using the lesson\'s own numbers. Press play, or step through.', steps=[
    step('You hold three FX pairs: EURUSD, GBPUSD and AUDJPY. Three positions, so three separate views. Or are they?',
         box('eu', 20, 14, 170, 70, 'EURUSD', 'blue', size=20),
         box('gb', 215, 14, 170, 70, 'GBPUSD', 'blue', size=20),
         box('aj', 410, 14, 170, 70, 'AUDJPY', 'purple', size=20)),
    step('A weak-dollar day. EURUSD and GBPUSD both rise, because both have the dollar on one side. AUDJPY has its own drivers: commodities, risk mood and carry.',
         icon('usd', 'bank', 245, 116, 0.62, 'green', 'the dollar', sym='$', lsize=17),
         arrow('usd', 'eu', 'up', 'green'),
         arrow('usd', 'gb', 'up', 'green'),
         arrow('usd', 'aj', 'a little', None, dash=True)),
    step('The correlation grid says the same. EURUSD with GBPUSD: 0.75. AUDJPY with either: only 0.20 and 0.15. Two of your three pairs are largely one trade.',
         note('grid', 470, 160, '0.75   EUR–GBP\n0.20   EUR–AUDJPY\n0.15   GBP–AUDJPY', 'amber', 18)),
    step('Plot one day as one dot: EURUSD\'s return across, GBPUSD\'s up. With correlation 0.75 the dots fill a tilted, cigar-shaped cloud, not a round one.',
         chart('cl', CL, 'EURUSD vs GBPUSD, in σ', [-2.4, 2.4], [-2.4, 2.4], [[-2, '−2'], [0, '0'], [2, '2']],
               [[-2, '−2'], [0, '0'], [2, '2']], pl=36, pr=12, size=18),
         dict(gap='cloud', chart='cl', top=TOP, bot=BOT, tone='blue', op=0.25)),
    step('PCA looks for the direction along which the cloud is most spread out. Here it is the diagonal: both pairs moving together. That direction is PC1, the shared dollar factor.',
         series('pc1', 'cl', [[-H1, -H1], [H1, H1]], 'red', ms=900, width=4, label='PC1', lat=[H1, H1], ldx=-4, ldy=-14)),
    step('PC2 is the best direction left, at right angles to PC1: the pairs moving apart. The cloud is thin that way, so PC2 carries little. PC1 holds (1 + 0.75) ÷ 2 = 87.5% of the variance, PC2 the other 12.5%.',
         series('pc2', 'cl', [[-H2, H2], [H2, -H2]], 'amber', ms=700, width=4, label='PC2', lat=[H2, -H2], ldx=10, ldy=12, lanchor='start'),
         cnote('sh', 'cl', [-1.3, 1.6], 'PC1 87.5%\nPC2 12.5%', None, 17)),
    step(f'Now all three pairs. PCA turns their 3 × 3 correlation grid into three eigenvalues, about 1.85, 0.95 and 0.20. They add up to 3, the total variance. PC1\'s share is 1.85 ÷ 3 ≈ {EVR[0]:.0f}%.',
         chart('br', BR, 'Share of variance', [0.3, 3.7], [0, 80], [[0, '0'], [30, '30%'], [60, '60%']],
               [[1, 'PC1'], [2, 'PC2'], [3, 'PC3']], pl=46, pr=10, size=18),
         dict(bars='evr', chart='br', data=[[1, EVR[0], f'{EVR[0]:.0f}%', 'red'], [2, EVR[1], f'{EVR[1]:.0f}%', 'amber'], [3, EVR[2], f'{EVR[2]:.0f}%', 'purple']], bw=46, ms=1200)),
    step('PC1\'s loadings say who is in it: EURUSD and GBPUSD load strongly, AUDJPY with the same sign but noticeably less. Three positions, but roughly one and a half bets.',
         dict(pulse='eu'), dict(pulse='gb')),
    step('For two pairs the share has a clean formula: PC1 holds (1 + r) ÷ 2. Uncorrelated pairs give 50%, two separate bets. At 0.75 it is 87.5%. As correlation heads to 1, PC1 heads to 100%: one bet.',
         chart('ev', EV, 'PC1 share vs correlation, two pairs', [0, 1], [45, 102], [[50, '50%'], [75, '75%'], [100, '100%']],
               [[0, '0'], [0.25, '0.25'], [0.5, '0.5'], [0.75, '0.75'], [1, 'r = 1']], pl=58, pr=20, size=18),
         series('cv', 'ev', CURVE, 'purple', ms=1200),
         dot('d75', 'ev', [0.75, 87.5], '87.5%', 'blue', dx=-12, dy=-14, anchor='end')),
    step('That is what happened in March 2020. In the dash for cash the dollar rose against almost every currency at once, and even Treasuries and gold were sold. Pairs that looked like separate bets collapsed onto one factor.',
         dot('d1', 'ev', [1.0, 100], 'crisis', 'red', dx=-12, dy=-14, anchor='end'),
         dict(pulse='usd')),
    step('So PCA is a picture of the past, not a forecast. A PCA fitted on calm months overstates how many independent bets you hold, and the tail is exactly when that matters.',
         note('end', 300, 782, 'calm-market PCA overstates your bets; in a crisis, PC1 takes over', 'red', 18)),
])


BOARD = dict(name='pca_factors', lesson='pca-factors', title='Three FX pairs, one shared driver: PCA drawn step by step', cfg=PCA,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: March 2020',
             deck_after=6)
