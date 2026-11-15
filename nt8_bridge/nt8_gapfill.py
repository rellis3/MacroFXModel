"""Fill the ~6-week holes in NT8 per-contract 1-minute files (DATA_SPEC #24).

Cause found 2026-11-15: nt8_backfill.py pulls 40-day chunks; NT8's BarsRequest sometimes returns only the first hour
of such a chunk with NoError, so the rest of the chunk was silently lost. One-week requests return complete data.
This re-pulls every thin week (< MIN_BARS) of each contract's window one week at a time and merges (new rows win on
duplicate timestamps; a week is only replaced if the re-pull has MORE bars). Read-only on NT8; writes contract files.

    python nt8_bridge/nt8_gapfill.py ES NQ YM RTY      # then: python nt8_bridge/nt8_stitch.py ES NQ YM RTY
"""
import datetime as dt, json, sys, time
from pathlib import Path
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'nt8_bridge'))
import nt8_backfill as nb  # noqa: E402  (call/pull/keep_awake, PRE_DAYS/POST_DAYS)

BASE = REPO / 'analysis' / 'output' / 'nt8' / 'contracts'
MIN_BARS = int(__import__("os").environ.get("NT8_MIN_BARS", 5000))  # normal week ~6,900 1-min bars, holiday ~5,500; a hole starting mid-week can leave > 5,000, so check the study's day count after
LOG = BASE / 'gapfill_log.jsonl'

roots = sys.argv[1:] or ['ES', 'NQ', 'YM', 'RTY']
today = dt.date.today()
nb.keep_awake()
for root in roots:
    for f in sorted((BASE / root).glob(f'{root}_*.parquet')):
        mm, yy = f.stem.split('_')[1].split('-')
        y, m = 2000 + int(yy), int(mm)
        name = f'{root} {mm}-{yy}'
        first = dt.date(y, m, 1)
        start = first - dt.timedelta(days=nb.PRE_DAYS)
        end = min(first + dt.timedelta(days=nb.POST_DAYS), today)
        df = pd.read_parquet(f)
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
        sun = start - dt.timedelta(days=(start.weekday() + 1) % 7)      # Sunday on/before start
        added = 0
        while sun < end:
            nxt = sun + dt.timedelta(days=7)
            lo, hi = pd.Timestamp(sun, tz='UTC'), pd.Timestamp(nxt, tz='UTC')
            have = int(((df.timestamp >= lo) & (df.timestamp < hi)).sum())
            if have < MIN_BARS:
                new = None
                for attempt in range(3):
                    try:
                        new = nb.pull(name, sun, nxt); break
                    except Exception as ex:                                # noqa: BLE001
                        if 'unknown instrument' in str(ex): break
                        time.sleep(5)
                if new is not None and len(new):
                    new['timestamp'] = pd.to_datetime(new['timestamp'], utc=True)
                    new = new[(new.timestamp >= lo) & (new.timestamp < hi)]
                    if len(new) > have:
                        df = pd.concat([df[(df.timestamp < lo) | (df.timestamp >= hi)], new])
                        added += len(new) - have
                        with LOG.open('a') as g:
                            g.write(json.dumps({'c': name, 'week': str(sun), 'had': have, 'now': len(new)}) + '\n')
            sun = nxt
        if added:
            df = df.drop_duplicates('timestamp').sort_values('timestamp').reset_index(drop=True)
            df.to_parquet(f, index=False)
        print(dt.datetime.now().strftime('%H:%M:%S'), name, f'+{added:,} bars', flush=True)
print('done')
