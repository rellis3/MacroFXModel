"""fomc-range-share extras (POST-HOC, results seen -- describes only, never promotes): (a) press-conference vs statement-only meetings inside 2016-18,
(b) share of FOMC days whose session high or low printed inside S / P, against ordinary days. Seed 20261114."""
import os, json
import numpy as np, pandas as pd
import run as R

ms = R.meetings(); chk, hi = R.calendar_checks(); T = R.build_all()
pm, cand, bad = R.placebo_days(T, hi, ms)
M = pd.read_csv(os.path.join(R.OUT, 'meetings.csv'))
M['date'] = pd.to_datetime(M['date']); M = M[M['ex_rvs_P'].notna()]
a = M[(M['date'].dt.year <= 2018) & M['presser']]['ex_rvs_P'].values
b = M[(M['date'].dt.year <= 2018) & ~M['presser']]['ex_rvs_P'].values
rng = np.random.default_rng(R.SEED)
diff = np.array([a[rng.integers(0, len(a), len(a))].mean() - b[rng.integers(0, len(b), len(b))].mean() for _ in range(2000)])
out = {'seed': R.SEED, 'post_hoc': True,
       'presser_2016_18_P_excess': {'n': int(len(a)), 'mean': float(a.mean())}, 'statement_only_2016_18_P_excess': {'n': int(len(b)), 'mean': float(b.mean())},
       'difference': {'mean': float(a.mean() - b.mean()), 'lo95': float(np.quantile(diff, .025)), 'hi95': float(np.quantile(diff, .975))}}


def extreme_share(dates):
    """share of (instrument, day) cells where the session high or low printed inside the window"""
    res = {}
    for w in ('S', 'P'):
        hit = n = 0
        for k, t in T.items():
            x = t.reindex(dates); x = x[x['ok'] == True]
            h = (x['hi_' + w] >= x['hi'] - 1e-12) | (x['lo_' + w] <= x['lo'] + 1e-12)
            hit += int(h.sum()); n += int(len(x))
        res[w] = {'share': hit / n if n else None, 'cells': n}
    return res


ev = [m for m in ms['date'] if m <= R.END]
pl = sorted(set(d for v in pm.values() for d in v))
out['extreme_in_window_FOMC_days'] = extreme_share(pd.DatetimeIndex(ev))
out['extreme_in_window_ordinary_days'] = extreme_share(pd.DatetimeIndex(pl))
json.dump(out, open(os.path.join(R.OUT, 'extras.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
