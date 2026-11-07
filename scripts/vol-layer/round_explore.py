"""EXPLORATORY, not pre-registered: the opposite-sign round-number effect in vol-layer-round-numbers, audited.

Follow = enter at the level on touch, target K beyond, stop K back, marked at the horizon. Ambiguous = loss.
    python scripts/vol-layer/round_explore.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
from reaction import cost_sigma  # noqa: E402
from round_numbers import GEOM, LINES, OUT, weigh  # noqa: E402


def follow(d, g):
    K = GEOM[g][0]
    oc = d[f"out_{g}"].to_numpy()
    return np.select([oc == "break", np.isin(oc, ["reject", "ambiguous"])], [1.0, -1.0], np.clip(d[f"x_{g}"].to_numpy() / K, -1, 1))


D = pd.read_parquet(OUT / "events.parquet")
bs = LR.Boot(pd.read_csv(LINES, usecols=["date"]).date)
cost = cost_sigma()
D["cost_G1"] = D.inst.map(cost) / (D.open * D.sig / 100 * 0.25)
D["pf"] = follow(D, "G1")
D["year"] = D.date.str[:4]
M = D[D.klass == "fx_majors"]
md = ["# Round numbers: exploratory audit (not pre-registered, describes only)", ""]

md += ["## FX majors, P(reject | resolved), G1, by instrument", "", "| inst | 00 | 50 | arbitrary | n 00 | spread (K) |", "|---|---|---|---|---|---|"]
for i, g in M.groupby("inst"):
    r = g[g.out_G1.isin(["reject", "break"])]
    p = r.groupby("grid").out_G1.apply(lambda s: (s == "reject").mean())
    md.append(f"| {i} | {p['00']:.3f} | {p['50']:.3f} | {p['arb']:.3f} | {(r.grid == '00').sum()} | {g.cost_G1.mean():.3f} |")

md += ["", "## FX majors by year, 00 and 50 pooled vs arbitrary, reject rate and follow in K", "", "| year | reject round | reject arb | follow gross round | follow gross arb | follow net round |", "|---|---|---|---|---|---|"]
M2 = M.assign(rnd=M.grid != "arb")
for y, g in M2.groupby("year"):
    r = g[g.out_G1.isin(["reject", "break"])]
    a, b = g[g.rnd], g[~g.rnd]
    md.append(f"| {y} | {(r[r.rnd].out_G1 == 'reject').mean():.3f} | {(r[~r.rnd].out_G1 == 'reject').mean():.3f} | {a.pf.mean():+.3f} | {b.pf.mean():+.3f} | {(a.pf - a.cost_G1).mean():+.3f} |")

md += ["", "## Follow at the level, G1, in K, date-block 95%", "", "| group | n | gross | net of one spread | net of 1.5 spreads |", "|---|---|---|---|---|"]
for name, g in (("majors 00", M[M.grid == "00"]), ("majors 50", M[M.grid == "50"]), ("majors arbitrary", M[M.grid == "arb"]),
                ("majors 00 and 50, day of first half", M[(M.grid != "arb") & (M.date < "2023-08-20")]), ("majors 00 and 50, second half", M[(M.grid != "arb") & (M.date >= "2023-08-20")]),
                ("crosses 00", D[(D.klass == "fx_crosses") & (D.grid == "00")]), ("indices 00", D[(D.klass == "indices") & (D.grid == "00")]), ("gold 00", D[(D.klass == "gold") & (D.grid == "00")])):
    a, b, c = bs.mean(g.date, g.pf.to_numpy())[0], bs.mean(g.date, (g.pf - g.cost_G1).to_numpy())[0], bs.mean(g.date, (g.pf - 1.5 * g.cost_G1).to_numpy())[0]
    md.append(f"| {name} | {len(g):,} | {a[0]:+.3f} [{a[1]:+.3f}, {a[2]:+.3f}] | {b[0]:+.3f} [{b[1]:+.3f}, {b[2]:+.3f}] | {c[0]:+.3f} [{c[1]:+.3f}, {c[2]:+.3f}] |")

# Same-session pairing: on a day a major touched both a round and an arbitrary level, same side
md += ["", "## Audit: outcome mix, FX majors G1", "", "| grid | reject | break | ambiguous | timeout | instant-style share of break unknown |", "|---|---|---|---|---|---|"]
for k, g in M.groupby("grid"):
    v = g.out_G1.value_counts(normalize=True)
    md.append(f"| {k} | {v.get('reject', 0):.3f} | {v.get('break', 0):.3f} | {v.get('ambiguous', 0):.3f} | {v.get('timeout', 0):.3f} | |")

# Does the gap depend on the placebo fraction? If one arbitrary fraction is odd, the comparison is the artefact.
S = M[M.grid == "arb"].copy()
(OUT / "EXPLORATORY.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md))
