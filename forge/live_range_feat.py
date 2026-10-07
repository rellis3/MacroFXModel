"""LIVE-RANGE-FEATURES build (forge/LIVE_RANGE_FEATURES_PREREG.md): causal features at every hourly checkpoint.

    python -m forge.live_range_feat
Writes analysis/output/live_range_features/features.parquet (inst, date, h, targets, features).
No Vote Atlas input: everything is computed from the local M1.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

from forge.bars import load_m1
from forge.live_range_replay import H, m1_key, m1_root
from forge.run_live_range_history_build import meta

OUT = Path("analysis/output/live_range_features"); OUT.mkdir(parents=True, exist_ok=True)
FC = ["h", "used", "speed", "U", "Dn", "vwapd", "roc1", "roc3", "accel", "wt1", "wtd", "rsi", "age", "pos", "vol1"]


def load_sessions_v(name):
    m = load_m1(m1_key(name), m1_root(m1_key(name))).tz_convert("Europe/London")
    m = m[m.index.hour < 22]
    f = m.resample("5min").agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna(subset=["open"])
    date = f.index.strftime("%Y-%m-%d").to_numpy()
    hrs = (f.index.hour + f.index.minute / 60.0).to_numpy(float)
    arr = f[["open", "high", "low", "close", "volume"]].to_numpy(float)
    cut = np.flatnonzero(date[1:] != date[:-1]) + 1
    st = np.r_[0, cut]; en = np.r_[cut, len(date)]
    return {date[s]: (hrs[s:e], *[arr[s:e, j] for j in range(5)]) for s, e in zip(st, en)}


@njit(cache=True)
def feats(hrs, op, hi, lo, cl, vol, unit):
    n = len(hrs)
    OUTA = np.full((21, 15), np.nan)
    kh = np.empty(23, np.int64)
    for h in range(23):
        k = 0
        while k < n and hrs[k] < h:
            k += 1
        kh[h] = k
    ap = (hi + lo + cl) / 3.0
    # WaveTrend (LazyBear 10 / 21, signal SMA4) over the session
    a1 = 2.0 / 11.0; a2 = 2.0 / 22.0
    esa = np.empty(n); d = np.empty(n); tci = np.empty(n); wt2 = np.empty(n)
    esa[0] = ap[0]; d[0] = 0.0; tci[0] = 0.0
    for i in range(1, n):
        esa[i] = esa[i - 1] + a1 * (ap[i] - esa[i - 1])
        d[i] = d[i - 1] + a1 * (abs(ap[i] - esa[i]) - d[i - 1])
        ci = (ap[i] - esa[i]) / (0.015 * d[i]) if d[i] > 1e-12 else 0.0
        tci[i] = tci[i - 1] + a2 * (ci - tci[i - 1])
    for i in range(n):
        s = 0.0; c = 0
        for j in range(max(0, i - 3), i + 1):
            s += tci[j]; c += 1
        wt2[i] = s / c
    sufH = np.empty(n + 1); sufL = np.empty(n + 1); sufH[n] = -np.inf; sufL[n] = np.inf
    for i in range(n - 1, -1, -1):
        sufH[i] = max(sufH[i + 1], hi[i]); sufL[i] = min(sufL[i + 1], lo[i])
    for h in range(1, 22):
        k = kh[h]
        if k < 15 or hrs[n - 1] < h:
            continue
        kp = kh[h - 1]; k3 = kh[max(h - 3, 0)]
        runH = hi[0]; runL = lo[0]; iH = 0; iL = 0
        for i in range(k):
            if hi[i] >= runH:
                runH = hi[i]; iH = i
            if lo[i] <= runL:
                runL = lo[i]; iL = i
        lastH = -np.inf; lastL = np.inf
        for i in range(kp, k):
            lastH = max(lastH, hi[i]); lastL = min(lastL, lo[i])
        r = h - 1
        OUTA[r, 0] = h; OUTA[r, 1] = (runH - runL) / unit
        OUTA[r, 2] = (lastH - lastL) / unit if kp < k else 0.0
        OUTA[r, 3] = (max(sufH[k], runH) - runH) / unit; OUTA[r, 4] = (runL - min(sufL[k], runL)) / unit
        sv = 0.0; spv = 0.0
        for i in range(k):
            sv += vol[i]; spv += ap[i] * vol[i]
        vw = spv / sv if sv > 0 else np.mean(ap[:k])
        OUTA[r, 5] = (cl[k - 1] - vw) / unit
        c0 = cl[kp - 1] if kp > 0 else op[0]
        OUTA[r, 6] = (cl[k - 1] - c0) / unit
        c3 = cl[k3 - 1] if k3 > 0 else op[0]
        OUTA[r, 7] = (cl[k - 1] - c3) / unit
        if k >= 13:
            OUTA[r, 8] = ((cl[k - 1] - cl[k - 7]) - (cl[k - 7] - cl[k - 13])) / unit
        OUTA[r, 9] = tci[k - 1]; OUTA[r, 10] = tci[k - 1] - wt2[k - 1]
        g = 0.0; l = 0.0
        for i in range(k - 14, k):
            dd = cl[i] - (cl[i - 1] if i > 0 else op[0])
            if dd > 0:
                g += dd
            else:
                l -= dd
        OUTA[r, 11] = 100.0 - 100.0 / (1.0 + g / l) if l > 1e-12 else 100.0
        OUTA[r, 12] = h - max(hrs[iH], hrs[iL])
        OUTA[r, 13] = (cl[k - 1] - runL) / (runH - runL) if runH > runL else 0.5
        v1 = 0.0
        for i in range(kp, k):
            v1 += vol[i]
        OUTA[r, 14] = v1
    return OUTA


def one(args):
    name, idx = args
    S = load_sessions_v(name); M = meta(name); rows = []
    for d, sg in zip(M.date, M.pit_sig_daily):
        if d not in S or len(S[d][0]) < 60:
            continue
        hrs, o, h, l, c, v = S[d]
        A = feats(hrs, o, h, l, c, v, sg / 100 * o[0])
        A = A[~np.isnan(A[:, 0])]
        rows.append(np.column_stack([np.full(len(A), idx), np.full(len(A), pd.Timestamp(d).toordinal()), A]))
    X = pd.DataFrame(np.vstack(rows), columns=["inst", "date"] + FC)
    X["inst"] = X.inst.astype(np.int16); X["date"] = X.date.astype(np.int32)
    # causal relative volume: last-hour volume / median of the same hour over the previous 20 sessions
    X = X.sort_values(["h", "date"])
    X["relvol"] = X.vol1 / X.groupby("h").vol1.transform(lambda s: s.shift(1).rolling(20, min_periods=10).median())
    print("done", name, flush=True)
    return X.drop(columns="vol1")


def main():
    names = sorted(p.stem for p in H.glob("*.csv"))
    with ProcessPoolExecutor(8) as ex:
        res = list(ex.map(one, [(n, i) for i, n in enumerate(names)]))
    X = pd.concat(res, ignore_index=True)
    X.astype({c: np.float32 for c in X.columns if c not in ("inst", "date")}).to_parquet(OUT / "features.parquet")
    pd.Series(names).to_json(OUT / "names.json")
    print("wrote", len(X))


if __name__ == "__main__":
    main()
