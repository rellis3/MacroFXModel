#!/usr/bin/env python3
"""
Unit tests + synthetic-data smoke test for vol_range_forecast.py.
Verifiable without network access — generates a fake 3-year OHLC series.
"""

import math
import sys
import numpy as np
import pandas as pd
from datetime import datetime, date, timedelta, timezone

sys.path.insert(0, '.')
from vol_range_forecast import (
    ewma_vol_series,
    compute_forecast,
    format_report,
    run_forecast,
    _divider,
)


def make_synthetic_ohlc(n: int = 800, annual_vol: float = 0.20, seed: int = 42) -> pd.DataFrame:
    """
    Simulate daily OHLC for a GBM with given annualised volatility.
    Returns a DataFrame with columns [Open, High, Low, Close].
    """
    rng   = np.random.default_rng(seed)
    dt    = 1 / 252
    sigma = annual_vol * math.sqrt(dt)

    log_ret = rng.normal(0, sigma, n)
    prices  = 2000.0 * np.exp(np.cumsum(log_ret))          # Close
    opens   = np.roll(prices, 1); opens[0] = 2000.0        # Open = prior close

    # Intraday H-L: add independent noise around mid
    daily_range = np.abs(rng.normal(0, sigma, n))
    highs  = np.maximum(opens, prices) + daily_range * 0.5 * prices
    lows   = np.minimum(opens, prices) - daily_range * 0.5 * prices

    dates = pd.date_range(end=date.today(), periods=n, freq='B')
    return pd.DataFrame({'Open': opens, 'High': highs, 'Low': lows, 'Close': prices},
                        index=dates)


# ── Tests ────────────────────────────────────────────────────────────────────────

def test_ewma_vol_recovers_input_vol():
    """EWMA long-run average should be close to the true σ used to generate returns."""
    true_annual = 0.20
    true_daily  = true_annual / math.sqrt(252)
    rng = np.random.default_rng(0)
    ret = rng.normal(0, true_daily, 2000)
    sigma = ewma_vol_series(ret)
    # The tail average of the EWMA should be within 10% of true daily vol
    tail_avg = sigma[-252:].mean()
    assert abs(tail_avg - true_daily) / true_daily < 0.10, (
        f'EWMA avg {tail_avg:.5f} too far from true {true_daily:.5f}'
    )
    print(f'  EWMA recovery: true={true_daily:.4f}  ewma_tail={tail_avg:.4f}  ✓')


def test_forecast_output_shape():
    """compute_forecast returns all 5 expected keys with positive values."""
    df = make_synthetic_ohlc(n=600, annual_vol=0.20)
    f = compute_forecast(df)
    for key in ('vol_annual', 'hl_median', 'hl_75', 'oc_median', 'oc_75'):
        assert key in f, f'Missing key: {key}'
        assert f[key] > 0, f'{key} is not positive: {f[key]}'
        assert math.isfinite(f[key]), f'{key} is not finite: {f[key]}'
    print(f'  Output keys & positivity check  ✓')


def test_forecast_ordering():
    """75th percentile > median for both H-L and O-C."""
    df = make_synthetic_ohlc(n=600)
    f  = compute_forecast(df)
    assert f['hl_75'] > f['hl_median'], 'hl_75 should exceed hl_median'
    assert f['oc_75'] > f['oc_median'], 'oc_75 should exceed oc_median'
    print(f'  Ordering (75th > median)  ✓')


def test_forecast_magnitudes():
    """
    For 20% annual vol (Gold-like) the H-L range median should be roughly
    1.5–2.5× the daily vol, and O-C median 0.5–1.0× daily vol.
    Wider bounds since our synthetic H-L is noisy.
    """
    df  = make_synthetic_ohlc(n=800, annual_vol=0.20)
    f   = compute_forecast(df)
    daily_vol_pct = f['vol_annual'] / math.sqrt(252)

    hl_ratio = f['hl_median'] / daily_vol_pct
    oc_ratio = f['oc_median'] / daily_vol_pct

    assert 1.0 < hl_ratio < 4.0, f'H-L ratio {hl_ratio:.2f} out of [1.0, 4.0]'
    assert 0.3 < oc_ratio < 1.5, f'O-C ratio {oc_ratio:.2f} out of [0.3, 1.5]'
    print(f'  Magnitude check: H-L ratio={hl_ratio:.2f}  O-C ratio={oc_ratio:.2f}  ✓')


def test_format_report_contains_fields():
    """format_report output contains all expected labels."""
    results = [
        {'name': 'GOLD', 'vol_annual': 26.64, 'hl_median': 2.73,
         'hl_75': 3.24, 'oc_median': 1.31, 'oc_75': 2.13},
    ]
    report = format_report('THURSDAY, MAY 28, 2026', results)
    for phrase in ('VOL & RANGE FORECAST', 'THURSDAY, MAY 28, 2026',
                   'Volatility (annualized)', 'High to Low range',
                   'Open to Close move', '26.64%', '2.73%', '3.24%',
                   '1.31%', '2.13%', '75th Percentile', 'GOLD'):
        assert phrase in report, f'Missing in output: {phrase!r}'
    print(f'  Format report fields  ✓')


def test_divider_width():
    """_divider lines should all be the same length."""
    for name in ('GOLD', 'EURUSD', 'NQ', 'SPX500', 'GBPUSD'):
        d = _divider(name)
        assert len(d) == 32, f'_divider({name!r}) has len {len(d)}, expected 32'
    print(f'  Divider width consistency  ✓')


def smoke_test_full_run():
    """
    End-to-end smoke test using synthetic OHLC injected via monkey-patching.
    Demonstrates the full pipeline without a network connection.
    """
    import vol_range_forecast as m

    # Monkey-patch fetch_ohlc to return synthetic data
    orig = m.fetch_ohlc
    def fake_fetch(ticker: str) -> pd.DataFrame:
        vol_map = {'GC=F': 0.22, 'EURUSD=X': 0.05, 'NQ=F': 0.18}
        v = vol_map.get(ticker, 0.15)
        return make_synthetic_ohlc(n=700, annual_vol=v)
    m.fetch_ohlc = fake_fetch

    try:
        target = datetime(2026, 5, 29, tzinfo=timezone.utc)
        report = m.run_forecast(target)
        print('\n' + '─' * 50)
        print(report)
        print('─' * 50)
        assert 'FRIDAY, MAY 29, 2026' in report
        assert 'GOLD' in report and 'EURUSD' in report and 'NQ' in report
        print('  Full smoke test  ✓')
    finally:
        m.fetch_ohlc = orig


if __name__ == '__main__':
    tests = [
        test_ewma_vol_recovers_input_vol,
        test_forecast_output_shape,
        test_forecast_ordering,
        test_forecast_magnitudes,
        test_format_report_contains_fields,
        test_divider_width,
        smoke_test_full_run,
    ]
    passed = 0
    for t in tests:
        name = t.__name__
        try:
            print(f'\n[{name}]')
            t()
            passed += 1
        except AssertionError as e:
            print(f'  FAIL: {e}')
        except Exception as e:
            print(f'  ERROR: {e}')

    print(f'\n{passed}/{len(tests)} tests passed.')
    sys.exit(0 if passed == len(tests) else 1)
