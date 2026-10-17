from ._wb import *
import random
from math import sqrt

# ── Stationarity, ACF & PACF (stationarity-acf-pacf) ──────────────────────────
# Two series built from the SAME 120 simulated daily shocks (seeded, illustrative):
# an AR(1) with phi = 0.7 (stationary) and a random walk (phi = 1). Exact maths below:
# AR(1) variance sigma^2 / (1 - phi^2) = 1.96 sigma^2; ACF(k) = phi^k; PACF = phi at lag 1, 0 after;
# random walk 250 steps in: Corr(X_t, X_t-k) = sqrt((250 - k) / 250); noise band 1.96 / sqrt(250) = 0.124.
_r = random.Random(8)
_E = [_r.gauss(0, 1) for _ in range(120)]
AR, RW = [0.0], [0.0]
for e in _E:
    AR.append(0.7 * AR[-1] + e)
    RW.append(RW[-1] + e)
AR_PTS = [[i, round(v, 2)] for i, v in enumerate(AR)]
RW_PTS = [[i, round(v, 2)] for i, v in enumerate(RW)]
BAND = round(1.96 / sqrt(250), 3)           # 0.124
ACF = [round(0.7 ** k, 3) for k in range(1, 7)]
RWACF = [round(sqrt((250 - k) / 250), 3) for k in range(1, 7)]
LAGX = [[k, str(k)] for k in range(1, 7)]

def _bars(vals, tone, labels):
    return [[k + 1, v, labels.get(k + 1, ''), tone] for k, v in enumerate(vals)]

STAT = dict(w=600, h=722, intro='Two series built from the same daily shocks: one on a leash, one with no leash. Then the two plots that tell them apart. Press play, or step through.', steps=[
    step('Here is a series that keeps 70% of yesterday\'s distance from its mean each day, plus a fresh random shock: an AR(1) with φ = 0.7. These are 120 simulated days, purely illustrative. It wanders, but it keeps coming back to zero.',
         chart('paths', (10, 10, 580, 230), '120 simulated days, same shocks (illustrative)', [0, 120], [-6, 26],
               [[0, '0'], [10, '10'], [20, '20']], [[0, '0'], [60, '60'], [120, '120 days']], zero=True, pl=44, pr=104),
         series('ar', 'paths', AR_PTS, 'blue', ms=1800, label='AR(1)', lat=[120, AR[-1]], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('Now feed exactly the same shocks into a random walk, which keeps 100% of yesterday. Nothing ever pulls it back, so it drifts off: here it ends near 24. That is the dog with no leash.',
         series('rw', 'paths', RW_PTS, 'red', ms=1800, label='random walk', lat=[120, RW[-1]], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('The difference is in the spread. The AR(1)\'s variance settles at σ² ÷ (1 − 0.7²), about 1.96 σ², and stays there. The random walk\'s variance is t × σ²: 250 σ² after 250 days, and still growing. Only the first one is stationary.',
         box('v1', 10, 250, 280, 64, 'AR(1) variance settles', 'blue', sub='0', size=18),
         dict(count='v1', **{'from': 0, 'to': 1.96, 'dp': 2, 'suf': ' σ²', 'ms': 1200}),
         box('v2', 310, 250, 280, 64, 'random walk, day 250', 'red', sub='0', size=18),
         dict(count='v2', **{'from': 0, 'to': 250, 'dp': 0, 'suf': ' σ² and growing', 'ms': 1600})),
    step('Back to the stationary series. Each day passes 70% of its deviation to the next: two days ago feeds yesterday, and yesterday feeds today. Those are the only direct links.',
         box('d2', 10, 376, 150, 62, '2 days ago', 'blue', size=18),
         box('d1', 225, 376, 150, 62, 'yesterday', 'blue', size=18),
         box('d0', 440, 376, 150, 62, 'today', 'green', size=18),
         arrow('d2', 'd1', '× 0.7', 'blue'),
         arrow('d1', 'd0', '× 0.7', 'blue')),
    step('So two days ago and today still correlate, at 0.7 × 0.7 = 0.49, with no direct link between them at all. That correlation is carried along the chain: an echo, not new memory.',
         arrow('d2', 'd0', '0.49, carried by the chain', 'amber', bend=-46, dash=True, id='echo')),
    step('The ACF plots the total link at every lag: 0.70, 0.49, 0.34, 0.24, 0.17, 0.12. It fades geometrically, as φ to the power k, and slips inside the noise band (about ±0.12 with 250 days of data) at lag 6.',
         chart('acf', (10, 476, 285, 236), 'ACF: total link', [0.4, 6.6], [0, 1.15], [[0, '0'], [0.5, '0.5'], [1, '1']], LAGX, pl=40, pr=12),
         series('b1', 'acf', [[0.4, BAND], [6.6, BAND]], 'amber', dash=True, ms=500),
         dict(bars='acfb', chart='acf', data=_bars(ACF, 'blue', {1: '0.70', 3: '0.34'}), bw=22, ms=1200)),
    step('The PACF asks a sharper question: once you know the days in between, what does lag k add? For this series only lag 1 survives, at 0.70. Every later lag adds nothing. ACF decays, PACF cuts off: the signature of an AR(1).',
         chart('pacf', (305, 476, 285, 236), 'PACF: what is new', [0.4, 6.6], [0, 1.15], [[0, '0'], [0.5, '0.5'], [1, '1']], LAGX, pl=40, pr=12),
         series('b2', 'pacf', [[0.4, BAND], [6.6, BAND]], 'amber', dash=True, ms=500),
         dict(bars='pacfb', chart='pacf', data=[[1, 0.7, '0.70', 'purple']] + [[k, 0.004, '', 'purple'] for k in range(2, 7)], bw=22, ms=1000),
         dict(pulse='d1')),
    step('So the PACF says: one past value carries real information here, not ten. Ten lags as predictors would mostly re-add yesterday\'s information, plus estimation noise.',
         note('one', 300, 458, 'lag order = 1: use yesterday, not the last ten days', 'green', 18)),
    step('Now the random walk\'s ACF. 250 days in, its correlation with k days back is the square root of (250 − k) ÷ 250: 0.998 at lag 1 and still 0.99 at lag 6. It never fades, because today\'s level contains every shock so far.',
         dict(hide='pacf'), dict(hide='b2'), dict(hide='pacfb'), dict(hide='one'),
         chart('rwacf', (305, 476, 285, 236), 'ACF: random walk', [0.4, 6.6], [0, 1.15], [[0, '0'], [0.5, '0.5'], [1, '1']], LAGX, pl=40, pr=12, tone='red'),
         series('b3', 'rwacf', [[0.4, BAND], [6.6, BAND]], 'amber', dash=True, ms=500),
         dict(bars='rwb', chart='rwacf', data=_bars(RWACF, 'red', {1: '1.00', 6: '0.99'}), bw=22, ms=1200),
         dict(pulse='rw')),
    step('That slow-fading ACF is the cheap first warning of a unit root. Granger and Newbold showed in 1974 that regressing one independent random walk on another routinely looks highly significant. Run a formal test, like Dickey and Fuller\'s, before trusting the plot.',
         note('warn', 300, 458, 'still high at lag 20 or 30?  test for a unit root first', 'red', 18)),
    step('The order matters. First check the series is stationary, a leash and a home level. Then read the PACF to see how many past values carry real information. A rolling window for the mean is a separate choice.',
         dict(dim='rw'), dict(pulse='ar'), dict(pulse='acf')),
])


BOARD = dict(name='stationarity_acf_pacf', lesson='stationarity-acf-pacf', title='Stationarity, ACF and PACF, drawn step by step', cfg=STAT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=11)
