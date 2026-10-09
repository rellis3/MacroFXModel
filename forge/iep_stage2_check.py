"""iep_stage2_check — completes the registered Stage 2 criteria that iep_stage2.py left uncomputed or ambiguous.
No new hypothesis, interaction or threshold: (1) constant-forecast references for the ladder (the 50/50 sign-flip null for
CONT|res; the training-period pooled share for CONS / RACE); (2) halves + instrument consistency for A10's selected
sub-test; (3) cell tables (share, n, CI, halves) for the Family B interactions that passed FDR, so effect sizes are read
from cells with their support rather than from single interaction coefficients.
    python -m forge.iep_stage2_check
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.iep_stage2 import load, ols_cr1, HALF, SUM


def share_ci(y, dates):
    y = np.asarray(y, float)
    b, V, G = ols_cr1(y, np.ones((len(y), 1)), np.asarray(dates))
    se = np.sqrt(V[0, 0])
    return 100 * b[0], 100 * 1.96 * se


def main():
    d = load()
    v = d[d.val]
    tr = d[~d.val]
    out = ["# INTRADAY-EXTREME-PATHS - Stage 2 completion checks (registered criteria only)", ""]
    # (1) constant references
    res, nam = v[v.lab.isin(["CONT", "REV"])], v[v.lab != "AMB"]
    pc = tr[tr.lab != "AMB"].lab.value_counts(normalize=True)
    p_cons = pc["CONS"]
    yc = (nam.lab == "CONS").astype(float)
    brier_cons_const = float((2 * (p_cons - yc) ** 2).mean())
    ll_cons_const = float(-(yc * np.log(p_cons) + (1 - yc) * np.log(1 - p_cons)).mean())
    q = np.array([pc.get("CONT", 0), pc.get("REV", 0), pc.get("CONS", 0)])
    Y = np.eye(3)[nam.lab.map({"CONT": 0, "REV": 1, "CONS": 2}).to_numpy()]
    brier_race_const = float(((q - Y) ** 2).sum(1).mean())
    ll_race_const = float(-(Y * np.log(q)).sum(1).mean())
    out += ["## 1. Constant-forecast references (compare with the ladder tables in STAGE2.md)", "```",
            "CONT|res : constant 50/50          brier 0.50000  logloss 0.69315",
            f"CONS     : constant {p_cons:.4f} (train share) brier {brier_cons_const:.5f}  logloss {ll_cons_const:.5f}",
            f"RACE     : constant train shares {np.round(q, 4).tolist()} brier {brier_race_const:.5f}  logloss {ll_race_const:.5f}", "```", ""]
    # (2) A10 selected sub-test halves + instruments: VIX tercile high vs low on CONS
    m = nam.vix_s.isin([0, 2])
    s = nam[m].assign(y=(nam[m].lab == "CONS").astype(float), hi=(nam[m].vix_s == 2))
    def eff(g):
        return 100 * (g[g.hi].y.mean() - g[~g.hi].y.mean())
    h1 = s.date < HALF
    signs = [np.sign(eff(g)) for _, g in s.groupby("inst") if g.hi.sum() >= 50 and (~g.hi).sum() >= 50]
    out += ["## 2. A10 selected sub-test (VIX high vs low tercile on CONS): halves and instruments", "```",
            f"pooled {eff(s):+.2f}pp  half1 {eff(s[h1]):+.2f}  half2 {eff(s[~h1]):+.2f}  "
            f"instruments with the pooled sign {100 * np.mean(np.array(signs) == np.sign(eff(s))):.0f}% of {len(signs)}",
            "VIX tercile dates in Validation: " + str(s.groupby('hi').date.nunique().to_dict()), "```", ""]
    # (3) Family B cells for interactions that passed FDR
    labels = {"pb_s": {0: "F<=.15", 1: "S.15-.5", 2: "M.5-1", 3: "D>1"}, "age_s": {0: "<60m", 1: "60-180m", 2: ">180m"},
              "reg_s": {0: "quiet", 1: "normal", 2: "busy"}, "used_s": {0: "low", 1: "mid", 2: "high"}, "disp_s": {0: "low", 1: "mid", 2: "high"},
              "mom_s": {0: "low", 1: "mid", 2: "high"}}
    passed = [("pb_s", "age_s", "CONT|res"), ("reg_s", "used_s", "CONT|res"), ("disp_s", "reg_s", "CONT|res"),
              ("pb_s", "age_s", "CONS"), ("pb_s", "band", "CONS"), ("used_s", "band", "CONS"), ("mom_s", "pb_s", "CONS")]
    for a, b, o in passed:
        base = res if o == "CONT|res" else nam
        y = (base.lab == ("CONT" if o == "CONT|res" else "CONS")).astype(float)
        rows = []
        for (ka, kb), g in base.assign(y=y).groupby([a, b]):
            if str(ka) == "-1" or str(kb) == "-1":
                continue
            sh, ci = share_ci(g.y, g.date) if len(g) >= 30 else (np.nan, np.nan)
            h = g.date < HALF
            rows.append({a: labels.get(a, {}).get(ka, ka), b: labels.get(b, {}).get(kb, kb), "n": len(g), "dates": g.date.nunique(),
                         f"{o}%": round(sh, 1), "±ci": round(ci, 1), "half1%": round(100 * g[h].y.mean(), 1) if h.sum() else np.nan,
                         "half2%": round(100 * g[~h].y.mean(), 1) if (~h).sum() else np.nan})
        out += [f"## 3. {a} x {b} on {o} (Validation cells; pooled {100 * y.mean():.1f}%)", "```", pd.DataFrame(rows).to_string(index=False), "```", ""]
    (SUM / "STAGE2_CHECK.md").write_text("\n".join(out), encoding="utf-8")
    print("\n".join(out).encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
