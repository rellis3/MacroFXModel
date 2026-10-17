from ._wb import *
import random

# ── White's Reality Check & Hansen's SPA (institutional-reality-check-spa) ────
# The lesson's toy panel: five strategies, 16 periods, benchmark 0. Means, Sharpes and
# t-stats are computed from the lesson's own numbers. The replay path and the null
# histogram are a real stationary block bootstrap (mean block 2, one shared index path,
# every series demeaned), 5,000 replicates with a fixed seed; p-values match the
# lesson's (A ≈ 0.003, C ≈ 0.24).
S = {
    'A': [0.90, 0.10, 0.70, -0.20, 0.60, 1.00, 0.00, 0.80, 0.30, 0.90, -0.10, 0.70, 0.40, 0.20, 0.90, 0.30],
    'B': [0.30, -0.80, 0.60, -0.40, -0.10, 0.90, -0.60, 0.20, -0.90, 0.50, 0.70, -0.30, -0.50, 0.40, -0.20, 0.10],
    'C': [0.30, 0.00, 0.40, -0.10, 0.20, 0.35, -0.05, 0.25, 0.10, 0.30, -0.15, 0.20, 0.25, 0.05, 0.30, 0.10],
    'D': [-1.20, 1.50, -0.80, 0.90, -1.60, 1.10, -0.40, 1.30, -1.00, 0.60, -1.40, 0.80, -0.60, 1.00, -1.10, 0.70],
    'E': [-0.50, 0.60, -0.90, 0.30, -0.20, -0.70, 0.40, -0.60, 0.10, -0.80, 0.50, -0.30, -0.60, 0.20, -0.40, 0.30],
}
K, T = 'ABCDE', 16
M = {k: sum(v) / T for k, v in S.items()}
assert abs(M['A'] - 0.46875) < 1e-9 and abs(M['C'] - 0.15625) < 1e-9

def _path(r, l=2):
    i, out = r.randrange(T), []
    for _ in range(T):
        out.append(i)
        i = r.randrange(T) if r.random() < 1 / l else (i + 1) % T
    return out
def _rep(path):
    return {k: sum(S[k][i] for i in path) / T - M[k] for k in K}

P1 = _path(random.Random(5))
R1 = _rep(P1)
B1 = max(R1, key=R1.get)
_blocks, cur = [], [P1[0]]
for a, b in zip(P1, P1[1:]):
    if b == (a + 1) % T: cur.append(b)
    else: _blocks.append(cur); cur = [b]
_blocks.append(cur)
PATH_TXT = ' · '.join(' '.join(str(i + 1) for i in bl) for bl in _blocks)

NB = 5000
_rh = random.Random(34)
REPS = [max(_rep(_path(_rh)).values()) for _ in range(NB)]
pA = (1 + sum(r >= M['A'] for r in REPS)) / (1 + NB)
pC = (1 + sum(r >= M['C'] for r in REPS)) / (1 + NB)
assert 0.0025 < pA < 0.0035 and 0.23 < pC < 0.26, (pA, pC)
W = 0.025
HIST = []
for j in range(-2, 22):
    lo = j * W
    n = sum(lo <= r < lo + W for r in REPS)
    if n: HIST.append([round(lo + W / 2, 4), round(100 * n / NB, 2), '', 'blue'])

def f2(x): return ('+' if x >= 0 else '−') + f'{abs(x):.2f}'

CFG = dict(w=600, h=860, intro='Five strategies tried on the same 16 periods. Is the winner a real edge, or just the luckiest of five? Replay history with no edge anywhere and see. Press play, or step through.', steps=[
    step('You tried five strategy variants on the same 16 periods: A momentum, B mean-reversion, C carry, D breakout and E contrarian. The benchmark is zero. Which one, if any, has a real edge?',
         icon('crowd', 'crowd', 20, 10, 0.95, 'blue', '5 strategies', lsize=18),
         note('setup', 360, 50, '16 periods each · benchmark = 0', None, 19),
         note('q', 360, 84, 'real edge, or the luckiest of five?', 'amber', 19)),
    step('Their average return per period: A 0.469%, C 0.156%, B and D about zero, E −0.163%. Momentum wins. But the best of five always wins something.',
         chart('means', (10, 132, 580, 222), 'Mean return per period, %', [0.4, 5.6], [-0.3, 0.62],
               [[0.4, '0.4'], [0, '0']], [[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D'], [5, 'E']], zero=True, pl=46, pr=14),
         dict(bars='mb', chart='means', data=[[1, 0.469, '0.469', 'green'], [2, -0.006, '', None], [3, 0.156, '0.156', 'amber'],
                                               [4, -0.013, '', None], [5, -0.163, '−0.163', 'red']], bw=46, ms=1100)),
    step("The trap: carry's Sharpe is 0.93, close to momentum's 1.19, only because its swings happened to be tiny (0.168 against 0.394). Its average is a third of momentum's.",
         cnote('sh', 'means', [3, 0.42], "C's Sharpe 0.93  vs  A's 1.19", 'amber', 18, anchor='start', dx=-40)),
    step("The Reality Check builds a world with no edge at all. Subtract each strategy's own average from its returns. Now every strategy averages exactly zero.",
         dict(dim='mb'), dict(dim='sh'),
         box('null', 60, 372, 480, 50, "returns − own average  →  every edge = 0", 'blue', size=19)),
    step('Reshuffle the 16 periods in short chunks, about 2 periods long on average. One reshuffle is used for all five strategies at once, so streaks and shared bad weeks stay together.',
         note('orig', 300, 446, 'one replay, period order (· = new chunk):', None, 18),
         note('rep', 300, 474, PATH_TXT, 'purple', 18)),
    step(f'Average each strategy over the reshuffled periods and keep the best of the five. That is one replay of how good the winner looks from luck alone. This replay: {B1} at {f2(R1[B1])}%.',
         note('one', 300, 504, ' · '.join(f'{k} {f2(R1[k])}' for k in K) + f'  →  best {f2(R1[B1])}', 'purple', 17)),
    step(f'Do it {NB:,} times. The replay winners pile up between about 0 and 0.2%. That pile is what the best of five edge-free strategies looks like.',
         chart('null', (10, 530, 580, 214), f'Best of five, {NB:,} no-edge replays (% of replays)', [-0.06, 0.56], [0, 18],
               [[5, '5%'], [10, '10%'], [15, '15%']], [[0, '0'], [0.2, '0.2'], [0.4, '0.4%']], pl=46, pr=14),
         dict(bars='hist', chart='null', data=HIST, bw=19, ms=1200)),
    step(f"Momentum's real 0.469% sits far out in the thin right tail. Only about {round(pA * 1000)} replays in 1,000 got that far: p ≈ {pA:.3f}. A real edge, on this sample.",
         dot('pa', 'null', [M['A'], 0.4], f'A 0.469\np ≈ {pA:.3f}', 'green', dy=-62, size=18)),
    step(f"Carry's 0.156% sits inside the pile. About one replay in four does at least as well: p ≈ {pC:.2f}. The tempting Sharpe was noise.",
         dot('pc', 'null', [M['C'], 9.5], f'C 0.156\np ≈ {pC:.2f}', 'amber', dx=58, dy=-12, size=18)),
    step("Hansen's SPA test keeps the replay but divides each strategy by its own noise, and keeps clear losers (E, t = −1.30) at their own bad average. Losers stop padding the null: momentum's p falls to about 0.0002.",
         box('spa', 10, 758, 285, 92, "SPA: scale by own noise,\nbench clear losers\nA: p ≈ 0.0002", 'green', size=18)),
    step('One rule no test can enforce: show it every strategy you tried. Run fifty, test only your best five, and the p-value is worthless.',
         box('honest', 305, 758, 285, 92, 'tried 50, tested 5?\nthe p-value is worthless', 'red', size=18)),
])


BOARD = dict(name='institutional_reality_check_spa', lesson='institutional-reality-check-spa',
             title="The Reality Check: replay history with no edge anywhere", cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=11)
