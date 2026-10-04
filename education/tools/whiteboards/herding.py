from ._wb import *

# ── Information cascades and a bubble's arc (herding-narratives-bubbles) ─────
# Restaurants: the lesson's telling of Banerjee's (1992) example (A has three tables,
# you go in, the next couple make it four; everyone's guidebook mildly prefers B).
# Cascade numbers, p = 0.7: both first clues right 0.49, both wrong 0.09;
# wrong cascade 0.09/0.58 = 15.5%; settled within 2/0.58 ≈ 3.4 people; a 20-person
# independent vote is wrong 3.3% (ties split). Nasdaq: closes 5,048.62 (10 Mar 2000)
# and 1,114.11 (9 Oct 2002), −78%; "nearly quadrupled" after 5 Dec 1996. The path
# between those points is an approximate monthly sketch, labelled "approx.".
LINE_Y, TX = 300, {-2: 100, -1: 200, 0: 300, 1: 400, 2: 500}
UP = [[1996.93, 1291], [1997.3, 1260], [1997.5, 1440], [1997.8, 1700], [1998.0, 1570], [1998.3, 1830],
      [1998.5, 1890], [1998.77, 1420], [1999.0, 2190], [1999.3, 2540], [1999.5, 2690], [1999.75, 2740],
      [1999.95, 4070], [2000.1, 4700], [2000.19, 5048.62]]
DOWN1 = [[2000.19, 5048.62], [2000.25, 4570]]
DOWN2 = [[2000.25, 4570], [2000.29, 3400], [2000.42, 3900], [2000.65, 4200], [2000.98, 2470], [2001.25, 1640],
         [2001.45, 2160], [2001.72, 1420], [2001.95, 1950], [2002.2, 1850], [2002.45, 1460], [2002.7, 1170],
         [2002.77, 1114.11]]
NQ = (10, 600, 580, 250)
HERD = dict(w=600, h=900, intro='Two restaurants, a crowd that copies, and the arithmetic of how a whole market ends up confidently wrong. Press play, or step through.', steps=[
    step('You arrive in a new town and find two restaurants side by side. Your guidebook mildly prefers B. But A has three tables of diners, and B is empty.',
         icon('rA', 'house', 40, 4, 0.8, 'green', 'A', lsize=22),
         icon('rB', 'house', 450, 4, 0.8, 'blue', 'B', lsize=22),
         icon('d1', 'person', 14, 128, 0.36, 'green'),
         icon('d2', 'person', 52, 128, 0.36, 'green'),
         icon('d3', 'person', 90, 128, 0.36, 'green'),
         icon('you', 'person', 270, 110, 0.5, None, 'you', lsize=17),
         icon('book', 'scroll', 330, 112, 0.42, 'blue', 'guidebook: B', lsize=16)),
    step('You reason, quite sensibly, that those diners probably knew something. So you ignore the mild tip in your book and walk into A.',
         move('you', 128, 118, 1100)),
    step('The next couple arrive. Their guidebook also mildly prefers B, but now A has four tables. They go to A too.',
         icon('c1', 'person', 270, 110, 0.4),
         icon('c2', 'person', 310, 110, 0.4),
         move('c1', 186, 124, 1000), move('c2', 224, 124, 1100)),
    step('The catch: after you, every choice tells the street nothing, because everyone would have picked A whatever their own book said. A busy restaurant can be full of people who each privately thought B was better.',
         note('priv', 214, 207, 'each privately: B', 'blue', 17),
         note('first', 57, 207, 'decided it', 'amber', 17),
         dict(pulse='rA')),
    step('Now the arithmetic. Each person\'s own clue is right 70% of the time. Keep a tally d: how many more "buy" clues than "pass" clues earlier actions gave away. While d is −1, 0 or +1, your own clue decides, so your action reveals it.',
         note('trk', 300, 243, 'tally d = buy clues − pass clues, given away so far', None, 17),
         dict(line='axis', points=[[80, LINE_Y], [520, LINE_Y]], width=2.5, ms=600),
         *[note(f'tk{k}', TX[k], LINE_Y + 26, ('+' if k > 0 else '−' if k < 0 else '') + str(abs(k)), None, 18) for k in TX],
         note('learn', 300, 268, 'your own clue decides', 'green', 17),
         chip('d', 300, LINE_Y, 'd', 'green')),
    step('Two "buy" clues in a row and d reaches +2. Now even a "pass" clue leaves you buying, so everyone copies, no action reveals anything new, and d never moves again. That is a cascade.',
         move('d', 400, LINE_Y, 600), move('d', 500, LINE_Y, 600),
         note('lockR', 500, 268, 'locked: copy', 'amber', 17)),
    step('It can lock onto the wrong side as easily. Both first clues right: 0.7 × 0.7 = 0.49. Both wrong: 0.3 × 0.3 = 0.09. It is a race, so the crowd herds the wrong way 0.09 ÷ 0.58, about 15.5% of the time, usually within the first three or four people.',
         chip('dw', 300, LINE_Y, 'd', 'red'),
         move('dw', 200, LINE_Y, 600), move('dw', 100, LINE_Y, 600),
         note('lockL', 100, 268, 'locked: copy', 'red', 17),
         note('pw', 100, 352, 'both wrong 0.09', 'red', 17),
         note('pr', 500, 352, 'both right 0.49', 'green', 17)),
    step('Compare 20 people who each act on their own clue and take a vote: wrong only about 3.3% of the time. Copying, rational for each person, makes the group about five times more likely to be wrong. The crowd holds the information of about two people, not twenty.',
         chart('wr', (10, 384, 280, 196), 'How often the crowd is wrong', [0, 2], [0, 18], [[5, '5%'], [15, '15%']],
               [[0.55, 'copying'], [1.45, '20 votes']], pl=46),
         dict(bars='wb', chart='wr', data=[[0.55, 15.5, '15.5%', 'red'], [1.45, 3.3, '3.3%', 'green']], bw=40, ms=1000)),
    step('Stories carry the cascade. A rising price is the most convincing evidence a story can have: price up, the story sounds truer, more people buy, price up again.',
         icon('story', 'megaphone', 318, 412, 0.5, 'purple'),
         note('storyl', 343, 400, '"a new era"', 'purple', 16),
         icon('pup', 'up', 506, 412, 0.5, 'green', 'price up', lsize=16),
         icon('buy', 'crowd', 412, 486, 0.5, 'amber', 'more buyers', lsize=16),
         arrow('story', 'pup', None, 'purple', id='l1'),
         arrow('pup', 'buy', None, 'green', id='l2'),
         arrow('buy', 'story', None, 'amber', id='l3')),
    step('The dot-com bubble. In December 1996 Greenspan asked how we would know when "irrational exuberance" had gone too far. The Nasdaq then nearly quadrupled, to a closing peak of 5,048.62 on 10 March 2000.',
         chart('nq', NQ, 'Nasdaq Composite (approx. path)', [1996.8, 2003.0], [0, 5800],
               [[1000, '1k'], [3000, '3k'], [5000, '5k']],
               [[1997, '1997'], [1998, '1998'], [1999, '1999'], [2000, '2000'], [2001, '2001'], [2002, '2002']], pl=44),
         dot('warn', 'nq', [1996.93, 1291], 'Dec 1996 warning', 'amber', dx=4, dy=26, anchor='start'),
         series('up', 'nq', UP, 'green', ms=1700),
         dot('pk', 'nq', [2000.19, 5048.62], '5,048.62', 'green', dx=-10, dy=-4, anchor='end')),
    step('The sceptics were right too early. Tiger Management, a value fund that would not buy the tech story, closed at the end of March 2000 after years of losses and withdrawals: within weeks of the top.',
         series('dn1', 'nq', DOWN1, 'red', ms=500),
         dot('tiger', 'nq', [2000.25, 4570], 'Tiger closes', 'purple', dx=12, dy=-6, anchor='start')),
    step('Then the panic. The leverage that forced buying on the way up forced selling on the way down. By 9 October 2002 the Nasdaq closed at 1,114.11: about 78% below the peak.',
         series('dn2', 'nq', DOWN2, 'red', ms=1700),
         dot('tr', 'nq', [2002.77, 1114.11], '1,114.11  (−78%)', 'red', dx=-8, dy=24, anchor='end')),
    step('Before you join or fight a crowd, ask what you know that the last buyer didn\'t. Write your own clue down before you look at the queue, and size so that being early can\'t force you out.',
         note('end', 300, 882, 'Your own clue, written first: the one thing a cascade throws away.', 'amber', 19),
         dict(pulse='book')),
])


BOARD = dict(name='herding', lesson='herding-narratives-bubbles', title='A cascade and a bubble, drawn step by step', cfg=HERD,
             before='  <!-- DESK:START -->\n  <h3>What the desk found</h3>',
             deck_after=7)
