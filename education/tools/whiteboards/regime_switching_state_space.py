from ._wb import *
import math

# ── Regime-switching state space (regime-switching-state-space) ───────────────
# Branch counts: exact filtering with N = 2 regimes needs 2^T regime paths (2^30 = 1,073,741,824);
# Kim's filter keeps N = 2. The collapse is the lesson's worked example: branches 1.30 (P 0.004,
# weight 0.75) and 1.10 (P 0.010, weight 0.25) merge to mean 1.250, P = 0.0055 + 0.0075 = 0.0130;
# with branch 2 at 1.28 instead (the lesson's "both near 1.28"), P = 0.0056. Timeline dates are the
# lesson's: NBER peak December 2007 announced 1 December 2008; trough June 2009 announced
# September 2010; February 2020 peak announced 8 June 2020.
def _N(x, m, v): return math.exp(-(x - m) ** 2 / (2 * v)) / math.sqrt(2 * math.pi * v)
def _merge(x2, x1=1.30, p1=0.004, w1=0.75, p2=0.010):
    m = w1 * x1 + (1 - w1) * x2; return m, w1 * p1 + (1 - w1) * p2 + w1 * (m - x1) ** 2 + (1 - w1) * (m - x2) ** 2
M, P = _merge(1.10); M2, P2 = _merge(1.28)
assert (round(M, 3), round(P, 4), round(P2, 4)) == (1.25, 0.013, 0.0056) and 2 ** 30 == 1073741824
XS = [round(0.8 + i * 0.01, 2) for i in range(81)]
def _c(f): return [[x, round(f(x), 3)] for x in XS]

RS = dict(w=600, h=660, intro="A Kalman filter whose settings switch with a hidden regime: why it explodes, how Kim's filter tames it, and the recession it called early. Press play, or step through.", steps=[
    step('One hedge ratio, two behaviours. In a calm regime it drifts slowly, so the filter wants a small process variance Q. In a turbulent regime it moves fast, so it wants a large Q. One fixed setting serves both badly.',
         box('calm', 20, 20, 230, 84, 'calm regime', 'blue', sub='small Q, tight R', size=20),
         box('turb', 350, 20, 230, 84, 'turbulent regime', 'red', sub='large Q', size=20)),
    step('So let a hidden regime pick the settings. The regime itself follows a Markov chain, as in the hidden Markov model lesson: each step it may stay or switch. You never see it directly.',
         arrow('calm', 'turb', 'switch?', 'amber', bend=-22), arrow('turb', 'calm', 'switch?', 'amber', bend=-22)),
    step('Because the regime is hidden, an exact filter must keep a separate Kalman estimate for every possible regime history. With two regimes the count doubles each step: 2, 4, 8, 16, 32 … After 30 steps it is over a billion.',
         chart('br', (10, 136, 260, 210), 'Branches to track', [0.4, 5.6], [0, 36], [[0, '0'], [16, '16'], [32, '32']],
               [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5 steps']], pl=40, pr=10),
         dict(bars='ex', chart='br', data=[[t - 0.18, 2 ** t, str(2 ** t), 'red'] for t in range(1, 6)], bw=16, ms=1200)),
    step('Kim\'s filter, from 1994, keeps it at two. After each step it merges every branch that agrees on today\'s regime into one bell curve. The count never grows, however long the series.',
         dict(bars='km', chart='br', data=[[t + 0.18, 2, '', 'green'] for t in range(1, 6)], bw=16, ms=900),
         note('kml', 140, 236, 'Kim: 2', 'green', 18)),
    step('Here is one merge. Two branches both end in the calm regime. One stayed calm and says 1.30, fairly sure, weight 0.75. One just switched from turbulent and says 1.10, less sure, weight 0.25.',
         chart('den', (280, 136, 310, 210), 'Two branches, now calm', [0.8, 1.6], [0, 5.2], [], [[1.0, '1.0'], [1.2, '1.2'], [1.4, '1.4']], pl=14, pr=10),
         series('b1', 'den', _c(lambda x: 0.75 * _N(x, 1.30, 0.004)), 'blue', ms=900, label='1.30', lat=[1.30, 4.73], ldx=10, ldy=-2, lanchor='start'),
         series('b2', 'den', _c(lambda x: 0.25 * _N(x, 1.10, 0.010)), 'amber', ms=900, label='1.10', lat=[0.97, 0.55], ldx=-4, ldy=-10, lanchor='end')),
    step('Merge them into one Gaussian. The mean is the weighted average: 0.75 × 1.30 + 0.25 × 1.10 = 1.25.',
         series('mg', 'den', _c(lambda x: _N(x, M, P)), 'purple', dash=True, ms=1000, label='1.25', lat=[1.25, 3.5], ldx=-10, ldy=-6, lanchor='end')),
    step('The merged variance is the average of the branch variances, 0.0055, plus their disagreement about the mean, 0.0075: 0.0130 in all. That is wider than either branch on its own. Merging opinions that disagree is never free.',
         box('pv', 280, 356, 310, 80, 'P = 0.0055 + 0.0075\n= 0.0130', 'purple', size=19)),
    step('Had the branches nearly agreed, say 1.30 and 1.28, the disagreement term would almost vanish and the merged variance would be 0.0056. The cost of merging is the size of the disagreement.',
         box('agree', 10, 356, 260, 80, 'branches agree:\nP = 0.0056', 'green', size=19)),
    step('Real data. US recessions are dated by an NBER committee that waits for revised data. The recession that began in December 2007 was only announced on 1 December 2008, nearly a year later. Chauvet and Piger\'s regime-switching model of four monthly indicators called it months earlier.',
         chart('tl', (10, 450, 580, 120), 'Recession dating, 2007 to 2010', [2007.5, 2011.0], [0, 1], [], [[2008, '2008'], [2009, '2009'], [2010, '2010']], pl=14, pr=14, pt=30, pb=24),
         series('tln', 'tl', [[2007.5, 0.45], [2011.0, 0.45]], None, ms=500, width=2),
         dot('p07', 'tl', [2007.92, 0.45], 'peak Dec 2007', 'red', dy=-16),
         dot('a08', 'tl', [2008.92, 0.45], 'announced 1 Dec 2008', 'amber', dy=20)),
    step('Its end, in June 2009, was announced in September 2010. In 2020 the model\'s recession probability went to near certainty as the spring data arrived; the NBER named the February peak on 8 June 2020.',
         dot('t09', 'tl', [2009.42, 0.45], 'trough Jun 2009', 'green', dy=-16),
         dot('a10', 'tl', [2010.67, 0.45], 'announced Sep 2010', 'amber', dx=12, dy=20, anchor='end')),
    step('Two cautions. The neat historical charts are smoothed on revised data, which is hindsight: judge the model only on its real-time readings. And a regime call describes the backdrop; it is not, by itself, a trade.',
         box('warn', 10, 584, 580, 66, 'smoothed + revised = hindsight · a regime call is not a trade', 'red', size=18)),
])


BOARD = dict(name='regime_switching_state_space', lesson='regime-switching-state-space', title='Regime switching: branch, merge, and call the recession', cfg=RS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: calling the 2008 and 2020 recessions before the official date</h2>',
             deck_after=8)
