"""Continue vs fade fingerprint: every stored feature, side by side for touches that CONTINUED vs touches that FADED.
Descriptive (no new test): reports the median in each group and how well the feature separates them (AUC; 0.50 = no
separation), in both halves. 16 FX/gold book passes, stalls excluded.
    python scripts/rangebook/fingerprint_score.py > analysis/output/rangebook/FINGERPRINT_RESULTS.md
"""
import json
import numpy as np, pandas as pd
from crosspair_buckets import ALL
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'
APP = {'mv5': 'move into the line, last 5 min (σ)', 'mv15': 'move, last 15 min (σ)', 'mv60': 'move, last 60 min (σ)', 'accel': 'acceleration (5-min vs 15-min pace)',
       'er15': 'efficiency, 15 min (1 = straight line)', 'er60': 'efficiency, 60 min', 'barSize': 'bar size, last 5 vs last 60 min', 'wt1m': 'WaveTrend 1m (toward the line +)',
       'wtSlope': 'WaveTrend 1m slope', 'wt15m': 'WaveTrend 15m', 'wt1h': 'WaveTrend 1h', 'wtS15': 'WaveTrend 15m (9/12/3)', 'wtS1h': 'WaveTrend 1h (9/12/3)',
       'mf': 'VuManChu money flow', 'relVol5': 'volume, last 5 min vs usual', 'relVol15': 'volume, last 15 min vs usual', 'relVol60': 'volume, last 60 min vs usual',
       'volTrend': 'volume rising into the line (5 vs 60)', 'vwapDist': 'line distance from VWAP (σ)', 'minsSincePrev': 'minutes since the previous touch'}
DIV = {'roc240': 'rate of change, 4 hours (σ)', 'atrRatio': 'M15 ATR vs usual', 'explosion': 'biggest bar last 15 min vs median', 'vwapBand': 'line position in VWAP σ-bands'}
SEQ = {'used': 'day\'s range already used', 'londonMin': 'time of day (London minutes)', 'pass': 'touch number on this line today'}
rows = []
for p in ALL:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'{O}{p}_sequence.json'))['passes'] if not s['sameBar']}
    ap = {f"{a['date']}|{a['line']}|{a['pass']}": a for a in json.load(open(f'{O}{p}_approach.json'))['rows']}
    dv = {r['key']: r for r in json.load(open(f'{O}{p}_div.json'))['rows']}
    htf = {r['key']: r for r in json.load(open(f'{O}{p}_htf.json'))['rows']}
    for key, s in seq.items():
        if s['outcome'] not in ('cont', 'fade', 'both'): continue
        a, d, h = ap.get(key, {}), dv.get(key, {}), htf.get(key, {})
        up = 1 if s['line'].startswith(('OH_', 'CloseUp', 'ProjH')) else -1
        x = {'y': s['outcome'] == 'cont', 'h2': s['date'] >= SPLIT}
        for k in APP: x[k] = a.get(k)
        for k in DIV: x[k] = d.get(k)
        for k in SEQ: x[k] = s.get(k)
        x['h1'] = None if h.get('h1') is None else h['h1'] * up; x['h4'] = None if h.get('h4') is None else h['h4'] * up
        x['wtDiv5'] = None if d.get('d1m5') is None else int(d['d1m5'] == 'div')
        rows.append(x)
D = pd.DataFrame(rows)
LAB = {**APP, **DIV, **SEQ, 'h1': 'H1 trend vs the touch (+1 with, −1 against)', 'h4': 'H4 trend vs the touch', 'wtDiv5': 'WaveTrend divergence at the touch (M5)'}
def auc(x, y):
    m = ~np.isnan(x); x, y = x[m], y[m]
    if y.sum() < 50 or (~y).sum() < 50: return np.nan
    r = pd.Series(x).rank().to_numpy(); n1 = y.sum(); n0 = len(y) - n1
    return (r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
out = []
y = D['y'].to_numpy(bool); h2 = D['h2'].to_numpy(bool)
for k, lab in LAB.items():
    x = pd.to_numeric(D[k], errors='coerce').to_numpy(float)
    a, a1, a2 = auc(x, y), auc(x[~h2], y[~h2]), auc(x[h2], y[h2])
    out.append((abs(a - 0.5) if a == a else 0, lab, np.nanmedian(x[y]), np.nanmedian(x[~y]), a, a1, a2))
out.sort(key=lambda r: -r[0])
print('# Continue vs fade fingerprint — 16 FX/gold\n')
print(f'{len(D):,} touches that resolved (continue = reached the next line out first: {y.mean():.0%}; fade = reached the line behind first). '
      'Signs are oriented to the touch: + = toward the line / with the touch. AUC = chance a random continuing touch has a higher value than a random '
      'fading one (0.50 = the feature cannot tell them apart; 0.60 would be a strong single feature).\n')
print('| feature | median when it CONTINUED | median when it FADED | AUC | 2016–22 | 2023–26 |\n|---|---|---|---|---|---|')
for _, lab, mc, mf, a, a1, a2 in out:
    print(f'| {lab} | {mc:.3g} | {mf:.3g} | {a:.3f} | {a1:.3f} | {a2:.3f} |')
