"""falsify.py — the anchor-offset test: is the conditional structure real, or
is it noise in the bar the oscillator was read from?

THE PROBLEM THIS EXISTS TO CATCH
────────────────────────────────
Every cell in `analyse.py` reads the VuManChu state at bar i and measures the
forward return FROM close[i]. But WaveTrend is a function of hlc3[i], i.e. of
close[i] itself. So if close[i] carries any transient noise — a wide tick, a
bid/ask bounce, a thin-liquidity print — then:

  * that noise pushes WT up, so the bar is labelled "overbought", AND
  * the forward return measured from that same inflated close[i] is negative
    on average, purely because the anchor was too high.

The two effects share a term. The result is a textbook mean-reversion signal
that is 100% mechanical, IS/OOS-stable (noise is stable), and completely
untradeable — you cannot transact at the erroneous print that created it.

THE TEST
────────
Recompute the identical cells with the forward return anchored at close[i+k]
for k = 0, 1, 5, 15 base bars, holding the STATE read fixed at bar i. Shifting
the anchor forward does not change what was knowable at i (it only makes the
trade later and worse), but it does remove the shared noise term.

PRE-REGISTERED READING — decided before the numbers were seen:
  * If the effect largely dies between k=0 and k=1, it was anchor noise. The
    honest conclusion is "no signal", not "signal with a lag".
  * If it decays smoothly and a solid fraction survives to k=5/k=15, there is
    genuine short-horizon reversion the oscillator is tagging.
  * Either way, `mean_ret_sig` must be compared against round-trip cost before
    anyone calls it tradeable. This script deliberately does NOT do that — it
    answers "is it real", not "is it profitable".

  python vumanchuLab/falsify.py --instrument eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import _strata, batch_means_se, stratified_baseline  # noqa: E402
from vumanchuLab.panel import (  # noqa: E402
    HORIZONS, SIGMA_MIN, SIGMA_WINDOW, TIMEFRAMES, load_m1, resample, timeframe_features,
)
from pylego.indicators.vumanchu import OPERATOR_WT, align_htf_causal  # noqa: E402

OFFSETS = (0, 1, 5, 15)
N_BLOCKS = 40


def anchored_panel(instrument: str, horizon: int, stride: int = 5,
                   start=None, end=None) -> pd.DataFrame:
    """Minimal panel: fast-TF state + stack side, plus a forward return per
    anchor offset. State is ALWAYS read at bar i; only the anchor moves."""
    m1 = load_m1(instrument, start, end)
    base = resample(m1, TIMEFRAMES[0])
    blocks = {tf: timeframe_features(resample(m1, tf), tf, dict(OPERATOR_WT))
              for tf in TIMEFRAMES}
    f = blocks[TIMEFRAMES[0]]

    df = pd.DataFrame(index=base.index)
    df['wt_zone'] = f['wt_zone'].to_numpy()
    df['mf_sign'] = f['mf_sign'].to_numpy()
    df['sigma'] = f['sigma'].to_numpy()
    df['hour'] = df.index.hour
    sides = [f['wt_side'].to_numpy(float)]
    base_close_sec = f['close_sec'].to_numpy(float)
    for tf in TIMEFRAMES[1:]:
        blk = blocks[tf]
        sides.append(align_htf_causal(base_close_sec, blk['close_sec'].to_numpy(float),
                                      blk['wt_side'].to_numpy(float)))
    S = np.vstack(sides)
    fin = np.all(np.isfinite(S), axis=0)
    df['stack_side'] = np.where(~fin, np.nan,
                                np.where(np.all(S > 0, axis=0), 1.0,
                                         np.where(np.all(S < 0, axis=0), -1.0, 0.0)))
    df['vol_bucket'] = (df['sigma'].rolling(20000, min_periods=2000)
                          .rank(pct=True).mul(3).clip(0, 2.999))

    c = base['close']
    scale = df['sigma'].to_numpy(float) * np.sqrt(horizon)
    for k in OFFSETS:
        # Anchor at close[i+k], still exit at close[i+k+horizon].
        with np.errstate(divide='ignore', invalid='ignore'):
            r = (c.shift(-(k + horizon)) / c.shift(-k) - 1.0).to_numpy()
            df[f'fwd_k{k}'] = np.where(np.isfinite(scale) & (scale > 0), r / scale, np.nan)
    return df.iloc[::stride]


def cell_deltas(df: pd.DataFrame, by: str, offset_col: str) -> pd.DataFrame:
    sub = df.dropna(subset=[by, offset_col])
    if sub.empty:
        return pd.DataFrame()
    outcome = (sub[offset_col] > 0).astype(float)
    strata = _strata(sub)
    blocks = pd.Series(np.minimum((np.arange(len(sub)) * N_BLOCKS) // len(sub), N_BLOCKS - 1),
                       index=sub.index)
    rows = []
    for key, idx in sub.groupby(by, dropna=True).groups.items():
        m = pd.Series(False, index=sub.index)
        m.loc[idx] = True
        if m.sum() < 200:
            continue
        base = stratified_baseline(outcome, strata, m)
        delta = float(outcome[m].mean()) - base
        se = batch_means_se(outcome[m] - base, blocks[m])
        rows.append({'cell': key, 'n': int(m.sum()),
                     'delta_pp': round(delta * 100, 2),
                     't': round(delta / se, 2) if np.isfinite(se) and se > 0 else np.nan,
                     'mean_ret_sig': round(float(sub.loc[m, offset_col].mean()), 4)})
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--horizon', type=int, default=60)
    ap.add_argument('--cells', default='wt_zone,stack_side,mf_sign')
    ap.add_argument('--start', default=None)
    a = ap.parse_args()

    print(f'Building anchored panel for {a.instrument}, horizon {a.horizon}m ...')
    df = anchored_panel(a.instrument, a.horizon, start=a.start)
    print(f'  {len(df):,} rows\n')

    print('=' * 92)
    print(f'ANCHOR-OFFSET FALSIFIER — {a.instrument}, h={a.horizon}m')
    print('State is read at bar i in every column; only the ENTRY anchor moves forward.')
    print('=' * 92)

    for by in [s.strip() for s in a.cells.split(',')]:
        print(f'\n-- cell: {by} --')
        merged = None
        for k in OFFSETS:
            t = cell_deltas(df, by, f'fwd_k{k}')
            if t.empty:
                continue
            t = t[['cell', 'n', 'delta_pp', 't', 'mean_ret_sig']].rename(
                columns={'delta_pp': f'd_k{k}', 't': f't_k{k}', 'mean_ret_sig': f'ret_k{k}'})
            merged = t if merged is None else merged.merge(t.drop(columns=['n']), on='cell')
        if merged is None:
            continue
        print(merged.to_string(index=False))
        # Retention: how much of the k=0 delta is left once the anchor moves off
        # the bar the oscillator was read from.
        for k in OFFSETS[1:]:
            num = merged[f'd_k{k}'].abs().sum()
            den = merged['d_k0'].abs().sum()
            if den > 0:
                print(f'    retention at k={k:>2}: {100*num/den:5.1f}% of the k=0 effect')

    print('\n' + '=' * 92)
    print('READ: a collapse between k=0 and k=1 means the effect lived in the anchor bar')
    print('itself (noise shared by the oscillator and the return) and is not a signal.')
    print('=' * 92)


if __name__ == '__main__':
    main()
