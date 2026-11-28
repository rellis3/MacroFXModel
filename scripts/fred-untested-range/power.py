"""fred-untested-range power table (control only): null SD of the tercile-difference statistic when the signal is a
synthetic persistent process unrelated to the outcome. Touches the outcome only through its own SD/autocorrelation, no
setup outcome is computed. Output: analysis/output/fred-untested-range/power.json"""
import json
import numpy as np
from common import *

rng = np.random.default_rng(SEED)
E, E5 = errors()
E5["POOL"] = E5[INSTS].mean(axis=1, skipna=False)
S = E5.index
res = {}
for phi in [0.95, 0.99, 0.998]:
    n_pre = MINWIN + 40
    sims = []
    for k in range(200):
        z = np.zeros(len(S) + n_pre); eps = rng.standard_normal(len(z))
        for t in range(1, len(z)): z[t] = phi * z[t - 1] + eps[t]
        sims.append(trailing_pct(z)[n_pre:])
    for per, m in [('disc', S < SPLIT), ('held', S >= SPLIT)]:
        for inst in INSTS + ["POOL"]:
            ev = E5[inst].values[m]
            st = np.array([tdiff(ev, s[m]) for s in sims])
            sd = float(np.nanstd(st))
            res.setdefault(per, {}).setdefault(inst, {})[str(phi)] = dict(
                null_sd_pct=100 * sd, mde95_pct=100 * (1.96 + 0.84) * sd, mde_holm10_pct=100 * (2.81 + 0.84) * sd,
                n=int(np.isfinite(ev).sum()))
json.dump(res, open(os.path.join(OUT, 'power.json'), 'w'), indent=1)
for per in res:
    for inst in INSTS + ["POOL"]:
        print(per, inst, {p: round(v['mde95_pct'], 1) for p, v in res[per][inst].items()}, res[per][inst]['0.99']['n'])
