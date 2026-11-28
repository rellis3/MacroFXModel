"""Re-run of residual-pca-cot (T3) on the fixed tags.py (DATA_SPEC §5 #16), same prereg, same seed.

Runs only the fx8 universe and the registered T3 cell + tag-shift placebo + masked book, using the
family's own functions unchanged. Writes analysis/output/rerun-2026-11-28/residual_pca_cot.json.
"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
FAM = os.path.join(HERE, "..", "residual-pca-family")
sys.path.insert(0, FAM)
import run_family as R  # noqa: E402  (seeded rng at import, SEED = 20261031)
E, T = R.E, R.T

F = R.run_universe("fx8", 1)
cr = T.crowd_tags(F["disp"].index)
sg = np.sign(F["disp"])
valid3 = cr.notna().all(axis=1)
A3 = (cr != 0) & cr.notna() & (sg == cr)
B3 = cr == 0
M3 = (cr != 0) & cr.notna() & (sg == -cr)
res, _ = R.contrast_test("T3 COT: displacement aligned with an extreme crowd (A) minus neutral (B)", F, A3, B3, valid3, mirror=M3)
cv, sv = cr.values, sg.values
def build3(k, keep):
    sh = np.roll(cv, k, axis=0)
    a_ = ((sh != 0) & np.isfinite(sh) & (sv == sh))[keep].astype(float)
    b_ = (sh == 0)[keep].astype(float)
    return a_, b_
res["placebo_tag_shift"], _ = R.tag_shift_placebo(F, build3, valid3)
_, _, recm3 = E.walk(F["x"], F["r"], F["K"], T.COST, mask=A3)
res["book_masked_to_A"] = R.book_perf(recm3)
out = {"seed": R.SEED, "prereg": "forge/RESIDUAL_PCA_FAMILY_PREREG.md", "rerun": "2026-11-28, fixed tags.py (DATA_SPEC 5 #16)",
       "note": "fx8 + T3 only; the family run also drew T1/T2/T4/T5 from the same rng before T3, so bootstrap draws differ from a full-family run",
       "T3_cot": res}
p = os.path.join(HERE, "..", "..", "analysis/output/rerun-2026-11-28/residual_pca_cot.json")
json.dump(out, open(p, "w"), indent=1, default=str)
print(json.dumps({k: res.get(k) for k in ["nA", "nB", "D_full", "se_full", "p_one_sided", "D_IS", "D_OOS", "candidate", "placebo_tag_shift"]}, default=str))
