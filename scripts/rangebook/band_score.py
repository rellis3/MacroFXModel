"""Study 2 scorer — forge/RUBBER_BAND_PREREG.md.
    python scripts/rangebook/band_score.py > analysis/output/rangebook/RUBBER_BAND_RESULTS.md
"""
import json, math, os, collections

INST = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd', 'eurgbp', 'eurjpy', 'gbpjpy', 'euraud',
        'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'audnzd', 'audcad', 'nzdcad', 'cadchf', 'eurcad', 'eurnzd',
        'gbpaud', 'gbpcad', 'gbpnzd', 'gbpchf', 'audchf', 'nzdjpy']
SPLIT = '2023-01-01'
SPEEDS = {'S1': 'intraday: London-day VWAP, 2-hour hold', 'S2': 'swing: 5-day mean, hold to the close',
          'S3': 'slow: 20-day mean, 5-day hold'}
T_BAR = 2.4

def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n

data = {p: json.load(open(f'analysis/output/rangebook/{p}_band.json'))['rows'] for p in INST}

def trades(rows, speed):
    """|z| >= 2, one open trade at a time (skip decisions before the previous exit)."""
    out, busy_until = [], -1
    for r in sorted((r for r in rows if r['s'] == speed), key=lambda r: r['t']):
        if abs(r['z']) >= 2 and r['t'] >= busy_until:
            out.append(r); busy_until = r['xt']
    return out

print('# Study 2 — the rubber band: fading stretches from fair value\n')
print('Rule: forge/RUBBER_BAND_PREREG.md. 28 instruments (FX + gold), 2016 → 2026-08. Fade |z| ≥ 2 toward fair value, '
      'time exit only, one open trade per instrument per speed. Net return in σ (the day\'s forecast σ × open), after spread.\n')
print('## 1. Results by speed\n')
print('| speed | trades | win % | net 2016–22 (t) | net 2023–26 (t) | instruments positive | verdict |')
print('|---|---|---|---|---|---|---|')
verd = {}
for sp, lab in SPEEDS.items():
    T = {p: trades(data[p], sp) for p in INST}
    allt = [r for p in INST for r in T[p]]
    a = st([r['ret'] for r in allt if r['date'] < SPLIT]); b = st([r['ret'] for r in allt if r['date'] >= SPLIT])
    pos = sum(st([r['ret'] for r in T[p]])[0] > 0 for p in INST if T[p])
    ok = a[0] > 0 and a[1] >= T_BAR and b[0] > 0 and b[1] >= T_BAR and pos >= 17
    verd[sp] = ok
    wr = sum(r['ret'] > 0 for r in allt) / len(allt) if allt else 0
    print(f"| **{sp}** {lab} | {len(allt)} | {wr:.0%} | {a[0]:+.3f} ({a[1]:+.1f}) | {b[0]:+.3f} ({b[1]:+.1f}) | {pos}/28 | {'**PASS**' if ok else 'FAIL'} |")

print('\n## 2. Does the stretch come back at all? (descriptive, every decision)\n')
print('Slope of the forward return (σ) on z: negative = the further price is stretched, the more it comes back. '
      'Reversion-to-cost = expected pull-back at |z| = 2 ÷ the round-trip spread.\n')
print('| speed | decisions | slope of forward return on z | expected pull-back at z = 2 (σ) | median spread (σ) | reversion-to-cost |')
print('|---|---|---|---|---|---|')
for sp in SPEEDS:
    xs, ys, cs = [], [], []
    for p in INST:
        for r in data[p]:
            if r['s'] != sp: continue
            xs.append(r['z']); ys.append(r['fwd'])
            dirn = -1 if r['z'] > 0 else 1
            cs.append(dirn * r['fwd'] - r['ret'])                    # cost in σ units
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    slope = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
    cost = sorted(cs)[len(cs) // 2]
    print(f'| {sp} | {len(xs):,} | {slope:+.3f} | {-2 * slope:+.3f} | {cost:.3f} | {(-2 * slope) / cost:.1f}× |')

print('\n## 3. By instrument (net per trade, full period)\n')
print('| instrument | ' + ' | '.join(SPEEDS) + ' |'); print('|---|' + '---|' * len(SPEEDS))
for p in INST:
    cells = []
    for sp in SPEEDS:
        m, t, n = st([r['ret'] for r in trades(data[p], sp)])
        cells.append(f'{m:+.2f} (n {n})' if n else '–')
    print(f'| {p.upper()} | ' + ' | '.join(cells) + ' |')

# ── Secondary: the big-day switch on S1 (instruments with walk-forward q75 forecasts) ──
q = {}
for p in ('eurusd', 'gbpusd', 'audusd', 'usdcad', 'usdchf', 'usdjpy', 'gold'):
    f = f'analysis/output/rangebook/{p}_pred_q75.json'
    if os.path.exists(f): q[p] = json.load(open(f))
if q:
    hl = json.load(open('analysis/output/rangebook/hl_ratio.json')) if os.path.exists('analysis/output/rangebook/hl_ratio.json') else {}
    print('\n## 4. Secondary: S1 split by the big-day forecast (2023–2026, where forecasts exist)\n')
    g = collections.defaultdict(list)
    for p, qq in q.items():
        thr = hl.get(p)
        for r in trades(data[p], 'S1'):
            v = qq.get(r['date'])
            if v is None or thr is None: continue
            g['big day' if v > thr else 'normal/small day'].append(r['ret'])
    for k, xs in g.items():
        m, t, n = st(xs); print(f'- {k}: {m:+.3f} (t {t:+.1f}, n {n})')
    if not g: print('- no S1 trades fall on forecast days.')

print('\n## Verdicts (pre-registered)\n')
for sp, ok in verd.items(): print(f"- {sp}: **{'PASS' if ok else 'FAIL'}**")
