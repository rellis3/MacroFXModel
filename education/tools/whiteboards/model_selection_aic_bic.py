from ._wb import *
from math import log

# ── Model selection: AIC & BIC (model-selection-aic-bic) ──────────────────────
# The lesson's worked example, n = 100: Model A k = 2, deviance 100; Model B k = 5, deviance 94.
#   AIC_A = 4 + 100 = 104, AIC_B = 10 + 94 = 104 (a tie)
#   BIC_A = 2 ln 100 + 100 = 109.21, BIC_B = 5 ln 100 + 94 = 117.03
#   three extra parameters: fit gained 6, AIC price 3 x 2 = 6, BIC price 3 ln 100 = 13.82
# The penalty curve is ln(n), exact; it equals AIC's flat 2 at n = e^2 = 7.39.
N = 100
BIC_A, BIC_B = round(2 * log(N) + 100, 2), round(5 * log(N) + 94, 2)
BIC_PRICE = round(3 * log(N), 1)
PEN = [[n, round(log(n), 3)] for n in [1, 2, 4, 7.39, 12, 20, 35, 60, 100, 160, 250, 400, 600, 800, 1000]]
G1000 = round(3 * log(1000) - 6, 1)    # 14.7: BIC gap at n = 1000

COST = (10, 150, 580, 270)
PC = (10, 440, 580, 270)

AIC = dict(w=600, h=725, intro='Two models for the same 100 days, and two judges that charge rent for every parameter. The lesson\'s worked example, step by step. Press play, or step through.', steps=[
    step('Two candidate models for the same 100 days of a spread. Model A has 2 free parameters. Model B has 5: the same model plus three extra lags.',
         box('A', 20, 20, 260, 104, 'Model A\n2 parameters', 'blue', sub='?', size=21),
         box('B', 320, 20, 260, 104, 'Model B\n5 parameters', 'purple', sub='?', size=21)),
    step('Fit both. The misfit score, called the deviance, is 100 for Model A and 94 for Model B. Lower is better, so B fits better in sample.',
         dict(count='A', **{'from': 0, 'to': 100, 'dp': 0, 'pre': 'misfit ', 'ms': 900}),
         dict(count='B', **{'from': 0, 'to': 94, 'dp': 0, 'pre': 'misfit ', 'ms': 900})),
    step('It had to. B contains A: set its three extra lags to zero and it is A. So B can always match A, then nudge the extra lags to chase noise. Raw fit always votes for the bigger model.',
         arrow('B', 'A', 'extra lags = 0', 'amber', bend=-22)),
    step('So ask a sharper question: did the three extra parameters buy more fit than they cost? They bought 6 points of deviance, 100 down to 94.',
         chart('cost', COST, "Model B's 3 extra parameters (points)", [0.4, 3.6], [0, 16],
               [[0, '0'], [5, '5'], [10, '10'], [15, '15']], [[1, 'fit bought'], [2, 'AIC price'], [3, 'BIC price']], pl=46),
         dict(bars='b1', chart='cost', data=[[1, 6, '+6', 'green']], bw=70, ms=900)),
    step('AIC charges a flat 2 points per parameter: 3 × 2 = 6, exactly what they bought. Model A scores 4 + 100 = 104, Model B 10 + 94 = 104. A dead heat.',
         dict(bars='b2', chart='cost', data=[[2, 6, '6', 'blue']], bw=70, ms=900),
         dict(count='A', **{'from': 100, 'to': 104, 'dp': 0, 'pre': 'AIC ', 'ms': 900}),
         dict(count='B', **{'from': 94, 'to': 104, 'dp': 0, 'pre': 'AIC ', 'ms': 900})),
    step('BIC charges ln(n) per parameter. With n = 100 that is about 4.6, so the three extra parameters cost 13.8 points: more than double what they bought.',
         dict(bars='b3', chart='cost', data=[[3, BIC_PRICE, str(BIC_PRICE), 'red']], bw=70, ms=900),
         cnote('gapn', 'cost', [2.5, 11], 'costs > fit', 'red', 18)),
    step('BIC scores Model A at 109.21 and Model B at 117.03. BIC backs the simpler model by about 7.8 points. Same data, same fit, a different price for complexity.',
         dict(count='A', **{'from': 104, 'to': BIC_A, 'dp': 2, 'pre': 'BIC ', 'ms': 900}),
         dict(count='B', **{'from': 104, 'to': BIC_B, 'dp': 2, 'pre': 'BIC ', 'ms': 900}),
         dict(pulse='A')),
    step('Why they differ: the price per parameter. AIC\'s is 2, whatever the sample size.',
         chart('pen', PC, 'Price per extra parameter vs sample size n', [0, 1000], [0, 7.6],
               [[0, '0'], [2, '2'], [4, '4'], [6, '6']], [[0, '0'], [250, '250'], [500, '500'], [1000, '1,000']], pl=40, pr=18),
         series('aicp', 'pen', [[0, 2], [1000, 2]], 'blue', ms=900, label='AIC: 2, always', lat=[1000, 2], ldx=-4, ldy=-16, lanchor='end', lsize=18)),
    step('BIC\'s is ln(n). It equals AIC\'s at n ≈ 7.4, so with more than about 8 observations BIC is always the stricter judge.',
         series('bicp', 'pen', PEN, 'red', ms=1400, label='BIC: ln n', lat=[1000, 6.908], ldx=-4, ldy=-16, lanchor='end', lsize=18),
         dot('x74', 'pen', [7.39, 2], 'equal at n ≈ 7.4', 'amber', dx=14, dy=22, anchor='start')),
    step(f'And it keeps rising: 4.6 at n = 100, 6.9 at n = 1,000. With 1,000 observations and the same fits, BIC would back Model A by about {G1000} points. More data, less room for a useless parameter to hide.',
         dot('p100', 'pen', [100, 4.605], '4.6', 'red', dx=0, dy=-16),
         dot('p1000', 'pen', [1000, 6.908], '6.9', 'red', dx=-16, dy=12, anchor='end')),
    step('Trap one: compare only on identical data. An AR(5) model uses its first 5 days as lagged inputs, so refit both models on the same trimmed window before comparing scores.',
         dict(hide='cost'), dict(hide='b1'), dict(hide='b2'), dict(hide='b3'), dict(hide='gapn'),
         box('trap', 20, 160, 560, 116, 'compare on the same rows:\nrefit both on one trimmed window', 'amber', size=20)),
    step('Trap two: a low score only means best of this bunch. The best of five bad models is still bad. AIC and BIC are a cheap first filter; the winner still has to pass an out-of-sample test.',
         box('oos', 20, 296, 560, 116, 'best of the bunch, not proven:\nnext stop, an out-of-sample test', 'green', size=20)),
])


BOARD = dict(name='model_selection_aic_bic', lesson='model-selection-aic-bic', title='AIC and BIC: making every parameter pay rent', cfg=AIC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=9)
