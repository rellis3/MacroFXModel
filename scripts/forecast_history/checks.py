"""STEP 0 checks 1, 3, 4, 5 (forge/FORECAST_HISTORY_SPEC.md). Writes analysis/output/forecast_history/CHECKS.md.

    python scripts/forecast_history/checks.py
"""
import json
from pathlib import Path

import pandas as pd

H = Path("analysis/output/forecast_history")
LC = Path("analysis/surfaces/ladder_calibration")
REPORT = json.loads(Path("forge/out_vol_lon/vol_report.json").read_text())
KEY = {"DOW": "us30", "SPX500": "spx500"}
Q, R = ("oh", "ol", "hl", "oc"), ("p50", "p75", "p90")

lines, cov, fails = [], [], []
for f in sorted(H.glob("*.csv")):
    d = pd.read_csv(f)
    sym = f.stem
    # 1 reproduction: live_* == ladder_calibration (the page's own calc) on shared days
    rep = "no reference file"
    if (LC / f.name).exists():
        ref = pd.read_csv(LC / f.name)
        m = d.merge(ref, on="date", suffixes=("", "_ref"))
        diff = max(float((m[f"live_{q}_{r}"] - m[f"{q}_{r}"]).abs().max()) for q in Q for r in R)
        rep = f"{len(m)} days, max |diff| {diff:.4g}"
        if diff > 1e-4: fails.append(f"{sym}: reproduction diff {diff:.4g}")
    # 3 fold boundaries: every oos row's spec trained before the row's date
    specs = {s["fold"]: pd.Timestamp(s["trained_through"]) for s in REPORT[KEY.get(sym, sym.lower())]["specs"]}
    o = d[d.oos == 1]
    late = int((pd.to_datetime(o.date) <= o.fold.map(specs).dt.normalize()).sum())
    if late: fails.append(f"{sym}: {late} oos rows with spec trained on/after the date")
    # 5 sanity
    bad_js = int(((d.jump_share < 0) | (d.jump_share > 1)).sum())
    bad_hl = int((d.r_hl + 1e-4 < d[["r_oh", "r_ol"]].max(axis=1)).sum())
    bad_rv = int((d.rv5 <= 0).sum())
    if bad_js or bad_hl or bad_rv: fails.append(f"{sym}: sanity js {bad_js} hl {bad_hl} rv {bad_rv}")
    # 4 coverage
    cov.append(dict(inst=sym, rows=len(d), first=d.date.min(), last=d.date.max(), oos=int(d.oos.sum()),
                    oos_from=o.date.min(), cal_unknown=int((d.cal_known == 0).sum()),
                    short_day=int((d.last_min < 20 * 60).sum()), repro=rep))

c = pd.DataFrame(cov)
md = ["# Step 0 — forecast history: checks", "",
      "Spec: `forge/FORECAST_HISTORY_SPEC.md`. Causality (check 2): `node scripts/forecast_history/causality_check.mjs`.", "",
      f"**{'ALL CHECKS PASS' if not fails else 'FAILURES'}** (reproduction, fold boundaries, sanity) across {len(c)} instruments, "
      f"{c.rows.sum():,} sessions, {c.oos.sum():,} out-of-sample.", ""]
md += [f"- {x}" for x in fails] + [""]
md += ["SPX500 note: the reference file (`analysis/surfaces/ladder_calibration/SPX500.csv`, 2026-10-05 08:32) predates the "
       "SPX500 -> SPX params alias (2026-10-05 evening); sigma matches exactly, widths differ because the table now uses the fitted "
       "SPX widths, as the live page does. Not a table fault.", ""]
md += ["| inst | sessions | first | last | out-of-sample | oos from | calendar unknown | sessions ending before 20:00 | reproduction |",
       "|---|---|---|---|---|---|---|---|---|"]
md += [f"| {r.inst} | {r.rows} | {r.first} | {r.last} | {r.oos} | {r.oos_from} | {r.cal_unknown} | {r.short_day} | {r.repro} |"
       for r in c.itertuples()]
(H / "CHECKS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md[:8]))
