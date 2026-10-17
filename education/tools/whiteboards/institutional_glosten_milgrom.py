from ._wb import *

# ── Glosten-Milgrom sequential market making (institutional-glosten-milgrom) ──
# The lesson's worked example: delta0 = 0.5, mu = 0.3, V_H = 105, V_L = 95. Likelihoods
# 0.65 / 0.35; quotes 101.50/98.50 -> 102.75/100.00 -> 103.65/101.50 -> 102.75/100.00 after
# buy, buy, sell. The spread-vs-belief curve is the model's own formula at mu = 0.3.
MU, VH, VL = 0.3, 105, 95
PB, PL = MU + (1 - MU) / 2, (1 - MU) / 2
def quote(d):
    a = (PB * d * VH + PL * (1 - d) * VL) / (PB * d + PL * (1 - d))
    b = ((1 - PB) * d * VH + (1 - PL) * (1 - d) * VL) / ((1 - PB) * d + (1 - PL) * (1 - d))
    return a, b, a - b
def post(d, side):
    lh, ll = (PB, PL) if side == 'buy' else (1 - PB, 1 - PL)
    return lh * d / (lh * d + ll * (1 - d))
D = [0.5]
for side in ('buy', 'buy', 'sell'): D.append(post(D[-1], side))
Q = [quote(d) for d in D]
assert [tuple(round(x, 2) for x in q) for q in Q] == [(101.5, 98.5, 3.0), (102.75, 100.0, 2.75), (103.65, 101.5, 2.15), (102.75, 100.0, 2.75)]
assert round(D[2], 4) == 0.7752
CURVE = [[i / 40, round(quote(i / 40)[2], 4)] for i in range(41)]

def upd(i, side, cap):
    a0, b0, s0 = Q[i - 1]; a1, b1, s1 = Q[i]
    tone = 'green' if side == 'buy' else 'red'
    return step(cap,
        chip(f'c{i}', 190, 60, side.upper(), tone), move(f'c{i}', 440, 60, 1000), dict(hide=f'c{i}'),
        dict(count='delta', **{'from': round(D[i - 1], 4), 'to': round(D[i], 4), 'dp': 4, 'pre': 'δ = '}),
        dict(count='ask', **{'from': round(a0, 2), 'to': round(a1, 2), 'dp': 2}),
        dict(count='bid', **{'from': round(b0, 2), 'to': round(b1, 2), 'dp': 2}),
        dict(count='spr', **{'from': round(s0, 2), 'to': round(s1, 2), 'dp': 2}),
        dot(f'p{i}', 'sc', [D[i], s1], f'{i}: {side} → {s1:.2f}', tone, size=16,
            **({'dx': 10, 'dy': -14, 'anchor': 'start'} if i < 3 else {'dx': -12, 'dy': 22, 'anchor': 'end', 'r': 3.5})))

CFG = dict(w=600, h=724, intro='A market maker sees one anonymous order at a time. Each buy or sell is a clue about the true value, and the quote moves with the clue. Press play, or step through.', steps=[
    step('The asset is worth either 105 or 95. The market maker cannot tell which, so it starts at 50/50. Orders arrive one at a time from two kinds of trader.',
         icon('inf', 'person', 36, 6, 0.62, 'amber', 'informed 30%', lsize=16),
         icon('noise', 'crowd', 150, 6, 0.62, 'blue', 'noise 70%', lsize=16),
         icon('mm', 'bank', 470, 6, 0.7, 'purple', 'market maker', lsize=16),
         box('delta', 10, 140, 138, 70, 'belief in 105', 'purple', sub='δ = 0.5000', size=17)),
    step('Informed traders know the value: they buy only if it is 105 and sell only if it is 95. Noise traders buy or sell at random. So a buy is more likely if the value is high: 0.65 against 0.35.',
         note('lik', 300, 240, 'P(buy | 105) = 0.3 + 0.7 × ½ = 0.65   ·   P(buy | 95) = 0.35', 'amber', 17)),
    step('Quote at break-even. The ask is the expected value given that a buy arrives, 101.50. The bid is the expected value given a sell, 98.50. The 3.00 gap pays for being picked off by informed traders.',
         box('ask', 158, 140, 138, 70, 'Ask', 'green', sub='101.50', size=18),
         box('bid', 306, 140, 138, 70, 'Bid', 'red', sub='98.50', size=18),
         box('spr', 454, 140, 136, 70, 'Spread', 'blue', sub='3.00', size=18),
         chart('sc', (10, 272, 580, 296), 'Spread against belief δ, 30% informed', [0, 1], [0, 3.6], [[1, '1.00'], [2, '2.00'], [3, '3.00']],
               [[0, '0'], [0.5, '0.5'], [1, '1']], pl=56, pr=16),
         series('curve', 'sc', CURVE, 'purple', ms=1200),
         dot('p0', 'sc', [0.5, 3.0], 'open: 3.00', 'blue', dy=-16, size=16)),
    upd(1, 'buy', 'A buy arrives. By Bayes, belief in 105 rises from 0.50 to 0.65. The market maker requotes: 102.75 / 100.00. Less is left to be unsure about, so the spread narrows to 2.75.'),
    upd(2, 'buy', 'Another buy. Belief rises to 0.7752 and the quote moves to 103.65 / 101.50. The spread narrows again, to 2.15.'),
    upd(3, 'sell', 'Then a sell, contrary evidence. Belief falls back to 0.65 exactly, one buy\'s worth of evidence net, and the quote returns to 102.75 / 100.00. The spread widens back to 2.75.'),
    step('The shape: the spread is widest at δ = 0.5, maximum doubt, and shrinks as belief heads toward 0 or 1. A run of same-side trades narrows it; a contrary trade widens it again.',
         dict(pulse='curve')),
    step('Set the informed share to zero and a buy tells you nothing. Belief never moves, and ask = bid: no spread at all. In this model the whole spread exists because some traders know more.',
         series('zero', 'sc', [[0, 0.02], [1, 0.02]], 'amber', dash=True, ms=500, label='no informed traders: spread 0', lat=[0.5, 0.02], ldy=-14, lsize=16)),
    step('The testable prediction: before a scheduled release more of the flow is informed, so dealers widen. After it, early one-sided trades settle the belief fast and the spread compresses within minutes.',
         box('news', 20, 584, 270, 84, 'before news:\nmore informed flow → wider', 'amber', size=18),
         box('after', 310, 584, 270, 84, 'after news:\none-sided trades → tighter', 'green', size=18)),
])


BOARD = dict(name='institutional_glosten_milgrom', lesson='institutional-glosten-milgrom',
             title='Glosten-Milgrom: a quote that learns from every trade', cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)
