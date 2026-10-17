from ._wb import *
import math, random

# ── Isolation Forest and autoencoders (anomaly-detection-isolation-autoencoders) ──
# Data: the 14 crowd points and 1 outlier of the lesson's own "isolating" chart, rescaled to a
# 0-10 grid (illustrative synthetic data). The splits drawn are real random isolation-tree
# splits (random feature, random threshold between the node's min and max), from fixed seeds.
# Average path lengths are over 20,000 random trees; c(n) and s = 2^(-E[h]/c(n)) use the
# lesson's formulas. Autoencoder numbers are the Visual Guide's worked tick
# (x = 2.10, 1.40, 0.90; rebuilt 2.05, 1.35, 2.80; mean squared error 1.205).
_SVG = [(110, 150), (125, 165), (140, 140), (118, 130), (155, 160), (130, 175), (145, 155), (105, 170),
        (160, 145), (135, 120), (150, 130), (115, 155), (170, 165), (125, 145)]
CROWD = [(round((x - 30) / 26, 2), round((270 - y) / 23.5, 2)) for x, y in _SVG]
ODD = (round((255 - 30) / 26, 2), round((270 - 60) / 23.5, 2))      # (8.65, 8.94)
TGT = CROWD[13]                                                       # (3.65, 5.32)
ALL = CROWD + [ODD]


def _path(target, rnd):
    cur, box, out = ALL[:], [0, 10, 0, 10], []
    while len(cur) > 1:
        f = rnd.randrange(2); lo = min(p[f] for p in cur); hi = max(p[f] for p in cur)
        if lo == hi: continue
        v = round(rnd.uniform(lo, hi), 2)
        out.append((f, v, tuple(box)))
        if target[f] < v: box[2 * f + 1] = v
        else: box[2 * f] = v
        cur = [p for p in cur if (p[f] < v) == (target[f] < v)]
    return out


S_ODD = _path(ODD, random.Random(2))     # 2 splits
S_TGT = _path(TGT, random.Random(12))    # 6 splits
assert len(S_ODD) == 2 and len(S_TGT) == 6
_R = random.Random(12345); N = 20000
E_ODD = sum(len(_path(ODD, _R)) for _ in range(N)) / N    # about 1.6
E_TGT = sum(len(_path(TGT, _R)) for _ in range(N)) / N    # about 6.2
def c(n): return 2 * (math.log(n - 1) + 0.5772) - 2 * (n - 1) / n
C15 = c(15)                                              # about 4.57
def s(e, cn): return 2 ** (-e / cn)
SC_ODD, SC_TGT = s(E_ODD, C15), s(E_TGT, C15)            # about 0.78 and 0.39
XHAT = [(2.10, 2.05), (1.40, 1.35), (0.90, 2.80)]
MSE = sum((a - b) ** 2 for a, b in XHAT) / 3              # 1.205


def _seg(split, dom):
    """A split line inside its node's box, clipped to the chart's domain."""
    f, v, (x0, x1, y0, y1) = split
    cx = lambda t: min(max(t, dom[0]), dom[1]); cy = lambda t: min(max(t, dom[2]), dom[3])
    return [[v, cy(y0)], [v, cy(y1)]] if f == 0 else [[cx(x0), cy(v)], [cx(x1), cy(v)]]


LD = (0, 10, 0, 10); RD = (2.5, 6.5, 3.5, 7.0)
CROWD_R = [p for p in CROWD if RD[0] <= p[0] <= RD[1] and RD[2] <= p[1] <= RD[3]]

AN = dict(w=600, h=800, intro='Two ways to spot "this doesn\'t look like the rest": cut the data at random and count the cuts, or compress and rebuild it and measure the miss. Press play, or step through.', steps=[
    step('Fifteen ticks described by two features (illustrative data). Fourteen sit in a crowd. One sits far out on both features at once.',
         chart('L', (10, 10, 285, 282), 'Isolate the outlier', [0, 10], [0, 10], [[0, '0'], [5, '5'], [10, '10']], [[0, '0'], [5, '5'], [10, '10']], pl=34),
         *[dot(f'l{i}', 'L', list(p), '', 'blue', r=4) for i, p in enumerate(CROWD)],
         dot('lodd', 'L', list(ODD), 'outlier', 'red', r=6, dx=-10, dy=-12, anchor='end')),
    step(f'Isolation Forest asks random questions. Pick a feature at random, then a cut at random between its smallest and largest value. First cut: feature 1 at {S_ODD[0][1]}. The outlier lands on the side with only a few points.',
         series('ls1', 'L', _seg(S_ODD[0], LD), 'amber', dash=True, ms=600)),
    step(f'Second cut: feature 2 at {S_ODD[1][1]}, inside that side. The outlier is now alone. Path length: 2 cuts. Few and different means quick to wall off.',
         series('ls2', 'L', _seg(S_ODD[1], LD), 'purple', dash=True, ms=600),
         cnote('l2n', 'L', [7.0, 6.6], 'alone after 2', 'red', 18)),
    step('Now try to isolate an ordinary point buried in the crowd (zoomed in on the right). The first three random cuts barely thin out its neighbours.',
         chart('R', (305, 10, 285, 282), 'Isolate a crowd point (zoom)', [RD[0], RD[1]], [RD[2], RD[3]], [[4, '4'], [6, '6']], [[3, '3'], [5, '5']], pl=34),
         *[dot(f'r{i}', 'R', list(p), '', 'blue', r=4) for i, p in enumerate(CROWD_R) if p != TGT],
         dot('rt', 'R', list(TGT), 'target', 'green', r=6, dx=-10, dy=-14, anchor='end'),
         *[series(f'rs{i}', 'R', _seg(S_TGT[i], RD), 'amber', dash=True, ms=450) for i in range(3)]),
    step('Three more cuts, each in a smaller box, before the target is finally alone. Path length: 6 cuts, three times as many as the outlier needed.',
         *[series(f'rs{i}', 'R', _seg(S_TGT[i], RD), 'purple', dash=True, ms=450) for i in range(3, 6)],
         cnote('r6n', 'R', [4.5, 3.9], 'alone after 6', 'green', 18)),
    step(f'One tree can be lucky, so build many and average. Over 20,000 random trees on these points, the outlier takes {E_ODD:.1f} cuts on average and the crowd point {E_TGT:.1f}. An ordinary point in 15 is expected to take c(15) = {C15:.2f}.',
         chart('pl', (10, 310, 285, 210), 'Average cuts to isolate', [0.4, 2.6], [0, 8], [[0, '0'], [4, '4'], [8, '8']], [[1, 'outlier'], [2, 'crowd point']], pl=34),
         dict(bars='plb', chart='pl', data=[[1, round(E_ODD, 2), f'{E_ODD:.1f}', 'red'], [2, round(E_TGT, 2), f'{E_TGT:.1f}', 'green']], bw=46, ms=1000),
         series('cn', 'pl', [[0.5, round(C15, 2)], [2.5, round(C15, 2)]], 'amber', dash=True, ms=500),
         cnote('cnl', 'pl', [2.5, round(C15, 2)], f'c(15) = {C15:.2f}', 'amber', 16, anchor='end', dy=-12)),
    step(f'Turn that into a score: s = 2 to the power of minus (average cuts ÷ c). The outlier scores {SC_ODD:.2f}, the crowd point {SC_TGT:.2f}. Near 1 means likely anomaly; around 0.5 or below means ordinary. The lesson\'s example: 3.2 cuts with 256 points gives 0.805.',
         chart('sc', (305, 310, 285, 210), 'Score s = 2^(−E[h]/c)', [0, 10], [0, 1], [[0, '0'], [0.5, '0.5'], [1, '1']], [[0, '0'], [5, '5'], [10, '10']], pl=40),
         series('sline', 'sc', [[e / 4, round(s(e / 4, C15), 3)] for e in range(41)], 'purple', ms=1000),
         series('half', 'sc', [[0, 0.5], [10, 0.5]], None, dash=True, ms=300),
         dot('so', 'sc', [round(E_ODD, 2), round(SC_ODD, 3)], f'{SC_ODD:.2f}', 'red', dx=10, dy=-6, anchor='start'),
         dot('st', 'sc', [round(E_TGT, 2), round(SC_TGT, 3)], f'{SC_TGT:.2f}', 'green', dx=4, dy=18, anchor='start')),
    step('The second method, an autoencoder: squeeze a tick through a narrow bottleneck and rebuild it. Trained on mostly normal ticks, it only learns to rebuild normal patterns well.',
         box('inp', 10, 540, 165, 116, 'tick x\nspread 2.10\nvolume 1.40\nquotes 0.90', 'blue', size=18),
         box('z', 225, 562, 130, 72, 'squeeze\nthrough z', 'amber', size=18),
         box('out', 405, 540, 185, 116, 'rebuilt x̂\nspread 2.05\nvolume 1.35\nquotes 2.80', 'red', size=18),
         arrow('inp', 'z'), arrow('z', 'out')),
    step(f'Compare original and rebuild. Spread and volume come back almost exactly. Quote frequency comes back at 2.80 instead of 0.90. The mean squared miss, {MSE:.3f}, is the anomaly score: this combination never fitted what it practiced.',
         note('mse', 300, 684, f'score = mean of (x − x̂)² = {MSE:.3f}', 'red', 19)),
    step('Both flag a combination no single-variable filter can see. But a score says only "unusual". Not "wrong", not "a trade". And a model trained on a calm regime flags a new, legitimate regime as one long anomaly.',
         box('nw', 20, 712, 270, 72, 'unusual ≠ wrong\nunusual ≠ opportunity', 'amber', size=18),
         box('hr', 310, 712, 270, 72, 'a human decides\nwhat to do with it', 'green', size=18)),
])


BOARD = dict(name='anomaly_detection_isolation_autoencoders', lesson='anomaly-detection-isolation-autoencoders',
             title='Isolation Forest and autoencoders, drawn step by step', cfg=AN,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
