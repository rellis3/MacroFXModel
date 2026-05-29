#!/usr/bin/env python3
"""
Validation: compare updated analytical model vs reference (Friday May 29, 2026).
Since Yahoo Finance is network-restricted, we feed the exact reference vol directly
into the analytical formulas to isolate the range/OC methodology accuracy.
"""

import math, sys
import numpy as np

sys.path.insert(0, '.')
from vol_range_forecast import (
    BM_RANGE_P50, BM_RANGE_P75, HALFNORM_P50, HALFNORM_P75, ASSET_PARAMS,
    ewma_vol_series,
)

TRADING_DAYS = 252

# ── Reference ─────────────────────────────────────────────────────────────────
REFERENCE = {
    'GOLD':   {'vol': 27.11, 'ac': 'commodity', 'hl_med': 2.75, 'hl_75': 3.46, 'oc_med': 1.34, 'oc_75': 2.29},
    'EURUSD': {'vol': 5.46,  'ac': 'fx',        'hl_med': 0.53, 'hl_75': 0.63, 'oc_med': 0.22, 'oc_75': 0.36},
    'NQ':     {'vol': 17.37, 'ac': 'index',     'hl_med': 1.71, 'hl_75': 2.13, 'oc_med': 0.82, 'oc_75': 1.41},
}

def pct_diff(ours, ref):
    return (ours - ref) / ref * 100 if ref else float('nan')

def analytical_forecast(vol_annual_pct, asset_class, news_mult=1.0):
    sd  = vol_annual_pct / math.sqrt(TRADING_DAYS)
    p   = ASSET_PARAMS[asset_class]
    r2  = lambda x: round(x, 2)
    return {
        'hl_median': r2(BM_RANGE_P50                   * sd * news_mult),
        'hl_75':     r2(BM_RANGE_P75 * p['hl_75_corr'] * sd * news_mult),
        'oc_median': r2(HALFNORM_P50 * p['oc_corr']    * sd * news_mult),
        'oc_75':     r2(HALFNORM_P75 * p['oc_corr']    * sd * news_mult),
    }

def run():
    print()
    print('═' * 68)
    print('  UPDATED MODEL vs REFERENCE   Friday May 29, 2026')
    print('  (feeding reference vol directly → isolates range methodology)')
    print('═' * 68)

    all_diffs = []

    for name, ref in REFERENCE.items():
        f = analytical_forecast(ref['vol'], ref['ac'])
        sd = ref['vol'] / math.sqrt(TRADING_DAYS)

        print(f'\n── {name}  (σ_daily={sd:.4f}%,  asset_class={ref["ac"]})')
        print(f'  {"Metric":<16}  {"Reference":>9}  {"Our Model":>9}  {"Diff":>7}')
        print(f'  ' + '─' * 48)

        rows = [
            ('H-L median',  ref['hl_med'], f['hl_median']),
            ('H-L 75th',    ref['hl_75'],  f['hl_75']),
            ('O-C median',  ref['oc_med'], f['oc_median']),
            ('O-C 75th',    ref['oc_75'],  f['oc_75']),
        ]
        for label, rv, ov in rows:
            d = pct_diff(ov, rv)
            all_diffs.append(abs(d))
            flag = '✓' if abs(d) < 3 else ('~' if abs(d) < 6 else '△')
            print(f'  {label:<16}  {rv:>8.2f}%  {ov:>8.2f}%  {d:>+6.1f}%  {flag}')

    print()
    print('═' * 68)
    print(f'  Mean absolute deviation : {np.mean(all_diffs):.2f}%')
    print(f'  Max absolute deviation  : {np.max(all_diffs):.2f}%')
    print('═' * 68)

    # Also show what the full EWMA smoke test produces on synthetic data
    print()
    print('── Smoke test with synthetic GBM (vol NOT forced to match reference)')
    import pandas as pd
    from vol_range_forecast import compute_forecast, INSTRUMENTS

    rng = np.random.default_rng(42)
    smoke_vols = {'commodity': 0.22, 'index': 0.18, 'fx': 0.055}
    for ac, ann_vol in smoke_vols.items():
        sd_d = ann_vol / math.sqrt(252)
        log_ret = rng.normal(0, sd_d, 700)
        closes  = np.cumprod(1 + log_ret) * 2000
        dates   = pd.date_range(end='2026-05-28', periods=700, freq='B')
        df      = pd.DataFrame({'Close': closes}, index=dates)
        df['Open'] = df['Close'].shift(1).fillna(df['Close'])
        df['High'] = df['Close']
        df['Low']  = df['Close']
        f = compute_forecast(df, asset_class=ac)
        print(f'  {ac:<10}  vol={f["vol_annual"]:.2f}%  HL {f["hl_median"]}–{f["hl_75"]}%  OC {f["oc_median"]}–{f["oc_75"]}%')

if __name__ == '__main__':
    run()
