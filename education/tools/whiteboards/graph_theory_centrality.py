from ._wb import *

# ── Three centralities on one toy network (graph-theory-centrality) ──────────
# The lesson's network: two fully linked triangles (EUR, GBP, CHF) and (AUD, NZD, CAD),
# joined by JPY, which links only to EUR and AUD. 7 nodes, 8 edges.
# Degree: EUR = AUD = 3, the rest 2.  Raw betweenness: JPY 9, EUR = AUD 8, the rest 0.
# Eigenvector (leading eigenvalue 2.343): EUR = AUD 1.00, JPY 0.85, the rest 0.74.
# The chart is power iteration from all-ones, rescaled so the top node is 1 each round
# (computed below with the lesson's adjacency matrix).
N = ['EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'NZD', 'CAD']
A = [[0, 1, 1, 1, 0, 0, 0], [1, 0, 1, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0],
     [0, 0, 0, 1, 0, 1, 1], [0, 0, 0, 0, 1, 0, 1], [0, 0, 0, 0, 1, 1, 0]]
POS = dict(EUR=(130, 45), GBP=(55, 160), CHF=(205, 160), JPY=(300, 100),
           AUD=(470, 45), NZD=(395, 160), CAD=(545, 160))
HW, HH = 42, 31   # node box half-width / half-height


def _power(rounds):
    x, out = [1.0] * 7, [[1.0] * 7]
    for _ in range(rounds):
        y = [sum(A[i][j] * x[j] for j in range(7)) for i in range(7)]
        m = max(y); x = [v / m for v in y]; out.append(x)
    return out
PW = _power(20)
JPY_S = [[k, round(v[3], 3)] for k, v in enumerate(PW)]
GBP_S = [[k, round(v[1], 3)] for k, v in enumerate(PW)]
assert abs(PW[-1][3] - 0.855) < 0.002 and abs(PW[-1][1] - 0.745) < 0.002


def _clip(a, b, pad=3):
    """Point where the segment from a's centre towards b leaves a's box."""
    (ax, ay), (bx, by) = POS[a], POS[b]
    dx, dy = bx - ax, by - ay
    t = min((HW + pad) / abs(dx) if dx else 9e9, (HH + pad) / abs(dy) if dy else 9e9)
    return [round(ax + dx * t, 1), round(ay + dy * t, 1)]
def edge(a, b, tone=None, width=3, id=None):
    d = dict(line=id or f'e{a}{b}', points=[_clip(a, b), _clip(b, a)], width=width, ms=500)
    if tone: d['tone'] = tone
    return d
def node(n, tone='blue', sub=''):
    x, y = POS[n]
    return box(n, x - HW, y - HH, 2 * HW, 2 * HH, n, tone, sub=sub, size=20)
def subs(vals): return [dict(sub=n, text=v) for n, v in zip(N, vals)]


CHART = (10, 270, 580, 262)

GRAPH = dict(w=600, h=650, intro="The lesson's seven-node network, and three different ways to ask which node matters most. Press play, or step through.", steps=[
    step('Start with three currencies that all move together: EUR, GBP and CHF. Each dot is a node, each line an edge. Every pair is linked, so they form a triangle. (A teaching network: plausible in shape, not measured.)',
         node('EUR'), node('GBP'), node('CHF'),
         edge('EUR', 'GBP'), edge('EUR', 'CHF'), edge('GBP', 'CHF')),
    step('A second cluster, the commodity bloc: AUD, NZD and CAD. Another fully linked triangle.',
         node('AUD', 'green'), node('NZD', 'green'), node('CAD', 'green'),
         edge('AUD', 'NZD'), edge('AUD', 'CAD'), edge('NZD', 'CAD')),
    step('Now JPY. It links to exactly two nodes: EUR on one side and AUD on the other. That is the only bridge between the clusters. Seven nodes, eight edges.',
         node('JPY', 'amber'),
         edge('EUR', 'JPY', 'amber', 4), edge('JPY', 'AUD', 'amber', 4)),
    step('Measure one, degree: just count the links. EUR and AUD have three each. Everyone else, JPY included, has two. By this count JPY looks ordinary.',
         *subs(['3', '2', '2', '2', '3', '2', '2']),
         note('verdict', 300, 238, 'Degree: EUR and AUD win, 3 links each', 'blue', 19)),
    step('Measure two, betweenness: send a message from GBP to NZD by the shortest route. It must go GBP, EUR, JPY, AUD, NZD. There is no other way across.',
         dict(hide='verdict'),
         *[edge(a, b, 'red', 6, id=f'p{i}') for i, (a, b) in enumerate([('GBP', 'EUR'), ('EUR', 'JPY'), ('JPY', 'AUD'), ('AUD', 'NZD')])]),
    step('The same is true for all nine pairs that cross between the clusters: every one of them runs through JPY. EUR and AUD each sit on eight shortest routes. GBP, CHF, NZD and CAD sit on none.',
         *subs(['8', '0', '0', '9', '8', '0', '0']),
         dict(pulse='JPY'),
         note('verdict', 300, 238, 'Betweenness: JPY wins alone, on 9 routes', 'amber', 19)),
    step('Measure three, eigenvector: you matter if your neighbours matter. Give every node a score of 1. Each round, a node\'s new score is the sum of its neighbours\' scores, rescaled so the top node is 1.',
         *[dict(hide=f'p{i}') for i in range(4)], dict(hide='verdict'),
         *subs(['1', '1', '1', '1', '1', '1', '1'])),
    step('After one round the scores are just degree over three: EUR and AUD 1, everyone else 0.67. But JPY\'s two neighbours are the two biggest nodes, so in the next round it gets more back than GBP does.',
         *subs(['1', '0.67', '0.67', '0.67', '1', '0.67', '0.67']),
         chart('pw', CHART, 'Eigenvector score, round by round', [0, 20], [0.6, 1.05],
               [[0.7, '0.7'], [0.8, '0.8'], [0.9, '0.9'], [1.0, '1.0']],
               [[0, '0'], [5, '5'], [10, '10'], [15, '15'], [20, '20 rounds']], pl=48, pr=96),
         series('gbp', 'pw', GBP_S, 'blue', ms=1800, label='GBP 0.74', lat=[20, 0.745], ldx=6, ldy=8, lanchor='start', lsize=17),
         series('jpy', 'pw', JPY_S, 'amber', ms=1800, label='JPY 0.85', lat=[20, 0.855], ldx=6, ldy=-8, lanchor='start', lsize=17)),
    step('The scores swing, then settle. This repeated multiply-and-rescale is power iteration, and where it settles is the leading eigenvector of the adjacency matrix, with eigenvalue about 2.343.',
         *subs(['1.00', '0.74', '0.74', '0.85', '1.00', '0.74', '0.74']),
         dot('jend', 'pw', [20, 0.855], '', 'amber'), dot('gend', 'pw', [20, 0.745], '', 'blue')),
    step('Final scores: EUR and AUD 1.00, JPY 0.85, the four triangle-only nodes 0.74. Degree tied JPY with them. Eigenvector lifts JPY above them, because of who it is linked to, not how many.',
         note('verdict', 300, 238, 'Eigenvector: EUR and AUD 1.00, then JPY 0.85', 'purple', 19)),
    step('Same seven nodes, same eight edges, three answers. Most links: EUR and AUD. The bridge everything crosses: JPY. Closest to the important nodes: EUR and AUD, with JPY third. Name the measure that fits your question.',
         box('w1', 10, 552, 180, 88, 'most links\nEUR · AUD', 'blue', size=19),
         box('w2', 210, 552, 180, 88, 'the bridge\nJPY', 'amber', size=19),
         box('w3', 410, 552, 180, 88, 'best-connected\nEUR · AUD', 'purple', size=19)),
])


BOARD = dict(name='graph_theory_centrality', lesson='graph-theory-centrality',
             title='Three centralities, one network, three winners', cfg=GRAPH,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=10)
