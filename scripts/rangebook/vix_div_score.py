"""VIX vs index divergence at the vol lines — forge/VIX_DIVERGENCE_PREREG.md.
    python scripts/rangebook/vix_div_score.py > analysis/output/rangebook/VIX_DIVERGENCE_RESULTS.md
"""
import bisect, csv, json, math
import numpy as np, pandas as pd
O = 'analysis/output/rangebook/'; SPLIT = '2025-01-01'; B = 1000
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
CELLS = [('0.1', 'r5'), ('0.1', 'r10'), ('0.2', 'r5'), ('0.2', 'r10')]
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc

rows = []
for p in ('nq', 'spx'):
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'{O}{p}_sequence.json'))['passes'] if not s['sameBar']}
    for r in json.load(open(f'{O}vix/{p}_vixdiv.json'))['rows']:
        s = seq[r['key']]; fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        rows.append({'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 's': r['s'], 'cont': s['outcome'] == 'cont', 'fol': fo, 'fad': fa,
                     'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used'])})
D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]; NC = 7 * 25 * 5
rng = np.random.default_rng(20261002)

def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(X):
    X = X[(X['s'] >= 1) | (X['s'] <= -1)]; flag = (X['s'] >= 1).to_numpy().astype(int)
    y, cell, day, h2 = X['cont'].to_numpy(float), X['cell'].to_numpy(), X['day'].to_numpy(), X['h2'].to_numpy()
    est = within(y, cell, flag, np.ones(len(y))); nd = int(D['day'].max()) + 1
    bs = [within(y, cell, flag, rng.poisson(1.0, nd)[day].astype(float)) for _ in range(B)]; lo, hi = np.percentile(bs, [2.5, 97.5])
    return est, lo, hi, within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float)), int(flag.sum()), int((1 - flag).sum())

pp = lambda v: f'{v*100:+.1f}pp'
f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
print('# VIX vs Nasdaq/SPX divergence at the vol lines (hourly) — results\n')
print('Pre-registration: forge/VIX_DIVERGENCE_PREREG.md (da392e9). Against = VIX did not confirm the move into the line (s ≥ +1σ); '
      'with = VIX over-confirmed it (s ≤ −1σ). Effect = within-cell continue difference, against − with (negative = against fades more, as '
      'predicted). Halves: 2023-12–2024 vs 2025–26.\n')
print('| set | against − with [95% CI] | first half | second half | n (against / with) |\n|---|---|---|---|---|')
res = {}
for nm, X in (('NQ + SPX', D), ('NQ', D[D['inst'] == 'nq']), ('SPX', D[D['inst'] == 'spx'])):
    e, lo, hi, h1, h2, na, nw = t1(X); res[nm] = (e, lo, hi, h1, h2)
    print(f'| {nm} | {pp(e)} [{pp(lo)}, {pp(hi)}] | {pp(h1)} | {pp(h2)} | {na:,} / {nw:,} |')
e, lo, hi, h1, h2 = res['NQ + SPX']
real = (lo > 0 or hi < 0) and np.sign(h1) == np.sign(h2) == np.sign(e) and np.sign(res['NQ'][0]) == np.sign(res['SPX'][0]) == np.sign(e)
print(f"\nT1: {'**REAL**' if real else 'not real'}.\n")
print('| group | passes | continue | follow R (halves) | fade R (halves) |\n|---|---|---|---|---|')
T2 = {}
for nm, m in (('against (VIX not confirming)', D['s'] >= 1), ('neutral', D['s'].abs() < 1), ('with (VIX over-confirming)', D['s'] <= -1)):
    x = D[m]; T2[nm] = x
    print(f"| {nm} | {len(x):,} | {x['cont'].mean():.0%} | {f3(x['fol'].mean())} ({f3(x[~x['h2']]['fol'].mean())} / {f3(x[x['h2']]['fol'].mean())}) | "
          f"{f3(x['fad'].mean())} ({f3(x[~x['h2']]['fad'].mean())} / {f3(x[x['h2']]['fad'].mean())}) |")
a, w = T2['against (VIX not confirming)'], T2['with (VIX over-confirming)']
p_fade = a[~a['h2']]['fad'].mean() > 0 and a[a['h2']]['fad'].mean() > 0
p_fol = w[~w['h2']]['fol'].mean() > 0 and w[w['h2']]['fol'].mean() > 0
print(f"\nT2: fade when against — {'**PASS**' if p_fade else 'fail'}; follow when with — {'**PASS**' if p_fol else 'fail'}.")

# Descriptive: rich-IV break trades on NQ/SPX split by the divergence at their signal
def rvm(dates, px):
    lr = np.diff(np.log(np.asarray(px, float))); m = {}
    for i in range(21, len(dates)):
        v = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if v > 0: m[dates[i]] = v
    return m
out = []
for p, s in (('nq', 'VXN'), ('spx', 'VIX')):
    iv = {}
    for r in csv.reader(open(f'{O}cboe/{s}.csv')):
        if r and r[0][:1].isdigit():
            mm, dd, yy = r[0].split('/'); iv[f'{yy}-{mm}-{dd}'] = float(r[4])
    daily = json.load(open(f'{O}cboe/{p}_daily.json')); dts = [x['date'] for x in daily]; rv = rvm(dts, [x['close'] for x in daily])
    ivrv = {k: iv[k] / rv[k] for k in rv if k in iv}; ks = sorted(ivrv)
    vd = {}
    for r in json.load(open(f'{O}vix/{p}_vixdiv.json'))['rows']:
        d0, ln, _ = r['key'].split('|'); vd.setdefault(f'{d0}|{ln}', r['s'])
    for t in json.load(open(f'{O}{p}_asym.json'))['rows']:
        if t['type'] != 'BREAK': continue
        i = bisect.bisect_left(ks, t['date']) - 1
        if i < 0 or ivrv[ks[i]] < 1.53: continue
        R = [t['s' + a_][b_]['R'] for a_, b_ in CELLS if t.get('s' + a_) and t['s' + a_].get(b_)]
        sv = vd.get(t['date'] + '|' + t['line'])
        if len(R) == 4 and sv is not None: out.append((float(np.mean(R)), sv))
if out:
    o = np.array(out); ag, ne, wi = o[o[:, 1] >= 1, 0], o[np.abs(o[:, 1]) < 1, 0], o[o[:, 1] <= -1, 0]
    print(f"\nDescriptive (approximate: the break is matched to the line's first pass reading) — rich-IV break trades on NQ/SPX with a VIX reading "
          f"(n={len(o)}): against {f3(ag.mean() if len(ag) else None)} (n={len(ag)}), neutral {f3(ne.mean() if len(ne) else None)}, with {f3(wi.mean() if len(wi) else None)} (n={len(wi)}).")
