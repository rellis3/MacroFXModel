from ._wb import *

# ── Corporate actions & series continuity (corporate-actions-series-continuity) ──
# Split: the lesson's 2-for-1, $100 -> $50, factor 0.5 (the small day-to-day wiggles are illustrative).
# Roll: the lesson's worked example ($72.00 a week before; expiring $78.40, new $78.90; Panama
# offset $0.50 -> $72.50; ratio 78.90/78.40 -> $72.46). The long-drift chart is illustrative.
# WTI: the lesson's 20 April 2020 facts (May settled -$37.63, about $18 the Friday before; June ~ $20).
RAW_S = [[0, 100], [1, 101], [2, 99], [3, 100], [3.02, 50], [4, 51], [5, 50]]
ADJ_S = [[0, 50], [1, 50.5], [2, 49.5], [3, 50], [4, 51], [5, 50]]
OLD = [[0, 72.0], [5, 78.4]]
PAN = [[0, 72.5], [5, 78.9]]
NEW = [[5, 78.9], [6, 79.1]]
ACT = [[0, 30], [2, 34], [4, 28], [6, 36], [8, 31], [10, 33]]
PDR = [[0, 30], [2, 26], [4, 12], [6, 12], [8, -1], [10, -7]]

CA = dict(w=600, h=770, intro='Accurate prices, fake jumps: a stock split, a futures roll, and the two standard ways to splice a continuous series. Press play, or step through.', steps=[
    step('A 2-for-1 stock split. The raw chart shows $100 falling to $50 overnight: a 50% loss to any naive return calculation.',
         chart('sp', (10, 10, 280, 230), 'Stock price, $', [0, 5], [40, 110], [[50, '50'], [100, '100']], [[0, '0'], [3, 'split'], [5, '5']], pl=40, pr=12),
         series('rs', 'sp', RAW_S, 'red', ms=1000, label='raw', lat=[1, 101], ldy=-14, lsize=16)),
    step('Nobody lost a cent. One $100 share became two $50 shares: the pizza was cut into more slices, not made smaller.',
         chip('one', 90, 270, '1 × $100', 'blue'), chip('two', 210, 270, '2 × $50', 'green')),
    step('Back-adjust: multiply every price before the split by the factor 0.5. History now reads around $50 the whole way, and the split day shows a return of about zero.',
         series('as', 'sp', ADJ_S, 'green', ms=1000, label='adjusted', lat=[1, 50.5], ldy=-14, lsize=16),
         dict(dim='rs')),
    step('Futures have the same problem at a roll. The expiring crude contract closes at $78.40, the new one at $78.90. A raw splice shows a $0.50 jump nobody traded.',
         chart('fr', (310, 10, 280, 230), 'Crude futures, $', [0, 6], [71, 80.5], [[72, '72'], [76, '76'], [80, '80']], [[0, '−1 wk'], [5, 'roll'], [6, '']], pl=40, pr=12),
         series('old', 'fr', OLD, 'red', ms=800),
         series('nw', 'fr', NEW, 'red', ms=400),
         dot('j', 'fr', [5, 78.65], '+$0.50 jump', 'red', dx=-8, dy=-22, anchor='end')),
    step('The Panama method adds the $0.50 offset to every earlier price. $72.00 becomes $72.50, the roll shows no jump, and every dollar move is unchanged.',
         series('pan', 'fr', PAN, 'green', dash=True, ms=900, label='Panama +$0.50', lat=[1.5, 74.4], ldx=-4, ldy=-14, lanchor='start', lsize=16)),
    step('Ratio adjustment multiplies earlier prices by 78.90 / 78.40 instead: $72.00 becomes about $72.46. Percentage moves stay exact, but old price levels drift.',
         box('rat', 20, 270, 560, 56, 'ratio: × 78.90 / 78.40  →  $72.00 becomes $72.46', 'amber', size=19),
         dict(hide='one'), dict(hide='two')),
    step('Skip the adjustment and a trend backtest "breaks out" every quarter, right on the roll date. It is measuring the splice, not the market.',
         box('brk', 20, 340, 560, 56, 'breakouts on roll dates = the splice, not the market', 'red', size=19)),
    step('Over many rolls the Panama offsets pile up. If new contracts keep rolling in below old ones, history shifts down, far enough back even below zero, a level that never traded (illustrative).',
         dict(hide='brk'),
         chart('dr', (10, 340, 580, 230), 'Years back: traded price vs Panama level (illustrative)', [0, 10], [-12, 40],
               [[0, '$0'], [20, '$20'], [40, '$40']], [[0, 'now'], [5, '5 yr'], [10, '10 yr']], zero=True, pl=50, pr=34),
         series('act', 'dr', ACT, 'blue', ms=900, label='traded', lat=[10, 33], ldx=-4, ldy=-14, lanchor='end', lsize=16),
         series('pdr', 'dr', PDR, 'green', dash=True, ms=1100, label='Panama level', lat=[6, 12], ldx=0, ldy=-16, lanchor='middle', lsize=16)),
    step('Then 20 April 2020: the May WTI contract settled at −$37.63, after about $18 the Friday before, while June stayed near $20. A negative price was real, not an artefact.',
         box('wti', 20, 590, 560, 56, 'May WTI −$37.63  ·  June ≈ $20', 'red', size=20)),
    step('Same day, three histories. Roll at expiry: −$37.63. Roll a few days early: about $20, never negative. Ratio-adjust that day: divide by a negative and every earlier price flips sign.',
         box('h1', 20, 664, 170, 70, 'roll at expiry\n−$37.63', 'red', size=17),
         box('h2', 215, 664, 170, 70, 'roll early\n≈ $20', 'blue', size=17),
         box('h3', 410, 664, 170, 70, 'ratio-adjust\nsign flips', 'amber', size=17)),
    step('Neither fix is free. Dollar P&L and position sizing want Panama; long-run percentage statistics want ratio. Know which one your series uses, and match it to the number you compute.',
         dict(pulse='pan'), dict(pulse='rat')),
])


BOARD = dict(name='corporate_actions_series_continuity', lesson='corporate-actions-series-continuity',
             title='Splits, rolls and the two ways to splice', cfg=CA,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>', deck_after=5)
