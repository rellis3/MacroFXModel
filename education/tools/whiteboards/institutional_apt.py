from ._wb import *

# ── Arbitrage Pricing Theory (institutional-apt) ──────────────────────────────
# Numbers are the lesson's own: the no-arbitrage sketch (two diversified portfolios with beta 1.0
# priced at 8% and 6%, a 2-point gap) and the two-factor toy model (R_f 3%, lambda_IP +3%,
# lambda_INF -1.5%; assets X, Y, Z). Expected returns are computed here, not typed in.
RF, L_IP, L_INF = 3.0, 3.0, -1.5
ASSETS = [('X', 1.5, 0.5), ('Y', 0.8, -0.3), ('Z', 2.0, 1.0)]
ER = {n: round(RF + b1 * L_IP + b2 * L_INF, 2) for n, b1, b2 in ASSETS}
assert ER == {'X': 6.75, 'Y': 5.85, 'Z': 7.5}, ER

def _sum(n, b1, b2):
    t1, t2 = b1 * L_IP, b2 * L_INF
    return f'3 {"+" if t1 >= 0 else "−"} {abs(t1):g} {"+" if t2 >= 0 else "−"} {abs(t2):g}'

APT = dict(w=600, h=580, intro="Two portfolios with the same risk and different prices, and what arbitrage does about it. Then the lesson's two-factor toy model. Press play, or step through.", steps=[
    step('Two big, well-diversified portfolios, P and Q. Each has exactly the same exposure to the shared risk factor: a beta of 1.0.',
         box('P', 20, 20, 200, 84, 'P · beta 1.0', 'green', sub='expected ?', size=20),
         box('Q', 380, 20, 200, 84, 'Q · beta 1.0', 'amber', sub='expected ?', size=20)),
    step('Same risk, different price tags. P is priced to return 8% a year, Q only 6%.',
         dict(sub='P', text='expected 8%'), dict(sub='Q', text='expected 6%'),
         note('gap', 300, 140, 'same beta, 2-point gap', 'red', 19)),
    step('So buy $1 of P and short $1 of Q. The two legs are the same size, so the position costs nothing to put on.',
         chip('long', 70, 176, 'long $1 of P', 'green'),
         chip('short', 430, 176, 'short $1 of Q', 'amber'),
         note('cost', 300, 230, 'net cost: $0', 'blue', 19)),
    step('The factor exposures cancel: +1.0 from P, −1.0 from Q, net zero. And because both portfolios are spread over many names, their stock-specific noise has already averaged away.',
         note('exp', 300, 262, 'net exposure: 1.0 − 1.0 = 0', 'blue', 19),
         note('noise', 300, 292, 'stock-specific noise: diversified away', 'blue', 17)),
    step('What is left: 8% − 6% = 2% a year, for no money and no risk. A free lunch.',
         icon('coin', 'coin', 262, 302, 0.6, 'green', '+2%', sym='$', lsize=19)),
    step('A free lunch does not survive. Arbitrageurs pile in, buying P and selling Q. Buying pushes P\'s price up and its expected return down; selling does the reverse to Q, until the gap closes.',
         icon('crowd', 'crowd', 255, 6, 0.9, 'red', 'arbitrageurs', lsize=17),
         dict(sub='P', text='expected ↓'), dict(sub='Q', text='expected ↑'),
         dict(hide='gap'), note('closed', 300, 140, 'gap closes: same beta, same return', 'green', 19), dict(dim='coin')),
    step('So the rule is: the same exposure must earn the same expected return. Expected return = the risk-free rate, plus each exposure times that risk\'s price. APT never says which risks.',
         dict(hide='long'), dict(hide='short'), dict(hide='cost'), dict(hide='exp'), dict(hide='noise'), dict(hide='coin'),
         box('eq', 20, 270, 560, 64, 'expected return ≈ R_f + Σ beta × price of that risk', 'purple', size=20)),
    step('The lesson\'s toy version has two factors: growth surprises and inflation surprises. The risk-free rate is 3%. Growth risk pays +3% per unit. Inflation risk pays −1.5%, because assets that rise on inflation surprises are a hedge.',
         note('prices', 300, 362, 'R_f 3%  ·  growth +3%  ·  inflation −1.5%', 'blue', 19)),
    step('Asset X (growth beta 1.5, inflation beta 0.5): 3 + 4.5 − 0.75 = 6.75%. Asset Y (0.8, −0.3): 3 + 2.4 + 0.45 = 5.85%. Asset Z (2.0, 1.0): 3 + 6 − 1.5 = 7.5%.',
         *[box(f'a{n}', 20 + 195 * i, 384, 170, 92, f'Asset {n}\n{_sum(n, b1, b2)}', ['green', 'blue', 'purple'][i], sub='3%', size=18)
           for i, (n, b1, b2) in enumerate(ASSETS)],
         *[dict(count=f'a{n}', **{'from': RF, 'to': ER[n], 'dp': 2, 'suf': '%'}) for n, _, _ in ASSETS]),
    step('Why surprises and not levels: an inflation print exactly on consensus is already in the price. Its surprise is zero, so it moves nothing, however high the number is. Only the miss carries risk, and a premium.',
         note('surp', 300, 512, 'on consensus → surprise 0 → no new risk', 'amber', 19)),
    step('The catch: the theory never names the factors, so there is no single "APT model". Different factor choices give different premia. And the equation is approximate, tighter as the number of assets grows.',
         note('catch', 300, 552, 'a framework: you choose the factors', 'red', 19),
         dict(pulse='eq')),
])


BOARD = dict(name='institutional_apt', lesson='institutional-apt',
             title='APT: a free lunch, and why it closes', cfg=APT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>Chen, Roll &amp; Ross (1986): putting a macro face on the factors</h2>',
             deck_after=5)
