"""vol-layer-stops-confirm: positive control, confirm build, and the one scoring pass (forge/VOL_LAYER_STOPS_CONFIRM_PREREG.md).

    python -X utf8 scripts/vol-layer-stops-confirm/score.py control   -> analysis/output/vol-layer-stops-confirm/control/control.json
                                                                        (random-walk M1 through the exact build + scoring code,
                                                                         plus a check that the scoring code reproduces the frozen
                                                                         discovery numbers). Writes STEP0_FAILED.md and exits 1 on failure.
    python -X utf8 scripts/vol-layer-stops-confirm/score.py build     -> .../confirm/{entries,overshoot,noise_entries}.parquet
                                                                        (2023-01-02 .. 2026-08-20, seed 20261116; M1 cut at
                                                                         2026-08-20 22:00 London before any path is read)
    python -X utf8 scripts/vol-layer-stops-confirm/score.py score     -> .../confirm/scored.json, results.json, RESULTS.md (frozen model; no refit)

Data (M1 bid/ask, forecast history, frozen profiles, discovery outputs) are read from DATA_ROOT (default: this repo).

Builders reused:
  * bid/ask stop paths: scripts/vol-layer-deep/execution_wide.build_one, called UNCHANGED. Its START/END/HIST/BA module
    globals are set to the confirm window and DATA_ROOT, and its `pd.read_parquet` sees a frame already cut at
    2026-08-20 22:00 London (prereg section 3), through a pandas proxy. The same call runs the simulated paths of the control.
  * noise map: scripts/noise-threshold/build.build_one, copied below line for line with the window and seed as arguments.
    Its hard-coded discovery guard (`date < 2023-01-01`) becomes `date <= END`; the frame passed in is the same cut frame.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import genpareto, norm

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("DATA_ROOT", ROOT))
sys.path[:0] = [str(ROOT / "scripts/vol-layer-stops-confirm"), str(ROOT / "scripts/vol-layer-deep"), str(ROOT),
                str(ROOT / "scripts/forecast_history")]
import freeze_discovery as FD  # noqa: E402
import execution_wide as EW  # noqa: E402

OUT = ROOT / "analysis/output/vol-layer-stops-confirm"
CONF = OUT / "confirm"
CTRL = OUT / "control"
FROZEN = OUT / "discovery/frozen_model.json"
STEADY = OUT / "discovery/steady_month.json"
DEXE = DATA / "analysis/output/vol-layer-deep/execution/wide"
DNOISE = DATA / "analysis/output/noise-threshold"
HIST = DATA / "analysis/output/forecast_history"
BA = DATA / "data/m1_bidask"
SEED = 20261116
START, END = "2023-01-02", "2026-08-20"
LON = "Europe/London"
CUT = pd.Timestamp(END + " 22:00").tz_localize(LON).tz_convert("UTC")        # nothing at or after this is read
B = 2000
HZ = FD.HZ
D = FD.D
CAL_MARGIN, SLOPE_LO, SLOPE_HI = 1.0, 0.90, 1.10
SKILL_BAR, STEADY_BAR, NOISE_MARGIN = 2.0, 2.0, 0.016
Z90, Z95 = 1.6449, 1.96

EW.START, EW.END, EW.HIST, EW.BA = START, END, HIST, BA


# ------------------------------------------------------------------ data access (cut before anything is read)
def load_ba(sym, cols, lo="2022-12-15"):
    df = pd.read_parquet(BA / f"{EW.BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=cols)
    t = pd.to_datetime(df["time"]).dt.as_unit("ns")
    t = t.dt.tz_localize("UTC") if t.dt.tz is None else t.dt.tz_convert("UTC")
    keep = (t >= pd.Timestamp(lo, tz="UTC")) & (t < CUT)
    df = df[keep.to_numpy()].reset_index(drop=True)
    df["time"] = t[keep.to_numpy()].reset_index(drop=True)
    assert df["time"].max() < CUT
    return df


class PdProxy:
    """pandas, except read_parquet returns the frame given (already cut / simulated); read_csv the sigma frame given."""

    def __init__(self, frame, sig=None):
        self.frame, self.sig = frame, sig

    def __getattr__(self, k):
        return getattr(pd, k)

    def read_parquet(self, path, columns=None):
        f = self.frame if columns is None else self.frame[columns]
        assert pd.to_datetime(f["time"], utc=True).max() < CUT, "lockbox guard"
        return f.copy()

    def read_csv(self, path, usecols=None):
        return self.sig.copy()


def sigma_frame(sym):
    """Session inputs, past only (as execution_wide.session_inputs): s, s_lag, s_fix (trailing 252 median through t-1)."""
    sg = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
    sg = sg[(sg.index <= END) & np.isfinite(sg) & (sg > 0)]
    X = pd.DataFrame({"s": sg})
    X["s_lag"] = sg.shift(1)
    X["s_fix"] = sg.shift(1).rolling(252, min_periods=60).median()
    X["ew10"] = np.nan                       # error-scaled stop not part of this study; its overshoot rows are skipped
    return X


def run_ew(sym, frame, X, rng):
    """execution_wide.build_one, unchanged, on the given (cut or simulated) frame."""
    real_pd = EW.pd
    EW.pd = PdProxy(frame)
    try:
        rows, _prof, _paths = EW.build_one(sym, X, rng, keep_paths=True)
    finally:
        EW.pd = real_pd
    over = []
    for r in rows:
        for o in r.pop("_over", []):
            over.append((sym, r["date"], r["minute"], *o))
    E = pd.DataFrame(rows)
    if len(E):
        E = E.join(X[["s", "s_lag", "s_fix"]], on="date")
    O = pd.DataFrame(over, columns=["inst", "date", "minute", "scale", "d", "side", "mins_to_hit", "over",
                                    "lossR_gross", "lossR_net", "gap_min", "hit_minute"])
    return E, O


# ---- scripts/noise-threshold/build.py build_one, copied; window passed in; reads the cut frame
N_START_M, N_HI, N_CLOSE = 60, 17 * 60, 21 * 60
N_HZ = {"h60": 60, "h240": 240, "eod": None}
N_ENTRY = 4


def noise_build_one(sym, rng, df, sig, start, end):
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    df = df.copy()
    df["date"] = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    df["m"] = idx.hour * 60 + idx.minute
    df = df[(df.date >= start) & (df.date <= end) & (df.m < N_CLOSE)]
    assert df.date.max() <= end
    rows = []
    for date, g in df.groupby("date", sort=True):
        s = sig.get(date)
        if s is None or not np.isfinite(s) or s <= 0 or len(g) < 600:
            continue
        g = g.sort_values("m")
        m, hi, lo, c = g.m.to_numpy(), np.log(g.high.to_numpy()), np.log(g.low.to_numpy()), np.log(g.close.to_numpy())
        sp = (g.ask_c - g.bid_c).to_numpy() / g.close.to_numpy()
        cand = np.flatnonzero((m >= N_START_M) & (m < N_HI))
        if len(cand) < 50:
            continue
        for i in rng.choice(cand, size=min(N_ENTRY, len(cand)), replace=False):
            e = c[i]
            for hz, h in N_HZ.items():
                stop_m = N_CLOSE if h is None else m[i] + h
                j = np.searchsorted(m, stop_m, side="right") - 1
                if j <= i:
                    continue
                up = (hi[i + 1:j + 1].max() - e) / s
                dn = (e - lo[i + 1:j + 1].min()) / s
                fin = (c[j] - e) / s
                for side, mae, f in (("long", dn, fin), ("short", up, -fin)):
                    rows.append((sym, date, int(m[i]), hz, side, mae, f, sp[i] / s, int(stop_m - m[i])))
    return pd.DataFrame(rows, columns=["inst", "date", "minute", "hz", "side", "mae", "final", "spread", "mins"])


# ------------------------------------------------------------------ statistics
def boot_weights(n, seed=SEED):
    return FD.boot_weights(n, seed=seed)


def pci(point, reps, lo=2.5, hi=97.5):
    reps = reps[np.isfinite(reps)]
    return {"est": float(point), "lo": float(np.percentile(reps, lo)), "hi": float(np.percentile(reps, hi)),
            "lo90": float(np.percentile(reps, 5)), "hi90": float(np.percentile(reps, 95)), "se": float(np.std(reps))}


def cal_stats(di, nd, y, p, pref, W):
    S = FD.date_sums(di, nd, y, p, pref)
    pt = FD.stats_from({k: v.sum() for k, v in S.items()})
    reps = FD.stats_from({k: W @ v for k, v in S.items()})
    return {"citl_pp": pci(100 * pt[0], 100 * reps[0]), "mz_slope": pci(pt[1], reps[1]), "bss_pct": pci(100 * pt[2], 100 * reps[2]),
            "n": int(len(y)), "hit": float(y.mean()), "p_mean": float(p.mean())}


def p_two(est, se, ref=0.0):
    return float(2 * (1 - norm.cdf(abs(est - ref) / se))) if se > 0 else 1.0


def p_tost(est, se, lo, hi):
    return float(max(1 - norm.cdf((est - lo) / se), 1 - norm.cdf((hi - est) / se)))


def holm(ps):
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
    if not m:
        return np.zeros(0, bool)
    o = np.argsort(ps)
    ok = ps[o] <= q * np.arange(1, m + 1) / m
    k = np.flatnonzero(ok).max() + 1 if ok.any() else 0
    out = np.zeros(m, bool)
    out[o[:k]] = True
    return out


def chance(tests, passes, alpha=0.05):
    from scipy.stats import binom
    return {"tests": tests, "passes": passes, "expected": tests * alpha, "pAtLeastObserved": float(binom.sf(passes - 1, tests, alpha))}


def steady(E, profs, seed=SEED):
    """Cell b by calendar month, whole-month cluster bootstrap: freeze_discovery.steady_month, the same code path."""
    Vx = FD.vol_clock(E, profs)["eod"]
    ok = np.isfinite(Vx) & E.L_eod.notna().to_numpy()
    rng = np.random.default_rng(seed)
    out = {}
    for d0 in (0.5, 1.0, 1.5):
        rw = 2 * norm.cdf(-d0 / np.sqrt(np.clip(Vx[ok], 1e-9, None)))
        df = pd.DataFrame({"m": E.date.str[:7].to_numpy()[ok]})
        for nm, mult in (("plain", np.ones(len(E))), ("fixed", (E.s_fix / E.s).to_numpy()), ("lag", (E.s_lag / E.s).to_numpy())):
            df[nm] = sum(((E[f"{s_}_eod"].to_numpy()[ok] >= d0 * mult[ok]).astype(float) - rw) for s_ in "LS") / 2
        M = df.groupby("m").mean()
        k = len(M)
        idx = rng.integers(k, size=(B, k))
        sd = {nm: M[nm].to_numpy()[idx].std(axis=1, ddof=1) for nm in ("plain", "fixed", "lag")}
        dl = sd["fixed"] - sd["plain"]
        out[str(d0)] = {"months": k, "sd_pp": {nm: 100 * float(M[nm].std()) for nm in sd},
                        "delta_pp": pci(100 * (M.fixed.std() - M.plain.std()), 100 * dl),
                        "delta_fixed_minus_lagplain_pp": pci(100 * (M.fixed.std() - M.lag.std()), 100 * (sd["fixed"] - sd["lag"])),
                        "per_month_pp": {mm: {nm: round(100 * float(M.at[mm, nm]), 3) for nm in ("plain", "fixed", "lag")} for mm in M.index}}
        if d0 == 1.0:   # by quarter, described
            q = pd.PeriodIndex(pd.to_datetime(M.index), freq="Q")
            Q = df.assign(q=pd.PeriodIndex(pd.to_datetime(df.m), freq="Q").astype(str)).groupby("q")[["plain", "fixed"]].mean()
            out["quarter_1.0"] = {"quarters": len(Q), "sd_pp": {nm: 100 * float(Q[nm].std()) for nm in ("plain", "fixed")}}
            del q
    return out


def noise_excess(N, ds, W, ndi, unit=None):
    """excess(d) = mean(final + d | mae >= d), pooled, date-bootstrap. unit: per-row multiplier s/s_lag to re-express in another sigma."""
    mae, fin = N.mae.to_numpy(), N.final.to_numpy()
    if unit is not None:
        mae, fin = mae * unit, fin * unit
    nd = W.shape[1]
    out = {}
    for d in ds:
        m = mae >= d
        x = (fin + d) * m
        a = np.bincount(ndi, weights=x, minlength=nd)
        b = np.bincount(ndi, weights=m.astype(float), minlength=nd)
        out[str(d)] = {**pci(a.sum() / b.sum(), (W @ a) / (W @ b)), "hits": int(m.sum())}
    return out


def noise_point(N, d):
    m = (N.mae >= d).to_numpy()
    return float((N.final.to_numpy()[m] + d).mean()) if m.any() else np.nan


def frame_from_entries(E, profs):
    E = E[E.s_lag.notna() & E.s_fix.notna()].reset_index(drop=True)
    dates = np.sort(E.date.unique())
    dpos = pd.Series(np.arange(len(dates)), index=dates)
    E["di"] = dpos[E.date].to_numpy()
    insts = sorted(E.inst.unique())
    E["inst_code"] = E.inst.map({s: i for i, s in enumerate(insts)})
    return E, dates, insts


# ------------------------------------------------------------------ simulation (positive control)
def simulate(sym, real, sig_const, prof, rng, scale=1.0):
    """Random-walk M1 on the real confirm timestamps. Variance runs on a trading clock: each weekday London date carries
    one day (sigma^2) spread by the frozen discovery 5-minute profile; Saturdays and Sundays carry none (as M_rw's V).
    Bar high/low are drawn exactly from the Brownian bridge between closes. Constant spread (median confirm spread)."""
    t = pd.DatetimeIndex(real["time"])
    loc = t.tz_convert(LON).tz_localize(None)
    day = loc.normalize()
    wkd = np.asarray(loc.dayofweek < 5)
    m = np.asarray(loc.hour * 60 + loc.minute)
    udays = np.sort(pd.unique(day[wkd]))
    # index of the bar's trading day; a weekend bar is placed at the start of the next weekday
    k = np.searchsorted(udays, np.asarray(day), side="left").astype(float)
    cum = np.r_[0.0, np.cumsum(prof)]
    frac = np.where(wkd, np.interp((m + 1) / 5.0, np.arange(289), cum), 0.0)
    clock = k + frac
    v = np.clip(np.diff(clock, prepend=clock[0]), 0, None) * (scale * sig_const) ** 2
    z = rng.standard_normal(len(v))
    x = np.cumsum(np.sqrt(v) * z)
    a = np.r_[x[0], x[:-1]]
    r1 = np.sqrt((x - a) ** 2 - 2 * v * np.log(rng.random(len(v))))
    r2 = np.sqrt((x - a) ** 2 - 2 * v * np.log(rng.random(len(v))))
    mx, mn = (a + x + r1) / 2, (a + x - r2) / 2
    mid0 = float(real["close"].iloc[0])
    sp = float(np.nanmedian((real["ask_c"] - real["bid_c"]).to_numpy()))
    sp = max(sp, 0.0)
    c, hi, lo, op = mid0 * np.exp(x), mid0 * np.exp(mx), mid0 * np.exp(mn), mid0 * np.exp(a)
    h = sp / 2
    return pd.DataFrame({"time": real["time"], "high": hi, "low": lo, "close": c, "bid_o": op - h, "bid_l": lo - h, "bid_c": c - h,
                         "ask_o": op + h, "ask_h": hi + h, "ask_c": c + h}), sp


def control():
    t0 = time.time()
    CTRL.mkdir(parents=True, exist_ok=True)
    frozen = json.loads(FROZEN.read_text(encoding="utf-8"))
    sm = json.loads(STEADY.read_text(encoding="utf-8"))
    profs = json.loads((DEXE / "profiles.json").read_text(encoding="utf-8"))
    gf, gs = np.array(frozen["model_full"]["coef"]), np.array(frozen["model_sigma"]["coef"])
    res = {"seed": SEED, "checks": {}}
    fails = []

    # ---- (0) the scoring code reproduces the frozen discovery numbers (discovery data only)
    E = pd.read_parquet(DEXE / "entries.parquet")
    assert E.date.max() <= FD.DISC_END
    E = E[E.date >= FD.FIT_START]
    E, dates, insts = frame_from_entries(E, profs)
    F = FD.long_frame(E, profs)
    y = F["y"].astype(np.float64)
    pf, ps, _ = FD.predict(F, gf, gs)
    W = boot_weights(len(dates))
    st = cal_stats(F["di"], len(dates), y, pf, ps, W)
    ref = frozen["insample"]
    rep = {"rows": int(len(y)), "rows_frozen": frozen["rows"],
           "citl_pp": [st["citl_pp"]["est"], ref["citl_pp"]["est"]], "mz_slope": [st["mz_slope"]["est"], ref["mz_slope"]["est"]],
           "bss_pct": [st["bss_pct"]["est"], ref["bss_pct"]["est"]], "citl_se": [st["citl_pp"]["se"], ref["citl_pp"]["se"]]}
    ok0 = (rep["rows"] == rep["rows_frozen"] and abs(rep["citl_pp"][0] - rep["citl_pp"][1]) <= 0.02
           and abs(rep["mz_slope"][0] - rep["mz_slope"][1]) <= 0.001 and abs(rep["bss_pct"][0] - rep["bss_pct"][1]) <= 0.02)
    del F, y, pf, ps
    stx = steady(E, profs)
    rep["steady_1.0_sd_pp"] = [stx["1.0"]["sd_pp"], sm["cells"]["1.0"]["sd_pp"]]
    rep["steady_1.0_delta"] = [stx["1.0"]["delta_pp"]["est"], sm["cells"]["1.0"]["delta_pp"]["est"]]
    ok0 &= abs(rep["steady_1.0_delta"][0] - rep["steady_1.0_delta"][1]) <= 0.01
    N = pd.read_parquet(DNOISE / "entries.parquet")
    assert N.date.max() <= FD.DISC_END
    N = N[N.hz == "eod"]
    rep["noise_0.25"] = [noise_point(N, 0.25), frozen["cell_c"]["cells"]["0.25"]["est"]]
    rep["noise_0.5"] = [noise_point(N, 0.5), frozen["cell_c"]["cells"]["0.5"]["est"]]
    ok0 &= abs(rep["noise_0.25"][0] - rep["noise_0.25"][1]) <= 1e-4 and abs(rep["noise_0.5"][0] - rep["noise_0.5"][1]) <= 1e-4
    rep["pass"] = bool(ok0)
    res["checks"]["reproduce_discovery"] = rep
    if not ok0:
        fails.append("score code does not reproduce frozen discovery numbers")
    print("reproduce", rep, f"{time.time() - t0:.0f}s", flush=True)
    del E, N

    # ---- (1) random-walk M1 through the exact build and scoring code
    rng, rng10 = np.random.default_rng(SEED), np.random.default_rng(SEED + 10)
    rng_ew, rng_ew2, rng_n = np.random.default_rng(SEED + 1), np.random.default_rng(SEED + 1), np.random.default_rng(SEED + 2)
    E0, E1, NN = [], [], []
    for sym in EW.instruments():
        t1 = time.time()
        real = load_ba(sym, ["time", "close", "bid_c", "ask_c"])
        sg = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
        sc = float(sg[(sg.index >= START) & (sg.index <= END)].median())
        Xc = pd.DataFrame({"s": sc, "s_lag": sc, "s_fix": sc, "ew10": np.nan}, index=sg.index[sg.index <= END])
        sim, sp = simulate(sym, real, sc, np.asarray(profs[sym]), rng)
        e0, _ = run_ew(sym, sim, Xc, rng_ew)
        sim1, _ = simulate(sym, real, sc, np.asarray(profs[sym]), rng10, scale=1.10)
        e1, _ = run_ew(sym, sim1, Xc, rng_ew2)
        sigs = pd.DataFrame({"date": Xc.index, "live_sig_used": sc * 100}).set_index("date").live_sig_used / 100
        nn = noise_build_one(sym, rng_n, sim[["time", "high", "low", "close", "bid_c", "ask_c"]], sigs, START, END)
        E0.append(e0), E1.append(e1), NN.append(nn)
        print("sim", sym, len(e0), len(e1), len(nn), f"sp={sp:.5g} s={sc:.4g}", f"{time.time() - t1:.0f}s", flush=True)
        del real, sim, sim1
    out = {}
    for tag, parts in (("zero", E0), ("sigma_x1.10", E1)):
        Es, dts, _ = frame_from_entries(pd.concat(parts, ignore_index=True), profs)
        F = FD.long_frame(Es, profs)
        y = F["y"].astype(np.float64)
        pf, ps, prw = FD.predict(F, gf, gs)
        Wd = boot_weights(len(dts))
        out[tag] = {"rw": cal_stats(F["di"], len(dts), y, prw, ps, Wd), "full": cal_stats(F["di"], len(dts), y, pf, ps, Wd),
                    "rw_by_hz": {h: {"hit": float(y[F["hz"] == k].mean()), "p_rw": float(prw[F["hz"] == k].mean())} for k, h in enumerate(HZ)},
                    "rw_by_d": {str(d): {"hit": float(y[F["d"] == d].mean()), "p_rw": float(prw[F["d"] == d].mean())} for d in D}}
        print(tag, out[tag]["rw"]["citl_pp"], out[tag]["rw"]["mz_slope"], flush=True)
        del F, y, pf, ps, prw
    Ns = pd.concat(NN, ignore_index=True)
    Ns = Ns[Ns.hz == "eod"].reset_index(drop=True)
    nd_ = np.sort(Ns.date.unique())
    ndi = pd.Series(np.arange(len(nd_)), index=nd_)[Ns.date].to_numpy()
    Wn = boot_weights(len(nd_))
    nz = noise_excess(Ns, (0.25, 0.5), Wn, ndi)
    Np = Ns
    planted = {}
    for d in (0.25, 0.5):
        m = (Np.mae >= d).to_numpy()
        x = (Np.final.to_numpy() + d + 0.03) * m
        a = np.bincount(ndi, weights=x, minlength=len(nd_))
        b = np.bincount(ndi, weights=m.astype(float), minlength=len(nd_))
        planted[str(d)] = pci(a.sum() / b.sum(), (Wn @ a) / (Wn @ b))
    out["noise_zero"], out["noise_planted_+0.03"] = nz, planted
    z, p1 = out["zero"]["rw"], out["sigma_x1.10"]["rw"]
    gates = {
        "zero_citl_within_0.3pp": abs(z["citl_pp"]["est"]) <= 0.3,
        "zero_slope_in_[0.97,1.03]": 0.97 <= z["mz_slope"]["est"] <= 1.03,
        "zero_noise_within_0.005": all(abs(nz[k]["est"]) <= 0.005 for k in nz),
        "planted_sigma_citl_outside_1pp": abs(p1["citl_pp"]["est"]) > 1.0,
        "planted_noise_outside_margin": all(planted[k]["lo90"] > NOISE_MARGIN for k in planted),
    }
    out["gates"] = gates
    res["checks"]["positive_control"] = out
    if not all(gates.values()):
        fails.append("positive control: " + ", ".join(k for k, v in gates.items() if not v))
    res["pass"] = not fails
    res["fails"] = fails
    res["ranAt"] = pd.Timestamp.now(tz="UTC").isoformat()
    (CTRL / "control.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    print("CONTROL", "PASS" if not fails else "FAIL", gates, f"{time.time() - t0:.0f}s", flush=True)
    if fails:
        (OUT / "STEP0_FAILED.md").write_text("# vol-layer-stops-confirm: step 0 failed\n\n" + "\n".join(f"- {f}" for f in fails)
                                             + "\n\nSee control/control.json. No 2023+ outcome was scored.\n", encoding="utf-8")
        sys.exit(1)


# ------------------------------------------------------------------ build
def build():
    t0 = time.time()
    assert (CTRL / "control.json").exists() and json.loads((CTRL / "control.json").read_text(encoding="utf-8"))["pass"], "control first"
    CONF.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    rng_n = np.random.default_rng(SEED)
    Es, Os, Ns, Xs = [], [], [], []
    for sym in EW.instruments():
        t1 = time.time()
        X = sigma_frame(sym)
        real = load_ba(sym, ["time", "high", "low", "close", "bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"])
        E, O = run_ew(sym, real, X, rng)
        assert E.date.max() <= END and E.date.min() >= START
        nn = noise_build_one(sym, rng_n, real[["time", "high", "low", "close", "bid_c", "ask_c"]], X.s, START, END)
        nn = nn.join(X[["s", "s_lag"]], on="date")
        Es.append(E), Os.append(O), Ns.append(nn)
        Xs.append(X.assign(inst=sym).reset_index().rename(columns={"index": "date"}))
        print(sym, len(E), len(O), len(nn), f"{time.time() - t1:.0f}s", flush=True)
        del real
    E = pd.concat(Es, ignore_index=True)
    E.to_parquet(CONF / "entries.parquet", index=False)
    pd.concat(Os, ignore_index=True).to_parquet(CONF / "overshoot.parquet", index=False)
    N = pd.concat(Ns, ignore_index=True)
    N["klass"] = N.inst.map(FD.klass)
    N.to_parquet(CONF / "noise_entries.parquet", index=False)
    meta = {"window": [START, END], "cut_utc": str(CUT), "seed": SEED, "entries": int(len(E)), "noise_rows": int(len(N)),
            "max_date": E.date.max(), "builtAt": pd.Timestamp.now(tz="UTC").isoformat()}
    (CONF / "build_meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print("built", meta, f"{time.time() - t0:.0f}s")


# ------------------------------------------------------------------ score
def weekend_open_prob(E, O):
    """P(a 1 sigma plain stop still open at Friday's close is hit on the weekend open bar), entries with a 5-session path."""
    E = E[E.L_s5.notna()]
    o = O[(O.scale == "p") & (O.d == 1.0)]
    key = ["inst", "date", "minute"]
    ent = E[key].drop_duplicates()
    start = pd.to_datetime(ent.date) + pd.to_timedelta(ent.minute, unit="m")
    sat = pd.to_datetime(ent.date) + pd.to_timedelta(5 - pd.to_datetime(ent.date).dt.dayofweek, unit="D")
    ent = ent.assign(sat=sat.to_numpy())
    tot_open, tot_hit = 0, 0
    for side in ("L", "S"):
        h = o[o.side == side].merge(ent, on=key, how="right")
        hit_ts = pd.to_datetime(h.date) + pd.to_timedelta(h.minute + h.mins_to_hit.fillna(1e8), unit="m")
        pre = h.mins_to_hit.notna() & (hit_ts < h.sat)
        wk = h.mins_to_hit.notna() & (h.gap_min > 36 * 60) & (hit_ts >= h.sat) & (hit_ts < h.sat + pd.Timedelta(days=3))
        tot_open += int((~pre).sum())
        tot_hit += int(wk.sum())
    del start
    return {"open_at_friday_close": tot_open, "hit_on_weekend_open_bar": tot_hit, "p": tot_hit / max(tot_open, 1)}


def weekend_cell(O, from_date=None):
    O = O[O.scale == "p"].copy()
    if from_date:
        O = O[O.date >= from_date]
    O["weekend"] = O.gap_min > 36 * 60
    out = {}
    for dd in (0.5, 1.0, 2.0):
        for wk in (False, True):
            part = O[(O.d == dd) & (O.weekend == wk)]
            o = part.over[part.over > 0].to_numpy()
            u = float(np.quantile(o, 0.9))
            xi, _, sc = genpareto.fit(o[o > u] - u, floc=0)
            odates = np.sort(part.date.unique())
            odi = pd.Series(np.arange(len(odates)), index=odates)[part.date].to_numpy()
            Wo = FD.boot_weights(len(odates), b=500)
            a = np.bincount(odi, weights=part.lossR_net.to_numpy(), minlength=len(odates))
            bb = np.bincount(odi, minlength=len(odates)).astype(float)
            out[f"{dd}_{'weekend' if wk else 'weekday'}"] = {
                "hits": int(len(part)), "gap_rate": float((part.over > 0).mean()), "lossR_net": pci(a.sum() / bb.sum(), (Wo @ a) / (Wo @ bb)),
                "p99_over_sigma": float(np.quantile(o, 0.99)), "gpd_u": u, "gpd_xi": float(xi), "gpd_scale": float(sc)}
    return out


def r(x, k=4):
    if isinstance(x, dict):
        return {kk: r(v, k) for kk, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [r(v, k) for v in x]
    if isinstance(x, (float, np.floating)):
        return None if not np.isfinite(x) else round(float(x), k)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
    return x


def score():
    t0 = time.time()
    ctrl = json.loads((CTRL / "control.json").read_text(encoding="utf-8"))
    assert ctrl["pass"], "control failed"
    frozen = json.loads(FROZEN.read_text(encoding="utf-8"))
    profs = json.loads((DEXE / "profiles.json").read_text(encoding="utf-8"))
    gf, gs = np.array(frozen["model_full"]["coef"]), np.array(frozen["model_sigma"]["coef"])
    E0 = pd.read_parquet(CONF / "entries.parquet")
    assert E0.date.max() <= END and E0.date.min() >= START
    # ---- drops (holds that would reach past 2026-08-20) and missing inputs
    last = np.sort(E0.date.unique())[-6:]
    drops = {h: {"missing_all": int(E0[f"L_{h}"].isna().sum()), "missing_last6_sessions": int(E0[E0.date.isin(last)][f"L_{h}"].isna().sum())} for h in HZ}
    n_noinput = int((E0.s_lag.isna() | E0.s_fix.isna()).sum())
    E, dates, insts = frame_from_entries(E0, profs)
    nd = len(dates)
    F = FD.long_frame(E, profs)
    y = F["y"].astype(np.float64)
    pf, ps, prw = FD.predict(F, gf, gs)
    W = boot_weights(nd)
    print("frame", len(y), nd, f"{time.time() - t0:.0f}s", flush=True)
    main = cal_stats(F["di"], nd, y, pf, ps, W)
    sig_m = cal_stats(F["di"], nd, y, ps, ps, W)
    rw_m = cal_stats(F["di"], nd, y, prw, ps, W)
    print("main", main["citl_pp"], main["mz_slope"], main["bss_pct"], flush=True)

    yr = np.asarray([d[:4] for d in dates])[F["di"]]
    kl = np.asarray([FD.klass(s) for s in insts])[F["inst"]]
    hzk = np.asarray(HZ)[F["hz"]]
    dk = F["d"].astype(str)

    def part_stats(key):
        o = {}
        for k in np.unique(key):
            m = key == k
            o[str(k)] = {"n": int(m.sum()), "hit_pct": 100 * float(y[m].mean()), "p_full_pct": 100 * float(pf[m].mean()),
                         "p_sigma_pct": 100 * float(ps[m].mean()), "p_rw_pct": 100 * float(prw[m].mean()),
                         "citl_pp": 100 * float((y[m] - pf[m]).mean()),
                         "bss_pct": 100 * float(1 - ((y[m] - pf[m]) ** 2).sum() / ((y[m] - ps[m]) ** 2).sum())}
        return o

    parts = {"d": part_stats(dk), "class": part_stats(kl), "year": part_stats(yr), "hz": part_stats(hzk),
             "hour": part_stats((F["minute"] // 60).astype(int))}
    # reliability, frozen bins, all three models
    edges = np.asarray(frozen["reliability_bin_edges"])
    rel = {}
    for nm, p in (("full", pf), ("sigma", ps), ("rw", prw)):
        b = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, len(edges) - 2)
        rel[nm] = [{"bin": [float(edges[k]), float(edges[k + 1])], "n": int((b == k).sum()),
                    "p_mean": float(p[b == k].mean()) if (b == k).any() else None, "hit": float(y[b == k].mean()) if (b == k).any() else None}
                   for k in range(len(edges) - 1)]
    # ablations: frozen discovery refits without a term, scored here (described)
    abl = {}
    for nm, drop in (("no_vol_clock", 2), ("no_spread", 3), ("no_weekend", 4)):
        keep = [i for i in range(5) if i != drop]
        p_ = FD.p_link(FD.eta_full(F, np.asarray(frozen["ablation"][nm]["coef"]), keep))
        abl[nm] = {"brier_vs_full_pct": 100 * float(((y - p_) ** 2).sum() / ((y - pf) ** 2).sum() - 1),
                   "citl_pp": 100 * float((y - p_).mean())}
    # disaggregation (BH q = 0.10 per family): CITL and skill by instrument, horizon, hour bucket, sigma tercile
    # sigma tercile within each instrument over the confirm sessions (a slicing label, not a predictor)
    SD = E.drop_duplicates(["inst", "date"])[["inst_code", "di", "s"]].copy()
    SD["t"] = SD.groupby("inst_code").s.transform(lambda v: pd.qcut(v.rank(method="first"), 3, labels=False))
    T = np.full((len(insts), nd), -1, dtype=np.int8)
    T[SD.inst_code.to_numpy(), SD.di.to_numpy()] = SD.t.to_numpy()
    rows_terc = np.asarray(["σ low", "σ mid", "σ high", "?"])[T[F["inst"], F["di"]]]
    bucket = np.asarray([EW.bucket(int(mm)) for mm in range(1440)])[F["minute"]]
    instk = np.asarray(insts)[F["inst"]]
    dis = []
    for dim, key in (("inst", instk), ("hz", hzk), ("bucket", bucket), ("terc", rows_terc)):
        for k in np.unique(key):
            m = key == k
            S = FD.date_sums(F["di"][m], nd, y[m], pf[m], ps[m])
            pt = FD.stats_from({kk: v.sum() for kk, v in S.items()})
            reps = FD.stats_from({kk: W @ v for kk, v in S.items()})
            c_se, s_se = float(np.nanstd(100 * reps[0])), float(np.nanstd(100 * reps[2]))
            dis.append({"dim": dim, "key": str(k), "n": int(m.sum()), "citl_pp": 100 * float(pt[0]), "citl_se": c_se,
                        "citl_p": p_two(100 * pt[0], c_se), "bss_pct": 100 * float(pt[2]), "bss_se": s_se, "bss_p": p_two(100 * pt[2], s_se)})
    for fam in ("citl", "bss"):
        pas = bh([c[f"{fam}_p"] for c in dis])
        for c, ok in zip(dis, pas):
            c[f"{fam}_bh"] = bool(ok)
    dis_chance = {fam: chance(len(dis), int(sum(c[f"{fam}_p"] < 0.05 for c in dis))) for fam in ("citl", "bss")}
    del F, y, pf, ps, prw, rows_terc, bucket, instk, yr, kl, hzk, dk

    # ---- +1 lag: sigma delayed one session, frozen coefficients
    Fl = FD.long_frame(E, profs, sigma_col="s_lag")
    pfl, psl, _ = FD.predict(Fl, gf, gs)
    lag = cal_stats(Fl["di"], nd, Fl["y"].astype(np.float64), pfl, psl, W)
    del Fl, pfl, psl
    print("lag", lag["citl_pp"]["est"], lag["bss_pct"]["est"], f"{time.time() - t0:.0f}s", flush=True)

    # ---- cell b
    stb = steady(E, profs)
    # ---- cell c
    N0 = pd.read_parquet(CONF / "noise_entries.parquet")
    assert N0.date.max() <= END
    N = N0[N0.hz == "eod"].reset_index(drop=True)
    ndates = np.sort(N.date.unique())
    ndi = pd.Series(np.arange(len(ndates)), index=ndates)[N.date].to_numpy()
    Wn = boot_weights(len(ndates))
    nz = noise_excess(N, (0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0), Wn, ndi)
    okl = N.s_lag.notna().to_numpy()
    Nl = N[okl].reset_index(drop=True)
    nz_lag = {str(d): noise_point(Nl.assign(mae=Nl.mae * Nl.s / Nl.s_lag, final=Nl.final * Nl.s / Nl.s_lag), d) for d in (0.25, 0.5)}
    nz_year = {y_: {str(d): noise_point(N[N.date.str[:4] == y_], d) for d in (0.25, 0.5)} for y_ in sorted(N.date.str[:4].unique())}
    nz_side = {sd: {str(d): noise_point(N[N.side == sd], d) for d in (0.25, 0.5, 1.0)} for sd in ("long", "short")}
    sp_class = N.groupby("klass").spread.median().to_dict()
    nz_class = []
    for kname, g in N.groupby("klass"):
        gi = pd.Series(np.arange(len(ndates)), index=ndates)[g.date].to_numpy()
        ce = noise_excess(g, (0.25, 0.5), Wn, gi)
        for d, c in ce.items():
            spr = sp_class[kname]
            pval = float(1 - norm.cdf((abs(c["est"]) - spr) / c["se"])) if c["se"] > 0 else 1.0
            nz_class.append({"klass": kname, "d": d, **c, "own_spread": spr, "p_exceeds_spread": pval})
    for c, ok in zip(nz_class, bh([c["p_exceeds_spread"] for c in nz_class])):
        c["bh"] = bool(ok)
    print("noise", {k: round(v["est"], 5) for k, v in nz.items()}, f"{time.time() - t0:.0f}s", flush=True)

    # ---- cell d (described) + the new weekend-open probability in both windows
    O = pd.read_parquet(CONF / "overshoot.parquet")
    assert O.date.max() <= END
    wkd = weekend_cell(O)
    wk_open = {"confirm": weekend_open_prob(E0, O)}
    Ed = pd.read_parquet(DEXE / "entries.parquet", columns=["inst", "date", "minute", "L_s5"])
    Od = pd.read_parquet(DEXE / "overshoot.parquet")
    assert Ed.date.max() <= FD.DISC_END
    Ed, Od = Ed[Ed.date >= FD.FIT_START], Od[Od.date >= FD.FIT_START]
    wk_open["discovery"] = weekend_open_prob(Ed, Od)
    del Ed, Od

    # ================================================================== verdicts
    c, s_ = main["citl_pp"], main["mz_slope"]
    p_cal = max(p_tost(c["est"], c["se"], -CAL_MARGIN, CAL_MARGIN), p_tost(s_["est"], s_["se"], SLOPE_LO, SLOPE_HI))
    sk = main["bss_pct"]
    p_skill = p_two(sk["est"], sk["se"])
    db = stb["1.0"]["delta_pp"]
    p_steady = p_two(db["est"], db["se"])
    p_noise = max(p_tost(nz[k]["est"], nz[k]["se"], -NOISE_MARGIN, NOISE_MARGIN) for k in ("0.25", "0.5"))
    ph = holm([p_cal, p_skill, p_steady, p_noise])

    # -cal
    core_cal = (-CAL_MARGIN < c["lo90"] and c["hi90"] < CAL_MARGIN and SLOPE_LO < s_["lo90"] and s_["hi90"] < SLOPE_HI and ph[0] < 0.05)
    null_cal = (c["lo90"] > CAL_MARGIN or c["hi90"] < -CAL_MARGIN or s_["lo90"] > SLOPE_HI or s_["hi90"] < SLOPE_LO)
    g_cal = {"plateau_each_d": all(abs(v["citl_pp"]) <= 2 for v in parts["d"].values()),
             "each_class": all(abs(v["citl_pp"]) <= 2 for v in parts["class"].values()),
             "each_year": all(abs(v["citl_pp"]) <= 2 for v in parts["year"].values()),
             "lag": abs(lag["citl_pp"]["est"]) <= 2 and SLOPE_LO <= lag["mz_slope"]["est"] <= SLOPE_HI}
    # -skill
    core_sk = sk["est"] >= SKILL_BAR and sk["lo"] > 0 and ph[1] < 0.05
    null_sk = sk["hi"] < SKILL_BAR
    g_sk = {"each_d_positive": all(v["bss_pct"] > 0 for v in parts["d"].values()),
            "years_positive_3of4": sum(v["bss_pct"] > 0 for v in parts["year"].values()) >= 3,
            "lag_half": lag["bss_pct"]["est"] >= 0.5 * sk["est"]}
    # -steady
    core_st = db["est"] >= STEADY_BAR and db["lo"] > 0 and ph[2] < 0.05
    null_st = db["hi"] < STEADY_BAR
    g_st = {"neighbour_0.5": stb["0.5"]["delta_pp"]["est"] > 0 and stb["0.5"]["delta_pp"]["est"] >= 0.5 * db["est"],
            "neighbour_1.5": stb["1.5"]["delta_pp"]["est"] > 0 and stb["1.5"]["delta_pp"]["est"] >= 0.5 * db["est"],
            "lag_half": stb["1.0"]["delta_fixed_minus_lagplain_pp"]["est"] >= 0.5 * db["est"]}
    # -noise
    core_nz = all(-NOISE_MARGIN < nz[k]["lo90"] and nz[k]["hi90"] < NOISE_MARGIN for k in ("0.25", "0.5")) and ph[3] < 0.05
    null_nz = any(nz[k]["lo90"] > NOISE_MARGIN or nz[k]["hi90"] < -NOISE_MARGIN for k in ("0.25", "0.5"))
    g_nz = {"neighbours": all(abs(nz[k]["est"]) <= NOISE_MARGIN for k in ("0.2", "0.3", "0.4", "0.75")),
            "each_year": all(abs(v) <= NOISE_MARGIN for yv in nz_year.values() for v in yv.values()),
            "lag_unit": all(abs(v) <= NOISE_MARGIN for v in nz_lag.values())}

    def word(core, null, gates):
        if core:
            return "validated" if all(gates.values()) else "context"
        return "null" if null else "underpowered"

    se_cal, se_sk, se_st = c["se"], sk["se"], db["se"]
    cells = [
        {"name": "vol-layer-stops-confirm-cal", "n_dates": nd, "n_rows": main["n"], "est": c["est"], "lo": c["lo"], "hi": c["hi"],
         "lo90": c["lo90"], "hi90": c["hi90"], "unit": "pp (CITL)", "slope": s_, "mde": 2.93 * se_cal, "mde_slope": 2.93 * s_["se"],
         "mde_prereg": 0.67, "bar": "90% CI of CITL in ±1.0pp and MZ slope in [0.90, 1.10]", "p": p_cal, "p_holm": ph[0],
         "core": core_cal, "gates": g_cal, "verdict": word(core_cal, null_cal, g_cal)},
        {"name": "vol-layer-stops-confirm-skill", "n_dates": nd, "n_rows": main["n"], "est": sk["est"], "lo": sk["lo"], "hi": sk["hi"],
         "unit": "% Brier skill vs M_sigma", "mde": 2.8016 * se_sk, "mde_prereg": 0.25, "bar": "≥ +2.0%, 95% CI > 0", "p": p_skill,
         "p_holm": ph[1], "core": core_sk, "gates": g_sk, "verdict": word(core_sk, null_sk, g_sk)},
        {"name": "vol-layer-stops-confirm-steady", "n_months": stb["1.0"]["months"], "est": db["est"], "lo": db["lo"], "hi": db["hi"],
         "unit": "pp (SD fixed − SD plain, by month)", "sd_pp": stb["1.0"]["sd_pp"], "mde": 2.8016 * se_st, "mde_prereg": 4.9,
         "bar": "≥ +2.0pp, 95% CI > 0", "p": p_steady, "p_holm": ph[2], "core": core_st, "gates": g_st,
         "verdict": word(core_st, null_st, g_st)},
        {"name": "vol-layer-stops-confirm-noise", "n_dates": len(ndates), "est": nz["0.25"]["est"], "lo": nz["0.25"]["lo"], "hi": nz["0.25"]["hi"],
         "est_0.5": nz["0.5"]["est"], "lo_0.5": nz["0.5"]["lo"], "hi_0.5": nz["0.5"]["hi"],
         "lo90": nz["0.25"]["lo90"], "hi90": nz["0.25"]["hi90"], "lo90_0.5": nz["0.5"]["lo90"], "hi90_0.5": nz["0.5"]["hi90"],
         "unit": "σ (excess at 0.25σ; 0.5σ alongside)", "mde": 2.4865 * nz["0.25"]["se"], "mde_0.5": 2.4865 * nz["0.5"]["se"],
         "mde_prereg": [0.008, 0.014], "bar": "90% CI in ±0.016σ at 0.25σ and 0.5σ", "p": p_noise, "p_holm": ph[3],
         "core": core_nz, "gates": g_nz, "verdict": word(core_nz, null_nz, g_nz)},
    ]
    res = {"id": "vol-layer-stops-confirm", "ranAt": pd.Timestamp.now(tz="UTC").isoformat(), "seed": SEED, "B": B,
           "prereg": "forge/VOL_LAYER_STOPS_CONFIRM_PREREG.md", "preregCommit": "93478dc9", "branch": "main",
           "window": [START, END], "dates": nd, "entries": int(len(E)), "rows": main["n"], "instruments": insts,
           "drops": {"by_horizon": drops, "entries_missing_sigma_inputs": n_noinput},
           "cells": cells, "main": {"full": main, "sigma": sig_m, "rw": rw_m}, "lag": lag, "parts": parts, "reliability": rel,
           "ablation": abl, "disaggregation": dis, "disaggregation_chance": dis_chance, "steady": stb,
           "noise": {"pooled": nz, "lag_unit": nz_lag, "year": nz_year, "side": nz_side, "class": nz_class,
                     "spread_median_by_class": sp_class, "hits_1.0_described": nz["1.0"]},
           "weekend": {"cells": wkd, "open_at_friday_close": wk_open, "discovery": frozen["cell_d"]},
           "control": ctrl["checks"]["positive_control"]["gates"]}
    CONF.mkdir(parents=True, exist_ok=True)
    (CONF / "scored.json").write_text(json.dumps(r(res, 6), indent=1, default=str), encoding="utf-8")
    slim = {k: res[k] for k in ("id", "ranAt", "seed", "B", "prereg", "preregCommit", "branch")}
    slim["verdict"] = {c_["name"]: c_["verdict"] for c_ in cells}
    slim["cells"] = [{k: c_[k] for k in c_ if k not in ("gates",)} | {"gates": c_["gates"]} for c_ in cells]
    (OUT / "results.json").write_text(json.dumps(r(slim, 5), indent=1, default=str), encoding="utf-8")
    print(json.dumps(r(slim, 4), indent=1, default=str))
    print("done", f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"control": control, "build": build, "score": score}[cmd]()
