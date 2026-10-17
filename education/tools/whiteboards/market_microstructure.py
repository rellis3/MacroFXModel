from ._wb import *

# ── Market microstructure: why there is a spread, and why size moves price ────
# Glosten-Milgrom, the lesson's worked example: V_H = 101, V_L = 99, equal prior.
# α = 0.3: P(V_H | buy) = 0.65, ask = 0.65·101 + 0.35·99 = 100.30, bid = 99.70, spread 0.60.
# α = 0.6: P(V_H | buy) = 0.80, ask = 100.60, bid = 99.40, spread 1.20. Midpoint 100 both times.
# Kyle: σ_v = 2; σ_u = 100 → λ = 0.01; σ_u = 20 → λ = 0.05; Q = 500 → $5 versus $25.
# Flash Crash, 6 May 2010 (the lesson's episode, from the SEC/CFTC staff report): a 75,000-contract
# E-mini sell programme (~$4.1bn); E-mini buy-side depth fell to about $58m, under 1% of the morning's;
# stub quotes at $0.01; Accenture traded at a penny; more than 20,000 trades were later cancelled.
def ask(a): return (1 + a) / 2 * 101 + (1 - a) / 2 * 99
def bid(a): return (1 + a) / 2 * 99 + (1 - a) / 2 * 101
assert round(ask(0.3), 2) == 100.30 and round(bid(0.3), 2) == 99.70 and round(ask(0.6), 2) == 100.60 and round(bid(0.6), 2) == 99.40
assert round(2 / (2 * 100), 4) == 0.01 and round(2 / (2 * 20), 4) == 0.05

GM = (10, 150, 285, 270)
KY = (305, 150, 285, 270)

MM = dict(w=600, h=720, intro='A market maker who cannot tell who is on the other side. First why that forces a spread, then why a bigger order moves the price further. The lesson\'s own numbers. Press play, or step through.', steps=[
    step('You are a market maker. Orders arrive one at a time and you cannot see who sends them. Most come from noise traders, who trade for reasons unrelated to value. Some come from informed traders, who know where the value really is.',
         icon('mm', 'bank', 250, 4, 0.8, 'blue', 'market maker', lsize=17),
         icon('noise', 'crowd', 30, 4, 0.8, 'green', 'noise traders', lsize=17),
         icon('inf', 'person', 480, 4, 0.8, 'red', 'informed', lsize=17)),
    step('The true value is either 101 or 99, equally likely. Say 30% of orders are informed: α = 0.3. Informed traders only buy when the value is 101. So a buy is evidence, and it moves your belief that the value is high from 50% to 65%.',
         chip('buy', 470, 112, 'a buy', 'amber'),
         move('buy', 330, 112, 1000),
         note('post', 150, 122, '50% → 65% that V = 101', 'amber', 18)),
    step('To break even you must sell at what a buy tells you the asset is worth: 0.65 × 101 + 0.35 × 99 = 100.30. By the mirror logic you buy at 99.70. The gap, 0.60, is the spread: protection against the informed flow.',
         dict(hide='buy'),
         chart('gm', GM, 'Glosten-Milgrom quotes', [0.4, 2.6], [98.8, 101.2], [[99, '99'], [100, '100'], [101, '101']], [[1, 'α = 0.3'], [2, 'α = 0.6']], pl=44),
         series('vh', 'gm', [[0.5, 101], [2.5, 101]], None, dash=True, ms=400, label='value high', lat=[1.45, 101], ldy=-12),
         series('vl', 'gm', [[0.5, 99], [2.5, 99]], None, dash=True, ms=400, label='value low', lat=[1.45, 99], ldy=-12),
         dict(gap='s3', chart='gm', top=[[0.8, 100.3], [1.2, 100.3]], bot=[[0.8, 99.7], [1.2, 99.7]], tone='amber', op=0.5),
         dot('a3', 'gm', [1, 100.3], 'ask 100.30', 'amber', dy=-14),
         dot('b3', 'gm', [1, 99.7], 'bid 99.70', 'amber', dy=16)),
    step('Now suppose twice as much flow is informed, α = 0.6. A buy now moves your belief to 80%, so the ask is 100.60 and the bid 99.40. The spread doubles to 1.20, and the midpoint stays at 100. Spread = α × (101 − 99).',
         dict(hide='post'),
         note('post2', 150, 122, 'α = 0.6: 50% → 80%', 'red', 18),
         dict(gap='s6', chart='gm', top=[[1.8, 100.6], [2.2, 100.6]], bot=[[1.8, 99.4], [2.2, 99.4]], tone='red', op=0.5),
         dot('a6', 'gm', [2, 100.6], '100.60', 'red', dy=-14),
         dot('b6', 'gm', [2, 99.4], '99.40', 'red', dy=16),
         series('mid', 'gm', [[0.5, 100], [2.5, 100]], 'blue', dash=True, ms=400)),
    step('Kyle asked the same question for order size. The price moves in proportion to the order: impact = λ × Q. λ is set by how much ordinary two-way trading there is to hide an order in.',
         chart('ky', KY, 'Kyle: price impact ($)', [0, 1000], [0, 52], [[0, '0'], [25, '25'], [50, '50']], [[0, '0'], [500, '500'], [1000, '1000']], pl=40),
         series('deep', 'ky', [[0, 0], [1000, 10]], 'blue', ms=900, label='deep: λ = 0.01', lat=[1000, 10], ldx=-4, ldy=-14, lanchor='end')),
    step('With value uncertainty 2 and noise volume 100, λ = 2 ÷ 200 = 0.01. Cut the noise volume to 20, a thin session, and λ = 2 ÷ 40 = 0.05: five times steeper.',
         series('thin', 'ky', [[0, 0], [1000, 50]], 'red', ms=900, label='thin: λ = 0.05', lat=[640, 32], ldx=-8, ldy=0, lanchor='end')),
    step('Push the same 500-unit order through both. Deep market: 0.01 × 500 = $5. Thin market: 0.05 × 500 = $25. Nothing about the order changed, only the depth it landed in.',
         series('q', 'ky', [[500, 0], [500, 50]], None, dash=True, ms=400),
         dot('d5', 'ky', [500, 5], '$5', 'blue', dx=10, dy=-10, anchor='start'),
         dot('d25', 'ky', [500, 25], '$25', 'red', dx=10, dy=8, anchor='start')),
    step('6 May 2010, 2:32 pm Eastern. A fund starts selling 75,000 E-mini contracts, about $4.1 billion, through an algorithm keyed to volume, not price. Intermediaries buy, then pass the contracts back and forth.',
         icon('fund', 'scroll', 30, 440, 0.7, 'red', '75,000 E-minis\n≈ $4.1bn', lsize=16),
         box('depth', 160, 446, 240, 70, 'E-mini buy depth', 'red', sub='normal', size=18)),
    step('Market makers could not tell why prices were falling, so they acted as if α was high, widening or leaving. Buy-side depth fell to about $58 million, under 1% of the morning\'s: the noise volume that sets λ was almost gone.',
         dict(sub='depth', text='≈ $58m: under 1%'),
         dict(pulse='depth'),
         dict(dim='deep'), dict(pulse='thin')),
    step('In some stocks the only orders left were stub quotes: placeholder bids at a penny. Market sell orders hit them. Accenture traded at one cent, and more than 20,000 trades were later cancelled.',
         icon('warn', 'warn', 430, 440, 0.7, 'red'),
         box('stub', 160, 534, 430, 64, 'stub bid: $0.01', 'red', size=20)),
    step('The lesson for a trader: the spread is the price of not knowing who is on the other side, and impact grows with size and thinness. Slice big orders, and avoid market and stop orders when liquidity is thin.',
         box('rule', 10, 616, 580, 96, 'slice big orders\nno market orders into a thin book', 'green', size=19)),
])


BOARD = dict(name='market_microstructure', lesson='market-microstructure', title='Why there is a spread, and why size moves the price', cfg=MM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the Flash Crash, 6 May 2010</h2>',
             deck_after=9)
