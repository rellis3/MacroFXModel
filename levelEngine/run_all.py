"""
run_all — batch the base-rate scan across every instrument we actually have M1
for for both calcs (cog, original), and surface the stable edges instead of
making you read 54 separate tables.

Data sources (only ones with local M1 -- no download here):
  * NQ                     -> portfolioBacktest/cache/nq_m1.parquet      (index)
  * Gold                   -> VolRangeForecaster/data/m1/gold_m1.parquet (commodity)
  * 25 FX majors/crosses    -> VolRangeForecaster/data/m1/{pair}_m1.parquet (fx)

Writes one {instrument}_{calc}_base_rate.json per run (same as base_rate.py),
plus a single leaderboard.json/csv. A row survives onto the leaderboard only if
ALL of: (1) gross fade-vs-follow edge SIGN agrees IS->OOS, (2) n_touches clears
a minimum both halves, (3) the COST-ADJUSTED mean-R (cost_model.py, real
per-pair round-trip cost) is POSITIVE on both IS and OOS for that side -- a raw
win-rate edge that dies once a realistic spread is subtracted does not count.
Ranked by OOS net-R (the actual after-cost economic size), not raw win-rate.

Usage: python3 run_all.py [theta] [horizon_min] [min_touches]
"""
import sys
import os
import json
import csv

from base_rate import run, LEVELS

ROOT = os.path.join(os.path.dirname(__file__), '..')
FX_DIR = os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1')
FX_PAIRS = [
    'audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadjpy', 'chfjpy',
    'euraud', 'eurcad', 'eurchf', 'eurgbp', 'eurjpy', 'eurnzd', 'eurusd',
    'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdjpy',
    'nzdusd', 'usdcad', 'usdchf', 'usdjpy',
]

INSTRUMENTS = [('nq', os.path.join(ROOT, 'portfolioBacktest', 'cache', 'nq_m1.parquet'), 'index'),
               ('gold', os.path.join(FX_DIR, 'gold_m1.parquet'), 'commodity')]
INSTRUMENTS += [(p, os.path.join(FX_DIR, f'{p}_m1.parquet'), 'fx') for p in FX_PAIRS]

CALCS = ['cog', 'original']


def leaderboard_rows(name, calc, out, min_touches):
    rows = []
    for level in LEVELS:
        is_row, oos_row = out['in_sample'].get(level), out['out_of_sample'].get(level)
        if not is_row or not oos_row:
            continue
        if is_row['n_touches'] < min_touches or oos_row['n_touches'] < min_touches:
            continue
        is_edge = is_row['follow_win_rate'] - is_row['fade_win_rate']
        oos_edge = oos_row['follow_win_rate'] - oos_row['fade_win_rate']
        if is_edge == 0 or oos_edge == 0 or (is_edge > 0) != (oos_edge > 0):
            continue   # gross edge sign must agree IS -> OOS
        side = 'follow' if oos_edge > 0 else 'fade'

        is_c, oos_c = out['costed_in_sample'].get(level), out['costed_out_of_sample'].get(level)
        if not is_c or not oos_c:
            continue
        is_net_r = is_c[f'{side}_mean_net_r']
        oos_net_r = oos_c[f'{side}_mean_net_r']
        if is_net_r <= 0 or oos_net_r <= 0:
            continue   # dies after a realistic round-trip cost -- not a real edge

        rows.append(dict(
            instrument=name, calc=calc, level=level, side=side,
            is_wr=is_row['follow_win_rate'] if side == 'follow' else is_row['fade_win_rate'],
            oos_wr=oos_row['follow_win_rate'] if side == 'follow' else oos_row['fade_win_rate'],
            is_net_r=round(is_net_r, 3), oos_net_r=round(oos_net_r, 3),
            is_n=is_row['n_touches'], oos_n=oos_row['n_touches'],
        ))
    return rows


def main():
    theta = float(sys.argv[1]) if len(sys.argv) > 1 else 0.25
    horizon = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    min_touches = int(sys.argv[3]) if len(sys.argv) > 3 else 50

    all_rows = []
    for name, path, asset_class in INSTRUMENTS:
        if not os.path.exists(path):
            print(f'skip {name}: no M1 at {path}')
            continue
        for calc in CALCS:
            print(f'scanning {name} [{calc}] ...')
            out = run(path, asset_class, calc, theta, horizon, verbose=False, write=True, instrument=name)
            all_rows.extend(leaderboard_rows(name, calc, out, min_touches))

    all_rows.sort(key=lambda r: r['oos_net_r'], reverse=True)

    with open('leaderboard.json', 'w') as f:
        json.dump(all_rows, f, indent=2)
    with open('leaderboard.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()) if all_rows else [])
        w.writeheader()
        w.writerows(all_rows)

    print(f'\n{len(all_rows)} edges survive (gross sign IS->OOS agrees, cost-adjusted net-R > 0 '
          f'both halves, n>={min_touches}) across {len(INSTRUMENTS)} instruments x {len(CALCS)} calcs\n')
    print(f"{'instrument':<10}{'calc':<10}{'level':<14}{'side':<8}{'IS WR':>7}{'OOS WR':>8}"
          f"{'IS netR':>9}{'OOS netR':>10}{'OOS n':>7}")
    for r in all_rows[:40]:
        print(f"{r['instrument']:<10}{r['calc']:<10}{r['level']:<14}{r['side']:<8}"
              f"{r['is_wr']:>7}{r['oos_wr']:>8}{r['is_net_r']:>9}{r['oos_net_r']:>10}{r['oos_n']:>7}")
    print('\nwrote leaderboard.json / leaderboard.csv')


if __name__ == '__main__':
    main()
