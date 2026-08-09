"""
base_rate — Phase 1 of the level-confidence engine: what does "trade every touch"
actually yield, per level, per instrument, with NO conditioning yet? This is the
benchmark every confluence filter (Phase 2+) has to beat, split IS/OOS so a filter
that only "wins" by curve-fitting the full sample gets caught.

Usage: python3 base_rate.py <parquet_path> <fx|index|commodity> [calc] [theta] [horizon_min]
       calc: 'cog' (default) or 'original' -- which level calc to run the scan against.
"""
import sys
import json
from collections import defaultdict

import cog_levels
import original_levels
from touch_engine import scan_all, LEVELS

CALCS = {'cog': cog_levels, 'original': original_levels}


def summarize(records, label=''):
    by_level = defaultdict(lambda: defaultdict(int))
    for r in records:
        by_level[r['level']][r['outcome']] += 1

    table = {}
    for level in LEVELS:
        d = by_level.get(level, {})
        n = sum(d.values())
        if n == 0:
            continue
        cont, rev, none, amb = d.get('continuation', 0), d.get('reversion', 0), d.get('no_react', 0), d.get('ambiguous', 0)
        decided = cont + rev
        table[level] = dict(
            n_touches=n,
            pct_continuation=round(100 * cont / n, 1),
            pct_reversion=round(100 * rev / n, 1),
            pct_no_react=round(100 * none / n, 1),
            pct_ambiguous=round(100 * amb / n, 1),
            fade_win_rate=round(100 * rev / decided, 1) if decided else None,      # win-rate if you ALWAYS fade
            follow_win_rate=round(100 * cont / decided, 1) if decided else None,   # win-rate if you ALWAYS follow through
        )
    print(f'\n=== {label} (n={len(records)} total touches) ===')
    print(f"{'level':<14}{'n':>6}{'cont%':>8}{'rev%':>8}{'none%':>8}{'amb%':>7}{'fade WR':>9}{'follow WR':>10}")
    for level in LEVELS:
        if level not in table:
            continue
        t = table[level]
        print(f"{level:<14}{t['n_touches']:>6}{t['pct_continuation']:>8}{t['pct_reversion']:>8}"
              f"{t['pct_no_react']:>8}{t['pct_ambiguous']:>7}"
              f"{(t['fade_win_rate'] if t['fade_win_rate'] is not None else float('nan')):>9}"
              f"{(t['follow_win_rate'] if t['follow_win_rate'] is not None else float('nan')):>10}")
    return table


def main():
    path = sys.argv[1]
    asset_class = sys.argv[2] if len(sys.argv) > 2 else 'fx'
    calc = sys.argv[3] if len(sys.argv) > 3 else 'cog'
    theta = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
    horizon = int(sys.argv[5]) if len(sys.argv) > 5 else 60

    frame = CALCS[calc].build_level_frame(path, asset_class)
    records = scan_all(frame, theta=theta, horizon_min=horizon)

    n_days = frame['daily']['day_idx'].size
    split = n_days // 2
    is_records = [r for r in records if r['day_i'] < split]
    oos_records = [r for r in records if r['day_i'] >= split]

    full = summarize(records, f'{path} [{calc}] FULL SAMPLE (theta={theta}sigma, horizon={horizon}min)')
    is_t = summarize(is_records, f'{path} [{calc}] IN-SAMPLE (first half)')
    oos_t = summarize(oos_records, f'{path} [{calc}] OUT-OF-SAMPLE (second half)')

    out = dict(path=path, asset_class=asset_class, calc=calc, theta=theta, horizon_min=horizon,
               full=full, in_sample=is_t, out_of_sample=oos_t)
    out_path = path.rsplit('/', 1)[-1].replace('.parquet', '') + f'_{calc}_base_rate.json'
    with open(out_path, 'w') as f:
        json.dump(out, f, indent=2)
    print(f'\nwrote {out_path}')


if __name__ == '__main__':
    main()
