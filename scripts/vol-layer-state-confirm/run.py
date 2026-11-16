"""vol-layer-state-confirm: cells A1, A2, C, D (forge/VOL_LAYER_STATE_CONFIRM_PREREG.md). Cell B is nudge.py.

    python -X utf8 scripts/vol-layer-state-confirm/run.py --window discovery   -> discovery/step0.json (+ cells)
    python -X utf8 scripts/vol-layer-state-confirm/run.py --window confirm     -> confirm/cells.json (refuses unless step 0 passed)

Session table: analysis/output/vol-layer-state-confirm/build/sessions.parquet (build.py). Chosen sigma:
analysis/output/line_reaction/chosen_lines.csv (DATA_ROOT). Seed 20261116. Stationary date-block bootstrap, block 20,
B = 2000 (block 60 sensitivity). Discovery reproduction uses B = 1000 as the prereg's scratch run did.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

WT = Path(__file__).resolve().parents[2]
DATA_ROOT = Path("c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
sys.path[:0] = [str(WT), str(WT / "scripts/forecast_history"), str(WT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import state as ST  # noqa: E402
from forecast_record import klass  # noqa: E402

OUT = WT / "analysis/output/vol-layer-state-confirm"
SESS = OUT / "build/sessions.parquet"
CHOSEN = DATA_ROOT / "analysis/output/line_reaction/chosen_lines.csv"
SEED = 20261116
LOCK_END = "2026-08-20"
WIN = {"discovery": ("2016-10-24", "2022-12-30"), "confirm": ("2023-01-01", LOCK_END)}
YEARS = {"discovery": ["2017", "2018", "2019", "2020", "2021", "2022"], "confirm": ["2023", "2024", "2025", "2026"]}
CLASSES = ["fx_majors", "fx_crosses", "gold", "indices"]
BAR = {"A1": 0.17, "A2": 0.10, "C": 0.10, "D": 0.05}
N_PLACEBO = 200


# ---------------------------------------------------------------- bootstrap
_WCACHE = {}


def boot_weights(n, block=20, B=2000, seed=SEED):
    key = (n, block, B, seed)
    if key in _WCACHE:
        return _WCACHE[key]
    rng = np.random.default_rng(seed)
    W = np.zeros((B, n))
    p = 1.0 / block
    for b in range(B):
        jumps = rng.random(n) < p
        starts = rng.integers(n, size=n)
        i = rng.integers(n)
        idx = np.empty(n, dtype=int)
        for t in range(n):
            if t and jumps[t]:
                i = starts[t]
            idx[t] = i
            i = (i + 1) % n
        W[b] = np.bincount(idx, minlength=n)
    _WCACHE[key] = W
    return W


def pval(reps, null=0.0):
    r = reps[np.isfinite(reps)]
    lo, hi = np.percentile(r, [2.5, 97.5])
    p = max(1 / (len(r) + 1), min(1.0, 2 * min((r <= null).mean(), (r >= null).mean())))
    return float(lo), float(hi), float(p), float(np.std(r))


class Boot:
    """Date sums -> bootstrap replicates of a statistic built from those sums."""

    def __init__(self, dates, block=20, B=2000, seed=SEED):
        self.dates = np.sort(pd.unique(dates))
        self.W = boot_weights(len(self.dates), block, B, seed)
        self.idx = pd.Series(np.arange(len(self.dates)), index=self.dates)

    def s(self, d, x):
        return np.bincount(self.idx[np.asarray(d)].to_numpy(), weights=np.asarray(x, float), minlength=len(self.dates))

    def run(self, d, cols, fn):
        """cols: dict name -> per-row values; fn(dict name -> sums) -> statistic (works on 1-d sums or B x 1 arrays)."""
        S = {k: self.s(d, v) for k, v in cols.items()}
        v = fn({k: x.sum() for k, x in S.items()})
        R = {k: self.W @ x for k, x in S.items()}
        reps = fn(R)
        return (float(v), *pval(reps))


# ---------------------------------------------------------------- statistics (row-level -> sums)
def fifths(df, col, q=5, by=("inst",)):
    return df.groupby(list(by))[col].transform(lambda s: pd.qcut(s.rank(method="first"), q, labels=False) if s.notna().sum() >= q * 4 else s * np.nan)


def gap_cols(y, grp, top, bot):
    """mean(y | grp == top) - mean(y | grp == bot)."""
    t, b = (grp == top).astype(float), (grp == bot).astype(float)
    return {"yt": y * t, "nt": t, "yb": y * b, "nb": b}


def gap_fn(S):
    return S["yt"] / S["nt"] - S["yb"] / S["nb"]


def dm(df, col, by="inst"):
    return df[col] - df.groupby(by)[col].transform("mean")


def slope_cols(x, y):
    return {"xy": x * y, "xx": x * x}


def one_minus_slope(S):
    return 1 - S["xy"] / S["xx"]


def dic_cols(a, b, y):
    return {"ay": a * y, "aa": a * a, "by": b * y, "bb": b * b, "yy": y * y}


def dic_fn(S):
    return S["ay"] / np.sqrt(S["aa"] * S["yy"]) - S["by"] / np.sqrt(S["bb"] * S["yy"])


def ic_fn(S):
    return S["ay"] / np.sqrt(S["aa"] * S["yy"])


# ---------------------------------------------------------------- month-block shuffle
def month_shuffle(df, col, rng):
    """Within instrument, whole calendar months are reassigned to other months (values tiled to the target length)."""
    out = np.full(len(df), np.nan)
    pos = np.arange(len(df))
    for _, g in df.groupby("inst", sort=False):
        months = g.date.str[:7].to_numpy()
        um, inv = np.unique(months, return_inverse=True)
        blocks = [g[col].to_numpy()[inv == k] for k in range(len(um))]
        rows = [pos[g.index.to_numpy()][inv == k] for k in range(len(um))]
        perm = rng.permutation(len(um))
        for k in range(len(um)):
            src = blocks[perm[k]]
            n = len(rows[k])
            out[rows[k]] = np.resize(src, n) if len(src) else np.nan
    return out


# ---------------------------------------------------------------- data
def regime(g):
    v63 = np.sqrt(g.rv5.shift(1).rolling(63).mean())
    med = v63.shift(1).rolling(252, min_periods=126).median()
    hot = (v63 > 1.25 * med).astype(float)
    hot[med.isna() | v63.isna()] = np.nan
    turb = hot.rolling(21).sum() == 21
    return pd.Series(np.where(hot.rolling(21).count() < 21, None, np.where(turb, "turbulent", "calm")), index=g.index)


def har_paths(g, ks=(3, 5, 10)):
    """Per instrument: the stage-1 quarterly log-HAR refit (state.py), iterated k sessions; mean RV-hat over t..t+k-1."""
    lrv = g.lrv.to_numpy()
    rv = g.rv5.to_numpy()
    X = ST.har_design(lrv)
    q = ST.quarter_starts(g.date)
    out = {k: np.full(len(g), np.nan) for k in ks}
    dates = g.date.to_numpy()
    for qs in np.unique(q):
        tr = np.flatnonzero(dates < qs)
        te = np.flatnonzero(q == qs)
        if len(tr) < ST.MIN_FIT:
            continue
        b, s2 = ST.har_fit(X[tr], lrv[tr])
        for i in te:
            if i >= 22:
                path = ST.har_iterate(b, s2, rv[:i], k=max(ks))
                for k in ks:
                    out[k][i] = np.mean(path[:k])
    return out


def load(window):
    lo, hi = WIN[window]
    D = pd.read_parquet(SESS)
    D = D[D.date <= hi].sort_values(["inst", "date"]).reset_index(drop=True)   # outcomes never run past the window end
    assert D.date.max() <= LOCK_END
    C = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"]).rename(columns={"sig": "c_sig"})
    C = C[C.date <= hi]
    D = D.merge(C, on=["inst", "date"], how="left")
    D["klass"] = D.inst.map(klass)
    D["year"] = D.date.str[:4]
    g = D.groupby("inst")
    D["hl_s"] = D.hl / D.sig
    D["hl_c"] = D.hl / D.c_sig
    D["hl_p"] = D.hl / D.pit_sig_used
    # +1 lag versions
    D["sig_l1"] = g.sig.shift(1)
    D["c_sig_l1"] = g.c_sig.shift(1)
    D["hl_s_l1"] = D.hl / D.sig_l1
    D["next_hl"] = g.hl.shift(-1)
    # past-only sigma fifth: rank against own previous 252 sessions
    def pct_past(s):
        v = s.to_numpy()
        o = np.full(len(v), np.nan)
        for i in range(len(v)):
            w = v[max(0, i - 252):i]
            w = w[np.isfinite(w)]
            if len(w) >= 126 and np.isfinite(v[i]):
                o[i] = (w < v[i]).mean()
        return pd.Series(o, index=s.index)
    D["sig_pct_past"] = g.sig.transform(pct_past)
    D["q_past"] = np.floor(D.sig_pct_past * 5).clip(upper=4)
    D["reg"] = D.groupby("inst", group_keys=False).apply(regime)
    # F5c: the chosen sigma's own error EWMA (half-lives 5, 10, 20), through t-1, minus expanding mean through t-1 (>= 20)
    D["e_c"] = 0.5 * D.lrv - np.log(D.c_sig)
    for hl_ in (5, 10, 20):
        lam = 0.5 ** (1 / hl_)
        def f5c(s, lam=lam):
            s2 = s.dropna()
            ew = s2.ewm(alpha=1 - lam, adjust=True).mean().shift(1)
            v = ew - s2.expanding(20).mean().shift(1)
            return v.reindex(s.index)
        D[f"F5c_{hl_}"] = D.groupby("inst").e_c.transform(f5c)
    D["F5c"] = D.F5c_10
    D["F5c_l1"] = D.groupby("inst").F5c.shift(1)
    # D: MR5, realised change, horizons
    last5 = D.groupby("inst").rv5.transform(lambda s: s.shift(1).rolling(5).mean())
    med252 = D.groupby("inst").rv5.transform(lambda s: s.shift(1).rolling(252, min_periods=126).median())
    D["MR5"] = 0.5 * np.log(med252 / last5)
    D["mF3"] = -D.F3
    for k in (3, 5, 10):
        nxt = D.groupby("inst").rv5.transform(lambda s, k=k: s[::-1].rolling(k).mean()[::-1])
        D[f"dlv_{k}"] = 0.5 * np.log(nxt / last5)
    paths = {}
    for s_, gg in D.groupby("inst", sort=False):
        p = har_paths(gg)
        for k, v in p.items():
            paths.setdefault(k, pd.Series(np.nan, index=D.index)).loc[gg.index] = v
    for k in (3, 5, 10):
        D[f"F2_{k}"] = 0.5 * np.log(paths[k] / last5)
    D["F2_l1"] = D.groupby("inst").F2.shift(1)
    D["MR5_l1"] = D.groupby("inst").MR5.shift(1)
    # GARCH-vt implied expected change (described): E[h_{t+j}] = s2 + (a+b)^(j)(h_{t+1}-s2) on the daily scale, scaled to RV5
    # by the past-only expanding ratio; here as 0.5*log(mean next-5 expected / mean last-5 RV5)
    # (uses the variance-targeted fit's sigma-bar; fits.json holds the quarter's params)
    # range-scale log-HAR / GARCH (past-only expanding mean of hl^2 / forecast, as stage 3)
    D["hl2"] = D.hl ** 2
    for c in ("har1", "garch_vt", "garch"):
        z = D.hl2 / D[c]
        D[f"{c}_g"] = np.sqrt(D[c] * z.groupby(D.inst).transform(lambda s: s.expanding(60).mean().shift(1)))
    D["srv5"] = np.sqrt(D.rv5)
    return D


# ---------------------------------------------------------------- cells
def cut(D, window, start=None):
    lo, hi = WIN[window]
    if start:
        lo = max(lo, start)
    return D[(D.date >= lo) & (D.date <= hi)]


def a1_rows(D, window, sig="sig", y="hl_s", q=5, qcol=None):
    start = "2017-01-01" if window == "discovery" else None
    E = cut(D, window, start).dropna(subset=["F1", "F5", "hl_s", sig, y]).copy()
    E["q"] = fifths(E, sig, q) if qcol is None else E[qcol]
    E = E.dropna(subset=["q"])
    return E


def a1_stat(E, y="hl_s", q=5, bs=None, block=20, B=2000):
    top = 0
    bot = q - 1
    cols = gap_cols(E[y].to_numpy(float), E.q.to_numpy(), top, bot)   # LOWEST sigma group minus HIGHEST
    bs = bs or Boot(E.date, block, B)
    return bs.run(E.date.to_numpy(), cols, gap_fn), E.date.nunique(), len(E)


def a2_rows(D, window, sig="c_sig", out="hl"):
    E = cut(D, window).dropna(subset=[sig, out]).copy()
    E = E[(E[out] > 0) & (E[sig] > 0)]
    E["lx"] = np.log(E[sig])
    E["ly"] = np.log(E[out])
    E["x"] = dm(E, "lx")
    E["yv"] = dm(E, "ly")
    return E


def a2_stat(E, block=20, B=2000):
    bs = Boot(E.date, block, B)
    return bs.run(E.date.to_numpy(), slope_cols(E.x.to_numpy(), E.yv.to_numpy()), one_minus_slope), E.date.nunique(), len(E)


def c_rows(D, window, f="F5c", y="hl_c"):
    E = cut(D, window).dropna(subset=[f, y, "c_sig"]).copy()
    E["q"] = fifths(E, f)
    return E.dropna(subset=["q"])


def c_stat(E, y="hl_c", block=20, B=2000):
    cols = gap_cols(E[y].to_numpy(float), E.q.to_numpy(), 4, 0)          # TOP error fifth minus BOTTOM
    return Boot(E.date, block, B).run(E.date.to_numpy(), cols, gap_fn), E.date.nunique(), len(E)


def d_rows(D, window, a="F2", b="MR5", y="dlv_5", every=1):
    start = "2018-01-01" if window == "discovery" else None
    E = cut(D, window, start).dropna(subset=[a, b, y]).copy()
    E = E[np.isfinite(E[a]) & np.isfinite(E[b]) & np.isfinite(E[y])]
    if every > 1:
        E = E[E.groupby("inst").cumcount() % every == 0]
    for c in (a, b, y):
        E[f"_{c}"] = dm(E, c)
    E.attrs["abc"] = (a, b, y)
    return E


def d_stat(E, block=20, B=2000, fn=dic_fn):
    a, b, y = E.attrs["abc"]
    cols = dic_cols(E[f"_{a}"].to_numpy(), E[f"_{b}"].to_numpy(), E[f"_{y}"].to_numpy())
    return Boot(E.date, block, B).run(E.date.to_numpy(), cols, fn), E.date.nunique(), len(E)


def pt(stat):
    """point value only (fast path for placebos)."""
    return stat


def gap_point(y, q, top, bot):
    return float(np.nanmean(y[q == top]) - np.nanmean(y[q == bot]))


def res(v, nd, n, extra=None):
    (est, lo, hi, p, se) = v
    r = {"est": est, "lo": lo, "hi": hi, "p": p, "se": se, "dates": int(nd), "rows": int(n)}
    if extra:
        r.update(extra)
    return r


# ---------------------------------------------------------------- step 0: reproduce + plants
REPRO = {"A1": (0.340, 0.271, 0.414, 0.0375, 1555), "A2": (0.041, -0.019, 0.112, 0.0333, 614),
         "A2_live": (0.269, 0.202, 0.345, 0.0361, 614), "C": (0.209, 0.134, 0.261, 0.0323, 594),
         "C_stage3": (0.039, -0.031, 0.105, 0.0352, 594), "D": (0.058, 0.021, 0.095, 0.0190, 1293)}


def discovery(D):
    out = {"reproduce": {}, "plants": {}, "power": {}}
    w = "discovery"
    B = 1000
    rep = out["reproduce"]
    E = a1_rows(D, w)
    rep["A1"] = res(*a1_stat(E, B=B))
    E2 = a2_rows(D, w)
    rep["A2"] = res(*a2_stat(E2, B=B))
    E2l = a2_rows(D, w, sig="sig")
    E2l = a2_refit(E2l[E2l.set_index(["inst", "date"]).index.isin(E2.set_index(["inst", "date"]).index)])   # demean on the same rows
    rep["A2_live"] = res(*a2_stat(E2l, B=B))
    Ec = c_rows(D, w)
    rep["C"] = res(*c_stat(Ec, B=B))
    Es = Ec.copy()
    Es["q"] = fifths(Es, "F5")
    rep["C_stage3"] = res(*c_stat(Es, B=B))
    Ed = d_rows(D, w)
    rep["D"] = res(*d_stat(Ed, B=B))
    ok = True
    for k, (v, lo, hi, se, nd) in REPRO.items():
        r = rep[k]
        r["target"] = {"est": v, "lo": lo, "hi": hi, "se": se, "dates": nd}
        r["est_match_3dp"] = bool(abs(r["est"] - v) < 1e-3)        # PRE-RESULTS amendment 1: |diff| < 0.001
        r["ci_match_3dp"] = bool(abs(r["lo"] - lo) < 5e-4 and abs(r["hi"] - hi) < 5e-4)
        r["se_ratio"] = r["se"] / se                              # bootstrap draws differ from the scratch run: reported, not gated
        r["dates_match"] = r["dates"] == nd
        ok &= r["est_match_3dp"] and r["dates_match"]
    out["reproduce_pass"] = bool(ok)

    # ---- plants (discovery data, outside the pipeline: outcomes replaced). PRE-RESULTS amendment 2: each plant / zero case is
    # the MEAN over NP month-block draws (point estimates), because one draw's noise (SE ~0.03) is wider than the +-0.02 tolerance.
    NP = 50
    P = out["plants"]

    def slope1(Z):
        x, y = Z.x.to_numpy(), Z.yv.to_numpy()
        return 1 - (x * y).sum() / (x * x).sum()

    def ic(a, y):
        return (a * y).sum() / np.sqrt((a * a).sum() * (y * y).sum())
    E = a1_rows(D, w).reset_index(drop=True)
    q1 = E.q.to_numpy()
    E2 = a2_rows(D, w).reset_index(drop=True)
    E2["ratio"] = np.log(E2.hl / E2.c_sig)
    Ec = c_rows(D, w).reset_index(drop=True)
    qc = Ec.q.to_numpy()
    z = ((Ec.F5c - Ec.F5c.mean()) / Ec.F5c.std()).to_numpy()
    Ed = d_rows(D, w).reset_index(drop=True)
    sd_y = Ed._dlv_5.std()
    acc = {k: [] for k in ("A1", "A2", "A2p", "Cp", "Cplanted", "C0", "D0")}
    for k in range(NP):
        rng = np.random.default_rng(SEED + 1000 + k)
        acc["A1"].append(gap_point(month_shuffle(E, "hl_s", rng), q1, 0, 4))
        rs = month_shuffle(E2, "ratio", rng)
        Z = E2[["inst", "date"]].copy()
        Z["hl"], Z["c_sig"] = E2.c_sig * np.exp(rs), E2.c_sig
        acc["A2"].append(slope1(a2_rows(Z.assign(date=Z.date), w)))
        Z["c_sig"] = E2.c_sig ** (1 / 0.85)
        acc["A2p"].append(slope1(a2_rows(Z, w)))
        ratio = month_shuffle(Ec, "hl_c", rng)
        y = (1 + 0.10 * z) * ratio
        acc["Cp"].append(gap_point(y, qc, 4, 0) - gap_point(ratio, qc, 4, 0))
        acc["Cplanted"].append(0.10 * (np.mean((z * ratio)[qc == 4]) - np.mean((z * ratio)[qc == 0])))
        Zc = Ec[["inst", "date"]].copy()
        Zc["f"] = month_shuffle(Ec, "F5c", rng)
        acc["C0"].append(gap_point(Ec.hl_c.to_numpy(), fifths(Zc, "f").to_numpy(), 4, 0))
        acc["D0"].append(ic(month_shuffle(Ed, "_F2", rng), Ed._dlv_5.to_numpy()))
    m = {k: float(np.mean(v)) for k, v in acc.items()}
    sd = {k: float(np.std(v)) for k, v in acc.items()}
    P["A1_calibrated"] = {"mean": m["A1"], "sd_draws": sd["A1"], "draws": NP, "pass": abs(m["A1"]) <= 0.02}
    P["A2_calibrated"] = {"mean": m["A2"], "sd_draws": sd["A2"], "draws": NP, "pass": abs(m["A2"]) <= 0.02}
    P["A2_plant_0.15"] = {"mean": m["A2p"], "sd_draws": sd["A2p"], "draws": NP, "pass": abs(m["A2p"] - 0.15) <= 0.02}
    P["C_plant"] = {"recovered_gap": m["Cp"], "planted_gap": m["Cplanted"], "draws": NP, "pass": abs(m["Cp"] - m["Cplanted"]) <= 0.03}
    P["C_zero"] = {"mean": m["C0"], "sd_draws": sd["C0"], "draws": NP, "pass": abs(m["C0"]) <= 0.02}
    P["D_zero_IC_F2"] = {"mean": m["D0"], "sd_draws": sd["D0"], "draws": NP, "pass": abs(m["D0"]) <= 0.02}
    rng = np.random.default_rng(SEED)
    for nm, src in (("D_plant_F2", "_F2"), ("D_plant_MR5", "_MR5")):
        Z = Ed.copy()
        Z["_dlv_5"] = 0.5 * Z[src] + rng.normal(0, sd_y, len(Z))
        a, b = Z._F2.to_numpy(), Z._MR5.to_numpy()
        sdD = np.sqrt(0.25 * np.mean(Z[src] ** 2) + sd_y ** 2)
        cf = 0.5 * np.mean(a * Z[src]) / (np.sqrt(np.mean(a ** 2)) * sdD) - 0.5 * np.mean(b * Z[src]) / (np.sqrt(np.mean(b ** 2)) * sdD)
        v = d_stat(Z, B=B)[0]
        want = 1 if src == "_F2" else -1
        P[nm] = {"est": v[0], "lo": v[1], "hi": v[2], "closed_form": float(cf), "pass": bool(np.sign(v[0]) == want and abs(v[0] - cf) <= 0.02)}
    out["plants_pass"] = bool(all(x["pass"] for x in P.values()))
    return out


# ---------------------------------------------------------------- the confirm cells
def placebo(fn, n=N_PLACEBO):
    vals = []
    for k in range(n):
        vals.append(fn(np.random.default_rng(SEED + k)))
    return np.array(vals)


def cell_A1(D, w):
    out = {}
    E = a1_rows(D, w)
    out["base"] = res(*a1_stat(E))
    out["block60"] = res(*a1_stat(E, block=60))
    out["neighbours"] = {"terciles": res(*a1_stat(a1_rows(D, w, q=3), q=3)), "deciles": res(*a1_stat(a1_rows(D, w, q=10), q=10))}
    Ep = a1_rows(D, w, qcol="q_past")
    out["extra_neighbour_past_only_fifths"] = res(*a1_stat(Ep))
    El = a1_rows(D, w, sig="sig_l1", y="hl_s_l1")
    out["lag1"] = res(*a1_stat(El, y="hl_s_l1"))
    out["years"] = {}
    for y in YEARS[w]:
        Ey = E[E.year == y].copy()
        Ey["q"] = fifths(Ey, "sig")
        out["years"][y] = res(*a1_stat(Ey.dropna(subset=["q"])))
    Eb = E.reset_index(drop=True)
    q = Eb.q.to_numpy()

    def one(rng):
        ys = month_shuffle(Eb, "hl_s", rng)
        return gap_point(ys, q, 0, 4)
    pl = placebo(one)
    out["placebo"] = {"p975": float(np.percentile(pl, 97.5)), "mean": float(pl.mean()), "n": len(pl)}
    out["slices"] = slices(E, a1_stat, refifth="sig")
    # described
    desc = {}
    Ea = a2_rows(D, w, sig="sig")
    desc["mz_live_1_minus_b"] = res(*a2_stat(Ea))
    for c in ("har1_g", "garch_vt_g"):
        Ec = cut(D, w).dropna(subset=[c, "hl", "F1", "F5"]).copy()
        Ec["y_"] = Ec.hl / Ec[c]
        Ec["q"] = fifths(Ec, c)
        desc[f"{c}_fifths"] = res(*a1_stat(Ec.dropna(subset=["q"]), y="y_"))
        Ez = a2_rows(D, w, sig=c)
        desc[f"{c}_1_minus_b"] = res(*a2_stat(Ez))
    Epit = a1_rows(D, w, sig="pit_sig_used", y="hl_p")
    desc["pit_sig_used_fifths"] = res(*a1_stat(Epit, y="hl_p"))
    desc["pit_sig_used_1_minus_b"] = res(*a2_stat(a2_rows(D, w, sig="pit_sig_used")))
    desc["ladder_live"] = ladder(E, "hl_s", "q")
    out["described"] = desc
    return out


def ladder(E, y, q):
    return {int(k): round(float(v), 4) for k, v in E.groupby(q)[y].mean().items()}


def slices(E, fn, refifth=None, refit=None):
    """class / instrument / year / regime slices; each re-ranked within the slice. Returns list with p for BH."""
    out = []
    for split, col, levels in (("class", "klass", CLASSES), ("instrument", "inst", sorted(E.inst.unique())),
                               ("year", "year", sorted(E.year.unique())), ("regime", "reg", ["calm", "turbulent"])):
        for lv in levels:
            S = E[E[col] == lv].copy()
            if S.date.nunique() < 60:
                continue
            if refifth:
                S["q"] = fifths(S, refifth)
                S = S.dropna(subset=["q"])
            if refit:
                S = refit(S)
            try:
                v, nd, n = fn(S)
            except Exception:
                continue
            out.append({"split": split, "level": lv, "est": v[0], "lo": v[1], "hi": v[2], "p": v[3], "dates": int(nd)})
    ps = np.array([o["p"] for o in out])
    keep = bh(ps)
    for o, k in zip(out, keep):
        o["bh"] = bool(k)
    return out


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    n = len(ps)
    if n == 0:
        return np.zeros(0, bool)
    o = np.argsort(ps)
    passed = ps[o] <= q * np.arange(1, n + 1) / n
    k = np.flatnonzero(passed).max() + 1 if passed.any() else 0
    r = np.zeros(n, bool)
    r[o[:k]] = True
    return r


def a2_refit(S):
    S = S.copy()
    S["x"] = dm(S, "lx")
    S["yv"] = dm(S, "ly")
    return S


def cell_A2(D, w):
    out = {}
    E = a2_rows(D, w)
    out["base"] = res(*a2_stat(E))
    out["block60"] = res(*a2_stat(E, block=60))
    En = a2_rows(D, w, out="srv5")
    En = En[En.c_sig.notna()]
    Ex = a2_rows(D, w, out="next_hl")
    out["neighbours"] = {"sqrt_rv5": res(*a2_stat(En)), "next_session_range": res(*a2_stat(Ex))}
    El = a2_rows(D, w, sig="c_sig_l1")
    out["lag1"] = res(*a2_stat(El))
    out["years"] = {y: res(*a2_stat(a2_refit(E[E.year == y]))) for y in YEARS[w]}
    Eb = E.reset_index(drop=True)
    Eb["ratio"] = Eb.ly - Eb.lx

    def one(rng):
        rs = month_shuffle(Eb, "ratio", rng)
        ly = Eb.lx.to_numpy() + rs
        yv = ly - pd.Series(ly).groupby(Eb.inst.to_numpy()).transform("mean").to_numpy()
        x = Eb.x.to_numpy()
        return 1 - (x * yv).sum() / (x * x).sum()
    pl = placebo(one)
    out["placebo"] = {"p975": float(np.percentile(pl, 97.5)), "p025": float(np.percentile(pl, 2.5)), "mean": float(pl.mean()), "n": len(pl)}
    out["slices"] = slices(E, a2_stat, refit=a2_refit)
    # described: fifths ladder of y / chosen sigma, and intercept (level bias = mean log(y / sigma))
    Ef = E.copy()
    Ef["hl_c"] = Ef.hl / Ef.c_sig
    Ef["q"] = fifths(Ef, "c_sig")
    out["described"] = {"ladder_chosen": ladder(Ef, "hl_c", "q"),
                        "fifths_low_minus_high": res(*a1_stat(Ef.dropna(subset=["q"]), y="hl_c")),
                        "level_mean_log_range_over_sigma": float((E.ly - E.lx).mean())}
    return out


def cell_C(D, w):
    out = {}
    E = c_rows(D, w)
    out["base"] = res(*c_stat(E))
    out["block60"] = res(*c_stat(E, block=60))
    out["neighbours"] = {"hl5": res(*c_stat(c_rows(D, w, f="F5c_5"))), "hl20": res(*c_stat(c_rows(D, w, f="F5c_20")))}
    out["lag1"] = res(*c_stat(c_rows(D, w, f="F5c_l1")))
    yrs = {}
    for y in YEARS[w]:
        S = E[E.year == y].copy()
        S["q"] = fifths(S, "F5c")
        yrs[y] = res(*c_stat(S.dropna(subset=["q"])))
    out["years"] = yrs
    Eb = E.reset_index(drop=True)
    y_ = Eb.hl_c.to_numpy()

    def one(rng):
        Z = Eb[["inst", "date"]].copy()
        Z["f"] = month_shuffle(Eb, "F5c", rng)
        q = fifths(Z, "f").to_numpy()
        return gap_point(y_, q, 4, 0)
    pl = placebo(one)
    out["placebo"] = {"p975": float(np.percentile(pl, 97.5)), "mean": float(pl.mean()), "n": len(pl)}
    out["slices"] = slices(E, c_stat, refifth="F5c")
    # mirror: each side against the middle fifth
    mid = E[E.q == 2].hl_c.mean()
    desc = {"ladder": ladder(E, "hl_c", "q"), "top_minus_middle": float(E[E.q == 4].hl_c.mean() - mid),
            "bottom_minus_middle": float(E[E.q == 0].hl_c.mean() - mid)}
    Es = cut(D, w).dropna(subset=["F5", "hl_c", "c_sig"]).copy()
    Es["q"] = fifths(Es, "F5")
    desc["stage3_form_live_F5"] = res(*c_stat(Es.dropna(subset=["q"])))
    ev = E.event.fillna("unknown")
    desc["event_unknown_share"] = float((ev == "unknown").mean())
    for lv in ("high", "none"):
        S = E[ev == lv].copy()
        S["q"] = fifths(S, "F5c")
        desc[f"event_{lv}"] = res(*c_stat(S.dropna(subset=["q"])))
    for lv in ("calm", "turbulent"):
        S = E[E.reg == lv].copy()
        S["q"] = fifths(S, "F5c")
        S = S.dropna(subset=["q"])
        if S.date.nunique() >= 30:
            desc[f"regime_{lv}"] = res(*c_stat(S))
    out["described"] = desc
    return out


def cell_D(D, w):
    out = {}
    E = d_rows(D, w)
    out["base"] = res(*d_stat(E))
    out["block60"] = res(*d_stat(E, block=60))
    out["ic_F2"] = res(*d_stat(E, fn=ic_fn))
    Em = d_rows(D, w, a="MR5", b="F2")
    out["ic_MR5"] = res(*d_stat(Em, fn=ic_fn))
    out["neighbours"] = {"h3": res(*d_stat(d_rows(D, w, a="F2_3", y="dlv_3"))), "h10": res(*d_stat(d_rows(D, w, a="F2_10", y="dlv_10")))}
    out["lag1"] = res(*d_stat(d_rows(D, w, a="F2_l1", b="MR5_l1")))
    out["every5th"] = res(*d_stat(d_rows(D, w, every=5)))
    out["years"] = {y: res(*d_stat(drefit(E[E.year == y]))) for y in YEARS[w]}
    Eb = E.reset_index(drop=True)
    b_, y_ = Eb._MR5.to_numpy(), Eb._dlv_5.to_numpy()
    icb = (b_ * y_).sum() / np.sqrt((b_ ** 2).sum() * (y_ ** 2).sum())

    def one(rng):
        a = month_shuffle(Eb, "_F2", rng)
        return (a * y_).sum() / np.sqrt((a ** 2).sum() * (y_ ** 2).sum()) - icb
    pl = placebo(one)
    out["placebo"] = {"p975": float(np.percentile(pl, 97.5)), "mean": float(pl.mean()), "n": len(pl)}
    out["slices"] = slices(E, d_stat, refit=drefit)
    out["described"] = {"vs_minus_F3": res(*d_stat(d_rows(D, w, b="mF3"))), "ic_minus_F3": res(*d_stat(d_rows(D, w, a="mF3", b="MR5"), fn=ic_fn))}
    return out


def drefit(S):
    S = S.copy()
    a, b, y = S.attrs.get("abc", ("F2", "MR5", "dlv_5"))
    for c in (a, b, y):
        S[f"_{c}"] = dm(S, c)
    S.attrs["abc"] = (a, b, y)
    return S


def main():
    w = sys.argv[sys.argv.index("--window") + 1]
    t0 = time.time()
    D = load(w)
    print("loaded", len(D), f"{time.time() - t0:.0f}s", flush=True)
    if w == "discovery":
        assert D.date.max() <= "2022-12-30"
        r = discovery(D)
        bld = json.loads((OUT / "discovery/step0_build.json").read_text())
        r["build_pass"] = bld["pass"]
        nud = OUT / "discovery/step0_nudge.json"
        r["nudge_pass"] = json.loads(nud.read_text())["pass"] if nud.exists() else None
        r["pass"] = bool(r["build_pass"] and r["reproduce_pass"] and r["plants_pass"] and r["nudge_pass"])
        (OUT / "discovery/step0.json").write_text(json.dumps(r, indent=1, default=float), encoding="utf-8")
        print(json.dumps(r, indent=1, default=float))
        return
    s0 = json.loads((OUT / "discovery/step0.json").read_text())
    if not s0.get("pass"):
        raise SystemExit("step 0 has not passed: confirm refused")
    cells = {}
    for nm, fn in (("A1", cell_A1), ("A2", cell_A2), ("C", cell_C), ("D", cell_D)):
        cells[nm] = fn(D, w)
        print(nm, json.dumps(cells[nm]["base"]), f"{time.time() - t0:.0f}s", flush=True)
    (OUT / "confirm/cells.json").write_text(json.dumps(cells, indent=1, default=float), encoding="utf-8")


if __name__ == "__main__":
    main()
