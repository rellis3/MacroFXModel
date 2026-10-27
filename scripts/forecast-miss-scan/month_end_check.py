"""POST-HOC robustness (describe/demote only): is the FX month-end miss the forecaster's event days, or month-end itself?
Splits: last-2 vs first-2 sessions; excluding sessions the forecast tagged with an event; by year."""
import os, sys, math, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as R
d = pd.read_parquet(os.path.join(R.DATA, 'analysis/output/vf3_stage_b/part1_lines.parquet'), columns=['inst', 'date', 'oos', 'r_hl', 'klass', 'S_hl_p50', 'SI_hl_p50', 'event'])
d = d[(d.oos == 1) & d.klass.isin(['fx_majors', 'fx_crosses'])].copy(); d['date'] = pd.to_datetime(d['date'])
d['e'] = np.log(d.r_hl / d.SI_hl_p50.fillna(d.S_hl_p50)); d = d[np.isfinite(d.e)]
S = pd.DatetimeIndex(sorted(d.date.unique())); m = pd.Series(S.to_period('M'), index=S)
pos = m.groupby(m).cumcount().values; n = m.map(m.value_counts()).values
tag = pd.Series(np.where(pos >= n - 2, 'last2', np.where(pos <= 1, 'first2', 'other')), index=S)
ev = d.groupby('date').event.agg(lambda x: (x.fillna('none').astype(str) != 'none').mean()).reindex(S)
E = d.groupby('date').e.mean().reindex(S)
pct = lambda x: round(100 * (math.exp(x) - 1), 2)
out = {}
for half, msk in [('all', np.ones(len(S), bool)), ('2020-23', S < R.SPLIT), ('2023-26', S >= R.SPLIT)]:
    base = E[msk & (tag == 'other').values].mean()
    out[half] = {t: pct(E[msk & (tag == t).values].mean() - base) for t in ['last2', 'first2']}
    noev = msk & (ev.values < 0.5)
    b2 = E[noev & (tag == 'other').values].mean()
    out[half]['last2_no_event'] = pct(E[noev & (tag == 'last2').values].mean() - b2)
    out[half]['first2_no_event'] = pct(E[noev & (tag == 'first2').values].mean() - b2)
out['share_event_tagged'] = {t: round(float(ev[tag == t].mean()), 3) for t in ['last2', 'first2', 'other']}
out['by_year_last2'] = {str(y): pct(E[(S.year == y) & (tag == 'last2').values].mean() - E[(S.year == y) & (tag == 'other').values].mean()) for y in sorted(set(S.year))}
print(json.dumps(out, indent=1))
json.dump(out, open(os.path.join(R.OUT, 'month_end_check.json'), 'w'), indent=2)
