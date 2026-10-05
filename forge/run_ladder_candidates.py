"""LADDER CALIBRATION variants 2-4 (forge/LADDER_CALIBRATION_PREREG.md, Amendment 1).

One harness, four sigma arms, identical width fitting; only sigma differs:
  A0  live estimator sigma (forecastLadderParams estimator per pair) on OANDA D1 — the baseline
  A2  HAR-log sigma exactly as production computes it: forecastSigma(last 800 D1 bars, 'har_rv_log') (JS, via
      scripts/rangebook/har800_sigma.mjs)
  A3  IV-adjusted: sigma * exp(k * (ln(IV/sigma) - mu)), k per class and mu per instrument fitted on train
  A4  pure IV: IV / sqrt(252)
Inputs are those of the shipped IV-adjusted export (forge/export_iv_adjusted_params.py), except daily bars:
NY-close sessions from M1 (Amendment 2; the *_d1.parquet files are UTC days with Sunday stubs). Widths per instrument x
quantity x rung = forge.vol.fit_width_multiplier on train rows (< 2025-09-05). No event multipliers in any arm.
Offline only: nothing live is read or written.
    python -m forge.run_ladder_candidates
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.export_iv_adjusted_params import CLASS, INDEX_IV, LEG, CORR_WIN, ivd, realised
from forge.run_combined_range import asof_before, cboe
from forge.run_horizon_reversion import FORGE_KEY, ladder_estimators

OUT = Path("analysis/output/ladder_candidates")
D1J = OUT / "d1"
SPLIT = pd.Timestamp("2025-09-05")
LAMBDA = 1.0
QUANT, TAUS = ("hl", "oc", "oh", "ol"), (0.50, 0.75, 0.90)
ARMS = ("A0", "A2", "A3", "A4")
NAMES = {"A0": "live estimator", "A2": "HAR-800 (production path)", "A3": "IV-adjusted", "A4": "pure IV"}


def fit_k(sub):
    """Same ridge as export_iv_adjusted_params.main.fit_k: elasticity of log(HL/sigma) on log(IV/sigma)."""
    mu = sub.groupby("inst")["x"].mean()
    y = np.log(sub["hl"] / sub["s0"]); y = y - y.groupby(sub["inst"]).transform("mean")
    z = sub["x"] - mu.loc[sub["inst"]].to_numpy()
    sd = float(z.std()); zs = z / sd
    return float((zs @ y) / (zs @ zs + LAMBDA)) / sd, mu


def build() -> pd.DataFrame:
    est = ladder_estimators()
    vix, vxn, gvz = cboe("VIX"), cboe("VXN"), cboe("GVZ")
    # Amendment 2: NY-close daily bars from M1 (the live OANDA D shape), not the UTC-day *_d1.parquet files
    subprocess.run(["node", "scripts/rangebook/ny_close_d1.mjs",
                    *(f"{n}:{FORGE_KEY.get(n, n.lower())}" for n in CLASS)], check=True)
    subprocess.run(["node", "scripts/rangebook/har800_sigma.mjs"], check=True)
    bars = {}
    for n in CLASS:
        b = pd.DataFrame(json.loads((D1J / f"{n}.json").read_text()))
        b.index = pd.to_datetime(b.pop("d"))
        bars[n] = b.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close"})
    ret = {n: np.log(b["close"]).diff() for n, b in bars.items()}
    out = []
    for name, cls in CLASS.items():
        b = bars[name]
        s0 = pd.Series(V.ESTIMATORS[est[name]](b.reset_index(drop=True)).astype(float), index=b.index)
        h = pd.read_csv(D1J / f"{name}_har800.csv", parse_dates=["date"]).set_index("date")["sig"]
        r = realised(name)
        D = pd.DatetimeIndex(r["date"])
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
        sa0 = asof_before(D, s0.dropna())
        df["inst"], df["cls"] = name, cls
        df["s0"] = sa0 / V.SQRT252
        df["s2"] = asof_before(D, h.dropna()) / V.SQRT252
        df["s4"] = iv / V.SQRT252
        df["x"] = np.log(iv / sa0)
        ok = np.isfinite(df[["s0", "s2", "s4", "x"]]).all(axis=1) & (df[["s0", "s2", "s4"]] > 0).all(axis=1) & (df["hl"] > 0)
        df = df[ok].copy()
        med = df["s0"].rolling(250, min_periods=60).median().shift(1)
        df["rel"] = df["s0"] / med
        out.append(df)
        print(f"{name:7} {cls:9} {len(df)} sessions {df['date'].min().date()} -> {df['date'].max().date()}", flush=True)
    return pd.concat(out, ignore_index=True)


def main():
    X = build()
    X["train"] = X["date"] < SPLIT
    # A3: k per class, mu per instrument, train rows only
    X["s3"] = np.nan
    for cls, C in X.groupby("cls"):
        k, mu = fit_k(C[C["train"]])
        X.loc[C.index, "s3"] = C["s0"] * np.exp(k * (C["x"] - mu.loc[C["inst"]].to_numpy()))
        print(f"A3 {cls}: k={k:.3f}")
    # widths on train rows, per instrument x quantity x rung, for every arm
    for arm in ARMS:
        s = f"s{arm[1]}"
        for inst, g in X.groupby("inst"):
            tr = g[g["train"]]
            for q in QUANT:
                for t in TAUS:
                    m = V.fit_width_multiplier(tr[s].to_numpy() * 100, tr[q].to_numpy(), t)
                    X.loc[g.index, f"{arm}_{q}_{int(t*100)}"] = m * g[s].to_numpy() * 100
    X.to_parquet(OUT / "rows.parquet")
    score(X)


def clustered(sub, col):
    g = sub.groupby("date")[col].mean()
    return g.mean(), g.std(ddof=1) / np.sqrt(len(g))


def score(X: pd.DataFrame):
    T = X[~X["train"]].dropna(subset=["rel"]).copy()
    print(f"\nTest {T['date'].min().date()} -> {T['date'].max().date()}: {len(T)} instrument-days, "
          f"{T['date'].nunique()} dates, {T['inst'].nunique()} instruments; train rows {int(X['train'].sum())}")
    tgt = {50: 0.50, 75: 0.25, 90: 0.10}
    for arm in ARMS:
        for q in QUANT:
            for t in tgt:
                T[f"x_{arm}_{q}_{t}"] = (T[q] > T[f"{arm}_{q}_{t}"]).astype(float)
    edges = np.quantile(T["rel"], [0.2, 0.4, 0.6, 0.8])
    T["quint"] = np.searchsorted(edges, T["rel"].to_numpy())
    res = {}
    print("\n== Unconditional exceedance, HL p50/p75/p90 and OH p90 | 12-rung mean miss")
    for arm in ARMS:
        miss = [abs(clustered(T, f"x_{arm}_{q}_{t}")[0] - v) for q in QUANT for t, v in tgt.items()]
        hl = [clustered(T, f"x_{arm}_hl_{t}")[0] * 100 for t in tgt]
        res[arm] = {"guard_miss": float(np.mean(miss) * 100)}
        print(f"  {arm} {NAMES[arm]:26} HL {hl[0]:5.1f} {hl[1]:5.1f} {hl[2]:5.1f}   "
              f"OH p90 {clustered(T, f'x_{arm}_oh_90')[0]*100:5.1f}   miss {res[arm]['guard_miss']:.2f}pp")
    print("\n== By sigma quintile (A0 sigma / trailing 250 median): HL > p75 | HL > p90")
    for arm in ARMS:
        cells, fixed, line = [], True, f"  {arm} {NAMES[arm]:26}"
        for k in range(5):
            Q = T[T["quint"] == k]
            a, b = clustered(Q, f"x_{arm}_hl_75")[0], clustered(Q, f"x_{arm}_hl_90")[0]
            line += f"  Q{k+1} {a*100:4.1f}/{b*100:4.1f}"
            fixed &= abs(a - 0.25) <= 0.03 and abs(b - 0.10) <= 0.03
            for q in ("hl", "oh", "ol"):
                for t in (75, 90):
                    cells.append(abs(clustered(Q, f"x_{arm}_{q}_{t}")[0] - tgt[t]))
        res[arm].update(primary_miss=float(np.mean(cells) * 100), target_bar=bool(fixed))
        print(line + f"   30-cell miss {res[arm]['primary_miss']:.2f}pp  bar {'MET' if fixed else 'not met'}")
    print("\n== HL p50+p75 pinball, median per-instrument ratio vs A0 (lower = sharper and right) | slope")
    for arm in ARMS:
        ratios = []
        for inst, g in T.groupby("inst"):
            L = {a: sum(V.pinball_loss(g["hl"].to_numpy(), g[f"{a}_hl_{t}"].to_numpy(), t / 100).mean() for t in (50, 75))
                 for a in ("A0", arm)}
            ratios.append(L[arm] / L["A0"])
        s = T[f"s{arm[1]}"]
        x = np.log(s) - np.log(s).groupby(T["inst"]).transform("mean")
        y = np.log(T["hl"]) - np.log(T["hl"]).groupby(T["inst"]).transform("mean")
        res[arm].update(pinball=float(np.median(ratios)), better=float(np.mean(np.array(ratios) < 1)),
                        slope=float((x * y).sum() / (x * x).sum()))
        print(f"  {arm} {NAMES[arm]:26} pinball {res[arm]['pinball']:.4f} (better on {res[arm]['better']:.0%})   "
              f"slope {res[arm]['slope']:.2f}")
    print("\n== By class: HL > p75 by quintile Q1 / Q5")
    for cls, C in T.groupby("cls"):
        line = f"  {cls:9}"
        for arm in ARMS:
            a = clustered(C[C["quint"] == 0], f"x_{arm}_hl_75")[0] * 100
            b = clustered(C[C["quint"] == 4], f"x_{arm}_hl_75")[0] * 100
            line += f"   {arm} {a:4.1f}/{b:4.1f}"
        print(line)
    print("\n== VERDICT vs A0 (pre-registered)")
    b = res["A0"]
    for arm in ARMS[1:]:
        r = res[arm]
        p, g = r["primary_miss"] < b["primary_miss"], r["guard_miss"] <= b["guard_miss"] + 1.0
        r.update(primary=p, guard=g)
        print(f"  {arm} {NAMES[arm]:26} PRIMARY {'PASS' if p else 'FAIL'} ({r['primary_miss']:.2f} vs {b['primary_miss']:.2f})"
              f" · GUARD {'PASS' if g else 'FAIL'} ({r['guard_miss']:.2f} vs {b['guard_miss']:.2f})"
              f" · TARGET BAR {'MET' if r['target_bar'] else 'NOT MET'}")
    (OUT / "summary.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
