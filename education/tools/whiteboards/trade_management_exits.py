from ._wb import *
import numpy as np

# ── Managing the trade (trade-management-exits) ───────────────────────────────
# The lesson's worked example: long EUR/USD at 1.0850, a day's sigma about 50 pips, stop 1.0775
# (75 pips = 1.5 sigma = 1R), target 1.1000 (+2R). The price path is ONE illustrative random walk
# with a small upward drift, in R units at quarter-day steps (numpy seed 7461, chosen so the path
# shows a clear MAE, a target hit, a trailing-stop exit and a recovery). Every number in a caption
# is computed from the path below or from the lesson's formulas.
_rng = np.random.default_rng(7461)
_x = np.concatenate([[0.0], np.cumsum(0.28 / 4 + (1 / 1.5) * np.sqrt(0.25) * _rng.standard_normal(40))])
PATH = [[i / 4, round(float(v), 2)] for i, v in enumerate(_x)]
assert abs(min(_x[:13]) + 0.79) < 0.006 and _x.min() > -1        # MAE about -0.8R on day 0.75, stop never hit
_hit1 = next(i for i, v in enumerate(_x) if v >= 1) / 4            # first +1R: day 3.5
_hit2 = next(i for i, v in enumerate(_x) if v >= 2) / 4            # first +2R: day 6.75
assert (_hit1, _hit2) == (3.5, 6.75)
# Trailing stop 1R behind the best (observed) price, never below the initial stop.
TRAIL, _pk = [], 0.0
for i, v in enumerate(_x):
    stop = max(-1.0, _pk - 1.0)
    if i and v <= stop:
        _exit = (i / 4, float(round(stop, 2))); TRAIL.append([i / 4, float(round(stop, 2))]); break
    TRAIL.append([i / 4, float(round(stop, 2))]); _pk = max(_pk, float(v))
assert _exit == (8.5, 1.78) and round(_pk, 2) == 2.78
_end = round(float(_x[-1]), 2)
assert _end == 3.01
PAIN = -20 / 75                                                   # a 20-pip stop in R

PX = (10, 108, 580, 330)
EXITS = dict(w=600, h=790, intro='One EUR/USD trade, drawn in R: where the stop goes, how noise tests it, and what three different exit rules make of the same price path. Press play, or step through.', steps=[
    step('You are long EUR/USD at 1.0850. A typical day moves about 50 pips: that is one daily standard deviation, σ. The analysis says the idea is wrong below about 1.0790.',
         icon('you', 'person', 14, 8, 0.6, 'blue', 'you', lsize=17),
         note('n1', 360, 34, 'long EUR/USD at 1.0850', 'blue', 20),
         note('n2', 360, 70, "a day's σ ≈ 50 pips", 'blue', 19)),
    step('The stop goes just beyond the invalidation level: 1.0775, 75 pips away, or 1.5σ. That distance is 1R, the loss you plan for. The target, 1.1000, is 150 pips away: +2R.',
         chart('px', PX, 'The trade, measured in R', [0, 10], [-1.45, 3.3],
               [[-1, 'stop −1R'], [0, 'entry'], [1, '+1R'], [2, 'target +2R'], [3, '+3R']],
               [[0, '0'], [5, 'day 5'], [10, '10']], pl=112, pr=14),
         series('entry', 'px', [[0, 0], [10, 0]], None, dash=True, ms=400),
         series('stop', 'px', [[0, -1], [10, -1]], 'red', ms=500),
         series('tgt', 'px', [[0, 2], [10, 2]], 'green', dash=True, ms=500)),
    step('Shade one day of noise, ±1σ, around entry. A "safe" 20-pip stop sits deep inside it: a random walk touches it within a day 69% of the time. The 75-pip stop is touched within a day only 13% of the time.',
         dict(gap='noise', chart='px', top=[[0, 1 / 1.5], [10, 1 / 1.5]], bot=[[0, -1 / 1.5], [10, -1 / 1.5]], tone='blue', op=0.16),
         series('pain', 'px', [[0, PAIN], [10, PAIN]], 'red', dash=True, ms=400, label='20-pip stop', lat=[10, PAIN], ldx=-4, ldy=14, lanchor='end', lsize=16)),
    step('One illustrative path. On day one it dips 0.79R, about 59 pips, against you: its maximum adverse excursion. The 20-pip stop is hit within half a day. The 75-pip stop is never touched.',
         series('path', 'px', PATH, 'purple', ms=2200),
         dot('mae', 'px', [0.75, -0.79], 'MAE −0.8R', 'red', dx=8, dy=26, anchor='start'),
         dot('painhit', 'px', [0.5, -0.39], '', 'red')),
    step('Exit rule one, a fixed target. On day 6.75 the price reaches 1.1000. Bank +2R, 150 pips.',
         dict(dim='noise'), dict(dim='pain'),
         dot('tgthit', 'px', [_hit2, 2.0], '+2R', 'green', dx=-10, dy=-16, anchor='end')),
    step('Exit rule two, a trailing stop 1R behind the best price. The best price reaches +2.8R on day 8, a pullback hits the trail at +1.8R on day 8.5. A trail always hands back its distance from the peak.',
         series('trail', 'px', TRAIL, 'amber', ms=1600, width=2.6),
         dot('trexit', 'px', [_exit[0], _exit[1]], '+1.8R', 'amber', dx=0, dy=22)),
    step('Exit rule three, let it run to a 10-day time stop: +3.0R. On this path letting it run won. On a path that peaked and fell back, the target would have won. One path cannot choose a rule; only many trades can.',
         dot('end', 'px', [10, _end], '+3.0R', 'purple', dx=-8, dy=-16, anchor='end')),
    step('And if prices were pure noise, no rule would win. A +2R target is reached before a −1R stop one time in three: one third of 2 minus two thirds of 1 is zero. Exits reshape outcomes. The edge has to come from the idea.',
         box('noedge', 10, 450, 285, 92, 'pure noise: +2R before −1R\nonly 1 time in 3\n⅓ × 2 − ⅔ × 1 = 0', 'amber', size=17)),
    step('A partial exit: half off at +1R on day 3.5, the rest at the target. On this path that makes +1.5R. Scaling out wins more often and swings less, but its expectancy is just the average of its two halves.',
         dot('half', 'px', [_hit1, 1.0], '½ off', 'blue', dx=-8, dy=-16, anchor='end'),
         box('part', 305, 450, 285, 92, 'half at +1R, half at +2R\n= +1.5R on this path\nsame E, smoother ride', 'blue', size=17)),
    step('Every rule so far assumed the stop fills at its level. On 15 January 2015 the Swiss National Bank scrapped its 1.20 floor and EUR/CHF fell below 0.90 within minutes. A 50-pip stop that fills at 1.10 is a 21R loss.',
         box('snb', 10, 556, 285, 112, 'SNB, 15 Jan 2015:\nEUR/CHF 1.20 → below 0.90\n50-pip stop filled at 1.10\n= −21R', 'red', size=17)),
    step('Then the leaks. Close half your winners at +1R instead of +2R, and the plan\'s +0.20R a trade falls to zero. Let 1 loser in 5 run to −3R as well, and it falls to −0.24R. Same entries, same market.',
         chart('leak', (305, 556, 285, 226), 'E per trade (R)', [0.4, 3.6], [-0.42, 0.32],
               [[0.2, '+0.2'], [0, '0'], [-0.2, '−0.2']], [[1, 'plan'], [2, '+ cut'], [3, '+ stops']], zero=True, pl=52, pr=10, pb=30),
         dict(bars='lk', chart='leak', data=[[1, 0.20, '+0.20', 'green'], [2, 0.0, '0.00', 'amber'], [3, -0.24, '−0.24', 'red']], bw=34, ms=1200)),
    step('The whole lesson in four moves: count every trade in R, put the stop where the idea dies, size for the gap, and never move a stop further away.',
         note('s1', 152, 700, 'count in R', 'green', 19),
         note('s2', 152, 730, 'stop = where the idea dies', 'green', 18),
         note('s3', 152, 760, 'size for the gap', 'green', 19)),
])

BOARD = dict(name='trade_management_exits', lesson='trade-management-exits', title='Managing one trade: stops, exits and gaps, in R', cfg=EXITS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the Swiss franc, 15 January 2015</h2>',
             deck_after=5)
