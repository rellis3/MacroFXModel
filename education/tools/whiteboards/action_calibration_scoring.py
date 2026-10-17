from ._wb import *

# ── Scoring your own calls (action-calibration-scoring) ──────────────────────
# Every number is the lesson's worked example: 40 calls in buckets 50/60/70/80/90%
# with n = 8/12/10/6/4 and hits 4/7/6/3/2. Brier 11.10/40 = 0.2775; base rate 22/40 = 0.55,
# base-rate score 0.2475; reliability 0.0321, resolution 0.0021. 70-90% calls pooled:
# expected 15.4 hits, observed 11, z = -2.38. Kelly at even odds: stated 66.5% -> 33%,
# record 55% -> 10%. Shrunk 90% bucket: (2 + 10 x 0.55) / 14 = 53.6%.
BUCKETS = [(0.5, 8, 4), (0.6, 12, 7), (0.7, 10, 6), (0.8, 6, 3), (0.9, 4, 2)]
HITS = [[f, round(h / n, 3)] for f, n, h in BUCKETS]
assert abs(sum(h * (1 - f) ** 2 + (n - h) * f * f for f, n, h in BUCKETS) / 40 - 0.2775) < 1e-9

REL = (10, 196, 580, 262)
SCORE = (10, 474, 280, 236)
KEL = (310, 474, 280, 236)

CAL = dict(w=600, h=720, intro='A quarter of written calls, scored the way weather forecasts are scored. Every number is the lesson\'s worked example. Press play, or step through.', steps=[
    step('A weather forecaster says "70% chance of rain". You cannot grade that one day: rain does not prove her right, and sunshine does not prove her wrong.',
         icon('fc', 'person', 30, 14, 0.7, 'blue', 'forecaster', lsize=17),
         icon('umb', 'umbrella', 130, 14, 0.7, 'blue', '"70% rain"', lsize=17)),
    step('So collect every day she said 70%, and count. If it rained on 7 of 10, her 70% means 70%. That is calibration: grading the numbers, not the luck.',
         *[chip(f'd{i}', 290 + 30 * i, 52, '☔' if i < 7 else '☀', 'blue' if i < 7 else 'amber') for i in range(10)],
         note('dn', 435, 120, '7 of 10 rained → 70% means 70%', 'green', 18)),
    step('Now your own journal: 40 calls in a quarter, each written with a probability before the outcome and rounded into buckets of 50%, 60%, 70%, 80% and 90%.',
         *[dict(hide=f'd{i}') for i in range(10)], dict(hide='dn'), dict(hide='umb'), dict(hide='fc'),
         icon('jr', 'scroll', 40, 14, 0.75, 'purple', '40 calls', lsize=17),
         note('bk', 360, 70, 'said 50% · 60% · 70% · 80% · 90%\ncalls  8  ·  12  ·  10  ·  6  ·  4', None, 18),
         chart('rel', REL, 'What came true, against what you said', [0.45, 0.95], [0.4, 1.0],
               [[0.5, '50%'], [0.7, '70%'], [0.9, '90%']], [[0.5, '50%'], [0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%']], pl=52, pr=96),
         series('diag', 'rel', [[0.45, 0.45], [0.95, 0.95]], None, dash=True, ms=700, label='calibrated', lat=[0.95, 0.95], ldx=6, ldy=4, lanchor='start', lsize=16)),
    step('Plot each bucket\'s hit rate. The 50% calls came true 4 of 8 times, right on the line. The 60% and 70% calls landed at 58% and 60%, a little below it.',
         series('pts', 'rel', HITS, 'purple', ms=1200),
         *[dot(f'p{i}', 'rel', at, '', 'purple') for i, at in enumerate(HITS)],
         series('base', 'rel', [[0.45, 0.55], [0.95, 0.55]], 'amber', dash=True, ms=500, label='base 55%', lat=[0.95, 0.55], ldx=6, ldy=4, lanchor='start', lsize=16)),
    step('The 80% and 90% calls came true only half the time. Points below the diagonal are overconfidence: the bigger the red gap, the more your number overstated your record.',
         series('g8', 'rel', [[0.8, 0.5], [0.8, 0.8]], 'red', dash=True, ms=500),
         series('g9', 'rel', [[0.9, 0.5], [0.9, 0.9]], 'red', dash=True, ms=500),
         cnote('gl', 'rel', [0.85, 0.45], 'said 80–90%, came true 50%', 'red', 16),
         dict(pulse='p3'), dict(pulse='p4')),
    step('The Brier score grades each call by its squared miss. A 70% call that comes true costs (0.7 − 1)² = 0.09. One that fails costs 0.7² = 0.49. Confident misses hurt most.',
         dict(hide='jr'), dict(hide='bk'),
         box('hit', 10, 20, 280, 74, '70% call comes true\ncosts 0.09', 'green', size=19),
         box('miss', 310, 20, 280, 74, '70% call fails\ncosts 0.49', 'red', size=19)),
    step('All 40 calls average 11.10 / 40 = 0.2775. Quoting the 55% base rate on every call would have scored 0.55 × 0.45 = 0.2475. Lower is better, so the record lost to the plain benchmark: a skill of −12.1%.',
         chart('sc', SCORE, 'Brier score (lower is better)', [0.4, 2.6], [0, 0.32],
               [[0, '0'], [0.1, '0.10'], [0.2, '0.20'], [0.3, '0.30']], [[1, 'you'], [2, 'quote 55%']], pl=50),
         dict(bars='scb', chart='sc', data=[[1, 0.2775, '0.2775', 'purple'], [2, 0.2475, '0.2475', 'blue']], bw=56, ms=1000)),
    step('Why? The score splits into three parts: reliability 0.0321 minus resolution 0.0021 plus uncertainty 0.2475. The numbers are inflated, and they barely separate good calls from bad.',
         dict(hide='hit'), dict(hide='miss'),
         box('dec', 10, 20, 580, 74, '0.0321 − 0.0021 + 0.2475 = 0.2775\nreliability − resolution + uncertainty', 'purple', size=19)),
    step('Is it just bad luck? Pool the 70% to 90% calls: you expected 15.4 hits and got 11. That is 2.38 standard errors short, beyond what luck usually produces.',
         box('z', 10, 106, 580, 74, '70–90% calls: expected 15.4 hits, got 11\nz = −2.38: overconfident beyond luck', 'red', size=19)),
    step('It costs money through size. At even odds, Kelly from your stated average of 66.5% is 33% of the bankroll. Your record of 55% supports 10%. That is 3.3 times Kelly, where growth turns negative.',
         chart('kc', KEL, 'Kelly size at even odds', [0.4, 2.6], [0, 0.4],
               [[0, '0'], [0.1, '10%'], [0.2, '20%'], [0.3, '30%']], [[1, 'felt 66.5%'], [2, 'record 55%']], pl=50),
         dict(bars='kb', chart='kc', data=[[1, 0.33, '33%', 'red'], [2, 0.10, '10%', 'green']], bw=56, ms=1000)),
    step('The fix: swap felt numbers for measured ones, shrunk toward the base rate. Your 90% becomes 53.6%. And one rule: until your 80% and 90% calls beat your 60% calls, they get the same size.',
         dict(hide='z'), dict(hide='dec'),
         box('fix', 10, 20, 580, 74, 'next quarter: 90% → 53.6%, 80% → 53.1%', 'green', size=19),
         box('rule', 10, 106, 580, 74, 'same size for every call until\nthe high-confidence calls earn more', 'green', size=19)),
])


BOARD = dict(name='action_calibration_scoring', lesson='action-calibration-scoring',
             title='Scoring your own calls, step by step', cfg=CAL,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=7)
