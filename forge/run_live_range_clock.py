"""LIVE-RANGE-CLOCK (forge/LIVE_RANGE_CLOCK_BASELINE_PREREG.md): moving 3x3 lines vs the clock of the day alone.

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_clock
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of  # noqa: E402

O = Path("analysis/output/live_range_clock"); O.mkdir(parents=True, exist_ok=True)
TAUS = (0.5, 0.75, 0.9)
MIN_CELL = 30
LOG, RES = [], {}


def say(s=""):
    print(s, flush=True); LOG.append(s)


F = pd.read_parquet("analysis/output/live_range_wf/frame.parquet")
F["cls"] = F.inst.map(cls_of); F["R"] = F.U + F.Dn
F = F.dropna(subset=["used", "speed", "R"]).reset_index(drop=True)


def pin(y, p, t):
    d = y - p
    return np.where(d >= 0, t * d, (t - 1) * d)


def predict(tr_R, tr_cell, te_cell, ncell):
    """quantile forecasts per test row from train rows' cell; cells with < MIN_CELL fall back to the whole checkpoint."""
    out = np.zeros((len(te_cell), len(TAUS)))
    allq = np.quantile(tr_R, TAUS)
    for c in range(ncell):
        v = tr_R[tr_cell == c]
        q = np.quantile(v, TAUS) if len(v) >= MIN_CELL else allq
        out[te_cell == c] = q
    return out


rows = []
for cls in ("fx_gold", "indices"):
    C = F[F.cls == cls]
    split = C.date.quantile(0.6)
    for h in range(1, 22):
        Ch = C[C.h == h]
        tr, te = Ch[Ch.date < split], Ch[Ch.date >= split]
        if len(tr) < 500 or len(te) < 200:
            continue
        eu = np.quantile(tr.used, [1 / 3, 2 / 3]); es = np.quantile(tr.speed, [1 / 3, 2 / 3])
        cu_tr, cu_te = np.digitize(tr.used, eu), np.digitize(te.used, eu)
        cs_tr, cs_te = np.digitize(tr.speed, es), np.digitize(te.speed, es)
        arms = {
            "C": (np.zeros(len(tr), int), np.zeros(len(te), int), 1),
            "D": (cu_tr, cu_te, 3), "E": (cs_tr, cs_te, 3),
            "B": (cu_tr * 3 + cs_tr, cu_te * 3 + cs_te, 9),
        }
        y = te.R.to_numpy()
        loss = {}
        for nm, (ctr, cte, k) in arms.items():
            P = predict(tr.R.to_numpy(), ctr, cte, k)
            loss[nm] = sum(pin(y, P[:, i], t) for i, t in enumerate(TAUS))
        for nm in loss:
            te = te.assign(**{f"L{nm}": loss[nm]})
        g = te.groupby("inst")[["LB", "LC", "LD", "LE"]].mean()
        rows.append(dict(cls=cls, h=h, n=len(te),
                         **{f"{a}/C": float(np.median(g[f"L{a}"] / g.LC)) for a in "BDE"},
                         **{f"{a}_better": float((g[f"L{a}"] < g.LC).mean()) for a in "BDE"},
                         BvsD=float(np.median(g.LB / g.LD)), BvsE=float(np.median(g.LB / g.LE))))
R = pd.DataFrame(rows)
R["B_beats"] = (R["B/C"] < 0.99) & (R.B_better >= 0.60)
say("# LIVE-RANGE-CLOCK — results\n\nPre-registration: `forge/LIVE_RANGE_CLOCK_BASELINE_PREREG.md`. Test = last 40% of dates per class; "
    "median across instruments of the pinball ratio on remaining range R (below 1 = beats the clock-only forecast).\n")
for cls in ("fx_gold", "indices"):
    r = R[R.cls == cls]
    n = int(r.B_beats.sum())
    verdict = "ADDS INFORMATION BEYOND THE CLOCK" if n >= 14 else "THE MOVING LINE IS A CLOCK"
    say(f"## {cls}: B beats the clock at **{n}/{len(r)}** checkpoints → **{verdict}**\n")
    say("| London | B÷C | B better | D (used only)÷C | E (pace only)÷C | B÷D | B÷E | B beats clock |"); say("|---|---|---|---|---|---|---|---|")
    for _, x in r.iterrows():
        say(f"| {int(x.h):02d}:00 | {x['B/C']:.3f} | {x.B_better:.0%} | {x['D/C']:.3f} | {x['E/C']:.3f} | {x.BvsD:.3f} | {x.BvsE:.3f} | {'✓' if x.B_beats else '✗'} |")
    for lo, hi, nm in ((1, 7, "01-07"), (8, 14, "08-14"), (15, 21, "15-21")):
        s = r[(r.h >= lo) & (r.h <= hi)]
        say(f"\n{nm}: median B÷C {s['B/C'].median():.3f}, D÷C {s['D/C'].median():.3f}, E÷C {s['E/C'].median():.3f}")
    say("")
    RES[cls] = dict(beats=n, of=len(r), verdict=verdict, table=r.to_dict("records"))
(O / "results.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS.md").write_text("\n".join(LOG), encoding="utf-8")
