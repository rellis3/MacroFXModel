"""vmc-nq-vol-increment: apply the registered gates (prereg section 4, read with section 5's measured 30m rule and
amendment A1) to runs/tf{1,3,5,30}.json. Writes results.json.

    python -I scripts/vmc-nq-vol-increment/synth.py
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import features as F  # noqa: E402

R = {tf: json.loads((F.OUT / "runs" / f"tf{tf}.json").read_text()) for tf in ("1", "3", "5", "30")}
REQ = ("1", "3", "5")          # 30m UNDERPOWERED by design for H3/H4 (half-width 5.8% > 1%, prereg section 5)
MAT, MIN_YEAR, MIN_TOP = 0.01, 0.005, 0.005
STAGE2_BAR = 0.02


def includes0(s):
    return s["lo"] <= 0 <= s["hi"]


def holm(p, alpha=0.05):
    p = np.asarray(p, float)
    ok = np.zeros(len(p), bool)
    for r, i in enumerate(np.argsort(p)):
        if p[i] <= alpha / (len(p) - r):
            ok[i] = True
        else:
            break
    return ok


def h3(pair, years_key, top_key, shuf_key):
    per = {}
    for tf in R:
        r = R[tf]
        s = r["pairs"][pair]
        yrs = {y: v[years_key]["est"] for y, v in r["walk_forward"].items()}
        per[tf] = {"skill": s, "material": s["est"] >= MAT and s["lo"] > 0,
                   "years": yrs, "years_ok": sum(v >= MIN_YEAR for v in yrs.values()) >= 3,
                   "top1_removed": r[top_key]["est"], "top1_ok": r[top_key]["est"] >= MIN_TOP,
                   "V_minus_staleV": r["V_minus_staleV"], "stale_ok": r["V_minus_staleV"]["lo"] > 0,
                   "shuffled": r["shuffled_target"][shuf_key], "shuffled_ok": includes0(r["shuffled_target"][shuf_key])}
        per[tf]["pass"] = all(per[tf][k] for k in ("material", "years_ok", "top1_ok", "stale_ok"))
    broken = [tf for tf in REQ if not per[tf]["shuffled_ok"]]
    gate = all(per[tf]["pass"] for tf in REQ) and not broken
    reachable = all(per[tf]["skill"]["hi"] >= MAT for tf in REQ)
    verdict = "VALIDATED" if gate else ("UNDERPOWERED" if reachable else "NULL")
    return {"per_tf": per, "required_tfs": REQ, "pipeline_broken_tfs": broken, "gate_pass": gate, "verdict": verdict}


def blocks():
    rows = []
    for tf in R:
        for b, s in R[tf]["blocks"].items():
            rows.append({"tf": tf, "block": b, **s, "shuffled": R[tf]["shuffled_target"][f"block {b}"]})
    ok = holm([r["p_one_sided"] for r in rows])
    for r, o in zip(rows, ok):
        r["holm"] = bool(o)
        r["pass"] = bool(o and r["est"] >= MAT and includes0(r["shuffled"]))
    reach = [r for r in rows if r["hi"] >= MAT]
    verdict = "VALIDATED" if any(r["pass"] for r in rows) else ("UNDERPOWERED" if reach else "NULL")
    return {"tests": rows, "n_tests": len(rows), "verdict": verdict,
            "passing": [f'{r["block"]}@{r["tf"]}m' for r in rows if r["pass"]],
            "upper_bound_reaches_1pct": [f'{r["block"]}@{r["tf"]}m' for r in reach]}


def h4(name):
    per = {}
    for tf in R:
        s4 = R[tf]["stage4"].get(name, {})
        if "skill_V" not in s4:
            per[tf] = {"skipped": True}
            continue
        s = s4["skill_V"]
        per[tf] = {"skill": s, "material": s["est"] >= MAT and s["lo"] > 0, "V_minus_staleV": s4["V_minus_staleV"],
                   "stale_ok": s4["V_minus_staleV"]["lo"] > 0, "shuffled": s4["shuffled_target"],
                   "shuffled_ok": includes0(s4["shuffled_target"]), "n_test": s4["n_test"],
                   "brier_base": s4["base"]["brier"], "brier_V": s4["V"]["brier"], "climatology": s4["base"]["brier_climatology"],
                   "auc_base": s4["base"]["auc"], "auc_V": s4["V"]["auc"], "base_rate": s4["base"]["base_rate"]}
        per[tf]["pass"] = per[tf]["material"] and per[tf]["stale_ok"]
    ok = [tf for tf in REQ if not per[tf].get("skipped")]
    gate = len(ok) == len(REQ) and all(per[tf]["pass"] and per[tf]["shuffled_ok"] for tf in REQ)
    reachable = len(ok) == len(REQ) and all(per[tf]["skill"]["hi"] >= MAT for tf in REQ)
    return {"per_tf": per, "gate_pass": gate, "verdict": "VALIDATED" if gate else ("UNDERPOWERED" if reachable else "NULL")}


def stage2():
    out = {}
    for c in ("level_B_D", "cross_C_D", "cross_given_level_A_B", "interaction"):
        per = {tf: R[tf]["stage2_vs_CPK"][c] for tf in R}
        sig = lambda s: (s["lo"] > 0 or s["hi"] < 0) and abs(s["est"]) >= STAGE2_BAR  # noqa: E731
        sgn = np.sign(per["1"]["est"])
        gate = sig(per["1"]) and sig(per["3"]) and np.sign(per["3"]["est"]) == sgn and \
            all(np.sign(per[tf]["est"]) == sgn for tf in ("5", "30"))
        inside = all(-STAGE2_BAR < per[tf]["lo"] and per[tf]["hi"] < STAGE2_BAR for tf in ("1", "3"))
        out[c] = {"per_tf": per, "simple_baseline": {tf: R[tf]["stage2_vs_simple_baseline"][c] for tf in R},
                  "gate_pass": bool(gate), "verdict": "VALIDATED" if gate else ("NULL" if inside else "UNDERPOWERED"),
                  "label": "reassessment on a previously explored period"}
    out["n"] = {tf: {g: R[tf]["stage2_vs_CPK"][g]["n"] for g in "ABCD"} for tf in R}
    return out


def main():
    res = {"seed": 20261031, "prereg": "forge/VMC_NQ_VOL_INCREMENT_PREREG.md", "test_period": "2023-01-01..2026-07-01",
           "lockbox": "not read", "required_timeframes_H3_H4": list(REQ),
           "label_stages_3_5": "pre-specified; test period previously used in related research; not independent confirmation",
           "H3": h3("CPK->CPKV (PRIMARY H3)", "H3", "H3_without_top1pct", "H3"),
           "H3_noK": h3("CP->CPV (H3-noK)", "H3-noK", "H3noK_without_top1pct", "H3-noK"),
           "H3_blocks": blocks(), "H4a": h4("H4a_onset"), "H4b": h4("H4b_onset_in_compression"), "H2": stage2(),
           "context": {tf: {k: R[tf][k] for k in ("pairs", "ablation", "ols", "h48", "by_year_fixed_model", "by_session",
                                                     "nt8_only", "by_state", "exclusions", "n_test", "test_dates")}
                       | {"S1": {m: {k: v for k, v in R[tf]["S1"][m].items() if k != "calibration"} for m in R[tf]["S1"]},
                          "calibration": {m: R[tf]["S1"][m].get("calibration") for m in ("CPK", "CPKV")},
                          "stage4_recognising": R[tf]["stage4"]["recognising"],
                          "stage4_earlier": {k: v for k, v in R[tf]["stage4"].get("earlier_t13_24", {}).items() if k in ("skill_V", "n_test")},
                          "stage4_state_share": R[tf]["stage4"]["state_share_test"]} for tf in R}}
    (F.OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    for k in ("H3", "H3_noK", "H3_blocks", "H4a", "H4b"):
        print(k, res[k]["verdict"])
    for c in ("level_B_D", "cross_C_D", "cross_given_level_A_B", "interaction"):
        print("H2", c, res["H2"][c]["verdict"], {tf: round(v["est"], 4) for tf, v in res["H2"][c]["per_tf"].items()})


if __name__ == "__main__":
    main()
