"""Shared weekly panel for cot-crowding-programme. Every phase imports this; nothing is re-derived.

One row per (market, COT report). Everything on a row is known at the release: positioning from
the report itself, price/vol/macro from data dated on or before the release Friday close.
Forward outcomes are built separately (outcomes.py) and never enter this module.

Positioning measures (all in pair terms for JPY/CAD/CHF, as /api/cot-extremes does):
  share      net spec / OI;  pct_share = rank vs prior up-to-155 reports (needs 52) -- the page's number
  z_share    (share - mean of prior 155) / sd of prior 155
  pct_raw    rank of raw net contracts (the page's 'Raw' basis)
  long_sh, short_sh   gross spec long / short as a share of OI;  lgr = log(long / short)
  d_share1, d_share4  change in share over 1 / 4 reports
  dlong4, dshort4     change in long_sh / short_sh over 4 reports (accumulation vs covering)
  oi_chg4    log change in OI over 4 reports;  oi_pct = rank of OI vs prior 155
  ltr        log(traders long / traders short)
  comm_pct   rank of commercial net share
  s = stretch (pct_share if >= 50 else 100 - pct_share); crowd = +1 long / -1 short side
  dur90, dur80 consecutive reports at s >= 90 / 80 on the same side (current included)
  frac80_26  share of the prior 26 reports at s >= 80 on the current crowd side
"""
import os
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA = os.path.join(ROOT, "analysis/output/cot-crowding-programme")
LOCKBOX = pd.Timestamp("2026-08-21")
SHUTDOWNS = [("2018-12-18", "2019-02-26"), ("2025-09-30", "2025-12-23")]
INVERT = {"JPY", "CAD", "CHF"}                      # price inverted to pair terms
CLEAN_HOLDOUT = {"MXN", "NZD", "YM", "RTY", "US", "TU", "COPPER", "PLAT", "PALL"}   # financials + metals


def _rank_prior(x, i, win=155, lo=52):
    p = x[max(0, i - win):i]
    p = p[np.isfinite(p)]
    return 100 * (p < x[i]).sum() / len(p) if len(p) >= lo and np.isfinite(x[i]) else np.nan


def _z_prior(x, i, win=155, lo=52):
    p = x[max(0, i - win):i]
    p = p[np.isfinite(p)]
    return (x[i] - p.mean()) / p.std(ddof=1) if len(p) >= lo and np.isfinite(x[i]) and p.std() > 0 else np.nan


def _streak(cond):
    out, run = np.zeros(len(cond), int), 0
    for i, c in enumerate(cond):
        run = run + 1 if c else 0
        out[i] = run
    return out


def daily_prices():
    px = pd.read_csv(os.path.join(DATA, "prices_daily.csv"), parse_dates=["date"])
    px = px[px.date <= LOCKBOX].sort_values(["sym", "date"])
    inv = px.sym.isin(INVERT)
    o, h, l, c = (px[k].copy() for k in ("open", "high", "low", "close"))
    px.loc[inv, "open"], px.loc[inv, "close"] = 1 / o[inv], 1 / c[inv]
    px.loc[inv, "high"], px.loc[inv, "low"] = 1 / l[inv], 1 / h[inv]
    return px


def build(min_weeks=260):
    cot = pd.read_csv(os.path.join(DATA, "cot_weekly.csv"), parse_dates=["report_date"])
    cot = cot[cot.oi > 0].sort_values(["sym", "report_date"])
    px = daily_prices()
    rows = []
    for sym, c in cot.groupby("sym"):
        c = c.reset_index(drop=True).copy()
        net = c.spec_long - c.spec_short
        c["share"] = net / c.oi
        c["long_sh"], c["short_sh"] = c.spec_long / c.oi, c.spec_short / c.oi
        c["lgr"] = np.log((c.spec_long + 1) / (c.spec_short + 1))
        c["ltr"] = np.log((c.traders_long + 1) / (c.traders_short + 1))
        c["comm_share"] = (c.comm_long - c.comm_short) / c.oi
        sh, nv, oi, cs = c.share.values, net.values.astype(float), c.oi.values.astype(float), c.comm_share.values
        n = len(c)
        c["pct_share"] = [_rank_prior(sh, i) for i in range(n)]
        c["z_share"] = [_z_prior(sh, i) for i in range(n)]
        c["pct_raw"] = [_rank_prior(nv, i) for i in range(n)]
        c["oi_pct"] = [_rank_prior(oi, i) for i in range(n)]
        c["comm_pct"] = [_rank_prior(cs, i) for i in range(n)]
        c["d_share1"], c["d_share4"] = c.share.diff(1), c.share.diff(4)
        c["dlong4"], c["dshort4"] = c.long_sh.diff(4), c.short_sh.diff(4)
        c["oi_chg4"] = np.log(c.oi / c.oi.shift(4))
        c["s"] = np.where(c.pct_share >= 50, c.pct_share, 100 - c.pct_share)
        c["crowd"] = np.where(c.pct_share >= 50, 1, -1)
        for k in (90, 80):
            c[f"dur{k}"] = np.maximum(_streak(((c.s >= k) & (c.crowd == 1)).values), _streak(((c.s >= k) & (c.crowd == -1)).values))
        lng, sht = ((c.s >= 80) & (c.crowd == 1)).astype(float), ((c.s >= 80) & (c.crowd == -1)).astype(float)
        c["frac80_26"] = np.where(c.crowd > 0, lng.shift(1).rolling(26, min_periods=26).mean(), sht.shift(1).rolling(26, min_periods=26).mean())
        # price at the release: first daily close on/after the release Friday (futures settle after 15:30 ET)
        p = px[px.sym == sym].set_index("date")
        rel = c.report_date + pd.Timedelta(days=3)
        j = p.index.searchsorted(rel.values, side="left")
        ok = j < len(p)
        jj = np.minimum(j, len(p) - 1)
        gap = (p.index.values[jj] - rel.values).astype("timedelta64[D]").astype(int) if len(p) else np.full(n, 99)
        good = ok & (gap <= 4)
        c["entry_date"] = np.where(good, p.index.values[jj], np.datetime64("NaT"))
        c["P"] = np.where(good, p.close.values[jj], np.nan)
        c["w"] = np.log(c.P.shift(-1) / c.P)
        c["sigma_w"] = c.w.shift(1).rolling(52, min_periods=40).std()
        for k in (4, 13, 26):
            c[f"mom{k}"] = np.log(c.P / c.P.shift(k))          # trailing, known at the release
        bad = np.zeros(n, bool)
        for a, b in SHUTDOWNS:
            bad |= ((c.report_date >= a) & (c.report_date <= b)).values
        c["ok"] = ~bad & c.pct_share.notna() & c.sigma_w.notna() & c.P.notna() & (c.entry_date <= LOCKBOX)
        rows.append(c)
    panel = pd.concat(rows, ignore_index=True)
    # history guard: markets with fewer than min_weeks scored reports are flagged, not silently used
    cnt = panel[panel.ok].groupby("sym").size()
    panel["history_ok"] = panel.sym.map(cnt).fillna(0) >= min_weeks
    return panel
