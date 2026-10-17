from ._wb import *
import numpy as np

# ── Tide, waves, and the newest point (trend-cycle-filters) ─────────────────
# An illustrative synthetic quarterly series (computed here, not real data): trend growth of 1.0 a
# quarter for 20 quarters, then 0.25 a quarter (a slowdown, as in the 1970s), plus a 16-quarter cycle
# of amplitude 1.2. HP trends solve the lesson's objective exactly (lambda = 1600 unless stated).
#   Real time (data to quarter 27): trend 123.54 vs data 120.64 -> gap -2.90
#   Same filter 12 quarters later:  trend 121.70             -> gap -1.06
# lambda rescaling and the 1970s facts are the lesson's own (Ravn-Uhlig; Orphanides 2001;
# Orphanides & van Norden 2002).
def hp(y, lam=1600):
    T = len(y); D = np.zeros((T - 2, T))
    for i in range(T - 2): D[i, i:i + 3] = [1, -2, 1]
    return np.linalg.solve(np.eye(T) + lam * D.T @ D, y)

T = 40
t = np.arange(T)
y = np.where(t < 20, 100 + 1.0 * t, 120 + 0.25 * (t - 20)) + 1.2 * np.sin(2 * np.pi * t / 16)
FULL, RT = hp(y), hp(y[:28])
LOOSE, STIFF = hp(y, 1), hp(y, 1e7)
assert round(float(RT[27]), 2) == 123.54 and round(float(FULL[27]), 2) == 121.7
GRT, GREV = round(float(y[27] - RT[27]), 1), round(float(y[27] - FULL[27]), 1)
assert (GRT, GREV) == (-2.9, -1.1)
def P(a, n=None): return [[int(i), round(float(v), 2)] for i, v in enumerate(a[:n] if n else a)]

LV = (10, 10, 580, 270)
CY = (10, 296, 580, 190)

TCF = dict(w=600, h=790, intro='Splitting one series into a slow trend and a cycle, and why the newest point of the trend is the one to doubt. Press play, or step through.', steps=[
    step('One quarterly series (made up for this board). Like the sea at a pier, it mixes a slow tide, the trend, with waves on top, the cycle. Only the total is ever observed.',
         chart('lv', LV, 'The series (illustrative, quarterly)', [0, 40], [97, 128], [[100, '100'], [110, '110'], [120, '120']],
               [[0, '0'], [20, '20'], [27, '27'], [40, '40']], pl=50),
         series('ys', 'lv', P(y), 'blue', ms=1500)),
    step('Hodrick-Prescott draws a trend that stays close to the data but is charged for bending. One dial, λ, sets the charge. Turn it near zero and the "trend" just copies the data.',
         series('loose', 'lv', P(LOOSE), 'red', ms=1200, label='λ = 1', lat=[8, float(LOOSE[8])], ldy=-16)),
    step('Turn λ up enormously and bending is banned: the trend becomes a straight line. Neither extreme separates tide from waves.',
         series('stiff', 'lv', P(STIFF), 'purple', ms=1000, label='λ huge', lat=[31, float(STIFF[31])], ldy=-20)),
    step('The quarterly convention is λ = 1600. Now the trend follows the slow tide, and the cycle, data minus trend, is what is left over.',
         dict(hide='loose'), dict(hide='stiff'),
         series('full', 'lv', P(FULL), 'green', ms=1300),
         chart('cy', CY, 'Gap = data − trend', [0, 40], [-4, 3.2], [[-3, '−3'], [0, '0'], [2, '2']],
               [[0, '0'], [20, '20'], [27, '27'], [40, '40']], zero=True, pl=50),
         series('gap', 'cy', P(y - FULL), 'green', ms=1300)),
    step('Wrong frequency, wrong λ. 1600 is for quarterly data. Monthly data needs 1600 × 3⁴ = 129,600; annual needs 1600 ÷ 4⁴ ≈ 6.25.',
         box('lam', 10, 504, 280, 120, 'monthly: 129,600\nquarterly: 1,600\nannual: 6.25', 'purple', size=19)),
    step('Now go back in time. You only have data up to quarter 27. Run the same filter: the trend has no data after its last point, and it ends at 123.5.',
         dict(dim='full'), dict(dim='gap'),
         series('rt', 'lv', P(RT), 'amber', ms=1300),
         dot('rtd', 'lv', [27, round(float(RT[27]), 2)], '123.5', 'amber', dx=-10, dy=-14, anchor='end')),
    step(f'Data at quarter 27 is 120.6, so the real-time gap is {GRT}: it looks like a lot of slack.',
         series('rtg', 'cy', P(y[:28] - RT), 'amber', ms=1200),
         dot('g1', 'cy', [27, GRT], f'real time {GRT}', 'amber', dx=-10, dy=8, anchor='end')),
    step(f'Twelve quarters later, rerun the same filter. The quarter-27 trend drops to 121.7 and the gap shrinks to {GREV}. The early data did not change; only the end of the sample did.',
         dict(pulse='full'),
         dot('g2', 'cy', [27, GREV], f'revised {GREV}', 'green', dx=10, dy=-14, anchor='start')),
    step('That is what happened in the 1970s. Trend growth slowed, trends fitted to the fast 1950s and 1960s sat too high, and the gap showed slack that was not there. Policy stayed loose; inflation rose into double digits.',
         box('s70', 310, 504, 280, 120, '1970s: slack that\nwasn\'t there', 'red', size=19)),
    step('Orphanides and van Norden later showed the revisions were about as big as the gap itself, and came mainly from the end of the sample, not from revised data.',
         box('ovn', 310, 640, 280, 140, 'revisions ≈ size of\nthe gap, mostly from\nthe end of the sample', 'amber', size=18)),
    step('The alternative: a band-pass filter that keeps only cycles of 6 to 32 quarters. It states the cycle openly, but a Baxter-King filter has no value at all for its last K quarters.',
         box('bp', 10, 640, 280, 140, 'band-pass: keep\n6 to 32 quarters,\nlose K at each end', 'blue', size=18)),
    step('The takeaway: a trend is a modelling choice, not a measurement, and its newest point, the one decisions use, is the one most likely to be revised.',
         dict(pulse='g1'), dict(pulse='rtd')),
])


BOARD = dict(name='trend_cycle_filters', lesson='trend-cycle-filters', title='Trend and cycle: why the newest point misleads', cfg=TCF,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=5)
