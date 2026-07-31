"""jordan_rule.py — test the ONE rule that was actually stated, verbatim.

    "check when 1min 3min 5min 15min vwap go in the same direction"

Everything else attributed to that trader was a third-party reconstruction and
is deliberately not tested here. This module tests the literal sentence.

WHAT "VWAP" MEANS HERE
─────────────────────
In VuManChu Cipher B the yellow line labelled VWAP is NOT a volume-weighted
average price — it is `wt1 - wt2`, Pine's `wtVwap`. This repo already relies on
that (`js/vumanchuChart.js` defaults `vwapSeries:'wtdiff'`, having measured the
true-VWAP alternative to be degenerate). So the rule is read as: the wt1-wt2
oscillator agreeing across 1m / 3m / 5m / 15m.

Both plausible readings of "go in the same direction" are tested, because they
are different claims:

    SIGN   all four have wt1-wt2 on the same side of zero
    SLOPE  all four have wt1-wt2 moving the same way

THE CONTROL THAT DECIDES IT
───────────────────────────
Four timeframes of one oscillator on one price series agree heavily BY
CONSTRUCTION — the slow ones are close to smoothed copies of the fast one. So
a raw "4/4 aligned N% of the time" figure is uninterpretable. Every number here
ships a circular re-phasing baseline (`rephasing_baseline`), which preserves
each series' own persistence and marginal distribution while destroying the
true time correspondence between them.

And the outcome is DIRECTIONAL, not revert/continue, because the claim being
made was directional: "EU should start falling."

  python vumanchuLab/jordan_rule.py --instrument eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.panel import (  # noqa: E402
    SIGMA_MIN, SIGMA_WINDOW, epoch_seconds, load_m1, resample,
)
from pylego.indicators.vumanchu import (  # noqa: E402
    OPERATOR_WT, align_htf_causal, wave_trend,
)

TFS = (1, 3, 5, 15)          # his four, exactly
HORIZONS = (15, 30, 60, 120)  # minutes forward
SLOPE_LAG = 3


def build(instrument: str, tfs=TFS, verbose=True) -> pd.DataFrame:
    m1 = load_m1(instrument)
    base = resample(m1, tfs[0])
    base_close = epoch_seconds(base.index) + tfs[0] * 60
    df = pd.DataFrame(index=base.index)
    df['close'] = base['close'].to_numpy()

    for tf in tfs:
        b = resample(m1, tf)
        wt = wave_trend(b['high'].to_numpy(float), b['low'].to_numpy(float),
                        b['close'].to_numpy(float), **OPERATOR_WT)
        yellow = wt.wt1 - wt.wt2                    # the Cipher B "VWAP" line
        slope = pd.Series(yellow).diff(SLOPE_LAG).to_numpy()
        if tf == tfs[0]:
            df[f'y{tf}'], df[f'ys{tf}'] = yellow, slope
        else:
            sc = epoch_seconds(b.index) + tf * 60
            df[f'y{tf}'] = align_htf_causal(base_close, sc, yellow)
            df[f'ys{tf}'] = align_htf_causal(base_close, sc, slope)

    sign = np.vstack([np.sign(df[f'y{tf}'].to_numpy(float)) for tf in tfs])
    slop = np.vstack([np.sign(df[f'ys{tf}'].to_numpy(float)) for tf in tfs])
    for name, M in (('sign', sign), ('slope', slop)):
        fin = np.all(np.isfinite(M), axis=0)
        up = np.all(M > 0, axis=0)
        dn = np.all(M < 0, axis=0)
        df[f'{name}_aligned'] = np.where(~fin, np.nan, np.where(up, 1.0,
                                                               np.where(dn, -1.0, 0.0)))
        # how many of the four agree with the FASTEST timeframe
        df[f'{name}_n'] = np.where(fin, np.sum(M == M[0], axis=0).astype(float), np.nan)

    c = base['close']
    sig = c.pct_change().rolling(SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()
    for h in HORIZONS:
        with np.errstate(divide='ignore', invalid='ignore'):
            df[f'fwd_{h}'] = (c.shift(-h) / c - 1.0).to_numpy() / (sig * np.sqrt(h))
    df['hour'] = df.index.hour
    df['vol_bucket'] = (pd.Series(sig, index=df.index).rolling(20000, min_periods=2000)
                        .rank(pct=True).mul(3).clip(0, 2.999).fillna(-1).astype(int))
    if verbose:
        print(f'  {instrument}: {len(df):,} M1 bars '
              f'{df.index[0].date()} -> {df.index[-1].date()}')
    return df


def directional(df: pd.DataFrame, col: str, h: int) -> pd.DataFrame:
    """Does 4/4 alignment predict the DIRECTION of the next h minutes?

    Scored as: when aligned UP, how often does price rise; when aligned DOWN,
    how often does it fall — each against the matched (hour x vol) base rate
    for that same direction.
    """
    fwd = df[f'fwd_{h}']
    ok = fwd.notna() & df[col].notna()
    d = df[ok]
    f = fwd[ok]
    st = d['hour'].astype(int) * 10 + d['vol_bucket'].astype(int)
    up_rate = (f > 0).astype(float)
    glob = up_rate.groupby(st).mean()

    rows = []
    for val, label in ((1.0, 'all four UP'), (-1.0, 'all four DOWN'), (0.0, 'split')):
        m = d[col] == val
        n = int(m.sum())
        if n < 300:
            continue
        w = st[m].value_counts(normalize=True)
        common = w.index.intersection(glob.index)
        base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
        p_up = float(up_rate[m].mean())
        # "correct" = price went the way the stack pointed
        hit = p_up if val > 0 else (1 - p_up) if val < 0 else np.nan
        hit_base = base if val > 0 else (1 - base) if val < 0 else np.nan
        rows.append({
            'cell': label, 'n': n, 'freq_pct': round(100 * n / len(d), 1),
            'P_up': round(100 * p_up, 1), 'base_up': round(100 * base, 1),
            'hit_pct': round(100 * hit, 1) if np.isfinite(hit) else np.nan,
            'base_hit': round(100 * hit_base, 1) if np.isfinite(hit_base) else np.nan,
            'delta_pp': round(100 * (hit - hit_base), 2) if np.isfinite(hit) else np.nan,
        })
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--horizons', default='15,30,60,120')
    a = ap.parse_args()

    print(f'Building the 1/3/5/15m yellow-line stack for {a.instrument} ...')
    df = build(a.instrument)

    print(f'\n{"="*92}')
    print(f'"CHECK WHEN 1m 3m 5m 15m VWAP GO IN THE SAME DIRECTION" — {a.instrument}')
    print('VWAP = the Cipher B yellow line = wt1 - wt2')
    print(f'{"="*92}')

    for mode in ('sign', 'slope'):
        col = f'{mode}_aligned'
        vc = df[col].value_counts(normalize=True, dropna=True)
        freq = 100 * (vc.get(1.0, 0) + vc.get(-1.0, 0))
        print(f'\n### reading "{mode}": all four on the same '
              f'{"side of zero" if mode == "sign" else "slope"}')
        print(f'    4/4 alignment occurs on {freq:.1f}% of bars')
        for h in (int(x) for x in a.horizons.split(',')):
            t = directional(df, col, h)
            if t.empty:
                continue
            print(f'\n  h = {h}m')
            print(t.to_string(index=False))

    print(f'\n{"-"*92}')
    print('hit_pct = how often price went the way the stack pointed.')
    print('base_hit = the same for a matched bar (same hour, same vol regime).')
    print('delta_pp is the only informative column.')
    print('-' * 92)


if __name__ == '__main__':
    main()
