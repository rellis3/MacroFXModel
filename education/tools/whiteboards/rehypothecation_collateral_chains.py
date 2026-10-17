from ._wb import *

# ── One asset, many claims (rehypothecation-collateral-chains) ────────────────
# Numbers are the lesson's own: $10m posted A → B → C → D, three stacked claims, ≈3× multiplier;
# SEC Rule 15c3-3 caps re-use at ≈140% of the customer's debit balance (the $5m debit below is
# illustrative, so the cap is 1.4 × 5 = $7m); LBIE (UK rules, no equivalent cap) 2008;
# MF Global: ≈$6.3bn euro-bond book, bankruptcy 31 Oct 2011, ≈$1.6bn customer shortfall.

XS = [20, 175, 330, 485]
NAMES = ['A: hedge fund', 'B: prime broker', 'C: funder', 'D: next funder']
TONES = ['blue', 'green', 'amber', 'red']

REHYPO = dict(w=600, h=740, intro='One pool of securities, passed down a chain of promises. Then what the rules allow, and two failures that tested them. Press play, or step through.', steps=[
    step('A hedge fund, A, owns $10 million of securities. It needs margin for a leveraged position, so it will post them to its prime broker.',
         icon('a', 'piggy', XS[0], 14, 0.75, 'blue', NAMES[0], sym='$', lsize=16),
         chip('sec', XS[0] + 38, 140, '$10m bonds', 'purple')),
    step('A posts the $10 million to its prime broker, B. A now has a claim on B: give the securities back when I close my position.',
         icon('b', 'bank', XS[1], 14, 0.75, 'green', NAMES[1], lsize=16),
         move('sec', XS[1] + 38, 140, 1100),
         arrow('a', 'b', 'claim', 'blue')),
    step('B is allowed to rehypothecate. It re-pledges the same securities to a funder, C, to raise its own cash in repo. Now B has a claim on C.',
         icon('c', 'bank', XS[2], 14, 0.75, 'amber', NAMES[2], lsize=16),
         move('sec', XS[2] + 38, 140, 1100),
         arrow('b', 'c', 'claim', 'green')),
    step('C, if its own agreement allows, re-pledges them again to D. Still one set of securities. Three promises are now stacked on top of it.',
         icon('d', 'bank', XS[3], 14, 0.75, 'red', NAMES[3], lsize=16),
         move('sec', XS[3] + 38, 140, 1100),
         arrow('c', 'd', 'claim', 'amber')),
    step('Count them. The securities that exist: $10 million. The claims resting on them: A on B, B on C, C on D, $30 million in all. A re-use multiplier of about 3.',
         box('real', 20, 178, 270, 70, 'securities that exist', 'green', sub='$10m', size=19),
         box('claims', 310, 178, 270, 70, 'claims resting on them', 'amber', sub='$0m', size=19),
         dict(count='claims', **{'from': 0, 'to': 30, 'dp': 0, 'pre': '$', 'suf': 'm', 'ms': 1400})),
    step('Now C fails. It cannot hand the securities back up to B, and the pledge D was relying on is in doubt. One break, felt in both directions at once.',
         dict(cross='c'), dict(pulse='b'), dict(pulse='d'),
         note('both', 300, 276, '← B is owed by C  ·  D relied on C\'s pledge →', 'red', 18)),
    step('How much may a broker re-use? In the US, SEC Rule 15c3-3 caps it at about 140% of what the customer owes the broker. If A owed B $5 million (illustrative), B could re-use about $7 million, not all $10 million. The UK rules that applied to Lehman\'s London arm in 2008 had no equivalent cap.',
         chart('cap', (10, 300, 580, 210), 'US cap on re-use, $m (illustrative debit)', [0.4, 3.6], [0, 11.5],
               [[0, '0'], [5, '5'], [10, '10']], [[1, 'posted'], [2, 'owed by A'], [3, 'US cap 140%']], pl=40),
         dict(bars='capb', chart='cap', data=[[1, 10, '$10m', 'purple'], [2, 5, '$5m', 'blue'], [3, 7, '$7m', 'green']], bw=64, ms=1100)),
    step('2008: Lehman Brothers International (Europe) went into UK administration. Client assets it had re-used under the looser UK rules were tied up, and clients who thought their collateral was simply held found themselves waiting as creditors.',
         note('lbie', 300, 534, 'Lehman, 2008: "held" collateral turned out to be "used"', 'amber', 18)),
    step('2011: MF Global, a large US futures broker with a euro-bond book of about $6.3 billion, ran short of cash and failed on 31 October. Customer accounts that should have been segregated came up about $1.6 billion short.',
         chart('mf', (10, 556, 580, 150), 'MF Global, $ billion', [0.4, 2.6], [0, 7.5],
               [[0, '0'], [3, '3'], [6, '6']], [[1, 'euro-bond book'], [2, 'customer shortfall']], pl=40),
         dict(bars='mfb', chart='mf', data=[[1, 6.3, '≈ $6.3bn', 'amber'], [2, 1.6, '≈ $1.6bn', 'red']], bw=90, ms=1100)),
    step('The lesson of both: "my collateral" is a legal claim, not a thing in a drawer. Know what your broker may do with it, cap the re-use, and spread collateral across firms.',
         note('end', 300, 724, 'a claim on paper, not a thing in a drawer', 'green', 19)),
])


BOARD = dict(name='rehypothecation_collateral_chains', lesson='rehypothecation-collateral-chains',
             title='One asset, many claims, drawn step by step', cfg=REHYPO,
             before='  <div class="tl-section-mark"><span>Section 06</span></div>',
             deck_after=4)
