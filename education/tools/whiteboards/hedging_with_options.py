from ._wb import *
from math import erf, exp, log, sqrt

# ── Hedging with options (hedging-with-options) ───────────────────────────────────────────────
# Equity: S0 = 100, six months, r = 4%, flat 20% volatility, no dividends. Black-Scholes premiums:
# P(95) = 2.6786, P(85) = 0.5985, C(110) = 2.7564, so the put spread costs 2.0801 and the collar nets -0.0778.
# Payoffs at expiry S: put = S-100+max(95-S,0)-P ; spread = put - max(85-S,0) + P(85) ;
# collar = put - max(S-110,0) + C(110). Floors/caps: put -7.68, spread -22.08 at S=70, collar -4.92 and +10.08.
# Sizing: N = 1.2 x 2,000,000 / (5,000 x 100) = 4.8 -> 5; 4,750 put at 20%, six months = 133.93 points.
# Cost of carry: annual cost of a rolled 95 put if nothing moves = premium x 12/m: 6.22, 6.40, 5.36, 4.03 (%).
# FX (hypothetical): EURUSD 1.0800, rd 4.5%, rf 3.0%, 6 months, flat 8% vol, Garman-Kohlhagen. Forward 1.0881,
# 1.10 call 0.01878, collar put 1.0769, seagull (long 1.10 call, short 1.14 call) put 1.0576.
# March 2020 (illustrative, flat vol, r=0, 3 months, 90% strike): 15% -> 0.26% of spot, 60% -> 7.01%.
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def _bs(S, K, T, r, sg, q, cp):
    d1 = (log(S / K) + (r - q + 0.5 * sg * sg) * T) / (sg * sqrt(T)); d2 = d1 - sg * sqrt(T)
    if cp == 'c': return S * exp(-q * T) * _N(d1) - K * exp(-r * T) * _N(d2)
    return K * exp(-r * T) * _N(-d2) - S * exp(-q * T) * _N(-d1)

P95 = _bs(100, 95, .5, .04, .2, 0, 'p'); P85 = _bs(100, 85, .5, .04, .2, 0, 'p'); C110 = _bs(100, 110, .5, .04, .2, 0, 'c')
def put(s): return s - 100 + max(95 - s, 0) - P95
def spr(s): return put(s) - max(85 - s, 0) + P85
def col(s): return put(s) - max(s - 110, 0) + C110
def pts(fn, xs): return [[x, round(fn(x), 2)] for x in xs]
LO, HI = 66, 134
UN = [[LO, LO - 100], [HI, HI - 100]]
PUT = pts(put, [LO, 95, HI]); SPR = pts(spr, [LO, 85, 95, HI]); COL = pts(col, [LO, 95, 110, HI])

PC = (10, 10, 580, 330)
ROLL = [round(_bs(100, 95, m / 12, .04, .2, 0, 'p') * 12 / m, 2) for m in (1, 3, 6, 12)]

FS, FRD, FRF, FSG, FT = 1.08, .045, .03, .08, .5
def _c(K): return _bs(FS, K, FT, FRD, FSG, FRF, 'c')
def _p(K): return _bs(FS, K, FT, FRD, FSG, FRF, 'p')
def _bis(f, lo, hi):
    flo = f(lo)
    for _ in range(200):
        m = (lo + hi) / 2
        if (f(m) > 0) == (flo > 0): lo = m; flo = f(m)
        else: hi = m
    return (lo + hi) / 2
FWD = FS * exp((FRD - FRF) * FT)
CV = _c(1.10)
KPC = _bis(lambda k: _p(k) - CV, .5, 1.10)
KPS = _bis(lambda k: _p(k) - (CV - _c(1.14)), .5, 1.10)
FP = round(FWD, 4); F0 = [[1.0, FP], [1.2, FP]]
VAN = [[1.0, round(1.0 + CV, 4)], [1.10, round(1.10 + CV, 4)], [1.2, round(1.10 + CV, 4)]]
COLL = [[1.0, round(KPC, 4)], [round(KPC, 4), round(KPC, 4)], [1.10, 1.10], [1.2, 1.10]]
SEA = [[1.0, round(KPS, 4)], [round(KPS, 4), round(KPS, 4)], [1.10, 1.10], [1.14, 1.10], [1.2, 1.16]]
FC = (10, 914, 580, 270)

def m20(K, sg): return _bs(100, K, .25, 0.0, sg, 0, 'p')
FEB, MAR = round(m20(90, .15), 2), round(m20(90, .60), 2)

HW = dict(w=600, h=1420, intro='Hedging with options, drawn step by step: a floor, two cheaper shapes, the contract count, what it costs to keep the cover on, a currency payment, and why the same put cost 27 times as much in March 2020. Press play, or step through.', steps=[
    step('You hold $100 of an index fund. Unhedged, your profit follows the market one for one: the dashed line. If the fund falls to 70 you are down 30.',
         chart('pl', PC, 'Profit at expiry, $100 of stock (six months)', [LO, HI], [-36, 36],
               [[30, '+30'], [0, '0'], [-30, '−30']], [[70, '70'], [100, '100'], [130, '130']], zero=True, pl=52, pr=14),
         series('un', 'pl', UN, None, dash=True, ms=900, label='unhedged', lat=[128, 28], ldx=-4, ldy=-14, lanchor='end', lsize=17)),
    step('Buy a six-month put struck at 95 for 2.68. Below 95 every point the shares lose, the put pays back, so the profit is stuck at 95 − 100 − 2.68 = −7.68. The upside stays open, less the 2.68 premium.',
         series('put', 'pl', PUT, 'blue', ms=1300, label='put 95', lat=[128, put(128)], ldx=-4, ldy=-16, lanchor='end', lsize=17),
         dot('pf', 'pl', [78, round(put(78), 2)], 'worst −7.68', 'blue', dx=0, dy=22, size=17)),
    step('Cheaper: also sell an 85 put. The net cost falls from 2.68 to 2.08. But the hole opens below 85, where the two puts cancel and the loss grows again: −22.08 if the fund falls to 70.',
         dict(dim='put'), dict(dim='pf'),
         series('spr', 'pl', SPR, 'amber', ms=1300),
         dot('sf', 'pl', [70, round(spr(70), 2)], '−22.08 at 70', 'amber', dx=14, dy=-4, anchor='start', size=17)),
    step('Or sell a 110 call and keep its 2.76: the collar nets a small credit of 0.08, and the floor is better, −4.92. But gains stop at +10.08: the call you sold takes back every point above 110. Nothing is free; it was paid in upside.',
         dict(dim='spr'), dict(dim='sf'),
         series('col', 'pl', COL, 'green', ms=1300),
         dot('cc', 'pl', [122, round(col(122), 2)], 'cap +10.08', 'green', dx=0, dy=22, size=17),
         dot('cf', 'pl', [78, round(col(78), 2)], '−4.92', 'green', dx=0, dy=-16, size=17)),
    step('Three prices, three shapes, same fund. Look at both columns: what you lose in a crash to 70, and what you keep in a rally to 130.',
         box('b1', 10, 352, 186, 100, 'Put · cost 2.68\ncrash −7.68\nrally +27.32', 'blue', size=17),
         box('b2', 207, 352, 186, 100, 'Spread · cost 2.08\ncrash −22.08\nrally +27.92', 'amber', size=17),
         box('b3', 404, 352, 186, 100, 'Collar · cost −0.08\ncrash −4.92\nrally +10.08', 'green', size=17)),
    step('How many contracts? You size by exposure. A $2m portfolio with beta 1.2, against an index at 5,000 with a multiplier of 100: 1.2 × 2,000,000 ÷ 500,000 = 4.8, so 5 contracts.',
         box('sz', 10, 468, 580, 96, 'contracts = β × V ÷ (index × 100)\n1.2 × 2,000,000 ÷ 500,000 = 4.8 → 5', 'purple', size=19)),
    step('Beta is an average. If the index falls 20%, the portfolio falls 24% and the five puts pay $375,000: net of the $66,964 premium you lose 8.6%. If your shares fall 24% but the index falls only 10%, the puts pay $125,000 and you lose 21.1%. That gap is basis risk.',
         box('ba', 10, 578, 285, 100, 'index −20%\nportfolio −24%\nnet −8.6%', 'green', size=18),
         box('bb', 305, 578, 285, 100, 'shares −24%\nindex only −10%\nnet −21.1%', 'red', size=18)),
    step('What the cover costs if you keep it on. Roll a 95 put every month, quarter, half-year or year, and if the market goes nowhere you pay between 4% and 6.4% of the position a year. Shorter rolls are cheaper each time, not per year.',
         chart('rl', (10, 692, 580, 212), 'Yearly cost of a rolled 95 put, market flat (%)', [0.4, 4.6], [0, 7.6],
               [[2, '2%'], [4, '4%'], [6, '6%']], [[1, '1-month'], [2, '3-month'], [3, '6-month'], [4, '12-month']], pl=50, pr=14),
         dict(bars='rb', chart='rl', data=[[1, ROLL[0], f'{ROLL[0]:.2f}', 'red'], [2, ROLL[1], f'{ROLL[1]:.2f}', 'red'],
                                          [3, ROLL[2], f'{ROLL[2]:.2f}', 'amber'], [4, ROLL[3], f'{ROLL[3]:.2f}', 'blue']], bw=64, ms=1200, size=17)),
    step('Now a company: a US importer owes €10m in six months and fears a stronger euro. The dashed line is what it pays unhedged, dollars per euro. A forward fixes 1.0881, flat. The 81 pips over spot are the dollar–euro interest gap, not a fee.',
         chart('fx', FC, 'Dollars paid per euro, by EURUSD at payment', [1.0, 1.2], [1.0, 1.2],
               [[1.0, '1.00'], [1.1, '1.10'], [1.2, '1.20']], [[1.0, '1.00'], [1.08, 'spot'], [1.1, '1.10'], [1.2, '1.20']], pl=52, pr=14),
         series('fu', 'fx', [[1.0, 1.0], [1.2, 1.2]], None, dash=True, ms=700),
         series('ff', 'fx', F0, 'purple', ms=900, label='forward 1.0881', lat=[1.2, FP], ldx=-4, ldy=-14, lanchor='end', lsize=17)),
    step('An option keeps the benefit. A 1.10 euro call costs 0.0188 a euro (1.74%): the blue line pays market below 1.10 and 1.10 above, plus the premium. Its worst case, 1.1188, is worse than the forward. A zero-cost collar sells a 1.0769 put to pay for it: the green band.',
         dict(dim='ff'),
         series('fv', 'fx', VAN, 'blue', ms=1000),
         series('fc', 'fx', COLL, 'green', ms=1000)),
    step('A seagull sells a second call at 1.14 as well, so it can keep a better put strike. But the red line comes back up above 1.14: at 1.20 the importer pays 1.16. Protected between 1.10 and 1.14, exposed beyond it, exactly where a treasurer is frightened.',
         dict(dim='fv'), dict(dim='fc'),
         series('fs', 'fx', SEA, 'red', ms=1300),
         dot('fh', 'fx', [1.2, 1.16], 'exposed again', 'red', dx=-10, dy=24, anchor='end', size=17)),
    step('Last, when it is poor value. The same three-month put, 10% out of the money: at 15% volatility, about the VIX before the crash, it costs 0.26% of the portfolio. At 60%, a deliberately round number below the record VIX of March 2020, it costs 7.01%. Illustrative prices. Same cover, 27 times the price.',
         chart('vs', (10, 1198, 580, 212), 'Three-month 90% put, % of the portfolio (illustrative)', [0.4, 2.6], [0, 8.5],
               [[0, '0'], [4, '4%'], [8, '8%']], [[1, '19 Feb 2020: 15% vol'], [2, '16 Mar 2020: 60% vol']], pl=50, pr=14),
         dict(bars='vb', chart='vs', data=[[1, FEB, f'{FEB:.2f}%', 'green'], [2, MAR, f'{MAR:.2f}%', 'red']], bw=110, ms=1300, size=19),
         cnote('x27', 'vs', [1.5, 6.4], '≈ 27×', 'red', size=24)),
])


BOARD = dict(name='hedging_with_options', lesson='hedging-with-options', title='Hedging with options: floor, cap, size and price', cfg=HW,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>\n  <h2>It actually happened: the same insurance at two prices, 2020</h2>',
             deck_after=9)
