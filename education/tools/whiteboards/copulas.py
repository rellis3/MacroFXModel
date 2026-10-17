from ._wb import *
from math import erf, exp, pi, sin, sqrt

# ── Copulas (copulas) ─────────────────────────────────────────────────────────
# The lesson's worked example: both copulas matched on Kendall's tau = 0.40, so
#   Gaussian rho = sin(pi tau / 2) = 0.588, Clayton theta = 2 tau / (1 - tau) = 1.333.
# The chart is P(B in its worst q | A in its worst q) = C(q, q) / q, computed exactly:
#   Clayton: (2 q^-theta - 1)^(-1/theta) / q  -> 0.595 = 2^(-0.75) as q -> 0
#   Gaussian: bivariate-normal CDF at (z_q, z_q) by quadrature -> 0.38, 0.18, 0.045 at
#   q = 10%, 1%, 0.01%, falling to 0 in the limit (the lesson's lambda_L = 0).
# The CDO story is the lesson's Section 03 narrative; no numbers beyond it.
TAU = 0.40
RHO = sin(pi * TAU / 2)
TH = 2 * TAU / (1 - TAU)

def _Phi(x): return 0.5 * (1 + erf(x / sqrt(2)))
def _ninv(p):
    lo, hi = -10.0, 10.0
    for _ in range(100):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if _Phi(m) < p else (lo, m)
    return (lo + hi) / 2
def _biv(a, r, n=6000):   # P(X <= a, Y <= a), standard bivariate normal, correlation r
    lo = -12.0; h = (a - lo) / n; s = 0.0
    for i in range(n + 1):
        x = lo + i * h; w = 0.5 if i in (0, n) else 1.0
        s += w * exp(-x * x / 2) / sqrt(2 * pi) * _Phi((a - r * x) / sqrt(1 - r * r))
    return s * h
def _gauss(q): return _biv(_ninv(q), RHO) / q
def _clay(q): return (2 * q ** -TH - 1) ** (-1 / TH) / q

XS = [1 + i * 0.25 for i in range(13)]          # depth axis: x = -log10(q), q from 10% to 0.01%
GA = [[x, round(_gauss(10 ** -x), 4)] for x in XS]
CL = [[x, round(_clay(10 ** -x), 4)] for x in XS]
G10, G1, G001 = (round(100 * _gauss(q)) for q in (0.1, 0.01, 0.0001))   # 38, 18, 4 (4.5)
G001 = round(100 * _gauss(0.0001), 1)
C1 = round(100 * _clay(0.01), 1)                                         # 59.5
LAM = round(2 ** (-1 / TH), 3)                                           # 0.595

CH = (10, 440, 580, 280)

COP = dict(w=600, h=790, intro='Two currency pairs with the same headline correlation, and two ways to link them. The lesson\'s worked example, then the CDO slice that depended on the difference. Press play, or step through.', steps=[
    step('Two currency pairs, each with its own pattern of moves, fat tails included. Their correlation is a comfortable 0.4: related, but not the same bet.',
         box('A', 20, 20, 200, 76, 'pair A', 'blue', sub='its own tails', size=21),
         box('B', 380, 20, 200, 76, 'pair B', 'blue', sub='its own tails', size=21),
         chip('corr', 300, 58, 'corr ≈ 0.4', 'amber')),
    step('Sklar\'s theorem, 1959: first turn each day\'s move into a rank between 0 and 1 using that pair\'s own distribution. A rank of 0.01 means one of its worst 1% of days.',
         box('u', 40, 140, 160, 64, 'rank u', 'green', sub='0 to 1', size=19),
         box('v', 400, 140, 160, 64, 'rank v', 'green', sub='0 to 1', size=19),
         arrow('A', 'u'), arrow('B', 'v')),
    step('Then a copula joins the two ranks. It holds only the link between the pairs, nothing about what each one looks like on its own. So the tails and the link can be chosen separately.',
         box('C', 190, 236, 220, 72, 'copula C(u, v)', 'purple', sub='only the link', size=20),
         arrow('u', 'C'), arrow('v', 'C')),
    step(f'Two candidate links, matched on the same Kendall\'s τ = 0.40 so the fight is fair: a Gaussian copula with ρ = {RHO:.3f}, and a Clayton copula with θ = {TH:.3f}.',
         box('G', 20, 360, 250, 64, 'Gaussian · ρ = 0.588', 'blue', size=19),
         box('K', 330, 360, 250, 64, 'Clayton · θ = 1.333', 'red', size=19),
         arrow('C', 'G'), arrow('C', 'K')),
    step(f'The question a correlation cannot answer: when pair A has one of its worst days, how often is pair B having one too? Under Clayton the answer settles at about {round(100 * LAM)}%, however deep into the tail you look.',
         chart('ch', CH, 'A in its worst q of days: chance B is too', [1, 4], [0, 0.72],
               [[0, '0'], [0.2, '20%'], [0.4, '40%'], [0.6, '60%']], [[1, '10%'], [2, '1%'], [3, '0.1%'], [4, '0.01%']], pl=50, pr=20),
         series('cl', 'ch', CL, 'red', ms=1300, label=f'Clayton → {LAM}', lat=[4, CL[-1][1]], ldx=-2, ldy=-16, lanchor='end', lsize=18)),
    step(f'Under the Gaussian copula the answer keeps shrinking: {G10}% at the worst 10% of days, {G1}% at the worst 1%, {G001}% at the worst 0.01%, and towards zero in the limit. Zero tail dependence.',
         series('ga', 'ch', GA, 'blue', ms=1300, label='Gaussian → 0', lat=[4, GA[-1][1]], ldx=-2, ldy=-16, lanchor='end', lsize=18)),
    step(f'At the worst 1% of days: {G1}% against {C1}%. Same τ, same headline correlation, a threefold gap in how often the two crash together. That gap is the whole lesson.',
         dot('g1', 'ch', [2, GA[4][1]], f'{G1}%', 'blue', dx=0, dy=22),
         dot('c1', 'ch', [2, CL[4][1]], f'{C1}%', 'red', dx=0, dy=-16)),
    step('Where it mattered: a CDO pools many mortgages and slices the losses. The junior slice takes the first defaults; the super-senior slice loses only if a large share of the pool defaults at the same time.',
         dict(hide='A'), dict(hide='B'), dict(hide='corr'), dict(hide='u'), dict(hide='v'), dict(hide='C'), dict(hide='G'), dict(hide='K'),
         dict(hide='A>u'), dict(hide='B>v'), dict(hide='u>C'), dict(hide='v>C'), dict(hide='C>G'), dict(hide='C>K'),
         box('ss', 20, 20, 260, 84, 'super-senior', 'green', sub='marked near riskless', size=21),
         box('mz', 20, 118, 260, 66, 'mezzanine', 'amber', size=20),
         box('jr', 20, 198, 260, 66, 'junior: first loss', 'red', size=20),
         icon('pool', 'house', 420, 186, 0.8, 'blue', 'mortgage pool', lsize=18)),
    step('Priced with a Gaussian copula fitted on calm years, "most of the pool defaults together" sits in the corner the model calls near impossible. So the super-senior slice paid a thin spread and banks kept it.',
         dict(pulse='ss'), dict(pulse='ga')),
    step('Then US house prices fell nationwide: one common shock to every region at once, barely present in the calm years the model was fitted on. Defaults rose together and the lower slices were wiped out together.',
         icon('fall', 'down', 522, 196, 0.6, 'red'),
         arrow('pool', 'jr', 'defaults together', 'red', bend=16),
         dict(cross='jr'), dict(cross='mz')),
    step('Losses climbed to the super-senior slices. Top-rated CDO tranches were downgraded in large numbers through 2007 and 2008, and UBS, Merrill Lynch and Citigroup wrote down tens of billions of dollars, much of it on slices they had kept.',
         dict(sub='ss', text='written down: tens of $bn'), dict(pulse='ss'), dict(pulse='cl')),
    step('The lesson is not "copulas are wrong". Any link fitted only on calm data can understate how tightly things crash together. Test the link against stress periods before you trust a "diversified" book.',
         note('end', 300, 350, 'fitted on calm years ≠ safe in a crash', 'amber', 21),
         note('end2', 300, 398, 'test the link on stress periods', 'green', 21)),
])


BOARD = dict(name='copulas', lesson='copulas', title='Copulas: same correlation, different crashes', cfg=COP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the super-senior tranche, 2007–08</h2>',
             deck_after=7)
