"""Step 3 PLANT through the ORIGINAL pipeline: write planted M1 files (a fraction F of the banked design's wall
touches has its next 240 bars mirrored to the reject side), then run the unmodified 17_wall_placebo.py build+report
on them with outputs redirected.
    python scripts/null-audit/wall-placebo/plant17.py F PLANT_MODE SCRATCH_DIR
"""
import sys, os, importlib.util
import numpy as np
import pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import reimpl as R

F = float(sys.argv[1]); PM = set(sys.argv[2].split(",")); SCR = sys.argv[3]
OUT = f"analysis/output/null-audit/wall-placebo/plant17_{F}_{sys.argv[2].replace(',', '+')}"
os.makedirs(OUT, exist_ok=True); os.makedirs(SCR, exist_ok=True)
rng = np.random.default_rng(20261024)
n_planted = {}
for pair in R.PAIRS:
    raw = pd.read_parquet(f"VolRangeForecaster/data/m1/{R.M1F[pair]}_m1.parquet")
    m1 = R.load_m1(pair)
    assert (pd.to_datetime(raw.index).tz_convert("UTC").tz_localize(None).values == m1["ts"].values).all()
    pip = R.PAIR_CONFIG[pair]["pip_size"]
    H, Lo, C = m1["high"].values.copy(), m1["low"].values.copy(), m1["close"].values.copy()
    Lp = R.levels(pair, PM, set(pd.to_datetime(m1["date"].unique())))
    st, en, rows = R.segments(m1, Lp, PM)
    pidx, pW, ps, pe = [], [], [], []
    for side, sgn in (("call", 1), ("put", -1)):
        Wd = Lp[f"{side}_wall"].values[rows]
        idx, seg = R.detect(H, Lo, C, st, en, Wd, sgn, 2 * pip, 5 * pip)
        pick = rng.random(len(idx)) < F
        pidx.append(idx[pick]); pW.append(Wd[seg[pick]]); ps.append(np.full(pick.sum(), sgn)); pe.append(en[seg[pick]])
    pidx = np.concatenate(pidx); o = np.argsort(pidx)
    R.pullback(H, Lo, C, pidx[o], np.concatenate(pW)[o], np.concatenate(ps)[o], np.concatenate(pe)[o], R.PLANT_BARS)
    n_planted[pair] = int(len(pidx))
    out = raw.copy(); out["high"] = H; out["low"] = Lo; out["close"] = C
    out.to_parquet(f"{SCR}/{R.M1F[pair]}_m1.parquet")
print("planted", n_planted, flush=True)

SC = "oi_research_book/scripts"; sys.path.insert(0, SC)
spec = importlib.util.spec_from_file_location("s17", f"{SC}/17_wall_placebo.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.RES = OUT; m.PAIR_CONFIG = {k: v for k, v in m.PAIR_CONFIG.items() if k in R.PAIRS}
for pair in R.PAIRS:
    m.build(pair, f"{SCR}/{R.M1F[pair]}_m1.parquet")
m.report()
