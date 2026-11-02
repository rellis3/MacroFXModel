#!/usr/bin/env python3
"""Daily closes 2016-01 -> today for the swing-leg-baserates look-back (exploratory).

Source: Yahoo daily (no key). Not used for sigma ladders (data-rules: Yahoo cash-index sigma is a known fault);
here it only feeds multi-week swing legs on closes. Every series that the repo also holds as OANDA M15
(analysis/output/rates_residual/m15/) is cross-checked against it by check_vs_m15.py.
Writes analysis/output/swing-leg-baserates/daily/<KEY>.csv (date,open,high,low,close).
"""
import json, os, sys, time, urllib.request, urllib.parse
OUT = "analysis/output/swing-leg-baserates/daily"
TICKERS = {
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "USDJPY=X", "AUDUSD": "AUDUSD=X", "USDCAD": "USDCAD=X",
    "USDCHF": "USDCHF=X", "NZDUSD": "NZDUSD=X", "EURGBP": "EURGBP=X", "EURJPY": "EURJPY=X", "GBPJPY": "GBPJPY=X",
    "AUDJPY": "AUDJPY=X", "EURCHF": "EURCHF=X", "XAUUSD": "GC=F", "XAGUSD": "SI=F",
    "NAS100": "^NDX", "SPX500": "^GSPC", "DE30": "^GDAXI", "UK100": "^FTSE",
}
P1, P2 = 1451606400, int(time.time())          # 2016-01-01 -> now
os.makedirs(OUT, exist_ok=True)
for key, t in TICKERS.items():
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(t)}?period1={P1}&period2={P2}&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            j = json.load(urllib.request.urlopen(req, timeout=30)); break
        except Exception as e:
            if attempt == 3: print(key, "FAILED", e); j = None
            time.sleep(2 ** attempt)
    if not j: continue
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    rows = []
    for ts, o, h, l, c in zip(r["timestamp"], q["open"], q["high"], q["low"], q["close"]):
        if None in (o, h, l, c) or c <= 0: continue
        d = time.strftime("%Y-%m-%d", time.gmtime(ts + r["meta"].get("gmtoffset", 0)))
        rows.append(f"{d},{o},{h},{l},{c}")
    dedup = {}
    for row in rows: dedup[row[:10]] = row           # last print of a date wins (Yahoo can emit a live partial bar)
    with open(f"{OUT}/{key}.csv", "w") as f:
        f.write("date,open,high,low,close\n" + "\n".join(dedup[d] for d in sorted(dedup)) + "\n")
    print(key, len(dedup), min(dedup), max(dedup))
    time.sleep(0.7)
