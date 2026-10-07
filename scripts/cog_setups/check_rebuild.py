"""Check our rebuild of C.OG's lines against his 72 published reference days (KV vol_reference_*).
    python scripts/cog_setups/check_rebuild.py <refdump.json>
"""
import sys, json, math, datetime as dt
import numpy as np
sys.path.insert(0, 'volatilityExhaustion')
from vol_exhaustion_lib import load_m1, build_london_daily, hv_sigma, causal_sigma

PATHS = {'EURUSD': 'VolRangeForecaster/data/m1/eurusd_m1.parquet', 'GOLD': 'VolRangeForecaster/data/m1/gold_m1.parquet',
         'NQ': 'portfolioBacktest/cache/nq_m1.parquet'}
ref = json.load(open(sys.argv[1]))['ref']
for ins, p in PATHS.items():
    d = build_london_daily(load_m1(p))
    dates = [str(dt.date(1970, 1, 1) + dt.timedelta(days=int(i))) for i in d['day_idx']]
    cands = {f'cc{w}': hv_sigma(d, w) for w in (20, 30)} | {'yz30': causal_sigma(d, 30)}
    for name, s in cands.items():
        a, b = [], []
        for i, k in enumerate(dates):
            r = ref.get(k, {}).get(ins)
            if r and s[i] > 0: a.append(r['vol']); b.append(s[i] * 100 * math.sqrt(252))
        a, b = np.array(a), np.array(b)
        if len(a): print(ins, name, 'n', len(a), 'median ratio his/ours %.3f' % np.median(a / b), 'corr %.3f' % np.corrcoef(a, b)[0, 1],
                         'mean abs err %.1f%%' % (100 * np.mean(np.abs(a / b / np.median(a / b) - 1))))
