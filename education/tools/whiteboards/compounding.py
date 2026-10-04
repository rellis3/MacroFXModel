from ._wb import *

# ── Returns, log-returns & compounding (primer-returns-compounding) ───────────
# Numbers are the lesson's worked example: $100 → +50% → $150 → −50% → $75; arithmetic
# mean 0%, real −25%; cross term 0.50 × −0.50 = −0.25; geometric mean √0.75 − 1 = −13.4%;
# ln 1.5 = 0.4055, ln 0.5 = −0.6931, sum −0.2877 = ln 0.75. The drag chart is the lesson's
# own illustrative chart: $100 at an 8%/year arithmetic mean for 20 years, compounded at
# g ≈ 8% − σ²/2: σ 20% → 6%/yr ($321), σ 40% → 0% ($100), σ 50% → −4.5% ($39.8), against
# the drag-free 8% projection ($466).
def _path(rate, years=20): return [[t, round(100 * (1 + rate) ** t, 1)] for t in range(years + 1)]

LOGC = (10, 282, 580, 170)
DRAG = (10, 466, 580, 250)

COMP = dict(w=600, h=796, intro='$100, one good period and one bad one, and what volatility does to compounding. Press play, or step through.', steps=[
    step('Start with $100 in a strategy. Two periods are coming: one up 50%, one down 50%. Sounds like it should come out even.',
         icon('c0', 'cash', 30, 40, 0.6, 'blue', '$100', sym='$', lsize=20)),
    step('Period one: up 50%. Fifty dollars arrive and the stack grows to $150.',
         chip('in', 60, 20, '+$50', 'green'),
         icon('c1', 'cash', 240, 14, 0.85, 'green', '$150', sym='$', lsize=20),
         arrow('c0', 'c1', '+50%', 'green', size=18),
         move('in', 282, 50, 1000), dict(hide='in')),
    step('Period two: down 50%. But half of $150 is $75, a bigger chunk than the $50 you gained. The loss comes off a bigger base, and you are left with $75.',
         chip('out', 282, 50, '−$75', 'red'),
         move('out', 400, 128, 1000),
         icon('c2', 'cash', 480, 52, 0.45, 'red', '$75', sym='$', lsize=20),
         arrow('c1', 'c2', '−50%', 'red', size=18),
         dict(hide='out')),
    step('Average the two returns the obvious way and you get 0%: "nothing happened". Your account says −25%. The missing piece is the cross term: 0.50 × −0.50 = −0.25.',
         box('avg', 10, 140, 285, 80, 'average of the two\n(+50% − 50%) ÷ 2 = 0%', None, size=18),
         box('real', 305, 140, 285, 80, 'what you have\n$100 → $75 = −25%', 'red', size=18),
         dict(cross='avg'),
         note('cross', 300, 238, '+0.50 − 0.50 + (0.50 × −0.50) = −0.25', 'amber', 18)),
    step('The geometric mean asks which steady return gets you to the same place: √(1.50 × 0.50) − 1 ≈ −13.4% a period. Compound that twice and you land on $75.',
         note('geo', 300, 264, 'geometric mean: √0.75 − 1 ≈ −13.4% a period', 'blue', 18)),
    step('Log returns are built to add up. ln(1.5) = +0.405 and ln(0.5) = −0.693. Add them and you get −0.288, exactly ln(75 ÷ 100). No cross term, no approximation.',
         chart('lg', LOGC, 'Log returns simply add', [0.4, 4.6], [-1.1, 0.8], [], [[1, 'ln 1.5'], [2, 'ln 0.5'], [3, 'add them'], [4, 'ln 0.75']], zero=True, pl=20),
         dict(bars='lb1', chart='lg', data=[[1, 0.405, '+0.405', 'green'], [2, -0.693, '−0.693', 'red']], bw=48, ms=900),
         dict(bars='lb2', chart='lg', data=[[3, -0.288, '−0.288', 'amber'], [4, -0.288, '−0.288', 'purple']], bw=48, ms=900)),
    step('Now many periods. $100 at an 8% average return a year, for 20 years. With no wobble it would reach $466. With 20% volatility the drag is σ²/2 = 2% a year, so it compounds at about 6% and ends near $321.',
         chart('dr', DRAG, '$100 at an 8% average, 20 years (illustrative)', [0, 20], [0, 500],
               [[100, '$100'], [300, '$300']], [[0, '0'], [10, '10 years'], [20, '20']], pl=52, pr=14),
         series('proj', 'dr', _path(0.08), 'chalk', dash=True, ms=800),
         cnote('lp', 'dr', [0.5, 455], '- - no wobble: $466', None, 17, anchor='start'),
         series('g20', 'dr', _path(0.06), 'green', ms=1400),
         cnote('l20', 'dr', [0.5, 395], 'σ 20%: g ≈ 6% → $321', 'green', 17, anchor='start'),
         dict(gap='drag', chart='dr', top=_path(0.08), bot=_path(0.06), tone='amber', op=0.2),
         cnote('dl', 'dr', [18.6, 345], 'drag', 'amber', 17, anchor='end')),
    step('Double the volatility to 40% and the drag doesn\'t double, it quadruples: σ²/2 = 8% a year. That eats the whole 8% average, and after 20 years you are back at $100.',
         series('g40', 'dr', _path(0.0), 'amber', ms=1200),
         cnote('l40', 'dr', [0.5, 335], 'σ 40%: g ≈ 0% → $100', 'amber', 17, anchor='start')),
    step('At 50% volatility the drag is 12.5% a year, more than the 8% average. The account shrinks to about $40, even though the average return every year is positive.',
         series('g50', 'dr', _path(-0.045), 'red', ms=1200),
         cnote('l50', 'dr', [0.5, 275], 'σ 50%: g ≈ −4.5% → $40', 'red', 17, anchor='start'),
         dict(pulse='c2')),
    step('So never accept "average return" without asking which average. The arithmetic mean is a typical single period; the geometric mean is what your money did. The gap between them is volatility drag.',
         icon('sc', 'scales', 20, 726, 0.62, 'purple'),
         note('w1', 96, 742, 'arithmetic = a typical period', None, 18, anchor='start'),
         note('w2', 96, 770, 'geometric = what your money did', 'blue', 18, anchor='start'),
         dict(pulse='real')),
])


BOARD = dict(name='compounding', lesson='primer-returns-compounding', title='+50% then −50% is not break-even', cfg=COMP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: products that compound every day</h2>',
             deck_after=8)
