#!/usr/bin/env python3
"""
Gold (GC) options OI history from Databento, 2022-11 .. 2026-09 -- written 2026-11-05 (owner-approved, cap $108).

Why a separate script: databento_oi_pull.py loads a whole calendar year into memory. Gold's statistics
schema is 222 million records for ONE recent quarter (17.8 GB), so this one:
  - pulls a quarter at a time, straight to disk (raw DBN files live in %TEMP%, NOT in OneDrive),
  - streams each file in 5M-record chunks and keeps only settlement / open interest / cleared volume,
  - writes one small checkpoint per quarter (parts/), so a stop never loses finished quarters,
  - REFUSES to start if the quoted total is over --cap, and STOPS AT THE FIRST FAILURE (no retries:
    a broken stream is billed for what it sent -- see the 2026-10-20 ES pull, $49 against a $32 quote).

    python databento_gold_pull.py --quote            # free: per-quarter quotes + total
    python databento_gold_pull.py --yes              # the paid pull (resumes: done quarters are skipped)
    python databento_gold_pull.py --assemble         # free: parts -> databento_oi/XAU_USD.csv (same columns as the other pairs)
Series is `OG.OPT` (standard monthly gold options, underlying GC) -- confirmed 2026-11-05 on a 1-day pull.
"""
import argparse
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import databento_oi_pull as m  # noqa: E402  (client, STAT_TYPE, DATASET, products.py)

SYMS = ['OG.OPT']
START, END = '2022-11-05', '2026-09-04'
WORK = Path(__import__('os').environ.get('TEMP', '.')) / 'gold_dbn'
PARTS = WORK / 'parts'
WANT = {n: k for k, n in m.STAT_TYPE.items() if n in m.WANTED_STAT_NAMES}   # name -> int


FROM = START          # --from: resume point (2023-01-01 after the 2022 quarter, which is already on disk)


def quarters():
    """Calendar-MONTH chunks from FROM to END (name kept for the callers). Monthly because a 504 loses one month, not a quarter (2026-11-05)."""
    out, y, mo = [], 2022, 11
    while True:
        s = f'{y}-{mo:02d}-01'
        ny, nmo = (y, mo + 1) if mo < 12 else (y + 1, 1)
        e = f'{ny}-{nmo:02d}-01'
        s = max(s, FROM); e = min(e, END)
        if s < e:
            if s >= '2026-04-16':      # 2026-11-06: the 04-16..05-01 half-month 504'd twice on its FIRST request (a hung request, not noise): 5-day pieces from here
                from datetime import date, timedelta
                d0, d1 = date.fromisoformat(s), date.fromisoformat(e)
                while d0 < d1:
                    d2 = min(d0 + timedelta(days=5), d1)
                    out.append((d0.isoformat(), d2.isoformat())); d0 = d2
            elif s >= '2026-01-01':    # 2026 months are 10-17 GB: half-months, so a 504 loses less (2026-11-05)
                mid = s[:8] + '16'
                out += ([(s, min(mid, e))] if s < mid else []) + ([(max(s, mid), e)] if mid < e else [])   # resuming ON the 16th: no empty first half
            else:
                out.append((s, e))
        if e >= END:
            return out
        y, mo = ny, nmo


def label(s):
    return s.replace('-', '')[:6] if s.endswith('-01') else s.replace('-', '')   # monthly tags unchanged; half-month tags carry the day


def quote(c, s, e):
    kw = dict(dataset=m.DATASET, stype_in='parent', symbols=SYMS, start=s, end=e)
    for attempt in range(4):                                   # quotes are FREE (metadata.get_cost), so a gateway 504 here is retried; paid downloads are never retried
        try:
            return c.metadata.get_cost(schema='definition', **kw), c.metadata.get_cost(schema='statistics', **kw)
        except m.db.BentoServerError:
            if attempt == 3: raise
            time.sleep(5 * (attempt + 1))


def run_quote(c, cap):
    tot = 0.0
    for s, e in quarters():
        d, t = quote(c, s, e); tot += d + t
        print(f'{s}..{e}  defs ${d:6.2f}  stats ${t:6.2f}', flush=True)
    print(f'TOTAL ${tot:.2f}  (cap ${cap:.2f})')
    return tot


def pull_quarter(c, s, e):
    tag = label(s) + '_' + label(e)
    WORK.mkdir(parents=True, exist_ok=True); PARTS.mkdir(parents=True, exist_ok=True)
    kw = dict(dataset=m.DATASET, stype_in='parent', symbols=SYMS, start=s, end=e)
    dpath, spath = WORK / f'defs_{tag}.dbn.zst', WORK / f'stats_{tag}.dbn.zst'
    t0 = time.time()
    c.timeseries.get_range(schema='definition', path=str(dpath), **kw)
    d = m.db.DBNStore.from_file(str(dpath)).to_df()
    d = d[d['security_type'] == 'OOF'] if 'security_type' in d.columns else d     # outright options only, no spreads
    d = d.drop_duplicates('instrument_id', keep='last')[['instrument_id', 'raw_symbol', 'strike_price', 'instrument_class', 'expiration', 'underlying']]
    d.to_csv(PARTS / f'defs_{tag}.csv.gz', index=False)
    print(f'    defs {len(d):,} instruments ({time.time() - t0:.0f}s)', flush=True)

    c.timeseries.get_range(schema='statistics', path=str(spath), **kw)
    print(f'    stats downloaded {spath.stat().st_size / 1e9:.2f} GB ({time.time() - t0:.0f}s)', flush=True)
    keep, n = [], 0
    for ch in m.db.DBNStore.from_file(str(spath)).to_df(count=5_000_000):
        n += len(ch)
        ch = ch[ch['stat_type'].isin(WANT.values())]
        dcol = 'ts_ref' if 'ts_ref' in ch.columns else 'ts_recv'
        keep.append(pd.DataFrame({'date': pd.to_datetime(ch[dcol]).dt.date, 'instrument_id': ch['instrument_id'].values,
                                  'stat_type': ch['stat_type'].values, 'price': ch['price'].values, 'quantity': ch['quantity'].values}))
    k = pd.concat(keep, ignore_index=True).drop_duplicates(['date', 'instrument_id', 'stat_type'], keep='last')
    inv = {v: k_ for k_, v in WANT.items()}
    k['name'] = k['stat_type'].map(inv)
    piv = pd.DataFrame({
        'settlement': k[k.name == 'settlement_price'].set_index(['date', 'instrument_id'])['price'],
        'open_interest': k[k.name == 'open_interest'].set_index(['date', 'instrument_id'])['quantity'],
        'volume': k[k.name == 'cleared_volume'].set_index(['date', 'instrument_id'])['quantity'],
    }).reset_index()
    piv.to_csv(PARTS / f'stats_{tag}.csv.gz', index=False)
    (PARTS / f'{tag}.done').write_text(f'{n} records scanned, {len(piv)} rows kept')
    dpath.unlink(missing_ok=True); spath.unlink(missing_ok=True)
    print(f'    kept {len(piv):,} (date, instrument) rows from {n:,} records ({time.time() - t0:.0f}s)', flush=True)


def run_pull(c, cap, spent=0.0):
    # the cap is enforced per chunk against RUNNING spend (spent so far + this chunk's quote), so no slow up-front quote of every month
    for s, e in quarters():
        tag = label(s) + '_' + label(e)
        if (PARTS / f'{tag}.done').exists():
            print(f'{s}..{e}: done already, skipping', flush=True); continue
        d, t = quote(c, s, e)
        if spent + d + t > cap:
            sys.exit(f'{s}..{e}: spent ${spent:.2f} + quote ${d + t:.2f} would pass the approved cap ${cap:.2f} - stopping before buying it')
        print(f'{s}..{e}: pulling (quote ${d + t:.2f}, spent so far ~${spent:.2f})', flush=True)
        try:
            pull_quarter(c, s, e)
        except Exception as ex:                                  # noqa: BLE001 - stop at the FIRST failure, never retry
            print(f'\nSTOPPED at {s}..{e}: {type(ex).__name__}: {str(ex)[:300]}')
            print(f'  finished quarters before this one are safe on disk. Spent so far on finished quarters: ~${spent:.2f}'
                  f' (+ up to this quarter\'s quote ${d + t:.2f}, which a broken stream may have been billed in part). NOT retrying - ask the owner.')
            sys.exit(2)
        spent += d + t
    print(f'\nALL QUARTERS DONE. Spent ~${spent:.2f}. Next: python databento_gold_pull.py --assemble')


def assemble():
    df = pd.concat([pd.read_csv(p) for p in sorted(PARTS.glob('defs_*.csv.gz'))], ignore_index=True).drop_duplicates('instrument_id', keep='last')
    st = pd.concat([pd.read_csv(p) for p in sorted(PARTS.glob('stats_*.csv.gz'))], ignore_index=True)
    st = st.drop_duplicates(['date', 'instrument_id'], keep='last')
    full = st.merge(df, on='instrument_id', how='inner')
    full = full.rename(columns={'strike_price': 'strike', 'instrument_class': 'right', 'expiration': 'expiry'})
    full = full.sort_values(['instrument_id', 'date'])
    full['open_interest_change'] = full.groupby('instrument_id')['open_interest'].diff()
    cols = ['date', 'expiry', 'strike', 'right', 'settlement', 'open_interest', 'open_interest_change', 'volume', 'raw_symbol', 'instrument_id']
    full = full.sort_values(['date', 'expiry', 'strike', 'right'])[cols]
    out = m.OUT_DIR / 'XAU_USD.csv'
    full.to_csv(out, index=False)
    print(f'wrote {out} ({len(full):,} rows, {full.date.min()} .. {full.date.max()}, {full.date.nunique()} dates)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--quote', action='store_true'); ap.add_argument('--yes', action='store_true'); ap.add_argument('--assemble', action='store_true')
    ap.add_argument('--cap', type=float, default=108.0)
    ap.add_argument('--spent', type=float, default=0.0, help='already spent on finished chunks (2022 quarter = 1.77)')
    ap.add_argument('--from', dest='frm', default=START, help='resume point, e.g. 2023-01-01')
    a = ap.parse_args()
    FROM = a.frm
    if a.assemble:
        assemble()
    elif a.quote:
        run_quote(m.get_client(), a.cap)
    elif a.yes:
        run_pull(m.get_client(), a.cap, a.spent)
    else:
        ap.print_help()
