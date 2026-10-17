from ._wb import *

# ── Forward vs reverse stress test on two desks that share one factor (stress-testing-scenario-analysis) ──
# The lesson's worked example: $10M book, Strategy A $6M short-vol equity carry (beta 30% per unit of
# the risk-off factor s), Strategy B $4M high-yield credit carry (beta 15%).
#   Loss(s) = 6*0.30*s + 4*0.15*s = 1.8s + 0.6s = 2.4s ($M); s = 1 ("a 2008-style quarter") -> $2.4M, 24%
#   Reverse: Y* = $5M -> s* = 5 / 2.4 = 2.083
# LDI 2022 facts from the lesson: mini-budget 23 Sept, forced gilt selling fed the move,
# Bank of England temporary long-gilt purchases from 28 Sept, ended 14 Oct.
A, B = 6 * 0.30, 4 * 0.15
PER = A + B
SSTAR = 5 / PER
assert abs(PER - 2.4) < 1e-12 and round(SSTAR, 2) == 2.08

CH = (10, 236, 580, 300)
ST = dict(w=600, h=720, intro='A $10 million book, two desks that look unrelated, and two ways to stress-test it: forward and backward. Press play, or step through.', steps=[
    step('A $10 million book with two desks. Desk A runs $6M of short-volatility equity carry. Desk B runs $4M of high-yield credit carry. Different asset classes, different instruments.',
         box('a', 15, 20, 200, 84, 'Desk A · equity', 'blue', sub='$6M', size=19),
         box('b', 385, 20, 200, 84, 'Desk B · credit', 'blue', sub='$4M', size=19)),
    step('The forward test, desk by desk. A 2008-style quarter for equity volatility costs Desk A 30% of $6M: $1.8M. A credit widening costs Desk B 15% of $4M: $0.6M. Each loss is survivable on its own.',
         dict(count='a', **{'from': 6, 'to': 1.8, 'dp': 1, 'pre': '−$', 'suf': 'M', 'ms': 1000}),
         dict(count='b', **{'from': 4, 'to': 0.6, 'dp': 1, 'pre': '−$', 'suf': 'M', 'ms': 1000})),
    step('Now the reverse question. The risk committee sets the loss it cannot accept: $5M, half the book. What shock would get there?',
         note('ystar', 300, 160, 'unacceptable: Y* = $5M', 'red', 21)),
    step('Solving backward exposes what the desks share: both are driven by the same risk-off factor s, a broad collapse in risk appetite. One bridge that both of them cross.',
         icon('f', 'bolt', 272, 22, 0.55, 'amber', 'risk-off s', lsize=17),
         arrow('f', 'a', '30%', 'amber'),
         arrow('f', 'b', '15%', 'amber')),
    step('So the losses add along one line: Loss(s) = $1.8M × s + $0.6M × s = $2.4M × s. Two desks, one risk.',
         chart('ch', CH, 'Loss ($M) vs shock size s', [0, 3], [0, 7.5],
               [[2.4, '2.4'], [5, '5']], [[0, '0'], [1, 's = 1'], [2, '2'], [3, '3']], pl=50, pr=20),
         series('line', 'ch', [[0, 0], [3, 7.2]], 'purple', ms=1200),
         cnote('ll', 'ch', [2.56, 2.0], 'Loss = $2.4M × s', 'purple', 16)),
    step('Forward: pick a shock and read the loss. One 2008-style quarter, s = 1, costs $2.4M: 24% of the book. Painful, survivable.',
         series('fw', 'ch', [[1, 0], [1, 2.4], [0, 2.4]], 'blue', dash=True, ms=900),
         dot('d1', 'ch', [1, 2.4], '$2.4M', 'blue', dx=14, dy=10, anchor='start')),
    step('Reverse: start at the $5M loss and read across to the line, then down. The shock that breaks the book is s* = 5 ÷ 2.4 ≈ 2.08.',
         series('rv', 'ch', [[0, 5], [SSTAR, 5], [SSTAR, 0]], 'red', dash=True, ms=1200),
         dot('d2', 'ch', [SSTAR, 5], 's* ≈ 2.08', 'red', dx=12, dy=8, anchor='start')),
    step('That is the finding. Not an exotic catastrophe: about twice an ordinary bad quarter, along one factor, takes out half the book. A desk-by-desk forward test called this book diversified.',
         dict(pulse='f'),
         note('find', 300, 566, 'two "different" desks = one bet', 'red', 20)),
    step('September 2022, for real. UK pension funds\' leveraged LDI hedges kept collateral buffers sized to past gilt moves: a forward test. On 23 September the mini-budget sent long yields up further and faster than that history.',
         dict(hide='find'),
         icon('gov', 'govt', 20, 590, 0.55, 'amber', 'mini-budget\n23 Sept', lsize=16),
         icon('buf', 'shield', 200, 590, 0.55, 'red', 'buffer\nused up', lsize=16),
         arrow('gov', 'buf', None, 'red')),
    step('Funds sold gilts to meet collateral calls, which pushed yields up again: the shock fed on the positions being stressed, so the loss line steepened instead of staying straight (red curve, illustrative).',
         icon('sell', 'down', 370, 590, 0.55, 'red', 'forced gilt\nselling', lsize=16),
         arrow('buf', 'sell', None, 'red'),
         series('steep', 'ch', [[0, 0], [1, 2.6], [1.6, 4.6], [2.0, 6.6], [2.3, 7.5]], 'red', ms=1100, label='feedback', lat=[2.3, 7.5], ldx=8, ldy=8, lanchor='start', lsize=16)),
    step('On 28 September the Bank of England bought long-dated gilts to break the loop, and stopped on 14 October. A reverse test asks the question the buffer never did: which move uses me up, and who else is selling then?',
         icon('boe', 'bank', 505, 590, 0.55, 'green', 'BoE buys\n28 Sept', sym='£', lsize=16),
         arrow('sell', 'boe', None, 'green')),
])


BOARD = dict(name='stress_testing_scenario_analysis', lesson='stress-testing-scenario-analysis',
             title='Two desks, one factor: forward and reverse stress tests', cfg=ST,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: UK gilts and LDI, September 2022</h2>',
             deck_after=7)
