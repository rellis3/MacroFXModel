"""STEP 1b — persistence / weekday / implied-vol fix to the forecast, as a shadow candidate (forge/FORECAST_FIX_PREREG.md).

Arms: A0 export point-in-time; A1 same sigma, widths refit (control); B sigma x exp(beta.x) with regime, res1, res5,
weekday; C = B + iv_sig (instruments with implied vol). Walk-forward over folds 0-5, 5-session embargo.

    PYTHONPATH=. python scripts/forecast_history/forecast_fix.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import H, boot_weights, complete, klass, pinball  # noqa: E402
from meta_label_3a import IV_SRC, implied_vol  # noqa: E402
from forge.run_combined_range import asof_before  # noqa: E402

OUT = Path("analysis/output/forecast_fix")
Q = {"oh": "r_oh", "ol": "r_ol", "hl": "r_hl", "oc": "r_oc"}
R = {"p50": 0.50, "p75": 0.75, "p90": 0.90}
CELLS = [(q, r) for q in Q for r in R]
FB = ["regime", "res1", "res5", "wd1", "wd2", "wd3", "wd4"]
FC = FB + ["iv_sig"]
EMBARGO, LAMBDA = 5, 1.0


def load() -> pd.DataFrame:
    ivs = implied_vol()
    parts = []
    for f in sorted(H.glob("*.csv")):
        d = pd.read_csv(f).sort_values("date").reset_index(drop=True)
        s = d.pit_sig_used
        d["regime"] = np.log(s / s.shift(1).rolling(250, min_periods=120).median())
        res = np.log(d.r_hl.clip(lower=1e-6) / s)
        d["res1"] = res.shift(1)
        d["res5"] = res.shift(1).rolling(5, min_periods=3).mean()
        wd = pd.to_datetime(d.date).dt.dayofweek
        for k in range(1, 5):
            d[f"wd{k}"] = (wd == k).astype(float)
        src = IV_SRC.get(f.stem)
        d["iv_sig"] = np.log(asof_before(pd.to_datetime(d.date), ivs[src]) / (d.pit_sig_daily * np.sqrt(252))) if src else np.nan
        d["y"] = res
        parts.append(d)
    X = pd.concat(parts, ignore_index=True)
    X = X[complete(X) & X.regime.notna() & X.res5.notna()].copy()
    X["klass"] = X.inst.map(klass)
    return X.sort_values(["date", "inst"]).reset_index(drop=True)


def fit_beta(tr: pd.DataFrame, feats):
    """Ridge on standardised features; features and target centred per instrument (COMBINED_RANGE style)."""
    Z = tr[feats].to_numpy(float) - tr.groupby("inst")[feats].transform("mean").to_numpy(float)
    y = tr.y.to_numpy() - tr.groupby("inst").y.transform("mean").to_numpy()
    sd = Z.std(axis=0)
    sd[sd == 0] = 1.0
    Zs = Z / sd
    b = np.linalg.solve(Zs.T @ Zs + LAMBDA * np.eye(len(feats)), Zs.T @ y)
    return b / sd, tr.groupby("inst")[feats].mean()


def apply_beta(d: pd.DataFrame, feats, beta, means):
    Z = d[feats].to_numpy(float) - means.reindex(d.inst)[feats].to_numpy(float)
    return d.pit_sig_used.to_numpy() * np.exp(Z @ beta)


def widths(tr_sig, tr):
    """Per instrument, per rung: training quantile of realised / sigma."""
    w = {}
    df = pd.DataFrame({"inst": tr.inst.to_numpy(), "s": tr_sig})
    for q, col in Q.items():
        ratio = tr[col].to_numpy() / tr_sig
        for r, tau in R.items():
            w[(q, r)] = pd.Series(ratio).groupby(df.inst.to_numpy()).quantile(tau)
    return w


def main():
    X = load()
    folds = sorted(X[X.oos == 1].fold.unique())
    rows = []
    betas = {}
    for f in folds:
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        cut = prior[-EMBARGO]
        tr = X[X.date < cut].copy()
        te["sigA"] = te.pit_sig_used
        for cls in sorted(X.klass.unique()):
            trc, mk = tr[tr.klass == cls], te.klass == cls
            bB, mB = fit_beta(trc, FB)
            te.loc[mk, "sigB"] = apply_beta(te[mk], FB, bB, mB)
            trc_iv = trc[trc.iv_sig.notna()]
            mkc = mk & te.iv_sig.notna()
            if len(trc_iv) > 500 and mkc.any():
                bC, mC = fit_beta(trc_iv, FC)
                te.loc[mkc, "sigC"] = apply_beta(te[mkc], FC, bC, mC)
                betas.setdefault(int(f), {})[cls + "|C"] = dict(zip(FC, np.round(bC, 4)))
            betas.setdefault(int(f), {})[cls + "|B"] = dict(zip(FB, np.round(bB, 4)))
            # training sigmas for the width refit
            tr.loc[trc.index, "sigB_tr"] = apply_beta(trc, FB, bB, mB)
            if len(trc_iv) > 500:
                tr.loc[trc_iv.index, "sigC_tr"] = apply_beta(trc_iv, FC, bC, mC)
        for arm, trcol, tecol in (("A1", "pit_sig_used", "sigA"), ("B", "sigB_tr", "sigB"), ("C", "sigC_tr", "sigC")):
            ok = tr[trcol].notna() if trcol in tr else pd.Series(False, index=tr.index)
            w = widths(tr.loc[ok, trcol].to_numpy(), tr[ok])
            for q, r in CELLS:
                te[f"{arm}_{q}_{r}"] = te[tecol] * w[(q, r)].reindex(te.inst).to_numpy() if tecol in te else np.nan
        print(f"fold {f}: train {len(tr):,} to {cut}, test {len(te):,}", flush=True)
        rows.append(te)
    T = pd.concat(rows, ignore_index=True)

    dates = np.sort(T.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[T.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)
    sig = T.pit_sig_used.to_numpy()

    def loss(arm):
        tot = np.zeros(len(T))
        for q, r in CELLS:
            fc = T[f"{arm}_{q}_{r}"].to_numpy() if arm != "A0" else T[f"pit_{q}_{r}"].to_numpy()
            tot += pinball(T[Q[q]].to_numpy(), fc, R[r]) / sig
        return tot

    L = {a: loss(a) for a in ("A0", "A1", "B", "C")}

    def ratio(a, b, m):
        sa = np.bincount(di[m], weights=L[a][m], minlength=nd)
        sb = np.bincount(di[m], weights=L[b][m], minlength=nd)
        reps = (W @ sa) / (W @ sb)
        return [round(float(sa.sum() / sb.sum()), 4), *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]]

    T["regime_b"] = np.select([T.regime < np.log(0.85), T.regime > np.log(1.15)], ["quiet", "busy"], "normal")
    T["weekday"] = pd.to_datetime(T.date).dt.day_name()

    def exceed(arm, m, q="hl", r="p75"):
        fc = T[f"{arm}_{q}_{r}"] if arm != "A0" else T[f"pit_{q}_{r}"]
        return float((T[Q[q]][m] > fc[m]).mean())

    res = {"n": len(T), "dates": nd, "betas": betas, "arms": {}}
    allm = np.ones(len(T), bool)
    ivm = T.sigC.notna().to_numpy()
    for arm, base, m in (("A0", "A1", allm), ("B", "A1", allm), ("C", "A1", ivm)):
        r = {"rows": int(m.sum()), "pinball_ratio_vs_A1": ratio(arm, base, m)}
        r["by_class"] = {c: ratio(arm, base, m & (T.klass == c).to_numpy())[0] for c in sorted(T.klass.unique()) if (m & (T.klass == c).to_numpy()).sum() > 300}
        r["by_fold"] = {int(f): ratio(arm, base, m & (T.fold == f).to_numpy())[0] for f in folds}
        for a2 in (arm, base):
            r.setdefault("regime_hl_p75", {})[a2] = {g: round(exceed(a2, m & (T.regime_b == g).to_numpy()), 4) for g in ("quiet", "normal", "busy")}
            r.setdefault("weekday_hl_p75", {})[a2] = {g: round(exceed(a2, m & (T.weekday == g).to_numpy()), 4)
                                                      for g in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")}
            r.setdefault("pooled_exceed", {})[a2] = {f"{q}_{rr}": round(exceed(a2, m, q, rr), 4) for q, rr in CELLS}
        if arm in ("B", "C"):
            miss = lambda a: max(abs(v - 0.25) for v in r["regime_hl_p75"][a].values())
            c1 = r["pinball_ratio_vs_A1"][2] < 1
            c2 = miss(arm) < miss(base)
            c3 = all(v <= 1.005 for v in r["by_class"].values())
            r["checks"] = {"better": c1, "regime_miss": [round(miss(arm), 4), round(miss(base), 4), c2], "no_class_worse": c3}
            r["verdict"] = "PASS" if (c1 and c2 and c3) else "FAIL"
        res["arms"][arm] = r
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    write_md(res)


def write_md(res):
    A = res["arms"]
    pct = lambda c: f"{c[0]:.4f} [{c[1]:.4f}, {c[2]:.4f}]"
    md = ["# STEP 1b — forecast persistence / weekday / IV fix (results)", "",
          f"Pre-registration: `forge/FORECAST_FIX_PREREG.md`. Walk-forward folds 0–5: **{res['n']:,} instrument-sessions, "
          f"{res['dates']:,} dates**. Pinball over 12 rungs ÷ σ_used, ratio vs A1 (same σ, widths refit), 95% date-block interval.", "",
          "| arm | rows | pinball ÷ A1 [95%] | regime miss (HL p75, max |exc − 25%|) arm vs A1 | worst class ratio | verdict |",
          "|---|---|---|---|---|---|"]
    for arm in ("A0", "B", "C"):
        r = A[arm]
        ch = r.get("checks", {})
        rm = f"{ch['regime_miss'][0] * 100:.1f} vs {ch['regime_miss'][1] * 100:.1f} pp" if ch else "—"
        md.append(f"| {arm} | {r['rows']:,} | {pct(r['pinball_ratio_vs_A1'])} | {rm} | {max(r['by_class'].values()):.4f} | **{r.get('verdict', 'reference')}** |")
    md += ["", "A0 = the export as it was point-in-time; A1 = same σ with widths refit (the control).", "",
           "## HL p75 exceedance by regime (%, target 25)", "", "| arm | quiet | normal | busy |", "|---|---|---|---|"]
    for arm in ("B", "C"):
        for a2, v in A[arm]["regime_hl_p75"].items():
            md.append(f"| {a2}{' (IV rows)' if arm == 'C' else ''} | " + " | ".join(f"{x * 100:.1f}" for x in v.values()) + " |")
    md += ["", "## HL p75 exceedance by weekday (%, target 25)", "", "| arm | Mon | Tue | Wed | Thu | Fri |", "|---|---|---|---|---|---|"]
    for arm in ("B", "C"):
        for a2, v in A[arm]["weekday_hl_p75"].items():
            md.append(f"| {a2}{' (IV rows)' if arm == 'C' else ''} | " + " | ".join(f"{x * 100:.1f}" for x in v.values()) + " |")
    md += ["", "## Pinball ratio vs A1 by class and fold", "", "| arm | " + " | ".join(A["B"]["by_class"]) + " | " +
           " | ".join(f"fold {k}" for k in A["B"]["by_fold"]) + " |", "|---|" + "---|" * (len(A["B"]["by_class"]) + len(A["B"]["by_fold"]))]
    for arm in ("A0", "B", "C"):
        r = A[arm]
        md.append(f"| {arm} | " + " | ".join(f"{r['by_class'].get(c, float('nan')):.4f}" for c in A["B"]["by_class"]) + " | " +
                  " | ".join(f"{v:.4f}" for v in r["by_fold"].values()) + " |")
    md += ["", "## β (last fold; per-unit, log σ multiplier)", ""]
    last = max(res["betas"], key=int)
    for k, v in res["betas"][last].items():
        md.append(f"- {k}: " + ", ".join(f"{a} {b:+.3f}" for a, b in v.items()))
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:12]))


if __name__ == "__main__":
    main()
