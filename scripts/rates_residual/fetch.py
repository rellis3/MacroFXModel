"""OANDA M15 mid closes 2018-01 -> now for the rates-residual study book (forge/RATES_RESIDUAL_PREREG.md).
Reuses analysis/nasdaq_lead_lag_scan.py's creds + pagination (key read from the local .env files, never printed).

    python -m scripts.rates_residual.fetch
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from analysis.nasdaq_lead_lag_scan import oanda_creds, fetch_oanda_m15  # noqa: E402

OUT = Path("analysis/output/rates_residual/m15"); OUT.mkdir(parents=True, exist_ok=True)
SYMS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "USD_CHF", "XAU_USD", "XAG_USD", "NAS100_USD",
        "SPX500_USD", "DE30_EUR", "BCO_USD", "USB02Y_USD", "USB05Y_USD", "USB10Y_USD", "USB30Y_USD", "DE10YB_EUR", "UK10YB_GBP"]
years = (datetime.now(timezone.utc) - datetime(2018, 1, 1, tzinfo=timezone.utc)).days / 365
key, base = oanda_creds()
for s in SYMS:
    if (OUT / f"{s}.parquet").exists() and "--force" not in sys.argv:
        continue
    x = fetch_oanda_m15(s, base, {"Authorization": f"Bearer {key}"}, years)
    if x is None or not len(x):
        print(s, "NO DATA", flush=True); continue
    x.to_frame("close").to_parquet(OUT / f"{s}.parquet")
    print(s, len(x), x.index[0], x.index[-1], flush=True)
