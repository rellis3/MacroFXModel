from ._wb import *
from math import sqrt

# ── The Fundamental Law and the breadth trap (active-portfolio-management) ───
# Numbers are the lesson's own: IC = 0.10; 9 G10 pairs re-ranked 4 times a year → BR = 36,
# IR ≈ 0.10 × √36 = 0.60, matching α 3.0% / ω 5.0%; one dollar view → BR = 4, IR ≈ 0.20.
# Episode: August 2007 quant quake (week of 6 August; Goldman GEO reported down > 30% in
# about a week; roughly $3bn injected mid-August; sharp rebound Friday 10 August).
# The curve is the lesson's formula IR = IC √BR at IC = 0.10, computed here.
LAW = [[b, round(0.10 * sqrt(b), 4)] for b in [0, 0.25, 0.5, 1, 2, 3] + list(range(4, 65, 2))]
CH = (10, 330, 580, 290)
PAIRS = [f'p{i}' for i in range(9)]
TOP = ['fc', 'ic', 'n9', 'chk', 'box1', 'one'] + PAIRS

APM = dict(w=600, h=630, intro='How a small edge per call becomes a strong track record, and how correlated calls fake it. The lesson\'s own numbers, then August 2007. Press play, or step through.', steps=[
    step('Meet a forecaster. His calls correlate with what actually happens at 0.10. That is his information coefficient, IC: skill per call. It sounds tiny, but 0.05 to 0.10 is genuinely good.',
         icon('fc', 'person', 20, 8, 0.75, 'blue', 'forecaster', lsize=17),
         box('ic', 130, 18, 210, 72, 'skill per call', 'blue', sub='IC = 0.10', size=20)),
    step('He re-ranks nine G10 currency pairs, four times a year. Taken at face value, that is 9 × 4 = 36 separate calls a year: his breadth, BR.',
         *[chip(p, 80 + (i % 5) * 110, 132 + (i // 5) * 44, f'pair {i + 1}', 'purple') for i, p in enumerate(PAIRS)],
         note('n9', 300, 226, '9 pairs × 4 re-ranks = 36 calls a year', 'purple', 19)),
    step('The Fundamental Law: IR ≈ IC × √BR. Independent bets let the noise cancel while the edge adds up, so the Information Ratio grows with the square root of breadth. Here: 0.10 × √36 = 0.10 × 6 = 0.60.',
         chart('law', CH, 'Information Ratio vs breadth, at IC = 0.10', [0, 64], [0, 0.8],
               [[0, '0'], [0.2, '0.2'], [0.4, '0.4'], [0.6, '0.6']], [[4, '4'], [16, '16'], [36, '36'], [64, '64']], pl=50, pr=20),
         series('curve', 'law', LAW, 'purple', ms=1500),
         dot('d36', 'law', [36, 0.6], '36 calls → 0.60', 'green', dx=-8, dy=-18, anchor='end')),
    step('A check from the other side: 3.0% a year over the benchmark, with 5.0% tracking error, gives IR = 3.0 ÷ 5.0 = 0.60. The same number, two ways.',
         box('chk', 370, 18, 215, 72, 'α ÷ ω = 3.0% ÷ 5.0%', 'green', sub='IR = 0.60', size=19)),
    step('But are those nine pairs nine separate views? In a dollar-strength regime, all nine move together with the dollar. Nine rankings, one view.',
         dict(hide='n9'),
         dict(line='one', points=[[14, 108], [586, 108], [586, 198], [14, 198], [14, 108]], tone='red', width=3, ms=900),
         note('n1', 300, 226, 'really one dollar view: 1 × 4 = 4 calls a year', 'red', 19)),
    step('True breadth is 4, not 36. The law now predicts 0.10 × √4 = 0.20. Same skill, a third of the Information Ratio. Nothing in the arithmetic warns you: only checking how correlated the calls are does.',
         dot('d4', 'law', [4, 0.2], '4 → 0.20', 'red', dx=14, dy=16, anchor='start'),
         dict(pulse='d4')),
    step('August 2007. Quant equity funds were this law at industrial scale: thousands of longs and shorts each, a small edge per stock, market beta hedged out. On paper, enormous breadth.',
         *[dict(hide=i) for i in TOP + ['n1']],
         icon('funds', 'crowd', 30, 8, 0.85, 'blue', 'quant funds', lsize=17),
         box('box1', 170, 22, 250, 80, 'thousands of positions each\nsmall edge per stock', 'blue', size=18)),
    step('But many ranked stocks on similar ideas: value, momentum, earnings quality, short-term reversal. So their books overlapped. Thousands of bets shared one hidden factor: what crowded quant funds owned.',
         note('same', 300, 150, 'similar models → overlapping books', 'amber', 20)),
    step('In the week of 6 August, a large fund is thought to have unwound its quant book fast, probably to raise cash (Khandani and Lo\'s hypothesis). Its selling hit everyone\'s longs and lifted everyone\'s shorts.',
         icon('unw', 'fire', 470, 8, 0.8, 'red', 'one big unwind', lsize=17),
         arrow('unw', 'box1', 'sells', 'red')),
    step('Every fund lost at once and hit its limits, so they cut the same positions, deepening the move. Goldman\'s Global Equity Opportunities fund was reported down more than 30% in about a week.',
         dict(hide='same'),
         box('geo', 120, 190, 360, 72, 'Goldman GEO fund', 'red', sub='> −30% in about a week', size=19)),
    step('In this lesson\'s terms, effective breadth collapsed towards one: thousands of positions behaved like a single bet. Prices rebounded sharply on Friday 10 August, after many funds had already cut.',
         dot('d1', 'law', [1, 0.1], 'breadth ≈ 1', 'amber', dx=14, dy=20, anchor='start'),
         dict(pulse='d1')),
    step('The rule to carry away: breadth counts independent bets, not trade tickets. Check how correlated your calls are before you trust the square root.',
         note('rule', 300, 296, 'breadth = independent bets, not tickets', 'green', 21)),
])


BOARD = dict(name='active_portfolio_management', lesson='active-portfolio-management',
             title='Skill, breadth and the August 2007 quant quake, step by step', cfg=APM,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=12)
