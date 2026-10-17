from ._wb import *
from math import sqrt

# ── Lee-Mykland & Boudt-Croux-Laurent (institutional-jump-detection-tests) ───
# The lesson's toy 10-bar session: U-shaped baseline 18,14,9,6,4,4,6,9,14,18 bp; actual returns
# equal the baseline (alternating sign) except bar 1 (+55, the open) and bar 6 (+25, midday jump).
# Local sigma = root-mean of adjacent |r||r| products over the other bars, skipping any pair that
# touches the tested bar, exactly as the lesson computes it. Critical value 4.80 (n = 10, alpha 1%).
BASE = [18, 14, 9, 6, 4, 4, 6, 9, 14, 18]
R = [55, -14, 9, -6, 4, 25, -6, 9, -14, 18]
MEAN = sum(BASE) / 10
FAC = [b / MEAN for b in BASE]
RT = [r / f for r, f in zip(R, FAC)]

def _sig(x, i):
    p = [abs(x[k]) * abs(x[k - 1]) for k in range(1, 10) if i not in (k, k - 1)]
    return sqrt(sum(p) / len(p))
L = {(i, m): (x[i] / _sig(x, i)) for i in (0, 5) for m, x in (('plain', R), ('bcl', RT))}
assert [round(L[k], 2) for k in [(0, 'plain'), (0, 'bcl'), (5, 'plain'), (5, 'bcl')]] == [5.23, 2.01, 1.76, 5.50]
CRIT = 4.80

def _lb(k):
    return round(L[k], 2)

JD = dict(w=600, h=700, intro="The lesson's toy session: ten bars, a busy open, a quiet middle, and one real jump. Watch a plain test get it backwards, then the time-of-day fix. Press play, or step through.", steps=[
    step('A toy trading session of ten bars. Ordinary moves follow a U-shape: about 18 bp at the open and close, only 4 bp at midday.',
         chart('s', (10, 14, 580, 250), 'Returns by bar (bp)', [0.3, 10.7], [-20, 70],
               [[0, '0'], [20, '20'], [40, '40']], [[1, 'open'], [5.5, 'midday'], [10, 'close']], zero=True, pl=36, pr=8),
         series('u', 's', [[i + 1, b] for i, b in enumerate(BASE)], 'purple', dash=True, ms=1200, label='typical size', lat=[3, 9], ldx=4, ldy=-16, lanchor='start', lsize=16)),
    step('The actual returns. Most match their own typical size. Two do not: the open moves +55 bp, and midday bar 6 moves +25 bp. Only bar 6 is a real jump.',
         dict(bars='rb', chart='s', data=[[i + 1, R[i], f'{R[i]:+d}' if i in (0, 5) else '', 'amber' if i == 0 else ('red' if i == 5 else 'blue')] for i in range(10)], bw=26, ms=1200)),
    step('Lee-Mykland judges each return against a yardstick built from its neighbours, never from the return itself, so a jump cannot hide by inflating its own measure.',
         box('ruler', 10, 284, 580, 52, 'L = return ÷ local yardstick (built without that return)', 'blue', size=18)),
    step('Testing every bar means the day\'s biggest ordinary move is naturally large. Extreme-value theory sets the bar: for 10 bars at a 1% false-alarm rate, L must beat 4.80.',
         note('crit', 300, 364, 'critical value 4.80 (Gumbel, n = 10)', 'red', 19)),
    step('Plain test, bar 1: its yardstick blends the whole day, about 10.5 bp. 55 ÷ 10.5 = 5.23, over 4.80. Flagged as a jump, but it is just a busy open.',
         chart('Lc', (10, 380, 580, 210), 'L statistic', [0.3, 5.7], [0, 6.5],
               [[0, '0'], [2, '2'], [4, '4'], [6, '6']], [[1.5, 'bar 1 (open)'], [4.5, 'bar 6 (midday)']], pl=30, pr=8),
         series('th', 'Lc', [[0.4, CRIT], [5.6, CRIT]], 'red', dash=True, ms=500),
         dict(bars='p1', chart='Lc', data=[[1, _lb((0, 'plain')), f"plain {_lb((0, 'plain')):.2f}", 'amber']], bw=56, ms=700)),
    step('Plain test, bar 6: its yardstick is about 14.2 bp, far bigger than midday\'s usual 4. 25 ÷ 14.2 = 1.76. The real jump is missed.',
         dict(bars='p6', chart='Lc', data=[[4, _lb((5, 'plain')), f"plain {_lb((5, 'plain')):.2f}", 'amber']], bw=56, ms=700)),
    step('The Boudt-Croux-Laurent fix: first divide each return by its time of day\'s typical size relative to the session average (10.2 bp). The open bar becomes 31.2; the midday jump becomes 63.8. Every ordinary bar becomes exactly 10.2.',
         dict(hide='ruler'),
         box('fix', 10, 284, 580, 52, 'bar 1: 55 ÷ 1.76 = 31.2  ·  bar 6: 25 ÷ 0.39 = 63.8', 'green', size=18)),
    step('Re-run the same test on the corrected returns. Bar 1: L = 2.01, cleared. Bar 6: L = 5.50, flagged. Both verdicts are now right.',
         dict(bars='b1', chart='Lc', data=[[2, _lb((0, 'bcl')), f"fixed {_lb((0, 'bcl')):.2f}", 'green']], bw=56, ms=700),
         dict(bars='b6', chart='Lc', data=[[5, _lb((5, 'bcl')), f"fixed {_lb((5, 'bcl')):.2f}", 'green']], bw=56, ms=700)),
    step('The plain test got both bars backwards: a false alarm at the open and a miss at midday. Deseasonalise first, then test.',
         note('lesson', 300, 618, 'judge each return against its own time of day', 'green', 19)),
    step('Two limits remain. A flag says the move was implausibly large, not why it happened. And the window and threshold belong to one bar size: change it and recalibrate.',
         note('lim', 300, 662, 'a flag is not a cause · recalibrate per bar size', 'amber', 18)),
])


BOARD = dict(name='institutional_jump_detection_tests', lesson='institutional-jump-detection-tests',
             title='Finding the jump: plain test versus time-of-day fix', cfg=JD,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>The fix: Boudt-Croux-Laurent',
             deck_after=7)
