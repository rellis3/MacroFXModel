#!/usr/bin/env python3
"""
Fetch M1 OHLC bars from Oanda v20 API, write parquet, upload to R2.

Usage:
    python3 scripts/fetch_m1_oanda.py                  # fetch all instruments below
    python3 scripts/fetch_m1_oanda.py gold nq           # specific instruments only
    python3 scripts/fetch_m1_oanda.py --years 3         # limit history (default 5)
    python3 scripts/fetch_m1_oanda.py --no-upload       # write parquet locally only
    python3 scripts/fetch_m1_oanda.py --price M         # mid only (the pre-2026-09 schema)

## BID/ASK (`--price BAM`, the default)

Oanda returns bid, ask and mid OHLC in ONE request for the same cost as mid alone,
and until 2026-09 every call in this repo asked for `price=M` and threw the other
two away. That left the whole codebase with no measured spread anywhere - so every
cost assumption in every backtest was a guess, including the two conclusions that
rest entirely on a cost threshold (the spread/ATR > 0.15 execution gate, and
"VWAP extension is 3-8x under cost"). Those can now be recomputed from data.

Stored as eight extra columns AFTER `time`, never before it. The JS reader is
POSITIONAL - js/volBacktestM1Engine.js takes row[0..3] as OHLC and row[5] as the
timestamp - so appending is invisible to every existing consumer, while inserting
anything ahead of row[5] would silently reinterpret prices as dates. Measured cost
on real EURUSD M1: +91% file size (2.5 GB store -> 4.8 GB).

Spread is NOT derivable from the mid columns. Oanda's mid OHLC is not the exact
midpoint of the bid and ask OHLC (measured deviation up to 3.5e-5 on highs, since
the mid high and the ask high occur at different instants), so the bid/ask columns
are stored raw rather than reconstructed from a spread delta.

Requires:
    pip install requests pyarrow boto3

Env vars (same as main system):
    OANDA_KEY      -Oanda v20 API key (required)
    OANDA_ENV      -'live' (default) or 'practice'
    R2_ACCESS_KEY  -Cloudflare R2 access key (optional, needed for upload)
    R2_SECRET_KEY  -Cloudflare R2 secret key (optional, needed for upload)
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
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY")

# ── Oanda config ──────────────────────────────────────────────────────────────
OANDA_ENV = os.environ.get("OANDA_ENV", "practice")
OANDA_BASE = (
    "https://api-fxpractice.oanda.com"
    if OANDA_ENV == "practice"
    else "https://api-fxtrade.oanda.com"
)
OANDA_KEY = os.environ.get("OANDA_KEY")

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
    # DE30_USD does not exist on Oanda and never did — this entry fetched nothing
    # from the day it was written (a 400 that `process` reports as "unavailable" and
    # moves past). The real symbol is DE30_EUR, confirmed against the account's own
    # /v3/accounts/{id}/instruments list. `de30` below is the same instrument under
    # the filename the M1 store already uses.
    "dax":     {"oanda": "DE30_EUR",    "class": "index",     "desc": "DAX 40"},
    "uk100":   {"oanda": "UK100_GBP",   "class": "index",     "desc": "FTSE 100"},

    # Additional commodities
    "silver":  {"oanda": "XAG_USD",     "class": "commodity", "desc": "Silver"},
    "oil":     {"oanda": "BCO_USD",     "class": "commodity", "desc": "Brent Crude"},

    # Additional FX pairs — widening the universe past the 26 majors/crosses
    # already cached (see ContinuationBot/README.md's "widening past FX"
    # finding: adding uncorrelated instruments only helps if they carry
    # edge, so these are here to TEST, not because they're assumed good).
    "usdsek":  {"oanda": "USD_SEK",      "class": "fx",        "desc": "USD/SEK"},
    "usdnok":  {"oanda": "USD_NOK",      "class": "fx",        "desc": "USD/NOK"},
    "usdmxn":  {"oanda": "USD_MXN",      "class": "fx",        "desc": "USD/MXN"},
    "usdzar":  {"oanda": "USD_ZAR",      "class": "fx",        "desc": "USD/ZAR"},
    "usdtry":  {"oanda": "USD_TRY",      "class": "fx",        "desc": "USD/TRY"},
    "usdsgd":  {"oanda": "USD_SGD",      "class": "fx",        "desc": "USD/SGD"},
    "usdhkd":  {"oanda": "USD_HKD",      "class": "fx",        "desc": "USD/HKD"},
    "eursek":  {"oanda": "EUR_SEK",      "class": "fx",        "desc": "EUR/SEK"},

    # ── The 26 majors/crosses and index keys the M1 store already holds ──────────
    # These were bootstrapped from a Google Drive bundle (scripts/download_m1_parquets.sh)
    # and were never in this table, so this script could not refresh them. That did
    # not matter while everything was mid-only — it matters now, because bid/ask can
    # only reach a file this script writes, and these are exactly the instruments the
    # spread work is about. eurusd, gbpusd, usdjpy and the crosses would otherwise
    # have stayed mid-only forever while the "new" columns landed on USD/HKD.
    #
    # Every symbol below was checked against the account's own instrument list before
    # being added — none is guessed from the filename.
    "eurusd":  {"oanda": "EUR_USD",      "class": "fx",        "desc": "EUR/USD"},
    "gbpusd":  {"oanda": "GBP_USD",      "class": "fx",        "desc": "GBP/USD"},
    "usdjpy":  {"oanda": "USD_JPY",      "class": "fx",        "desc": "USD/JPY"},
    "audusd":  {"oanda": "AUD_USD",      "class": "fx",        "desc": "AUD/USD"},
    "nzdusd":  {"oanda": "NZD_USD",      "class": "fx",        "desc": "NZD/USD"},
    "usdcad":  {"oanda": "USD_CAD",      "class": "fx",        "desc": "USD/CAD"},
    "usdchf":  {"oanda": "USD_CHF",      "class": "fx",        "desc": "USD/CHF"},
    "eurgbp":  {"oanda": "EUR_GBP",      "class": "fx",        "desc": "EUR/GBP"},
    "eurjpy":  {"oanda": "EUR_JPY",      "class": "fx",        "desc": "EUR/JPY"},
    "euraud":  {"oanda": "EUR_AUD",      "class": "fx",        "desc": "EUR/AUD"},
    "eurcad":  {"oanda": "EUR_CAD",      "class": "fx",        "desc": "EUR/CAD"},
    "eurchf":  {"oanda": "EUR_CHF",      "class": "fx",        "desc": "EUR/CHF"},
    "eurnzd":  {"oanda": "EUR_NZD",      "class": "fx",        "desc": "EUR/NZD"},
    "gbpjpy":  {"oanda": "GBP_JPY",      "class": "fx",        "desc": "GBP/JPY"},
    "gbpaud":  {"oanda": "GBP_AUD",      "class": "fx",        "desc": "GBP/AUD"},
    "gbpcad":  {"oanda": "GBP_CAD",      "class": "fx",        "desc": "GBP/CAD"},
    "gbpchf":  {"oanda": "GBP_CHF",      "class": "fx",        "desc": "GBP/CHF"},
    "gbpnzd":  {"oanda": "GBP_NZD",      "class": "fx",        "desc": "GBP/NZD"},
    "audjpy":  {"oanda": "AUD_JPY",      "class": "fx",        "desc": "AUD/JPY"},
    "audcad":  {"oanda": "AUD_CAD",      "class": "fx",        "desc": "AUD/CAD"},
    "audchf":  {"oanda": "AUD_CHF",      "class": "fx",        "desc": "AUD/CHF"},
    "audnzd":  {"oanda": "AUD_NZD",      "class": "fx",        "desc": "AUD/NZD"},
    "nzdcad":  {"oanda": "NZD_CAD",      "class": "fx",        "desc": "NZD/CAD"},
    "nzdjpy":  {"oanda": "NZD_JPY",      "class": "fx",        "desc": "NZD/JPY"},
    "cadchf":  {"oanda": "CAD_CHF",      "class": "fx",        "desc": "CAD/CHF"},
    "cadjpy":  {"oanda": "CAD_JPY",      "class": "fx",        "desc": "CAD/JPY"},
    "chfjpy":  {"oanda": "CHF_JPY",      "class": "fx",        "desc": "CHF/JPY"},
    "us2000":  {"oanda": "US2000_USD",   "class": "index",     "desc": "Russell 2000"},

    # ── Alias keys: same Oanda instrument, second filename the store already uses ──
    # Not duplicates to clean up — different consumers read different filenames, and
    # deleting either would break one of them. `process` fetches a symbol ONCE and
    # writes every key that maps to it, so an alias costs a file, not a download.
    "xauusd":     {"oanda": "XAU_USD",    "class": "commodity", "desc": "Gold (alias of gold)"},
    "nas100_usd": {"oanda": "NAS100_USD", "class": "index",     "desc": "Nasdaq 100 (alias of nq)"},
    "spx500":     {"oanda": "SPX500_USD", "class": "index",     "desc": "S&P 500 (alias of spx)"},
    "us30":       {"oanda": "US30_USD",   "class": "index",     "desc": "Dow 30 (alias of dow)"},
    "de30":       {"oanda": "DE30_EUR",   "class": "index",     "desc": "DAX 40 (alias of dax)"},
}

OUTDIR = Path(__file__).parent.parent / "VolRangeForecaster" / "data" / "m1"
BARS_PER_REQUEST = 5000


def oanda_headers():
    if not OANDA_KEY:
        raise RuntimeError("OANDA_KEY env var not set")
    return {"Authorization": f"Bearer {OANDA_KEY}"}


def fetch_chunk(instrument: str, from_dt: datetime, count: int = BARS_PER_REQUEST,
                price: str = "BAM") -> list:
    """Fetch up to `count` M1 bars starting from from_dt. Returns list of dicts.

    `price` is passed to Oanda verbatim: 'BAM' asks for bid+ask+mid in one response,
    'M' for mid only. A bar is kept only if every REQUESTED component is present -
    a partial candle would otherwise write zeros into the bid/ask columns and read
    downstream as a zero spread, which is the most expensive possible wrong answer
    for cost modelling.
    """
    url = f"{OANDA_BASE}/v3/instruments/{instrument}/candles"
    params = {
        "granularity": "M1",
        "count":       count,
        "price":       price,
        "from":        from_dt.strftime("%Y-%m-%dT%H:%M:%S.000000000Z"),
    }
    want = [{"B": "bid", "A": "ask", "M": "mid"}[ch] for ch in price]
    for attempt in range(4):
        try:
            r = requests.get(url, headers=oanda_headers(), params=params, timeout=30)
            if r.status_code == 422:
                # Oanda returns 422 when from_dt is before instrument's earliest bar
                return []
            if r.status_code in (400, 404):
                msg = {400: "Bad Request (instrument unavailable or unsupported granularity)",
                       404: "Not Found - check symbol"}[r.status_code]
                print(f"  Instrument {instrument} fatal {r.status_code}: {msg}")
                return None  # fatal, skip this instrument
            r.raise_for_status()
            candles = r.json().get("candles", [])
            out = []
            for c in candles:
                if not c.get("complete", True) or not all(c.get(w) for w in want):
                    continue
                bar = {
                    "open":   float(c["mid"]["o"]),
                    "high":   float(c["mid"]["h"]),
                    "low":    float(c["mid"]["l"]),
                    "close":  float(c["mid"]["c"]),
                    "volume": int(c.get("volume", 0)),
                    "time":   datetime.fromisoformat(
                        c["time"].replace("Z", "+00:00").replace(".000000000", "")
                    ).replace(tzinfo=None),  # store as naive UTC
                }
                for side in ("bid", "ask"):
                    if side in want:
                        for k in "ohlc":
                            bar[f"{side}_{k}"] = float(c[side][k])
                out.append(bar)
            return out
        except requests.RequestException as e:
            wait = 2 ** attempt
            print(f"  Attempt {attempt+1} failed: {e}  - retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {instrument} after 4 attempts")


def fetch_all(instrument: str, years: int = 5, price: str = "BAM") -> list | None:
    """Paginate Oanda M1 history going back `years` years. Returns list of bar dicts."""
    all_bars = []
    start  = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=365 * years)
    cursor = start
    now    = datetime.now(timezone.utc).replace(tzinfo=None)

    while cursor < now:
        chunk = fetch_chunk(instrument, cursor, price=price)
        if chunk is None:
            return None  # fatal instrument error
        if not chunk:
            # Empty -skip forward a week (non-trading gaps for indices)
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

    Bid/ask, when present, are appended as row[6..13] — STRICTLY after `time`.
    js/volBacktestM1Engine.js indexes this file positionally, so row[5] must stay
    the timestamp for every reader that predates these columns; anything inserted
    before it would be read as a price or a date without erroring.
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

    # Which bid/ask columns this batch actually carries (driven by --price, and by
    # what Oanda returned — never assumed).
    extra = [c for c in (f"{s}_{k}" for s in ("bid", "ask") for k in "ohlc")
             if unique and c in unique[0]]

    schema = pa.schema([
        pa.field("open",   pa.float64()),
        pa.field("high",   pa.float64()),
        pa.field("low",    pa.float64()),
        pa.field("close",  pa.float64()),
        pa.field("volume", pa.int64()),
        pa.field("time",   pa.timestamp("us")),
        *[pa.field(c, pa.float64()) for c in extra],
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
            **{c: pa.array([b[c] for b in unique], type=pa.float64()) for c in extra},
        },
        schema=schema,
    )
    pq.write_table(table, str(path), compression="snappy")
    return extra


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


def process(pair_keys, cfg: dict, years: float, upload: bool, price: str = "BAM"):
    """Fetch one Oanda instrument ONCE and write it to every pairKey that maps to it.

    Several store filenames are the same instrument under a different name (gold and
    xauusd, nq and nas100_usd, spx and spx500, dow and us30, dax and de30). Fetching
    per KEY would download five extra multi-year M1 histories — hours of requests —
    to produce byte-identical files, so the unit of work is the SYMBOL and the keys
    are just the filenames it lands in.
    """
    if isinstance(pair_keys, str):
        pair_keys = [pair_keys]
    oanda_sym  = cfg["oanda"]
    desc       = cfg["desc"]
    names      = ", ".join(f"{k}_m1.parquet" for k in pair_keys)

    print(f"\n{'='*60}")
    print(f"  {desc} ({oanda_sym})  ->  {names}")
    print(f"{'='*60}")
    print(f"  Fetching {years}yr M1 history from Oanda...")

    bars = fetch_all(oanda_sym, years=years, price=price)

    if bars is None:
        print(f"  SKIPPED - instrument unavailable on Oanda")
        return False

    if not bars:
        print(f"  SKIPPED - no bars returned")
        return False

    t_first = bars[0]["time"]
    t_last  = bars[-1]["time"]
    span_days = (t_last - t_first).days
    print(f"  {len(bars):,} bars  |  {t_first.date()} -> {t_last.date()}  ({span_days} days)")

    OUTDIR.mkdir(parents=True, exist_ok=True)
    for pair_key in pair_keys:
        local_path = OUTDIR / f"{pair_key}_m1.parquet"
        extra = write_parquet(bars, local_path)
        file_mb = local_path.stat().st_size / 1e6
        print(f"  Wrote {local_path.name}  ({file_mb:.1f} MB)"
              + (f"  [+{len(extra)} bid/ask cols]" if extra else "  [mid only]"))
    if extra:
        # Reported in BASIS POINTS OF PRICE, deliberately not pips. A pip table here
        # would need a per-instrument decimal place for FX vs JPY crosses vs gold vs
        # indices, and this repo already carries a live gold pip 10x disagreement
        # between js/utils.js and the canonical value. bps needs no table and cannot
        # drift; convert to pips at the point of use, where the pip size is known.
        sp = sorted(b["ask_c"] - b["bid_c"] for b in bars)
        mid = sorted(b["close"] for b in bars)[len(bars) // 2]
        bp = lambda v: v / mid * 10_000
        print(f"  Spread at close: median {bp(sp[len(sp)//2]):.2f} bps  "
              f"p90 {bp(sp[int(0.9*len(sp))]):.2f}  max {bp(sp[-1]):.2f}  "
              f"(of price; median mid {mid:g})")

    if upload:
        if not R2_SECRET_KEY:
            print("  R2_SECRET_KEY not set - skipping upload")
        else:
            for pair_key in pair_keys:
                r2_key = f"{R2_PREFIX}/{pair_key}_m1.parquet"
                print(f"  Uploading to R2  ->  {r2_key}...")
                upload_to_r2(OUTDIR / f"{pair_key}_m1.parquet", r2_key)
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
    global OUTDIR
    parser = argparse.ArgumentParser(description="Fetch M1 parquets from Oanda and upload to R2")
    parser.add_argument("pairs", nargs="*", help="Instrument keys to fetch (default: all)")
    parser.add_argument("--years",     type=float, default=5,   help="Years of history (default 5; fractional ok)")
    parser.add_argument("--out", default=str(OUTDIR),
                        help="output dir (default the live M1 store). Point a short "
                             "--years run somewhere else — writing 5 days over a 5-year "
                             "file destroys it, the write is a REPLACE not a merge.")
    parser.add_argument("--no-upload", action="store_true",     help="Skip R2 upload")
    parser.add_argument("--price", default="BAM", choices=["BAM", "M"],
                        help="BAM (default) stores bid+ask+mid; M is the mid-only "
                             "pre-2026-09 schema. Same request cost either way.")
    parser.add_argument("--list",      action="store_true",
                        help="Print INSTRUMENTS as JSON and exit — no OANDA_KEY required. "
                             "Lets a caller (e.g. the dashboard's fetch-trigger UI) introspect "
                             "the available instrument keys without duplicating this table.")
    args = parser.parse_args()

    if args.list:
        import json
        print(json.dumps(INSTRUMENTS))
        return

    OUTDIR = Path(args.out)

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

    # One fetch per Oanda SYMBOL, not per key — see process()'s docstring.
    groups: dict[str, list[str]] = {}
    for k in selected:
        groups.setdefault(INSTRUMENTS[k]["oanda"], []).append(k)
    dupes = {s: ks for s, ks in groups.items() if len(ks) > 1}
    if dupes:
        print("  sharing one download across alias keys: "
              + "; ".join(f"{s} -> {', '.join(ks)}" for s, ks in dupes.items()))

    for sym, keys in groups.items():
        try:
            ok = process(keys, INSTRUMENTS[keys[0]], args.years,
                         upload=not args.no_upload, price=args.price)
        except Exception as e:
            print(f"  ERROR: {e}")
            ok = False
        (succeeded if ok else failed).extend(keys)

    print(f"\n{'='*60}")
    print(f"Done: {len(succeeded)} succeeded, {len(failed)} failed")
    if failed:
        print(f"Failed: {failed}")

    if succeeded and not args.no_upload:
        print(f"\nAdding {succeeded} to r2_download.py...")
        update_r2_download_script(succeeded)
        print("r2_download.py updated - new pairs will auto-download at next session start")


if __name__ == "__main__":
    main()
