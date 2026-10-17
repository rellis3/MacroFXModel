from ._wb import *

# ── DebtRank-style cascade on the lesson's four banks (systemic-risk-networks) ──
# Impact factors W[i][j] = share of bank i's capital lost if bank j fully defaults (the
# lesson's illustrative matrix). Bank C defaults: h_C = 1. Rule (the lesson's simplified one):
#   h_i(t+1) = min(1, h_i(t) + sum_j W_ij [h_j(t) - h_j(t-1)])
# Round 1: A 0.10, B 0.40, D 0.30. Round 2 for A: 0.10 + 0.3 x 0.40 = 0.22.
# Settles at A 0.24, B 0.48, D 0.32 (sum of the rounded values 1.04, the lesson's figure).
# The chart paths are computed below with every term of the rule included.
NAMES = 'ABCD'
W = [[0, .3, .1, 0], [.2, 0, .4, .1], [0, .2, 0, .5], [.1, 0, .3, 0]]


def _cascade(rounds=8):
    prev, h, out = [0.0] * 4, [0, 0, 1.0, 0], [[0, 0, 1.0, 0]]
    for _ in range(rounds):
        d = [h[j] - prev[j] for j in range(4)]
        new = [min(1.0, h[i] + sum(W[i][j] * d[j] for j in range(4))) for i in range(4)]
        new[2] = 1.0
        prev, h = h, new; out.append(h)
    return out
CAS = _cascade()
assert [round(CAS[1][i], 2) for i in (0, 1, 3)] == [0.10, 0.40, 0.30]
assert [round(CAS[-1][i], 2) for i in (0, 1, 3)] == [0.24, 0.48, 0.32]
PATH = {n: [[t, round(h[i], 3)] for t, h in enumerate(CAS)] for i, n in enumerate(NAMES) if n != 'C'}


def cnt(id, a, b, ms=900): return dict(count=id, **{'from': a, 'to': b, 'dp': 2, 'ms': ms})


LINES = (10, 396, 372, 236)
BARS = (394, 396, 196, 236)

SRN = dict(w=600, h=650, intro="Four banks, one default, and the lesson's cascade rule run round by round. Press play, or step through.", steps=[
    step('Four banks, A to D. Each one has lent to, or bought protection from, some of the others. (Illustrative numbers, not real institutions.)',
         icon('C', 'bank', 30, 150, 0.7, 'blue', 'Bank C', lsize=18),
         icon('A', 'bank', 265, 14, 0.7, 'blue', 'Bank A', lsize=18),
         icon('B', 'bank', 265, 262, 0.7, 'blue', 'Bank B', lsize=18),
         icon('D', 'bank', 500, 170, 0.7, 'blue', 'Bank D', lsize=18)),
    step('An impact factor says how much of a bank\'s own capital it would lose if a counterparty failed completely. B\'s impact factor on C is 0.4: if C fails, B loses 40% of its capital on that exposure alone.',
         arrow('C', 'B', '0.4', 'red', id='cb')),
    step('A is less exposed to C, at 0.1. D sits in between, at 0.3. The arrows show which way distress would flow.',
         arrow('C', 'A', '0.1', 'red', id='ca'), arrow('C', 'D', '0.3', 'red', id='cd')),
    step('Give every bank a distress dial: 0 is healthy, 1 is defaulted. All four start at 0. Then Bank C fails outright: its dial goes to 1.',
         box('hA', 345, 22, 112, 56, 'distress', 'amber', sub='0.00', size=18),
         box('hB', 345, 276, 112, 56, 'distress', 'amber', sub='0.00', size=18),
         box('hD', 472, 284, 118, 56, 'distress', 'amber', sub='0.00', size=18),
         box('hC', 10, 262, 120, 56, 'distress', 'red', sub='0.00', size=18),
         cnt('hC', 0, 1, 700), dict(cross='C')),
    step('Round 1. Each bank takes its impact factor times C\'s full distress. A goes to 0.10, B to 0.40, D to 0.30.',
         cnt('hA', 0, 0.10), cnt('hB', 0, 0.40), cnt('hD', 0, 0.30),
         dict(pulse='cb')),
    step('Round 2. Now the weakened banks pass a smaller hit to each other. A is exposed to B at 0.3, and B just took on 0.40 of distress. So A picks up 0.3 times 0.40, which is 0.12 more: A reaches 0.22.',
         dict(dim='ca'), dict(dim='cb'), dict(dim='cd'),
         arrow('hB', 'hA', '0.3', 'amber', bend=-20, id='ba'),
         cnt('hA', 0.10, 0.22)),
    step('Only the newest distress moves on each round, so the same loss is not counted twice. The hits shrink each round, and after about seven or eight rounds nothing new is moving.',
         chart('ln', LINES, 'Distress by round', [0, 8], [0, 0.6],
               [[0, '0'], [0.2, '0.2'], [0.4, '0.4']], [[0, '0'], [2, '2'], [4, '4'], [6, '6'], [8, '8']], pl=48, pr=56),
         series('pB', 'ln', PATH['B'], 'red', ms=1300, label='B 0.48', lat=[8, 0.481], ldx=4, ldy=-14, lanchor='end', lsize=17),
         series('pD', 'ln', PATH['D'], 'amber', ms=1300, label='D 0.32', lat=[8, 0.324], ldx=4, ldy=-14, lanchor='end', lsize=17),
         series('pA', 'ln', PATH['A'], 'blue', ms=1300, label='A 0.24', lat=[8, 0.244], ldx=4, ldy=16, lanchor='end', lsize=17)),
    step('Settled: A 0.24, B 0.48, D 0.32. B ends most distressed, because it had the biggest direct exposure to C.',
         cnt('hA', 0.22, 0.24), cnt('hB', 0.40, 0.48), cnt('hD', 0.30, 0.32)),
    step('Add it up. The distress induced in the other three banks is 0.24 + 0.48 + 0.32 = 1.04. That is more than the shock that started it, 1.00. The network did not just share the loss out. It added to it.',
         chart('br', BARS, 'Shock vs. induced', [0.3, 2.7], [0, 1.25],
               [[0, '0'], [0.5, '0.5'], [1.0, '1.0']], [[1, 'shock'], [2, 'induced']], pl=40, pr=8),
         dict(bars='bb', chart='br', data=[[1, 1.0, '1.00', 'red'], [2, 1.04, '1.04', 'amber']], bw=46, ms=1000)),
    step('That one number, total distress induced, is the DebtRank of Bank C. Run it for every bank and you can rank them by the damage their failure would do, not by their size.',
         dict(pulse='hC')),
    step('September 2008: AIG had sold credit protection to many big banks at once, so it was a node with large impact factors into all of them. On 16 September the New York Fed agreed to lend it up to $85 billion. It was judged too interconnected to fail.',
         dict(hide='ba'), dict(hide='ca'), dict(hide='cb'), dict(hide='cd'),
         arrow('C', 'A', None, 'red', id='x1'), arrow('C', 'B', None, 'red', id='x2'), arrow('C', 'D', None, 'red', id='x3'),
         note('aig', 70, 342, 'C = AIG', 'red', 20)),
])


BOARD = dict(name='systemic_risk_networks', lesson='systemic-risk-networks',
             title='One default, four banks: the cascade round by round', cfg=SRN,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: AIG, September 2008</h2>',
             deck_after=6)
