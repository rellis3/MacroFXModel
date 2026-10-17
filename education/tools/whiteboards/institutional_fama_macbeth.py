from ._wb import *
from statistics import mean, stdev

# ── Fama-MacBeth two-stage regression (institutional-fama-macbeth) ────────────
# The lesson's worked example: three carry portfolios with Stage-1 betas 0.7 / 1.0 / 1.3 and four
# months of (illustrative) returns. Each month's cross-sectional OLS gives lambda_t and an intercept;
# the fitted lines below are computed here from those returns, not typed in.
BETAS = [0.7, 1.0, 1.3]
RET = [[1.0, 2.0, 3.5], [-0.5, -1.0, -2.0], [0.8, 1.0, 1.1], [-1.0, 0.0, 1.3]]

def _ols(y):
    bb, yb = mean(BETAS), mean(y)
    lam = sum((b - bb) * (r - yb) for b, r in zip(BETAS, y)) / sum((b - bb) ** 2 for b in BETAS)
    return yb - lam * bb, lam
FITS = [_ols(r) for r in RET]
LAMS = [round(l, 4) for _, l in FITS]
assert LAMS == [4.1667, -2.5, 0.5, 3.8333], LAMS
LBAR = mean(LAMS)
S = stdev(LAMS); SE = S / 2; T = LBAR / SE
assert round(LBAR, 4) == 1.5 and round(SE, 4) == 1.5694 and round(T, 2) == 0.96

TONES = ['purple', 'red', 'blue', 'green']

def _month(k):
    a, l = FITS[k]
    tone = TONES[k]
    ops = [dot(f'm{k}{j}', 'cs', [b, r], '', tone) for j, (b, r) in enumerate(zip(BETAS, RET[k]))]
    ops.append(series(f'f{k}', 'cs', [[0.6, round(a + 0.6 * l, 3)], [1.4, round(a + 1.4 * l, 3)]], tone, ms=900))
    ops.append(dict(bars=f'b{k}', chart='lam', data=[[k + 1, LAMS[k], f'{LAMS[k]:.2f}', tone]], bw=30, ms=700))
    return ops

FM = dict(w=600, h=700, intro="The lesson's three carry portfolios and four months, run through both stages. Watch exposure get measured once, then priced afresh each month. Press play, or step through.", steps=[
    step('Three carry-sorted currency portfolios, A, B and C. The question is not how exposed each one is to the carry factor. It is whether the market pays anything for that exposure.',
         box('A', 20, 14, 160, 76, 'Portfolio A', 'blue', sub='beta ?', size=20),
         box('B', 220, 14, 160, 76, 'Portfolio B', 'blue', sub='beta ?', size=20),
         box('C', 420, 14, 160, 76, 'Portfolio C', 'blue', sub='beta ?', size=20)),
    step('Stage 1, once per portfolio: regress its returns on the carry factor over the whole history. The slopes are the betas: 0.7, 1.0 and 1.3.',
         dict(count='A', **{'from': 0, 'to': 0.7, 'dp': 1, 'pre': 'beta '}),
         dict(count='B', **{'from': 0, 'to': 1.0, 'dp': 1, 'pre': 'beta '}),
         dict(count='C', **{'from': 0, 'to': 1.3, 'dp': 1, 'pre': 'beta '})),
    step('Then freeze them. These three numbers are reused, unchanged, in every month that follows.',
         note('frz', 300, 124, 'Stage 1 done: betas frozen for every month', 'blue', 19),
         dict(pulse='A'), dict(pulse='B'), dict(pulse='C')),
    step('Stage 2, month 1. Plot each portfolio\'s return against its beta: 1.0%, 2.0% and 3.5%. The slope of the best-fit line is this month\'s price of risk: 4.17% per unit of beta.',
         chart('cs', (10, 150, 340, 270), 'One month: return (%) vs beta', [0.6, 1.4], [-2.5, 4],
               [[-2, '−2'], [0, '0'], [2, '2'], [4, '4']], [[0.7, '0.7'], [1.0, '1.0'], [1.3, '1.3']], zero=True, pl=40, pr=14),
         chart('lam', (370, 150, 220, 270), 'Price of risk, per month', [0.4, 4.6], [-4.2, 5],
               [[-2, '−2'], [0, '0'], [2, '2'], [4, '4']], [[1, 'm1'], [2, 'm2'], [3, 'm3'], [4, 'm4']], zero=True, pl=34, pr=8),
         *_month(0)),
    step('Month 2 was a bad month for carry, and the more exposed portfolios lost more: −0.5%, −1.0%, −2.0%. Same frozen betas, new returns. The slope is −2.50.',
         dict(dim='f0'), *[dict(dim=f'm0{j}') for j in range(3)],
         *_month(1)),
    step('Months 3 and 4: slopes of 0.50 and 3.83. Four months, four separate regressions, four prices of risk. Each month has been squeezed down to one number.',
         dict(dim='f1'), *[dict(dim=f'm1{j}') for j in range(3)],
         *_month(2), *_month(3)),
    step('The premium is just the average of the four monthly prices: (4.17 − 2.50 + 0.50 + 3.83) ÷ 4 = 1.50% per unit of beta.',
         series('avg', 'lam', [[0.5, LBAR], [4.5, LBAR]], 'green', dash=True, ms=700),
         note('avgl', 480, 444, 'dashed: average 1.50', 'green', 17)),
    step('Its error bar comes from how much those four numbers disagree. Their standard deviation is 3.14, so the standard error is 3.14 ÷ √4 = 1.57. The band of one standard error reaches below zero.',
         dict(gap='band', chart='lam', top=[[0.5, round(LBAR + SE, 3)], [4.5, round(LBAR + SE, 3)]],
              bot=[[0.5, round(LBAR - SE, 3)], [4.5, round(LBAR - SE, 3)]], tone='amber', op=0.25),
         box('se', 10, 464, 280, 104, 't = 1.50 ÷ 1.57 ≈ 0.96\nnot significant', 'amber', size=20)),
    step('The trap it avoids: pool all 12 portfolio-months into one regression and its formula assumes 12 independent points. But in month 2 one shared shock hit all three at once. The pool counts each month\'s story three times, and its error bar comes out too small.',
         box('pool', 310, 464, 280, 104, 'pooled: 12 "independent" rows\nreally 4 monthly stories', 'red', size=18),
         dict(cross='pool')),
    step('A second catch: the betas from Stage 1 are estimates, not facts. Noisy betas pull each slope toward zero. Shanken\'s 1992 correction widens the error bars to allow for it.',
         box('sh', 10, 586, 580, 46, 'Shanken (1992): estimated betas → widen the error bars', 'purple', size=18)),
    step('So: measure exposure once, price it every period, average the prices, and judge the average by how much the prices disagree. Here 1.50% looks big, but four months cannot tell it from zero.',
         note('end', 300, 668, 'big-looking premium ≠ reliable premium', 'green', 20),
         dict(pulse='se')),
])


BOARD = dict(name='institutional_fama_macbeth', lesson='institutional-fama-macbeth',
             title='Fama-MacBeth: measure once, price every month', cfg=FM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>Why pooling is wrong, and this is right</h2>',
             deck_after=6)
