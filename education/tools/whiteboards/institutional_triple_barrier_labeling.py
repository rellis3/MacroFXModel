from ._wb import *

# ── Triple-barrier labelling & meta-labelling (institutional-triple-barrier-labeling) ──
# Numbers from the lesson: entry 1.0850, sigma 5 pips a bar, k_u = 4, k_l = 3 -> U 1.0870,
# L 1.0835, V = bar 10; the 7-bar worked path (1.0855 ... 1.0872, upper touched at bar 7).
# Second chart: the lesson's fixed 20-bar synthetic path (offsets in pips) with the stop
# narrowed to 2 sigma = 10 pips, which is hit at bar 5 (-14 pips) while the 10-bar return is +9.
# Meta-labelling: the lesson's ten fired signals, threshold 0.60 -> 4 taken, 3 win.
WORKED = [0, 5, -2, 7, 12, 0, 15, 22]           # pips from 1.0850, bars 0..7
OFFSETS = [0, 3, -4, 2, -9, -14, -7, -11, -3, 5, 9, 14, 10, 18, 22, 28, 24, 30, 26, 33, 29]
assert [round(1.0850 + p / 1e4, 4) for p in WORKED] == [1.0850, 1.0855, 1.0848, 1.0857, 1.0862, 1.0850, 1.0865, 1.0872]
def _first_touch(path, up, lo, h):
    for b in range(1, h + 1):
        if path[b] >= up: return b, +1
        if path[b] <= lo: return b, -1
    return h, 0
assert _first_touch(WORKED + [0] * 3, 20, -15, 10) == (7, 1)
assert _first_touch(OFFSETS, 20, -10, 10) == (5, -1) and OFFSETS[10] == 9
PROBS = [0.82, 0.71, 0.65, 0.61, 0.58, 0.54, 0.47, 0.39, 0.33, 0.22]
OUTS = [1, 1, 1, -1, 1, -1, -1, 1, -1, -1]
taken = [o for p, o in zip(PROBS, OUTS) if p > 0.60]
assert (len(taken), taken.count(1), OUTS.count(1)) == (4, 3, 5)

C1 = (10, 92, 580, 236)
C2 = (10, 346, 580, 236)
C3 = (10, 600, 580, 196)
def hline(id, ch, x0, x1, v, tone, label):
    return series(id, ch, [[x0, v], [x1, v]], tone, dash=True, ms=500, label=label, lat=[x1, v], ldx=8, ldy=0, lanchor='start', lsize=16)

CFG = dict(w=600, h=806, intro='A trade ends at its stop, its target or its time limit, whichever comes first. Label it the same way. Press play, or step through.', steps=[
    step('You go long EUR/USD at 1.0850. A point-in-time volatility estimate says about 5 pips a bar.',
         icon('you', 'person', 20, 4, 0.66, 'blue', 'long 1.0850', lsize=17),
         note('sig', 360, 40, 'σ̂ = 5 pips a bar, known at entry', None, 19)),
    step('Set three barriers before you look at the path: a take-profit 4σ up at 1.0870, a stop 3σ down at 1.0835, and a time limit 10 bars out.',
         chart('w', C1, 'Worked example: pips from entry', [0, 10], [-20, 28], [[20, '+20'], [0, '0'], [-15, '−15']],
               [[0, '0'], [5, '5'], [10, '10 bars']], pl=46, pr=110),
         hline('u', 'w', 0, 10, 20, 'green', 'U 1.0870'),
         hline('l', 'w', 0, 10, -15, 'red', 'L 1.0835'),
         series('v', 'w', [[10, -20], [10, 28]], 'amber', dash=True, ms=400, label='V', lat=[10, 26], ldx=8, ldy=0, lanchor='start', lsize=16)),
    step('Walk forward bar by bar, in order, exactly as an open position would. Through bar 6 the price stays between the barriers: the high so far is 1.0865.',
         series('p6', 'w', [[i, WORKED[i]] for i in range(7)], 'blue', ms=1400)),
    step('Bar 7 trades at 1.0872, at or above the upper barrier. The walk stops here: the label is +1.',
         series('p7', 'w', [[6, 15], [7, 22]], 'blue', ms=500),
         dot('t7', 'w', [7, 22], '+1 at bar 7', 'green', dy=-16)),
    step('Bars 8 to 10 no longer matter. A real position closed by its take-profit at bar 7 never sees them, so the label ignores them too.',
         cnote('moot', 'w', [8.6, 2], 'bars 8–10:\nmoot', None, 17)),
    step("Now the lesson's 20-bar path, with the stop tightened to 2σ, 10 pips below entry. At bar 5 the price is 14 pips down. The stop is hit first: the label is −1.",
         chart('s', C2, 'Same idea, the 20-bar path: pips from entry', [0, 20], [-30, 36], [[20, '+20'], [0, '0'], [-10, '−10']],
               [[0, '0'], [5, '5'], [10, '10'], [20, '20 bars']], pl=46, pr=110),
         hline('u2', 's', 0, 20, 20, 'green', 'U +20'),
         hline('l2', 's', 0, 20, -10, 'red', 'L −10'),
         series('v2', 's', [[10, -30], [10, 36]], 'amber', dash=True, ms=400),
         series('q5', 's', [[i, OFFSETS[i]] for i in range(6)], 'blue', ms=1200),
         dot('t5', 's', [5, -14], '−1 at bar 5', 'red', dy=22)),
    step('A fixed 10-bar label ignores the path and checks only bar 10, where price is 9 pips up. It calls this +1. A real trade with that stop had already lost.',
         series('q10', 's', [[i, OFFSETS[i]] for i in range(5, 11)], None, dash=True, ms=700),
         dot('f10', 's', [10, 9], 'fixed 10-bar label: +1', 'amber', dx=-8, dy=-18, anchor='end')),
    step('Meta-labelling is a second idea. A primary signal fired 10 times and won 5: a coin flip. A separate model gives each fired signal a probability of winning.',
         chart('m', C3, 'Ten fired signals: meta-probability, and the outcome', [0.4, 10.6], [0, 1.5], [[0.6, '0.60']],
               [[1, '1'], [10, '10']], pl=50, pr=14, pt=36),
         dict(bars='mb', chart='m', data=[[i + 1, p, '', 'green' if o > 0 else 'red'] for i, (p, o) in enumerate(zip(PROBS, OUTS))], bw=30, ms=1100),
         cnote('key', 'm', [5.5, 1.13], 'green = target first (+1) · red = stop first (−1)', None, 17)),
    step('Take only signals above 0.60. Four clear the bar and three of them win: 75% instead of 50%, from 4 trades instead of 10.',
         series('thr', 'm', [[0.4, 0.6], [10.6, 0.6]], 'amber', dash=True, ms=500),
         dict(hide='key'), cnote('kept', 'm', [5.5, 1.36], 'above 0.60: 4 taken · 3 win = 75%', 'green', 18)),
    step('Compare taking every signal: 5 wins from 10, 50%. Higher precision costs trades. And the filter can only rank a signal with real information in it. On pure noise it finds splits that vanish out of sample.',
         cnote('warn', 'm', [5.5, 1.13], 'all signals: 10 taken · 5 win = 50%', None, 17)),
])


BOARD = dict(name='institutional_triple_barrier_labeling', lesson='institutional-triple-barrier-labeling',
             title='The barrier race, then the meta-label filter', cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=6)
