from ._wb import *
from itertools import combinations
from math import dist

# ── k-means and the dendrogram (clustering-market-structure) ──────────────────
# The lesson's worked example: six points A(1,1) B(1,2) C(2,2) D(6,6) E(7,7) F(6,8), k = 2,
# deliberately bad start with both centroids at A and B. Everything below is computed:
# WCSS of each split, the best WCSS for k = 1..6 (exhaustive), and an average-linkage
# dendrogram on plain Euclidean distance.
P = dict(A=(1, 1), B=(1, 2), C=(2, 2), D=(6, 6), E=(7, 7), F=(6, 8))


def mean(g): return (sum(P[n][0] for n in g) / len(g), sum(P[n][1] for n in g) / len(g))
def wcss(groups): return sum(sum((P[n][0] - mean(g)[0]) ** 2 + (P[n][1] - mean(g)[1]) ** 2 for n in g) for g in groups)
def sq(p, q): return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2


def _parts(s, k):
    if k == 1: yield [s]; return
    if len(s) < k: return
    for p in _parts(s[1:], k - 1): yield [[s[0]]] + p
    for p in _parts(s[1:], k):
        for i in range(len(p)): yield p[:i] + [[s[0]] + p[i]] + p[i + 1:]


BEST = [round(min(wcss(p) for p in _parts(list(P), k)), 2) for k in range(1, 7)]   # 84.17 4.0 2.33 1.33 0.5 0
W_BAD = round(wcss([['A'], ['B', 'C', 'D', 'E', 'F']]), 1)                          # 61.2
M2 = mean(['B', 'C', 'D', 'E', 'F'])                                                 # (4.4, 5.0)
M1F, M2F = mean(['A', 'B', 'C']), mean(['D', 'E', 'F'])                              # (1.33,1.67) (6.33,7.0)
assert BEST[1] == 4.0 and W_BAD == 61.2 and M2 == (4.4, 5.0)

# average-linkage merges
cl = {n: [n] for n in P}; MERGES = []
def _d(a, b): return sum(dist(P[x], P[y]) for x in a for y in b) / (len(a) * len(b))
while len(cl) > 1:
    a, b = min(combinations(cl, 2), key=lambda ab: _d(cl[ab[0]], cl[ab[1]]))
    MERGES.append((a, b, round(_d(cl[a], cl[b]), 2))); cl[a + b] = cl.pop(a) + cl.pop(b)
H = {m[0] + m[1]: m[2] for m in MERGES}   # AB 1.0, CAB 1.21, DE 1.41, FDE 1.71, root 7.35
X = dict(A=1, B=2, C=3, D=4, E=5, F=6)
assert [m[2] for m in MERGES] == [1.0, 1.21, 1.41, 1.71, 7.35]
f2 = lambda v: f'{v:.2f}'
SC = (10, 10, 330, 320)


LAB = dict(A=(-10, 6, 'end'), B=(-10, -6, 'end'), C=(10, -10, 'start'), D=(10, 12, 'start'), E=(10, -10, 'start'), F=(-10, -4, 'end'))


def pt(n, tone, id=None):
    dx, dy, an = LAB[n]
    return dot(id or ('p' + n + (tone or '')), 'sc', list(P[n]), n, tone, dx=dx, dy=dy, anchor=an)


KM = dict(w=600, h=730, intro='The lesson\'s six points, k-means from a deliberately bad start, then the same points built into a tree. Press play, or step through.', steps=[
    step('Six points with no labels: A, B and C bottom left, D, E and F top right. Nobody has told the algorithm which belong together. It has to find out.',
         chart('sc', SC, 'The six points', [0, 8.5], [0, 9], [[0, '0'], [4, '4'], [8, '8']], [[0, '0'], [4, '4'], [8, '8']], pl=34),
         *[pt(n, None) for n in P]),
    step('Ask for k = 2, and start badly on purpose: both centroids inside the left-hand group, μ₁ on A and μ₂ on B.',
         dot('m1', 'sc', [1, 1], 'μ₁', 'blue', r=9, dx=14, dy=8, anchor='start'),
         dot('m2', 'sc', [1, 2], 'μ₂', 'amber', r=9, dx=14, dy=-12, anchor='start')),
    step('Assign: every point joins its nearest centroid. Only A is closest to μ₁. B, C, D, E and F all join μ₂. A clearly wrong split.',
         pt('A', 'blue'), *[pt(n, 'amber') for n in 'BCDEF']),
    step(f'Update: move each centroid to the mean of its points. μ₁ stays on A. μ₂ jumps to the mean of its five points, ({M2[0]:.1f}, {M2[1]:.1f}). This split has a within-cluster sum of squares, WCSS, of {W_BAD}.',
         dict(hide='m2'),
         series('jump', 'sc', [[1, 2], list(M2)], 'amber', dash=True, ms=700),
         dot('m2b', 'sc', list(M2), 'μ₂', 'amber', r=9, dx=14, dy=2, anchor='start'),
         box('wc', 360, 14, 230, 84, 'WCSS', 'purple', sub=f'{W_BAD}', size=20)),
    step(f'Assign again. B is {f2(sq(P["B"], (1, 1)))} from μ₁ but {f2(sq(P["B"], M2))} from μ₂ (squared distances), so it switches. So does C ({f2(sq(P["C"], (1, 1)))} against {f2(sq(P["C"], M2))}). Now the split is A, B, C against D, E, F.',
         pt('B', 'blue'), pt('C', 'blue')),
    step(f'Update again: μ₁ moves to ({M1F[0]:.2f}, {M1F[1]:.2f}), μ₂ to ({M2F[0]:.2f}, {M2F[1]:.1f}). WCSS falls to {BEST[1]:.1f}. Assign once more and nothing changes, so it has converged: the obvious split, despite the bad start.',
         dict(hide='m1'), dict(hide='m2b'), dict(hide='jump'),
         dot('m1c', 'sc', [round(M1F[0], 2), round(M1F[1], 2)], 'μ₁', 'blue', r=9, dx=14, dy=10, anchor='start'),
         dot('m2c', 'sc', [round(M2F[0], 2), round(M2F[1], 2)], 'μ₂', 'amber', r=9, dx=-14, dy=10, anchor='end'),
         dict(count='wc', **{'from': W_BAD, 'to': BEST[1], 'dp': 1, 'ms': 1200})),
    step(f'How many groups? The best WCSS for k = 1 to 6 is {BEST[0]:.1f}, {BEST[1]:.1f}, {BEST[2]:.2f}, {BEST[3]:.2f}, {BEST[4]:.1f} and 0. It always falls as k grows, so you look for the bend: here a sharp elbow at k = 2. On real data the bend is rarely this clear.',
         chart('el', (360, 112, 230, 218), 'Best WCSS by k', [0.4, 6.6], [0, 95], [[0, '0'], [50, '50']], [[k, str(k)] for k in range(1, 7)], pl=34),
         dict(bars='elb', chart='el', data=[[k + 1, BEST[k], f'{BEST[k]:.0f}' if k == 0 else (f'{BEST[k]:.1f}' if BEST[k] else '0'), 'green' if k == 1 else 'purple'] for k in range(6)], bw=22, ms=1100)),
    step(f'Hierarchical clustering needs no k up front. Start with every point on its own and keep merging the two closest groups (average linkage). A and B merge first, at distance {H["AB"]:.1f}. C joins them at {H["CAB"]:.2f}.',
         chart('dg', (10, 350, 580, 262), 'Dendrogram: merge distance', [0.4, 6.6], [0, 8], [[0, '0'], [2, '2'], [4, '4'], [6, '6'], [8, '8']], [[X[n], n] for n in P], pl=40),
         series('ab', 'dg', [[1, 0], [1, H['AB']], [2, H['AB']], [2, 0]], 'blue', ms=700),
         series('cab', 'dg', [[1.5, H['AB']], [1.5, H['CAB']], [3, H['CAB']], [3, 0]], 'blue', ms=700)),
    step(f'On the right, D and E merge at {H["DE"]:.2f} and F joins at {H["FDE"]:.2f}. The two groups only meet at the very top, at {H["CABFDE"]:.2f}. The long gap before that last merge is the structure.',
         series('de', 'dg', [[4, 0], [4, H['DE']], [5, H['DE']], [5, 0]], 'amber', ms=700),
         series('fde', 'dg', [[4.5, H['DE']], [4.5, H['FDE']], [6, H['FDE']], [6, 0]], 'amber', ms=700),
         series('root', 'dg', [[2.25, H['CAB']], [2.25, H['CABFDE']], [5.25, H['CABFDE']], [5.25, H['FDE']]], 'purple', ms=900)),
    step('Choose k only at the end, by cutting the tree. A cut at height 4 crosses two branches: the same two groups k-means found. Cut lower and you get more groups, all from the same tree.',
         series('cut', 'dg', [[0.5, 4], [6.5, 4]], 'green', dash=True, ms=600),
         cnote('cutl', 'dg', [6.5, 4], 'cut → 2 groups', 'green', 17, anchor='end', dy=-14)),
    step('The catch. Both methods return groups from any data at all, even pure noise. A clean split proves only that the algorithm did its job. Check the groups against something it never saw: known dates, sectors, other evidence.',
         box('noise', 20, 630, 270, 84, 'it finds k groups\nin anything', 'red', size=19),
         box('check', 310, 630, 270, 84, 'check against what\nit never saw', 'green', size=19)),
])


BOARD = dict(name='clustering_market_structure', lesson='clustering-market-structure',
             title='k-means from a bad start, then the tree', cfg=KM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
