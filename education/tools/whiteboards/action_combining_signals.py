from ._wb import *

# ── Combining signals that disagree (action-combining-signals) ───────────────
# The lesson's EUR/USD screen: trend family A +1.2, B +1.0, C +1.5 (IC 0.04, n 400, ρ 0.8
# inside the family), rates D −1.0 (IC 0.08, n 400), positioning E −0.5 (IC 0.06, n 50).
# τ = 0.05 → keep 50% at n 400, 11.1% at n 50. Weights: trend 0.020/2.6 = 0.00769 each,
# rates 0.040, positioning 0.0067. F = 0.0285 − 0.0400 − 0.0033 = −0.0149, IC_comb 0.046,
# z −0.32, P(direction) 50.6% → no view. Rates flipped to +1.0 → z +1.42, +0.13%, 52.6%.
from math import sqrt, erf
TAU2 = 0.05 ** 2
def keep(n): return TAU2 / (TAU2 + 1 / n)
SC = dict(A=1.2, B=1.0, C=1.5, D=-1.0, E=-0.5)
IC_T, IC_D, IC_E = 0.04 * keep(400), 0.08 * keep(400), 0.06 * keep(50)
W_T = IC_T / (1 + 2 * 0.8)
F = W_T * (1.2 + 1.0 + 1.5) + IC_D * -1.0 + IC_E * -0.5
ICC = sqrt(3 * W_T * IC_T + IC_D ** 2 + IC_E ** 2)
Phi = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
assert round(keep(400), 3) == 0.5 and round(keep(50), 3) == 0.111
assert round(W_T, 5) == 0.00769 and round(F, 4) == -0.0149 and round(ICC, 3) == 0.046
assert round(F / ICC, 2) == -0.32 and round(100 * Phi(abs(F) / sqrt(1 - ICC ** 2)), 1) == 50.6
F2 = W_T * 3.7 + IC_D * 1.0 + IC_E * -0.5
assert round(F2 / ICC, 2) == 1.42 and round(2.0 * F2, 2) == 0.13 and round(100 * Phi(F2 / sqrt(1 - ICC ** 2)), 1) == 52.6
NEFF = [[n, round(n / (1 + (n - 1) * 0.8), 3)] for n in range(1, 11)]

SCORES = [[1, 1.2, '+1.2', 'green'], [2, 1.0, '+1.0', 'green'], [3, 1.5, '+1.5', 'green'],
          [4, -1.0, '−1.0', 'red'], [5, -0.5, '−0.5', 'red']]
XT = [[1, 'mom'], [2, 'cross'], [3, 'break'], [4, 'rates'], [5, 'posit.']]
CONTRIB = [[1, round(W_T * 3.7 * 1000, 1), '+28.5', 'green'], [2, round(-IC_D * 1000, 1), '−40.0', 'red'],
           [3, round(-IC_E * 0.5 * 1000, 1), '−3.3', 'red']]

COMBINE = dict(w=600, h=800, intro='Five readings on EUR/USD: three say long, two say short. Count them honestly and see what they really add up to. Press play, or step through.', steps=[
    step('Your screen for a one-month EUR/USD view: five signals, each scored in its own standard deviations. Momentum +1.2, the moving-average cross +1.0, a breakout +1.5, the yield spread −1.0, positioning −0.5.',
         chart('sc', (10, 10, 580, 230), 'Today\'s scores', [0.4, 5.6], [-1.9, 2.9], [[2, '+2'], [1, '+1'], [0, '0'], [-1, '−1']], XT, zero=True, pl=46, pr=12),
         dict(bars='scb', chart='sc', data=SCORES, bw=46, ms=1200)),
    step('Count the votes: three long, two short. The vote says long. Adding the scores says long too: +2.2.',
         note('vote', 470, 58, '3 vs 2 → LONG?', 'amber', 20)),
    step('But the three long votes all measure one thing: trend. They move together with a correlation of 0.8. Like three friends who read the same newspaper, they are one opinion said three times.',
         dict(line='fam', points=[[93, 68], [93, 62], [340, 62], [340, 68]], tone='amber', width=3, ms=600),
         note('famt', 216, 50, 'trend family: one input', 'amber', 18)),
    step('How many opinions is that? N ÷ (1 + (N − 1) × ρ). Three trend signals at 0.8 are worth 3 ÷ 2.6 = 1.15. Ten of them would be worth only 1.22, and no number of them passes 1 ÷ 0.8 = 1.25.',
         chart('ne', (10, 258, 280, 220), 'worth, at ρ = 0.8', [1, 10], [0, 10], [[1, '1'], [5, '5'], [10, '10']], [[1, '1'], [5, '5'], [10, '10']], pl=40, pr=14),
         series('diag', 'ne', [[1, 1], [10, 10]], None, dash=True, ms=500, label='if independent', lat=[7, 7], ldx=-8, ldy=-6, lanchor='end', lsize=14),
         series('neff', 'ne', NEFF, 'purple', ms=1200),
         dot('n3', 'ne', [3, 1.154], '1.15', 'amber', dy=-16)),
    step('Next, track records. Each signal\'s past correlation with the returns that followed, its IC, is small: 0.04 for each trend signal, 0.08 for rates, 0.06 for positioning. But positioning rests on only 50 observations, the rest on 400.',
         box('rec', 305, 258, 285, 104, 'IC: trend 0.04 (n 400)\nrates 0.08 (n 400)\npositioning 0.06 (n 50)', 'blue', size=17)),
    step('Shrink every record by its length. With 400 observations you keep half the measured IC; with 50, about a ninth. Shrunk: trend 0.020 each, rates 0.040, positioning 0.0067. A signal with no record would get nothing.',
         box('shr', 305, 374, 285, 104, 'keep: n 400 → 50%\nn 50 → 11%', 'purple', size=18)),
    step('Now combine with weights that undo the double-counting. The trend family shares one signal\'s worth of weight: each gets 0.020 ÷ 2.6 = 0.0077. Rates gets 0.040, positioning 0.0067.',
         chart('ct', (10, 496, 360, 230), 'Pull on the forecast (×1,000)', [0.4, 3.6], [-60, 36], [[25, '+25'], [0, '0'], [-25, '−25']], [[1, 'trend ×3'], [2, 'rates'], [3, 'positioning']], zero=True, pl=50, pr=12)),
    step('Weight times score. The whole trend family pulls long: 0.0077 × (1.2 + 1.0 + 1.5) = +0.0285. Rates pulls short: −0.040. Positioning adds −0.0033. They nearly cancel: F = −0.0149.',
         dict(bars='ctb', chart='ct', data=CONTRIB, bw=50, ms=1300)),
    step('In its own standard deviations that is z = −0.32. The chance the direction is right is 50.6%, a faint lean short. Under the written rule, |z| under 1 means no trade. The honest output is "no view".',
         dict(cross='vote'),
         box('nv', 385, 496, 205, 110, 'z = −0.32\n50.6% → NO VIEW', 'amber', size=19)),
    step('What would make this a trade? Independent agreement. If the yield spread read +1.0 instead, the same arithmetic gives z = +1.42, an expected move of +0.13% and a 52.6% chance of being right: a modest, legitimate long.',
         box('flip', 385, 616, 205, 110, 'rates +1.0?\nz = +1.42 → small long', 'green', size=18)),
    step('It happened at scale in August 2007. Many quant equity funds, each sure its blend of signals was its own, lost heavily within a few days while the market barely moved. Their "independent" signals had become one crowded position.',
         note('quake', 300, 760, 'Aug 2007: many signals, one crowded trade', 'red', 19)),
    step('The habit: count families, not indicators. Trust each record only as much as its length deserves. And write the no-view rule before you look at today\'s screen.',
         dict(pulse='nv'), dict(pulse='famt')),
])


BOARD = dict(name='action_combining_signals', lesson='action-combining-signals', title='Combining signals that disagree, drawn step by step', cfg=COMBINE,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=8)
