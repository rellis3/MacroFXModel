#!/usr/bin/env python3
"""refresh_m1.py — incremental M1 top-up for the AnalogML pair universe.

The missing piece that makes `paper_track.py --scan` genuinely forward-
looking instead of stuck on this sandbox's static 2026-05-21 snapshot: for
each pair, fetches only the bars newer than the local parquet's current
last timestamp from OANDA and appends them.

Reuses `scripts/fetch_m1_oanda.py`'s `fetch_chunk()` for the actual OANDA
call (one fetcher, not a second copy) and `pylego.instruments.oanda_symbol`
for the pair -> OANDA-instrument mapping (the canonical registry, not a
hand-rolled dict -- `fetch_m1_oanda.py`'s own `INSTRUMENTS` dict only
covers gold/indices/commodities, not the 25 FX crosses AnalogML trades).

Writes back in the EXACT schema `pattern_scan.load_bars` (and every other
AnalogML script) already reads: a DatetimeIndex named 'datetime' (tz-aware
UTC), columns open/high/low/close/volume -- deliberately NOT
`fetch_m1_oanda.py`'s own `write_parquet` schema (a 'time' COLUMN, not an
index -- built for a different, JS-side consumer), so this stays a drop-in
top-up of the files every AnalogML script already trusts.

Requires OANDA_KEY in the environment. Confirmed unreachable from this
sandbox (403 policy denial from the outbound proxy) -- meant to run
wherever OANDA actually is reachable (Railway, per CLAUDE.md).

Each pair's parquet is also mirrored to R2 (`analogml/m1/{pair}_m1.parquet`,
same bucket as motif_track.py's trade log/state) after every successful
top-up, and pulled from there when local disk has nothing for a pair.
Railway's disk is wiped on every redeploy and M1_DIR is gitignored, so
without this a fresh container had no way to tell "already have this,
just top up" from "never fetched this pair before" -- every single
redeploy silently re-triggered a full DEFAULT_LOOKBACK_YEARS backfill for
all 26 pairs from scratch (hours, not the seconds a normal top-up takes).

Usage:
  python AnalogML/refresh_m1.py --pairs gbpjpy,eurusd
  python AnalogML/refresh_m1.py --all-pairs
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from pylego.instruments import oanda_symbol  # noqa: E402
from pylego.r2 import r2_client, R2_BUCKET  # noqa: E402
from fetch_m1_oanda import fetch_chunk  # noqa: E402

M1_DIR = REPO_ROOT / "VolRangeForecaster" / "data" / "m1"
DEFAULT_LOOKBACK_YEARS = 5  # only used when NEITHER local disk NOR R2 has this pair yet

# R2-persisted mirror of M1_DIR, same bucket motif_track.py's trade log/state
# already use. Railway's disk is wiped on every redeploy AND M1_DIR is
# gitignored (never shipped in the repo), so without this, every single
# redeploy fell back to DEFAULT_LOOKBACK_YEARS's full from-scratch OANDA
# backfill for all 26 pairs -- discovered 2026-08-17 when a routine deploy
# left the hourly loop mid-backfill for hours, not the seconds an
# incremental top-up normally takes. This makes a redeploy pay the same
# "top up since last run" cost as any other hourly scan, not a full reload.
R2_M1_PREFIX = "analogml/m1"


def _r2_m1_key(pair: str) -> str:
    return f"{R2_M1_PREFIX}/{pair}_m1.parquet"


ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]


def _load_existing(pair: str, path: Path):
    """Local parquet if present; otherwise R2's cached copy, written to
    local disk so this behaves exactly like a local hit from here on. None
    only when NEITHER has this pair yet (its very first run anywhere)."""
    if path.exists():
        return pd.read_parquet(path)
    s3 = r2_client()
    if s3 is None:
        return None
    try:
        obj = s3.get_object(Bucket=R2_BUCKET, Key=_r2_m1_key(pair))
    except Exception:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(obj["Body"].read())
    return pd.read_parquet(path)


def refresh_pair(pair: str) -> int:
    """Top up `pair`'s local parquet with bars newer than what's already
    there. Returns the number of new bars written (0 if already current)."""
    path = M1_DIR / f"{pair}_m1.parquet"
    existing = _load_existing(pair, path)

    if existing is not None and len(existing):
        last_ts = existing.index.max().to_pydatetime().replace(tzinfo=None)
    else:
        last_ts = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=365 * DEFAULT_LOOKBACK_YEARS)

    instrument = oanda_symbol(pair)
    cursor = last_ts + timedelta(minutes=1)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    all_new: list[dict] = []

    while cursor < now:
        chunk = fetch_chunk(instrument, cursor)
        if chunk is None:
            print(f"  {pair}: fatal OANDA error for {instrument}, skipping")
            return 0
        if not chunk:
            break
        all_new.extend(chunk)
        cursor = chunk[-1]["time"] + timedelta(minutes=1)
        if len(chunk) < 5000:
            break  # caught up

    if not all_new:
        return 0

    new_df = pd.DataFrame(all_new)
    new_df["time"] = pd.to_datetime(new_df["time"], utc=True)
    new_df = new_df.set_index("time")[["open", "high", "low", "close", "volume"]]
    new_df.index.name = "datetime"

    if existing is not None and len(existing):
        combined = pd.concat([existing, new_df])
        combined = combined[~combined.index.duplicated(keep="last")].sort_index()
    else:
        combined = new_df.sort_index()

    M1_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(path)

    s3 = r2_client()
    if s3 is not None:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=_r2_m1_key(pair), Body=path.read_bytes(),
                          ContentType="application/octet-stream")
        except Exception as e:
            print(f"  {pair}: R2 M1 cache upload failed ({e}) -- local copy at {path} is "
                  f"current, R2 cache may be stale until the next successful run")

    return len(new_df)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is all 26")
    p.add_argument("--all-pairs", action="store_true")
    args = p.parse_args()
    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS

    total = 0
    for pair in pairs:
        n = refresh_pair(pair)
        total += n
        print(f"  {pair:<8} +{n} bars")
    print(f"\n[refresh_m1] {total} new bars across {len(pairs)} pairs")


if __name__ == "__main__":
    main()
