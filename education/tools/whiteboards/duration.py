from ._wb import *

# ── Duration is the tangent, convexity is the bend (duration-convexity) ─────────────
# The lesson's worked example: Lesson 1's 5-year, 4% annual coupon, $1,000 face bond at 5% YTM.
#   P = 956.71; PVs 38.10, 36.28, 34.55, 32.91, 814.87;  Σ t·PV = 4,420.29 → D_Mac ≈ 4.62 yrs
#   D_mod = 4.62 / 1.05 ≈ 4.40;  C ≈ 24.47
#   +100bp: duration only 956.71 × (1 − 0.0440) ≈ 914.61; + ½·24.47·0.01² → 915.78; exact P(6%) = 915.75
# Arithmetic from those: slope −4.40 × 956.71 × 1% ≈ −$42.10 per point; DV01 ≈ D_mod·P·0.0001 ≈ $0.42.
# Curves are the exact pricing formula, its tangent at 5% and the duration+convexity quadratic.
P0, DM, CX = 956.71, 4.40, 24.47
def P(y, n=5, c=40, F=1000):
    return sum(c / (1 + y) ** t for t in range(1, n + 1)) + F / (1 + y) ** n
YS = [y / 4 for y in range(4, 49)]
TRUE = [[y, round(P(y / 100), 2)] for y in YS]
TAN = [[1, round(P0 * (1 - DM * (1 - 5) / 100), 2)], [12, round(P0 * (1 - DM * (12 - 5) / 100), 2)]]
QUAD = [[y, round(P0 * (1 - DM * (y - 5) / 100 + 0.5 * CX * ((y - 5) / 100) ** 2), 2)] for y in YS]
TANP = [[y, round(P0 * (1 - DM * (y - 5) / 100), 2)] for y in YS]

MC = (10, 182, 370, 190)          # Macaulay chart
def mpx(t): return MC[0] + 20 + t / 5.6 * (MC[2] - 20 - 12)
AX = MC[1] + MC[3] - 26           # its x-axis height
CH = (10, 386, 580, 290)          # price-yield chart
RY = 760                          # zoom ruler height
def rx(v): return round(60 + (v - 914.4) / 1.6 * 500, 1)

DUR = dict(w=600, h=870, intro='Lesson 1\'s bond on a seesaw: duration says how far the price tips when the yield moves, convexity says why it always tips a little less than that. Press play, or step through.', steps=[
    step('Lesson 1\'s bond again: 5 years, a 4% coupon, $1,000 face. At a 5% yield it costs $956.71. Yield and price sit at opposite ends of a seesaw.',
         note('bond', 300, 22, '5-yr · 4% coupon · $1,000 face · y = 5% · P = $956.71', 'purple', 18),
         dict(line='plank', points=[[100, 110], [500, 110]], width=5, ms=600),
         dict(line='fulc', points=[[300, 113], [276, 160], [324, 160], [300, 113]], width=3, ms=500),
         chip('cy', 150, 92, 'yield', 'blue'), chip('cp', 450, 92, 'price', 'green')),
    step('Push the yield up and the price end drops, every time. Lesson 1 settled which way it tips. This lesson asks: how far?',
         dict(hide='plank'),
         dict(line='plank2', points=[[100, 80], [500, 140]], width=5, ms=500),
         move('cy', 150, 70, 700), move('cp', 450, 115, 700),
         note('far', 300, 58, 'how far does it tip?', 'amber', 19)),
    step('Start with timing. Put each payment on a timeline at its value today: four small coupons, then $814.87 at year 5, the last coupon plus the face value.',
         chart('mc', MC, 'Each payment, in today\'s $', [0, 5.6], [0, 1000], [],
               [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], pl=20),
         dict(bars='pv', chart='mc', data=[[1, 38.10, '38', 'amber'], [2, 36.28, '36', 'amber'], [3, 34.55, '35', 'amber'],
                                           [4, 32.91, '33', 'amber'], [5, 814.87, '$814.87', 'green']], bw=30, ms=1100)),
    step('Find where that plank balances, each date weighted by its share of the price: 4,420.29 ÷ 956.71 ≈ 4.62 years. That is Macaulay duration, a bit short of 5 because the coupons pull it earlier.',
         dict(line='mf', points=[[mpx(4.62), AX + 2], [mpx(4.62) - 12, AX + 24], [mpx(4.62) + 12, AX + 24], [mpx(4.62), AX + 2]], tone='purple', width=3, ms=500),
         cnote('bal', 'mc', [2.6, 560], 'balances at\n4.62 yrs ▸', 'purple', 18),
         box('dmac', 395, 182, 195, 88, 'Macaulay duration', 'purple', sub='≈ 4.62 years', size=18)),
    step('Divide by 1 + y: 4.62 ÷ 1.05 ≈ 4.40, the modified duration. Rule of thumb: each 1-point rise in yield cuts the price by about 4.40%.',
         box('dmod', 395, 284, 195, 88, 'modified duration', 'amber', sub='4.62 ÷ 1.05 ≈ 4.40', size=18)),
    step('Now the real price at every yield, straight from the pricing formula. It is a curve, not a line.',
         chart('py', CH, 'Price vs yield, same bond', [1, 12], [640, 1180],
               [[700, '$700'], [800, '$800'], [900, '$900'], [1000, '$1,000'], [1100, '$1,100']],
               [[2, '2%'], [4, '4%'], [6, '6%'], [8, '8%'], [10, '10%'], [12, '12%']], pl=58, pt=38, pr=26),
         series('tr', 'py', TRUE, 'blue', label='true price', lat=[12, TRUE[-1][1]], ldy=-18, lanchor='end', ms=1400),
         dot('d5', 'py', [5, P0], '5% · $956.71', 'chalk', dx=-12, dy=20, anchor='end')),
    step('Duration is this curve\'s slope at 5%: −4.40 × $956.71 ≈ −$42.10 per point of yield, about $0.42 per basis point (DV01). Extend that slope and you get the tangent line.',
         series('tg', 'py', TAN, 'amber', dash=True, label='duration line', lat=TAN[0], ldx=8, ldy=30, lanchor='start', ms=800)),
    step('Yields jump 100bp to 6%. The line says −4.40%: $956.71 × 0.956 ≈ $914.61.',
         series('g6', 'py', [[6, 860], [6, 980]], 'chalk', dash=True, ms=400),
         cnote('g6l', 'py', [6, 860], '+100bp', None, 17, dy=14),
         note('zt', 20, RY - 52, 'zoom in at 6%:', None, 17, anchor='start'),
         dict(line='rul', points=[[50, RY], [570, RY]], width=2.5, ms=500),
         dict(line='zd', points=[[rx(914.61), RY - 14], [rx(914.61), RY + 14]], tone='amber', width=5, ms=300),
         note('zdl', rx(914.61), RY - 30, 'line: $914.61', 'amber', 17)),
    step('Reprice exactly at 6% and the bond is worth $915.75: $1.14 more than the line said. The curve bent away above it.',
         dict(line='zg', points=[[rx(914.61), RY], [rx(915.75), RY]], tone='red', width=6, ms=700),
         note('zgl', (rx(914.61) + rx(915.75)) / 2, RY + 24, 'missed $1.14', 'red', 17),
         dict(line='zt2', points=[[rx(915.75), RY - 14], [rx(915.75), RY + 14]], tone='blue', width=5, ms=300),
         note('ztl', rx(915.75), RY + 30, 'exact: $915.75', 'blue', 17, anchor='end')),
    step('That bend is convexity, C ≈ 24.47. Add ½ × 24.47 × 0.01² ≈ +0.12% to the estimate: $915.78, only $0.03 off.',
         series('qd', 'py', QUAD, 'purple', dash=True, ms=900),
         cnote('qdl', 'py', [9.2, 960], 'duration + convexity\n(hugs the curve)', 'purple', 17),
         dict(line='zc', points=[[rx(915.78), RY - 14], [rx(915.78), RY + 14]], tone='purple', width=5, ms=300),
         note('zcl', rx(915.78) + 6, RY - 30, '+ convexity: $915.78', 'purple', 17, anchor='end')),
    step('Look along the whole curve: it sits on or above its tangent on both sides, and the gap grows with the square of the move. For a plain bond, convexity is a gift whether yields rise or fall.',
         dict(gap='bend', chart='py', top=TRUE, bot=TANP, tone='amber', op=0.3),
         dict(pulse='tr')),
    step('Duration says how far the seesaw tips; convexity says how much the bend pads you. But only for plain bonds: SVB\'s mortgage bonds had negative convexity, and their duration lengthened just as yields rose.',
         box('end', 40, 806, 520, 58, 'duration = the slope: how far price tips\nconvexity = the bend: always in your favour (plain bonds)', 'purple', size=18)),
])


BOARD = dict(name='duration', lesson='duration-convexity', title='Duration tips it, convexity bends it', cfg=DUR,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>',
             deck_after=7)
