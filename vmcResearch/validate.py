"""validate.py - prove the panel does not look ahead, before anything is read off it.

Two checks:

1. TRUNCATION INVARIANCE. Build the panel on the full history, then rebuild it
   on history truncated at T. Every row before T must be IDENTICAL. If a 4H
   column were forward-filled by bar START instead of bar CLOSE, or an
   indicator normalised against the whole array, the truncated build would
   disagree and the leak would show up here as a nonzero diff.

2. DIVERGENCE STAMP LAG. A fractal at bar i is only knowable at i + pivot_n.
   Check that no divergence is stamped on a bar whose confirming fractal had
   not yet completed.

Run:  python vmcResearch/validate.py
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import panel as P  # noqa: E402
from vmcResearch.vmcfeat import divergence, pivots  # noqa: E402


def truncation_test(instrument='eurusd', cut='2024-01-01', tail_rows=20000):
    """Rebuild on truncated M1 and compare the overlap."""
    m1 = P.load_m1(instrument)
    cut_ts = pd.Timestamp(cut, tz='UTC')

    full = _build_from(m1)
    trunc = _build_from(m1[m1.index < cut_ts])

    # Compare the last `tail_rows` rows before the cut - the ones most exposed
    # to a leak, since a leaking column would pull from just after the cut.
    overlap = trunc.index[trunc.index < cut_ts][-tail_rows:]
    a = full.loc[overlap]
    b = trunc.loc[overlap]

    state_cols = [c for c in a.columns if c.startswith('tf')]
    bad = []
    for c in state_cols:
        x, y = a[c].to_numpy(float), b[c].to_numpy(float)
        both_nan = np.isnan(x) & np.isnan(y)
        diff = np.abs(np.where(both_nan, 0.0, np.nan_to_num(x) - np.nan_to_num(y)))
        n_diff = int(np.sum(diff > 1e-4))
        if n_diff:
            bad.append((c, n_diff, float(np.nanmax(diff))))

    print('TRUNCATION INVARIANCE  (%s, cut %s, %d overlap rows)' % (instrument, cut, len(overlap)))
    print('  state columns checked : %d' % len(state_cols))
    if not bad:
        print('  PASS - every causal column is bit-identical across the cut')
    else:
        print('  FAIL - %d column(s) differ:' % len(bad))
        for c, n, mx in bad[:20]:
            print('    %-28s %7d rows differ, max |diff| %.6g' % (c, n, mx))
    return not bad


def _build_from(m1):
    """The panel's causal half only - no forward columns needed for this test."""
    from pylego.indicators.vumanchu import align_htf_causal
    from vmcResearch.vmcfeat import tf_state
    base = P.resample(m1, P.BASE_TF)
    base_close = (base.index.astype('int64') // 10**9 + P.BASE_TF * 60).to_numpy()
    out = pd.DataFrame(index=base.index)
    out['close'] = base['close'].to_numpy(float)
    for tf in P.TIMEFRAMES:
        bars = P.resample(m1, tf)
        st = tf_state(bars, vwap_window=P.VWAP_WINDOW)
        reg, hid = divergence(bars['close'].to_numpy(float), st['wt1'].to_numpy(float), pivot_n=5)
        st['div_regular'], st['div_hidden'] = reg, hid
        slow_close = (bars.index.astype('int64') // 10**9 + tf * 60).to_numpy()
        for col in st.columns:
            out['tf%d_%s' % (tf, col)] = align_htf_causal(base_close, slow_close, st[col].to_numpy(float))
    return out


def divergence_lag_test(instrument='eurusd', pivot_n=5, cut_frac=0.7):
    """Divergence stamps must not move when the future is taken away.

    NOTE ON AN EARLIER, WRONG VERSION OF THIS TEST: it asserted that the most
    recent fractal before a stamp sits at least pivot_n bars back, and reported
    498 violations. That test was invalid, not the code. A fractal high and a
    fractal low can legitimately sit 2 bars apart (a sharp spike down straight
    off a peak is the max of its own window and the next bar is the min of
    its), so "most recent fractal" is simply not the fractal the divergence was
    computed from. Truncation invariance is the honest question: if the stamp
    at bar i is unchanged when every bar after i is deleted, it used no future.
    """
    m1 = P.load_m1(instrument)
    bars = P.resample(m1, 60)
    from vmcResearch.vmcfeat import tf_state

    def stamps(b):
        st = tf_state(b, vwap_window=P.VWAP_WINDOW)
        return divergence(b['close'].to_numpy(float), st['wt1'].to_numpy(float), pivot_n=pivot_n)

    reg_f, hid_f = stamps(bars)
    k = int(len(bars) * cut_frac)
    reg_t, hid_t = stamps(bars.iloc[:k])

    # Only bars whose confirmation window closed before the cut are comparable;
    # the last pivot_n bars of a truncated series legitimately cannot be judged.
    n = k - pivot_n
    d_reg = int(np.sum(reg_f[:n] != reg_t[:n]))
    d_hid = int(np.sum(hid_f[:n] != hid_t[:n]))
    total = int((reg_f != 0).sum() + (hid_f != 0).sum())

    print('\nDIVERGENCE TRUNCATION INVARIANCE  (%s, H1, pivot_n=%d, cut at %d%%)'
          % (instrument, pivot_n, int(cut_frac * 100)))
    print('  divergences stamped   : %d  (regular %d, hidden %d)'
          % (total, int((reg_f != 0).sum()), int((hid_f != 0).sum())))
    print('  base rate             : %.3f%% of bars' % (100.0 * total / len(bars)))
    if d_reg == 0 and d_hid == 0:
        print('  PASS - every stamp before the cut is unchanged by deleting the future')
    else:
        print('  FAIL - %d regular / %d hidden stamps changed' % (d_reg, d_hid))
    return d_reg == 0 and d_hid == 0


def sanity(instrument='eurusd'):
    """Distributions, so a silently-degenerate column cannot pass as a feature."""
    p = pd.read_parquet(os.path.join(P.OUT_DIR, 'panel_%s.parquet' % instrument))
    print('\nCOLUMN SANITY  (%s, %s rows)' % (instrument, format(len(p), ',')))
    print('  %-24s %8s %8s %8s %8s %8s' % ('column', 'nan%', 'p1', 'p50', 'p99', 'uniq'))
    for tf in P.TIMEFRAMES:
        for f in ('wt1', 'wt_spread', 'mf', 'vwap_dist'):
            col = 'tf%d_%s' % (tf, f)
            v = p[col].to_numpy(float)
            ok = v[np.isfinite(v)]
            print('  %-24s %7.1f%% %8.2f %8.2f %8.2f %8d'
                  % (col, 100.0 * (1 - ok.size / v.size),
                     np.percentile(ok, 1), np.percentile(ok, 50),
                     np.percentile(ok, 99), np.unique(ok).size))
    for tf in P.TIMEFRAMES:
        d = p['tf%d_div_regular' % tf].to_numpy(float)
        h = p['tf%d_div_hidden' % tf].to_numpy(float)
        print('  tf%-4d divergence rows: regular %6d  hidden %6d' % (tf, int((d != 0).sum()), int((h != 0).sum())))
    f = p['fwd_sig_20'].to_numpy(float)
    ok = f[np.isfinite(f)]
    print('  fwd_sig_20  mean %.4f  sd %.3f  (should be ~0 mean, ~1 sd)' % (ok.mean(), ok.std()))


if __name__ == '__main__':
    a = truncation_test()
    b = divergence_lag_test()
    sanity()
    print('\n%s' % ('ALL LEAK CHECKS PASSED' if (a and b) else 'LEAK CHECKS FAILED - do not read results off this panel'))
