from ._wb import *
import random
from math import sqrt

# ── The Efficient Market Hypothesis (emh) ─────────────────────────────────────
# Price path: 60 simulated days of price = yesterday + zero-mean surprise (seeded, illustrative).
# The lesson's worked example: n = 500 returns, SE = 1/sqrt(500) = 0.0447, rho-hat 0.03 (0.67 SE)
# and 0.15 (3.35 SE). McLean & Pontiff (2016): 97 predictors, returns ~26% lower after the sample
# but before publication, ~58% lower after publication (so ~74% and ~42% of in-sample).
_r = random.Random(4)
P = [100.0]
for _ in range(60):
    P.append(P[-1] + _r.gauss(0, 0.6))
PATH = [[i, round(p, 2)] for i, p in enumerate(P)]
SE = 1 / sqrt(500)
BAND = round(2 * SE, 4)

EMH = dict(w=600, h=780, intro='Why a free edge should not last, how you test it, and what happened to 97 edges once they were published. Press play, or step through.', steps=[
    step('Model a price as yesterday\'s price plus a surprise. Here are 60 simulated days, purely illustrative. Each day\'s move is a fresh draw with an average of zero.',
         chart('px', (10, 10, 580, 180), '60 simulated days: price = yesterday + surprise', [0, 72], [min(P) - 1, max(P) + 1.5],
               [[100, '100']], [[0, 'day 0'], [30, '30'], [60, '60']], pl=50, pr=16),
         series('pp', 'px', PATH, 'blue', ms=1800)),
    step('If the market already holds everything knowable, the best forecast of tomorrow is simply today\'s price. Up and down are equally likely from here. That is a martingale.',
         series('fc', 'px', [[60, PATH[-1][1]], [72, PATH[-1][1]]], 'amber', dash=True, ms=600),
         cnote('fcl', 'px', [66, PATH[-1][1]], 'best guess\n= today', 'amber', 17, dy=-46),
         dot('now', 'px', [60, PATH[-1][1]], '', 'amber')),
    step('The test: does yesterday\'s return predict today\'s? With 500 daily returns and no real link, the measured correlation still wobbles by about 1 ÷ √500 = 0.045. Two standard errors either side of zero is the noise band.',
         chart('ac', (10, 206, 580, 120), 'Lag-1 autocorrelation, 500 returns', [-0.2, 0.2], [0, 1], [],
               [[-0.1, '−0.1'], [0, '0'], [0.1, '0.1'], [0.2, '0.2']], pl=20, pr=20, pt=30, pb=26),
         dict(gap='band', chart='ac', top=[[-BAND, 1], [BAND, 1]], bot=[[-BAND, 0], [BAND, 0]], tone='blue', op=0.25),
         cnote('bl', 'ac', [-0.045, 0.62], 'noise: ±0.09', 'blue', 17)),
    step('Measure 0.03. That is 0.67 standard errors: well inside the band. Routine noise from a perfectly unpredictable series. Building a strategy on it would be a mistake.',
         dot('r03', 'ac', [0.03, 0.25], '0.03', 'blue', dy=-16)),
    step('Measure 0.15 instead. That is about 3.4 standard errors out: a real statistical signal in this sample. But it is only where the research starts.',
         dot('r15', 'ac', [0.15, 0.25], '0.15', 'amber', dy=-16),
         cnote('r15n', 'ac', [0.15, 0.25], '3.4 SE', 'amber', 17, dx=0, dy=22)),
    step('Three questions stand between a signal and an edge. Does it hold on data it has never seen? Does it survive trading costs? And why has nobody traded it away?',
         chip('q1', 105, 352, 'out of sample?', 'amber'),
         chip('q2', 300, 352, 'after costs?', 'amber'),
         chip('q3', 495, 352, 'why still here?', 'amber')),
    step('The joint-hypothesis problem. To call a return abnormal you need a model of normal. An excess return means the market is inefficient, or your model missed a risk you are being paid to carry. No test can tell you which.',
         box('ineff', 10, 386, 220, 76, 'market\ninefficient?', 'red', size=18),
         icon('sc', 'scales', 255, 380, 0.9, 'amber'),
         box('model', 370, 386, 220, 76, 'model missing\na risk?', 'blue', size=18)),
    step('Now the $20 bill on a crowded pavement. Academics spent decades documenting stock-return predictors. McLean and Pontiff followed 97 of them as the papers came out.',
         icon('bill', 'cash', 40, 476, 0.62, 'green', '97 published\npredictors', sym='$', lsize=17)),
    step('Publication prints the map to the bill. Arbitrageurs can now find the trade cheaply, and if they don\'t take it a competitor will. Their orders push prices towards the information.',
         icon('crowd', 'crowd', 34, 648, 0.72, 'blue', 'arbitrageurs', lsize=17),
         arrow('bill', 'crowd', None, 'blue')),
    step('Taking returns in the original sample as 100%, they were about 74% in the gap before publication, partly the luck of the original search, and about 42% after it. Roughly 58% of the edge went once investors could read about it.',
         chart('mp', (200, 488, 390, 280), 'Predictor returns vs. original sample', [0.4, 3.6], [0, 118],
               [[0, '0'], [50, '50%'], [100, '100%']], [[1, 'in sample'], [2, 'pre-pub'], [3, 'after']], pl=58, pr=16),
         dict(bars='mpb', chart='mp', data=[[1, 100, '100%', 'blue'], [2, 74, '≈ 74%', 'amber'], [3, 42, '≈ 42%', 'red']], bw=56, ms=1400),
         arrow('crowd', 'mp', None, 'blue')),
    step('The fall was biggest for the predictors with the largest in-sample returns, and what was left sat in stocks that are expensive to trade. The bill gets picked up where bending down is cheap.',
         dict(pulse='mpb'), dict(pulse='bill')),
    step('So efficiency is the null, not a wall. It forbids a free lunch, not getting paid for a risk others will not carry. Every edge has to say who is paying, and why.',
         dict(dim='ineff'), dict(dim='model'), dict(pulse='q3')),
])


BOARD = dict(name='emh', lesson='emh', title='The $20 bill: testing for, and losing, an edge', cfg=EMH,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=12)
