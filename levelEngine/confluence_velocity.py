"""
confluence_velocity — Phase 2 filter #2: "approach velocity into the level"
(touch_engine's new `velocity` field: the 15-min return leading into the touch,
normalized by that day's sigma, signed so positive always means "moving fast
toward this level" regardless of up/down side).

Scoped to NQ ONLY, deliberately, on both calcs -- NOT a blind 27-instrument
sweep like the budget filter's first pass. Two reasons: (1) NQ is the one
signal in this project with real statistical footing (base rate -> survives
cost -> survives 4-fold/Bonferroni), so it's the one place a second filter has
real signal to sharpen rather than noise to dress up; (2) a narrower search
space (9 levels x 3 buckets x 2 calcs = 54 cells) means the Bonferroni bar
here (0.05/54) is honestly much less punishing than the 1,458-cell budget
sweep's -- appropriate for testing ONE filter on ONE proven instrument,
univariately, before ever combining it with budget_used.

Buckets, fixed thresholds from NQ's own touch distribution (5th/25th/50th/75th/
95th pct = 0.07/0.17/0.29/0.48/0.97 -- all positive since a touch requires net
approach; these roughly tercile-split it):
  low  < 0.15  -- grinding into the level
  mid  0.15-0.45
  high >= 0.45 -- spiking into the level

Applies the SAME rigor as robustness_check.py directly (4-fold stability +
Bonferroni-corrected binomial test vs cost-adjusted breakeven) rather than a
two-stage reveal -- we already learned the soft IS/OOS bar overstates what
survives.

Usage: python3 confluence_velocity.py [theta] [horizon_min]
"""
import sys
import json

from scipy.stats import binomtest

from base_rate import CALCS as CALC_MODULES, LEVELS, summarize
from touch_engine import scan_all
from cost_model import cost_adjust, summarize_costed

PATH = '../portfolioBacktest/cache/nq_m1.parquet'
ASSET_CLASS = 'index'
INSTRUMENT = 'nq'
CALCS = ['cog', 'original']

BUCKETS = [
    ('low',  lambda v: v < 0.15),
    ('mid',  lambda v: 0.15 <= v < 0.45),
    ('high', lambda v: v >= 0.45),
]
N_FOLDS = 4
MIN_PER_FOLD = 15
N_CELLS = len(LEVELS) * len(BUCKETS) * len(CALCS)
BONFERRONI_ALPHA = 0.05 / N_CELLS


def fold_bounds(n_days, n_folds=N_FOLDS):
    step = n_days / n_folds
    return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(n_folds)]


def evaluate(records, level, bucket_pred, split, folds):
    sub = [r for r in records if r['level'] == level and r['velocity'] is not None and bucket_pred(r['velocity'])]
    is_r = [r for r in sub if r['day_i'] < split]
    oos_r = [r for r in sub if r['day_i'] >= split]
    gross_is, gross_oos = summarize(is_r, verbose=False), summarize(oos_r, verbose=False)
    is_row, oos_row = gross_is.get(level), gross_oos.get(level)
    if not is_row or not oos_row or is_row['n_touches'] < MIN_PER_FOLD or oos_row['n_touches'] < MIN_PER_FOLD:
        return None
    is_edge = is_row['follow_win_rate'] - is_row['fade_win_rate']
    oos_edge = oos_row['follow_win_rate'] - oos_row['fade_win_rate']
    if is_edge == 0 or oos_edge == 0 or (is_edge > 0) != (oos_edge > 0):
        return None
    side = 'follow' if oos_edge > 0 else 'fade'

    costed_is = summarize_costed(cost_adjust(is_r, INSTRUMENT, ASSET_CLASS), [level]).get(level)
    costed_oos = summarize_costed(cost_adjust(oos_r, INSTRUMENT, ASSET_CLASS), [level]).get(level)
    if not costed_is or not costed_oos or costed_is[f'{side}_mean_net_r'] <= 0 or costed_oos[f'{side}_mean_net_r'] <= 0:
        return None

    fold_results = []
    for lo, hi in folds:
        fold_recs = [r for r in sub if lo <= r['day_i'] < hi]
        c = summarize_costed(cost_adjust(fold_recs, INSTRUMENT, ASSET_CLASS), [level]).get(level)
        if not c:
            fold_results.append(dict(n=0, net_r=None, passed=False))
            continue
        net_r = c[f'{side}_mean_net_r']
        fold_results.append(dict(n=c['n'], net_r=net_r, passed=bool(c['n'] >= MIN_PER_FOLD and net_r > 0)))
    folds_passed = sum(1 for f in fold_results if f['passed'])

    all_costed = summarize_costed(cost_adjust(sub, INSTRUMENT, ASSET_CLASS), [level]).get(level, {})
    n_decided = all_costed.get('n', 0)
    win_rate = (all_costed.get(f'{side}_net_win_rate', 0) or 0) / 100.0
    win_count = round(win_rate * n_decided)
    breakeven = 0.5 + (all_costed.get('avg_cost_r', 0) or 0) / 2
    p_value = float(binomtest(win_count, n_decided, breakeven, alternative='greater').pvalue) if n_decided > 0 else None

    return dict(
        side=side, is_wr=is_row['follow_win_rate'] if side == 'follow' else is_row['fade_win_rate'],
        oos_wr=oos_row['follow_win_rate'] if side == 'follow' else oos_row['fade_win_rate'],
        is_net_r=round(costed_is[f'{side}_mean_net_r'], 3), oos_net_r=round(costed_oos[f'{side}_mean_net_r'], 3),
        is_n=is_row['n_touches'], oos_n=oos_row['n_touches'],
        folds_passed=folds_passed, n_folds=N_FOLDS,
        p_value=p_value, breakeven=round(breakeven, 4),
        significant=bool(p_value is not None and p_value < BONFERRONI_ALPHA),
        survives_all_folds=bool(folds_passed == N_FOLDS),
    )


def main():
    theta = float(sys.argv[1]) if len(sys.argv) > 1 else 0.25
    horizon = int(sys.argv[2]) if len(sys.argv) > 2 else 60

    all_rows = []
    for calc in CALCS:
        print(f'scanning nq [{calc}] (velocity-bucketed) ...')
        frame = CALC_MODULES[calc].build_level_frame(PATH, ASSET_CLASS)
        records = scan_all(frame, theta=theta, horizon_min=horizon)
        n_days = frame['daily']['day_idx'].size
        split = n_days // 2
        folds = fold_bounds(n_days)
        for level in LEVELS:
            for bucket_name, pred in BUCKETS:
                res = evaluate(records, level, pred, split, folds)
                if res:
                    all_rows.append(dict(instrument='nq', calc=calc, level=level, bucket=bucket_name, **res))

    all_rows.sort(key=lambda r: (r['significant'], r['survives_all_folds'], -r['p_value'] if r['p_value'] else -1), reverse=True)
    with open('leaderboard_velocity.json', 'w') as f:
        json.dump(all_rows, f, indent=2)

    hard = [r for r in all_rows if r['significant'] and r['survives_all_folds']]
    print(f'\n{N_CELLS} cells tested (NQ only, both calcs). {len(all_rows)} pass the gross+cost gate, '
          f'{len(hard)} ALSO pass 4-fold + Bonferroni (alpha={BONFERRONI_ALPHA:.2e}).\n')
    print(f"{'calc':<10}{'level':<14}{'bucket':<6}{'side':<8}{'IS WR':>7}{'OOS WR':>8}{'OOS netR':>10}{'OOS n':>7}{'folds':>7}{'p-value':>11}{'sig?':>6}")
    for r in all_rows:
        print(f"{r['calc']:<10}{r['level']:<14}{r['bucket']:<6}{r['side']:<8}{r['is_wr']:>7}{r['oos_wr']:>8}"
              f"{r['oos_net_r']:>10}{r['oos_n']:>7}{r['folds_passed']}/{r['n_folds']:<5}"
              f"{(r['p_value'] if r['p_value'] is not None else float('nan')):>11.2e}{'Y' if r['significant'] else '':>6}")
    print('\nwrote leaderboard_velocity.json')


if __name__ == '__main__':
    main()
