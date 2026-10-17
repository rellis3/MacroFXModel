from ._wb import *
from math import log, log2, log10

# ── Paying by the bit (mdl-information-criteria) ─────────────────────────────
# The lesson's worked example (reused from the AIC & BIC lesson): n = 100,
#   Model A: k = 2, -2 ln L = 100 -> L(M) = 6.644, L(D|M) = 72.135, DL = 78.779 bits, BIC = 109.21
#   Model B: k = 5, -2 ln L = 94  -> L(M) = 16.610, L(D|M) = 67.807, DL = 84.416 bits, BIC = 117.03
# Per-parameter cost 0.5 * log2(n), drawn for n from 10 to 10,000 (x axis is log10 n).
N = 100
def parts(k, m2ll): return round(k / 2 * log2(N), 3), round(m2ll / (2 * log(2)), 3)
AM, AD = parts(2, 100)
BM, BD = parts(5, 94)
assert (AM, AD, BM, BD) == (6.644, 72.135, 16.61, 67.807)
TA, TB = round(AM + AD, 2), round(BM + BD, 2)
BICA, BICB = round(2 * log(2) * (AM + AD), 2), round(2 * log(2) * (BM + BD), 2)
assert (TA, TB, BICA, BICB) == (78.78, 84.42, 109.21, 117.03)
COST = [[round(x / 10, 1), round(0.5 * log2(10 ** (x / 10)), 3)] for x in range(10, 41)]

def band(id, x0, x1, v0, v1, tone):
    return dict(gap=id, chart='dl', top=[[x0, v1], [x1, v1]], bot=[[x0, v0], [x1, v0]], tone=tone, op=0.55)

MDL = dict(w=600, h=790, intro='Occam\'s razor with a ruler: send a model and its data down a wire, paying for every bit. The lesson\'s own two models. Press play, or step through.', steps=[
    step('You must send a model, and the data it describes, to someone over a slow wire. You pay for every bit. Whoever sends the shorter total message wins.',
         icon('snd', 'person', 30, 8, 0.7, 'blue', 'you', lsize=17),
         icon('rcv', 'person', 500, 8, 0.7, 'blue', 'receiver', lsize=17),
         arrow('snd', 'rcv', 'pay per bit', 'amber')),
    step('Model A has 2 parameters, fitted to 100 observations. Stating each one as precisely as 100 points allow costs ½ log₂ 100 ≈ 3.32 bits, so 6.64 bits for the model.',
         chart('dl', (10, 130, 370, 350), 'Message length, bits', [0, 3], [0, 95], [[0, '0'], [40, '40'], [80, '80']],
               [[0.95, 'Model A'], [2.05, 'Model B']], pl=46),
         band('am', 0.6, 1.3, 0, AM, 'amber'),
         cnote('aml', 'dl', [1.35, AM / 2], '6.64', 'amber', 16, 'start')),
    step('Then the leftovers: whatever Model A does not explain, priced by Shannon\'s rule at 72.14 bits. Total for Model A: 78.78 bits.',
         band('ad', 0.6, 1.3, AM, AM + AD, 'blue'),
         cnote('at', 'dl', [0.95, TA], '78.78', 'green', 18, dy=-14),
         cnote('adl', 'dl', [0.95, AM + AD / 2], '72.14\nleftover', 'blue', 16)),
    step('Model B has 5 parameters. Writing them down costs 2.5 × 6.64 = 16.61 bits, more than double Model A\'s.',
         band('bm', 1.7, 2.4, 0, BM, 'amber'),
         cnote('bml', 'dl', [2.45, BM / 2], '16.61', 'amber', 16, 'start')),
    step('Model B fits better, so its leftovers are shorter: 67.81 bits. But its total is 84.42 bits, longer than Model A\'s.',
         band('bd', 1.7, 2.4, BM, BM + BD, 'blue'),
         cnote('bt', 'dl', [2.05, TB], '84.42', 'red', 18, dy=-14),
         cnote('bdl', 'dl', [2.05, BM + BD / 2], '67.81\nleftover', 'blue', 16)),
    step('The trade: three extra parameters cost 9.97 bits to state and saved only 8.66 bits of leftovers. A losing trade, so Model A sends the shorter message.',
         box('tr', 400, 130, 190, 160, '3 extra params\n+9.97 bits to state\n−8.66 bits leftover\n→ A wins', 'red', size=18),
         dict(pulse='at')),
    step('Why ½ log₂ n per parameter? More data pins a parameter down more finely, so stating it to that precision costs a little more. The cost grows slowly with the sample size.',
         chart('pc', (10, 500, 370, 280), 'Bits per parameter, ½ log₂ n', [1, 4], [0, 7.5], [[0, '0'], [3.32, '3.32'], [6.64, '6.64']],
               [[1, '10'], [2, '100'], [3, '1,000'], [4, '10,000']], pl=50),
         series('pcs', 'pc', COST, 'purple', ms=1300),
         dot('p100', 'pc', [2, 3.322], 'n = 100', 'purple', dx=10, dy=12, anchor='start')),
    step('Now multiply each message length by a fixed constant, 2 ln 2 ≈ 1.386. Model A: 78.78 × 1.386 = 109.21. Model B: 84.42 × 1.386 = 117.03.',
         box('bic', 400, 310, 190, 170, '× 2 ln 2 ≈ 1.386\nA: 109.21\nB: 117.03', 'purple', size=19)),
    step('Those are exactly the two models\' BIC values. Shortest message and lowest BIC are the same number, rescaled, so they always pick the same model.',
         note('eq', 300, 118, 'BIC = 2 ln 2 × message length', 'purple', 20),
         dict(pulse='bic')),
    step('Two roads, one answer. Schwarz got BIC from Bayesian probability in 1978. Rissanen got the same penalty from compression the same year, independently.',
         box('sch', 400, 500, 190, 130, 'Schwarz 1978:\nBayes', 'blue', size=19),
         box('ris', 400, 650, 190, 130, 'Rissanen 1978:\ncompression', 'green', size=19)),
    step('Two cautions. The shortest message is only the best of the models you tried, not the true model. And this exact match is with BIC, not AIC.',
         dict(hide='eq'),
         note('cv', 300, 118, 'best among candidates, not "true"', 'amber', 20)),
    step('The question to ask of any backtest: does it compress the data, or just memorise it? Every parameter has to pay for itself in bits.',
         dict(hide='cv'),
         note('q', 300, 118, 'compress, or memorise?', 'green', 22),
         dict(pulse='tr')),
])


BOARD = dict(name='mdl_information_criteria', lesson='mdl-information-criteria', title='MDL: the shortest message wins', cfg=MDL,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=10)
