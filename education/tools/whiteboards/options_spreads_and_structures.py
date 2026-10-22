from ._wb import *
from math import erf, exp, log, pi, sqrt

# ── Option spreads and structures (options-spreads-and-structures) ────────────
# The lesson's inputs: spot 100, 20% flat volatility, 2% rate, three months, Black-Scholes, q = 0.
# Every number below is computed with the lesson's own pricing (premiums, extremes, break-evens, and
# the condor's win rate and average win / loss under the model's own risk-neutral distribution).
S0, R, SIG, T0 = 100.0, 0.02, 0.20, 0.25
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def _price(S, K, cp, T=T0):
    if S <= 0: return 0.0 if cp == 'c' else K * exp(-R * T)
    d1 = (log(S / K) + (R + SIG * SIG / 2) * T) / (SIG * sqrt(T)); d2 = d1 - SIG * sqrt(T)
    return S * _N(d1) - K * exp(-R * T) * _N(d2) if cp == 'c' else K * exp(-R * T) * _N(-d2) - S * _N(-d1)
# a leg is (quantity, type, strike); type 's' is one share bought at 100
LEGS = dict(
    bullcall=[(1, 'c', 100), (-1, 'c', 105)],
    straddle=[(1, 'c', 100), (1, 'p', 100)],
    fly=[(1, 'c', 95), (-2, 'c', 100), (1, 'c', 105)],
    condor=[(1, 'p', 80), (-1, 'p', 90), (-1, 'c', 110), (1, 'c', 120)],
    collar=[(1, 's', 0), (1, 'p', 95), (-1, 'c', 105)])
def _V0(legs): return sum(q * (0.0 if t == 's' else _price(S0, k, t)) for q, t, k in legs)
def _pl(legs, S, V0):
    tot = -V0
    for q, t, k in legs:
        tot += q * ((S - S0) if t == 's' else (max(S - k, 0) if t == 'c' else max(k - S, 0)))
    return tot
def _stats(legs):
    V0 = _V0(legs); xs = [i * 0.05 for i in range(0, 6001)]; ys = [_pl(legs, x, V0) for x in xs]
    be = [xs[i] + (0 - ys[i]) / (ys[i + 1] - ys[i]) * 0.05 for i in range(6000) if ys[i] * ys[i + 1] < 0]
    return dict(V0=V0, mx=max(ys), mn=min(ys), be=be)
def _pts(legs, lo=80, hi=120):
    V0 = _V0(legs); return [[x, round(_pl(legs, float(x), V0), 3)] for x in range(lo, hi + 1)]
def f2(x): return ('\u2212' if x < -0.005 else '') + f'{abs(x):.2f}'
def _condor_q():
    legs = LEGS['condor']; V0 = _V0(legs); m = log(S0) + (R - SIG * SIG / 2) * T0; s = SIG * sqrt(T0)
    n = 20000; lo, hi = m - 8 * s, m + 8 * s; h = (hi - lo) / n; pw = pl = ew = el = 0.0
    for i in range(n):
        z = lo + (i + 0.5) * h; dens = exp(-0.5 * ((z - m) / s) ** 2) / (s * sqrt(2 * pi)) * h; y = _pl(legs, exp(z), V0)
        if y > 0: pw += dens; ew += dens * y
        elif y < 0: pl += dens; el += dens * y
    return pw, ew / pw, -el / pl
C100 = _price(S0, 100, 'c'); C105 = _price(S0, 105, 'c')
LONGC = [[x, round(max(x - 100, 0) - C100, 3)] for x in range(80, 121)]
SHORTC = [[x, round(-max(x - 105, 0) + C105, 3)] for x in range(80, 121)]
BULL = _pts(LEGS['bullcall']); STR = _pts(LEGS['straddle']); FLY = _pts(LEGS['fly']); CON = _pts(LEGS['condor']); COLL = _pts(LEGS['collar'])
sb, ss, sf, sc, sk = (_stats(LEGS[k]) for k in ('bullcall', 'straddle', 'fly', 'condor', 'collar'))
vb, vs, vf, vc, vk = sb['V0'], ss['V0'], sf['V0'], sc['V0'], sk['V0']
PW, AW, AL = _condor_q()
SHARES = [[x, x - 100] for x in range(86, 115)]
CH = (10, 96, 580, 330)

BRICKS = dict(w=600, h=640, intro='Four bricks and the shapes you can build with them. Spot 100, three months, 20% volatility, 2% rates. Press play, or step through.', steps=[
    step('Four bricks: buy a call, sell a call, buy a put, sell a put. Every named structure is a sum of these, at different strikes and expiries.',
         box('b1', 10, 10, 135, 64, 'BUY\ncall', 'blue', size=18), box('b2', 155, 10, 135, 64, 'SELL\ncall', 'amber', size=18),
         box('b3', 305, 10, 135, 64, 'BUY\nput', 'blue', size=18), box('b4', 450, 10, 140, 64, 'SELL\nput', 'amber', size=18)),
    step(f'Start with one brick: buy the 100 call for {f2(C100)}. Below 100 you lose the {f2(C100)}. Above 100 you gain one for one, with no cap.',
         chart('pl', CH, 'Profit and loss at expiry, per share', [80, 120], [-14, 17], [[10, '+10'], [0, '0'], [-10, '−10']],
               [[80, '80'], [90, '90'], [100, '100'], [110, '110'], [120, '120']], zero=True, pl=46, pr=16),
         series('lc', 'pl', LONGC, 'blue', ms=1300, label=f'buy 100 call', lat=[118, LONGC[38][1]], ldx=-4, ldy=-14, lanchor='end', lsize=16)),
    step(f'Add a second brick: sell the 105 call and collect {f2(C105)}. It gains at most {f2(C105)} and loses one for one above 105.',
         series('sc', 'pl', SHORTC, 'amber', ms=1300, dash=True, label='sell 105 call', lat=[118, SHORTC[38][1]], ldx=-4, ldy=14, lanchor='end', lsize=16)),
    step(f'Add them up. The two ramps cancel above 105 and the result is a flat shelf: the bull call spread. You paid {f2(vb)}, so the worst case is {f2(-sb["mn"])} below 100 and the best is +{f2(sb["mx"])} above 105.',
         series('sp', 'pl', BULL, 'green', ms=1500, label=f'spread: pay {f2(vb)}', lat=[112, BULL[32][1]], ldx=0, ldy=-16, lanchor='middle', lsize=17),
         dict(dim='lc'), dict(dim='sc'),
         dot('sm', 'pl', [100, -vb], f'worst {f2(sb["mn"])}', 'red', dx=-6, dy=20, anchor='end'),
         dot('sg', 'pl', [105, sb['mx']], f'best +{f2(sb["mx"])}', 'green', dx=-6, dy=-16, anchor='end')),
    step(f'What you bought: the same bet for {f2(vb)} instead of {f2(C100)}. What you sold: everything above 105. A structure is cheaper because you gave something away.',
         box('why', 10, 440, 285, 78, f'cheaper: pay {f2(vb)} not {f2(C100)}', 'green', size=18),
         box('why2', 305, 440, 285, 78, 'cost: nothing above 105', 'amber', size=18)),
    step(f'Different shape, same bricks: buy the 100 call and the 100 put. That is a straddle, a V. It costs {f2(vs)}, so spot must end below {f2(100 - vs)} or above {f2(100 + vs)} for you to profit.',
         dict(hide='lc'), dict(hide='sc'), dict(hide='sp'), dict(hide='sm'), dict(hide='sg'), dict(hide='why'), dict(hide='why2'),
         series('st', 'pl', STR, 'purple', ms=1500, label=f'straddle: pay {f2(vs)}', lat=[100, STR[20][1]], ldx=0, ldy=24, lsize=17),
         dot('s1', 'pl', [100 - vs, 0], f'{f2(100 - vs)}', 'amber', dx=-4, dy=-16, anchor='end'),
         dot('s2', 'pl', [100 + vs, 0], f'{f2(100 + vs)}', 'amber', dx=4, dy=-16, anchor='start')),
    step(f'Buy the wings and sell two 100 calls: a butterfly, a tent. It costs only {f2(vf)} and can make {f2(sf["mx"])}, but only if spot ends close to 100. Break-evens {f2(sf["be"][0])} and {f2(sf["be"][1])}.',
         dict(hide='st'), dict(hide='s1'), dict(hide='s2'),
         series('fl', 'pl', FLY, 'green', ms=1500, label=f'butterfly: pay {f2(vf)}', lat=[100, FLY[20][1]], ldx=0, ldy=-16, lsize=17),
         dot('f1', 'pl', [sf['be'][0], 0], f'{f2(sf["be"][0])}', 'amber', dx=-4, dy=-16, anchor='end'),
         dot('f2', 'pl', [sf['be'][1], 0], f'{f2(sf["be"][1])}', 'amber', dx=4, dy=-16, anchor='start')),
    step(f'Sell a put spread below and a call spread above: a short iron condor. You collect {f2(-vc)}, and that is the most you can make. The worst case is {f2(-sc["mn"])}: {-sc["mn"] / sc["mx"]:.1f} times the best.',
         dict(hide='fl'), dict(hide='f1'), dict(hide='f2'),
         series('co', 'pl', CON, 'red', ms=1500, label=f'condor: get {f2(-vc)}', lat=[100, CON[20][1]], ldx=0, ldy=-16, lsize=17),
         dot('c1', 'pl', [80, sc['mn']], f'worst {f2(sc["mn"])}', 'red', dx=8, dy=-16, anchor='start')),
    step(f'Own the shares, buy the 95 put, sell the 105 call: a collar. The dashed line is the shares alone. The collar floors the loss at {f2(-sk["mn"])} and caps the gain at {f2(sk["mx"])}, for a net credit of {f2(-vk)} at flat vol.',
         dict(hide='co'), dict(hide='c1'),
         series('sh', 'pl', SHARES, 'blue', ms=900, dash=True, label='shares alone', lat=[112, 12], ldx=-6, ldy=-6, lanchor='end', lsize=16),
         series('cl', 'pl', COLL, 'green', ms=1500, label='collar', lat=[112, COLL[32][1]], ldx=0, ldy=-16, lsize=17)),
    step('Greeks add leg by leg. Long straddle: long gamma and vega, pays theta. Condor and butterfly: the mirror image, collecting theta and short gamma and vega.',
         box('g1', 10, 440, 285, 84, 'straddle:\nwants a big move', 'purple', size=17), box('g2', 305, 440, 285, 84, 'condor, butterfly:\nwant quiet', 'red', size=17)),
    step(f'Defined risk is not low risk. In the model the condor profits about 75% of the time, averaging +1.42 when it wins and −4.31 when it does not: an expected value near zero. A fair price, not an edge.',
         box('fair', 10, 540, 580, 84, 'high win rate, small wins, big losses = fair price', 'amber', size=18)),
    step('Before you trade any structure, ask one question: what did I sell to make it look attractive? Then size by the worst case.',
         dict(pulse='fair')),
])

BOARD = dict(name='options_spreads_and_structures', lesson='options-spreads-and-structures',
             title='Four bricks, many shapes: building option structures', cfg=BRICKS,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>\n  <h2>It actually happened: Barings, 1995</h2>',
             deck_after=8)
