"""Break trades when implied vol is rich — forge/BREAK_IVRV_PREREG.md.
    python scripts/rangebook/break_ivrv_test.py > analysis/output/rangebook/BREAK_IVRV_RESULTS.md
"""
import bisect, json, math, os
import numpy as np, pandas as pd

MAIN = os.environ.get('MAIN_REPO', r'..\MacroFXModel')
CV = {'audusd': 'AUDUSD', 'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
SETTLE = {'audusd': 'aud_usd', 'eurusd': 'eur_usd', 'gbpusd': 'gbp_usd', 'usdcad': 'usd_cad', 'usdchf': 'usd_chf', 'usdjpy': 'usd_jpy'}
CELLS = [('0.1', 'r5'), ('0.1', 'r10'), ('0.2', 'r5'), ('0.2', 'r10')]

def rv20(dates, px):
    lr = np.diff(np.log(np.asarray(px, float))); out = {}
    for i in range(21, len(dates)):
        v = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if v > 0: out[dates[i]] = v
    return out
def before(series_dates, m, date):
    i = bisect.bisect_left(series_dates, date) - 1
    return m.get(series_dates[i]) if i >= 0 else None

cv = json.load(open('js/data/cmeCvolEod.json'))['series']
cvol = {}
for p, k in CV.items():
    rows = cv[k]; d = [r['date'] for r in rows]; rv = rv20(d, [r['underlying'] or np.nan for r in rows])
    m = {d[i]: rows[i]['cvol'] / rv[d[i]] for i in range(len(d)) if d[i] in rv}; cvol[p] = (sorted(m), m)
settle = {}
for p, f in SETTLE.items():
    x = pd.read_parquet(os.path.join(MAIN, 'oi_research_book', 'data', f'iv_daily_{f}.parquet')).sort_values('date')
    d = [str(t)[:10] for t in x['date']]; rv = rv20(d, x['F_front'].to_numpy())
    m = {d[i]: x['iv30'].iat[i] * 100 / rv[d[i]] for i in range(len(d)) if d[i] in rv and x['iv30'].iat[i] == x['iv30'].iat[i]}
    settle[p] = (sorted(m), m)

T = []
for p in CV:
    for t in json.load(open(f'analysis/output/rangebook/{p}_asym.json'))['rows']:
        if t['type'] != 'BREAK': continue
        R = [t['s' + s][tg]['R'] for s, tg in CELLS if t.get('s' + s) and t['s' + s].get(tg)]
        if len(R) != 4: continue
        T.append({'inst': p, 'date': t['date'], 'year': t['date'][:4], 'dir': t['dir'], 'R': R,
                  'cv': before(*cvol[p], t['date']), 'st': before(*settle[p], t['date']) if p in settle else None})
D = pd.DataFrame(T); D[['c1', 'c2', 'c3', 'c4']] = pd.DataFrame(D['R'].tolist(), index=D.index); D['Rm'] = D[['c1', 'c2', 'c3', 'c4']].mean(axis=1)
e_cv = np.nanpercentile(D.loc[D['date'] < '2023-01-01', 'cv'].dropna(), [100 / 3, 200 / 3])
e_st = np.nanpercentile(D.loc[(D['date'] < '2023-01-01') & D['st'].notna(), 'st'], [100 / 3, 200 / 3])
top = D['cv'] >= e_cv[1]; bot = D['cv'] < e_cv[0]
f3 = lambda x: f'{x:+.3f}'

checks = {}
st_top = D[D['st'] >= e_st[1]]
checks['1 independent IV (settlement iv30, 6 FX, 2020-09 →)'] = (st_top['Rm'].mean() > 0, f"{f3(st_top['Rm'].mean())}R, n={len(st_top):,} (CVOL top third on the same rows: {f3(D[top & D['st'].notna()]['Rm'].mean())})")
per = D[top].groupby('inst')['Rm'].mean()
checks['2 instruments (≥ 5 of 7 positive)'] = ((per > 0).sum() >= 5, ', '.join(f'{k.upper()} {f3(v)}' for k, v in per.items()))
yr = D[top & (D['year'] <= '2025')].groupby('year')['Rm'].mean()
checks['3 years (≥ 7 of 10 positive)'] = ((yr > 0).sum() >= 7, ', '.join(f'{k} {f3(v)}' for k, v in yr.items()))
cells = [(D[top][c].mean(), D[bot][c].mean()) for c in ('c1', 'c2', 'c3', 'c4')]
checks['4 mechanism (bottom < top in all 4 cells)'] = (all(b < a for a, b in cells), '; '.join(f'{s}σ {tg}: top {f3(a)} vs bottom {f3(b)}' for (s, tg), (a, b) in zip(CELLS, cells)))
lo, sh = D[top & (D['dir'] > 0)]['Rm'].mean(), D[top & (D['dir'] < 0)]['Rm'].mean()
checks['5 longs and shorts both positive'] = (lo > 0 and sh > 0, f'longs {f3(lo)}, shorts {f3(sh)}')

print('# Break trades when implied vol is rich — results\n')
print(f"Pre-registration: forge/BREAK_IVRV_PREREG.md (06414e8). BREAK trades on the 7 CVOL instruments, mean net R over 0.1/0.2σ × 5R/10R. "
      f"Top third of IV ÷ RV (CVOL edges from 2016–22: {e_cv[0]:.2f} / {e_cv[1]:.2f}): {f3(D[top]['Rm'].mean())}R per trade, n={int(top.sum()):,}; "
      f"middle {f3(D[~top & ~bot]['Rm'].mean())}; bottom {f3(D[bot]['Rm'].mean())}.\n")
print('| check | result | detail |\n|---|---|---|')
for k, (ok, det) in checks.items(): print(f"| {k} | {'holds' if ok else '**fails**'} | {det} |")
print(f"\n**Verdict: {'PASS' if all(ok for ok, _ in checks.values()) else 'FAIL'}** ({sum(ok for ok, _ in checks.values())} of 5 checks hold).")
