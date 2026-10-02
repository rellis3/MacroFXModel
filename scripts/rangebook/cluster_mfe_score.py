"""Forecast-line clusters and fade MFE/MAE — forge/LINE_CLUSTER_MFE_PREREG.md.
    python scripts/rangebook/cluster_mfe_score.py > analysis/output/rangebook/LINE_CLUSTER_MFE_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'; B = 1000; N = NormalDist()
IDX = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def sess(m): return 'Asia' if m < 420 else 'London' if m < 780 else 'NY' if m < 1020 else 'Late'
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc
rows = []
for p in ALL + IDX:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'{O}{p}_sequence.json'))['passes'] if not s['sameBar']}
    for r in json.load(open(f'{O}{p}_clmfe.json'))['rows']:
        s = seq[r['key']]; fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        g = 'lone' if r['c05'] == 0 else 'pair' if r['c05'] == 1 else 'cluster'
        rows.append({'inst': p, 'grp': 'IDX' if p in IDX else 'FX', 'date': s['date'], 'h2': s['date'] >= SPLIT, 'g': g, 'g10': 'lone' if r['c10'] == 0 else 'pair' if r['c10'] == 1 else 'cluster',
                     'sess': sess(s['londonMin']), 'cont': s['outcome'] == 'cont', 'fade': s['outcome'] in ('fade', 'both'), 'fol': fo, 'fad': fa, 'cost': s['costSig'], 'pps': r['pipsPerSig'],
                     'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used']),
                     **{k: r[k] for k in r if k.startswith(('mfe', 'mae', 'mbs', 'hit'))}})
D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]; NC = 7 * 25 * 5
rng = np.random.default_rng(20261003); ND = int(D['day'].max()) + 1
def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(X, a, b):
    m = a | b; X = X[m]; flag = a[m].astype(int)
    y, cell, day, h2 = X['cont'].to_numpy(float), X['cell'].to_numpy(), X['day'].to_numpy(), X['h2'].to_numpy()
    est = within(y, cell, flag, np.ones(len(y))); bs = [within(y, cell, flag, rng.poisson(1.0, ND)[day].astype(float)) for _ in range(B)]
    lo, hi = np.percentile(bs, [2.5, 97.5]); e1, e2 = within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float))
    return est, lo, hi, e1, e2, bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))
pp = lambda v: f'{v*100:+.1f}pp'; f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
print('# Forecast-line clusters and fade MFE / MAE — results\n')
print('Pre-registration: forge/LINE_CLUSTER_MFE_PREREG.md (883fa17). Cluster = other export lines within 0.05σ of the touched line, '
      'priced before the touch. Fade = entry at the line on the touch bar. σ = the day\'s forecast σ (EURUSD ≈ 45 pips).\n')
print('## T1 / T2 — do clusters fade more?\n\n| set | group | touches | continue | fade | fade R (halves) | vs lone: continue [95% CI] | 2016–22 | 2023–26 | REAL? |\n|---|---|---|---|---|---|---|---|---|---|')
tests = []
for grp, lab in (('FX', '16 FX + gold'), ('IDX', '6 indices')):
    X = D[D['grp'] == grp]
    for g in ('lone', 'pair', 'cluster'):
        x = X[X['g'] == g]; v = x['fad'].to_numpy(); hh = x['h2'].to_numpy()
        row = f"| {lab} | {g} | {len(x):,} | {x['cont'].mean():.0%} | {x['fade'].mean():.0%} | {f3(v.mean())} ({f3(v[~hh].mean())} / {f3(v[hh].mean())}) |"
        if g != 'lone':
            est, lo, hi, e1, e2, real = t1(X, (X['g'] == g).to_numpy(), (X['g'] == 'lone').to_numpy())
            row += f" {pp(est)} [{pp(lo)}, {pp(hi)}] | {pp(e1)} | {pp(e2)} | {'**yes**' if real else 'no'} |"
            tests.append((1 - N.cdf(v.mean() / v.std(ddof=1) * math.sqrt(len(v))), f'{lab} {g}', v[~hh].mean(), v[hh].mean()))
        else: row += ' – | | | |'
        print(row)
tests.sort(key=lambda t: t[0]); M = len(tests); cut = 0
for i, t in enumerate(tests, 1):
    if t[0] <= 0.10 * i / M: cut = i
passed = [t[1] for t in tests[:cut] if t[2] > 0 and t[3] > 0]
print(f"\nT2 fade R: BH 10% over {M} rows, {cut} survive; positive in both halves too: {', '.join(passed) or 'none'}.\n")

# T3: MFE / MAE
def mfe_table(X, label, pips=False):
    k = X['pps'].median() if pips else 1.0; u = 'pips' if pips else 'σ'
    print(f'### {label}\n\n| horizon | median MFE (back inside) | 75th MFE | median MAE (beyond) | 75th MAE |\n|---|---|---|---|---|')
    for h in ('15', '30', '60', '120', 'Day'):
        a, b = X['mfe' + h] * k, X['mae' + h] * k
        print(f"| {h if h == 'Day' else h + ' min'} | {a.median():.2f} {u} | {a.quantile(.75):.2f} | {b.median():.2f} | {b.quantile(.75):.2f} |")
    print()
print('## T3 — how far price moves after a touch (fade perspective)\n')
fx = D[D['grp'] == 'FX']
mfe_table(fx, '16 FX + gold, all touches (σ)')
eu = D[D['inst'] == 'eurusd']; mfe_table(eu, 'EURUSD alone, in pips', pips=True)
print('### Fade with a stop beyond the line: how far it comes back BEFORE the stop is hit (16 FX + gold)\n')
print('| stop | stopped out | median MFE before stop | share reaching 0.1σ / 0.2σ / 0.3σ / 0.5σ back before the stop |\n|---|---|---|---|')
for s in ('0.1', '0.2', '0.3'):
    m = fx['mbs' + s]; hit = fx['hit' + s].notna().mean()
    print(f"| {s}σ | {hit:.0%} | {m.median():.2f}σ | " + ' / '.join(f"{(m >= t).mean():.0%}" for t in (0.1, 0.2, 0.3, 0.5)) + ' |')
print('\n### Fixed target t / stop s fade, net of spread (16 FX + gold; mean R; cells positive in both halves marked ✓)\n')
print('Target hit = MFE-before-stop ≥ t; stopped = stop hit before the target; neither = exit at day end (counted at 0 R before cost, a conservative simplification).\n')
print('| stop \\ target | ' + ' | '.join(f'{t}σ' for t in (0.1, 0.2, 0.3, 0.4, 0.6)) + ' |\n|---|' + '---|' * 5)
for s in (0.1, 0.2, 0.3):
    cells = []
    for t in (0.1, 0.2, 0.3, 0.4, 0.6):
        win = fx[f'mbs{s}'] >= t; stopped = (~win) & fx[f'hit{s}'].notna()
        R = np.where(win, t / s, np.where(stopped, -1.0, 0.0)) - fx['cost'] / s
        h = fx['h2'].to_numpy(); ok = R[~h].mean() > 0 and R[h].mean() > 0
        cells.append(f"{R.mean():+.3f}{' ✓' if ok else ''}")
    print(f'| {s}σ | ' + ' | '.join(cells) + ' |')
print('\n### By group and session (16 FX + gold): median MFE-before-0.2σ-stop, and the share stopped\n')
print('| group | Asia | London | NY | Late |\n|---|---|---|---|---|')
for g in ('lone', 'pair', 'cluster'):
    x = fx[fx['g'] == g]
    print(f'| {g} | ' + ' | '.join(f"{x[x['sess'] == s]['mbs0.2'].median():.2f}σ ({x[x['sess'] == s]['hit0.2'].notna().mean():.0%} stopped)" for s in ('Asia', 'London', 'NY', 'Late')) + ' |')
