from ._wb import *
from math import erf, sqrt

# ── Trade classification: Lee-Ready & BVC (institutional-trade-classification) ──
# The lesson's 9-trade toy tape (seed 100), each trade's prevailing quote, and the tick /
# quote / Lee-Ready signs, all recomputed here from the rules. BVC uses the lesson's four
# bars with sigma = 0.0004: z = +2, 0, -0.5, +1 -> 97.72%, 50%, 30.85%, 84.13% buy.
PX = [100, 101, 101, 99, 99, 102, 100, 100, 97, 98]
Q = [None, (99, 101), (100, 102), (99, 101), (97, 99), (100, 102), (100, 102), (98, 100), (97, 99), (96, 98)]
tick, quote, lr, last = [], [], [], None
for t in range(1, 10):
    s = 'B' if PX[t] > PX[t - 1] else 'S' if PX[t] < PX[t - 1] else last
    last = s; tick.append(s)
    mid = sum(Q[t]) / 2
    q = 'B' if PX[t] > mid else 'S' if PX[t] < mid else '='
    quote.append(q); lr.append(s if q == '=' else q)
assert ''.join(tick) == 'BBSSBSSSB' and ''.join(quote) == 'B=SBBSBSB' and ''.join(lr) == 'BBSBBSBSB'
def Phi(z): return 0.5 * (1 + erf(z / sqrt(2)))
BVC = [(z, Phi(z)) for z in (2.0, 0.0, -0.5, 1.0)]
assert [round(p, 4) for _, p in BVC] == [0.9772, 0.5, 0.3085, 0.8413]

CH = (10, 58, 580, 292)
XD, PL, PR = (-0.5, 9.5), 92, 14
def px(t): return CH[0] + PL + (t - XD[0]) / (XD[1] - XD[0]) * (CH[2] - PL - PR)
TONE = {'B': 'green', 'S': 'red', '=': 'amber'}
def row(id, y, label, signs, size=18):
    ops = [note(id + 'L', 14, y, label, None, 17, anchor='start')]
    ops += [note(f'{id}{t}', round(px(t), 1), y, 'tie' if s == '=' else s, TONE[s], size) for t, s in enumerate(signs, 1)]
    return ops

CFG = dict(w=600, h=800, intro='Nothing on the tape says who started a trade. Three rules guess it trade by trade, and a fourth splits a whole bar at once. Press play, or step through.', steps=[
    step('A toy tape: a seed print at 100, then nine trades. Each print is a price, a size and a time. Nothing says whether the buyer or the seller was in a hurry.',
         note('hdr', 300, 24, 'price · size · time … but who was the aggressor?', 'amber', 19),
         chart('tape', CH, 'Trade price, with the quote in effect before each trade', list(XD), [95.5, 103],
               [[97, '97'], [100, '100'], [102, '102']], [[0, 'seed']] + [[t, f't{t}'] for t in range(1, 10)], pl=PL, pr=PR),
         series('path', 'tape', [[t, p] for t, p in enumerate(PX)], 'blue', ms=1300)),
    step('Add the standing quote before each trade: the shaded box runs from the bid to the ask, and the dashed line is the midpoint between them.',
         *[dict(gap=f'q{t}', chart='tape', top=[[t - 0.32, Q[t][1]], [t + 0.32, Q[t][1]]], bot=[[t - 0.32, Q[t][0]], [t + 0.32, Q[t][0]]], tone='purple', op=0.28) for t in range(1, 10)],
         *[series(f'm{t}', 'tape', [[t - 0.32, sum(Q[t]) / 2], [t + 0.32, sum(Q[t]) / 2]], 'amber', dash=True, ms=200, width=2.4) for t in range(1, 10)]),
    step('The tick rule looks only at prices. Up from the last print is a buy, down is a sell, and an unchanged price copies the last sign. t2, t4 and t7 are unchanged prices.',
         *row('tk', 374, 'tick', tick)),
    step('The quote rule compares each price with the midpoint: above is a buy, below is a sell. t2 printed at 101, exactly the mid of 100/102, so the quote rule cannot decide.',
         *row('qt', 406, 'quote', quote)),
    step('Lee-Ready: use the quote rule, and fall back to the tick rule only for that exact tie. t2 inherits the buy from t1.',
         *row('lr', 438, 'Lee-Ready', lr, 19)),
    step('At t4 and t7 the two rules disagree. The price did not move, but the quote dropped, so the trade printed above the new midpoint. The tick rule says sell; Lee-Ready trusts the quote and says buy.',
         dict(pulse='lr4'), dict(pulse='lr7'),
         note('dis', 300, 470, 't4, t7: price unchanged, quote fell → quote rule wins: buy', 'green', 17)),
    step('Lee and Ready (1991) compared each trade with the quote from about five seconds before it, so a quote that reacted to the trade is not used. On millisecond markets that lag is too coarse, and published work finds accuracy falls.',
         box('lag', 60, 488, 480, 50, 'quote from ~5 s before the print · less accurate on fast markets', 'amber', size=17)),
    step('Bulk Volume Classification gives up on single trades. It splits a whole bar by how far price moved in units of its usual move: buy share = Φ(ΔP / σ). Four bars with σ = 0.0004.',
         dict(hide='lag'), dict(dim='dis'),
         chart('bvc', (10, 552, 580, 236), 'BVC buy share of each bar', [0.4, 4.6], [0, 1.3], [[0.5, '50%'], [1, '100%']],
               [[1, 'A z = +2'], [2, 'B z = 0'], [3, 'C z = −0.5'], [4, 'D z = +1']], pl=56, pr=14),
         dict(bars='bv', chart='bvc', data=[[i + 1, p, f'{100 * p:.1f}%', 'green' if p > 0.5 else 'red' if p < 0.5 else 'blue'] for i, (z, p) in enumerate(BVC)], bw=58, ms=1200)),
    step('Bar D moved +0.0004, one usual move: z = 1 and Φ(1) = 0.8413. On a 1,000-unit bar, 841 units are called buys and 159 sells. A flat bar is always 50/50.',
         cnote('dd', 'bvc', [2.6, 1.2], 'D: 1,000 units → 841 buy · 159 sell', 'green', 17)),
    step('The catch: BVC labels a bar, not a trade. Many small informed trades and one big order that moved price the same way get the identical split. It needs only price and volume, which is why VPIN is built on it and why it suits FX.',
         note('cav', 300, 514, 'BVC labels a bar, never a single trade', 'amber', 18)),
])


BOARD = dict(name='institutional_trade_classification', lesson='institutional-trade-classification',
             title='Signing trades: tick rule, quote rule, Lee-Ready, then BVC', cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=11)
