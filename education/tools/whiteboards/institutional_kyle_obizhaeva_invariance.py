from ._wb import *
from math import sqrt, log10, exp

# ── Market microstructure invariance (institutional-kyle-obizhaeva-invariance) ──
# The lesson's two assets. A: $150, 50,000,000 shares/day, 25% a year (daily 1.575%).
# B: $20, 200,000 shares/day, 45% a year (daily 2.835%). W = P·V·σ: A ≈ 1.181e8,
# B ≈ 1.134e5, ratio ≈ 1,042. Kyle & Obizhaeva (2016): bets per day ∝ W^(2/3), typical bet
# size in risk units ∝ W^(1/3), so A's typical bet is 1,042^(1/3) ≈ 10.1× B's and A sees
# 1,042^(2/3) ≈ 102.8× as many bets. Square-root-law cost at 1% of ADV (Y = 1): A ≈ 15.7 bps,
# B ≈ 28.3 bps. The 10,000-share order and its dollar and risk sizes are our arithmetic
# from the same inputs. The "one shared shape" panel is stylized, like the lesson's chart.
SA, SB = 0.25 / sqrt(252), 0.45 / sqrt(252)
WA, WB = 150 * 50e6 * SA, 20 * 200e3 * SB
assert round(WA / WB) == 1042
SIZE, COUNT = (WA / WB) ** (1 / 3), (WA / WB) ** (2 / 3)
assert (round(SIZE, 1), round(COUNT, 1)) == (10.1, 102.8)
LA, LB = 10_000 * 150 * 0.01575, 10_000 * 20 * 0.02835     # lesson's rounded daily vols
assert (round(LA), round(LB)) == (23625, 5670)
CA, CB = 1e4 * SA * sqrt(0.01), 1e4 * SB * sqrt(0.01)
assert (round(CA, 1), round(CB, 1)) == (15.7, 28.3)

def _hump(c, s, h):
    return [[round(c + s * (i - 12) / 4, 3), round(h * exp(-((i - 12) / 4) ** 2 / 2), 3)] for i in range(25)]

KO = dict(w=600, h=800, intro="A mega-cap and a small-cap that look like different worlds, until you change the ruler. The lesson's own two stocks. Press play, or step through.", steps=[
    step('Two stocks from the lesson. A is a mega-cap: $150, 50 million shares a day, 25% annual volatility. B is a small-cap: $20, 200,000 shares a day, 45% volatility.',
         icon('fa', 'factory', 30, 6, 0.7, 'purple', 'A mega-cap', lsize=18),
         icon('ho', 'house', 450, 6, 0.7, 'green', 'B small-cap', lsize=18)),
    step('Measure the same order in shares: 10,000 of each. Same number, but in A it is 0.02% of a day\'s volume, and in B it is 5%. Shares are the wrong ruler.',
         chip('qa', 140, 40, '10,000 sh', 'purple'), chip('qb', 330, 40, '10,000 sh', 'green'),
         note('r1', 300, 120, 'shares: 0.02% of A\'s day vs 5% of B\'s', 'chalk', 18)),
    step('In dollars: $1.5 million of A against $200,000 of B. Better, but a dollar of a calm stock and a dollar of a wild one do not carry the same risk.',
         dict(hide='r1'),
         note('r2', 300, 120, 'dollars: $1,500,000 vs $200,000', 'chalk', 18)),
    step('In risk: multiply by daily volatility, 1.575% for A and 2.835% for B. The bet becomes about $23,600 of risk in A and $5,670 in B. This is the bet size L.',
         dict(hide='r2'),
         note('r3', 300, 120, 'risk L = Q × P × σ:  $23,625 vs $5,670', 'amber', 19)),
    step('Now the market side, same recipe on the whole day\'s volume: W = P × V × σ. A transfers about 118 million dollars of risk a day; B about 113 thousand.',
         chart('w', (10, 160, 280, 240), 'Activity W (log scale)', [0.4, 2.6], [0, 9.2],
               [[2, '10²'], [5, '10⁵'], [8, '10⁸']], [[1, 'A'], [2, 'B']], pl=50, pr=10),
         dict(bars='wb', chart='w', data=[[1, round(log10(WA), 3), '1.2×10⁸', 'purple'], [2, round(log10(WB), 3), '1.1×10⁵', 'green']], bw=50, ms=1000)),
    step('That is a gap of about 1,042 times in trading activity. If typical bets grew in step with activity, A\'s typical bet would be over a thousand times B\'s.',
         box('gap', 310, 170, 280, 64, 'A is ≈ 1,042× as active', 'amber', size=19)),
    step('They do not. Invariance splits the gap: bets per day grow as activity to the two-thirds, so A sees about 103 times as many bets as B, and typical bet size only as activity to the one-third, so A\'s typical bet is only about 10 times B\'s.',
         icon('cr', 'crowd', 330, 250, 0.6, 'purple', 'A: more bets', lsize=16),
         icon('pe', 'person', 480, 250, 0.6, 'green', 'B: fewer bets', lsize=16),
         note('sl', 450, 370, f'≈{SIZE:.0f}× bigger × ≈{COUNT:.0f}× more bets', 'chalk', 18)),
    step('So in the thin name each bet is a much bigger slice of the day. A typical bet\'s share of daily volume falls as activity to the minus two-thirds: about 103 times larger a share in B than in A.',
         note('sh', 450, 402, f'thin B: ≈{COUNT:.0f}× bigger % of volume', 'amber', 16)),
    step('The invariance claim: divide every bet\'s risk size by the cube root of its own market\'s activity, and the whole distribution of bet sizes, not just its middle, is about the same everywhere: stocks, venues, eras.',
         chart('d', (10, 420, 580, 170), 'Bet size ÷ W^(1/3) (stylized)', [0, 10], [0, 1.15], [], [], pl=16, pr=16),
         series('da', 'd', _hump(5.1, 1.7, 0.95), 'purple', ms=1100, label='A', lat=[3.2, 0.5], ldx=-8, lanchor='end'),
         series('db', 'd', _hump(4.9, 1.5, 1.0), 'green', dash=True, ms=900, label='B', lat=[6.6, 0.55], ldx=8, lanchor='start'),
         note('one', 505, 470, 'one shared shape', 'green', 19)),
    step('Costs still differ in the raw numbers. With the square-root law, trading 1% of a day\'s volume costs about 15.7 bps in A and 28.3 bps in B: the thinner, more volatile name is nearly twice as dear.',
         box('ca', 10, 606, 280, 60, 'A at 1% ADV ≈ 15.7 bps', 'purple', size=18),
         box('cb', 310, 606, 280, 60, 'B at 1% ADV ≈ 28.3 bps', 'green', size=18)),
    step('The payoff: a cost model calibrated once on liquid names can travel to a new, thin instrument using only its price, volume and volatility. No history of your own fills needed on day one.',
         note('use', 300, 694, 'P, V, σ → W → a day-one estimate', 'blue', 19)),
    step('The caveats: it is an empirical regularity with real scatter, the evidence is mostly from US equities, and in FX there is no single clean volume figure. Use it as a starting point.',
         box('cav', 10, 718, 580, 50, 'regularity, not law · mostly equity evidence', 'red', size=18)),
    step('And it is silent on how impact decays once a bet stops trading; that is the next lesson. In one line: measure bets in risk, scale by the market\'s activity, and different markets start to look alike.',
         note('end', 300, 786, 'risk units + activity scaling = comparable markets', 'green', 19)),
])


BOARD = dict(name='institutional_kyle_obizhaeva_invariance', lesson='institutional-kyle-obizhaeva-invariance',
             title='Invariance: change the ruler, markets look alike', cfg=KO,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=5)
