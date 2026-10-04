from ._wb import *

# ── 1. Yen carry unwind (domino-chain-cross-asset) ────────────────────────────
TOP = 150  # icon strip above the charts
A, B, C, D = (10, 40 + TOP, 262, 175), (328, 40 + TOP, 262, 175), (10, 300 + TOP, 262, 175), (328, 300 + TOP, 262, 175)
# Policy rates, 2024 (months: Jan = 0). Fed upper bound 5.50% all year until the 18 Sept cut;
# BoJ: -0.1% until 19 Mar, 0-0.1% (plotted 0.05) until 31 Jul, then 0.25%.
US_ACT = [[0, 5.5], [7, 5.5]]
JP_ACT = [[0, -0.1], [2.6, -0.1], [2.6, 0.05], [7, 0.05], [7, 0.25]]
US_EXP = [[7, 5.5], [11.5, 4.5]]          # about 1 point of US cuts priced for the rest of 2024
JP_EXP = [[7, 0.25], [11.5, 0.4]]
YEN = dict(w=600, h=730, intro='August 2024, drawn as it happened: how the yen carry trade worked, then a narrowing rate gap, a soaring yen, a stock crash and a volatility spike. Press play, or step through.', steps=[
    step('Meet the cast: the Bank of Japan, a carry trader, and US assets paying around 5%.',
         icon('boj', 'bank', 20, 14, 0.9, 'amber', 'Bank of Japan\nrates ≈ 0%', sym='¥'),
         icon('trader', 'person', 255, 14, 0.9, None, 'carry trader'),
         icon('usa', 'up', 490, 14, 0.9, 'blue', 'US assets\n≈ 5%')),
    step('Step one: borrow yen, at almost no cost.',
         icon('yen1', 'cash', 112, 0, 0.6, 'amber', sym='¥'),
         move('yen1', 192, 0, 1200),
         arrow('boj', 'trader', 'borrow ¥', 'amber', id='a1', size=17)),
    step('Step two: swap the yen into dollars and buy US assets earning around 5%. The trader pockets the difference. That is the carry trade, and it paid for years.',
         dict(hide='yen1'),
         icon('usd1', 'cash', 345, 0, 0.6, 'green', sym='$'),
         move('usd1', 425, 0, 1200),
         arrow('trader', 'usa', 'buy $ assets', 'green', id='a2', size=17)),
    step('Start with what powered the trade. All year the Fed held rates at 5.25–5.50%; Japan only left negative rates in March, to 0–0.1%.',
         chart('rates', A, 'Policy rates, 2024', [0, 11.5], [-1.4, 7], [[0, '0%'], [5, '5%']], [[0, 'Jan'], [3, 'Apr'], [7, 'Aug'], [11, 'Dec']], pt=38),
         series('us', 'rates', US_ACT, 'blue', label='US', lat=[1, 5.5], ldy=-13),
         series('jp', 'rates', JP_ACT, 'amber', label='Japan', lat=[1.3, -0.1], ldy=15, ms=1300)),
    step('That gap of more than 5 percentage points is the carry trade: borrow yen almost free, put the money into dollars and higher-yielding assets.',
         dict(gap='g1', chart='rates', top=US_ACT, bot=[[0, -0.1], [2.6, -0.1], [2.6, 0.05], [7, 0.05]], tone='red', op=0.2),
         cnote('gl', 'rates', [3.5, 2.7], 'the gap\n= the trade', 'red', 18)),
    step('31 July: the Bank of Japan raises its rate to 0.25%. Then on 2 August a weak US jobs report has markets pricing about a percentage point of US cuts by year-end.',
         dot('boj', 'rates', [7, 0.25], 'BoJ hike', 'amber', dx=8, dy=13, anchor='start'),
         series('usx', 'rates', US_EXP, 'blue', dash=True, ms=900),
         series('jpx', 'rates', JP_EXP, 'amber', dash=True, ms=600),
         dot('jobs', 'rates', [7, 5.5], 'weak jobs', 'blue', dy=-14)),
    step('Now the gap is expected to narrow from both ends at once. Watch the shaded band pinch.',
         dict(gap='g2', chart='rates', top=US_EXP, bot=JP_EXP, tone='red', op=0.34),
         cnote('pinch', 'rates', [9.3, 2.4], 'narrowing', 'red', 18), dict(pulse='g2')),
    step('The yen surges. USD/JPY, near 162 in early July, is down to about 142 by 5 August — a huge move for a major currency.',
         chart('fx', B, 'USD/JPY (approx.)', [0, 35], [139, 168], [[140, '140'], [150, '150'], [160, '160']], [[0, '3 Jul'], [17, 'mid-Jul'], [33, '5 Aug']]),
         arrow('rates', 'fx'),
         series('jpy', 'fx', [[0, 161.9], [8, 159], [14, 156], [22, 152.5], [28, 150], [30, 146.5], [33, 141.7]], 'red', ms=1600),
         dot('j0', 'fx', [0, 161.9], '161.9', 'red', dx=8, dy=17, anchor='start'),
         dot('j1', 'fx', [33, 141.7], '141.7', 'red', dx=-10, dy=10, anchor='end')),
    step('Everyone who borrowed yen now owes more than they borrowed. Closing those trades means buying yen back — which pushes the yen up again. The chain has become a loop.',
         cnote('loop', 'fx', [33, 165], 'unwinding = buying yen\n→ yen up again ↺', 'red', 17, anchor='end'),
         dict(pulse='trader'), move('usd1', 345, 0, 1000), dict(hide='usd1'),
         icon('yen2', 'cash', 192, 0, 0.6, 'red', sym='¥'), move('yen2', 112, 0, 1000)),
    step('To raise cash they sell what they can sell fast. The Nikkei 225 falls about 6% on Friday 2 August, then about 12% on Monday 5 August — its worst day since 1987.',
         chart('nik', C, 'Nikkei 225, daily move', [0, 4], [-21, 14], [[-10, '−10%'], [0, '0'], [10, '+10%']], [[1, '2 Aug'], [2, '5 Aug'], [3, '6 Aug']], zero=True, pl=50, pt=38),
         arrow('fx', 'nik', 'sell stocks'),
         dict(bars='nb', chart='nik', data=[[1, -5.8, '−5.8%'], [2, -12.4, '−12.4%']], bw=34, ms=1100)),
    step("Everyone reaches for protection at once. The VIX, Wall Street's volatility gauge, closes at 16 on 31 July and 23 on 2 August, then trades as high as about 65 on the morning of 5 August.",
         chart('vix', D, 'VIX', [0, 3.4], [0, 75], [[20, '20'], [40, '40'], [60, '60']], [[0, '31 Jul'], [1, '2 Aug'], [2, '5 Aug'], [3, '6 Aug']]),
         arrow('nik', 'vix'),
         series('vx', 'vix', [[0, 16.4], [1, 23.4], [2, 38.6]], 'purple', ms=900),
         series('vrange', 'vix', [[2, 38.6], [2, 65.7]], 'purple', dash=True, ms=500),
         dot('vhi', 'vix', [2, 65.7], 'intraday ≈65', 'purple', dx=-10, dy=0, anchor='end'),
         dot('vcl', 'vix', [2, 38.6], 'close ≈39', 'purple', dx=-10, dy=-16, anchor='end')),
    step('Funds that size positions by recent volatility must cut exposure when it jumps: more selling, a second loop.',
         arrow('vix', 'nik', 'vol-target funds sell', 'purple', bend=-55, id='loop2', size=17)),
    step('Then the forced sellers ran out. On 6 August the Nikkei jumped about 10% and the VIX fell back. Leverage turns a chain into a loop — but only until the forced selling is done.',
         dict(bars='nb2', chart='nik', data=[[3, 10.2, '+10.2%']], bw=34, ms=900),
         series('vx2', 'vix', [[2, 38.6], [3, 27.7]], 'green', ms=600),
         note('end', 300, 710, 'Forced sellers done → much of it reversed within days', 'green', 21)),
])


BOARD = dict(name='yen', lesson='domino-chain-cross-asset', title='The yen carry unwind, drawn step by step', cfg=YEN,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧮</div>\n    <div class="tl-box-label">Worked example</div>\n    <h3>One hot print, priced through four assets</h3>',
             deck_after=8)
