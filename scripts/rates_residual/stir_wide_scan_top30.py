"""Follow-up to the STIR wide scan (not in its protocol, so reported as a check, not a finding): how often does a scan
on day-shifted (scrambled) rates get as many of its top-30 discovery results to keep their sign in the holdout as the
real scan did (25/30)? The top results are correlated with each other, so 15/30 is not the right chance level.

    python scripts/rates_residual/stir_wide_scan_top30.py
"""
import json
from pathlib import Path

import numpy as np

src = Path("scripts/rates_residual/stir_wide_scan.py").read_text(encoding="utf-8")
exec(src.split('print(f"grid')[0])            # data, features and scan() only

rng2 = np.random.default_rng(777)


def top_agree(td, th, k=30):
    o = np.isfinite(td) & np.isfinite(th)
    td, th = td[o], th[o]
    i = np.argsort(-np.abs(td))[:k]
    return int((np.sign(td[i]) == np.sign(th[i])).sum())


_, TD, TH = scan(L)
real = top_agree(TD, TH)
nd_ = len(days)
sc = []
for k in range(30):
    sh = int(rng2.integers(5, nd_ - 5))
    Ls = L.copy()
    Ls[:] = np.roll(L.to_numpy(), sh * int(round(n / nd_)), axis=0)
    _, td, th = scan(Ls)
    sc.append(top_agree(td, th))
    print(f"scramble {k + 1}/30: top-30 same sign {sc[-1]}/30", flush=True)
sc = np.array(sc)
res = {"real_top30_same_sign": real, "scramble": sc.tolist(), "scramble_median": float(np.median(sc)),
       "scramble_p95": float(np.percentile(sc, 95)), "scrambles_at_or_above_real": int((sc >= real).sum())}
Path("analysis/output/stir_wide_scan/top30_check.json").write_text(json.dumps(res, indent=1))
print(res, flush=True)
