#!/usr/bin/env python3
"""
Databento historical OI puller.

Pulls per-strike open interest, OI change, cleared volume, and settlement
price for every CME-listed option this repo's OI bot covers (the 11
instruments in products.py's CME_PRODUCTS -- see that file's header for why
DE30/FDAX and UK100/FTSE100 are excluded: Eurex and ICE, not CME, so no
GLBX.MDP3 record for them exists at all), over the last 10 years. Writes one
CSV per pair to oi_recon/databento_oi/.

IMPORTANT -- read before running the real thing:
    I do not have a live Databento API key from where this script was
    written, so nothing here has been checked against real market data or a
    real account. What IS verified: the field names, stat_type codes, and
    instrument_class values below are read directly out of the installed
    `databento`/`databento_dbn` package's own type definitions (StatType,
    InstrumentClass, InstrumentDefMsg, StatMsg, and the smart-symbol
    validator's own "ES.OPT" example for parent symbology) -- not guessed.
    What is NOT verified: whether GLBX.MDP3 parent symbology actually
    resolves the option complex the way I expect for every one of these 11
    roots, whether coverage reaches back a full 10 years for all of them,
    and whether there's some real-world data quirk (a gap, a renamed root,
    an unexpected empty range) that only shows up against live data.
    Running --verify first is not optional -- it pulls ~5 days for one
    instrument and prints exactly what Databento returns, so any such
    surprise shows up before you spend money on the full 10-year pull.

Setup:
    pip install databento pandas
    export DATABENTO_API_KEY="db-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    # or paste your key into API_KEY below -- the env var is safer since it
    # never ends up committed to git by accident.

Usage:
    python databento_oi_pull.py --verify                    # cheap sanity check -- run this FIRST
    python databento_oi_pull.py --cost-only                 # show estimated $ cost for the full pull, fetches nothing
    python databento_oi_pull.py --yes                        # run the full 10-year pull, all 11 instruments
    python databento_oi_pull.py --yes --only "EUR/USD"       # just one pair
    python databento_oi_pull.py --yes --years 2               # shorter window while testing
    python databento_oi_pull.py --yes --resume                # skip (pair, year) chunks already written
"""
import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    sys.exit("Missing dependency -- run: pip install pandas")

try:
    import databento as db
except ImportError:
    sys.exit("Missing dependency -- run: pip install databento")

# Reuses this repo's single source of truth for which 11 instruments are
# actually CME-listed (see products.py's own header/notes for the DE30/UK100
# exclusion and the JPY/CAD/CHF inverse-quote trap referenced below).
sys.path.insert(0, str(Path(__file__).parent))
from products import CME_PRODUCTS  # noqa: E402

# ── Configuration ────────────────────────────────────────────────────────────

API_KEY = ""  # paste your Databento key here if you'd rather not use an env var
DATASET = "GLBX.MDP3"
OUT_DIR = Path(__file__).parent / "databento_oi"
PROGRESS_DIR = OUT_DIR / ".progress"

# Built directly from the installed databento package's own StatType enum
# (confirmed present as db.StatType.{OPEN_INTEREST,SETTLEMENT_PRICE,
# CLEARED_VOLUME,...} = 9/3/6/... in databento 0.86.0) rather than a
# hand-typed table, so this can't silently drift from whatever version of
# the SDK is actually installed. --verify still prints the raw stat_type
# values a real pull returns, as a live cross-check.
STAT_TYPE = {int(getattr(db.StatType, name)): name.lower() for name in dir(db.StatType) if name.isupper()}
WANTED_STAT_NAMES = {"settlement_price", "open_interest", "cleared_volume"}

# Three of these quote the OANDA pair's inverse on CME (JPY/USD, CAD/USD,
# CHF/USD instead of USD/JPY, USD/CAD, USD/CHF) -- same trap products.py's
# own notes flag for the recon scraper. This script does NOT invert strikes;
# it writes the raw CME-quoted numbers and stamps a warning column so you
# don't discover this by silently getting a max-pain level backwards.
INVERSE_QUOTED = {"USD/JPY", "USD/CAD", "USD/CHF"}


def get_client():
    key = API_KEY or None
    try:
        return db.Historical(key) if key else db.Historical()
    except Exception as e:
        sys.exit(
            f"Could not create Databento client ({e}).\n"
            "Set DATABENTO_API_KEY in your environment, or paste your key "
            "into API_KEY at the top of this script."
        )


def year_ranges(years_back):
    """[(start, end), ...] covering the last `years_back` years, split by
    calendar year so each request stays a bounded size and a failed run can
    resume year-by-year instead of re-pulling everything."""
    now = datetime.now(timezone.utc)
    try:
        overall_start = now.replace(year=now.year - years_back)
    except ValueError:
        overall_start = now.replace(year=now.year - years_back, day=28)  # Feb 29 landing on a non-leap year
    out = []
    for y in range(overall_start.year, now.year + 1):
        start = max(datetime(y, 1, 1, tzinfo=timezone.utc), overall_start)
        end = min(datetime(y + 1, 1, 1, tzinfo=timezone.utc), now)
        if start < end:
            out.append((start, end))
    return out


def fetch_definitions(client, root, start, end):
    """instrument_id -> {strike, expiration, right, raw_symbol} for every
    option instrument ever defined under this root in [start, end)."""
    df = client.timeseries.get_range(
        dataset=DATASET,
        schema="definition",
        stype_in="parent",
        symbols=[f"{root}.OPT"],
        start=start,
        end=end,
    ).to_df()
    if df.empty:
        return {}

    out = {}
    for _, row in df.iterrows():
        # to_df()'s default price_type='float' already scales strike_price/
        # price fields to real floats (confirmed against the installed SDK's
        # DBNStore.to_df signature) -- no manual /1e9 fixed-point scaling
        # needed as long as get_range().to_df() is called with its defaults.
        strike = row.get("strike_price")
        right = row.get("instrument_class")
        out[row["instrument_id"]] = {
            "strike": strike,
            "expiration": row.get("expiration"),
            "right": right,
            "raw_symbol": row.get("raw_symbol"),
        }
    return out


def fetch_statistics(client, root, start, end):
    df = client.timeseries.get_range(
        dataset=DATASET,
        schema="statistics",
        stype_in="parent",
        symbols=[f"{root}.OPT"],
        start=start,
        end=end,
    ).to_df()
    return df


def build_rows(stats_df, definitions):
    """Join statistics onto definitions and pivot settlement/OI/volume into
    one row per (date, instrument_id). OI change is filled in afterward,
    once all years for a pair are concatenated (needs the prior day's OI,
    which may live in a different year-chunk than the current row)."""
    if stats_df.empty:
        return pd.DataFrame()

    stats_df = stats_df.copy()
    stats_df["stat_name"] = stats_df["stat_type"].map(STAT_TYPE)
    stats_df = stats_df[stats_df["stat_name"].isin(WANTED_STAT_NAMES)]
    if stats_df.empty:
        return pd.DataFrame()

    date_col = "ts_ref" if "ts_ref" in stats_df.columns else "ts_recv"
    stats_df["date"] = pd.to_datetime(stats_df[date_col]).dt.date

    rows = []
    for (date, instrument_id), grp in stats_df.groupby(["date", "instrument_id"]):
        defn = definitions.get(instrument_id)
        if defn is None:
            continue  # instrument never resolved to a definition -- see run-end warning count
        rec = {
            "date": date,
            "expiry": defn["expiration"],
            "strike": defn["strike"],
            "right": defn["right"],
            "raw_symbol": defn["raw_symbol"],
            "instrument_id": instrument_id,
        }
        for _, r in grp.iterrows():
            name = r["stat_name"]
            if name == "settlement_price":
                rec["settlement"] = r.get("price")
            elif name == "open_interest":
                rec["open_interest"] = r.get("quantity")
            elif name == "cleared_volume":
                rec["volume"] = r.get("quantity")
        rows.append(rec)
    return pd.DataFrame(rows)


def add_oi_change(df):
    if df.empty or "open_interest" not in df.columns:
        return df
    df = df.sort_values(["instrument_id", "date"])
    df["open_interest_change"] = df.groupby("instrument_id")["open_interest"].diff()
    return df


def run_verify(client):
    p = CME_PRODUCTS[0]
    root = p["fut"]
    end = datetime.now(timezone.utc)
    start = end - pd.Timedelta(days=7)
    print(f"[verify] pulling {root}.OPT definitions + statistics for {p['sym']}, "
          f"{start.date()} .. {end.date()} (should be cheap/fast)\n")

    defs_df = client.timeseries.get_range(
        dataset=DATASET, schema="definition", stype_in="parent",
        symbols=[f"{root}.OPT"], start=start, end=end,
    ).to_df()
    print(f"definitions: {len(defs_df)} rows")
    print("columns:", list(defs_df.columns))
    if not defs_df.empty:
        print(defs_df.head(3).to_string())
    print()

    stats_df = client.timeseries.get_range(
        dataset=DATASET, schema="statistics", stype_in="parent",
        symbols=[f"{root}.OPT"], start=start, end=end,
    ).to_df()
    print(f"statistics: {len(stats_df)} rows")
    print("columns:", list(stats_df.columns))
    if not stats_df.empty:
        print("unique stat_type values seen:", sorted(stats_df["stat_type"].unique().tolist()))
        print(stats_df.head(5).to_string())

    print(
        "\nSanity-check the printed rows above: strike_price should read as a real "
        "strike (e.g. 1.085 for a EUR/USD option, not a huge raw integer), "
        "instrument_class should read 'C'/'P', and unique stat_type values should be "
        "a subset of {3, 6, 9} (settlement_price, cleared_volume, open_interest) plus "
        "whatever other stats this root reports. If any of that looks wrong, stop and "
        "fix it before running --yes -- everything downstream depends on it."
    )


def run_cost_estimate(client, years, only):
    products = [p for p in CME_PRODUCTS if only is None or p["sym"] == only]
    ranges = year_ranges(years)
    start, end = ranges[0][0], ranges[-1][1]
    total = 0.0
    for p in products:
        root = p["fut"]
        for schema in ("definition", "statistics"):
            try:
                cost = client.metadata.get_cost(
                    dataset=DATASET, schema=schema, stype_in="parent",
                    symbols=[f"{root}.OPT"], start=start, end=end,
                )
                print(f"{p['sym']:10s} {schema:12s} ~${cost:.2f}")
                total += cost
            except Exception as e:
                print(f"{p['sym']:10s} {schema:12s} cost check failed: {e}")
    print(f"\nEstimated total: ~${total:.2f} for {years} year(s), {len(products)} instrument(s).")


def progress_marker(sym, year):
    return PROGRESS_DIR / f"{sym.replace('/', '_')}_{year}.done"


def run_pull(client, years, only, resume):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    products = [p for p in CME_PRODUCTS if only is None or p["sym"] == only]
    ranges = year_ranges(years)

    for p in products:
        sym, root = p["sym"], p["fut"]
        csv_path = OUT_DIR / f"{sym.replace('/', '_')}.csv"
        all_defs = {}
        year_frames = []
        print(f"\n=== {sym} ({root}) ===")
        if sym in INVERSE_QUOTED:
            print(f"  NOTE: CME quotes this pair's inverse -- strikes below are as CME "
                  f"lists them, not flipped to the OANDA {sym} convention. See "
                  f"products.py's note for this symbol.")

        for start, end in ranges:
            year = start.year
            marker = progress_marker(sym, year)
            if resume and marker.exists():
                print(f"  {year}: already done, skipping (--resume)")
                # safe to skip entirely -- this year's already-resolved rows
                # come back in via the existing-CSV concat below, no need to
                # re-fetch its raw definitions
                continue
            print(f"  {year}: fetching definitions + statistics ({start.date()} .. {end.date()})")
            try:
                defs = fetch_definitions(client, root, start, end)
                all_defs.update(defs)
                stats_df = fetch_statistics(client, root, start, end)
                rows = build_rows(stats_df, all_defs)
                if not rows.empty:
                    year_frames.append(rows)
                marker.touch()
                print(f"    -> {len(rows)} (date, instrument) rows, {len(defs)} instruments defined")
            except Exception as e:
                print(f"    FAILED for {year}: {e} -- re-run with --resume to retry the rest, "
                      f"this year will be retried too since its marker wasn't written")
            time.sleep(0.5)  # be polite between requests

        if resume and csv_path.exists() and not year_frames:
            print(f"  nothing new to add, {csv_path.name} already up to date")
            continue

        if resume and csv_path.exists():
            existing = pd.read_csv(csv_path, parse_dates=["date"])
            existing["date"] = existing["date"].dt.date
            year_frames.append(existing)

        if not year_frames:
            print(f"  no data collected for {sym}, skipping CSV write")
            continue

        full = pd.concat(year_frames, ignore_index=True)
        full = full.drop_duplicates(subset=["date", "instrument_id"], keep="last")
        full = add_oi_change(full)
        full = full.sort_values(["date", "expiry", "strike", "right"])
        cols = ["date", "expiry", "strike", "right", "settlement", "open_interest",
                "open_interest_change", "volume", "raw_symbol", "instrument_id"]
        cols = [c for c in cols if c in full.columns]
        full[cols].to_csv(csv_path, index=False)
        print(f"  wrote {csv_path} ({len(full)} rows)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verify", action="store_true", help="cheap sanity check on one instrument -- run this first")
    ap.add_argument("--cost-only", action="store_true", help="print estimated $ cost, fetch nothing else")
    ap.add_argument("--yes", action="store_true", help="actually run the (paid) historical pull")
    ap.add_argument("--years", type=int, default=10, help="how many years back (default 10)")
    ap.add_argument("--only", type=str, default=None, help='limit to one pair, e.g. "EUR/USD"')
    ap.add_argument("--resume", action="store_true", help="skip (pair, year) chunks already marked done")
    args = ap.parse_args()

    if not (args.verify or args.cost_only or args.yes):
        ap.print_help()
        sys.exit("\nPick one of --verify, --cost-only, or --yes.")

    client = get_client()

    if args.verify:
        run_verify(client)
        return
    if args.cost_only:
        run_cost_estimate(client, args.years, args.only)
        return
    if args.yes:
        run_pull(client, args.years, args.only, args.resume)


if __name__ == "__main__":
    main()
