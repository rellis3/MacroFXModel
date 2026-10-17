from ._wb import *
import random

# ── Alpha vs beta separation (alpha-beta-separation) ──────────────────────────
# The lesson's worked example: strategy 20%, S&P 500 15%, risk-free 4%, beta 1.2, alpha ~2%/yr:
# beta slice 1.2 x 11% = 13.2%, reconstructed 19.2%, residual 0.8%. The scatter is 36
# ILLUSTRATIVE months drawn as strategy = alpha/12 + 1.2 x market + noise (seeded), only to
# show what the regression sees. The 2008 steps use only the lesson's own story.
RF, RM, RP, B, A = 4.0, 15.0, 20.0, 1.2, 2.0
BETA = round(B * (RM - RF), 1)
RES = round(RP - (RF + BETA + A), 1)
assert BETA == 13.2 and RES == 0.8
_r = random.Random(7)
PTS = []
for _ in range(36):
    m = _r.gauss(0.6, 4.0)
    PTS.append([round(m, 2), round(A / 12 + B * m + _r.gauss(0, 1.2), 2)])

SC = (10, 120, 290, 270)
BC = (310, 120, 280, 270)
AB = dict(w=600, h=760, intro="A manager made 20% in a year the market made 15%. How much was skill? Take the return apart, hedge out the market, then watch what 2008 did to the idea. Press play, or step through.", steps=[
    step('A strategy returned 20% in a year the S&P 500 returned 15%, with cash paying 4%. Five points ahead of the market. Is that five points of skill?',
         box('strat', 10, 12, 180, 80, 'strategy\n20%', 'purple', size=20),
         box('mkt', 210, 12, 180, 80, 'S&P 500\n15%', 'blue', size=20),
         box('cash', 410, 12, 180, 80, 'cash\n4%', None, size=20)),
    step('Regress the strategy\'s monthly returns over cash on the market\'s. Each dot is a month (illustrative). The slope is beta, 1.2: the strategy moves 1.2 times as much as the market.',
         chart('sc', SC, 'Monthly returns (illustrative)', [-9, 10], [-12, 14], [[0, '0']],
               [[-5, '−5%'], [0, '0'], [5, '+5% market']], pl=30, pr=10, zero=True),
         series('fit', 'sc', [[-9, A / 12 + B * -9], [10, A / 12 + B * 10]], 'red', ms=900, label='slope β = 1.2', lat=[5, A / 12 + B * 5], ldx=-6, ldy=-16, lanchor='end'),
         *[dot('p%d' % i, 'sc', p, '', 'blue') for i, p in enumerate(PTS)]),
    step(f'Now take the 20% apart. Cash: 4%. The market ride: 1.2 × (15% − 4%) = {BETA}%. Alpha, the intercept: about 2%. Noise for this one year: {RES}%.',
         chart('bar', BC, 'The 20%, taken apart', [0.4, 4.6], [0, 15], [[5, '5%'], [10, '10%']],
               [[1, 'cash'], [2, 'beta'], [3, 'alpha'], [4, 'noise']], pl=40, pr=10),
         dict(bars='parts', chart='bar', data=[[1, RF, '4%', 'purple'], [2, BETA, f'{BETA}%', 'blue'], [3, A, '2%', 'green'], [4, RES, f'{RES}%', 'amber']], bw=40, ms=1200)),
    step('The beta slice is the cheap part: anyone can buy 1.2 times the market with an index future, no skill needed. The manager\'s real contribution is the 2%, not the 20%.',
         dict(pulse='parts'), dict(dim='mkt')),
    step('Hedge it out: short S&P futures worth 1.2 times the position. The two beta terms cancel. What is left, in expectation, is about 2% a year of alpha, before the costs of the hedge.',
         chip('fut', 120, 430, 'short 1.2× futures', 'red'),
         move('fut', 450, 430, 1100),
         note('left', 300, 470, 'beta → 0,  ≈ 2%/yr alpha left (before costs)', 'green', 19)),
    step('That hedged stream is portable: attach it to any market exposure you actually want, or none. Pension plans did exactly this, holding equity beta in futures and putting the spare cash into an "alpha" source.',
         icon('plan', 'piggy', 40, 500, 0.62, 'blue', 'pension plan', sym='$', lsize=17),
         icon('fut2', 'up', 200, 500, 0.6, 'blue', 'S&P futures\n(beta, margin)', lsize=17),
         icon('hf', 'bank', 400, 500, 0.6, 'green', 'hedge funds,\ncredit (alpha)', sym='$', lsize=17),
         arrow('plan', 'fut2', id='a1'), arrow('plan', 'hf', bend=-40, id='a2')),
    step('2008: the S&P 500 fell by more than a third. The futures lost what the index lost, and futures settle in cash as they go, so the plan owed margin every day.',
         dict(hide='left'),
         icon('dn', 'down', 200, 500, 0.6, 'red', 'futures lose,\nmargin due daily', lsize=17),
         dict(hide='fut2'), dict(pulse='dn')),
    step('The alpha leg was supposed to be unrelated to the market. It was not: hedge fund indices had one of their worst years on record and structured credit fell. And the money paid out monthly or quarterly, some behind gates.',
         dict(cross='hf'),
         note('gate', 470, 628, 'losing too, and gated', 'red', 18)),
    step('Both legs lost at once, and the cash to meet the calls was locked away. Some plans had to sell other assets at bad prices to raise collateral.',
         icon('fire', 'fire', 50, 650, 0.5, 'red', 'forced selling', lsize=17)),
    step('The lesson: the residual of a one-factor regression hid other betas, to credit and to liquidity. Before trusting an alpha, test it against more factors and match the liquidity of the two legs.',
         box('lesson', 220, 664, 260, 88, 'hidden betas:\ncredit + liquidity', 'amber', size=19)),
])


BOARD = dict(name='alpha_beta_separation', lesson='alpha-beta-separation', title='Alpha vs beta: take the return apart', cfg=AB,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=12)
