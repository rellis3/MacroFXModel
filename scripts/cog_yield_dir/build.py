"""Setup C for forge/COG_SPREAD_DIRECTION_PREREG.md: continue THROUGH his median line (stop order at open +/- 0.74 sigma,
stop 0.5 sigma back, target his 75th, else out 22:00). Setup A trades are reused from analysis/output/cog_setups/trades.csv.

    python scripts/cog_yield_dir/build.py   -> analysis/output/cog_yield_dir/trades.csv (A + C)
"""
import sys, datetime as dt
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0, 'volatilityExhaustion')
from vol_exhaustion_lib import load_m1, build_london_daily, hv_sigma

OUT = Path('analysis/output/cog_yield_dir'); OUT.mkdir(parents=True, exist_ok=True)
INS = {  # same as scripts/cog_setups/build.py
    'EURUSD': ('VolRangeForecaster/data/m1/eurusd_m1.parquet', 1.250, 0.008),
    'GOLD': ('VolRangeForecaster/data/m1/gold_m1.parquet', 1.146, 0.02),
    'NQ': ('portfolioBacktest/cache/nq_m1.parquet', 0.977, 0.008),
}
MED, P75, BACK = 0.74, 1.24, 0.24

rows = []
for ins, (path, scale, cost_pct) in INS.items():
    m1 = load_m1(path)
    d = build_london_daily(m1)
    mod_all, sig_all, cost = d['min_of_day_all'], hv_sigma(d, 30) * scale, cost_pct / 100
    for i in range(22, len(d['open'])):
        date = str(dt.date(1970, 1, 1) + dt.timedelta(days=int(d['day_idx'][i])))
        if date < '2016-10-04': continue
        s, e = d['start'][i], d['end'][i]
        mod = mod_all[s:e]; keep = mod < 22 * 60
        if keep.sum() < 600 or mod[0] > 5 or not sig_all[i] > 0: continue
        o, h, l, c = (m1[x][s:e][keep] for x in ('open', 'high', 'low', 'close')); mod = mod[keep]
        op, sig = o[0], sig_all[i]
        for side in (1, -1):
            E = op * (1 + side * MED * sig); stop = op * (1 + side * BACK * sig); tgt = op * (1 + side * P75 * sig)
            hit = np.flatnonzero((mod < 21 * 60) & ((h >= E) if side > 0 else (l <= E)))
            if not hit.size: continue
            k = hit[0]
            Ef = max(E, o[k]) if side > 0 else min(E, o[k])          # a stop order gapped through fills at the bar open (worse)
            if (l[k] <= stop) if side > 0 else (h[k] >= stop):
                res, ex = 'stop', stop
            else:
                res, ex = 'close', c[-1]
                for j in range(k + 1, len(o)):
                    if (l[j] <= stop) if side > 0 else (h[j] >= stop): res, ex = 'stop', stop; break
                    if (h[j] >= tgt) if side > 0 else (l[j] <= tgt): res, ex = 'target', tgt; break
            R = (side * (ex - Ef) - cost * Ef) / abs(E - stop)
            rows.append(dict(ins=ins, date=date, setup='C', side=side, fill_min=int(mod[k]), outcome=res, R=R))
    print(ins, 'done', flush=True)
A = pd.read_csv('analysis/output/cog_setups/trades.csv')
A = A[A.setup == 'A'][['ins', 'date', 'setup', 'side', 'fill_min', 'outcome', 'R']]
T = pd.concat([A, pd.DataFrame(rows)], ignore_index=True)
T.to_csv(OUT / 'trades.csv', index=False, float_format='%.5f')
print(T.groupby(['setup', 'ins']).R.agg(['size', 'mean']))
