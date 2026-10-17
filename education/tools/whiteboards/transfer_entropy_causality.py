from ._wb import *
from math import log2
import random

# ── A one-way information channel (transfer-entropy-causality) ──────────────
# The lesson's worked example: X_t fair coin flips (no memory), Y_t = X_{t-1} XOR N_t,
# N_t flips with probability eps = 0.1.  TE(X->Y) = 1 - H(0.1) = 0.531 bits; TE(Y->X) = 0 exactly.
# The 12-step run below is one simulated sample of that process (seed 1), shown for illustration;
# it happens to contain one flipped bit, at step 11.
def H(p): return 0.0 if p in (0, 1) else -p * log2(p) - (1 - p) * log2(1 - p)
r = random.Random(1)
X = [r.randint(0, 1) for _ in range(12)]
N = [1 if r.random() < 0.1 else 0 for _ in range(12)]
Y = [None] + [X[t - 1] ^ N[t] for t in range(1, 12)]
assert sum(N[1:]) == 1
FLIP = N.index(1)
TE = round(1 - H(0.1), 3)
assert TE == 0.531
CURVE = [[i / 50, round(1 - H(i / 50), 4)] for i in range(51)]

def row(bits, y0, tone, idp):
    ops = []
    for t, b in enumerate(bits):
        ops.append(note(f'{idp}{t}', 120 + t * 40, y0, '·' if b is None else str(b), tone, 22))
    return ops

TEC = dict(w=600, h=790, intro='The lesson\'s noisy one-way channel, then the catch. Press play, or step through.', steps=[
    step('X is a fair coin, flipped fresh every day. It has no memory at all: yesterday\'s flip tells you nothing about today\'s.',
         icon('xc', 'coin', 60, 6, 0.75, 'amber', 'X: fresh flips', sym='?', lsize=17)),
    step('Y listens to X with a one-day delay over a noisy line. Each day Y copies yesterday\'s X, but 10% of the bits get flipped on the way.',
         box('yb', 420, 20, 170, 74, 'Y today', 'blue', sub='= X yesterday', size=19),
         arrow('xc', 'yb', '10% of bits flipped', 'green')),
    step('One simulated run of twelve days. Y is X shifted one day to the right. Here one bit got flipped by the noise, on day 11.',
         note('xl', 40, 196, 'X', 'amber', 22, 'start'), *row(X, 196, 'amber', 'x'),
         note('yl', 40, 234, 'Y', 'blue', 22, 'start'), *row(Y, 234, 'blue', 'y'),
         dict(pulse=f'y{FLIP}')),
    step('The question: once you know Y yesterday, does X yesterday tell you anything new about Y today? Before you look at X, Y today is a 50/50 guess: 1 full bit of uncertainty.',
         chart('bc', (10, 262, 280, 240), 'Uncertainty about Y today', [0.4, 3.6], [0, 1.25], [[0, '0'], [0.5, '0.5'], [1, '1 bit']],
               [[1, 'before'], [2, 'know X'], [3, 'TE']], pl=56),
         dict(bars='b1', chart='bc', data=[[1, 1.0, '1', 'blue']], bw=52, ms=900)),
    step('Know X yesterday and only the noise is left: the binary entropy of a 10% flip, 0.469 bits.',
         dict(bars='b2', chart='bc', data=[[2, 0.469, '0.469', 'amber']], bw=52, ms=900)),
    step('The drop, 1 − 0.469 = 0.531 bits, is the transfer entropy from X to Y: new information X\'s past adds about Y\'s future.',
         dict(bars='b3', chart='bc', data=[[3, TE, '0.531', 'green']], bw=52, ms=900)),
    step('The other way round is exactly zero. X today is a fresh coin flip, so nothing in anyone\'s past, Y\'s included, helps predict it. One way 0.531 bits, the other way 0.',
         arrow('yb', 'xc', 'Y → X: 0 bits', 'red', bend=-70, dash=True)),
    step('Change the noise and the flow changes: 1 − H(ε). At a 50% flip the line carries nothing. At 90% it carries 0.531 bits again, because you can read the opposite.',
         chart('ec', (310, 262, 280, 240), 'TE from X to Y vs flip rate', [0, 1], [0, 1.1], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[0, '0'], [0.5, '0.5'], [1, '1']], pl=44, pr=14),
         series('ecs', 'ec', CURVE, 'purple', ms=1400),
         dot('e1', 'ec', [0.1, TE], '0.531', 'green', dx=10, dy=-8, anchor='start'),
         dot('e5', 'ec', [0.5, 0], '0', 'red', dy=-14)),
    step('Now the catch. A hidden driver, say a risk-off shock, hits market A first and market B a little later. There is no wire between A and B at all.',
         icon('drv', 'bolt', 260, 520, 0.6, 'red', 'hidden driver', lsize=17),
         box('ma', 10, 690, 170, 80, 'market A\nreacts fast', 'amber', size=18),
         box('mb', 420, 690, 170, 80, 'market B\nreacts later', 'blue', size=18),
         arrow('drv', 'ma', None, 'red'), arrow('drv', 'mb', None, 'red')),
    step('Yet A\'s past now predicts B\'s future, and not the reverse: a clean, one-way transfer entropy with no direct link. It measures predictive flow, never cause.',
         arrow('ma', 'mb', 'TE > 0, no link', 'amber', dash=True),
         dict(pulse='drv')),
    step('Two more facts from the lesson. For Gaussian, linear data transfer entropy gives the same answer as Granger causality. And in 2002 Marschinski and Kantz used it on the Dow Jones and the DAX.',
         dict(hide='ecs'), dict(hide='e1'), dict(hide='e5'), dict(hide='ec'),
         box('g1', 310, 262, 280, 110, 'linear + Gaussian:\nsame as Granger', 'purple', size=18),
         box('g2', 310, 392, 280, 110, 'real data: lots of\nhistory + a shuffle test', 'amber', size=18)),
    step('The takeaway: transfer entropy tells you whose past helps predict whose future, in any shape. It does not tell you who is pushing whom.',
         dict(pulse='b3'), dict(pulse='g2')),
])


BOARD = dict(name='transfer_entropy_causality', lesson='transfer-entropy-causality', title='Transfer entropy: a one-way channel, and its catch', cfg=TEC,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)
