from ._wb import *
from math import erf, exp, log, sqrt

# ── Options contract mechanics (options-contract-mechanics) ───────────────────
# The lesson's example: XYZ at 100, a 30-day call struck at 105, 25% volatility, r = 2%, q = 0,
# bought at the 1.15 ask (bid 1.10), so $115 a contract. Curves are the lesson's formulas:
# P&L at expiry = (max(S - 105, 0) - 1.15) * 100; "today" = (Black-Scholes value - 1.15) * 100.
# Spread numbers: five contracts, $0.70 fees a side: round trip $32.00 (5.53% of $578.50);
# thin market 0.90 / 1.30: $207.00 (31.68% of $653.50).
def _N(x): return 0.5 * (1 + erf(x / sqrt(2)))
def _call(S, K=105.0, T=30 / 365, s=0.25, r=0.02):
    d1 = (log(S / K) + (r + s * s / 2) * T) / (s * sqrt(T)); d2 = d1 - s * sqrt(T)
    return S * _N(d1) - K * exp(-r * T) * _N(d2)
XS = [98 + 0.5 * i for i in range(0, 29)]          # 98 .. 112
EXPIRY = [[x, round((max(x - 105, 0) - 1.15) * 100, 1)] for x in XS]
TODAY = [[x, round((_call(x) - 1.15) * 100, 1)] for x in XS]

CH = (10, 10, 580, 340)
OPT = dict(w=600, h=420, intro='One call on a made-up stock: what is printed on the contract, what it costs to get in and out, and how it ends. Press play, or step through.', steps=[
    step('One call on XYZ, which trades at 100. The contract is the right to buy 100 shares at 105, any time in the next 30 days. A buyer and a seller sit on opposite sides.',
         icon('you', 'person', 20, 18, 0.7, 'blue', 'you (buyer)', lsize=18),
         icon('sel', 'person', 470, 18, 0.7, 'green', 'seller', lsize=18),
         box('ct', 150, 30, 300, 78, '1 call on XYZ', 'blue', sub='strike 105 · 30 days · 100 shares')),
    step('The quote is 1.15 a share, but one contract covers 100 shares. So the buyer pays $115 to the seller, up front. The seller keeps it whatever happens.',
         chip('cash', 90, 150, '$115', 'amber'),
         move('cash', 440, 150, 1300),
         note('calc', 300, 205, '1.15 × 100 shares = $115', 'amber', 22)),
    step('The buyer holds a right: use it, sell it, or walk away. The seller holds an obligation: deliver if the buyer asks. The most the buyer can lose is the $115.',
         note('r1', 300, 262, 'buyer: a right, can walk away', 'green', 20),
         note('r2', 300, 300, 'seller: an obligation, must deliver', 'red', 20)),
    step('At expiry the call pays whatever the stock finishes above 105, or nothing. After the $115 paid, the P&L is flat at −$115 up to the strike, then climbs. Break-even is 106.15, the strike plus the premium.',
         dict(hide='you'), dict(hide='sel'), dict(hide='ct'), dict(hide='cash'), dict(hide='calc'), dict(hide='r1'), dict(hide='r2'),
         chart('pl', CH, 'One contract: P&L per contract at expiry ($)', [98, 112], [-200, 650],
               [[0, '0'], [300, '+300'], [600, '+600']], [[100, '100'], [105, '105'], [110, '110']], zero=True, pl=62, pr=20),
         series('exp', 'pl', EXPIRY, 'purple', ms=1600),
         dot('be', 'pl', [106.15, 0], 'break-even 106.15', 'green', dx=10, dy=24, anchor='start'),
         dot('ml', 'pl', [100, -115], 'worst case −$115', 'red', dx=8, dy=-18, anchor='start')),
    step('Before expiry the option is worth more than that line. With 30 days left at 25% volatility, today\'s value (blue dashes) sits above it everywhere. The shaded gap is time value: you pay for it, and it melts to zero by expiry.',
         series('now', 'pl', TODAY, 'blue', dash=True, ms=1500),
         dict(gap='tv', chart='pl', top=TODAY, bot=EXPIRY, tone='amber', op=0.22),
         cnote('tvn', 'pl', [102, 200], 'time value', 'amber', 20)),
    step('Now getting out. The screen shows bid 1.10 and ask 1.15. You buy at the ask and sell at the bid. On five contracts the 5-cent spread is $25, plus $7 of fees both ways: $32, or 5.5% of the $578.50 laid out.',
         dict(hide='pl'), dict(hide='exp'), dict(hide='now'), dict(hide='tv'), dict(hide='be'), dict(hide='ml'), dict(hide='tvn'),
         box('bid', 20, 40, 250, 84, 'bid 1.10', 'red', sub='you sell here'),
         box('ask', 330, 40, 250, 84, 'ask 1.15', 'green', sub='you buy here'),
         arrow('ask', 'bid', None, 'amber'),
         note('rt', 300, 200, 'five contracts, round trip:\n$25 spread + $7 fees = $32', 'amber', 22)),
    step('The same five contracts in a thin market, quoted 0.90 and 1.30. The spread is 36% of the mid, and the round trip costs $207, or 31.7% of the cash laid out, before the stock has moved.',
         dict(hide='bid'), dict(hide='ask'), dict(hide='ask>bid'), dict(hide='rt'),
         chart('cost', (10, 20, 290, 260), 'Round-trip cost ($)', [0, 3], [0, 250],
               [[0, '0'], [100, '$100'], [200, '$200']], [[1, 'busy'], [2, 'thin']], pl=52, pr=14),
         dict(bars='cb', chart='cost', data=[[1, 32, '$32', 'green'], [2, 207, '$207', 'red']], bw=50, ms=1200),
         box('thin', 320, 50, 270, 140, 'thin: 0.90 / 1.30\n36% of the mid\n31.7% of the cash', 'red', size=20)),
    step('How it ends depends on where it trades. A US stock option can be exercised any time and settles in shares. An SPX option is exercised only at expiry and settles in cash. An FX option is a private contract, judged at 10:00 New York time, with currencies delivered two business days later.',
         dict(hide='cost'), dict(hide='cb'), dict(hide='thin'),
         box('b1', 15, 60, 180, 130, 'US stock', 'blue', sub='100 shares', size=20),
         box('b2', 210, 60, 180, 130, 'SPX index', 'amber', sub='cash, $100 a point', size=20),
         box('b3', 405, 60, 180, 130, 'EUR/USD', 'purple', sub='currency, 10:00 NY', size=20)),
    step('Expiry day for a US stock option. Trading stops at 4:00 p.m. New York time. The OCC then exercises anything $0.01 or more in the money. Holders can still decide until about 5:30 p.m. The seller learns of assignment only after that.',
         dict(hide='b1'), dict(hide='b2'), dict(hide='b3'),
         box('t1', 110, 10, 380, 58, '4:00 pm New York: trading stops', 'blue', size=19),
         box('t2', 110, 108, 380, 58, 'OCC auto-exercises if ≥ $0.01 ITM', 'amber', size=19),
         box('t3', 110, 206, 380, 58, '~5:30 pm: holders can still decide', 'red', size=19),
         box('t4', 110, 304, 380, 58, 'sellers learn of assignment later', 'purple', size=19),
         arrow('t1', 't2', None, 'amber'), arrow('t2', 't3', None, 'amber'), arrow('t3', 't4', None, 'amber')),
    step('The pin-risk rule: a seller cannot know, or hedge for both outcomes, if the stock closes within pennies of the strike. Before the close, buy it back or accept a position you did not plan to hold over the weekend.',
         note('pin', 300, 396, 'pin risk: close near-the-money shorts before the bell', 'red', 19)),
])

BOARD = dict(name='options_contract_mechanics', lesson='options-contract-mechanics', title='What an options contract is, costs and how it ends', cfg=OPT,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>It actually happened: Cboe, April 1973</h2>',
             deck_after=8)
