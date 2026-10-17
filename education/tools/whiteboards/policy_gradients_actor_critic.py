from ._wb import *
from math import exp

# ── One actor-critic update, then many (policy-gradients-actor-critic) ─────────
# The lesson's worked example: one state, two actions (small a1, large a2), softmax logits
# start at 0 (50/50). Critic baseline V(s) = 1, the agent samples large, return R = 2,
# advantage +1, step size 0.1: theta2 = +0.05, theta1 = -0.05, pi(large) = 0.525.
# Repeating with a constant advantage of +1 (the lesson's illustrative chart) gives
# pi(large) = sigmoid(0.1 k). The below-expectation case (R = 0.5, A = -0.5) and the
# Gaussian sizing curves are illustrative, computed below.
sig = lambda x: 1 / (1 + exp(-x))
assert round(sig(0.1), 3) == 0.525
REPEAT = [[k, round(sig(0.1 * k), 3)] for k in range(11)]
LOW = sig(-0.05)   # 0.4875


def gauss(mu, sd=0.35):
    return [[round(x, 2), round(exp(-0.5 * ((x - mu) / sd) ** 2), 3)] for x in [i / 20 for i in range(0, 61)]]


def cnt(id, a, b, dp=1, suf='%', ms=900): return dict(count=id, **{'from': a, 'to': b, 'dp': dp, 'suf': suf, 'ms': ms})


CH = (10, 262, 580, 250)

PG = dict(w=600, h=530, intro="The lesson's one-state, two-action example: an actor, a critic and one update, then what repeating it does. Press play, or step through.", steps=[
    step('The actor is the policy: the rule that picks the action. Here it has two choices, a small position or a large one, and starts at 50/50.',
         icon('actor', 'person', 40, 10, 0.75, 'purple', 'actor (policy)', lsize=18),
         box('ps', 10, 150, 120, 62, 'small', 'blue', sub='50.0%', size=19),
         box('pl', 140, 150, 120, 62, 'large', 'green', sub='50.0%', size=19)),
    step('It samples the large position and the market answers with a return of 2.',
         icon('mkt', 'globe', 262, 10, 0.75, 'blue', 'market', lsize=18),
         arrow('actor', 'mkt', 'large', 'green', id='am'),
         chip('ret', 300, 128, 'return 2', 'blue')),
    step('Is 2 good? The critic is a second model that has learned what this state usually delivers. It says 1.',
         icon('critic', 'scales', 480, 10, 0.75, 'amber', 'critic', lsize=18),
         box('vb', 340, 150, 250, 62, 'critic', 'amber', sub='expects 1', size=19)),
    step('The advantage is the return minus what was expected: 2 − 1 = +1. The large position beat expectations by one unit.',
         dict(sub='vb', text='advantage 2 − 1 = +1'), dict(pulse='vb'),
         arrow('vb', 'pl', '+1', 'amber', id='ca')),
    step('Update with step size 0.1: the large logit rises to +0.05 and the small one falls to −0.05. The large position goes from 50% to 52.5%. The action that beat expectations became a little more likely.',
         cnt('pl', 50, 52.5), cnt('ps', 50, 47.5)),
    step('Repeat with the same advantage every time (an illustration that holds it fixed) and the probability keeps climbing: about 73% after ten updates.',
         chart('rep', CH, 'P(large) under repeated updates, advantage held at +1', [0, 10], [0.4, 0.8],
               [[0.5, '50%'], [0.6, '60%'], [0.7, '70%']], [[0, '0'], [5, '5'], [10, '10 updates']], pl=56, pr=40),
         series('rp', 'rep', REPEAT, 'green', ms=1500),
         dot('r1', 'rep', [1, 0.525], '52.5%', 'green', dx=12, dy=-14, anchor='start'),
         dot('r10', 'rep', [10, 0.731], '73.1%', 'green', dx=-10, dy=-16, anchor='end')),
    step('Now suppose a large trade returns only 0.5 against the critic\'s 1. The advantage is −0.5, and the large position slips below 50%, to about 48.75%. A profitable trade can still be pushed down if it did worse than usual.',
         dict(hide='rep'), dict(hide='rp'), dict(hide='r1'), dict(hide='r10'),
         dict(sub='vb', text='advantage 0.5 − 1 = −0.5'), dict(hide='ret'),
         chip('ret2', 300, 128, 'return 0.5', 'red'),
         dict(hide='ca'), arrow('vb', 'pl', '−0.5', 'red', id='ca2'),
         cnt('pl', 50, LOW * 100, dp=2), cnt('ps', 50, 100 - LOW * 100, dp=2)),
    step('Real sizes sit on a dial, not a menu. Then the policy is a bell curve over size, and the same rule shifts its center toward sizes that beat the baseline. No search over every possible size is needed. (Illustrative curves.)',
         dict(hide='ret2'), dict(dim='ca2'),
         chart('sz', CH, 'Policy over position size (illustrative)', [0, 3], [0, 1.15],
               [], [[0, '0'], [1, '1×'], [2, '2×'], [3, '3× size']], pl=24, pr=24),
         series('g0', 'sz', gauss(1.0), 'purple', ms=1100, dash=True, label='before', lat=[1.0, 1.0], ldy=-14, lsize=17),
         series('g1', 'sz', gauss(1.3), 'green', ms=1100, label='after', lat=[1.3, 1.0], ldx=36, ldy=-14, lsize=17)),
    step('The catch: the actor chases whatever the reward says. Reward raw profit with no penalty for risk, in a simulator with free fills, and it learns to sit at maximum size. The optimizer did exactly what it was asked. It is not an edge.',
         series('g2', 'sz', gauss(2.6), 'red', ms=1100, label='raw-profit reward', lat=[2.6, 1.0], ldx=-10, ldy=-14, lanchor='end', lsize=17)),
    step('So put the risk and the costs into the reward before you trust the answer. That is how the published uses worked: Moody and Saffell trained on a Sharpe-style reward net of costs, and deep hedging (2019) minimized a risk measure with transaction costs included.',
         dict(dim='g2'), dict(pulse='g1')),
])


BOARD = dict(name='policy_gradients_actor_critic', lesson='policy-gradients-actor-critic',
             title='Actor, critic and one policy-gradient update', cfg=PG,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=6)
