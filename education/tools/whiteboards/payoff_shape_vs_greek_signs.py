from ._wb import *
from math import erf, exp, log, pi, sqrt

# ── Same Greeks, different risk (payoff-shape-vs-greek-signs) ─────────────────
# The lesson's inputs: K = 100, sigma = 20%, r = 2%, 30 days. Premiums 2.20 (put), 2.37 (call).
# Greeks (gamma 0.0695, vega 0.114, deltas +0.477 / -0.523, thetas +0.0353 / +0.0408) and the
# +50 Taylor estimate (-113.0) vs the true reprice (-47.8) are the lesson's worked example.
# The short call's gamma at 110 / 120 / 130 and the Taylor curve are computed below from the
# lesson's own Black-Scholes formulas. VW figures (74% Porsche, ~20% Lower Saxony) are the lesson's.
K, R, SIG, T = 100.0, 0.02, 0.20, 30 / 365
def _n(x): return exp(-x * x / 2) / sqrt(2 * pi)
def _gamma(S):
    d1 = (log(S / K) + (R + SIG * SIG / 2) * T) / (SIG * sqrt(T))
    return _n(d1) / (S * SIG * sqrt(T))
G = {S: _gamma(S) for S in (100, 110, 120, 130)}
TAYLOR = [[100 + d, round(-0.523 * d - 0.5 * 0.0695 * d * d, 1)] for d in range(0, 51, 5)]
PUT = [[0, -97.80], [100, 2.20], [250, 2.20]]
CALL = [[0, 2.37], [100, 2.37], [250, -147.63]]

SAME = dict(w=600, h=860, intro='Two option sellers, one strike, the same dashboard of Greeks. Then the price goes on a long trip. Press play, or step through.', steps=[
    step('Two sellers, one strike. Strike 100, 30 days left, 20% volatility, 2% rates. One sells a put and collects 2.20. The other sells a call and collects 2.37.',
         icon('ps', 'person', 40, 10, 0.7, 'amber', 'sells the put', lsize=17),
         icon('cs', 'person', 490, 10, 0.7, 'red', 'sells the call', lsize=17),
         icon('c1', 'coin', 196, 26, 0.36, 'amber', sym='$'),
         icon('c2', 'coin', 368, 26, 0.36, 'red', sym='$'),
         move('c1', 136, 26, 1100), move('c2', 428, 26, 1100),
         note('prem', 300, 70, 'premium: 2.20 · 2.37', 'amber', 18)),
    step('Their dashboards today. Gamma −0.0695 for both. Vega −0.114 per vol point for both. Theta positive for both. Not just the same signs: the same numbers. Only delta differs, by exactly one.',
         box('dp', 10, 140, 285, 104, 'short put\nΓ −0.0695 · ν −0.114\nΔ +0.477', 'amber', size=18),
         box('dc', 305, 140, 285, 104, 'short call\nΓ −0.0695 · ν −0.114\nΔ −0.523', 'red', size=18)),
    step('Why identical: put-call parity. A short call is a short put plus a short forward. The forward is a straight line, so it has no gamma and no vega. The curvature Greeks cannot see it.',
         box('par', 70, 262, 460, 60, 'short call = short put + short forward', 'purple', size=20)),
    step('Now the payoffs at expiry, across every price from 0 to 250. The short put first: below the strike it loses one for one, but a price cannot go below zero. Its floor is 2.20 − 100 = −97.80.',
         chart('pl', (10, 340, 580, 270), 'P&L at expiry, per unit', [0, 250], [-185, 20],
               [[0, '0'], [-80, '−80'], [-160, '−160']], [[0, '0'], [100, 'K 100'], [200, '200'], [250, '250']], zero=True, pl=50, pr=18),
         series('put', 'pl', PUT, 'amber', ms=1500),
         dot('pf', 'pl', [0, -97.80], 'floor −97.80', 'amber', dx=8, dy=20, anchor='start')),
    step('The short call. Above the strike it also loses one for one, and nothing stops the price rising. At 200 it has lost 97.63. At 250 it has lost 147.63, and the line keeps going.',
         series('call', 'pl', CALL, 'red', ms=1500),
         dot('cf', 'pl', [250, -147.63], '−147.63, no floor', 'red', dx=-6, dy=22, anchor='end'),
         dict(pulse='cs')),
    step('Same dashboard, very different roads. The whole gap lives in that straight-line forward, the one piece the Greeks cannot register.',
         dict(pulse='dp'), dict(pulse='dc'), dict(pulse='par')),
    step('The Greeks are a Taylor expansion around today\'s price. For a +50 move on the short call they predict −0.523 × 50 − ½ × 0.0695 × 50² ≈ −113 (dashed). Repricing honestly gives −47.8. The local estimate more than doubles the loss.',
         series('tay', 'pl', TAYLOR, 'purple', dash=True, ms=1200),
         dot('t50', 'pl', [150, -113.0], 'Greeks say −113', 'purple', dx=-8, dy=4, anchor='end'),
         dot('r50', 'pl', [150, -47.8], 'true −47.8', 'red', dx=8, dy=-12, anchor='start')),
    step(f'Why it misses: gamma does not stay put. As the call goes into the money its gamma collapses: {G[100]:.4f} at 100, {G[110]:.4f} at 110, {G[120]:.4f} at 120, about zero by 130.',
         chart('gm', (10, 626, 280, 168), 'Short call gamma (size)', [0.4, 4.6], [0, 0.08],
               [[0, '0'], [0.07, '0.07']], [[1, '100'], [2, '110'], [3, '120'], [4, '130']], pl=46),
         dict(bars='gb', chart='gm', data=[[1, round(G[100], 4), f'{G[100]:.3f}', 'red'], [2, round(G[110], 4), f'{G[110]:.3f}', 'amber'],
                                           [3, round(G[120], 4), '≈0', 'blue'], [4, round(G[130], 6), '≈0', 'blue']], bw=36, ms=1200)),
    step('So deep in the money, the short call\'s Greeks go quiet exactly where its loss is largest and still growing one for one. Low gamma means linear, not small.',
         box('quiet', 305, 626, 285, 76, 'Greeks ≈ 0\nloss still growing', 'red', size=19),
         dict(pulse='call')),
    step('October 2008: Porsche disclosed it controlled about 74% of Volkswagen\'s ordinary shares, and Lower Saxony held about 20%. Short sellers had to buy back from a few percent of free shares. The price rose roughly fivefold in two trading days.',
         box('vw', 305, 714, 285, 80, 'VW, Oct 2008: Porsche 74%\n+ Saxony 20% → about 5×', 'red', size=17)),
    step('The fix is to cap the uncapped side and size by the stressed loss, not by the Greek columns. Buy a further-out call, or hold the underlying, and the short call\'s road ends at a wall instead of a cliff.',
         box('fix', 10, 806, 580, 46, 'cap the uncapped side · size by stress loss, not by Greeks', 'green', size=18)),
])


BOARD = dict(name='payoff_shape_vs_greek_signs', lesson='payoff-shape-vs-greek-signs',
             title='Same Greeks, different roads: a short put and a short call', cfg=SAME,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
