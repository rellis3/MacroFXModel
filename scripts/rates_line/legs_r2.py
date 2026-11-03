"""legs_r2.py -- R2 is the store for the rate-legs data; the repo no longer carries it.

Two folders the 30-minute laptop job (refresh_leg_bars.py) rewrites:

  analysis/output/stir_1m_deep/<stem>.parquet   IBKR 1-minute bars per contract (research input, 44 scripts read it)
      -> rates-legs/m1/<stem>/<YYYY-MM-DD>.parquet   one object per contract per UTC day. A run uploads only the
         days from the last day it already sent (that day again, it may have been partial), so the history is
         never re-sent.
  analysis/output/cog_chart/*.json              the chart page's legs (server.js reads them from disk)
      -> rates-legs/cog_chart/<file>.json.gz  + rates-legs/cog_chart/manifest.json (sha256 of each raw json)
         at most every --chart-hours (default 6): the server's 3-day KV overlay (cog_legs_live_v1) carries the
         newest bars, so the base only has to be recent. server.js syncs these to its own disk at boot and every
         30 minutes (_ccSyncFromR2), comparing the manifest's sha256 with what it holds.

    python scripts/rates_line/legs_r2.py push                 # what run_cog_legs.bat calls after each refresh
    python scripts/rates_line/legs_r2.py push --force-chart   # send the chart files now
    python scripts/rates_line/legs_r2.py pull                 # another machine / fresh checkout: rebuild both folders

Credentials: R2_ACCESS_KEY / R2_SECRET_KEY in the environment (or `railway run python ...`). Without them it says
so and exits 0, so a missing key never fails the refresh job. Every key is asserted to start with `rates-legs/`.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
OUT = ROOT / 'analysis' / 'output' / 'cog_chart'
STATE = SRC / '_r2_state.json'
PREFIX = 'rates-legs/'
R2_ENDPOINT = os.environ.get('R2_ENDPOINT') or 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com'


def client():
    if not (os.environ.get('R2_ACCESS_KEY') and os.environ.get('R2_SECRET_KEY')):
        return None
    import boto3
    from botocore.config import Config
    return boto3.client('s3', endpoint_url=R2_ENDPOINT, aws_access_key_id=os.environ['R2_ACCESS_KEY'],
                        aws_secret_access_key=os.environ['R2_SECRET_KEY'], region_name='auto',
                        config=Config(max_pool_connections=8, retries={'max_attempts': 5}))


def bucket():
    return os.environ.get('R2_BUCKET', 'r2-storage')


def put(s3, key, body: bytes, ctype='application/octet-stream'):
    assert key.startswith(PREFIX), key                    # never write outside rates-legs/
    for attempt in range(5):                              # this laptop's link drops R2 TLS sessions under load (SSL EOF): retry with backoff
        try:
            return s3.put_object(Bucket=bucket(), Key=key, Body=body, ContentType=ctype)
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)


def load_state():
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {'m1': {}, 'chart': {'at': 0, 'sha': {}}}


def push_m1(s3, state, pool):
    import pandas as pd
    jobs, sent = [], 0
    for p in sorted(SRC.glob('*.parquet')):
        st = state['m1'].get(p.stem, {})
        mtime = p.stat().st_mtime
        if st.get('mtime') == mtime:
            continue
        df = pd.read_parquet(p)
        day = df['time'].astype(str).str[:10]
        days = sorted(day.unique())
        todo = [d for d in days if d >= st.get('last_day', '')]
        part = []
        for d in todo:
            buf = io.BytesIO()
            df[day == d].reset_index(drop=True).to_parquet(buf, index=False)
            part.append(pool.submit(put, s3, f'{PREFIX}m1/{p.stem}/{d}.parquet', buf.getvalue()))
        for j in part:
            j.result()                                    # this contract is fully sent before its state moves on
        sent += len(todo)
        state['m1'][p.stem] = {'mtime': mtime, 'last_day': days[-1] if days else '', 'rows': int(len(df))}
        STATE.write_text(json.dumps(state))               # a later failure does not re-send this contract
    cd = SRC / 'contract_details.json'
    if cd.exists():
        jobs.append(pool.submit(put, s3, f'{PREFIX}m1/contract_details.json', cd.read_bytes(), 'application/json'))
    for j in jobs:
        j.result()                                        # raise the first failure; state is only saved after this
    return sent


def push_chart(s3, state, pool, force):
    if not force and time.time() - state['chart'].get('at', 0) < ARGS.chart_hours * 3600:
        return None
    files, jobs = {}, []
    for p in sorted(OUT.glob('*.json')):
        raw = p.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        files[p.name] = {'sha256': sha, 'bytes': len(raw)}
        if state['chart']['sha'].get(p.name) != sha:
            jobs.append(pool.submit(put, s3, f'{PREFIX}cog_chart/{p.name}.gz', gzip.compress(raw, mtime=0), 'application/gzip'))
    for j in jobs:
        j.result()
    manifest = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'files': files}
    put(s3, f'{PREFIX}cog_chart/manifest.json', json.dumps(manifest).encode(), 'application/json')   # manifest last
    state['chart'] = {'at': time.time(), 'sha': {k: v['sha256'] for k, v in files.items()}}
    return len(jobs)


def pull(s3):
    import pandas as pd
    SRC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    keys = []
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket(), Prefix=f'{PREFIX}m1/'):
        keys += [o['Key'] for o in page.get('Contents', [])]
    by_stem = {}
    for k in keys:
        parts = k[len(PREFIX) + 3:].split('/')
        if len(parts) == 2:
            by_stem.setdefault(parts[0], []).append(k)
    get = lambda k: s3.get_object(Bucket=bucket(), Key=k)['Body'].read()
    with ThreadPoolExecutor(16) as pool:
        for stem, ks in sorted(by_stem.items()):
            parts = [pd.read_parquet(io.BytesIO(b)) for b in pool.map(get, sorted(ks))]
            df = pd.concat(parts, ignore_index=True).drop_duplicates('time', keep='last').sort_values('time')
            df.reset_index(drop=True).to_parquet(SRC / f'{stem}.parquet', index=False)
            print(f'{stem}: {len(ks)} days, {len(df):,} bars')
        if f'{PREFIX}m1/contract_details.json' in keys:
            (SRC / 'contract_details.json').write_bytes(get(f'{PREFIX}m1/contract_details.json'))
        man = json.loads(get(f'{PREFIX}cog_chart/manifest.json'))
        names = list(man['files'])
        for n, b in zip(names, pool.map(lambda n: get(f'{PREFIX}cog_chart/{n}.gz'), names)):
            (OUT / n).write_bytes(gzip.decompress(b))
        print(f'cog_chart: {len(names)} files as of {man["generatedAt"]}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['push', 'pull'])
    ap.add_argument('--force-chart', action='store_true')
    ap.add_argument('--chart-hours', type=float, default=6)
    ARGS = ap.parse_args()
    s3 = client()
    if s3 is None:
        print('legs_r2: R2_ACCESS_KEY / R2_SECRET_KEY not set, nothing sent (run through `railway run` or set them)')
        sys.exit(0)
    if ARGS.cmd == 'pull':
        pull(s3)
        sys.exit(0)
    state = load_state()
    with ThreadPoolExecutor(4) as pool:
        n = push_m1(s3, state, pool)
        STATE.write_text(json.dumps(state))
        c = push_chart(s3, state, pool, ARGS.force_chart)
        STATE.write_text(json.dumps(state))
    print(f'legs_r2: {n} contract-days sent' + (f', chart: {c} changed files + manifest' if c is not None else ', chart not due'))
