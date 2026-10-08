"""
Pull intraday history for short-term-rate futures (the legs of C.OG's SOFR vs euro short-rate spread) from a LOCAL
running TWS or IB Gateway session, and merge it into a growing archive.

This cannot be run from Claude -- it needs a live socket to YOUR TWS/Gateway, which only exists on your own machine.

Setup (one-time):
  1. pip install ib_insync
  2. Open TWS or IB Gateway, log in (paper account is fine for historical data).
  3. File -> Global Configuration -> API -> Settings:
       - check "Enable ActiveX and Socket Clients"
       - note the Socket port (TWS live 7496, TWS paper 7497, Gateway live 4001, Gateway paper 4002)
       - add 127.0.0.1 to "Trusted IPs" if it's not already there
  4. Set PORT below to match. Leave TWS/Gateway open and logged in while this runs.

Usage:
    python scratchpad/ibkr_stir_pull.py

Output: analysis/output/stir/<EXCHANGE>_<localSymbol>.csv, one file per contract (CME_SR3U6.csv, ICEEU_IZ6.csv, ...):
    time (UTC, bar START), open, high, low, close, volume, average, barCount
IBKR only serves ~6 months of 15-min history, so every run MERGES into the existing files (new bars added, overlapping
bars replaced by the newer pull). Run it every few months and the archive keeps growing. See analysis/output/stir/README.md.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

# Python 3.14 no longer creates a default event loop; ib_insync's eventkit asks for one at import time
# ("There is no current event loop in thread 'MainThread'"). Create it first.
asyncio.set_event_loop(asyncio.new_event_loop())

try:
    import pandas as pd
    from ib_insync import IB, ContFuture, Future, util
except ImportError:
    sys.exit("pip install ib_insync pandas first, then re-run this.")

ARCHIVE = Path(__file__).resolve().parents[1] / "analysis" / "output" / "stir"
ARCHIVE.mkdir(parents=True, exist_ok=True)

HOST = "127.0.0.1"
PORT = 7497          # TWS paper default -- change to 7496 (TWS live) / 4002 (Gateway paper) / 4001 (Gateway live)
CLIENT_ID = 7

BAR_SIZE = "15 mins"
DURATION = "6 M"     # about the most IBKR serves at 15 min
HIST_TIMEOUT = 600   # seconds per history request
END = ""             # "" = up to now; --end YYYY-MM-DD pulls the 6 months BEFORE that date (older history, same contracts)
# Named euro contracts for --end pulls (a continuous front cannot be asked for an end date).
EURIBOR_MONTHS = ["202612"]

# SOFR: named quarterly contracts. The front (Sep'26, SR3U6, the one on C.OG's screen) is mostly fixed already and moves
# in single 0.0025 ticks intraday; the next ones carry the market's view of coming Fed meetings. Add months as they list.
SOFR_MONTHS = ["202609", "202612", "202703", "202706"]
# FED FUNDS: 30-day futures, CBOT, and the ONLY feed that gives a per-FOMC-MEETING probability.
#
# WHY MONTHLY AND CONSECUTIVE, where SOFR above is quarterly. ZQ settles to the AVERAGE effective fed funds rate
# over its contract month, so implied rate = 100 - price. A meeting's priced move is the difference between the
# month CONTAINING the meeting and the month before it, adjusted for where in the month the meeting falls:
#
#     r_after = r_before + (impliedAvg_M - r_before) * daysInMonth / daysAfterMeeting
#
# That needs CONSECUTIVE months, not quarters -- a gap and the meeting in between cannot be isolated. This is the
# calculation CME FedWatch publishes, and the reason rates.html has carried a 2-year-yield PROXY since it was built
# ("a proper implied path needs fed funds futures, which have no free feed this desk trusts") and why fed-path.html
# has to say "window, not meeting" about the Atlanta Fed series on every surface.
#
# GENERATED, NOT HARD-CODED. SOFR_MONTHS above is a fixed list with "add months as they list" -- fine for quarterlies
# that roll four times a year, wrong for monthlies that would go stale within weeks.
#
# EXPECT THE BACK MONTHS TO BE THIN. The front few ZQ contracts are very liquid; by 9-12 months out the 15-minute
# bars will be sparse, the same way the euro STIR pull found ESTR printing 0-2 lots per 15 min. Sparse is usable for
# a daily settlement path and NOT usable for intraday repricing -- check volume before reading anything into a bar.
ZQ_N_MONTHS = 12
def _zq_months(n=ZQ_N_MONTHS):
    """The next n consecutive contract months as yyyyMM, starting with the current one."""
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out

# Euro leg: which ticker C.OG's TradingView chart uses is not known, so pull every 3-month euro short-rate future IBKR
# lists (IBKR symbol search, 2026-10-08): its front contract.
EURO_FRONTS = [("I", "ICEEU", "EUR", "Euribor 3M (ICE)"), ("ER3", "ICEEU", "EUR", "ESTR 3M (ICE)"),
               ("ST3", "EUREX", "EUR", "ESTR 3M (Eurex)"), ("ESTR", "CME", "EUR", "ESTR (CME)")]


def fetch_bars(ib: IB, contract, label: str):
    """Historical bars with a long timeout: 6 months of 15-min bars can take minutes, far past the 20 s
    RequestTimeout used for contract look-ups. A timeout or error is reported and skipped, not fatal."""
    # ICE CONTFUT details come back as '20261214 10:00:00 GB'; the history request only accepts yyyyMM / yyyyMMdd
    contract.lastTradeDateOrContractMonth = (contract.lastTradeDateOrContractMonth or "").split(" ")[0]
    saved, ib.RequestTimeout = ib.RequestTimeout, 0          # 0 = no overall cap; the request's own timeout applies
    try:
        # formatDate=2: timestamps in UTC, whatever time zone TWS is set to
        return ib.reqHistoricalData(contract, endDateTime=END, durationStr=DURATION, barSizeSetting=BAR_SIZE,
                                    whatToShow="TRADES", useRTH=False, formatDate=2, timeout=HIST_TIMEOUT)
    except Exception as e:
        print(f"  {label}: history request failed or timed out after {HIST_TIMEOUT}s ({type(e).__name__}: {e})")
        return None
    finally:
        ib.RequestTimeout = saved


def archive(contract, bars, label: str):
    """Merge bars into analysis/output/stir/<EXCHANGE>_<localSymbol>.csv (UTC bar-start times, newer pull wins)."""
    df = util.df(bars)
    df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ"))
    path = ARCHIVE / f"{contract.exchange}_{contract.localSymbol.replace(' ', '_')}.csv"   # Eurex: 'FST3 20261216 M'
    before = 0
    if path.exists():
        old = pd.read_csv(path)
        before = len(old)
        df = pd.concat([old, df], ignore_index=True).drop_duplicates("time", keep="last")
    df = df.sort_values("time").reset_index(drop=True)
    df.to_csv(path, index=False)
    print(f"  {label}: {contract.localSymbol} -> {path.name}: {len(df):,} bars ({len(df) - before:+,} new), "
          f"{df.time.iloc[0]} -> {df.time.iloc[-1]}")


def resolve(ib: IB, symbol, exchange, currency, label, month=None):
    """A named contract month, or (month=None) the front: IBKR's continuous series, else the nearest listed expiry.
    Prints IBKR's own symbol search if nothing resolves."""
    tries = [Future(symbol=symbol, exchange=exchange, currency=currency, lastTradeDateOrContractMonth=month)] if month \
        else [ContFuture(symbol=symbol, exchange=exchange, currency=currency), Future(symbol=symbol, exchange=exchange, currency=currency)]
    for c in tries:
        try:
            det = ib.reqContractDetails(c)
        except Exception as e:
            print(f"  {label}: look-up failed ({e})")
            det = []
        if det:
            con = det[0].contract if (month or c.secType == "CONTFUT") else \
                min((d.contract for d in det), key=lambda x: x.lastTradeDateOrContractMonth)
            if con.secType == "CONTFUT":      # archive under the real contract it points at, never a rolling mix
                con.secType = "FUT"
            return con
    print(f"  {label}: {symbol}@{exchange}{' ' + month if month else ''} not found. IBKR symbol search for '{symbol}':")
    try:
        for m in ib.reqMatchingSymbols(symbol) or []:
            c = m.contract
            print(f"     symbol={c.symbol} secType={c.secType} exchange={c.primaryExchange or c.exchange} "
                  f"currency={c.currency} desc={getattr(c, 'description', '')} derivs={m.derivativeSecTypes}")
    except Exception as e:
        print(f"     search failed ({e})")
    return None


def pull(ib: IB, symbol, exchange, currency, label, month=None):
    con = resolve(ib, symbol, exchange, currency, label, month)
    if con is None:
        return
    bars = fetch_bars(ib, con, label)
    if not bars:
        print(f"  {label} ({con.localSymbol}): no bars -- look for a market-data subscription message in the TWS log")
        return
    archive(con, bars, label)


SKIP_ZQ = False


def main():
    global END
    ap = argparse.ArgumentParser()
    ap.add_argument("--end", help="YYYY-MM-DD: pull the ~6 months before this date instead of up to now")
    ap.add_argument("--no-zq", action="store_true", help="skip fed funds (ZQ) -- it is 12 contracts and most of the runtime")
    a = ap.parse_args()
    global SKIP_ZQ
    SKIP_ZQ = bool(a.no_zq)
    if a.end:
        END = datetime.strptime(a.end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        print(f"older history: the {DURATION} before {a.end} (UTC)")
    ib = IB()
    ib.RequestTimeout = 20          # contract look-ups: a request IBKR never answers no longer hangs forever
    print(f"connecting to {HOST}:{PORT} ...")
    try:
        ib.connect(HOST, PORT, clientId=CLIENT_ID, timeout=15, readonly=True)   # data only; skips the order-sync requests
    except Exception as e:
        sys.exit(f"could not connect -- is TWS/Gateway open, logged in, and API enabled on port {PORT}? ({e})")

    print("SOFR 3-month futures (CME SOFR3)...")
    for month in SOFR_MONTHS:
        pull(ib, "SOFR3", "CME", "USD", f"SOFR {month}", month)

    # Fed funds. 12 contracts at 15-min is the long pole in this script -- each request can take minutes, so this
    # roughly doubles the run. --no-zq skips it when you only want the euro spread legs.
    if not SKIP_ZQ:
        months = _zq_months()
        print(f"fed funds 30-day futures (CBOT ZQ), {len(months)} consecutive months {months[0]}-{months[-1]}...")
        for month in months:
            pull(ib, "ZQ", "CBOT", "USD", f"ZQ {month}", month)

    if END:                         # older pulls: named Euribor contracts (a continuous front takes no end date)
        print("Euribor 3-month futures (ICE I)...")
        for month in EURIBOR_MONTHS:
            pull(ib, "I", "ICEEU", "EUR", f"Euribor {month}", month)
    else:
        print("euro short-rate futures...")
        for symbol, exchange, currency, label in EURO_FRONTS:
            pull(ib, symbol, exchange, currency, label)

    ib.disconnect()
    print(f"\narchive: {ARCHIVE}")


if __name__ == "__main__":
    main()
