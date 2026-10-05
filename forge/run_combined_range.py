"""COMBINED-RANGE — runs forge/COMBINED_RANGE_PREREG.md exactly as registered.

A: H-L quantile = width × σ_t (widths refit on train).
B: σ_adj = σ_t × exp(x·β), β from a ridge regression (λ=1, standardised features) of
   log(H-L ÷ σ_t) on the pre-open features, pooled within class, train only; widths refit on σ_adj.

    python -m forge.run_combined_range
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_horizon_reversion import FORGE_KEY, daily_for, ladder_estimators

OUT = Path("analysis/output/combined_range")
CBOE = Path("analysis/surfaces/cboe")
CLASSES = {
    "indices": {"NQ": "VXN", "SPX": "VIX", "DOW": "VIX", "US2000": "VIX", "DE30": "VIX", "UK100": "VIX"},
    "fx_gold": {"EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDJPY": "USDJPY", "GOLD": "XAUUSD",
                "AUDUSD": "AUDUSD", "USDCAD": "USDCAD", "USDCHF": "USDCHF"},
}
BREADTH = ("NQ", "SPX", "DOW", "US2000", "DE30", "UK100")
FEATS = ("vix_inv", "front_dear", "front_calm", "iv_sig", "all_down", "nq_dw")
DUMMY = ("vix_inv", "front_dear", "front_calm", "all_down", "nq_dw")
EXPECT = {"vix_inv": "+", "front_dear": "+", "front_calm": "-", "iv_sig": "+", "all_down": "+", "nq_dw": "+"}
LAMBDA, TRAIN_FRAC = 1.0, 0.60
TAUS = ((0.50, "p50"), (0.75, "p75"))


def london_date(idx) -> pd.DatetimeIndex:
    """forge stamps london22 sessions at London midnight expressed in naive UTC (23:00 the previous
    day in summer). The session's real date is the London calendar date."""
    return pd.DatetimeIndex(idx).tz_localize("UTC").tz_convert("Europe/London").tz_localize(None).normalize()


def cboe(sym: str) -> pd.Series:
    t = pd.read_csv(CBOE / f"{sym}.csv")
    t.columns = [c.strip().upper() for c in t.columns]
    s = pd.Series(t["CLOSE"].astype(float).to_numpy(), index=pd.to_datetime(t["DATE"], format="%m/%d/%Y"))
    return s[~s.index.duplicated()].sort_index()


def asof_before(dates: pd.DatetimeIndex, s: pd.Series) -> np.ndarray:
    """Value of `s` at the latest date STRICTLY before each session date."""
    left = pd.DataFrame({"d": pd.DatetimeIndex(dates).astype("datetime64[ns]")}).sort_values("d")
    right = pd.DataFrame({"d": pd.DatetimeIndex(s.index).astype("datetime64[ns]"), "v": s.to_numpy(float)}).sort_values("d")
    m = pd.merge_asof(left, right, on="d", allow_exact_matches=False, direction="backward")
    return m.set_index(left.index).sort_index()["v"].to_numpy()


def session_table(name: str, est: str):
    d = daily_for(FORGE_KEY.get(name, name.lower()))
    if d is None:
        return None
    sig_ann = V.as_of_yesterday(V.ESTIMATORS[est](d))                 # annualised %, forecast-ready
    o, h, l = (d[c].to_numpy(float) for c in ("open", "high", "low"))
    return pd.DataFrame({"date": london_date(d.index), "close": d["close"].to_numpy(float),
                         "hl": (h - l) / o * 100, "sig_ann": sig_ann, "sig_d": sig_ann / V.SQRT252})


def main():
    est = ladder_estimators()
    vix, vix3m, vix9d, vxn = cboe("VIX"), cboe("VIX3M"), cboe("VIX9D"), cboe("VXN")
    cvol = pd.read_parquet("data/cvol/cme_cvol_eod.parquet")
    cvol["d"] = pd.to_datetime(cvol["timestamp"]).dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()

    # market-wide states, keyed by the session they describe (D-1), then looked up strictly before D
    tabs = {n: session_table(n, est[n]) for n in BREADTH}
    rets = pd.DataFrame({n: t.set_index("date")["close"].pct_change() for n, t in tabs.items() if t is not None})
    all_down = (rets.notna().all(axis=1) & (rets < 0).all(axis=1)).astype(float)
    all_down[rets.isna().any(axis=1)] = np.nan
    nq = tabs["NQ"].set_index("date")["close"]
    nq_dw = ((nq / nq.shift(5) - 1) <= -0.01).astype(float).where(nq.shift(5).notna())

    rows, audit = [], {}
    for cls, members in CLASSES.items():
        for name, ivsrc in members.items():
            t = session_table(name, est[name])
            if t is None:
                audit[name] = "no local M1"; continue
            D = pd.DatetimeIndex(t["date"])
            iv = (asof_before(D, vxn if ivsrc == "VXN" else vix) if cls == "indices"
                  else asof_before(D, cvol[cvol["product"] == ivsrc].set_index("d")["cvol"].astype(float).sort_index()))
            f = pd.DataFrame({
                "vix_inv": (asof_before(D, vix) > asof_before(D, vix3m)).astype(float),
                "front": asof_before(D, vix9d) / asof_before(D, vix),
                "iv_sig": np.log(iv / t["sig_ann"].to_numpy()),
                "all_down": asof_before(D, all_down.dropna()),
                "nq_dw": asof_before(D, nq_dw.dropna()),
            })
            f["front_dear"] = (f["front"] >= 0.9669).astype(float).where(f["front"].notna())
            f["front_calm"] = (f["front"] < 0.8858).astype(float).where(f["front"].notna())
            for c in ("vix_inv",):
                f.loc[~np.isfinite(asof_before(D, vix3m)), c] = np.nan
            df = pd.concat([t.reset_index(drop=True), f], axis=1)
            df["cls"], df["inst"] = cls, name
            ok = df[list(FEATS) + ["hl", "sig_d"]].notna().all(axis=1) & (df["sig_d"] > 0) & (df["hl"] > 0)
            audit[name] = f"{int(ok.sum())}/{len(df)} sessions usable ({ok.mean():.0%}), {df.loc[ok, 'date'].min().date()} to {df.loc[ok, 'date'].max().date()}"
            rows.append(df[ok])
            print(f"{name:7s} {audit[name]}", flush=True)
    data = pd.concat(rows, ignore_index=True)

    report = {"audit": audit, "classes": {}}
    for cls in CLASSES:
        X = data[data["cls"] == cls].copy()
        split = X["date"].quantile(TRAIN_FRAC)
        tr = X["date"] < split
        X["y"] = np.log(X["hl"] / X["sig_d"])
        # within-instrument centring on TRAIN means, so features cannot proxy instrument identity
        cen = X[tr].groupby("inst")[["y", *FEATS]].mean()
        Z = X[list(FEATS)].to_numpy(float) - cen.loc[X["inst"], list(FEATS)].to_numpy(float)
        yc = X["y"].to_numpy() - cen.loc[X["inst"], "y"].to_numpy()
        sd = Z[tr.to_numpy()].std(axis=0); sd[sd == 0] = 1.0
        Zs = Z / sd
        A_ = Zs[tr.to_numpy()]; b_ = yc[tr.to_numpy()]
        beta = np.linalg.solve(A_.T @ A_ + LAMBDA * np.eye(len(FEATS)), A_.T @ b_)
        adj = Zs @ beta
        X["sig_adj"] = X["sig_d"] * np.exp(adj)
        coef = {f: {"beta_std": round(float(b), 4),
                    "range_mult_when_on" if f in DUMMY else "range_mult_per_+1_log_iv_sig": round(float(np.exp(b / s)), 3),
                    "expected": EXPECT[f],
                    "sign_ok": bool((b > 0) == (EXPECT[f] == "+")) and abs(b) > 1e-3}
                for f, b, s in zip(FEATS, beta, sd)}

        per, exc = [], {}
        for inst, g in X.groupby("inst"):
            gtr, gte = g[g["date"] < split], g[g["date"] >= split]
            if len(gte) < 100 or len(gtr) < 100:
                continue
            loss, pred75 = {"A": 0.0, "B": 0.0}, {}
            for arm, col in (("A", "sig_d"), ("B", "sig_adj")):
                for tau, nm in TAUS:
                    m = V.fit_width_multiplier(gtr[col].to_numpy(), gtr["hl"].to_numpy(), tau)
                    pred = m * gte[col].to_numpy()
                    d_ = gte["hl"].to_numpy() - pred
                    loss[arm] += float(np.where(d_ >= 0, tau * d_, (tau - 1) * d_).mean())
                    if nm == "p75":
                        pred75[arm] = pred
            ex = {arm: gte["hl"].to_numpy() > pred75[arm] for arm in "AB"}
            ivt = gtr["iv_sig"].quantile([1 / 3, 2 / 3]).to_numpy()
            states = {**{f: gte[f].to_numpy() == 1 for f in DUMMY},
                      "iv_sig_low": gte["iv_sig"].to_numpy() < ivt[0], "iv_sig_high": gte["iv_sig"].to_numpy() >= ivt[1],
                      "all_days": np.ones(len(gte), bool)}
            for s, m in states.items():
                for arm in "AB":
                    acc = exc.setdefault(s, {}).setdefault(arm, [0, 0])
                    acc[0] += int(ex[arm][m].sum()); acc[1] += int(m.sum())
            per.append({"inst": inst, "n_train": len(gtr), "n_test": len(gte), "ratio": round(loss["B"] / loss["A"], 4),
                        "A_p75_exc": round(float(ex["A"].mean()), 3), "B_p75_exc": round(float(ex["B"].mean()), 3)})
        ratios = np.array([p["ratio"] for p in per])
        med, share = float(np.median(ratios)), float((ratios < 1).mean())
        state_tbl = {s: {arm: (round(v[arm][0] / v[arm][1], 3) if v[arm][1] else None) for arm in "AB"} | {"n": v["A"][1]}
                     for s, v in exc.items()}
        flagged = [s for s in state_tbl if s != "all_days" and state_tbl[s]["n"] >= 30]
        closer = sum(abs(state_tbl[s]["B"] - 0.25) < abs(state_tbl[s]["A"] - 0.25) for s in flagged)
        primary = med < 0.98 and share >= 0.60
        verdict = ("PASS" if closer >= len(flagged) / 2 else "MIXED") if primary else "FAIL"
        report["classes"][cls] = {"split_date": str(split.date()), "median_ratio": round(med, 4), "share_B_better": round(share, 3),
                                  "verdict": verdict, "coefficients": coef, "p75_exceed_by_state": state_tbl,
                                  "flagged_states_closer_to_25": f"{closer}/{len(flagged)}", "per_instrument": per}
        print(f"\n{cls}: split {split.date()} median B/A {med:.4f}, B better on {share:.0%}, states closer {closer}/{len(flagged)} -> {verdict}")
        for f, c in coef.items(): print("  ", f, c)
        for s, v in state_tbl.items(): print(f"   {s:12s} n={v['n']:5d}  A {v['A']}  B {v['B']}")
        for p in per: print("   ", p)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(report, indent=1, default=str))
    md = ["# COMBINED-RANGE — results", "", "Pre-registration: `forge/COMBINED_RANGE_PREREG.md`.", ""]
    for cls, r in report["classes"].items():
        md += [f"## {cls}", "", f"**Verdict: {r['verdict']}.** Train before {r['split_date']}, test after. "
               f"Test pinball B÷A median **{r['median_ratio']}**, B better on **{r['share_B_better']:.0%}** of instruments; "
               f"flagged states closer to 25%: {r['flagged_states_closer_to_25']}.", "",
               "| feature | expected | joint β (std) | range multiplier | sign as in ledger |", "|---|---|---|---|---|"]
        for f, c in r["coefficients"].items():
            mult = c.get("range_mult_when_on", c.get("range_mult_per_+1_log_iv_sig"))
            md.append(f"| {f} | {c['expected']} | {c['beta_std']} | ×{mult} | {'yes' if c['sign_ok'] else '**no / ~0**'} |")
        md += ["", "| state (test) | days | A p75 exceed | B p75 exceed |", "|---|---|---|---|"]
        md += [f"| {s} | {v['n']} | {v['A']:.1%} | {v['B']:.1%} |" for s, v in r["p75_exceed_by_state"].items() if v["n"]]
        md += ["", "| instrument | train | test | B÷A pinball | A p75 exc | B p75 exc |", "|---|---|---|---|---|---|"]
        md += [f"| {p['inst']} | {p['n_train']} | {p['n_test']} | {p['ratio']} | {p['A_p75_exc']:.1%} | {p['B_p75_exc']:.1%} |" for p in r["per_instrument"]]
        md.append("")
    md += ["## Data audit", ""] + [f"- {k}: {v}" for k, v in report["audit"].items()]
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    print("wrote", OUT / "RESULTS.md")


if __name__ == "__main__":
    main()
