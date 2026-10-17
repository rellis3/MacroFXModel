from ._wb import *

# ── CAPM: from "everyone holds the market" to the Security Market Line (institutional-capm) ──
# Numbers: the lesson's worked example (invented, illustrative annual returns, R_f = 2%).
# Market 8, -3, 15, 6, 9 (mean 7, variance 34). A = 1 + 0.5 m, B = 3 + 1.5 m, C = -2 + 0.8 m exactly,
# so Cov 17.0 / 51.0 / 27.2, beta 0.5 / 1.5 / 0.8; CAPM predicts 4.5 / 9.5 / 6.0, realized
# 4.5 / 13.5 / 3.6, alpha 0 / +4.0 / -2.4. All recomputed below.
M = [8, -3, 15, 6, 9]
ASSETS = dict(A=[5, -0.5, 8.5, 4, 5.5], B=[15, -1.5, 25.5, 12, 16.5], C=[4.4, -4.4, 10, 2.8, 5.2])
RF = 2.0
mean = lambda v: sum(v) / len(v)
MM = mean(M); VAR = sum((x - MM) ** 2 for x in M) / 5
STATS = {}
for k, v in ASSETS.items():
    cov = sum((x - MM) * (y - mean(v)) for x, y in zip(M, v)) / 5
    b = cov / VAR; pred = RF + b * (MM - RF)
    STATS[k] = dict(cov=round(cov, 2), beta=round(b, 2), pred=round(pred, 2), real=round(mean(v), 2), alpha=round(mean(v) - pred, 2))
assert (MM, VAR) == (7, 34) and STATS['B']['alpha'] == 4.0 and STATS['C']['alpha'] == -2.4
TONE = dict(A='green', B='blue', C='red')
f1 = lambda x: f'{x:.1f}'


def fit(k):
    a = mean(ASSETS[k]) - STATS[k]['beta'] * MM
    return [[-4, round(a + STATS[k]['beta'] * -4, 2)], [16, round(a + STATS[k]['beta'] * 16, 2)]]


CAPM = dict(w=600, h=760, intro='The lesson\'s toy universe: one market index, three assets, five years of invented returns and a 2% risk-free rate. Press play, or step through.', steps=[
    step('Start from Markowitz. If every investor shares the same beliefs, everyone computes the same best risky portfolio. The cautious mix it with the risk-free asset; the bold borrow to hold more of it.',
         icon('crowd', 'crowd', 255, 10, 0.9, 'blue', 'every investor,\nsame beliefs', lsize=17),
         icon('rf', 'bank', 30, 10, 0.85, 'amber', 'risk-free 2%', sym='$', lsize=17),
         icon('mkt', 'globe', 470, 10, 0.85, 'purple', 'one risky portfolio', lsize=17),
         arrow('crowd', 'rf', tone='amber'), arrow('crowd', 'mkt', tone='purple')),
    step('If everyone holds the same risky portfolio, every share outstanding must still be held by someone. The only portfolio that works is all risky assets at their market weights: the market portfolio.',
         note('mk', 468, 152, '= the market portfolio', 'purple', 17)),
    step('So the only risk that is paid for is exposure to the market. Measure it with a regression: each asset\'s return against the market\'s, over the five years. Here is Asset A.',
         chart('sc', (10, 172, 290, 262), 'Asset vs market return (%)', [-5, 17], [-6, 27], [[0, '0'], [10, '10'], [20, '20']], [[-3, '−3'], [7, '7'], [15, '15']], zero=True, pl=36),
         *[dot(f'a{i}', 'sc', [m, a], '', 'green', r=4.5) for i, (m, a) in enumerate(zip(M, ASSETS['A']))],
         series('fa', 'sc', fit('A'), 'green', ms=700, label='A', lat=[16, fit('A')[1][1]], ldx=-4, ldy=16, lanchor='end')),
    step(f'The slope is beta, the same OLS formula as the regression primer: covariance over variance. The market\'s variance is {VAR:.0f}; A\'s covariance with it is {STATS["A"]["cov"]:.1f}. Beta = {STATS["A"]["cov"]:.1f} ÷ {VAR:.0f} = {STATS["A"]["beta"]:.2f}.',
         box('beta', 10, 452, 290, 90, f'β = Cov ÷ Var\nA: {STATS["A"]["cov"]:.1f} ÷ {VAR:.0f} = {STATS["A"]["beta"]:.2f}', 'green', size=19)),
    step(f'Same for the others. B moves 1.5 times as much as the market: beta {STATS["B"]["beta"]:.2f}. C: beta {STATS["C"]["beta"]:.2f}.',
         *[dot(f'b{i}', 'sc', [m, a], '', 'blue', r=4.5) for i, (m, a) in enumerate(zip(M, ASSETS['B']))],
         series('fb', 'sc', fit('B'), 'blue', ms=700, label='B', lat=[10, 18], ldx=-8, ldy=-8, lanchor='end'),
         *[dot(f'c{i}', 'sc', [m, a], '', 'red', r=4.5) for i, (m, a) in enumerate(zip(M, ASSETS['C']))],
         series('fc', 'sc', fit('C'), 'red', ms=700, label='C', lat=[16, fit('C')[1][1]], ldx=-4, ldy=-16, lanchor='end')),
    step(f'CAPM turns beta into a required return: E[R] = 2% + β × (7% − 2%). A line starting at the risk-free rate with slope equal to the 5-point market premium: the Security Market Line.',
         chart('sml', (310, 172, 280, 262), 'Security Market Line', [0, 2], [0, 15], [[2, '2%'], [7, '7%'], [12, '12%']], [[0, 'β 0'], [1, '1'], [2, '2']], pl=40),
         series('line', 'sml', [[0, 2], [2, 12]], 'amber', ms=900, label='SML', lat=[2, 12], ldx=-4, ldy=-14, lanchor='end'),
         dot('rfd', 'sml', [0, 2], 'R_f', None, dx=8, dy=12, anchor='start')),
    step(f'The predictions: A {f1(STATS["A"]["pred"])}%, B {f1(STATS["B"]["pred"])}%, C {f1(STATS["C"]["pred"])}%. Every correctly priced asset should sit on this line, whatever its other risks.',
         *[dot(f'p{k}', 'sml', [STATS[k]['beta'], STATS[k]['pred']], '', TONE[k], r=4) for k in 'ABC']),
    step(f'Now the realized averages. A earned {f1(STATS["A"]["real"])}%: exactly on the line, alpha 0. B earned {f1(STATS["B"]["real"])}%: alpha +{f1(STATS["B"]["alpha"])}. C earned {f1(STATS["C"]["real"])}%: alpha {f1(STATS["C"]["alpha"]).replace("-", "−")}. The gap between realized and predicted is alpha.',
         dot('rA', 'sml', [STATS['A']['beta'], STATS['A']['real']], 'A: α 0', 'green', dx=-8, dy=-14, anchor='end'),
         series('gB', 'sml', [[STATS['B']['beta'], STATS['B']['pred']], [STATS['B']['beta'], STATS['B']['real']]], 'blue', dash=True, ms=500),
         dot('rB', 'sml', [STATS['B']['beta'], STATS['B']['real']], 'B: α +4.0', 'blue', dx=-8, dy=-2, anchor='end'),
         series('gC', 'sml', [[STATS['C']['beta'], STATS['C']['pred']], [STATS['C']['beta'], STATS['C']['real']]], 'red', dash=True, ms=500),
         dot('rC', 'sml', [STATS['C']['beta'], STATS['C']['real']], 'C: α −2.4', 'red', dx=8, dy=14, anchor='start')),
    step('A positive alpha is not proof of skill. It could be real mispricing, pay for a risk CAPM leaves out, or noise in five years of data. One regression cannot tell these apart.',
         box('amb', 310, 452, 280, 90, 'α +4.0 = skill?\nmissing factor? luck?', 'amber', size=19)),
    step('The real-world test: Fama and French (1992) found beta explains average stock returns far less well than CAPM says. Small companies and value stocks earned more than their betas predicted.',
         box('ff', 10, 562, 580, 76, 'Fama & French 1992: beta alone leaves a lot unexplained\n(small and value stocks beat their beta)', 'red', size=18)),
    step('Beta still earns its keep. It sets the index hedge on an equity book and splits a manager\'s return into market and alpha, even though as a full pricing model CAPM is only the baseline.',
         box('use', 10, 656, 580, 76, 'beta: the first hedge ratio and the first risk number\nCAPM: the baseline every factor model extends', 'green', size=18)),
])


BOARD = dict(name='institutional_capm', lesson='institutional-capm',
             title='CAPM: from one shared portfolio to the Security Market Line', cfg=CAPM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
