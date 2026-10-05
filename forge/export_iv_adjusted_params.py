"""IV-adjusted daily ladder — calibration on the inputs the LIVE export will actually use.

COMBINED-RANGE and CROSS-IV (both PASS, 2026-10-05) were run on research inputs: london22 sigma
and CME CVOL. The live server has neither: sigma comes from OANDA D1 bars (17:00 NY), FX implied
vol from the QuikStrike capture (constant-maturity 30d ATM), gold from CBOE GVZ, indices from
VIX/VXN. Plugging the research coefficients into different inputs would shift every band, so this:

  1. rebuilds the same model on LIVE-TYPE inputs:
       sigma_t   production estimator on *_d1.parquet (OANDA D1), last bar dated before the session
       IV        indices VIX (VXN for NQ) close; FX majors settlement-inverted iv30
                 (oi_research_book/data/iv_daily_*.parquet, the same constant-maturity 30d ATM
                 measure as the live capture); gold GVZ; crosses from the two legs' iv30 and the
                 legs' 60-bar D1 return correlation
       realised  London 00-22 session H-L / O-C / O-H / O-L (what the ladder forecasts)
     sigma_adj = sigma_t * exp(k * (log(IV/sigma_t) - mu_inst)), k per class from the same ridge.
  2. re-checks out of sample (first 60% fit, last 40% scored) that it still beats the plain ladder
     built from the same inputs — the pass rule of the two pre-registrations, re-applied;
  3. writes js/forecastLadderIvAdjParams.js (fit on all data) + analysis/output/iv_adjusted/CALIBRATION.md.

    python -m forge.export_iv_adjusted_params
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_combined_range import asof_before, cboe, london_date
from forge.run_horizon_reversion import FORGE_KEY, daily_for, ladder_estimators

OUT_JS = Path("js/forecastLadderIvAdjParams.js")
OUT_MD = Path("analysis/output/iv_adjusted/CALIBRATION.md")
D1_ROOT = Path("VolRangeForecaster/data/m1")
IVD = Path("oi_research_book/data")
LEG = {"EUR": ("EURUSD", +1), "GBP": ("GBPUSD", +1), "AUD": ("AUDUSD", +1),
       "JPY": ("USDJPY", -1), "CAD": ("USDCAD", -1), "CHF": ("USDCHF", -1)}
IVFILE = {"EURUSD": "eur_usd", "GBPUSD": "gbp_usd", "AUDUSD": "aud_usd", "USDJPY": "usd_jpy",
          "USDCAD": "usd_cad", "USDCHF": "usd_chf"}
INDEX_IV = {"NQ": "VXN", "SPX": "VIX", "DOW": "VIX", "US2000": "VIX", "DE30": "VIX", "UK100": "VIX"}
# US-EXTRAS-CONFIRM (forge/US_EXTRAS_CONFIRM_PREREG.md, CONFIRMED on untouched 2011-2015): the
# VIX-curve / breadth terms add to IV/sigma on these four only.
US_EXTRAS = ("NQ", "SPX", "DOW", "US2000")
EXTRAS = ("vix_inv", "front_dear", "front_calm", "all_down", "nq_dw")
BREADTH = ("NQ", "SPX", "DOW", "US2000", "DE30", "UK100")
CROSSES = ("AUDCAD", "AUDCHF", "AUDJPY", "CADCHF", "CADJPY", "CHFJPY", "EURAUD", "EURCAD",
           "EURCHF", "EURGBP", "EURJPY", "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY")
CLASS = {**{n: "indices" for n in INDEX_IV}, **{n: "fx_major" for n in IVFILE}, "GOLD": "fx_major",
         **{n: "crosses" for n in CROSSES}}
CORR_WIN, LAMBDA, TRAIN_FRAC = 60, 1.0, 0.60
QUANT, TAUS = ("hl", "oc", "oh", "ol"), (0.50, 0.75, 0.90)


def d1(name: str) -> pd.DataFrame:
    key = FORGE_KEY.get(name, name.lower())
    t = pd.read_parquet(D1_ROOT / f"{key}_d1.parquet")
    idx = pd.DatetimeIndex(t.index)
    t.index = (idx.tz_convert("UTC").tz_localize(None) if idx.tz is not None else idx).normalize()
    return t[~t.index.duplicated()].sort_index()


def ivd(name: str) -> pd.Series:
    t = pd.read_parquet(IVD / f"iv_daily_{IVFILE[name]}.parquet")
    return pd.Series(t["iv30"].astype(float).to_numpy() * 100, index=pd.to_datetime(t["date"])).sort_index()


def realised(name: str) -> pd.DataFrame:
    d = daily_for(FORGE_KEY.get(name, name.lower()))
    o, h, l, c = (d[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    return pd.DataFrame({"date": london_date(d.index), "hl": (h - l) / o * 100, "oc": np.abs(c - o) / o * 100,
                         "oh": (h - o) / o * 100, "ol": (o - l) / o * 100})


def main():
    est = ladder_estimators()
    vix, vxn, gvz, vix3m, vix9d = cboe("VIX"), cboe("VXN"), cboe("GVZ"), cboe("VIX3M"), cboe("VIX9D")
    bars = {n: d1(n) for n in {*INDEX_IV, *IVFILE, "GOLD", *CROSSES}}
    ret = {n: np.log(b["close"]).diff() for n, b in bars.items()}
    rows, audit = [], {}
    for name, cls in CLASS.items():
        b = bars[name]
        sig_ann = pd.Series(V.ESTIMATORS[est[name]](b.reset_index(drop=True)).astype(float), index=b.index)
        r = realised(name)
        D = pd.DatetimeIndex(r["date"])
        s = asof_before(D, sig_ann.dropna())
        if cls == "indices":
            iv = asof_before(D, vxn if INDEX_IV[name] == "VXN" else vix)
        elif name == "GOLD":
            iv = asof_before(D, gvz)
        elif cls == "fx_major":
            iv = asof_before(D, ivd(name))
        else:
            (qa, sa), (qb, sb) = LEG[name[:3]], LEG[name[3:]]
            ra, rb = ret[qa].align(ret[qb], join="inner")
            rho = asof_before(D, ra.rolling(CORR_WIN, min_periods=CORR_WIN).corr(rb).dropna())
            va, vb = asof_before(D, ivd(qa)), asof_before(D, ivd(qb))
            var = va ** 2 + vb ** 2 - 2 * sa * sb * rho * va * vb
            iv = np.sqrt(np.where(var > 0, var, np.nan))
        df = r.copy()
        df["sig_d"], df["x"], df["inst"], df["cls"] = s / V.SQRT252, np.log(iv / s), name, cls
        ok = np.isfinite(df["x"]) & (df["sig_d"] > 0) & (df["hl"] > 0)
        audit[name] = f"{cls}, {int(ok.sum())} sessions, {df.loc[ok, 'date'].min().date()} to {df.loc[ok, 'date'].max().date()}"
        rows.append(df[ok])
        print(name, audit[name], flush=True)
    X = pd.concat(rows, ignore_index=True)

    def fit_k(sub):
        mu = sub.groupby("inst")["x"].mean()
        y = np.log(sub["hl"] / sub["sig_d"]); y = y - y.groupby(sub["inst"]).transform("mean")
        z = sub["x"] - mu.loc[sub["inst"]].to_numpy()
        sd = float(z.std()); zs = z / sd
        beta = float((zs @ y) / (zs @ zs + LAMBDA))
        return beta / sd, mu

    params, check, exc = {}, {}, {}
    for cls in ("indices", "fx_major", "crosses"):
        C = X[X["cls"] == cls]
        split = C["date"].quantile(TRAIN_FRAC)
        k_tr, mu_tr = fit_k(C[C["date"] < split])
        k_all, mu_all = fit_k(C)
        per = []
        for inst, g in C.groupby("inst"):
            gtr, gte = g[g["date"] < split], g[g["date"] >= split]
            sA = {"tr": gtr["sig_d"].to_numpy(), "te": gte["sig_d"].to_numpy()}
            sB = {p: gg["sig_d"].to_numpy() * np.exp(k_tr * (gg["x"].to_numpy() - mu_tr[inst])) for p, gg in (("tr", gtr), ("te", gte))}
            loss = {}
            for arm, sg in (("A", sA), ("B", sB)):
                L = 0.0
                for q in QUANT:
                    for t in TAUS:
                        m = V.fit_width_multiplier(sg["tr"], gtr[q].to_numpy(), t)
                        pred = m * sg["te"]; act = gte[q].to_numpy()
                        if q == "hl" and t < 0.9:
                            d_ = act - pred; L += float(np.where(d_ >= 0, t * d_, (t - 1) * d_).mean())
                        acc = exc.setdefault(cls, {}).setdefault(f"{q}_p{int(t * 100)}", {}).setdefault(arm, [0, 0])
                        acc[0] += int((act > pred).sum()); acc[1] += len(act)
                loss[arm] = L
            per.append({"inst": inst, "ratio": round(loss["B"] / loss["A"], 4)})
            # export: full-data fit
            sfull = g["sig_d"].to_numpy() * np.exp(k_all * (g["x"].to_numpy() - mu_all[inst]))
            params[inst] = {"class": cls, "estimator": est[inst], "k": round(k_all, 4), "mu": round(float(mu_all[inst]), 5),
                            "iv_source": ("VXN" if INDEX_IV.get(inst) == "VXN" else "VIX") if cls == "indices"
                                         else "GVZ" if inst == "GOLD" else "CME_ATM30" if cls == "fx_major" else "LEGS",
                            "width": {q: [round(V.fit_width_multiplier(sfull, g[q].to_numpy(), t), 4) for t in TAUS] for q in QUANT},
                            "n": int(len(g))}
        r_ = np.array([p["ratio"] for p in per])
        check[cls] = {"split": str(split.date()), "k_train": round(k_tr, 3), "k_all": round(k_all, 3),
                      "median_ratio": round(float(np.median(r_)), 4), "share_better": round(float((r_ < 1).mean()), 3),
                      "pass": bool(np.median(r_) < 0.98 and (r_ < 1).mean() >= 0.6), "per": per}
        print(f"\n{cls}: k_train {k_tr:.3f} k_all {k_all:.3f}  median B/A {np.median(r_):.4f} better {(r_ < 1).mean():.0%}  pass={check[cls]['pass']}")
        print("  ", per)

    # ── US indices: IV/sigma + the five confirmed extras, fitted jointly on live-type inputs ──
    closes = pd.DataFrame({n: bars[n]["close"] for n in BREADTH})
    r6 = closes.pct_change()
    full6 = r6.notna().all(axis=1)
    all_down = ((r6 < 0).all(axis=1) & full6).astype(float)[full6]
    nqc = bars["NQ"]["close"]
    nq_dw = ((nqc / nqc.shift(5) - 1) <= -0.01).astype(float)[nqc.shift(5).notna()]
    U = X[X["inst"].isin(US_EXTRAS)].copy()
    D = pd.DatetimeIndex(U["date"])
    front = asof_before(D, vix9d) / asof_before(D, vix)
    U["vix_inv"] = (asof_before(D, vix) > asof_before(D, vix3m)).astype(float)
    U["front_dear"] = np.where(np.isfinite(front), (front >= 0.9669).astype(float), np.nan)
    U["front_calm"] = np.where(np.isfinite(front), (front < 0.8858).astype(float), np.nan)
    U["all_down"], U["nq_dw"] = asof_before(D, all_down), asof_before(D, nq_dw)
    U = U[U[list(EXTRAS)].notna().all(axis=1)].reset_index(drop=True)
    FE = ("x", *EXTRAS)

    def joint(sub):
        cen = sub.groupby("inst")[["x", *EXTRAS]].mean()
        y = np.log(sub["hl"] / sub["sig_d"]); y = (y - y.groupby(sub["inst"]).transform("mean")).to_numpy()
        Z = sub[list(FE)].to_numpy(float) - cen.loc[sub["inst"], list(FE)].to_numpy(float)
        sd = Z.std(axis=0); sd[sd == 0] = 1.0
        b = np.linalg.solve((Z / sd).T @ (Z / sd) + LAMBDA * np.eye(len(FE)), (Z / sd).T @ y)
        return dict(zip(FE, b / sd)), cen          # coefficients in raw units, per-instrument centres

    def adj_sig(g, coef, cen):
        z = sum(coef[f] * (g[f].to_numpy() - cen.loc[g["inst"], f].to_numpy()) for f in FE)
        return g["sig_d"].to_numpy() * np.exp(z)

    usplit = U["date"].quantile(TRAIN_FRAC)
    utr = U[U["date"] < usplit]
    cJ, cenJ = joint(utr)
    kI, muI = fit_k(utr)                            # IV-only arm, same rows, for the comparison
    uper = []
    for inst, g in U.groupby("inst"):
        gtr, gte = g[g["date"] < usplit], g[g["date"] >= usplit]
        losses = {}
        for arm, fn in (("ivonly", lambda gg: gg["sig_d"].to_numpy() * np.exp(kI * (gg["x"].to_numpy() - muI[inst]))),
                        ("joint", lambda gg: adj_sig(gg, cJ, cenJ))):
            L = 0.0
            for t in (0.50, 0.75):
                m = V.fit_width_multiplier(fn(gtr), gtr["hl"].to_numpy(), t)
                pred = m * fn(gte); d_ = gte["hl"].to_numpy() - pred
                L += float(np.where(d_ >= 0, t * d_, (t - 1) * d_).mean())
            losses[arm] = L
        uper.append({"inst": inst, "ratio": round(losses["joint"] / losses["ivonly"], 4)})
    ur = np.array([p["ratio"] for p in uper])
    check["us_extras"] = {"split": str(usplit.date()), "median_ratio": round(float(np.median(ur)), 4),
                          "share_better": round(float((ur < 1).mean()), 3), "pass": bool(np.median(ur) < 0.99 and (ur < 1).sum() >= 3),
                          "coef_train": {k: round(float(v), 4) for k, v in cJ.items()}, "per": uper, "k_train": None, "k_all": None}
    print(f"us_extras (joint vs IV-only, live-type): median {np.median(ur):.4f}, better {(ur < 1).sum()}/4", uper)
    cAll, cenAll = joint(U)
    for inst, g in U.groupby("inst"):
        sfull = adj_sig(g, cAll, cenAll)
        params[inst]["extras"] = {
            "coef": {f: round(float(cAll[f]), 5) for f in FE},                 # 'x' = ln(IV/sigma) coefficient
            "mean": {f: round(float(cenAll.loc[inst, f]), 5) for f in FE},
            "width": {q: [round(V.fit_width_multiplier(sfull, g[q].to_numpy(), t), 4) for t in TAUS] for q in QUANT},
            "evidence": "forge/US_EXTRAS_CONFIRM_PREREG.md", "n": int(len(g))}

    for leg in LEG.values():                                   # crosses need the legs' params on the live side
        params.setdefault(leg[0], {})
    meta = {"generated": str(date.today()), "source": "forge/export_iv_adjusted_params.py",
            "evidence": ["forge/COMBINED_RANGE_PREREG.md", "forge/CROSS_IV_PREREG.md", str(OUT_MD).replace("\\", "/")],
            "formula": "sigma_adj = sigma_t * exp(k * (log(IV_ann / sigma_t_ann) - mu)); rung = width * sigma_adj",
            "corr_window": CORR_WIN, "legs": {c: list(v) for c, v in LEG.items()}, "rungs": ["p50", "p75", "p90"]}
    OUT_JS.write_text(
        "/**\n * IV-adjusted daily ladder params. GENERATED — do not hand-edit.\n"
        " * Regenerate: python -m forge.export_iv_adjusted_params\n"
        " * Calibrated on LIVE-type inputs (OANDA D1 sigma; VIX/VXN, CME ATM 30d, GVZ, leg-built cross IV).\n */\n"
        f"export const IVADJ_PARAMS = {json.dumps({**meta, 'pairs': {k: v for k, v in params.items() if v}}, indent=1)};\n",
        encoding="utf-8")

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    md = ["# IV-adjusted daily ladder — calibration on live-type inputs", "",
          "Re-check of COMBINED-RANGE / CROSS-IV with the inputs the live export uses (OANDA D1 σ; VIX/VXN close; "
          "CME constant-maturity 30d ATM IV; GVZ; crosses from the legs). First 60% fit, last 40% scored; "
          "pass rule as pre-registered (median H-L p50+p75 pinball B÷A < 0.98 and B better on ≥ 60%).", ""]
    for cls, c in check.items():
        md += [f"## {cls} — {'PASS' if c['pass'] else 'FAIL'}", "",
               f"Split {c['split']}. Elasticity k: {c['k_train']} (train) / {c['k_all']} (all data, exported). "
               f"Median B÷A **{c['median_ratio']}**, B better on **{c['share_better']:.0%}**.", "",
               "| " + " | ".join(p["inst"] for p in c["per"]) + " |", "|" + "---|" * len(c["per"]),
               "| " + " | ".join(str(p["ratio"]) for p in c["per"]) + " |", "",
               "| rung | target | A exceed | B exceed |", "|---|---|---|---|"]
        for rk in sorted(exc.get(cls, {})):
            tgt = {"p50": 50, "p75": 25, "p90": 10}[rk.split("_")[1]]
            a, b = exc[cls][rk]["A"], exc[cls][rk]["B"]
            md.append(f"| {rk} | {tgt}% | {a[0] / a[1]:.1%} | {b[0] / b[1]:.1%} |")
        md.append("")
    md += ["## Data", ""] + [f"- {k}: {v}" for k, v in audit.items()]
    OUT_MD.write_text("\n".join(md), encoding="utf-8")
    (OUT_MD.parent / "calibration.json").write_text(json.dumps({"check": check, "audit": audit}, indent=1, default=str))
    print("wrote", OUT_JS, OUT_MD)


if __name__ == "__main__":
    main()
