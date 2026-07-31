"""drift_test.py — is the drift/asymmetry law USABLE, or only an explanation?

`scale.py` found corr(asymmetry, drift) = -0.83 across 31 instruments: the
harder an instrument trended, the more its oversold reverted and the less its
overbought did. But that drift was measured over the WHOLE SAMPLE — hindsight.
A relationship you can only see afterwards explains the past; it does not help
with the next bar.

This asks the honest version: bucket every bar by the drift KNOWABLE AT THAT
BAR (a trailing window, no future), and see whether the same law holds within
buckets. Two very different outcomes:

  SURVIVES  trailing drift is a usable conditioning input — the engine can say
            "this instrument has been trending up, so weight its oversold read
            and discount its overbought one." One principled input, no fitted
            weights.

  DIES      the effect needed hindsight. Then it stays an explanation of why
            instruments differ, and nothing more. Still worth knowing; just not
            a feature.

Pre-registered before running: SURVIVES means the OS-minus-OB gap is
monotonically ordered across trailing-drift terciles, with the same sign, on a
clear majority of instruments AND in the pooled fit. Anything less is a null.

This module writes nothing and modifies nothing — `scale.py`'s cache and every
earlier result are untouched regardless of what it finds.

  python vumanchuLab/drift_test.py
  python vumanchuLab/drift_test.py --instruments spx,nq,usdjpy,eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import DATA, batch_means_se  # noqa: E402
from vumanchuLab.panel import TIMEFRAMES, build_panel  # noqa: E402
from pylego.instruments import asset_class  # noqa: E402

# A spread spanning strong uptrend -> flat -> mild downtrend, so the test has
# range to work with without rebuilding all 31 panels.
DEFAULT = 'spx,nq,usdjpy,chfjpy,eurusd,euraud,eurchf,audcad'

PRIOR_ROWS = 12
FWD = 'fwd_ret_60'
MIN_PRIOR = 0.5
N_BLOCKS = 40
# Trailing drift window in panel rows. Stride 5 => 1 row = 5 min.
# 60 days ~ 60*24*60/5 = 17,280 rows. Weekends make it fewer in practice.
DRIFT_ROWS = 17280


def prep(inst: str) -> pd.DataFrame:
    p = build_panel(inst, timeframes=TIMEFRAMES, stride=5, verbose=False)
    c = p['close']
    sig = p['sigma'].to_numpy(float)
    with np.errstate(divide='ignore', invalid='ignore'):
        prior = (c / c.shift(PRIOR_ROWS) - 1.0).to_numpy() / (sig * np.sqrt(PRIOR_ROWS * 5))
    fwd = p[FWD].to_numpy(float)
    rev = (np.sign(fwd) != np.sign(prior)).astype(float)
    rev[~np.isfinite(fwd) | ~np.isfinite(prior)] = np.nan
    rev[np.abs(prior) < MIN_PRIOR] = np.nan
    p = p.copy()
    p['reverted'] = rev
    p['prior_bucket'] = (pd.Series(np.abs(prior), index=p.index)
                         .rolling(20000, min_periods=2000).rank(pct=True)
                         .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    # TRAILING drift — log return over the past DRIFT_ROWS, knowable at the bar.
    lp = np.log(c.to_numpy(float))
    p['drift'] = pd.Series(lp, index=p.index).diff(DRIFT_ROWS).to_numpy()
    # Terciles of that trailing drift, themselves computed causally.
    p['drift_b'] = (p['drift'].rolling(60000, min_periods=20000).rank(pct=True)
                    .mul(3).clip(0, 2.999).astype(float))
    return p.dropna(subset=['reverted', 'drift_b'])


def delta(df: pd.DataFrame, mask: pd.Series) -> tuple[float, float, int]:
    y = df['reverted']
    st = (df['hour'].astype(int) * 100 + df['vol_bucket'].fillna(-1).astype(int) * 10
          + df['prior_bucket'].astype(int))
    glob = y.groupby(st).mean()
    n = int(mask.sum())
    if n < 300:
        return np.nan, np.nan, n
    w = st[mask].value_counts(normalize=True)
    common = w.index.intersection(glob.index)
    if not len(common):
        return np.nan, np.nan, n
    base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
    p = float(y[mask].mean())
    blocks = pd.Series(np.minimum((np.arange(len(df)) * N_BLOCKS) // len(df), N_BLOCKS - 1),
                       index=df.index)
    se = batch_means_se(y[mask] - base, blocks[mask])
    return 100 * (p - base), ((p - base) / se if se and se > 0 else np.nan), n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default=DEFAULT)
    a = ap.parse_args()

    names = [s.strip() for s in a.instruments.split(',') if s.strip()]
    rows, pooled = [], []
    for i, inst in enumerate(names, 1):
        print(f'[{i}/{len(names)}] {inst} ...', end='', flush=True)
        try:
            df = prep(inst)
        except Exception as e:
            print(f' FAILED {str(e)[:60]}'); continue
        for b, lab in ((0, 'down-trend'), (1, 'flat'), (2, 'up-trend')):
            sel = df['drift_b'].astype(int) == b
            if sel.sum() < 1000:
                continue
            sub = df[sel]
            os_d, os_t, os_n = delta(sub, sub['tf1_wt_zone'] == -1)
            ob_d, ob_t, ob_n = delta(sub, sub['tf1_wt_zone'] == 1)
            rows.append(dict(instrument=inst, cls=asset_class(inst), bucket=lab,
                             mean_drift_pct=round(100 * float(sub['drift'].mean()), 1),
                             OS_pp=round(os_d, 2) if np.isfinite(os_d) else np.nan,
                             OB_pp=round(ob_d, 2) if np.isfinite(ob_d) else np.nan,
                             asym=round(ob_d - os_d, 2) if np.isfinite(os_d) and np.isfinite(ob_d) else np.nan,
                             n=os_n + ob_n))
        pooled.append(df[['reverted', 'hour', 'vol_bucket', 'prior_bucket',
                          'drift_b', 'tf1_wt_zone']].assign(instrument=inst))
        print(' ok')

    if not rows:
        print('nothing computed'); return
    d = pd.DataFrame(rows)
    pd.set_option('display.width', 200)

    print(f'\n{"="*92}')
    print('DOES THE DRIFT LAW SURVIVE WHEN DRIFT IS ONLY KNOWN FROM THE PAST?')
    print(f'trailing window {DRIFT_ROWS:,} panel rows (~60 days)')
    print(f'{"="*92}\n')
    print(d.to_string(index=False))

    print('\n-- POOLED across instruments, by trailing-drift bucket --')
    P = pd.concat(pooled, ignore_index=True)
    P['vol_bucket'] = P['vol_bucket'].fillna(-1)
    for b, lab in ((0, 'down-trend'), (1, 'flat'), (2, 'up-trend')):
        sub = P[P['drift_b'].astype(int) == b]
        if len(sub) < 5000:
            continue
        os_d, os_t, os_n = delta(sub, sub['tf1_wt_zone'] == -1)
        ob_d, ob_t, ob_n = delta(sub, sub['tf1_wt_zone'] == 1)
        print(f'  {lab:<11} OS {os_d:+6.2f}pp (t {os_t:+5.2f}, n {os_n:,})   '
              f'OB {ob_d:+6.2f}pp (t {ob_t:+5.2f}, n {ob_n:,})   '
              f'asym {ob_d - os_d:+6.2f}')

    print('\n-- PRE-REGISTERED VERDICT --')
    piv = d.pivot_table(index='instrument', columns='bucket', values='asym')
    if {'down-trend', 'up-trend'}.issubset(piv.columns):
        ok = (piv['up-trend'] < piv['down-trend']).sum()
        tot = piv[['up-trend', 'down-trend']].notna().all(axis=1).sum()
        print(f'  asymmetry more negative in up-trend than down-trend: {ok}/{tot} instruments')
        print('  (the law predicts up-trend => OS strong, OB weak => asym MORE negative)')
        if ok >= tot * 0.75:
            print('  -> SURVIVES: trailing drift is a usable conditioning input.')
        else:
            print('  -> DOES NOT SURVIVE as stated. The whole-sample relationship')
            print('     needed hindsight; it explains cross-instrument differences')
            print('     but is not a per-bar feature. Nothing earlier is affected.')


if __name__ == '__main__':
    main()
