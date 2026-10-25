"""Release Reaction, Layer 1: keep the live page current from the laptop. Run every 5 minutes (scripts/release_layer1/run_release_live.bat; Windows Task Scheduler).
    python scripts/release_layer1/live_push.py [--no-pull] [--no-push] [--force-pull]

1. Works out the release schedule (history table + the server's surprise store + the server's calendar feed for what is ahead).
2. If a release is inside its window (10 minutes before to 4 hours 10 minutes after) it pulls fresh 1-minute bars for the six contracts from IB Gateway (port 4002): SOFR Sep26, Euribor Mar27,
   2y, 10y, dollar, Nasdaq. Outside a window it only rebuilds from what is on disk (the 30-minute leg refresh keeps the disk current).
3. Rebuilds the Layer 1 record for every release since 2026-07-03 and POSTs it to the server (KV release_layer1_v1) with the upcoming list. The page reads it from /api/release-layer1.
If the Gateway is not reachable the pull is skipped (said plainly in the payload) and the push still goes, so the page shows how stale the bars are rather than going dark."""
import argparse, json, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rates_line'))
from layer1_lib import *
from schedule import all_events, HIST_END, BASE
from daily_lib import refresh_daily, load_daily

KV_KEY = 'release_layer1_v1'
NAMES = ['SR3U6', 'IH7', 'ZTZ6', 'ZNZ6', 'DXZ6', 'NQZ6']


def kv_set(obj):
    body = json.dumps({'key': KV_KEY, 'data': obj, 'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000)}).encode()
    req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r: return r.getcode(), r.read().decode()[:120]


def pull(names, hours=30):
    import refresh_leg_bars as R
    from ib_insync import IB, Future, util
    found = R.B.discover(); stem = lambda n: found[n]['stem'] if n in found else f'{R.IB_SPEC[n][1]}_{n}'
    ib = IB()
    try: ib.connect('127.0.0.1', R.IB_PORT, clientId=23, timeout=20, readonly=True)
    except Exception as e: return f'IB Gateway not reachable on {R.IB_PORT} ({type(e).__name__}); pull skipped'
    notes = []
    for n in names:
        sym, exch, ccy, month = R.IB_SPEC[n]
        det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
        if not det: notes.append(f'{n}: not found'); continue
        c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
        try: bars = ib.reqHistoricalData(c, endDateTime='', durationStr=f'{hours * 3600} S', barSizeSetting='1 min', whatToShow='MIDPOINT', useRTH=False, formatDate=2, timeout=120)
        except Exception as e: notes.append(f'{n}: {e}'); continue
        if bars:
            df = util.df(bars); df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ')); R.merge(R.SRC / f'{stem(n)}.parquet', df)
        time.sleep(2)
    ib.disconnect(); return 'pulled ' + ', '.join(names) + ('; ' + '; '.join(notes) if notes else '')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--no-pull', action='store_true'); ap.add_argument('--no-push', action='store_true'); ap.add_argument('--force-pull', action='store_true')
    a = ap.parse_args(); now = pd.Timestamp.now(tz='UTC')
    EV = all_events(include_ahead=True); live = [e for e in EV if e['t'] >= HIST_END]
    in_window = [e for e in live if e['t'] - pd.Timedelta(minutes=10) <= now <= e['t'] + pd.Timedelta(minutes=250)]
    note = 'no release in its window: rebuilt from disk'
    if (in_window or a.force_pull) and not a.no_pull:
        note = pull(NAMES, hours=30 if a.force_pull else 8)
        if in_window: note = f'{", ".join(e["family"] for e in in_window)} in window: ' + note
    try: dnote = refresh_daily(max_age_h=4)
    except Exception as e: dnote = f'daily refresh failed ({type(e).__name__}); cache used'
    S = load_sources(); S['_daily'] = load_daily(S); note += ' | ' + dnote; event_days = {e['t'].date() for e in EV}
    rows, paths = [], {}
    for e in live:
        if e['t'] > now: continue
        s0 = S['sofr'].cands[0][1]
        if not covers(s0, e['t']): continue
        r, P = build_event(S, e, event_days); r['id'] = f"{r['t']}|{e['family']}"; r['status'] = e['status']
        r['inProgress'] = bool(now < e['t'] + pd.Timedelta(minutes=240)); rows.append(r); paths[r['id']] = P
    ahead = [dict(t=e['t'].strftime('%Y-%m-%dT%H:%M:%SZ'), family=e['family'], name=e['name'], consensus=e.get('consensus'), previous=e.get('previous')) for e in EV if e['t'] > now]
    last_bar = {k: max((s.index.max() for _, s in S[k].cands), default=None) for k in ('sofr', 'eur', 'zt', 'zn', 'dx', 'nq')}
    payload = dict(asOf=now.isoformat(), note=note, rows=rows, paths=paths, ahead=ahead, lastBar={k: (v.isoformat() if v is not None else None) for k, v in last_bar.items()})
    print(f'{now:%Y-%m-%d %H:%M}Z  {note}; {len(rows)} live releases built, {len(ahead)} ahead; newest bars: ' + ', '.join(f"{k} {v:%m-%d %H:%M}" for k, v in last_bar.items() if v is not None))
    if not a.no_push:
        code, resp = kv_set(payload); print(f'POST /api/kv/set {KV_KEY} ({len(json.dumps(payload)) // 1024} KB) -> HTTP {code} {resp}')
