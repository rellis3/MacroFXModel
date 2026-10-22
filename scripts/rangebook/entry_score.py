"""Entry-timing scorer — forge/ENTRY_TIMING_EURUSD_PREREG.md. Stdlib only.
    python scripts/rangebook/entry_score.py [pair] > analysis/output/rangebook/<pair>_ENTRY_RESULTS.md
"""
import json, math, sys

PAIR = (sys.argv[1] if len(sys.argv) > 1 else 'eurusd').lower()
SPLIT = '2023-01-01'
D = json.load(open(f'analysis/output/rangebook/{PAIR}_entries.json'))
V = D['variants']
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']


def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung


def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n


def trades(rows, i):
    s = V[i]['s']
    return [r['r'][i] - r['costSig'] / s for r in rows if r['r'][i] is not None]


rows = D['rows']
for r in rows: r['fam'] = fam(r['line']); r['train'] = r['date'] < SPLIT
tr = [r for r in rows if r['train']]; te = [r for r in rows if not r['train']]
lab = lambda v: f"{v['kind']} {'beyond' if v['kind'] == 'fade' else 'back'} {v['x']:.1f}σ, stop {v['s']:.2f}σ"

print(f'# {PAIR.upper()} Touch Book part 2 — entry timing\n')
print('Rule: forge/ENTRY_TIMING_EURUSD_PREREG.md. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. '
      'Fade = limit order beyond the line, target the line behind. Follow = limit order back from the line after a '
      'pullback, target the next line out. Net R after spread, in units of the stop.\n')

print('## 1. All lines pooled\n')
print('| variant | fill rate | trades train / test | win % train / test | net R train (t) | net R test (t) |')
print('|---|---|---|---|---|---|')
for i, v in enumerate(V):
    a, b = trades(tr, i), trades(te, i)
    ma, ta, na = st(a); mb, tb, nb = st(b)
    fill = sum(r['r'][i] is not None for r in rows) / len(rows)
    wa = sum(x > 0 for x in a) / na; wb = sum(x > 0 for x in b) / nb
    print(f'| {lab(v)} | {fill:.0%} | {na} / {nb} | {wa:.0%} / {wb:.0%} | {ma:+.3f} ({ta:+.1f}) | {mb:+.3f} ({tb:+.1f}) |')

print('\n## 2. Pre-registered selection (per line × variant, 112 cells)\n')
sel = []
for fm in FAMS:
    for i, v in enumerate(V):
        m, t, n = st(trades([r for r in tr if r['fam'] == fm], i))
        if n >= 100 and m > 0 and t >= 3.0: sel.append((fm, i, m, t, n))
print(f'Cells selected on train (n ≥ 100, net R > 0, t ≥ 3.0): **{len(sel)}**.\n')
confirmed = 0
if sel:
    print('| line | variant | train net R (t, n) | test net R (t, n) | confirmed? |'); print('|---|---|---|---|---|')
    for fm, i, m, t, n in sorted(sel, key=lambda x: -x[3]):
        mb, tb, nb = st(trades([r for r in te if r['fam'] == fm], i))
        ok = mb > 0 and tb >= 2.0
        confirmed += ok
        print(f"| {fm} | {lab(V[i])} | {m:+.3f} ({t:+.1f}, {n}) | {mb:+.3f} ({tb:+.1f}, {nb}) | {'**YES**' if ok else 'no'} |")
print(f"\n**Verdict: {'PASS' if confirmed else 'FAIL'}** — {confirmed} of {len(sel)} selected cells confirmed on test.\n")

print('## 3. Best and worst cells on train, with test (for reading, not selection)\n')
cells = []
for fm in FAMS:
    for i, v in enumerate(V):
        m, t, n = st(trades([r for r in tr if r['fam'] == fm], i))
        mb, tb, nb = st(trades([r for r in te if r['fam'] == fm], i))
        if n >= 100: cells.append((t, fm, i, m, n, mb, tb, nb))
cells.sort(reverse=True)
print('| line | variant | train net R (t, n) | test net R (t, n) |'); print('|---|---|---|---|')
for t, fm, i, m, n, mb, tb, nb in cells[:10] + cells[-5:]:
    print(f'| {fm} | {lab(V[i])} | {m:+.3f} ({t:+.1f}, {n}) | {mb:+.3f} ({tb:+.1f}, {nb}) |')
pos_both = sum(1 for c in cells if c[3] > 0 and c[5] > 0)
print(f'\nCells positive in BOTH periods: {pos_both} of {len(cells)}.')
