"""vol-layer-rv5-increment (forge/VOL_LAYER_RV5_INCREMENT_PREREG.md): does M1 realised vol add to the chosen forecast?

Same rows, folds, widths and pinball as scripts/forecast_history/forecast_pick.py. Arms S vs S+RV (all 34), SI vs SI+RV
(13 with implied vol, live-type sources).

    python scripts/vol-layer/rv5_increment.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
sys.argv += ["--live", "--livetype"]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_pick as P  # noqa: E402

F = P.F
OUT = ROOT / "analysis/output/vol-layer-rv5-increment"
RV = ["rv1", "rv5m"]
ARMS = {"S": F.FB, "SR": F.FB + RV, "SI": F.FC, "SIR": F.FC + RV}


def main():
    X = P.load()
    X = X.sort_values(["inst", "date"]).reset_index(drop=True)
    sd = np.sqrt(X.rv5.clip(lower=1e-10))
    X["_rv"] = np.log(sd / X.live_sig_daily)
    X["rv1"] = X.groupby("inst")["_rv"].shift(1)
    X["rv5m"] = X.groupby("inst")["rv1"].transform(lambda s: s.rolling(5, min_periods=3).mean())
    X = X.sort_values(["date", "inst"]).reset_index(drop=True)

    rows = []
    for f in sorted(X[X.oos == 1].fold.unique()):
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        for arm, feats in ARMS.items():
            tr[f"sig_{arm}"], te[f"sig_{arm}"] = np.nan, np.nan
            for cls in sorted(X.klass.unique()):
                trc = tr[(tr.klass == cls) & tr[feats].notna().all(axis=1)]
                mk = (te.klass == cls) & te[feats].notna().all(axis=1) & te.inst.isin(trc.inst.unique())
                if len(trc) < 500 or not mk.any():
                    continue
                b, mu = F.fit_beta(trc, feats)
                tr.loc[trc.index, f"sig_{arm}"] = F.apply_beta(trc, feats, b, mu)
                te.loc[mk, f"sig_{arm}"] = F.apply_beta(te[mk], feats, b, mu)
                if f == max(X[X.oos == 1].fold.unique()) and arm in ("SR", "SIR"):
                    print(f"{arm} {cls} beta", dict(zip(feats, np.round(b, 3))), flush=True)
            ok = tr[f"sig_{arm}"].notna() & (tr[f"sig_{arm}"] > 0)
            w = F.widths(tr.loc[ok, f"sig_{arm}"].to_numpy(), tr[ok])
            for q, r in F.CELLS:
                te[f"{arm}_{q}_{r}"] = te[f"sig_{arm}"] * w[(q, r)].reindex(te.inst).to_numpy()
        print(f"fold {f}: train {len(tr):,}, test {len(te):,}", flush=True)
        rows.append(te)
    T = pd.concat(rows, ignore_index=True)
    T["regime_b"] = np.select([T.regime < np.log(0.85), T.regime > np.log(1.15)], ["quiet", "busy"], "normal")
    dates = np.sort(T.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[T.date].to_numpy()
    W = P.boot_weights(len(dates))
    sig = T[F.BASE].to_numpy()
    L = {a: sum(P.pinball(T[F.Q[q]].to_numpy(), T[f"{a}_{q}_{r}"].to_numpy(), F.R[r]) / sig for q, r in F.CELLS) for a in ARMS}

    def miss(a, m):
        vals = {}
        for g in ("quiet", "normal", "busy"):
            k = m & (T.regime_b == g).to_numpy()
            vals[g] = float((T.r_hl[k] > T[f"{a}_hl_p75"][k]).mean())
        return vals, max(abs(v - 0.25) for v in vals.values())

    def board(new, old, name):
        m = np.isfinite(L[new]) & np.isfinite(L[old])
        if name == "iv13":
            m &= T.iv_sig.notna().to_numpy()
        a = np.bincount(di[m], weights=L[new][m], minlength=len(dates))
        b = np.bincount(di[m], weights=L[old][m], minlength=len(dates))
        reps = (W @ a) / (W @ b)
        ratio = a.sum() / b.sum()
        cls = {c: float(L[new][m & (T.klass == c).to_numpy()].sum() / L[old][m & (T.klass == c).to_numpy()].sum()) for c in sorted(T.klass[m].unique())}
        mn, mo = miss(new, m), miss(old, m)
        ci = [float(x) for x in np.percentile(reps, [2.5, 97.5])]
        gate = {"ci_below_1": ci[1] < 1, "gain_gt_0.5pct": 1 - ratio > 0.005, "regime_miss_no_worse": mn[1] <= mo[1], "no_class_worse_0.5pct": max(cls.values()) <= 1.005}
        byinst = {i: round(float(L[new][m & (T.inst == i).to_numpy()].sum() / L[old][m & (T.inst == i).to_numpy()].sum()), 4) for i in sorted(T.inst[m].unique())}
        return {"rows": int(m.sum()), "ratio": round(float(ratio), 4), "ci": [round(x, 4) for x in ci], "p_one_sided": float((reps >= 1).mean()),
                "by_class": {k: round(v, 4) for k, v in cls.items()}, "regime_new": mn[0], "regime_old": mo[0], "miss_new": mn[1], "miss_old": mo[1],
                "gate": gate, "pass": all(gate.values()), "by_inst": byinst}

    res = {"all34": board("SR", "S", "all34"), "iv13": board("SIR", "SI", "iv13")}
    p = any(v["pass"] for v in res.values())
    hw = max((v["ci"][1] - v["ci"][0]) / 2 for v in res.values())
    res["verdict"] = "VALIDATED" if p else ("UNDERPOWERED" if hw > 0.005 and all(v["ratio"] < 1 for v in res.values()) else "NULL")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    md = ["# vol-layer-rv5-increment: results", "", "Prereg: `forge/VOL_LAYER_RV5_INCREMENT_PREREG.md`. Pinball over 12 rungs ÷ plain σ, walk-forward 2020-08 → 2026-08, date-block 95%.", "",
          f"**Verdict: {res['verdict']}**", "", "| board | rows | ratio [95%] | HL p75 regime miss new / old | worst class | gate |", "|---|---|---|---|---|---|"]
    for k, v in (("All 34: S+RV vs S", res["all34"]), ("IV-13: SI+RV vs SI", res["iv13"])):
        md.append(f"| {k} | {v['rows']:,} | {v['ratio']:.4f} [{v['ci'][0]:.4f}, {v['ci'][1]:.4f}] | {v['miss_new'] * 100:.1f} / {v['miss_old'] * 100:.1f} pp | {max(v['by_class'].values()):.4f} | {'PASS' if v['pass'] else 'fail: ' + ', '.join(g for g, ok in v['gate'].items() if not ok)} |")
    md += ["", "By class (all 34): " + ", ".join(f"{k} {v:.4f}" for k, v in res["all34"]["by_class"].items()),
           "", "By instrument (all 34): " + ", ".join(f"{k} {v:.3f}" for k, v in res["all34"]["by_inst"].items())]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
