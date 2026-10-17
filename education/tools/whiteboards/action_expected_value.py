from ._wb import *

# ── Thinking in expected value (action-expected-value) ───────────────────────
# The lesson's two traders: A right 70% with wins of 0.4R (E = −0.02R, break-even 71.4%,
# 75% with a 0.05R cost); B right 40% with wins of 2R (E = +0.20R, break-even 33.3%).
# The no-edge hit rate S/(S+T) = 1/(1+b): 50% at 1R, 25% at 3R. Worked example: b = 2.5,
# c = 0.0375R, base rate 28.6%, count 12/30 = 40%, shrunk with m = 30 to 34.3%,
# E = +0.16R, about 418 trades to tell it from luck.
A_P, A_B, B_P, B_B, C = 0.70, 0.40, 0.40, 2.0, 0.05
assert round(A_P * A_B - (1 - A_P), 2) == -0.02 and round(B_P * B_B - (1 - B_P), 2) == 0.20
assert round(100 / (1 + A_B), 1) == 71.4 and round(100 * (1 + C) / (1 + A_B), 1) == 75.0
P0 = 40 / 140
PHAT = (12 + 30 * P0) / 60
E_EX = PHAT * 2.5 - (1 - PHAT) - 1.5 / 40
assert round(P0 * 100, 1) == 28.6 and round(PHAT * 100, 1) == 34.3 and round(E_EX, 2) == 0.16

BE = [[b / 20, round(1 / (1 + b / 20), 4)] for b in range(0, 61)]
BEC = [[b / 20, round(min(1, (1 + C) / (1 + b / 20)), 4)] for b in range(0, 61)]

def trades(p_wins, win, n=10):
    k = round(p_wins * n)
    return [[i + 1, win, '', 'green'] for i in range(k)] + [[i + 1, -1.0, '', 'red'] for i in range(k, n)]

TEN = dict(xd=[0.4, 10.6], yd=[-1.3, 2.3], yt=[[2, '+2R'], [0, '0'], [-1, '−1R']], xt=[[1, '1'], [10, '10']], zero=True, pl=46, pr=10)
EV = dict(w=600, h=760, intro='Two traders, ten trades each, and the line every trade has to clear. Then where an honest probability comes from. Press play, or step through.', steps=[
    step('Two traders. A is right 70% of the time but takes profits quickly: a win pays 0.4R, where R is what a loss costs. B is right only 40% of the time, but a win pays 2R. Who makes more?',
         icon('ta', 'person', 30, 18, 0.7, 'amber', 'A: right 70%\nwins 0.4R', lsize=17),
         icon('tb', 'person', 330, 18, 0.7, 'blue', 'B: right 40%\nwins 2R', lsize=17)),
    step('Ten of A\'s trades: seven small wins of 0.4R and three full losses of 1R. Lots of green.',
         chart('ca', (10, 140, 285, 210), 'A: ten trades', TEN['xd'], TEN['yd'], TEN['yt'], TEN['xt'], zero=True, pl=46, pr=10),
         dict(bars='ba', chart='ca', data=trades(A_P, A_B), bw=16, ms=1200)),
    step('Ten of B\'s trades: six full losses and four wins of 2R. Mostly red.',
         chart('cb', (305, 140, 285, 210), 'B: ten trades', TEN['xd'], TEN['yd'], TEN['yt'], TEN['xt'], zero=True, pl=46, pr=10),
         dict(bars='bb', chart='cb', data=trades(B_P, B_B), bw=16, ms=1200)),
    step('Now count the money. A: 7 × 0.4 − 3 × 1 = −0.2R over ten trades. B: 4 × 2 − 6 × 1 = +2.0R. The trader who is wrong more often is the one who is ahead.',
         box('sa', 10, 358, 285, 56, 'A over ten', 'red', sub='0.0R', size=18),
         dict(count='sa', **{'from': 0, 'to': -0.2, 'dp': 1, 'suf': 'R', 'ms': 1100}),
         box('sb', 305, 358, 285, 56, 'B over ten', 'green', sub='0.0R', size=18),
         dict(count='sb', **{'from': 0, 'to': 2.0, 'dp': 1, 'pre': '+', 'suf': 'R', 'ms': 1100})),
    step('That weighing is expected value: E = p × b − (1 − p) − c, the average R per trade after the cost c. Before costs, A makes −0.02R a trade and B makes +0.20R.',
         note('ev', 300, 446, 'E = p·b − (1 − p) − c', 'purple', 22)),
    step('Set E to zero and every payoff gets a break-even win rate: 1 ÷ (1 + b). At 0.4R you need 71.4%, so A at 70% sits just under the line. At 2R you need 33.3%, and B at 40% sits well above it.',
         chart('map', (10, 462, 360, 290), 'win rate needed vs payoff', [0, 3], [0, 1],
               [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']], [[0, '0'], [1, '1R'], [2, '2R'], [3, '3R']], pl=58, pr=14),
         series('be', 'map', BE, None, ms=1300),
         dot('da', 'map', [A_B, A_P], 'A', 'red', dx=12, dy=-12, anchor='start'),
         dot('db', 'map', [B_B, B_P], 'B', 'green', dy=-16)),
    step('Costs lift the line. With a 0.05R toll on every trade, A now needs 75%, not 71.4%. Small wins leave little room to pay for trading.',
         series('bec', 'map', BEC, 'amber', dash=True, ms=1200),
         cnote('becl', 'map', [1.15, 0.9], 'dashed: + 0.05R cost', 'amber', size=15, anchor='start')),
    step('Here is the twist. In a market with no edge, the chance of hitting a target before the stop is S ÷ (S + T), which is 1 ÷ (1 + b): exactly the break-even line. A 1R target is hit half the time, a 3R target a quarter of the time. EV stays at zero either way.',
         dict(dim='bec'), dict(dim='becl'), dict(dim='da'), dict(dim='db'),
         dot('n1', 'map', [1, 0.5], '1R: 50%', 'blue', dx=10, dy=-14, anchor='start'),
         dot('n3', 'map', [3, 0.25], '3R: 25%', 'blue', dx=-6, dy=20, anchor='end'),
         box('noedge', 385, 462, 205, 132, 'no edge:\nmoving the target\nslides you along\nthe line', 'blue', size=18)),
    step('So an edge means beating the line for the stop and target you chose. Worked example: a EUR/USD trade with a 2.5R target. A random market hits it first 40 ÷ 140 = 28.6% of the time. That is the base rate.',
         dict(hide='n1'), dict(hide='n3'), dict(hide='da'), dict(hide='db'),
         dot('p0', 'map', [2.5, P0], 'base 28.6%', 'blue', dy=20),
         box('prob', 385, 612, 205, 140, 'b = 2.5\nbase rate', 'purple', sub='28.6%', size=18)),
    step('The analysis found 12 wins in 30 past cases: 40%. But 30 cases is a small sample, so pull the count back toward the base rate, worth 30 pretend cases: (12 + 30 × 0.286) ÷ 60 = 34.3%.',
         dot('raw', 'map', [2.5, 0.40], 'count 40%', 'amber', dy=-16),
         dot('shr', 'map', [2.5, PHAT], '34.3%', 'green', dx=-10, dy=0, anchor='end'),
         dict(sub='prob', text='12/30 → shrunk 34.3%')),
    step('EV after a 0.0375R cost: 0.343 × 2.5 − 0.657 − 0.0375 = +0.16R a trade. Positive, but thin. A trade like this swings about 1.66R, so it takes about 418 trades before the record can tell this edge from luck.',
         dict(hide='noedge'),
         box('evx', 385, 462, 205, 132, 'E = +0.16R\n≈ 418 trades\nto show', 'green', size=19)),
    step('The habit: write the payoff, the cost, the base rate and an honest probability before the order goes in. Your edge is how far you sit above the line, not how often you are right.',
         dict(pulse='be'), dict(pulse='shr')),
])


BOARD = dict(name='action_expected_value', lesson='action-expected-value', title='Expected value: the line every trade has to clear', cfg=EV,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=7)
