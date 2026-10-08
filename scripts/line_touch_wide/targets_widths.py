"""Structure targets at stop widths 0.20 and 0.30 of expected range (forge/LINE_TOUCH_COST_PREREG.md).
Adds R_cont_<w>/R_fade_<w> for the same touches as features.parquet. Run after build_features.py."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

sys.path.insert(0, str(Path(__file__).parent))
from build_features import M1, OUT, sim  # noqa: E402


@njit(cache=True)
def run(h, l, c, ks, es, dirs, scales, frac):
    n = len(ks)
    a = np.full(n, np.nan)
    b = np.full(n, np.nan)
    for i in range(n):
        if ks[i] < 80 or es[i] <= ks[i] or scales[i] <= 0:
            continue
        a[i] = sim(h, l, c, ks[i], es[i], dirs[i], frac * scales[i])
        b[i] = sim(h, l, c, ks[i], es[i], -dirs[i], frac * scales[i])
    return a, b


f = pd.read_parquet(OUT / "features.parquet", columns=["pair", "t", "side", "scale", "minsLeft"])
res = {w: [np.full(len(f), np.nan), np.full(len(f), np.nan)] for w in (0.2, 0.3)}
for pair, g in f.groupby("pair"):
    m = pd.read_parquet(M1 / f"{pair}_m1.parquet")
    if "time" in m.columns:
        m = m.set_index(pd.DatetimeIndex(pd.to_datetime(m["time"], utc=True)))
    if m.index.tz is None:
        m.index = m.index.tz_localize("UTC")
    m = m[~m.index.duplicated()].sort_index()
    tt = np.asarray(m.index.tz_convert("UTC").tz_localize(None), dtype="datetime64[s]").astype("int64")
    h, l, c = (m[x].to_numpy(float) for x in ("high", "low", "close"))
    ks = np.searchsorted(tt, g.t.to_numpy(), side="left").astype(np.int64)
    es = np.minimum(np.searchsorted(tt, (g.t + g.minsLeft * 60).to_numpy(), side="right") - 1, len(tt) - 1).astype(np.int64)
    for w in res:
        a, b = run(h, l, c, ks, es, g.side.to_numpy(float), g.scale.to_numpy(float), w)
        res[w][0][g.index], res[w][1][g.index] = a, b
    print(pair, flush=True)
out = pd.DataFrame({"pair": f.pair, "t": f.t})
for w, (a, b) in res.items():
    out[f"R_cont_{w}"], out[f"R_fade_{w}"] = a, b
out.to_parquet(OUT / "targets_widths.parquet")
print(out.describe().T[["count", "mean"]])
