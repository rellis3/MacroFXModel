"""Day reconstruction, milestone 3: evidence tables for REPORT.md (from results.json / direction.json / outcomes).
    python scripts/day-reconstruction/m3_tables.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "analysis/output/day-reconstruction/m3"
R = json.load(open(OUT / "results.json"))
D = json.load(open(OUT / "direction.json"))
L = []
pc = lambda x: f"{100 * x:.0f}"
L.append("# Milestone 3 — evidence tables\n\nOut-of-sample era (point-in-time parameters, 2020-08-21 → 2026-08-20), all days. "
         "Real = the forecast level. Δ = real minus the curvature-corrected phantom baseline (B2), percentage points, "
         "95% day-clustered interval; ✱ = interval excludes 0 (before any multiple-testing correction).\n")
for N in R:
    L.append(f"\n## {N}\n")
    L.append("| level | touches (= days) | next rung | Δ | back through prev level | Δ | revisit open | Δ | close back inside | Δ | +0.5σ first / −0.5σ first / neither | median further travel / pull-back (σ) | median min to next rung |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for c, v in R[N]["oos_pit|all"]["cells"].items():
        def f(o):
            x = v[o]; b = x["B2"]; s = "✱" if b["diff_ci_pp"][0] > 0 or b["diff_ci_pp"][1] < 0 else ""
            return pc(x["real"]), f"{b['diff_pp']:+.1f} [{b['diff_ci_pp'][0]:+.1f}, {b['diff_ci_pp'][1]:+.1f}]{s}"
        e = v["excursion"]
        cont, rev = v["race50_cont"]["real"], v["race50_rev"]["real"]
        mn = e["min_to_next_median"]
        L.append(f"| {c} | {v['_n'][0]} | " + " | ".join(" | ".join(f(o)) for o in ("next", "prev", "open_revisit", "closeback")) +
                 f" | {pc(cont)} / {pc(rev)} / {pc(1 - cont - rev)} | {e['cont_max_sig_median']:.2f} / {e['rev_max_sig_median']:.2f} | {'—' if mn is None else f'{mn:.0f}'} |")
L.append("\n'next rung' for p90 = one more rung step beyond p90 (expansion). 'prev level' = open for p50, p50 for p75, p75 for p90.\n")
L.append("\n## Direction: gross R of a 1:1 race at ±d from the level (continuation side; reversion = minus this)\n")
L.append("| instrument | family | rung | d | touches | gross R [95%] | vs B2 | spread cost (R) |")
L.append("|---|---|---|---|---|---|---|---|")
for N in D:
    for k, v in D[N]["oos_pit"]["cells"].items():
        g, r, d = k.split("|")
        s = "✱" if v["ci"][0] > 0 or v["ci"][1] < 0 else ""
        L.append(f"| {N} | {g} | {r} | {d[4:]}% σ | {v['n']} | {v['gross_R']:+.3f} [{v['ci'][0]:+.3f}, {v['ci'][1]:+.3f}]{s} | {v['minus_B2']:+.3f} | {v['median_cost_R']:.3f} |")
# when touches happen (London time) per family
L.append("\n## When each family is first touched (median London time of touch, OOS)\n")
L.append("| instrument | Fixed OH/OL | Fixed Close | Projected H/L |\n|---|---|---|---|")
for N in R:
    t = pd.read_parquet(OUT / f"{N}_real_outcomes.parquet")
    t = t[t.era == "oos_pit"]
    row = []
    for g in ("Fixed OH/OL", "Fixed Close", "Projected H/L"):
        h = t[t.group == g].min_since_open.median() / 60
        row.append(f"{int(h):02d}:{int(round((h % 1) * 60)):02d} ({len(t[t.group == g])})")
    L.append(f"| {N} | " + " | ".join(row) + " |")
(OUT / "TABLES.md").write_text("\n".join(L) + "\n", encoding="utf-8")
print("written", len(L), "lines")
