"""Extend the 1-minute history of the live rates contracts BACKWARDS, from the oldest bar already on disk towards the contract's listing, so the chart page
(cog-chart.html) and the tests get more than the ~2.5 years the first deep pull fetched (scratchpad/ibkr_deep_pull.py stopped at its 130-week cap, April 2024).
Laptop: IB Gateway open and logged in, API on port 4002 (paper; override with env IB_PORT).

    python scripts/rates_line/pull_deep_history.py --dry-run              # the plan: which contracts, from where, how many weeks, how long. Needs no TWS
    python scripts/rates_line/pull_deep_history.py                        # the seven core legs (SR3U6 SR3Z6 SR3H7 IH7 IZ6 ER3Z6 ER3H7)
    python scripts/rates_line/pull_deep_history.py --all                  # every live contract in refresh_leg_bars.IB_SPEC (adds the Apr-2026 ones, fed funds, ZT, Schatz)
    python scripts/rates_line/pull_deep_history.py --names SR3U6 IH7 --until 2022-01-01 --commit

How it works: whole-week MIDPOINT requests ending Saturday 00:00 UTC (the same as the first deep pull and refresh_leg_bars.py), newest first, starting with the week
before the oldest bar on disk. A contract stops at the earliest date IBKR says it holds (reqHeadTimeStamp), at --until, after --max-weeks, or after --stop-empty empty
weeks in a row (before the contract quoted at all). Expired contracts cannot be fetched (IBKR does not serve them), so this only reaches contracts still trading.
Bars are merged into analysis/output/stir_1m_deep/<EXCH>_<LOCAL>.parquet, the folder build_leg_bars.py already reads; the chart files are rebuilt at the end.

--i2-archive: a separate mode for the rolling I2! line (build_leg_bars.stitch_i2). For every expired Euribor quarterly that was I2! in a window since --until
(default here 2024-01-01), it requests the 15-minute TRADES for that window plus a week either side (includeExpired; IBKR keeps expired futures about 2 years)
and merges them into analysis/output/stir/ICEEU_<name>.csv. That fills the Monday-Wednesday holes the first archive pull left in every roll week, and adds the
older windows (IU5, IM5, IH5, IZ4 ...), so I2! can reach back to mid-2024. Contracts still trading are skipped: their 1-minute midpoints cover them.
    python scripts/rates_line/pull_deep_history.py --i2-archive [--dry-run]

Resumable: each finished contract is written to analysis/output/stir_1m_deep/_deep_pull_state.json with why it stopped, and is skipped next time (--force re-tries it).
If TWS drops the script reconnects for up to 30 minutes, then exits; run it again and it carries on from the oldest bar on disk.
Pacing is 10.5 s per request (IBKR's limit is 60 requests in 10 minutes): about 9 minutes per contract-year. Far-from-expiry years are THIN (few quote changes a day):
check the "share of minutes with a price change" the summary prints before using them."""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'rates_line'))
import build_leg_bars as B
from refresh_leg_bars import IB_SPEC, CORE

DEEP = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
ARCH = ROOT / 'analysis' / 'output' / 'stir'
STATE = DEEP / '_deep_pull_state.json'
IB_PORT = int(os.environ.get('IB_PORT', 4002))
PACE_S = 10.5
last = [0.0]


def pace():
    w = PACE_S - (time.time() - last[0])
    time.sleep(max(w, 0))
    last[0] = time.time()


def saturday_on_or_before(t):
    """Saturday 00:00 UTC at or before t: a request ending there covers the whole trading week before it."""
    d = (t.weekday() - 5) % 7
    return (t - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)


def oldest_on_disk(name, found):
    """Oldest bar for this contract across every folder build_leg_bars reads, or None."""
    if name not in found:
        return None
    return min(pd.to_datetime(pd.read_parquet(f, columns=['time']).time, utc=True).min() for f in found[name]['files'])


def week_ends(start_sat, until, max_weeks):
    """Saturday request ends, newest first, from start_sat back to (not before) until."""
    out = []
    for w in range(max_weeks):
        end = start_sat - timedelta(weeks=w)
        if end <= until:
            break
        out.append(end)
    return out


def i2_windows(since, now):
    """The windows in which each expired Euribor quarterly was I2! (2nd quarterly; front rolls on its last trading day), from `since` up to now."""
    qs = [(y, m) for y in range(2022, 2029) for m in (3, 6, 9, 12)]
    exp = [B.euribor_last_trade(y, m) for y, m in qs]
    out = []
    for i in range(1, len(qs) - 1):
        start, end = exp[i - 1], exp[i]
        y, m = qs[i + 1]
        if end < since.date() or exp[i + 1] >= now.date():      # before the range, or the contract still trades (its 1-minute midpoints cover it)
            continue
        out.append(dict(name=f'I{"HMUZ"[m // 3 - 1]}{y % 10}', month=f'{y}{m:02d}', start=start, end=end))
    return out


def archive_span(name):
    f = ARCH / f'ICEEU_{name}.csv'
    if not f.exists():
        return None
    t = pd.to_datetime(pd.read_csv(f, usecols=['time']).time, utc=True)
    return f'{t.min():%Y-%m-%d} to {t.max():%Y-%m-%d}'


def quality(path):
    """Per-year trading days and the share of minutes whose midpoint changed (a thin, far-from-expiry year changes in a few % of minutes)."""
    d = pd.read_parquet(path, columns=['time', 'close'])
    d['time'] = pd.to_datetime(d.time, utc=True)
    d = d.sort_values('time').set_index('time')
    d = d[d.index.dayofweek < 5]
    ch = d.close.diff().ne(0)
    g = pd.DataFrame({'days': d.groupby(d.index.year).apply(lambda x: x.index.normalize().nunique()), 'changed': ch.groupby(d.index.year).mean().round(3)})
    return g


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--all', action='store_true', help='every live contract in IB_SPEC, not only the seven core legs')
    ap.add_argument('--names', nargs='+', help='just these contracts (names as on the chart, e.g. SR3U6 IH7 FGBS2612)')
    ap.add_argument('--until', default=None, help='do not go back before this date (default 2016-01-01, older than any listing here; 2024-01-01 with --i2-archive)')
    ap.add_argument('--i2-archive', action='store_true', help='pull the 15-minute TRADES of the expired Euribor quarterlies for their I2! windows (see above) instead')
    ap.add_argument('--max-weeks', type=int, default=520, help='at most this many weeks per contract on this run (default 520 = 10 years)')
    ap.add_argument('--stop-empty', type=int, default=8, help='stop a contract after this many empty weeks in a row (default 8)')
    ap.add_argument('--force', action='store_true', help='re-try contracts the state file marks as finished')
    ap.add_argument('--dry-run', action='store_true', help='print the plan and exit; needs no TWS')
    ap.add_argument('--no-build', action='store_true', help='do not rebuild the chart files at the end')
    ap.add_argument('--commit', action='store_true', help='commit and push the new parquet + chart files at the end')
    a = ap.parse_args()

    names = a.names or (list(IB_SPEC) if a.all else CORE)
    bad = [n for n in names if n not in IB_SPEC]
    if bad:
        sys.exit(f'not in refresh_leg_bars.IB_SPEC: {bad}. Known: {" ".join(IB_SPEC)}')
    until = pd.Timestamp(a.until or ('2024-01-01' if a.i2_archive else '2016-01-01'), tz='UTC').to_pydatetime()
    now = datetime.now(timezone.utc)

    if a.i2_archive:
        wins = i2_windows(until, now)
        print(f'{"contract":<9} {"was I2! from":<13} {"to":<11} {"archive now":<26}')
        for w in wins:
            print(f'{w["name"]:<9} {w["start"]:%Y-%m-%d}    {w["end"]:%Y-%m-%d}  {archive_span(w["name"]) or "none"}')
        print(f'\n{len(wins)} request(s) of 15-minute TRADES, a few minutes in all.')
        if a.dry_run:
            sys.exit(0)
        from ib_insync import IB, Future, util
        ib = IB()
        try:
            ib.connect('127.0.0.1', IB_PORT, clientId=47, timeout=20, readonly=True)
        except Exception as e:
            sys.exit(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open it, log in, and run again. Nothing was changed.')
        for w in wins:
            det = ib.reqContractDetails(Future(symbol='I', exchange='ICEEU', currency='EUR', lastTradeDateOrContractMonth=w['month'], includeExpired=True))
            if not det:
                print(f'{w["name"]}: IBKR no longer has this expired contract; skipped', flush=True)
                continue
            c = det[0].contract
            c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
            end = datetime.combine(w['end'] + timedelta(days=8), datetime.min.time(), tzinfo=timezone.utc)
            days = (w['end'] - w['start']).days + 16
            pace()
            ib.RequestTimeout = 0
            try:
                bars = ib.reqHistoricalData(c, endDateTime=end, durationStr=f'{days} D', barSizeSetting='15 mins', whatToShow='TRADES', useRTH=False, formatDate=2, timeout=600)
            except Exception as e:
                print(f'{w["name"]}: request failed ({type(e).__name__} {e})', flush=True)
                continue
            if not bars:
                print(f'{w["name"]}: no bars returned (older than IBKR keeps, or no market-data permission)', flush=True)
                continue
            df = util.df(bars)
            df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ'))
            path = ARCH / f'ICEEU_{c.localSymbol}.csv'
            before = 0
            if path.exists():
                old = pd.read_csv(path)
                before = len(old)
                df = pd.concat([old, df], ignore_index=True).drop_duplicates('time', keep='last')
            df.sort_values('time').reset_index(drop=True).to_csv(path, index=False)
            print(f'{w["name"]}: {len(bars):,} bars returned, {len(df) - before:+,} new -> {path.name} now {archive_span(c.localSymbol)}', flush=True)
        ib.disconnect()
        if not a.no_build:
            subprocess.run([sys.executable, str(ROOT / 'scripts' / 'rates_line' / 'build_leg_bars.py')], check=True)
        if a.commit:
            subprocess.run(['git', 'add', 'analysis/output/stir', 'analysis/output/cog_chart'], cwd=ROOT, check=True)
            subprocess.run(['git', 'commit', '-m', 'Euribor archive: I2! windows from IBKR (pull_deep_history.py --i2-archive)'], cwd=ROOT)
            subprocess.run(['git', 'pull', '--rebase', '--autostash'], cwd=ROOT)
            subprocess.run(['git', 'push'], cwd=ROOT)
        sys.exit(0)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    found = B.discover()

    plan = []
    for n in names:
        old = oldest_on_disk(n, found)
        start = saturday_on_or_before(old.to_pydatetime() if old is not None else now)
        weeks = week_ends(start, until, a.max_weeks)
        skip = state.get(n, {}).get('finished') and not a.force
        plan.append((n, old, weeks, skip))
    todo = [p for p in plan if not p[3]]
    print(f'{"contract":<10} {"oldest on disk":<16} {"pull back from":<15} {"weeks (max)":>11}  note')
    for n, old, weeks, skip in plan:
        note = f'finished earlier: {state[n]["reason"]} (--force to retry)' if skip else ''
        print(f'{n:<10} {str(old)[:10] if old is not None else "none":<16} {weeks[0].strftime("%Y-%m-%d") if weeks else "-":<15} {len(weeks):>11}  {note}')
    worst = sum(len(p[2]) for p in todo) * PACE_S / 3600
    print(f'\n{len(todo)} contract(s) to pull. Worst case {worst:.1f} h at {PACE_S} s per week-request; most stop far sooner (IBKR\'s earliest date or {a.stop_empty} empty weeks).')
    if a.dry_run or not todo:
        sys.exit(0)

    from ib_insync import IB, Future, util
    ib = IB()
    cid = [40]

    def conn():
        for _ in range(60):
            if ib.isConnected():
                return
            cid[0] += 1
            try:
                ib.connect('127.0.0.1', IB_PORT, clientId=cid[0], timeout=20, readonly=True)
                return
            except Exception as e:
                print(f'  cannot reach IB Gateway on port {IB_PORT} ({type(e).__name__}); retrying in 30 s', flush=True)
                time.sleep(30)
        sys.exit('IB Gateway not reachable for 30 minutes. Open it, log in, and run again: it carries on from the oldest bar on disk.')

    DEEP.mkdir(parents=True, exist_ok=True)
    touched = []
    for n, old, weeks, _ in todo:
        sym, exch, ccy, month = IB_SPEC[n]
        conn()
        det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
        if not det:
            print(f'{n}: contract not found (expired or not listed); skipping', flush=True)
            state[n] = dict(finished=True, reason='contract not found at IBKR', at=now.isoformat())
            continue
        c = det[0].contract
        c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
        stem = found[n]['stem'] if n in found else f'{exch}_{c.localSymbol}'
        path = DEEP / f'{stem}.parquet'
        head = None
        try:
            pace()
            h = ib.reqHeadTimeStamp(c, whatToShow='MIDPOINT', useRTH=False, formatDate=2)
            head = pd.Timestamp(h).tz_convert('UTC') if pd.Timestamp(h).tzinfo else pd.Timestamp(h, tz='UTC')
        except Exception as e:
            print(f'{n}: IBKR did not give an earliest date ({type(e).__name__}); going by empty weeks', flush=True)
        print(f'{n}: oldest on disk {str(old)[:10] if old is not None else "none"}, IBKR earliest MIDPOINT {str(head)[:10] if head is not None else "unknown"}', flush=True)
        empty, got, reason = 0, 0, f'reached --max-weeks ({a.max_weeks})'
        if not weeks:
            reason = f'already back to --until {a.until}'
        for i, end in enumerate(weeks):
            if head is not None and end <= head:
                reason = f'reached IBKR earliest date {str(head)[:10]}'
                break
            conn()
            pace()
            ib.RequestTimeout = 0
            try:
                bars = ib.reqHistoricalData(c, endDateTime=end, durationStr='1 W', barSizeSetting='1 min', whatToShow='MIDPOINT', useRTH=False, formatDate=2, timeout=300)
            except Exception as e:
                print(f'  {n} {end:%Y-%m-%d}: {type(e).__name__} {e}', flush=True)
                bars = None
            if not bars:
                empty += 1
                if empty >= a.stop_empty:
                    reason = f'{a.stop_empty} empty weeks in a row before {end:%Y-%m-%d}'
                    break
                continue
            empty = 0
            df = util.df(bars)
            df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ'))
            if path.exists():
                df = pd.concat([pd.read_parquet(path), df], ignore_index=True).drop_duplicates('time', keep='last')
            df.sort_values('time').reset_index(drop=True).to_parquet(path, index=False)      # written every week, so a crash loses at most one request
            got += len(bars)
            if i % 13 == 0:
                print(f'  {n}: week ending {end:%Y-%m-%d} done, {got:,} new bars so far', flush=True)
        else:
            if weeks and head is not None and weeks[-1] - timedelta(weeks=1) <= head:
                reason = f'reached IBKR earliest date {str(head)[:10]}'
        finished = not reason.startswith('reached --max-weeks')
        state[n] = dict(finished=finished, reason=reason, newBars=got, at=datetime.now(timezone.utc).isoformat())
        STATE.write_text(json.dumps(state, indent=1))
        print(f'{n}: +{got:,} bars; stopped: {reason}', flush=True)
        if got and path.exists():
            touched.append(path)
            print(quality(path).to_string(), flush=True)
    ib.disconnect()

    if not a.no_build:
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'rates_line' / 'build_leg_bars.py')], check=True)
    if a.commit:
        subprocess.run(['git', 'add', 'analysis/output/stir_1m_deep', 'analysis/output/cog_chart'], cwd=ROOT, check=True)
        subprocess.run(['git', 'commit', '-m', 'rates legs: deeper 1-minute history from IBKR (pull_deep_history.py)'], cwd=ROOT)
        subprocess.run(['git', 'pull', '--rebase', '--autostash'], cwd=ROOT)
        subprocess.run(['git', 'push'], cwd=ROOT)
    print('done. New history shows on the chart page (1h / 4h) after the chart files are committed and deployed.')
