from ._wb import *

# ── A bond's price is its cash flows, discounted to today (bond-pricing-ytm) ─────────
# The lesson's worked example: 5-year, 4% annual coupon ($40), $1,000 face, 5% YTM.
#   40/1.05^t = 38.10, 36.28, 34.55, 32.91, 31.34 → 173.18;  1000/1.05^5 = 783.53;  P = 956.71
# Price-yield curve: exact arithmetic from the same formula. P(6%) = 915.75, P(4%) = 1,000.00 (par).
# Reverse problem: P_mkt = 1,021.00; guess 4% → $1,000 ($21 too low); one Newton step → y1 ≈ 3.53%,
#   P(3.53%) = 1,021.20 (exact YTM 3.534%). 2022 facts are the lesson's Section 03.
def P(y, n=5, c=40, F=1000):
    return sum(c / (1 + y) ** t for t in range(1, n + 1)) + F / (1 + y) ** n

TY = 252                       # timeline height
def tx(t): return 50 + 100 * t  # year t → x
CY = 180                        # coin top
PVS = ['$38.10', '$36.28', '$34.55', '$32.91', '$31.34']
CURVE = [[y / 4, round(P(y / 400), 2)] for y in range(4, 49)]
CH = (10, 432, 580, 300)

def coin(t):
    return icon(f'c{t}', 'coin', tx(t) - 21, CY, 0.42, 'amber', '$40', sym='$', lsize=17)

BOND = dict(w=600, h=816, intro='One bond, five coupons and a face value, each dragged back to today and shrunk on the way: that is its price. Then turn the yield dial and watch the price move. Press play, or step through.', steps=[
    step('A friend offers a deal: pay something today, and get $40 a year for five years, then your $1,000 back at the end. That is a bond: 5 years, a 4% coupon, $1,000 face value. What should you pay?',
         icon('you', 'person', 36, 6, 0.6, 'blue', 'you', lsize=17),
         icon('bond', 'scroll', 270, 6, 0.6, 'purple', '5-yr bond · 4% coupon\n$1,000 face', lsize=16),
         arrow('you', 'bond', 'pay ? today', 'blue', size=17)),
    step('Lay out what it pays on a timeline: a $40 coin at the end of each year, and the $1,000 face value handed back with the last coin.',
         dict(line='tl', points=[[tx(0), TY], [tx(5) + 10, TY]], width=3, ms=700),
         *[dict(line=f'tk{t}', points=[[tx(t), TY - 7], [tx(t), TY + 7]], width=2.5, ms=150) for t in range(6)],
         note('t0', tx(0), TY + 22, 'today', None, 17),
         *[note(f't{t}', tx(t), TY + 22, f'yr {t}', None, 17) for t in range(1, 6)],
         *[coin(t) for t in range(1, 6)],
         icon('face', 'cash', tx(5) - 25, 110, 0.5, 'green', sym='$'),
         note('facel', tx(5) - 32, 136, '$1,000 face', 'green', 17, anchor='end')),
    step('A dollar you have to wait for is worth less than one in your hand, because today\'s dollar could be earning interest. Say the market pays 5% elsewhere. Then a dollar due in t years is worth 1 ÷ 1.05ᵗ today.',
         icon('mkt', 'bank', 482, 6, 0.6, 'blue', '5% elsewhere', sym='%', lsize=17),
         note('rule', 20, 138, '$1 in t years = $1 ÷ 1.05ᵗ today', 'purple', 18, anchor='start')),
    step('Drag the first coin back one year to today: $40 ÷ 1.05 = $38.10. Waiting a year cost it $1.90.',
         move('c1', tx(0) - 21, CY, 900),
         note('pv1', tx(1), TY + 48, '$38.10', 'amber', 17),
         box('cp', 15, 342, 170, 76, 'coupons, today', 'amber', sub='$38.10', size=19)),
    step('Do the same for every coin, discounting each one from the year it lands: $36.28, $34.55, $32.91, $31.34. The longer the wait, the more it shrinks. All five coupons together are worth $173.18 today.',
         *[move(f'c{t}', tx(0) - 21, CY, 700 + 150 * t) for t in range(2, 6)],
         *[note(f'pv{t}', tx(t), TY + 48, PVS[t - 1], 'amber', 17) for t in range(2, 6)],
         dict(count='cp', **{'from': 38.10, 'to': 173.18, 'dp': 2, 'pre': '$', 'ms': 1200})),
    step('The $1,000 face value comes back only once, at year 5, so it is discounted only once: $1,000 ÷ 1.05⁵ ≈ $783.53.',
         dict(hide='facel'), dict(hide='rule'),
         move('face', tx(0) - 25, 110, 1300),
         note('pvf', tx(5) - 12, TY + 72, '+ $783.53', 'green', 17),
         box('fv', 215, 342, 170, 76, 'face, today', 'green', sub='$1,000.00', size=19),
         dict(count='fv', **{'from': 1000, 'to': 783.53, 'dp': 2, 'pre': '$', 'ms': 1300})),
    step('Add the two piles: $173.18 + $783.53 = $956.71. That is the price. It is below the $1,000 face because the 4% coupon is stingier than the 5% the market wants: a discount bond.',
         note('plus', 200, 380, '+', None, 26), note('eq', 400, 380, '=', None, 26),
         box('pr', 415, 342, 170, 76, 'price', 'purple', sub='$0.00', size=19),
         dict(count='pr', **{'from': 0, 'to': 956.71, 'dp': 2, 'pre': '$', 'ms': 1200}),
         dict(pulse='pr')),
    step('Now turn the dial. Price the same coins at every yield from 1% to 12% and plot it. At 5% the bond sits at $956.71.',
         chart('py', CH, 'Price of this bond at each yield', [1, 12], [680, 1180],
               [[700, '$700'], [800, '$800'], [900, '$900'], [1000, '$1,000'], [1100, '$1,100']],
               [[2, '2%'], [4, '4%'], [6, '6%'], [8, '8%'], [10, '10%'], [12, '12%']], pl=58, pt=38, pr=26),
         series('cv', 'py', CURVE, 'blue', ms=1500),
         dot('d5', 'py', [5, 956.71], '5% → $956.71', 'purple', dx=-12, dy=18, anchor='end')),
    step('Push the yield up to 6% and every coin shrinks more on its way back. Same promises, lower price: $915.75.',
         dot('d6', 'py', [6, 915.75], '6% → $915.75', 'red', dx=12, dy=-16, anchor='start'),
         dict(pulse='cp'), dict(pulse='fv')),
    step('Pull it down to 4%, the same as the coupon, and the bond is worth exactly $1,000: par. Yield below the coupon puts the price above $1,000 (a premium); above it, below $1,000 (a discount).',
         series('par', 'py', [[1, 1000], [12, 1000]], 'chalk', dash=True, ms=600),
         dot('d4', 'py', [4, 1000], '4% → $1,000 par', 'green', dx=-12, dy=18, anchor='end'),
         cnote('prem', 'py', [12, 1035], 'above $1,000: premium', 'green', 17, anchor='end'),
         cnote('disc', 'py', [12, 965], 'below: discount', 'red', 17, anchor='end')),
    step('Notice the line is not straight. It falls steeply at low yields and flattens out at high ones. That bend is convexity, the next lesson\'s subject.',
         cnote('bend', 'py', [1.4, 760], 'it bends:\nconvexity', 'blue', 18, anchor='start'),
         dict(pulse='cv')),
    step('Usually you run it backwards: the market shows a price, $1,021, and you solve for the rate. Guess 4%: that prices at $1,000, $21 too low, so the yield must be lower. One Newton step along the slope lands near 3.53%, which prices at about $1,021. That rate is the yield to maturity.',
         dict(hide='d6'), dict(hide='prem'), dict(hide='disc'),
         series('nw', 'py', [[4, 1000], [3.53, 1021.2]], 'amber', width=4, ms=700),
         dot('d3', 'py', [3.53, 1021.2], '$1,021 → YTM ≈ 3.53%', 'amber', dx=12, dy=-16, anchor='start')),
    step('Same coins, different discount rate: yield up, price down, every time. In 2022 the 10-year yield went from about 1.5% to above 4%. No promised coupon changed, yet the broad US bond index lost about 13%, its worst year on record.',
         box('end', 40, 748, 520, 60, 'price = every coin, shrunk back to today\nyield ↑ → every coin shrinks → price ↓', 'purple', size=19)),
])


BOARD = dict(name='bondprice', lesson='bond-pricing-ytm', title='A bond\'s price, coin by coin', cfg=BOND,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>',
             deck_after=4)
