#!/usr/bin/env python3
"""Data-quality audit of the raw CME EUR/USD options OI export (R2: OI Data/EUR_USD.csv).

Answers the "what can/can't be inferred" questions before any analysis is trusted:
row counts, date coverage, missing-value rates per column, expiry/strike coverage,
duplicate instrument_id checks, and whether OI change / settlement / volume are
usable as-is. Writes oi_research_book/data/audit_report.json (small, committed).

Usage: python3 00_audit.py /path/to/EUR_USD.csv
"""
import sys
import json
import pandas as pd
import numpy as np

RAW = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD.csv"
OUT = "oi_research_book/data/audit_report.json"

DTYPES = {
    "strike": "float64",
    "right": "category",
    "settlement": "float64",
    "open_interest": "float64",
    "open_interest_change": "float64",
    "volume": "float64",
    "raw_symbol": "string",
    "instrument_id": "int64",
}


def main():
    print("Reading", RAW, "...")
    df = pd.read_csv(
        RAW,
        parse_dates=["date", "expiry"],
        dtype=DTYPES,
    )
    # date is tz-naive, expiry carries a UTC offset (options settle at a fixed
    # UTC time) - normalize both to tz-naive calendar timestamps before diffing.
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    df["expiry"] = pd.to_datetime(df["expiry"]).dt.tz_convert("UTC").dt.tz_localize(None)
    n = len(df)
    report = {"n_rows": int(n)}

    report["date_min"] = str(df["date"].min())
    report["date_max"] = str(df["date"].max())
    report["n_trading_days"] = int(df["date"].nunique())
    report["expiry_min"] = str(df["expiry"].min())
    report["expiry_max"] = str(df["expiry"].max())
    report["n_unique_expiries"] = int(df["expiry"].nunique())
    report["n_unique_strikes"] = int(df["strike"].nunique())
    report["n_unique_instrument_ids"] = int(df["instrument_id"].nunique())
    report["n_unique_raw_symbols"] = int(df["raw_symbol"].nunique())

    # missingness
    miss = {}
    for c in ["settlement", "open_interest", "open_interest_change", "volume"]:
        miss[c] = {
            "pct_null": float(df[c].isna().mean() * 100),
            "pct_zero": float((df[c] == 0).mean() * 100),
        }
    report["missingness"] = miss

    # does one instrument_id map to exactly one (expiry, strike, right)?
    grp = df.groupby("instrument_id")[["expiry", "strike", "right"]].nunique()
    report["instrument_id_maps_to_single_contract"] = bool(
        (grp["expiry"] == 1).all() and (grp["strike"] == 1).all() and (grp["right"] == 1).all()
    )

    # does (expiry, strike, right) map to exactly one instrument_id (i.e. no dupes/reissues)?
    grp2 = df.groupby(["expiry", "strike", "right"])["instrument_id"].nunique()
    report["contract_maps_to_single_instrument_id"] = bool((grp2 == 1).all())
    report["n_contracts_with_multiple_instrument_ids"] = int((grp2 > 1).sum())

    # duplicate rows for the same (date, instrument_id)?
    dupe_key = df.duplicated(subset=["date", "instrument_id"]).sum()
    report["n_duplicate_date_instrument_rows"] = int(dupe_key)

    # rows per day - are all expiries present every day, or sparse/rolling chain?
    rows_per_day = df.groupby("date").size()
    report["rows_per_day_min"] = int(rows_per_day.min())
    report["rows_per_day_max"] = int(rows_per_day.max())
    report["rows_per_day_median"] = float(rows_per_day.median())

    # calendar gap check: missing weekday trading dates (rough, ignores holidays)
    all_days = pd.date_range(df["date"].min(), df["date"].max(), freq="B")
    present_days = pd.DatetimeIndex(df["date"].unique()).normalize()
    missing_bdays = all_days.difference(present_days)
    report["n_missing_business_days_approx"] = int(len(missing_bdays))
    report["missing_business_days_sample"] = [str(d.date()) for d in missing_bdays[:10]]

    # OI sanity: negative OI? negative volume?
    report["n_negative_oi"] = int((df["open_interest"] < 0).sum())
    report["n_negative_volume"] = int((df["volume"] < 0).sum())
    report["max_open_interest"] = float(df["open_interest"].max())
    report["max_volume"] = float(df["volume"].max())

    # right values
    report["right_values"] = sorted(df["right"].dropna().unique().tolist())

    # DTE distribution at observation time (expiry - date), in calendar days
    dte = (df["expiry"] - df["date"]).dt.days
    report["dte_min"] = int(dte.min())
    report["dte_max"] = int(dte.max())
    report["pct_rows_dte_negative"] = float((dte < 0).mean() * 100)

    # instrument_id stability: same raw_symbol -> same instrument_id always?
    grp3 = df.groupby("raw_symbol")["instrument_id"].nunique()
    report["n_raw_symbols_with_multiple_instrument_ids"] = int((grp3 > 1).sum())

    # first row per instrument (to see if OI "starts" at a nonzero value, i.e. no
    # visibility into position build before the dataset's start)
    first_seen = df.sort_values("date").groupby("instrument_id").first()
    report["pct_instruments_first_seen_with_nonzero_oi"] = float(
        (first_seen["open_interest"] > 0).mean() * 100
    )

    with open(OUT, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(json.dumps(report, indent=2, default=str))
    print("\nWrote", OUT)


if __name__ == "__main__":
    main()
