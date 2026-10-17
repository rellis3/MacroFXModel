from ._wb import *

# ── DQN: replay buffer, target network, one loss term (deep-q-networks) ─────────
# The lesson's worked example: six transitions #1..#6 in arrival order, a random
# mini-batch {#5, #1, #4}; for #4 (r = +0.1, gamma = 0.9) the frozen target network gives
# Q(s5, Hold) = 2.0, Q(s5, Close) = 1.2, so target = 0.1 + 0.9 x 2.0 = 1.9; the online
# network guesses 1.6; squared error 0.09.
# The staircase chart is an illustrative toy computed below: one state worth
# 1 + 0.9 x itself (true value 10), online guess moves 30% of the way to the target each
# step, target network synced every 10 steps.
assert round(0.1 + 0.9 * max(2.0, 1.2), 2) == 1.9 and round((1.9 - 1.6) ** 2, 2) == 0.09


def _stair(steps=120, n=10, lr=0.3):
    q = qm = 0.0; Q, T = [], []
    for k in range(steps + 1):
        if k % n == 0: qm = q
        t = 1 + 0.9 * qm
        Q.append([k, round(q, 3)]); T.append([k, round(t, 3)])
        q += lr * (t - q)
    return Q, T
QS, TS = _stair()

CARD_X = lambda i: 36 + i * 68
CH = (10, 316, 580, 224)

DQN = dict(w=600, h=550, intro="The previous lesson's update rule with a neural network in place of the table, and the two fixes that keep it stable. Press play, or step through.", steps=[
    step('A Q-table needs one cell for every state and action. Three states and two actions is six cells. A state built from 30 market features, each cut into just 10 levels, would need a 1 followed by 30 zeros of rows: a table can never be filled.',
         box('tab', 14, 20, 180, 70, '3 states × 2 actions', 'green', sub='6 cells', size=18),
         box('big', 214, 20, 230, 70, '30 features, 10 levels', 'red', sub='1 and 30 zeros', size=18)),
    step('So replace the table with a network: feed in the state, get out one value per action. Similar states get similar values, so it can answer for states it has never seen exactly.',
         dict(hide='tab'), dict(hide='big'),
         box('net', 412, 170, 178, 70, 'online network', 'green', sub='Q(s, a; θ)', size=19)),
    step('The agent\'s experience arrives as a stream of transitions, each one (state, action, reward, next state). They go into a replay buffer in the order they happen.',
         *[chip(f'c{i}', CARD_X(i), 40, f'#{i + 1}', 'blue') for i in range(6)],
         note('bl', 200, 82, 'replay buffer, in arrival order', 'blue', 18)),
    step('Problem one: neighbors in the stream look almost the same, a market one tick later looks like the market now. Train on them in order and the network overfits whatever it just saw.',
         note('p1', 200, 112, 'in order = correlated', 'red', 18)),
    step('Fix one, experience replay: draw a random mini-batch instead. Here #5, #1 and #4: a mix from across the buffer.',
         dict(hide='p1'),
         dict(move='c4', x=60, y=150), dict(move='c0', x=130, y=150), dict(move='c3', x=200, y=150),
         note('mb', 130, 190, 'random mini-batch', 'amber', 18)),
    step('Problem two: the target is built from the network\'s own guesses. Every training step changes the network, so the target moves under its feet.',
         box('tgt', 412, 24, 178, 70, 'target network', 'purple', sub='frozen copy θ⁻', size=19)),
    step('Fix two, the target network: a frozen copy builds the target. Take #4: reward +0.1. The frozen copy rates the next state at Hold 2.0, Close 1.2. Target = 0.1 + 0.9 × 2.0 = 1.9.',
         arrow('c3', 'tgt', None, 'purple', id='to'),
         note('t', 300, 262, 'target = 0.1 + 0.9 × max(2.0, 1.2) = 1.9', 'purple', 19)),
    step('The online network\'s current guess for #4 is 1.6. The loss is the squared gap: (1.9 − 1.6)² = 0.09. A gradient step moves only the online weights to shrink it.',
         arrow('c3', 'net', None, 'green', id='tn'),
         note('l', 300, 292, 'online guess 1.6   →   loss (1.9 − 1.6)² = 0.09', 'green', 19)),
    step('Every N steps the online weights are copied into the target network. Between copies, the goalposts stay put.',
         arrow('net', 'tgt', 'copy every N', 'purple', dash=True, id='cp'),
         dict(hide='t'), dict(hide='l')),
    step('An illustrative toy shows the effect: one state worth 1 + 0.9 × itself, so its true value is 10. The target (purple) holds still for 10 steps, the online guess (green) closes in, then the copy lifts the target and the chase repeats, climbing toward 10.',
         chart('st', CH, 'Online guess chasing a frozen target (toy)', [0, 120], [0, 10.5],
               [[0, '0'], [5, '5'], [10, '10']], [[0, '0'], [40, '40'], [80, '80'], [120, '120']], pl=46, pr=20),
         series('true', 'st', [[0, 10], [120, 10]], None, dash=True, ms=400),
         series('tg', 'st', TS, 'purple', ms=1600),
         series('qo', 'st', QS, 'green', ms=1600)),
    step('Same Q-learning target, now trained as a squared error with two stabilizers. The catch carries over and grows: a network is harder to inspect than a table, so a high score in a simulator proves only that it optimized that simulator.',
         dict(pulse='net')),
])


BOARD = dict(name='deep_q_networks', lesson='deep-q-networks',
             title='Replay buffer and target network, step by step', cfg=DQN,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=8)
