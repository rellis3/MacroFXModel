"""Daily OHLC from Yahoo Finance for cot-crowding-programme (read-only, no key).

Front-month continuous futures (the COT contracts themselves; FX = CME currency futures, checked
against OANDA M15 at r 0.97-0.99 in cot-extreme-duration) plus ICE DXY. Unadjusted: rolls add a
jump about once a month (energy, livestock) or quarter (financials). Outcomes are compared with
matched controls from the SAME market, so calendar-driven roll jumps hit both arms; the
'clean holdout' subset (financials + metals) is reported separately for that reason.
JPY/CAD/CHF are inverted to pair terms in the analysis, not here.

Output: analysis/output/cot-crowding-programme/prices_daily.csv (date, sym, open, high, low, close)
"""
import csv, json, os, sys, time, urllib.request

YAHOO = {"EUR": "6E=F", "GBP": "6B=F", "AUD": "6A=F", "JPY": "6J=F", "CAD": "6C=F", "CHF": "6S=F",
         "USD": "DX-Y.NYB", "NQ": "NQ=F", "ES": "ES=F", "TY": "ZN=F", "GOLD": "GC=F", "SILVER": "SI=F",
         "MXN": "6M=F", "NZD": "6N=F", "YM": "YM=F", "RTY": "RTY=F", "US": "ZB=F", "TU": "ZT=F",
         "COPPER": "HG=F", "PLAT": "PL=F", "PALL": "PA=F", "WTI": "CL=F", "NATGAS": "NG=F", "RBOB": "RB=F",
         "CORN": "ZC=F", "WHEAT": "ZW=F", "SOYB": "ZS=F", "SOYOIL": "ZL=F", "SUGAR": "SB=F", "COFFEE": "KC=F",
         "COTTON": "CT=F", "COCOA": "CC=F", "CATTLE": "LE=F", "HOGS": "HE=F"}
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
    out = os.path.join(os.path.dirname(__file__), "../../analysis/output/cot-crowding-programme/prices_daily.csv")
    rows = []
    for sym, tick in YAHOO.items():
        r = get(tick); q = r["indicators"]["quote"][0]
        n = 0
        for t, o, h, l, c in zip(r["timestamp"], q["open"], q["high"], q["low"], q["close"]):
            if None in (o, h, l, c) or min(o, h, l, c) <= 0:
                continue
            d = time.strftime("%Y-%m-%d", time.gmtime(t + 12 * 3600))  # Yahoo stamps the session start
            rows.append({"date": d, "sym": sym, "open": o, "high": h, "low": l, "close": c}); n += 1
        print(sym, tick, n, rows[-n]["date"], rows[-1]["date"]); time.sleep(1)
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "sym", "open", "high", "low", "close"]); w.writeheader(); w.writerows(rows)


if __name__ == "__main__":
    main()
