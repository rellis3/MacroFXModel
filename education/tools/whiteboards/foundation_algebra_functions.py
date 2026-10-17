from ._wb import *

# ── Algebra & functions refresher (foundation-algebra-functions) ─────────────
# All numbers are the lesson's own: 2x + 3 = 11 -> x = 4; f(x) = x^2 + 1 with f(3) = 10,
# f(-1) = 2; inverse of 2x + 3 is (x - 3)/2; compound interest $1,000 at 5% for 5 years
# = $1,276.28, solved back to r = (1.27628)^(1/5) - 1 = 5%.
GROW = [[k, round(1000 * 1.05 ** k, 2)] for k in range(6)]
assert GROW[-1][1] == 1276.28
PAR = [[x / 10, round((x / 10) ** 2 + 1, 3)] for x in range(-30, 31, 2)]

FX = (10, 214, 580, 236)
GR = (10, 464, 580, 236)

ALG = dict(w=600, h=710, intro='A balance scale, a machine, and a formula run backwards. Gentle steps, real numbers from the lesson. Press play, or step through.', steps=[
    step('An equation is a balance scale that is level. On the left: two bags of the same unknown weight x, plus 3. On the right: 11. Both sides weigh the same.',
         box('L', 30, 30, 220, 80, 'left pan', 'blue', sub='2x + 3', size=20),
         note('eq', 300, 80, '=', None, 34),
         box('R', 350, 30, 220, 80, 'right pan', 'amber', sub='11', size=20)),
    step('The one rule: do the same thing to both sides, and the scale stays level. Take 3 off both sides. Now 2x balances 8.',
         dict(sub='L', text='2x'), dict(sub='R', text='8'), dict(pulse='L'), dict(pulse='R'),
         note('m1', 300, 150, 'take 3 off both sides', 'purple', 20)),
    step('Now halve both sides. One x balances 4. That is all "solving for x" means: peel away everything that isn\'t x, evenly, until x stands alone.',
         dict(sub='L', text='x'), dict(sub='R', text='4'), dict(pulse='L'), dict(pulse='R'),
         dict(hide='m1'), note('m2', 300, 150, 'halve both sides: x = 4', 'green', 20)),
    step('A function is a different thing: a machine. This one, f(x) = x² + 1, squares whatever you feed it and adds 1. Feed it 3 and out comes 10.',
         dict(hide='L'), dict(hide='R'), dict(hide='eq'), dict(hide='m2'),
         box('f', 200, 30, 200, 90, 'machine f', 'purple', sub='x² + 1', size=20),
         chip('in3', 80, 75, '3', 'blue'), move('in3', 170, 75, 900),
         chip('out10', 470, 75, '10', 'green')),
    step('Feed it −1 and out comes 2, because (−1)² + 1 = 2. One input always gives exactly one output. On a graph, every input becomes a point.',
         dict(hide='in3'), dict(hide='out10'),
         chip('inm1', 80, 75, '−1', 'blue'), move('inm1', 170, 75, 900),
         chip('out2', 470, 75, '2', 'green'),
         chart('fx', FX, 'Two machines on one graph', [-3.2, 4.4], [-1.5, 11],
               [[0, '0'], [5, '5'], [10, '10']], [[-3, '−3'], [-1, '−1'], [0, '0'], [1, '1'], [3, '3']], zero=True, pl=44, pr=24),
         series('par', 'fx', PAR, 'purple', ms=1400),
         dot('p3', 'fx', [3, 10], 'f(3) = 10', 'purple', dx=12, dy=5, anchor='start'),
         dot('pm1', 'fx', [-1, 2], 'f(−1) = 2', 'purple', dx=-12, dy=5, anchor='end')),
    step('A straight line is the simplest machine: y = 2x + 3. It climbs by the same amount, 2, every time x moves by 1. That fixed step is the slope. The curve\'s step keeps changing: that is what curving means.',
         series('lin', 'fx', [[-2.25, -1.5], [3, 9]], 'blue', ms=1000),
         series('st1', 'fx', [[1, 5], [2, 5], [2, 7]], 'amber', dash=True, ms=600),
         cnote('stl', 'fx', [2, 6], 'up 2', 'amber', 16, anchor='start', dx=8)),
    step('Running a machine backwards is its inverse. "Double it, add 3" turns 4 into 11. The undo machine takes away 3, then halves: 11 back to 4. Last step undone first.',
         dict(hide='inm1'), dict(hide='out2'), dict(hide='f'),
         box('fw', 10, 20, 280, 70, 'forward: × 2, then + 3', 'purple', sub='4 → 11', size=19),
         box('bk', 310, 20, 280, 70, 'undo: − 3, then ÷ 2', 'green', sub='11 → 4', size=19),
         arrow('fw', 'bk', None, 'green', bend=-30, id='fwbk')),
    step('Now a real formula. $1,000 earning 5% a year grows by multiplying by 1.05 each year: $1,050, $1,102.50, and after 5 years $1,276.28. That is FV = P(1 + r)ⁿ.',
         chart('gr', GR, 'Growing at 5% a year ($)', [-0.6, 5.6], [0, 1500],
               [[0, '0'], [1000, '1,000']], [[0, 'start'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5 yrs']], pl=58),
         dict(bars='gb', chart='gr', data=[[k, v, f'{v:,.2f}'.replace('.00', ''), 'blue' if k < 5 else 'amber'] for k, v in GROW], bw=52, ms=1400)),
    step('But often you know the start and the end, and want the rate. Run it backwards. Undo "times $1,000" first: 1,276.28 ÷ 1,000 = 1.27628.',
         dict(hide='fw'), dict(hide='bk'), dict(hide='fwbk'),
         box('b1', 10, 110, 180, 84, '÷ P', 'purple', sub='1.27628', size=20)),
    step('Next undo "to the power 5": take the fifth root. 1.27628 becomes 1.05, because 1.05 times itself five times is 1.27628.',
         box('b2', 210, 110, 180, 84, 'fifth root', 'purple', sub='1.05', size=20),
         arrow('b1', 'b2')),
    step('Last, undo "1 +": take away 1. The rate is 0.05, or 5% a year. Check it forwards: $1,000 × 1.05⁵ = $1,276.28. Same rule as the scale, on a bigger formula.',
         box('b3', 410, 110, 180, 84, '− 1', 'green', sub='r = 5%', size=20),
         arrow('b2', 'b3'), dict(pulse='b3')),
])


BOARD = dict(name='foundation_algebra_functions', lesson='foundation-algebra-functions',
             title='Balance scales, machines, and running a formula backwards', cfg=ALG,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)
