"""CROSS-IV — runs forge/CROSS_IV_PREREG.md exactly as registered.

Cross implied vol from the two USD legs' CME CVOL and their trailing 60-session realised
correlation; feature iv_sig = log(cross IV / cross sigma_t); one pooled ridge beta on train.

    python -m forge.run_cross_iv
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_combined_range import asof_before, london_date, session_table
from forge.run_horizon_reversion import ladder_estimators

OUT = Path("analysis/output/cross_iv")
CROSSES = ("AUDCAD", "AUDCHF", "AUDJPY", "CADCHF", "CADJPY", "CHFJPY", "EURAUD", "EURCAD",
           "EURCHF", "EURGBP", "EURJPY", "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY")
LEG = {"EUR": ("EURUSD", +1), "GBP": ("GBPUSD", +1), "AUD": ("AUDUSD", +1),
       "JPY": ("USDJPY", -1), "CAD": ("USDCAD", -1), "CHF": ("USDCHF", -1)}
CORR_WIN, LAMBDA, TRAIN_FRAC = 60, 1.0, 0.60
FX_BETA_ELASTICITY = math.log(2.195)        # COMBINED-RANGE fx_gold iv_sig: ×2.195 per +1 log  (transfer check)
TAUS = ((0.50, "p50"), (0.75, "p75"))


def pinball(a, p, tau):
    d = a - p
    return float(np.where(d >= 0, tau * d, (tau - 1) * d).mean())


def main():
    est = ladder_estimators()
    cvol = pd.read_parquet("data/cvol/cme_cvol_eod.parquet")
    cvol["d"] = pd.to_datetime(cvol["timestamp"]).dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()
    civ = {p: g.set_index("d")["cvol"].astype(float).sort_index() for p, g in cvol.groupby("product")}
    # quoted-leg daily log returns on london22 sessions, keyed by London session date
    legret = {}
    for q in {v[0] for v in LEG.values()}:
        t = session_table(q, est[q])
        legret[q] = pd.Series(np.log(t["close"]).diff().to_numpy(), index=pd.DatetimeIndex(t["date"]))

    rows, audit, sanity = [], {}, {}
    for x in CROSSES:
        (qa, sa), (qb, sb) = LEG[x[:3]], LEG[x[3:]]
        t = session_table(x, est[x])
        D = pd.DatetimeIndex(t["date"])
        ra, rb = legret[qa].align(legret[qb], join="inner")
        rho = ra.rolling(CORR_WIN, min_periods=CORR_WIN).corr(rb)          # value at date d uses returns through d
        rho_D = asof_before(D, rho.dropna())                                  # strictly before session D
        va, vb = asof_before(D, civ[qa]), asof_before(D, civ[qb])
        var = va ** 2 + vb ** 2 - 2 * sa * sb * rho_D * va * vb
        iv_x = np.sqrt(np.where(var > 0, var, np.nan))
        df = t.copy()
        df["iv_x"], df["iv_sig"], df["inst"] = iv_x, np.log(iv_x / t["sig_ann"].to_numpy()), x
        # sanity: leg-built IV vs the cross's realised 20-session vol (annualised %), same day
        r = pd.Series(np.log(t["close"]).diff().to_numpy())
        rv20 = r.rolling(20).std().shift(-19) * math.sqrt(252) * 100          # realised over the NEXT 20 sessions
        m = np.isfinite(iv_x) & rv20.notna().to_numpy()
        sanity[x] = round(float(np.corrcoef(iv_x[m], rv20.to_numpy()[m])[0, 1]), 3)
        ok = df[["iv_sig", "hl", "sig_d"]].notna().all(axis=1) & np.isfinite(df["iv_sig"]) & (df["sig_d"] > 0) & (df["hl"] > 0)
        audit[x] = f"{int(ok.sum())}/{len(df)} usable, {df.loc[ok, 'date'].min().date()} to {df.loc[ok, 'date'].max().date()}"
        rows.append(df[ok])
        print(f"{x} {audit[x]}  corr(IV, next-20 RV)={sanity[x]}", flush=True)
    X = pd.concat(rows, ignore_index=True)

    split = X["date"].quantile(TRAIN_FRAC)
    tr = (X["date"] < split).to_numpy()
    X["y"] = np.log(X["hl"] / X["sig_d"])
    mu = X[tr].groupby("inst")[["y", "iv_sig"]].mean()
    z = X["iv_sig"].to_numpy() - mu.loc[X["inst"], "iv_sig"].to_numpy()
    yc = X["y"].to_numpy() - mu.loc[X["inst"], "y"].to_numpy()
    s = z[tr].std()
    zs = z / s
    beta = float((zs[tr] @ yc[tr]) / (zs[tr] @ zs[tr] + LAMBDA))
    X["sig_B"] = X["sig_d"] * np.exp(beta * zs)
    X["sig_T"] = X["sig_d"] * np.exp(FX_BETA_ELASTICITY * z)                 # transfer: majors' elasticity, frozen
    elasticity = beta / s

    per, exc = [], {}
    for inst, g in X.groupby("inst"):
        gtr, gte = g[g["date"] < split], g[g["date"] >= split]
        res = {}
        for arm, col in (("A", "sig_d"), ("B", "sig_B"), ("T", "sig_T")):
            loss, p75 = 0.0, None
            for tau, nm in TAUS:
                mlt = V.fit_width_multiplier(gtr[col].to_numpy(), gtr["hl"].to_numpy(), tau)
                pred = mlt * gte[col].to_numpy()
                loss += pinball(gte["hl"].to_numpy(), pred, tau)
                if nm == "p75": p75 = pred
            res[arm] = (loss, gte["hl"].to_numpy() > p75)
        e1, e2 = gtr["iv_sig"].quantile([1 / 3, 2 / 3]).to_numpy()
        states = {"iv_low": gte["iv_sig"].to_numpy() < e1, "iv_high": gte["iv_sig"].to_numpy() >= e2,
                  "all_days": np.ones(len(gte), bool)}
        for st, m in states.items():
            for arm in "ABT":
                acc = exc.setdefault(st, {}).setdefault(arm, [0, 0])
                acc[0] += int(res[arm][1][m].sum()); acc[1] += int(m.sum())
        per.append({"inst": inst, "n_train": len(gtr), "n_test": len(gte),
                    "ratio_B": round(res["B"][0] / res["A"][0], 4), "ratio_transfer": round(res["T"][0] / res["A"][0], 4),
                    "A_p75": round(float(res["A"][1].mean()), 3), "B_p75": round(float(res["B"][1].mean()), 3),
                    "corr_iv_rv20": sanity[inst]})
    rb = np.array([p["ratio_B"] for p in per]); rt = np.array([p["ratio_transfer"] for p in per])
    med, share = float(np.median(rb)), float((rb < 1).mean())
    st_tbl = {k: {a: round(v[a][0] / v[a][1], 3) for a in "ABT"} | {"n": v["A"][1]} for k, v in exc.items()}
    further = sum(abs(st_tbl[k]["B"] - 0.25) > abs(st_tbl[k]["A"] - 0.25) for k in ("iv_low", "iv_high"))
    primary = med < 0.98 and share >= 0.60
    verdict = ("MIXED" if further == 2 else "PASS") if primary else "FAIL"
    rep = {"split_date": str(split.date()), "beta_std": round(beta, 4), "elasticity": round(elasticity, 3),
           "median_ratio": round(med, 4), "share_better": round(share, 3),
           "transfer_median_ratio": round(float(np.median(rt)), 4), "transfer_share_better": round(float((rt < 1).mean()), 3),
           "p75_by_state": st_tbl, "verdict": verdict, "per_instrument": per, "audit": audit}
    print(f"\nsplit {split.date()}  beta {beta:.4f} (elasticity {elasticity:.3f})  median B/A {med:.4f}, better {share:.0%} -> {verdict}")
    print(f"transfer (majors' elasticity {FX_BETA_ELASTICITY:.3f}): median {np.median(rt):.4f}, better {(rt < 1).mean():.0%}")
    for k, v in st_tbl.items(): print(f"  {k:8s} n={v['n']}  A {v['A']}  B {v['B']}  transfer {v['T']}")
    for p in per: print("  ", p)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(rep, indent=1, default=str))
    md = ["# CROSS-IV — results", "", "Pre-registration: `forge/CROSS_IV_PREREG.md`.", "",
          f"**Verdict: {verdict}.** Train before {rep['split_date']}, test after. Pooled β (std) {rep['beta_std']}, "
          f"elasticity {rep['elasticity']} (σ_adj ∝ (IV/σ)^elasticity). Test pinball B÷A median **{rep['median_ratio']}**, "
          f"better on **{share:.0%}** of crosses.", "",
          f"Transfer check (majors' elasticity {FX_BETA_ELASTICITY:.3f}, frozen): median {rep['transfer_median_ratio']}, "
          f"better on {rep['transfer_share_better']:.0%}.", "",
          "| test days | n | A p75 exceed | B p75 exceed | transfer |", "|---|---|---|---|---|"]
    md += [f"| {k} | {v['n']} | {v['A']:.1%} | {v['B']:.1%} | {v['T']:.1%} |" for k, v in st_tbl.items()]
    md += ["", "| cross | train | test | B÷A | transfer÷A | A p75 | B p75 | corr(leg IV, next-20 RV) |", "|---|---|---|---|---|---|---|---|"]
    md += [f"| {p['inst']} | {p['n_train']} | {p['n_test']} | {p['ratio_B']} | {p['ratio_transfer']} | {p['A_p75']:.1%} | {p['B_p75']:.1%} | {p['corr_iv_rv20']} |" for p in per]
    md += ["", "## Data audit", ""] + [f"- {k}: {v}" for k, v in audit.items()]
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    print("wrote", OUT / "RESULTS.md")


if __name__ == "__main__":
    main()
