"""ladder-anchor-sweep build (forge/LADDER_ANCHOR_SWEEP_PREREG.md): per futures instrument and London anchor hour A,
the realised HL/OH/OL of the 22h window from A, every raced model's sigma from 24h blocks ending at A, and per-window
QLIKE for the walk-forward pick, the baseline and the oracle.

    python scripts/ladder-anchor-sweep/build.py [NQ GC 6E 6J]   -> analysis/output/ladder-anchor-sweep/{q_<SYM>.parquet, arms_<SYM>.csv}

Block keyed k (London wall-clock) = [k A:00, k+1 A:00). The target window keyed k = the first 22h of block k; its
features come from blocks keyed strictly before k.
"""
from __future__ import annotations

import sys
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from forge import vol as V  # noqa: E402

OUT = ROOT / "analysis/output/ladder-anchor-sweep"
SYMS = {"NQ": False, "GC": False, "6E": False, "6J": True}          # inverted?
LOCK = pd.Timestamp("2026-08-21")
EST = ["yz_10", "yz_20", "yz_30", "ewma_094", "ewma_090", "naive", "har_rv_log"]
GARCH = {"G_garch": dict(vol="GARCH", o=0, dist="normal"), "G_garch_t": dict(vol="GARCH", o=0, dist="t"),
         "G_gjr": dict(vol="GARCH", o=1, dist="normal"), "G_egarch": dict(vol="EGARCH", o=1, dist="normal")}
REG = {"R5": ["d1", "d5", "d22"], "R15": ["d1", "d5", "d22"], "SHAR": ["pos", "neg", "d5", "d22"],
       "HARCJ": ["c1", "c5", "c22", "j1"]}
ARMS = EST + list(REG) + list(GARCH) + ["B_har_garcht"]
LINES = ("hl", "oh", "ol")
CYEARS = range(2017, 2027)          # years with a QLIKE value (c from 2016 .. Y-1)
TEST = range(2020, 2027)
MIN_WIN, MIN_BLOCK = 1000, 600


def load(sym):
    d = pd.read_parquet(ROOT / f"analysis/output/nt8/continuous/{sym}_1m_ratio.parquet")
    d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)      # NT8 end-stamped
    d = d[~d.index.duplicated()].sort_index()
    d = d[d.index < pd.Timestamp("2026-08-23", tz="UTC")][["open", "high", "low", "close"]].astype(float)
    if SYMS[sym]:
        d = pd.DataFrame({"open": 1 / d["open"], "high": 1 / d["low"], "low": 1 / d["high"], "close": 1 / d["close"]})
    return d


def keys(idx, A):
    lt = idx.tz_convert("Europe/London").tz_localize(None) - pd.Timedelta(hours=A)
    k = lt.normalize()
    return k, (lt - k)                     # block key, offset from the block start (wall clock)


def asof_before(D, s):
    s = s.dropna().sort_index()
    pos = np.searchsorted(s.index.values, D.values, side="left") - 1
    out = np.full(len(D), np.nan)
    ok = pos >= 0
    out[ok] = s.to_numpy()[pos[ok]]
    return out


def anchor_frame(m, c5, c15, A):
    k, off = keys(m.index, A)
    g = m.groupby(k)
    blk = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
                        "close": g["close"].last(), "n": g.size()})
    blk = blk[blk["n"] >= MIN_BLOCK]
    # target: first 22h of each block
    w = m[off < pd.Timedelta(hours=22)]
    kw = k[off < pd.Timedelta(hours=22)]
    gw = w.groupby(kw)
    win = pd.DataFrame({"o": gw["open"].first(), "h": gw["high"].max(), "l": gw["low"].min(), "n": gw.size()})
    fri = win.index.dayofweek == 4
    win = win[(win["n"] >= MIN_WIN) & ~(fri & (A >= 1)) & (win.index.dayofweek != 5)]
    T = pd.DataFrame({"hl": (win["h"] - win["l"]) / win["o"] * 100, "oh": (win["h"] - win["o"]) / win["o"] * 100,
                      "ol": (win["o"] - win["l"]) / win["o"] * 100}, index=win.index)
    T["label"] = (T.index + pd.Timedelta(hours=A + 12)).normalize()
    T = T[T["label"] <= LOCK]
    D = pd.DatetimeIndex(T.index)
    # realised measures per block from 5 / 15-min closes
    rv = {}
    for kk, c in ((5, c5), (15, c15)):
        bk, _ = keys(c.index, A)
        r = np.log(c).groupby(bk).diff()
        x = (r ** 2).groupby(bk).sum()
        rv[kk] = x[x > 0].reindex(blk.index)
        if kk == 5:
            rsp = (r.clip(lower=0) ** 2).groupby(bk).sum().reindex(blk.index)
            rsn = (r.clip(upper=0) ** 2).groupby(bk).sum().reindex(blk.index)
            ar = r.abs()
            bv = (np.pi / 2 * ar * ar.groupby(bk).shift(1)).groupby(bk).sum().reindex(blk.index)
    S = pd.DataFrame(index=D)
    bb = blk.reset_index(drop=True)
    for e in EST:
        S[e] = asof_before(D, pd.Series(V.ESTIMATORS[e](bb).astype(float), index=blk.index)) / V.SQRT252
    lg = lambda x, b: np.log(np.maximum(x, 0.01 * b))
    r5, r15 = rv[5], rv[15]
    feats = {"R5": (pd.DataFrame({"d1": np.log(r5), "d5": np.log(r5.rolling(5, min_periods=5).mean()),
                                  "d22": np.log(r5.rolling(22, min_periods=22).mean())}), np.log(r5)),
             "R15": (pd.DataFrame({"d1": np.log(r15), "d5": np.log(r15.rolling(5, min_periods=5).mean()),
                                   "d22": np.log(r15.rolling(22, min_periods=22).mean())}), np.log(r15)),
             "SHAR": (pd.DataFrame({"pos": lg(rsp, r5), "neg": lg(rsn, r5), "d5": np.log(r5.rolling(5, min_periods=5).mean()),
                                    "d22": np.log(r5.rolling(22, min_periods=22).mean())}), np.log(r5))}
    C = np.minimum(r5, bv).where(bv > 0, r5)
    J = (r5 - C).clip(lower=0)
    feats["HARCJ"] = (pd.DataFrame({"c1": np.log(C), "c5": np.log(C.rolling(5, min_periods=5).mean()),
                                    "c22": np.log(C.rolling(22, min_periods=22).mean()), "j1": np.log1p(J / C)}), np.log(r5))
    regs = {}
    for name, (f, y) in feats.items():
        f = f.copy()
        f["y_next"] = y.shift(-1)
        f["next_date"] = pd.Series(blk.index, index=blk.index).shift(-1)
        regs[name] = f
        for c in REG[name]:
            S[f"{name}_{c}"] = asof_before(D, f[c])
    S["base"] = asof_before(D, np.sqrt(r5.rolling(5, min_periods=5).mean()) * 100)
    S["oracle_hl"] = np.sqrt(r5.reindex(D).to_numpy()) * 100          # positive control (prereg A1): the window's own
    S["oracle_oh"] = np.sqrt(rsp.reindex(D).to_numpy()) * 100         # total / upside / downside 5-min variance
    S["oracle_ol"] = np.sqrt(rsn.reindex(D).to_numpy()) * 100
    # GARCH: per year Y fit on block returns before Y, filter with fixed params; value at block t = forecast for t+1
    from arch import arch_model
    ret = (np.log(blk["close"]).diff() * 100).dropna()
    G = {}
    for Y in CYEARS:
        tr = ret[ret.index < pd.Timestamp(f"{Y}-01-01")]
        for gname, spec in GARCH.items():
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fit = arch_model(tr, mean="Constant", vol=spec["vol"], p=1, o=spec["o"], q=1, dist=spec["dist"]).fit(disp="off", show_warning=False)
                v = arch_model(ret, mean="Constant", vol=spec["vol"], p=1, o=spec["o"], q=1, dist=spec["dist"]) \
                    .fix(fit.params).forecast(horizon=1, start=0, reindex=True).variance["h.1"]
            G[(gname, Y)] = asof_before(D, np.sqrt(v))
    return T, S, regs, G


def per_year_sigmas(S, regs, G, Y):
    """Every arm's sigma (daily %) for all windows, with year-Y coefficients / params (fitted before Y)."""
    start = pd.Timestamp(f"{Y}-01-01")
    out = {e: S[e].to_numpy() for e in EST}
    for name, cols in REG.items():
        f = regs[name]
        f = f[np.isfinite(f[cols + ["y_next"]]).all(axis=1) & (f["next_date"] < start)]
        X = np.column_stack([np.ones(len(f))] + [f[c] for c in cols])
        coef, *_ = np.linalg.lstsq(X, f["y_next"].to_numpy(), rcond=None)
        s2 = float(np.var(f["y_next"].to_numpy() - X @ coef))
        Xw = np.column_stack([np.ones(len(S))] + [S[f"{name}_{c}"] for c in cols])
        out[name] = np.sqrt(np.exp(Xw @ coef + s2 / 2)) * 100
    for g in GARCH:
        out[g] = G[(g, Y)]
    out["B_har_garcht"] = 0.5 * (out["har_rv_log"] + out["G_garch_t"])
    out["base"] = S["base"].to_numpy()
    for q in LINES:
        out[f"oracle_{q}"] = S[f"oracle_{q}"].to_numpy()
    return out


def score_anchor(T, S, regs, G):
    yrs = T.index.year.to_numpy()
    sig = {Y: per_year_sigmas(S, regs, G, Y) for Y in CYEARS}
    ok = np.ones(len(T), bool)
    for q in LINES:
        ok &= T[q].to_numpy() > 0
    ok &= yrs >= 2016
    for Y in CYEARS:                         # same windows for every arm (each window checked with its own year's set)
        m = yrs == Y
        for a in ARMS + ["base"] + [f"oracle_{q}" for q in LINES]:
            ok[m] &= np.isfinite(sig[Y][a][m]) & (sig[Y][a][m] > 0)
    Q = {}
    for a in ARMS + ["base", "oracle"]:
        for q in LINES:
            x2 = T[q].to_numpy() ** 2
            out = np.full(len(T), np.nan)
            for Y in CYEARS:
                s2 = sig[Y][f"oracle_{q}" if a == "oracle" else a] ** 2
                tr, te = (yrs >= 2016) & (yrs < Y) & ok & np.isfinite(s2), (yrs == Y) & ok
                if tr.sum() > 50 and te.any():
                    h = np.mean(x2[tr] / s2[tr]) * s2[te]
                    r = x2[te] / h
                    out[te] = r - np.log(r) - 1
            Q[(a, q)] = out
    rows, board = [], []
    for q in LINES:
        for Y in TEST:
            te = (yrs == Y) & ok
            if not te.any():
                continue
            sel = (yrs >= 2017) & (yrs < Y) & ok
            mq = {a: np.nanmean(Q[(a, q)][sel]) for a in ARMS}
            pick = min(ARMS, key=lambda a: mq[a] if np.isfinite(mq[a]) else np.inf)
            for i in np.flatnonzero(te):
                rows.append((T.index[i], T["label"].iloc[i], Y, q, pick, Q[(pick, q)][i], Q[("base", q)][i],
                             Q[("oracle", q)][i], T[q].iloc[i]))
        k = np.isin(yrs, list(TEST)) & ok
        for a in ARMS + ["base", "oracle"]:
            board.append((q, a, float(np.nanmean(Q[(a, q)][k])), int(np.isfinite(Q[(a, q)][k]).sum())))
    R = pd.DataFrame(rows, columns=["key", "label", "year", "line", "pick", "q_pick", "q_base", "q_oracle", "x"])
    return R, pd.DataFrame(board, columns=["line", "arm", "qlike", "n"]), T


def run(sym):
    m = load(sym)
    c = m["close"]
    c5 = c.resample("5min", label="left", closed="left").last().dropna()
    c15 = c.resample("15min", label="left", closed="left").last().dropna()
    allq, allb, t0 = [], [], []
    for A in range(24):
        T, S, regs, G = anchor_frame(m, c5, c15, A)
        R, Bd, T = score_anchor(T, S, regs, G)
        R["anchor"], Bd["anchor"] = A, A
        allq.append(R); allb.append(Bd)
        if A == 0:
            t0 = T[["hl", "oh", "ol", "label"]]
        print(f"{sym} A={A:02d}: {len(T)} windows, test rows {len(R)}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    pd.concat(allq).assign(sym=sym).to_parquet(OUT / f"q_{sym}.parquet")
    pd.concat(allb).assign(sym=sym).to_csv(OUT / f"arms_{sym}.csv", index=False)
    t0.to_parquet(OUT / f"a00_lines_{sym}.parquet")
    return sym


if __name__ == "__main__":
    syms = sys.argv[1:] or list(SYMS)
    with ProcessPoolExecutor(max_workers=len(syms)) as ex:
        for s in ex.map(run, syms):
            print("done", s, flush=True)
