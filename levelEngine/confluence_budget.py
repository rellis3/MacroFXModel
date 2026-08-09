"""
confluence_budget — Phase 2, filter #1: "range budget already spent before this
touch" (touch_engine's new `budget_used` field: intraday range-so-far / the
day's own expected full range, normalized per-day so it's comparable across
instruments and vol regimes by construction).

Directly answers the question that motivated this: the unconditioned base rate
killed most FX crosses after cost because the AVERAGE touch on those pairs
isn't a real edge -- but the average blends "fresh, early-day touch" with
"exhausted, late-day touch," and those two populations can behave oppositely
(exhaustion literature: fresh moves continue, exhausted ones revert). A pair
can be a coin-flip on average and still have a real, costed edge in ONE bucket.

Buckets (fixed thresholds, not per-instrument quantiles, precisely because
budget_used is already day-normalized -- a fixed cut is comparable across
every instrument without a second normalization step):
  low  < 0.4   -- most of the day's typical range still "unspent"
  mid  0.4-0.8
  high >= 0.8  -- day's typical range already mostly used before this touch

One filter at a time (per the project's own rule: test univariately before
combining) -- this is filter #1, not a combined confluence score yet.

Usage: python3 confluence_budget.py [theta] [horizon_min] [min_touches]
"""
import sys
import os
import json
import csv

from run_all import INSTRUMENTS, CALCS
from base_rate import CALCS as CALC_MODULES, summarize, LEVELS
from touch_engine import scan_all
from cost_model import cost_adjust, summarize_costed

BUCKETS = [
    ('low',  lambda b: b < 0.4),
    ('mid',  lambda b: 0.4 <= b < 0.8),
    ('high', lambda b: b >= 0.8),
]


def bucket_rows(name, calc, asset_class, records, split, min_touches):
    rows = []
    for bucket_name, pred in BUCKETS:
        sub = [r for r in records if r['budget_used'] is not None and pred(r['budget_used'])]
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
    theta = float(sys.argv[1]) if len(sys.argv) > 1 else 0.25
    horizon = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    min_touches = int(sys.argv[3]) if len(sys.argv) > 3 else 30

    unconditioned = set()
    if os.path.exists('leaderboard.json'):
        with open('leaderboard.json') as f:
            for r in json.load(f):
                unconditioned.add((r['instrument'], r['calc'], r['level']))

    all_rows = []
    for name, path, asset_class in INSTRUMENTS:
        if not os.path.exists(path):
            continue
        for calc in CALCS:
            print(f'scanning {name} [{calc}] (budget-bucketed) ...')
            frame = CALC_MODULES[calc].build_level_frame(path, asset_class)
            records = scan_all(frame, theta=theta, horizon_min=horizon)
            split = frame['daily']['day_idx'].size // 2
            rows = bucket_rows(name, calc, asset_class, records, split, min_touches)
            for r in rows:
                r['new_vs_unconditioned'] = (r['instrument'], r['calc'], r['level']) not in unconditioned
            all_rows.extend(rows)

    all_rows.sort(key=lambda r: r['oos_net_r'], reverse=True)
    with open('leaderboard_budget.json', 'w') as f:
        json.dump(all_rows, f, indent=2)
    with open('leaderboard_budget.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()) if all_rows else [])
        w.writeheader()
        w.writerows(all_rows)

    new_rows = [r for r in all_rows if r['new_vs_unconditioned']]
    print(f'\n{len(all_rows)} bucket-conditioned survivors, {len(new_rows)} of them NOT in the '
          f'unconditioned leaderboard (pairs/levels the budget filter revived)\n')
    print(f"{'instrument':<10}{'calc':<10}{'level':<14}{'bucket':<6}{'side':<8}{'new?':<6}"
          f"{'IS WR':>7}{'OOS WR':>8}{'OOS netR':>10}{'OOS n':>7}")
    for r in all_rows[:50]:
        print(f"{r['instrument']:<10}{r['calc']:<10}{r['level']:<14}{r['bucket']:<6}{r['side']:<8}"
              f"{'Y' if r['new_vs_unconditioned'] else '':<6}"
              f"{r['is_wr']:>7}{r['oos_wr']:>8}{r['oos_net_r']:>10}{r['oos_n']:>7}")
    print('\nwrote leaderboard_budget.json / leaderboard_budget.csv')


if __name__ == '__main__':
    main()
