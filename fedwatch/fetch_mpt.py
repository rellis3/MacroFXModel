#!/usr/bin/env python3
"""Atlanta Fed Market Probability Tracker -> KV, once a business day.

WHAT THIS IS. Market-implied probabilities for the fed funds path, from CME
3-month SOFR OPTIONS. It answers the question `rates.html` has been proxying for
with a 2-year-minus-policy-rate sum ever since it was built, and says so in its
own note: "a proper implied path needs fed funds futures, which have no free feed
this desk trusts". This is that feed, and it is free and keyless.

NOT THE SAME AS CME FEDWATCH. FedWatch reads fed funds futures and quotes a
probability per FOMC MEETING for a target range. This reads SOFR options and
quotes the distribution of the 3-month AVERAGE rate over a forward window. Very
nearly the same question, not the same instrument, and the numbers will differ by
a few points. The file does carry `Prob: hike` and `Prob: cut` directly, so the
headline is comparable; a window's probability is NOT a meeting's probability and
must not be labelled as one.

WHY IT IS WORTH STORING RATHER THAN LINKING. 883 business days of history back to
2023-03. A probability table is something to look at once; a daily series of hike
odds is something that can be TESTED -- does a sharp repricing of policy odds
precede anything in FX or the indices? That is a study, and it is the reason this
is a feed and not a bookmark.

CADENCE, MEASURED FROM THE FILE RATHER THAN THE WEBSITE'S CLAIM.
  883 distinct dates over 917 business days = 96.3%, and every one of the 34
  absences is a US market holiday (Presidents Day, Good Friday, Memorial Day,
  Juneteenth, July 4th, Labor Day). So: EVERY TRADING DAY.
  Gaps: 688 x 1 day, 160 x 3 day (Fri->Mon), 23 x 4, 11 x 2.
  Published on business day D carrying D-1's data. One observed Last-Modified
  was 14:57 GMT -- that is n=1, so this does NOT assume a publication hour.

AND SO: DO NOT GUESS THE PUBLICATION TIME, POLL. The file serves an ETag, so a
conditional GET costs ZERO BYTES when nothing has changed. run_daily.bat is
scheduled several times across the afternoon and the misses are free. The OI job
next door is the cautionary tale -- it ran at 00:36 UK for four nights capturing
settlements that did not exist yet, and looked successful doing it.

EGRESS. The workbook is 7 MB. That is nothing once a day and ruinous on a request
path, which is why this is a scheduled job writing a compact KV blob (tens of KB)
rather than anything the server fetches live. The bill here is egress, not compute.

Usage:
    python fedwatch/fetch_mpt.py            # conditional; writes KV only on change
    python fedwatch/fetch_mpt.py --force    # ignore the stored ETag
    python fedwatch/fetch_mpt.py --dry-run  # parse and print, write nothing
"""
import argparse
import datetime as dt
import io
import json
import pathlib
import sys
import urllib.request

import pandas as pd

URL = ("https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/"
       "research-and-data/data/market-probability-tracker/mpt_histdata.xlsx")
BASE = "https://macrofxmodel-production.up.railway.app"
KV_KEY = "mpt_store_v1"

# How much to keep. The point of the history is the CHANGE -- the user-facing read
# is "October hike odds went 71% -> 19% in a week", which needs a trailing series,
# not just today's number.
N_WINDOWS_FULL = 6      # windows carrying the full distribution
N_WINDOWS_SERIES = 4    # windows carrying a trailing daily series
N_SERIES_OBS = 180      # ~9 months of business days


ETAG_FILE = pathlib.Path(__file__).with_name(".mpt_etag.json")


def _etag_load():
    try:
        return json.loads(ETAG_FILE.read_text())
    except Exception:
        return {}


def _etag_save(etag, as_of, last_mod):
    try:
        ETAG_FILE.write_text(json.dumps({"etag": etag, "asOf": as_of,
                                         "lastModified": last_mod}))
    except Exception as e:
        print(f"  could not cache etag ({e}) -- next run re-downloads, harmless")


def _get(url, etag=None, last_mod=None, timeout=120):
    """Conditional GET.

    IT MUST BE If-Modified-Since, NOT If-None-Match. Measured 2026-10-05 against
    the live file with the ETag the server itself had just returned:

        If-None-Match (quoted AND unquoted)  ->  HTTP 200, 6,981,543 bytes
        If-Modified-Since                    ->  HTTP 304,         0 bytes

    The CDN serves an ETag header and then ignores it for conditional requests.
    Built on the ETag this would have pulled 7 MB on every run, three times a day,
    for ever -- and still returned correct data, so nothing would ever have flagged
    it. The ETag is still cached, but only to notice a change; the CONDITION is the
    timestamp.
    """
    req = urllib.request.Request(url, headers={"User-Agent": "MacroFXModel/1.0"})
    if last_mod:
        req.add_header("If-Modified-Since", last_mod)
    elif etag:
        req.add_header("If-None-Match", etag)
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        return r.getcode(), r.read(), r.headers.get("ETag"), r.headers.get("Last-Modified")
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return 304, None, etag, e.headers.get("Last-Modified")
        raise


def _kv_get(key):
    try:
        with urllib.request.urlopen(f"{BASE}/api/kv/get?key={key}", timeout=60) as r:
            j = json.loads(r.read().decode())
        v = (j.get("data") if isinstance(j, dict) and not j.get("miss") else None)
        return json.loads(v) if isinstance(v, str) else v
    except Exception as e:
        print(f"  kv get {key} failed ({e}) -- treating as first run")
        return None


def _kv_set(key, obj):
    # THE FIELD IS `data`, NOT `value`. Sending `value` is accepted, returns
    # {"ok":true}, and stores NOTHING -- the read then comes back as the string
    # "null". A write that reports success while persisting nothing is the worst
    # shape of failure available, so this mirrors oi_recon/ingest.mjs exactly.
    body = json.dumps({"key": key, "data": obj, "timestamp": int(dt.datetime.now().timestamp() * 1000)}).encode()
    req = urllib.request.Request(f"{BASE}/api/kv/set", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.getcode(), r.read().decode()[:200]


def _chg(series, latest_date, days):
    """Value `days` calendar days before the latest, for the image's 1D/1W/1M columns.

    Takes the most recent observation AT OR BEFORE the target date rather than an
    exact match: the target routinely lands on a weekend or a holiday, and an exact
    lookup would silently return nothing on roughly three days in seven.
    """
    target = latest_date - pd.Timedelta(days=days)
    prior = series[series.index <= target]
    return None if prior.empty else float(prior.iloc[-1])


def build(xlsx_bytes):
    df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name="DATA")
    df["date"] = pd.to_datetime(df["date"])
    df["reference_start"] = pd.to_datetime(df["reference_start"])
    latest = df["date"].max()
    cur = df.loc[df["date"] == latest, "target_range"]
    current_range = str(cur.iloc[0]) if len(cur) else None

    last_rows = df[df["date"] == latest]
    windows = sorted(last_rows["reference_start"].unique())

    out_windows, out_series = [], {}
    for i, w in enumerate(windows[:N_WINDOWS_FULL]):
        wr = last_rows[last_rows["reference_start"] == w]
        fields = dict(zip(wr["field"], wr["value"]))
        dist = {k.replace("Prob: ", ""): round(float(v), 2)
                for k, v in fields.items()
                if k.startswith("Prob: ") and k not in ("Prob: hike", "Prob: cut")
                and pd.notna(v) and float(v) >= 0.05}
        hist = df[(df["reference_start"] == w) & (df["field"] == "Prob: hike")] \
            .set_index("date")["value"].sort_index()
        ref = pd.Timestamp(w).date().isoformat()
        out_windows.append({
            "ref": ref,
            "hike": round(float(fields.get("Prob: hike")), 2) if pd.notna(fields.get("Prob: hike")) else None,
            "cut": round(float(fields.get("Prob: cut")), 2) if pd.notna(fields.get("Prob: cut")) else None,
            "mean": round(float(fields.get("Rate: mean")), 2) if pd.notna(fields.get("Rate: mean")) else None,
            "mode": round(float(fields.get("Rate: mode")), 2) if pd.notna(fields.get("Rate: mode")) else None,
            "p25": round(float(fields.get("Rate: 25th percentile")), 2) if pd.notna(fields.get("Rate: 25th percentile")) else None,
            "p75": round(float(fields.get("Rate: 75th percentile")), 2) if pd.notna(fields.get("Rate: 75th percentile")) else None,
            "dist": dict(sorted(dist.items())),
            # the image's NOW / 1 DAY / 1 WEEK / 1 MONTH columns, as hike-prob deltas
            "hikeAgo": {"d1": _chg(hist, latest, 1), "w1": _chg(hist, latest, 7),
                        "m1": _chg(hist, latest, 30)},
        })
        if i < N_WINDOWS_SERIES:
            cut_s = df[(df["reference_start"] == w) & (df["field"] == "Prob: cut")] \
                .set_index("date")["value"].sort_index()
            tail = hist.tail(N_SERIES_OBS)
            out_series[ref] = [[d.date().isoformat(), round(float(v), 2),
                                round(float(cut_s.get(d, float("nan"))), 2) if pd.notna(cut_s.get(d, None)) else None]
                               for d, v in tail.items()]

    return {
        "asOf": latest.date().isoformat(),
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "Atlanta Fed Market Probability Tracker (CME 3-month SOFR options)",
        "note": "Window probabilities for the 3-month average rate. NOT per-FOMC-meeting "
                "odds -- comparable to CME FedWatch in direction, not identical in method.",
        "currentRange": current_range,
        "windows": out_windows,
        "series": out_series,
        "nDates": int(df["date"].nunique()),
        "history": {"from": df["date"].min().date().isoformat(),
                    "to": latest.date().isoformat()},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="ignore the stored ETag")
    ap.add_argument("--dry-run", action="store_true", help="parse and print, write nothing")
    a = ap.parse_args()

    # The ETag is cached in a LOCAL file, not read back from KV. /api/kv/get has its
    # own read allowlist (eod_review_v1 403s there too, and it is a perfectly live
    # key), so depending on a read-back would silently disable the conditional GET and
    # pull 7 MB every run. The file is the ETag's only job; losing it costs one
    # download.
    prev = _etag_load()
    etag = None if a.force else prev.get("etag")
    since = None if a.force else prev.get("lastModified")
    print(f"[mpt] stored asOf={prev.get('asOf')} since={since or '-'}")

    code, body, new_etag, last_mod = _get(URL, etag, since)
    print(f"[mpt] GET -> HTTP {code}  last-modified={last_mod}")
    if code == 304:
        print("[mpt] unchanged (304, zero bytes) -- nothing to do")
        return 0
    print(f"[mpt] downloaded {len(body):,} bytes, parsing")

    payload = build(body)
    payload["etag"] = new_etag
    payload["lastModified"] = last_mod
    size = len(json.dumps(payload))
    w0 = payload["windows"][0] if payload["windows"] else {}
    print(f"[mpt] asOf={payload['asOf']}  current={payload['currentRange']}  "
          f"windows={len(payload['windows'])}  payload={size:,}B")
    print(f"[mpt] nearest window {w0.get('ref')}: hike {w0.get('hike')}%  cut {w0.get('cut')}%  "
          f"(1w ago {w0.get('hikeAgo', {}).get('w1')}%)")

    # A parse that produced nothing must not overwrite a good store with an empty one.
    if not payload["windows"]:
        print("[mpt] REFUSING to write: no windows parsed")
        return 1
    if a.dry_run:
        print("[mpt] --dry-run, not writing")
        return 0

    status, resp = _kv_set(KV_KEY, payload)
    print(f"[mpt] POST /api/kv/set {KV_KEY} -> HTTP {status} {resp}")
    # only cache the ETag once the write SUCCEEDED, or a failed run would mark the
    # file as seen and never retry it
    if status == 200:
        _etag_save(new_etag, payload["asOf"], last_mod)
    return 0 if status == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
