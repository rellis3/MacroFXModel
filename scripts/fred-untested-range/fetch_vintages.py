"""fred-untested-range: fetch ALFRED first-release values for every untested FRED series (forge/FRED_UNTESTED_RANGE_PREREG.md).

output_type=4 = initial release only: one row per observation date with the realtime_start of its FIRST vintage, which
is both the point-in-time value and its publication date. Signal data only, no outcome is touched.

Run (FRED_KEY stays in Railway's store, never printed):
  cd <main checkout> && railway run <python> <this file> [OUTDIR]
Output: OUTDIR/<ID>.csv  (date,value,realtime_start)  default OUTDIR = <repo>/analysis/output/fred-untested-range/vintages
"""
import csv, json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

ALL = ("DGS1MO DGS3MO DGS6MO DGS1 DGS3 DGS5 DGS7 DGS20 DGS30 THREEFYTP10 DFII5 T5YIE T5YIFR USEPUINDXD USEPUINDXM "
          "GEPUCURRENT EPUTRADE PCEPILFE PPIFIS EFFR IORB IOER WLCFLPCL DTB3 DTWEXEMEGS DCPF3M WTREGEN WRESBAL TOTBKCR NFCI "
          "BAMLEMCBPIOAS AAA10Y BAA10Y EVZCLS OVXCLS DEXUSEU DEXJPUS DEXUSUK DEXCAUS DEXSZUS DEXUSAL DEXUSNZ DEXCHUS DHHNGSP "
          "DGORDER BAMLH0A1HYBB SWPT SOFRVOL NDFFRIW027SBOG WMTSECL1").split()
SERIES = [a for a in sys.argv[2:]] or ALL

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "analysis" / "output" / "fred-untested-range" / "vintages"
OUT.mkdir(parents=True, exist_ok=True)
key = os.environ["FRED_KEY"]


def get(sid, otype, extra=""):
    url = (f"https://api.stlouisfed.org/fred/series/observations?series_id={sid}&observation_start=2014-01-01"
           f"&observation_end=2026-08-21&file_type=json&limit=100000&output_type={otype}{extra}&api_key={key}")
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(url, timeout=180))["observations"]
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300].replace(key, "<key>")
            if attempt == 2:
                raise RuntimeError(f"{sid} HTTP {e.code} {msg}")
            time.sleep(3)


log = []
for sid in SERIES:
    try:
        rows = get(sid, 4, "&realtime_start=1776-07-04&realtime_end=9999-12-31")
        mode = "alfred_first_release"
    except RuntimeError as e:
        # > 2000 vintage dates (daily market series): first release per observation = the earliest realtime_start seen
        # across one-real-time-year windows (each window is < 2000 vintages)
        print("single-call first-release refused, chunking by real-time year:", str(e)[:80])
        best = {}
        for y in range(2014, 2027):
            try:
                chunk = get(sid, 4, f"&realtime_start={y}-01-01&realtime_end={min(f'{y}-12-31', time.strftime('%Y-%m-%d'))}")
            except RuntimeError as e2:   # e.g. series not yet in ALFRED in that real-time year
                print("  window", y, "skipped:", str(e2)[:90]); continue
            for o in chunk:
                if o["date"] not in best or o["realtime_start"] < best[o["date"]]["realtime_start"]:
                    best[o["date"]] = o
            time.sleep(0.3)
        rows = [best[k] for k in sorted(best)]
        mode = "alfred_first_release_chunked"
    with open(OUT / f"{sid}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["date", "value", "realtime_start"])
        for o in rows:
            w.writerow([o["date"], o["value"], o.get("realtime_start", "")])
    n_ok = sum(1 for o in rows if o["value"] not in (".", ""))
    log.append(dict(id=sid, mode=mode, rows=len(rows), valued=n_ok,
                    first=rows[0]["date"] if rows else None, last=rows[-1]["date"] if rows else None))
    print(sid, mode, len(rows), n_ok, log[-1]["first"], log[-1]["last"])
    time.sleep(0.6)
json.dump(log, open(OUT / f"_fetch_log{'_' + str(len(SERIES)) if len(SERIES) < len(ALL) else ''}.json", "w"), indent=1)
