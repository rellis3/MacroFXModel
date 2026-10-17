from ._wb import *
from math import sqrt

# ── Kruskal's algorithm on the lesson's five-currency basket (correlation-networks-mst) ──
# Correlations are the lesson's plausible (not measured) matrix. Distances use Mantegna's
# d = sqrt(2(1 - rho)), computed below. Kruskal keeps EUR-GBP, EUR-CHF, EUR-AUD, JPY-AUD
# (total 3.50) and skips GBP-CHF and GBP-AUD (each would close a loop).
# March 2020 thought experiment from the lesson: every rho -> 0.9 gives every d = 0.45.
RHO = {('EUR', 'GBP'): 0.80, ('EUR', 'CHF'): 0.70, ('GBP', 'CHF'): 0.60, ('EUR', 'AUD'): 0.50,
       ('GBP', 'AUD'): 0.45, ('JPY', 'AUD'): 0.40, ('CHF', 'AUD'): 0.35, ('EUR', 'JPY'): 0.30,
       ('GBP', 'JPY'): 0.25, ('CHF', 'JPY'): 0.20}
D = {k: sqrt(2 * (1 - r)) for k, r in RHO.items()}
ORDER = sorted(D, key=D.get)
assert [k for k in ORDER][:6] == [('EUR', 'GBP'), ('EUR', 'CHF'), ('GBP', 'CHF'), ('EUR', 'AUD'), ('GBP', 'AUD'), ('JPY', 'AUD')]
TREE = [('EUR', 'GBP'), ('EUR', 'CHF'), ('EUR', 'AUD'), ('JPY', 'AUD')]
assert abs(sum(D[e] for e in TREE) - 3.50) < 0.01
CRISIS = sqrt(2 * (1 - 0.9))   # 0.447

POS = dict(GBP=(60, 70), EUR=(200, 70), CHF=(60, 210), AUD=(200, 210), JPY=(300, 300))
HW, HH = 38, 24


def _clip(a, b, pad=3):
    (ax, ay), (bx, by) = POS[a], POS[b]
    dx, dy = bx - ax, by - ay
    t = min((HW + pad) / abs(dx) if dx else 9e9, (HH + pad) / abs(dy) if dy else 9e9)
    return [round(ax + dx * t, 1), round(ay + dy * t, 1)]
def edge(a, b, tone=None, width=2, id=None, ms=500):
    d = dict(line=id or f'e{a}{b}', points=[_clip(a, b), _clip(b, a)], width=width, ms=ms)
    if tone: d['tone'] = tone
    return d
def node(n, tone='blue'):
    x, y = POS[n]
    return box(n, x - HW, y - HH, 2 * HW, 2 * HH, n, tone, size=20)
def _lab(k): return f'{k[0]}–{k[1]}  {D[k]:.2f}'
LY = lambda i: 52 + 25 * i
def item(i): return note(f'l{i}', 368, LY(i), _lab(ORDER[i]), None, 18, 'start')
def mark(i, ok):
    return note(f'm{i}', 588, LY(i), '✓' if ok else '✗ loop', 'green' if ok else 'red', 18, 'end')
def keep(i): return [edge(*ORDER[i], 'green', 5, id=f't{i}', ms=700), mark(i, True), dict(pulse=f'l{i}')]


CH = (10, 350, 580, 232)
CALM = [[i + 1, round(D[e], 2), f'{D[e]:.2f}', 'blue'] for i, e in enumerate(TREE)]

MST = dict(w=600, h=620, intro="Five currencies, ten correlations, and the four-edge backbone hiding inside them. Press play, or step through.", steps=[
    step("Five currencies with a plausible correlation matrix (illustrative, not measured). Every pair has a correlation, so the full graph has ten edges. Even at five nodes, it is a tangle.",
         *[node(n, 'amber' if n == 'JPY' else 'blue') for n in POS],
         *[edge(a, b, None, 1.5, id=f'f{i}', ms=250) for i, (a, b) in enumerate(RHO)]),
    step("Correlation says how alike two things are. A tree needs how far apart. Mantegna's transform flips it: d equals the square root of 2 times (1 minus rho). EUR–GBP at 0.80 becomes 0.63. CHF–JPY at 0.20 becomes 1.26.",
         note('fx', 300, 340, 'd = √(2(1 − ρ)):   ρ 1 → 0,   ρ 0 → 1.41,   ρ −1 → 2', 'purple', 18)),
    step("Kruskal's algorithm, step one: sort all ten distances, shortest first.",
         note('lh', 368, 22, 'sorted distances', 'purple', 18, 'start'),
         *[item(i) for i in range(10)]),
    step('Take the shortest edge, EUR–GBP at 0.63. Nothing is connected yet, so it cannot close a loop. Keep it.',
         *keep(0)),
    step('Next, EUR–CHF at 0.77. CHF is new to the tree. Keep it.',
         *keep(1)),
    step('Next, GBP–CHF at 0.89. But GBP and CHF already reach each other through EUR. Adding it would close a loop and connect nothing new. Skip it, even though it is short.',
         mark(2, False), dict(dim='l2')),
    step('EUR–AUD at 1.00 brings AUD in. Keep it. Then GBP–AUD at 1.05 would close another loop. Skip.',
         *keep(3), mark(4, False), dict(dim='l4')),
    step('JPY–AUD at 1.10 connects the last node, JPY. Five nodes, four edges: the tree is done, total length 3.50. The other four edges are never needed.',
         *keep(5), *[dict(dim=f'l{i}') for i in range(6, 10)],
         *[dict(hide=f'f{i}') for i in range(10)], dict(hide='fx'),
         note('tot', 300, 340, 'minimum spanning tree: 4 edges, total 3.50', 'green', 19)),
    step('Now read the shape. EUR touches three of the four edges: it is the hub. JPY, weakly correlated with everything, does not join the hub at all. It hangs off AUD, its least-weak link.',
         dict(pulse='EUR'), dict(pulse='JPY')),
    step("Here are the tree's four edges in a calm market. Now March 2020: forced sellers dumped even Treasuries and gold, and correlations converged. The lesson's thought experiment: push every correlation to 0.9.",
         dict(hide='tot'),
         chart('ch', CH, 'Tree edge distances', [0.4, 4.6], [0, 1.3],
               [[0, '0'], [0.5, '0.5'], [1.0, '1.0']],
               [[1, 'EUR–GBP'], [2, 'EUR–CHF'], [3, 'EUR–AUD'], [4, 'JPY–AUD']], pl=46, pr=14),
         dict(bars='calm', chart='ch', data=CALM, bw=60, ms=900)),
    step('At 0.9, every distance is 0.45, shorter than even the tightest calm edge (0.63). The hub-and-outlier shape is gone: the diversifier moved in, just when the book needed it to stay away. A calm tree is not a crisis tree.',
         series('cr', 'ch', [[0.5, round(CRISIS, 3)], [4.5, round(CRISIS, 3)]], 'red', dash=True, ms=800),
         note('crl', 300, 604, 'every ρ → 0.9: every d = 0.45 (dashed line)', 'red', 19)),
])


BOARD = dict(name='correlation_networks_mst', lesson='correlation-networks-mst',
             title="Building the minimum spanning tree, edge by edge", cfg=MST,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the dash for cash, March 2020</h2>',
             deck_after=9)
