from ._wb import *
from math import sqrt

# ── Hierarchical Risk Parity: build the tree, then split weight down it (hierarchical-risk-parity) ──
# The lesson's five-pair example. Merge distances d = sqrt(0.5 (1 - rho)):
#   EURUSD-GBPUSD 0.32 (rho 0.80), USDJPY-USDCHF 0.42 (rho 0.65), AUDUSD joins at 0.47, root 0.72.
# Illustrative vols: EUR 8%, GBP 9%, AUD 11%, JPY 7%, CHF 6%. Cluster variance by inverse-variance
# weighting (as the lesson's calculator): V_L = 0.00276, V_R = 0.00208 -> alpha_L 0.429, alpha_R 0.571;
# {E,G} vs A: 0.772 / 0.228; E/G 0.559 / 0.441; J/C 0.424 / 0.576.
# Final: EUR 18.5, GBP 14.6, AUD 9.8, JPY 24.2, CHF 32.9 (%).
# Autumn 2008 facts from the lesson: Lehman failed 15 Sept 2008, carry unwound together, AUD/USD fell by more
# than a third between its July high and late October, the yen rose sharply.


def iv(vs):
    return 1 / sum(1 / v for v in vs)


E, G, A, J, C = (x * x / 1e4 for x in (8, 9, 11, 7, 6))
VL, VR = iv([E, G, A]), iv([J, C])
aL = 1 - VL / (VL + VR)
aEG = 1 - iv([E, G]) / (iv([E, G]) + A)
aE, aJ = 1 - E / (E + G), 1 - J / (J + C)
W = dict(E=aL * aEG * aE, G=aL * aEG * (1 - aE), A=aL * (1 - aEG), J=(1 - aL) * aJ, C=(1 - aL) * (1 - aJ))
assert round(VL, 5) == 0.00276 and round(VR, 5) == 0.00208 and round(aL, 3) == 0.429 and round(aEG, 3) == 0.772
assert [round(100 * W[k], 1) for k in 'EGAJC'] == [18.5, 14.6, 9.8, 24.2, 32.9]
assert round(sqrt(0.5 * (1 - 0.80)), 2) == 0.32 and round(sqrt(0.5 * (1 - 0.65)), 2) == 0.42


def Y(d):  # merge height on the board
    return round(380 - d * 400)


LX = dict(E=60, G=175, A=290, J=420, C=535)
LY = 392  # top of the leaf boxes
NEG, NL, NR, NROOT = (LX['E'] + LX['G']) / 2, None, (LX['J'] + LX['C']) / 2, None
NL = (NEG + LX['A']) / 2
NROOT = (NL + NR) / 2
yEG, yJC, yL, yR = Y(0.32), Y(0.42), Y(0.47), Y(0.72)


def leaf(k, name, vol, tone):
    return box('l' + k, LX[k] - 54, LY, 108, 76, name + '\nσ ' + vol, tone, sub='', size=17)


def ln(id, pts, tone):
    return dict(line=id, points=pts, tone=tone, width=3, ms=600)


HRP = dict(w=600, h=720, intro='Five currency pairs, a tree built from their correlations, and weight poured down it one fork at a time. Press play, or step through.', steps=[
    step('Five FX pairs, with the lesson\'s illustrative volatilities. An optimizer would invert their whole covariance matrix at once. HRP never does.',
         leaf('E', 'EURUSD', '8%', 'blue'), leaf('G', 'GBPUSD', '9%', 'blue'), leaf('A', 'AUDUSD', '11%', 'blue'),
         leaf('J', 'USDJPY', '7%', 'amber'), leaf('C', 'USDCHF', '6%', 'amber')),
    step('Stage 1: turn correlation into distance, d = √(½(1 − ρ)). EURUSD and GBPUSD move together at ρ = 0.80, so d = 0.32: they merge first.',
         ln('eg', [[LX['E'], LY], [LX['E'], yEG], [LX['G'], yEG], [LX['G'], LY]], 'blue'),
         note('deg', NEG, yEG + 26, 'd 0.32', 'blue', 17)),
    step('USDJPY and USDCHF, the safe havens, merge next at ρ = 0.65, d = 0.42.',
         ln('jc', [[LX['J'], LY], [LX['J'], yJC], [LX['C'], yJC], [LX['C'], LY]], 'amber'),
         note('djc', NR, yJC + 26, 'd 0.42', 'amber', 17)),
    step('AUDUSD joins the euro and sterling pair at d = 0.47. That completes a risk-on bloc.',
         ln('ega', [[NEG, yEG], [NEG, yL], [LX['A'], yL], [LX['A'], LY]], 'blue'),
         note('dl', NL, yL + 26, 'd 0.47', 'blue', 17)),
    step('The two blocs only meet at the root, d = 0.72: their cross-bloc correlations are the lowest in the basket. Reading the leaves left to right is Stage 2, the quasi-diagonal order.',
         ln('root', [[NL, yL], [NL, yR], [NR, yR], [NR, yJC]], 'purple'),
         box('top', NROOT - 70, yR - 78, 140, 56, '100%', 'purple', size=22)),
    step('Stage 3: split the 100% between the blocs. Risk-on has cluster variance 0.00276, safe-haven 0.00208. The calmer side gets more: 1 − 0.00276 ÷ 0.00484 = 42.9% left, 57.1% right.',
         chip('wL', NL - 50, (yL + yR) / 2, '42.9%', 'blue'),
         chip('wR', NR + 50, (yJC + yR) / 2, '57.1%', 'amber')),
    step('Inside the risk-on bloc, euro plus sterling versus AUDUSD: 0.772 to 0.228. Of the 42.9%, that is 33.1% and 9.8%.',
         chip('wEG', NEG - 46, (yEG + yL) / 2, '33.1%', 'blue'),
         dict(sub='lA', text='9.8%'), dict(pulse='lA')),
    step('Split again at every fork, calmer side first. EURUSD 18.5%, GBPUSD 14.6%, USDJPY 24.2%, USDCHF 32.9%. Each weight is the product of the splits on its path. Nothing was inverted.',
         dict(sub='lE', text='18.5%'), dict(sub='lG', text='14.6%'),
         dict(sub='lJ', text='24.2%'), dict(sub='lC', text='32.9%')),
    step('Autumn 2008. After Lehman failed on 15 September, carry trades unwound together. The high-yielders fell as one block, and within it correlations rose toward one.',
         icon('lehman', 'domino', 20, 500, 0.6, 'red', 'Lehman fails\n15 Sept 2008', lsize=16),
         dict(pulse='ega'), dict(pulse='eg')),
    step('AUD/USD fell by more than a third between its July high and late October, while the yen rose sharply. Five "different" carry trades had become one bet, and a covariance matrix with near-duplicate rows is close to singular.',
         icon('aud', 'down', 230, 500, 0.6, 'red', 'AUD/USD down\nover a third', lsize=16),
         arrow('lehman', 'aud', None, 'red')),
    step('That is the curse HRP avoids: no inversion. But it still reads its tree and variances from past data. A tree built in the calm summer would have weighted the falling bloc on calm variances.',
         box('catch', 410, 500, 180, 110, 'no inversion,\nbut the same\npast data', 'amber', size=18),
         arrow('aud', 'catch', None, 'amber')),
])


BOARD = dict(name='hierarchical_risk_parity', lesson='hierarchical-risk-parity',
             title='Build the tree, then pour the weight down it: HRP step by step', cfg=HRP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: autumn 2008, when the blocs became one bet each</h2>',
             deck_after=5)
