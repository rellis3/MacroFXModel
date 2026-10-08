"""
Pull intraday history for the two legs of the COG STIR spread (CME 3-month SOFR
futures, ICE 3-month Euribor futures) from a LOCAL running TWS or IB Gateway session.

This cannot be run from Claude -- it needs a live socket to YOUR TWS/Gateway, which
only exists on your own machine. Run it yourself, then hand the two CSVs back.

Setup (one-time):
  1. pip install ib_insync
  2. Open TWS or IB Gateway, log in (paper account is fine for historical data).
  3. File -> Global Configuration -> API -> Settings:
       - check "Enable ActiveX and Socket Clients"
       - note the Socket port (TWS live 7496, TWS paper 7497, Gateway live 4001,
         Gateway paper 4002 -- these are IBKR's defaults, yours may differ)
       - add 127.0.0.1 to "Trusted IPs" if it's not already there
  4. Set PORT below to match. Leave TWS/Gateway open and logged in while this runs.

What this does NOT solve for you: whether your account has (or needs) a market-data
subscription for CME and ICE Europe STIR futures. Historical data sometimes works
without a live subscription, sometimes IBKR errors asking you to subscribe -- the
script will tell you exactly which if it happens; there is no way to know in advance
without trying.

Usage:
    python scratchpad/ibkr_stir_pull.py
Output:
    scratchpad/output/sofr_sr3.csv   (date,value -- the front SR3 contract's close)
    scratchpad/output/euribor_i.csv  (date,value -- the front Euribor contract's close)
Both in the same "date,value" shape as analysis/output/yield_shape_lead/*.csv, so they
drop straight into the existing research scripts with no reshaping.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Python 3.14 no longer creates a default event loop; ib_insync's eventkit asks for one at import time
# ("There is no current event loop in thread 'MainThread'"). Create it first.
asyncio.set_event_loop(asyncio.new_event_loop())

try:
    from ib_insync import IB, ContFuture, Future, util
except ImportError:
    sys.exit("pip install ib_insync first, then re-run this.")

OUT = Path(__file__).resolve().parent / "output"
OUT.mkdir(parents=True, exist_ok=True)

HOST = "127.0.0.1"
PORT = 7497          # TWS paper default -- change to 7496 (TWS live) / 4002 (Gateway
                      # paper) / 4001 (Gateway live) if that's what your setup uses
CLIENT_ID = 7

# Bar size / how far back. '15 mins' + '6 M' is a reasonable first pull -- enough
# for a pilot the same size as tonight's 60-day Yahoo window, without hitting IBKR's
# pacing limits on a first try. Widen once this is confirmed working.
BAR_SIZE = "15 mins"
DURATION = "6 M"


def resolve_front(ib: IB, candidates, keywords, label: str):
    """Try each (symbol, exchange, currency) until IBKR knows it: its continuous front-month series first, else the
    nearest listed expiry. If none resolves, print what IBKR's own symbol search returns for `keywords` so the right
    symbol/exchange can be filled in."""
    for symbol, exchange, currency in candidates:
        for cont in (ContFuture(symbol=symbol, exchange=exchange, currency=currency),
                     Future(symbol=symbol, exchange=exchange, currency=currency)):
            try:
                details = ib.reqContractDetails(cont)
            except Exception as e:
                print(f"  {label}: {symbol}@{exchange} {cont.secType} request failed ({e})")
                details = []
            if not details:
                continue
            if cont.secType == "CONTFUT":
                resolved = details[0].contract
            else:   # every listed expiry: take the nearest
                resolved = min((d.contract for d in details), key=lambda c: c.lastTradeDateOrContractMonth)
            print(f"  {label}: resolved {symbol}@{exchange} -> {resolved.localSymbol} {resolved.secType} "
                  f"{resolved.lastTradeDateOrContractMonth} (conId {resolved.conId})")
            return resolved
        print(f"  {label}: {symbol}@{exchange} not known to IBKR")
    print(f"  {label}: nothing resolved. IBKR symbol search says:")
    for kw in keywords:
        try:
            for m in ib.reqMatchingSymbols(kw) or []:
                c = m.contract
                if "FUT" in (m.derivativeSecTypes or []) or c.secType in ("FUT", "IND"):
                    print(f"     '{kw}': symbol={c.symbol} secType={c.secType} exchange={c.primaryExchange or c.exchange} "
                          f"currency={c.currency} desc={getattr(c, 'description', '')} derivs={m.derivativeSecTypes}")
        except Exception as e:
            print(f"     '{kw}': search failed ({e})")
    return None


def pull_front_future(ib: IB, candidates, keywords, label: str):
    """Resolves the front contract and pulls its historical bars."""
    resolved = resolve_front(ib, candidates, keywords, label)
    if resolved is None:
        return None

    bars = ib.reqHistoricalData(
        resolved, endDateTime="", durationStr=DURATION, barSizeSetting=BAR_SIZE,
        whatToShow="TRADES", useRTH=False, formatDate=1,
    )
    if not bars:
        print(f"  {label}: reqHistoricalData returned NOTHING -- check for a market-data "
              f"subscription error in the TWS/Gateway log window")
        return None
    df = util.df(bars)
    print(f"  {label}: {len(df)} bars, {df['date'].iloc[0]} -> {df['date'].iloc[-1]}")
    return df


def main():
    ib = IB()
    ib.RequestTimeout = 20          # a request IBKR never answers no longer hangs forever
    print(f"connecting to {HOST}:{PORT} ...")
    try:
        ib.connect(HOST, PORT, clientId=CLIENT_ID, timeout=15, readonly=True)   # data only; skips the order-sync requests
    except Exception as e:
        sys.exit(f"could not connect -- is TWS/Gateway open, logged in, and API enabled "
                  f"on port {PORT}? ({e})")

    print("pulling SOFR 3-month futures...")
    sofr = pull_front_future(ib, [("SR3", "CME", "USD"), ("SOFR3", "CME", "USD"), ("SR3", "GLOBEX", "USD")],
                             ["SOFR", "SR3"], "SOFR")
    if sofr is not None:
        sofr[["date", "close"]].rename(columns={"close": "value"}).to_csv(OUT / "sofr_sr3.csv", index=False)

    print("pulling 3-month Euribor futures...")
    euribor = pull_front_future(ib, [("I", "ICEEU", "EUR"), ("I", "IFEU", "EUR"), ("EU3", "ICEEU", "EUR")],
                                ["Euribor", "EURIBOR"], "Euribor")
    if euribor is not None:
        euribor[["date", "close"]].rename(columns={"close": "value"}).to_csv(OUT / "euribor_i.csv", index=False)

    print("pulling 3-month ESTR futures (if IBKR lists them)...")
    estr = pull_front_future(ib, [("FST3", "EUREX", "EUR"), ("ESTR3", "EUREX", "EUR")], ["ESTR", "Euro short-term rate"], "ESTR")
    if estr is not None:
        estr[["date", "close"]].rename(columns={"close": "value"}).to_csv(OUT / "estr_3m.csv", index=False)

    ib.disconnect()
    print(f"\nwritten to {OUT}")


if __name__ == "__main__":
    main()
