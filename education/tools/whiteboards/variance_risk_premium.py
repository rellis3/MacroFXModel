from ._wb import *

# ── The variance risk premium (variance-risk-premium) ─────────────────────────
# Real numbers: 431 non-overlapping 21-trading-day windows, Jan 1990 to late 2025, Cboe VIX close at the
# start vs the annualised close-to-close S&P 500 volatility over the next 21 trading days (computed for the
# lesson): average VIX 19.3, average realised 15.4, gap +3.9 points, seller paid in 364 of 431 (84.5%),
# 67 months the seller lost, 6 by more than 20 points; the five worst windows lost 17,316 variance points
# = 57% of all losses and 23% of all gains. The simulated path is the lesson's toy model (seed 7, base
# settings: implied 19, ordinary realised 14, 2% crash chance of 15%, size 1x): ends at 3.83x, worst
# drawdown 16.3% (peak month 30, trough month 37, with a -10.0% month at month 31).
HIST = [(-40.0, 0), (-37.5, 3), (-35.0, 0), (-32.5, 1), (-30.0, 0), (-27.5, 1), (-25.0, 0), (-22.5, 1), (-20.0, 0),
        (-17.5, 1), (-15.0, 2), (-12.5, 3), (-10.0, 6), (-7.5, 6), (-5.0, 13), (-2.5, 30), (0.0, 55), (2.5, 113),
        (5.0, 98), (7.5, 57), (10.0, 28), (12.5, 9), (15.0, 2), (17.5, 1), (20.0, 0), (22.5, 1)]
assert sum(c for _, c in HIST) == 431
HB = [[lo + 1.25, c, '', 'green' if lo >= 0 else 'red'] for lo, c in HIST if c]
PATH = [[0, 1], [4, 1.013], [8, 1.072], [12, 1.175], [16, 1.221], [20, 1.348], [24, 1.389], [28, 1.348], [32, 1.206],
        [36, 1.255], [40, 1.276], [44, 1.415], [48, 1.327], [52, 1.43], [56, 1.569], [60, 1.679], [64, 1.766],
        [68, 1.751], [72, 1.935], [76, 2.071], [80, 2.265], [84, 2.409], [88, 2.37], [92, 2.545], [96, 2.63],
        [100, 2.792], [104, 3.031], [108, 3.32], [112, 3.64], [116, 3.789], [120, 3.829]]

VRP = dict(w=600, h=830, intro='Selling an option is selling insurance. Real S&P 500 numbers from 1990 to 2025 show what the average pays, and what it hides. Press play, or step through.', steps=[
    step('Selling an option is selling insurance. A fund that wants protection pays a premium. A seller collects it and agrees to cover the move.',
         icon('buyer', 'person', 40, 14, 0.75, 'blue', 'protection buyer', lsize=17),
         icon('um', 'umbrella', 262, 14, 0.8, 'amber', 'the option', lsize=17),
         icon('seller', 'person', 480, 14, 0.75, 'green', 'option seller', lsize=17),
         chip('prem', 120, 120, 'premium', 'amber'),
         move('prem', 440, 120, 1400)),
    step('Over 431 one-month windows from 1990 to 2025, the VIX, the market\'s price for movement, averaged 19.3. The S&P 500 then actually moved at an annualised 15.4.',
         dict(hide='prem'),
         chart('avg', (20, 170, 270, 230), 'Volatility, % a year (average)', [0, 3], [0, 24],
               [[0, '0'], [10, '10'], [20, '20']], [[1, 'priced'], [2, 'realised']], pl=44, pr=10),
         dict(bars='ab', chart='avg', data=[[1, 19.3, '19.3', 'blue'], [2, 15.4, '15.4', 'green']], bw=56, ms=1300)),
    step('The gap is about 3.9 volatility points. That gap is the variance risk premium. In 364 of the 431 windows, 84%, the option seller came out ahead.',
         box('gap', 310, 190, 280, 96, 'gap ≈ 3.9 points\n= the premium', 'amber', size=19),
         box('paid', 310, 308, 280, 84, 'seller paid in\n364 of 431 months', 'green', size=18)),
    step('Here is every window, counted by how far implied beat realised. Green bars are months the seller was paid. The hump sits on the paying side.',
         dict(hide='gap'), dict(hide='paid'),
         chart('hist', (10, 410, 440, 230), 'Months, by implied minus realised (vol points)', [-42, 27], [0, 125],
               [[0, '0'], [50, '50'], [100, '100']], [[-40, '−40'], [-20, '−20'], [0, '0'], [20, '+20']], pl=44, pr=14),
         dict(bars='hb', chart='hist', data=HB, bw=11, ms=1700)),
    step('Now look left. In 67 months the seller lost, and in 6 of them by more than 20 volatility points. The worst were October 2008 and February and March 2020.',
         cnote('tail', 'hist', [-27, 58], 'the tail:\n−36 points', 'red', 17, anchor='middle')),
    step('Count it in variance points and the tail is heavy. The five worst windows lost 17,316 points, which is 57% of all the losses and 23% of all the gains.',
         box('w5', 462, 440, 128, 118, 'worst 5\nmonths:\n57% of all\nlosses', 'red', size=17)),
    step('Why does the premium exist? Investors and funds pay a dealer for protection against falls. Their demand is steady and price-insensitive.',
         dict(hide='buyer'), dict(hide='um'), dict(hide='seller'),
         icon('crowd', 'crowd', 30, 14, 0.75, 'blue', 'hedgers', lsize=17),
         icon('dealer', 'bank', 262, 14, 0.75, 'green', 'dealer', lsize=17),
         arrow('crowd', 'dealer', 'buy puts', 'amber')),
    step('The dealer cannot hedge a jump, and volatility tends to rise exactly when stocks fall. So the seller is paid for being short crash risk, in the states where everyone else is already hurting.',
         icon('fall', 'down', 480, 14, 0.75, 'red', 'stocks fall,\nvol jumps', lsize=17),
         arrow('dealer', 'fall', 'hurt here', 'red'),
         dict(pulse='fall')),
    step('A toy simulation of one seller who sells a one-month straddle every month for ten years, with a small chance of a crash each month (illustrative). It ends at 3.8 times the start.',
         chart('sim', (10, 650, 330, 170), 'One simulated life, capital (toy model)', [0, 120], [0.4, 4.2],
               [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], [[0, '0'], [60, '5 years'], [120, '10']], pl=40, pr=20),
         series('sp', 'sim', PATH, 'blue', ms=2000)),
    step('But live through it: from month 30 to month 37 it fell 16.3%, with a single month of −10.0%. The average is positive. The path is not smooth.',
         dot('pk', 'sim', [30, 1.437], 'peak', 'amber', dy=-14),
         dot('tr', 'sim', [37, 1.202], '−16.3%', 'red', dy=24)),
    step('This is not free money. The average pays for a tail, the gap shrinks after costs, and it is weak or absent in some markets. Size for the worst month you can survive, not the average month.',
         box('nofree', 360, 660, 230, 140, 'not free money:\nthe average pays\nfor a tail', 'red', size=18),
         dict(pulse='nofree')),
])


BOARD = dict(name='variance_risk_premium', lesson='variance-risk-premium', title='The variance risk premium: what the average pays and what it hides', cfg=VRP,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>\n  <h2>It actually happened: February to March 2020</h2>',
             deck_after=5)
