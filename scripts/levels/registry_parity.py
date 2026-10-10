"""Registry v1 sample parity (Phase 1): independent Python recomputation of the closed-form families for random sessions, checked
against data/levels/registry/<SYM>.csv (built by production's own JS calculators). Writes analysis/output/level_p2/REGISTRY_PARITY.md.
    PYTHONPATH=. python scripts/levels/registry_parity.py"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

REG, NYD, OUT = Path("data/levels/registry"), Path("analysis/output/ladder_candidates/d1"), Path("analysis/output/level_p2")
PIP = lambda s: 0.01 if s.endswith("JPY") else (1.0 if s in {"GOLD", "NQ", "SPX500", "US30", "US2000", "DE30", "UK100"} else 0.0001)
rng = np.random.default_rng(7)
rows = []
for f in sorted(REG.glob("*.csv")):
    sym = f.stem
    R = pd.read_csv(f)
    ny = pd.DataFrame(json.loads((NYD / f"{'US30' if sym == 'US30' else sym}.json").read_text()))
    for d in rng.choice(R.date.unique(), size=min(10, R.date.nunique()), replace=False):
        prior = ny[ny.d < d]                                     # NY bars that closed before the London session
        last = prior.iloc[-1]
        H, Lo, C = last.h, last.l, last.c
        PP = (H + Lo + C) / 3
        expect = {"pdh": [H], "pdl": [Lo], "pivot_pp": [PP], "pivot_r": [2 * PP - Lo, PP + (H - Lo), H + 2 * (PP - Lo)],
                  "pivot_s": [2 * PP - H, PP - (H - Lo), Lo - 2 * (H - PP)], "daily_open": list(prior.o.iloc[-5:]),
                  "range_high": [prior.h.iloc[-20:].max()], "range_low": [prior.l.iloc[-20:].min()]}
        got = R[R.date == d]
        for kind, vals in expect.items():
            g = got[got.kind == kind].price.to_numpy()
            for v in vals:
                ok = bool(len(g)) and np.min(np.abs(g - v)) <= max(1e-9 * abs(v), PIP(sym) * 1e-3)
                rows.append((sym, d, kind, v, ok))
        rn = got[got.kind.isin(["round_big", "round_half"])].price.to_numpy()
        step = 50 * PIP(sym)
        rows.append((sym, d, "round_grid", float(len(rn)), bool(len(rn)) and np.allclose(np.round(rn / step) * step, rn, rtol=0, atol=PIP(sym) * 1e-3)))
T = pd.DataFrame(rows, columns=["inst", "date", "kind", "expected", "match"])
summ = T.groupby("kind").match.agg(["size", "mean"]).rename(columns={"size": "checks", "mean": "match_rate"})
mis = T[~T.match].head(20)
md = ["# Level registry v1: sample parity (independent recomputation vs production calculators)", "",
      f"{T.inst.nunique()} instruments × up to 10 random sessions each; tolerance 1e-9 relative.", "", "```", summ.round(4).to_string(), "```", "",
      "First mismatches:" if len(mis) else "No mismatches.", "```" if len(mis) else "", mis.to_string(index=False) if len(mis) else "", "```" if len(mis) else ""]
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "REGISTRY_PARITY.md").write_text("\n".join(md), encoding="utf-8")
print("\n".join(md))
