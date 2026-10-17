from ._wb import *
from math import e, exp, pi, sqrt
from statistics import NormalDist

# ── Sharpe family & the Deflated Sharpe Ratio (sharpe-family-deflated) ────────
# The lesson's scenario: N = 50 variations, sigma_SR = 0.66 across their annual Sharpes,
# reported best 1.80, T = 2,520 daily returns, skew -0.4, kurtosis 7.
#   SR0(N) = sigma_SR [(1 - gE) Phi^-1(1 - 1/N) + gE Phi^-1(1 - 1/(N e))]  -> 1.50 at N = 50
#   DSR = Phi((SR - SR0) sqrt(T - 1) / sqrt(1 - g3 SR + (g4 - 1)/4 SR^2)), daily units -> 0.82
# The bell curve is the zero-skill spread N(0, 0.66^2) the formula assumes. All numbers exact.
_N = NormalDist(); _GE = 0.5772156649
S, REP, T, G3, G4 = 0.66, 1.80, 2520, -0.4, 7.0
def sr0(n): return S * ((1 - _GE) * _N.inv_cdf(1 - 1 / n) + _GE * _N.inv_cdf(1 - 1 / (n * e)))
_d = REP / sqrt(252)
_den = sqrt(1 - G3 * _d + (G4 - 1) / 4 * _d * _d)
def dsr(n): return _N.cdf((_d - sr0(n) / sqrt(252)) * sqrt(T - 1) / _den)
S50 = f'{sr0(50):.2f}'                      # '1.50'
D50, D30, D10 = round(100 * dsr(50)), round(100 * dsr(30)), round(100 * dsr(10))   # 82, 91, 99
Z50 = round((_d - sr0(50) / sqrt(252)) * sqrt(T - 1) / _den, 2)                     # 0.91
ZN = round(_d * sqrt(T - 1) / _den, 1)                                              # 5.5
NX = next(n for n in range(2, 1000) if sr0(n) >= REP)                               # 179

BELL = [[round(x, 2), round(exp(-x * x / (2 * S * S)) / (S * sqrt(2 * pi)), 4)] for x in [i / 10 for i in range(-22, 23)]]
LUCK = [[n, round(sr0(n), 3)] for n in [2, 3, 4, 5, 7, 10, 14, 20, 30, 40, 50, 70, 100, 130, 160, 200]]

C1 = (10, 120, 580, 220)
C2 = (10, 352, 580, 220)
C3 = (10, 584, 330, 216)

DSR = dict(w=600, h=810, intro='Fifty versions of one signal, and the best Sharpe ratio among them. The lesson\'s own numbers, step by step. Press play, or step through.', steps=[
    step('A researcher backtests 50 versions of a mean-reversion signal: different lookbacks, entry thresholds and exits. The best one posts an annual Sharpe of 1.80 over ten years of daily data. That goes in the write-up.',
         icon('res', 'person', 30, 6, 0.75, 'blue', 'researcher', lsize=17),
         icon('dice', 'dice', 170, 14, 0.6, 'amber', '50 versions', lsize=17),
         box('best', 330, 16, 250, 76, 'best of 50', 'green', sub='Sharpe 1.80', size=21)),
    step('Now imagine none of the 50 has any edge at all. Their backtested Sharpes still scatter around zero, just from noise. In this search the spread across them is 0.66.',
         chart('c1', C1, 'Sharpe of a zero-skill version (spread 0.66)', [-2.2, 2.2], [0, 0.68],
               [], [[-2, '−2'], [-1, '−1'], [0, '0'], [1, '1'], [2, '2']], pl=20, pr=16),
         series('bell', 'c1', BELL, 'purple', ms=1300)),
    step(f'Take 50 draws from that spread and keep the best. Extreme value theory says the best should land about {S50} on average. That is luck\'s bar, SR₀, with zero skill anywhere in the search.',
         series('s0', 'c1', [[float(S50), 0], [float(S50), 0.6]], 'red', ms=600, label=f'luck ≈ {S50}', lat=[float(S50), 0.6], ldx=-6, ldy=-10, lanchor='end', lsize=17)),
    step('Your 1.80 sits only 0.30 above that bar, not 1.80 above zero. The honest question is whether 0.30 is a real gap or more luck.',
         series('rep', 'c1', [[REP, 0], [REP, 0.6]], 'blue', ms=600, label='yours 1.80', lat=[REP, 0.6], ldx=-6, ldy=-34, lanchor='end', lsize=17),
         dict(gap='g1', chart='c1', top=[[float(S50), 0.58], [REP, 0.58]], bot=[[float(S50), 0], [REP, 0]], tone='green', op=0.35),
         dict(sub='best', text='1.80, only 0.30 above luck')),
    step('Luck\'s bar rises with the number of tries. With the same spread: about 1.04 after 10 tries, 1.37 after 30, 1.50 after 50.',
         chart('c2', C2, 'Luck\'s best Sharpe vs versions tried, N', [0, 200], [0, 2.1],
               [[0, '0'], [1, '1'], [2, '2']], [[0, '0'], [50, '50'], [100, '100'], [150, '150'], [200, '200']], pl=40, pr=20),
         series('luck', 'c2', LUCK, 'red', ms=1400),
         series('rep2', 'c2', [[0, REP], [200, REP]], 'blue', dash=True, ms=600, label='your 1.80', lat=[0, REP], ldx=8, ldy=-14, lanchor='start', lsize=17),
         dot('n50', 'c2', [50, float(S50)], f'N = 50: {S50}', 'red', dx=10, dy=20, anchor='start')),
    step(f'By about N = {NX}, luck alone is expected to reach 1.80. Try that many versions and a 1.80 tells you nothing at all.',
         dot('nx', 'c2', [NX, REP], f'N ≈ {NX}', 'amber', dx=0, dy=-18)),
    step(f'The Deflated Sharpe Ratio turns the gap into a probability. In daily units the gap, times the square root of 2,519 days, over a standard error widened for skew −0.4 and kurtosis 7, gives z = {Z50}. So DSR = {D50}%.',
         chart('c3', C3, 'Chance the true Sharpe is above 0', [0.4, 3.6], [0, 115],
               [[0, '0'], [50, '50%'], [100, '100%']], [[1, 'naive'], [2, 'N = 50'], [3, 'N = 10?']], pl=50, pr=14),
         dict(bars='b2', chart='c3', data=[[2, D50, f'{D50}%', 'amber']], bw=56, ms=900)),
    step(f'Ignore the 50 tries and test 1.80 against zero, and z is about {ZN}: effectively 100%. Same backtest. The whole difference is the search.',
         dict(bars='b1', chart='c3', data=[[1, 100, '≈100%', 'red']], bw=56, ms=900)),
    step(f'The count must be honest. Log 10 runs when you really ran 30, and you would report {D10}% instead of {D30}%. Every untracked try lowers the bar and flatters the result.',
         dict(bars='b3', chart='c3', data=[[3, D10, f'{D10}%', 'red']], bw=56, ms=900),
         box('real', 356, 590, 234, 92, f'really 30 tries?\nthen only {D30}%', 'red', size=19)),
    step('And DSR corrects for the search, not for a calm sample. LTCM\'s smooth record of 1995 to 1997 had no storm in it. Every ratio looked excellent until August 1998.',
         box('ltcm', 356, 698, 234, 100, 'no storm in the\nsample? no ratio\ncan see it', 'amber', size=18)),
    step('Even a good DSR is in-sample evidence. The survivor still has to pass an out-of-sample test on data the whole search never touched.',
         dict(pulse='best'),
         dict(sub='best', text='next: out-of-sample test')),
])


BOARD = dict(name='sharpe_family_deflated', lesson='sharpe-family-deflated', title='The Deflated Sharpe Ratio: beat luck, not zero', cfg=DSR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: two Sharpe ratios that measured the wrong thing</h2>',
             deck_after=10)
