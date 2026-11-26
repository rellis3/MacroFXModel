"""gold-calc-upgrades (forge/GOLD_CALC_UPGRADES_PREREG.md, pushed 005ccfba): do published vol-forecasting upgrades beat
the export's gold calc on Jordan's lines (HL, Close+, Close-)?

    python scripts/gold-calc-upgrades/score.py   -> analysis/output/gold-calc-upgrades/

Shadow only: reads the ladder-v2 gold build and the M1 files; writes nothing outside the output folder.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

_spec = importlib.util.spec_from_file_location("cfd_race", ROOT / "scripts/ladder-qlike-per-line-cfd/race.py")
RC = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(RC)
_spec2 = importlib.util.spec_from_file_location("fut_race", ROOT / "scripts/ladder-qlike-per-line-fut/race.py")
RF = importlib.util.module_from_spec(_spec2)
_spec2.loader.exec_module(RF)

SYM, SEED, B, BLOCK = "GOLD", 20261126, 2000, 63
OUT = ROOT / "analysis/output/gold-calc-upgrades"
BUILD = "analysis/output/ladder-per-line/build/gold"
LINES = ("hl", "oh", "ol", "oc", "cup", "cdn")
JORDAN = ("hl", "cup", "cdn")
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
BASE = {"F": {q: "HARCJ" for q in LINES},
        "C": {"hl": "HARCJ", "oh": "R15", "ol": "HARCJ", "oc": "HARCJ", "cup": "R15", "cdn": "HARCJ"}}
NEW = ["N1_HARQ", "N2_QL_HARCJ", "N3_SESS", "N4_FRESH", "N5_RR", "N6_HARCJ_IV", "N7_ALL"]
OLD_IV = ["V3", "V4", "B_har_iv"]
TESTED = NEW + OLD_IV
LOG = []


def say(s=""):
    print(s, flush=True)
    LOG.append(s)


# ------------------------------------------------------------------ features per NY-close day
def features(track):
    """Everything per NY day (same keying as ladder.ny_bars: NY time + 7h, normalised)."""
    m = L.load_m1(SYM, track, "ratio")
    b, rv5, rv15, ext = L.ny_bars(m)
    o5 = m.resample("5min", label="left", closed="left").agg({"high": "max", "low": "min", "close": "last"}).dropna()
    nyt = o5.index.tz_convert("America/New_York").tz_localize(None)
    dk = (nyt + pd.Timedelta(hours=7)).normalize()
    r = np.log(o5["close"]).groupby(dk).diff()
    M = r.groupby(dk).count()
    rq = (M / 3) * (r ** 4).groupby(dk).sum()
    rr = ((np.log(o5["high"] / o5["low"])) ** 2 / (4 * np.log(2))).groupby(dk).sum()
    h = nyt.hour
    sess = np.where((h >= 17) | (h < 2), "asia", np.where(h < 8, "ldn", "ny"))
    r2 = r ** 2
    sv = r2.groupby([dk, sess]).sum().unstack()
    # fresh: bars of NY day D that are before London midnight of D (known before the London session opens)
    ldate = o5.index.tz_convert("Europe/London").tz_localize(None).normalize()
    pre = ldate < dk
    fresh = r2[pre].groupby(dk[pre]).sum()
    post = r2[~pre].groupby(dk[~pre]).sum()
    F = pd.DataFrame(index=b.index)
    F["rv"] = rv5
    F["bv"] = ext["bv"]
    F["rq"] = rq.reindex(b.index)
    F["rr"] = rr.reindex(b.index)
    for s in ("asia", "ldn", "ny"):
        F[f"s_{s}"] = sv[s].reindex(b.index) if s in sv else np.nan
    F["fresh"] = fresh.reindex(b.index)
    F["post"] = post.reindex(b.index)
    return F, b


def design(F, iv):
    """Feature matrices per arm, row t = NY day t, target = NY day t+1."""
    rv = F["rv"]
    fl = lambda x: np.log(np.maximum(x, 0.01 * rv))            # same floor as ladder.lg
    C = np.minimum(rv, F["bv"]).where(F["bv"] > 0, rv)
    J = (rv - C).clip(lower=0)
    har = pd.DataFrame({"c1": np.log(C), "c5": np.log(C.rolling(5, min_periods=5).mean()),
                        "c22": np.log(C.rolling(22, min_periods=22).mean()), "j1": np.log1p(J / C)})
    q = np.sqrt(F["rq"]) / F["rv"]
    nxt = pd.Series(F.index, index=F.index).shift(-1)
    y = np.log(rv).shift(-1)
    fresh_next = np.log(np.maximum(F["fresh"], 0.01 * rv)).shift(-1)     # pre-open hours of day t+1
    y_post = np.log(F["post"]).shift(-1)                                   # target without those hours (N4, A1)
    ivt = pd.Series(L.asof_before(pd.DatetimeIndex(F.index + pd.Timedelta(days=1)), iv), index=F.index)
    # GVZ close strictly before day t+1's date = known by the end of NY day t
    livv = np.log((ivt / 100) ** 2 / 252)
    rr = F["rr"]
    X = {
        "HARCJ": (har, y, "ols"),
        "NC_NOISE": (har.assign(z=np.random.default_rng(SEED).standard_normal(len(har))), y, "ols"),
        "N1_HARQ": (har.assign(cq=har["c1"] * (q - q.expanding().mean().shift(1))), y, "ols"),
        "N2_QL_HARCJ": (har, y, "qlike"),
        "N3_SESS": (pd.DataFrame({"a1": fl(F["s_asia"]), "l1": fl(F["s_ldn"]), "n1": fl(F["s_ny"]),
                                  "c5": har["c5"], "c22": har["c22"], "j1": har["j1"]}), y, "ols"),
        "N4_FRESH": (har.assign(fr=fresh_next), y_post, "ols"),
        "N5_RR": (pd.DataFrame({"r1": np.log(rr), "r5": np.log(rr.rolling(5, min_periods=5).mean()),
                                "r22": np.log(rr.rolling(22, min_periods=22).mean())}), y, "ols"),
        "N6_HARCJ_IV": (har.assign(iv=livv), y, "ols"),
        "N7_ALL": (har.assign(cq=har["c1"] * (q - q.expanding().mean().shift(1)), a1=fl(F["s_asia"]),
                              l1=fl(F["s_ldn"]), fr=fresh_next, r1=np.log(rr), iv=livv), y, "qlike"),
    }
    return X, nxt


def fit(Xm, yv, how):
    A = np.column_stack([np.ones(len(Xm)), Xm])
    coef, *_ = np.linalg.lstsq(A, yv, rcond=None)
    s2 = float(np.var(yv - A @ coef))
    if how == "ols":
        return coef, s2
    Y = np.exp(yv)

    def f(b):
        lh = A @ b
        z = Y * np.exp(-lh)
        return float(np.mean(z - np.log(z) - 1))

    def g(b):
        z = Y * np.exp(-(A @ b))
        return A.T @ (1 - z) / len(z)

    b0 = coef.copy(); b0[0] += s2 / 2
    res = minimize(f, b0, jac=g, method="BFGS", options={"maxiter": 500})
    return res.x, 0.0


def forecasts(X, nxt, dates, years):
    """Out-of-sample sigma per session date (each test year uses a fit on targets before 1 Jan of that year)."""
    out, coefs = {}, {}
    D = pd.DatetimeIndex(dates)
    for name, (Xf, y, how) in X.items():
        cols = list(Xf.columns)
        sig = np.full(len(D), np.nan)
        for Y in sorted(set(years)):
            start = pd.Timestamp(f"{Y}-01-01")
            ok = np.isfinite(Xf).all(axis=1) & np.isfinite(y) & (nxt < start)
            coef, s2 = fit(Xf[ok].to_numpy(), y[ok].to_numpy(), how)
            A = np.column_stack([np.ones(len(Xf)), Xf.to_numpy()])
            s = pd.Series(np.sqrt(np.exp(A @ coef + s2 / 2)) * 100, index=Xf.index).dropna()
            v = L.asof_before(D, s)
            sel = years == Y
            sig[sel] = v[sel]
            coefs[(name, Y)] = dict(zip(["const"] + cols, map(float, coef)))
        out[name] = sig
    return out, coefs


# ------------------------------------------------------------------ one track
def run(track):
    os.environ["LADDER_OUT"] = BUILD
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / BUILD / f"rows_{track}.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(SYM))
    T = L.walk_forward(S, SYM, track, arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = (RF.realised_f(SYM) if track == "F" else RC.realised(SYM)).reindex(pd.to_datetime(T["date"]))
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    F, b = features(track)
    iv = L.iv_series("GVZ")
    X, nxt = design(F, iv)
    sig, coefs = forecasts(X, nxt, T["date"], T["year"].to_numpy())
    # positive control: re-implemented HARCJ == walk_forward HARCJ
    a, c = sig["HARCJ"], T["HARCJ"].to_numpy()
    k = np.isfinite(a) & np.isfinite(c)
    pc = float(np.nanmax(np.abs(a[k] / c[k] - 1)))
    say(f"{track}: {len(T)} sessions {T['date'].min().date()} -> {T['date'].max().date()}; "
        f"positive control HARCJ max rel diff {pc:.2e} on {k.sum()} sessions")
    if pc > 1e-6:
        raise SystemExit("positive control FAILED")
    for n in X:
        if n != "HARCJ":
            T[n] = sig[n]
    ok = np.ones(len(T), bool)
    for q in ("hl", "oh", "ol"):
        ok &= T[q].to_numpy() > 0
    allarms = sorted(set(BASE[track].values())) + TESTED + ["NC_NOISE"]
    for a in allarms:
        ok &= np.isfinite(T[a].to_numpy(float)) & (T[a].to_numpy(float) > 0)
    masks = {"hl": ok, "oh": ok, "ol": ok, "oc": ok & (T["oc"].to_numpy() > 0), "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    Q = {}
    for a in allarms:
        s = T[a].to_numpy(float)
        for q in LINES:
            Q[(a, q)] = RC.qlike(T, RC.h_series(T, s, q, masks[q]), q, masks[q])
    test = ok & (T["year"].to_numpy() >= 2020)
    say(f"  common sample (all arms finite) 2020+: {test.sum()} sessions; dropped {int(((T['year'] >= 2020) & ~ok).sum())}")
    return T, Q, masks, test, coefs


def daily(Q, arm_for, lines, test, n):
    tot = np.zeros(n)
    for q in lines:
        v = Q[(arm_for(q), q)]
        tot += np.where(np.isfinite(v), v, 0.0)
    return tot[test]


def boot_ratio(a, b, yrs, rng):
    n = len(a); nb = int(np.ceil(n / BLOCK))
    pt = a.sum() / b.sum() - 1
    bs = np.empty(B)
    for i in range(B):
        st = rng.integers(0, n, nb)
        idx = (st[:, None] + np.arange(BLOCK)[None, :]).ravel() % n
        bs[i] = a[idx].sum() / b[idx].sum() - 1
    halves = {h: float(a[(yrs >= lo) & (yrs <= hi)].sum() / b[(yrs >= lo) & (yrs <= hi)].sum() - 1) * 100
              for h, (lo, hi) in HALVES.items()}
    return pt * 100, np.percentile(bs, [5, 95]) * 100, float(np.mean(bs >= 0)), halves


def bh(p, q=0.10):
    p = np.asarray(p); o = np.argsort(p); m = len(p)
    thr = q * np.arange(1, m + 1) / m
    passed = p[o] <= thr
    k = np.max(np.flatnonzero(passed)) + 1 if passed.any() else 0
    out = np.zeros(m, bool); out[o[:k]] = True
    return out


def hits_and_gap(T, sig_col, test, mask, q):
    """Walk-forward width multipliers (fit on earlier test years) -> hit rates at P50/75/90 and the $ median->P75 gap."""
    yrs = T["year"].to_numpy(); s = T[sig_col].to_numpy(float); x = T[q].to_numpy(float)
    res = {}
    lvl = {}
    for t in (50, 75, 90):
        w = np.full(len(T), np.nan)
        for Y in range(2020, 2027):
            tr = (yrs >= 2018) & (yrs < Y) & mask & np.isfinite(s)
            te = yrs == Y
            if tr.sum() > 50:
                w[te] = L.V.fit_width_multiplier(s[tr], x[tr], t / 100) * s[te]
        lvl[t] = w
        k = test & mask & np.isfinite(w)
        res[f"hit{t}"] = float(np.mean(x[k] > w[k]) * 100)
    return res, lvl


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    summary, rows, line_rows, coef_rows = {}, [], [], []
    store = {}
    for track in ("F", "C"):
        T, Q, masks, test, coefs = run(track)
        store[track] = (T, Q, masks, test)
        yrs = T["year"].to_numpy()[test]
        base = daily(Q, lambda q: BASE[track][q], JORDAN, test, len(T))
        for a in TESTED + ["NC_NOISE"]:
            arm = daily(Q, lambda q: a, JORDAN, test, len(T))
            pt, ci, p, hv = boot_ratio(arm, base, yrs, rng)
            rows.append(dict(track=track, arm=a, pct=pt, lo=ci[0], hi=ci[1], p=p, **{f"half {h}": v for h, v in hv.items()}))
        for a in sorted(set(BASE[track].values())) + TESTED:
            for q in LINES:
                v = Q[(a, q)][test & masks[q]]
                bq = Q[(BASE[track][q], q)][test & masks[q]]
                line_rows.append(dict(track=track, arm=a, line=q, qlike=float(np.nanmean(v)),
                                      vs_base_pct=float((np.nanmean(v) / np.nanmean(bq) - 1) * 100), days=int(np.isfinite(v).sum())))
        for (n, Y), c in coefs.items():
            if Y == 2026:
                coef_rows.append(dict(track=track, arm=n, **{k: round(v, 4) for k, v in c.items()}))
    R = pd.DataFrame(rows)
    F_ = R[(R.track == "F") & R.arm.isin(TESTED)].set_index("arm")
    C_ = R[(R.track == "C")].set_index("arm")
    passbh = dict(zip(F_.index, bh(F_["p"].to_numpy())))
    verdict = {}
    for a in TESTED:
        f = F_.loc[a]
        if f.hi < 0 and passbh[a] and f["half 2020-22"] < 0 and f["half 2023-26"] < 0 and C_.loc[a, "pct"] < 0:
            v = "VALIDATED"
        elif f.lo > -0.5:
            v = "NULL"
        else:
            v = "UNDERPOWERED"
        verdict[a] = v
    R["bh_pass"] = R.apply(lambda r: bool(passbh.get(r.arm, False)) if r.track == "F" else None, axis=1)
    R["verdict"] = R.apply(lambda r: verdict.get(r.arm) if r.track == "F" else None, axis=1)
    R.to_csv(OUT / "primary.csv", index=False)
    LR = pd.DataFrame(line_rows); LR.to_csv(OUT / "per_line.csv", index=False)
    pd.DataFrame(coef_rows).to_csv(OUT / "coefs_2026.csv", index=False)

    say("\nPRIMARY: % change in QLIKE on HL + Close+ + Close-, arm vs export calc (negative = better), 2020 -> 2026-08-21")
    for track in ("F", "C"):
        say(f"  track {track}:")
        for r in R[R.track == track].itertuples():
            say(f"    {r.arm:12s} {r.pct:+6.2f}% [{r.lo:+6.2f}, {r.hi:+6.2f}]  p {r.p:.3f}  halves {getattr(r, '_7'):+.2f} / {getattr(r, '_8'):+.2f}"
                + (f"  BH {'yes' if r.bh_pass else 'no'}  -> {r.verdict}" if track == "F" and r.arm in TESTED else ""))

    # descriptive: best futures arm vs base, hit rates, quiet/busy, $ gap
    best = F_["pct"].idxmin()
    say(f"\nbest futures arm: {best}")
    desc = {}
    for track in ("F", "C"):
        T, Q, masks, test = store[track]
        for a in (BASE[track]["hl"], best):
            for q in JORDAN:
                hr, lvl = hits_and_gap(T, a if a in T else a, test, masks[q], q)
                desc[f"{track}|{a}|{q}"] = hr
                if q in ("cdn",) and track == "F":
                    px = None
        # quiet / busy terciles (A0 relative to its 250-day median), Jordan lines summed
        rel = T["rel"].to_numpy()
        terc = np.quantile(rel[test], [1 / 3, 2 / 3])
        for nm, sel in (("quiet", rel < terc[0]), ("mid", (rel >= terc[0]) & (rel < terc[1])), ("busy", rel >= terc[1])):
            tt = test & sel
            b_ = daily(Q, lambda q: BASE[track][q], JORDAN, tt, len(T))
            a_ = daily(Q, lambda q: best, JORDAN, tt, len(T))
            desc[f"{track}|regime|{nm}"] = float((a_.sum() / b_.sum() - 1) * 100)
    # dollar gap median->P75 on Close- (futures), base vs best, from the walk-forward widths
    T, Q, masks, test = store["F"]
    px = pd.read_parquet(ROOT / "analysis/output/nt8/continuous/GC_1m_unadj.parquet", columns=["timestamp", "open"])
    px["t"] = pd.to_datetime(px.timestamp, utc=True) - pd.Timedelta(minutes=1)
    lt = px["t"].dt.tz_convert("Europe/London")
    px = px[lt.dt.hour < 22].assign(d=lt.dt.tz_localize(None).dt.normalize()).groupby("d")["open"].first()
    o = px.reindex(pd.to_datetime(T["date"])).to_numpy()
    for a in (BASE["F"]["cdn"], best):
        _, lvl = hits_and_gap(T, a, test, masks["cdn"], "cdn")
        gap = (lvl[75] - lvl[50]) / 100 * o
        yrs = T["year"].to_numpy()
        k = test & np.isfinite(gap)
        desc[f"F|{a}|cdn_gap_usd"] = {"all": float(np.median(gap[k])), "2025-26": float(np.median(gap[k & (yrs >= 2025)]))}
    (OUT / "descriptive.json").write_text(json.dumps(desc, indent=1))
    say("\nDESCRIPTIVE")
    for k, v in desc.items():
        say(f"  {k}: {v}")
    json.dump(dict(seed=SEED, B=B, block=BLOCK, verdicts=verdict, best=best,
                   primary=R.to_dict(orient="records")), open(OUT / "results.json", "w"), indent=1, default=float)
    (OUT / "run_log.txt").write_text("\n".join(LOG), encoding="utf-8")


if __name__ == "__main__":
    main()
