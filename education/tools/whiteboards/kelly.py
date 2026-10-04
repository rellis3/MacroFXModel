from ._wb import *
from math import log

# ── Kelly criterion (kelly-criterion) ─────────────────────────────────────────
# The lesson's coin: heads 55%, even money, so f* = 2p - 1 = 10%. Growth per flip uses
# the lesson's exact formula g(f) = p ln(1+f) + q ln(1-f). The paths are ONE illustrative
# shuffled run of 200 flips with exactly 110 heads (55%), applied to every bet size, so
# each path ends at exactly $100 * exp(200 g(f)): $212 / $272 / $97 / $4.
FLIPS = ('THHTHHHTHTTHHTHTHHHHTHTTTHHTHTTTHHHHTHTTTTHHHTTHHHTHHTTTTHHTHTHTHHTHHTHHHHHHTHHTTTHTHTTHHH'
         'TTHHTTHTHHTHHTTTHTHTHTTHHTHTHTTTHHTHTHTTHTTTHHHHTHHTTTTTHTHHTHTHHTTHHHTTHHHTHHHTTHHTHHHHTTHHT'
         'HHHHTTHHTTTHHHHTH')
assert len(FLIPS) == 200 and FLIPS.count('H') == 110

def _path(f, every=1):
    w, pts = 100.0, [[0, 100]]
    for i, c in enumerate(FLIPS, 1):
        w *= (1 + f) if c == 'H' else (1 - f)
        if i % every == 0: pts.append([i, round(w, 1)])
    return pts
def _g(f): return 0.55 * log(1 + f) + 0.45 * log(1 - f)   # per flip
HILL = [[f / 100, round(100 * _g(f / 100), 3)] for f in range(0, 31)]

PATHS = (10, 212, 580, 292)
KELLY = dict(w=600, h=750, intro='A coin that lands heads 55% of the time, and four ways to size the bets. Same coin, same flips: only the bet size changes. Press play, or step through.', steps=[
    step('Meet the coin: it lands heads 55% of the time and pays even money. Bet $1, win $1 on heads, lose your $1 on tails. A real edge. You start with $100.',
         icon('you', 'person', 20, 20, 0.7, 'blue', 'you', lsize=18),
         icon('bank', 'piggy', 120, 20, 0.75, 'blue', 'bankroll $100', sym='$', lsize=18),
         icon('coin', 'coin', 290, 20, 0.7, 'amber', 'heads 55%\neven money', lsize=18)),
    step('Each flip you risk a fraction f of whatever you have now. Heads multiplies your bankroll by (1 + f), tails by (1 − f). It multiplies, so losses compound too.',
         chip('bet', 175, 70, 'bet f', 'amber'),
         move('bet', 325, 70, 1100),
         note('rule', 300, 182, 'heads: × (1 + f)   ·   tails: × (1 − f)', 'amber', 19)),
    step('Bet everything? The first tails, a 45% chance on every flip, takes you to $0. And $0 stays $0 forever, however good the coin is.',
         dict(hide='bet'),
         icon('allin', 'piggy', 470, 20, 0.6, 'red', 'bet 100%:\nfirst tails → $0', sym='$', lsize=17),
         dict(cross='allin')),
    step("Kelly's answer: bet your edge. f* = 2p − 1 = 2 × 0.55 − 1 = 10% of your current bankroll, resized after every flip.",
         dict(hide='rule'),
         note('fstar', 300, 182, 'Kelly:  f* = 2p − 1 = 2(0.55) − 1 = 10%', 'green', 20)),
    step('Here is one run of 200 flips, 110 of them heads (illustrative). Betting 10% each time, $100 grows to $272. But look at the ride: from $248 it falls to $87, a 65% drawdown, before recovering.',
         chart('run', PATHS, 'Bankroll, one run of 200 flips (illustrative)', [0, 200], [0, 300],
               [[100, '$100'], [200, '$200'], [300, '$300']], [[0, '0'], [100, '100'], [200, '200 flips']], pl=50, pr=92),
         series('start', 'run', [[0, 100], [200, 100]], None, dash=True, ms=400),
         series('p10', 'run', _path(0.10), 'green', ms=1800, label='10%: $272', lat=[200, 272.3], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('Same flips, half the bet (5%, "half-Kelly"): $100 grows to $212. Less growth, a smoother ride: its worst drawdown is 35%. In growth-rate terms it keeps about 75% of full Kelly.',
         series('p05', 'run', _path(0.05), 'blue', ms=1600, label='5%: $212', lat=[200, 211.8], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('Same flips, double Kelly (20%). It races ahead early, to $278, then swings wildly and ends at $97: less than it started with. At 2f* the growth rate is zero.',
         dict(dim='p05'), dict(dim='p10'),
         series('p20', 'run', _path(0.20), 'amber', ms=1800, label='20%: $97', lat=[200, 97.3], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('Same flips, 30%. It looks brilliant at first, $249 after 20 flips, then grinds down to $4. Every single flip still had a positive edge. Only the size was wrong.',
         series('p30', 'run', _path(0.30), 'red', ms=1800, label='30%: $4', lat=[200, 3.9], ldx=6, ldy=0, lanchor='start', lsize=16),
         dot('pk30', 'run', [20, 249.4], '$249', 'red', dx=0, dy=-14)),
    step('Why: growth per flip against bet size is a hill. A bigger bet raises your drift in step with size, but the swings drag in proportion to size squared. The hill peaks at f* = 10%, is back to zero at 20%, and goes negative beyond.',
         chart('hill', (10, 516, 360, 228), 'Growth per flip vs bet size', [0, 0.3], [-1.75, 0.8],
               [[0.5, '+0.5%'], [0, '0'], [-1, '−1%']], [[0.05, '5%'], [0.1, '10%'], [0.2, '20%'], [0.3, '30%']], zero=True, pl=58, pr=16),
         series('g', 'hill', HILL, 'purple', ms=1500),
         dot('h10', 'hill', [0.10, 0.501], 'f*', 'green', dy=-16),
         dot('h20', 'hill', [0.20, -0.014], '2f* → 0', 'amber', dx=10, dy=-16, anchor='start'),
         dot('h30', 'hill', [0.30, -1.62], '', 'red')),
    step('Half-Kelly sits near the flat top of the hill: about 75% of the best growth rate for half the bet size and a quarter of the variance. That is why practitioners bet half Kelly or less, on purpose.',
         dot('h05', 'hill', [0.05, 0.375], '½f*', 'blue', dx=-8, dy=-16, anchor='end'),
         box('half', 388, 516, 202, 108, 'half-Kelly:\n~75% of growth,\nhalf the size', 'blue', size=19)),
    step('And your edge is only an estimate. If the coin really lands heads 52.5%, not 55%, true Kelly is 5%, so your "full Kelly" 10% is really double Kelly: zero growth. Kelly amplifies whatever edge you feed it.',
         box('est', 388, 636, 202, 108, 'think p = 55%,\nreally 52.5%?\n10% = 2f* → 0', 'red', size=18)),
])


BOARD = dict(name='kelly', lesson='kelly-criterion', title='Kelly sizing: under, full and over-betting', cfg=KELLY,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: LTCM, 1998</h2>',
             deck_after=8)
