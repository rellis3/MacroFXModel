#!/usr/bin/env python3
"""Build the point-in-time feature store: features/<id>.parquet from plans/FEATURE_MANIFEST.json.

Step 1 of plans/QUANT_SYSTEM_BUILD_PLAN.md. Every row carries `asof` -- the earliest instant the value
was knowable -- stamped by the manifest's asofRule. The loader (js/harness/features.mjs) refuses any
row whose asof precedes its date, so the rules here err late, never early.

Usage:
    python analysis/features/build_features.py --list
    python analysis/features/build_features.py                  # build everything buildable
    python analysis/features/build_features.py --only px_d1_eurusd,vix
    python analysis/features/build_features.py --builder fred_vintage

Keys: OANDA from C:/QuantLab/lib/config.py (OANDA_API_KEY, OANDA_BASE_URL); FRED from RegimeV2/.env
(FRED_KEY). Neither is ever printed. The builder updates only status/rows/firstAsof/lastAsof/builtAt/
error in the manifest and leaves every other field as registered.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "plans" / "FEATURE_MANIFEST.json"
OUT = ROOT / "features"
RAILWAY = "https://macrofxmodel-production.up.railway.app"
UA = {"User-Agent": "MacroFXModel-feature-store/1.0"}

# ── keys, read quietly ────────────────────────────────────────────────────────
def oanda_key():
    sys.path.insert(0, "C:/QuantLab/lib")
    import config  # noqa: E402
    return config.OANDA_API_KEY, config.OANDA_BASE_URL.rstrip("/")

def fred_key():
    for line in (ROOT / "RegimeV2" / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"\s*FRED_KEY\s*=\s*['\"]?([^'\"\s#]+)", line)
        if m:
            return m.group(1)
    raise SystemExit("FRED_KEY not found in RegimeV2/.env")

def get_json(url, headers=None, timeout=120):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def get_text(url, timeout=120):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# ── asof rules ────────────────────────────────────────────────────────────────
def asof_close_plus_1h(date_str):            # OANDA daily close 21:00 UTC + 1h
    return f"{date_str}T22:00:00Z"

def asof_vintage(realtime_start):            # knowable from that date; stamped end of day, never early
    return f"{realtime_start}T23:59:59Z"

def asof_report_plus_3d(report_date):        # CFTC: Tuesday report, Friday 15:30 ET = 20:30 UTC
    d = datetime.strptime(report_date, "%Y-%m-%d") + timedelta(days=3)
    return d.strftime("%Y-%m-%dT20:30:00Z")

def asof_fixed_lag(date_str, days):
    d = datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=days)
    return d.strftime("%Y-%m-%dT00:00:00Z")

# ── writers ───────────────────────────────────────────────────────────────────
SERIES_COLS = ["date", "asof", "value", "vintage", "source"]

def write_series(fid, rows):
    """rows: list of dicts with date/asof/value/vintage/source. Dedupes exact repeats, keeps every vintage."""
    df = pd.DataFrame(rows, columns=SERIES_COLS)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"]).drop_duplicates(subset=["date", "asof"]).sort_values(["asof", "date"])
    # the loader's rule, checked here too so a bad builder fails loudly on its own machine
    bad = df[df["asof"] < (df["date"] + "T00:00:00Z")]
    if len(bad):
        raise RuntimeError(f"{fid}: {len(bad)} rows have asof before date, e.g. {bad.iloc[0].to_dict()}")
    OUT.mkdir(exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), OUT / f"{fid}.parquet", compression="snappy")
    return df

def write_table(fid, df):
    OUT.mkdir(exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), OUT / f"{fid}.parquet", compression="snappy")
    return df

# ── builders ──────────────────────────────────────────────────────────────────
def build_oanda_d1(e):
    key, base = oanda_key()
    inst = e["sourceRef"]
    rows, frm = [], "2000-01-01T00:00:00Z"
    while True:
        u = f"{base}/v3/instruments/{inst}/candles?granularity=D&from={frm}&count=5000&price=M"
        j = get_json(u, {"Authorization": "Bearer " + key})
        cs = [c for c in j.get("candles", []) if c.get("complete")]
        if not cs:
            break
        for c in cs:
            # OANDA stamps a daily candle at its OPEN (21:00 UTC of the previous calendar day);
            # the day it belongs to is the calendar day it closes on.
            t = datetime.strptime(c["time"][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
            day = (t + timedelta(hours=3)).strftime("%Y-%m-%d")
            rows.append({"date": day, "asof": asof_close_plus_1h(day), "value": float(c["mid"]["c"]), "vintage": None, "source": f"oanda:{inst}"})
        last = cs[-1]["time"]
        if len(cs) < 5000:
            break
        frm = last
        time.sleep(0.2)
    return write_series(e["id"], rows)

def _fred_vintages(series_id, key, obs_start="2000-01-01", yearly=False):
    """Every ALFRED vintage. Monthly series fit one call (≈310 vintage dates < the 2,000 cap);
    daily series need one real-time year per call, as scripts/fetch_fred_vintages.py does."""
    out = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    windows = [(f"{y}-01-01", min(f"{y}-12-31", today)) for y in range(2000, datetime.now(timezone.utc).year + 1)] if yearly else [("2000-01-01", "9999-12-31")]
    for rs, re_ in windows:
        u = ("https://api.stlouisfed.org/fred/series/observations?series_id=%s&realtime_start=%s&realtime_end=%s"
             "&observation_start=%s&file_type=json&limit=100000&api_key=%s") % (series_id, rs, re_, obs_start, key)
        try:
            out += get_json(u)["observations"]
        except urllib.error.HTTPError as ex:
            body = ex.read().decode(errors="replace").replace(key, "<key>")[:160]
            if ex.code == 400 and "exceeds" in body.lower() and not yearly:
                return _fred_vintages(series_id, key, obs_start, yearly=True)
            if ex.code == 400 and yearly and "does not exist in alfred" in body.lower():
                continue   # ALFRED vintage history starts later than 2000 for this series; skip the empty years
            raise RuntimeError(f"FRED {series_id} {rs}: HTTP {ex.code} {body}")
        time.sleep(0.15)
    return out

def build_fred_vintage(e):
    key = fred_key()
    sid = e["sourceRef"]
    obs = _fred_vintages(sid, key, yearly=(e.get("cadence") == "daily" or bool(e.get("yearly"))))  # yearly: one real-time year per call, for weekly series whose revisions pass the 100k row cap
    rows = []
    for o in obs:
        if o.get("value") in (None, ".", ""):
            continue
        rows.append({"date": o["date"], "asof": asof_vintage(o["realtime_start"]), "value": float(o["value"]), "vintage": o["realtime_start"], "source": f"alfred:{sid}"})
    return write_series(e["id"], rows)

def build_fred_daily(e):
    """Daily market series that do not revise (DGS10, VIX...). ALFRED keeps no vintage history for these --
    a realtime window in the past returns HTTP 400 "does not exist in ALFRED" -- so this takes the latest
    values in one call and stamps close+1h, which is the manifest rule for them anyway."""
    key = fred_key()
    sid = e["sourceRef"]
    u = ("https://api.stlouisfed.org/fred/series/observations?series_id=%s&observation_start=2000-01-01"
         "&file_type=json&limit=100000&api_key=%s") % (sid, key)
    try:
        obs = get_json(u)["observations"]
    except urllib.error.HTTPError as ex:
        raise RuntimeError(f"FRED {sid}: HTTP {ex.code} {ex.read().decode(errors='replace').replace(key, '<key>')[:160]}")
    rows = [{"date": o["date"], "asof": asof_close_plus_1h(o["date"]), "value": float(o["value"]), "vintage": o.get("realtime_start"), "source": f"fred:{sid}"}
            for o in obs if o.get("value") not in (None, ".", "")]
    return write_series(e["id"], rows)

def build_boe_iadb(e):
    """Bank Rate from the BoE IADB (daily), averaged per calendar month like js/boeSeries.js; asof = month end + 1d."""
    code = e["sourceRef"]
    u = ("https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2000&Dateto=now"
         f"&SeriesCodes={code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    txt = get_text(u)
    rd = csv.reader(io.StringIO(txt))
    hdr = next(rd)
    daily = []
    for r in rd:
        if len(r) < 2:
            continue
        try:
            d = datetime.strptime(r[0].strip(), "%d %b %Y")
            daily.append((d, float(r[1])))
        except Exception:
            continue
    if not daily:
        raise RuntimeError(f"BoE {code}: no rows parsed (header {hdr[:3]})")
    dd = pd.DataFrame(daily, columns=["d", "v"]).set_index("d")
    monthly = dd.resample("MS").mean()
    last_obs = dd.resample("MS")["v"].apply(lambda s: s.index.max())
    lag = int(re.match(r"fixed_lag:(\d+)", e["asofRule"]).group(1))
    rows = []
    for d, v in monthly["v"].items():
        # a complete month is knowable at month end + lag; the CURRENT, incomplete month only at its
        # last daily observation + lag -- never in the future
        month_end = d + pd.offsets.MonthEnd(0)
        knowable = min(month_end, last_obs[d])
        rows.append({"date": d.strftime("%Y-%m-%d"), "asof": asof_fixed_lag(knowable.strftime("%Y-%m-%d"), lag), "value": float(v), "vintage": None, "source": f"boe:{code}"})
    return write_series(e["id"], rows)

def build_cftc_tff(e):
    """The CFTC renames contracts (BRITISH POUND STERLING -> BRITISH POUND on 2022-02-08); the manifest's
    altRefs carry the prior names so one feature holds the whole history."""
    js = []
    for name in [e["sourceRef"], *e.get("altRefs", [])]:
        u = ("https://publicreporting.cftc.gov/resource/gpe5-46if.json?market_and_exchange_names=%s&$limit=5000&$order=report_date_as_yyyy_mm_dd%%20ASC"
             % urllib.parse.quote(name))
        js += get_json(u)
        time.sleep(0.2)
    rows = []
    flip = -1.0 if e.get("flip") else 1.0
    for r in js:
        d = str(r.get("report_date_as_yyyy_mm_dd", ""))[:10]
        oi = float(r.get("open_interest_all") or 0)
        if not d or oi <= 0:
            continue
        lev = float(r.get("lev_money_positions_long") or 0) - float(r.get("lev_money_positions_short") or 0)
        rows.append({"date": d, "asof": asof_report_plus_3d(d), "value": flip * lev / oi, "vintage": None, "source": "cftc:tff"})
    return write_series(e["id"], rows)

def build_surprises_api(e):
    j = get_json(f"{RAILWAY}/api/econ-surprise?history=1", timeout=300)
    rows = []
    for key, hist in (j.get("series") or {}).items():
        ccy, _, series = key.partition("|")
        for x in hist:
            ms = x.get("ms")
            if ms is None or x.get("z") is None:
                continue
            asof = iso(datetime.fromtimestamp(ms / 1000, timezone.utc))
            rows.append({"date": asof[:10], "asof": asof, "value": float(x["z"]), "ccy": ccy, "series": series,
                         "actual": x.get("actual"), "estimate": x.get("estimate"),
                         "source": "fred-vintage" if ccy == "US" else ("intl-vintage" if ccy in ("GB", "CA", "EU") else "printed")})
    df = pd.DataFrame(rows).drop_duplicates(subset=["asof", "ccy", "series"]).sort_values("asof")
    return write_table(e["id"], df)

def build_calendar_api(e):
    j = get_json(f"{RAILWAY}/api/calendar-events", timeout=300)
    ev = j.get("events") or []
    rows = []
    for x in ev:
        if (x.get("rank") or 0) < 3 or not x.get("ms"):
            continue
        t = datetime.fromtimestamp(x["ms"] / 1000, timezone.utc)
        rows.append({"date": t.strftime("%Y-%m-%d"), "asof": iso(t - timedelta(days=7)), "value": 1.0, "ccy": x.get("ccy"),
                     "series": x.get("event"), "actual": None, "estimate": None, "source": "calendar"})
    df = pd.DataFrame(rows).drop_duplicates().sort_values("asof")
    return write_table(e["id"], df)

def build_cache_hl_london(e):
    src = ROOT / e["sourceRef"]
    if not src.exists():
        raise FileNotFoundError(f"cache file missing: {src.relative_to(ROOT)}")
    df = pd.read_parquet(src)
    if not isinstance(df.index, pd.DatetimeIndex):
        raise RuntimeError("expected a DatetimeIndex on the M1 cache")
    ldn = df.tz_convert("Europe/London")
    day = ldn.index.date
    g = ldn.groupby(day)
    hi, lo, op, last_t = g["high"].max(), g["low"].min(), g["open"].first(), g.apply(lambda x: x.index.max())
    rows = []
    for d in hi.index:
        o = op[d]
        if not o or o <= 0:
            continue
        asof = (last_t[d] + pd.Timedelta(hours=1)).tz_convert("UTC")
        rows.append({"date": d.strftime("%Y-%m-%d"), "asof": asof.strftime("%Y-%m-%dT%H:%M:%SZ"), "value": float((hi[d] - lo[d]) / o), "vintage": None, "source": "m1-cache"})
    return write_series(e["id"], rows)

def build_spread_profile_api(e):
    j = get_json(f"{RAILWAY}/api/spread-profile", timeout=120)
    asof = j.get("lastAt") or iso(datetime.now(timezone.utc))
    rows = []
    for pair, p in (j.get("pairs") or {}).items():
        for h, s in (p.get("byHour") or {}).items():
            rows.append({"pair": p.get("pair") or pair.lower(), "hour": int(h), "mean": s.get("mean"), "sd": s.get("sd"), "max": s.get("max"), "n": s.get("n"), "asof": asof})
    return write_table(e["id"], pd.DataFrame(rows))

# ── funding & leverage archive (2026-10-21; plans/FUNDING_ARCHIVE.md) ─────────────────────────
def _lag_days(e):
    m = re.match(r"fixed_lag:(\d+)", e["asofRule"])
    if not m:
        raise RuntimeError(f"{e['id']}: builder needs a fixed_lag:N asofRule, got {e['asofRule']}")
    return int(m.group(1))

def build_fred_daily_lag(e):
    """Daily FRED series PUBLISHED AFTER the date they describe (SOFR, EFFR, OBFR and volumes print the next
    business morning), so close+1h would be early. asof = date + N days 00:00 UTC (fixed_lag:N)."""
    key, sid, lag = fred_key(), e["sourceRef"], _lag_days(e)
    u = ("https://api.stlouisfed.org/fred/series/observations?series_id=%s&observation_start=2000-01-01"
         "&file_type=json&limit=100000&api_key=%s") % (sid, key)
    try:
        obs = get_json(u)["observations"]
    except urllib.error.HTTPError as ex:
        raise RuntimeError(f"FRED {sid}: HTTP {ex.code} {ex.read().decode(errors='replace').replace(key, '<key>')[:160]}")
    rows = [{"date": o["date"], "asof": asof_fixed_lag(o["date"], lag), "value": float(o["value"]), "vintage": None, "source": f"fred:{sid}"}
            for o in obs if o.get("value") not in (None, ".", "")]
    return write_series(e["id"], rows)

def build_yahoo_daily(e):
    """Yahoo daily close for series FRED does not carry (MOVE). Stamped close+1h like the other daily closes."""
    sym = e["sourceRef"]
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval=1d&period1=946684800&period2=1790000000"
    j = get_json(u, {"User-Agent": "Mozilla/5.0"})["chart"]["result"][0]
    closes = j["indicators"]["quote"][0]["close"]
    rows = []
    for t, c in zip(j["timestamp"], closes):
        if c is None:
            continue
        # Yahoo stamps the session's local open; the US session date is the New York calendar day
        day = (datetime.fromtimestamp(t, timezone.utc) - timedelta(hours=4)).strftime("%Y-%m-%d")
        rows.append({"date": day, "asof": asof_close_plus_1h(day), "value": float(c), "vintage": None, "source": f"yahoo:{sym}"})
    return write_series(e["id"], rows)

def build_cftc_tff_notional(e):
    """Leveraged-fund NET position across the Treasury futures curve, in $bn of face value (contracts x face).
    `legs`: [{"names": [current, *older], "face": 100000}, ...]. Negative = net short (the basis-trade side).
    A week counts only when every leg reported, so a missing contract never looks like a smaller position."""
    by_leg = []
    for leg in e["legs"]:
        got = {}
        for name in leg["names"]:
            u = ("https://publicreporting.cftc.gov/resource/gpe5-46if.json?market_and_exchange_names=%s&$limit=5000&$order=report_date_as_yyyy_mm_dd%%20ASC"
                 % urllib.parse.quote(name))
            for r in get_json(u):
                d = str(r.get("report_date_as_yyyy_mm_dd", ""))[:10]
                if d:
                    got[d] = (float(r.get("lev_money_positions_long") or 0) - float(r.get("lev_money_positions_short") or 0)) * leg["face"] / 1e9
            time.sleep(0.2)
        by_leg.append(got)
    dates = sorted(set.intersection(*[set(g) for g in by_leg]))
    rows = [{"date": d, "asof": asof_report_plus_3d(d), "value": sum(g[d] for g in by_leg), "vintage": None, "source": "cftc:tff"} for d in dates]
    return write_series(e["id"], rows)

def build_bis_lbs_growth(e):
    """4-quarter FX-adjusted growth (%) of a BIS LBS cross-border claims series (js/bankCredit.js definition).
    sourceRef = the SDMX key with measure 'S+F'. `minus`: a second counterparty to subtract (yen lent outside
    Japan = all countries minus Japan). date = quarter end; asof = quarter end + N days (fixed_lag:N; 182 is
    the conservative two-quarter rule of forge/BANK_CREDIT_DOLLAR_PREREG.md). Latest vintage only: revises."""
    lag = _lag_days(e)
    txt = get_text(f"https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0/{e['sourceRef']}?format=csv")
    df = pd.read_csv(io.StringIO(txt))
    df["q"] = pd.PeriodIndex(df.TIME_PERIOD.str.replace("-", ""), freq="Q")
    def ser(m, cp=None):
        x = df[df.L_MEASURE == m]
        if cp:
            x = x[x.L_CP_COUNTRY == cp]
        return x.groupby("q").OBS_VALUE.sum().astype(float).sort_index()
    if e.get("minus"):
        main_cp, sub = e["mainCp"], e["minus"]
        s, f = ser("S", main_cp) - ser("S", sub), ser("F", main_cp) - ser("F", sub)
    else:
        s, f = ser("S"), ser("F")
    idx = pd.period_range(s.dropna().index.min(), s.dropna().index.max(), freq="Q")
    s, f = s.reindex(idx), f.reindex(idx)
    g = (f.rolling(4).sum() / s.shift(4) * 100)[s.shift(4) > 0].dropna()
    rows = []
    for q, v in g.items():
        qe = q.end_time.strftime("%Y-%m-%d")
        rows.append({"date": qe, "asof": asof_fixed_lag(qe, lag), "value": float(v), "vintage": None, "source": "bis:lbs"})
    return write_series(e["id"], rows)

BUILDERS = {
    "fred_daily_lag": build_fred_daily_lag, "yahoo_daily": build_yahoo_daily, "cftc_tff_notional": build_cftc_tff_notional,
    "bis_lbs_growth": build_bis_lbs_growth,
    "oanda_d1": build_oanda_d1, "fred_vintage": build_fred_vintage, "fred_daily": build_fred_daily,
    "boe_iadb": build_boe_iadb, "cftc_tff": build_cftc_tff, "surprises_api": build_surprises_api,
    "calendar_api": build_calendar_api, "cache_hl_london": build_cache_hl_london, "spread_profile_api": build_spread_profile_api,
}

# ── driver ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--only", help="comma-separated feature ids")
    ap.add_argument("--builder", help="only features using this builder")
    a = ap.parse_args()

    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    feats = m["features"]
    if a.list:
        for e in feats:
            print(f"{e['id']:24} {e['kind']:8} {e['asofRule']:18} {e.get('builder') or '-':20} {e.get('status','unbuilt'):8} {e.get('lastAsof') or ''}")
        return
    want = set(a.only.split(",")) if a.only else None
    ok = err = skip = 0
    for e in feats:
        if want and e["id"] not in want:
            continue
        if a.builder and e.get("builder") != a.builder:
            continue
        b = e.get("builder")
        if not b or e.get("status") == "gap":
            skip += 1
            continue
        fn = BUILDERS.get(b)
        if not fn:
            e.update({"status": "error", "error": f"unknown builder {b}"}); err += 1; continue
        t0 = time.time()
        try:
            df = fn(e)
            asofs = df["asof"].astype(str)
            e.update({"status": "built", "rows": int(len(df)), "firstAsof": asofs.min() if len(df) else None,
                      "lastAsof": asofs.max() if len(df) else None, "builtAt": iso(datetime.now(timezone.utc))})
            e.pop("error", None)
            ok += 1
            print(f"  built {e['id']:24} rows {len(df):7d}  {e.get('firstAsof','')[:10]} -> {e.get('lastAsof','')[:10]}  ({time.time()-t0:.1f}s)")
        except Exception as ex:
            msg = str(ex)
            for secret in ():
                msg = msg.replace(secret, "<key>")
            e.update({"status": "error", "error": msg[:240], "builtAt": iso(datetime.now(timezone.utc))})
            err += 1
            print(f"  ERROR {e['id']:24} {msg[:120]}")
        MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nbuilt {ok} · errors {err} · skipped (gap or no builder) {skip}")

if __name__ == "__main__":
    main()
