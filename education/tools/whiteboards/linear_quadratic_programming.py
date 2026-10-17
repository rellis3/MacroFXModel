from ._wb import *

# ── Linear & quadratic programming: corners, then a bowl against the walls ────
# LP: the lesson's worked example. Maximize Z = 3x + 5y ($ thousands) s.t. x ≤ 4, y ≤ 6,
# 3x + 2y ≤ 18, x, y ≥ 0. Vertices (0,0) 0, (4,0) 12, (4,3) 27, (2,6) 36, (0,6) 30.
# Simplex walk (largest improvement to an adjacent vertex): (0,0) → (0,6) → (2,6), then both
# neighbours are worse (30, 27). Binding at (2,6): y ≤ 6 and the margin line; x ≤ 4 slack.
# QP: the visual guide's two-asset example. Variances 2 and 5, covariance 3 (in %²), weights
# sum to 1, so variance = 2w² + 5(1 − w)² + 6w(1 − w) = w² − 4w + 5: bottom at w = 200%
# (asset 2 at −100%), variance 1. No shorting → w = 100% (variance 2). Plus a 60% cap on each
# asset → w ∈ [40%, 60%] → w = 60% (variance 2.96). Clip-and-renormalise trap from the guide:
# 65% clipped to a 50% cap, asset 2 at 35%, rescaled → 50/85 = 58.8%, back over the cap.
V = [(0, 0, 0), (4, 0, 12), (4, 3, 27), (2, 6, 36), (0, 6, 30)]
assert all(3 * x + 5 * y == z for x, y, z in V)
var = lambda w: w * w - 4 * w + 5
assert var(2) == 1 and var(1) == 2 and round(var(0.6), 2) == 2.96
assert round(0.5 / 0.85 * 100, 1) == 58.8

LP = (10, 10, 380, 300)
def px(t): return 10 + 40 + t / 5 * (380 - 52)       # canvas x of an LP data point
def py(v): return 10 + 300 - 26 - v / 7 * (300 - 60)  # canvas y
QP = (10, 330, 580, 250)
BOWL = [[round(-0.2 + i * 0.1, 1), round(var(-0.2 + i * 0.1), 3)] for i in range(35)]

LQP = dict(w=600, h=720, intro='A linear program: flat walls and a ramp, so the best point is a corner. Then a quadratic program: the same walls around a bowl. The lesson\'s own numbers. Press play, or step through.', steps=[
    step('A desk splits risk capital between Strategy A (x units) and Strategy B (y units). Each unit of A is expected to earn 3 and each unit of B 5, in $ thousands. The goal: make Z = 3x + 5y as big as possible.',
         chart('lp', LP, 'Units of A (across) and B (up)', [0, 5], [0, 7], [[0, '0'], [3, '3'], [6, '6']], [[0, '0'], [2, '2'], [4, '4']]),
         box('obj', 400, 10, 190, 64, 'maximize', 'purple', sub='Z = 3x + 5y', size=19)),
    step('Three flat rules. A\'s capacity: x ≤ 4. B\'s capacity: y ≤ 6. A shared margin budget: 3x + 2y ≤ 18. Each rule is a straight wall.',
         series('wx', 'lp', [[4, 0], [4, 7]], 'blue', ms=500),
         series('wy', 'lp', [[0, 6], [5, 6]], 'blue', ms=500),
         series('wm', 'lp', [[4 / 3, 7], [5, 1.5]], 'amber', ms=600),
         box('r1', 400, 92, 190, 52, 'x ≤ 4', 'blue', size=19),
         box('r2', 400, 156, 190, 52, 'y ≤ 6', 'blue', size=19),
         box('r3', 400, 220, 190, 52, '3x + 2y ≤ 18', 'amber', size=19)),
    step('Inside all three walls, with x and y not negative, is the set of allowed plans: a pentagon with five corners.',
         dict(gap='feas', chart='lp', top=[[0, 6], [2, 6], [4, 3], [4, 0]], bot=[[0, 0], [4, 0]], tone='blue', op=0.2),
         *[dot(f'v{i}', 'lp', [x, y], '', None) for i, (x, y, z) in enumerate(V)]),
    step('Every point on the line 3x + 5y = 20 earns the same 20. This line cuts through the middle, so you can slide it up and earn more. Z rises at a steady rate, so you only stop when you hit a corner.',
         series('z20', 'lp', [[0, 4], [5, 1]], 'purple', dash=True, ms=600, label='Z = 20', lat=[0.15, 4], ldx=4, ldy=-14, lanchor='start')),
    step('The simplex method walks corner to corner. Start at (0,0), where Z = 0. Its neighbours are (4,0) with Z = 12 and (0,6) with Z = 30. Step to the better one.',
         dict(dim='z20'),
         chip('sx', round(px(0)) + 36, round(py(0)) - 22, 'Z = 0', 'green'),
         dot('n1', 'lp', [4, 0], '12', 'chalk', dy=-16),
         move('sx', round(px(0)) + 36, round(py(6)) + 22, 1100),
         dict(sub='obj', text='(0,6): Z = 30')),
    step('From (0,6) the next corner along the edge is (2,6), where Z = 36. From there both neighbours are worse: (0,6) at 30 and (4,3) at 27. The walk stops. Best plan: 2 units of A and 6 of B, $36,000.',
         move('sx', round(px(2)) + 30, round(py(6)) + 22, 900),
         dot('n2', 'lp', [4, 3], '27', 'chalk', dx=14, dy=0, anchor='start'),
         dot('best', 'lp', [2, 6], '36', 'green', dy=-16),
         dict(sub='obj', text='(2,6): Z = 36')),
    step('The line 3x + 5y = 36 just touches the pentagon at (2,6). B\'s cap and the margin budget bind there. A\'s cap has slack, so it shapes nothing.',
         dict(hide='sx'),
         series('z36', 'lp', [[1 / 3, 7], [5, 4.2]], 'green', dash=True, ms=600),
         dict(pulse='r2'), dict(pulse='r3'), dict(dim='r1')),
    step('A quadratic program swaps the ramp for a bowl. Two assets whose weights sum to 100%, with variances 2 and 5 and covariance 3. Variance along that line is a bowl, and its bottom is at 200% in asset 1, shorting asset 2 by 100%.',
         chart('qp', QP, 'Portfolio variance vs weight in asset 1', [-0.2, 3.2], [0, 6],
               [[1, '1'], [3, '3'], [5, '5']], [[0, '0%'], [0.6, '60%'], [1, '100%'], [2, '200%'], [3, '300%']], pl=44),
         series('bw', 'qp', BOWL, 'purple', ms=1100),
         dot('b0', 'qp', [2, 1], 'bottom: 200%', 'red', dy=-18)),
    step('Add no shorting: asset 1 must sit between 0% and 100% (shaded). The bowl\'s bottom is outside, so the answer snaps to the nearest wall: 100% in asset 1, 0% in asset 2, variance 2.',
         dict(gap='ns', chart='qp', top=[[0, 5.8], [1, 5.8]], bot=[[0, 0.1], [1, 0.1]], tone='blue', op=0.16),
         dot('b1', 'qp', [1, 2], '100%', 'blue', dx=12, dy=-6, anchor='start')),
    step('Now add a 60% cap on each asset, so asset 1 sits between 40% and 60%. The answer snaps again, to 60% and 40%. Same bowl every time; the walls decided. A solver cannot know which walls bind until it has solved, so there is no single formula to plug into.',
         dict(dim='b1'), dict(dim='ns'),
         dict(gap='cap', chart='qp', top=[[0.4, 5.8], [0.6, 5.8]], bot=[[0.4, 0.1], [0.6, 0.1]], tone='green', op=0.3),
         dot('b2', 'qp', [0.6, 2.96], '60%', 'green', dx=12, dy=-6, anchor='start')),
    step('And the tempting shortcut fails. Clip a 65% weight to a 50% cap, leave the other asset at 35%, then rescale both to sum to 100%: asset 1 becomes 50 ÷ 85 = 58.8%, back over the cap. A QP solver only searches plans that obey every rule at once.',
         icon('warn', 'warn', 14, 596, 0.6, 'red'),
         box('clip', 90, 594, 500, 70, 'clip 65% → 50%, rescale', 'red', sub='50 ÷ 85 = 58.8% > 50% cap', size=19),
         box('solve', 90, 674, 500, 40, 'hand the walls to a QP solver', 'green', size=18)),
])


BOARD = dict(name='linear_quadratic_programming', lesson='linear-quadratic-programming', title='Corners for a ramp, walls for a bowl', cfg=LQP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=8)
