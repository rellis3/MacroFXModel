"""Adaptive-stop targets (forge/LINE_TOUCH_ADAPTIVE_STOP_PREREG.md): stop = m x last-60-min range, clamped."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

sys.path.insert(0, str(Path(__file__).parent))
from build_features import M1, OUT, sim  # noqa: E402

MS = (0.5, 1.0, 1.5)


@njit(cache=True)
def run(h, l, c, ks, es, dirs, scales, m):
    n = len(ks)
    a, b, rp, lr = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    for i in range(n):
        k = ks[i]
        if k < 80 or es[i] <= k or scales[i] <= 0:
            continue
        hi, lo = h[k - 59], l[k - 59]
        for j in range(k - 59, k + 1):
            hi = max(hi, h[j])
            lo = min(lo, l[j])
        L = hi - lo
        lr[i] = L / scales[i]
        R = min(max(m * L, 0.05 * scales[i]), 0.50 * scales[i])
        rp[i] = R
        a[i] = sim(h, l, c, k, es[i], dirs[i], R)
        b[i] = sim(h, l, c, k, es[i], -dirs[i], R)
    return a, b, rp, lr


f = pd.read_parquet(OUT / "features.parquet", columns=["pair", "t", "side", "scale", "minsLeft"])
cols = {}
for m in MS:
    for nm in ("R_cont", "R_fade", "Rp"):
        cols[f"{nm}_L{m}"] = np.full(len(f), np.nan)
cols["L_over_scale"] = np.full(len(f), np.nan)
for pair, g in f.groupby("pair"):
    d = pd.read_parquet(M1 / f"{pair}_m1.parquet")
    if "time" in d.columns:
        d = d.set_index(pd.DatetimeIndex(pd.to_datetime(d["time"], utc=True)))
    if d.index.tz is None:
        d.index = d.index.tz_localize("UTC")
    d = d[~d.index.duplicated()].sort_index()
    tt = np.asarray(d.index.tz_convert("UTC").tz_localize(None), dtype="datetime64[s]").astype("int64")
    h, l, c = (d[x].to_numpy(float) for x in ("high", "low", "close"))
    ks = np.searchsorted(tt, g.t.to_numpy(), side="left").astype(np.int64)
    es = np.minimum(np.searchsorted(tt, (g.t + g.minsLeft * 60).to_numpy(), side="right") - 1, len(tt) - 1).astype(np.int64)
    for m in MS:
        a, b, rp, lr = run(h, l, c, ks, es, g.side.to_numpy(float), g.scale.to_numpy(float), m)
        cols[f"R_cont_L{m}"][g.index], cols[f"R_fade_L{m}"][g.index], cols[f"Rp_L{m}"][g.index] = a, b, rp
        cols["L_over_scale"][g.index] = lr
    print(pair, flush=True)
out = pd.DataFrame({"pair": f.pair, "t": f.t, **cols})
out.to_parquet(OUT / "targets_local.parquet")
print(out.drop(columns=["pair", "t"]).describe().T[["count", "mean"]])
