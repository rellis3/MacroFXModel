from ._wb import *
from math import lgamma, log, exp

# ── Conjugate priors (bayesian-conjugate-priors) ──────────────────────────────
# The lesson's worked example: prior Beta(2,3) (mean 0.40, sd 0.20); 10 days with 3 trend
# days -> Beta(5,10) (mean 0.333, sd 0.118); 30 more days with 9 trend days -> Beta(14,31)
# (mean 0.311, sd 0.068). Curves are the exact Beta densities. The heavier prior Beta(20,30)
# with the same 40 days gives Beta(32,58), mean 32/90 = 0.356 (same arithmetic). The
# Normal-Normal numbers are the lesson's own: tau0 = 4, tau_data = 20, mean 0.125%.
def _pdf(x, a, b): return exp((a - 1) * log(x) + (b - 1) * log(1 - x) + lgamma(a + b) - lgamma(a) - lgamma(b))
def _curve(a, b): return [[round(max(0.003, i / 100), 3), round(_pdf(max(0.003, i / 100), a, b), 3)] for i in range(0, 81)]
def _sd(a, b): return (a * b / ((a + b) ** 2 * (a + b + 1))) ** 0.5
assert round(_sd(2, 3), 3) == 0.2 and round(_sd(5, 10), 3) == 0.118 and round(_sd(14, 31), 3) == 0.068
assert round(32 / 90, 3) == 0.356 and (4 * 0 + 20 * 0.15) / 24 == 0.125

CH = (10, 160, 580, 300)
CONJ = dict(w=600, h=790, intro="A belief about how often trend days happen, updated the conjugate way: by adding counts. The lesson's own numbers. Press play, or step through.", steps=[
    step('Your belief about the true trend-day rate starts as two pretend counts: 2 trend days and 3 quiet days. That is the Beta(2,3) prior. It is centred at 0.40, but only weakly.',
         box('yes', 20, 20, 170, 84, 'trend days', 'green', sub='2', size=20),
         box('no', 210, 20, 170, 84, 'quiet days', 'blue', sub='3', size=20),
         box('bel', 400, 20, 180, 84, 'your belief', 'purple', sub='Beta(2,3)', size=20)),
    step('Drawn as a curve, the prior is low and wide. Its spread (standard deviation) is 0.20, so rates from about 0.2 to 0.6 all look plausible.',
         chart('post', CH, 'Belief about the true trend-day rate', [0, 0.8], [0, 6.6], [],
               [[0, '0'], [0.2, '0.2'], [0.4, '0.4'], [0.6, '0.6'], [0.8, '0.8']], pl=22, pr=16),
         series('c0', 'post', _curve(2, 3), 'blue', ms=1200, label='prior: sd 0.20', lat=[0.56, 1.3], ldx=4, ldy=-14, lanchor='start')),
    step('Ten real days arrive and 3 are trend days. Updating is just adding: drop 3 into the trend jar and 7 into the quiet jar.',
         chip('d1', 160, 135, '+3 trend', 'green'), chip('d2', 330, 135, '+7 quiet', 'blue'),
         move('d1', 105, 62, 900), move('d2', 295, 62, 900),
         dict(count='yes', **{'from': 2, 'to': 5, 'dp': 0}), dict(count='no', **{'from': 3, 'to': 10, 'dp': 0}),
         dict(sub='bel', text='Beta(5,10)')),
    step('The new belief is Beta(5,10): mean 5/15 = 0.333, spread 0.118. The curve is taller and narrower, and its peak has moved toward the data\'s 30%.',
         dict(hide='d1'), dict(hide='d2'), dict(dim='c0'),
         series('dat', 'post', [[0.3, 0], [0.3, 6.4]], 'amber', dash=True, ms=400, label='data 30%', lat=[0.3, 6.4], ldx=-6, ldy=4, lanchor='end'),
         series('c1', 'post', _curve(5, 10), 'purple', ms=1200, label='Beta(5,10): sd 0.118', lat=[0.46, 2.0], ldx=6, ldy=-10, lanchor='start')),
    step('Thirty more days, 9 more trend days. Add again: 5 + 9 = 14 trend days, 10 + 21 = 31 quiet days.',
         chip('d3', 160, 135, '+9 trend', 'green'), chip('d4', 330, 135, '+21 quiet', 'blue'),
         move('d3', 105, 62, 900), move('d4', 295, 62, 900),
         dict(count='yes', **{'from': 5, 'to': 14, 'dp': 0}), dict(count='no', **{'from': 10, 'to': 31, 'dp': 0}),
         dict(sub='bel', text='Beta(14,31)')),
    step('Beta(14,31): mean 14/45 = 0.311, spread 0.068. Same family every time; only the two counts changed. No integration was needed.',
         dict(hide='d3'), dict(hide='d4'), dict(dim='c1'),
         series('c2', 'post', _curve(14, 31), 'green', ms=1200, label='Beta(14,31): sd 0.068', lat=[0.36, 5.0], ldx=8, ldy=-6, lanchor='start'),
         dot('pk', 'post', [0.311, round(_pdf(0.311, 14, 31), 2)], '', 'green')),
    step('The spread, round by round: 0.20, then 0.118, then 0.068. It more than halved, then nearly halved again. The width of the curve is the confidence statement.',
         chart('sdc', (10, 478, 280, 200), 'Spread of the belief', [0.4, 3.6], [0, 0.24], [[0, '0'], [0.1, '0.10'], [0.2, '0.20']],
               [[1, 'prior'], [2, '10 days'], [3, '40 days']], pl=50),
         dict(bars='sb', chart='sdc', data=[[1, 0.2, '0.20', 'blue'], [2, 0.118, '0.118', 'purple'], [3, 0.068, '0.068', 'green']], bw=46, ms=1200)),
    step('How far the data moves you depends on how heavy the prior is. Beta(2,3) is worth 5 pretend days. Start from Beta(20,30), worth 50, and the same 40 days only get you to 0.356, not 0.311.',
         box('heavy', 310, 478, 270, 96, 'prior worth 50 days:\nsame data → 0.356', 'amber', size=19)),
    step('For an unknown mean, the same trick uses the normal curve. Precision, one over the variance, simply adds: a prior worth 4 plus 20 days of data worth 20 makes 24. The mean lands at 0.125%, most of the way to the sample\'s 0.15%.',
         box('prec', 310, 584, 270, 96, 'precision adds:\n4 + 20 = 24 → 0.125%', 'purple', size=19)),
    step('The catch: every update assumes the days are independent. Trend days cluster, so real data narrows the curve faster than it should. And a narrow curve describes the sample you saw, not the future.',
         box('iid', 10, 696, 570, 80, 'clustered days → the curve narrows too fast\nnarrow ≠ validated', 'red', size=19),
         dict(pulse='c2')),
])


BOARD = dict(name='bayesian_conjugate_priors', lesson='bayesian-conjugate-priors', title='Conjugate updating: a belief that narrows by adding counts', cfg=CONJ,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=7)
