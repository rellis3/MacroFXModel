from ._wb import *

# ── Drawdowns and risk of ruin (drawdowns-risk-of-ruin) ───────────────────────
# Equity as % of the peak. The run-up is an illustrative mix of ±2% trades
# (W W L W L W W W L L W W W L W W L W W W) scaled so trade 20 is the peak;
# the slide is the lesson's worked example: nine 2% losses, 0.98^k.
UP = [[0, 85.6], [1, 87.3], [2, 89.0], [3, 87.2], [4, 89.0], [5, 87.2], [6, 88.9], [7, 90.7], [8, 92.5], [9, 90.7],
      [10, 88.9], [11, 90.6], [12, 92.5], [13, 94.3], [14, 92.4], [15, 94.3], [16, 96.2], [17, 94.2], [18, 96.1],
      [19, 98.0], [20, 100.0]]
DOWN = [[20 + k, round(100 * 0.98 ** k, 2)] for k in range(10)]   # 100 → 83.37
EQ = (10, 128, 580, 222)
REC = (10, 368, 285, 236)
RUIN = (10, 622, 380, 200)
DD = dict(w=600, h=830, intro='A winning system, a normal losing streak, and the arithmetic of the hole it leaves. Press play, or step through.', steps=[
    step('Meet the setup: you, a loaded coin that wins 55% of the time, and an account. Wins and losses are the same size, and you risk 2% of the account on each flip. That is a real edge: +0.10R a trade on average.',
         icon('you', 'person', 30, 4, 0.62, None, 'you'),
         icon('coin', 'coin', 262, 4, 0.62, 'green', 'wins 55%', sym='55'),
         icon('acct', 'piggy', 488, 4, 0.62, 'blue', 'account', sym='$'),
         arrow('you', 'coin', 'flip', size=17),
         arrow('coin', 'acct', '±2% a flip', 'blue', size=17)),
    step('The account climbs, with the odd loss along the way, to a new high. That high is the peak every drawdown is measured from.',
         chart('eq', EQ, 'Your account, % of its peak (illustrative)', [0, 40], [80, 103], [[85, '85'], [100, '100']], [[0, '0'], [20, '20'], [29, '29'], [40, '40']]),
         series('up', 'eq', UP, 'green', ms=1500),
         dot('pk', 'eq', [20, 100], 'peak', 'green', dy=-14)),
    step('Then nine losses in a row. Each one takes 2% of what is left: 0.98 to the ninth power is 0.834, so you are down 16.6% from the peak.',
         series('dn', 'eq', DOWN, 'red', ms=1600),
         dot('tr', 'eq', [29, 83.37], '−16.6%', 'red', dx=12, dy=4, anchor='start'),
         dict(pulse='acct')),
    step('Now the recovery has to start from the smaller base. 16.6% of the peak, earned back on 83.4%, is a gain of 19.9%: more than you lost.',
         series('pkl', 'eq', [[20, 100], [40, 100]], 'amber', dash=True, ms=500),
         series('climb', 'eq', [[35, 83.37], [35, 100]], 'amber', dash=True, ms=500),
         cnote('need', 'eq', [35.8, 91.5], 'needs\n+19.9%', 'amber', 18, anchor='start')),
    step('That gap is the rule: a drawdown d needs a gain of d ÷ (1 − d). Down 20%, you need +25%. Down 50%, the half that is left has to double: +100%.',
         chart('rec', REC, 'Fall vs gain to get back', [0, 3.1], [0, 330], [[100, '100%'], [300, '300%']], [[0.6, '−20%'], [1.6, '−50%'], [2.6, '−75%']], pl=50),
         dict(bars='b1', chart='rec', data=[[0.45, 20, '', 'red'], [0.78, 25, '+25%', 'green'], [1.45, 50, '', 'red'], [1.78, 100, '+100%', 'green']], bw=26, ms=1000)),
    step('Down 75%, you need +300%. Small holes are almost symmetric; big ones explode. Keep drawdowns where the curve is still flat.',
         dict(bars='b2', chart='rec', data=[[2.45, 75, '', 'red'], [2.78, 300, '+300%', 'green']], bw=26, ms=1200),
         dict(pulse='b2')),
    step('How surprising was the streak? The chance that a run of 8 losses starts on one particular trade is 0.45 to the eighth power: about 1 in 595. Sounds rare.',
         *[icon(f't{i}', 'coin', 318 + i * 34, 370, 0.34, 'red', sym='✗') for i in range(8)],
         box('one', 320, 420, 270, 56, 'this trade: 1 in 595', 'blue', size=20)),
    step('But you do not take one trade, you take hundreds, and each is a fresh starting point. Over 300 trades, a run of 8 or more shows up about 24% of the time, and by about 750 trades it is more likely than not.',
         dict(cross='one'),
         box('many', 320, 506, 270, 86, 'somewhere in\n300 trades', 'red', sub='0.2%', size=20),
         dict(count='many', **{'from': 0.17, 'to': 24.0, 'dp': 1, 'suf': '%', 'ms': 1300})),
    step('Ruin is about size, not win rate. Call it ruin if the account ever touches half its start. Same 55% coin, 300 trades: at 1–2% risk a trade it almost never happens.',
         chart('ruin', RUIN, 'Touched −50%? by risk per trade', [0.4, 5.6], [0, 100], [[50, '50%'], [100, '100%']], [[1, '1%'], [2, '2%'], [3, '5%'], [4, '10%'], [5, '20%']], pl=50),
         dict(bars='r1', chart='ruin', data=[[1, 0.0, '0%', 'green'], [2, 0.1, '0.1%', 'green']], bw=32, ms=700)),
    step('Push the size up and the same edge turns dangerous: 8.6% at 5% risk (half Kelly), 42.1% at 10% (full Kelly), 84.1% at 20%.',
         dict(bars='r2', chart='ruin', data=[[3, 8.6, '8.6%', 'amber'], [4, 42.1, '42%', 'red'], [5, 84.1, '84%', 'red']], bw=32, ms=1200),
         icon('fire', 'fire', 405, 640, 0.55, 'red')),
    step('Nothing about the coin changed between those bars, only the bet. Bet size, not win rate, decides ruin. Pick a size whose normal drawdowns you can sit through, before the streak arrives.',
         icon('me', 'person', 490, 640, 0.6, 'green', 'size it so\nyou can sit\nthrough it', lsize=17),
         dict(pulse='r1')),
])


BOARD = dict(name='drawdown', lesson='drawdowns-risk-of-ruin', title='A drawdown and risk of ruin, drawn step by step', cfg=DD,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>The psychology: abandoning a system at its low</h2>',
             deck_after=7)
