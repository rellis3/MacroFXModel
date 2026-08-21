"""
confluence_cvol_regime — Phase 2, filter: does the OPTIONS MARKET'S PRICED risk
(CME CVOL convexity -- "how fat are the tails") predict fade-vs-continuation at
a level, the same way the OI/GEX pin-vs-acceleration bucket
(confluence_oi_regime.py) tests dealer hedging flow?

THIS IS A DIFFERENT MECHANISM, NOT A SUBSTITUTE. Pin-vs-acceleration (the
OI/GEX study) is a causal claim about dealer hedging: long gamma dampens
moves, short gamma amplifies them -- it needs strike-level positioning.
Convexity is an aggregate implied-vol shape read (CME's CVOL index family,
Lens 5 "Butterfly" in MD files/cross_asset_volatility_diagnostic.md): high
convexity means the options market is pricing fatter tails (bigger moves,
either direction), low convexity means a narrower expected distribution.
That's a PROXY hypothesis for acceleration-proneness, not the same causal
story -- worth testing on its own merits, not assumed to agree with GEX.

WHY THIS SCRIPT EXISTS SEPARATELY FROM confluence_oi_regime.py: that study is
stuck waiting on oi_history to accumulate (CME serves no OI history, so it's
forward-only from the day it started archiving) and is scoped to NQ/gold only
(the only instruments with usable CME options OI). CVOL has neither problem --
CME's CVOL EOD series goes back to 2016 for FX majors + gold
(data/cvol/cme_cvol_eod.parquet, already on disk, no live export step needed)
-- so this can run a REAL IS/OOS-split backtest today, and it reaches FX pairs
the OI study can't touch at all.

METHOD: for each (instrument, day), take the convexity print from the most
recent CVOL EOD settle strictly BEFORE that day (causal -- a session can only
see yesterday's close, matching the causal_sigma convention used everywhere
else in levelEngine), rank it against its own trailing window (the "vol cone"
percentile idea, Lens 4 of the cross-asset diagnostic doc) and bucket:
  low_convexity  < 25th pct   -- market pricing a narrow distribution
  mid_convexity  25th-75th    -- fair/typical
  high_convexity >= 75th pct  -- market pricing fat tails
Then split the existing fade/continuation base rates by that bucket, same
IS/OOS + cost-positive + sign-agreement discipline as confluence_budget.py.

SCOPE: only instruments where CME CVOL directly covers the product --
eurusd/gbpusd/audusd/usdcad/usdchf/usdjpy/gold. Crosses (eurjpy, gbpaud, ...)
have no direct CVOL series in this dataset and are deliberately left out
rather than proxied.

Usage: python3 confluence_cvol_regime.py [window_days] [theta] [horizon_min] [min_touches]
"""
import sys
import os
import json
import csv
import bisect

import numpy as np

from run_all import INSTRUMENTS, CALCS
from base_rate import CALCS as CALC_MODULES, summarize, LEVELS
from touch_engine import scan_all
from level_frame import day_date
from cost_model import cost_adjust, summarize_costed

CVOL_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'cvol', 'cme_cvol_eod.parquet')
CVOL_MAP = {   # levelEngine instrument name -> CME CVOL `product` code
    'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'audusd': 'AUDUSD',
    'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD',
}
MIN_WINDOW_SAMPLE = 30   # don't trust a percentile rank until the trailing window has at least this many prints

BUCKETS = [
    ('low_convexity',  lambda p: p < 0.25),
    ('mid_convexity',  lambda p: 0.25 <= p < 0.75),
    ('high_convexity', lambda p: p >= 0.75),
]


def _trailing_percentile(values, window):
    """Causal percentile rank of values[i] within values[max(0,i-window+1):i+1],
    for every i. No lookahead -- rank uses only that day's print and PRIOR days,
    matching the trailing-window convention. NaN until MIN_WINDOW_SAMPLE prints
    have accumulated (a percentile off 3 data points is not a percentile)."""
    n = len(values)
    out = np.full(n, np.nan)
    for i in range(n):
        lo = max(0, i - window + 1)
        w = values[lo:i + 1]
        if w.size < MIN_WINDOW_SAMPLE:
            continue
        out[i] = float((w <= values[i]).mean())
    return out


def load_cvol_regime_map(window_days=252):
    """Build {levelEngine_instrument: {date: bucket_name}} from the local CVOL
    parquet -- no live fetch, this is a static file already on disk. Percentile
    is computed per-product on its own history (a 'rich' EURUSD convexity print
    is not compared to gold's, per the diagnostic doc's own rule: compare each
    product against its own history, never across products directly)."""
    import pyarrow.parquet as pq
    if not os.path.exists(CVOL_PATH):
        return {}
    t = pq.read_table(CVOL_PATH, columns=['timestamp', 'product', 'convexity'])
    products = t.column('product').to_pylist()
    timestamps = t.column('timestamp').to_pylist()
    convexity = np.array(t.column('convexity').to_pylist(), dtype=np.float64)
    dates = [ts.strftime('%Y-%m-%d') for ts in timestamps]

    by_product = {}
    for i, p in enumerate(products):
        by_product.setdefault(p, []).append(i)

    out = {}
    for lvl_name, cme_code in CVOL_MAP.items():
        idx = by_product.get(cme_code)
        if not idx:
            continue
        idx.sort(key=lambda i: dates[i])
        d = [dates[i] for i in idx]
        v = convexity[idx]
        pct = _trailing_percentile(v, window_days)
        bucket_by_date = {}
        for date_i, p in zip(d, pct):
            if np.isnan(p):
                continue
            name = next(name for name, pred in BUCKETS if pred(p))
            bucket_by_date[date_i] = name
        out[lvl_name] = dict(dates=sorted(bucket_by_date.keys()), buckets=bucket_by_date)
    return out


def _asof_bucket(session_date, cvol_series):
    """The bucket available going into `session_date`'s trading session -- the
    most recent CVOL EOD print STRICTLY BEFORE that date (a session can only
    see yesterday's settle, never today's, which hasn't printed yet)."""
    dates = cvol_series['dates']
    pos = bisect.bisect_left(dates, session_date)   # first date >= session_date
    if pos == 0:
        return None
    return cvol_series['buckets'][dates[pos - 1]]


def _stamp_bucket(records, frame, cvol_series):
    date_cache = {}
    for r in records:
        di = r['day_i']
        if di not in date_cache:
            date_cache[di] = day_date(frame, di)
        r['cvol_bucket'] = _asof_bucket(date_cache[di], cvol_series) if cvol_series else None
    return records


def bucket_rows(name, calc, asset_class, records, split, min_touches):
    rows = []
    for bucket_name, _pred in BUCKETS:
        sub = [r for r in records if r['cvol_bucket'] == bucket_name]
        is_r = [r for r in sub if r['day_i'] < split]
        oos_r = [r for r in sub if r['day_i'] >= split]
        gross_is = summarize(is_r, verbose=False)
        gross_oos = summarize(oos_r, verbose=False)
        costed_is = summarize_costed(cost_adjust(is_r, name, asset_class), LEVELS)
        costed_oos = summarize_costed(cost_adjust(oos_r, name, asset_class), LEVELS)

        for level in LEVELS:
            is_row, oos_row = gross_is.get(level), gross_oos.get(level)
            if not is_row or not oos_row:
                continue
            if is_row['n_touches'] < min_touches or oos_row['n_touches'] < min_touches:
                continue
            is_edge = is_row['follow_win_rate'] - is_row['fade_win_rate']
            oos_edge = oos_row['follow_win_rate'] - oos_row['fade_win_rate']
            if is_edge == 0 or oos_edge == 0 or (is_edge > 0) != (oos_edge > 0):
                continue
            side = 'follow' if oos_edge > 0 else 'fade'

            is_c, oos_c = costed_is.get(level), costed_oos.get(level)
            if not is_c or not oos_c:
                continue
            is_net_r, oos_net_r = is_c[f'{side}_mean_net_r'], oos_c[f'{side}_mean_net_r']
            if is_net_r <= 0 or oos_net_r <= 0:
                continue

            rows.append(dict(
                instrument=name, calc=calc, level=level, bucket=bucket_name, side=side,
                is_wr=is_row['follow_win_rate'] if side == 'follow' else is_row['fade_win_rate'],
                oos_wr=oos_row['follow_win_rate'] if side == 'follow' else oos_row['fade_win_rate'],
                is_net_r=round(is_net_r, 3), oos_net_r=round(oos_net_r, 3),
                is_n=is_row['n_touches'], oos_n=oos_row['n_touches'],
            ))
    return rows


def main():
    window_days = int(sys.argv[1]) if len(sys.argv) > 1 else 252
    theta = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25
    horizon = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    min_touches = int(sys.argv[4]) if len(sys.argv) > 4 else 30

    cvol_map = load_cvol_regime_map(window_days)
    if not cvol_map:
        print(f"no CVOL data found at '{CVOL_PATH}' -- nothing to bucket; exiting.")
        return

    unconditioned = set()
    if os.path.exists('leaderboard.json'):
        with open('leaderboard.json') as f:
            for r in json.load(f):
                unconditioned.add((r['instrument'], r['calc'], r['level']))

    all_rows = []
    for name, path, asset_class in INSTRUMENTS:
        if name not in CVOL_MAP:
            continue
        if not os.path.exists(path):
            continue
        cvol_series = cvol_map.get(name)
        if not cvol_series:
            print(f'{name}: no CVOL series loaded -- skipping')
            continue
        for calc in CALCS:
            print(f'scanning {name} [{calc}] (cvol-convexity-bucketed, {len(cvol_series["dates"])} CVOL day(s), '
                  f'{window_days}d trailing window) ...')
            frame = CALC_MODULES[calc].build_level_frame(path, asset_class)
            records = scan_all(frame, theta=theta, horizon_min=horizon)
            _stamp_bucket(records, frame, cvol_series)
            tagged = sum(1 for r in records if r['cvol_bucket'] is not None)
            print(f'  {tagged}/{len(records)} touches matched to a CVOL bucket')
            split = frame['daily']['day_idx'].size // 2
            rows = bucket_rows(name, calc, asset_class, records, split, min_touches)
            for r in rows:
                r['new_vs_unconditioned'] = (r['instrument'], r['calc'], r['level']) not in unconditioned
            all_rows.extend(rows)

    if not all_rows:
        print('\nno bucket-conditioned survivor cleared IS/OOS-agreement + cost-positive on both halves.\n')
        return

    all_rows.sort(key=lambda r: r['oos_net_r'], reverse=True)
    with open('leaderboard_cvol_regime.json', 'w') as f:
        json.dump(all_rows, f, indent=2)
    with open('leaderboard_cvol_regime.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
        w.writeheader()
        w.writerows(all_rows)

    new_rows = [r for r in all_rows if r['new_vs_unconditioned']]
    print(f'\n{len(all_rows)} bucket-conditioned survivors, {len(new_rows)} of them NOT in the '
          f'unconditioned leaderboard (pairs/levels the convexity filter revived)\n')
    print(f"{'instrument':<10}{'calc':<10}{'level':<14}{'bucket':<15}{'side':<8}{'new?':<6}"
          f"{'IS WR':>7}{'OOS WR':>8}{'OOS netR':>10}{'OOS n':>7}")
    for r in all_rows[:50]:
        print(f"{r['instrument']:<10}{r['calc']:<10}{r['level']:<14}{r['bucket']:<15}{r['side']:<8}"
              f"{'Y' if r['new_vs_unconditioned'] else '':<6}"
              f"{r['is_wr']:>7}{r['oos_wr']:>8}{r['oos_net_r']:>10}{r['oos_n']:>7}")
    print('\nwrote leaderboard_cvol_regime.json / leaderboard_cvol_regime.csv')


if __name__ == '__main__':
    main()
