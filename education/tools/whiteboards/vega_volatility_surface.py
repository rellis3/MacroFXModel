from ._wb import *
from math import exp, log, pi, sqrt

# ── Vega & the volatility surface (vega-volatility-surface) ───────────────────
# The lesson's worked example: S = 100, sigma = 20%, r = 2%, nu = S phi(d1) sqrt(T).
# ATM: 11.42 (30d), 19.71 (90d), 39.10 (365d); 90-day by strike: 10.11 (90), 19.71 (100), 13.68 (110).
# Per vol point at 30 days: 0.1142. Term structure: an event day worth 3 ordinary days in a 5-day
# expiry is 3 of 7 day-equivalents ≈ 43%. The smile points are the lesson's own stylized chart
# (put wing ≈ 30%, minimum ≈ 19% at the money, call wing ≈ 25%), not market data.
# 1987: Dow −22.6%, S&P 500 ≈ −20% on 19 Oct; March 2020: VIX record close 82.69 on 16 March,
# term structure inverted for weeks.
def _vega(K, dte, S=100, r=0.02, s=0.2):
    T = dte / 365; d1 = (log(S / K) + (r + s * s / 2) * T) / (s * sqrt(T))
    return S * exp(-d1 * d1 / 2) / sqrt(2 * pi) * sqrt(T)
assert [round(_vega(100, d), 2) for d in (30, 90, 365)] == [11.42, 19.71, 39.10]
assert [round(_vega(k, 90), 2) for k in (90, 100, 110)] == [10.11, 19.71, 13.68]
assert round(3 / 7 * 100) == 43
SMILE = [[0.75, 29.8], [0.80, 27.7], [0.85, 25.2], [0.90, 23.1], [0.95, 21.1], [1.00, 19.1],
         [1.05, 19.7], [1.10, 20.6], [1.15, 21.9], [1.20, 23.4], [1.25, 25.2]]
PART1 = ['vol', 'opt', 'vol>opt', 'exp', 'eb', 'stk', 'sb', 'stk0', 'hedge']

VEGA = dict(w=600, h=830, intro='How much an option cares about the market\'s volatility forecast, why the market quotes a whole grid of forecasts, and the crash that shaped it. The lesson\'s own numbers.', steps=[
    step('A stock at 100 and an at-the-money call with 30 days left, priced at 20% implied volatility. Nudge that forecast up one point, the price unchanged, and the call gains about 11 cents a share. That sensitivity is vega.',
         box('vol', 20, 18, 210, 80, 'implied vol\n20% → 21%', 'amber', size=20),
         box('opt', 370, 18, 210, 80, 'ATM call, 30 days', 'blue', sub='+$0.0000', size=19),
         arrow('vol', 'opt', 'vega'),
         dict(count='opt', **{'from': 0, 'to': 0.1142, 'dp': 4, 'pre': '+$', 'ms': 1200})),
    step('Vega grows with the square root of time. At the money it is 11.42 per 1.00 of volatility with 30 days left, 19.71 with 90 and 39.10 with a year. It never melts away like gamma or theta.',
         chart('exp', (10, 120, 280, 250), 'Vega by expiry, at the money', [0.4, 3.6], [0, 47], [[0, '0'], [20, '20'], [40, '40']],
               [[1, '30d'], [2, '90d'], [3, '1 year']], pl=40),
         dict(bars='eb', chart='exp', data=[[1, 11.42, '11.42', 'blue'], [2, 19.71, '19.71', 'blue'], [3, 39.10, '39.10', 'blue']], bw=46, ms=1100)),
    step('Across strikes it is a bell. With 90 days left, vega is 19.71 at the money but only 10.11 at the 90 strike and 13.68 at 110. It is biggest where the outcome is still a coin flip.',
         chart('stk', (310, 120, 280, 250), 'Vega by strike, 90 days', [0.4, 3.6], [0, 47], [[0, '0'], [20, '20'], [40, '40']],
               [[1, '90'], [2, '100'], [3, '110']], pl=40),
         dict(bars='sb', chart='stk', data=[[1, 10.11, '10.11', 'purple'], [2, 19.71, '19.71', 'green'], [3, 13.68, '13.68', 'purple']], bw=46, ms=1100)),
    step('A call and a put at the same strike have exactly the same vega. The stock itself has none at all: buying or selling it cannot offset a vega risk by even a cent. Only another option can.',
         box('stk0', 10, 386, 280, 66, 'the stock: vega = 0', 'red', size=20),
         box('hedge', 310, 386, 280, 66, 'hedge vega with options', 'green', size=20)),
    step('Markets don\'t quote one volatility. Across strikes, equity-index options show a smirk: crash protection on the left trades at richer implied vol than the matching calls on the right. A single flat volatility would be the dashed line. (The lesson\'s stylized shape.)',
         chart('smile', (10, 468, 580, 232), 'Implied vol by strike ÷ spot (stylized)', [0.72, 1.28], [15, 32], [[20, '20%'], [30, '30%']],
               [[0.8, '0.8'], [0.9, '0.9'], [1.0, '1.0'], [1.1, '1.1'], [1.2, '1.2']], pl=52),
         series('flat', 'smile', [[0.73, 20], [1.27, 20]], None, dash=True, ms=500, label='one flat σ', lat=[1.27, 20], ldy=16, lanchor='end'),
         series('sm', 'smile', SMILE, 'amber', ms=1400),
         dot('pw', 'smile', [0.75, 29.8], 'put wing, rich', 'red', dx=14, dy=0, anchor='start')),
    step('Across expiries, event risk sets the shape. If a central-bank day counts like 3 ordinary days in a 5-day option, it carries 3 of 7 day-equivalents, about 43% of the expected variance. In a 60-day option the same day is diluted to a small fraction.',
         box('ev', 10, 716, 280, 100, 'event in a 5-day expiry', 'amber', sub='≈ 43% of the variance', size=19),
         box('ev60', 310, 716, 280, 100, 'same event, 60-day expiry', 'blue', sub='a small fraction', size=19)),
    step('Where the smirk came from. In 1987, portfolio insurance protected tens of billions of dollars of equity without buying a single put: a program sold index futures as the market fell, copying a put\'s delta. A copy with no vega.',
         *[dict(hide=i) for i in PART1],
         icon('ins', 'shield', 50, 14, 0.72, 'blue', 'portfolio insurance', lsize=16),
         box('rule', 180, 20, 400, 80, 'market falls → sell index futures\na copied put: delta only', 'blue', size=19)),
    step('Monday 19 October 1987: the Dow falls 22.6% and the S&P 500 about 20% in one session. Prices gap instead of sliding, futures trade at a deep discount, and the copied puts fall behind exactly when they are needed.',
         box('crash', 60, 140, 480, 84, 'Dow −22.6% in one day\nS&P 500 about −20%', 'red', size=21),
         dict(cross='rule')),
    step('Holders of real puts were protected twice: their puts gained from the fall and again from the jump in implied volatility. That second gain is vega, the part the copy never had.',
         box('real', 60, 250, 480, 84, 'real puts: gain on price AND on vol', 'green', size=20)),
    step('Index options had traded close to a flat smile before the crash. Since then, out-of-the-money puts have carried a persistent implied-vol premium. The smirk is the market still charging for the vega that portfolio insurance lacked.',
         dict(pulse='pw'), dict(pulse='sm'),
         cnote('since', 'smile', [1.0, 29.5], 'richer ever since 1987', 'red', 18, anchor='start')),
    step('The other axis has its own extreme. On 16 March 2020 the VIX closed at 82.69, its highest close on record, and near-dated implied vol stayed above longer-dated vol for weeks: the term structure turned upside down.',
         box('m20', 60, 360, 480, 84, 'March 2020: VIX closes at 82.69\nnear-dated vol above far, for weeks', 'amber', size=19)),
])


BOARD = dict(name='vega_volatility_surface', lesson='vega-volatility-surface', title='Vega and the volatility surface, drawn step by step', cfg=VEGA,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>Dollar vega exposure',
             deck_after=10)
