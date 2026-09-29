"""Scores analysis/output/v4_stage1/eurusd.json against
forge/V4_EURUSD_STAGE1_PREREG.md. Pure stdlib.
    python3 scripts/v4/eurusd_stage1_score.py > analysis/output/v4_stage1/RESULTS.md
"""
import json, math, random, collections

TRAIN_END = '2024-09-29'
d = json.load(open('analysis/output/v4_stage1/eurusd.json'))
rows = d['rows']
for r in rows:
    g = -1.0 if r['r'] is None else r['r']
    # net R per direction; an ambiguous bar is -1 for either trade (pre-registered)
    r['fade'] = (g if r['r'] is not None else -1.0) - r['c']
    r['follow'] = (-g if r['r'] is not None else -1.0) - r['c']
train = [r for r in rows if r['date'] < TRAIN_END]
test = [r for r in rows if r['date'] >= TRAIN_END]
FEATS = sorted({k for r in rows for k in r['f']})


def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n


def select(rs, key_fade='fade', key_follow='follow'):
    sel = []
    groups = collections.defaultdict(list)
    for r in rs:
        for f in FEATS:
            v = r['f'].get(f)
            if v is not None: groups[(f, v)].append(r)
    for (f, v), g in groups.items():
        for dr, key in (('fade', key_fade), ('follow', key_follow)):
            m, t, n = st([x[key] for x in g])
            if n >= 150 and m > 0 and t >= 2.5: sel.append((f, v, dr, m, t, n))
    return sel


def line(label, xs):
    m, t, n = st(xs)
    wr = 100 * sum(x > 0 for x in xs) / n if n else 0
    return f"| {label} | {n} | {wr:.1f} | {m:+.3f} | {t:+.1f} | {0.5 * sum(xs):+.1f}% |"


print('# Vote Atlas v4 — EURUSD Stage 1 results\n')
print(f"Rule: forge/V4_EURUSD_STAGE1_PREREG.md. Train {train[0]['date']}→{train[-1]['date']} ({len(train)} touches), "
      f"test {test[0]['date']}→{test[-1]['date']} ({len(test)} touches). Net R after cost; return = simple sum at 0.5% risk/trade.\n")

print('## Baseline (every touch)\n')
print('| set | trades | win % | net R | t | return |'); print('|---|---|---|---|---|---|')
for nm, rs in (('train', train), ('test', test)):
    for dr in ('fade', 'follow'): print(line(f'{nm} · {dr} all', [r[dr] for r in rs]))

# 1. chance benchmark: shuffle outcomes across train touches, keep features fixed
random.seed(7)
chance = []
for _ in range(20):
    perm = [(r['fade'], r['follow']) for r in train]; random.shuffle(perm)
    sh = [{'f': r['f'], 'sf': a, 'so': b} for r, (a, b) in zip(train, perm)]
    chance.append(len(select(sh, 'sf', 'so')))
chance.sort()
real = select(train)
print(f"\n## 1. Chance benchmark\n\nBuckets selected on TRAIN with real outcomes: **{len(real)}**. "
      f"With outcomes shuffled (20 runs): median {chance[10]}, 95th pct {chance[18]}, max {chance[-1]}.\n")

print('## 2. Selected buckets (train) → test\n')
print('| feature = bucket | dir | train n | train net R | train t | test n | test win % | test net R | test t |')
print('|---|---|---|---|---|---|---|---|---|')
for f, v, dr, m, t, n in sorted(real, key=lambda x: -x[4]):
    xs = [r[dr] for r in test if r['f'].get(f) == v]
    tm, tt, tn = st(xs)
    wr = 100 * sum(x > 0 for x in xs) / tn if tn else 0
    print(f"| {f} = {v} | {dr} | {n} | {m:+.3f} | {t:+.1f} | {tn} | {wr:.1f} | {tm:+.3f} | {tt:+.1f} |")

print('\n## 3. Combined rule on TEST\n')
sel_f = {(f, v) for f, v, dr, *_ in real if dr == 'fade'}
sel_o = {(f, v) for f, v, dr, *_ in real if dr == 'follow'}
taken = []
for r in test:
    hf = any((f, r['f'].get(f)) in sel_f for f in FEATS)
    ho = any((f, r['f'].get(f)) in sel_o for f in FEATS)
    if hf and not ho: taken.append(r['fade'])
    elif ho and not hf: taken.append(r['follow'])
print('| rule | trades | win % | net R | t | return |'); print('|---|---|---|---|---|---|')
print(line('combined (test)', taken) if taken else '| combined (test) | 0 | – | – | – | – |')
m, t, n = st(taken) if taken else (0, 0, 0)
passed = n > 0 and m > 0 and t >= 2 and len(real) > chance[18]
print(f"\n**Verdict: {'PASS' if passed else 'FAIL'}** — combined rule net R {m:+.3f} (t {t:+.1f}) on test; "
      f"{len(real)} buckets selected vs chance 95th pct {chance[18]}.")
