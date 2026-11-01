#!/usr/bin/env python3
"""Expiry tracker, historical: the Databento per-contract OI files re-cut into one daily series per EXPIRY
(register row `expiry-tracker`; the live, forward version is js/expiryTracker.js + js/expiryTrackStore.js).

The live capture only starts 2026-07-31. The Databento pulls in R2 `OI Data/<PAIR>.csv` (FX majors and NQ from
2020-09, ES from 2020-10; columns date, expiry, strike, right, settlement, open_interest, volume, raw_symbol) hold
the same thing back to 2020: for every trade date, every listed contract's open interest. This script turns them
into the tracker's shape: for each expiry, its per-strike book on every trade date as it counted down.

Same conventions as 01_build_daily_dataset.py, so the two never disagree:
  - contract key is (expiry, strike, right), never instrument_id (ids get reused);
  - OI forward-filled up to FFILL_LIMIT missing trade dates per contract (OI is a stock, reports have gaps);
  - inverted pairs (USD/JPY, USD/CAD, USD/CHF) have strikes inverted to the OANDA convention once, here;
  - change is the day-over-day diff of the forward-filled OI on consecutive rows of the same contract.

Outputs (oi_research_book/data/, gitignored-size files are fine to regenerate):
  expiry_track<suffix>.parquet          date, expiry, dte, strike, call_oi, put_oi, call_chg, put_chg
  expiry_track_summary<suffix>.parquet  date, expiry, dte, total_oi, centre (OI-weighted strike), top1_strike,
                                        top1_oi, top1_share, n_strikes   (one row per trade date x expiry)

No price is joined and no outcome is computed: scoring is a separate, pre-registered step.

Run (laptop or `railway run`, after fetching the CSV from R2 read-only):
  python oi_research_book/scripts/40_expiry_track_history.py "OI Data/EUR_USD.csv" EUR_USD
  python oi_research_book/scripts/40_expiry_track_history.py --selftest
"""
import sys
import os
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pair_config import cfg, suffix  # noqa: E402

FFILL_LIMIT = 5
TAIL_FRAC = 0.35      # same tail cut as js/expiryTracker.js, applied against the book's median listed strike (no price joined here)
OUTDIR = "oi_research_book/data"


def load_raw(path, inverted):
    df = pd.read_csv(path, usecols=["date", "expiry", "strike", "right", "open_interest"],
                     parse_dates=["date", "expiry"])
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()
    exp = pd.to_datetime(df["expiry"])
    if getattr(exp.dt, "tz", None) is not None:
        exp = exp.dt.tz_convert("UTC").dt.tz_localize(None)
    df["expiry"] = exp.dt.normalize()
    df["right"] = df["right"].astype(str).str.upper().str[0]
    if inverted:
        df["strike"] = 1.0 / df["strike"]
    return df[df["right"].isin(["C", "P"])]


def build(df):
    key = ["expiry", "strike", "right"]
    # A contract missing from a day's report can arrive as a NaN row or as no row at all. Put every contract on the
    # full trade-date calendar from its first appearance to its expiry so both cases forward-fill the same way.
    dates = pd.DatetimeIndex(sorted(df["date"].unique()))
    span = df.groupby(key, sort=False)["date"].min().reset_index(name="first")
    grid = []
    for e, k, r, f in span.itertuples(index=False):
        dd = dates[(dates >= f) & (dates <= e)]
        grid.append(pd.DataFrame({"expiry": e, "strike": k, "right": r, "date": dd}))
    full = pd.concat(grid, ignore_index=True) if grid else df.iloc[:0][key + ["date"]]
    df = full.merge(df.groupby(key + ["date"], as_index=False)["open_interest"].sum(min_count=1), on=key + ["date"], how="left")
    df = df.sort_values(key + ["date"]).reset_index(drop=True)
    df["oi"] = df.groupby(key, sort=False)["open_interest"].ffill(limit=FFILL_LIMIT)
    prev = df.groupby(key, sort=False)["oi"].shift(1)
    df["chg"] = np.where(prev.notna(), df["oi"] - prev, np.nan)
    df = df[df["oi"].notna() & (df["date"] <= df["expiry"])]
    wide = df.pivot_table(index=["date", "expiry", "strike"], columns="right", values=["oi", "chg"], aggfunc="first", dropna=False)
    wide.columns = [f"{'call' if r == 'C' else 'put'}_{v}" for v, r in wide.columns]
    for c in ["call_oi", "put_oi", "call_chg", "put_chg"]:
        if c not in wide:
            wide[c] = np.nan
    out = wide.reset_index()
    out[["call_oi", "put_oi"]] = out[["call_oi", "put_oi"]].fillna(0.0)
    out = out[(out["call_oi"] + out["put_oi"]) > 0]
    out["dte"] = (out["expiry"] - out["date"]).dt.days
    return out[["date", "expiry", "dte", "strike", "call_oi", "put_oi", "call_chg", "put_chg"]].sort_values(
        ["expiry", "date", "strike"]).reset_index(drop=True)


def summarise(track):
    rows = []
    for (d, e), b in track.groupby(["date", "expiry"], sort=True):
        oi = (b["call_oi"] + b["put_oi"]).to_numpy()
        k = b["strike"].to_numpy()
        if oi.sum() <= 0 or len(k) < 2:
            continue
        med = float(np.median(k))                 # by strike count, not OI: one huge tail line must not move the reference
        keep = np.abs(k / med - 1) <= TAIL_FRAC
        k, oi = k[keep], oi[keep]
        tot = oi.sum()
        if tot <= 0:
            continue
        i = int(np.argmax(oi))
        rows.append({"date": d, "expiry": e, "dte": int(b["dte"].iloc[0]), "total_oi": float(tot),
                     "centre": float((k * oi).sum() / tot), "top1_strike": float(k[i]), "top1_oi": float(oi[i]),
                     "top1_share": float(oi[i] / tot), "n_strikes": int(len(k))})
    return pd.DataFrame(rows)


def run(path, pair):
    c = cfg(pair)
    track = build(load_raw(path, c["inverted"]))
    summ = summarise(track)
    sfx = suffix(pair)
    os.makedirs(OUTDIR, exist_ok=True)
    track.to_parquet(f"{OUTDIR}/expiry_track{sfx}.parquet", index=False)
    summ.to_parquet(f"{OUTDIR}/expiry_track_summary{sfx}.parquet", index=False)
    n_exp = summ["expiry"].nunique() if len(summ) else 0
    print(f"{pair}: {len(track):,} strike rows, {len(summ):,} expiry-days, {n_exp} expiries, "
          f"{summ['date'].min() if len(summ) else '-'} -> {summ['date'].max() if len(summ) else '-'}")


def selftest():
    import tempfile
    rows = []
    days = pd.bdate_range("2026-01-05", periods=6)
    for i, d in enumerate(days):
        for k, c0, p0 in [(1.10, 100, 400), (1.12, 300, 300), (1.15, 200 + 50 * i, 10)]:
            if not (k == 1.12 and i == 2):        # one reporting gap -> must be forward-filled
                rows += [{"date": d, "expiry": "2026-01-09", "strike": k, "right": "C", "open_interest": c0},
                         {"date": d, "expiry": "2026-01-09", "strike": k, "right": "P", "open_interest": p0}]
        rows.append({"date": d, "expiry": "2026-02-06", "strike": 1.13, "right": "C", "open_interest": 50})
        rows.append({"date": d, "expiry": "2026-02-06", "strike": 1.14, "right": "P", "open_interest": 70})
    rows.append({"date": days[0], "expiry": "2026-01-09", "strike": 0.30, "right": "P", "open_interest": 10**6})   # tail hedge
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        pd.DataFrame(rows).to_csv(f.name, index=False)
        df = load_raw(f.name, inverted=False)
    t = build(df)
    s = summarise(t)
    fails = 0

    def ok(name, cond):
        nonlocal fails
        print(f"  {'ok ' if cond else 'FAIL'} {name}")
        fails += 0 if cond else 1
    jan = t[t["expiry"] == "2026-01-09"]
    ok("no rows after expiry", (t["date"] <= t["expiry"]).all())
    ok("gap forward-filled", len(jan[(jan["strike"] == 1.12) & (jan["date"] == days[2])]) == 1)
    ok("dte counts down", list(jan[jan["strike"] == 1.15]["dte"]) == [4, 3, 2, 1, 0])
    ok("change = day-over-day of filled OI", jan[jan["strike"] == 1.15]["call_chg"].dropna().eq(50).all())
    s1 = s[(s["expiry"] == "2026-01-09") & (s["date"] == days[0])].iloc[0]
    ok("tail hedge cut from the summary", s1["total_oi"] == 1310 and s1["top1_strike"] == 1.12)
    ok("two expiries tracked", s["expiry"].nunique() == 2)
    inv = load_raw(f.name, inverted=True)
    ok("inverted strikes", abs(inv["strike"].max() - 1 / 0.30) < 1e-9)
    os.unlink(f.name)
    print("all passed" if not fails else f"{fails} FAILED")
    return fails


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        sys.exit(1 if selftest() else 0)
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    run(sys.argv[1], sys.argv[2])
