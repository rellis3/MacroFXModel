"""
robustness_check — the harder bar promised after the budget-bucket scan: don't
add a second confluence filter on top of results that haven't earned it.
Re-tests each of the 31 leaderboard_budget.json survivors two ways:

  1. FOUR-FOLD STABILITY (not just IS/OOS halves): split each instrument's
     history into four chronological quarters and require the candidate's side
     to be net-profitable (after cost) in EVERY quarter, with a minimum touch
     count per quarter. A real, stable effect should not depend on which half
     of history you happened to call "OOS" -- it should show up in all four.
  2. BONFERRONI-CORRECTED SIGNIFICANCE: binomial test of the full-period
     decided-trade win count against the COST-ADJUSTED breakeven rate
     (0.5 + avg_cost_r/2, not a naive 50% -- a trade has to clear the spread,
     not just be a coin flip), with alpha corrected for the 1,458 cells the
     original budget scan searched over (0.05 / 1458 ~= 3.4e-5). This is a
     genuinely strict bar on purpose -- the point of this script is to find
     out how many of the 31 survive contact with real statistics, not to
     rubber-stamp them.

Usage: python3 robustness_check.py [theta] [horizon_min]
"""
import sys
import os
import json

from scipy.stats import binomtest

from base_rate import CALCS as CALC_MODULES, LEVELS
from touch_engine import scan_all
from cost_model import cost_adjust, summarize_costed
from confluence_budget import BUCKETS
from run_all import INSTRUMENTS

N_FOLDS = 4
MIN_PER_FOLD = 15
BONFERRONI_ALPHA = 0.05 / 1458   # matches the (27 instr x 2 calc x 9 level x 3 bucket) search space


def fold_bounds(n_days, n_folds=N_FOLDS):
    step = n_days / n_folds
    return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(n_folds)]


def check_candidate(records, level, bucket_pred, side, folds):
    bucket_recs = [r for r in records if r['level'] == level
                   and r['budget_used'] is not None and bucket_pred(r['budget_used'])]

    fold_results = []
    for lo, hi in folds:
        fold_recs = [r for r in bucket_recs if lo <= r['day_i'] < hi]
        costed = cost_adjust(fold_recs, INSTRUMENT_CTX['name'], INSTRUMENT_CTX['asset_class'])
        summ = summarize_costed(costed, [level]).get(level)
        if not summ:
            fold_results.append(dict(n=0, net_r=None, passed=False))
            continue
        net_r = summ[f'{side}_mean_net_r']
        n = summ['n']
        fold_results.append(dict(n=n, net_r=net_r, passed=bool(n >= MIN_PER_FOLD and net_r > 0)))

    folds_passed = sum(1 for f in fold_results if f['passed'])

    all_costed = cost_adjust(bucket_recs, INSTRUMENT_CTX['name'], INSTRUMENT_CTX['asset_class'])
    all_summ = summarize_costed(all_costed, [level]).get(level, {})
    n_decided = all_summ.get('n', 0)
    win_rate = (all_summ.get(f'{side}_net_win_rate', 0) or 0) / 100.0
    win_count = round(win_rate * n_decided)
    avg_cost_r = all_summ.get('avg_cost_r', 0) or 0
    breakeven = 0.5 + avg_cost_r / 2

    p_value = None
    if n_decided > 0:
        p_value = float(binomtest(win_count, n_decided, breakeven, alternative='greater').pvalue)

    return dict(
        folds_passed=folds_passed, n_folds=N_FOLDS, fold_detail=fold_results,
        n_decided=n_decided, win_count=win_count, breakeven=round(breakeven, 4),
        p_value=p_value,
        significant=bool(p_value is not None and p_value < BONFERRONI_ALPHA),
        survives_all_folds=bool(folds_passed == N_FOLDS),
    )


INSTRUMENT_CTX = {}


def main():
    theta = float(sys.argv[1]) if len(sys.argv) > 1 else 0.25
    horizon = int(sys.argv[2]) if len(sys.argv) > 2 else 60

    with open('leaderboard_budget.json') as f:
        candidates = json.load(f)

    by_instrument_calc = {}
    for c in candidates:
        by_instrument_calc.setdefault((c['instrument'], c['calc']), []).append(c)

    path_lookup = {(name, ac): path for name, path, ac in INSTRUMENTS}
    asset_class_lookup = {name: ac for name, _, ac in INSTRUMENTS}

    results = []
    for (name, calc), rows in by_instrument_calc.items():
        asset_class = asset_class_lookup[name]
        path = path_lookup[(name, asset_class)]
        print(f'checking {name} [{calc}] ({len(rows)} candidates) ...')
        INSTRUMENT_CTX['name'] = name
        INSTRUMENT_CTX['asset_class'] = asset_class
        frame = CALC_MODULES[calc].build_level_frame(path, asset_class)
        records = scan_all(frame, theta=theta, horizon_min=horizon)
        n_days = frame['daily']['day_idx'].size
        folds = fold_bounds(n_days)

        bucket_pred = {name_: pred for name_, pred in BUCKETS}
        for c in rows:
            check = check_candidate(records, c['level'], bucket_pred[c['bucket']], c['side'], folds)
            results.append({**c, **check})

    results.sort(key=lambda r: (r['significant'], r['survives_all_folds'], -1 if r['p_value'] is None else -r['p_value']), reverse=True)
    with open('robustness_check.json', 'w') as f:
        json.dump(results, f, indent=2)

    hard_survivors = [r for r in results if r['significant'] and r['survives_all_folds']]
    print(f'\n{len(results)} candidates re-tested. {len(hard_survivors)} pass BOTH the 4-fold '
          f'stability check AND Bonferroni-corrected significance (alpha={BONFERRONI_ALPHA:.2e}).\n')
    print(f"{'instrument':<10}{'calc':<10}{'level':<14}{'bucket':<6}{'side':<8}{'folds':>7}{'p-value':>12}{'sig?':>6}")
    for r in results:
        print(f"{r['instrument']:<10}{r['calc']:<10}{r['level']:<14}{r['bucket']:<6}{r['side']:<8}"
              f"{r['folds_passed']}/{r['n_folds']:<5}"
              f"{(r['p_value'] if r['p_value'] is not None else float('nan')):>12.2e}"
              f"{'Y' if r['significant'] else '':>6}")
    print('\nwrote robustness_check.json')


if __name__ == '__main__':
    main()
