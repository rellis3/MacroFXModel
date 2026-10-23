"""cot-trend-filter, step 1 of 2: align prices and the point-in-time COT state per day.

EXPLORATORY, NOT PRE-REGISTERED (the filter idea came from cot-extreme-duration, run on the
same data). Design is in scripts/cot-trend-filter/run.mjs; this script computes no outcome.

Inputs (both committed by cot-extreme-duration):
  analysis/output/cot-extreme-duration/prices_daily.csv  daily CME futures / ICE DXY closes
  analysis/output/cot-extreme-duration/cot_weekly.csv    CFTC TFF / Disaggregated, 2006 ->

Prices: one common business-day grid (union of all markets' dates, 2005-01-03 ->
2026-08-21, the lockbox cut), closes forward-filled over a market's own holidays (a
filled day earns a 0 return). JPY / CAD / CHF futures are inverted (1/p) into pair terms,
the same convention as scripts/cot-extreme-duration/analyse.py.

COT, per report (same as the page and cot-extreme-duration):
  share = spec net / OI; pct = round(100 * #(prior up-to-155 shares < current) / n), n >= 52
  s = pct if pct >= 50 else 100 - pct; crowd = +1 if pct >= 50 else -1
  longShare_k  = share of the 26 most recent usable reports up to and including k with
                 s >= 80 and crowd = +1 (needs all 26 with a pct); shortShare_k likewise.
Availability: report dated Tuesday T is released Friday T+3; it is used from the first
grid day strictly AFTER T+3 (the position decided at close of day d only sees reports
released before d). Reports dated inside the 2018-19 and 2025 shutdowns (released weeks
late) are dropped as if never published.

Output: analysis/output/cot-trend-filter/aligned.json
  { dates[], markets: { SYM: { closes[], crowd[], longShare[], shortShare[] } } }
  per-day COT fields are null before the first usable report.
"""
import json, os

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
SRC = os.path.join(ROOT, "analysis/output/cot-extreme-duration")
OUT = os.path.join(ROOT, "analysis/output/cot-trend-filter")
MARKETS = ["EUR", "GBP", "AUD", "JPY", "CAD", "CHF", "USD", "GOLD", "SILVER", "NQ", "ES", "TY"]
INVERT = {"JPY", "CAD", "CHF"}
START, END = pd.Timestamp("2005-01-03"), pd.Timestamp("2026-08-21")
SHUTDOWNS = [("2018-12-18", "2019-02-26"), ("2025-09-30", "2025-12-23")]


def pct_series(share):
    out = np.full(len(share), np.nan)
    for i in range(len(share)):
        prior = share[max(0, i - 155):i]
        prior = prior[np.isfinite(prior)]
        if len(prior) >= 52 and np.isfinite(share[i]):
            out[i] = round(100 * (prior < share[i]).sum() / len(prior))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    px = pd.read_csv(os.path.join(SRC, "prices_daily.csv"), parse_dates=["date"])
    px = px[(px.date >= START) & (px.date <= END)]
    wide = px.pivot_table(index="date", columns="sym", values="close").sort_index()
    wide = wide[MARKETS]
    wide = wide[wide.index.dayofweek < 5]
    for s in INVERT:
        wide[s] = 1 / wide[s]
    first_ok = wide.apply(lambda c: c.first_valid_index()).max()
    wide = wide[wide.index >= first_ok].ffill()
    assert wide.notna().all().all(), "gap left after ffill"
    dates = wide.index

    cot = pd.read_csv(os.path.join(SRC, "cot_weekly.csv"), parse_dates=["report_date"])
    cot = cot[cot.oi > 0]
    out = {"dates": [d.strftime("%Y-%m-%d") for d in dates], "markets": {}}
    for sym in MARKETS:
        c = cot[cot.sym == sym].sort_values("report_date").reset_index(drop=True)
        bad = np.zeros(len(c), bool)
        for a, b in SHUTDOWNS:
            bad |= ((c.report_date >= a) & (c.report_date <= b)).values
        c = c[~bad].reset_index(drop=True)
        share = (c.spec_net / c.oi).values
        pct = pct_series(share)
        s = np.where(pct >= 50, pct, 100 - pct)
        crowd = np.where(np.isnan(pct), 0, np.where(pct >= 50, 1, -1))
        long_hit = ((s >= 80) & (crowd == 1)).astype(float)
        short_hit = ((s >= 80) & (crowd == -1)).astype(float)
        have = np.isfinite(pct).astype(float)
        lw = pd.Series(long_hit).rolling(26).mean().to_numpy(copy=True)
        sw = pd.Series(short_hit).rolling(26).mean().to_numpy(copy=True)
        full = pd.Series(have).rolling(26).sum().values == 26
        lw[~full] = np.nan; sw[~full] = np.nan
        release = c.report_date + pd.Timedelta(days=3)
        # for each grid day, the last report released strictly before it
        k = np.searchsorted(release.values, dates.values, side="left") - 1
        cr, ls, ss = [], [], []
        for j in k:
            if j < 0 or not np.isfinite(pct[j]):
                cr.append(None); ls.append(None); ss.append(None); continue
            cr.append(int(crowd[j]))
            ls.append(None if np.isnan(lw[j]) else round(float(lw[j]), 4))
            ss.append(None if np.isnan(sw[j]) else round(float(sw[j]), 4))
        out["markets"][sym] = {"closes": [round(float(x), 8) for x in wide[sym].values], "crowd": cr,
                               "longShare": ls, "shortShare": ss}
        print(sym, "reports", len(c), "first usable day",
              next((out["dates"][i] for i, v in enumerate(ls) if v is not None), None))
    with open(os.path.join(OUT, "aligned.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("grid", out["dates"][0], "->", out["dates"][-1], len(dates), "days")


if __name__ == "__main__":
    main()
