"""Phase 0 pulls for the US-EU rate differential vs Nasdaq lead-lag study (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md).

  1. clean   : re-pull the euro legs by NAMED contract (TRADES, 15 min) -- the first pulls of these were IBKR's continuous
               series saved under one contract's name and later merged with the named contract (mixed series). The old
               files are moved aside, not merged.
  2. mid15   : MIDPOINT 15-min bars (bid/ask mid at bar end, like OANDA's closes) for the live SOFR and euro contracts.
               TRADES closes are the last trade in the bar and can be minutes stale in thin bars.
  3. m1      : 1-min MIDPOINT bars for SR3Z6, SR3H7, IZ6, ER3U6 and the NQ futures front (M6 / U6 / Z6), last ~26 weeks,
               in 1-week requests, paced under IBKR's 60-requests-per-10-minutes limit. Resumable: finished chunks are kept.

    python scratchpad/ibkr_hf_pull.py clean mid15 m1      (TWS / IB Gateway open, API on port 7497)
"""
from __future__ import annotations

import asyncio
import shutil
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd  # noqa: E402
from ib_insync import IB, Future, util  # noqa: E402

ROOT = Path(__file__).resolve().parents[1] / "analysis" / "output"
STIR, MID, M1 = ROOT / "stir", ROOT / "stir_mid15", ROOT / "stir_1m"
for p in (MID, M1, STIR / "_superseded"):
    p.mkdir(parents=True, exist_ok=True)
HOST, PORT, CID = "127.0.0.1", 7497, 11
NOW = datetime.now(timezone.utc)
OLD_END = datetime(2026, 4, 12, tzinfo=timezone.utc)

# (symbol, exchange, currency, contract month, includeExpired)
EURO = [("I", "ICEEU", "EUR", "202612", False), ("ER3", "ICEEU", "EUR", "202609", False), ("ST3", "EUREX", "EUR", "202609", False)]
LIVE15 = [("SOFR3", "CME", "USD", m, False) for m in ("202609", "202612", "202703", "202706")] + EURO[:2]
M1_SET = [("SOFR3", "CME", "USD", "202612", False), ("SOFR3", "CME", "USD", "202703", False),
          ("I", "ICEEU", "EUR", "202612", False), ("ER3", "ICEEU", "EUR", "202609", False),
          ("NQ", "CME", "USD", "202606", True), ("NQ", "CME", "USD", "202609", True), ("NQ", "CME", "USD", "202612", False)]
_last_req = [0.0]


def pace():
    """<= 60 historical requests per 10 minutes: one every 10.5 s."""
    wait = 10.5 - (time.time() - _last_req[0])
    if wait > 0:
        time.sleep(wait)
    _last_req[0] = time.time()


def resolve(ib, sym, exch, ccy, month, expired):
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month, includeExpired=expired))
    if not det:
        print(f"  {sym} {month} @{exch}: not found")
        return None
    c = det[0].contract
    c.lastTradeDateOrContractMonth = (c.lastTradeDateOrContractMonth or "").split(" ")[0]
    return c


def hist(ib, c, end, dur, bar, what):
    pace()
    saved, ib.RequestTimeout = ib.RequestTimeout, 0
    try:
        b = ib.reqHistoricalData(c, endDateTime=end, durationStr=dur, barSizeSetting=bar, whatToShow=what,
                                 useRTH=False, formatDate=2, timeout=600)
    except Exception as e:
        print(f"    {c.localSymbol} {what} {bar} to {end}: failed ({type(e).__name__}: {e})")
        return None
    finally:
        ib.RequestTimeout = saved
    if not b:
        return None
    df = util.df(b)
    df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ"))
    return df


def fname(c):
    return f"{c.exchange}_{c.localSymbol.replace(' ', '_')}"


def save_merge(path, df):
    if path.exists():
        old = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
        df = pd.concat([old, df], ignore_index=True).drop_duplicates("time", keep="last")
    df = df.sort_values("time").reset_index(drop=True)
    (df.to_parquet(path, index=False) if path.suffix == ".parquet" else df.to_csv(path, index=False))
    return df


def do_clean(ib):
    print("clean: euro legs by named contract, TRADES 15 min (now + the 6 months before 2026-04-12)")
    for spec in EURO:
        c = resolve(ib, *spec)
        if c is None:
            continue
        path = STIR / f"{fname(c)}.csv"
        if path.exists():
            shutil.move(str(path), str(STIR / "_superseded" / f"{path.stem}_mixed_continuous.csv"))
        parts = [x for x in (hist(ib, c, "", "6 M", "15 mins", "TRADES"), hist(ib, c, OLD_END, "6 M", "15 mins", "TRADES")) if x is not None]
        if not parts:
            print(f"  {c.localSymbol}: no bars")
            continue
        df = save_merge(path, pd.concat(parts))
        print(f"  {c.localSymbol} -> {path.name}: {len(df):,} bars {df.time.iloc[0]} -> {df.time.iloc[-1]}, median volume {df.volume.median():.0f}")


def do_mid15(ib):
    print("mid15: MIDPOINT 15 min (now + the 6 months before 2026-04-12)")
    for spec in LIVE15:
        c = resolve(ib, *spec)
        if c is None:
            continue
        path = MID / f"{fname(c)}.csv"
        parts = [x for x in (hist(ib, c, "", "6 M", "15 mins", "MIDPOINT"), hist(ib, c, OLD_END, "6 M", "15 mins", "MIDPOINT")) if x is not None]
        if not parts:
            print(f"  {c.localSymbol}: no MIDPOINT bars")
            continue
        df = save_merge(path, pd.concat(parts))
        print(f"  {c.localSymbol} -> stir_mid15/{path.name}: {len(df):,} bars {df.time.iloc[0]} -> {df.time.iloc[-1]}")


def do_m1(ib, weeks=26):
    print(f"m1: 1-min MIDPOINT, last {weeks} weeks, 1-week requests (resumable)")
    for spec in M1_SET:
        c = resolve(ib, *spec)
        if c is None:
            continue
        path = M1 / f"{fname(c)}.parquet"
        done = set()
        if path.exists():
            have = pd.to_datetime(pd.read_parquet(path, columns=["time"]).time)
            done = set(have.dt.strftime("%G-%V"))
        last = datetime.strptime(c.lastTradeDateOrContractMonth[:8], "%Y%m%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
        end0 = min(NOW, last)
        got = 0
        for w in range(weeks):
            end = end0 - timedelta(weeks=w)
            if end < NOW - timedelta(weeks=weeks):
                break
            wk = (end - timedelta(days=3)).strftime("%G-%V")
            if wk in done:
                continue
            df = hist(ib, c, end, "1 W", "1 min", "MIDPOINT")
            if df is None:
                continue
            save_merge(path, df)
            got += len(df)
        n = len(pd.read_parquet(path, columns=["time"])) if path.exists() else 0
        print(f"  {c.localSymbol} -> stir_1m/{path.name}: +{got:,} bars, {n:,} total")


def do_fridays(ib, weeks=26):
    """The m1 step's 1-week requests ended at the RUN time (Friday ~06:30 UTC), so every Friday after that was never
    requested. Re-pull each Friday as a 1-day request ending Saturday 00:00 UTC, merged into the same files."""
    print(f"fridays: 1-min MIDPOINT, the {weeks} Fridays the m1 step missed")
    sat = (NOW + timedelta(days=(5 - NOW.weekday()) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
    if sat > NOW:
        sat -= timedelta(weeks=1)
    for spec in M1_SET:
        c = resolve(ib, *spec)
        if c is None:
            continue
        path = M1 / f"{fname(c)}.parquet"
        last = datetime.strptime(c.lastTradeDateOrContractMonth[:8], "%Y%m%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
        got = 0
        for w in range(weeks):
            end = sat - timedelta(weeks=w)
            if end > last + timedelta(days=1):
                continue
            df = hist(ib, c, end, "1 D", "1 min", "MIDPOINT")
            if df is None:
                continue
            save_merge(path, df)
            got += len(df)
        print(f"  {c.localSymbol} -> stir_1m/{path.name}: +{got:,} Friday bars")


if __name__ == "__main__":
    steps = sys.argv[1:] or ["clean", "mid15", "m1"]
    ib = IB()
    ib.RequestTimeout = 20
    ib.connect(HOST, PORT, clientId=CID, timeout=15, readonly=True)
    for s in steps:
        {"clean": do_clean, "mid15": do_mid15, "m1": do_m1, "fridays": do_fridays}[s](ib)
    ib.disconnect()
    print("done")
