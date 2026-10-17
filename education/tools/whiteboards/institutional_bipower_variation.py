from ._wb import *
from math import pi

# ── Bipower variation (institutional-bipower-variation) ───────────────────────
# The lesson's worked session: fifteen one-minute returns in bp, one 46 bp jump at minute 9.
# Running RV and BV totals (units of 1e-6, decimal returns) are computed here; the finals
# match the lesson's RV 0.00002133, BV 0.00000137, J 0.00001996.
R = [1.2, -0.8, 1.5, -1.1, 0.9, -1.3, 1.0, -0.7, 46.0, -0.9, 1.1, -1.4, 0.8, -1.0, 1.3]
def _cum():
    rv, bv, a, b = 0.0, 0.0, [[0, 0]], [[0, 0]]
    for i, v in enumerate(R):
        rv += (v / 1e4) ** 2 * 1e6
        if i: bv += pi / 2 * abs(v) * abs(R[i - 1]) / 1e8 * 1e6
        a.append([i + 1, round(rv, 3)]); b.append([i + 1, round(bv, 3)])
    return a, b
CRV, CBV = _cum()
RV, BV = CRV[-1][1], CBV[-1][1]
J = round(RV - BV, 2)
assert (round(RV, 2), round(BV, 2), J) == (21.33, 1.37, 19.96)
NOJ = [v if i != 8 else 0.0 for i, v in enumerate(R)]
RV0 = sum((v / 1e4) ** 2 for v in NOJ) * 1e6
BV0 = pi / 2 * sum(abs(NOJ[i]) * abs(NOJ[i - 1]) for i in range(1, 15)) / 1e8 * 1e6
assert BV0 > RV0   # with no jump, sampling noise puts BV slightly above RV, so J floors at 0

BIP = dict(w=600, h=700, intro="The lesson's quiet session with one 46 bp jump, measured two ways. Watch one measure explode and the other barely move. Press play, or step through.", steps=[
    step('A quiet session: fifteen one-minute returns, each about 1 basis point up or down. Drawn to scale, they barely leave the line.',
         chart('r', (10, 14, 580, 200), 'One-minute returns, bp (to scale)', [0.3, 15.7], [-5, 50],
               [[0, '0'], [20, '20'], [40, '40']], [[1, '1'], [5, '5'], [9, '9'], [15, '15']], zero=True, pl=36, pr=8),
         dict(bars='q1', chart='r', data=[[i + 1, R[i], '', 'blue'] for i in range(8)], bw=18, ms=700)),
    step('Minute 9: a news release. The price jumps 46 bp in one bar, then goes back to ordinary 1 bp wiggles.',
         dict(bars='jb', chart='r', data=[[9, 46.0, '+46', 'red']], bw=18, ms=600),
         dict(bars='q2', chart='r', data=[[i + 1, R[i], '', 'blue'] for i in range(9, 15)], bw=18, ms=600)),
    step('Realized variance squares each return and adds them up. Watch its running total: it creeps along, then leaps at minute 9. One minute supplies 99.2% of the day\'s total.',
         chart('c', (10, 236, 580, 230), 'Running total, units of 10⁻⁶', [0, 15.3], [0, 23],
               [[0, '0'], [10, '10'], [20, '20']], [[0, '0'], [9, '9'], [15, '15']], pl=36, pr=8),
         series('crv', 'c', CRV, 'red', ms=1500, label='RV 21.33', lat=[15, RV], ldx=-4, ldy=-14, lanchor='end', lsize=17)),
    step('Bipower variation multiplies each return\'s size by its neighbour\'s instead. Its running total barely moves at minute 9.',
         series('cbv', 'c', CBV, 'green', ms=1500, label='BV 1.37', lat=[15, BV], ldx=-4, ldy=-14, lanchor='end', lsize=17)),
    step('Why: the jump\'s neighbours are ordinary. Squared, the jump counts 46 × 46. Paired, it counts 46 × 0.7 and 46 × 0.9: big times ordinary, never big times big.',
         box('sq', 20, 486, 260, 70, 'RV: 46 × 46 = 2116', 'red', size=20),
         box('pr', 320, 486, 260, 70, 'BV: 46 × 0.7, 46 × 0.9', 'green', size=20)),
    step('The π/2 in front is an exact correction. The average size of a normal move is smaller than its spread, so products of sizes come out short by 2/π. With no jump, π/2 makes the two measures agree.',
         note('pi', 300, 582, 'π/2 corrects for E[|Z|]² = 2/π', 'purple', 19)),
    step('The gap is the jump: J = RV − BV = 21.33 − 1.37 = 19.96. That recovers about 94% of the jump\'s own squared size.',
         dict(gap='jg', chart='c', top=[[9, CRV[9][1]], [15, RV]], bot=[[9, CBV[9][1]], [15, BV]], tone='amber', op=0.25),
         cnote('jl', 'c', [12, 11], 'J = 19.96', 'amber', 20)),
    step('Drag the jump back to zero and the two agree: RV 0.17, BV 0.22. Sampling noise puts BV slightly above, so J is floored at zero rather than reported negative.',
         box('zero', 20, 608, 560, 44, 'no jump → RV ≈ BV → J = max(RV − BV, 0) = 0', 'blue', size=18)),
    step('J is one number for the whole session: how much of the day was jumps. It does not say which minute. Finding the minute is a separate, return-by-return test.',
         note('which', 300, 680, 'how much, not which minute', 'amber', 20),
         dict(pulse='jb')),
    step('One trap: two jumps side by side. Then a jump\'s neighbour is not ordinary, the product is big times big, and the trick breaks. Truncated and multipower versions exist for that.',
         dict(pulse='pr')),
])


BOARD = dict(name='institutional_bipower_variation', lesson='institutional-bipower-variation',
             title='Bipower variation: squares versus neighbours', cfg=BIP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>The jump estimate',
             deck_after=4)
