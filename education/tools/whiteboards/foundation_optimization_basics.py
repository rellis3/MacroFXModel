from ._wb import *
from math import sqrt, cos, sin, radians

# ── Optimization basics (foundation-optimization-basics) ──────────────────────
# The lesson's own worked example: mu1 = 8%, sigma1 = 20%; mu2 = 4%, sigma2 = 10%; rho = 0.30.
# Portfolio volatility below is exact arithmetic from the lesson's formula
#   sigma_p^2 = w1^2 s1^2 + (1-w1)^2 s2^2 + 2 w1 (1-w1) rho s1 s2.
# Target 6% -> w1 = 0.5, sigma_p = 12.45% (the lesson's number). Computed from the same inputs:
# lowest-risk mix with no return target at w1 = 0.008/0.076 = 0.105, sigma_p = 9.79%;
# target 5% -> w1 = 0.25, 10.19%; target 7% -> w1 = 0.75, 15.93%.
def _vol(w): return sqrt(w * w * .04 + (1 - w) ** 2 * .01 + 2 * w * (1 - w) * .3 * .02) * 100
CURVE = [[i / 40, round(_vol(i / 40), 3)] for i in range(41)]
WMIN = 0.008 / 0.076
VMIN = round(_vol(WMIN), 2)
CH = (10, 140, 580, 360)

# The general picture: rings of equal risk around the no-fence minimum, a straight fence
# tangent to the middle ring at angle 50 degrees (pixel coordinates).
CX, CY = 180, 640
def _ring(rx, ry): return [[round(CX + rx * cos(radians(a)), 1), round(CY - ry * sin(radians(a)), 1)] for a in range(0, 361, 10)]
T = radians(50)
PX, PY = CX + 80 * cos(T), CY - 48 * sin(T)
dx, dy = -80 * sin(T), -48 * cos(T)
L = sqrt(dx * dx + dy * dy); dx, dy = dx / L, dy / L
FENCE = [[round(PX + 150 * dx, 1), round(PY + 150 * dy, 1)], [round(PX - 150 * dx, 1), round(PY - 150 * dy, 1)]]
gx, gy = cos(T) / 80, sin(T) / 48
G = sqrt(gx * gx + gy * gy); gx, gy = gx / G, -gy / G     # outward normal, SVG y points down
GF = [[round(PX, 1), round(PY, 1)], [round(PX + 46 * gx, 1), round(PY + 46 * gy, 1)]]
GG = [[round(PX, 1), round(PY, 1)], [round(PX - 46 * gx, 1), round(PY - 46 * gy, 1)]]

OPT = dict(w=600, h=770, intro='Two assets, one portfolio, and the lesson\'s own numbers. First find the lowest-risk mix with no rules, then add a fence and find the best point on it. Press play, or step through.', steps=[
    step('Meet the two assets from the worked example. Asset 1 expects 8% a year, with 20% volatility. Asset 2 expects 4%, with 10% volatility. Their correlation is 0.3, so they only loosely move together.',
         icon('a1', 'rocket', 40, 2, 0.72, 'amber', 'Asset 1\n8% · 20% vol', lsize=17),
         icon('a2', 'shield', 488, 2, 0.72, 'blue', 'Asset 2\n4% · 10% vol', lsize=17),
         note('rho', 300, 122, 'correlation 0.3', None, 17)),
    step('You split your money between them. Call the share in Asset 1 w₁. The rest, 1 − w₁, goes into Asset 2. Which split is best? Here, best means the lowest risk.',
         icon('pig', 'piggy', 262, 0, 0.72, 'green', 'your money', sym='$', lsize=17),
         arrow('pig', 'a1', 'w₁', 'amber'),
         arrow('pig', 'a2', '1 − w₁', 'blue')),
    step('Slide w₁ from 0% to 100% and plot the portfolio\'s volatility. All in Asset 2 is 10%; all in Asset 1 is 20%. In between, the curve sags, because the two assets don\'t move in lockstep.',
         chart('vol', CH, 'Risk (%) vs share in Asset 1', [0, 1], [8, 21], [[10, '10%'], [15, '15%'], [20, '20%']],
               [[0, '0%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']], pl=56, pr=20),
         series('curve', 'vol', CURVE, 'purple', ms=1600),
         dot('e0', 'vol', [0, 10], '', None),
         dot('e1', 'vol', [1, 20], '', None)),
    step(f'With no other rule, the best split is the bottom of the curve: about 10.5% in Asset 1, for {VMIN}% volatility. Right there the slope is flat. That is the first-order condition: the derivative is zero.',
         series('flat', 'vol', [[0.0, VMIN], [0.22, VMIN]], 'green', width=4, ms=600),
         dot('min', 'vol', [round(WMIN, 3), VMIN], f'lowest: {VMIN}%, slope flat', 'green', dx=-6, dy=22, anchor='start')),
    step('Flat could mean a top, a bottom or a saddle. Check the bend: the curve turns up on both sides, like a bowl. That is the second-order condition, f″ > 0, so this is a true minimum.',
         cnote('bowl', 'vol', [0.03, 18.2], 'bends up both ways:\na true minimum', 'green', 17, anchor='start')),
    step('Now add a fence: the portfolio must expect 6%. Expected return is 4% + 4% × w₁, so only w₁ = 50% hits 6%. You are only allowed to stand on that line.',
         series('f6', 'vol', [[0.5, 8], [0.5, 21]], 'amber', dash=True, label='fence: return must be 6%', lat=[0.5, 21], ldx=8, ldy=-12, lanchor='start')),
    step('The best point on the fence is half and half, at 12.45% volatility. That is well below the 15% you would get by just averaging the two assets\' volatilities: the gain from diversification.',
         dot('p6', 'vol', [0.5, 12.45], '12.45%', 'amber', dx=-12, dy=-16, anchor='end'),
         dot('naive', 'vol', [0.5, 15], 'plain average: 15%', None, dx=-12, dy=0, anchor='end')),
    step(f'But the fence has a price: 12.45% instead of {VMIN}%, about 2.7 points more risk. The Lagrange multiplier measures that price at the margin: the extra risk for one more unit of target return.',
         dict(gap='price', chart='vol', top=[[0.485, 12.45], [0.515, 12.45]], bot=[[0.485, VMIN], [0.515, VMIN]], tone='red', op=0.55),
         cnote('pl', 'vol', [0.54, 11.3], 'price of\nthe fence', 'red', 17, anchor='start')),
    step('Move the fence to 7%: w₁ becomes 75% and risk 15.93%. Going from a 5% to a 6% target cost 2.3 points of volatility; from 6% to 7% it costs 3.5. Each extra point of return costs more than the last.',
         dict(dim='f6'), dict(dim='price'), dict(dim='pl'),
         series('f7', 'vol', [[0.75, 8], [0.75, 19.5]], 'red', dash=True),
         dot('p7', 'vol', [0.75, 15.93], '7% target: 15.93%', 'red', dx=10, dy=22, anchor='start')),
    step('With many assets you cannot read the answer off one line. The general picture: rings of equal risk around the no-fence minimum, and the fence as a line. The best point on the fence is where it just touches a ring.',
         dict(line='r1', points=_ring(40, 24), tone=None, width=2, ms=500),
         dict(line='r2', points=_ring(80, 48), tone='green', width=3, ms=600),
         dict(line='r3', points=_ring(120, 72), tone=None, width=2, ms=600),
         dict(line='fence', points=FENCE, tone='amber', width=3, ms=700),
         note('fl', FENCE[0][0] - 6, FENCE[0][1] - 2, 'fence', 'amber', 17, anchor='end'),
         note('xs', round(PX - 18, 1), round(PY + 20, 1), 'x*', 'green', 18)),
    step('At that point, the direction in which risk rises fastest (∇f) points straight across the fence, along the same line as the fence\'s own gradient (∇g). If it leaned along the fence, sliding a little would still lower risk.',
         dict(line='gf', points=GF, tone='red', width=3, ms=500),
         dict(line='gg', points=GG, tone='purple', width=3, ms=500),
         note('gfl', GF[1][0] + 8, GF[1][1] - 4, '∇f', 'red', 18, anchor='start'),
         note('ggl', GG[1][0] - 8, GG[1][1] + 4, '∇g', 'purple', 18, anchor='end'),
         box('lag', 390, 520, 200, 110, "f′(x*) = λ g′(x*)\ngradients line up", 'purple', size=19)),
    step('That is all a Lagrange multiplier says, and Markowitz in 1952 made portfolio choice exactly this problem: lowest variance for a target return. A real optimiser solves it for dozens of assets, and is only as good as the estimated returns you feed it.',
         box('mk', 390, 646, 200, 110, 'Markowitz 1952:\nlowest risk for\na target return', 'green', size=19)),
])


BOARD = dict(name='foundation_optimization_basics', lesson='foundation-optimization-basics',
             title='The lowest-risk mix, then the best point on a fence', cfg=OPT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
