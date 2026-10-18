"""ONE RANGE FORECAST — do the validated market-state flags (and NQ gamma) still add on top of the shipped SI lines?
(forge/ONE_RANGE_FORECAST_PREREG.md)

Same rows, folds, live-type inputs and yardstick as forecast_pick.py variant 1. Q1: SIX (SI + VIX-curve / breadth /
NQ-week flags, fitted on the four US indices) vs SI as shipped. Q2: NQ only, base vs base + gamma sign (OI dated
two business days before the session).

    PYTHONPATH=. python scripts/forecast_history/one_forecast.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.argv.append("--livetype")                   # forecast_pick variant 1: live-type implied vol
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_pick as FP  # noqa: E402
from forecast_record import boot_weights, pinball  # noqa: E402
from forge.run_combined_range import asof_before, cboe  # noqa: E402

F = FP.F
OUT = Path("analysis/output/one_forecast")
NYD = Path("analysis/output/ladder_candidates/d1")
GEX = Path("oi_research_book/data/daily_master_near_nas100_usd.parquet")
US4 = ["NQ", "SPX500", "DOW", "US2000"]
SIX = US4 + ["DE30", "UK100"]
FLAGS = ["vix_inv", "front_dear", "front_calm", "all_down", "nq_dw"]
EXPECT = {"vix_inv": +1, "front_dear": +1, "front_calm": -1, "all_down": +1, "nq_dw": +1, "gex_short": +1}


def ny_close(name: str) -> pd.Series:
    rows = json.loads((NYD / f"{name}.json").read_text())
    s = pd.Series([float(r["c"]) for r in rows], index=pd.to_datetime([r["d"] for r in rows]))
    return s[~s.index.duplicated()].sort_index()


def add_features(X: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    D = pd.DatetimeIndex(pd.to_datetime(X.date))
    vix, v3, v9 = cboe("VIX"), cboe("VIX3M"), cboe("VIX9D")
    a, b, c = asof_before(D, vix), asof_before(D, v3), asof_before(D, v9)
    X["vix_inv"] = np.where(np.isfinite(a) & np.isfinite(b), (a > b).astype(float), np.nan)
    front = c / a
    X["front_dear"] = np.where(np.isfinite(front), (front >= 0.9669).astype(float), np.nan)
    X["front_calm"] = np.where(np.isfinite(front), (front < 0.8858).astype(float), np.nan)
    # New York-close day d ends 22:00 London on d: strictly before London date D = known at the open
    closes = pd.DataFrame({n: ny_close(n) for n in SIX})
    rets = closes.pct_change(fill_method=None)
    full = rets.notna().all(axis=1)
    all_down = (rets[full] < 0).all(axis=1).astype(float)
    nq = closes["NQ"].dropna()
    nq_dw = ((nq / nq.shift(5) - 1) <= -0.01).astype(float)[nq.shift(5).notna()]
    X["all_down"] = asof_before(D, all_down)
    X["nq_dw"] = asof_before(D, nq_dw)
    # NQ gamma sign. CME OI for trade date t is published after the London open of t+1, so the primary reads OI
    # dated strictly before the previous business day (<= D-2 business days); `gex_short_d1` (<= D-1) is descriptive.
    dm = pd.read_parquet(GEX)
    g = pd.Series((dm["net_gex_sum"] < 0).astype(float).to_numpy(), index=pd.to_datetime(dm["date"]))
    g = g[dm["net_gex_sum"].notna().to_numpy()]
    g = g[~g.index.duplicated()].sort_index()
    prev_bday = pd.DatetimeIndex(D - pd.offsets.BDay(1))
    X["gex_short"] = np.where(X.inst == "NQ", asof_before(prev_bday, g), np.nan)
    X["gex_short_d1"] = np.where(X.inst == "NQ", asof_before(D, g), np.nan)
    us = X.inst.isin(US4)
    audit = {f: f"{int(X.loc[us, f].notna().sum()):,}/{int(us.sum()):,} US-index rows" for f in FLAGS}
    audit["gex_short"] = f"{int(X.gex_short.notna().sum()):,}/{int((X.inst == 'NQ').sum()):,} NQ rows"
    return X, audit


def fit_arm(tr, te, feats, mask_tr, mask_te, col):
    """Ridge-fit `feats` on the masked train rows; write the adjusted sigma into `col` on both frames."""
    tr[col], te[col] = np.nan, np.nan
    trc = tr[mask_tr & tr[feats].notna().all(axis=1)]
    mk = mask_te & te[feats].notna().all(axis=1)
    if len(trc) < 300 or not mk.any():
        return None
    b, mu = F.fit_beta(trc, feats)
    tr.loc[trc.index, col] = F.apply_beta(trc, feats, b, mu)
    te.loc[mk, col] = F.apply_beta(te[mk], feats, b, mu)
    return dict(zip(feats, [float(v) for v in b]))


def main():
    X, audit = add_features(FP.load())
    folds = sorted(X[X.oos == 1].fold.unique())
    arms = {}                                    # arm -> (feats, train mask fn, test mask fn)
    rows, betas = [], {}
    for f in folds:
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        tr_us, te_us = tr.inst.isin(US4), te.inst.isin(US4)
        # Q2 arms with and without the gamma term train on the SAME rows (NQ sessions that have GEX), so a gain
        # cannot come from the shorter, more recent training window alone.
        tr_nq, te_nq = (tr.inst == "NQ") & tr.gex_short.notna(), (te.inst == "NQ") & te.gex_short.notna()
        betas[int(f)] = {}
        # SI as shipped: one fit per class over every instrument in it
        tr["sig_SI"], te["sig_SI"] = np.nan, np.nan
        for cls in sorted(X.klass.unique()):
            ok_tr, ok_te = tr.klass == cls, te.klass == cls
            r = fit_arm(tr, te, F.FC, ok_tr, ok_te, "_tmp")
            if r is not None:
                tr.loc[tr["_tmp"].notna(), "sig_SI"] = tr["_tmp"]
                te.loc[te["_tmp"].notna(), "sig_SI"] = te["_tmp"]
        arms = {"SI": None,
                "SIX": (F.FC + FLAGS, tr_us, te_us), "SIUS": (F.FC, tr_us, te_us),
                "NQ_SI": (F.FC, tr_nq, te_nq), "NQ_SIG": (F.FC + ["gex_short"], tr_nq, te_nq),
                "NQ_SIX": (F.FC + FLAGS, tr_nq, te_nq), "NQ_SIXG": (F.FC + FLAGS + ["gex_short"], tr_nq, te_nq),
                "NQ_SIG1": (F.FC + ["gex_short_d1"], tr_nq & tr.gex_short_d1.notna(), te_nq & te.gex_short_d1.notna())}
        for arm, spec in arms.items():
            if spec is not None:
                betas[int(f)][arm] = fit_arm(tr, te, spec[0], spec[1], spec[2], f"sig_{arm}")
        for arm in arms:
            col = f"sig_{arm}"
            ok = tr[col].notna() & (tr[col] > 0)
            w = F.widths(tr.loc[ok, col].to_numpy(), tr[ok])
            for q, r in F.CELLS:
                te[f"{arm}_{q}_{r}"] = te[col] * w[(q, r)].reindex(te.inst).to_numpy()
        print(f"fold {f}: train {len(tr):,}, test {len(te):,}", flush=True)
        rows.append(te[te.inst.isin(US4)])
    T = pd.concat(rows, ignore_index=True)
    T["regime_b"] = np.select([T.regime < np.log(0.85), T.regime > np.log(1.15)], ["quiet", "busy"], "normal")
    sig = T[F.BASE].to_numpy()
    L = {}
    for arm in arms:
        tot = np.zeros(len(T))
        for q, r in F.CELLS:
            tot += pinball(T[F.Q[q]].to_numpy(), T[f"{arm}_{q}_{r}"].to_numpy(), F.R[r]) / sig
        L[arm] = tot

    def compare(a, b, mask):
        m = mask & np.isfinite(L[a]) & np.isfinite(L[b])
        dates = np.sort(T.date[m].unique())
        di = pd.Series(np.arange(len(dates)), index=dates)[T.date[m]].to_numpy()
        W = boot_weights(len(dates))
        sa, sb = np.bincount(di, weights=L[a][m], minlength=len(dates)), np.bincount(di, weights=L[b][m], minlength=len(dates))
        reps = (W @ sa) / (W @ sb)

        def miss(arm):
            ex = {g: float((T.r_hl[m & (T.regime_b == g).to_numpy()] > T[f"{arm}_hl_p75"][m & (T.regime_b == g).to_numpy()]).mean())
                  for g in ("quiet", "normal", "busy")}
            return {k: round(v, 4) for k, v in ex.items()}, round(max(abs(v - 0.25) for v in ex.values()), 4)
        ra, ma = miss(a)
        rb, mb = miss(b)
        by = {i: round(float(L[a][m & (T.inst == i).to_numpy()].sum() / L[b][m & (T.inst == i).to_numpy()].sum()), 4)
              for i in sorted(T.inst[m].unique())}
        return {"rows": int(m.sum()), "dates": len(dates),
                "ratio": [round(float(sa.sum() / sb.sum()), 4), *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]],
                "by_inst": by, "regime": {a: ra, b: rb}, "regime_miss": {a: ma, b: mb}}

    us = np.ones(len(T), bool)
    nq = (T.inst == "NQ").to_numpy()
    res = {"prereg": "forge/ONE_RANGE_FORECAST_PREREG.md", "audit": audit,
           "q1": compare("SIX", "SI", us), "q1_diag_six_vs_sius": compare("SIX", "SIUS", us)}
    q1 = res["q1"]
    p1 = (q1["ratio"][0] <= 0.99 and q1["ratio"][2] < 1 and sum(v < 1 for v in q1["by_inst"].values()) >= 3
          and q1["regime_miss"]["SIX"] <= q1["regime_miss"]["SI"] + 0.005)
    mixed = p1 and res["q1_diag_six_vs_sius"]["ratio"][0] >= 1
    res["q1_verdict"] = "MIXED" if mixed else "PASS" if p1 else "FAIL"
    base = "NQ_SIX" if res["q1_verdict"] == "PASS" else "NQ_SI"
    withg = "NQ_SIXG" if base == "NQ_SIX" else "NQ_SIG"
    res["q2"] = compare(withg, base, nq)
    res["q2_descriptive_d1_lag"] = compare("NQ_SIG1", "NQ_SI", nq)
    q2 = res["q2"]
    p2 = q2["ratio"][0] <= 0.99 and q2["ratio"][2] < 1 and q2["regime_miss"][withg] <= q2["regime_miss"][base] + 0.005
    res["q2_verdict"] = "PASS" if p2 else "FAIL"
    signs = {}
    for f_, b in betas.items():
        for arm, bb in b.items():
            if bb:
                for k, v in bb.items():
                    if k in EXPECT:
                        signs.setdefault(arm, {}).setdefault(k, []).append(int(np.sign(v) == EXPECT[k]))
    res["sign_agreement_by_fold"] = {a: {k: f"{sum(v)}/{len(v)}" for k, v in d.items()} for a, d in signs.items()}
    res["decision"] = ("SI/S" + (" + US flags (NQ, SPX500, DOW, US2000)" if res["q1_verdict"] == "PASS" else "")
                       + (" + NQ gamma sign" if p2 else ""))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    md = ["# ONE RANGE FORECAST (results)", "", "Pre-registration: `forge/ONE_RANGE_FORECAST_PREREG.md`. Folds 0–5, OOS 2020-08 → 2026-08, "
          "live-type inputs, pinball over 12 rungs ÷ plain σ, 95% date-block intervals.", "",
          f"**Decision: {res['decision']}.** Q1 {res['q1_verdict']}, Q2 {res['q2_verdict']}.", "", "| test | rows | ratio [95%] | by instrument | HL p75 regime miss |", "|---|---|---|---|---|"]
    for k, title in (("q1", "Q1 SIX ÷ SI (US4)"), ("q1_diag_six_vs_sius", "diag SIX ÷ SI-US"), ("q2", f"Q2 {withg} ÷ {base} (NQ)"),
                     ("q2_descriptive_d1_lag", "descriptive: NQ gamma at D−1 lag")):
        r = res[k]
        md.append(f"| {title} | {r['rows']:,} | {r['ratio'][0]:.4f} [{r['ratio'][1]:.4f}, {r['ratio'][2]:.4f}] | "
                  + ", ".join(f"{i} {v:.3f}" for i, v in r["by_inst"].items()) + " | "
                  + " vs ".join(f"{a} {v * 100:.1f}pp" for a, v in r["regime_miss"].items()) + " |")
    md += ["", "Feature coverage: " + "; ".join(f"{k} {v}" for k, v in audit.items()), "",
           "Sign agreement with the ledger, by fold: " + json.dumps(res["sign_agreement_by_fold"]), ""]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
