from ._wb import *
from math import exp, log, pi, sqrt

# ── Second-order Greeks: vanna, charm, and the day they mattered (second-order-greeks) ──
# The lesson's worked example: S = 100, K = 105, r = 2%, sigma = 25%, T = 0.5 → Vanna ≈ 0.4870 per
# 1.00 sigma, ≈ 0.00487 per vol point. On 1,000 contracts × 100 that is ≈ 487 shares of delta per vol
# point (our arithmetic from the lesson's numbers). Toy books (short-everything simplification):
# dealer vanna exposure ≈ $661,000 per vol point vs dealer GEX ≈ $17.0M per 1% move, ≈ 26× apart.
# 15 Jan 2015: SNB drops the 1.20 floor (held since Sept 2011), deposit rate to −0.75%; EUR/CHF trades
# as low as ≈ 0.85 within minutes (close to −30%); implied vol jumps from very low levels.
def _vanna(K, S=100, r=0.02, s=0.25, T=0.5):
    d1 = (log(S / K) + (r + s * s / 2) * T) / (s * sqrt(T)); d2 = d1 - s * sqrt(T)
    return -exp(-d1 * d1 / 2) / sqrt(2 * pi) * d2 / s
V = _vanna(105)
assert round(V, 3) == 0.487 and round(V * 0.01 * 100 * 1000) == 487
assert round(16.97 / 0.661) == 26
PART1 = ['cust', 'dlr', 'opt', 'cust>dlr', 'tp', 'tv', 'tt', 'dh', 'tp>dh', 'tv>dh', 'tt>dh', 'buy', 'sell', 'sz', 'szb', 'n26', 'late']

SOG = dict(w=600, h=800, intro='Gamma says a price move forces dealers to re-hedge. Here are the other two triggers, vol and time, how big they are, and the morning they stopped being small.', steps=[
    step('Customers have bought out-of-the-money calls from a dealer, who hedges their delta. The lesson\'s example: stock at 100, strike 105, 25% implied vol, six months to expiry.',
         icon('cust', 'crowd', 40, 10, 0.62, 'blue', 'customers', lsize=17),
         icon('dlr', 'person', 480, 10, 0.62, 'green', 'dealer, short calls', lsize=17),
         arrow('cust', 'dlr', 'buy calls from'),
         box('opt', 190, 96, 220, 70, 'S 100 · K 105\n25% vol · 6 months', 'purple', size=18)),
    step('Three things can shift the dealer\'s delta. The price moving works through gamma, which the dealer-GEX lesson covered. A move in implied vol, price still, works through vanna. A day passing, nothing else, works through charm.',
         box('tp', 20, 200, 170, 64, 'price moves', 'blue', size=19),
         box('tv', 215, 200, 170, 64, 'vol moves', 'purple', size=19),
         box('tt', 410, 200, 170, 64, 'a day passes', 'amber', size=19),
         box('dh', 160, 330, 280, 76, 'dealer\'s delta hedge', 'green', sub='', size=19),
         arrow('tp', 'dh', 'gamma', 'blue'), arrow('tv', 'dh', 'vanna', 'purple'), arrow('tt', 'dh', 'charm', 'amber')),
    step('Vanna first. For this call it is about 0.487 per 1.00 of vol, so each vol point adds about 0.0049 to delta with the stock not moving a cent. Out of the money, more vol means a better chance of finishing in the money.',
         dict(pulse='tv'),
         dict(count='dh', **{'from': 0, 'to': 0.0049, 'dp': 4, 'pre': 'delta +', 'suf': ' per vol pt', 'ms': 1200})),
    step('Implied vol climbs into a central-bank meeting while the price sits still. On 1,000 short calls that is about 487 shares of extra delta per vol point, so the dealer must buy. Real flow, flat price, and no directional view behind it.',
         chip('buy', 300, 300, 'buy ≈ 487 shares', 'green'),
         move('buy', 300, 438, 1100)),
    step('Then the announcement lands and vol collapses. The same vanna runs in reverse: delta falls, and the dealer sells back what it bought, again with no price move needed. A gamma-only view misses both legs.',
         dict(sub='dh', text='vol crush → delta falls'),
         dict(hide='buy'), chip('sell', 300, 438, 'sell it back', 'red'),
         move('sell', 300, 300, 900)),
    step('Charm is the calendar\'s version. Delta drifts just because a day passed, and like gamma it is biggest in the last few days before expiry, so charm flows bunch up into expiry week.',
         dict(pulse='tt'),
         note('late', 300, 438, 'charm: biggest in the last days before expiry', 'amber', 19)),
    step('How big are these flows? On the lesson\'s toy books, dealer vanna exposure is about $661,000 per vol point; dealer gamma exposure is about $17.0 million per 1% move. Real, but roughly 26 times smaller.',
         dict(hide='sell'),
         chart('sz', (10, 466, 580, 210), 'Toy books: dealer exposure, $ million', [0.4, 2.6], [0, 20], [[0, '0'], [10, '10'], [17, '17']],
               [[1, 'gamma, per 1% move'], [2, 'vanna, per vol point']], pl=46),
         dict(bars='szb', chart='sz', data=[[1, 16.97, '$17.0M', 'blue'], [2, 0.661, '$0.66M', 'purple']], bw=90, ms=1100),
         cnote('n26', 'sz', [2, 9], '≈ 26× smaller', 'purple', 19)),
    step('A risk report is a Taylor expansion. Vanna multiplies the price move by the vol move, and vomma multiplies the vol move by itself. On a normal day both moves are small, so those products look like rounding errors.',
         box('taylor', 10, 696, 580, 92, 'ΔV ≈ Δ dS + ½Γ dS² + ν dσ + Vanna dS dσ + ½Vomma dσ²', None, sub='normal day: small × small = tiny', size=18)),
    step('15 January 2015. Since September 2011 the Swiss National Bank had held EUR/CHF above a 1.20 floor. Vol had collapsed, and selling out-of-the-money puts looked like rent on an event the bank promised would not happen.',
         *[dict(hide=i) for i in PART1],
         icon('snb', 'bank', 40, 10, 0.7, 'red', 'SNB floor 1.20', sym='CHF', lsize=17),
         chart('chf', (10, 140, 580, 270), 'EUR/CHF on 15 January 2015 (approx.)', [0, 10], [0.8, 1.26], [[1.2, '1.20'], [1.0, '1.00'], [0.85, '0.85']],
               [[1, 'before'], [9, 'minutes later']], pl=58),
         series('peg', 'chf', [[0.3, 1.201], [6, 1.201]], 'blue', ms=900, label='floor held since 2011', lat=[3, 1.201], ldy=-16)),
    step('That morning the SNB removed the floor without warning and cut its deposit rate to −0.75%. EUR/CHF traded as low as about 0.85 within minutes, close to 30% down, and implied vol jumped from very low levels at the same time.',
         series('drop', 'chf', [[6, 1.201], [6.6, 1.0], [7.2, 0.85]], 'red', ms=700),
         dot('lo', 'chf', [7.2, 0.85], '≈ 0.85 (−30%)', 'red', dx=-12, dy=0, anchor='end'),
         box('vj', 60, 430, 480, 66, 'implied vol jumps from very low levels', 'amber', size=19)),
    step('Now both moves are huge together, so their product is too. For a short out-of-the-money put, vanna makes the long delta grow while spot falls, and vomma makes the short vega grow as vol rises. The rounding errors became the loss.',
         dict(sub='taylor', text='15 Jan: huge × huge = the P&L'),
         dict(pulse='taylor')),
    step('Then the move went past what any expansion can follow. Puts far out of the money at breakfast were deep in the money minutes later, past every strike, with no tradeable prices in between. Many orders filled far from where they were placed.',
         dict(cross='taylor'),
         note('gap', 300, 560, 'gapped past every strike: nothing to re-hedge into', 'red', 19)),
])


BOARD = dict(name='second_order_greeks', lesson='second-order-greeks', title='Vanna, charm, and the morning the small terms mattered', cfg=SOG,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>It actually happened: 15 January 2015',
             deck_after=11)
