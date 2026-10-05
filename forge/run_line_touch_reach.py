"""LINE-TOUCH-REACH — runs forge/LINE_TOUCH_REACH_PREREG.md exactly as registered.

After price reaches a Live Range line (as drawn at checkpoint h), how often does it reach the next
one before the close, and how far past does it carry? Writes js/lineTouchReach.js (the table the
page shows) whatever the verdict — the prereg says which numbers it may show.

    python -m forge.run_line_touch_reach
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge.run_intraday_range import TRAIN_FRAC, build_frame, cellvals

OUT = Path("analysis/output/line_touch_reach")
OUT_JS = Path("js/lineTouchReach.js")
GROUPS = {"01-07": range(1, 8), "08-14": range(8, 15), "15-21": range(15, 22)}
MIN_TOUCH, TOL = 200, 0.05


def group_of(h):
    return next(g for g, r in GROUPS.items() if h in r)


def main():
    X, _ = build_frame()
    out, table, cells_eval = {"classes": {}}, {}, []
    for cls in ("fx_gold", "indices"):
        C = X[X["cls"] == cls]
        split = C["date"].quantile(TRAIN_FRAC)
        acc = {}   # (side, group, measure) -> dict(touch, onward, implied_num, implied_den, overs=[])
        for h, Ch in C.groupby("h"):
            tr, te = Ch[Ch["date"] < split], Ch[Ch["date"] >= split]
            if len(tr) < 500 or len(te) < 200:
                continue
            eu = np.quantile(tr["used"], [1 / 3, 2 / 3]); es = np.quantile(tr["speed"], [1 / 3, 2 / 3])
            ctr = np.digitize(tr["used"], eu) * 3 + np.digitize(tr["speed"], es)
            cte = np.digitize(te["used"], eu) * 3 + np.digitize(te["speed"], es)
            g = group_of(h)
            for side, col in (("up", "U"), ("dn", "Dn")):
                vtr, vte = tr[col].to_numpy(), te[col].to_numpy()
                for c in range(9):
                    base = cellvals(vtr, ctr, c)
                    q50, q75, q90 = np.quantile(base, [0.5, 0.75, 0.9])
                    m = cte == c
                    x = vte[m]
                    for meas, lo, hi in (("p75_to_p90", q75, q90), ("p50_to_p75", q50, q75)):
                        a = acc.setdefault((side, g, meas), {"touch": 0, "onward": 0, "imp_num": 0, "imp_den": 0, "overs": []})
                        # a line sitting ON the current extreme (q == 0) is "reached" trivially; skip those rows
                        t = (x >= lo) & (lo > 0)
                        a["touch"] += int(t.sum()); a["onward"] += int((x[t] >= hi).sum())
                        it = (base >= lo) & (lo > 0)
                        a["imp_num"] += int((base[it] >= hi).sum()); a["imp_den"] += int(it.sum())
                        if meas == "p75_to_p90" and hi > lo:
                            a["overs"].extend(((x[t] - lo) / (hi - lo)).tolist())
        rows = []
        for (side, g, meas), a in sorted(acc.items()):
            real = a["onward"] / a["touch"] if a["touch"] else None
            imp = a["imp_num"] / a["imp_den"] if a["imp_den"] else None
            ov = np.array(a["overs"]) if a["overs"] else np.array([np.nan])
            eligible = a["touch"] >= MIN_TOUCH
            cal = eligible and real is not None and imp is not None and abs(real - imp) <= TOL
            rows.append({"side": side, "hours": g, "measure": meas, "touches": a["touch"],
                         "realised": round(real, 3) if real is not None else None, "implied": round(imp, 3) if imp is not None else None,
                         "eligible": eligible, "calibrated": bool(cal),
                         "overshoot_median_frac": round(float(np.nanmedian(ov)), 3) if meas == "p75_to_p90" else None,
                         "overshoot_p75_frac": round(float(np.nanquantile(ov, 0.75)), 3) if meas == "p75_to_p90" else None})
            if eligible: cells_eval.append(cal)
        out["classes"][cls] = {"split": str(split.date()), "rows": rows}
        table[cls] = {f"{r['side']}|{r['hours']}|{r['measure']}": {"realised": r["realised"], "implied": r["implied"], "n": r["touches"],
                                                                     "overshoot_median": r["overshoot_median_frac"]} for r in rows}
        print(f"\n{cls} (train before {split.date()})")
        for r in rows: print("  ", r)
    share = float(np.mean(cells_eval)) if cells_eval else 0.0
    verdict = "CALIBRATED" if share >= 0.80 else "MISCALIBRATED"
    out["verdict"], out["calibrated_share"] = verdict, round(share, 3)
    print(f"\n{sum(cells_eval)}/{len(cells_eval)} eligible cells within ±5pp -> {verdict}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=str))
    md = ["# LINE-TOUCH-REACH — results", "", "Pre-registration: `forge/LINE_TOUCH_REACH_PREREG.md`.", "",
          f"**Verdict: {verdict}** — {sum(cells_eval)}/{len(cells_eval)} eligible cells within ±5pp of the model's implied share.", ""]
    for cls, c in out["classes"].items():
        md += [f"## {cls}", "", f"Train before {c['split']}; test after.", "",
               "| side | hours | from → to | touches | realised | model implied | ±5pp | overshoot past p75 (median / p75, as share of the p75→p90 gap) |",
               "|---|---|---|---|---|---|---|---|"]
        pc = lambda v: "" if v is None else f"{v:.0%}"
        for r in c["rows"]:
            ov = f"{r['overshoot_median_frac']:.2f} / {r['overshoot_p75_frac']:.2f}" if r["overshoot_median_frac"] is not None else ""
            mark = "✓" if r["calibrated"] else ("✗" if r["eligible"] else "n<200")
            md.append(f"| {r['side']} | {r['hours']} | {r['measure'].replace('_to_', ' → ')} | {r['touches']} | "
                      f"{pc(r['realised'])} | {pc(r['implied'])} | {mark} | {ov} |")
        md.append("")
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    OUT_JS.write_text("/**\n * Line-touch reach table for the Live Range page. GENERATED — do not hand-edit.\n"
                      " * Regenerate: python -m forge.run_line_touch_reach   (forge/LINE_TOUCH_REACH_PREREG.md)\n"
                      " * key: side|hours|measure -> realised share on test (the number the page shows), n, overshoot.\n */\n"
                      f"export const LINE_TOUCH = {json.dumps({'generated': str(date.today()), 'verdict': verdict, 'classes': table})};\n",
                      encoding="utf-8")
    print("wrote", OUT / "RESULTS.md", OUT_JS)


if __name__ == "__main__":
    main()
