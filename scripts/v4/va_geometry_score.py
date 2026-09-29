"""Scores scripts/v4/va_geometry.mjs output. Pure stdlib.
    python3 scripts/v4/va_geometry_score.py > analysis/output/v4_stage0/VA_GEOMETRY.md
"""
import glob, json, math, collections

SPLIT = '2021-09-28'
LABEL = {'v1': 'Vote Atlas lines + engine (honest)', 'v4exact': 'v4 lines, VA race incl. touch bar',
         'v4strict': 'v4 lines, race from bar after touch'}


def st(xs):
    n = len(xs)
    if n < 2: return float('nan'), float('nan')
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else float('nan'))


agg = collections.defaultdict(list)     # (v, dir) -> [(pair, date, win, gR, nR, onTouchBar)]
for f in sorted(glob.glob('analysis/output/v4_stage0/*-vageom.json')):
    d = json.load(open(f)); c = d['cost']
    for r in d['rows']:
        if not (r['stopPct'] > 0 and r['targetPct'] > 0): continue
        for dr in ('fade', 'follow'):
            pnl = r['fadePct'] if dr == 'fade' else -r['fadePct']
            risk = r['stopPct'] if dr == 'fade' else r['targetPct']
            agg[(r['v'], dr)].append((d['pair'], r['date'], pnl > 0, pnl / risk, (pnl - c) / risk, r['onTouchBar']))

print('# Vote Atlas exact setup through v4 — unconditioned (every touch)\n')
print('R = P&L ÷ that trade\'s own stop distance. Fade: target = inner rung, stop = outer rung; '
      'follow mirrored. p50 + p75 rungs, re-arm 0.3, unresolved marked to session close.\n')
print('| variant | dir | trades | win % | gross R | t | net R | t | net H1 | net H2 | pairs net>0 | resolved on touch bar |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for v in ('v1', 'v4exact', 'v4strict'):
    for dr in ('fade', 'follow'):
        rows = agg[(v, dr)]
        g, tg = st([x[3] for x in rows]); n_, tn = st([x[4] for x in rows])
        h1 = st([x[4] for x in rows if x[1] < SPLIT])[0]; h2 = st([x[4] for x in rows if x[1] >= SPLIT])[0]
        bp = collections.defaultdict(list)
        for x in rows: bp[x[0]].append(x[4])
        pos = sum(1 for xs in bp.values() if sum(xs) / len(xs) > 0)
        otb = [x for x in rows if x[5]]
        otb_s = f"{100*len(otb)/len(rows):.1f}% (win {100*sum(x[2] for x in otb)/len(otb):.0f}%)" if otb else '0%'
        print(f"| {LABEL[v]} | {dr} | {len(rows)} | {100*sum(x[2] for x in rows)/len(rows):.1f} | {g:+.3f} | {tg:+.1f} | "
              f"{n_:+.3f} | {tn:+.1f} | {h1:+.3f} | {h2:+.3f} | {pos}/{len(bp)} | {otb_s} |")
