from ._wb import *
from statistics import mean, pstdev

# ── Point-in-time features, and the leaks around them (feature-engineering-leakage-reproducibility) ──
# Numbers are the lesson's worked example: x = [1.0, 1.2, 0.9, 1.4, 3.8, 1.1]; for day 3,
# full-sample mean 1.567 / sd 1.011 → z −0.659; days 1–3 mean 1.033 / sd 0.125 → z −1.07
# (population sd, computed below). The March CPI "published April 10" date is the lesson's own
# illustrative example. Episode: Reinhart & Rogoff (2010) −0.1% above 90% debt; Herndon, Ash &
# Pollin (2013) rebuild ≈ 2.2%.
X = [1.0, 1.2, 0.9, 1.4, 3.8, 1.1]
MF, SF = mean(X), pstdev(X)
M3, S3 = mean(X[:3]), pstdev(X[:3])
ZF, Z3 = (X[2] - MF) / SF, (X[2] - M3) / S3
assert round(ZF, 2) == -0.66 and round(Z3, 2) == -1.07
CH = (10, 10, 580, 300)
Z_IDS = ['ch', 'pts', 'fut', 'mf', 'm3', 'zf', 'z3', 'same'] + [f'd{i}' for i in range(6)]

FEAT = dict(w=600, h=620, intro='The lesson\'s six-number z-score, built the leaky way and the honest way, then the other places the future sneaks in. Press play, or step through.', steps=[
    step('Six days of a spread reading: 1.0, 1.2, 0.9, 1.4, then a one-off news spike to 3.8, then 1.1. We want a feature for day 3: how unusual is today\'s reading?',
         chart('ch', CH, 'A spread reading, day by day', [0.5, 6.5], [0, 4.2],
               [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], [[d, f'day {d}' if d == 1 else str(d)] for d in range(1, 7)], pl=46, pr=16),
         series('pts', 'ch', [[i + 1, v] for i, v in enumerate(X)], 'blue', ms=1400),
         *[dot(f'd{i}', 'ch', [i + 1, v], (f'{v}' if i != 2 else 'today 0.9'), 'purple' if i == 2 else ('red' if i == 4 else 'blue'),
               dy=(-16 if i != 2 else 22)) for i, v in enumerate(X)]),
    step('On day 3, days 4 to 6 have not happened yet. A live system computing the feature that morning cannot see them, including the spike.',
         dict(gap='fut', chart='ch', top=[[3.5, 4.2], [6.5, 4.2]], bot=[[3.5, 0], [6.5, 0]], tone='red', op=0.16),
         cnote('futl', 'ch', [5, 0.45], 'not happened yet on day 3', 'red', 18)),
    step('The leaky way: take the mean and standard deviation of all six days. Mean 1.567, standard deviation 1.011, so day 3 scores (0.9 − 1.567) ÷ 1.011 = −0.66. Fairly ordinary.',
         series('mf', 'ch', [[0.6, MF], [6.4, MF]], 'red', dash=True, ms=800, label='mean of all 6: 1.567', lat=[0.6, MF], ldx=0, ldy=-16, lanchor='start', lsize=16),
         box('zf', 20, 330, 270, 92, 'all six days\nz = −0.66', 'red', size=20)),
    step('Look why: the spike on day 5, which had not happened yet, is what stretches the standard deviation to 1.011. Without it the other five days spread by only about 0.17. A future value makes day 3 look tame.',
         dict(pulse='d4'), dict(pulse='zf')),
    step('The honest way: use only days 1 to 3. Mean 1.033, standard deviation 0.125, so day 3 scores (0.9 − 1.033) ÷ 0.125 = −1.07. Clearly unusual.',
         series('m3', 'ch', [[0.6, M3], [3.4, M3]], 'green', dash=True, ms=700),
         box('z3', 310, 330, 270, 92, 'days 1 to 3 only\nz = −1.07', 'green', size=20)),
    step('Same reading, same day, two different signals. A model trained on the leaky version is fed a future-informed sense of "unusual" on every single row, which no live system could ever produce.',
         note('same', 300, 455, 'same day: −0.66 leaky vs −1.07 honest', 'amber', 20)),
    step('The same leak hides in a calendar join. March inflation is labelled March, but it is published weeks later: in the lesson\'s example, on 10 April. Join it to 31 March and every March row can see a number nobody had yet.',
         *[dict(hide=i) for i in Z_IDS + ['futl']],
         box('feb', 20, 30, 170, 54, 'February', 'blue', size=18),
         box('mar', 210, 30, 170, 54, 'March', 'red', size=18),
         box('apr', 400, 30, 180, 54, 'April', 'green', size=18),
         chip('cpi1', 295, 118, 'naive: dated 31 Mar', 'red'),
         chip('cpi2', 490, 118, 'true: usable 10 Apr', 'green')),
    step('Target leakage: using today\'s close to predict whether today closes up. The two columns look separate, but they describe the same event. The feature restates the label.',
         box('feat', 20, 170, 220, 72, "feature:\ntoday's close", 'amber', size=18),
         box('lab', 360, 170, 220, 72, 'label: did today\nclose up?', 'blue', size=18),
         arrow('feat', 'lab', 'restates it', 'red')),
    step('Survivorship: build an emerging-market carry universe from today\'s vendor list, and the pegs that collapsed are simply missing. Those were the carry trade\'s worst cases, so the backtest looks calmer than the real history.',
         chip('surv', 150, 290, "still listed today", 'green'),
         box('dead', 330, 262, 250, 56, 'collapsed pegs', 'red', size=18),
         dict(cross='dead')),
    step('And reproducible is not the same as right. Reinhart and Rogoff\'s 2010 spreadsheet gave −0.1% growth above 90% debt every time it ran. In 2013 Herndon, Ash and Pollin rebuilt it: five countries left out of an average, some years dropped, odd weighting. Corrected: about 2.2%.',
         box('rr', 120, 340, 360, 84, 'growth above 90% debt', 'purple', sub='−0.1%', size=19),
         dict(count='rr', **{'from': -0.1, 'to': 2.2, 'dp': 1, 'suf': '%', 'ms': 1500})),
    step('The rule: build every feature as if it had to run live that morning, from what was known that morning. Then hand the whole pipeline, data, code and choices, to someone who can disagree with it.',
         note('rule', 300, 480, 'only what was known that morning', 'green', 22),
         note('rule2', 300, 530, 'then let someone else rebuild it', 'green', 20)),
])


BOARD = dict(name='feature_engineering_leakage_reproducibility', lesson='feature-engineering-leakage-reproducibility',
             title='Building a feature from only what was known, step by step', cfg=FEAT,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>',
             deck_after=9)
