from ._wb import *

# ── 2. Gamma squeeze (gamma-exposure-dealer-hedging) ─────────────────────────
def py(p): return round(250 - (p - 4470) * 2)  # price → y on the mini chart
GAM = dict(w=600, h=520, intro='A stylised index-futures squeeze: the same open interest that looked like a wall becomes the fuel. Press play, or step through.', steps=[
    step('A big pile of 4,500 calls has built up. Here, customers bought them, so the dealers who sold them are short the calls. That is the opposite of the usual case.',
         icon('cust', 'crowd', 95, 0, 0.55, 'blue', 'customers BUY\n4,500 calls', lsize=16),
         icon('deal', 'person', 450, 0, 0.55, 'red', 'dealers SELL them\n→ short gamma', lsize=16),
         arrow('cust', 'deal')),
    step('Price grinds up from 4,480 toward the 4,500 strike in a quiet session.',
         dict(line='axis', points=[[30, 100], [30, 255], [575, 255]], tone='chalk', width=2, ms=500),
         dict(line='strike', points=[[30, py(4500)], [575, py(4500)]], tone='amber', width=2, ms=600),
         note('sk', 470, py(4500) + 16, '4,500 strike', 'amber', 18),
         dict(line='p1', points=[[40, py(4480)], [90, py(4483)], [140, py(4486)], [190, py(4490)], [240, py(4494)], [270, py(4497)]], tone='blue', width=3.5, ms=1400)),
    step('As price rises, each short call\'s delta rises, from say 0.40 toward 0.50. A short-call position must be hedged with long futures equal to delta, so the dealers\' hedge has to grow.',
         box('up', 20, 290, 165, 66, 'Price rises', 'blue'),
         box('dl', 218, 290, 165, 66, 'Calls\' delta', 'amber', sub='0.40'),
         arrow('up', 'dl'),
         dict(count='dl', **{'from': 0.40, 'to': 0.50, 'dp': 2, 'ms': 1300})),
    step('So the dealers must buy futures. On 1,000 short calls with a 100 multiplier, each 0.10 rise in delta means buying the equivalent of 10,000 more units of the index.',
         box('buy', 415, 290, 165, 66, 'Dealers BUY\nfutures', 'red'),
         arrow('dl', 'buy')),
    step('That buying nudges price higher, which raises delta again and forces more buying. At the strike, delta is about 0.5 and gamma is at its peak, so this loop runs fastest right here.',
         arrow('buy', 'up', 'their buying lifts price', 'red', bend=-48, id='loop'),
         dict(pulse='buy')),
    step('Then a strong data release hits mid-session, and price rips straight through 4,500.',
         icon('news', 'bolt', 248, 104, 0.4, 'amber', 'data!', lsize=16),
         dict(line='p2', points=[[270, py(4497)], [290, py(4502)], [305, py(4512)], [325, py(4520)]], tone='red', width=3.5, ms=700)),
    step('The calls are now in the money and gaining delta faster than the dealers\' hedge assumed. The catch-up buying accelerates the move well past the strike.',
         dict(count='dl', **{'from': 0.50, 'to': 0.80, 'dp': 2, 'ms': 1200}),
         dict(line='p3', points=[[325, py(4520)], [355, py(4529)], [385, py(4535)]], tone='red', width=3.5, ms=800),
         icon('rk', 'rocket', 410, 128, 0.42, 'red'),
         dict(pulse='loop')),
    step('Once the calls are deep in the money, delta approaches 1 and gamma fades. The forced buying dies out, and price finds the next level.',
         dict(line='p4', points=[[385, py(4535)], [430, py(4537)], [480, py(4536)], [540, py(4538)]], tone='chalk', width=3, ms=1000)),
    step('Contrast the usual case: if dealers had owned these calls (customers overwriting them), their hedging would sell into the rally hardest right around 4,500, and the move would tend to stall there. Same open interest, opposite flow. Who owns it decides.',
         box('std', 20, 440, 560, 68, 'If dealers OWNED the calls (the usual case):\nthey sell into the rally → it stalls near 4,500', 'green', size=20)),
])


BOARD = dict(name='squeeze', lesson='gamma-exposure-dealer-hedging', title='A gamma squeeze, drawn step by step', cfg=GAM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: 5 February 2018',
             deck_after=7)
