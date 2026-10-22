"""Daily closes from Yahoo Finance for cot-extreme-duration (read-only, no key).

The OANDA M15 store used by cot-extreme-aftermath starts in 2018; long positioning runs are
rare, so this study needs the longer daily history. Weekly analysis only: daily closes are
plenty. Futures (GC, SI, NQ, ES, ZN) are Yahoo's unadjusted front-month continuation, so a
roll adds a small jump about once a quarter; noted in RESULTS.md, not corrected.

Output: analysis/output/cot-extreme-duration/prices_daily.csv (date, sym, close)
"""
import csv, json, os, sys, time, urllib.request

# FX: the CME currency futures themselves (the contracts the COT report counts). Yahoo's spot FX
# daily "close" is a snapshot at an inconsistent time of day (checked 2026-10-22 against OANDA M15:
# weekly-return corr 0.80, vs 0.97 for futures), so spot is not used. JPY/CAD/CHF futures quote
# USD per unit of foreign currency; the analysis inverts them into pair terms.
YAHOO = {"EUR": "6E=F", "GBP": "6B=F", "AUD": "6A=F", "JPY": "6J=F", "CAD": "6C=F",
         "CHF": "6S=F", "NZD": "6N=F", "USD": "DX-Y.NYB", "GOLD": "GC=F", "SILVER": "SI=F",
         "NQ": "NQ=F", "ES": "ES=F", "TY": "ZN=F"}
P1, P2 = 1104537600, 1792800000  # 2005-01-01 .. 2026-10-23


def get(tick):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{tick}?period1={P1}&period2={P2}&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for k in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["chart"]["result"][0]
        except Exception as e:
            print("retry", tick, e, file=sys.stderr); time.sleep(2 ** k)
    raise SystemExit("failed " + tick)


def main():
    out = os.path.join(os.path.dirname(__file__), "../../analysis/output/cot-extreme-duration/prices_daily.csv")
    rows = []
    for sym, tick in YAHOO.items():
        r = get(tick)
        ts, cl = r["timestamp"], r["indicators"]["quote"][0]["close"]
        n = 0
        for t, c in zip(ts, cl):
            if c is None or c <= 0:
                continue
            d = time.strftime("%Y-%m-%d", time.gmtime(t + 12 * 3600))  # Yahoo stamps the session start; shift to its date
            rows.append({"date": d, "sym": sym, "close": c}); n += 1
        print(sym, tick, n, rows[-n]["date"], rows[-1]["date"])
        time.sleep(1)
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "sym", "close"]); w.writeheader(); w.writerows(rows)


if __name__ == "__main__":
    main()
