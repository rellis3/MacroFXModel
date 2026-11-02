import sys, warnings; warnings.filterwarnings("ignore")
sys.path.insert(0, "scripts/forecast_history"); sys.path.insert(0, ".")
import vf3_stage_b as V
T = V.build(V.load())
n = T[T.inst == "NQ"].copy()
cols = ["date", "inst", "oos", "fold", "pit_sig_used", "sig_S", "sig_SI"] + [c for c in n.columns if c[:2] in ("S_", "SI") or c.startswith("P_")]
n[cols].to_parquet(sys.argv[1]); print(len(n), n.date.min(), n.date.max(), n.sig_SI.notna().mean())
