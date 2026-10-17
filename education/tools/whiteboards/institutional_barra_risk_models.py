from ._wb import *

# ── Barra-style risk models (institutional-barra-risk-models) ─────────────────
# The lesson's toy two-factor model: F = [[0.04, 0.01], [0.01, 0.02]] (momentum, value).
# Position A: x = (1.00, 0.50), specific variance 0.0100 -> 0.0550 + 0.0100 = 0.0650, 84.6% factor.
# Position B: x = (0.50, -0.30), specific variance 0.0200 -> 0.0088 + 0.0200 = 0.0288, 30.6% factor.
# Every term below is computed here from F and x.
F = [[0.04, 0.01], [0.01, 0.02]]

def _terms(x, spec):
    mom, cross, val = x[0] ** 2 * F[0][0], 2 * x[0] * x[1] * F[0][1], x[1] ** 2 * F[1][1]
    fac = mom + cross + val
    return [round(v, 4) for v in (mom, cross, val, spec)], round(fac, 4), round(fac + spec, 4), fac / (fac + spec)

TA, FA, TOTA, SHA = _terms((1.0, 0.5), 0.01)
TB, FB, TOTB, SHB = _terms((0.5, -0.3), 0.02)
assert (FA, TOTA, round(100 * SHA, 1)) == (0.055, 0.065, 84.6)
assert (FB, TOTB, round(100 * SHB, 1)) == (0.0088, 0.0288, 30.6)

LAB = ['mom', 'cross', 'value', 'spec']
TONE = ['blue', 'purple', 'blue', 'red']

def _bars(id, ch, t, upto):
    return dict(bars=id, chart=ch, data=[[i + 1, t[i], f'{t[i]:.4f}'.replace('-', '−'), TONE[i]] for i in upto], bw=34, ms=900)

def _chart(id, x, title):
    return chart(id, (x, 290, 285, 220), title, [0.4, 4.6], [-0.014, 0.046],
                 [[0, '0'], [0.02, '.02'], [0.04, '.04']], [[i + 1, LAB[i]] for i in range(4)], zero=True, pl=40, pr=6)

BARRA = dict(w=600, h=640, intro="How a commercial risk model is put together, then the lesson's two-factor toy model run on two positions. Press play, or step through.", steps=[
    step('Start of the day: every stock already has known scores. Its size, its momentum, its value, and a 0 or 1 for each industry it belongs to. These are the exposures, X.',
         box('X', 15, 20, 160, 84, 'exposures X', 'blue', sub='known in advance', size=18)),
    step('End of the day: one regression across all the stocks asks how much each score paid today. Those slopes are the factor returns, f. It is the Fama-MacBeth second stage, run with dozens of factors.',
         box('f', 220, 20, 160, 84, 'factor returns f', 'purple', sub='daily regression', size=18),
         arrow('X', 'f')),
    step('Whatever the factors do not explain is each stock\'s specific return, u. The model assumes it does not correlate across stocks.',
         box('u', 425, 20, 160, 84, 'specific u', 'red', sub='left over', size=18),
         arrow('f', 'u')),
    step('Collect the factor returns day after day and you get how the factors move together: the factor covariance F. In the lesson\'s toy model, momentum variance 0.04, value 0.02, and covariance 0.01.',
         box('F', 20, 150, 270, 84, 'factor covariance F\n0.04 · 0.01 · 0.02', 'purple', size=19),
         arrow('f', 'F')),
    step('Each stock\'s leftover variance goes on a diagonal, D. Because specific returns are uncorrelated, nothing sits off the diagonal.',
         box('D', 310, 150, 270, 84, 'specific variances D\ndiagonal only', 'red', size=19),
         arrow('u', 'D')),
    step('That is what the vendor sells: X, F and D, refreshed on a schedule, with F cleaned up so an optimiser can invert it. Risk = X F Xᵀ + D.',
         note('sig', 300, 270, 'risk = X F Xᵀ + D', 'green', 22)),
    step('Now a position: 1.00 unit of momentum exposure and 0.50 of value. Its momentum term is 1.00² × 0.04 = 0.0400.',
         _chart('ca', 10, 'A: mom 1.00, value 0.50'),
         _bars('ba1', 'ca', TA, [0])),
    step('The cross term is 2 × 1.00 × 0.50 × 0.01 = 0.0100, and the value term is 0.50² × 0.02 = 0.0050. Factor variance: 0.0550.',
         _bars('ba2', 'ca', TA, [1, 2])),
    step('Add specific variance of 0.0100. Total 0.0650, of which 84.6% is factor risk. This position is mostly a factor bet.',
         _bars('ba3', 'ca', TA, [3]),
         box('ra', 10, 524, 285, 64, 'total 0.0650\n84.6% factor', 'blue', size=19)),
    step('A second position: 0.50 momentum, −0.30 value, specific variance 0.0200. The exposures partly offset, so the cross term is negative. Factor variance is only 0.0088 of a 0.0288 total: 30.6% factor.',
         _chart('cb', 305, 'B: mom 0.50, value −0.30'),
         _bars('bb', 'cb', TB, [0, 1, 2, 3]),
         box('rb', 305, 524, 285, 64, 'total 0.0288\n30.6% factor', 'red', size=19)),
    step('That split is the daily risk report. Use it to see which bets you are really running and to set limits in the optimiser. Never as alpha: everyone with the subscription sees the same scores.',
         note('end', 300, 618, 'a risk model, not an alpha model', 'amber', 20),
         dict(pulse='ra'), dict(pulse='rb')),
])


BOARD = dict(name='institutional_barra_risk_models', lesson='institutional-barra-risk-models',
             title='A factor risk model, built and used', cfg=BARRA,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>What makes commercial models genuinely different',
             deck_after=4)
