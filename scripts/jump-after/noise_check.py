"""Noise check for jump-after (follow-up, descriptive, not scored).

Question: is the 5-minute give-back after OWN bursts (fewer than 3 instruments bursting together) a spread blow-out
snapping back (Lee-Mykland 2012 noise), rather than market behaviour?

Written before the split was looked at:
- Spread ratio = the bid/ask spread at the end of the burst bar / the median spread of that instrument's control
  moments in the same London hour (main read, 01:00-21:00).
- Thirds of the spread ratio over all main-read bursts.
- If the give-back is noise: it sits in the widest third of own bursts and is about 0 in the normal third,
  and own bursts have wider spreads than market-wide ones.
- If it is behaviour: the give-back is about the same in every third.
Date-block bootstrap (LR.Boot, B = 2000). Lockbox: events stop 2026-08-20.

    python scripts/jump-after/noise_check.py  ->  analysis/output/jump-after/noise_check.{json,md}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/jump-after")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402

OUT = ROOT / "analysis/output/jump-after"
HZ = ["m5", "m15", "m60"]


def main():
    E = pd.read_parquet(OUT / "events.parquet")
    E = E[E.ver == "x"]
    norm = E[E.kind == "control"].groupby(["inst", "hour"]).spread0.median().rename("sp_norm")
    F = E[(E.kind == "flag") & E.m5.notna() & E.spread0.notna()].join(norm, on=["inst", "hour"])
    F["cojump"] = F.groupby(["date", "slot"]).inst.transform("size")
    F["grp"] = np.where(F.cojump >= 3, "market-wide", "own")
    F["ratio"] = F.spread0 / F.sp_norm
    cuts = np.nanpercentile(F.ratio, [100 / 3, 200 / 3])
    F["third"] = pd.cut(F.ratio, [-np.inf, *cuts, np.inf], labels=["normal", "middle", "wide"])
    bs = LR.Boot(F.date)
    rows = []
    for (g, t), part in F.groupby(["grp", "third"], observed=True):
        r = {"group": g, "third": str(t), "n": int(len(part)), "ratio_median": round(float(part.ratio.median()), 2)}
        for h in HZ:
            p = part[part[h].notna()]
            r[h] = bs.mean(p.date, p[h].to_numpy(float))[0]
        rows.append(r)
    share = F.groupby("grp").apply(lambda d: {"n": int(len(d)), "wide_share": round(float((d.third == "wide").mean()), 3),
                                              "ratio_median": round(float(d.ratio.median()), 2)}).to_dict()
    # difference wide - normal for own bursts at 5 minutes, bootstrapped on the same dates
    o = F[F.grp == "own"]
    w, n_ = o[o.third == "wide"], o[o.third == "normal"]
    a = bs.sums(w.date, w.m5.to_numpy(float)); ca = bs.sums(w.date, np.ones(len(w)))
    b = bs.sums(n_.date, n_.m5.to_numpy(float)); cb = bs.sums(n_.date, np.ones(len(n_)))
    reps = (bs.W @ a) / (bs.W @ ca) - (bs.W @ b) / (bs.W @ cb)
    diff = [round(float(a.sum() / ca.sum() - b.sum() / cb.sum()), 4), *[round(float(v), 4) for v in np.nanpercentile(reps, [2.5, 97.5])]]
    res = {"cuts": [round(float(c), 3) for c in cuts], "groups": share, "cells": rows, "own_wide_minus_normal_m5": diff}
    (OUT / "noise_check.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    md = ["# jump-after noise check (descriptive)", "",
          f"Spread ratio thirds cut at {res['cuts'][0]}x and {res['cuts'][1]}x the normal spread for that instrument and hour.", "",
          "| Group | Spread third | n | Median ratio | 5 min | 15 min | 60 min |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['group']} | {r['third']} | {r['n']} | {r['ratio_median']} | " + " | ".join(f"{r[h][0]:+.3f} [{r[h][1]:+.3f}, {r[h][2]:+.3f}]" for h in HZ) + " |")
    md += ["", f"Own, wide minus normal at 5 min: {diff[0]:+.4f} [{diff[1]:+.4f}, {diff[2]:+.4f}]", "",
           "Wide-third share: " + ", ".join(f"{k} {v['wide_share']:.0%} (median ratio {v['ratio_median']})" for k, v in share.items())]
    (OUT / "noise_check.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md).encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
