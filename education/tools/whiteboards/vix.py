from ._wb import *
from math import sqrt

# ── VIX as an expected-move band (vix-uncertainty-not-fear) ──────────────────
# Worked example from the lesson: VIX 20, S&P 500 at 5,000. x = trading days ahead
# (1 day = 1/252 yr, 1 week = 1/52 yr ≈ 4.85 days, 1 month = 1/12 yr = 21 days).
# 1σ over t trading days = 5000 × VIX/100 × √(t/252):
#   VIX 20 → day ±63, week ±139, month ±289 (2σ ±577); VIX 40 → month ±577, day ±2.5%.
S0, WK = 5000, 252 / 52
def sig(vix, t, k=1): return k * S0 * vix / 100 * sqrt(t / 252)
TS = [0, 0.25, 0.6, 1, 2, 3, WK, 7, 9.5, 12, 15, 18, 21]
def edge(vix, sign, k=1): return [[t, round(S0 + sign * sig(vix, t, k), 1)] for t in TS]
CH = (10, 150, 580, 420)
VIX = dict(w=600, h=630, intro='The VIX turned into what it really is: a band around price that says how far the S&P 500 might move — and nothing about which way. Press play, or step through.', steps=[
    step('The VIX is built from a whole strip of out-of-the-money S&P 500 options. Puts below the forward pay off on a big fall; calls above it pay off on a big rise. Both go in.',
         icon('puts', 'umbrella', 40, 8, 0.7, 'red', 'OTM puts\npay on a big fall', lsize=16),
         icon('calls', 'rocket', 490, 8, 0.7, 'green', 'OTM calls\npay on a big rise', lsize=16)),
    step("Their prices are weighted and summed into the market's expected variance for the next 30 days. Square root, times 100: that's the VIX. Say it reads 20.",
         box('vix', 210, 18, 180, 80, 'VIX', 'purple', sub='20', size=24),
         icon('c1', 'cash', 70, 22, 0.4, 'red', sym='$'), icon('c2', 'cash', 494, 22, 0.4, 'green', sym='$'),
         arrow('puts', 'vix', tone='red', id='ap'), arrow('calls', 'vix', tone='green', id='ac'),
         move('c1', 222, 36, 1100), move('c2', 338, 36, 1100), dict(hide='c1'), dict(hide='c2')),
    step('Now put it on a chart. The S&P 500 is at 5,000 today; the future is blank.',
         chart('sp', CH, 'S&P 500 and its expected 1σ band', [-10, 22.5], [4250, 5750],
               [[4500, '4,500'], [5000, '5,000'], [5500, '5,500']], [[-8, 'past'], [0, 'today'], [WK, '1 wk'], [21, '1 mo']], pl=56, pt=38),
         series('past', 'sp', [[-10, 4930], [-8, 4962], [-6, 4948], [-4, 4986], [-2, 4972], [0, 5000]], 'blue', ms=900),
         dot('now', 'sp', [0, 5000], '5,000', 'blue', dx=-8, dy=-18, anchor='end')),
    step('The VIX is an annual figure. For one month, divide by √12: 20 ÷ √12 ≈ 5.77%. On 5,000 that is about ±289 points — one standard deviation either way.',
         note('conv', 300, 126, '20 ÷ √12 ≈ 5.77%  →  ±289 points', 'purple', 18),
         dict(gap='b20', chart='sp', top=edge(20, 1), bot=edge(20, -1), tone='purple', op=0.2),
         series('u20', 'sp', edge(20, 1), 'purple', ms=1200), series('d20', 'sp', edge(20, -1), 'purple', ms=1200),
         dot('m1', 'sp', [21, S0 + sig(20, 21)], '+289', 'purple', dx=-10, dy=-16, anchor='end'),
         dot('m2', 'sp', [21, S0 - sig(20, 21)], '−289', 'purple', dx=-10, dy=16, anchor='end')),
    step('Shorter horizons use the same square-root-of-time rule. One week: 20 ÷ √52 ≈ 2.77%, about ±139 points. One day: 20 ÷ √252 ≈ 1.26%, about ±63 — the trader\'s "divide by 16".',
         dot('w1', 'sp', [WK, S0 + sig(20, WK)], '±139', 'purple', dx=0, dy=-18),
         dot('d1', 'sp', [1, S0 + sig(20, 1)], '±63', 'purple', dx=-2, dy=-18)),
    step("Look at the middle. The band is centred on today's 5,000. Nothing in it leans up or down.",
         series('mid', 'sp', [[0, 5000], [21, 5000]], 'chalk', dash=True, ms=700),
         cnote('midl', 'sp', [12, 5000], 'centre: no direction', 'chalk', 17, dy=-16)),
    step('If moves were normal, roughly two months in three would land inside ±289 — and about one in twenty outside twice that, ±577 (±11.5%).',
         dict(gap='b2', chart='sp', top=edge(20, 1, 2), bot=edge(20, -1, 2), tone='purple', op=0.08),
         series('u2', 'sp', edge(20, 1, 2), 'purple', dash=True, ms=700), series('l2', 'sp', edge(20, -1, 2), 'purple', dash=True, ms=700),
         dot('m3', 'sp', [21, S0 + sig(20, 21, 2)], '2σ +577', 'purple', dx=-10, dy=-16, anchor='end')),
    step("Now double the VIX to 40. Every number doubles: ±11.5% a month, about ±577 points; ±2.5% a day. The new one-sigma band is as wide as the old two-sigma one.",
         dict(count='vix', **{'from': 20, 'to': 40, 'dp': 0, 'ms': 1200}),
         dict(hide='conv'), note('conv2', 300, 126, '40 ÷ √12 ≈ 11.5%  →  ±577 points', 'red', 18),
         dict(hide='b2'), dict(hide='u2'), dict(hide='l2'), dict(hide='m3'),
         dict(dim='b20'), dict(dim='u20'), dict(dim='d20'), dict(hide='m1'), dict(hide='m2'), dict(hide='w1'), dict(hide='d1'),
         dict(gap='b40', chart='sp', top=edge(40, 1), bot=edge(40, -1), tone='red', op=0.16),
         series('u40', 'sp', edge(40, 1), 'red', ms=1200), series('d40', 'sp', edge(40, -1), 'red', ms=1200),
         dot('m4', 'sp', [21, S0 + sig(40, 21)], '+577', 'red', dx=-10, dy=-16, anchor='end'),
         dot('m5', 'sp', [21, S0 - sig(40, 21)], '−577', 'red', dx=-10, dy=16, anchor='end')),
    step('And the centre? Still 5,000. The market is paying for twice the size of move. It has said nothing new about direction.',
         dict(pulse='mid'), dict(pulse='now')),
    step('So why does it usually jump when stocks fall? Because people pay up for crash insurance: S&P puts are almost always priced at higher implied vol than equally distant calls. But calls are in the sum too — a rush into upside can lift the VIX in a rally.',
         dict(pulse='puts'), dict(pulse='calls')),
    step('One caution: the band is a guide, not a cap. About one month in three should land outside ±1σ even on a bell curve, real returns have fatter tails, and the VIX carries an insurance premium.',
         cnote('tail', 'sp', [-5, 5560], 'about 1 month in 3\nlands outside ±1σ', 'amber', 17)),
    step('The VIX is a forecast of wind speed, not wind direction: it prices how big the next month\'s moves may be. Size, never sign.',
         note('end', 300, 604, 'The VIX prices the SIZE of the band — never which way', 'green', 21)),
])


BOARD = dict(name='vix', lesson='vix-uncertainty-not-fear', title='The VIX as a band around price, drawn step by step', cfg=VIX,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=5)
