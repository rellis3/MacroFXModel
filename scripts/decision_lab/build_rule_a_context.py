"""Decision Lab: the context at entry of every rule A trade (page: decision-lab.html). Exploratory, not a registered test.

    PYTHONPATH=. python scripts/decision_lab/build_rule_a_context.py

Reads the locked Forecast Line Backtest record (backtest-data/line-backtest/*.json.gz, tag lesson-track-L05) WITHOUT
changing it, takes rule A's trades (rich-day break on the chosen v3 lines, 11 instruments), and attaches what was
knowable at each entry minute from the feature store (features/*.parquet, plans/FEATURE_MANIFEST.json): every value is
the last row whose `asof` is strictly before the entry time, so nothing is looked up from the future.

Context per trade (signs aligned to the trade where a direction makes sense: + means "on the trade's side"):
  carry_3m      3-month rate of the currency bought minus the currency sold (monthly, ALFRED vintages); gold: -USD 3m
  rates_20d     20-day change in the 10-year yield gap, bought minus sold; gold and indices: minus the change in US 10y
  cot_crowd     leveraged funds' net position (share of OI) in the non-USD currency, as a z-score over the previous
                156 weekly reports, signed so + = funds already positioned the trade's way (FX only)
  vix, vix_term VIX close and VIX / VIX3M (> 1 = stressed term structure)
  usd_surpr_5d  sum of US data-surprise z-scores released in the 5 days before entry, signed to the trade's USD exposure
                (FX and gold); indices: unsigned
  plus from the record itself: IV / RV ratio, the line broken (p50 / p75), entry hour, weekday, event tag, regime.
Output: backtest-data/decision-lab/rule_a.json.gz.
"""
from __future__ import annotations

import gzip
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

SRC = Path("backtest-data/line-backtest")
FEAT = Path("features")
OUT = Path("backtest-data/decision-lab")
LDN = ZoneInfo("Europe/London")
PAIRS = {"EURUSD": ("EUR", "USD"), "GBPUSD": ("GBP", "USD"), "AUDUSD": ("AUD", "USD"), "USDCAD": ("USD", "CAD"),
         "USDCHF": ("USD", "CHF"), "USDJPY": ("USD", "JPY")}
INDICES = {"NQ", "SPX500", "US30", "US2000"}


class Store:
    def __init__(self):
        self.cache = {}

    def series(self, fid):
        if fid not in self.cache:
            p = FEAT / f"{fid}.parquet"
            if not p.exists():
                self.cache[fid] = None
            else:
                d = pd.read_parquet(p)
                d["ts"] = pd.to_datetime(d["asof"], utc=True)
                self.cache[fid] = d.sort_values("ts").reset_index(drop=True)
        return self.cache[fid]

    def at(self, fid, ts, lag_rows=0):
        d = self.series(fid)
        if d is None:
            return None
        i = int(np.searchsorted(d["ts"].values, np.datetime64(ts.replace(tzinfo=None)), side="left")) - 1 - lag_rows
        return float(d["value"].iloc[i]) if i >= 0 and pd.notna(d["value"].iloc[i]) else None

    def z_at(self, fid, ts, n=156):
        d = self.series(fid)
        if d is None:
            return None
        i = int(np.searchsorted(d["ts"].values, np.datetime64(ts.replace(tzinfo=None)), side="left")) - 1
        if i < 52:
            return None
        w = d["value"].iloc[max(0, i - n + 1):i + 1].astype(float)
        sd = w.std(ddof=1)
        return float((w.iloc[-1] - w.mean()) / sd) if sd > 0 else None


def entry_utc(d, minute):
    t = datetime.fromisoformat(d).replace(tzinfo=LDN) + timedelta(minutes=minute)
    return t.astimezone(timezone.utc)


def main():
    S = Store()
    sur = S.series("surprises")
    usd_sur = sur[sur.ccy == "US"].copy() if sur is not None else None
    out = []
    meta = {}
    for f in sorted(SRC.glob("*.json.gz")):
        r = json.load(gzip.open(f, "rt"))
        A = r["trades"].get("A", [])
        if not A:
            continue
        sym = r["inst"]
        meta[sym] = {"spread": r["spread"], "spread_assumed": r["spread_assumed"], "stops": r["stops"], "targets": r["targets"]}
        days = {d["d"]: d for d in r["days"]}
        for x in A:
            day = days[x["d"]]
            ts = entry_utc(x["d"], x["em"])
            side = x["side"]
            f_ = {}
            if sym in PAIRS:
                b, q = PAIRS[sym]
                rb, rq = S.at(f"rate3m_{b.lower()}", ts), S.at(f"rate3m_{q.lower()}", ts)
                f_["carry_3m"] = side * (rb - rq) if rb is not None and rq is not None else None
                yb, yq = S.at(f"y10_{b.lower()}", ts), S.at(f"y10_{q.lower()}", ts)
                yb0, yq0 = S.at(f"y10_{b.lower()}", ts, 20), S.at(f"y10_{q.lower()}", ts, 20)
                f_["rates_20d"] = side * ((yb - yq) - (yb0 - yq0)) if None not in (yb, yq, yb0, yq0) else None
                ccy = b if b != "USD" else q
                z = S.z_at(f"cot_lev_share_{ccy.lower()}", ts)
                ccy_dir = side if b != "USD" else -side          # + when the trade is long the non-USD currency
                f_["cot_crowd"] = ccy_dir * z if z is not None else None
                usd_dir = side if b == "USD" else -side          # + when the trade is long USD
            else:
                ru = S.at("rate3m_usd", ts)
                f_["carry_3m"] = (-side * ru) if (sym == "GOLD" and ru is not None) else None
                y, y0 = S.at("y10_usd", ts), S.at("y10_usd", ts, 20)
                f_["rates_20d"] = -side * (y - y0) if y is not None and y0 is not None else None
                f_["cot_crowd"] = None
                usd_dir = -side if sym == "GOLD" else None
            v, v3 = S.at("vix", ts), S.at("vix3m", ts)
            f_["vix"] = v
            f_["vix_term"] = v / v3 if v and v3 else None
            if usd_sur is not None:
                w = usd_sur[(usd_sur.ts < pd.Timestamp(ts)) & (usd_sur.ts >= pd.Timestamp(ts - timedelta(days=5)))]
                s5 = float(w["value"].astype(float).sum()) if len(w) else 0.0
                f_["usd_surpr_5d"] = (usd_dir * s5) if usd_dir is not None else s5
            f_["ivrv"] = day["ratio"]
            f_["hour"] = x["em"] // 60
            out.append({"inst": sym, "d": x["d"], "em": x["em"], "side": side, "line": x["line"], "ep": x["ep"], "g": x["g"],
                        "o": day["o"], "sig": day["sig"], "L": day["L"][x["line"]], "wd": day["wd"], "ev": day["ev"],
                        "reg": day["reg"], "f": {k: (round(v_, 4) if isinstance(v_, float) else v_) for k, v_ in f_.items()}})
    OUT.mkdir(parents=True, exist_ok=True)
    cov = {k: round(float(np.mean([t["f"].get(k) is not None for t in out])), 3) for k in out[0]["f"]}
    rec = {"built": "2026-10-19", "source": "backtest-data/line-backtest (tag lesson-track-L05), rule A; features/*.parquet as of entry",
           "instruments": meta, "coverage": cov, "trades": sorted(out, key=lambda t: (t["d"], t["em"]))}
    with gzip.open(OUT / "rule_a.json.gz", "wt", encoding="utf-8", compresslevel=9) as fh:
        fh.write(json.dumps(rec, separators=(",", ":")))
    print(len(out), "trades", cov)


if __name__ == "__main__":
    main()
