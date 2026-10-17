from ._wb import *

# ── Q-learning on the previous lesson's 3-state MDP (q-learning-temporal-difference) ──
# gamma = 0.9, alpha = 0.5, every Q starts at 0. The lesson's three samples:
#   Flat, Open -> Long, r -0.1: target -0.1, Q(Flat,Open) = -0.05
#   Long, Hold -> Long, r +1:   target 1,    Q(Long,Hold) = 0.5
#   Long, Hold -> Long, r +1:   target 1.45, error 0.95, Q(Long,Hold) = 0.975
# Repeating the last sample: Q_{k+1} = 0.95 Q_k + 0.5, fixed point 10 (curve computed below).
# The overestimation bars are five illustrative noisy estimates of a true value of 0.
G, A = 0.9, 0.5
QK = [0.0]
for _ in range(60): QK.append(QK[-1] + A * (1 + G * QK[-1] - QK[-1]))
assert round(QK[1], 3) == 0.5 and round(QK[2], 3) == 0.975
CURVE = [[k, round(q, 3)] for k, q in enumerate(QK)]
NOISY = [-0.6, 0.3, -0.2, 0.8, -0.4]


def qbox(id, x, y, text, tone):
    return box(id, x, y, 168, 58, text, tone, sub='0', size=19)
def cnt(id, a, b, dp=3, ms=800): return dict(count=id, **{'from': a, 'to': b, 'dp': dp, 'ms': ms})
def card(id, text, tone=None): return note(id, 395, 70, text, tone, 18, 'start')


CH = (10, 268, 580, 262)

QL = dict(w=600, h=550, intro="The same three-state market as the previous lesson, but now nobody tells the agent the odds. It learns a table of action values from samples. Press play, or step through.", steps=[
    step('Same market as before: Flat, Long, Short, discount 0.9. But now the agent does not know the odds or the rewards. It keeps a Q-table: one guess per state and action, all starting at 0.',
         qbox('fs', 10, 40, 'Flat · Stay', 'blue'), qbox('fo', 190, 40, 'Flat · Open', 'blue'),
         qbox('lh', 10, 112, 'Long · Hold', 'green'), qbox('lc', 190, 112, 'Long · Close', 'green'),
         qbox('sh', 10, 184, 'Short · Hold', 'red'), qbox('sc', 190, 184, 'Short · Close', 'red'),
         note('qt', 188, 22, 'the Q-table (step size 0.5)', 'purple', 18)),
    step('Sample 1: in Flat it tries Open, lands in Long, and pays 0.1. Target: −0.1 + 0.9 × (best guess in Long, still 0) = −0.1. Move half way from 0: Q(Flat, Open) = −0.05. One noisy sample makes Open look bad for now.',
         card('c1', 'Flat → Open → Long\nreward −0.1\ntarget −0.1\nnew Q = −0.05', 'blue'),
         cnt('fo', 0, -0.05), dict(pulse='fo')),
    step('Sample 2: in Long it Holds, stays Long, and earns +1. Target: 1 + 0.9 × 0 = 1. Error 1. Move half way: Q(Long, Hold) = 0.5.',
         dict(hide='c1'),
         card('c2', 'Long → Hold → Long\nreward +1\ntarget 1\nnew Q = 0.5', 'green'),
         cnt('lh', 0, 0.5), dict(pulse='lh')),
    step('Sample 3: the same move again. Now the target uses the new guess: 1 + 0.9 × 0.5 = 1.45. The error, how surprised it is, is 1.45 − 0.5 = 0.95. Move half of that: Q(Long, Hold) = 0.975.',
         dict(hide='c2'),
         card('c3', 'target 1 + 0.9 × 0.5\n= 1.45\nerror 0.95\nnew Q = 0.975', 'amber'),
         cnt('lh', 0.5, 0.975), dict(pulse='lh')),
    step('Keep repeating that sample and each update closes 5% of the remaining gap. The guess climbs toward 10, the exact value the previous lesson solved for with a known model. Here it was learned from samples alone.',
         chart('q', CH, 'Q(Long, Hold), update by update', [0, 60], [0, 11],
               [[0, '0'], [5, '5'], [10, '10']], [[0, '0'], [20, '20'], [40, '40'], [60, '60']], pl=46, pr=20),
         series('star', 'q', [[0, 10], [60, 10]], 'green', dash=True, ms=500, label='Q* = 10', lat=[14, 10], ldy=-14, lsize=17),
         series('qk', 'q', CURVE, 'amber', ms=1800),
         dot('d1', 'q', [1, 0.5], '', 'amber'),
         dot('d2', 'q', [2, 0.975], '0.5, then 0.975', 'amber', dx=14, dy=-14, anchor='start')),
    step('With a fixed step size it gets close but never lands exactly on 10, and every new noisy sample keeps nudging it. Formal convergence needs the step size to shrink over time.',
         dot('d60', 'q', [60, round(QK[60], 2)], f'{QK[60]:.2f} after 60', 'amber', dy=22, anchor='end')),
    step('To learn about every action, the agent must sometimes try one it does not currently rate best. A common rule, ε-greedy: take the best-rated action most of the time, a random one with small probability ε.',
         dict(hide='q'), dict(hide='star'), dict(hide='qk'), dict(hide='d1'), dict(hide='d2'), dict(hide='d60'), dict(hide='c3'),
         icon('dice', 'dice', 430, 60, 0.7, 'amber', 'explore\nsometimes', lsize=18)),
    step('Q-learning\'s target always uses the best action in the next state, whatever the agent actually does next. So it learns the value of the greedy policy while it is still exploring. That is what off-policy means.',
         note('off', 300, 300, 'Q-learning target: r + γ × best Q in next state', 'green', 19),
         note('on', 300, 340, 'SARSA target: r + γ × Q of the action actually taken', 'blue', 19)),
    step('One catch. The target takes the maximum of noisy guesses, and the maximum of noisy guesses runs high. Five estimates of an action truly worth 0 (illustrative): the max picks the one that overshot, +0.8.',
         dict(hide='off'), dict(hide='on'),
         chart('ov', (10, 268, 580, 262), 'Five noisy estimates of a true value of 0', [0.3, 5.7], [-0.9, 1.1],
               [[-0.5, '−0.5'], [0, '0'], [0.5, '+0.5'], [1, '+1']], [[1, ''], [2, ''], [3, ''], [4, ''], [5, '']], zero=True, pl=56, pr=14),
         dict(bars='nb', chart='ov', data=[[i + 1, v, f'{v:+.1f}', 'red' if v == max(NOISY) else 'blue'] for i, v in enumerate(NOISY)], bw=50, ms=1000)),
    step('That is the overestimation bias, and Double Q-learning is the standard fix. Where has this worked in trading? Mostly execution: Nevmyvaka, Feng and Kearns (2006) learned where to place limit orders from historical order-book data and cut costs against simple submit-and-leave orders.',
         note('ex', 300, 252, 'clearest trading use: order execution', 'green', 19)),
])


BOARD = dict(name='q_learning_temporal_difference', lesson='q-learning-temporal-difference',
             title='Learning a Q-table one sample at a time', cfg=QL,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=7)
