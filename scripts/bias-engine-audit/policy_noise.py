"""bias-engine-audit, item 3: how persistent is the policy driver's d relative to the engine's 20-day horizon?

Exploratory, descriptive. The engine's policy driver is band(weekBp, [5, 15]) on the 5-business-day change of the priced
path (futures) or, as the fallback, the 2y government yield. Here: USD 2y (FRED DGS2, latest vintage), observations
before 2026-08-21. Reports the d marginals, day-to-day turnover, and the autocorrelation of d at 1, 5 and 20 days,
plus the same for the 2y LEVEL vs its 1y mean (a slow alternative), for contrast.

    python3 -I scripts/bias-engine-audit/policy_noise.py     -> analysis/output/bias-engine-audit/policy_noise.json
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'bias-engine-audit'
d = pd.read_csv(OUT / 'data' / 'DGS2.csv')
d.columns = ['date', 'v']
d['date'] = pd.to_datetime(d['date'])
d['v'] = pd.to_numeric(d['v'], errors='coerce')
s = d.dropna()
s = s[(s['date'] < pd.Timestamp('2026-08-21')) & (s['date'] >= pd.Timestamp('2010-01-01'))].set_index('date')['v']
wk = ((s - s.shift(5)) * 100).round(1)


def band(x, t1, t2):
    a = x.abs()
    return np.sign(x) * np.where(a >= t2, 2, np.where(a >= t1, 1, 0))


dd = pd.Series(band(wk, 5, 15), index=wk.index).where(wk.notna()).dropna()
out = {'note': 'Exploratory, descriptive. USD 2y (DGS2) 2010-01 -> 2026-08-20.',
       'n_days': int(len(dd)),
       'd_marginals': {str(int(k)): round(float(v), 3) for k, v in dd.value_counts(normalize=True).sort_index().items()},
       'share_days_d_changes': round(float((dd.diff().dropna() != 0).mean()), 3),
       'autocorr_d': {f'lag{k}': round(float(dd.autocorr(k)), 3) for k in (1, 5, 10, 20)},
       'abs_weekBp_quantiles': {str(q): round(float(wk.abs().quantile(q)), 1) for q in (0.25, 0.5, 0.75, 0.9)}}
(OUT / 'policy_noise.json').write_text(json.dumps(out, indent=1))
print(json.dumps(out, indent=1))
