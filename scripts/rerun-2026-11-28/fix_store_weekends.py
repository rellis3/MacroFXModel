"""harness-weekend-rows re-run, step 1: a fixed copy of the feature store in THIS worktree.

Copies the main checkout's features/*.parquet (read-only source) into <worktree>/features/ and applies
build_features.drop_weekend_rows to every px_d1_* file -- the same filter the builder now applies at fetch
time -- so the harness re-runs on the fixed store without re-fetching from OANDA or writing to the main checkout.
"""
import shutil, sys, json
from pathlib import Path
import pandas as pd, pyarrow as pa, pyarrow.parquet as pq
WT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WT / "analysis/features"))
import build_features as BF  # noqa: E402
SRC = Path(r"C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel/features")
DST = WT / "features"
DST.mkdir(exist_ok=True)
audit = {}
for f in sorted(SRC.glob("*.parquet")):
    shutil.copy2(f, DST / f.name)
    if f.name.startswith("px_d1_"):
        df = pd.read_parquet(f)
        kept = pd.DataFrame(BF.drop_weekend_rows(df.to_dict("records")), columns=df.columns)
        pq.write_table(pa.Table.from_pandas(kept, preserve_index=False), DST / f.name, compression="snappy")
        audit[f.stem] = {"rows_before": len(df), "rows_after": len(kept), "dropped": len(df) - len(kept)}
print(json.dumps(audit, indent=1))
json.dump(audit, open(WT / "analysis/output/rerun-2026-11-28/store_weekend_drop.json", "w"), indent=1)
