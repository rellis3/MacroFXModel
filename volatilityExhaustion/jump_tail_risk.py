"""
jump_tail_risk.py — Phase 17: does jump share move the TAIL, even though it doesn't move
the point forecast?

WHY THIS EXISTS. Phases 12/13/14 closed the forecast question three independent ways:
scaling sigma by diffusive share (12), splitting RV into HAR-CJ regressors (14), and
conditioning the exhaustion race on jump share (§13.6) all failed to improve a POINT
forecast of next-day variance. But Phase 13 also found a real, replicated relationship at
the level of the MEAN: a jumpier day is followed by a quieter one (c = -0.99..-1.47,
6/6 cells) — it just wasn't strong or clean enough to win a QLIKE horse race against the
incumbent. A point forecast and a TAIL are different targets. It is possible for the
average next-day variance to shrink after a jump day while the tail stays fat or gets
fatter (e.g. jump exhaustion compresses the typical range but a residual jump-cluster risk
still occasionally reignites) — QLIKE, which scores the whole distribution's center, would
never surface that on its own. This is a different institutional use of jump/diffusion
decomposition than "forecast tomorrow's variance": tail-risk / stress sizing cares about
the shape of the extreme quantile, not the point estimate. Follows the owner's steer
(2026-09-14 conversation) to look at jump-conditioned tail risk specifically, reusing the
existing EVT/VaR/CVaR bricks (js/evtTail.js, js/metricsCore.js histVaR/histCVaR) rather
than building a parallel estimator — this script tests, in Python against the archive,
whether conditioning on jump share is worth wiring into that machinery at all before any
JS/live work is attempted.

MINIMAL-DOF FIRST (per CLAUDE.md's backtest discipline): a median split on yesterday's
jump share, not a continuous regression or a tuned threshold. Nothing to overfit — the
split point is the IS sample's own median, frozen before the OOS window is touched.

DATA. Reuses har_cj_forecast.py's own load() (identical (pair,date) set: gap-audited,
quality-gated, the same archive every other phase in this study reads) — the daily
Garman-Klass realised variance and the jf_5m jump share are already computed and joined
there; nothing here is a second pipeline. Daily close-to-close log returns come from the
same daily_bars.csv rows load() already reads, joined on (pair, date).

METHOD. For each pair: freeze the IS-period median of jf_5m (day t) as the regime cutoff.
On OOS days only, split next-day returns r_{t+1} into two groups by whether day t's jf_5m
was above or below that frozen median ("post-jump" vs "post-calm") — no threshold is
re-fit on OOS data. For each group compute empirical VaR95/CVaR95 on r_{t+1} (same
definition as js/metricsCore.js's histVaR/histCVaR: type-7 quantile VaR, CVaR = mean of
returns at/beyond it), and compare against the pooled unconditional OOS CVaR95.

PRE-REGISTERED PASS CONDITION (fixed before running):
    The relative gap |CVaR95(post-jump) - CVaR95(post-calm)| / |CVaR95(pooled)| must be
    >= 15% OOS, on a MAJORITY of instruments per asset class, with >= 100 OOS days in
    EACH group (mirrors Phase 15's MIN_OOS_PER_PAIR convention, halved for the group split).
    Reported per instrument, never pooled blind (this study has been burned by pooled wins
    before — Tier-8's NQ echo, the WaveTrend gates).
    Direction is reported, not assumed: post-jump could show WORSE tail (jump clusters),
    BETTER tail (Phase 13's mean-reversion extends to the tail too), or no consistent sign.
FAIL = the gap does not clear 15% on a majority of instruments in every class, OR the sign
flips inconsistently across instruments -> jump share carries no usable tail-risk signal
either, extending Phases 12/13/14's null from the point forecast to the tail, and nothing
gets wired into evtTail.js/bookStress.js.

Usage:  python3 jump_tail_risk.py
"""
import os
import sys
import collections
import numpy as np

from har_cj_forecast import load, OOS_FRAC, CLASSES

SUMMARY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jump_tail_risk_summary.json')
PASS_PCT = 15.0
MIN_OOS_PER_GROUP = 100


def hist_var(returns, p=0.95):
    """Type-7 quantile VaR — signed, matches js/metricsCore.js histVaR exactly."""
    return float(np.percentile(returns, (1.0 - p) * 100.0, method='linear'))


def hist_cvar(returns, p=0.95):
    """Mean of returns at/beyond the VaR threshold — matches js/metricsCore.js histCVaR."""
    v = hist_var(returns, p)
    tail = returns[returns <= v]
    return float(np.mean(tail)) if tail.size else v


def run_pair(pair, rows, closes):
    """rows: har_cj_forecast.load() rows for this pair, already gap-audited/quality-gated.
    closes: {date: close} for the same pair, straight from daily_bars.csv (the one extra
    field load() doesn't carry), joined on the SAME (pair,date) keys load() already
    gap-audited — no new filtering logic, just an extra column pulled in.
    Returns None if too little data, else a result dict."""
    dates = [r[0] for r in rows]
    jf = np.array([r[3] / r[2] if r[2] > 0 else np.nan for r in rows])  # j_bp / rv5 = jf_5m
    px = np.array([closes.get(d, np.nan) for d in dates])
    ret = np.full(len(px), np.nan)
    ret[1:] = np.log(px[1:] / px[:-1])
    # r_{t+1} aligned to jf_t: predictor row i is jf[i], outcome is ret[i+1]
    n = len(rows) - 1
    if n < 400:
        return None
    jf_t = jf[:n]
    ret_t1 = ret[1:n + 1]
    valid = np.isfinite(jf_t) & np.isfinite(ret_t1)
    idx = np.flatnonzero(valid)
    if idx.size < 400:
        return None

    cut = int(idx.size * (1 - OOS_FRAC))
    is_idx, oos_idx = idx[:cut], idx[cut:]
    if is_idx.size < 100 or oos_idx.size < 200:
        return None

    median_is = float(np.median(jf_t[is_idx]))          # frozen on IS only

    oos_jf = jf_t[oos_idx]
    oos_ret = ret_t1[oos_idx]
    post_jump = oos_ret[oos_jf >= median_is]
    post_calm = oos_ret[oos_jf < median_is]
    if post_jump.size < MIN_OOS_PER_GROUP or post_calm.size < MIN_OOS_PER_GROUP:
        return None

    cvar_pooled = hist_cvar(oos_ret, 0.95)
    cvar_jump = hist_cvar(post_jump, 0.95)
    cvar_calm = hist_cvar(post_calm, 0.95)
    var_jump = hist_var(post_jump, 0.95)
    var_calm = hist_var(post_calm, 0.95)

    gap_pct = abs(cvar_jump - cvar_calm) / abs(cvar_pooled) * 100.0 if cvar_pooled else float('nan')
    clears = gap_pct >= PASS_PCT
    # sign: negative = post-jump tail is WORSE (more negative CVaR) than post-calm
    worse_after_jump = cvar_jump < cvar_calm

    return {
        'pair': pair, 'n_oos': int(oos_idx.size),
        'n_post_jump': int(post_jump.size), 'n_post_calm': int(post_calm.size),
        'median_is_jf': median_is,
        'var95_post_jump': var_jump, 'var95_post_calm': var_calm,
        'cvar95_post_jump': cvar_jump, 'cvar95_post_calm': cvar_calm,
        'cvar95_pooled': cvar_pooled,
        'gap_pct': gap_pct, 'clears': clears, 'worse_after_jump': worse_after_jump,
    }


def main():
    series = load()
    print('=' * 100)
    print('PHASE 17 — does jump share move the TAIL of next-day returns, not just the mean?')
    print('=' * 100)
    print(f'  {len(series)} instruments (same gap-audited archive as Phases 14/15) · '
          f'median split on IS jf_5m, frozen before OOS · {int((1 - OOS_FRAC) * 100)}/'
          f'{int(OOS_FRAC * 100)} split')
    print(f'  PRE-REGISTERED: |CVaR95(post-jump) - CVaR95(post-calm)| / |CVaR95(pooled)| '
          f'>= {PASS_PCT}% OOS, on a MAJORITY of instruments per class, '
          f'>= {MIN_OOS_PER_GROUP} OOS days per group')

    import csv
    bars_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'daily_bars.csv')
    closes_by_pair = collections.defaultdict(dict)
    for r in csv.DictReader(open(bars_path)):
        try:
            closes_by_pair[r['pair']][r['date']] = float(r['close'])
        except (ValueError, KeyError):
            continue

    results = {}
    for pair, rows in sorted(series.items()):
        res = run_pair(pair, rows, closes_by_pair.get(pair, {}))
        if res is not None:
            res['asset_class'] = rows[0][6]
            results[pair] = res

    by_class = collections.defaultdict(list)
    for pair, res in results.items():
        by_class[res['asset_class']].append(res)

    print(f'\n  {"pair":9s} {"class":9s} {"n_oos":>6s} {"gap%":>8s} {"direction":>14s}')
    class_clears = collections.defaultdict(list)
    class_signs = collections.defaultdict(list)
    for ac in CLASSES:
        for res in sorted(by_class[ac], key=lambda r: r['pair']):
            direction = 'WORSE after jump' if res['worse_after_jump'] else 'better after jump'
            flag = '  <- clears' if res['clears'] else ''
            print(f'  {res["pair"]:9s} {ac:9s} {res["n_oos"]:6d} {res["gap_pct"]:7.2f}% '
                  f'{direction:>18s}{flag}')
            class_clears[ac].append(res['clears'])
            class_signs[ac].append(res['worse_after_jump'])

    print('\n' + '=' * 100)
    print('VERDICT — per asset class, majority-of-instruments')
    print(f'  {"class":9s} {"n":>4s} {"clear 15% bar":>15s} {"sign agreement":>16s}')
    overall_pass = True
    for ac in CLASSES:
        clears = class_clears.get(ac, [])
        signs = class_signs.get(ac, [])
        if not clears:
            continue
        maj_clear = sum(clears) > len(clears) / 2
        sign_maj = max(sum(signs), len(signs) - sum(signs))
        sign_dir = 'worse' if sum(signs) >= len(signs) / 2 else 'better'
        print(f'  {ac:9s} {len(clears):4d} {sum(clears):6d}/{len(clears):<3d} '
              f'{"(majority)" if maj_clear else "":>9s} {sign_maj:6d}/{len(signs):<3d} {sign_dir:>8s}')
        if not maj_clear:
            overall_pass = False

    print()
    if overall_pass:
        print('  TAIL EFFECT HOLDS on a majority of instruments in every class.')
        print('  Jump share carries usable tail-risk information beyond what the point')
        print('  forecast captures — worth wiring into evtTail.js/bookStress.js as a')
        print('  regime conditioner. Check the direction column before building anything:')
        print('  it decides whether jump regime should WIDEN or NARROW the tail estimate.')
    else:
        print('  TAIL EFFECT DOES NOT clear a majority in at least one class.')
        print('  Jump share carries no usable tail-risk signal either. This extends')
        print('  Phases 12/13/14\'s null from the point forecast to the tail — nothing')
        print('  gets wired into the tail-risk bricks.')
    print('=' * 100)

    import json
    with open(SUMMARY, 'w') as f:
        json.dump({
            'pass_pct': PASS_PCT, 'min_oos_per_group': MIN_OOS_PER_GROUP,
            'overall_pass': overall_pass,
            'results': {p: {k: v for k, v in r.items() if k != 'pair'} for p, r in results.items()},
        }, f, indent=1)
    print(f'\n  wrote {SUMMARY}')
    return 0 if overall_pass else 2


if __name__ == '__main__':
    sys.exit(main())
