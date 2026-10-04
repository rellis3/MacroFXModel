from ._wb import *

# ── Loss aversion / prospect theory (loss-aversion-prospect-theory) ───────────
# Tversky & Kahneman (1992) power value function: v(x) = x^0.88 for gains,
# −2.25·(−x)^0.88 for losses. No probability weighting here (as in the lesson's
# section-2 chart): a 50% chance is valued at half the felt value.
A, LAM = 0.88, 2.25
def v(x): return round(x ** A, 1) if x >= 0 else round(-LAM * (-x) ** A, 1)
XS = [0, 10, 25, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
GAIN = [[x, v(x)] for x in XS]
LOSS = [[-x, v(-x)] for x in XS]
VC = (10, 128, 580, 400)
LA = dict(w=600, h=660, intro='The prospect-theory value curve, drawn point by point, and the coin flip most people refuse. Press play, or step through.', steps=[
    step('You do not feel your balance. You feel gains and losses from a reference point, and for a trader that is usually the entry price. Zero is where you came in.',
         icon('you', 'person', 30, 6, 0.6, None, 'you'),
         chip('ref', 235, 34, 'zero = your entry price', 'amber')),
    step('Draw how it feels. Across: dollars won or lost from the entry. Up: how good or bad that feels. The kink is at zero, where you came in.',
         chart('vc', VC, 'How a gain or loss feels', [-1000, 1000], [-1050, 470], [[400, '+400'], [0, '0'], [-500, '−500'], [-1000, '−1000']],
               [[-1000, '−$1,000'], [-500, '−$500'], [0, '0'], [500, '+$500'], [1000, '+$1,000']], zero=True, pl=62, pr=40),
         series('y0', 'vc', [[0, -1050], [0, 470]], None, width=2, ms=400)),
    step('Gains first. The curve rises but keeps flattening: +$500 feels like 237, and +$1,000 only 437, not double. Each extra dollar of gain feels smaller.',
         series('gain', 'vc', GAIN, 'green', ms=1300),
         dot('g500', 'vc', [500, v(500)], '+$500 → 237', 'green', dx=0, dy=-18),
         dot('g1k', 'vc', [1000, v(1000)], '437', 'green', dx=-8, dy=-16, anchor='end')),
    step('Now losses. If a loss hurt only as much as a gain pleased, the curve would follow the dashed mirror. It drops far more steeply, by λ = 2.25 in Tversky and Kahneman\'s 1992 estimate: −$500 feels like −534, 2.25 times the +237 of the same-sized gain.',
         series('mir', 'vc', [[-x, -v(x)] for x in XS], None, dash=True, ms=600),
         cnote('mirl', 'vc', [-770, -100], 'if a loss hurt\nlike a gain', None, 16),
         series('loss', 'vc', LOSS, 'red', width=3.6, ms=1500),
         dot('l500', 'vc', [-500, v(-500)], '−$500 → −534', 'red', dx=12, dy=4, anchor='start'),
         dict(pulse='you'), note('ouch', 122, 100, 'ouch!', 'red', 18, anchor='start')),
    step('Here is a coin flip: heads you win $150, tails you lose $100. On average it pays +$25 a flip, so a robot that only cared about averages would play.',
         icon('coin', 'coin', 430, 6, 0.6, 'amber', 'heads +$150\ntails −$100', sym='?', lsize=17)),
    step('On your curve, +$150 feels like 82 and −$100 feels like −129. Half of one plus half of the other is about −24: the flip feels like a loss, so you turn it down.',
         dict(hide='ouch'),
         dot('g150', 'vc', [150, v(150)], '+82', 'green', dx=0, dy=-18),
         dot('l100', 'vc', [-100, v(-100)], '−129', 'red', dx=-12, dy=16, anchor='end'),
         chip('m100', 470, 84, '−$100', 'red'),
         move('m100', 140, 84, 1100),
         note('no', 300, 108, 'no thanks!', 'red', 20)),
    step('Ask people what win on heads would make them play a flip that loses $100, and most say about $200. That gap is loss aversion.',
         dict(hide='m100'),
         chip('w200', 290, 84, 'win $200? then OK', 'green'),
         dict(hide='no')),
    step('The curve bends your choices too. Gains: a sure +$500 feels like 237; a 50% chance of +$1,000 is half of 437, about 218. You bank the sure thing: safe when winning.',
         box('gf', 10, 540, 283, 110, 'sure +$500: 237\n50% of +$1,000: 218\n→ take the sure gain', 'green', size=18)),
    step('Losses, same sizes: a sure −$500 feels like −534; a 50% chance of −$1,000 is half of −982, about −491. The gamble feels less bad, so you take it: reckless when losing.',
         dot('l1k', 'vc', [-1000, v(-1000)], '−982', 'red', dx=12, dy=-14, anchor='start'),
         box('lf', 307, 540, 283, 110, 'sure −$500: −534\n50% of −$1,000: −491\n→ take the gamble', 'red', size=18)),
    step('Same sizes, same odds, the opposite choice. On a trading screen that is banking winners early and moving the stop on losers: exactly backwards. The fix is to decide your exits before the curve gets a vote.',
         dict(pulse='lf'), dict(pulse='gf')),
])


BOARD = dict(name='lossav', lesson='loss-aversion-prospect-theory', title='The loss-aversion curve, drawn step by step', cfg=LA,
             before='  <h3>3. Probabilities get bent too</h3>',
             deck_after=3)
