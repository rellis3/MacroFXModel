"""cot-crowding-programme Phase 4, step 4: merge A1-A4 (phase4_trend.json) and VA1-VA2
(phase4_voteatlas.json), apply Holm at 0.05 across the six decision cells (prereg §6, family 2),
and assign the verdict words per §4/§5. Writes phase4_results.json."""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "../../analysis/output/cot-crowding-programme")
t = json.load(open(os.path.join(OUT, "phase4_trend.json")))
v = json.load(open(os.path.join(OUT, "phase4_voteatlas.json")))
cells = {**t["cells"], **{k: c for k, c in v["cells"].items()}}
order = ["A1", "A2", "A3", "A4", "VA1", "VA2"]
ps = sorted((cells[k]["p"], k) for k in order)
m = len(ps)
holm, running = {}, 0.0
for i, (p, k) in enumerate(ps):
    running = max(running, min(1.0, (m - i) * p))
    holm[k] = round(running, 4)
for k in order:
    c = cells[k]
    c["p_holm"] = holm[k]
    gate = all(c["checks"].values()) and holm[k] < 0.05
    if c.get("underpowered"):
        c["verdict"] = "UNDERPOWERED"
    else:
        c["verdict"] = "VALIDATED" if gate else "NULL"
    c["gate_passed"] = bool(gate)
res = {"id": "cot-crowding-programme", "phase": 4, "seed": 20261024, "prereg": "forge/COT_CROWDING_PROGRAMME_PREREG.md",
       "prereg_commit": "705e46ea", "family": "decisions (A1-A4, VA1, VA2), Holm 0.05", "cells": cells,
       "trend_arms": t["main"]["arms"], "trend_sanity_discovery_BASE": t["sanityDiscovery"]["arms"]["BASE"],
       "trend_ex10Y": t["ex10Y"]["arms"], "voteatlas_counts": {"n_trades": v["n_trades"], "window": v["window"], "by_inst": v["by_inst"], "state_counts": v["state_counts"]}}
json.dump(res, open(os.path.join(OUT, "phase4_results.json"), "w"), indent=1)
for k in order:
    c = cells[k]; print(k, c["verdict"], c["est"], c["ci"], "p", c["p"], "holm", c["p_holm"], c["checks"])
