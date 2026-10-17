from ._wb import *

# ── Short vs long convexity through four calm years and a crash (tail-risk-hedging-convexity) ──
# The lesson's illustrative worked example: index +12% in a calm year, -35% in a crash year.
# Short-convexity overlay: +3% calm, -25% crash  -> +15% / -60%.
# Tail-hedge overlay:     -1.5% calm, +40% crash -> +10.5% / +5%.
# Four calm years then one crash, starting from 100:
#   unhedged 157.4 -> 102.3 (+2.3%), short conv 174.9 -> 70.0 (-30.0%), tail-hedged 149.1 -> 156.5 (+56.5%)
# No crash (five calm years): 176.2 / 201.1 / 164.7.
# March 2020 facts from the lesson: S&P 500 -34% in five weeks to 23 March, VIX record close 82.69
# on 16 March, gold fell with stocks for about a week, Treasuries sold off until the Fed stepped in.


def path(calm, crash):
    w = [100.0]
    for _ in range(4):
        w.append(w[-1] * (1 + calm / 100))
    w.append(w[-1] * (1 + crash / 100))
    return [[i, round(v, 1)] for i, v in enumerate(w)]


U, SC, TH = path(12, -35), path(15, -60), path(10.5, 5)
assert U[4][1] == 157.4 and U[5][1] == 102.3 and SC[4][1] == 174.9 and SC[5][1] == 70.0
assert TH[4][1] == 149.1 and TH[5][1] == 156.5

W = (10, 150, 580, 330)
TRH = dict(w=600, h=720, intro='One portfolio, three ways to run it, and the lesson\'s illustrative five years: four calm, one crash. Press play, or step through.', steps=[
    step('A $10 million portfolio tracks a broad index. Call its starting value 100. We run it three ways, side by side, through the same five years.',
         icon('pf', 'piggy', 250, 10, 0.75, 'blue', 'portfolio = 100', sym='$', lsize=17)),
    step('The put seller is short convexity. Selling out-of-the-money puts adds +3% in each calm year: the pennies in front of the steamroller.',
         icon('sell', 'cash', 40, 14, 0.7, 'red', 'sells puts\n+3% a calm year', sym='$', lsize=17),
         arrow('sell', 'pf', None, 'red')),
    step('The tail hedger is long convexity. Buying far out-of-the-money puts costs 1.5% in each calm year, when they expire worthless: the guard\'s fee.',
         icon('hedge', 'shield', 470, 14, 0.7, 'green', 'buys puts\n−1.5% a calm year', lsize=17),
         arrow('pf', 'hedge', None, 'green')),
    step('Four calm years, index +12% each. The seller compounds to 174.9, unhedged to 157.4, the hedger to only 149.1. Every single year the hedge looks like waste.',
         chart('w', W, 'Portfolio value, illustrative', [0, 5], [0, 220],
               [[50, '50'], [100, '100'], [150, '150'], [200, '200']], [[0, 'start'], [2, 'yr 2'], [4, 'yr 4'], [5, 'crash']], pl=50, pr=92),
         series('base', 'w', [[0, 100], [5, 100]], None, dash=True, ms=400),
         series('sc1', 'w', SC[:5], 'red', ms=1200),
         series('u1', 'w', U[:5], 'blue', ms=1200),
         series('th1', 'w', TH[:5], 'green', ms=1200)),
    step('Year five: the crash. The index falls 35%. The seller\'s short puts are deep in the money and add an extra −25%: −60% for the year. 174.9 becomes 70.',
         cnote('crash', 'w', [4.5, 205], 'crash: index −35%', 'red', 17),
         series('sc2', 'w', SC[4:], 'red', ms=1200, label='seller 70', lat=[5, 70.0], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('Unhedged simply takes the index\'s −35%: 157.4 becomes 102.3. Five years of work, +2.3% to show for it.',
         series('u2', 'w', U[4:], 'blue', ms=1200, label='unhedged 102', lat=[5, 102.3], ldx=6, ldy=0, lanchor='start', lsize=16)),
    step('The hedger\'s puts pay +40%, so the year ends +5%: 149.1 becomes 156.5. Last in every calm year, first by a long way at the end: +56.5%.',
         series('th2', 'w', TH[4:], 'green', ms=1200, label='hedged 157', lat=[5, 156.5], ldx=6, ldy=0, lanchor='start', lsize=16),
         dict(pulse='th2')),
    step('Why it bends: a payoff with curvature changes with the move squared. Double the fall and the bend is four times bigger. The seller\'s curve bends down in a crash, the hedger\'s bends up.',
         box('bend', 20, 500, 270, 96, 'value change ≈ Δ·move\n+ ½ Γ·move²', 'purple', size=19)),
    step('But this pattern is made up. If the crash never came, five calm years would leave the seller at 201.1, unhedged at 176.2 and the hedger at 164.7. The bleed is the premium for the protection, not a mistake.',
         box('nocrash', 310, 500, 270, 96, 'no crash?\nseller 201 · hedger 165', 'amber', size=19)),
    step('March 2020, for real: the S&P 500 fell about 34% in five weeks and the VIX closed at a record 82.69. Far out-of-the-money puts paid twice, on the price and on volatility.',
         icon('vix', 'bolt', 40, 612, 0.6, 'red', 'VIX 82.69', lsize=17),
         icon('put', 'shield', 250, 612, 0.6, 'green', 'puts paid', lsize=17)),
    step('Gold, the "cheap" hedge, fell sharply alongside stocks for about a week in the dash for cash. It relied on a correlation holding. An option pays because of its contract.',
         icon('gold', 'gold', 460, 612, 0.6, 'amber', 'gold fell too', lsize=17),
         dict(cross='gold')),
])


BOARD = dict(name='tail_risk_hedging_convexity', lesson='tail-risk-hedging-convexity',
             title='Pennies, a steamroller and a guard, drawn step by step', cfg=TRH,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: March 2020, when convexity paid and "safe" assets didn\'t</h2>',
             deck_after=7)
