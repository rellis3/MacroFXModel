from ._wb import *
from math import sqrt

# ── HAR-RV (institutional-har-rv) ─────────────────────────────────────────────
# The lesson's 22-day worked example (daily sigma in %, RV = sigma^2) and its illustrative
# Corsi-style weights (0.03, 0.35, 0.41, 0.20). Averages, forecast and annualised figures are
# recomputed here and checked against the lesson's 0.3969 / 0.4387 / 0.5962 / 0.4680 / 10.86%.
SIG = [0.60, 0.65, 0.63, 0.62, 0.66, 0.63, 0.68, 0.71, 0.69, 0.95, 1.20, 1.10, 1.00, 0.90, 0.80,
       0.75, 0.72, 0.69, 0.68, 0.66, 0.65, 0.63]
RV = [round(s * s, 4) for s in SIG]
D, W, M = RV[-1], sum(RV[-5:]) / 5, sum(RV) / 22
B0, BD, BW, BM = 0.03, 0.35, 0.41, 0.20
F = B0 + BD * D + BW * W + BM * M
ANN = lambda v: sqrt(v) * sqrt(252)
assert (round(D, 4), round(W, 4), round(M, 4), round(F, 4)) == (0.3969, 0.4387, 0.5962, 0.468)
assert (round(ANN(F), 2), round(ANN(D), 2)) == (10.86, 10.0)

TONE = ['red' if 10 <= d <= 14 else None for d in range(1, 23)]

HAR = dict(w=600, h=700, intro="The lesson's 22 days of realized variance, a shock in the middle, and three people reading it on three clocks. Press play, or step through.", steps=[
    step('One squared daily return is a noisy reading of a whole day. Realized variance adds up the squared returns of every five-minute bar instead: many small readings, one well-measured number per day.',
         box('rv', 120, 14, 360, 70, 'RV = sum of squared 5-minute returns', 'blue', size=19)),
    step('Here are 22 days of it, from the lesson. Calm at first, around 0.4.',
         dict(hide='rv'),
         chart('c', (10, 130, 580, 290), 'Realized variance, %² per day', [0.3, 23.7], [0, 1.6],
               [[0, '0'], [0.5, '0.5'], [1.0, '1.0'], [1.5, '1.5']], [[1, '1'], [11, '11'], [22, '22'], [23, '23']], pl=44, pr=8),
         dict(bars='b1', chart='c', data=[[d, RV[d - 1], '', 'blue'] for d in range(1, 10)], bw=16, ms=900)),
    step('Then a shock: days 10 to 14, peaking at 1.44 on day 11. After it, variance slowly drifts back down. By day 22, today, it reads 0.3969, close to where it started.',
         dict(bars='b2', chart='c', data=[[d, RV[d - 1], '', 'red' if 10 <= d <= 14 else 'blue'] for d in range(10, 23)], bw=16, ms=1300),
         dot('pk', 'c', [11, 1.44], '1.44', 'red', dy=-14)),
    step('Three people read this chart on three clocks. The day trader only cares about today: 0.3969.',
         icon('p1', 'person', 40, 10, 0.62, 'blue', 'today', lsize=17),
         dot('dd', 'c', [22, D], '', 'blue')),
    step('The weekly rebalancer cares about the past 5 days: their average is 0.4387. A little higher, because the tail of the shock is still in that window.',
         icon('p2', 'person', 255, 10, 0.62, 'amber', 'past week', lsize=17),
         series('ww', 'c', [[17.6, W], [22.4, W]], 'amber', ms=600),
         cnote('wl', 'c', [23.4, 0.95], 'week avg 0.4387', 'amber', 17, anchor='end')),
    step('The monthly allocator looks at all 22 days: an average of 0.5962. The highest of the three, because the month still contains the whole shock.',
         icon('p3', 'person', 470, 10, 0.62, 'purple', 'past month', lsize=17),
         series('mm', 'c', [[0.6, M], [22.4, M]], 'purple', dash=True, ms=1000),
         cnote('ml', 'c', [1, M], '0.5962', 'purple', 16, anchor='start', dy=-10)),
    step('HAR-RV blends the three with weights from a plain regression. With the lesson\'s illustrative weights: 0.03 + 0.35 × 0.3969 + 0.41 × 0.4387 + 0.20 × 0.5962 = 0.4680.',
         box('eq', 10, 440, 580, 60, '0.03 + 0.35 × today + 0.41 × week + 0.20 × month', 'green', size=18),
         dict(pulse='p1'), dict(pulse='p2'), dict(pulse='p3')),
    step('That is the forecast for day 23: 0.4680, above today\'s 0.3969. The model has not forgotten the shock, even though today looks calm.',
         dot('fc', 'c', [23, round(F, 4)], '', 'green'),
         cnote('fcl', 'c', [23.4, 0.78], 'forecast 0.4680', 'green', 18, anchor='end')),
    step('In annual terms: copying today gives 10.00%; HAR-RV gives 10.86%.',
         chart('cmp', (10, 520, 300, 160), 'Forecast, % a year', [0.4, 2.6], [0, 12], [[0, '0'], [10, '10']], [[1, 'copy today'], [2, 'HAR-RV']], pl=30, pr=6),
         dict(bars='cb', chart='cmp', data=[[1, round(ANN(D), 2), '10.00', 'blue'], [2, round(ANN(F), 2), '10.86', 'green']], bw=60, ms=900)),
    step('Why three averages work: traders on different clocks each add their own memory, so real volatility forgets shocks slowly. Three plain averages mimic that long memory almost as well as heavier models.',
         box('why', 330, 520, 260, 76, 'three clocks →\nlong memory', 'purple', size=19)),
    step('The catches: it needs real intraday data to be the model the research tested, and because it averages, it lags when a fresh spike begins.',
         box('catch', 330, 606, 260, 76, 'needs intraday RV;\nslow at a new spike', 'red', size=18)),
])


BOARD = dict(name='institutional_har_rv', lesson='institutional-har-rv',
             title='HAR-RV: three clocks, one forecast', cfg=HAR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>HAR-RV versus GARCH',
             deck_after=6)
