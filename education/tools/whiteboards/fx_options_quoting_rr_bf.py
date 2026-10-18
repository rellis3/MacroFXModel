from ._wb import *

# ── FX options quoting: three quotes → a smile → strikes → the 2016 sterling risk reversal ──
# Numbers: clean example ATM 10, RR −2, BF 0.5 → 25Δ put 11.5, call 9.5 (lesson Section 02).
# Smile curve: Malz (1997) parabola σ(Δ) = ATM − 2·RR·(Δ − 0.5) + 16·BF·(Δ − 0.5)², Δ = call forward delta,
# plotted with x = 2 + (0.5 − Δ)/0.25 so the 25Δ put sits at x = 1, ATM at 2, the 25Δ call at 3.
# Strikes: EUR/USD 1M, 20 Jan 2009 (Reiswich & Wystup 2009): S 1.3088, r_USD 0.3525%, r_EUR 2.0113%, 31 days,
# spot delta → 25Δ put 22.61% at 1.2530, ATM DNS 21.62% at 1.3096, 25Δ call 22.11% at 1.3677 (recomputed).
# USD/JPY same day at 18.77%: 25Δ call strike 94.10 premium-adjusted vs 94.23 regular spot delta (recomputed).
# Brexit: GBP/USD 1M 25Δ RR −1.3 (25 May 2016), −5.4 (26 May), −7.9 (10 June); 24 June 1.4877 → 1.3622
# (Clark & Amen, Risks 2017). Spot near 1.4390 on 10 June.
SMILE = [[0.72, 12.099], [0.88, 11.747], [1.04, 11.421], [1.2, 11.12], [1.36, 10.845], [1.52, 10.595],
         [1.68, 10.371], [1.84, 10.173], [2.0, 10.0], [2.16, 9.853], [2.32, 9.731], [2.48, 9.635],
         [2.64, 9.565], [2.8, 9.52], [2.96, 9.501], [3.12, 9.507], [3.28, 9.539]]

FXQ = dict(w=600, h=860, intro='How an FX options screen turns three numbers into a smile, the smile into strikes, and how one of those numbers told the Brexit story in 2016. Press play, or step through.', steps=[
    step('An FX options screen shows no prices. For each expiry it shows three volatilities: the at-the-money vol, the 25-delta risk reversal and the 25-delta butterfly. Here: 10.0, −2.0 and 0.5.',
         box('atm', 10, 12, 180, 72, 'ATM vol', 'blue', sub='10.0%', size=20),
         box('rr', 210, 12, 180, 72, '25Δ risk reversal', 'purple', sub='−2.0', size=18),
         box('bf', 410, 12, 180, 72, '25Δ butterfly', 'amber', sub='0.5', size=18)),
    step('Start with the level. With no skew and no curvature, every delta would trade at the ATM vol: a flat line at 10%.',
         chart('sm', (10, 98, 580, 280), 'Implied vol by delta, one expiry', [0.6, 3.4], [8.5, 12.5],
               [[9, '9%'], [10, '10%'], [11, '11%'], [12, '12%']], [[1, '25Δ put'], [2, 'ATM'], [3, '25Δ call']], pl=52, pr=16),
         series('flat', 'sm', [[0.65, 10], [3.35, 10]], 'blue', dash=True, ms=700),
         dot('da', 'sm', [2, 10], 'ATM 10.0', 'blue', dy=24)),
    step('The butterfly lifts both wings by the same amount: 10 + 0.5 = 10.5% at the 25-delta put and the 25-delta call.',
         series('bfl', 'sm', [[0.65, 10.5], [3.35, 10.5]], 'amber', dash=True, ms=700),
         dot('b1', 'sm', [1, 10.5], '', 'amber'), dot('b3', 'sm', [3, 10.5], '', 'amber')),
    step('The risk reversal tilts them. It is call vol minus put vol, so split it in half: the put side gets plus 1, the call side minus 1. Put 11.5%, call 9.5%.',
         dict(dim='b1'), dict(dim='b3'),
         dot('p25', 'sm', [1, 11.5], 'put 11.5', 'red', dx=12, dy=-6, anchor='start'),
         dot('c25', 'sm', [3, 9.5], 'call 9.5', 'green', dx=-12, dy=22, anchor='end')),
    step('Three points, one smile. Malz\'s parabola in delta passes through all three: steep on the put side, nearly flat on the call side.',
         series('smile', 'sm', SMILE, 'purple', ms=1400),
         note('f', 300, 398, 'σ25 = ATM + BF ± ½·RR', 'purple', 20)),
    step('Read the tilt. A negative risk reversal means puts on the base currency cost more vol than calls. The market is paying up for protection against a fall: insurance, not a forecast.',
         dict(pulse='p25'),
         cnote('ins', 'sm', [1.15, 12.2], 'puts dearer: insurance', 'red', size=17, anchor='start')),
    step('Delta names a strike. With spot, two interest rates and the vol, the Garman–Kohlhagen formula turns each delta back into a strike. EUR/USD one month, 20 January 2009: 22.61% at 25-delta put is the 1.2530 strike, 21.62% ATM is 1.3096, 22.11% at 25-delta call is 1.3677.',
         box('k1', 10, 414, 180, 72, '25Δ put 22.61%', 'red', sub='K = 1.2530', size=18),
         box('k2', 210, 414, 180, 72, 'ATM 21.62%', 'blue', sub='K = 1.3096', size=18),
         box('k3', 410, 414, 180, 72, '25Δ call 22.11%', 'green', sub='K = 1.3677', size=18)),
    step('But which delta? USD/JPY premiums are paid in dollars, the base currency, so its deltas are premium-adjusted. The same 18.77% 25-delta call is the 94.10 strike, not the 94.23 a plain spot delta gives.',
         box('conv', 10, 500, 580, 62, 'USD/JPY 25Δ call at 18.77%: 94.10 premium-adjusted, 94.23 regular', 'amber', size=18)),
    step('The real thing. Sterling, 2016: the referendum was set for 23 June. On 25 May the one-month 25-delta risk reversal was about −1.3. On 26 May, −5.4.',
         chart('bx', (10, 578, 340, 270), 'GBP/USD 1M 25Δ risk reversal', [0.4, 3.6], [-9, 0.8],
               [[0, '0'], [-4, '−4'], [-8, '−8']], [[1, '25 May'], [2, '26 May'], [3, '10 Jun']], zero=True, pl=44, pr=12),
         dict(bars='rrb', chart='bx', data=[[1, -1.3, '−1.3', 'amber'], [2, -5.4, '−5.4', 'red']], bw=48, ms=1100)),
    step('Why overnight? A one-month option dealt on 25 May expired just before the result; one dealt on 26 May expired just after it. The tenor that first covers an event is the one that jumps.',
         box('roll', 370, 578, 220, 120, '26 May: the 1M\nexpiry first covers\nthe 23 June vote', 'purple', size=18)),
    step('By 10 June, with spot near 1.4390, it reached −7.9: about eight vols more for sterling puts than for calls.',
         dict(bars='rrb3', chart='bx', data=[[3, -7.9, '−7.9', 'red']], bw=48, ms=900)),
    step('Spot first rallied to 1.4877 as polls leaned Remain. Then Leave won. On 24 June GBP/USD closed at 1.3622, down about 8.4%. The risk reversal never forecast the vote; it priced how costly the wrong side would be.',
         box('out', 370, 714, 220, 132, 'GBP/USD, 24 June', 'red', sub='1.4877', size=19),
         dict(count='out', **{'from': 1.4877, 'to': 1.3622, 'dp': 4, 'ms': 1600})),
])


BOARD = dict(name='fx_options_quoting_rr_bf', lesson='fx-options-quoting-rr-bf',
             title='Three quotes, one smile, and the sterling risk reversal of 2016', cfg=FXQ,
             before='  <div class="tl-section-mark"><span>Section 06</span></div>',
             deck_after=5)
