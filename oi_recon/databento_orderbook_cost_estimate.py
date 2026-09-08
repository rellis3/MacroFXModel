#!/usr/bin/env python3
"""
Databento order-book COST ESTIMATE ONLY -- no data pulled, no credit spent.

Built for the microstructure liquidity-regression research (see chat log,
not yet a repo doc): before spending any of the Databento budget on real
MBO (every order add/modify/cancel/fill) or MBP-10 (10-level order-book
snapshots) history, this answers "what would it actually cost" using
`client.metadata.get_cost()` -- a metadata/pricing query, NOT a data
request. Verified against Databento's docs: cost estimates do not consume
account credit; only `client.timeseries.get_range()` (or the CLI
downloader) actually bills you. This script never calls either of those.

Why this exists: the OI work already spent down a meaningful chunk of this
account's Databento credit (see oi_recon/databento_oi_pull.py and its own
$1.66 --discover-all charge), so before scoping ANY new microstructure
pull, we need real numbers, not a guess. Tier 2 in the liquidity-regression
plan is full order-book depth (mbo / mbp-10) -- Databento's most expensive
schemas -- for NQ (Nasdaq futures) and the FX futures this repo already
tracks via products.py (6E/6B/6J/6A/6C/6S). This checks exactly that.

Setup: same as databento_oi_pull.py -- copy .env.example to .env in this
folder and set DATABENTO_API_KEY (or `export DATABENTO_API_KEY=...`).
NEVER hardcode a real key in this file.

Usage:
    python databento_orderbook_cost_estimate.py                       # NQ + all 6 FX futures, mbo + mbp-10, last 30 days
    python databento_orderbook_cost_estimate.py --days 5              # a cheaper 5-day pilot window
    python databento_orderbook_cost_estimate.py --days 90             # what a real research window would cost
    python databento_orderbook_cost_estimate.py --only NQ             # just Nasdaq futures
    python databento_orderbook_cost_estimate.py --schema mbp-10       # only the cheaper of the two depth schemas
    python databento_orderbook_cost_estimate.py --schema trades,tbbo  # Tier 1 pricing for comparison (much cheaper than mbo/mbp-10)
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import databento as db
except ImportError:
    sys.exit("Missing dependency -- run: pip install -r requirements.txt   (databento>=0.86)")

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_a, **_kw):
        return False

sys.path.insert(0, str(Path(__file__).parent))
from products import CME_PRODUCTS  # noqa: E402  -- reuses the same symbol registry as databento_oi_pull.py

DATASET = "GLBX.MDP3"

# Futures root per product, in the SAME order/labels products.py already
# uses for the options OI pull -- so a cost comparison against that spend
# is apples-to-apples. NQ is the one instrument this repo has a whole
# system around (NQ-QMR); the 6 FX futures are the closest CME equivalent
# to the OANDA spot pairs (note: FUTURES, not the OTC spot pairs
# themselves -- there is no order book for OANDA spot at all, see chat).
ALL_ROOTS = {p["sym"]: p["fut"] for p in CME_PRODUCTS if p["fut"] not in ("GC",)}
# GC (gold) included too since it's already tracked elsewhere in this repo
# and Databento bills it the same way -- kept separate only for --only filtering clarity.
ALL_ROOTS["XAU/USD"] = "GC"

SCHEMA_NOTES = {
    "mbo": "Tier 2 -- full market-by-order (every add/modify/cancel/fill). Most expensive.",
    "mbp-10": "Tier 2 -- 10-level order-book snapshots on each update. Cheaper than mbo, still depth data.",
    "trades": "Tier 1 -- individual trade prints only (price, size, side). No book depth.",
    "tbbo": "Tier 1 -- top-of-book quote attached to each trade. Cheapest way to get SOME quote data.",
}


def load_key():
    load_dotenv(Path(__file__).parent / ".env")
    import os
    key = os.environ.get("DATABENTO_API_KEY")
    if not key:
        sys.exit("DATABENTO_API_KEY not set. Copy .env.example to .env and fill it in, "
                 "or `export DATABENTO_API_KEY=...`. This script makes NO paid calls either way "
                 "-- get_cost() is a free pricing query -- but the SDK still requires a key to authenticate.")
    return key


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=30, help="lookback window in days (default 30)")
    ap.add_argument("--only", type=str, default=None,
                     help="comma-separated symbols from products.py (e.g. 'NAS100_USD,EUR/USD'); default = NQ + all 6 FX futures")
    ap.add_argument("--schema", type=str, default="mbo,mbp-10",
                     help="comma-separated Databento schemas to price (default: the Tier-2 pair mbo,mbp-10; "
                          "pass trades,tbbo for Tier-1 pricing instead)")
    args = ap.parse_args()

    key = load_key()
    client = db.Historical(key)

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    schemas = [s.strip() for s in args.schema.split(",") if s.strip()]

    roots = ALL_ROOTS
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        roots = {sym: fut for sym, fut in ALL_ROOTS.items() if sym in wanted}
        missing = wanted - set(roots)
        if missing:
            sys.exit(f"Unknown symbol(s) in --only: {missing}. Known: {sorted(ALL_ROOTS)}")

    print(f"Databento COST ESTIMATE ONLY -- no data pulled, no credit spent.")
    print(f"Dataset: {DATASET}   Window: {args.days}d ({start.date()} -> {end.date()})")
    print(f"Symbols: {', '.join(f'{sym} ({fut}.FUT)' for sym, fut in roots.items())}")
    print(f"Schemas: {', '.join(schemas)}\n")

    rows = []
    total = 0.0
    for schema in schemas:
        for sym, fut in roots.items():
            try:
                cost = client.metadata.get_cost(
                    dataset=DATASET,
                    symbols=[f"{fut}.FUT"],  # parent symbology REQUIRES the class suffix -- bare "NQ" 400s
                    stype_in="parent",       # ".FUT" pulls ALL expiries' front months under that root
                    schema=schema,
                    start=start,
                    end=end,
                )
            except Exception as e:
                rows.append((schema, sym, fut, None, str(e)))
                continue
            rows.append((schema, sym, fut, cost, None))
            total += cost or 0.0

    print(f"{'Schema':<10} {'Symbol':<14} {'Root':<6} {'Est. cost (USD)':>16}")
    print("-" * 52)
    for schema, sym, fut, cost, err in rows:
        if err:
            print(f"{schema:<10} {sym:<14} {fut:<6} {'ERROR: ' + err}")
        else:
            print(f"{schema:<10} {sym:<14} {fut:<6} {cost:>16.2f}")
    print("-" * 52)
    print(f"{'TOTAL':<32} {total:>16.2f}\n")

    print(f"({SCHEMA_NOTES.get(schemas[0], '')})" if len(schemas) == 1 else "")
    print("Reminder: this printed a PRICE ESTIMATE. No timeseries.get_range() call was made, "
          "so nothing above spent any Databento credit. Re-run with --days to see how cost scales "
          "before committing to a real pull.")


if __name__ == "__main__":
    main()
