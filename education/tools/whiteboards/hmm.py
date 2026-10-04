from ._wb import *
from math import cos, exp, pi, sin, sqrt
import random

# ── Hidden Markov models: weather you can't see (hidden-markov-models) ────────
# The lesson's worked example: two hidden states, trending (state 1) and choppy (state 2),
# A = [[0.70, 0.30], [0.15, 0.85]] -> expected durations 1/0.30 = 3.33 and 1/0.15 = 6.67 days,
# long-run shares 0.15/0.45 = 33.3% and 0.30/0.45 = 66.7%. Emissions as the lesson describes
# them: trending = a small drift with lower variance, choppy = near-zero drift with higher
# variance. The weather picture is the lesson's own (hidden weather, visible clothes); here
# calm = trending, stormy = choppy, matching the visual guide's "calm / volatile" wording.
# The price path, the hidden path and the inference line are ILLUSTRATIVE: a 60-day path
# simulated from the lesson's A with made-up emission parameters (below) from a fixed seed,
# then run through the forward filter P(S_t | O_1..t) with those same parameters.
A = [[0.70, 0.30], [0.15, 0.85]]
assert all(abs(sum(r) - 1) < 1e-12 for r in A)
DUR = [1 / (1 - A[0][0]), 1 / (1 - A[1][1])]
PI = [A[1][0] / (A[0][1] + A[1][0]), A[0][1] / (A[0][1] + A[1][0])]
assert [round(d, 2) for d in DUR] == [3.33, 6.67] and [round(p, 3) for p in PI] == [0.333, 0.667]

MU, SG = [0.5, 0.0], [0.3, 1.3]      # illustrative emission parameters (calm, stormy)
N = 48
def simulate(seed):
    r = random.Random(seed); s = [1]; o = []
    for t in range(1, N): s.append(s[-1] if r.random() < A[s[-1]][s[-1]] else 1 - s[-1])
    for st in s: o.append(r.gauss(MU[st], SG[st]))
    return s, o
def npdf(x, m, sd): return exp(-0.5 * ((x - m) / sd) ** 2) / (sd * sqrt(2 * pi))
def filt(o):
    out, p = [], PI[:]
    for t, x in enumerate(o):
        if t: p = [p[0] * A[0][j] + p[1] * A[1][j] for j in (0, 1)]      # predict with the switching odds
        p = [p[j] * npdf(x, MU[j], SG[j]) for j in (0, 1)]               # update on today's return
        z = sum(p); p = [v / z for v in p]; out.append(p[0])
    return out
def runs(s):
    out, a = [], 0
    for t in range(1, len(s) + 1):
        if t == len(s) or s[t] != s[a]: out.append((s[a], a, t - 1)); a = t
    return out
def good(seed):
    s, o = simulate(seed); rs = runs(s)
    if not (5 <= len(rs) <= 8 and all(e - b >= 2 for _, b, e in rs)): return False
    if any(st == 1 and abs(sum(o[b + 1:e + 1])) > 2.5 for st, b, e in rs): return False   # storms that go nowhere
    q = filt(o)   # keep a path where the filter reads mostly right and is sometimes very sure
    return sum((q[t] > 0.5) == (s[t] == 0) for t in range(N)) >= 0.85 * N and max(q) > 0.88
SEED = next(k for k in range(1, 5000) if good(k))
STATE, OBS = simulate(SEED)
PROB = filt(OBS)
PRICE = [0.0]
for x in OBS[1:]: PRICE.append(PRICE[-1] + x)
RUNS = runs(STATE)
PLO, PHI = min(PRICE) - 1.5, max(PRICE) + 1.5

# Two days to label: a confident one inside a calm stretch, and a less sure one near a switch.
calm_days = [t for t in range(N) if STATE[t] == 0]
HI = max(calm_days, key=lambda t: PROB[t])
MID = min((t for t in calm_days if 0.6 <= PROB[t] <= 0.85 and t != HI), key=lambda t: abs(PROB[t] - 0.72), default=None)

BIG = max((t for t in range(1, N) if STATE[t] == 1 and t > N // 2), key=lambda t: abs(OBS[t]))
QUIET = max((t for t in range(1, N) if STATE[t] == 0), key=lambda t: PROB[t])
PC = (10, 236, 580, 250)     # what you see: the price
QC = (10, 504, 580, 250)     # what you infer: P(calm)

def _sun(cx, cy, r=30, tone='amber'):
    circ = [[round(cx + r * cos(2 * pi * k / 28), 1), round(cy + r * sin(2 * pi * k / 28), 1)] for k in range(29)]
    ops = [dict(line='sun0', points=circ, tone=tone, width=3, ms=500)]
    for k in range(8):
        a = 2 * pi * k / 8
        ops.append(dict(line=f'sun{k + 1}', points=[[round(cx + (r + 8) * cos(a), 1), round(cy + (r + 8) * sin(a), 1)],
                                                      [round(cx + (r + 20) * cos(a), 1), round(cy + (r + 20) * sin(a), 1)]], tone=tone, width=3, ms=120))
    return ops
def _cloud(x, y, tone='blue'):
    """A storm cloud with rain; (x, y) = top-left of a ~120 x 90 box."""
    def arc(cx, cy, r, a0, a1, n=10):
        return [[round(x + cx + r * cos(a0 + (a1 - a0) * i / n), 1), round(y + cy + r * sin(a0 + (a1 - a0) * i / n), 1)] for i in range(n + 1)]
    outline = arc(26, 40, 20, pi / 2, 3 * pi / 2) + arc(52, 22, 22, pi, 2 * pi) + arc(86, 30, 18, 1.25 * pi, 2 * pi) + arc(98, 44, 14, 1.5 * pi, 2.5 * pi)
    outline.append(outline[0])
    ops = [dict(line='cl0', points=outline, tone=tone, width=3, ms=700)]
    for k, dx in enumerate((12, 28, 94, 110)):
        ops.append(dict(line=f'rain{k}', points=[[x + dx, y + 66], [x + dx - 8, y + 84]], tone=tone, width=2.6, ms=120))
    return ops
SUN, CLOUD = _sun(120, 92), _cloud(410, 52)
SUN_IDS = [o['line'] for o in SUN]; CLOUD_IDS = [o['line'] for o in CLOUD]

def _pp(): return [[t, round(v, 3)] for t, v in enumerate(PRICE)]
def _qq(): return [[t, round(100 * v, 1)] for t, v in enumerate(PROB)]
def _bands(ch, lo, hi, tag):
    return [dict(gap=f'{tag}{i}', chart=ch, top=[[b - 0.5 if b else 0, hi], [e + 0.5 if e < N - 1 else N - 1, hi]],
                 bot=[[b - 0.5 if b else 0, lo], [e + 0.5 if e < N - 1 else N - 1, lo]],
                 tone='amber' if st == 0 else 'blue', op=0.16) for i, (st, b, e) in enumerate(RUNS)]

HMM = dict(w=600, h=880, intro='Two kinds of weather you never get to see, only the returns they leave behind. The lesson\'s switching odds, step by step.', steps=[
    step('A market has hidden moods. Picture them as weather. Calm is the lesson\'s trending regime: a small steady drift, low noise. Stormy is choppy: near-zero drift, bigger swings.',
         *SUN, note('sunl', 120, 178, 'calm · trending', 'amber', 19),
         *CLOUD, icon('bolt', 'bolt', 452, 110, 0.36, 'amber'), note('cll', 472, 178, 'stormy · choppy', 'blue', 19)),
    step('Weather is sticky. A calm day is followed by another calm day 70% of the time and turns stormy 30% of the time. A stormy day stays stormy 85% of the time and clears 15% of the time. Each row adds up to 100%.',
         note('ax', 196, 70, '', None, 10), note('bx', 396, 70, '', None, 10),
         note('ay', 396, 116, '', None, 10), note('by', 196, 116, '', None, 10),
         arrow('ax', 'bx', '30%', bend=-16, size=19), arrow('ay', 'by', '15%', bend=-16, size=19),
         note('st1', 120, 22, 'stays 70%', 'amber', 18), note('st2', 472, 22, 'stays 85%', 'blue', 18)),
    step('That stickiness sets how long each spell lasts: 1 ÷ (1 − 0.70) ≈ 3.3 days of calm, 1 ÷ (1 − 0.85) ≈ 6.7 days of storm. Over the long run it is stormy two-thirds of the time (66.7%) and calm one-third (33.3%).',
         note('d1', 120, 204, '≈ 3.3 days · 1/3 of the time', 'amber', 17),
         note('d2', 472, 204, '≈ 6.7 days · 2/3 of the time', 'blue', 17)),
    step('The catch: you never see the weather. All you get is the price, day after day. This is the line a real chart hands you (illustrative path).',
         *[dict(dim=k) for k in SUN_IDS + CLOUD_IDS + ['bolt']],
         note('q1', 120, 92, '?', None, 44), note('q2', 466, 92, '?', None, 44),
         chart('px', PC, 'What you see: the price (illustrative)', [0, N - 1], [PLO, PHI], [], [[0, 'day 1'], [N - 1, f'day {N}']], pl=16, pr=34),
         series('p', 'px', _pp(), None, ms=1800)),
    step('Each day\'s move is a clue, like the coat in a stranger\'s photo. A big swing is much likelier in a storm, a quiet step up likelier in calm. Informative, never proof: calm can throw a big move too.',
         dot('big', 'px', [BIG, round(PRICE[BIG], 3)], 'big swing', 'blue', dx=0, dy=22 if OBS[BIG] < 0 else -16),
         dot('qt', 'px', [QUIET, round(PRICE[QUIET], 3)], 'quiet step up', 'amber', dx=10, dy=14, anchor='start'),
         dict(pulse='p')),
    step('So infer it, Bayes-style, one day at a time. Start from the long-run 33% chance of calm. Each morning, roll yesterday\'s belief forward with the switching odds; each evening, update it on the day\'s return. Only data up to today is used.',
         chart('pq', QC, 'What you infer: chance it is calm, using data up to that day', [0, N - 1], [0, 100],
               [[0, '0%'], [50, '50%'], [100, '100%']], [[0, 'day 1'], [N - 1, f'day {N}']], pl=50, pr=34),
         series('q', 'pq', _qq(), 'amber', ms=2200)),
    step('Now lift the curtain on this made-up example. The shading is the weather that really generated the path. The inference mostly tracks it, a little late at each switch because it needs a few days of clues, and a quiet day inside a storm can make it wobble.',
         *_bands('px', PLO, PHI, 'bx'), *_bands('pq', 0, 100, 'bq')),
    step(f'What comes out is a probability, not a label. On day {HI + 1} the model is {round(100 * PROB[HI])}% sure it is calm' +
         (f'; on day {MID + 1}, only {round(100 * PROB[MID])}%.' if MID is not None else '.') +
         ' Squash both into one "calm" flag and you throw away exactly what a sizing rule could use.',
         dot('hi', 'pq', [HI, round(100 * PROB[HI], 1)], f'{round(100 * PROB[HI])}%', 'amber', dx=0, dy=-16),
         *([dot('mid', 'pq', [MID, round(100 * PROB[MID], 1)], f'{round(100 * PROB[MID])}%', 'amber', dx=-10, dy=-4, anchor='end')] if MID is not None else [])),
    step('Use this day-by-day "filtered" line live. A Viterbi labelling of history looks at the whole series, future included, so a backtest that trades on those labels is peeking ahead.',
         box('live', 10, 770, 285, 100, 'live: data up to today', 'green', sub='filtered P(state)', size=19),
         box('peek', 305, 770, 285, 100, 'Viterbi: whole series', 'red', sub='uses the future: not live', size=19)),
    step('And it can only pick among the weathers it has learned. In 2022 stocks and bonds fell together, after twenty years in which bonds had hedged stocks. A model trained on 2000 to 2021 had no state for that.',
         dict(hide='live'), dict(hide='peek'),
         box('y22', 10, 770, 580, 100, '2022: S&P 500 about −18%, US bonds about −13%', 'red', sub='a state the training years never showed', size=19),
         icon('warn', 'warn', 534, 248, 0.4, 'red')),
])


BOARD = dict(name='hmm', lesson='hidden-markov-models', title='Weather you can\'t see: inferring the hidden regime', cfg=HMM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: 2022, when stocks and bonds fell together</h2>',
             deck_after=10)
