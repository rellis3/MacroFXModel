"""Shadow-rule inputs for the confirmed cells (prereg section 8): full-sample top-tercile edge and the mean miss on
trigger days (exp(mean e) on those days), per class; month-end uses the binary flag. Also the factor when several fire."""
import os, sys, math, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as R
S, E = R.errors(); sig = R.signals(S, E)
m = pd.Series(S.to_period('M'), index=S)
CONF = {'idx': ['spx5', 'vix_chg5'], 'fx': ['spx5', 'vix_chg5', 'vix_level', 'vix_term', 'spx60', 'month_end']}
out = {}
for c, names in CONF.items():
    e = E[c]; rows = {}; trig = pd.DataFrame(index=S)
    for nme in names:
        s = sig[nme]
        if nme == 'month_end':
            on = s == 1; edge = None
        else:
            edge = float(s.quantile(2 / 3)); on = s >= edge
        trig[nme] = on
        rows[nme] = dict(edge=edge, share_days=float(on.mean()), factor=float(math.exp(e[on].mean())), factor_other=float(math.exp(e[~on].mean())))
    anyon = trig.any(axis=1); n_on = trig.sum(axis=1)
    rows['_any'] = dict(share_days=float(anyon.mean()), factor=float(math.exp(e[anyon].mean())), factor_none=float(math.exp(e[~anyon].mean())),
                        by_count={int(k): round(float(math.exp(e[n_on == k].mean())), 4) for k in sorted(n_on.unique())})
    out[c] = rows
json.dump(out, open(os.path.join(R.OUT, 'shadow_factors.json'), 'w'), indent=2)
print(json.dumps(out, indent=1))
