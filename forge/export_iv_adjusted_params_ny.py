"""IV-adjusted ladder refit on NY-close daily bars (side by side; DATA_SPEC fault 1).

forge/export_iv_adjusted_params.py fitted the shipped js/forecastLadderIvAdjParams.js on
VolRangeForecaster/data/m1/*_d1.parquet — UTC-midnight days with Sunday stubs — while live feeds it OANDA NY-close bars.
This reruns the identical procedure with the daily bars built the live way (NY-close sessions from M1, n >= 60;
analysis/output/ladder_candidates/d1/<NAME>.json from scripts/rangebook/ny_close_d1.mjs) and writes NEW files only:
js/forecastLadderIvAdjParamsNY.js and analysis/output/iv_adjusted/CALIBRATION_NY.md. The shipped export is untouched.
    python -m forge.export_iv_adjusted_params_ny
"""
import json
from pathlib import Path

import pandas as pd

import forge.export_iv_adjusted_params as X

D1J = Path("analysis/output/ladder_candidates/d1")


def d1_ny(name: str) -> pd.DataFrame:
    rows = json.loads((D1J / f"{name}.json").read_text())
    b = pd.DataFrame(rows)
    b.index = pd.to_datetime(b.pop("d"))
    return b.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close"})[["open", "high", "low", "close"]]


X.d1 = d1_ny
X.OUT_JS = Path("js/forecastLadderIvAdjParamsNY.js")
X.OUT_MD = Path("analysis/output/iv_adjusted/CALIBRATION_NY.md")
if __name__ == "__main__":
    X.main()
