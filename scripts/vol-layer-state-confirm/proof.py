"""Proof pack for vol-layer-state-confirm: reproduction, planted effects, shuffles and power for the five scored cells,
judged by the shared gate forge/verdict_gate.py.

    python -X utf8 scripts/vol-layer-state-confirm/proof.py

1. Re-runs run.py's own row builders and statistics on the confirm window and checks they reproduce confirm/cells.json
   (A1, A2, C, D: estimate, interval, p). Cell B is re-aggregated from confirm/nudge_losses.parquet (the per-row pinball
   losses nudge.py scored) with the same date-block weights, and checked against confirm/nudge.json.
2. Per cell: effect oriented so the registered direction is positive (B: 1 - SRH/SR), min_effect = the prereg's pass bar,
   a planted LARGE (2 x bar) and MINIMUM (= bar) effect added to the scored table, and a month-block shuffle with its own
   date-block interval (A1: outcome ratios; A2: log(range / sigma); C: F5c; D: F2; B: nudge.py's first placebo refit).
3. Lets verdict_gate.decide pick the word and compares it with results.json. checks.json is written only if every cell
   agrees; otherwise checks_MISMATCH_do_not_commit.json. The proof never rewrites a verdict.

The plants act on the scored table after the pipeline (as the other Vol-Layer proofs do): they prove the statistic and the
bootstrap see an effect of a known size. Step 0 (discovery/step0.json) holds the pipeline-level plants.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

WT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(WT), str(WT / "scripts/vol-layer-state-confirm")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import run as R  # noqa: E402
from forge import verdict_gate as G  # noqa: E402

SLUG = "vol-layer-state-confirm"
OUT = R.OUT
W_ = "confirm"
TOL = 1e-6
QID = {"A1": "over", "A2": "chosen", "B": "nudge", "C": "error", "D": "dsigma"}


def same(a, b, tol=TOL):
    return abs(a - b) <= tol


def main():
    cells = json.loads((OUT / "confirm/cells.json").read_text())
    nud = json.loads((OUT / "confirm/nudge.json").read_text())
    res = json.loads((OUT / "results.json").read_text())
    banked = {c["cell"]: c["verdict"].upper() for c in res["cells"]}
    D = R.load(W_)
    q, log = {}, []
    rng = np.random.default_rng(R.SEED + 77)

    def boot_gap(E, y, grp, top, bot):
        return R.Boot(E.date).run(E.date.to_numpy(), R.gap_cols(y, grp, top, bot), R.gap_fn)

    def pack(k, est, lo, hi, bar, repro, pl, pm, sh, used, dropped, note):
        q[QID[k]] = dict(effect=est, lo=lo, hi=hi, min_effect=bar,
                         diagnostics={"ok": bool(repro), "why": None if repro else "re-run did not reproduce confirm results", "note": note,
                                      "mde_80pct_alpha05_one_sided": (1.644854 + 0.841621) * G.se_from_ci(lo, hi)},
                         planted_large=pl, planted_min=pm, shuffle=sh, rows={"used": int(used), "dropped": int(dropped)})
        log.append(f"{k}: {est:+.4f} [{lo:+.4f}, {hi:+.4f}] repro {repro} planted L {pl['shift']:+.4f}/{pl['injected']} M {pm['shift']:+.4f}/{pm['injected']} shuffle [{sh['lo']:+.4f}, {sh['hi']:+.4f}]")

    win = R.cut(D, W_)
    # ---- A1
    E = R.a1_rows(D, W_)
    v, nd, n = R.a1_stat(E)
    b = cells["A1"]["base"]
    rep = same(v[0], b["est"]) and same(v[1], b["lo"]) and same(v[2], b["hi"])
    y, g = E.hl_s.to_numpy(), E.q.to_numpy()

    def plant_a1(d):
        y2 = y + d * (g == 0)
        return {"injected": d, "shift": boot_gap(E, y2, g, 0, 4)[0] - v[0], "how": f"added {d} to range/sigma on the lowest sigma fifth"}
    Es = E.reset_index(drop=True)
    ys = R.month_shuffle(Es, "hl_s", rng)
    s = boot_gap(Es, ys, Es.q.to_numpy(), 0, 4)
    pack("A1", v[0], v[1], v[2], R.BAR["A1"], rep, plant_a1(2 * R.BAR["A1"]), plant_a1(R.BAR["A1"]),
         {"effect": s[0], "lo": s[1], "hi": s[2], "how": "range/sigma replaced by its own ratios moved in whole calendar months (calibrated by construction)"},
         n, len(win) - n, "lowest minus highest live-sigma fifth of range / sigma, within instrument")
    # ---- A2
    E = R.a2_rows(D, W_)
    v, nd, n = R.a2_stat(E)
    b = cells["A2"]["base"]
    rep = same(v[0], b["est"]) and same(v[1], b["lo"]) and same(v[2], b["hi"])

    def plant_a2(d):
        Z = E.copy()
        Z["yv"] = Z.yv - d * Z.x
        return {"injected": d, "shift": R.a2_stat(Z)[0][0] - v[0], "how": f"log range tilted by -{d} x demeaned log sigma (slope lowered by {d})"}
    Es = E.reset_index(drop=True)
    Es["ratio"] = Es.ly - Es.lx
    rs = R.month_shuffle(Es, "ratio", rng)
    Z = Es[["inst", "date", "c_sig"]].copy()
    Z["hl"] = Es.c_sig * np.exp(rs)
    s = R.a2_stat(R.a2_rows(Z.assign(year=Z.date.str[:4]), W_))[0]
    pack("A2", v[0], v[1], v[2], R.BAR["A2"], rep, plant_a2(2 * R.BAR["A2"]), plant_a2(R.BAR["A2"]),
         {"effect": s[0], "lo": s[1], "hi": s[2], "how": "log(range / chosen sigma) moved in whole calendar months (calibrated by construction)"},
         n, len(win) - n, "1 - pooled Mincer-Zarnowitz slope of log range on log chosen sigma, demeaned within instrument")
    # ---- C
    E = R.c_rows(D, W_)
    v, nd, n = R.c_stat(E)
    b = cells["C"]["base"]
    rep = same(v[0], b["est"]) and same(v[1], b["lo"]) and same(v[2], b["hi"])
    y, g = E.hl_c.to_numpy(), E.q.to_numpy()

    def plant_c(d):
        return {"injected": d, "shift": boot_gap(E, y + d * (g == 4), g, 4, 0)[0] - v[0], "how": f"added {d} to range/chosen sigma on the top F5c fifth"}
    Es = E.reset_index(drop=True)
    Zs = Es[["inst", "date"]].copy()
    Zs["f"] = R.month_shuffle(Es, "F5c", rng)
    s = boot_gap(Es, Es.hl_c.to_numpy(), R.fifths(Zs, "f").to_numpy(), 4, 0)
    pack("C", v[0], v[1], v[2], R.BAR["C"], rep, plant_c(2 * R.BAR["C"]), plant_c(R.BAR["C"]),
         {"effect": s[0], "lo": s[1], "hi": s[2], "how": "F5c moved in whole calendar months within instrument, fifths re-ranked"},
         n, len(win) - n, "top minus bottom fifth of the chosen sigma's own error EWMA, range / chosen sigma")
    # ---- D
    E = R.d_rows(D, W_)
    v, nd, n = R.d_stat(E)
    b = cells["D"]["base"]
    rep = same(v[0], b["est"]) and same(v[1], b["lo"]) and same(v[2], b["hi"])
    a_, m_, y_ = E._F2.to_numpy(), E._MR5.to_numpy(), E._dlv_5.to_numpy()

    def dic(yy):
        return (a_ * yy).sum() / np.sqrt((a_ * a_).sum() * (yy * yy).sum()) - (m_ * yy).sum() / np.sqrt((m_ * m_).sum() * (yy * yy).sum())

    def plant_d(d):
        lo_, hi_ = 0.0, 5.0
        base = dic(y_)
        for _ in range(60):
            c = (lo_ + hi_) / 2
            if dic(y_ + c * a_) - base >= d:
                hi_ = c
            else:
                lo_ = c
        Z = E.copy()
        Z["_dlv_5"] = y_ + hi_ * a_
        return {"injected": d, "shift": R.d_stat(Z)[0][0] - v[0], "added_c": hi_, "how": f"added {hi_:.3f} x demeaned F2 to the realised change"}
    Es = E.reset_index(drop=True)
    Z = Es.copy()
    Z["_F2"] = R.month_shuffle(Es, "_F2", rng)
    s = R.d_stat(Z)[0]
    # the registered null for D is IC(F2) - IC(MR5) with F2 carrying no information: report the shuffled DIFFERENCE minus the
    # shuffled F2's expected IC (0), i.e. the shuffle's own interval of IC(F2_shuffled) - IC(MR5) + IC(MR5)
    icm = (m_ * y_).sum() / np.sqrt((m_ * m_).sum() * (y_ * y_).sum())
    s_ic = R.d_stat(Z, fn=R.ic_fn)[0]
    pack("D", v[0], v[1], v[2], R.BAR["D"], rep, plant_d(2 * R.BAR["D"]), plant_d(R.BAR["D"]),
         {"real_beats_all": bool(v[0] > s[2]), "effect": s_ic[0], "lo": s_ic[1], "hi": s_ic[2],
          "how": "placebo form (2026-11-16): the registered null is IC(F2) - IC(MR5) with F2 shuffled in whole calendar months; the real "
                 "difference must sit above that shuffle's whole interval. The shuffled F2's own IC stays positive (shared RV5 denominator), "
                 "so 'IC of shuffled F2 includes 0' is not a usable null here",
          "dic_with_shuffled_F2": [s[0], s[1], s[2]], "ic_MR5": float(icm)},
         n, len(win) - n, "IC(F2, realised 5-session change) minus IC(MR5, same), demeaned within instrument")
    # ---- B
    Lb = pd.read_parquet(OUT / "confirm/nudge_losses.parquet")
    m = np.isfinite(Lb.L_SR) & np.isfinite(Lb.L_SRH)
    Lb = Lb[m]
    dates = np.sort(Lb.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[Lb.date].to_numpy()
    import forecast_record as FR
    FR.SEED = 20261116
    Wb = FR.boot_weights(len(dates))
    A = np.bincount(di, weights=Lb.L_SRH, minlength=len(dates))
    Bq = np.bincount(di, weights=Lb.L_SR, minlength=len(dates))

    def ratio_ci(a):
        reps = (Wb @ a) / (Wb @ Bq)
        return float(a.sum() / Bq.sum()), *[float(x) for x in np.percentile(reps, [2.5, 97.5])]
    r0, l0, h0 = ratio_ci(A)
    bb = nud["base"]
    rep = same(r0, bb["ratio"]) and same(l0, bb["lo"]) and same(h0, bb["hi"])

    def plant_b(d):
        r1 = ratio_ci(A * (1 - d))[0]
        return {"injected": d, "shift": r0 - r1, "how": f"SRH pinball scaled by (1 - {d}) on every row"}
    sh = nud["shuffle_draw0"]
    pack("B", 1 - r0, 1 - h0, 1 - l0, 0.005, rep, plant_b(0.010), plant_b(0.005),
         {"effect": 1 - sh["ratio"], "lo": 1 - sh["hi"], "hi": 1 - sh["lo"], "one_sided": True,
          "how": "rv22m and hq moved in whole calendar months within instrument, full fold refit (placebo draw 0)"},
         int(m.sum()), int((~m).sum()), "pinball gain of S+RV+H over S+RV, 1 - ratio, folds 2-5, 2023-01 to 2026-08-20")
    for line in log:
        print(line)
    gates = {c["cell"]: c.get("gate") or {} for c in res["cells"]}
    for k, c in q.items():                                     # registered gate parts (lag, plateau, years, placebo, Holm): a failure demotes only
        cell = [x for x, y in QID.items() if y == k][0]
        c["gate_parts"] = {g: v for g, v in gates[cell].items() if g in ("holm", "plateau", "lag1", "years_3_of_4", "placebo")}
    out = {k: {**c, **G.decide(c)} for k, c in q.items()}
    bad = []
    for k, c in out.items():
        cell = [x for x, y in QID.items() if y == k][0]
        flag = "" if c["verdict"] == banked[cell] else f"   <-- results.json says {banked[cell]}"
        print(f"  {k}: {c['verdict']:13s} power {None if c['power'] is None else round(c['power'], 2)}  {c['reasons'][0]}{flag}")
        c["banked_word"] = banked[cell]
        if c["verdict"] in ("INVALID", "INCOMPLETE") or c["verdict"] != banked[cell]:
            bad.append(k)
    name = "checks.json" if not bad else "checks_MISMATCH_do_not_commit.json"
    (OUT / name).write_text(json.dumps(out, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("wrote", name, "mismatch:", bad)


if __name__ == "__main__":
    main()
