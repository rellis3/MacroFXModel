from ._wb import *

# ── The covered call is a short put (covered-call-equals-short-put) ────────────
# The lesson's worked example: S = 100, K = 105, r = 4%, sigma = 20%, T = 0.25y.
# Black-Scholes: call 2.39, put 6.35; 105 e^(-0.01) = 103.96. Outlays 100 - 2.39 =
# 103.96 - 6.35 = 97.61. Profit at expiry = min(S_T, 105) - 97.61 for both strategies;
# stock alone = S_T - 100; short call alone = 2.39 - max(S_T - 105, 0).
K, C, OUT = 105, 2.39, 97.61
X0, X1 = 60, 140
def r2(v): return round(v, 2)
STOCK = [[X0, X0 - 100], [X1, X1 - 100]]                               # −40 … +40
SHORTC = [[X0, C], [K, C], [X1, r2(C - (X1 - K))]]                      # +2.39 … −32.61
CC = [[X0, r2(X0 - OUT)], [K, r2(K - OUT)], [X1, r2(K - OUT)]]          # −37.61, +7.39, +7.39
G = (10, 290, 580, 362)

CCALL = dict(w=600, h=775, intro='Two "different" strategies, the lesson\'s worked example, one payoff line. Press play, or step through.', steps=[
    step('Two investors, one stock at $100, a strike of $105, three months to expiry. Door one: the covered-call writer owns a share. Door two: the put writer parks $103.96 in bills, which grows to exactly $105 by expiry at 4%.',
         icon('ccw', 'person', 20, 8, 0.7, 'blue', 'covered-call\nwriter', lsize=17),
         icon('share', 'up', 112, 14, 0.55, 'blue', '1 share\n$100', lsize=17),
         icon('buyers', 'crowd', 265, 8, 0.7, None, 'option buyers', lsize=17),
         icon('bills', 'cash', 410, 14, 0.55, 'amber', '$103.96\nin bills', sym='$', lsize=17),
         icon('pw', 'person', 510, 8, 0.7, 'amber', 'put writer', lsize=17)),
    step('Door one sells a 105-strike call to an option buyer and pockets $2.39 (Black-Scholes at 20% volatility). Net outlay today: 100 − 2.39 = $97.61.',
         icon('cp', 'coin', 282, 112, 0.36, 'blue', '+2.39 call', sym='$', lsize=17),
         move('cp', 150, 112, 1300),
         box('o1', 10, 190, 285, 80, 'outlay today', 'blue', sub='$100.00', size=19),
         dict(count='o1', **{'from': 100, 'to': 97.61, 'dp': 2, 'pre': '$', 'ms': 1200})),
    step('Door two sells a 105-strike put and pockets $6.35. Net outlay: 103.96 − 6.35 = $97.61. The same number, as put-call parity promised: S − C = Ke^(−rT) − P.',
         icon('pp', 'coin', 282, 112, 0.36, 'amber', '+6.35 put', sym='$', lsize=17),
         move('pp', 414, 112, 1300),
         box('o2', 305, 190, 285, 80, 'outlay today', 'amber', sub='$103.96', size=19),
         dict(count='o2', **{'from': 103.96, 'to': 97.61, 'dp': 2, 'pre': '$', 'ms': 1200})),
    step('Now profit at expiry. Start with owning the stock alone (dashed): bought at $100, it gains or loses one for one with the price.',
         chart('pl', G, 'Profit at expiry ($) vs stock price at expiry', [X0, X1], [-44, 44],
               [[-40, '−40'], [0, '0'], [40, '+40']], [[60, '60'], [80, '80'], [105, 'K 105'], [130, '130']], zero=True, pl=46),
         series('stk', 'pl', STOCK, None, dash=True, ms=900, label='- - stock alone', lat=[62, 37], lanchor='start', ldy=0)),
    step('Next, the call you sold, on its own: keep the $2.39 if the stock ends below $105; above $105, hand over every dollar of the rise.',
         series('sc', 'pl', SHORTC, 'purple', ms=1200, label='short call', lat=[140, -32.61], lanchor='end', ldx=-8, ldy=18)),
    step('Add the two and you get the covered call. Below $105 it moves one for one with the stock, $2.39 better off. Above $105 the share is called away and the line goes flat at +$7.39. Breakeven: $97.61.',
         series('cc', 'pl', CC, 'blue', ms=1400, label='covered call', lat=[62, 28], lanchor='start', ldy=0),
         dict(dim='sc'),
         dot('be', 'pl', [OUT, 0], 'breakeven 97.61', 'red', dx=14, dy=16, anchor='start')),
    step('Now door two. Cash plus a short put: below $105 you are made to buy the share at $105; above it nobody puts anything to you and you keep the $105. Draw it, and it lands exactly on the blue line. Both hold min(stock, $105). Not similar. The same.',
         dict(hide='sc'),
         series('sp', 'pl', CC, 'amber', dash=True, ms=1400, label='- - cash + short put', lat=[62, 19], lanchor='start', ldy=0),
         dict(pulse='ccw'), dict(pulse='pw')),
    step('Stock at $130: both hold $105, a profit of +$7.39. The stock alone made +$30, so $22.61 of rally was sold.',
         dict(gap='up', chart='pl', top=[[107.39, 7.39], [140, 40]], bot=[[107.39, 7.39], [140, 7.39]], tone='amber', op=0.25),
         dot('e130s', 'pl', [130, 30], '+30', None, dx=-10, dy=-4, anchor='end'),
         dot('e130', 'pl', [130, 7.39], '+7.39', 'blue', dy=22),
         cnote('sold', 'pl', [138.5, 14.5], 'sold 22.61', 'amber', 17, anchor='end')),
    step('Stock at $100: both hold $100, a profit of +$2.39, the call premium.',
         dot('e100', 'pl', [100, 2.39], '+2.39', 'blue', dx=-10, dy=-12, anchor='end')),
    step('Stock at $80: both hold $80, a loss of $17.61. The stock alone lost $20; the cushion was $2.39. All the way to zero, you lose the whole $97.61.',
         dict(gap='cush', chart='pl', top=[[X0, -37.61], [K, 7.39]], bot=[[X0, -40], [K, 5]], tone='green', op=0.35),
         dot('e80', 'pl', [80, -17.61], '−17.61', 'blue', dx=-10, dy=-12, anchor='end'),
         dot('e80s', 'pl', [80, -20], 'stock −20', None, dx=10, dy=16, anchor='start')),
    step('So you give up every dollar above the strike and keep the whole downside, less one premium. "Conservative" only means slightly less bad than the stock. If a short put frightens you, so should the covered call.',
         box('verdict', 10, 676, 370, 88, '"conservative" =\nthe stock, less one premium', 'red', size=19)),
    step('One more twist. In the open-interest data, that sold call is one more call, exactly like a bull\'s bought call. Open interest never records who opened the contract, so call-heavy open interest is not a crowd of bulls.',
         box('oi', 400, 676, 190, 88, 'call OI\n= bulls?', 'purple', size=19),
         dict(cross='oi'),
         dict(pulse='ccw')),
])


BOARD = dict(name='coveredcall', lesson='covered-call-equals-short-put', title='Covered call vs short put: one line', cfg=CCALL,
             before='  <div class="tl-box scenario">',
             deck_after=5)
