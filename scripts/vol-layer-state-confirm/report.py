"""vol-layer-state-confirm: apply the registered gate (prereg §4) to confirm/cells.json + confirm/nudge.json.
Writes analysis/output/vol-layer-state-confirm/results.json and gate.json (RESULTS.md is written by hand from these).

    python -X utf8 scripts/vol-layer-state-confirm/report.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

WT = Path(__file__).resolve().parents[2]
OUT = WT / "analysis/output/vol-layer-state-confirm"
Z = {"a05_2": 1.959964, "a01_2": 2.575829, "a01_1": 2.326348, "a05_1": 1.644854, "pow80": 0.841621}
BAR = {"A1": 0.17, "A2": 0.10, "B": 0.005, "C": 0.10, "D": 0.05}
IDS = {"A1": "vol-layer-state-confirm-over", "A2": "vol-layer-state-confirm-chosen", "B": "vol-layer-state-confirm-nudge",
       "C": "vol-layer-state-confirm-error", "D": "vol-layer-state-confirm-dsigma"}


def holm(ps):
    names = sorted(ps, key=lambda k: ps[k])
    m = len(names)
    adj, run = {}, 0.0
    for i, k in enumerate(names):
        run = max(run, min(1.0, (m - i) * ps[k]))
        adj[k] = run
    return adj


def same_half(base, other):
    return bool(np.sign(other) == np.sign(base) and abs(other) >= 0.5 * abs(base))


def main():
    cells = json.loads((OUT / "confirm/cells.json").read_text())
    nud = json.loads((OUT / "confirm/nudge.json").read_text())
    s0 = json.loads((OUT / "discovery/step0.json").read_text())
    s0n = json.loads((OUT / "discovery/step0_nudge.json").read_text())
    b_powered = s0n["power"]["status"] == "POWERED"
    # effect in "gain" units: positive = the registered direction
    eff = {}
    for k in ("A1", "A2", "C", "D"):
        c = cells[k]
        b = c["base"]
        se = (b["hi"] - b["lo"]) / (2 * Z["a05_2"])
        eff[k] = {"est": b["est"], "lo": b["lo"], "hi": b["hi"], "p": b["p"], "dates": b["dates"], "rows": b["rows"], "se": se,
                  "mde_a05": (Z["a05_2"] + Z["pow80"]) * se, "mde_a01": (Z["a01_2"] + Z["pow80"]) * se,
                  "neigh": {n: v["est"] for n, v in c["neighbours"].items()}, "lag": c["lag1"]["est"],
                  "years": {y: v["est"] for y, v in c["years"].items()}, "placebo_p975": c["placebo"]["p975"],
                  "block60": [c["block60"]["lo"], c["block60"]["hi"], c["block60"]["p"]]}
    b = nud["base"]
    se = (b["hi"] - b["lo"]) / (2 * Z["a05_2"])
    eff["B"] = {"est": b["ratio"], "lo": b["lo"], "hi": b["hi"], "p": b["p_one_sided"], "dates": b["dates"], "rows": b["rows"], "se": se,
                "mde_a05": (Z["a05_1"] + Z["pow80"]) * se, "mde_a01": (Z["a01_1"] + Z["pow80"]) * se,
                "neigh": {"iv13": nud["neighbour_iv13"]["ratio"], "rolling3y": nud["neighbour_rolling3y"]["ratio"]},
                "lag": nud["lag1"]["ratio"], "years": nud["base"]["by_year"], "placebo_p025": nud["placebo"]["p025"],
                "block60": [nud["block60"]["lo"], nud["block60"]["hi"], nud["block60"]["p_one_sided"]],
                "qlike": b["qlike_range2_ratio"], "worst_class": max(b["by_class"].values()),
                "miss_new": b["regime_miss_new"], "miss_old": b["regime_miss_old"]}
    hp = holm({k: v["p"] for k, v in eff.items()})
    out_cells = []
    for k in ("A1", "A2", "B", "C", "D"):
        e = eff[k]
        e["holm_p"] = hp[k]
        sig = hp[k] < 0.05
        if k == "B":
            g = 1 - e["est"]                                    # gain
            gate = {"holm": sig, "sign_and_bar": e["est"] <= 1 - BAR["B"],
                    "plateau": all(same_half(g, 1 - v) for v in e["neigh"].values()),
                    "lag1": same_half(g, 1 - e["lag"]),
                    "years_3_of_4": sum(1 for v in e["years"].values() if v < 1) >= 3,
                    "placebo": e["est"] < e["placebo_p025"],
                    "qlike_range2_below_1": e["qlike"] < 1, "no_class_worse_0.5pct": e["worst_class"] <= 1.005,
                    "regime_miss_no_worse": e["miss_new"] <= e["miss_old"]}
            right_sign = e["est"] < 1
            null_ci = e["lo"] > 1 - BAR["B"]
            by_design = not b_powered
        else:
            gate = {"holm": sig, "sign_and_bar": e["est"] >= BAR[k],
                    "plateau": all(same_half(e["est"], v) for v in e["neigh"].values()),
                    "lag1": same_half(e["est"], e["lag"]),
                    "years_3_of_4": sum(1 for v in e["years"].values() if np.sign(v) == np.sign(e["est"])) >= 3 and e["est"] > 0,
                    "placebo": e["est"] > e["placebo_p975"]}
            right_sign = e["est"] > 0
            null_ci = e["hi"] < BAR[k]
            by_design = k == "D"
        if all(gate.values()):
            v = "VALIDATED"
        elif sig and right_sign:
            v = "CONTEXT"
        elif sig and not right_sign:
            v = "NULL"
        elif by_design:
            v = "UNDERPOWERED"
        elif null_ci:
            v = "NULL"
        else:
            v = "UNDERPOWERED"
        e["gate"] = gate
        e["verdict"] = v
        out_cells.append({"name": IDS[k], "cell": k, "n": e["dates"], "rows": e["rows"], "est": e["est"], "lo": e["lo"], "hi": e["hi"],
                          "mde": e["mde_a01"], "mde_alpha05": e["mde_a05"], "bar": BAR[k] if k != "B" else 1 - BAR["B"],
                          "p": e["p"], "holm_p": e["holm_p"], "gate": gate, "verdict": v.lower()})
    res = {"id": "vol-layer-state-confirm", "verdict": "mixed: see cells", "ranAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "seed": 20261116, "B": 2000, "prereg": "forge/VOL_LAYER_STATE_CONFIRM_PREREG.md", "preregCommit": "2f63c51a", "branch": "main",
           "window": "2023-01-01 to 2026-08-20 (London dates); lockbox 2026-08-21 on not read",
           "step0": {"pass": s0["pass"], "build": s0["build_pass"], "reproduce": s0["reproduce_pass"], "plants": s0["plants_pass"],
                     "nudge": s0["nudge_pass"], "B_power": s0n["power"]},
           "cells": out_cells}
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    (OUT / "gate.json").write_text(json.dumps(eff, indent=1, default=float), encoding="utf-8")
    for c in out_cells:
        print(f"{c['cell']:3s} {c['verdict']:13s} est {c['est']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] mde {c['mde']:.4f} holm {c['holm_p']:.4f} "
              + " ".join(f"{k}={'Y' if v else 'n'}" for k, v in c["gate"].items()))


if __name__ == "__main__":
    main()
