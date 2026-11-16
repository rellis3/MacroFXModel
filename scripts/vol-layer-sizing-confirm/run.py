"""vol-layer-sizing-confirm: does the sizing layer do its own job on unseen data? (forge/VOL_LAYER_SIZING_CONFIRM_PREREG.md)

A fixed, direction-free daily London-session hold (always long one unit, open -> 22:00), sized five ways:
  U   constant notional             F   forecast sigma (pit_sig_used; live_sig_used as a sensitivity)
  T20 trailing RV20 (min 15)        FA  sqrt(sigma^2 + 0.25 x trailing-250 median sigma^2)
  MM  sigma^2 (1/sigma^2 sizing)
Each z = r_ocs / size is divided by its own SD per instrument over the scored window (equal average risk).
Scored cells (Holm across four): a dev_F - dev_U, b dev_T20 - dev_F (TOST +/- 0.02), c quiet-day tail% FA - F, e dev_MM - dev_F.
Cell d (book: dollar share, all-to-1 cap, L03 transfer) is descriptive.

    python -X utf8 scripts/vol-layer-sizing-confirm/run.py --mode discovery   # reproduction + controls + mirror, <= 2022-12-30
    python -X utf8 scripts/vol-layer-sizing-confirm/run.py --mode confirm     # ONCE, 2023-01-01 .. 2026-08-20

Reads data from DATA_ROOT (the main checkout); writes only under this repo's analysis/output/vol-layer-sizing-confirm/.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import norm  # noqa: E402

import forecast_record as FR  # noqa: E402  (boot_weights: the shared stationary bootstrap)

DATA_ROOT = Path(r"c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
HIST = DATA_ROOT / "analysis/output/forecast_history"
OUTD = ROOT / "analysis/output/vol-layer-sizing-confirm"
SEED = 20261116
B = 2000
FR.SEED, FR.B = SEED, B
DISC = ("2016-10-24", "2022-12-30")
CONF = ("2023-01-01", "2026-08-20")
LOCKBOX = "2026-08-21"
MARGIN_B = 0.02
BARS = {"a": 0.05, "c": 0.25, "e": 0.05}
ALPHA_MDE = 0.0125
MAJORS = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"]
INDICES = ["DE30", "DOW", "NQ", "SPX500", "UK100", "US2000"]
CLASSES = ["FX majors", "FX crosses", "metals", "indices"]
USD_LEGS = {"EURUSD": 1, "GBPUSD": 1, "AUDUSD": 1, "NZDUSD": 1, "USDJPY": -1, "USDCAD": -1, "USDCHF": -1}
OTHER_LEGS = {"GOLD": 1, "NQ": 1, "SPX500": 1, "DOW": 1, "US2000": 1, "DE30": 1, "UK100": 1}
BOOK = {**USD_LEGS, **OTHER_LEGS}


def klass(inst):
    return "FX majors" if inst in MAJORS else "indices" if inst in INDICES else "metals" if inst == "GOLD" else "FX crosses"


def r4(x, k=4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return round(x, k) if np.isfinite(x) else None


# ── bootstrap ────────────────────────────────────────────────────────────────────────────────────────────────────────
_WC: dict = {}


def weights(n, block):
    k = (n, block)
    if k not in _WC:
        FR.SEED, FR.B, FR.BLOCK = SEED, B, block
        _WC[k] = FR.boot_weights(n).astype(np.float32)
    return _WC[k]


def boot_mean(keys, x, block):
    """Pooled mean of x, stationary bootstrap over the unique keys (months or dates). Returns est, lo, hi, reps."""
    keys = np.asarray(keys)
    x = np.asarray(x, float)
    ok = np.isfinite(x)
    keys, x = keys[ok], x[ok]
    uk = np.sort(pd.unique(keys))
    i = pd.Series(np.arange(len(uk)), index=uk)[keys].to_numpy()
    s = np.bincount(i, x, len(uk))
    c = np.bincount(i, minlength=len(uk)).astype(float)
    W = weights(len(uk), block)
    reps = (W @ s) / (W @ c)
    lo, hi = np.nanpercentile(reps, [2.5, 97.5])
    return float(x.mean()), float(lo), float(hi), reps


def p2(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean())))


def p_tost(reps, m):
    reps = reps[np.isfinite(reps)]
    return float(max((reps <= -m).mean(), (reps >= m).mean()))


def mde(lo, hi, tost=False):
    se = (hi - lo) / (2 * norm.ppf(0.975))
    k = norm.ppf(1 - ALPHA_MDE) + norm.ppf(0.9) if tost else norm.ppf(1 - ALPHA_MDE / 2) + norm.ppf(0.8)
    return float(k * se), float(se)


def holm(ps, alpha=0.05):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    adj = np.empty(m)
    run = 0.0
    for k, i in enumerate(o):
        run = max(run, min(1.0, (m - k) * ps[i]))
        adj[i] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    ok = ps[o] <= q * np.arange(1, m + 1) / m
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(m, bool)
    res[o[:k]] = True
    return res


def chance_baseline(tests, passes, alpha=0.05):
    from scipy.stats import binom
    return {"tests": tests, "passes": passes, "expected": round(tests * alpha, 2),
            "pAtLeastObserved": r4(binom.sf(passes - 1, tests, alpha), 4)}


# ── load ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def read_inst(f, end, src):
    d = pd.read_csv(f, usecols=["inst", "date", "oos", "pit_sig_used", "live_sig_used", "r_ocs", "rv5", "bv5"])
    d = d[d.date <= end]                                         # hard cut: nothing after the window end is read
    d = d.dropna(subset=[src, "r_ocs"]).sort_values("date").reset_index(drop=True)
    return d[d[src] > 0].reset_index(drop=True)


def load(src, start, end, lag=0, keep_trailing=False):
    """Every input known before the session opens. lag=1 delays sigma, RV, the median and the quiet label one session."""
    assert end < LOCKBOX
    rows = []
    for f in sorted(HIST.glob("*.csv")):
        d = read_inst(f, end, src)
        raw = d[src]
        d["sig"] = raw.shift(lag) if lag else raw
        d["sigL"] = raw.shift(1)
        for w in (10, 20, 40):
            d[f"rv{w}"] = np.sqrt((d.r_ocs ** 2).rolling(w, min_periods=max(4, int(w * 0.75))).mean().shift(1 + lag))
        d["sig2med"] = (raw ** 2).rolling(250, min_periods=120).median().shift(1 + lag)
        d["q33"] = raw.rolling(250, min_periods=120).quantile(1 / 3).shift(1 + lag)
        d["q67"] = raw.rolling(250, min_periods=120).quantile(2 / 3).shift(1 + lag)
        d["Jbar"] = (d.rv5 - d.bv5).clip(lower=0).rolling(60, min_periods=30).mean().shift(1 + lag)
        d["O"] = np.sqrt(d.rv5)                                  # hindsight ceiling (D3 only, not tradeable)
        rows.append(d)
    A = pd.concat(rows, ignore_index=True)
    if keep_trailing:
        return A
    D = A[(A.date >= start) & (A.date <= end)].dropna(subset=["sig", "rv20", "sig2med", "q33", "Jbar", "sigL"]).reset_index(drop=True)
    assert D.date.max() <= end and D.date.min() >= start
    D["month"] = D.date.str[:7]
    D["year"] = D.date.str[:4]
    D["klass"] = D.inst.map(klass)
    D["low"] = (D.sig < D.q33).to_numpy()
    D["loud"] = (D.sig > D.q67).to_numpy()
    return D


def load_stage3(end=DISC[1]):
    """Stage 3's exact loader (scripts/vol-layer-deep/sizing_wide.py load(), live sigma, its filters)."""
    rows = []
    for f in sorted(HIST.glob("*.csv")):
        d = read_inst(f, end, "live_sig_used")
        d["sig"] = d.live_sig_used
        d["Jbar"] = (d.rv5 - d.bv5).clip(lower=0).rolling(60, min_periods=30).mean().shift(1)
        d["rv20"] = np.sqrt((d.r_ocs ** 2).rolling(20, min_periods=15).mean().shift(1))
        d["sig2med"] = (d.live_sig_used ** 2).rolling(250, min_periods=120).median().shift(1)
        rows.append(d)
    D = pd.concat(rows, ignore_index=True)
    D = D[(D.date >= DISC[0]) & (D.date <= end)].dropna(subset=["sig", "rv20", "Jbar", "sig2med"]).reset_index(drop=True)
    D["month"] = D.date.str[:7]
    return D


def variants(D, extra=True):
    v = {"U": pd.Series(1.0, index=D.index), "F": D.sig, "T20": D.rv20, "MM": D.sig ** 2,
         "FA": np.sqrt(D.sig ** 2 + 0.25 * D.sig2med)}
    if extra:
        v.update({"T10": D.rv10, "T40": D.rv40, "FA10": np.sqrt(D.sig ** 2 + 0.10 * D.sig2med),
                  "FA50": np.sqrt(D.sig ** 2 + 0.50 * D.sig2med), "P75": D.sig ** 0.75, "P125": D.sig ** 1.25,
                  "P175": D.sig ** 1.75, "P225": D.sig ** 2.25, "O": D.O})
    return v


def scale(D, r=None, extra=True, sdref=None):
    """z = r / size, divided by the instrument's SD of z over the scored window (or a frozen reference SD)."""
    r = D.r_ocs if r is None else r
    Z = pd.DataFrame(index=D.index)
    for k, s in variants(D, extra).items():
        z = r / s
        if sdref is None:
            Z[k] = z / z.groupby(D.inst).transform("std")
        else:
            Z[k] = z / D.inst.map(sdref[k])
    return Z


def month_table(D, Z):
    g = pd.concat([D[["inst", "month"]], Z], axis=1).groupby(["inst", "month"])
    n = g.size()
    M = g[list(Z.columns)].std()[n >= 10].reset_index()
    for v in Z.columns:
        M["dev_" + v] = (M[v] - 1).abs()
    M["year"] = M.month.str[:4]
    M["klass"] = M.inst.map(klass)
    return M


def dev_diff(M, a, b, mask=None):
    S = M if mask is None else M[mask]
    x = (S["dev_" + a] - S["dev_" + b]).to_numpy()
    est, lo, hi, reps = boot_mean(S.month.to_numpy(), x, 3)
    return est, lo, hi, reps


def tail_diff(D, Z, a, b, mask):
    x = ((Z[a].abs() > 3).astype(float) - (Z[b].abs() > 3).astype(float)).to_numpy()[mask] * 100
    est, lo, hi, reps = boot_mean(D.date.to_numpy()[mask], x, 20)
    return est, lo, hi, reps


def tailrate(Z, v, mask):
    return float((Z[v].abs() > 3).to_numpy()[mask].mean() * 100)


def ci(est, lo, hi, k=4):
    return [r4(est, k), r4(lo, k), r4(hi, k)]


# ── controls ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def controls(D):
    """Positive and null controls on the window's own sigma path. Read no outcome."""
    rng = np.random.default_rng(SEED)
    eps = rng.standard_t(5, len(D)) / np.sqrt(5 / 3)
    Zs = scale(D, D.sig * eps, extra=False)
    Ms = month_table(D, Zs)
    pos = dev_diff(Ms, "F", "U")
    Zg = scale(D, pd.Series(rng.standard_normal(len(D)), index=D.index), extra=False)
    Mg = month_table(D, Zg)
    nul = dev_diff(Mg, "F", "U")
    return {"positive_F_minus_U": ci(*pos[:3]), "positive_pass": bool(pos[0] < -0.08),
            "null_F_minus_U": ci(*nul[:3]), "null_pass": bool(nul[0] > 0.08)}


def mirror(D, real, n=200):
    """Each instrument's sigma path shuffled in whole calendar months within the window; F - U recomputed."""
    rng = np.random.default_rng(SEED + 1)
    D = D.sort_values(["inst", "date"]).reset_index(drop=True)
    U = scale(D, extra=False)["U"]
    blocks = []
    for inst, g in D.groupby("inst", sort=False):
        bounds = np.flatnonzero(np.r_[True, g.month.to_numpy()[1:] != g.month.to_numpy()[:-1]])
        blocks.append((g.index.to_numpy(), np.split(g.sig.to_numpy(), bounds[1:])))
    out = []
    for _ in range(n):
        s = np.empty(len(D))
        for idx, bl in blocks:
            p = rng.permutation(len(bl))
            s[idx] = np.concatenate([bl[j] for j in p])
        z = D.r_ocs / s
        z = z / z.groupby(D.inst).transform("std")
        M = month_table(D, pd.DataFrame({"U": U, "F": z}))
        out.append(float((M.dev_F - M.dev_U).mean()))
    out = np.array(out)
    q = float(np.percentile(out, 2.5))
    return {"real": r4(real), "shuffle_mean": r4(out.mean()), "shuffle_p2.5": r4(q), "shuffle_min": r4(out.min()),
            "share_below_real": r4(float((out <= real).mean()), 3), "pass": bool(real < q), "n": n}


def reproduction():
    D = load_stage3()
    Z = scale(D, extra=False)
    M = month_table(D, Z)
    got = {"U": M.dev_U.mean(), "F": M.dev_F.mean(), "F-U": (M.dev_F - M.dev_U).mean(),
           "MM-F": (M.dev_MM - M.dev_F).mean(), "T20-F": (M.dev_T20 - M.dev_F).mean()}
    want = {"U": 0.2630, "F": 0.1524, "F-U": -0.1106, "MM-F": 0.1152, "T20-F": -0.0013}
    ok = all(abs(round(got[k], 4) - want[k]) < 1e-9 for k in want)
    return {"got": {k: r4(v) for k, v in got.items()}, "want": want, "pass": bool(ok), "rows": int(len(D)),
            "inst": int(D.inst.nunique())}


# ── the four cells ───────────────────────────────────────────────────────────────────────────────────────────────────
def cells(D, Z, M):
    """Point, CI, reps for a, b, c, e on the base spec; plus neighbours, years, all-day and loud-day checks."""
    low = D.low.to_numpy()
    allm = np.ones(len(D), bool)
    out = {}
    est, lo, hi, reps = dev_diff(M, "F", "U")
    out["a"] = {"est": est, "lo": lo, "hi": hi, "p": p2(reps), "n": int(M.month.nunique()), "unit": "months",
                "dev": {"U": r4(M.dev_U.mean()), "F": r4(M.dev_F.mean())},
                "plateau": {"P75-U": r4((M.dev_P75 - M.dev_U).mean()), "P125-U": r4((M.dev_P125 - M.dev_U).mean())}}
    est, lo, hi, reps = dev_diff(M, "T20", "F")
    out["b"] = {"est": est, "lo": lo, "hi": hi, "p": p_tost(reps, MARGIN_B), "p_diff": p2(reps), "n": int(M.month.nunique()),
                "unit": "months", "dev": {"T20": r4(M.dev_T20.mean()), "F": r4(M.dev_F.mean())},
                "neighbours": {"T10-F": r4((M.dev_T10 - M.dev_F).mean()), "T40-F": r4((M.dev_T40 - M.dev_F).mean())}}
    est, lo, hi, reps = tail_diff(D, Z, "FA", "F", low)
    alld = tail_diff(D, Z, "FA", "F", allm)
    loud = tail_diff(D, Z, "FA", "F", D.loud.to_numpy())
    out["c"] = {"est": est, "lo": lo, "hi": hi, "p": p2(reps), "n": int(D.date[low].nunique()), "unit": "quiet-day dates",
                "rate": {"F": r4(tailrate(Z, "F", low), 3), "FA": r4(tailrate(Z, "FA", low), 3), "U": r4(tailrate(Z, "U", low), 3)},
                "quiet_share": r4(low.mean(), 3),
                "plateau": {"FA10-F": r4(tail_diff(D, Z, "FA10", "F", low)[0], 3), "FA50-F": r4(tail_diff(D, Z, "FA50", "F", low)[0], 3)},
                "all_days": ci(*alld[:3], 3), "all_days_pass": bool(alld[1] <= 0),
                "loud_mirror": ci(*loud[:3], 3)}
    est, lo, hi, reps = dev_diff(M, "MM", "F")
    out["e"] = {"est": est, "lo": lo, "hi": hi, "p": p2(reps), "n": int(M.month.nunique()), "unit": "months",
                "dev": {"MM": r4(M.dev_MM.mean())},
                "plateau": {"P175-F": r4((M.dev_P175 - M.dev_F).mean()), "P225-F": r4((M.dev_P225 - M.dev_F).mean())}}
    # years
    yrs = sorted(M.year.unique())
    for c, (a, b) in {"a": ("F", "U"), "b": ("T20", "F"), "e": ("MM", "F")}.items():
        out[c]["years"] = {y: ci(*dev_diff(M, a, b, (M.year == y).to_numpy())[:3]) for y in yrs}
    out["c"]["years"] = {y: ci(*tail_diff(D, Z, "FA", "F", low & (D.year == y).to_numpy())[:3], 3) for y in yrs}
    return out


def lag_cells(src, start, end):
    """+1 lag: every input one session late, rows matched to the base sample."""
    D0 = load(src, start, end)
    DL = load(src, start, end, lag=1)
    key = ["inst", "date"]
    DL = DL.merge(D0[key], on=key, how="inner").reset_index(drop=True)
    ZL = scale(DL, extra=False)
    ML = month_table(DL, ZL)
    low = DL.low.to_numpy()
    return {"a": ci(*dev_diff(ML, "F", "U")[:3]), "b": ci(*dev_diff(ML, "T20", "F")[:3]),
            "c": ci(*tail_diff(DL, ZL, "FA", "F", low)[:3], 3), "e": ci(*dev_diff(ML, "MM", "F")[:3]), "rows": int(len(DL))}


def slices(D, Z, M):
    """Classes and instruments for a, c, e: BH q = 0.10 within each cell (38 slices)."""
    res = {}
    low = D.low.to_numpy()
    for c in ("a", "c", "e"):
        rows = []
        for kind, names, mcol, dcol in (("class", CLASSES, "klass", "klass"), ("inst", sorted(D.inst.unique()), "inst", "inst")):
            for nm in names:
                if c == "c":
                    m = low & (D[dcol] == nm).to_numpy()
                    est, lo, hi, reps = tail_diff(D, Z, "FA", "F", m)
                else:
                    a, b = ("F", "U") if c == "a" else ("MM", "F")
                    est, lo, hi, reps = dev_diff(M, a, b, (M[mcol] == nm).to_numpy())
                rows.append({"kind": kind, "name": nm, "est": r4(est), "lo": r4(lo), "hi": r4(hi), "p": p2(reps)})
        T = pd.DataFrame(rows)
        T["bh"] = bh(T.p.to_numpy())
        want = -1 if c in ("a", "c") else 1
        T["right_sign"] = np.sign(T.est) == want
        res[c] = {"rows": T.to_dict("records"),
                  "inst_right_sign": int(T[T.kind == "inst"].right_sign.sum()),
                  "inst_bh_right_sign": int((T[T.kind == "inst"].bh & T[T.kind == "inst"].right_sign).sum()),
                  "chance": chance_baseline(len(T), int((T.p < 0.05).sum()))}
    return res


def descriptive(D, Z, M):
    out = {}
    for v in ["U", "F", "T20", "FA", "MM"]:
        z = np.sort(Z[v].dropna().to_numpy())
        k = max(1, int(0.01 * len(z)))
        pos = 1.0 / variants(D, False)[v]
        pn = pos / pos.groupby(D.inst).transform("mean")
        turn = pn.groupby(D.inst).diff().abs().mean()
        out[v] = {"dev": r4(M["dev_" + v].mean()), "es1": r4(z[:k].mean(), 3), "p1": r4(np.quantile(z, 0.01), 3),
                  "exc3_all": r4((np.abs(z) > 3).mean() * 100, 3), "turnover": r4(turn, 4)}
    # D3: share of the reachable steadiness sigma delivers (O = own-session sqrt(rv5), hindsight)
    dU, dF, dO, dT = M.dev_U.mean(), M.dev_F.mean(), M.dev_O.mean(), M.dev_T20.mean()
    out["D3"] = {"dev_O": r4(dO), "share_F": r4((dU - dF) / (dU - dO), 3), "share_T20": r4((dU - dT) / (dU - dO), 3)}
    return out


# ── cell d: the book ─────────────────────────────────────────────────────────────────────────────────────────────────
def roll_corr(X, win=60):
    n, k = X.shape
    C = np.full((n, k, k), np.nan)
    for t in range(win, n):
        w = X[t - win:t]
        if np.all(w.std(0) > 0):
            C[t] = np.corrcoef(w.T)
    return C


def shrink(c, a=0.3):
    k = c.shape[0]
    off = (c.sum() - k) / (k * (k - 1))
    tgt = np.full_like(c, off)
    np.fill_diagonal(tgt, 1.0)
    return (1 - a) * c + a * tgt


def wq_es(z, w, q=0.01):
    cw = np.cumsum(w, 1)
    tot = cw[:, -1:]
    cut = (cw <= q * tot)
    k = np.argmax(cw >= q * tot, axis=1)
    qq = z[k]
    num = (w * cut * z).sum(1) + (q * tot[:, 0] - (w * cut).sum(1)) * qq
    return qq, num / (q * tot[:, 0])


def book(src, start, end):
    A = load(src, start, end, keep_trailing=True)
    A = A[A.inst.isin(BOOK)].copy()
    A["u"] = A.inst.map(BOOK) * A.r_ocs / A.sig
    A["raw"] = A.inst.map(BOOK) * A.r_ocs
    U = A.pivot(index="date", columns="inst", values="u").reindex(columns=list(BOOK)).sort_index()
    R = A.pivot(index="date", columns="inst", values="raw").reindex(columns=list(BOOK)).sort_index().fillna(0)
    X = U.fillna(0).to_numpy()
    C = roll_corr(X)
    k = X.shape[1]
    w = np.ones(k) / k
    iu = [list(BOOK).index(n) for n in USD_LEGS]
    bv = np.array([np.sqrt(w @ shrink(C[t]) @ w) if np.all(np.isfinite(C[t])) else np.nan for t in range(len(X))])
    Bk = pd.DataFrame({"ER": X @ w, "bv": bv, "f_usd": X[:, iu].mean(1)}, index=U.index)
    yc = Bk.ER.rolling(60).corr(Bk.f_usd).shift(1)
    Bk["r2"] = yc ** 2
    f_raw = R[list(USD_LEGS)].mean(1)
    dv = f_raw.rolling(63, min_periods=40).std().shift(1)
    q1 = dv.rolling(250, min_periods=120).quantile(1 / 3).shift(1)
    q2 = dv.rolling(250, min_periods=120).quantile(2 / 3).shift(1)
    Bk["dterc"] = np.where(dv < q1, "low", np.where(dv > q2, "high", np.where(q1.notna() & dv.notna(), "mid", "na")))
    Bk = Bk[(Bk.index >= start) & (Bk.index <= end)].dropna(subset=["bv"])
    assert Bk.index.max() <= end
    rng = np.random.default_rng(SEED + 2)
    Xw = U.loc[Bk.index].fillna(0).to_numpy()
    sh = []
    for _ in range(300):
        Xs = np.column_stack([rng.permutation(Xw[:, j])[:60] for j in range(k)])
        sh.append(np.corrcoef(Xs.mean(1), Xs[:, iu].mean(1))[0, 1] ** 2)
    v = Bk.r2.notna().to_numpy()
    dates = Bk.index.to_numpy()
    d1 = {"overall": r4(Bk.r2[v].mean(), 3), "shuffled": r4(np.mean(sh), 3), "year": {}, "dollar_vol_tercile": {}}
    for y in sorted(set(Bk.index.str[:4])):
        m = v & (Bk.index.str[:4] == y)
        d1["year"][y] = ci(*boot_mean(dates[m], Bk.r2.to_numpy()[m], 60)[:3], 3) + [int(m.sum())]
    for t in ("low", "mid", "high"):
        m = v & (Bk.dterc == t).to_numpy()
        if m.sum() > 20:
            d1["dollar_vol_tercile"][t] = ci(*boot_mean(dates[m], Bk.r2.to_numpy()[m], 60)[:3], 3) + [int(m.sum())]
    ER, BV = Bk.ER.to_numpy(), Bk.bv.to_numpy()
    uk = np.sort(pd.unique(dates))
    W = weights(len(uk), 20)
    months = Bk.index.str[:7]

    def steady(x):
        x = x / x.std()
        return float((pd.Series(x).groupby(months).std() - 1).abs().mean())
    d2 = {"binds": {}, "es_diff": {}, "steady": {}, "es": {}}
    xb = ER / BV
    xb = xb / xb.std()
    ob = np.argsort(xb)
    d2["steady"]["uncapped"] = r4(steady(ER / BV))
    d2["steady"]["unlevered"] = r4(steady(ER))
    for L in (1.5, 2.0, 3.0):
        xa = ER * np.minimum(1 / BV, L)
        xa = xa / xa.std()
        oa = np.argsort(xa)
        pa = []
        for s in range(0, B, 50):
            Wd = W[s:s + 50]
            _, ea = wq_es(xa[oa], Wd[:, oa])
            _, eb = wq_es(xb[ob], Wd[:, ob])
            pa.append(ea - eb)
        pa = np.concatenate(pa)
        one = np.ones((1, len(xa)), np.float32)
        pt = wq_es(xa[oa], one)[1][0] - wq_es(xb[ob], one)[1][0]
        d2["es_diff"][str(L)] = ci(pt, *np.nanpercentile(pa, [2.5, 97.5]), 3)
        d2["binds"][str(L)] = r4((1 / BV > L).mean(), 3)
        d2["steady"][f"cap {L}"] = r4(steady(ER * np.minimum(1 / BV, L)))
        d2["es"][str(L)] = r4(wq_es(xa[oa], one)[1][0], 3)
    d2["es"]["uncapped"] = r4(wq_es(xb[ob], np.ones((1, len(xb)), np.float32))[1][0], 3)
    z99 = norm.ppf(0.99)
    d2["var99_breach_pct"] = {"model": r4((ER < -z99 * BV).mean() * 100, 2), "stress": r4((ER < -z99).mean() * 100, 2)}
    d2["one_over_bv"] = [r4(np.median(1 / BV), 2), r4(np.percentile(1 / BV, 5), 2), r4(np.percentile(1 / BV, 95), 2)]
    return {"D1": d1, "D2": d2, "sessions": int(len(Bk))}


# ── verdicts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def same_half(x, base):
    return x is not None and np.sign(x) == np.sign(base) and abs(x) >= 0.5 * abs(base)


def judge(C, lag, mir, holm_p):
    V = {}
    for c in ("a", "b", "c", "e"):
        x = C[c]
        est, lo, hi = x["est"], x["lo"], x["hi"]
        gates = {}
        if c == "b":
            inside = lambda v: v is not None and abs(v) < MARGIN_B  # noqa: E731
            p_ok = holm_p[c] < 0.05 and inside(est)
            gates["lag"] = inside(lag["b"][0])
            gates["years"] = sum(inside(v[0]) for v in x["years"].values()) >= 3
            gates["years_n"] = sum(inside(v[0]) for v in x["years"].values())
            ok = p_ok and gates["lag"] and gates["years"]
            if ok:
                vd = "VALIDATED"
            elif p_ok:
                vd = "CONTEXT"
            elif hi < -MARGIN_B or lo > MARGIN_B:
                vd = "NULL"
            else:
                vd = "UNDERPOWERED"
        else:
            want = 1 if c == "e" else -1
            p_ok = holm_p[c] < 0.05 and np.sign(est) == want
            if c == "a":
                gates["plateau"] = all(same_half(v, est) for v in x["plateau"].values())
                gates["mirror"] = bool(mir["pass"])
            elif c == "e":
                gates["plateau"] = all(same_half(v, est) for v in x["plateau"].values())
            else:
                gates["plateau"] = all(v is not None and np.sign(v) == np.sign(est) for v in x["plateau"].values())
                gates["all_days"] = bool(x["all_days_pass"])
            gates["lag"] = bool(same_half(lag[c][0], est))
            ny = sum(np.sign(v[0]) == want for v in x["years"].values() if v[0] is not None)
            gates["years_n"] = int(ny)
            gates["years"] = ny >= 3
            ok = p_ok and all(v for k, v in gates.items() if k != "years_n")
            sig_wrong = (lo > 0 and want < 0) or (hi < 0 and want > 0)
            bar = BARS[c]
            if ok:
                vd = "VALIDATED"
            elif p_ok:
                vd = "CONTEXT"
            elif sig_wrong or (want < 0 and lo > -bar) or (want > 0 and hi < bar):
                vd = "NULL"
            else:
                vd = "UNDERPOWERED"
        V[c] = {"verdict": vd, "p_ok": bool(p_ok), "gates": {k: (bool(v) if isinstance(v, (bool, np.bool_)) else v) for k, v in gates.items()}}
    return V


# ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def score(window, src, do_mirror=True, sdref=None):
    start, end = window
    D = load(src, start, end)
    Z = scale(D, sdref=sdref)
    M = month_table(D, Z)
    C = cells(D, Z, M)
    lag = lag_cells(src, start, end)
    mir = mirror(D, C["a"]["est"]) if do_mirror else None
    return D, Z, M, C, lag, mir


def pack(C, lag):
    o = {}
    for c, x in C.items():
        y = dict(x)
        for k in ("est", "lo", "hi"):
            y[k] = r4(y[k], 4)
        o[c] = y
    o["lag"] = lag
    return o


def run_discovery():
    out = OUTD / "discovery"
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    res = {"mode": "discovery", "window": DISC, "seed": SEED, "B": B}
    res["reproduction"] = reproduction()
    print("reproduction", res["reproduction"], flush=True)
    D = load("pit_sig_used", *DISC)
    res["controls"] = controls(D)
    print("controls", res["controls"], flush=True)
    D, Z, M, C, lag, mir = score(DISC, "pit_sig_used")
    res["mirror"] = mir
    print("mirror", mir, flush=True)
    res["pit"] = pack(C, lag)
    res["rows"] = int(len(D))
    res["inst"] = int(D.inst.nunique())
    # frozen per-instrument SD of each sizing's z over discovery (for the confirm sensitivity)
    sd = {}
    for k, s in variants(D).items():
        z = D.r_ocs / s
        sd[k] = z.groupby(D.inst).std().to_dict()
    (out / "frozen_sd.json").write_text(json.dumps(sd, indent=1), encoding="utf-8")
    ok = res["reproduction"]["pass"] and res["controls"]["positive_pass"] and res["controls"]["null_pass"] and mir["pass"]
    res["step0_pass"] = bool(ok)
    res["seconds"] = round(time.time() - t0)
    (out / "discovery.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
    if not ok:
        (OUTD / "STEP0_FAILED.md").write_text(
            "# vol-layer-sizing-confirm: step 0 failed\n\nConfirm was not opened.\n\n```\n" + json.dumps(
                {k: res[k] for k in ("reproduction", "controls", "mirror")}, indent=1) + "\n```\n", encoding="utf-8")
    print("step0", ok, "secs", res["seconds"], flush=True)


def run_confirm():
    disc = json.loads((OUTD / "discovery/discovery.json").read_text(encoding="utf-8"))
    assert disc["step0_pass"], "step 0 did not pass; confirm stays closed"
    out = OUTD / "confirm"
    out.mkdir(parents=True, exist_ok=True)
    assert not (out / "confirm.json").exists(), "confirm already run once"
    t0 = time.time()
    res = {"mode": "confirm", "window": CONF, "seed": SEED, "B": B, "ranAt": pd.Timestamp.now("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")}
    # controls on the confirm sigma path, before any confirm outcome statistic
    D = load("pit_sig_used", *CONF)
    assert D.date.max() <= CONF[1]
    res["controls"] = controls(D)
    print("controls", res["controls"], flush=True)
    if not (res["controls"]["positive_pass"] and res["controls"]["null_pass"]):
        (out / "confirm.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
        (OUTD / "STEP0_FAILED.md").write_text("# controls failed on the confirm sigma path\n\n" + json.dumps(res["controls"], indent=1),
                                               encoding="utf-8")
        print("controls failed; stop")
        return
    D, Z, M, C, lag, mir = score(CONF, "pit_sig_used")
    res["mirror"] = mir
    res["rows"] = int(len(D))
    res["inst"] = int(D.inst.nunique())
    res["months"] = int(M.month.nunique())
    ps = [C[c]["p"] for c in ("a", "b", "c", "e")]
    hp = dict(zip(("a", "b", "c", "e"), holm(ps)))
    for c in ("a", "b", "c", "e"):
        m_, se = mde(C[c]["lo"], C[c]["hi"], tost=(c == "b"))
        C[c]["mde"] = r4(m_, 4)
        C[c]["se"] = r4(se, 5)
        C[c]["holm_p"] = r4(hp[c], 4)
    res["verdicts"] = judge(C, lag, mir, hp)
    res["pit"] = pack(C, lag)
    print(json.dumps(res["verdicts"]), flush=True)
    res["slices"] = slices(D, Z, M)
    res["descriptive"] = descriptive(D, Z, M)
    # sensitivities
    rng = np.random.default_rng(SEED)
    sgn = rng.choice([-1.0, 1.0], len(D))
    Zr = scale(D, D.r_ocs * sgn)
    Mr = month_table(D, Zr)
    Cr = cells(D, Zr, Mr)
    res["sens_random_sign"] = {c: ci(Cr[c]["est"], Cr[c]["lo"], Cr[c]["hi"]) for c in ("a", "b", "c", "e")}
    sdref = json.loads((OUTD / "discovery/frozen_sd.json").read_text(encoding="utf-8"))
    Zf = scale(D, sdref=sdref)
    Mf = month_table(D, Zf)
    Cf = cells(D, Zf, Mf)
    res["sens_frozen_scale"] = {c: ci(Cf[c]["est"], Cf[c]["lo"], Cf[c]["hi"]) for c in ("a", "b", "c", "e")}
    res["sens_frozen_scale"]["dev_U_F"] = [Cf["a"]["dev"]["U"], Cf["a"]["dev"]["F"]]
    Dl, Zl, Ml, Cl, lagl, _ = score(CONF, "live_sig_used", do_mirror=False)
    res["sens_live"] = {c: ci(Cl[c]["est"], Cl[c]["lo"], Cl[c]["hi"]) for c in ("a", "b", "c", "e")}
    res["sens_live"]["oos_share_pit"] = r4(D.oos.mean(), 3)
    print("sens done", round(time.time() - t0), flush=True)
    res["book"] = book("pit_sig_used", *CONF)
    res["seconds"] = round(time.time() - t0)
    (out / "confirm.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)),
                                      encoding="utf-8")
    pd.DataFrame([dict(cell=c, **r) for c in ("a", "c", "e") for r in res["slices"][c]["rows"]]).to_csv(out / "slices.csv", index=False)
    print("done", res["seconds"], flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["discovery", "confirm"], required=True)
    a = ap.parse_args()
    run_discovery() if a.mode == "discovery" else run_confirm()
