"""stats.py - the scoring machinery. Everything downstream reports through this.

THREE THINGS THAT WOULD OTHERWISE MAKE THIS STUDY LIE
-----------------------------------------------------

1. AUTOCORRELATION. 792,139 M5 rows is not 792,139 observations. A 4-hour
   forward horizon means ~48 consecutive rows share almost the same outcome,
   and the underlying regime persists far longer than that. A naive t-stat on
   raw rows is inflated by roughly sqrt(48) at the very least, which turns
   noise into "t = 12". Every standard error here is a BATCH-MEANS estimate
   over contiguous time blocks, which absorbs whatever the true dependence
   length is instead of assuming it away.

2. CONFOUNDING. A VuManChu state is not randomly assigned. "WT oversold on the
   4H" happens disproportionately in high-volatility regimes, at particular
   hours, after large prior moves - all of which independently predict the
   outcome. Comparing such a cell against the raw global mean measures the
   confound, not the indicator. Every baseline here is MATCHED: the global
   outcome mean re-weighted to the cell's own joint distribution over (session,
   volatility tercile, prior-move tercile).

3. MULTIPLE TESTING. This study scans hundreds of states. At t=2 and 300
   cells, ~15 spurious "findings" are guaranteed. `null_threshold` measures
   what |t| a scan of the same shape reaches on SHUFFLED labels, so the bar a
   result must clear is derived from this data rather than assumed from a
   textbook.

All three are the difference between a result and a coincidence.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

N_BLOCKS = 60
IS_FRAC = 0.6


def batch_means_se(x, blocks, n_blocks=N_BLOCKS):
    """Standard error of the mean of `x` from contiguous block means.

    Robust to serial correlation up to roughly the block length, which is what
    a per-row SE cannot handle. Returns NaN if too few blocks carry data.
    """
    x = np.asarray(x, float)
    b = np.asarray(blocks)
    ok = np.isfinite(x)
    if ok.sum() < 30:
        return np.nan
    means = pd.Series(x[ok]).groupby(b[ok]).mean()
    means = means[np.isfinite(means)]
    if means.size < 8:
        return np.nan
    return float(means.std(ddof=1) / np.sqrt(means.size))


def make_blocks(index, n_blocks=N_BLOCKS):
    """Contiguous, equal-width TIME blocks (not equal-count) so a quiet stretch
    and a busy stretch each contribute one block rather than one weighting the
    variance by its row count."""
    t = np.asarray(index.astype('int64'), dtype=np.float64)
    lo, hi = t.min(), t.max()
    span = max(hi - lo, 1.0)
    return np.minimum(((t - lo) / span * n_blocks).astype(int), n_blocks - 1)


def tercile(s, window=40000, minp=4000):
    """Causal tercile of a continuous series - a trailing rank, never a
    whole-sample quantile (which would let the future set today's bucket)."""
    return (pd.Series(s).rolling(window, min_periods=minp).rank(pct=True)
            .mul(3).clip(0, 2.999).fillna(-1).astype(int).to_numpy())


def session_of(hour):
    """Asia / London / NY-overlap / NY-late, as integer codes."""
    h = np.asarray(hour, int)
    return np.select([h < 7, h < 12, h < 17], [0, 1, 2], default=3)


def build_strata(panel):
    """The confounders a VuManChu cell can smuggle in if left uncontrolled."""
    vol_t = tercile(panel['sigma_price'].to_numpy(float) / panel['close'].to_numpy(float))
    mag_t = tercile(np.abs(panel['trend_sig'].to_numpy(float)))
    sess = session_of(panel['hour'].to_numpy())
    return (sess.astype(np.int32) * 100 + vol_t.astype(np.int32) * 10 + mag_t.astype(np.int32))


def score_cell(y, mask, strata, blocks, is_mask, global_by_stratum, min_n=500):
    """One state vs its matched baseline. Returns a dict or None."""
    m = mask & np.isfinite(y)
    n = int(m.sum())
    if n < min_n:
        return None
    st = strata[m]
    w = pd.Series(st).value_counts(normalize=True)
    common = w.index.intersection(global_by_stratum.index)
    if not len(common):
        return None
    base = float((global_by_stratum.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
    val = float(np.mean(y[m]))
    se = batch_means_se(y[m] - base, blocks[m])

    def half(sel):
        mm = m & sel
        return float(np.mean(y[mm])) - base if mm.sum() >= max(min_n // 4, 100) else np.nan

    d_is, d_oos = half(is_mask), half(~is_mask)
    return {
        'n': n, 'value': val, 'base': base, 'delta': val - base,
        'se': se, 't': (val - base) / se if se and se > 0 else np.nan,
        'is_delta': d_is, 'oos_delta': d_oos,
        'consistent': bool(np.isfinite(d_is) and np.isfinite(d_oos)
                           and np.sign(d_is) == np.sign(d_oos)),
    }


class Scorer:
    """Holds the per-panel scaffolding so a scan of 300 states builds it once."""

    def __init__(self, panel, outcome, min_n=500, n_blocks=N_BLOCKS):
        self.panel = panel
        self.y = panel[outcome].to_numpy(float) if isinstance(outcome, str) else np.asarray(outcome, float)
        self.strata = build_strata(panel)
        self.blocks = make_blocks(panel.index, n_blocks)
        cut = int(len(panel) * IS_FRAC)
        self.is_mask = np.arange(len(panel)) < cut
        self.min_n = min_n
        ok = np.isfinite(self.y)
        self.global_by_stratum = pd.Series(self.y[ok]).groupby(self.strata[ok]).mean()
        self.grand = float(np.nanmean(self.y))

    def score(self, mask, label=''):
        r = score_cell(self.y, np.asarray(mask, bool), self.strata, self.blocks,
                       self.is_mask, self.global_by_stratum, self.min_n)
        if r is not None:
            r['cell'] = label
        return r

    def scan(self, cells):
        """cells: dict label -> boolean mask. Returns a sorted DataFrame."""
        rows = [r for lbl, m in cells.items() if (r := self.score(m, lbl)) is not None]
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        cols = ['cell', 'n', 'value', 'base', 'delta', 't', 'is_delta', 'oos_delta', 'consistent']
        return df[cols].sort_values('t', key=np.abs, ascending=False).reset_index(drop=True)

    def null_threshold(self, cells, n_shuffles=20, seed=0):
        """The |t| a scan of this shape reaches on shuffled labels.

        Circular block shifts, not row shuffles: a row shuffle destroys the
        autocorrelation that inflates t in the first place and would hand back
        a reassuring, meaningless 2.0. Shifting the outcome as a block keeps
        its dependence structure intact and only breaks its alignment with the
        state - which is exactly the null being tested.
        """
        rng = np.random.default_rng(seed)
        n = len(self.y)
        maxes = []
        for _ in range(n_shuffles):
            k = int(rng.integers(n // 10, n - n // 10))
            y_shift = np.concatenate([self.y[k:], self.y[:k]])
            ok = np.isfinite(y_shift)
            gbs = pd.Series(y_shift[ok]).groupby(self.strata[ok]).mean()
            ts = []
            for m in cells.values():
                r = score_cell(y_shift, np.asarray(m, bool), self.strata, self.blocks,
                               self.is_mask, gbs, self.min_n)
                if r and np.isfinite(r['t']):
                    ts.append(abs(r['t']))
            if ts:
                maxes.append(max(ts))
        if not maxes:
            return np.nan
        return {
            'null_max_t_median': float(np.median(maxes)),
            'null_max_t_p90': float(np.percentile(maxes, 90)),
            'n_shuffles': len(maxes),
        }


def fmt(df, top=25):
    """Compact console table."""
    if df.empty:
        return '  (no cell met the minimum sample)'
    out = ['  %-42s %8s %8s %8s %7s %8s %8s %s'
           % ('cell', 'n', 'value', 'base', 't', 'is_d', 'oos_d', 'ok')]
    for _, r in df.head(top).iterrows():
        out.append('  %-42s %8s %8.4f %8.4f %7.2f %8.4f %8.4f %s'
                   % (r['cell'][:42], format(int(r['n']), ','), r['value'], r['base'],
                      r['t'] if np.isfinite(r['t']) else 0.0,
                      r['is_delta'] if np.isfinite(r['is_delta']) else 0.0,
                      r['oos_delta'] if np.isfinite(r['oos_delta']) else 0.0,
                      'Y' if r['consistent'] else '.'))
    return '\n'.join(out)
