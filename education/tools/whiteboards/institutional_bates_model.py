from ._wb import *

# ── Bates = Heston + Merton jumps (institutional-bates-model) ────────────────
# The lesson's worked example, fixed across maturities: diffusive vol 9%, lambda = 3 / year,
# mu_J = -1%, sigma_J = 4%, with its normal-approximation jump cumulants. Values below are
# recomputed here and checked against the lesson's table (38.6% / -0.699 ... / 7.744 ...).
SIG, LAM, MU, SJ = 0.09, 3.0, -0.01, 0.04
EY2 = MU ** 2 + SJ ** 2
EY3 = MU ** 3 + 3 * MU * SJ ** 2
EY4 = MU ** 4 + 6 * MU ** 2 * SJ ** 2 + 3 * SJ ** 4
MATS = [('1w', 1 / 52), ('1m', 1 / 12), ('3m', 0.25), ('1y', 1.0)]
def mom(T):
    tv = SIG ** 2 * T + LAM * T * EY2
    return LAM * T * EY2 / tv * 100, LAM * T * EY3 / tv ** 1.5, LAM * T * EY4 / tv ** 2
M = [mom(T) for _, T in MATS]
assert [round(m[0], 1) for m in M] == [38.6] * 4
assert [round(m[1], 3) for m in M] == [-0.699, -0.336, -0.194, -0.097]
assert [round(m[2], 3) for m in M] == [7.744, 1.787, 0.596, 0.149]
XT = [[k + 1, n] for k, (n, _) in enumerate(MATS)]

BATES = dict(w=600, h=720, intro="Two models the lab already covers, stapled together, then the lesson's fixed jump settings run across four maturities. Press play, or step through.", steps=[
    step('Heston: the price diffuses smoothly, and its variance is a random process of its own. It mean-reverts and clusters, like weather with its own weather.',
         icon('wx', 'thermo', 66, 6, 0.8, 'blue', 'Heston:\nvariance has weather', lsize=17)),
    step('Merton: every so often the price jumps, with no warning. Jumps arrive like a Poisson clock, with random sizes. No memory, though: vol does not stay high afterwards.',
         icon('jp', 'bolt', 460, 6, 0.8, 'amber', 'Merton:\nsudden jumps', lsize=17)),
    step('Bates (1996) adds Merton\'s jump term to Heston\'s price equation and changes nothing else. Eight parameters: Heston\'s five plus the jump trio.',
         icon('bt', 'scales', 250, 6, 0.8, 'purple', 'Bates', lsize=18),
         arrow('wx', 'bt', None, 'blue'), arrow('jp', 'bt', None, 'amber'),
         note('eq', 300, 176, 'dS/S = μ dt + √v dW  +  dJ', 'purple', 21)),
    step('The one new assumption: the jump clock ignores the diffusion. Independent pieces have pricing recipes that multiply, so Bates keeps a closed form and prices with the same FFT as Heston.',
         note('cf', 300, 214, 'φ_Bates = φ_Heston × φ_jump', 'green', 20)),
    step('Fix the lesson\'s settings: 9% diffusive vol, 3 jumps a year, average jump −1%, jump spread 4%. Now look at four maturities. Jumps supply 38.6% of the variance at every one of them.',
         chart('sh', (10, 244, 186, 250), 'Jump share', [0.4, 4.6], [0, 50],
               [[0, '0'], [20, '20'], [40, '40']], XT, pl=36, pr=8),
         dict(bars='shb', chart='sh', data=[[k + 1, round(M[k][0], 1), '38.6' if k in (0, 3) else '', 'blue'] for k in range(4)], bw=24, ms=1000)),
    step('Skewness tells a different story: −0.70 at one week, −0.10 at one year. It fades like one over the square root of maturity.',
         chart('sk', (207, 244, 186, 250), 'Skewness', [0.4, 4.6], [-0.8, 0],
               [[-0.6, '−.6'], [-0.3, '−.3'], [0, '0']], XT, pl=40, pr=8),
         dict(bars='skb', chart='sk', data=[[k + 1, round(M[k][1], 3), ['−.70', '', '', '−.10'][k], 'amber'] for k in range(4)], bw=24, ms=1000)),
    step('Excess kurtosis collapses fastest: 7.74 at one week, 0.15 at one year. That is 52 times smaller, one for each week in the year: it fades like one over maturity.',
         chart('ku', (404, 244, 186, 250), 'Excess kurtosis', [0.4, 4.6], [0, 9],
               [[0, '0'], [4, '4'], [8, '8']], XT, pl=34, pr=8),
         dict(bars='kub', chart='ku', data=[[k + 1, round(M[k][2], 3), ['7.74', '', '', '0.15'][k], 'red'] for k in range(4)], bw=24, ms=1000)),
    step('Smiles are shaped by skew and fat tails, not raw variance. So the same jumps steepen a one-week smile a lot and barely touch a one-year one. Stochastic vol needs time, so it shapes the long end.',
         box('own', 10, 514, 580, 56, 'jumps own the short end · stochastic vol owns the long end', 'green', size=19),
         dict(pulse='kub')),
    step('The cost: eight parameters. A bit less starting variance and a bit more jump frequency can fit today\'s surface almost equally well. A good fit does not prove the split is right.',
         box('id', 10, 584, 285, 72, '8 parameters:\nmany fits look alike', 'amber', size=18)),
    step('And the split matters for hedging. Smooth volatility risk can be delta-hedged as it moves. A jump happens in an instant, and no rebalancing gets you through it.',
         box('hg', 305, 584, 285, 72, 'jump risk: no continuous\nhedge gets through it', 'red', size=18),
         dict(pulse='jp')),
    step('So: Heston for persistence, jumps for the sudden short-dated wing, and humility about which is which.',
         note('end', 300, 690, 'easy to fit, hard to identify', 'purple', 20)),
])


BOARD = dict(name='institutional_bates_model', lesson='institutional-bates-model',
             title='Bates: stochastic vol plus jumps, maturity by maturity', cfg=BATES,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>',
             deck_after=8)
