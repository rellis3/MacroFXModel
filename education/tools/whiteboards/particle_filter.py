from ._wb import *
import math

# ── Particle filter (particle-filter) ─────────────────────────────────────────
# The lesson's worked example: five propagated particles at 1.05, 1.15, 1.20, 1.25, 1.40 with
# equal prior weights; observation y = 1.30, R = 0.05 gives weights 0.130 / 0.194 / 0.220 /
# 0.237 / 0.220 and N_eff = 4.83. The jump case (y = 1.60, R = 0.01) uses the same formula as
# the lesson's calculator: weight 0.981 on the particle at 1.40, N_eff = 1.04 < N/2 = 2.5.
# Systematic resampling with those weights picks the 1.40 particle for all five slots
# (its cumulative interval is [0.019, 1], so all five picks land on it unless the random offset u ~ U(0, 1/5)
# falls below 0.019: about 1 time in 10).
XS = [1.05, 1.15, 1.20, 1.25, 1.40]
def _w(y, R):
    l = [math.exp(-(y - x) ** 2 / (2 * R)) for x in XS]; s = sum(l); return [v / s for v in l]
def _neff(w): return 1 / sum(v * v for v in w)
W1, W2 = _w(1.30, 0.05), _w(1.60, 0.01)
assert [round(v, 3) for v in W1] == [0.13, 0.194, 0.22, 0.237, 0.22] and round(_neff(W1), 2) == 4.83
assert round(W2[4], 3) == 0.981 and round(_neff(W2), 2) == 1.04
def _systematic(w, u=0.5 / 5):
    out, k = [], 0
    cum = [sum(w[:i + 1]) for i in range(len(w))]
    for j in range(len(w)):
        p = u + j / len(w)
        while cum[k] < p: k += 1
        out.append(k)
    return out
assert all(_systematic(W2, u) == [4] * 5 for u in (0.02, 0.1, 0.19))

CH = (10, 10, 580, 290)
def bars(id, w, tone):
    return dict(bars=id, chart='st', data=[[x, round(v, 3), (f'{v:.2f}'[1:] if v < 0.9 else f'{v:.3f}') if v >= 0.005 else '', tone] for x, v in zip(XS, w)], bw=30, ms=1000)

PF = dict(w=600, h=660, intro="Five guesses, one observation, then a jump. The lesson's own particles and numbers. Press play, or step through.", steps=[
    step('You are tracking a hidden value, say a hedge ratio, that you never see directly. Instead of one best guess, hold a crowd of guesses: here, the lesson\'s five particles. Each starts with an equal weight of 0.2.',
         chart('st', CH, 'Particle weights', [1.0, 1.66], [0, 1.12], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[1.05, '1.05'], [1.15, '1.15'], [1.25, '1.25'], [1.4, '1.40'], [1.6, '1.60']], pl=46, pr=14),
         bars('b0', [0.2] * 5, 'blue')),
    step('Propagate: each guess moves forward under the model with its own random shock. In the lesson\'s model, 90% of shocks are small nudges and 10% are large jumps. No single bell curve can describe that mixture; a crowd can.',
         box('mix', 10, 312, 280, 92, 'shocks: 90% small,\n10% large jumps', 'purple', size=19)),
    step('An observation arrives: y = 1.30, from a sensor with noise variance R = 0.05.',
         series('o1', 'st', [[1.3, 0], [1.3, 1.08]], 'amber', dash=True, ms=500, label='y = 1.30', lat=[1.3, 1.08], ldx=8, ldy=6, lanchor='start')),
    step('Weigh each guess by how well it explains 1.30. The closest, at 1.25, gets the most: 0.237. The furthest, at 1.05, gets 0.130. The crowd has learned something, but nobody dominates.',
         dict(hide='b0'), bars('b1', W1, 'blue')),
    step('Check the crowd\'s health: N_eff = 1 ÷ (sum of squared weights) = 4.83 out of 5. Above the usual trigger of N/2 = 2.5, so there is no need to resample.',
         box('neff', 310, 312, 280, 92, 'N_eff', 'green', sub='4.83 of 5', size=20)),
    step('Now the fat tail fires: the state jumps, and the next observation is y = 1.60, from a sharper sensor, R = 0.01.',
         dict(hide='o1'), dict(dim='b1'),
         series('o2', 'st', [[1.6, 0], [1.6, 1.08]], 'red', dash=True, ms=500, label='y = 1.60', lat=[1.6, 1.08], ldx=-8, ldy=6, lanchor='end')),
    step('Only one guess is anywhere near 1.60: the one at 1.40. It takes 0.981 of the weight and the other four are almost worthless. The crowd has collapsed onto a single opinion.',
         dict(hide='b1'), bars('b2', W2, 'red')),
    step('N_eff drops to 1.04, far below 2.5. That is particle degeneracy: five particles, but effectively one.',
         dict(count='neff', **{'from': 4.83, 'to': 1.04, 'dp': 2, 'suf': ' of 5'}), dict(pulse='neff')),
    step('Resample. Systematic resampling lays the weights end to end and picks five evenly spaced points. About 9 times in 10 all five land on the 1.40 guess, as here: the new crowd is five equal-weight clones of the survivor.',
         chart('cnt', (10, 420, 580, 160), 'Copies kept after resampling', [1.0, 1.66], [0, 6], [[0, '0'], [5, '5']],
               [[1.05, '1.05'], [1.15, '1.15'], [1.25, '1.25'], [1.4, '1.40']], pl=46, pr=14),
         dict(bars='cb', chart='cnt', data=[[x, n, str(n), 'green' if n else None] for x, n in zip(XS, [0, 0, 0, 0, 5])], bw=30, ms=900)),
    step('Next bar, the clones propagate again, each with its own shock, so the crowd spreads out around the new level. The filter jumped with the data instead of crawling after it.',
         box('next', 10, 592, 580, 60, 'next step: clones spread out again', 'green', size=19)),
    step('The costs: cloning is not new information, so repeated resampling can leave many copies of few guesses. The crowd you need grows fast with the number of hidden variables. And a rerun with a new seed gives a slightly different answer.',
         dict(hide='next'),
         box('cost', 10, 592, 580, 60, 'clones ≠ new information · rerun ≠ same answer', 'amber', size=18)),
])


BOARD = dict(name='particle_filter', lesson='particle-filter', title='A particle filter: weigh the crowd, then resample', cfg=PF,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=8)
