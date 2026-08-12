"""analyse.py — turn the panel into conditional-probability tables you can
actually read.

THE OUTPUT
──────────
For a VMC state cell (WT zone, MF sign, stack agreement, whatever you group
by) and a forward horizon:

    n | p_up | base_p_up | delta | se | t | mean_ret_sig | IS delta | OOS delta

`delta = p_up - base_p_up` is the ONLY number worth reading. Three separate
reasons the raw `p_up` is not:

1. DRIFT. An index rises more often than it falls, so any cell on NQ shows
   p_up > 0.5 for free. The baseline absorbs that.

2. COMPOSITION. A cell that only fires at the London open is being compared
   against London-open behaviour, not against the 24h average. The baseline
   here is STRATIFIED on (hour x volatility bucket) and reweighted to the
   cell's own mix, so "this state only happens in fast markets" cannot
   masquerade as edge.

3. MECHANICAL CORRELATION (the multi-timeframe cells especially). Two
   timeframes of one oscillator on one price series agree a great deal by
   construction — the slow one is close to a smoothed version of the fast one.
   `mtf_agreement_report` therefore also carries the circular-rephasing
   baseline from the brick, which preserves each series' persistence and
   marginal distribution while destroying their true time correspondence.

SIGNIFICANCE, HONESTLY
──────────────────────
Row count is NOT sample size here. Adjacent panel rows are minutes apart and
overlapping forward windows share most of their path, so the effective N is
orders of magnitude below `n`. Standard errors use BATCH MEANS: split the
sample into contiguous time blocks, compute the statistic per block, and take
the spread across blocks. That prices in the autocorrelation a naive binomial
SE would ignore (and a naive SE would be roughly sqrt(bars_per_block) times too
small — the difference between "significant" and nothing).

Every table also carries an IS/OOS split by TIME. A cell counts as surviving
only if it holds the same sign in both halves — one number over the full sample
is what in-sample fitting looks like.

MULTIPLE TESTING
────────────────
`report()` prints how many cells were tested and how many would be expected to
clear the threshold by chance alone. Finding 4 "significant" cells out of 70 is
what noise does; the summary says so out loud rather than leaving it implied.

  python vumanchuLab/analyse.py --instruments eurusd,gold,nq
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Redirecting stdout to a file makes Python pick the locale codec (cp1252 on
# Windows), which dies on the sigma/arrow glyphs this module prints. Force
# UTF-8 so `> out.txt` behaves the same as the console.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from pylego.indicators.vumanchu import rephasing_baseline  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

# Contiguous time blocks for the batch-means standard error. ~40 blocks over a
# decade is a month or two each: long enough to swallow intraday
# autocorrelation, numerous enough for the spread to mean something.
N_BLOCKS = 40

# Fraction of the sample (by time) used as in-sample.
IS_FRACTION = 0.6

# Minimum rows before a cell is reported at all.
MIN_CELL_N = 200


# ── stratified baseline ──────────────────────────────────────────────────────

def _strata(panel: pd.DataFrame) -> pd.Series:
    """(hour x volatility bucket) — the confounders a cell can smuggle in."""
    vb = panel['vol_bucket'].fillna(-1).astype(int)
    return panel['hour'].astype(int) * 10 + vb


def stratified_baseline(outcome: pd.Series, strata: pd.Series,
                        cell_mask: pd.Series) -> float:
    """Unconditional outcome rate, reweighted to the cell's own strata mix.

    This is the number the cell must beat. Computed from the WHOLE sample
    (including the cell itself — excluding it would bias the comparison the
    other way on cells that are a large share of a stratum).
    """
    glob = outcome.groupby(strata).mean()
    w = strata[cell_mask].value_counts(normalize=True)
    common = w.index.intersection(glob.index)
    if len(common) == 0:
        return float(outcome.mean())
    w = w.loc[common]
    return float((glob.loc[common] * w).sum() / w.sum())


def batch_means_se(values: pd.Series, blocks: pd.Series, n_min: int = 5) -> float:
    """SE of the mean from contiguous time blocks — prices in autocorrelation."""
    per = values.groupby(blocks).mean().dropna()
    if len(per) < n_min:
        return float('nan')
    return float(per.std(ddof=1) / np.sqrt(len(per)))


# ── the conditional table ────────────────────────────────────────────────────

def conditional_table(panel: pd.DataFrame, by, horizon: int,
                      min_n: int = MIN_CELL_N, n_blocks: int = N_BLOCKS) -> pd.DataFrame:
    """P(price up over `horizon` bars | cell), against its matched baseline.

    `by` is a column name or list of them — that is the cell definition.
    """
    by = [by] if isinstance(by, str) else list(by)
    col = f'fwd_ret_{horizon}'
    df = panel.dropna(subset=[col] + by).copy()
    if df.empty:
        return pd.DataFrame()

    outcome = (df[col] > 0).astype(float)
    strata = _strata(df)
    # Contiguous blocks by position (the panel is time-sorted).
    blocks = pd.Series(np.minimum((np.arange(len(df)) * n_blocks) // len(df), n_blocks - 1),
                       index=df.index)
    split = int(len(df) * IS_FRACTION)
    is_mask = pd.Series(np.arange(len(df)) < split, index=df.index)

    rows = []
    for key, idx in df.groupby(by, dropna=True).groups.items():
        m = pd.Series(False, index=df.index)
        m.loc[idx] = True
        n = int(m.sum())
        if n < min_n:
            continue
        p = float(outcome[m].mean())
        base = stratified_baseline(outcome, strata, m)
        se = batch_means_se(outcome[m] - base, blocks[m])
        delta = p - base
        is_sub, oos_sub = m & is_mask, m & ~is_mask
        d_is = (float(outcome[is_sub].mean()) - stratified_baseline(outcome, strata, is_sub)
                if is_sub.sum() >= min_n // 2 else np.nan)
        d_oos = (float(outcome[oos_sub].mean()) - stratified_baseline(outcome, strata, oos_sub)
                 if oos_sub.sum() >= min_n // 2 else np.nan)
        rows.append({
            'cell': key if not isinstance(key, tuple) else '|'.join(str(k) for k in key),
            'n': n,
            'p_up': round(p, 4),
            'base_p_up': round(base, 4),
            'delta_pp': round(delta * 100, 2),
            'se_pp': round(se * 100, 2) if np.isfinite(se) else np.nan,
            't': round(delta / se, 2) if np.isfinite(se) and se > 0 else np.nan,
            'mean_ret_sig': round(float(df.loc[m, col].mean()), 4),
            'is_delta_pp': round(d_is * 100, 2) if np.isfinite(d_is) else np.nan,
            'oos_delta_pp': round(d_oos * 100, 2) if np.isfinite(d_oos) else np.nan,
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out['consistent'] = (np.sign(out['is_delta_pp']) == np.sign(out['oos_delta_pp'])) & \
                        out[['is_delta_pp', 'oos_delta_pp']].notna().all(axis=1)
    return out.sort_values('delta_pp', key=abs, ascending=False).reset_index(drop=True)


def mtf_agreement_report(panel: pd.DataFrame, base_tf: int = 1,
                         other_tfs=(5, 15)) -> pd.DataFrame:
    """Raw agreement rate vs its circular-rephasing baseline, per mode.

    Answers "how much of the 1m/5m/15m concurrence is real?" BEFORE any of it
    is used as a conditioning cell. A mode whose rate sits at its own baseline
    is carrying no cross-timeframe information at all, and conditioning on it
    is conditioning on nothing.
    """
    rows = []
    for tf in other_tfs:
        f1 = panel[f'tf{base_tf}_wt1'].to_numpy(float)
        f2 = panel[f'tf{base_tf}_wt2'].to_numpy(float)
        s1 = panel[f'tf{tf}_wt1'].to_numpy(float)
        s2 = panel[f'tf{tf}_wt2'].to_numpy(float)
        for mode in ('direction', 'level', 'zone'):
            a = panel[f'agree_{mode}_{base_tf}v{tf}']
            fin = a.dropna()
            if fin.empty:
                continue
            base = rephasing_baseline(f1, f2, s1, s2, mode=mode, shifts=12)
            rows.append({
                'pair': f'{base_tf}m vs {tf}m',
                'mode': mode,
                'comparable': int(fin.size),
                'comparable_pct': round(100 * fin.size / len(a), 1),
                'agree_pct': round(100 * float(fin.mean()), 1),
                'baseline_pct': round(100 * base, 1),
                'delta_pp': round(100 * (float(fin.mean()) - base), 1),
            })
    return pd.DataFrame(rows)


# ── reporting ────────────────────────────────────────────────────────────────

# The cell definitions the study runs. Each is a hypothesis about what the
# oscillator's state says; keeping them in one list makes the multiple-testing
# count explicit rather than something that accumulates unnoticed.
CELL_SETS = {
    'wt_zone (fast)':        ['tf1_wt_zone'],
    'wt_side x wt_dir':      ['tf1_wt_side', 'tf1_wt_dir'],
    'money_flow sign':       ['tf1_mf_sign'],
    'wt_zone x mf_sign':     ['tf1_wt_zone', 'tf1_mf_sign'],
    'vwap_slope':            ['tf1_vwap_slope'],
    'wt_zone x vwap_slope':  ['tf1_wt_zone', 'tf1_vwap_slope'],
    'stack_side (1/5/15)':   ['stack_side'],
    'stack_zone (1/5/15)':   ['stack_zone'],
    'stack_side x mf_sign':  ['stack_side', 'tf1_mf_sign'],
    'n_agree x wt_side':     ['stack_n_agree', 'tf1_wt_side'],
}


def report(panel: pd.DataFrame, horizons=(60, 240), t_threshold: float = 2.0,
           label: str = '') -> dict:
    """Print every table and the multiple-testing accounting."""
    name = label or f"{panel['instrument'].iloc[0]} ({panel['asset_class'].iloc[0]})"
    print(f'\n{"="*100}\n{name}   rows={len(panel):,}   '
          f'{panel.index[0].date()} -> {panel.index[-1].date()}   '
          f'volume={"yes" if panel["has_volume"].iloc[0] else "NO (MF is unweighted)"}'
          f'\n{"="*100}')

    print('\n-- MULTI-TIMEFRAME AGREEMENT vs its own chance baseline --')
    mtf = mtf_agreement_report(panel)
    print(mtf.to_string(index=False))
    print('   read delta_pp, never agree_pct: two timeframes of one oscillator on one')
    print('   price series agree heavily by construction.')

    tested = survived = 0
    tables = {}
    for horizon in horizons:
        print(f'\n-- P(up) over the next {horizon} min, vs matched (hour x vol) baseline --')
        for cname, by in CELL_SETS.items():
            t = conditional_table(panel, by, horizon)
            if t.empty:
                continue
            tables[f'{cname}@{horizon}'] = t
            tested += len(t)
            hits = t[(t['t'].abs() >= t_threshold) & t['consistent']]
            survived += len(hits)
            top = t.head(4)
            print(f'\n  [{cname}]  h={horizon}m')
            print(top.to_string(index=False))
            if len(hits):
                print(f'    -> {len(hits)} cell(s) |t|>={t_threshold} AND IS/OOS-consistent')

    exp_false = tested * 2 * (1 - 0.9772)  # two-sided at |t|>=2 under the null
    print(f'\n{"-"*100}')
    print(f'MULTIPLE TESTING: {tested} cells tested. At |t|>={t_threshold}, chance alone '
          f'would deliver ~{exp_false:.1f}.')
    print(f'{survived} cleared |t| AND kept their sign across the IS/OOS split.')
    if survived <= exp_false:
        print('READ: that is at or below the chance count. Nothing here has separated '
              'itself from noise.')
    print('-' * 100)
    return {'mtf': mtf, 'tables': tables, 'tested': tested, 'survived': survived,
            'expected_false': exp_false}


def main():
    ap = argparse.ArgumentParser(description='Conditional-probability tables from the panel.')
    ap.add_argument('--instruments', default='eurusd,gold,nq')
    ap.add_argument('--horizons', default='60,240')
    ap.add_argument('--data', default=DATA)
    a = ap.parse_args()

    horizons = tuple(int(x) for x in a.horizons.split(','))
    for name in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        p = os.path.join(a.data, f'panel_{name}.parquet')
        if not os.path.exists(p):
            print(f'!! no panel for {name} — run panel.py first ({p})')
            continue
        report(pd.read_parquet(p), horizons=horizons)


if __name__ == '__main__':
    main()
