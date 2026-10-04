from ._wb import *

# ── The Taylor Rule as a thermostat (taylor-rule) ────────────────────────────
# Numbers are the lesson's own worked example and trading scenario:
#   r* = 2%, pi = 3%, pi* = 2%, output gap = +1%, a = b = 0.5
#   neutral r* + pi* = 4%; baseline r* + pi = 5%; + 0.5 + 0.5 → i = 6%
#   actual policy rate 4.50%, market-priced terminal 4.75% → gap 1.25pp
#   hot CPI: pi 3% → 4%, gap unchanged → i = 2 + 4 + 0.5(2) + 0.5(1) = 7.5%; gap 2.75pp
BUILD = (10, 290, 580, 320)
GAP = (10, 290, 580, 320)
GX = [0.4, 5.4]   # gap chart x range: actual 1, priced 2, rule 3, after CPI 4.3

TAYLOR = dict(w=600, h=620, intro='The Taylor Rule as a thermostat: two sensors, one lever, and the lesson\'s own worked example. Press play, or step through.', steps=[
    step('Think of a central bank as running a thermostat for the economy, with two sensors and one lever. The lever is the policy rate. What should it be set to?',
         icon('cb', 'bank', 260, 8, 0.8, 'blue', 'central bank', lsize=17),
         box('dial', 205, 140, 190, 72, 'policy rate i', 'blue', sub='?', size=20)),
    step('Sensor one is a thermometer: inflation π is 3%, against a 2% target π*. The room is too hot by 1 percentage point. Taylor\'s inflation dial is a = 0.5: each point of overshoot adds half a point.',
         icon('th', 'thermo', 40, 8, 0.8, 'red', 'inflation 3%\ntarget 2%', lsize=17),
         arrow('th', 'cb', 'a = 0.5', 'red')),
    step('Sensor two reads how hard the economy is working: the output gap. Here it runs 1% above potential, a little overheated. Its dial is also b = 0.5.',
         icon('fac', 'factory', 480, 8, 0.8, 'amber', 'output gap\n+1%', lsize=17),
         arrow('fac', 'cb', 'b = 0.5', 'amber')),
    step('Start from the "everything\'s fine" setting. Taylor took the neutral real rate r* as 2%. With inflation on the 2% target and no output gap, the rule says r* + π* = 2 + 2 = 4%: the neutral nominal rate.',
         note('eq', 300, 252, 'i = r* + π + a(π − π*) + b(y − y*)', None, 21),
         chart('bc', BUILD, 'Building the prescribed rate (%)', [0.4, 4.6], [0, 7.6],
               [[0, '0'], [2, '2'], [4, '4'], [6, '6']], [[1, 'neutral'], [2, 'r* + π'], [3, '+ a·gap'], [4, '+ b·gap']]),
         dict(bars='b1', chart='bc', data=[[1, 4, '4%', 'blue']], bw=56, ms=900),
         dict(count='dial', **{'from': 0, 'to': 4, 'dp': 1, 'suf': '%', 'ms': 900})),
    step('But the baseline uses today\'s inflation, not the target: r* + π = 2 + 3 = 5%. That is one extra point before either dial has turned.',
         dict(bars='b2', chart='bc', data=[[2, 5, '5%', 'purple']], bw=56, ms=900),
         dict(count='dial', **{'from': 4, 'to': 5, 'dp': 1, 'suf': '%', 'ms': 900})),
    step('Inflation dial: a × (π − π*) = 0.5 × 1 = +0.5. Now 5.5%.',
         dict(pulse='th'),
         dict(bars='b3', chart='bc', data=[[3, 5.5, '5.5%', 'red']], bw=56, ms=900),
         dict(count='dial', **{'from': 5, 'to': 5.5, 'dp': 1, 'suf': '%', 'ms': 900})),
    step('Output-gap dial: b × (y − y*) = 0.5 × 1 = +0.5. The rule prescribes 2 + 3 + 0.5 + 0.5 = 6%: two points above neutral, because both sensors push the same way.',
         dict(pulse='fac'),
         dict(bars='b4', chart='bc', data=[[4, 6, '6%', 'amber']], bw=56, ms=900),
         dict(count='dial', **{'from': 5.5, 'to': 6, 'dp': 1, 'suf': '%', 'ms': 900})),
    step('Traders don\'t trade the 6% on its own. They compare it with what the bank is actually doing. Say the policy rate is 4.50%, and the market prices a terminal rate of 4.75%: about one more quarter-point move.',
         dict(hide='bc'), dict(hide='b1'), dict(hide='b2'), dict(hide='b3'), dict(hide='b4'),
         chart('gc', GAP, 'The rule vs. what\'s real (%)', GX, [0, 8.6],
               [[0, '0'], [2, '2'], [4, '4'], [6, '6'], [8, '8']], [[1, 'actual'], [2, 'priced'], [3, 'rule'], [4.3, 'after CPI']]),
         dict(bars='g1', chart='gc', data=[[1, 4.5, '4.50%', 'blue'], [2, 4.75, '4.75%', 'purple'], [3, 6, '6%', 'amber']], bw=56, ms=1100),
         series('pl', 'gc', [[1.75, 4.75], [5.3, 4.75]], 'purple', dash=True, ms=600)),
    step('The part nobody has priced: 6% − 4.75% = 1.25 percentage points. Actual policy below the rule means the bank is "behind the curve": looser than the data justify, so the risk is skewed toward hawkish repricing. (Policy above the rule would be "ahead of the curve": cut risk.)',
         dict(gap='gp1', chart='gc', top=[[3.3, 6], [3.45, 6]], bot=[[3.3, 4.75], [3.45, 4.75]], tone='red', op=0.6),
         cnote('gl1', 'gc', [3.5, 5.375], '1.25pp', 'red', 17, anchor='start'),
         note('behind', 300, 252, 'actual below the rule = behind the curve', 'red', 20),
         dict(hide='eq')),
    step('Then a hot CPI print: inflation jumps from 3% to 4%, output gap unchanged. Recompute in seconds: 2 + 4 + 0.5 × 2 + 0.5 × 1 = 7.5%. The inflation dial alone now adds a full point.',
         dict(hide='th'),
         icon('th2', 'thermo', 40, 8, 0.8, 'red', 'inflation 4%!\ntarget 2%', lsize=17),
         dict(pulse='th2'),
         dict(count='dial', **{'from': 6, 'to': 7.5, 'dp': 1, 'suf': '%', 'ms': 1100}),
         dict(bars='g2', chart='gc', data=[[4.3, 7.5, '7.5%', 'red']], bw=56, ms=1000)),
    step('Nothing has repriced yet, so the gap to the 4.75% priced terminal is now 7.5 − 4.75 = 2.75 points: more than doubled. The thermostat says pressure is building toward tighter policy. It is a signal of direction, not a forecast of the next meeting.',
         dict(gap='gp2', chart='gc', top=[[4.6, 7.5], [4.75, 7.5]], bot=[[4.6, 4.75], [4.75, 4.75]], tone='red', op=0.6),
         cnote('gl2', 'gc', [4.8, 6.125], '2.75pp', 'red', 17, anchor='start'),
         dict(hide='behind'),
         note('end', 300, 252, 'gap 1.25pp → 2.75pp: more behind the curve', 'red', 20)),
])


BOARD = dict(name='taylor', lesson='taylor-rule', title='The Taylor Rule as a thermostat, step by step', cfg=TAYLOR,
             before='  <div class="tl-box pitfall">\n    <div class="tl-icon-badge red">⚠️</div>\n    <div class="tl-box-label">Common pitfalls</div>',
             deck_after=9)
