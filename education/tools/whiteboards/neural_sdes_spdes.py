from ._wb import *
import random

# ── Neural SDEs & SPDEs (neural-sdes-spdes) ──────────────────────────────────
# Memory numbers are the lesson's worked example: N = 1,000 steps, d = 50 state numbers
# -> 50,000 stored floats under naive backprop; 2N -> 100,000. The paths are illustrative
# random walks (real: step size 1; untrained model: step size 0.3; trained: step size 1).
def _walk(seed, sd, n=100):
    random.seed(seed); x, p = 0.0, [[0, 0]]
    for i in range(1, n + 1):
        x += random.gauss(0, sd); p.append([i, round(x, 2)])
    return p
REAL = [_walk(s, 1.0) for s in (11, 12, 13)]
CALM = [_walk(s, 0.3) for s in (21, 22, 23)]
FIT = [_walk(s, 1.0) for s in (31, 32, 33)]

NS = dict(w=600, h=760, intro='The same SDE skeleton, but the drift and the noise are learned from data. Watch one training loop, its memory problem, and its catch. Press play, or step through.', steps=[
    step('Every model in this sequence has the same skeleton: a drift term plus a noise term. Until now, a person wrote both.',
         box('sk', 150, 20, 300, 64, 'dX = μ dt + σ dW', 'purple', size=24),
         icon('you', 'person', 18, 14, 0.62, 'blue', 'modeller', lsize=16)),
    step('Classical: the modeller picks formulas. A pull back to a level, a(b − x), and noise that shrinks near zero, σ√x. A real commitment, chosen in advance.',
         chip('c1', 40, 120, 'drift a(b − x)', 'blue'), chip('c2', 410, 120, 'noise σ√x', 'blue'),
         arrow('c1', 'sk', None, 'blue', id='a1'), arrow('c2', 'sk', None, 'blue', id='a2')),
    step('Neural: swap both formulas for small neural networks. Their weights, θ, are knobs that training will set from data.',
         dict(hide='c1'), dict(hide='c2'), dict(hide='a1'), dict(hide='a2'), dict(cross='you'),
         box('mu', 20, 110, 170, 60, 'network μθ', 'green', size=20),
         box('sg', 410, 110, 170, 60, 'network σθ', 'green', size=20),
         arrow('mu', 'sk', None, 'green'), arrow('sg', 'sk', None, 'green')),
    step('Here are three real paths (green). Before training, the model\'s simulated paths (amber) are far too calm. Illustrative numbers.',
         chart('pc', (10, 196, 580, 250), 'Real paths vs simulated paths', [0, 100], [-25, 25],
               [[-20, '−20'], [0, '0'], [20, '20']], [[0, '0'], [50, '50'], [100, '100 steps']], zero=True, pl=46, pr=44),
         *[series('r%d' % i, 'pc', REAL[i], 'green', ms=700) for i in range(3)],
         *[series('c%d' % i, 'pc', CALM[i], 'amber', ms=500) for i in range(3)]),
    step('A second network, the discriminator, tries to tell real from simulated. Right now that is easy, so the training loss is high. Kidger and co-authors (2021) framed this as a GAN over whole paths.',
         icon('disc', 'scales', 30, 462, 0.8, 'amber', 'real or fake?', lsize=17),
         box('loss', 150, 474, 120, 56, 'loss: high', 'red', size=18)),
    step('Training needs the gradient of that loss for every weight. Naive backprop stores every simulated step: 1,000 steps × 50 numbers = 50,000 floats, before the networks\' own activations.',
         chart('mem', (300, 462, 290, 230), 'State floats stored, by N', [0.3, 3.7], [0, 125000],
               [[50000, '50k'], [100000, '100k']], [[1, '1,000'], [2, '2,000'], [3, 'adjoint']], pl=50, pr=10),
         dict(bars='mb', chart='mem', data=[[1, 50000, '50,000', 'amber']], bw=46, ms=900)),
    step('Double the path to 2,000 steps and the memory doubles to 100,000. The stochastic adjoint method (Li and co-authors, 2020) instead solves a second SDE backward in time, so its memory does not grow with the number of steps.',
         dict(bars='mb2', chart='mem', data=[[2, 100000, '100,000', 'red']], bw=46, ms=900),
         cnote('adj', 'mem', [3, 30000], 'flat in N', 'green', 17)),
    step('The gradient flows back to the drift and noise networks and nudges their weights. Round and round: simulate, score, adjust.',
         note('back', 300, 186, '← gradient adjusts θ →', 'red', 18),
         dict(pulse='mu'), dict(pulse='sg')),
    step('After training, simulated paths (amber) are hard to tell from real ones. The discriminator is stuck, and the loss is low.',
         *[dict(hide='c%d' % i) for i in range(3)],
         *[series('f%d' % i, 'pc', FIT[i], 'amber', ms=600) for i in range(3)],
         dict(hide='loss'), box('loss2', 150, 474, 120, 56, 'loss: low', 'green', size=18)),
    step('The catch: a model with this many knobs fits the training data closely whether or not its dynamics generalise. In-sample fit is not evidence. It has to survive data it never saw, ideally including a different regime.',
         box('oos', 20, 704, 560, 48, 'close fit in sample ≠ works out of sample', 'red', size=19)),
    step('A neural SPDE does the same for a whole field, like an implied volatility surface: a value for every strike and tenor, moving each day. Salvi and co-authors (2021) made it resolution-invariant. All of this is research, not a desk standard.',
         dict(pulse='sk'), dict(pulse='mu'), dict(pulse='sg')),
])


BOARD = dict(name='neural_sdes_spdes', lesson='neural-sdes-spdes', title='Neural SDEs: learning the drift and the noise',
             cfg=NS, before='  <div class="tl-section-mark"><span>Section 03</span></div>', deck_after=8)
