import random
from ._wb import *

# ── FX fixings: how a fixing order is filled, how the 4pm median works, the 2014 fines, the
#    2015 window change and the month-end sign rule (fx-fixings-wm-reuters) ──────────────────
# Lesson numbers: client buys €500m, another sells €200m → €300m residual; 1 pip = $30,000;
# honest fill avg 1.10012 vs fix 1.10010 → −$6,000; early buying avg 1.09990, fix 1.10010 → +$60,000.
# Hold time at Δ = σ_w: share (0.5−q)/(1−q) with q = 1−Φ(1) → 0.4057 → 24.7 s of 61, 122.1 s of 301.
# 12 Nov 2014: FCA £1,114.918m (≈ $1.77bn at ~1.585), CFTC $1.475bn, OCC $0.95bn, FINMA CHF 134m
# (≈ $0.14bn) → ≈ $4.33bn. Month-end: A=600, r_US=4%, B=400, r_F=1% → −24 + 4 = −$20bn.
from math import erf, sqrt
Phi = lambda z: 0.5 * (1 + erf(z / sqrt(2)))
Q = 1 - Phi(1.0)
SHARE = (0.5 - Q) / (1 - Q)
assert round(SHARE * 61, 1) == 24.7 and round(SHARE * 301, 1) == 122.1
assert round((1.10012 - 1.10010) * 300e6) == 6000 and round((1.10010 - 1.09990) * 300e6) == 60000
FCA_USD = 1114.918 * 1.585 / 1000
FINES = [FCA_USD, 1.475, 0.95, 134 / 0.963 / 1000]
assert round(sum(FINES), 1) == 4.3
assert 400 * 0.01 - 600 * 0.04 == -20

# Illustrative per-second EUR/USD path in pips above 1.1000, 15:53:00 → 16:02:30, sampled every 5 s.
# Pre-window it climbs from about −1 (1.09990) as early buying lifts it; in the window it scatters
# around +1 and is shifted so the window's median is exactly +1.0 (the 1.10010 fix).
rng = random.Random(7)
pre = []
for i, t in enumerate(range(-420, -150, 5)):
    base = -1.3 + 1.9 * (i / 54) ** 1.6
    pre.append([t, round(base + rng.uniform(-0.35, 0.35), 2)])
win = []
lvl = 1.0
for t in range(-150, 151, 5):
    lvl = 1.0 + 0.55 * (lvl - 1.0) + rng.uniform(-0.9, 0.9)
    win.append([t, lvl])
vals = sorted(v for _, v in win)
med = vals[len(vals) // 2]
win = [[t, round(v - med + 1.0, 2)] for t, v in win]
assert sorted(v for _, v in win)[len(win) // 2] == 1.0
pre.append(win[0])

P1 = ['fund', 'seller', 'bank', 'buy', 'sell', 'net', 'px', 'pre', 'win', 'fix', 'honest', 'early', 'ramp', 'rdot']

FX = dict(w=600, h=800, intro='One fixing order, filled two ways; the five-minute median; the fines of 12 November 2014; and the month-end sign rule. The lesson\'s own numbers, step by step.', steps=[
    step('An index fund must buy €500 million against dollars at today\'s 4pm fix, because its index converts at that rate. It gives the order to a bank. The bank promises the fix rate, which nobody knows yet.',
         icon('fund', 'crowd', 20, 10, 0.7, 'blue', 'index fund', lsize=17),
         icon('bank', 'bank', 490, 40, 0.75, 'purple', 'bank', sym='$', lsize=17),
         chip('buy', 230, 50, 'buy €500m at the fix', 'green'),
         move('buy', 370, 50, 1100)),
    step('Another client sells €200 million at the same fix. The bank crosses the two internally, so only €300 million has to be bought in the market. On €300 million, every pip is $30,000.',
         icon('seller', 'person', 25, 140, 0.6, 'amber', 'other client', lsize=17),
         chip('sell', 230, 175, 'sell €200m at the fix', 'amber'),
         move('sell', 370, 175, 1100),
         box('net', 150, 240, 430, 92, 'net: €500m − €200m = €300m to buy\n1 pip on €300m = $30,000', 'purple', size=19)),
    step('From 15:57:30 to 16:02:30 the administrator snaps a price every second: 301 samples. The fix is their median, half the samples above and half below. Here it prints 1.10010. The path is illustrative.',
         chart('px', (10, 352, 580, 300), 'EUR/USD samples (illustrative)', [-420, 150], [-2.6, 3.4],
               [[-1, '1.09990'], [1, '1.10010']], [[-420, '15:53'], [-150, '15:57:30'], [0, '16:00'], [150, '16:02:30']], pl=82, pr=40),
         series('pre', 'px', pre, None, ms=1000),
         series('win', 'px', win, 'blue', ms=1400),
         series('fix', 'px', [[-150, 1.0], [150, 1.0]], 'green', dash=True, ms=600, label='fix = median', lat=[-150, 1.0], ldx=58, ldy=-62, lanchor='start')),
    step('The honest fill: the bank buys the €300 million spread evenly through the window, the closest it can get to paying the median. It averages 1.10012 against a 1.10010 fix: 0.2 pips, or $6,000, which the agreed fee is there to cover.',
         note('honest', 300, 680, 'in the window: avg 1.10012 vs fix 1.10010 → −$6,000', 'green', 18)),
    step('The conflicted fill: the bank buys all €300 million before the window, averaging 1.09990, and its own buying lifts the price into 4pm. The client still pays the 1.10010 fix, so the bank keeps 2 pips: $60,000 of its client\'s money.',
         series('ramp', 'px', [[-400, -1.0], [-160, -1.0]], 'red', dash=True, ms=700, label='bank buys early, avg 1.09990', lat=[-400, -1.0], ldx=0, ldy=34, lanchor='start'),
         note('early', 300, 728, 'before the window: avg 1.09990 vs fix 1.10010 → +$60,000', 'red', 18)),
    step('Now pool orders across banks. Regulators found traders in chat groups with names like "the players" and "the A-team" sharing client orders. Before 2015 the median used 61 one-second samples: control about half of them, roughly 30 seconds, and the fix is yours.',
         *[dict(hide=i) for i in P1],
         icon('b1', 'bank', 20, 10, 0.7, 'red', 'bank A', sym='$', lsize=17),
         icon('b2', 'bank', 265, 10, 0.7, 'red', 'bank B', sym='$', lsize=17),
         icon('b3', 'bank', 510, 10, 0.7, 'red', 'bank C', sym='$', lsize=17),
         arrow('b1', 'b2', 'client flow', 'red', bend=-30, dash=True),
         arrow('b2', 'b3', 'client flow', 'red', bend=-30, dash=True),
         box('pool', 60, 128, 480, 72, 'pooled orders vs a 61-second median', 'red', size=20)),
    step('12 November 2014. The FCA fines five banks £1.11 billion, the CFTC fines them $1.475 billion, the OCC fines three US banks $950 million, and FINMA orders UBS to pay 134 million Swiss francs. About $4.3 billion, six banks, one day.',
         chart('fines', (10, 222, 580, 262), '12 Nov 2014 fines, $bn (FCA and FINMA converted)', [0.4, 4.6], [0, 2.1],
               [[0, '0'], [1, '1'], [2, '2']], [[1, 'FCA'], [2, 'CFTC'], [3, 'OCC'], [4, 'FINMA']], pl=46),
         dict(bars='fb', chart='fines', data=[[1, round(FINES[0], 2), '1.77', 'blue'], [2, 1.475, '1.475', 'purple'],
                                               [3, 0.95, '0.95', 'amber'], [4, round(FINES[3], 2), '0.14', 'green']], bw=60, ms=1200),
         note('tot', 400, 268, 'total ≈ $4.3bn', 'red', 20)),
    step('From 15 February 2015 the window is five minutes: 301 samples. To push the fix one "scatter" above where the market would print, you must hold the price there for about 25 seconds of the old window, but about 122 seconds of the new one.',
         chart('hold', (10, 500, 280, 250), 'Seconds to hold, Δ = σ', [0.4, 2.6], [0, 160],
               [[0, '0'], [60, '60'], [120, '120']], [[1, '1 min'], [2, '5 min']], pl=50),
         dict(bars='hb', chart='hold', data=[[1, round(SHARE * 61, 1), '25 s', 'amber'], [2, round(SHARE * 301, 1), '122 s', 'blue']], bw=56, ms=1000)),
    step('Month-end. US stocks are up 4% and foreign stocks 1%. Foreign holders of $600 billion of hedged US shares top up their hedges by selling $24 billion; US holders of $400 billion of hedged foreign shares buy $4 billion. Net: about $20 billion of dollar selling (illustrative holdings).',
         chart('me', (310, 500, 280, 250), 'Month-end USD flow, $bn', [0.4, 3.6], [-34, 9],
               [[0, '0'], [-20, '−20']], [[1, 'abroad'], [2, 'US'], [3, 'net']], zero=True, pl=50),
         dict(bars='mb', chart='me', data=[[1, -24, '−24', 'red'], [2, 4, '+4', 'green'], [3, -20, '−20', 'red']], bw=40, ms=1100)),
    step('So: the fix is a five-minute median that the whole buy side marks to. Expect a crowd at 4pm, a bigger one at month-end, and sell pressure on the currency whose stock market rose most. And never trade on someone else\'s order.',
         note('end1', 300, 768, 'median of 301 seconds · month-end sign rule\nclient flow is never your signal', 'amber', 17)),
])


BOARD = dict(name='fx_fixings_wm_reuters', lesson='fx-fixings-wm-reuters', title='Filling a fixing order, and why the fix became five minutes', cfg=FX,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the FX fixing scandal, 2013–2015</h2>',
             deck_after=5)
