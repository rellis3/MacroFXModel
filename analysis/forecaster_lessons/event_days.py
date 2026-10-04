#!/usr/bin/env python3
"""
Does the Level-Atlas book trade worse on major-event days?

Context: levelAtlasEngine.js and local_decision_engine/lib/zonePricer.mjs build the
rungs with eventTag:'none' on EVERY day, so on FOMC/NFP/CPI days the book trades
quiet-day rungs ~15-20% inside the forecaster's own event-scaled ladder. Lesson 3
§03 (jumps): scheduled releases are the jump component; a fade sized on diffusive
vol is exactly what a jump runs through.

Splits trade R by (a) whether the day has a Major release in the instrument's
currencies (+USD), (b) whether a Major release falls INSIDE the trade's
entry→resolve window, and (c) decision (fade / follow).

Usage: python3 analysis/forecaster_lessons/event_days.py [vp2.json] [calendar_events.csv]
"""
import csv, json, math, sys, re
from collections import defaultdict
from datetime import datetime, timezone
import numpy as np

VP = sys.argv[1] if len(sys.argv) > 1 else 'vp2.json'
CAL = sys.argv[2] if len(sys.argv) > 2 else 'calendar_events.csv'
CCY = {'EURUSD': 'EUR USD', 'GBPUSD': 'GBP USD', 'USDJPY': 'USD JPY', 'AUDUSD': 'AUD USD', 'USDCHF': 'USD CHF',
       'EURAUD': 'EUR AUD USD', 'EURCHF': 'EUR CHF USD', 'AUDJPY': 'AUD JPY USD', 'CADJPY': 'CAD JPY USD',
       'CHFJPY': 'CHF JPY USD', 'GOLD': 'USD', 'NQ': 'USD', 'SPX': 'USD', 'DOW': 'USD', 'US2000': 'USD',
       'DE30': 'EUR USD', 'UK100': 'GBP USD'}
TIER1 = re.compile(r'FOMC|Fed Interest Rate|Nonfarm|Non-Farm|Non Farm|\bCPI\b|Consumer Price', re.I)

ev = defaultdict(list)                     # ccy -> [(epoch, title)]
last_cal = ''
for r in csv.DictReader(open(CAL, encoding='latin-1')):
    if r['impact'] != 'Major': continue
    try: ts = datetime.strptime(r['datetime_raw'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).timestamp()
    except ValueError: continue
    ev[r['ccy']].append((ts, r['event'])); last_cal = max(last_cal, r['date'])
for k in ev: ev[k].sort()

trades = [t for t in json.load(open(VP))['trades'] if t['date'] <= last_cal]


def day_events(t):
    lo = datetime.strptime(t['date'], '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp(); hi = lo + 86400
    out = []
    for c in CCY[t['instrument']].split():
        out += [e for e in ev.get(c, []) if lo <= e[0] < hi]
    return out


groups = defaultdict(list)
for t in trades:
    de = day_events(t)
    inwin = [e for e in de if t['time'] - 300 <= e[0] <= t['resolveTime']]
    tier1 = any(TIER1.search(e[1]) for e in de)
    day = 'tier1-day' if tier1 else ('major-day' if de else 'quiet-day')
    win = 'release-in-trade' if inwin else 'no-release-in-trade'
    for key in (day, win, f"{t['decision']}/{day}", f"{t['decision']}/{win}"):
        groups[key].append(t['rMultiple'])

print(f"trades {len(trades)} (calendar to {last_cal})")
rows = []
for k in sorted(groups):
    v = np.array(groups[k])
    tt = v.mean() / (v.std(ddof=1) / math.sqrt(len(v)))
    rows.append(dict(group=k, n=len(v), meanR=float(v.mean()), t=float(tt), win=float((v > 0).mean())))
    print(f"  {k:36s} n={len(v):6d} meanR {v.mean():+.3f}  t={tt:5.1f}  win {np.mean(v > 0):.1%}")
if '--json' in sys.argv:
    json.dump(rows, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
