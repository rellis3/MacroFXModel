from ._wb import *

# ── VaR breaks sub-additivity, CVaR does not (coherent-risk-measures) ─────────
# The lesson's worked example: two independent bonds, each defaults with q = 4% and loses $100.
# p = 95%, tail 5%.
#   alone: P(L > 0) = 4% <= 5%  -> VaR = $0;  CVaR = (0.04*100 + 0.01*0)/0.05 = $80
#   pair:  P(0) = 92.16%, P(100) = 7.68%, P(200) = 0.16%
#          P(L > 0) = 7.84% > 5% -> VaR = $100
#          CVaR = (0.0016*200 + 0.0484*100)/0.05 = $103.20  <= $160
q = 0.04
p_any = 1 - (1 - q) ** 2                   # 0.0784
p_both = q * q                             # 0.0016
cvar1 = (q * 100 + (0.05 - q) * 0) / 0.05  # 80
cvar2 = (p_both * 200 + (0.05 - p_both) * 100) / 0.05   # 103.2
assert abs(p_any - 0.0784) < 1e-12 and abs(cvar1 - 80) < 1e-9 and abs(cvar2 - 103.2) < 1e-9

ODDS = (10, 130, 580, 250)
CMP = (10, 440, 580, 250)
CRM = dict(w=600, h=700, intro='Two bonds that each look safe on their own, one risk limit, and what happens when you put them in the same book. Press play, or step through.', steps=[
    step('Two corporate bonds, A and B. Each has a 4% chance of defaulting over the horizon, and on default it loses its full $100. Otherwise it loses nothing. They are independent.',
         icon('a', 'scroll', 30, 8, 0.6, 'blue', 'bond A\n4% · −$100', lsize=17),
         icon('b', 'scroll', 180, 8, 0.6, 'blue', 'bond B\n4% · −$100', lsize=17)),
    step('The risk rule: 95% VaR, the smallest loss you exceed at most 5% of the time. Anything with a 5% chance or less sits in the tail the limit ignores.',
         box('rule', 360, 16, 220, 90, '95% VaR', 'amber', sub='tail = 5%', size=20)),
    step('Bond A alone: the chance of losing anything is 4%, under the 5% line. So its 95th-percentile outcome is "no default", and VaR(A) = $0.',
         chart('odds', ODDS, 'Chance of losing anything (%)', [0.4, 3.6], [0, 10],
               [[0, '0'], [5, '5%'], [10, '10%']], [[1, 'A alone'], [2, 'B alone'], [3, 'A + B']], pl=52),
         series('cut', 'odds', [[0.4, 5], [3.6, 5]], 'amber', dash=True, ms=500, label='5% tail', lat=[3.6, 5], ldx=-4, ldy=-12, lanchor='end', lsize=16),
         dict(bars='o1', chart='odds', data=[[1, 4, '', 'blue']], bw=60, ms=800),
         cnote('o1l', 'odds', [1, 2], '4%', None, 19),
         note('va', 300, 412, 'VaR(A) = $0', 'blue', 19)),
    step('Bond B is identical: 4%, VaR(B) = $0. Added up, the two bonds carry $0 of measured risk.',
         dict(bars='o2', chart='odds', data=[[2, 4, '', 'blue']], bw=60, ms=800),
         cnote('o2l', 'odds', [2, 2], '4%', None, 19),
         dict(hide='va'),
         note('sum0', 300, 412, 'VaR(A) + VaR(B) = $0 + $0 = $0', 'blue', 19)),
    step('Now hold both. Three outcomes: no default 92.16%, exactly one 7.68%, both 0.16%. The chance of losing anything is 7.84%, over the 5% line.',
         dict(bars='o3', chart='odds', data=[[3, 7.84, '7.84%', 'red']], bw=60, ms=900),
         dict(pulse='rule')),
    step('So the pair\'s 95th-percentile outcome is "one default": VaR(A + B) = $100. Two "riskless" bonds, combined, show $100 of risk. That breaks sub-additivity.',
         dict(hide='sum0'),
         note('viol', 300, 412, 'VaR(A + B) = $100  >  $0 + $0', 'red', 20)),
    step('Same bonds, CVaR instead: average the worst 5% of outcomes. For one bond that is the 4% default at $100 plus 1% of "no default" at $0: (0.04 × 100 + 0.01 × 0) ÷ 0.05 = $80. Two bonds: $160.',
         chart('cmp', CMP, 'Measured risk ($)', [0.4, 4.6], [0, 180],
               [[0, '$0'], [100, '$100'], [160, '$160']], [[1, 'VaR sum'], [2, 'VaR A+B'], [3, 'CVaR sum'], [4, 'CVaR A+B']], pl=58),
         dict(bars='c1', chart='cmp', data=[[1, 0, '$0', 'blue'], [2, 100, '$100', 'red']], bw=56, ms=900),
         dict(bars='c3', chart='cmp', data=[[3, 160, '$160', 'green']], bw=56, ms=900)),
    step('For the pair, the worst 5% is 0.16% at $200 plus 4.84% at $100: (0.0016 × 200 + 0.0484 × 100) ÷ 0.05 = $103.20. Below $160. Combining lowers the risk, as diversification should.',
         dict(bars='c4', chart='cmp', data=[[4, 103.2, '$103.20', 'green']], bw=56, ms=900)),
    step('The reason: VaR reads one point, the edge of the tail, so it jumps when the joint chance crosses 5%. CVaR averages the whole tail, so it cannot be fooled by where that edge lands. It passes all four of Artzner\'s rules.',
         dict(hide='viol'),
         note('why', 300, 412, 'VaR: a point · CVaR: the tail average', 'green', 20)),
    step('One limit on all of it: coherence is a property of the formula. In 2012 a new VaR model roughly halved the London Whale book\'s risk with no position cut, and losses passed $6 billion. A CVaR fed by the same broken model would have been wrong too.',
         dict(hide='rule'),
         icon('warn', 'warn', 430, 8, 0.6, 'red', 'the model\nunder it?', lsize=17)),
])


BOARD = dict(name='coherent_risk_measures', lesson='coherent-risk-measures',
             title='Two safe bonds, one unsafe VaR, drawn step by step', cfg=CRM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the London Whale, 2012</h2>',
             deck_after=9)
