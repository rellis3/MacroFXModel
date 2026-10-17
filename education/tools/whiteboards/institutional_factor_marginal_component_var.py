from ._wb import *
from math import sqrt

# ── Marginal and Component VaR (institutional-factor-marginal-component-var) ──
# The lesson's worked example: A +$100,000 (2%/day), B +$150,000 (1.5%), C -$50,000 (3%),
# rho_AB 0.30, rho_AC -0.20, rho_BC 0.10, one-day 95% VaR, z = 1.645.
W = [100000, 150000, -50000]
VOL = [0.02, 0.015, 0.03]
RHO = [[1, 0.3, -0.2], [0.3, 1, 0.1], [-0.2, 0.1, 1]]
Z = 1.645
S = [[RHO[i][j] * VOL[i] * VOL[j] for j in range(3)] for i in range(3)]
def var(w):
    return Z * sqrt(sum(w[i] * S[i][j] * w[j] for i in range(3) for j in range(3)))
SW = [sum(S[i][j] * W[j] for j in range(3)) for i in range(3)]
SIG = sqrt(sum(W[i] * SW[i] for i in range(3)))
VAR = Z * SIG
MV = [Z * x / SIG for x in SW]
CV = [W[i] * MV[i] for i in range(3)]
assert [round(x, 2) for x in SW] == [59.5, 40.5, -50.25]
assert round(SIG, 2) == 3812.81 and round(VAR, 2) == 6272.07
assert [round(x, 5) for x in MV] == [0.02567, 0.01747, -0.02168]
assert [round(x, 2) for x in CV] == [2567.07, 2621.0, 1083.99]
assert abs(sum(CV) - VAR) < 1e-6
NO_C = var([W[0], W[1], 0])
assert round(NO_C, 2) == 5641.77
assert round(var([2 * w for w in W]), 2) == round(2 * VAR, 2)
C1, C2 = CV[0], CV[0] + CV[1]

MCV = dict(w=600, h=720, intro="The lesson's three-position FX book: one VaR number, then where it comes from. Press play, or step through.", steps=[
    step('Three FX positions. A is long $100,000 with 2% daily volatility. B is long $150,000 at 1.5%. C is short $50,000 at 3%.',
         box('A', 20, 14, 160, 76, 'A  long', 'purple', sub='$100,000 · 2%', size=20),
         box('B', 220, 14, 160, 76, 'B  long', 'blue', sub='$150,000 · 1.5%', size=20),
         box('C', 420, 14, 160, 76, 'C  short', 'amber', sub='−$50,000 · 3%', size=20)),
    step('They are correlated: A and B by 0.30, A and C by −0.20, B and C by 0.10. Together these make the covariance matrix.',
         dict(line='ab', points=[[180, 52], [220, 52]], tone=None, width=3, ms=400),
         dict(line='bc', points=[[380, 52], [420, 52]], tone=None, width=3, ms=400),
         note('rab', 200, 112, '0.30', None, 18),
         note('rbc', 400, 112, '0.10', None, 18),
         note('rac', 300, 134, 'A with C: −0.20', None, 18)),
    step('Assume normal returns. Portfolio volatility is the square root of wᵀΣw: $3,813 a day. One-day 95% VaR is 1.645 × $3,813 = $6,272. One number. Where is it coming from?',
         box('tot', 100, 158, 400, 58, 'VaR = 1.645 × $3,813 = $6,272', 'green', size=21)),
    step('Marginal VaR: nudge one position by one more dollar, hold the rest, and see how much VaR moves. A adds 2.6 cents per dollar, B 1.7 cents. C\'s is negative: more short C would lower VaR.',
         chart('mv', (10, 236, 285, 250), 'Marginal VaR, $ per $', [0.4, 3.6], [-0.032, 0.036],
               [[-0.02, '−.02'], [0, '0'], [0.02, '.02']], [[1, 'A'], [2, 'B'], [3, 'C']], zero=True, pl=46, pr=10),
         dict(bars='mvb', chart='mv', data=[[1, round(MV[0], 5), '+0.026', 'purple'], [2, round(MV[1], 5), '+0.017', 'blue'], [3, round(MV[2], 5), '−0.022', 'amber']], bw=34, ms=1100)),
    step('Component VaR is weight times marginal VaR. A: $100,000 × 0.02567 = $2,567. B: $150,000 × 0.01747 = $2,621. C: −$50,000 × −0.02168 = +$1,084.',
         chart('cv', (305, 236, 285, 250), 'Component VaR ($)', [0.4, 5.4], [0, 7000],
               [[0, '0'], [3000, '3k'], [6000, '6k']], [[1, 'A'], [2, 'B'], [3, 'C'], [4.6, 'sum']], pl=40, pr=10),
         dict(bars='cvb', chart='cv', data=[[1, round(CV[0], 2), '2,567', 'purple'], [2, round(CV[1], 2), '2,621', 'blue'], [3, round(CV[2], 2), '1,084', 'amber']], bw=30, ms=1100)),
    step('Stack the three slices: 2,567 + 2,621 + 1,084 = $6,272. Exactly the total VaR. Nothing left over, nothing counted twice.',
         dict(gap='sa', chart='cv', top=[[4.25, round(C1, 2)], [4.95, round(C1, 2)]], bot=[[4.25, 0], [4.95, 0]], tone='purple', op=0.7),
         dict(gap='sb', chart='cv', top=[[4.25, round(C2, 2)], [4.95, round(C2, 2)]], bot=[[4.25, round(C1, 2)], [4.95, round(C1, 2)]], tone='blue', op=0.7),
         dict(gap='sc', chart='cv', top=[[4.25, round(VAR, 2)], [4.95, round(VAR, 2)]], bot=[[4.25, round(C2, 2)], [4.95, round(C2, 2)]], tone='amber', op=0.7),
         series('vl', 'cv', [[0.5, round(VAR, 2)], [5.3, round(VAR, 2)]], 'green', dash=True, ms=600),
         cnote('vll', 'cv', [2, round(VAR, 2)], '$6,272', 'green', 17, dy=-14),
         dict(pulse='tot')),
    step('Why exact? Double every position and VaR doubles: it is homogeneous of degree 1. Euler\'s theorem then says the weights times their marginal VaRs add up to the whole.',
         box('eu', 10, 504, 580, 58, 'double every position → VaR doubles → slices sum exactly', 'purple', size=19)),
    step('C is short and partly hedges A, yet its slice is still +$1,084. Being short still adds risk here, just less than its size would suggest.',
         dict(pulse='C'), dict(pulse='cvb')),
    step('But marginal VaR is a local slope. Close C completely and VaR falls only to $5,642, a saving of $630, not $1,084. Removing a whole position is incremental VaR, a different number.',
         box('inc', 10, 578, 580, 58, 'close C: VaR $6,272 → $5,642 (saves $630, not $1,084)', 'amber', size=19)),
    step('The same trick works one level up: split VaR across a few common factors, plus one specific-risk bucket. It all rests on normal returns and a covariance matrix that is itself an estimate.',
         note('end', 300, 680, 'exact slices, as long as the assumptions hold', 'red', 20)),
])


BOARD = dict(name='institutional_factor_marginal_component_var', lesson='institutional-factor-marginal-component-var',
             title='Component VaR: slicing one number exactly', cfg=MCV,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=5)
