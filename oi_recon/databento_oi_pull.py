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
    Confirmed live 2026-09-07: GLBX.MDP3 parent symbology does not simply
    resolve "<futures root>.OPT" for every product -- a whole-dataset
    --discover-all run (one $1.66 charge, checked against all 11 products
    at once) found each one's real options asset code, now in
    ROOT_OVERRIDE below. Confidence varies by product -- see that dict's
    own header comment for which ones are solid (the 6 FX pairs, plus
    NQ/ES which turned out to already equal their futures root) versus
    which are a best-effort reading that still needs confirming
    (GC/YM/RTY -- none of their asset-code families were as clean as the
    FX pattern). CME also lists a dozen+ WEEKLY option series per product
    under their own separate asset codes -- ROOT_OVERRIDE deliberately
    picks only the standard (monthly/quarterly) one for each.
    Still unverified: whether coverage reaches back a full 10 years for
    every product, and any other real-world data quirk. Run --verify-all
    (confirms every product's pull actually returns real rows) before
    --cost-only/--yes -- --verify-all is cheap, --yes is not. Pay
    particular attention to GC/YM/RTY's rows in --verify-all's output.

Setup:
    pip install -r requirements.txt
    cp .env.example .env
    # then edit .env and set DATABENTO_API_KEY -- .env is already gitignored
    # (repo-wide ".env" pattern), same convention backtestSystem/ and
    # portfolioBacktest/ already use. NEVER hardcode a real key directly in
    # this script: that already happened once (see git history, commit "v")
    # and the exposed key had to be rotated. A shell `export
    # DATABENTO_API_KEY=...` instead of a .env file works too.

Usage:
    python databento_oi_pull.py --discover-all                # find every product's real option asset code, ONE charge
    python databento_oi_pull.py --verify                      # cheap sanity check on one instrument (EUR/USD by default)
    python databento_oi_pull.py --verify --only "GBP/USD"     # sanity check a specific pair
    python databento_oi_pull.py --verify-all                  # one-line-per-product sweep, after ROOT_OVERRIDE is filled in
    python databento_oi_pull.py --discover 6E                 # find ONE product's root manually (costs its own $ each call)
    python databento_oi_pull.py --cost-only                   # show estimated $ cost for the full pull, fetches nothing
    python databento_oi_pull.py --yes                          # run the full 10-year pull, all 11 instruments
    python databento_oi_pull.py --yes --only "EUR/USD"        # just one pair
    python databento_oi_pull.py --yes --years 2                 # shorter window while testing
    python databento_oi_pull.py --yes --resume                  # skip (pair, year) chunks already written
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

try:
    from dotenv import load_dotenv
except ImportError:                              # dotenv is optional -- a plain `export` still works
    def load_dotenv(*_a, **_kw):
        return False

# Reuses this repo's single source of truth for which 11 instruments are
# actually CME-listed (see products.py's own header/notes for the DE30/UK100
# exclusion and the JPY/CAD/CHF inverse-quote trap referenced below).
sys.path.insert(0, str(Path(__file__).parent))
from products import CME_PRODUCTS  # noqa: E402

# Loads oi_recon/.env into the environment (DATABENTO_API_KEY=...) if present
# -- same load_dotenv(dotenv_path=.../.env) convention backtestSystem/ and
# portfolioBacktest/ already use. db.Historical() (called with no args, see
# get_client() below) reads DATABENTO_API_KEY from the environment itself,
# so nothing else needs to touch the key once this line has run.
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# ── Configuration ────────────────────────────────────────────────────────────

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

# Maps a products.py futures root (e.g. "6E") to the root Databento's parent
# symbology actually resolves for that product's OPTIONS, when it differs
# from the futures root. Filled in from a live --discover-all run
# (2026-09-07) against the real GLBX.MDP3 dataset -- every CME FX product
# lists a dozen+ WEEKLY option series per underlying under their own asset
# codes (MO2/WE3/1EU/TU2/SU2/... for EUR/USD, and the same day-letter
# pattern for the others); each entry below is deliberately the STANDARD
# (American, monthly/quarterly) series, picked as the shortest/plainest
# code in that product's family -- the weeklies are out of scope unless
# added explicitly.
#
# Confidence varies by product -- HIGH for the FX pairs (a clean, exactly
# parallel pattern across all six: 3-letter currency code + "U", cleanly
# distinct from the numbered/lettered weekly codes) and for NQ/ES (their
# standard code turned out to equal the bare futures root itself -- these
# two entries are functional no-ops, included so it's explicit they were
# checked, not silently skipped). LOWER for GC/YM/RTY, whose asset-code
# families don't follow as clean a pattern -- OG/OYM/RTO are the best
# reading of --discover-all's output but unconfirmed; run
# `--verify --only "<pair>"` on these three specifically before trusting
# them in the full --yes pull.
ROOT_OVERRIDE = {
    "6E":  "EUU",   # EUR/USD    -- confirmed live: real strikes, C/P rows
    "6B":  "GBU",   # GBP/USD    -- high confidence, same FX pattern as EUU
    "6J":  "JPU",   # USD/JPY    -- high confidence, same FX pattern as EUU
    "6A":  "ADU",   # AUD/USD    -- high confidence, same FX pattern as EUU
    "6C":  "CAU",   # USD/CAD    -- high confidence, same FX pattern as EUU
    "6S":  "CHU",   # USD/CHF    -- high confidence, same FX pattern as EUU
    "GC":  "OG",    # XAU/USD    -- medium confidence: bare "OG" vs numbered "OG1".."OG4", verify
    "NQ":  "NQ",    # NAS100_USD -- confirmed: standard code equals the futures root here (explicit no-op)
    "ES":  "ES",    # SPX500_USD -- confirmed: standard code equals the futures root here (explicit no-op)
    "YM":  "OYM",   # US30_USD   -- LOW confidence: no bare "YM" appeared at all, verify before trusting
    "RTY": "RTO",   # US2000_USD -- LOW confidence: no bare "RTY" appeared at all, verify before trusting
}


def get_client():
    # No key arg -- db.Historical() reads DATABENTO_API_KEY from the
    # environment itself, already populated either by a real `export` or by
    # the load_dotenv() call above reading oi_recon/.env.
    try:
        return db.Historical()
    except Exception as e:
        sys.exit(
            f"Could not create Databento client ({e}).\n"
            "Set DATABENTO_API_KEY in oi_recon/.env (cp .env.example .env, "
            "then edit it) or export it in your shell."
        )


def get_available_end(client):
    """GLBX.MDP3's queryable range lags real-time -- these are EOD-published
    stats, so asking for end=now() throws a 422 data_end_after_available_end
    (confirmed against a live run: available end was ~07:30 UTC while a
    07:50 UTC `now()` request was rejected). Asks Databento what the actual
    end of available data is and uses THAT as the ceiling everywhere below,
    instead of guessing a fixed buffer that could be wrong either direction."""
    info = client.metadata.get_dataset_range(DATASET)
    end_str = info.get("end") or info.get("end_date")
    if not end_str:
        sys.exit(f"Could not read an 'end' from get_dataset_range({DATASET!r}) -> {info!r}")
    ts = pd.Timestamp(end_str)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts.to_pydatetime()


def year_ranges(years_back, available_end):
    """[(start, end), ...] covering the last `years_back` years up to
    `available_end`, split by calendar year so each request stays a bounded
    size and a failed run can resume year-by-year instead of re-pulling
    everything."""
    try:
        overall_start = available_end.replace(year=available_end.year - years_back)
    except ValueError:
        overall_start = available_end.replace(year=available_end.year - years_back, day=28)  # Feb 29 landing on a non-leap year
    out = []
    for y in range(overall_start.year, available_end.year + 1):
        start = max(datetime(y, 1, 1, tzinfo=timezone.utc), overall_start)
        end = min(datetime(y + 1, 1, 1, tzinfo=timezone.utc), available_end)
        if start < end:
            out.append((start, end))
    return out


def resolve_root(root):
    """The futures root as products.py has it, unless ROOT_OVERRIDE says
    Databento's options-chain root is different for this product."""
    return ROOT_OVERRIDE.get(root, root)


def fetch_definitions(client, root, start, end):
    """instrument_id -> {strike, expiration, right, raw_symbol} for every
    option instrument ever defined under this root in [start, end)."""
    df = client.timeseries.get_range(
        dataset=DATASET,
        schema="definition",
        stype_in="parent",
        symbols=[f"{resolve_root(root)}.OPT"],
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
        symbols=[f"{resolve_root(root)}.OPT"],
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


def run_verify(client, only=None):
    p = next((x for x in CME_PRODUCTS if x["sym"] == only), None) if only else CME_PRODUCTS[0]
    if p is None:
        sys.exit(f"--only {only!r} doesn't match any CME_PRODUCTS symbol.")
    root = resolve_root(p["fut"])
    end = get_available_end(client)
    start = end - pd.Timedelta(days=7)
    print(f"[verify] pulling {root}.OPT definitions + statistics for {p['sym']}, "
          f"{start.date()} .. {end.date()} (should be cheap/fast)\n")

    try:
        defs_df = client.timeseries.get_range(
            dataset=DATASET, schema="definition", stype_in="parent",
            symbols=[f"{root}.OPT"], start=start, end=end,
        ).to_df()
    except db.common.error.BentoClientError as e:
        sys.exit(
            f"{e}\n\nDatabento didn't recognize '{root}.OPT' as a parent symbol. Run:\n"
            f"    python databento_oi_pull.py --discover {p['fut']}\n"
            f"to find the real root/asset code from a live 1-day, whole-dataset definitions "
            f"pull, then add it to ROOT_OVERRIDE near the top of this script."
        )
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


def run_verify_all(client):
    """One-line-per-product sweep, not the full verbose dump --verify gives
    for a single pair -- run after ROOT_OVERRIDE is filled in (via
    --discover-all) to confirm every product's symbology actually resolves
    before committing to --yes. A short 2-day window per product, so this
    stays cheap even across all 11."""
    end = get_available_end(client)
    start = end - pd.Timedelta(days=2)
    print(f"[verify-all] {start.date()} .. {end.date()}, all {len(CME_PRODUCTS)} products\n")
    for p in CME_PRODUCTS:
        sym, root = p["sym"], resolve_root(p["fut"])
        try:
            defs_n = len(fetch_definitions(client, p["fut"], start, end))
            stats_n = len(fetch_statistics(client, p["fut"], start, end))
            flag = "OK" if defs_n and stats_n else "0 rows -- check ROOT_OVERRIDE or --discover this one"
            print(f"  {sym:12s} root={root:6s} definitions={defs_n:5d}  statistics_rows={stats_n:5d}  {flag}")
        except db.common.error.BentoClientError as e:
            print(f"  {sym:12s} root={root:6s} FAILED: {e}")
        time.sleep(0.3)
    print("\nOnce every row reads OK, run --cost-only then --yes.")


def run_discover(client, hint):
    """1-day, whole-dataset definitions pull (no root filter at all) -- for
    when parent symbology (`--verify`) comes back `symbology_invalid_request:
    Could not resolve smart symbols`, meaning Databento's real root/asset
    code for that product isn't simply the futures root from products.py.
    Pulls every instrument GLBX.MDP3 defines on the most recent available
    day and prints whichever raw_symbol/asset/underlying values contain
    `hint` (case-insensitive), so the real root can be read off directly
    instead of guessed again."""
    end = get_available_end(client)
    start = end - pd.Timedelta(days=1)
    cost = client.metadata.get_cost(dataset=DATASET, schema="definition", start=start, end=end)
    print(f"[discover] pulling ALL instrument definitions for {start.date()} .. {end.date()} "
          f"(whole dataset, ~${cost:.2f}) ...\n")

    df = client.timeseries.get_range(
        dataset=DATASET, schema="definition", start=start, end=end,
    ).to_df()
    print(f"{len(df)} instruments defined on {end.date()}\n")

    hint_u = hint.upper()
    id_cols = [c for c in ("asset", "underlying", "raw_symbol") if c in df.columns]
    if not id_cols:
        print(f"None of asset/underlying/raw_symbol are in the returned columns: {list(df.columns)}")
        return
    show_cols = [c for c in ("raw_symbol", "asset", "underlying", "instrument_class", "strike_price", "expiration") if c in df.columns]

    found_any = False
    for col in id_cols:
        matches = df[df[col].astype(str).str.upper().str.contains(hint_u, na=False, regex=False)]
        if matches.empty:
            continue
        found_any = True
        print(f"-- matches on `{col}` containing {hint!r} ({len(matches)} rows) --")
        dedup_on = [c for c in ("asset", "underlying") if c in matches.columns] or show_cols
        print(matches[show_cols].drop_duplicates(subset=dedup_on).head(20).to_string())
        print()

    if not found_any:
        print(f"No asset/underlying/raw_symbol values contain {hint!r}. Try a shorter or "
              f"different hint (e.g. the currency code instead of the futures root, or vice versa).")
        return

    print(
        "Read the real root off `asset` or `underlying` above (whichever one groups the "
        "option chain together, distinct from the outright future's own row) and add it to "
        "ROOT_OVERRIDE near the top of this script, e.g. ROOT_OVERRIDE = {\"6E\": \"<real root>\"}. "
        "Then re-run --verify."
    )


def _underlying_root(underlying):
    """Strip the trailing month-code+year-digit CME Globex contract symbols
    carry (e.g. 'Z6' in '6EZ6') to get the bare product root ('6E'). Used to
    precisely match an option's underlying future to a products.py futures
    root -- naive substring matching on 'contains 6E' wrongly lumps in
    unrelated roots that merely share characters (06E, 6EB, 6EP, M6E, ...,
    all real distinct products visible in a --discover 6E run)."""
    s = str(underlying)
    return s[:-2] if len(s) > 2 else s


def run_discover_all(client):
    """Same whole-dataset definitions pull as --discover, but paid for ONCE
    and checked against every CME_PRODUCTS futures root -- the pull already
    contains the answer for all 11 products, so there's no reason to pay
    ~$1.66 x 11 by running --discover per product. Reports each product's
    real option asset code(s), precisely matched via _underlying_root()
    rather than substring search."""
    end = get_available_end(client)
    start = end - pd.Timedelta(days=1)
    cost = client.metadata.get_cost(dataset=DATASET, schema="definition", start=start, end=end)
    print(f"[discover-all] pulling ALL instrument definitions for {start.date()} .. {end.date()} "
          f"(whole dataset, ~${cost:.2f} -- ONE charge, checked against all {len(CME_PRODUCTS)} products) ...\n")

    df = client.timeseries.get_range(
        dataset=DATASET, schema="definition", start=start, end=end,
    ).to_df()
    print(f"{len(df)} instruments defined on {end.date()}\n")

    missing = [c for c in ("underlying", "asset", "instrument_class") if c not in df.columns]
    if missing:
        print(f"Expected columns missing: {missing} (got {list(df.columns)}). "
              f"Falling back to `--discover <hint>` per product instead.")
        return

    opts = df[df["instrument_class"].isin(["C", "P"])].copy()
    opts["_root"] = opts["underlying"].map(_underlying_root)

    for p in CME_PRODUCTS:
        root, sym = p["fut"], p["sym"]
        matches = opts[opts["_root"].str.upper() == root.upper()]
        already = f" (ROOT_OVERRIDE already has {ROOT_OVERRIDE[root]!r})" if root in ROOT_OVERRIDE else ""
        print(f"=== {sym}  (futures root {root}){already} ===")
        if matches.empty:
            print("  no option instruments matched this root -- try `--discover <hint>` manually\n")
            continue
        assets = sorted(matches["asset"].astype(str).unique())
        print(f"  option asset code(s): {', '.join(assets)}")
        if len(assets) > 1:
            print(f"  ({len(assets)} distinct series found -- likely one standard + several weekly/daily "
                  f"variants; the standard one is usually the shortest/plainest-looking code, e.g. 'EUU' "
                  f"vs weekly codes like 'MO2'/'WE3'/'1EU')")
        print()

    print(
        "Add the standard (non-weekly) asset code for each product to ROOT_OVERRIDE near the top "
        "of this script, e.g. ROOT_OVERRIDE = {\"6E\": \"EUU\", \"6B\": \"...\", ...}. Then run "
        "--verify-all to sanity-check every product's definitions + statistics pull at once."
    )


def run_cost_estimate(client, years, only):
    products = [p for p in CME_PRODUCTS if only is None or p["sym"] == only]
    ranges = year_ranges(years, get_available_end(client))
    start, end = ranges[0][0], ranges[-1][1]
    total = 0.0
    for p in products:
        root = resolve_root(p["fut"])
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
    ranges = year_ranges(years, get_available_end(client))

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
    ap.add_argument("--verify-all", action="store_true",
                     help="one-line-per-product sanity sweep across all 11, after ROOT_OVERRIDE is filled in")
    ap.add_argument("--discover", type=str, default=None, metavar="HINT",
                     help="if --verify's parent symbology fails to resolve, find the real root "
                          "from a live 1-day whole-dataset definitions pull, e.g. --discover 6E")
    ap.add_argument("--discover-all", action="store_true",
                     help="same pull as --discover but paid for once and checked against all 11 "
                          "products' futures roots -- run this instead of --discover per product")
    ap.add_argument("--cost-only", action="store_true", help="print estimated $ cost, fetch nothing else")
    ap.add_argument("--yes", action="store_true", help="actually run the (paid) historical pull")
    ap.add_argument("--years", type=int, default=10, help="how many years back (default 10)")
    ap.add_argument("--only", type=str, default=None, help='limit to one pair, e.g. "EUR/USD"')
    ap.add_argument("--resume", action="store_true", help="skip (pair, year) chunks already marked done")
    args = ap.parse_args()

    if not (args.verify or args.verify_all or args.discover or args.discover_all or args.cost_only or args.yes):
        ap.print_help()
        sys.exit("\nPick one of --verify, --verify-all, --discover, --discover-all, --cost-only, or --yes.")

    client = get_client()

    if args.discover_all:
        run_discover_all(client)
        return
    if args.discover:
        run_discover(client, args.discover)
        return
    if args.verify_all:
        run_verify_all(client)
        return
    if args.verify:
        run_verify(client, only=args.only)
        return
    if args.cost_only:
        run_cost_estimate(client, args.years, args.only)
        return
    if args.yes:
        run_pull(client, args.years, args.only, args.resume)


if __name__ == "__main__":
    main()
