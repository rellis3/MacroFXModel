"""VF3 Stage C, P2: release-day width correction on the chosen ladder (forge/VF3_STAGE_C_PREREG.md, P2).

    PYTHONPATH=. python scripts/forecast_history/vf3_stage_c_p2.py

S / SI exactly as Stage B; S+E / SI+E add event-type dummies (NFP, CPI, FOMC, high; base none; unknown own dummy) to the same
walk-forward ridge. Identical rows. Writes analysis/output/vf3_stage_c/P2.json and P2.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import vf3_stage_b as B  # noqa: E402
from forecast_record import boot_weights, pinball  # noqa: E402

F = B.F
OUT = Path("analysis/output/vf3_stage_c")
EV = ["ev_NFP", "ev_CPI", "ev_FOMC", "ev_high", "ev_unknown"]
TARGET = {"p50": 0.50, "p75": 0.25, "p90": 0.10}


def build(X):
    for e in ("NFP", "CPI", "FOMC", "high", "unknown"):
        X[f"ev_{e}"] = (X.event == e).astype(float)
    feats = {"S": F.FB, "SI": F.FC, "SE": F.FB + EV, "SIE": F.FC + EV}
    rows = []
    for fo in sorted(X[X.oos == 1].fold.unique()):
        te = X[(X.fold == fo) & (X.oos == 1)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        for arm, ft in feats.items():
            tr[f"sig_{arm}"] = np.nan
            te[f"sig_{arm}"] = np.nan
            for cls in sorted(X.klass.unique()):
                trc = tr[(tr.klass == cls) & tr[ft].notna().all(axis=1)]
                mk = (te.klass == cls) & te[ft].notna().all(axis=1)
                if len(trc) < 500 or not mk.any():
                    continue
                b, mu = F.fit_beta(trc, ft)
                tr.loc[trc.index, f"sig_{arm}"] = F.apply_beta(trc, ft, b, mu)
                te.loc[mk, f"sig_{arm}"] = F.apply_beta(te[mk], ft, b, mu)
            ok = tr[f"sig_{arm}"].notna() & (tr[f"sig_{arm}"] > 0)
            w = F.widths(tr.loc[ok, f"sig_{arm}"].to_numpy(), tr[ok])
            for q, r in F.CELLS:
                te[f"{arm}_{q}_{r}"] = te[f"sig_{arm}"] * w[(q, r)].reindex(te.inst).to_numpy()
        rows.append(te)
        print(f"fold {fo}: train {len(tr):,} test {len(te):,}", flush=True)
    return pd.concat(rows, ignore_index=True)


def compare(T, base, new, mask, W, di, nd):
    m = mask & T[f"{base}_hl_p50"].notna().to_numpy() & T[f"{new}_hl_p50"].notna().to_numpy()
    sig = T.pit_sig_used.to_numpy()

    def loss(a, qs):
        tot = np.zeros(len(T))
        for q in qs:
            for r in F.R:
                tot += pinball(T[F.Q[q]].to_numpy(), T[f"{a}_{q}_{r}"].to_numpy(), F.R[r]) / sig
        return tot

    def ratio(sub, qs=tuple(F.Q)):
        mm = m & sub
        lb, ln = loss(base, qs), loss(new, qs)
        sb = np.bincount(di[mm], weights=lb[mm], minlength=nd)
        sn = np.bincount(di[mm], weights=ln[mm], minlength=nd)
        reps = (W @ sn) / np.where((W @ sb) > 0, W @ sb, np.nan)
        return {"n": int(mm.sum()), "dates": int(len(set(di[mm]))), "ratio": round(float(sn.sum() / sb.sum()), 4),
                "ci": [round(float(x), 4) for x in np.nanpercentile(reps, [2.5, 97.5])]}

    ev = T.event.to_numpy()
    out = {"overall": ratio(np.ones(len(T), bool)), "non_event(none)": ratio(ev == "none"), "NFP+CPI": ratio(np.isin(ev, ["NFP", "CPI"]))}
    for e in ("NFP", "CPI", "FOMC", "high", "unknown"):
        out[e] = ratio(ev == e)
    for q in F.Q:
        out[f"NFP+CPI {q}"] = ratio(np.isin(ev, ["NFP", "CPI"]), (q,))
    cov = {}
    for e in ("NFP", "CPI", "FOMC", "high", "none"):
        sub = m & (ev == e)
        cov[e] = {a: {f"{q}_{r}": round(100 * float((T[F.Q[q]][sub] > T[f"{a}_{q}_{r}"][sub]).mean()), 1) for q in F.Q for r in F.R} for a in (base, new)}
    out["coverage_by_event"] = cov
    out["by_fold_NFP+CPI"] = {str(fo): ratio(np.isin(ev, ["NFP", "CPI"]) & (T.fold == fo).to_numpy())["ratio"] for fo in sorted(T.fold.unique())}
    out["by_class_overall"] = {c: ratio((T.klass == c).to_numpy())["ratio"] for c in sorted(T.klass.unique())}
    out["by_class_NFP+CPI"] = {c: ratio((T.klass == c).to_numpy() & np.isin(ev, ["NFP", "CPI"]))["ratio"] for c in sorted(T.klass.unique())}
    # acceptance
    c = cov
    def p75_ok(e):
        hb, hn = c[e][base]["hl_p75"], c[e][new]["hl_p75"]
        hl_ok = abs(hn - 25) <= 3 or abs(hb - 25) - abs(hn - 25) >= 2
        side_ok = all(abs(c[e][new][f"{q}_p75"] - 25) <= abs(c[e][base][f"{q}_p75"] - 25) + 1e-9 for q in ("oh", "ol"))
        return hl_ok and side_ok
    acc = {"overall_ub<=1": out["overall"]["ci"][1] <= 1.0,
           "NFP+CPI_ub<1": out["NFP+CPI"]["ci"][1] < 1.0,
           "p75_NFP": p75_ok("NFP"), "p75_CPI": p75_ok("CPI"),
           "others<=1.005": all(out[k]["ratio"] <= 1.005 for k in ("non_event(none)", "FOMC", "high", "unknown")),
           ">=4_of_6_folds": sum(v < 1 for v in out["by_fold_NFP+CPI"].values()) >= 4,
           "no_class>1.005": all(v <= 1.005 for v in out["by_class_overall"].values())}
    out["accept"] = acc
    out["ACCEPTED"] = all(acc.values())
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    X = B.load()
    T = build(X)
    dates = np.sort(T.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[T.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)
    res = {"S+E vs S (all 34)": compare(T, "S", "SE", np.ones(len(T), bool), W, di, nd),
           "SI+E vs SI (IV-13)": compare(T, "SI", "SIE", T.iv_ann.notna().to_numpy(), W, di, nd),
           "event_rows": T.event.value_counts().to_dict(), "event_dates": T.groupby("event").date.nunique().to_dict()}
    (OUT / "P2.json").write_text(json.dumps(res, indent=1, default=float))
    print(json.dumps(res, indent=1, default=float)[:12000])


if __name__ == "__main__":
    main()
