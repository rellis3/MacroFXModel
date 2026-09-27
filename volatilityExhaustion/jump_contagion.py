"""
jump_contagion.py — Phase 18: does cross-instrument jump BREADTH predict a
correlation-regime shift, the one institutional use of jump/diffusion
decomposition this study hasn't tested yet.

WHY THIS EXISTS. Phases 12/13/14 closed the forecast question (three
independent nulls) and Phase 17 closed jump-conditioned tail risk (a fourth).
Both were SINGLE-INSTRUMENT questions: does yesterday's own jump share help
forecast today's own variance/tail, for that same pair. This is a genuinely
different, CROSS-SECTIONAL question: when jumps are happening BROADLY across
the universe (not just in one pair), do instruments start moving together
more than usual? This matters concretely for Vote Atlas's own portfolio
construction (js/levelAtlasVoteReview.js's `applyConcurrencyCap`,
`inverseVolWeights`, `buildPortfolioDailySeries`) — all three implicitly
assume a stable-enough correlation structure across pairs for diversification
to do real work. If correlations spike specifically on broad-jump days, that
diversification could be an illusion exactly when the book needs it most
(bunched losses on the tail days that matter), independent of anything a
single-instrument sigma or tail-risk model would ever show.

DATA — reused, not rebuilt. `jump_diffusion_daily.py`'s own output
(jump_diffusion_daily.csv: jf_5m per (pair,date), the SAME gap-audited
archive every phase in this study reads) for the jump-breadth reading, and
`jump_regime_book.py`'s `daily_bars.csv` (close-to-close returns) for the
correlation measurement. Universe: the 26 FX+gold pairs Vote Atlas itself
trades (DE30/UK100 excluded — the gap-audit classifier still doesn't
recognise Xetra/LSE session hours, per Phase 15b; NQ/SPX500/US30/US2000
excluded too, since Vote Atlas's OWN portfolio universe is FX+gold only,
confirmed in the codebase — cross-asset pairs would answer a question this
platform's book doesn't actually face).

MINIMAL-DOF FIRST. A single pre-registered threshold (each pair's own
full-sample MEDIAN jf_5m — no percentile grid, no per-pair tuning) and a
single median split on the resulting cross-sectional breadth reading (HIGH
vs LOW breadth days, not terciles) — nothing here is chosen after looking at
the correlation result.

METHOD.
  1. For each pair, its own jf_5m median (over its own full history) is the
     "elevated" threshold for THAT pair — normalises across instruments with
     structurally different typical jump shares (Phase 1 found gold's jumps
     run ~3x FX's in absolute size), so no single high-jf pair can dominate
     the breadth reading.
  2. Each day's BREADTH = fraction of that day's covered pairs whose jf_5m
     is at/above their own median. A day needs >= MIN_PAIRS_PER_DAY covered
     pairs to be scored at all (thin-coverage days are dropped, not zero-
     filled — a day where only 3 pairs have data is not comparable to one
     with 26).
  3. Days are split at the median BREADTH value into HIGH and LOW groups.
  4. For each group, build the (day x pair) return matrix (missing cells NaN
     -- pairwise-complete correlation, not listwise-complete, since forcing
     every pair to have data on every single day would gut the sample) and
     compute the pairwise correlation matrix. Summarised two ways: mean
     off-diagonal correlation (the standard average-correlation systemic-
     stress proxy) and the PC1 variance share (a second, standard proxy --
     reported for a robustness cross-check, not the selection criterion).

PRE-REGISTERED PASS CONDITION (fixed before running):
    Mean off-diagonal correlation on HIGH-breadth days must be >= 0.05
    (absolute) higher than on LOW-breadth days, AND the same sign with a
    comparable order of magnitude (>= half the pooled effect) when the
    IS-half (first 60% of the date range chronologically) and OOS-half
    (last 40%) are scored SEPARATELY -- not just pooled once. A pooled-only
    effect that vanishes or reverses in one half is exactly the kind of
    single-period artifact this study has been burned by before (a single
    crisis window driving an otherwise-absent effect).
FAIL = jump breadth does not predict a correlation-regime shift large enough
to matter, or the effect is not consistent across the two chronological
halves -> Vote Atlas's diversification assumptions are not threatened by
this specific mechanism, extending this study's null run to a fifth
independent construction.

Usage:  python jump_contagion.py
"""
import os
import sys
import csv
import collections
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RV_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')
BARS_CSV = os.path.join(HERE, 'daily_bars.csv')

# Vote Atlas's OWN portfolio universe (js/levelAtlasRoutes.js's ALL_26_PAIRS
# mirror, scripts/build_level_atlas_vote_trades.mjs) -- the question this
# platform's book actually faces, not a broader cross-asset one.
UNIVERSE = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
            'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy',
            'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad',
            'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold']

MIN_PAIRS_PER_DAY = 15         # a breadth reading needs a real cross-section
MIN_PAIRS_FOR_CORR = 10        # a correlation-group day needs enough coverage too
PASS_ABS = 0.05                # pre-registered: HIGH - LOW mean corr >= 0.05


def load_jf():
    """(pair, date) -> jf_5m, restricted to UNIVERSE."""
    jf = {}
    for r in csv.DictReader(open(RV_CSV)):
        if r['pair'] not in UNIVERSE:
            continue
        try:
            jf[(r['pair'], r['date'])] = float(r['jf_5m'])
        except (ValueError, KeyError):
            continue
    return jf


def load_closes():
    """pair -> {date: close}, restricted to UNIVERSE."""
    out = collections.defaultdict(dict)
    for r in csv.DictReader(open(BARS_CSV)):
        if r['pair'] not in UNIVERSE:
            continue
        try:
            out[r['pair']][r['date']] = float(r['close'])
        except (ValueError, KeyError):
            continue
    return out


def daily_returns(closes):
    """pair -> {date: log return}, using each pair's OWN sorted date sequence."""
    out = {}
    for pair, by_date in closes.items():
        dates = sorted(by_date)
        r = {}
        for i in range(1, len(dates)):
            p0, p1 = by_date[dates[i - 1]], by_date[dates[i]]
            if p0 > 0 and p1 > 0:
                r[dates[i]] = float(np.log(p1 / p0))
        out[pair] = r
    return out


def per_pair_median(jf):
    by_pair = collections.defaultdict(list)
    for (pair, date), v in jf.items():
        by_pair[pair].append(v)
    return {p: float(np.median(v)) for p, v in by_pair.items()}


def breadth_by_date(jf, medians):
    """date -> (breadth fraction, n pairs covered), gated on MIN_PAIRS_PER_DAY."""
    by_date = collections.defaultdict(list)
    for (pair, date), v in jf.items():
        m = medians.get(pair)
        if m is None:
            continue
        by_date[date].append(1.0 if v >= m else 0.0)
    out = {}
    for date, flags in by_date.items():
        if len(flags) >= MIN_PAIRS_PER_DAY:
            out[date] = (float(np.mean(flags)), len(flags))
    return out


def corr_summary(returns, dates, universe):
    """Pairwise-complete correlation matrix + mean off-diagonal corr + PC1 share,
    over the given `dates` subset only. Pairs with too little data are dropped."""
    cols = []
    names = []
    for pair in universe:
        r = returns.get(pair, {})
        vec = np.array([r.get(d, np.nan) for d in dates])
        if np.isfinite(vec).sum() >= MIN_PAIRS_FOR_CORR:
            cols.append(vec)
            names.append(pair)
    if len(cols) < 3:
        return None
    M = np.vstack(cols)  # pairs x days
    n = len(names)
    corr = np.full((n, n), np.nan)
    for i in range(n):
        for j in range(n):
            if i == j:
                corr[i, j] = 1.0
                continue
            a, b = M[i], M[j]
            ok = np.isfinite(a) & np.isfinite(b)
            if ok.sum() >= MIN_PAIRS_FOR_CORR:
                c = np.corrcoef(a[ok], b[ok])[0, 1]
                corr[i, j] = c
    offdiag = corr[~np.eye(n, dtype=bool)]
    offdiag = offdiag[np.isfinite(offdiag)]
    mean_corr = float(np.mean(offdiag)) if offdiag.size else float('nan')

    # PC1 share: fill remaining NaNs with 0 (mean-return placeholder) only for
    # this SECONDARY/descriptive eigenvalue check -- never used for the pass/fail
    # decision, which is mean_corr alone.
    filled = np.nan_to_num(M, nan=0.0)
    cov = np.cov(filled)
    try:
        eigvals = np.linalg.eigvalsh(cov)
        pc1_share = float(eigvals[-1] / eigvals.sum()) if eigvals.sum() > 0 else float('nan')
    except np.linalg.LinAlgError:
        pc1_share = float('nan')

    return {'n_pairs': n, 'n_days': len(dates), 'mean_corr': mean_corr, 'pc1_share': pc1_share}


def run(jf, returns, medians, label, dates_filter=None):
    breadth = breadth_by_date(jf, medians)
    dates = sorted(breadth)
    if dates_filter is not None:
        dates = [d for d in dates if dates_filter(d)]
    if len(dates) < 60:
        print(f'  [{label}] too few scoreable days ({len(dates)}) -- skipped')
        return None
    vals = [breadth[d][0] for d in dates]
    med = float(np.median(vals))
    high = [d for d in dates if breadth[d][0] > med]
    low = [d for d in dates if breadth[d][0] <= med]

    high_summary = corr_summary(returns, high, UNIVERSE)
    low_summary = corr_summary(returns, low, UNIVERSE)
    if not high_summary or not low_summary:
        print(f'  [{label}] insufficient pairs for a correlation matrix -- skipped')
        return None

    gap = high_summary['mean_corr'] - low_summary['mean_corr']
    print(f'  [{label}] n_days={len(dates)} (high={len(high)}, low={len(low)}) median_breadth={med:.3f}')
    print(f'  [{label}] HIGH-breadth mean corr={high_summary["mean_corr"]:.4f} (pc1={high_summary["pc1_share"]:.3f}, n_pairs={high_summary["n_pairs"]})')
    print(f'  [{label}] LOW-breadth  mean corr={low_summary["mean_corr"]:.4f} (pc1={low_summary["pc1_share"]:.3f}, n_pairs={low_summary["n_pairs"]})')
    print(f'  [{label}] gap (HIGH - LOW) = {gap:+.4f}')
    return gap


def main():
    print('=' * 100)
    print('PHASE 18 -- does cross-instrument jump BREADTH predict a correlation-regime shift?')
    print('=' * 100)
    jf = load_jf()
    closes = load_closes()
    returns = daily_returns(closes)
    medians = per_pair_median(jf)
    print(f'  {len(medians)} instruments with a jump-share median, {sum(len(v) for v in returns.values()):,} pair-days of returns')
    print(f'  PRE-REGISTERED: HIGH-breadth mean corr >= LOW-breadth + {PASS_ABS} absolute, '
          f'consistent (same sign, >= half magnitude) across IS/OOS halves\n')

    print('-- pooled (whole history) --')
    pooled_gap = run(jf, returns, medians, 'pooled')

    all_dates = sorted(set(d for _, d in jf.keys()))
    cut = all_dates[int(len(all_dates) * 0.6)]
    print(f'\n-- IS half (< {cut}) --')
    is_gap = run(jf, returns, medians, 'IS', dates_filter=lambda d: d < cut)
    print(f'\n-- OOS half (>= {cut}) --')
    oos_gap = run(jf, returns, medians, 'OOS', dates_filter=lambda d: d >= cut)

    print('\n' + '=' * 100)
    print('VERDICT')
    if pooled_gap is None or is_gap is None or oos_gap is None:
        print('  Could not score all three windows -- inconclusive, not null.')
        return 2
    clears_pooled = pooled_gap >= PASS_ABS
    same_sign = (is_gap > 0) == (oos_gap > 0) == (pooled_gap > 0)
    half_magnitude = same_sign and is_gap >= pooled_gap * 0.5 and oos_gap >= pooled_gap * 0.5
    print(f'  pooled gap: {pooled_gap:+.4f}  (bar: >= {PASS_ABS:+.4f})')
    print(f'  IS gap:     {is_gap:+.4f}')
    print(f'  OOS gap:    {oos_gap:+.4f}')
    print(f'  same sign across pooled/IS/OOS: {same_sign}')
    ok = clears_pooled and half_magnitude
    if ok:
        print('\n  PASS -- jump breadth predicts a real, IS/OOS-consistent correlation-regime shift.')
        print('  Worth a closer look at Vote Atlas\'s diversification assumptions on broad-jump days.')
    else:
        print('\n  NULL -- jump breadth does not predict a correlation shift large/consistent enough to')
        print('  matter. Extends this study\'s null run to a fifth independent construction. Vote')
        print('  Atlas\'s diversification assumptions are not threatened by this specific mechanism.')
    print('=' * 100)
    return 0 if ok else 2


if __name__ == '__main__':
    sys.exit(main())
