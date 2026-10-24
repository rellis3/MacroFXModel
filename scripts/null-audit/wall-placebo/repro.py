"""Step 2 REPRODUCE: run the banked 17_wall_placebo.py unchanged, outputs redirected.
    python scripts/null-audit/wall-placebo/repro.py build PAIR
    python scripts/null-audit/wall-placebo/repro.py report
Run from repo root (17/05 use repo-relative data paths)."""
import sys, os, importlib.util
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
SC = ROOT / "oi_research_book" / "scripts"
sys.path.insert(0, str(SC))
OUT = "analysis/output/null-audit/wall-placebo/repro"
M1 = {"EUR_USD": "eurusd", "GBP_USD": "gbpusd", "AUD_USD": "audusd", "USD_CAD": "usdcad",
      "USD_CHF": "usdchf", "USD_JPY": "usdjpy", "NAS100_USD": "nas100_usd"}


def load17():
    spec = importlib.util.spec_from_file_location("s17", str(SC / "17_wall_placebo.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    m.RES = OUT
    # the banked run predates the SPX500_USD row added to pair_config on 2026-10-20
    m.PAIR_CONFIG = {k: v for k, v in m.PAIR_CONFIG.items() if k in M1}
    return m


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    argv = sys.argv[:]
    m = load17()
    if argv[1] == "build":
        p = argv[2]
        m.build(p, f"VolRangeForecaster/data/m1/{M1[p]}_m1.parquet")
    else:
        m.report()
