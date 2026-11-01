"""Registered disaggregation (prereg section 6): slope by New York hour for h = 5 and 15, Benjamini-Hochberg at q = 0.10 over the 14 cells.
Run AFTER score.py; reuses its functions. Seed 20261101, B = 500 per cell (slices are small). Candidates only, never results."""
import json, os, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as S

days = S.load_days(); df = S.build(days); rng = np.random.default_rng(S.SEED + 1)
cells = []
for hr in range(9, 16):
    sub = df[(df.i * 5 + 570) // 60 == hr]
    for h in (5, 15):
        est = S.slope(sub, None, h)[0]; bt = S.block_boot(sub, h, "D", 500, rng); lo, hi = np.percentile(bt, [2.5, 97.5])
        cells.append(dict(hour=hr, h=h, slope=float(est), ci=[float(lo), float(hi)], p=float(S.p_from_ci(est, lo, hi))))
ps = sorted(c["p"] for c in cells); m = len(ps)
thr = max([q for i, q in enumerate(ps, 1) if q <= 0.10 * i / m], default=None)
for c in cells: c["bh_pass"] = thr is not None and c["p"] <= thr
chance = 14 * 0.10
out = dict(cells=cells, bh_survivors=[c for c in cells if c["bh_pass"]], expected_false_at_q=chance)
(S.OUT / "hours_bh.json").write_text(json.dumps(out, indent=1))
for c in cells: print(c["hour"], c["h"], f'{c["slope"]:+.3f}', f'p={c["p"]:.3f}', "BH-pass" if c["bh_pass"] else "")
