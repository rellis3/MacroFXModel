from ._wb import *

# ── The four option positions (options-four-positions) ────────────────────────
# The lesson's worked example: S = K = 100, sigma = 20%, r = 2%, three months.
# Black-Scholes premiums: call 4.23, put 3.73. P&L at expiry per unit is
# s * (payoff(S_T) - premium), s = +1 bought, -1 sold. Breakevens 104.23 and 96.27;
# the put's far end is K - premium = 96.27 (price can only fall to zero).
C, P, K = 4.23, 3.73, 100
X0, X1 = 60, 140
def lc(x): return round(max(x - K, 0) - C, 2)
def lp(x): return round(max(K - x, 0) - P, 2)
LC = [[x, lc(x)] for x in (X0, K, X1)]          # −4.23 … +35.77
LP = [[x, lp(x)] for x in (X0, K, X1)]          # +36.27 … −3.73
SC = [[x, -v] for x, v in LC]
SP = [[x, -v] for x, v in LP]

XD, YD = [X0, X1], [-45, 45]
YT = [[-40, '−40'], [0, '0'], [40, '+40']]
XT = [[60, '60'], [100, 'K 100'], [140, '140']]
def frame(id, x, y, title):
    return chart(id, (x, y, 285, 215), title, XD, YD, YT, XT, zero=True, pl=44, pr=14)

FOUR = dict(w=600, h=780, intro='One strike, two sides, two contracts: the four positions drawn as payoffs at expiry, with the lesson\'s numbers. Press play, or step through.', steps=[
    step('Every option is one piece of paper with two people on it. The one who bought it is long; the one who sold it is short. Our example: strike 100, the price at 100 today, three months to expiry.',
         icon('buyer', 'person', 20, 8, 0.7, 'green', 'buyer (long)', lsize=17),
         icon('opt', 'scroll', 265, 8, 0.7, None, 'one option', lsize=17),
         icon('seller', 'person', 510, 8, 0.7, 'red', 'seller (short)', lsize=17)),
    step('Day one: the buyer pays the premium and the seller pockets it. At 20% volatility and 2% rates, Black-Scholes prices the 100-strike call at 4.23 and the 100-strike put at 3.73.',
         icon('prem', 'coin', 130, 104, 0.36, 'amber', sym='$'),
         move('prem', 434, 104, 1400),
         note('pn', 300, 166, 'premium: call 4.23 · put 3.73', 'amber', 18)),
    step('In return the buyer holds a right, and the seller carries an obligation. A right can be walked away from. An obligation cannot: if the buyer exercises, the seller must deliver.',
         icon('key', 'key', 40, 140, 0.5, 'green', 'a right:\nmay walk away', lsize=17),
         icon('ob', 'warn', 490, 140, 0.5, 'red', 'an obligation:\nmust deliver', lsize=17)),
    step('Long call: the right to buy at 100. Below 100 you walk away and lose the 4.23 premium, nothing more. Above 100 every point is yours. Breakeven 104.23; the gain has no ceiling.',
         frame('lc', 10, 245, 'Long call · right to buy'),
         series('lcs', 'lc', LC, 'green', ms=1300),
         cnote('lc1', 'lc', [80, -4.23], 'lose ≤ 4.23', 'red', dy=18),
         cnote('lc2', 'lc', [127, 37], 'unlimited ↗', 'green', anchor='end'),
         dot('lcb', 'lc', [104.23, 0], '104.23', 'green', dx=4, dy=16, anchor='start')),
    step('Short call: the same contract, sold. Flip the side and the picture flips upside down: whatever the buyer wins, the seller loses. Best case, keep the 4.23. Worst case, no limit, because the price can rise forever.',
         frame('sc', 10, 475, 'Short call · must sell'),
         series('scs', 'sc', SC, 'red', ms=1300),
         cnote('sc1', 'sc', [80, 4.23], 'keep ≤ 4.23', 'green', dy=-18),
         cnote('sc2', 'sc', [127, -37], 'unlimited ↘', 'red', anchor='end'),
         dot('scb', 'sc', [104.23, 0], '104.23', 'red', dx=4, dy=-16, anchor='start'),
         dict(pulse='seller')),
    step('Long put: the right to sell at 100. If the price stays up you lose the 3.73 premium. If it falls you gain: breakeven 96.27, and at most 100 − 3.73 = 96.27 if the price goes all the way to zero.',
         frame('lp', 305, 245, 'Long put · right to sell'),
         series('lps', 'lp', LP, 'green', ms=1300),
         cnote('lp1', 'lp', [120, -3.73], 'lose ≤ 3.73', 'red', dy=18),
         cnote('lp2', 'lp', [77, 38], 'up to 96.27 ↖', 'green', anchor='start'),
         dot('lpb', 'lp', [96.27, 0], '96.27', 'green', dx=-4, dy=16, anchor='end')),
    step('Short put: you sold that right, so you must buy at 100 if assigned. Keep 3.73 at best. Lose at most 96.27, because the price can only fall to zero. Same breakeven, 96.27, mirrored.',
         frame('sp', 305, 475, 'Short put · must buy'),
         series('sps', 'sp', SP, 'red', ms=1300),
         cnote('sp1', 'sp', [120, 3.73], 'keep ≤ 3.73', 'green', dy=-18),
         cnote('sp2', 'sp', [77, -38], 'lose up to 96.27', 'red', anchor='start'),
         dot('spb', 'sp', [96.27, 0], '96.27', 'red', dx=-4, dy=-16, anchor='end'),
         dict(pulse='seller')),
    step('Each column is one contract and the rows are its two sides. The top row bought: worst case is the premium. The bottom row sold: best case is the premium. All the big numbers live on the buyer\'s winning side and the seller\'s losing side.',
         dict(pulse='lc1'), dict(pulse='lp1'), dict(pulse='sc1'), dict(pulse='sp1')),
    step('Now read the diagonal. Long call and short put both make money when the price rises. A put is bearish only for the person who bought it: the seller is bullish, holding the identical piece of paper.',
         cnote('bu1', 'lc', [63, 31], 'bullish ↑', 'blue', 19, anchor='start'),
         cnote('bu2', 'sp', [63, 31], 'bullish ↑', 'blue', 19, anchor='start'),
         dict(pulse='lcs'), dict(pulse='sps')),
    step('The other diagonal, short call and long put, makes money when the price falls. Direction, delta\'s sign, is the one thing set by the diagonal.',
         cnote('be1', 'sc', [137, 31], 'bearish ↓', 'purple', 19, anchor='end'),
         cnote('be2', 'lp', [137, 21], 'bearish ↓', 'purple', 19, anchor='end'),
         dict(pulse='scs'), dict(pulse='lps')),
    step('The other three Greek signs come from the side alone. Everyone in the top row is long gamma, short theta and long vega; everyone in the bottom row is the mirror image.',
         box('gt', 10, 704, 285, 64, 'bought: Γ+ Θ− ν+', 'green', size=20),
         box('gs', 305, 704, 285, 64, 'sold: Γ− Θ+ ν−', 'red', size=20)),
    step('So when someone says "there are a lot of puts out there", ask one question first: bought or sold? Every contract has one of each, and the same paper means opposite things to the two of them.',
         dict(hide='opt'),
         icon('meg', 'megaphone', 265, 8, 0.7, 'purple', 'bought or sold?', lsize=19),
         dict(pulse='buyer'), dict(pulse='seller')),
])


BOARD = dict(name='positions', lesson='options-four-positions', title='The four option positions, drawn as payoffs', cfg=FOUR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=4)
