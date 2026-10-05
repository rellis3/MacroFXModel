#!/usr/bin/env python3
"""
Live ↔ backtest PARITY for the Vote Atlas book (Lesson 03 §01: the transfer
coefficient, TC). Does the live bot take the trades the backtest takes?

This is the cheap, fast check that comes BEFORE any forward P&L record. Parity is
deterministic, not statistical: a correct live engine reproduces the backtest's
trade list. It needs days of logs, not months, and nobody has to be at the screen.

Inputs:
  vp2.json               backtest trade list (Vote Atlas portfolio v2)
  <decision log>.json    live bot decision log ({data:{events:[{t,pair,side,rung,
                         decision,margin,status,reason}]}}), e.g. v2_decision_log.json
                         or v3_decision_log.json pulled from the bot.

A live entry MATCHES a backtest trade when pair, side, rung and follow/fade agree and
the entry times are within --tol minutes. Reports, per period:
  - share of backtest trades the live bot took (recall)
  - share of live entries the backtest also has (precision)
  - backtest R of the trades live took vs missed (is the miss random, or the best ones?)
  - why the misses happened (no live signal at all / blocked / rejected / flipped)

Usage:
  python3 analysis/forecaster_lessons/live_parity.py vp2.json v2_decision_log.json [--from 2026-09-03] [--to 2026-09-18] [--tol 60] [--split 2026-09-15]
"""
import argparse, collections, datetime as dt, json, math

ap = argparse.ArgumentParser()
ap.add_argument('backtest'); ap.add_argument('log')
ap.add_argument('--from', dest='lo'); ap.add_argument('--to', dest='hi')
ap.add_argument('--tol', type=float, default=60, help='minutes')
ap.add_argument('--split', help='also report before/after this date (e.g. an engine fix)')
ap.add_argument('--json')
a = ap.parse_args()

ev = json.load(open(a.log)); ev = ev.get('data', ev).get('events', ev) if isinstance(ev, dict) else ev
bt_all = json.load(open(a.backtest))['trades']
D = lambda t: dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime('%Y-%m-%d')
live_days = sorted({D(e['t']) for e in ev})
bt_days = sorted({t['date'] for t in bt_all})
lo = a.lo or max(live_days[0], bt_days[0]); hi = a.hi or min(live_days[-1], bt_days[-1])
key = lambda p, s, r, d: (str(p).lower(), s, r, d)


def mean_se(x):
    if len(x) < 2: return (float('nan'), float('nan'))
    m = sum(x) / len(x); s = math.sqrt(sum((v - m) ** 2 for v in x) / (len(x) - 1))
    return m, s / math.sqrt(len(x))


def parity(lo, hi):
    live = [e for e in ev if e.get('status') == 'entered' and lo <= D(e['t']) <= hi]
    bt = [t for t in bt_all if lo <= t['date'] <= hi]
    used, live_hit = set(), 0
    for e in live:
        c = [i for i, t in enumerate(bt) if i not in used
             and key(t['instrument'], t['side'], t['rung'], t['decision']) == key(e['pair'], e['side'], e['rung'], e['decision'])
             and abs(t['time'] - e['t']) <= a.tol * 60]
        if c: used.add(min(c, key=lambda i: abs(bt[i]['time'] - e['t']))); live_hit += 1
    taken = [bt[i]['rMultiple'] for i in used]; missed = [t['rMultiple'] for i, t in enumerate(bt) if i not in used]
    why = collections.Counter()
    for i, t in enumerate(bt):
        if i in used: continue
        p = t['instrument'].lower()
        near = [e for e in ev if e.get('pair') == p and abs(e['t'] - t['time']) <= 900 and e.get('status') != 'entered']
        if near:
            why[f"{near[0]['status']}: {(near[0].get('reason') or '').split('—')[0].split('(')[0].strip()[:40]}"] += 1
        elif any(e['pair'] == p and abs(e['t'] - t['time']) <= 3600 for e in live):
            why['live entered same pair, different side/rung/decision'] += 1
        else:
            why['no live event at all (signal never fired live)'] += 1
    (mt, st), (mm, sm) = mean_se(taken), mean_se(missed)
    return dict(period=[lo, hi], backtest_trades=len(bt), live_entries=len(live), matched=len(used),
                recall=len(used) / len(bt) if bt else None, precision=live_hit / len(live) if live else None,
                backtestR_taken=mt, backtestR_missed=mm,
                missed_minus_taken_t=(mm - mt) / math.hypot(st, sm) if st == st and sm == sm else None,
                why_missed=why.most_common())


out = [parity(lo, hi)]
if a.split: out += [parity(lo, (dt.date.fromisoformat(a.split) - dt.timedelta(days=1)).isoformat()), parity(a.split, hi)]
for r in out:
    print(f"\n{r['period'][0]} → {r['period'][1]}: backtest {r['backtest_trades']} trades, live {r['live_entries']} entries, matched {r['matched']}")
    if r['recall'] is not None:
        print(f"  live took {r['recall']:.0%} of backtest trades; {1 - (r['precision'] or 0):.0%} of live entries are NOT in the backtest")
        print(f"  backtest R of trades live took {r['backtestR_taken']:+.3f} vs missed {r['backtestR_missed']:+.3f}  (t={r['missed_minus_taken_t']:.2f})")
        for w, n in r['why_missed'][:8]: print(f"    {n:4d}  {w}")
print("\nPass bar (L03 transfer coefficient): recall ≥ 90% and precision ≥ 90% before any P&L comparison means anything.")
if a.json: json.dump(out, open(a.json, 'w'), indent=1, default=float)
