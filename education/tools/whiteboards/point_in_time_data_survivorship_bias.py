from ._wb import *

# ── Point-in-time data and survivorship bias (point-in-time-data-survivorship-bias) ──
# Numbers are the lesson's own: March GDP printed 1.9% on Apr 28, revised to 1.6% on
# May 26 and 1.4% on Jun 25; a query as of Apr 15 has no value, as of May 30 → 1.6%.
# Funds: 100 start, 20 close averaging −15% a year, 80 survive at 9% → true 4.2%.
# 1992: Brown, Goetzmann, Ibbotson & Ross, persistence manufactured by a closing rule.


def tx(d):
    """Timeline x for d days after 31 March."""
    return round(40 + d * 5.8, 1)


FUNDS = [box('f%d' % i, 20 + i * 56, 404, 46, 40, '10', 'blue', size=17) for i in range(10)]

PIT = dict(w=600, h=775, intro='One March GDP figure and three answers, then a hundred funds and the twenty nobody remembers. Press play, or step through.', steps=[
    step('A statistics office will publish a figure for March GDP. On 31 March the month is over, but the number does not exist yet.',
         icon('stat', 'govt', 60, 6, 0.7, 'blue', 'statistics office', lsize=17),
         dict(line='tl', points=[[30, 170], [575, 170]], tone=None, width=3, ms=900),
         dict(line='t0', points=[[tx(0), 160], [tx(0), 180]], width=3, ms=200),
         note('d0', tx(0) + 8, 196, 'Mar 31', None, 17)),
    step('28 April: the first print. March GDP is 1.9%. Two kinds of store record it: one keeps a single current value, the other keeps every dated version.',
         dict(line='t1', points=[[tx(28), 160], [tx(28), 180]], width=3, ms=200),
         chip('v1', tx(28), 136, '1.9%', 'blue'),
         note('d1', tx(28), 196, 'Apr 28', 'blue', 17),
         box('over', 20, 262, 260, 80, 'current-value table', 'red', sub='March: 1.9%', size=19),
         box('snap', 320, 262, 260, 80, 'dated snapshot store', 'green', sub='1.9 (Apr 28)', size=19)),
    step('First, a test. A backtest asks: what was March GDP as of 15 April? The honest answer is nothing. The month had ended, but the figure was not published until 28 April.',
         chip('q1', tx(15), 230, 'as of Apr 15: none', 'red')),
    step('26 May: the first revision. March GDP is now 1.6%. The current-value table overwrites 1.9 in place, so the first print is gone. The snapshot store adds a new dated record.',
         dict(hide='q1'),
         dict(line='t2', points=[[tx(56), 160], [tx(56), 180]], width=3, ms=200),
         chip('v2', tx(56), 136, '1.6%', 'amber'),
         note('d2', tx(56), 196, 'May 26', 'amber', 17),
         dict(sub='over', text='March: 1.6%'), dict(pulse='over'),
         dict(sub='snap', text='1.9 · 1.6')),
    step('25 June: the second revision, 1.4%. Three different numbers, all called March GDP. The table now only knows the last one.',
         dict(line='t3', points=[[tx(86), 160], [tx(86), 180]], width=3, ms=200),
         chip('v3', tx(86), 136, '1.4%', 'green'),
         note('d3', tx(86) - 10, 196, 'Jun 25', 'green', 17),
         dict(sub='over', text='March: 1.4%'), dict(pulse='over'),
         dict(sub='snap', text='1.9 · 1.6 · 1.4')),
    step('Now a backtest asks for March GDP as of 30 May. The snapshot store returns 1.6%, the last version published by then. The current-value table returns 1.4%, a number nobody had until 25 June. That is lookahead hiding in an ordinary-looking history.',
         chip('q2', tx(60) + 10, 230, 'as of May 30?', 'red'),
         note('a1', 150, 364, 'says 1.4%: from the future', 'red', 18),
         note('a2', 450, 364, 'says 1.6%: correct', 'green', 18),
         dict(cross='over')),
    step('The second trap is about which rows exist at all. A hundred funds start a decade. Each square here is ten funds.',
         *FUNDS),
    step('Twenty of them do so badly they are closed or merged away, averaging −15% a year before they fold. They vanish from any list of funds that are open today.',
         dict(cross='f8'), dict(cross='f9'), dict(dim='f8'), dict(dim='f9'),
         note('gone', 512, 470, '20 closed', 'red', 18)),
    step('A database of funds open today can only average the 80 survivors: 9% a year. No single number in it is wrong.',
         chart('avg', (20, 488, 340, 240), 'Average return, % a year', [0.4, 3.6], [-23, 14],
               [[-15, '−15'], [0, '0'], [9, '9']], [[1, 'survivors'], [2, 'all 100'], [3, 'closed']], zero=True, pl=44, pt=48),
         dict(bars='b1', chart='avg', data=[[1, 9, '9%', 'amber']], bw=48, ms=900)),
    step('Put the 20 back. 80 × 9 minus 20 × 15 is 720 − 300 = 420, spread over 100 funds: 4.2%. The survivors-only figure is more than double the truth.',
         dict(bars='b2', chart='avg', data=[[3, -15, '−15%', 'red']], bw=48, ms=900),
         dict(bars='b3', chart='avg', data=[[2, 4.2, '4.2%', 'green']], bw=48, ms=900)),
    step('It can do worse than shift an average. In 1992 Brown, Goetzmann, Ibbotson and Ross simulated managers with no skill at all, closed the funds whose results fell far enough, and the standard test then found winners kept winning. The filter made the pattern.',
         dict(hide='gone'),
         box('hot', 378, 496, 202, 160, '1992:\nno-skill managers\n+ a closing rule\n= "hot hands"', 'red', size=18)),
    step('Two rules follow. Key every query to the date a number was published, and keep the dead in the universe.',
         note('end', 300, 756, 'ask what was known on the day, and who was still in the room', 'amber', 18)),
])


BOARD = dict(name='point_in_time_data_survivorship_bias', lesson='point-in-time-data-survivorship-bias',
             title='Vintages and survivors, drawn step by step', cfg=PIT,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=6)
