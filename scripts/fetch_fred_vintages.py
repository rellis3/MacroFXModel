"""Fetch every ALFRED vintage of a few daily FRED series (point-in-time check for forge/INTRADAY_EXTREME_PATHS_PREREG.md).
Run: railway run python scripts/fetch_fred_vintages.py   (FRED_KEY stays in Railway's store). Output: data/iep_macro/<id>_vintages.csv"""
import os, sys, json, urllib.request, urllib.error, csv
from pathlib import Path
OUT = Path(__file__).resolve().parents[1] / "data" / "iep_macro"
OUT.mkdir(parents=True, exist_ok=True)
key = os.environ["FRED_KEY"]
for sid in sys.argv[1:] or ["DGS2", "DGS10", "DTB3"]:
    rows = []
    for y in range(2015, 2026):  # the API caps one request at 2,000 vintage dates: one real-time year per call
        url = (f"https://api.stlouisfed.org/fred/series/observations?series_id={sid}&realtime_start={y}-01-01&realtime_end={y}-12-31"
               f"&observation_start=2015-01-01&observation_end=2024-12-31&file_type=json&limit=100000&api_key={key}")
        try:
            rows += json.load(urllib.request.urlopen(url, timeout=120))["observations"]
        except urllib.error.HTTPError as e:
            print(sid, y, "HTTP", e.code, e.read().decode()[:300].replace(key, "<key>"))
    with open(OUT / f"{sid}_vintages.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["date", "value", "realtime_start", "realtime_end"])
        for o in rows:
            w.writerow([o["date"], o["value"], o["realtime_start"], o["realtime_end"]])
    print(sid, len(rows))
