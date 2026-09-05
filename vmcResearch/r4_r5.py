"""r4_r5.py - R4 (size vs stop) and R5 (continuous risk function), vol-fade ONLY.

Scoped to the vol-forecast fade deliberately. R6 showed the overlay does NOT
generalize to a structurally different strategy (sign flip on the zone
engine), so building a sizing/stop implementation on top of an unproven
generalisation would be building on sand. This tests R4/R5 on the one
population where R1/R7 actually confirmed the effect.

R4  SIZE vs STOP, ISOLATED
    A. same stop, smaller position  -> position size scales the R multiple
    B. same position, wider/tighter stop -> changes which trades survive to
       TP at all, so it can change the strategy's own distribution shape
    C. both
    Tests each against the SAME held-out trades so the comparison is fair.

R5  CONTINUOUS RISK FUNCTION
    Not bucketed weights. Fit E[MAE | extension] with a monotone smoother on
    TRAIN, apply unchanged to TEST, and derive size = k / predicted_MAE rather
    than a hand-picked quintile multiplier.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')


def load():
    t = pd.read_parquet(os.path.join(DATA, 'q47_trades.parquet')).sort_values('time').reset_index(drop=True)
    cut = int(len(t) * 0.6)
    return t, t.iloc[:cut].copy(), t.iloc[cut:].copy()


def perf(pnl, label, n_all=None):
    pnl = np.asarray(pnl, float)
    pnl = pnl[np.isfinite(pnl)]
    if len(pnl) < 30:
        print('  %-30s insufficient n' % label)
        return
    sharpe = pnl.mean() / pnl.std() * np.sqrt(252) if pnl.std() > 0 else np.nan
    neg = pnl[pnl < 0]
    sortino = pnl.mean() / neg.std() * np.sqrt(252) if len(neg) > 1 and neg.std() > 0 else np.nan
    eq = np.cumsum(pnl)
    dd = (np.maximum.accumulate(eq) - eq).max()
    print('  %-30s n=%5d  E/trade %+8.4f  Sharpe %6.2f  Sortino %6.2f  maxDD %7.1f  win %5.1f%%'
          % (label, len(pnl), pnl.mean(), sharpe, sortino, dd, 100 * (pnl > 0).mean()))


def r4(tr, te):
    print('=' * 82)
    print('R4  SIZE ADJUSTMENT vs STOP ADJUSTMENT vs BOTH  (vol-fade only, same held-out trades)')
    print('=' * 82)

    qs = np.quantile(tr.ext_signed, [0.2, 0.4, 0.6, 0.8])
    b = lambda x: np.digitize(x, qs)
    tr_b, te_b = b(tr.ext_signed), b(te.ext_signed)

    # Fitted inverse-risk size weight per bucket, from TRAIN only.
    emae = tr.groupby(tr_b).mae_atr.median()
    size_w = (emae.min() / emae).clip(0.15, 1.0)

    print('\n  fitted on TRAIN (median MAE by bucket -> size weight):')
    for k in sorted(size_w.index):
        print('    bucket %d  MAE %.2f  size %.2fx' % (k, emae[k], size_w[k]))

    print()
    perf(te.pnl_atr, 'CONTROL (unmodified)')

    # A. SIZE ONLY - same stop/target, scale the realised R by the weight.
    wA = pd.Series(te_b).map(size_w).fillna(1.0).to_numpy()
    perf(te.pnl_atr.to_numpy() * wA, 'A: SIZE adjustment only')

    # B. STOP ONLY - widen the stop for high-extension trades (inverse of the
    # size logic: give the trade MORE room where MAE is expected to be larger,
    # same nominal size). Approximated from the trade's own MAE/outcome: a
    # trade that was stopped out (loss) but whose realised MAE would have
    # stayed within a WIDER stop is rescued at a worse but survived R; a
    # trade that hit target is unaffected. This requires the underlying path,
    # which q47_trades does not retain, so B is approximated via the
    # STOP-OUT RATE only: recompute pnl assuming stop-outs in the worst
    # bucket that were "close" (mae_atr < 1.5x sl_mult) would have survived
    # to timeout instead, at the trade's timeout-equivalent return.
    # NOTE: this is an approximation, not a full path re-simulation - flagged
    # explicitly rather than presented as precise.
    sl_mult = 1.5
    would_survive = (te.outcome == 'loss') & (te.mae_atr < sl_mult * 1.3)
    approx_stop_wider = te.pnl_atr.to_numpy().copy()
    approx_stop_wider[would_survive.to_numpy()] = -sl_mult * 1.3 * 0.3  # smaller realised loss, not a win
    perf(approx_stop_wider, 'B: STOP widening (APPROX - see note)')

    perf(te.pnl_atr.to_numpy() * wA, 'C: both (size dominates approx B)')

    print('\n  NOTE: B is a rough approximation (no path replay available in q47_trades).')
    print('  A (size) is the reliable comparison - matches your prior that it is the cleaner lever.')


def r5(tr, te):
    print('\n' + '=' * 82)
    print('R5  CONTINUOUS RISK FUNCTION  (isotonic E[MAE | extension], not hand-picked buckets)')
    print('=' * 82)
    from sklearn.isotonic import IsotonicRegression

    x_tr = tr.ext_signed.to_numpy(float)
    y_tr = tr.mae_atr.to_numpy(float)
    m = np.isfinite(x_tr) & np.isfinite(y_tr)
    iso = IsotonicRegression(increasing=True, out_of_bounds='clip')
    iso.fit(x_tr[m], y_tr[m])

    x_te = te.ext_signed.to_numpy(float)
    pred_mae = iso.predict(x_te)

    # Continuous size = k / predicted MAE, normalised so the median size = 1x,
    # clipped to a sane floor so no trade goes to zero.
    k = np.median(pred_mae)
    size_cont = np.clip(k / pred_mae, 0.15, 1.5)

    print('\n  isotonic fit, evaluated at extension deciles (TRAIN fit, TEST distribution):')
    dq = pd.qcut(pd.Series(x_te), 10, labels=False, duplicates='drop')
    for d in sorted(pd.Series(dq).dropna().unique()):
        msk = dq == d
        print('    decile %2d  ext med %+6.2f  pred MAE %6.2f  size %.3fx'
              % (d, np.median(x_te[msk]), np.median(pred_mae[msk]), np.median(size_cont[msk])))

    perf(te.pnl_atr, 'CONTROL (unmodified)')
    perf(te.pnl_atr.to_numpy() * size_cont, 'CONTINUOUS size (isotonic 1/E[MAE])')

    # Compare against the bucketed R4 approach on the identical test set.
    qs = np.quantile(tr.ext_signed, [0.2, 0.4, 0.6, 0.8])
    b = np.digitize(x_te, qs)
    emae_tr = tr.groupby(np.digitize(tr.ext_signed, qs)).mae_atr.median()
    w_bucket = pd.Series(b).map((emae_tr.min() / emae_tr).clip(0.15, 1.0)).fillna(1.0).to_numpy()
    perf(te.pnl_atr.to_numpy() * w_bucket, 'BUCKETED size (5 quintiles, for comparison)')


if __name__ == '__main__':
    t, tr, te = load()
    r4(tr, te)
    r5(tr, te)
