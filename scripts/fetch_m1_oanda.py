#!/usr/bin/env python3
"""
Fetch M1 OHLC bars from Oanda v20 API, write parquet, upload to R2.

Usage:
    python3 scripts/fetch_m1_oanda.py                  # fetch all instruments below
    python3 scripts/fetch_m1_oanda.py gold nq           # specific instruments only
    python3 scripts/fetch_m1_oanda.py --years 3         # limit history (default 5)
    python3 scripts/fetch_m1_oanda.py --no-upload       # write parquet locally only

Requires:
    pip install requests pyarrow boto3

Env vars (same as main system):
    OANDA_KEY      — Oanda v20 API key (required)
    OANDA_ENV      — 'live' (default) or 'practice'
    R2_ACCESS_KEY  — Cloudflare R2 access key (optional, needed for upload)
    R2_SECRET_KEY  — Cloudflare R2 secret key (optional, needed for upload)
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
import pyarrow as pa
import pyarrow.parquet as pq
import boto3

# ── R2 config (matches r2_download.py) ───────────────────────────────────────
R2_ENDPOINT   = "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com"
R2_BUCKET     = "r2-storage"
R2_PREFIX     = "m1"
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "25f206aea31c52f4f432c46bd6d5a249")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "7a16548bb2b7060ff09dab76e683b8d5334eb1b002ffaf255b258fb6a7c7b0ab")

# ── Oanda config ──────────────────────────────────────────────────────────────
OANDA_ENV = os.environ.get("OANDA_ENV", "practice")
OANDA_BASE = (
    "https://api-fxpractice.oanda.com"
    if OANDA_ENV == "practice"
    else "https://api-fxtrade.oanda.com"
)
OANDA_KEY = os.environ.get("OANDA_KEY", "12ede1dbab4361aa039831ec942603d2-b1691eab23c45cd97d0c1e7e63e9d5cc")

# ── Instrument definitions ────────────────────────────────────────────────────
# key      = pairKey used for parquet filename (must match cfg.name.toLowerCase() in engine)
# oanda    = Oanda v20 instrument symbol
# class_   = asset class label (for reference)
INSTRUMENTS = {
    # Core vol-forecaster instruments (missing M1 data)
    "gold":    {"oanda": "XAU_USD",     "class": "commodity", "desc": "Gold"},
    "nq":      {"oanda": "NAS100_USD",  "class": "index",     "desc": "Nasdaq 100"},

    # Additional indices
    "dow":     {"oanda": "US30_USD",    "class": "index",     "desc": "Dow Jones 30"},
    "spx":     {"oanda": "SPX500_USD",  "class": "index",     "desc": "S&P 500"},
    "dax":     {"oanda": "DE40_USD",    "class": "index",     "desc": "DAX 40"},
    "uk100":   {"oanda": "UK100_GBP",   "class": "index",     "desc": "FTSE 100"},

    # Additional commodities
    "silver":  {"oanda": "XAG_USD",     "class": "commodity", "desc": "Silver"},
    "oil":     {"oanda": "BCO_USD",     "class": "commodity", "desc": "Brent Crude"},
}

OUTDIR = Path(__file__).parent.parent / "VolRangeForecaster" / "data" / "m1"
BARS_PER_REQUEST = 5000


def oanda_headers():
    if not OANDA_KEY:
        raise RuntimeError("OANDA_KEY env var not set")
    return {"Authorization": f"Bearer {OANDA_KEY}"}


def fetch_chunk(instrument: str, from_dt: datetime, count: int = BARS_PER_REQUEST) -> list:
    """Fetch up to `count` M1 bars starting from from_dt. Returns list of dicts."""
    url = f"{OANDA_BASE}/v3/instruments/{instrument}/candles"
    params = {
        "granularity": "M1",
        "count":       count,
        "price":       "M",
        "from":        from_dt.strftime("%Y-%m-%dT%H:%M:%S.000000000Z"),
    }
    for attempt in range(4):
        try:
            r = requests.get(url, headers=oanda_headers(), params=params, timeout=30)
            if r.status_code == 422:
                # Oanda returns 422 when from_dt is before instrument's earliest bar
                # Move start forward and retry
                return []
            if r.status_code == 404:
                print(f"  Instrument {instrument} not found on Oanda (404) — check symbol")
                return None  # None = fatal, stop fetching
            r.raise_for_status()
            candles = r.json().get("candles", [])
            return [
                {
                    "open":   float(c["mid"]["o"]),
                    "high":   float(c["mid"]["h"]),
                    "low":    float(c["mid"]["l"]),
                    "close":  float(c["mid"]["c"]),
                    "volume": int(c.get("volume", 0)),
                    "time":   datetime.fromisoformat(
                        c["time"].replace("Z", "+00:00").replace(".000000000", "")
                    ).replace(tzinfo=None),  # store as naive UTC
                }
                for c in candles
                if c.get("complete", True) and c.get("mid")
            ]
        except requests.RequestException as e:
            wait = 2 ** attempt
            print(f"  Attempt {attempt+1} failed: {e}  — retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {instrument} after 4 attempts")


def fetch_all(instrument: str, years: int = 5) -> list | None:
    """Paginate Oanda M1 history going back `years` years. Returns list of bar dicts."""
    all_bars = []
    start  = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=365 * years)
    cursor = start
    now    = datetime.now(timezone.utc).replace(tzinfo=None)

    while cursor < now:
        chunk = fetch_chunk(instrument, cursor)
        if chunk is None:
            return None  # fatal instrument error
        if not chunk:
            # Empty — skip forward a week (non-trading gaps for indices)
            cursor += timedelta(days=7)
            continue

        all_bars.extend(chunk)
        last_time = chunk[-1]["time"]
        cursor = last_time + timedelta(minutes=1)

        print(f"  {last_time.strftime('%Y-%m-%d')}  {len(all_bars):,} bars", end="\r")

        if len(chunk) < BARS_PER_REQUEST:
            break  # caught up to now

        time.sleep(0.05)  # Oanda rate limit buffer

    print()  # newline after \r progress
    return all_bars if all_bars else None


def write_parquet(bars: list, path: Path):
    """
    Write parquet in the schema the M1 engine expects (hyparquet column order):
      row[0]=open  row[1]=high  row[2]=low  row[3]=close  row[4]=volume  row[5]=time
    """
    # Deduplicate and sort by time
    seen = set()
    unique = []
    for b in bars:
        key = b["time"]
        if key not in seen:
            seen.add(key)
            unique.append(b)
    unique.sort(key=lambda b: b["time"])

    schema = pa.schema([
        pa.field("open",   pa.float64()),
        pa.field("high",   pa.float64()),
        pa.field("low",    pa.float64()),
        pa.field("close",  pa.float64()),
        pa.field("volume", pa.int64()),
        pa.field("time",   pa.timestamp("us")),
    ])
    # Build epoch-microsecond timestamps for pyarrow (no pandas needed)
    epoch = datetime(1970, 1, 1)
    ts_us = [(b["time"] - epoch).total_seconds() * 1_000_000 for b in unique]

    table = pa.table(
        {
            "open":   pa.array([b["open"]   for b in unique], type=pa.float64()),
            "high":   pa.array([b["high"]   for b in unique], type=pa.float64()),
            "low":    pa.array([b["low"]    for b in unique], type=pa.float64()),
            "close":  pa.array([b["close"]  for b in unique], type=pa.float64()),
            "volume": pa.array([b["volume"] for b in unique], type=pa.int64()),
            "time":   pa.array(ts_us, type=pa.timestamp("us")),
        },
        schema=schema,
    )
    pq.write_table(table, str(path), compression="snappy")


def upload_to_r2(local_path: Path, key: str):
    """Upload file to Cloudflare R2."""
    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name="auto",
    )
    s3.upload_file(str(local_path), R2_BUCKET, key)


def process(pair_key: str, cfg: dict, years: int, upload: bool):
    oanda_sym  = cfg["oanda"]
    desc       = cfg["desc"]
    filename   = f"{pair_key}_m1.parquet"
    local_path = OUTDIR / filename
    r2_key     = f"{R2_PREFIX}/{filename}"

    print(f"\n{'='*60}")
    print(f"  {desc} ({oanda_sym})  ->  {filename}")
    print(f"{'='*60}")
    print(f"  Fetching {years}yr M1 history from Oanda...")

    bars = fetch_all(oanda_sym, years=years)

    if bars is None:
        print(f"  SKIPPED — instrument unavailable on Oanda")
        return False

    if not bars:
        print(f"  SKIPPED — no bars returned")
        return False

    t_first = bars[0]["time"]
    t_last  = bars[-1]["time"]
    span_days = (t_last - t_first).days
    print(f"  {len(bars):,} bars  |  {t_first.date()} -> {t_last.date()}  ({span_days} days)")

    OUTDIR.mkdir(parents=True, exist_ok=True)
    write_parquet(bars, local_path)
    file_mb = local_path.stat().st_size / 1e6
    print(f"  Wrote {local_path.name}  ({file_mb:.1f} MB)")

    if upload:
        if not R2_SECRET_KEY:
            print("  R2_SECRET_KEY not set — skipping upload")
        else:
            print(f"  Uploading to R2  ->  {r2_key}...")
            upload_to_r2(local_path, r2_key)
            print(f"  Upload complete")

    return True


def update_r2_download_script(new_pairs: list[str]):
    """Add new pair keys to scripts/r2_download.py PAIRS list."""
    script = Path(__file__).parent / "r2_download.py"
    src = script.read_text()

    for pair in new_pairs:
        if f'"{pair}"' not in src and f"'{pair}'" not in src:
            # Insert before closing bracket of PAIRS list
            src = src.replace(
                '"nzdjpy",\n]',
                f'"nzdjpy",\n    "{pair}",\n]',
            )

    script.write_text(src)


def main():
    parser = argparse.ArgumentParser(description="Fetch M1 parquets from Oanda and upload to R2")
    parser.add_argument("pairs", nargs="*", help="Instrument keys to fetch (default: all)")
    parser.add_argument("--years",     type=int,  default=5,    help="Years of history (default 5)")
    parser.add_argument("--no-upload", action="store_true",     help="Skip R2 upload")
    args = parser.parse_args()

    selected = [p.lower() for p in args.pairs] if args.pairs else list(INSTRUMENTS.keys())
    unknown  = [p for p in selected if p not in INSTRUMENTS]
    if unknown:
        print(f"Unknown instrument(s): {unknown}")
        print(f"Available: {list(INSTRUMENTS.keys())}")
        sys.exit(1)

    if not OANDA_KEY:
        print("Error: OANDA_KEY environment variable not set")
        sys.exit(1)

    succeeded = []
    failed    = []

    for pair_key in selected:
        ok = process(pair_key, INSTRUMENTS[pair_key], args.years, upload=not args.no_upload)
        (succeeded if ok else failed).append(pair_key)

    print(f"\n{'='*60}")
    print(f"Done — {len(succeeded)} succeeded, {len(failed)} failed")
    if failed:
        print(f"Failed: {failed}")

    if succeeded and not args.no_upload:
        print(f"\nAdding {succeeded} to r2_download.py...")
        update_r2_download_script(succeeded)
        print("r2_download.py updated — new pairs will auto-download at next session start")


if __name__ == "__main__":
    main()
