"""STEP 3a — meta-label "trust the lines" (forge/META_LABEL_PREREG.md, Amendment 1).

Primary decision: each morning the forecast says the day's range stays inside its p75 lines. Labels: y_hl (HL > p75),
y_up (OH > p75), y_dn (OL > p75). Features known at the London open. Walk-forward over the forecast's own folds:
test fold f trains on out-of-sample sessions of folds < f, with a 5-session embargo. Logistic + boosted tree vs the
training base rate; Brier skill with date-block intervals; decile reliability.

    PYTHONPATH=. python scripts/forecast_history/meta_label_3a.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import H, boot_weights, complete, klass  # noqa: E402
from forge.run_combined_range import asof_before, cboe  # noqa: E402

OUT = Path("analysis/output/meta_label")
FLAGS = Path("analysis/output/jumps/flags_seasonal.csv")
IV_SRC = {"EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDJPY": "USDJPY", "AUDUSD": "AUDUSD", "USDCAD": "USDCAD",
          "USDCHF": "USDCHF", "GOLD": "XAUUSD", "NQ": "VXN", "SPX500": "VIX", "DOW": "VIX", "US2000": "VIX",
          "DE30": "VIX", "UK100": "VIX"}
LABELS = {"y_hl": ("r_hl", "pit_hl_p75"), "y_up": ("r_oh", "pit_oh_p75"), "y_dn": ("r_ol", "pit_ol_p75")}
NUM = ["regime", "y_err", "y_err5", "y_js", "y_zbns", "y_jump", "gap_abs", "dsig", "iv_sig"]
CAT = ["event", "weekday", "klass"]
EMBARGO = 5


def implied_vol() -> dict[str, pd.Series]:
    cv = pd.read_parquet("data/cvol/cme_cvol_eod.parquet")
    cv["d"] = pd.to_datetime(cv["timestamp"]).dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()
    out = {p: g.set_index("d")["cvol"].astype(float).sort_index() for p, g in cv.groupby("product")}
    out["VIX"], out["VXN"] = cboe("VIX"), cboe("VXN")
    return out


def load() -> pd.DataFrame:
    flags = pd.read_csv(FLAGS)[["inst", "date", "jump_bns", "z_bns"]]
    ivs = implied_vol()
    parts = []
    for f in sorted(H.glob("*.csv")):
        d = pd.read_csv(f).sort_values("date").reset_index(drop=True)
        d = d.merge(flags, on=["inst", "date"], how="left")
        s = d.pit_sig_used
        d["regime"] = np.log(s / s.shift(1).rolling(250, min_periods=120).median())
        err = np.log(d.r_hl / d.pit_hl_p50)
        d["y_err"] = err.shift(1)
        d["y_err5"] = err.shift(1).rolling(5, min_periods=3).mean()
        d["y_js"] = d.jump_share.shift(1)
        d["y_zbns"] = d.z_bns.shift(1)
        d["y_jump"] = d.jump_bns.shift(1)
        d["gap_abs"] = d.gap.abs() / d.pit_sig_used
        d["dsig"] = np.log(d.pit_sig_daily / d.pit_sig_daily.shift(1))
        src = IV_SRC.get(f.stem)
        if src:
            iv = asof_before(pd.to_datetime(d.date), ivs[src])
            d["iv_sig"] = np.log(iv / (d.pit_sig_daily * np.sqrt(252)))
        else:
            d["iv_sig"] = np.nan
        parts.append(d)
    X = pd.concat(parts, ignore_index=True)
    X = X[(X.oos == 1) & complete(X)].copy()
    X["klass"] = X.inst.map(klass)
    X["weekday"] = pd.to_datetime(X.date).dt.dayofweek.astype(str)
    for y, (r, line) in LABELS.items():
        X[y] = (X[r] > X[line]).astype(int)
    return X.sort_values(["date", "inst"]).reset_index(drop=True)


def design(tr: pd.DataFrame, te: pd.DataFrame):
    """Logistic design: standardised numerics (train mean for missing + a missing flag), one-hot categoricals."""
    def build(d, stats=None):
        cols = {}
        if stats is None:
            stats = {c: (d[c].mean(), d[c].std() or 1.0) for c in NUM}
            stats["_cats"] = {c: sorted(d[c].astype(str).unique()) for c in CAT}
        for c in NUM:
            m, sd = stats[c]
            v = d[c].to_numpy(float)
            miss = ~np.isfinite(v)
            cols[c] = np.where(miss, 0.0, (v - m) / sd)
            cols[c + "_na"] = miss.astype(float)
        for c in CAT:
            for lv in stats["_cats"][c][1:]:
                cols[f"{c}={lv}"] = (d[c].astype(str) == lv).astype(float).to_numpy()
        return pd.DataFrame(cols), stats
    A, st = build(tr)
    B, _ = build(te, st)
    return A, B


def tree_X(d: pd.DataFrame, cats):
    Z = d[NUM].astype(float).copy()
    for c in CAT:
        Z[c] = pd.Categorical(d[c].astype(str), categories=cats[c]).codes
    return Z


def main():
    X = load()
    folds = sorted(X.fold.unique())
    preds = []
    coefs = {}
    for f in folds[1:]:
        te = X[X.fold == f]
        start = te.date.min()
        prior_dates = np.sort(X.loc[X.fold < f, "date"].unique())
        cut = prior_dates[-EMBARGO] if len(prior_dates) > EMBARGO else prior_dates[0]
        tr = X[(X.fold < f) & (X.date < cut)]
        A, B = design(tr, te)
        cats = {c: sorted(tr[c].astype(str).unique()) for c in CAT}
        TA, TB = tree_X(tr, cats), tree_X(te, cats)
        cat_mask = [c in CAT for c in TA.columns]
        out = te[["inst", "date", "fold", "klass", *LABELS]].copy()
        for y in LABELS:
            base = tr[y].mean()
            out[f"{y}_base"] = base
            lr = LogisticRegression(C=1.0, max_iter=2000).fit(A, tr[y])
            out[f"{y}_logit"] = lr.predict_proba(B)[:, 1]
            gb = HistGradientBoostingClassifier(max_depth=3, max_iter=200, learning_rate=0.05, min_samples_leaf=200,
                                                categorical_features=cat_mask, random_state=0).fit(TA, tr[y])
            out[f"{y}_tree"] = gb.predict_proba(TB)[:, 1]
            if f == folds[-1]:
                coefs[y] = dict(sorted(zip(A.columns, np.round(lr.coef_[0], 3)), key=lambda kv: -abs(kv[1]))[:10])
        preds.append(out)
        print(f"fold {f}: train {len(tr):,} (to {cut}), test {len(te):,} from {start}", flush=True)
    P = pd.concat(preds, ignore_index=True)

    dates = np.sort(P.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[P.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)
    res = {"n_test": len(P), "dates": nd, "train_note": f"walk-forward, embargo {EMBARGO} sessions", "labels": {}}
    for y in LABELS:
        yy = P[y].to_numpy(float)
        bb = np.bincount(di, weights=(yy - P[f"{y}_base"]) ** 2, minlength=nd)
        lab = {"base_rate_test": round(float(yy.mean()), 4)}
        for arm in ("logit", "tree"):
            p = P[f"{y}_{arm}"].to_numpy()
            bm = np.bincount(di, weights=(yy - p) ** 2, minlength=nd)
            pt = 1 - bm.sum() / bb.sum()
            reps = 1 - (W @ bm) / (W @ bb)
            lo, hi = np.percentile(reps, [2.5, 97.5])
            dec = pd.qcut(p, 10, labels=False, duplicates="drop")
            rel = P.assign(p=p, dec=dec).groupby("dec").agg(n=(y, "size"), pred=("p", "mean"), real=(y, "mean"))
            big = rel[rel.n >= 300]
            worst = float((big.pred - big.real).abs().max())
            passed = bool(lo > 0 and worst <= 0.03)
            per_fold = {int(k): round(float(1 - ((g[y] - g[f"{y}_{arm}"]) ** 2).sum() / ((g[y] - g[f"{y}_base"]) ** 2).sum()), 4)
                        for k, g in P.groupby("fold")}
            per_class = {k: round(float(1 - ((g[y] - g[f"{y}_{arm}"]) ** 2).sum() / ((g[y] - g[f"{y}_base"]) ** 2).sum()), 4)
                         for k, g in P.groupby("klass")}
            lab[arm] = {"skill": [round(pt, 4), round(float(lo), 4), round(float(hi), 4)], "worst_decile_gap": round(worst, 4),
                        "verdict": "PASS" if passed else "FAIL", "per_fold": per_fold, "per_class": per_class,
                        "deciles": rel.round(4).reset_index().to_dict("records")}
        res["labels"][y] = lab
    res["logit_top_coefs_last_fold"] = coefs
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results_3a.json").write_text(json.dumps(res, indent=1, default=str))
    P.to_csv(OUT / "predictions_3a.csv", index=False)
    write_md(res)


def write_md(res):
    name = {"y_hl": "range passes HL p75", "y_up": "high passes OH p75", "y_dn": "low passes OL p75"}
    md = ["# STEP 3a — meta-label \"trust the lines\" (results)", "",
          f"Pre-registration: `forge/META_LABEL_PREREG.md` (+ Amendment 1). Test = forecast folds 1–5, each trained only on "
          f"earlier out-of-sample folds with a 5-session embargo: **{res['n_test']:,} instrument-sessions, {res['dates']:,} dates**. "
          "Skill = 1 − Brier(model) ÷ Brier(training base rate); 95% date-block bootstrap. PASS = skill interval above 0 "
          "and every predicted-probability decile (≥ 300 sessions) within ±3 pp of what happened.", "",
          "| label | base rate (test) | model | skill % [95%] | worst decile gap (pp) | verdict |", "|---|---|---|---|---|---|"]
    for y, lab in res["labels"].items():
        for arm in ("logit", "tree"):
            a = lab[arm]
            s = a["skill"]
            md.append(f"| {name[y]} | {lab['base_rate_test'] * 100:.1f}% | {arm} | {s[0] * 100:.2f} [{s[1] * 100:.2f}, {s[2] * 100:.2f}] | "
                      f"{a['worst_decile_gap'] * 100:.1f} | **{a['verdict']}** |")
    md += ["", "## Skill by test fold and class (%, point estimates)", "", "| label | model | " + " | ".join(f"fold {k}" for k in res['labels']['y_hl']['logit']['per_fold']) +
           " | " + " | ".join(res['labels']['y_hl']['logit']['per_class']) + " |",
           "|---|---|" + "---|" * (len(res['labels']['y_hl']['logit']['per_fold']) + len(res['labels']['y_hl']['logit']['per_class']))]
    for y, lab in res["labels"].items():
        for arm in ("logit", "tree"):
            a = lab[arm]
            md.append(f"| {name[y]} | {arm} | " + " | ".join(f"{v * 100:.1f}" for v in a["per_fold"].values()) + " | " +
                      " | ".join(f"{v * 100:.1f}" for v in a["per_class"].values()) + " |")
    md += ["", "## Usefulness: what happened in each predicted decile (logistic)", ""]
    for y, lab in res["labels"].items():
        md += [f"**{name[y]}**", "", "| decile | n | predicted % | happened % |", "|---|---|---|---|"]
        md += [f"| {int(r['dec']) + 1} | {r['n']} | {r['pred'] * 100:.1f} | {r['real'] * 100:.1f} |" for r in lab["logit"]["deciles"]]
        md.append("")
    md += ["## Largest logistic coefficients (last fold, standardised)", ""]
    for y, c in res["logit_top_coefs_last_fold"].items():
        md.append(f"- {name[y]}: " + ", ".join(f"{k} {v:+}" for k, v in c.items()))
    (OUT / "RESULTS_3a.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:14]))


if __name__ == "__main__":
    main()
