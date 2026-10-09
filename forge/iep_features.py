"""iep_features — point-in-time cross-asset and macro features for forge/INTRADAY_EXTREME_PATHS_PREREG.md (Stage 2).

    python -m forge.iep_features

Rows: the Stage 0 event table, dates 2016-01-01 .. 2024-12-31 only (Discovery + Validation; nothing from 2025 on is
read). Writes data/iep/features_2016_2024.parquet keyed (inst, date, h) and an integrity report
analysis/output/intraday_extreme_paths/STAGE2_DATA.md. Availability rules (all strictly before the decision time):

cross-asset (same decision minute, from the event table itself; market prices, never revised)
  usdfac   mean over the 7 USD majors (excluding the row's own instrument) of s_pair * D_pair, s = +1 for USDxxx, -1 for xxxUSD;
           a pair counts only if its decision bar is <= 15 min old; missing if fewer than 4 count.
  riskfac  mean D of NQ, SPX500, US30 (excluding own), each <= 15 min old; missing if none.
  r2y/r10y US 2y / 10y bond-CFD 1 h move in bp of price, sign flipped so + = yields up. M15 bars are stamped at their OPEN
           (UTC); a bar is usable once it has CLOSED (open + 15 min <= decision). Last usable bar must have closed within 30 min
           of the decision, and the bar 1 h earlier likewise; otherwise missing. Coverage starts 2018-01.
macro (daily, published before the session date d)
  vix, vix3m  CBOE closes dated < d (CBOE final values; the close for d prints after 21:15 London, later than every checkpoint).
  dgs2, dgs10 FRED vintages: the latest observation whose FIRST publication (ALFRED realtime_start) is < d, at its first-print
           value. slope = dgs10 - dgs2; d2y63 = dgs2 - dgs2 63 observations earlier (both PIT).
  iv       CME CVOL settle dated < d (7 instruments; EURUSD/GBPUSD/USDJPY/GOLD from 2016, AUD/CAD/CHF from 2018-10). iv_sig = cvol / sig.
  event    ForexFactory repaired calendar (forge/ff_calendar.py), scheduled tag for the session date and the instrument's
           currencies: tier1 (FOMC/NFP/CPI) / high / none. Schedules are public in advance; the impact label is the archive's
           (a later relabel cannot be ruled out: documented limitation). Archive ends 2025-04-07.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, OUT, SUM, cls_of
from forge import ff_calendar

REPO = OUT.parents[1]
END = "2025-01-01"
MAJ = {"EURUSD": -1, "GBPUSD": -1, "AUDUSD": -1, "NZDUSD": -1, "USDCAD": 1, "USDCHF": 1, "USDJPY": 1}
S_USD = MAJ | {"GOLD": -1}  # instrument's sign vs the dollar; 0 for crosses and indices
RISK = ("NQ", "SPX500", "US30")
CVOL = {"EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDJPY": "USDJPY", "AUDUSD": "AUDUSD", "USDCAD": "USDCAD", "USDCHF": "USDCHF",
        "GOLD": "XAUUSD"}


def load_events():
    cols = ["inst", "date", "h", "D", "stale", "sig"]
    d = pd.concat([pd.read_parquet(OUT / f"{s}.parquet", columns=cols) for s in JOBS], ignore_index=True)
    return d[d.date < END].reset_index(drop=True)


def cross_asset(d):
    ok = d.stale <= 15
    w = d[ok & d.inst.isin(MAJ)].assign(sd=lambda x: x.D * x.inst.map(MAJ))
    tot = w.groupby(["date", "h"]).sd.agg(["sum", "count"]).rename(columns={"sum": "usum", "count": "un"})
    r = d[ok & d.inst.isin(RISK)].groupby(["date", "h"]).D.agg(["sum", "count"]).rename(columns={"sum": "rsum", "count": "rn"})
    x = d.join(tot, on=["date", "h"]).join(r, on=["date", "h"])
    own_u = np.where(ok & x.inst.isin(MAJ), x.D * x.inst.map(MAJ).fillna(0), 0.0)
    own_un = (ok & x.inst.isin(MAJ)).astype(int)
    n_u = x.un.fillna(0) - own_un
    x["usdfac"] = np.where(n_u >= 4, (x.usum.fillna(0) - own_u) / n_u.clip(lower=1), np.nan)
    own_r = np.where(ok & x.inst.isin(RISK), x.D, 0.0)
    n_r = x.rn.fillna(0) - (ok & x.inst.isin(RISK)).astype(int)
    x["riskfac"] = np.where(n_r >= 1, (x.rsum.fillna(0) - own_r) / n_r.clip(lower=1), np.nan)
    return x[["usdfac", "riskfac"]]


def decision_utc(keys):
    loc = pd.to_datetime(keys.date) + pd.to_timedelta(keys.h, unit="h")
    return loc.dt.tz_localize("Europe/London").dt.tz_convert("UTC").dt.tz_localize(None).astype("datetime64[ns]")


def bond_moves(keys):
    out = {}
    for name, f in (("r2y", "USB02Y_USD"), ("r10y", "USB10Y_USD")):
        b = pd.read_parquet(REPO / "analysis" / "output" / "rates_residual" / "m15" / f"{f}.parquet")
        b = b[b.index < END].copy()
        b["end"] = (b.index + pd.Timedelta(minutes=15)).astype("datetime64[ns]")
        b = b.sort_values("end")[["end", "close"]]
        q = pd.DataFrame({"t": keys.ts}).reset_index()
        last = pd.merge_asof(q.sort_values("t"), b, left_on="t", right_on="end", direction="backward",
                             tolerance=pd.Timedelta(minutes=30)).set_index("index").sort_index()
        q2 = q.assign(t=q.t - pd.Timedelta(hours=1))
        prev = pd.merge_asof(q2.sort_values("t"), b, left_on="t", right_on="end", direction="backward",
                             tolerance=pd.Timedelta(minutes=30)).set_index("index").sort_index()
        out[name] = -1e4 * np.log(last.close / prev.close)  # + = price down = yields up
    return pd.DataFrame(out, index=keys.index)


def daily_asof(dates, series):
    """series: DataFrame [date (avail-before key), value cols]; value for session date d = last row with key < d."""
    q = pd.DataFrame({"d": pd.to_datetime(dates).astype("datetime64[ns]")}).reset_index()
    s = series.assign(key=pd.to_datetime(series.key).astype("datetime64[ns]")).sort_values("key")
    r = pd.merge_asof(q.sort_values("d"), s, left_on="d", right_on="key", direction="backward", allow_exact_matches=False)
    return r.set_index("index").sort_index().drop(columns=["d", "key"])


def cboe():
    def rd(n):
        x = pd.read_csv(REPO / "analysis" / "surfaces" / "cboe" / f"{n}.csv")
        return pd.DataFrame({"key": pd.to_datetime(x.DATE, format="%m/%d/%Y"), n.lower(): x.CLOSE})
    return rd("VIX").merge(rd("VIX3M"), on="key", how="outer")


def yields():
    parts = []
    for s in ("DGS2", "DGS10"):
        v = pd.read_csv(REPO / "data" / "iep_macro" / f"{s}_vintages.csv")
        v = v[v.value != "."].assign(value=lambda x: x.value.astype(float))
        first = v.sort_values("realtime_start").groupby("date").first().reset_index()  # first print and its date
        parts.append(first.rename(columns={"value": s.lower(), "realtime_start": f"pub_{s.lower()}"})[["date", s.lower(), f"pub_{s.lower()}"]])
    y = parts[0].merge(parts[1], on="date").sort_values("date").reset_index(drop=True)
    y["d2y63"] = y.dgs2 - y.dgs2.shift(63)
    # usable on session d only once published: key = publication date (strictly before d via allow_exact_matches=False)
    y["key"] = pd.to_datetime(y[["pub_dgs2", "pub_dgs10"]].max(axis=1))
    y = y.sort_values("key").drop_duplicates("key", keep="last")
    return y[["key", "dgs2", "dgs10", "d2y63", "date"]].rename(columns={"date": "yield_obs_date"})


def main():
    d = load_events()
    print("rows", len(d))
    feats = cross_asset(d)
    keys = d[["date", "h"]].copy()
    uk = keys.drop_duplicates().reset_index(drop=True)
    uk["ts"] = decision_utc(uk)
    bm = pd.concat([uk, bond_moves(uk)], axis=1)
    feats = feats.join(keys.merge(bm, on=["date", "h"], how="left")[["r2y", "r10y"]].set_index(feats.index))
    ud = pd.Series(sorted(d.date.unique()))
    mac = pd.concat([ud.rename("date"), daily_asof(ud, cboe()), daily_asof(ud, yields())], axis=1)
    mac["slope"] = mac.dgs10 - mac.dgs2
    mac["yield_lag_days"] = (pd.to_datetime(mac.date) - pd.to_datetime(mac.yield_obs_date)).dt.days
    cv = pd.read_parquet(REPO / "data" / "cvol" / "cme_cvol_eod.parquet")
    cv["key"] = cv.timestamp.dt.tz_localize(None).dt.normalize()
    ivs = []
    for inst, prod in CVOL.items():
        s = cv[cv["product"] == prod][["key", "cvol"]]
        r = daily_asof(ud, s)
        ivs.append(pd.DataFrame({"inst": inst, "date": ud, "cvol": r.cvol.to_numpy()}))
    iv = pd.concat(ivs)
    raw = ff_calendar.load_repaired()
    ev = []
    for inst in JOBS:
        tags = ff_calendar.event_tags(raw, ff_calendar.instrument_currencies(inst))
        ev.append(pd.DataFrame({"inst": inst, "date": list(tags), "bucket": list(tags.values())}))
    ev = pd.concat(ev)
    ev["date"] = pd.to_datetime(ev.date).dt.strftime("%Y-%m-%d")
    ev["event"] = np.select([ev.bucket.isin(["FOMC", "NFP", "CPI"]), ev.bucket.eq("high")], ["tier1", "high"], "none")
    out = pd.concat([d[["inst", "date", "h", "sig"]], feats], axis=1)
    out = out.merge(mac, on="date", how="left").merge(iv, on=["inst", "date"], how="left").merge(ev[["inst", "date", "event"]], on=["inst", "date"], how="left")
    out["event"] = out.event.fillna("none")
    out["iv_sig"] = out.cvol / out.sig
    out["s_usd"] = out.inst.map(S_USD).fillna(0).astype(int)
    out.drop(columns=["sig"]).to_parquet(OUT / "features_2016_2024.parquet")
    integrity(out, mac)


def integrity(out, mac):
    out["year"] = out.date.str[:4]
    cols = ["usdfac", "riskfac", "r2y", "r10y", "vix", "vix3m", "dgs2", "dgs10", "slope", "d2y63", "iv_sig"]
    cov = out.groupby("year")[cols].apply(lambda g: g.notna().mean().round(3) * 100)
    ivcov = out[out.inst.isin(CVOL)].groupby("year").iv_sig.apply(lambda s: round(100 * s.notna().mean(), 1))
    lag = mac.yield_lag_days.describe().round(2)
    hrs = out.groupby("h")[["r2y", "riskfac", "usdfac"]].apply(lambda g: g.notna().mean().round(3) * 100)
    md = ["# INTRADAY-EXTREME-PATHS - Stage 2 data integrity (features, 2016-2024)", "",
          "Availability rules: see the docstring of forge/iep_features.py. Nothing dated 2025 or later was read.", "",
          "## Coverage by year (% of all event rows with a value)", "```", cov.to_string(), "```", "",
          "IV (CVOL ÷ σ) coverage on its 7 instruments, % by year", "```", ivcov.to_string(), "```", "",
          "## Coverage by checkpoint hour (London), %", "```", hrs.to_string(), "```", "",
          "## Yield publication lag used (session date minus the observation date actually available), days", "```", lag.to_string(), "```", "",
          "## Event tags (rows)", "```", out.groupby(["year", "event"]).size().unstack().to_string(), "```"]
    (SUM / "STAGE2_DATA.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
