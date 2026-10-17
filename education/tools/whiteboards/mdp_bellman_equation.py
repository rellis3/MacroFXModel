from ._wb import *

# ── Value iteration on the lesson's 3-state MDP (mdp-bellman-equation) ──────────
# States Flat / Long / Short, gamma = 0.9. Flat: Stay (r 0) or Open (r -0.1, Long or Short
# with p 1/2 each). Long: Hold (+1) or Close (-0.1 to Flat). Short: Hold (-0.5) or Close
# (-0.1 to Flat). Sweeps 1-4 and the fixed point (7.319 / 10 / 6.487) are the lesson's;
# the curves are value iteration computed below from the same rules.
G = 0.9


def _vi(n):
    F = L = S = 0.0; out = [(0.0, 0.0, 0.0)]
    for _ in range(n):
        F, L, S = (max(G * F, 0.5 * (-0.1 + G * L) + 0.5 * (-0.1 + G * S)),
                   max(1 + G * L, -0.1 + G * F),
                   max(-0.5 + G * S, -0.1 + G * F))
        out.append((F, L, S))
    return out
VI = _vi(60)
assert [round(v, 3) for v in VI[2]] == [0.305, 1.9, -0.1]
assert [round(v, 2) for v in VI[4]] == [1.20, 3.44, 0.54]
FIX = dict(F=7.319, L=10.0, S=6.487)
EVERY = [k for k in range(0, 61, 2)]
CURVE = {n: [[k, round(VI[k][i], 3)] for k in EVERY] for i, n in enumerate('FLS')}
GEO = [[t + 1, round(G ** t, 3), '', 'green' if t == 0 else 'blue'] for t in range(12)]


def cnt(id, a, b, dp=2, ms=800): return dict(count=id, **{'from': a, 'to': b, 'dp': dp, 'ms': ms})


CH = (10, 340, 580, 262)

MDP = dict(w=600, h=620, intro="The lesson's three-state trading MDP, solved by value iteration. Press play, or step through.", steps=[
    step('Three states: you are Flat, Long or Short. That is the whole market, as far as this toy model is concerned.',
         box('F', 20, 135, 140, 64, 'Flat', 'blue', sub='', size=21),
         box('L', 390, 30, 150, 64, 'Long', 'green', sub='', size=21),
         box('S', 390, 240, 150, 64, 'Short', 'red', sub='', size=21)),
    step('From Flat you can Stay (reward 0), or Open, paying 0.1 to land Long or Short with equal chance. You do not know which way the market will go.',
         arrow('F', 'L', 'Open ½', 'blue', bend=-18, id='fl'), arrow('F', 'S', 'Open ½', 'blue', bend=18, id='fs'),
         note('stay', 90, 224, 'Stay: 0', 'blue', 18)),
    step('Long pays +1 every step you Hold. Short costs 0.5 every step you Hold. From either one, Close takes you back to Flat for a cost of 0.1.',
         note('hl', 465, 116, 'Hold: +1 a step', 'green', 18),
         note('hs', 465, 326, 'Hold: −0.5 a step', 'red', 18),
         arrow('L', 'F', 'Close', 'amber', bend=-18, id='lf'), arrow('S', 'F', 'Close', 'amber', bend=18, id='sf')),
    step('How much is being Long worth? Hold forever and you collect 1, then 1 again a step later, and so on. With a discount of 0.9, each step is worth 0.9 times the one before.',
         chart('geo', CH, 'Rewards from holding Long, discounted', [0.3, 12.7], [0, 1.15],
               [[0, '0'], [0.5, '0.5'], [1, '1']], [[1, 'now'], [4, '+3'], [8, '+7'], [12, '+11 steps']], pl=46, pr=20),
         dict(bars='gb', chart='geo', data=GEO, bw=28, ms=1400)),
    step('The trick: everything after the first bar is the same picture again, shrunk by 0.9. So the value of Long is 1 plus 0.9 times the value of Long. Solve it: 10.',
         note('bell', 300, 382, 'V(Long) = 1 + 0.9 × V(Long)   →   V(Long) = 10', 'green', 19)),
    step('Value iteration does this for every state at once. Start every value at 0, then keep applying the Bellman equation: value now = reward now + 0.9 × value of where you land, taking the best action.',
         dict(hide='geo'), dict(hide='gb'), dict(hide='bell'),
         dict(sub='F', text='0'), dict(sub='L', text='0'), dict(sub='S', text='0')),
    step('Sweep 1: Long is worth 1 (Hold). Short is worth −0.1 (Close beats Hold, −0.1 against −0.5). Flat is worth 0: Stay ties, because Open cannot yet see any value on the other side.',
         cnt('L', 0, 1), cnt('S', 0, -0.1), dict(pulse='S')),
    step('Sweep 2: Long rises to 1.9. Now Flat\'s Open sees that value: half of (−0.1 + 0.9 × 1.9) plus half of (−0.1 + 0.9 × −0.1) is 0.305, which beats Stay. From here on the best action in each state never changes.',
         cnt('L', 1, 1.9), cnt('F', 0, 0.305, 3), dict(pulse='fl'), dict(pulse='fs')),
    step('The values keep climbing every sweep, slower and slower, toward a fixed point: Long 10, Flat 7.32, Short 6.49.',
         chart('vi', CH, 'Value by sweep', [0, 60], [-0.5, 11],
               [[0, '0'], [5, '5'], [10, '10']], [[0, '0'], [20, '20'], [40, '40'], [60, '60']], pl=46, pr=104),
         series('cL', 'vi', CURVE['L'], 'green', ms=1600, label='Long 10', lat=[60, 9.99], ldx=6, ldy=0, lanchor='start', lsize=17),
         series('cF', 'vi', CURVE['F'], 'blue', ms=1600, label='Flat 7.32', lat=[60, 7.31], ldx=6, ldy=-6, lanchor='start', lsize=17),
         series('cS', 'vi', CURVE['S'], 'red', ms=1600, label='Short 6.49', lat=[60, 6.48], ldx=6, ldy=10, lanchor='start', lsize=17),
         cnt('F', 0.305, 7.32), cnt('L', 1.9, 10), cnt('S', -0.1, 6.49)),
    step('Check Short against its own equation. Close: −0.1 + 0.9 × 7.32 = 6.49. Hold: −0.5 + 0.9 × 6.49 = 5.34. Close wins: cut the losing position rather than sit in it.',
         dict(pulse='sf'), dict(dim='hs')),
    step('Read the policy off the values: Open from Flat, Hold when Long, Close when Short. Don\'t sit flat forever, hold winners, cut losers. Nobody wrote those rules in. They fall out of the rewards and the discount.',
         dict(dim='lf'), dict(dim='stay'), dict(pulse='L')),
])


BOARD = dict(name='mdp_bellman_equation', lesson='mdp-bellman-equation',
             title='Value iteration on a three-state trading MDP', cfg=MDP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=10)
