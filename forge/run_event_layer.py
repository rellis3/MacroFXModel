"""EVENT-LAYER — runs forge/EVENT_LAYER_PREREG.md exactly as registered.

A = IV-adjusted (iv_sig only, the live form); B = iv_sig + ev_size (train-fitted release-type effect,
largest of the day's relevant Major releases) + surp_prev (largest |z| surprise of the previous
session's relevant releases). Ridge as COMBINED-RANGE; first 60% of dates train, last 40% test.

    python -m forge.run_event_layer
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_combined_range import CLASSES, asof_before, cboe, session_table
from forge.run_horizon_reversion import ladder_estimators

OUT = Path("analysis/output/event_layer")
END = pd.Timestamp("2026-07-02")
LAMBDA, TRAIN_FRAC, SHRINK_K, MIN_TYPE_N, Z_CAP = 1.0, 0.60, 20, 10, 5.0
CCY = {"NQ": {"USD"}, "SPX": {"USD"}, "DOW": {"USD"}, "US2000": {"USD"}, "DE30": {"EUR", "USD"}, "UK100": {"GBP", "USD"},
       "EURUSD": {"EUR", "USD"}, "GBPUSD": {"GBP", "USD"}, "USDJPY": {"USD"}, "AUDUSD": {"USD"}, "USDCAD": {"USD"},
       "USDCHF": {"USD"}, "GOLD": {"USD"}}


def family(title: str) -> str:
    t = re.sub(r"\(.*?\)", " ", str(title).lower())
    t = re.sub(r"[0-9]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def num(s):
    return pd.to_numeric(s.astype(str).str.replace(r"[%KMBT,]", "", regex=True).str.strip(), errors="coerce")


def calendar() -> pd.DataFrame:
    c = pd.read_csv("calendar_events.csv", encoding="latin-1", low_memory=False)
    c = c[c["impact"] == "Major"].copy()
    t = pd.to_datetime(c["datetime_raw"], errors="coerce").dt.tz_localize("UTC").dt.tz_convert("Europe/London")
    c = c[t.notna()].copy(); t = t[t.notna()]
    sess = t.dt.tz_localize(None).dt.normalize()
    sess = sess.where(t.dt.hour < 22, sess + pd.Timedelta(days=1))          # after 22:00 London -> next session
    c["sess"] = sess.values
    c["fam"] = c["event"].map(family)
    c["diff"] = num(c["actual"]) - num(c["consensus"])
    return c[c["sess"] <= END].reset_index(drop=True)


def ridge(Z, y):
    return np.linalg.solve(Z.T @ Z + LAMBDA * np.eye(Z.shape[1]), Z.T @ y)


def main():
    est = ladder_estimators()
    vix, vxn = cboe("VIX"), cboe("VXN")
    cvol = pd.read_parquet("data/cvol/cme_cvol_eod.parquet")
    cvol["d"] = pd.to_datetime(cvol["timestamp"]).dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()
    cal = calendar()
    rows, audit = [], {}
    for cls, members in CLASSES.items():
        for name, ivsrc in members.items():
            t = session_table(name, est[name])
            D = pd.DatetimeIndex(t["date"])
            iv = (asof_before(D, vxn if ivsrc == "VXN" else vix) if cls == "indices"
                  else asof_before(D, cvol[cvol["product"] == ivsrc].set_index("d")["cvol"].astype(float).sort_index()))
            df = t.assign(iv_sig=np.log(iv / t["sig_ann"].to_numpy()), inst=name, cls=cls)
            ok = np.isfinite(df["iv_sig"]) & (df["sig_d"] > 0) & (df["hl"] > 0) & (df["date"] <= END)
            df = df[ok].reset_index(drop=True)
            df["prev_date"] = df["date"].shift(1)
            rows.append(df); audit[name] = f"{len(df)} sessions to {df['date'].max().date()}"
    X = pd.concat(rows, ignore_index=True)
    X["y"] = np.log(X["hl"] / X["sig_d"])

    report = {"classes": {}, "audit": audit, "calendar_major_rows": int(len(cal))}
    for cls in CLASSES:
        C = X[X["cls"] == cls].copy().reset_index(drop=True)
        split = C["date"].quantile(TRAIN_FRAC)
        tr = (C["date"] < split).to_numpy()
        # ── arm A: iv_sig only ──
        mu = C[tr].groupby("inst")[["y", "iv_sig"]].mean()
        zi = C["iv_sig"].to_numpy() - mu.loc[C["inst"], "iv_sig"].to_numpy()
        yc = C["y"].to_numpy() - mu.loc[C["inst"], "y"].to_numpy()
        sdi = zi[tr].std()
        bA = ridge((zi[tr] / sdi)[:, None], yc[tr])
        C["sigA"] = C["sig_d"] * np.exp((zi / sdi) * bA[0])
        res = np.log(C["hl"] / C["sigA"]); res = res - res[tr].groupby(C.loc[tr, "inst"]).mean().reindex(C["inst"]).to_numpy()
        C["res"] = res.to_numpy()
        # ── release-type effects and surprise scales, TRAIN only ──
        rel = []                                     # (row index, family) for every relevant release on a row's session
        cal_by_day = cal.groupby("sess")
        for i, (d, inst) in enumerate(zip(C["date"], C["inst"])):
            if d in cal_by_day.groups:
                g = cal_by_day.get_group(d)
                for f in set(g.loc[g["ccy"].isin(CCY[inst]), "fam"]):
                    rel.append((i, f))
        R = pd.DataFrame(rel, columns=["i", "fam"])
        R["train"] = tr[R["i"].to_numpy()]
        R["res"] = C["res"].to_numpy()[R["i"].to_numpy()]
        agg = R[R["train"]].groupby("fam")["res"].agg(["sum", "count"])
        eff = (agg["sum"] / (agg["count"] + SHRINK_K)).where(agg["count"] >= MIN_TYPE_N, 0.0)
        R["eff"] = R["fam"].map(eff).fillna(0.0)
        C["ev_size"] = R.groupby("i")["eff"].max().reindex(range(len(C))).fillna(0.0).to_numpy()
        caltr = cal[cal["sess"] < split]
        scale = caltr.dropna(subset=["diff"]).groupby("fam")["diff"].apply(lambda s: 1.4826 * np.median(np.abs(s - np.median(s))))
        cal2 = cal.dropna(subset=["diff"]).copy()
        cal2["z"] = (cal2["diff"].abs() / cal2["fam"].map(scale)).replace([np.inf], np.nan).clip(upper=Z_CAP)
        zmax = {}
        for d, g in cal2.dropna(subset=["z"]).groupby("sess"):
            zmax[d] = g[["ccy", "z"]].values.tolist()
        def surp(pd_, inst):
            if pd.isna(pd_) or pd_ not in zmax: return 0.0
            v = [z for ccy, z in zmax[pd_] if ccy in CCY[inst]]
            return float(max(v)) if v else 0.0
        C["surp_prev"] = [surp(p, i) for p, i in zip(C["prev_date"], C["inst"])]
        # ── arm B: iv_sig + ev_size + surp_prev ──
        F = ["iv_sig", "ev_size", "surp_prev"]
        mu2 = C[tr].groupby("inst")[F].mean()
        Z = C[F].to_numpy(float) - mu2.loc[C["inst"], F].to_numpy(float)
        sd = Z[tr].std(axis=0); sd[sd == 0] = 1.0
        bB = ridge(Z[tr] / sd, yc[tr])
        C["sigB"] = C["sig_d"] * np.exp((Z / sd) @ bB)
        # ── score ──
        per, exc = [], {}
        hi_ev = np.quantile(C.loc[tr, "ev_size"], 0.9)
        for inst, g in C.groupby("inst"):
            gtr, gte = g[g["date"] < split], g[g["date"] >= split]
            L, p75 = {}, {}
            for arm in ("A", "B"):
                col = f"sig{arm}"; tot = 0.0
                for t_ in (0.5, 0.75):
                    m = V.fit_width_multiplier(gtr[col].to_numpy(), gtr["hl"].to_numpy(), t_)
                    pred = m * gte[col].to_numpy(); d_ = gte["hl"].to_numpy() - pred
                    tot += float(np.where(d_ >= 0, t_ * d_, (t_ - 1) * d_).mean())
                    if t_ == 0.75: p75[arm] = gte["hl"].to_numpy() > pred
                L[arm] = tot
            for st, m in (("top-decile ev_size", gte["ev_size"].to_numpy() >= hi_ev), ("surp_prev>=2", gte["surp_prev"].to_numpy() >= 2),
                          ("no release, no surprise", (gte["ev_size"].to_numpy() == 0) & (gte["surp_prev"].to_numpy() == 0)), ("all", np.ones(len(gte), bool))):
                for arm in "AB":
                    a = exc.setdefault(st, {}).setdefault(arm, [0, 0]); a[0] += int(p75[arm][m].sum()); a[1] += int(m.sum())
            per.append({"inst": inst, "ratio": round(L["B"] / L["A"], 4)})
        r = np.array([p["ratio"] for p in per]); med, share = float(np.median(r)), float((r < 1).mean())
        verdict = "PASS" if (med < 0.99 and share >= 0.60) else "FAIL"
        top = eff[eff != 0].sort_values()
        report["classes"][cls] = {
            "split": str(split.date()), "median_ratio": round(med, 4), "share_better": round(share, 3), "verdict": verdict,
            "beta_std": dict(zip(F, [round(float(x), 4) for x in bB])), "per_instrument": per,
            "p75_by_state": {k: {a: (round(v[a][0] / v[a][1], 3) if v[a][1] else None) for a in "AB"} | {"n": v["A"][1]} for k, v in exc.items()},
            "release_types_with_effect": int((eff != 0).sum()),
            "widest_types": {k: round(float(v), 3) for k, v in top.tail(8).items()},
            "quietest_types": {k: round(float(v), 3) for k, v in top.head(5).items()},
        }
        print(f"\n{cls}: split {split.date()}  median B/A {med:.4f}  better {share:.0%} -> {verdict}")
        print("  beta", report["classes"][cls]["beta_std"]); print("  ", per)
        for k, v in report["classes"][cls]["p75_by_state"].items(): print(f"   {k:24s} {v}")
        print("  widest types", report["classes"][cls]["widest_types"])

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(report, indent=1, default=str))
    md = ["# EVENT-LAYER — results", "", "Pre-registration: `forge/EVENT_LAYER_PREREG.md`.", ""]
    for cls, c in report["classes"].items():
        md += [f"## {cls} — **{c['verdict']}**", "", f"Train before {c['split']}. Test pinball (IV + events) ÷ (IV only): median **{c['median_ratio']}**, "
               f"better on **{c['share_better']:.0%}**. Joint β (std): {c['beta_std']}.", "",
               "| instrument | B÷A |", "|---|---|"] + [f"| {p['inst']} | {p['ratio']} |" for p in c["per_instrument"]] + \
              ["", "| test days | n | A p75 exceed | B p75 exceed |", "|---|---|---|---|"] + \
              [f"| {k} | {v['n']} | {v['A']} | {v['B']} |" for k, v in c["p75_by_state"].items()] + \
              ["", f"Release types with a non-zero train effect: {c['release_types_with_effect']}. Widest: {c['widest_types']}. Quietest: {c['quietest_types']}.", ""]
    md += ["## Data", "", f"- calendar Major rows (USD/EUR/GBP, to 2026-07-02): {report['calendar_major_rows']}"] + [f"- {k}: {v}" for k, v in report["audit"].items()]
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    print("wrote", OUT / "RESULTS.md")


if __name__ == "__main__":
    main()
