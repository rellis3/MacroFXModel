"""Readable tables from analysis/output/vf3_stage_b/part1.json -> PART1.md (no new computation)."""
import json
from pathlib import Path
import pandas as pd
OUT = Path("analysis/output/vf3_stage_b")
J = json.loads((OUT / "part1.json").read_text())
NAMES = {"P": "P production export (pit)", "S": "S persistence", "SI": "SI persistence+IV (chosen)", "I": "I IV-adjusted",
         "IV": "IV pure implied", "H": "H HAR-800", "C": "C incumbent COG (bot lines; p50/p75)"}
md = ["# VF3 Stage B, Part 1: daily forecasts head-to-head (retrospective research, 2020-08 to 2026-08, oos rows)", "",
      "Registration: forge/VF3_STAGE_B_PLAN.md. Pinball ratio vs P (lower is better), 95% date-block interval. P = the pit export.", ""]
for b, title in (("all34", "All instruments"), ("iv13", "The 13 instruments with implied vol")):
    B = J[b]
    md += [f"## {title}: {B['rows']:,} instrument-sessions, {B['dates']:,} dates, {B['instruments']} instruments", ""]
    rows = []
    for a, A in B["arms"].items():
        f = lambda k: f"{A[k][0]:.3f} [{A[k][1]:.3f}, {A[k][2]:.3f}]"
        rows.append({"forecast": NAMES[a], "all 12 rungs": f("ratio_ALL"), "H-L": f("ratio_hl"), "O-C": f("ratio_oc"), "O-H": f("ratio_oh"), "O-L": f("ratio_ol")})
    md += ["```", pd.DataFrame(rows).to_string(index=False), "```", ""]
    rows = []
    for a, A in B["arms"].items():
        e = A["exceed"]
        rows.append({"forecast": a, **{k: round(100 * v, 1) for k, v in e.items()}})
    md += ["Exceedance % per rung (targets p50 50 · p75 25 · p90 10):", "```", pd.DataFrame(rows).set_index("forecast").T.to_string(), "```", ""]
    for cut in ("regime_b", "wd", "event", "klass", "year"):
        rows = []
        for a, A in B["arms"].items():
            rows.append({"forecast": a, **{k: round(100 * v, 1) for k, v in A[f"p75_hl_by_{cut}"].items()}, "max miss pp": round(100 * A[f"p75_hl_miss_{cut}"], 1),
                         "O-H miss": round(100 * A[f"p75_oh_miss_{cut}"], 1), "O-L miss": round(100 * A[f"p75_ol_miss_{cut}"], 1)})
        md += [f"HL p75 exceedance % by {cut} (target 25), with max miss for HL, O-H, O-L p75:", "```", pd.DataFrame(rows).to_string(index=False), "```", ""]
    rows = []
    for a, A in B["arms"].items():
        rows.append({"forecast": a, **{f"{c}:{k}": v for c in ("regime_b", "wd") for k, v in A[f"hl_logbias_by_{c}"].items()}})
    md += ["Median log(realised HL / forecast HL p50) by regime and weekday (0 = unbiased median):", "```", pd.DataFrame(rows).set_index("forecast").T.round(3).to_string(), "```", ""]
    rows = pd.DataFrame({a: A["by_inst_ratio_ALL"] for a, A in B["arms"].items()})
    md += ["Pinball ratio vs P by instrument (all rungs):", "```", rows.round(3).to_string(), "```", ""]
    rows = pd.DataFrame({a: A["by_inst_hl_p75"] for a, A in B["arms"].items()}).mul(100).round(1)
    md += ["HL p75 exceedance % by instrument:", "```", rows.to_string(), "```", ""]
(OUT / "PART1.md").write_text("\n".join(md), encoding="utf-8")
print("\n".join(md)[:9000])
