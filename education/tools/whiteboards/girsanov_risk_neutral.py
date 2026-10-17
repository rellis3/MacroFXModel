from ._wb import *
from math import exp, log, pi, sqrt

# ── Girsanov & the risk-neutral measure (girsanov-risk-neutral) ───────────────
# The visual guide's own numbers. One-step tree: S0 = 100, u = 1.2, d = 0.9, r = 5%, T = 1,
# call strike 100. Risk-neutral q = (e^r - d)/(u - d) = 0.504, price e^-r * q * 20 = 9.59.
# The replicating portfolio (2/3 share, borrow 60 e^-r = 57.07) costs the same 9.59.
# The 70% "your odds" is an illustrative view, used only to show it does not enter.
# Continuous part: the guide's drift slider default mu = 9%, r = 5%, sigma = 20%, theta = 0.2;
# the two lognormal densities of S_T (one year) are computed exactly below.
R, U, D, S0, K = 0.05, 1.2, 0.9, 100.0, 100.0
Q = (exp(R) - D) / (U - D)
PRICE = exp(-R) * Q * (U * S0 - K)
VIEW = exp(-R) * 0.7 * (U * S0 - K)
DELTA = (U * S0 - K) / ((U - D) * S0)
BORROW = DELTA * D * S0 * exp(-R)
assert abs(DELTA * S0 - BORROW - PRICE) < 1e-9
assert round(Q, 3) == 0.504 and round(PRICE, 2) == 9.59 and round(VIEW, 2) == 13.32 and round(BORROW, 2) == 57.07

SIG = 0.2
def _pdf(x, mu):
    m = log(S0) + (mu - SIG * SIG / 2)
    return 100 * exp(-(log(x) - m) ** 2 / (2 * SIG * SIG)) / (x * SIG * sqrt(2 * pi))
XS = [60 + 2 * i for i in range(56)]
DP = [[x, round(_pdf(x, 0.09), 3)] for x in XS]
DQ = [[x, round(_pdf(x, 0.05), 3)] for x in XS]
MP, MQ = S0 * exp(0.09), S0 * exp(0.05)   # 109.4 and 105.1

CH = (10, 290, 580, 270)
GIRSANOV = dict(w=600, h=700, intro="Why an option's price never asks where you think the stock is going. One small tree first, then the same idea for a whole price path. Press play, or step through.", steps=[
    step('Meet the stock: 100 today. In one year it goes up to 120 or down to 90. Cash pays 5%. A call with strike 100 pays 20 if the stock goes up and nothing if it goes down.',
         box('now', 20, 80, 130, 70, 'stock\n100', 'blue', size=20),
         box('up', 230, 12, 140, 70, 'up: 120', 'green', sub='call pays 20', size=19),
         box('dn', 230, 150, 140, 70, 'down: 90', 'red', sub='call pays 0', size=19),
         arrow('now', 'up'), arrow('now', 'dn')),
    step('Say you think the up move is 70% likely (an illustrative view). Average the payoff with your odds and discount at 5%: 0.7 × 20 ÷ e^0.05 = 13.32. Is that the price?',
         box('view', 410, 12, 180, 80, 'your odds: 70% up', 'amber', sub='price 13.32?', size=18)),
    step('No. You can copy the call without it: buy two thirds of a share and borrow 57.07. If the stock goes up you hold 80 and repay 60: a profit of 20. If it goes down you hold 60 and repay 60: nothing. Exactly the call\'s payoffs.',
         box('copy', 410, 110, 180, 118, 'copy it:\n⅔ share − 57.07', 'green', sub='costs 9.59', size=18),
         arrow('copy', 'up', dash=True), arrow('copy', 'dn', dash=True)),
    step('The copy costs ⅔ × 100 − 57.07 = 9.59 today. So the call must cost 9.59. Sell it for 13.32 and anyone can sell you the call, buy the copy, and pocket the gap with no risk.',
         dict(cross='view'), dict(pulse='copy')),
    step('Which odds give 9.59? Only q = (e^0.05 − 0.9) ÷ (1.2 − 0.9) = 0.504. Under those odds the stock grows on average at exactly 5%, the cash rate. That is the risk-neutral probability.',
         note('q', 300, 248, 'risk-neutral odds:  q = (e^0.05 − 0.9) ÷ 0.3 = 0.504', 'green', 18)),
    step('Price = 0.504 × 20 ÷ e^0.05 = 9.59. Your 70% appears nowhere. The price needs the possible moves and the cash rate, never a forecast.',
         dict(hide='q'),
         note('q2', 300, 248, 'price = 0.504 × 20 ÷ e^0.05 = 9.59   (70% never used)', 'green', 18)),
    step('Now a real stock with a whole path of moves: real-world drift 9%, volatility 20%, cash 5%. Here is the spread of its price in one year under the real-world odds. Its average is 109.4.',
         chart('dens', CH, 'Price in one year, from 100 today', [60, 170], [0, 2.2], [],
               [[80, '80'], [100, '100'], [120, '120'], [140, '140'], [160, '160']], pl=20, pr=20),
         series('p', 'dens', DP, 'blue', ms=1400, label='real world ℙ', lat=[140, _pdf(140, 0.09)], ldx=6, ldy=-16, lanchor='start'),
         dot('mp', 'dens', [round(MP, 1), round(_pdf(MP, 0.09), 3)], 'avg 109.4', 'blue', dx=14, dy=-12, anchor='start')),
    step('Girsanov reweights the same paths: high ones a little less likely, low ones a little more, until the average grows at 5%. The shift is θ = (9% − 5%) ÷ 20% = 0.2, the market price of risk.',
         series('q', 'dens', DQ, 'green', ms=1400, label='risk-neutral ℚ', lat=[92, _pdf(92, 0.05)], ldx=-12, ldy=0, lanchor='end'),
         dot('mq', 'dens', [round(MQ, 1), round(_pdf(MQ, 0.05), 3)], 'avg 105.1', 'green', dx=0, dy=36, anchor='middle')),
    step('Look at what did not move: the shape and the width. Volatility is 20% under both. No path is added or removed. Only the odds on each path change, so the center slides from 109.4 to 105.1.',
         dict(pulse='p'), dict(pulse='q')),
    step('Under the green odds the price in today\'s money has no drift left: a fair game, a martingale. No arbitrage forces every derivative to be a fair game under the same odds, so its price is the discounted green average.',
         box('qbox', 10, 580, 285, 108, 'ℚ: price and hedge\ndrift = cash rate 5%', 'green', size=19)),
    step('The blue odds still matter, just for different jobs: your view, stress tests and how bad things could get. Price with ℚ, forecast with ℙ, and never mix the two in one number.',
         box('pbox', 305, 580, 285, 108, 'ℙ: forecast and risk\ndrift = your 9%', 'blue', size=19)),
])


BOARD = dict(name='girsanov_risk_neutral', lesson='girsanov-risk-neutral', title='Girsanov: same paths, new odds, one price',
             cfg=GIRSANOV,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
