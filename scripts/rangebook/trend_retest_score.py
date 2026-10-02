"""Trend-day filter + acceptance-retest entry — forge/TRENDDAY_RETEST_PREREG.md.
    python scripts/rangebook/trend_retest_score.py > analysis/output/rangebook/TRENDDAY_RETEST_RESULTS.md
"""
import bisect, csv, json, math
import numpy as np, pandas as pd
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'
CV = {'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'audusd': 'AUDUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
IXV = {'nq': 'VXN', 'spx': 'VIX', 'dow': 'VXD', 'us2000': 'RVX'}
def rv_map(dates, px):
    lr = np.diff(np.log(np.asarray(px, float))); m = {}
    for i in range(21, len(dates)):
        v = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if v > 0: m[dates[i]] = v
    return m
IV = {}
cv = json.load(open('js/data/cmeCvolEod.json'))['series']
for p, k in CV.items():
    rows = cv[k]; d = [r['date'] for r in rows]; rv = rv_map(d, [r['underlying'] or np.nan for r in rows])
    m = {x: rows[i]['cvol'] / rv[x] for i, x in enumerate(d) if x in rv}; IV[p] = (sorted(m), m)
for p, s in IXV.items():
    iv = {}
    for r in csv.reader(open(f'{O}cboe/{s}.csv')):
        if r and r[0][:1].isdigit(): mm, dd, yy = r[0].split('/'); iv[f'{yy}-{mm}-{dd}'] = float(r[4])
    daily = json.load(open(f'{O}cboe/{p}_daily.json')); d = [x['date'] for x in daily]; rv = rv_map(d, [x['close'] for x in daily])
    m = {x: iv[x] / rv[x] for x in rv if x in iv}; IV[p] = (sorted(m), m)
def ivrv(p, date):
    ds, m = IV[p]; i = bisect.bisect_left(ds, date) - 1; return m[ds[i]] if i >= 0 else None

def load(pairs, thr):
    out = []
    for p in pairs:
        for r in json.load(open(f'{O}{p}_trendretest.json'))['rows']:
            v = ivrv(p, r['date'])
            if v is None or v < thr or r['baseR'] is None: continue
            out.append({'inst': p, 'date': r['date'], 'h2': r['date'] >= SPLIT, 'base': r['baseR'], 'sigMin': r['sigMin'],
                        'asia': r['asiaBreakWith'], 'narrow': r['narrowAsia'], 'rtStatus': r['rt']['status'],
                        'rtSig': r['rt']['R'] if r['rt']['status'] == 'filled' and r['rt']['R'] is not None else 0.0})
    return pd.DataFrame(out)
f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
def halves(x, col): return (x[col].mean(), x[~x['h2']][col].mean(), x[x['h2']][col].mean(), len(x))
res = {}
for sname, pairs, thr in (('FX + gold (7 CVOL)', list(CV), 1.27), ('Indices (NQ, SPX, DOW, US2000)', list(IXV), 1.53)):
    D = load(pairs, thr); W = D[D['sigMin'] >= 420]
    res[sname] = {
        'v1_base': halves(W, 'base'), 'v1_filt': halves(W[W['asia'] == True], 'base'), 'v1_not': halves(W[W['asia'] == False], 'base'),
        'v1b_narrow': halves(W[W['narrow'] == True], 'base'),
        'v2_base': halves(D, 'base'), 'v2_sig': halves(D, 'rtSig'),
        'fill': float((D['rtStatus'] == 'filled').mean()), 'rej': float((D['rtStatus'] == 'rejected').mean()),
        'v2_trade': halves(D[D['rtStatus'] == 'filled'].assign(r=lambda x: x['rtSig']), 'r') if (D['rtStatus'] == 'filled').any() else None}
beats = lambda a, b: a[1] > b[1] and a[2] > b[2]
fx, ix = res['FX + gold (7 CVOL)'], res['Indices (NQ, SPX, DOW, US2000)']
p1 = beats(fx['v1_filt'], fx['v1_base']) and ix['v1_filt'][0] > ix['v1_base'][0]
p2 = beats(fx['v2_sig'], fx['v2_base']) and ix['v2_sig'][0] > ix['v2_base'][0]
print('# Trend-day filter and acceptance-retest entry — results\n\nPre-registration: forge/TRENDDAY_RETEST_PREREG.md (ba34477). Rich-IV break signals only; R net of spread, mean of 0.1σ/0.2σ × 5R/10R.\n')
for sname, r in res.items():
    print(f'## {sname}\n\n| | n | net R | 2016–22 | 2023–26 |\n|---|---|---|---|---|')
    for k, lab in (('v1_base', 'Variant 1 base: all breaks signalled from 07:00'), ('v1_filt', '… London closed beyond the Asia range in the trade direction first (trend day)'),
                   ('v1_not', '… not (Asia range not broken that way)'), ('v1b_narrow', '… narrow Asia (secondary)'),
                   ('v2_base', 'Variant 2 base: every break, entered at the break (per signal)'), ('v2_sig', '… acceptance + retest entry, per SIGNAL (no trade = 0)'),
                   ('v2_trade', '… acceptance + retest entry, per filled trade')):
        v = r[k]
        if v: print(f'| {lab} | {v[3]:,} | {f3(v[0])} | {f3(v[1])} | {f3(v[2])} |')
    print(f"\nRetest outcomes: filled {r['fill']:.0%}, rejected (closed back inside within 5 bars) {r['rej']:.0%}, rest no retest within 120 min.\n")
print(f"**Variant 1 (trend-day filter): {'PASS' if p1 else 'FAIL'}** · **Variant 2 (acceptance-retest entry): {'PASS' if p2 else 'FAIL'}**")
