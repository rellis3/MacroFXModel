from ._wb import *

# ── CUSUM as a coin jar (change-point-detection) ────────────────────────────
# Numbers are the lesson's own worked example: mu0 = 0, k = 1.0, h = 3.5,
#   x = 0.2 -0.3 0.5 -0.1 0.3 -0.2 0.1 | 3.2 2.8 3.5 3.1 2.9 (mean shifts at t = 8)
#   S = 0 x7, then 2.2, 4.0, 6.5, 8.6, 10.5 -> flagged at t = 9.
# Alternative thresholds on the same tally: h = 2 flags at t = 8 (2.2 > 2), h = 6 at t = 10 (6.5 > 6).
# The 2020 dates and facts are the lesson's own "It actually happened" story.
X = [0.2, -0.3, 0.5, -0.1, 0.3, -0.2, 0.1, 3.2, 2.8, 3.5, 3.1, 2.9]
S, s = [], 0.0
for x in X:
    s = max(0.0, s + (x - 0 - 1.0)); S.append(round(s, 1))
assert S[7] == 2.2 and S[8] == 4.0 and S[11] == 10.5

XC = (10, 148, 580, 200)
SC = (10, 362, 580, 250)
XT = [[1, '1'], [4, '4'], [8, '8'], [9, '9'], [12, '12']]

CPD = dict(w=600, h=760, intro='CUSUM, the classic change detector, as a jar you drop coins into. The lesson\'s own twelve numbers, its allowance and its alarm line. Press play, or step through.', steps=[
    step('Meet the process: a machine that should sit at a mean of 0. Each step we see one new number, and we want to know if the mean has moved.',
         icon('mach', 'factory', 50, 6, 0.75, 'blue', 'process, mean 0', lsize=17),
         box('jar', 230, 18, 160, 74, 'the jar: S', 'purple', sub='0', size=20),
         box('h', 430, 18, 160, 74, 'alarm line h', 'amber', sub='3.5', size=20)),
    step('The rule: take each number, subtract the mean and an allowance of k = 1, and add what is left to the jar. If the jar would go below empty, reset it to empty.',
         note('rule', 300, 128, 'S = max(0, S + x − 0 − 1)', 'purple', 21)),
    step('Steps 1 to 7: the numbers hover near 0. Each one minus the allowance is negative, so the jar is reset to 0 every time. One odd day never builds up.',
         dict(hide='rule'),
         chart('xc', XC, 'The observations', [0.5, 12.5], [-1, 4], [[0, '0'], [3, '3']], XT, zero=True, pl=40, pr=16),
         series('x1', 'xc', [[t + 1, X[t]] for t in range(7)], 'blue', ms=1400),
         chart('sc', SC, 'The jar S, step by step', [0.5, 12.5], [0, 11.5], [[0, '0'], [3.5, '3.5'], [10, '10']], XT, pl=40, pr=16),
         series('s1', 'sc', [[t + 1, S[t]] for t in range(7)], 'purple', ms=1400),
         series('hl', 'sc', [[0.5, 3.5], [12.5, 3.5]], 'amber', dash=True, ms=600)),
    step('Step 8: the mean really moves. The reading is 3.2, and 3.2 − 0 − 1 leaves 2.2 in the jar. That is still under the 3.5 line, so no alarm yet.',
         series('x2', 'xc', [[7, X[6]], [8, X[7]]], 'red', ms=700),
         dot('d8', 'xc', [8, 3.2], '3.2', 'red', dx=-8, dy=-14, anchor='end'),
         series('s2', 'sc', [[7, 0], [8, 2.2]], 'purple', ms=700),
         dict(count='jar', **{'from': 0, 'to': 2.2, 'dp': 1, 'ms': 700})),
    step('Step 9: the reading is 2.8, which adds 1.8. The jar holds 2.2 + 1.8 = 4.0, more than 3.5. The alarm rings.',
         series('x3', 'xc', [[8, 3.2], [9, 2.8]], 'red', ms=600),
         series('s3', 'sc', [[8, 2.2], [9, 4.0]], 'purple', ms=600),
         dict(count='jar', **{'from': 2.2, 'to': 4.0, 'dp': 1, 'ms': 600}),
         dot('al', 'sc', [9, 4.0], 'alarm at step 9', 'red', dx=-10, dy=-16, anchor='end'),
         dict(pulse='h')),
    step('The change began at step 8 and the alarm came at step 9: one step late. That delay is the price of a jar that ignores ordinary noise. It is not a bug.',
         note('late', 300, 128, 'change at 8 → alarm at 9: one step of delay', 'red', 20)),
    step('Once the mean has moved, every new reading adds to the jar: 6.5, 8.6, then 10.5 by step 12. A real, lasting shift keeps piling up.',
         series('x4', 'xc', [[t + 1, X[t]] for t in range(8, 12)], 'red', ms=900),
         series('s4', 'sc', [[t + 1, S[t]] for t in range(8, 12)], 'purple', ms=900),
         dict(count='jar', **{'from': 4.0, 'to': 10.5, 'dp': 1, 'ms': 900})),
    step('Move the alarm line and the delay moves with it. With h = 2 the same jar would have rung at step 8. With h = 6 it waits until step 10, when the jar holds 6.5.',
         dict(hide='late'),
         series('h2', 'sc', [[0.5, 2], [12.5, 2]], 'red', dash=True, ms=500),
         series('h6', 'sc', [[0.5, 6], [12.5, 6]], 'green', dash=True, ms=500),
         dot('a8', 'sc', [8, 2.2], 'h = 2: step 8', 'red', dx=-10, dy=-12, anchor='end'),
         dot('a10', 'sc', [10, 6.5], 'h = 6: step 10', 'green', dx=-10, dy=-12, anchor='end')),
    step('That is the trade-off. A low line or a small allowance catches changes sooner but trips on noise more often. A high one stays calm but hears about real changes later. Every choice is a point on that curve.',
         note('trade', 300, 128, 'lower line: sooner but noisier · higher: calmer but later', 'amber', 17)),
    step('In February 2020 each step was a trading day. The S&P 500 closed at a record on 19 February. Markets fell hard from Monday 24 February.',
         dict(hide='trade'),
         box('rec', 10, 636, 160, 110, '19 Feb 2020\nrecord high', 'blue', size=18),
         box('fall', 220, 636, 160, 110, '24 Feb\nheavy falls\nbegin', 'amber', size=18),
         arrow('rec', 'fall')),
    step('A detector tuned to stay quiet through calm 2019 needed several big days to fill its jar. By 27 February the index was already more than 10% below its record, in six sessions.',
         box('ten', 430, 636, 160, 110, '27 Feb\nmore than 10%\nbelow record', 'red', size=18),
         arrow('fall', 'ten'),
         dict(pulse='ten')),
    step('Looking back over the whole year, an offline fit puts the break around 20 to 24 February: a cliff. But it used data from after the break. Real time sees it late. The jar tells you that something changed and roughly when, never why.',
         note('hind', 300, 128, 'hindsight finds the break; real time finds it late', 'red', 19)),
])


BOARD = dict(name='change_point_detection', lesson='change-point-detection', title='CUSUM: a jar that fills when the mean moves', cfg=CPD,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=4)
