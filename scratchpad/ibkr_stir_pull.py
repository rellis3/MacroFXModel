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

import sys
from pathlib import Path

try:
    from ib_insync import IB, Future, util
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


def pull_front_future(ib: IB, symbol: str, exchange: str, currency: str, label: str):
    """Finds the front (nearest-expiry, most liquid) contract for `symbol` on
    `exchange` and pulls its historical bars. Prints what it found so you can see
    which actual contract month got used."""
    # secType='CONTFUT' asks IBKR for its own continuous-contract front-month series,
    # which avoids you having to track expiries/rolls yourself.
    contract = Future(symbol=symbol, exchange=exchange, currency=currency)
    contract.secType = "CONTFUT"
    details = ib.reqContractDetails(contract)
    if not details:
        print(f"  {label}: NO CONTRACT FOUND for symbol={symbol} exchange={exchange} "
              f"-- the symbol/exchange is probably wrong, check in TWS's own contract search first")
        return None
    resolved = details[0].contract
    print(f"  {label}: resolved to {resolved.localSymbol} on {resolved.exchange} (conId {resolved.conId})")

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
    print(f"connecting to {HOST}:{PORT} ...")
    try:
        ib.connect(HOST, PORT, clientId=CLIENT_ID, timeout=15)
    except Exception as e:
        sys.exit(f"could not connect -- is TWS/Gateway open, logged in, and API enabled "
                  f"on port {PORT}? ({e})")

    print("pulling SOFR (CME SR3)...")
    sofr = pull_front_future(ib, "SR3", "CME", "USD", "SR3")
    if sofr is not None:
        sofr[["date", "close"]].rename(columns={"close": "value"}).to_csv(OUT / "sofr_sr3.csv", index=False)

    print("pulling Euribor (ICE Europe 'I')...")
    euribor = pull_front_future(ib, "I", "IFEU", "EUR", "Euribor")
    if euribor is not None:
        euribor[["date", "close"]].rename(columns={"close": "value"}).to_csv(OUT / "euribor_i.csv", index=False)

    ib.disconnect()
    print(f"\nwritten to {OUT}")


if __name__ == "__main__":
    main()
