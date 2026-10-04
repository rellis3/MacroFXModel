from ._wb import *
from math import sqrt

# ── Markowitz & Black-Litterman (markowitz-black-litterman) ───────────────────
# Numbers are the lesson's worked example: "safe" pair mu 3%, vol 8%; "risky" pair mu 4%,
# vol 15%; correlation 0.3; 2% risk-free rate. Everything below is exact arithmetic on those:
#   50/50 mix: return 3.5%; risk 11.5% if rho = 1 (a plain average), 9.5% at rho = 0.3
#   min-variance mix: w_safe = (225 - 36) / (64 + 225 - 72) = 87.1%, vol 7.77% (< 8%)
#   tangency (scratchpad closed form): 62.45% / 37.55%; with mu_risky 4.5%: 52.12% / 47.88%
# Black-Litterman blend: the visual guide's simplified one-view calculator (prior 5%, view 7%,
# confidence 40% -> 5% + 0.4 x 2 = 5.80%; 100% confidence -> the raw view).
# History: Michaud 1989, Chopra & Ziemba 1993 (~10x), DeMiguel, Garlappi & Uppal 2009.
S1, S2, M1, M2, RHO, RF = 8.0, 15.0, 3.0, 4.0, 0.3, 2.0
COV = RHO * S1 * S2
def _sd(w): return sqrt(w * w * S1 * S1 + (1 - w) ** 2 * S2 * S2 + 2 * w * (1 - w) * COV)
def _ret(w, m2=M2): return w * M1 + (1 - w) * m2
def _pt(w): return [round(_sd(w), 3), round(_ret(w), 4)]
WMIN = (S2 * S2 - COV) / (S1 * S1 + S2 * S2 - 2 * COV)            # 0.871
def _tan(m2):
    e1, e2, a, d = M1 - RF, m2 - RF, S1 * S1, S2 * S2
    x1, x2 = (d * e1 - COV * e2), (-COV * e1 + a * e2)
    return x1 / (x1 + x2)
WT, WT2 = _tan(4.0), _tan(4.5)                                       # 0.6245, 0.5212
TP = _pt(WT); SLOPE = (TP[1] - RF) / TP[0]
UPPER = [_pt(i / 100 * WMIN) for i in range(0, 101, 4)]              # risky end → min-variance
LOWER = [_pt(WMIN + (1 - WMIN) * i / 10) for i in range(11)]         # min-variance → safe end
assert abs(_sd(WMIN) - 7.771) < 0.01 and abs(WT - 0.6245) < 1e-4 and abs(WT2 - 0.5212) < 1e-4

MAP = (10, 168, 580, 330)
def _bx(v): return round(330 + (v - 4.5) / 3 * 240, 1)              # Black-Litterman dial: % → x
DY = 652

MARKOWITZ = dict(w=600, h=852, intro='Two currency pairs, one risk/return map: why mixing them lowers risk, where the efficient frontier comes from, and why a tiny forecast nudge swings the answer. Press play, or step through.', steps=[
    step('Two currency pairs. A "safe" one: expected return 3% a year, volatility 8%. A "risky" one: 4% expected, 15% volatility. They are only loosely linked: correlation 0.3.',
         icon('safe', 'shield', 40, 14, 0.62, 'blue', 'safe pair\n3%, vol 8%', lsize=17),
         icon('risky', 'rocket', 440, 14, 0.62, 'amber', 'risky pair\n4%, vol 15%', lsize=17),
         note('rho', 300, 52, 'correlation ρ = 0.3', 'purple', 19)),
    step('Put both on a risk/return map: risk (volatility) across, expected return up. Every mix of the two will land somewhere on this map.',
         chart('map', MAP, 'Risk vs return, every mix of the two', [0, 17], [1.8, 4.8],
               [[2, '2%'], [3, '3%'], [4, '4%']], [[0, '0'], [8, '8%'], [15, '15% risk']], pl=50, pr=20),
         dot('ds', 'map', [S1, M1], 'all safe', 'blue', dx=0, dy=22),
         dot('dr', 'map', [S2, M2], 'all risky', 'amber', dx=0, dy=-16)),
    step('Return really is an average: half and half gives 3.5%. If the two moved in perfect lockstep (ρ = 1), risk would be an average too, 11.5%, and every mix would sit on the straight line. No benefit from mixing at all.',
         series('lin', 'map', [[S1, M1], [S2, M2]], None, dash=True, label='if ρ = 1', lat=[11.5, 3.5], ldx=10, ldy=16, lanchor='start', ms=600),
         dot('d50a', 'map', [11.5, 3.5], '', None)),
    step('But at ρ = 0.3 the cross term, 2w₁w₂·Cov, is small, so the same 50/50 mix has only 9.5% risk, not 11.5%. Every mix bows to the left of the straight line. That bow is diversification.',
         series('cur', 'map', [_pt(1 - i / 20) for i in range(21)], 'purple', ms=1400),
         dot('d50', 'map', [9.5, 3.5], '50/50: 9.5%', 'purple', dx=-10, dy=-4, anchor='end'),
         cnote('ct', 'map', [9.6, 2.22], 'risk² = w₁²σ₁² + w₂²σ₂² + 2w₁w₂·Cov', 'purple', 18)),
    step('Slide all the way left: 87.1% safe, 12.9% risky has 7.77% risk. That is less risky than the safe pair on its own (8%). Adding a riskier asset lowered the risk. This is the minimum-variance portfolio.',
         dict(hide='d50'),
         dot('mv', 'map', _pt(WMIN), 'min-variance: 7.77%', 'red', dx=-12, dy=8, anchor='end')),
    step('Above that point is the efficient frontier: for each level of risk, the most return you can get. The lower branch is never worth holding, because the minimum-variance mix gives the same risk for more return.',
         series('eff', 'map', UPPER, 'green', width=4.6, ms=1000),
         cnote('effl', 'map', [12.2, 2.62], 'green: the efficient frontier', 'green', 18),
         dict(dim='lin'), dict(dim='d50a'), dict(dim='ds')),
    step('With a 2% risk-free rate, the best return per unit of risk is where a line from 2% just touches the curve: 62.45% safe, 37.55% risky. That is the tangency mix the optimizer hands you.',
         series('cml', 'map', [[0, RF], [16.5, round(RF + SLOPE * 16.5, 3)]], 'blue', dash=True, ms=700),
         dot('tp', 'map', TP, 'tangency: 62% / 38%', 'blue', dx=-12, dy=-8, anchor='end')),
    step('Now nudge one guess: the risky pair returns 4.5%, not 4%. Half a point, well inside any forecaster\'s error. The optimal risky weight jumps from 37.55% to 47.88%: a ten-point swing.',
         chip('nudge', 515, 112, '4% → 4.5%', 'red'),
         move('nudge', 515, 136, 600),
         chart('w', (10, 512, 285, 220), "The risky pair's best weight", [0.4, 2.9], [0, 75],
               [[0, '0'], [50, '50%']], [[1, 'at 4.0%'], [2, 'at 4.5%']], pl=48, pr=12),
         dict(bars='b1', chart='w', data=[[1, 37.55, '37.6%', 'blue']], bw=44, ms=700),
         dict(bars='b2', chart='w', data=[[2, 47.88, '47.9%', 'red']], bw=44, ms=900)),
    step('The optimizer is not broken. It takes every number you give it as exact, so it piles into whichever asset your errors make look best. Scale that up to eight or ten correlated pairs and you get extreme long/short corners: "error maximisation".',
         icon('warn', 'warn', 244, 600, 0.42, 'red'),
         dict(pulse='b2')),
    step('Black-Litterman\'s fix: don\'t start from a blank page. Run the optimizer backwards on what the market already holds, Π = δΣw_mkt, and use that as the prior. In the visual guide\'s one-view example the prior is 5% and your view is 7%.',
         box('bl', 305, 512, 285, 220, 'prior + view,\nby confidence', 'green', top=True, size=19),
         dict(line='dial', points=[[_bx(4.6), DY], [_bx(7.4), DY]], tone='green', width=3, ms=500),
         dict(line='tk1', points=[[_bx(5), DY - 8], [_bx(5), DY + 8]], width=3, ms=200),
         dict(line='tk2', points=[[_bx(7), DY - 8], [_bx(7), DY + 8]], width=3, ms=200),
         note('pl', _bx(5), DY + 26, 'market 5%', 'blue', 17),
         note('vl', _bx(7), DY + 26, 'your view 7%', 'amber', 17),
         chip('post', _bx(5), DY - 34, '5.00%', 'green')),
    step('State your confidence: 40%. The posterior moves 40% of the way from the market\'s 5% toward your 7%: 5% + 0.4 × 2 points = 5.80%. A modest view gives a modest tilt, and that blended number is what goes into the optimizer.',
         dict(hide='post'),
         chip('post2', _bx(5), DY - 34, '5.80%', 'green'),
         move('post2', _bx(5.8), DY - 34, 1000),
         note('cf', 447, DY + 54, 'at 40% confidence', 'green', 17)),
    step('At 100% confidence the posterior is your raw view, 7%: exactly what raw Markowitz does with every forecast. Confidence is the lever between the market\'s answer and your own.',
         dict(hide='cf'),
         move('post2', _bx(7), DY - 34, 900),
         note('cf2', 447, DY + 54, 'at 100%: raw Markowitz', 'red', 17)),
    step('History agrees. Michaud named error maximisation in 1989; Chopra and Ziemba found errors in expected returns cost about ten times as much as errors in variances; and in 2009 none of fourteen optimizers consistently beat plain equal weights out of sample.',
         box('hist', 10, 748, 580, 96, 'return errors cost ≈ 10× variance errors\n14 optimizers vs 1/N: none consistently better', 'purple', size=19)),
])


BOARD = dict(name='markowitz', lesson='markowitz-black-litterman', title='Diversification, the frontier and the Black-Litterman fix', cfg=MARKOWITZ,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the optimiser nobody would trade',
             deck_after=10)
