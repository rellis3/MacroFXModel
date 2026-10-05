"""Fit + export the widths for the REVERTING weekly/monthly ladder (HORIZON-REVERSION, PASS 2026-10-05).

Arm B of forge/HORIZON_REVERSION_PREREG.md: sigma_h^2 = sum_{k<h} [Vbar + phi^k (sigma_t^2 - Vbar)],
phi = 0.5^(1/HL), HL frozen from the pre-registered run (weekly 5, monthly 10), Vbar = trailing-250
mean of the forecast-ready daily sigma^2.

Two outputs:
  1. js/forecastLadderRevertingParams.js — widths for all 12 rungs, fitted on ALL windows (the
     forward-looking export, same as forecastLadderParams' last fold).
  2. analysis/output/horizon_reversion/ALL_RUNGS_OOS.md — the pre-registered test scored only H-L
     p50/p75. Before exporting O-C / O-H / O-L and p90 too, every rung is checked out of sample
     (first 60% fit, last 40% scored) for both arms, so nothing ships untested.

    python -m forge.export_reverting_horizon_params
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_horizon_reversion import FORGE_KEY, TRAIN_FRAC, VBAR_WIN, daily_for, horizon_sigma, ladder_estimators

HL_FROZEN = {"weekly": 5, "monthly": 10}              # chosen on train in the pre-registered run
SPAN_STEP = {"weekly": (5, 5), "monthly": (20, 1)}
QUANT = ("hl", "oc", "oh", "ol")
TAUS = (0.50, 0.75, 0.90)
OUT_JS = Path("js/forecastLadderRevertingParams.js")
OUT_MD = Path("analysis/output/horizon_reversion/ALL_RUNGS_OOS.md")


def windows_all(daily: pd.DataFrame, sig_d: np.ndarray, span: int, step: int) -> pd.DataFrame | None:
    o, h, l, c = (daily[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    vbar = pd.Series(sig_d ** 2).rolling(VBAR_WIN, min_periods=VBAR_WIN // 2).mean().to_numpy()
    rows = []
    for s in range(0, len(daily) - span + 1, step):
        st, vb = sig_d[s], vbar[s]
        if not (np.isfinite(st) and st > 0 and np.isfinite(vb) and vb > 0 and o[s] > 0):
            continue
        hi, lo, op, cl = h[s:s + span].max(), l[s:s + span].min(), o[s], c[s + span - 1]
        rows.append((st, vb, (hi - lo) / op * 100, abs(cl - op) / op * 100, (hi - op) / op * 100, (op - lo) / op * 100))
    return pd.DataFrame(rows, columns=["sig", "vbar", "hl", "oc", "oh", "ol"]) if rows else None


def fit(w: pd.DataFrame, sh: np.ndarray) -> dict:
    return {q: [round(V.fit_width_multiplier(sh, w[q].to_numpy(), t), 4) for t in TAUS] for q in QUANT}


def main():
    est = ladder_estimators()
    params, oos = {}, {hz: {"A": {}, "B": {}} for hz in SPAN_STEP}
    for name, e in sorted(est.items()):
        d = daily_for(FORGE_KEY.get(name, name.lower()))
        if d is None:
            print("skip", name, "(no local M1)"); continue
        sig = V.as_of_yesterday(V.ESTIMATORS[e](d)) / V.SQRT252
        params[name] = {"estimator": e}
        for hz, (span, step) in SPAN_STEP.items():
            w = windows_all(d, sig, span, step)
            if w is None or len(w) < 100:
                continue
            shB = horizon_sigma(w, span, HL_FROZEN[hz])
            params[name][hz] = {"width": fit(w, shB), "n": int(len(w))}
            # OOS check on every rung, both arms
            n_tr = int(len(w) * TRAIN_FRAC)
            for arm, sh in (("A", horizon_sigma(w, span, None)), ("B", shB)):
                for q in QUANT:
                    act = w[q].to_numpy()
                    for t in TAUS:
                        m = V.fit_width_multiplier(sh[:n_tr], act[:n_tr], t)
                        acc = oos[hz][arm].setdefault(f"{q}_p{int(t * 100)}", [0, 0])
                        acc[0] += int((act[n_tr:] > m * sh[n_tr:]).sum()); acc[1] += len(act) - n_tr
        print(f"fitted {name}", flush=True)

    meta = {"generated": str(date.today()), "source": "forge/export_reverting_horizon_params.py",
            "prereg": "forge/HORIZON_REVERSION_PREREG.md", "half_life_days": HL_FROZEN, "vbar_window": VBAR_WIN,
            "session": "london22", "rungs": ["p50", "p75", "p90"]}
    body = json.dumps({**meta, "pairs": params}, indent=1)
    OUT_JS.write_text(
        "/**\n * Reverting weekly/monthly ladder widths. GENERATED — do not hand-edit.\n"
        " * Regenerate: python -m forge.export_reverting_horizon_params\n"
        " * sigma_h^2 = sum_{k<h} [Vbar + phi^k (sigma_t^2 - Vbar)], phi = 0.5^(1/HL), Vbar = trailing-250 mean of daily sigma^2.\n"
        " * Evidence: forge/HORIZON_REVERSION_PREREG.md (PASS weekly + monthly), all-rung OOS check in\n"
        " * analysis/output/horizon_reversion/ALL_RUNGS_OOS.md.\n */\n"
        f"export const REVERTING_PARAMS = {body};\n", encoding="utf-8")

    md = ["# Reverting ladder — out-of-sample exceedance on EVERY rung", "",
          "First 60% of windows fit, last 40% scored, pooled over instruments. Target: p50 50%, p75 25%, p90 10%.",
          "A = current √h ladder (own refit widths), B = reverting. The pre-registered test scored only H-L p50/p75; this table checks the rest before export.", ""]
    for hz in SPAN_STEP:
        md += [f"## {hz}", "", "| rung | target | A | B |", "|---|---|---|---|"]
        for k in sorted(oos[hz]["A"]):
            tgt = {"p50": 50, "p75": 25, "p90": 10}[k.split("_")[1]]
            a, b = oos[hz]["A"][k], oos[hz]["B"][k]
            md.append(f"| {k} | {tgt}% | {a[0] / a[1]:.1%} | {b[0] / b[1]:.1%} |")
        md.append("")
    OUT_MD.write_text("\n".join(md), encoding="utf-8")
    print("wrote", OUT_JS, "and", OUT_MD)


if __name__ == "__main__":
    main()
