"""Overnight-hold trades AFTER the 2026-08-21 cutoff, for display only (never scored).

The banked study stops at the lockbox date. This rebuilds the same rule from the OANDA bid/ask M1 file
(data/m1_bidask, which runs to 2026-10-20) so overnight-hold-real-costs.html can show what happened since,
in its own clearly separated panel. Rule, as js/overnightHoldEngine.js: Sun-Thu UK dates, entry = close of the last
M1 bar at or before 20:00 Europe/London (within 30 min), exit = the same at 14:30 London the next calendar day.
Costs as scripts/overnight-hold/honest.py (bid/ask half-spread at each fill) and the page's financing books.

First proves itself: the builder must reproduce the banked trades over 2026-05-01 -> 2026-08-20 (prices and gross).
Writes analysis/output/overnight-hold-toolkit/post_cutoff.json (percentages and prices only).
Usage: python scripts/overnight-hold-toolkit/build_post_cutoff.py
"""
import json
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis/output/overnight-hold-toolkit/post_cutoff.json'
LON = ZoneInfo('Europe/London')
CUTOFF = date(2026, 8, 21)            # lockbox: first session not in the banked study
FIRST_POST = date(2026, 8, 20)        # the 08-20 night exits on 08-21, so the study (bars to 08-20 23:59 UTC) never had it
MODEL = {'nq': (2.51, 1), 'gold': (1.44, 3)}   # our banked financing model: markup pp, Wednesday days


def epoch(d, hhmm):
    h, m = map(int, hhmm.split(':'))
    return int(datetime.combine(d, time(h, m), LON).timestamp())


def build(m1, start, end):
    e = m1.epoch.to_numpy(); c = m1.close.to_numpy(); lo = m1.low.to_numpy(); hi = m1.high.to_numpy()

    def at(t):
        i = np.searchsorted(e, t, side='right') - 1
        return i if i >= 0 and t - e[i] <= 1800 else None

    rows, d = [], start
    while d <= end:
        if d.isoweekday() in (7, 1, 2, 3, 4):           # Sun..Thu
            x = d + timedelta(days=1)
            i, j = at(epoch(d, '20:00')), at(epoch(x, '14:30'))
            if i is not None and j is not None and j > i:
                p, q = c[i], c[j]
                w = slice(i, np.searchsorted(e, e[j] + 60))
                rows.append({'date': d.isoformat(), 'exitDate': x.isoformat(), 'entryEpoch': int(e[i]), 'exitEpoch': int(e[j]),
                             'entryPrice': p, 'exitPrice': q, 'grossPct': (q / p - 1) * 100,
                             'maePct': min(0.0, (lo[w].min() - p) / p * 100, (q / p - 1) * 100),
                             'mfePct': max(0.0, (hi[w].max() - p) / p * 100)})
        d += timedelta(days=1)
    return pd.DataFrame(rows)


def half_spread(m1, epochs):
    e = m1.epoch.to_numpy(); i = np.searchsorted(e, epochs, side='right') - 1
    b, a = m1.bid_c.to_numpy()[i], m1.ask_c.to_numpy()[i]
    return (a - b) / 2 / ((a + b) / 2) * 100


def main():
    v = json.loads((ROOT / 'analysis/output/cost-verification/results.json').read_text())
    cells = {(c['instrument'], c['group']): c for c in v['A']['cells'] if c['side'] == 'long'}
    dff = pd.read_csv(ROOT / 'analysis/output/overnight-hold/dff.csv', parse_dates=['observation_date']).set_index('observation_date')['DFF']
    dff = dff.reindex(pd.date_range(dff.index.min(), '2026-12-31')).ffill()
    out = {'built': date.today().isoformat(), 'cutoff': CUTOFF.isoformat(), 'first_entry': FIRST_POST.isoformat(), 'instruments': {}}
    for key in ('nq', 'gold'):
        m1 = pd.read_parquet(ROOT / 'data/m1_bidask' / f'{key}_m1.parquet', columns=['time', 'high', 'low', 'close', 'bid_c', 'ask_c'])
        m1['epoch'] = m1.time.astype('datetime64[s]').astype('int64')
        m1 = m1.sort_values('epoch').reset_index(drop=True)

        # 1. reproduce the banked trades before the cutoff
        banked = pd.read_csv(ROOT / f'analysis/output/overnight-hold/honest_trades_{key}.csv')
        banked = banked[banked.date >= '2026-05-01']
        mine = build(m1, date(2026, 5, 1), FIRST_POST - timedelta(days=1)).set_index('date')
        j = banked.set_index('date').join(mine, rsuffix='_m', how='left')
        miss = int(j.grossPct_m.isna().sum())
        gdiff = float((j.grossPct - j.grossPct_m).abs().max())
        pdiff = float(((j.entryPrice - j.entryPrice_m) / j.entryPrice).abs().max() * 100)
        extra = len(set(mine.index) - set(banked.date))
        print(f'{key} reproduce {len(banked)} banked trades: missing {miss}, extra {extra}, max |gross diff| {gdiff:.4f}pp, max entry diff {pdiff:.4f}%')
        assert miss == 0 and extra == 0 and gdiff < 0.01, 'builder does not reproduce the banked trades'

        # 2. the trades since the cutoff
        last = (m1.time.max() - pd.Timedelta(days=1)).date()
        t = build(m1, FIRST_POST, last)
        t = t[t.exitEpoch <= int(m1.epoch.max())].reset_index(drop=True)
        dts = pd.to_datetime(t.date)
        is_wed = (dts.dt.dayofweek == 2).to_numpy()
        spread = half_spread(m1, t.entryEpoch.to_numpy()) + half_spread(m1, t.exitEpoch.to_numpy())
        mk, wd = MODEL[key]
        fin = {'oanda': (dff.reindex(dts).to_numpy() + mk) / 365 * np.where(is_wed, wd, 1)}
        for grp in ('A', 'B'):
            c = cells.get((key, grp))
            if c is None:
                continue
            days = np.where(is_wed, round(c['wed_multiple']), 1)
            fin[grp] = (dff.reindex(dts).to_numpy() + c['implied_markup_pp']) / 365 * days if grp == 'B' else -c['per_night_pct'] * days
        r = lambda a: [round(float(x), 5) for x in a]
        out['instruments'][key] = {
            'entry': t.date.tolist(), 'exit': t.exitDate.tolist(),
            'entry_epoch': t.entryEpoch.tolist(), 'exit_epoch': t.exitEpoch.tolist(),
            'price': r(t.entryPrice), 'exit_price': r(t.exitPrice),
            'hold_h': r((t.exitEpoch - t.entryEpoch) / 3600),
            'gross': r(t.grossPct), 'mae': r(t.maePct), 'mfe': r(t.mfePct), 'spread': r(spread),
            'fin': {g: r(a) for g, a in fin.items()},
            'reproduced_before_cutoff': {'trades': len(banked), 'max_gross_diff_pp': round(gdiff, 5)},
        }
        print(f'{key}: {len(t)} trades since the cutoff, {t.date.iloc[0]} -> {t.exitDate.iloc[-1]}, gross mean {t.grossPct.mean():.3f}%')
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(OUT)


if __name__ == '__main__':
    main()
