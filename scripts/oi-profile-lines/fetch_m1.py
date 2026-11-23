#!/usr/bin/env python3
"""oi-profile-lines: M1 bars (mid + bid/ask) for the 11 OI instruments over the capture window, 2026-08-20 -> now.
Seeds from data/m1_forward/<sym>_m1.parquet (read only, never modified) and appends the bars after its last row from OANDA.
Download only; writes data/oi_profile_lines/m1/<sym>.parquet. Run with Railway's env (OANDA_KEY):
    railway run python scripts/oi-profile-lines/fetch_m1.py <repoRootWithData>
"""
import sys
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[2] / "scripts"))
from fetch_m1_oanda import fetch_chunk  # noqa: E402

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[2]
SRC, OUT = ROOT / "data" / "m1_forward", ROOT / "data" / "oi_profile_lines" / "m1"
SYMS = {"EURUSD": "EUR_USD", "GBPUSD": "GBP_USD", "USDJPY": "USD_JPY", "AUDUSD": "AUD_USD", "GOLD": "XAU_USD", "USDCAD": "USD_CAD",
        "USDCHF": "USD_CHF", "NQ": "NAS100_USD", "US30": "US30_USD", "SPX500": "SPX500_USD", "US2000": "US2000_USD"}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for sym, inst in SYMS.items():
        base = pd.read_parquet(SRC / f"{sym.lower()}_m1.parquet")
        cursor = base.index[-1].tz_convert(None).to_pydatetime() + pd.Timedelta(minutes=1)
        bars = []
        while cursor < now:
            ch = fetch_chunk(inst, cursor, price="BAM")
            if not ch:
                break
            bars.extend(ch)
            nxt = ch[-1]["time"] + pd.Timedelta(minutes=1)
            if nxt <= cursor or len(ch) < 10:
                break
            cursor = nxt
        df = base
        if bars:
            new = pd.DataFrame(bars).drop_duplicates("time").sort_values("time")
            new.index = pd.DatetimeIndex(pd.to_datetime(new.pop("time")).dt.tz_localize("UTC"), name="datetime")
            new = new[[c for c in base.columns if c in new.columns]]
            df = pd.concat([base, new])
            df = df[~df.index.duplicated(keep="first")].sort_index()
        df.to_parquet(OUT / f"{sym}.parquet")
        print(f"{sym:7s} rows {len(df):7d}  {df.index[0]} -> {df.index[-1]}  (+{len(bars)})")


if __name__ == "__main__":
    main()
