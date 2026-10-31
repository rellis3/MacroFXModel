"""residual-pca-family: universes and condition tags (inputs only, no outcomes).

Universes (columns of a log-return frame, from panel_daily.csv):
  fx8     USD EUR GBP AUD NZD JPY CAD CHF   (currency vs USD; USD = 0), 2016-01 -> 2026-08-20
  wide10  fx8 + XAU + XAG (metal vs USD),                                2018-01 -> 2026-08-20
  idx6    NAS100 SPX500 US30 US2000 DE30 UK100 (local-currency CFD),     2016-01 -> 2026-08-20

Tags (boolean, indexed by SIGNAL date t = the close the displacement is measured at):
  news[t, c]      ForexFactory high-impact event for currency c on the calendar date of
                  NY day t or of the previous panel row (t-1). FF repaired dates
                  (forge/ff_calendar.py). Coverage ends 2025-04-07 -> T1 uses t <= 2025-04-04.
  monthend[t]     t is the last panel row of its calendar month (the WM/R 4pm London fix
                  has printed by the 17:00 NY close).
  crowd[t, c]     +1 / -1 / 0: CFTC speculative net share of OI (non-commercial, CME futures;
                  USD = the ICE dollar index) at a prior-only 3-year percentile >= 90 / <= 10
                  (same _rank_prior as scripts/cot-crowding-programme/panel.py: 155 prior
                  weeks, >= 52 needed). Known from report_date + 3 days (release Friday 15:30 ET,
                  before the 17:00 ET close). Signal days in the shutdown back-logs
                  (2018-12-21 -> 2019-03-08, 2025-10-01 -> 2026-01-31) are excluded (NaN).
"""
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
PANEL = os.path.join(ROOT, "analysis/output/residual-pca-family/panel_daily.csv")

FX8 = ["USD", "EUR", "GBP", "AUD", "NZD", "JPY", "CAD", "CHF"]
PAIR_TERMS = {"JPY", "CAD", "CHF"}   # stored as USD/xxx in cot_weekly.csv (fetch_cot.py MARKETS flip=True)
CCY_PAIR = {"EUR": ("EURUSD", 1), "GBP": ("GBPUSD", 1), "AUD": ("AUDUSD", 1), "NZD": ("NZDUSD", 1),
            "JPY": ("USDJPY", -1), "CAD": ("USDCAD", -1), "CHF": ("USDCHF", -1)}
IDX6 = ["NAS100", "SPX500", "US30", "US2000", "DE30", "UK100"]
# Round-trip cost, % of price: js/perLineStrategy.js PAIR_COST_PCT (house table). XAG has no
# house entry: 0.08% fixed here in advance (OANDA XAG/USD typical ~2.5c on ~$25-30).
COST = {"USD": 0.0, "EUR": 0.008, "GBP": 0.010, "AUD": 0.011, "NZD": 0.013, "JPY": 0.009, "CAD": 0.011,
        "CHF": 0.011, "XAU": 0.020, "XAG": 0.080,
        "NAS100": 0.008, "SPX500": 0.008, "US30": 0.010, "US2000": 0.015, "DE30": 0.012, "UK100": 0.015}
FF_END = pd.Timestamp("2025-04-04")
SHUTDOWNS = [(pd.Timestamp("2018-12-21"), pd.Timestamp("2019-03-08")),
             (pd.Timestamp("2025-10-01"), pd.Timestamp("2026-01-31"))]


def load_panel():
    return pd.read_csv(PANEL, index_col=0, parse_dates=True)


def universe(name):
    """Log returns r (rows with every instrument present; returns span any dropped day)."""
    p = load_panel()
    if name in ("fx8", "wide10"):
        cols = [v[0] for v in CCY_PAIR.values()] + (["GOLD", "XAGUSD"] if name == "wide10" else [])
        q = p[cols].dropna()
        lr = np.log(q).diff().dropna()
        r = pd.DataFrame(0.0, index=lr.index, columns=FX8 + (["XAU", "XAG"] if name == "wide10" else []))
        for c, (pair, s) in CCY_PAIR.items():
            r[c] = s * lr[pair]
        if name == "wide10":
            r["XAU"] = lr["GOLD"]
            r["XAG"] = lr["XAGUSD"]
        return r
    if name == "idx6":
        q = p[IDX6].dropna()
        return np.log(q).diff().dropna()
    raise ValueError(name)


def news_tags(index):
    from forge.ff_calendar import load_repaired
    ff = load_repaired()
    ff = ff[(ff["impact"] == "high") & ff["Currency"].isin(FX8)]
    ev = set(zip(pd.to_datetime(ff["date"]).dt.normalize(), ff["Currency"]))
    idx = pd.DatetimeIndex(index)
    prev = pd.DatetimeIndex([idx[0] - pd.Timedelta(days=1)]).append(idx[:-1])
    out = pd.DataFrame(False, index=idx, columns=FX8)
    for c in FX8:
        out[c] = [((d, c) in ev) or ((p_, c) in ev) for d, p_ in zip(idx, prev)]
    out = out.astype(float)
    out.loc[out.index > FF_END] = np.nan
    return out


def monthend_tags(index):
    idx = pd.DatetimeIndex(index)
    s = pd.Series(idx, index=idx)
    last = s.groupby([idx.year, idx.month]).transform("max")
    return pd.Series(idx == last.values, index=idx)


def _rank_prior(x, i, win=155, lo=52):
    p = x[max(0, i - win):i]
    p = p[np.isfinite(p)]
    return 100 * (p < x[i]).sum() / len(p) if len(p) >= lo and np.isfinite(x[i]) else np.nan


def crowd_tags(index):
    cot = pd.read_csv(os.path.join(ROOT, "analysis/output/cot-crowding-programme/cot_weekly.csv"),
                      parse_dates=["report_date"])
    idx = pd.DatetimeIndex(index)
    out = pd.DataFrame(np.nan, index=idx, columns=FX8)
    for c in FX8:
        d = cot[cot.sym == c].sort_values("report_date").drop_duplicates("report_date").reset_index(drop=True)
        # cot_weekly.csv stores JPY/CAD/CHF in USD/xxx PAIR terms (fetch_cot.py flips them); FX8 is
        # currency strength, so un-flip those three. Before 2026-10-31 this was missing and the crowd
        # sign was inverted for JPY/CAD/CHF (REPO_REVIEW_2026-10-31 S4; residual-pca-cot needs RE-RUN).
        sgn = -1.0 if c in PAIR_TERMS else 1.0
        sh = sgn * ((d.spec_long - d.spec_short) / d.oi).values.astype(float)
        pct = np.array([_rank_prior(sh, i) for i in range(len(sh))])
        crowd = np.where(pct >= 90, 1.0, np.where(pct <= 10, -1.0, 0.0))
        crowd[~np.isfinite(pct)] = np.nan
        rel = pd.Series(crowd, index=d.report_date + pd.Timedelta(days=3)).sort_index()
        out[c] = rel.reindex(idx, method="ffill").values
    for a, b in SHUTDOWNS:
        out.loc[(out.index >= a) & (out.index <= b)] = np.nan
    return out
