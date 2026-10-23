from ._wb import *
from math import log, sqrt, exp, erf, floor

# ── Short premium: risk, margin and sizing (short-premium-risk-and-sizing) ────
# Inputs (the lesson's): index 100, 45 days to expiry (45/365), implied vol 20%, rate 3%, no dividends,
# multiplier 100, Black-Scholes prices. Position: short 95 put + short 105 call (strangle).
# Credit $197.60 per contract. Worst grid cell (spot +20%, vol +30 pts, one day later): -$1,650.54.
# The row "vol +20 pts, one day later" across spot -20,-10,-5,0,+5,+10,+20 %: the bars in step 5.
# Account $100,000. Margin per strangle on the 20% rule: $1,697.60 -> 29 contracts at 50% use,
# 29 x 1,650.54 = $47,865.77 = 47.9% of the account. Worst-case sizing at a 2% budget ($2,000): 1 contract, 1.7%.
# Iron condor 90/95/105/110: credit $147.22, cap (5 - 1.4722) x 100 = $352.78, 5 contracts, premium $736 a cycle.
S0, R, V0, T0, M = 100.0, 0.03, 0.20, 45 / 365, 100
def N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def bs(k, S, K, v, T):
    sq = v * sqrt(T); d1 = (log(S / K) + (R + v * v / 2) * T) / sq; d2 = d1 - sq
    return S * N(d1) - K * exp(-R * T) * N(d2) if k == 'c' else K * exp(-R * T) * N(-d2) - S * N(-d1)
STRANGLE = [('p', 95, -1), ('c', 105, -1)]
def val(S, v, T): return sum(q * bs(k, S, K, v, T) for k, K, q in STRANGLE)
V_ENTRY = val(S0, V0, T0)
def pnl(dS, dv, h): return (val(S0 * (1 + dS / 100), V0 + dv / 100, T0 - h / 365) - V_ENTRY) * M
CREDIT = -V_ENTRY * M
WORST = min(pnl(c, r, 1) for c in (-20, -10, -5, 0, 5, 10, 20) for r in (-5, 0, 10, 20, 30))
assert round(CREDIT) == 198 and round(WORST) == -1651
cum = [[0, 0.0]]
for i in range(1, 9): cum.append([i, round(CREDIT * i, 1)])          # eight cycles that expire worthless
END8 = cum[-1][1]
FALL = [[8, END8], [9, round(END8 + WORST, 1)]]                       # the ninth cycle is the worst square
COLS = [-20, -10, -5, 0, 5, 10, 20]
BARS = [[i, round(pnl(c, 20, 1)), ('−' if pnl(c, 20, 1) < 0 else '+') + format(abs(round(pnl(c, 20, 1))), ',')] for i, c in enumerate(COLS)]

CH1 = (10, 138, 580, 250)
CH2 = (10, 402, 580, 228)
SPR = dict(w=600, h=905, intro='One short strangle on an index, a $100,000 account, and two ways to decide how many to sell. Press play, or step through.', steps=[
    step('You sell a strangle on an index at 100: a 95 put and a 105 call, 45 days out. Buyers pay you $198 per contract in premium. Your account is $100,000.',
         icon('you', 'person', 20, 14, 0.7, 'blue', 'you, the\nseller', lsize=17),
         icon('acct', 'piggy', 150, 14, 0.75, 'blue', 'account\n$100,000', sym='$', lsize=17),
         icon('buyers', 'crowd', 310, 14, 0.7, None, 'option buyers', lsize=17),
         icon('prem', 'coin', 470, 22, 0.55, 'green', '+$198\nper contract', sym='$', lsize=17)),
    step('Suppose eight cycles in a row expire worthless (illustrative). Each pays $198, and the line climbs to +$1,581. A high win rate and a smooth curve. This is the toll booth.',
         chart('cum', CH1, 'One strangle, cumulative profit ($)', [0, 9], [-400, 1900],
               [[0, '0'], [1000, '+1,000'], [1800, '+1,800']], [[0, '0'], [4, '4'], [8, '8 cycles']], zero=True, pl=62, pr=40),
         series('wins', 'cum', cum, 'green', ms=1700, label='+$1,581', lat=[8, END8], ldx=0, ldy=-16, lsize=17)),
    step('Then the worst square on the grid: the index up 20% and volatility up 30 points, one day later. That one night costs $1,651, more than eight cycles of income. The line ends below where it started.',
         series('shock', 'cum', FALL, 'red', ms=1100, label='−$1,651', lat=[9, FALL[1][1]], ldx=-6, ldy=22, lanchor='end', lsize=17),
         dot('endpt', 'cum', FALL[1], '', 'red')),
    step('Win rate says nothing here. If every loser lost that much, you would need to win 89% of cycles just to break even. The shape of the payoff is what matters.',
         box('be', 78, 180, 320, 62, 'break-even win rate\n= loss ÷ (loss + credit) = 89.3%', 'amber', size=17)),
    step('Where does it hurt? Re-price the strangle on a grid of spot moves and volatility jumps. This is the row with volatility up 20 points, one day later. Both tails lose, and the up-move has no cap.',
         dict(hide='be'),
         chart('row', CH2, 'Profit or loss per strangle, vol +20 pts ($)', [-0.6, 6.6], [-1750, 250],
               [[0, '0'], [-1000, '−1,000']], [[0, '−20%'], [1, '−10%'], [2, '−5%'], [3, '0'], [4, '+5%'], [5, '+10%'], [6, '+20%']], zero=True, pl=62, pr=14, pb=30),
         dict(bars='lad', chart='row', data=BARS, bw=40, size=15, ms=1300)),
    step('Now margin. On a common equity-option rule your broker asks for about $1,698 per strangle. That is the collateral it wants today. It is a rule, not your worst case, and it can be raised after a shock.',
         box('mg', 10, 648, 580, 76, 'broker margin: $1,698 per strangle\na collateral rule, not a bound', 'amber', size=19)),
    step('Size by margin and use half the account: $50,000 ÷ $1,698 = 29 strangles. In the worst square each loses $1,651, so the book loses $47,866, nearly half the account.',
         dict(hide='mg'),
         box('bm', 10, 648, 285, 112, 'sized by margin\n29 strangles', 'red', sub='−0.0% of account', size=19),
         dict(count='bm', **{'from': 0, 'to': 47.9, 'dp': 1, 'pre': '−', 'suf': '% of account', 'ms': 1300})),
    step('Size by the worst case instead. Budget 2% = $2,000. Divide by $1,651 per strangle and round down: one strangle. The worst square costs 1.7% of the account, and you trade next month.',
         box('bw', 305, 648, 285, 112, 'sized by worst case\n1 strangle', 'green', sub='−0.0% of account', size=19),
         dict(count='bw', **{'from': 0, 'to': 1.7, 'dp': 1, 'pre': '−', 'suf': '% of account', 'ms': 1000})),
    step('The price of survival: 29 strangles collect $5,730 a cycle, one collects $198. Nobody advertises that trade-off, but it is the real cost of staying in the game.',
         note('inc', 300, 790, 'premium per cycle: $5,730 against $198', 'amber', 19)),
    step('Defined risk changes the arithmetic. An iron condor has long wings that cap the loss at $353 a contract, so the same $2,000 budget buys 5 of them and collects $736 a cycle.',
         box('ic', 10, 812, 580, 78, 'iron condor: cap $353, 5 contracts\npremium $736 a cycle, worst case 1.8%', 'blue', size=19)),
    step('But defined risk caps the loss per contract, not how many you hold. Size 141 condors by half the account in margin and the same $353 cap still adds up to about half the account.',
         dict(pulse='bm'), dict(pulse='ic')),
    step('So: re-price on a grid, take the worst square, divide your loss budget by it, round down. Size so the worst night is a bad week, not the end.',
         dict(pulse='bw')),
])

BOARD = dict(name='short_premium_risk_and_sizing', lesson='short-premium-risk-and-sizing',
             title='One strangle, two ways to size it', cfg=SPR,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=6)
