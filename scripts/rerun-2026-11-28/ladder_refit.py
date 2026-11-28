"""Re-run of ladder-event-multipliers (DATA_SPEC §5 #15): the same walk-forward that produced
forge/out_vol_lon/vol_report.json (commit cf266651: london22, 10y, 6 folds, FF calendar 2007-2025, M1 to
2026-08-20), now on the fixed forge/vol.py (London-date tag lookup + weekend-stub filter).

Side by side: writes the report and a candidate params module under analysis/output/rerun-2026-11-28/ladder/.
It does NOT touch js/forecastLadderParams.js (live).
Reads the gitignored M1 caches and calendar from the main checkout, read-only.
"""
import sys
from pathlib import Path
WT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WT))
MAIN = Path(r"C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
from forge import vol as V, run_vol as RV  # noqa: E402

_orig = V.discover_full_universe
V.discover_full_universe = lambda fx_root=None, index_root=None: _orig(fx_root, str(MAIN / "portfolioBacktest/cache"))
# Same estimator set as the live fit (cf266651). har_rv_log joined forge's candidates on 2026-09-15 (cdd63ddd),
# after the live params were fitted; leaving it in changes the estimator everywhere and confounds the tag fix.
# `--with-har` keeps it (written to ladder_with_har/, for information only).
WITH_HAR = "--with-har" in sys.argv
if not WITH_HAR:
    V.ESTIMATORS.pop("har_rv_log", None)
    V.design_vol.__defaults__ = (tuple(V.ESTIMATORS),)
OUT = WT / ("analysis/output/rerun-2026-11-28/" + ("ladder_with_har" if WITH_HAR else "ladder"))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
pairs = args[0] if args else ""
RV.main(["--years", "10", "--folds", "6", "--data-root", str(MAIN / "VolRangeForecaster/data/m1"),
         "--calendar", str(MAIN / "data/calendar/ff_calendar_2007_2025.csv"), "--out", str(OUT),
         "--verbose-pairs", "", "--pairs", pairs])
