"""Combined continue and fade setups — forge/COMBINED_SETUPS_PREREG.md.
    python scripts/rangebook/combined_score.py > analysis/output/rangebook/COMBINED_SETUPS_RESULTS.md
"""
import bisect, json, math
import numpy as np, pandas as pd
from statistics import NormalDist
N = NormalDist(); O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'
CV = {'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'usdjpy': 'USDJPY', 'audusd': 'AUDUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'gold': 'XAUUSD'}
CELLS = [('0.1', 'r5'), ('0.1', 'r10'), ('0.2', 'r5'), ('0.2', 'r10')]
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc
cv = json.load(open('js/data/cmeCvolEod.json'))['series']; IV = {}
for p, k in CV.items():
    rows = cv[k]; d = [r['date'] for r in rows]; u = np.array([r['underlying'] or np.nan for r in rows], float); lr = np.diff(np.log(u)); m = {}
    for i in range(21, len(d)):
        rv = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if rv > 0: m[d[i]] = rows[i]['cvol'] / rv
    IV[p] = (sorted(m), m)
def iv(p, date):
    ds, m = IV[p]; i = bisect.bisect_left(ds, date) - 1; return m[ds[i]] if i >= 0 else None
COTS = json.load(open(f'{O}cot/cot_series.json'))
def cot(p, date):
    s = COTS[p]; fr = [x['from'] for x in s]; i = bisect.bisect_right(fr, date) - 1; return s[i]['pct'] if i >= 0 else None
CACHE = {p: [x['from'] for x in COTS[p]] for p in CV}
def cot(p, date):
    i = bisect.bisect_right(CACHE[p], date) - 1; return COTS[p][i]['pct'] if i >= 0 else None
def crowd(p, date, up):
    c = cot(p, date)
    if c is None: return None
    if (up and c >= 80) or (not up and c <= 20): return 'with'
    if (up and c <= 20) or (not up and c >= 80): return 'against'
    return 'none'
rows = []
for p in CV:
    for s in json.load(open(f'{O}{p}_sequence.json'))['passes']:
        if s['sameBar']: continue
        up = s['line'].startswith(('OH_', 'CloseUp', 'ProjH')); fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        rows.append({'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'fol': fo, 'fad': fa, 'iv': iv(p, s['date']), 'crowd': crowd(p, s['date'], up),
                     'late': s['londonMin'] >= 1020, 'used': s['used'] if s['used'] is not None else 0})
D = pd.DataFrame(rows)
br = []
for p in CV:
    for t in json.load(open(f'{O}{p}_asym.json'))['rows']:
        if t['type'] != 'BREAK': continue
        R = [t['s' + s][tg]['R'] for s, tg in CELLS if t.get('s' + s) and t['s' + s].get(tg)]
        if len(R) == 4: br.append({'inst': p, 'date': t['date'], 'h2': t['date'] >= SPLIT, 'R': float(np.mean(R)), 'iv': iv(p, t['date']), 'crowd': crowd(p, t['date'], t['dir'] > 0)})
BR = pd.DataFrame(br)
rich, cheap = lambda X: X['iv'] >= 1.27, lambda X: X['iv'] < 1.05
def st(x, col):
    v = x[col].to_numpy(float)
    if len(v) < 3: return None
    per = x.groupby('inst')[col].mean()
    return {'n': len(v), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))), 'h1': float(x[~x['h2']][col].mean()), 'h2': float(x[x['h2']][col].mean()),
            'pos': int((per > 0).sum()), 'per': {k.upper(): round(float(v2), 3) for k, v2 in per.items()}}
S = {
  'CONTINUE: rich IV + against the crowd → follow': st(D[rich(D) & (D['crowd'] == 'against')], 'fol'),
  'CONTINUE (break trades): rich IV + against the crowd': st(BR[rich(BR) & (BR['crowd'] == 'against')], 'R'),
  'FADE: cheap IV + with the crowd → fade': st(D[cheap(D) & (D['crowd'] == 'with')], 'fad'),
  'FADE + exhaustion: … + after 17:00 + range used ≥ 0.8': st(D[cheap(D) & (D['crowd'] == 'with') & D['late'] & (D['used'] >= 0.8)], 'fad'),
}
REF = {
  'follow, all passes': st(D, 'fol'), 'follow, rich IV only': st(D[rich(D)], 'fol'), 'follow, against the crowd only': st(D[D['crowd'] == 'against'], 'fol'),
  'break trades, all': st(BR, 'R'), 'break trades, rich IV only': st(BR[rich(BR)], 'R'), 'break trades, against the crowd only': st(BR[BR['crowd'] == 'against'], 'R'),
  'fade, all passes': st(D, 'fad'), 'fade, cheap IV only': st(D[cheap(D)], 'fad'), 'fade, with the crowd only': st(D[D['crowd'] == 'with'], 'fad'),
  'fade, after 17:00 + used ≥ 0.8 only': st(D[D['late'] & (D['used'] >= 0.8)], 'fad'),
}
tests = sorted(((1 - N.cdf(v['t'])), k) for k, v in S.items() if v); M = len(tests); cut = 0
for i, (pv, _) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bh = {k for _, k in tests[:cut]}
f3 = lambda v: f'{v:+.3f}'
print('# Combined continue and fade setups — results\n\nPre-registration: forge/COMBINED_SETUPS_PREREG.md. 7 instruments with CVOL and COT; net R per trade after spread.\n')
print('| setup | trades | net R | 2016–22 | 2023–26 | instruments positive | PASS |\n|---|---|---|---|---|---|---|')
for k, v in S.items():
    ok = v and k in bh and v['h1'] > 0 and v['h2'] > 0 and v['pos'] >= 4
    print(f"| {k} | {v['n']:,} | {f3(v['R'])} | {f3(v['h1'])} | {f3(v['h2'])} | {v['pos']} of 7 | {'**PASS**' if ok else '–'} |")
print('\nPer instrument: ' + ' · '.join(f"{k.split(':')[0]}{' (break)' if 'break' in k else ''}{' + exh' if 'exhaustion' in k else ''}: {v['per']}" for k, v in S.items() if v))
print('\n## Do the filters stack? (each filter alone, for reference)\n\n| reference | trades | net R | 2016–22 | 2023–26 |\n|---|---|---|---|---|')
for k, v in REF.items(): print(f"| {k} | {v['n']:,} | {f3(v['R'])} | {f3(v['h1'])} | {f3(v['h2'])} |")
print(f'\nBH 10% over {M} setups: {cut} survive.')
