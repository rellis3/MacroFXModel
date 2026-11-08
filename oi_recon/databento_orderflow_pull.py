#!/usr/bin/env python3
"""
CME FX futures order-flow history from Databento (GLBX.MDP3) -- written 2026-11-06, owner-approved quotes.

Continuous front month BY VOLUME: 6E.v.0 (euro) and 6J.v.0 (yen), stype 'continuous'. No analysis here: this builds the dataset.

LAYOUT (the R2 layout, mirrored on disk -- see ON DISK below -- then pushed to R2 with --r2-push):
  orderflow/raw/GLBX/<schema>/<root>/<YYYY-MM-DD>.dbn.zst     RAW, ONE UTC DAY, exactly as Databento sent it. Never edited, never re-written.
  orderflow/bars_1m/<root>/<YYYY>.parquet                     built by oi_recon/orderflow_bars.py
  orderflow/MANIFEST.json                                     date range, days, rows, bytes and $ per root/schema
ON DISK the same tree lives under %LOCALAPPDATA%/MacroFXModel/orderflow (override with ORDERFLOW_DIR), outside OneDrive and the repo.

SPEND RULES (Databento PAID calls, owner rule 2026-10-20 and 2026-11-05):
  - every download is preceded by a FREE quote (metadata.get_cost) for exactly that request; a quote that would take the running spend
    over --cap stops the run BEFORE buying it. A 5xx on a QUOTE is retried (free); a 5xx or any error on a DOWNLOAD stops the run at once.
    Nothing is retried automatically -- re-run the same command to resume (days already on disk are skipped).
  - $ in the manifest is the QUOTED price of each downloaded day (Databento exposes no billed-amount API). A failed download may have
    been billed in part; the run prints what it was quoted.

    python databento_orderflow_pull.py --pilot                        # 6E, trades + mbp-1 + mbp-10, 2026-11-01..2026-11-04 (5-day quote $3.06)
    python databento_orderflow_pull.py --check-pilot                  # free: compare trades vs the trades inside mbp-10 / mbp-1, side, gaps, UTC
    python databento_orderflow_pull.py --long-trades --cap 120        # 6E + 6J trades, 2020-01-01..2026-11-05, quarterly chunks NEWEST FIRST, resume
    python databento_orderflow_pull.py --status                       # free: what is on disk
    python databento_orderflow_pull.py --r2-push                      # push raw + bars + MANIFEST to R2 (needs R2_ACCESS_KEY / R2_SECRET_KEY)
"""
import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

DATASET = 'GLBX.MDP3'
SYMBOL = {'6E': '6E.v.0', '6J': '6J.v.0'}
# NOT inside the repo/OneDrive: this grows to tens of GB and OneDrive locks files it is syncing (it broke the first rename, 2026-11-07)
BASE = Path(os.environ.get('ORDERFLOW_DIR') or (Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'MacroFXModel' / 'orderflow'))
RAW = BASE / 'raw' / 'GLBX'
MANIFEST = BASE / 'MANIFEST.json'
LONG_START, LONG_END = date(2020, 1, 1), date(2026, 11, 5)       # end exclusive: the quoted window was 2020-01-01 -> 2026-11-05
PILOT_DAYS = [date(2026, 11, 1), date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 4)]   # the 5-day quote window 2026-10-31..11-05, minus the Saturday
PILOT_QUOTE, PILOT_TOL = 3.06, 0.15


def client():
    import databento as db
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / '.env')
    if not os.environ.get('DATABENTO_API_KEY'):
        sys.exit('DATABENTO_API_KEY not set (oi_recon/.env)')
    return db.Historical(os.environ['DATABENTO_API_KEY'])


def day_path(schema, root, d):
    return RAW / schema / root / f'{d.isoformat()}.dbn.zst'


def trading_days(start, end):
    """UTC calendar days from start (inclusive) to end (exclusive), Saturdays dropped (the CME is closed all UTC Saturday; Sunday carries the evening open)."""
    out, d = [], start
    while d < end:
        if d.weekday() != 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def quote(c, schema, root, d0, d1):
    """FREE price of [d0, d1). Retries a 5xx (quotes cost nothing); any other error propagates."""
    return free_call(lambda: c.metadata.get_cost(dataset=DATASET, symbols=[SYMBOL[root]], stype_in='continuous', schema=schema,
                                                 start=d0.isoformat(), end=d1.isoformat()))


def free_call(fn, tries=6):
    """Retry a FREE metadata call (quote / record count) on a gateway 5xx or a network error (SSL EOF, reset). Never used for a paid download."""
    import databento as db
    import requests
    for attempt in range(tries):
        try:
            return fn()
        except (db.BentoServerError, requests.exceptions.RequestException):
            if attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))


# ------------------------------------------------------------------ manifest
def load_manifest():
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {'dataset': DATASET, 'symbology': 'continuous, front month by volume (<root>.v.0)', 'note': '$ is the QUOTED price of each downloaded day',
            'series': {}}


def save_manifest(m):
    m['updated'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    tmp = MANIFEST.with_suffix('.tmp')
    tmp.write_text(json.dumps(m, indent=1, sort_keys=True))
    tmp.replace(MANIFEST)


def record(m, schema, root, d, rows, nbytes, cost):
    s = m['series'].setdefault(f'{root}/{schema}', {'days': {}})
    s['days'][d.isoformat()] = {'rows': rows, 'bytes': nbytes, 'usd': round(cost, 4)}
    ds = sorted(s['days'])
    s['first'], s['last'], s['n_days'] = ds[0], ds[-1], len(ds)
    s['rows'] = sum(v['rows'] for v in s['days'].values())
    s['bytes'] = sum(v['bytes'] for v in s['days'].values())
    s['usd'] = round(sum(v['usd'] for v in s['days'].values()), 4)


# ------------------------------------------------------------------ one day
def pull_day(c, m, schema, root, d, cost):
    """One paid download: the UTC day d for one root and schema -> raw/GLBX/<schema>/<root>/<d>.dbn.zst (written via .part, then renamed).
    COMPLETENESS GUARD (2026-11-07, after a short file got through): the row count of the downloaded file must equal Databento's FREE record count
    for the same request, or the file is deleted and the day counts as a failure. The rename waits out a brief Windows file lock."""
    import databento as db
    p = day_path(schema, root, d)
    p.parent.mkdir(parents=True, exist_ok=True)
    part = p.with_suffix('.zst.part')
    part.unlink(missing_ok=True)
    kw = dict(dataset=DATASET, symbols=[SYMBOL[root]], stype_in='continuous', schema=schema, start=d.isoformat(), end=(d + timedelta(days=1)).isoformat())
    expected = free_call(lambda: c.metadata.get_record_count(**kw))
    c.timeseries.get_range(path=str(part), **kw)
    rows = sum(len(a) for a in db.DBNStore.from_file(str(part)).to_ndarray(count=2_000_000))
    if rows != expected:
        part.unlink(missing_ok=True)
        raise RuntimeError(f'short file: {rows:,} rows downloaded, Databento counts {expected:,} for {root} {schema} {d}')
    for i in range(10):
        try:
            part.replace(p)
            break
        except PermissionError:
            if i == 9:
                raise
            time.sleep(3)
    record(m, schema, root, d, int(rows), p.stat().st_size, cost)
    save_manifest(m)
    return rows


def run_days(c, m, jobs, cap, spent, label):
    """jobs = [(schema, root, day), ...] in order. Stops at the first failure or when the next quote would pass the cap."""
    for schema, root, d in jobs:
        if day_path(schema, root, d).exists():
            continue
        cost = quote(c, schema, root, d, d + timedelta(days=1))
        if spent + cost > cap:
            print(f'STOPPING BEFORE {root} {schema} {d}: spent ${spent:.2f} + quote ${cost:.2f} would pass the cap ${cap:.2f}', flush=True)
            return spent, 'cap'
        t0 = time.time()
        retries = False
        try:
            rows = pull_day(c, m, schema, root, d, cost)
        except Exception as ex:                                             # noqa: BLE001
            import databento as db
            # 2026-11-07 owner rule: ONE retry per day, only for a dropped stream / 5xx. A rejected request (4xx: bad key, no credit, bad range) stops at once.
            if isinstance(ex, db.BentoClientError) or retries:
                print(f'\nSTOPPED at {root} {schema} {d}: {type(ex).__name__}: {str(ex)[:300]}', flush=True)
                print(f'  spent so far: ~${spent:.2f}; this request was quoted ${cost:.2f} and a broken stream may have been billed in part. '
                      f'{"Second failure on this day" if retries else "Client error"}: NOT retrying -- ask the owner.', flush=True)
                return spent, 'failed'
            spent += cost                                                   # count the failed attempt as billed (worst case) toward the cap
            print(f'  {root} {schema} {d}: {type(ex).__name__}: {str(ex)[:120]} -- counting ${cost:.2f} as billed and retrying this day ONCE', flush=True)
            time.sleep(10)
            retries = True
            try:
                cost = quote(c, schema, root, d, d + timedelta(days=1))
                if spent + cost > cap:
                    print(f'STOPPING BEFORE {root} {schema} {d} (retry): spent ${spent:.2f} + quote ${cost:.2f} would pass the cap ${cap:.2f}', flush=True)
                    return spent, 'cap'
                rows = pull_day(c, m, schema, root, d, cost)
            except Exception as ex2:                                        # noqa: BLE001
                print(f'\nSTOPPED at {root} {schema} {d}: {type(ex2).__name__}: {str(ex2)[:300]}', flush=True)
                print(f'  spent so far: ~${spent:.2f} (the failed attempts counted as billed). Second failure on this day: NOT retrying -- ask the owner.', flush=True)
                return spent, 'failed'
        spent += cost
        print(f'{label} {root} {schema} {d}: {rows:,} rows  ${cost:.3f}  (spent ${spent:.2f}, {time.time() - t0:.0f}s)', flush=True)
    return spent, 'done'


# ------------------------------------------------------------------ pilot
def pilot(a):
    c, m = client(), load_manifest()
    jobs = [(s, '6E', d) for s in ('trades', 'mbp-1', 'mbp-10') for d in PILOT_DAYS]
    total = sum(quote(c, s, r, d, d + timedelta(days=1)) for s, r, d in jobs if not day_path(s, r, d).exists())
    print(f'pilot per-day quotes sum to ${total:.2f} (the approved 5-day quote was ${PILOT_QUOTE:.2f})', flush=True)
    if total > PILOT_QUOTE + PILOT_TOL:
        sys.exit(f'per-day total ${total:.2f} is more than ${PILOT_TOL:.2f} over the approved ${PILOT_QUOTE:.2f}: not buying. Ask the owner.')
    spent, status = run_days(c, m, jobs, cap=PILOT_QUOTE + PILOT_TOL, spent=0.0, label='pilot')
    print(f'PILOT {status}. Spent ~${spent:.2f}. Next: python databento_orderflow_pull.py --check-pilot')


def check_pilot(a):
    import numpy as np
    import pandas as pd
    import databento as db
    out, ok = [], True

    def say(s=''):
        out.append(s); print(s)

    def load(schema, d):
        df = db.DBNStore.from_file(str(day_path(schema, '6E', d))).to_df(pretty_ts=True, price_type='float', map_symbols=False)
        return df if 'ts_recv' in df.columns else df.reset_index()      # ts_recv is the index in Databento's frames

    say('# Pilot check: 6E.v.0, trades vs the trades inside mbp-1 / mbp-10\n')
    tot = {'trades': 0, 'mbp-1': 0, 'mbp-10': 0}
    for d in PILOT_DAYS:
        t, b1, b10 = load('trades', d), load('mbp-1', d), load('mbp-10', d)
        k1, k10 = b1[b1['action'] == 'T'], b10[b10['action'] == 'T']
        tot['trades'] += len(t); tot['mbp-1'] += len(k1); tot['mbp-10'] += len(k10)
        key = lambda x: pd.DataFrame({'ts': x['ts_event'].astype('int64').values, 'px': x['price'].round(6).values, 'sz': x['size'].values, 'sd': x['side'].values})
        same = {}
        for nm, k in (('mbp-1', k1), ('mbp-10', k10)):
            A, B = key(t), key(k)
            same[nm] = (len(A) == len(B)) and bool((A.values == B.values).all())
        say(f'{d}: trades {len(t):,} | T-rows in mbp-1 {len(k1):,} | in mbp-10 {len(k10):,} | rows total mbp-1 {len(b1):,} mbp-10 {len(b10):,}'
            f' | identical (ts,price,size,side) mbp-1: {same["mbp-1"]}, mbp-10: {same["mbp-10"]}')
        ok &= same['mbp-1'] and same['mbp-10']
        sz = {nm: int(x['size'].sum()) for nm, x in (('trades', t), ('mbp-1', k1), ('mbp-10', k10))}
        sd = {nm: x['side'].value_counts().to_dict() for nm, x in (('trades', t), ('mbp-1', k1), ('mbp-10', k10))}
        say(f'    size sum {sz}   side counts {sd}')
        ok &= len({*sz.values()}) == 1
    say(f'\nTOTAL trade rows: {tot}')

    t = pd.concat([load('trades', d) for d in PILOT_DAYS])
    say('\n## Side field (A / B / N)')
    vc = t['side'].value_counts(); say(f'counts: {vc.to_dict()}  (N share {vc.get("N", 0) / len(t):.2%})')
    say(f'size by side: {t.groupby("side")["size"].sum().to_dict()}')
    b = pd.concat([load('mbp-1', d) for d in PILOT_DAYS]); k = b[b['action'] == 'T']
    for sd in ('A', 'B'):
        x = k[k['side'] == sd]
        at_ask = float((x['price'] >= x['ask_px_00'] - 1e-9).mean()); at_bid = float((x['price'] <= x['bid_px_00'] + 1e-9).mean())
        say(f'side {sd}: price at/above the quoted ask {at_ask:.1%}, at/below the quoted bid {at_bid:.1%}  (n {len(x):,})')
    say('(B = buyer aggressor if B trades print at the ask; A = seller aggressor if A trades print at the bid -- stated by the numbers above, not assumed.)')

    say('\n## UTC timestamps and gaps')
    ts = t['ts_event']
    say(f'ts_event dtype {ts.dtype}; first {ts.iloc[0]}  last {ts.iloc[-1]}  (tz-aware UTC: {str(ts.dt.tz) == "UTC"})')
    say(f'sorted: {bool(ts.is_monotonic_increasing)}  ts_recv-ts_event median {((t["ts_recv"] - t["ts_event"]).dt.total_seconds().median() * 1e3):.2f} ms')
    gaps = ts.diff().dt.total_seconds().dropna()
    big = gaps[gaps > 600]
    say(f'gaps > 10 min: {len(big)}')
    idx = np.where(gaps.values > 600)[0]
    for i in idx[:12]:
        say(f'    {ts.iloc[i]} -> {ts.iloc[i + 1]}  ({gaps.values[i] / 60:.0f} min)')
    say(f'per-day UTC hours with trades: ' + '; '.join(f'{d}: {sorted(set(ts[ts.dt.date == d].dt.hour))[:1]}..{sorted(set(ts[ts.dt.date == d].dt.hour))[-1:]}' for d in PILOT_DAYS))
    say(f'instrument_ids seen: {sorted(set(t["instrument_id"]))}')
    say(f'\nVERDICT: {"CLEAN: trades inside mbp-1 and mbp-10 match the trades schema on count, side, size, price and timestamp every day" if ok else "NOT CLEAN: see the differences above"}')
    (BASE / 'PILOT_REPORT.md').write_text('\n'.join(out) + '\n')
    print(f'\nwrote {BASE / "PILOT_REPORT.md"}')
    return ok


# ------------------------------------------------------------------ long pull
def quarters(start, end):
    """Calendar quarters from start to end (exclusive), NEWEST FIRST: a cap-limited run leaves one contiguous recent window."""
    out, y, q = [], start.year, (start.month - 1) // 3
    while True:
        s = date(y, q * 3 + 1, 1)
        ny, nq = (y, q + 1) if q < 3 else (y + 1, 0)
        e = date(ny, nq * 3 + 1, 1)
        s2, e2 = max(s, start), min(e, end)
        if s2 < e2:
            out.append((s2, e2))
        if e >= end:
            break
        y, q = ny, nq
    return out[::-1]


def long_trades(a):
    c, m = client(), load_manifest()
    spent = sum(v.get('usd', 0.0) for k, v in m['series'].items() if k.endswith('/trades')) if a.spent is None else a.spent   # counts the pilot's trades days too: conservative
    print(f'long trades pull: cap ${a.cap:.2f}, already counted ${spent:.2f}', flush=True)
    for s, e in quarters(LONG_START, LONG_END):
        days = trading_days(s, e)
        for root in ('6E', '6J'):
            todo = [d for d in days if not day_path('trades', root, d).exists()]
            if not todo:
                print(f'{s}..{e} {root}: done already', flush=True); continue
            print(f'{s}..{e} {root}: {len(todo)} of {len(days)} days to pull', flush=True)
            spent, status = run_days(c, m, [('trades', root, d) for d in todo], a.cap, spent, 'trades')
            if status != 'done':
                print(f'STOPPED ({status}). Spent ~${spent:.2f}. Re-run the same command to resume.', flush=True)
                sys.exit(2 if status == 'failed' else 0)
    print(f'\nALL QUARTERS DONE. Spent ~${spent:.2f}.', flush=True)


# ------------------------------------------------------------------ status / R2
def status(a):
    m = load_manifest()
    for k, v in sorted(m['series'].items()):
        print(f'{k:14s} {v["first"]}..{v["last"]}  {v["n_days"]:5d} days  {v["rows"]:>13,} rows  {v["bytes"] / 1e6:9.1f} MB  ${v["usd"]:.2f}')
    print(f'total quoted ${sum(v["usd"] for v in m["series"].values()):.2f}')


def r2_push(a):
    ak, sk = os.environ.get('R2_ACCESS_KEY'), os.environ.get('R2_SECRET_KEY')
    if not (ak and sk):
        sys.exit('R2_ACCESS_KEY / R2_SECRET_KEY not set -- run through `railway run python databento_orderflow_pull.py --r2-push` or set them. Nothing sent.')
    import boto3
    from botocore.config import Config
    s3 = boto3.client('s3', endpoint_url=os.environ.get('R2_ENDPOINT') or 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com',
                      aws_access_key_id=ak, aws_secret_access_key=sk, region_name='auto', config=Config(retries={'max_attempts': 5}))
    bucket = os.environ.get('R2_BUCKET', 'r2-storage')
    sent = skipped = 0
    for p in sorted(BASE.rglob('*')):
        if not p.is_file() or p.suffix == '.part' or p.name in ('PILOT_REPORT.md',):
            continue
        key = 'orderflow/' + p.relative_to(BASE).as_posix()
        assert key.startswith('orderflow/'), key
        if p.name != 'MANIFEST.json':
            try:
                if s3.head_object(Bucket=bucket, Key=key)['ContentLength'] == p.stat().st_size:
                    skipped += 1; continue
            except Exception:                                                  # noqa: BLE001 - not there yet
                pass
        s3.put_object(Bucket=bucket, Key=key, Body=p.read_bytes())
        sent += 1
    print(f'R2: sent {sent}, already there {skipped}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    for f in ('--pilot', '--check-pilot', '--long-trades', '--status', '--r2-push'):
        ap.add_argument(f, action='store_true')
    ap.add_argument('--cap', type=float, default=120.0)
    ap.add_argument('--spent', type=float, default=None, help='already spent on the long trades pull (default: counted from the manifest)')
    a = ap.parse_args()
    if a.pilot: pilot(a)
    elif a.check_pilot: check_pilot(a)
    elif a.long_trades: long_trades(a)
    elif a.status: status(a)
    elif a.r2_push: r2_push(a)
    else: ap.print_help()
