"""Export the research M1 cache to flat binaries for the JS registry builder (JS parquet decoding needs ~2 GB and ~4 min per instrument).
Layout data/levels/m1bin/<SYM>.bin: int32 n, then n x int32 epoch-seconds, then 5 x n float64 (open, high, low, close, volume). Same source file
as js/volBacktestM1Engine.js loadM1ForPair (VolRangeForecaster/data/m1/<key>_m1.parquet)."""
import sys
from pathlib import Path
import numpy as np, pandas as pd
from forge.iep_build import JOBS, M1
OUT = Path("data/levels/m1bin"); OUT.mkdir(parents=True, exist_ok=True)
for sym in (sys.argv[1:] or list(JOBS)):
    df = pd.read_parquet(M1 / f"{JOBS[sym]}_m1.parquet")
    df = df[~df.index.duplicated(keep="first")].sort_index()
    t = (df.index.asi8 // 10**9).astype(np.int32)
    vol = df["volume"].to_numpy(float) if "volume" in df else np.ones(len(df))
    with open(OUT / f"{sym}.bin", "wb") as f:
        np.array([len(df)], np.int32).tofile(f); t.tofile(f)
        for c in ("open", "high", "low", "close"): df[c].to_numpy(np.float64).tofile(f)
        np.nan_to_num(vol, nan=1.0).astype(np.float64).tofile(f)
    print(sym, len(df), flush=True)
