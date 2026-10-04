from ._wb import *

# ── The Fed's corridor: floor, ceiling, the mid-month lift, Sept 2019 ────────
# (fed-corridor-iorb-srf-discount-window). Rates are the lesson's illustrative
# settings: ON RRP 4.25%, IORB 4.40%, SRF / discount window 4.50%; SOFR ≈ 4.30% on an
# abundant-cash day (the corridor chart's default readout); 8bp over IORB = 4.48% on the
# 16th (the trading scenario); a tight night's private repo at 4.62% (worked example 1).
R1 = (10, 160, 580, 365)   # corridor chart (also reused for Sept 2019)
FUND, TSY, FED, DEAL = (25, 2), (230, 2), (350, 2), (515, 2)
CH = 128                   # chip row between the actors and the chart

SOFR_A = [[1, 4.30], [4, 4.31], [7, 4.29], [10, 4.30], [13, 4.31]]
SOFR_B = [[13, 4.31], [14, 4.35], [15, 4.43], [16, 4.48]]
SOFR_C = [[16, 4.48], [17, 4.41], [18, 4.33], [20, 4.30], [24, 4.31], [27, 4.29], [30, 4.30]]
# Sept 2019: only the 5.25% print on the 17th is the lesson's figure; the rest is approximate.
S19 = [[12, 2.2], [13, 2.2], [16, 2.4], [17, 5.25], [18, 2.6], [19, 2.3], [20, 2.2]]

C1_IDS = ['c1', 'onrrp', 'iorb', 'srf', 'lon', 'lio', 'lsr', 'lso', 'sa', 'sb', 'sc', 'd16', 'd62', 'save', 'ill']

COR = dict(w=600, h=540, intro='One month of overnight money, drawn step by step: who lends to whom, the Fed\'s floor and ceiling, the mid-month lift, and the day in 2019 when there was no ceiling. Rates use the lesson\'s illustrative settings.', steps=[
    step('Every night, money market funds lend cash to securities dealers, who hand over Treasuries as collateral and buy them back tomorrow. That is repo. SOFR is its measured price, built from the actual trades.',
         icon('fund', 'piggy', *FUND, 0.6, 'green', 'Money funds\nlend cash', sym='$', lsize=16),
         icon('deal', 'person', *DEAL, 0.6, 'blue', 'Dealers\nborrow cash', lsize=16),
         chip('cash', 130, 22, 'cash', 'green'),
         chip('bond', 445, 58, 'Treasuries', 'blue')),
    step('Cash goes one way and the Treasuries go the other, for one night. Dealers need that cash to keep holding their big bond inventories.',
         move('cash', 450, 22, 1200), move('bond', 165, 58, 1200)),
    step('Now the Fed builds a floor. A money fund can always lend to the Fed itself at the ON RRP rate, 4.25% in the lesson\'s illustrative settings. So no fund lends to a dealer for less.',
         icon('fed', 'bank', *FED, 0.6, 'amber', 'The Fed', sym='$', lsize=16),
         chart('c1', R1, 'Overnight rates, % (one illustrative month)', [1, 30], [4.15, 4.70],
               [[4.25, '4.25'], [4.40, '4.40'], [4.50, '4.50']], [[1, '1st'], [15, '15th'], [30, '30th']], pl=56, pr=28),
         series('onrrp', 'c1', [[1, 4.25], [30, 4.25]], 'blue', dash=True),
         cnote('lon', 'c1', [30, 4.25], 'ON RRP: floor for money funds', 'blue', 17, anchor='end', dy=16)),
    step('Banks earn IORB on the reserves they keep at the Fed, 4.40% here. A bank lends into repo only if it pays more than that, after the cost of using its balance sheet.',
         series('iorb', 'c1', [[1, 4.40], [30, 4.40]], 'green', dash=True),
         cnote('lio', 'c1', [30, 4.40], 'IORB: floor for banks', 'green', 17, anchor='end', dy=16)),
    step('The ceiling: since July 2021 the Standing Repo Facility lends cash against Treasuries every day at the top of the range, 4.50% here. Nobody with access should pay much more than that.',
         series('srf', 'c1', [[1, 4.50], [30, 4.50]], 'red'),
         cnote('lsr', 'c1', [30, 4.50], 'SRF: the ceiling', 'red', 17, anchor='end', dy=-15)),
    step('On an ordinary day, with plenty of cash around, SOFR sits low in the corridor, around 4.30%, a few basis points above the money funds\' floor. (The path is illustrative.)',
         series('sa', 'c1', SOFR_A, 'amber', ms=1200),
         cnote('lso', 'c1', [4, 4.31], 'SOFR', 'amber', 18, dy=-16)),
    step('Mid-month, taxes fall due. Investors pull cash out of money funds to pay, and the payments land in the Treasury\'s account at the Fed. That cash has left the repo market.',
         icon('tsy', 'govt', *TSY, 0.6, None, 'Treasury\'s\naccount', lsize=16),
         chip('tax', 60, CH, 'taxes', 'red'),
         move('tax', 260, CH, 1300),
         dict(pulse='fund')),
    step('The funds lend less that night, but the dealers still have the same bonds to fund, so they bid up for the scarcer cash. SOFR lifts toward the ceiling: on the 16th it prints 4.48%, 8bp over IORB.',
         series('sb', 'c1', SOFR_B, 'amber', ms=900),
         dot('d16', 'c1', [16, 4.48], '16th: 4.48%', 'amber', dy=-34)),
    step('On a tight night a private lender quotes 4.62%. A dealer with SRF access borrows its $1bn from the Fed at 4.50% instead and saves 12bp, $3,333.33 for one night. That is why the rate gets capped near the ceiling.',
         dot('d62', 'c1', [16, 4.62], 'private repo 4.62%', 'red', dx=-10, dy=0, anchor='end'),
         chip('srfl', 380, CH, '$1bn at 4.50%', 'amber'),
         move('srfl', 515, CH, 1200),
         cnote('save', 'c1', [17, 4.62], '−12bp = $3,333.33 saved', 'amber', 17, anchor='start', dx=10)),
    step('A day or two later the cash flows back and SOFR settles. Every link was someone meeting a known bill on a known date: calendar, not crisis.',
         series('sc', 'c1', SOFR_C, 'amber', ms=1300),
         cnote('ill', 'c1', [8, 4.19], 'calendar, not crisis', 'green', 18)),
    step('September 2019 had a day like that, with no standing ceiling. On the 16th, quarterly corporate taxes and a large Treasury settlement drained cash at once, after reserves had been shrinking for some time.',
         *[dict(hide=i) for i in C1_IDS], dict(hide='srfl'), dict(pulse='tax'),
         chart('c2', R1, 'September 2019: SOFR, % (path approx.)', [12, 20], [1.5, 5.8],
               [[2.0, '2.00'], [3.0, '3.00'], [4.0, '4.00'], [5.0, '5.00']], [[12, '12th'], [16, '16th'], [17, '17th'], [20, '20th']], pl=56, pr=28),
         dict(gap='band', chart='c2', top=[[12, 2.25], [20, 2.25]], bot=[[12, 2.0], [20, 2.0]], tone='green', op=0.35),
         cnote('bl', 'c2', [19.6, 2.12], 'target range 2.00–2.25%', 'green', 17, anchor='end', dy=26),
         cnote('noc', 'c2', [14, 4.6], 'no ceiling on the board', 'red', 19)),
    step('With nothing to cap it, SOFR printed 5.25% on 17 September against a 2.00–2.25% target range.',
         series('s19', 'c2', S19, 'red', ms=1500),
         dot('d17', 'c2', [17, 5.25], '5.25% on the 17th', 'red', dx=12, dy=4, anchor='start')),
    step('The New York Fed restarted overnight repo operations that day, the first in about a decade, and in October began buying Treasury bills to rebuild reserves. The lesson it drew: a ceiling improvised after the spike comes too late. The SRF, permanent since July 2021, is the standing one.',
         chip('ops', 380, CH, 'repo operations', 'amber'),
         move('ops', 505, CH, 1200),
         cnote('fin', 'c2', [14, 3.7], 'today: the SRF caps it\nnear the top of the range', 'amber', 18)),
])


BOARD = dict(name='corridor', lesson='fed-corridor-iorb-srf-discount-window',
             title='The Fed\'s corridor, drawn step by step', cfg=COR,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>\n  <h2>It actually happened: two tests',
             deck_after=7)
