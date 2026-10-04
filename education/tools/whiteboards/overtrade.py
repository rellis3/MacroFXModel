from ._wb import *

# ── Overconfidence and overtrading (overconfidence-overtrading) ───────────────
# The lesson's worked example: turnover T = 250%, round-trip cost k = 1%, so the
# drag D = T × k = 2.5% a year. 100 at 10% for 20 years → 672.7; at 7.5% → 424.8;
# share of the gain lost = 1 − 324.8 / 572.7 ≈ 43%.
# Barber & Odean (2000): 66,465 households, 1991–96: market 17.9%, average household
# 16.4% net, most active fifth 11.4% net. Barber & Odean (2001): men traded 45% more;
# trading cut net returns by 2.65 points a year for men, 1.72 for women.
GROSS = [[t, round(100 * 1.10 ** t, 1)] for t in range(21)]
NET = [[t, round(100 * 1.075 ** t, 1)] for t in range(21)]
GC = (10, 272, 580, 290)
BO = (10, 584, 370, 240)
MW = (395, 584, 195, 240)
FEE_FROM, BANK = (531, 134), (292, 44)
def fee(id, x, y): return [chip(id, x, y, 'fee', 'red'), move(id, *BANK, 650), dict(hide=id)]
OT = dict(w=600, h=880, intro='Two traders with the same skill, one fee per round trip, and twenty years of compounding. Press play, or step through.', steps=[
    step('Two traders with exactly the same skill. She knows how much she does not know and trades when she has a real reason. He feels a bit more sure about every idea.',
         icon('she', 'person', 30, 8, 0.6, 'green', 'she'),
         icon('he', 'person', 500, 8, 0.6, 'amber', 'he: a bit\ntoo sure', lsize=17)),
    step('In the middle sits the market maker and the broker. Every round trip, sell one thing and buy another, pays the spread and commission on both legs, win or lose.',
         icon('mm', 'bank', 257, 6, 0.7, 'red', 'market maker\n& broker', sym='$', lsize=17)),
    step('She pays the fee when she has a reason to trade.',
         *fee('s1', 62, 134),
         note('sn', 60, 150, '1 fee', 'green', 18)),
    step('He trades more often, sizes a bit bigger and switches ideas faster, so he pays the same fee three or four times as often. No single trade shows it. It is a steady leak.',
         *fee('h1', *FEE_FROM), *fee('h2', *FEE_FROM), *fee('h3', *FEE_FROM), *fee('h4', *FEE_FROM),
         note('hn', 531, 150, '4 fees', 'amber', 18),
         dict(pulse='mm')),
    step('Price the leak. Turnover T is how much of the book is replaced in a year; k is the cost of one round trip. The yearly drag is about T × k.',
         box('T', 10, 170, 170, 80, 'turnover T', 'amber', sub='250% a year', size=19),
         note('x', 197, 210, '×', None, 28),
         box('k', 215, 170, 170, 80, 'round trip k', 'red', sub='1%', size=19),
         note('eq', 402, 210, '=', None, 28),
         box('D', 420, 170, 170, 80, 'drag D', 'red', sub='0%', size=19),
         dict(count='D', **{'from': 0, 'to': 2.5, 'dp': 1, 'suf': '% a year', 'ms': 1000})),
    step('250% turnover means the whole portfolio is replaced every four to five months. Now watch 100 grow for 20 years at 10% a year, before costs: it reaches 672.7.',
         chart('g', GC, 'Growth of 100 over 20 years', [0, 20], [0, 720], [[100, '100'], [400, '400'], [700, '700']],
               [[0, '0'], [10, '10 yrs'], [20, '20 yrs']], pl=48, pr=70),
         series('gross', 'g', GROSS, 'green', ms=1500, label='672.7', lanchor='start', ldx=8, ldy=0)),
    step('Same portfolio, same picks, minus the 2.5-point drag: 7.5% a year. After 20 years it reaches only 424.8.',
         series('net', 'g', NET, 'red', ms=1500, label='424.8', lanchor='start', ldx=8, ldy=0)),
    step('The shaded wedge is what the trading cost. A drag that is a quarter of the yearly return takes about 43% of the 20-year profit, because the money paid in costs never gets to compound.',
         dict(gap='w', chart='g', top=GROSS, bot=NET, tone='red', op=0.22),
         cnote('wl', 'g', [8.5, 420], 'what trading cost:\n≈43% of the gain', 'red', 19, anchor='end')),
    step('Real accounts: Barber and Odean (2000) followed 66,465 households at a US discount broker, 1991–96. The market returned 17.9% a year; the average household earned 16.4% net.',
         chart('bo', BO, '66,465 households, % a year', [0.4, 3.6], [0, 20], [[0, '0'], [10, '10'], [20, '20']],
               [[1, 'market'], [2, 'average'], [3, 'most active']], pt=40),
         dict(bars='b1', chart='bo', data=[[1, 17.9, '17.9', 'blue'], [2, 16.4, '16.4', 'amber']], bw=46, ms=1000)),
    step('The fifth that traded most earned just 11.4% net, 6.5 points a year behind the market. Before costs their picks were roughly as good as everyone else\'s: the gap was spread and commission, paid over and over.',
         dict(bars='b2', chart='bo', data=[[3, 11.4, '11.4', 'red']], bw=46, ms=1000),
         dict(pulse='he')),
    step('Boys Will Be Boys (2001), same broker: men traded 45% more than women, and trading cut their net returns by 2.65 points a year, against 1.72 for women.',
         chart('mw', MW, 'lost to trading', [0.3, 2.7], [0, 3], [[0, '0'], [1, '1'], [2, '2'], [3, '3']], [[1, 'men'], [2, 'women']], pl=32, pt=40),
         dict(bars='b3', chart='mw', data=[[1, 2.65, '2.65', 'red'], [2, 1.72, '1.72', 'amber']], bw=40, ms=1000)),
    step('Feeling sure is not an edge, and every extra trade has to earn more than its fee just to break even. Budget your turnover, and work out cost against the move before the idea.',
         chip('fix', 300, 852, 'budget your turnover · cost ÷ move first', 'green'),
         dict(pulse='she')),
])


BOARD = dict(name='overtrade', lesson='overconfidence-overtrading', title='How trading more eats returns, drawn step by step', cfg=OT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>Two quieter biases that feed it</h2>',
             deck_after=5)
