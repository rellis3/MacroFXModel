"""US-EXTRAS-CONFIRM — runs forge/US_EXTRAS_CONFIRM_PREREG.md exactly as registered.

Independent window 2011-2015, Yahoo daily OHLC (cash session). A = IV/sigma only, B = IV/sigma + the
five VIX-curve / breadth extras; same ridge method as COMBINED-RANGE; first 60% fit, last 40% scored.

    python -m forge.run_us_extras_confirm
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_combined_range import asof_before, cboe

YDIR, OUT = Path("analysis/surfaces/yahoo"), Path("analysis/output/us_extras_confirm")
START, END = pd.Timestamp("2011-01-03"), pd.Timestamp("2015-12-31")
US = {"SPX": "GSPC", "NQ": "NDX", "DOW": "DJI", "US2000": "RUT"}
SIX = ("GSPC", "NDX", "DJI", "RUT", "GDAXI", "FTSE")
EXTRAS = ("vix_inv", "front_dear", "front_calm", "all_down", "nq_dw")
EXPECT = {"vix_inv": "+", "front_dear": "+", "front_calm": "-", "all_down": "+", "nq_dw": "+"}
LAMBDA, TRAIN_FRAC, TAUS = 1.0, 0.60, (0.50, 0.75)


def yahoo(sym: str) -> pd.DataFrame:
    r = json.load(open(YDIR / f"{sym}.json"))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    idx = pd.DatetimeIndex([dt.datetime.fromtimestamp(t, dt.timezone.utc).date() for t in r["timestamp"]])
    df = pd.DataFrame({k: pd.to_numeric(pd.Series(q[k]), errors="coerce").to_numpy() for k in ("open", "high", "low", "close")}, index=idx)
    df = df[~df.index.duplicated()].dropna().sort_index()
    return df[(df["high"] >= df["low"]) & (df["open"] > 0)]


def ridge(Z, y):
    return np.linalg.solve(Z.T @ Z + LAMBDA * np.eye(Z.shape[1]), Z.T @ y)


def main():
    vix, vix3m, vix9d, vxn = cboe("VIX"), cboe("VIX3M"), cboe("VIX9D"), cboe("VXN")
    px = {s: yahoo(s) for s in SIX}
    rets = pd.DataFrame({s: d["close"].pct_change() for s, d in px.items()})
    all_down = ((rets < 0).all(axis=1) & rets.notna().all(axis=1)).astype(float)[rets.notna().all(axis=1)]
    ndx = px["NDX"]["close"]
    nq_dw = ((ndx / ndx.shift(5) - 1) <= -0.01).astype(float)[ndx.shift(5).notna()]

    rows, audit = [], {}
    for name, sym in US.items():
        d = px[sym]
        sig_ann = pd.Series(V.ESTIMATORS["yz_10"](d.reset_index(drop=True)).astype(float), index=d.index)
        D = d.index[(d.index >= START) & (d.index <= END)]
        s = asof_before(D, sig_ann.dropna())
        iv = asof_before(D, vxn if name == "NQ" else vix)
        front = asof_before(D, vix9d) / asof_before(D, vix)
        f = pd.DataFrame({"date": D, "inst": name, "hl": ((d.loc[D, "high"] - d.loc[D, "low"]) / d.loc[D, "open"] * 100).to_numpy(),
                          "sig_d": s / V.SQRT252, "iv_sig": np.log(iv / s),
                          "vix_inv": (asof_before(D, vix) > asof_before(D, vix3m)).astype(float),
                          "front_dear": (front >= 0.9669).astype(float), "front_calm": (front < 0.8858).astype(float),
                          "all_down": asof_before(D, all_down), "nq_dw": asof_before(D, nq_dw)})
        f.loc[~np.isfinite(front), ["front_dear", "front_calm"]] = np.nan
        ok = f.drop(columns=["date", "inst"]).notna().all(axis=1) & np.isfinite(f["iv_sig"]) & (f["sig_d"] > 0) & (f["hl"] > 0)
        audit[name] = f"{int(ok.sum())}/{len(f)} sessions usable, {f.loc[ok, 'date'].min().date()} to {f.loc[ok, 'date'].max().date()}"
        print(name, audit[name], flush=True)
        rows.append(f[ok])
    X = pd.concat(rows, ignore_index=True)
    split = X["date"].quantile(TRAIN_FRAC)
    tr = (X["date"] < split).to_numpy()
    X["y"] = np.log(X["hl"] / X["sig_d"])

    def arm(feats):
        cen = X[tr].groupby("inst")[["y", *feats]].mean()
        Z = X[list(feats)].to_numpy(float) - cen.loc[X["inst"], list(feats)].to_numpy(float)
        yc = X["y"].to_numpy() - cen.loc[X["inst"], "y"].to_numpy()
        sd = Z[tr].std(axis=0); sd[sd == 0] = 1.0
        b = ridge(Z[tr] / sd, yc[tr])
        return X["sig_d"].to_numpy() * np.exp((Z / sd) @ b), dict(zip(feats, b))

    sigA, bA = arm(("iv_sig",))
    sigB, bB = arm(("iv_sig", *EXTRAS))
    X["sigA"], X["sigB"] = sigA, sigB
    per, exc = [], {}
    for inst, g in X.groupby("inst"):
        gtr, gte = g[g["date"] < split], g[g["date"] >= split]
        res = {}
        for a, col in (("A", "sigA"), ("B", "sigB")):
            L, p75 = 0.0, None
            for t in TAUS:
                m = V.fit_width_multiplier(gtr[col].to_numpy(), gtr["hl"].to_numpy(), t)
                pred = m * gte[col].to_numpy(); d_ = gte["hl"].to_numpy() - pred
                L += float(np.where(d_ >= 0, t * d_, (t - 1) * d_).mean())
                if t == 0.75: p75 = pred
            res[a] = (L, gte["hl"].to_numpy() > p75)
        for st in ("vix_inv", "front_dear", "front_calm", "all_down", "nq_dw"):
            m = gte[st].to_numpy() == 1
            for a in "AB":
                acc = exc.setdefault(st, {}).setdefault(a, [0, 0]); acc[0] += int(res[a][1][m].sum()); acc[1] += int(m.sum())
        per.append({"inst": inst, "n_train": len(gtr), "n_test": len(gte), "ratio": round(res["B"][0] / res["A"][0], 4)})
    r = np.array([p["ratio"] for p in per])
    med, nbetter = float(np.median(r)), int((r < 1).sum())
    signs = {f: bool((bB[f] > 0) == (EXPECT[f] == "+")) for f in EXTRAS}
    st_tbl = {k: {a: (round(v[a][0] / v[a][1], 3) if v[a][1] else None) for a in "AB"} | {"n": v["A"][1]} for k, v in exc.items()}
    confirmed = med < 0.99 and nbetter >= 3
    rep = {"window": [str(START.date()), str(END.date())], "split": str(split.date()), "median_ratio": round(med, 4),
           "n_better": nbetter, "verdict": "CONFIRMED" if confirmed else "NOT CONFIRMED",
           "beta_A": {k: round(float(v), 4) for k, v in bA.items()}, "beta_B": {k: round(float(v), 4) for k, v in bB.items()},
           "signs_ok": signs, "p75_by_state": st_tbl, "per_instrument": per, "audit": audit}
    print(json.dumps({k: rep[k] for k in ("split", "median_ratio", "n_better", "verdict", "beta_B", "signs_ok")}, indent=1))
    for k, v in st_tbl.items(): print(f"  {k:10s} n={v['n']}  A {v['A']}  B {v['B']}")
    print(per)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(rep, indent=1, default=str))
    md = ["# US-EXTRAS-CONFIRM — results", "", "Pre-registration: `forge/US_EXTRAS_CONFIRM_PREREG.md`.", "",
          f"**Verdict: {rep['verdict']}.** Window {rep['window'][0]} → {rep['window'][1]}, train before {rep['split']}. "
          f"Test pinball (IV + extras) ÷ (IV only), median **{rep['median_ratio']}**, better on **{nbetter}/4**.", "",
          "| index | train | test | B ÷ A |", "|---|---|---|---|"] + \
         [f"| {p['inst']} | {p['n_train']} | {p['n_test']} | {p['ratio']} |" for p in per] + \
         ["", "| extra | expected | joint β (std) | sign as ledger |", "|---|---|---|---|"] + \
         [f"| {f} | {EXPECT[f]} | {rep['beta_B'][f]} | {'yes' if signs[f] else 'no'} |" for f in EXTRAS] + \
         ["", "| test days with | n | A p75 exceed | B p75 exceed |", "|---|---|---|---|"] + \
         [f"| {k} | {v['n']} | {v['A']} | {v['B']} |" for k, v in st_tbl.items()] + ["", "## Data", ""] + [f"- {k}: {v}" for k, v in audit.items()]
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")


if __name__ == "__main__":
    main()
