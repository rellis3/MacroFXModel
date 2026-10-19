"""check_bidask.py -- is the OANDA bid/ask M1 history clean enough to price fills?

Reads data/m1_bidask/<key>_m1.parquet (written by scripts/fetch_m1_oanda.py
--price BAM --out data/m1_bidask) and the mid-only research file
VolRangeForecaster/data/m1/<key>_m1.parquet, and checks, per instrument:

  structure   timestamps parse (no 1970 rows), strictly increasing, no duplicates
  quotes      ask >= bid on every o/h/l/c; spread > 0; no NaN
  mid         mid close vs (bid_c + ask_c)/2  (OANDA's mid is NOT the exact midpoint
              of the bid/ask OHLC on highs/lows, so only the close is compared)
  seam        the bid/ask file's mid vs the research mid file on shared minutes
  coverage    share of research minutes that have a bid/ask bar
  outliers    close spread > 20x that instrument's median for the same UTC hour
  stale       runs of >= 120 consecutive bars with an identical spread

Writes analysis/output/costs/bidask_quality.json + BIDASK_QUALITY.md, and a
spread profile (median / p90 close spread, in price units and pips, per UTC hour
x weekday and per year) to analysis/output/costs/spread_profile_hist.json --
built from sessions <= 2026-08-21 only (lockbox, forge/LOCKBOX_PROTOCOL.md).
Spread is not an outcome, but the profile is the input every backtest will
price against, so it stays on the pre-lockbox side by rule.

    python scripts/costs/check_bidask.py            # every file present
    python scripts/costs/check_bidask.py eurusd gold
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
BA_DIR = ROOT / "data" / "m1_bidask"
MID_DIR = ROOT / "VolRangeForecaster" / "data" / "m1"
OUT = ROOT / "analysis" / "output" / "costs"
LOCKBOX_END = pd.Timestamp("2026-08-22")          # keep bars < this (UTC)
OUTLIER_X = 20.0
STALE_RUN = 120


def pip_size(key: str) -> float:
    if key in ("gold", "xauusd"):
        return 1.0
    if key in ("nq", "spx", "dow", "dax", "uk100", "us2000"):
        return 1.0
    return 0.01 if key.endswith("jpy") else 0.0001


def _ts(df: pd.DataFrame) -> pd.Series:
    if "time" in df.columns:
        raw = df["time"]
    elif "datetime" in df.columns:
        raw = df["datetime"]
    else:                                           # pandas metadata restored it as the index
        raw = pd.Series(df.index, index=df.index)
    t = pd.to_datetime(raw, utc=True, errors="coerce")
    return pd.Series(t.dt.tz_convert(None).to_numpy(), index=df.index)


def _runs_max(x: np.ndarray) -> int:
    if len(x) == 0:
        return 0
    change = np.flatnonzero(np.diff(x) != 0)
    edges = np.concatenate(([-1], change, [len(x) - 1]))
    return int(np.diff(edges).max())


def check(key: str) -> tuple[dict, pd.DataFrame | None]:
    f = BA_DIR / f"{key}_m1.parquet"
    df = pd.read_parquet(f)
    r: dict = {"key": key, "rows": int(len(df))}
    t = _ts(df)
    r["nat_or_1970"] = int((t.isna() | (t < pd.Timestamp("2000-01-01"))).sum())
    df = df.assign(t=t).dropna(subset=["t"])
    r["first"], r["last"] = str(df.t.min()), str(df.t.max())
    r["duplicates"] = int(df.t.duplicated().sum())
    r["non_increasing"] = int((df.t.diff().dt.total_seconds() <= 0).sum())
    df = df.drop_duplicates("t").sort_values("t").reset_index(drop=True)

    cols = [f"{s}_{k}" for s in ("bid", "ask") for k in "ohlc"]
    missing = [c for c in cols if c not in df.columns]
    if missing:
        r["error"] = f"missing columns {missing}"
        return r, None
    r["nan_quotes"] = int(df[cols].isna().any(axis=1).sum())
    df = df.dropna(subset=cols)
    crossed = np.zeros(len(df), bool)
    for k in "ohlc":
        crossed |= (df[f"ask_{k}"] < df[f"bid_{k}"]).to_numpy()
    r["crossed_bars"] = int(crossed.sum())
    sp = (df.ask_c - df.bid_c).to_numpy()
    r["zero_spread_bars"] = int((sp == 0).sum())

    pip = pip_size(key)
    mid_bc = (df.ask_c + df.bid_c) / 2
    dev = (df.close - mid_bc).abs() / pip
    r["mid_close_dev_pips"] = {"median": round(float(dev.median()), 4),
                               "p99": round(float(dev.quantile(0.99)), 4),
                               "max": round(float(dev.max()), 4)}

    hour = df.t.dt.hour
    med_h = pd.Series(sp).groupby(hour.to_numpy()).transform("median").to_numpy()
    out = sp > OUTLIER_X * np.maximum(med_h, 1e-12)
    r["outlier_bars"] = int(out.sum())
    r["outlier_examples"] = [
        {"t": str(df.t.iloc[i]), "spread_pips": round(float(sp[i] / pip), 2),
         "hour_median_pips": round(float(med_h[i] / pip), 2)}
        for i in np.flatnonzero(out)[:5]]
    r["max_stale_run_bars"] = _runs_max(np.round(sp / pip, 2))

    mid_f = MID_DIR / f"{key}_m1.parquet"
    if mid_f.exists():
        m = pd.read_parquet(mid_f)
        m = m.assign(t=_ts(m)).dropna(subset=["t"]).drop_duplicates("t")
        lo, hi = max(m.t.min(), df.t.min()), min(m.t.max(), df.t.max())
        mm = m[(m.t >= lo) & (m.t <= hi)]
        j = mm[["t", "close"]].merge(df[["t", "close"]], on="t", suffixes=("_res", "_ba"))
        r["seam"] = {"window": [str(lo), str(hi)],
                     "research_bars": int(len(mm)),
                     "coverage": round(len(j) / max(len(mm), 1), 4),
                     "close_diff_pips_max": round(float(((j.close_res - j.close_ba).abs() / pip).max()), 4) if len(j) else None,
                     "close_diff_share_nonzero": round(float(((j.close_res - j.close_ba).abs() > 1e-9).mean()), 6) if len(j) else None}
    else:
        r["seam"] = None

    clean = df.loc[~crossed & ~out, ["t"]].assign(sp=sp[~crossed & ~out])
    sp_p = clean.sp / pip
    r["spread_pips"] = {"median": round(float(sp_p.median()), 3),
                        "p90": round(float(sp_p.quantile(0.9)), 3),
                        "p99": round(float(sp_p.quantile(0.99)), 3)}
    return r, clean


def profile(key: str, clean: pd.DataFrame) -> dict:
    c = clean[clean.t < LOCKBOX_END]
    pip = pip_size(key)
    g = c.groupby([c.t.dt.weekday, c.t.dt.hour]).sp
    by_wh = {f"{w}-{h:02d}": {"med": float(v.median()), "p90": float(v.quantile(0.9)), "n": int(len(v))}
             for (w, h), v in g}
    by_year = {str(y): {"med_pips": round(float(v.median() / pip), 3), "p90_pips": round(float(v.quantile(0.9) / pip), 3)}
               for y, v in c.groupby(c.t.dt.year).sp}
    return {"pip": pip, "units": "price", "end_exclusive": str(LOCKBOX_END.date()),
            "by_weekday_hour_utc": by_wh, "by_year": by_year}


def main(keys: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    keys = keys or sorted(p.name.replace("_m1.parquet", "") for p in BA_DIR.glob("*_m1.parquet"))
    rep, prof = {}, {}
    for k in keys:
        try:
            r, clean = check(k)
        except Exception as e:                      # one bad file must not hide the rest
            r, clean = {"key": k, "error": repr(e)}, None
        rep[k] = r
        if clean is not None and len(clean):
            prof[k] = profile(k, clean)
        print(k, {x: r.get(x) for x in ("rows", "crossed_bars", "zero_spread_bars", "outlier_bars", "spread_pips")})
    (OUT / "bidask_quality.json").write_text(json.dumps(rep, indent=1))
    (OUT / "spread_profile_hist.json").write_text(json.dumps(prof))

    md = ["# Bid/ask M1 data quality", "",
          "Generated by `scripts/costs/check_bidask.py`. Outliers: close spread > 20x the instrument's median "
          "for that UTC hour (excluded from the profile, counted here).", "",
          "| key | rows | first | crossed | zero | outliers | stale run | mid dev p99 (pips) | seam coverage | seam max diff (pips) | median / p90 spread (pips) |",
          "|---|---|---|---|---|---|---|---|---|---|---|"]
    for k, r in rep.items():
        if "error" in r:
            md.append(f"| {k} | ERROR: {r['error']} |||||||||| ")
            continue
        s = r.get("seam") or {}
        md.append(f"| {k} | {r['rows']:,} | {r['first'][:10]} | {r['crossed_bars']} | {r['zero_spread_bars']} | "
                  f"{r['outlier_bars']} | {r['max_stale_run_bars']} | {r['mid_close_dev_pips']['p99']} | "
                  f"{s.get('coverage', '—')} | {s.get('close_diff_pips_max', '—')} | "
                  f"{r['spread_pips']['median']} / {r['spread_pips']['p90']} |")
    (OUT / "BIDASK_QUALITY.md").write_text("\n".join(md) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
