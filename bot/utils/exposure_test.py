"""Offline tests for the USD-exposure netting guard (no MT5, no network).

Run:  python3 bot/utils/exposure_test.py
"""
import sys
from pathlib import Path

_BOT_DIR = Path(__file__).resolve().parents[1]
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from utils.exposure import (usd_risk_sign, net_usd_risk_pct,          # noqa: E402
                            usd_exposure_block_reason)


def test_usd_sign_by_base_or_quote():
    assert usd_risk_sign('EUR/USD', 'LONG') == -1     # long EUR/USD = short USD
    assert usd_risk_sign('EUR/USD', 'SHORT') == 1
    assert usd_risk_sign('USD/JPY', 'LONG') == 1      # long USD/JPY = long USD
    assert usd_risk_sign('USD/JPY', 'SHORT') == -1
    assert usd_risk_sign('EURUSD', 'BUY') == -1       # compact form + BUY/SELL
    assert usd_risk_sign('EUR/GBP', 'LONG') == 0      # cross — no USD leg
    assert usd_risk_sign('XAU/USD', 'LONG') == -1     # long gold = short USD


def test_long_eurusd_plus_short_usdjpy_is_additive_short_usd():
    # The review's exact case: these two "opposite-label" positions are the
    # SAME short-USD bet — net −2%, not 0.
    positions = [
        {'pair': 'EUR/USD', 'direction': 'LONG',  'risk_pct': 1.0},
        {'pair': 'USD/JPY', 'direction': 'SHORT', 'risk_pct': 1.0},
    ]
    assert net_usd_risk_pct(positions) == -2.0


def test_block_when_cap_exceeded():
    positions = [
        {'pair': 'EUR/USD', 'direction': 'LONG',  'risk_pct': 1.0},
        {'pair': 'USD/JPY', 'direction': 'SHORT', 'risk_pct': 1.0},
    ]
    why = usd_exposure_block_reason('GBP/USD', 'LONG', 1.0, positions, cap_pct=2.0)
    assert why and 'USD exposure cap' in why, why      # −2 → −3 breaches ±2


def test_reducing_trade_is_never_blocked():
    positions = [
        {'pair': 'EUR/USD', 'direction': 'LONG',  'risk_pct': 2.0},
        {'pair': 'USD/JPY', 'direction': 'SHORT', 'risk_pct': 1.0},
    ]
    # Net −3%; a long-USD entry brings it to −2% — reduces |net|, allowed even
    # though |after| still exceeds the cap.
    assert usd_exposure_block_reason('USD/CHF', 'LONG', 1.0, positions, cap_pct=2.0) is None


def test_cross_pairs_and_disabled_cap_pass():
    positions = [{'pair': 'EUR/USD', 'direction': 'LONG', 'risk_pct': 5.0}]
    assert usd_exposure_block_reason('EUR/GBP', 'LONG', 1.0, positions, cap_pct=2.0) is None
    assert usd_exposure_block_reason('GBP/USD', 'LONG', 1.0, positions, cap_pct=0) is None


def test_default_risk_used_for_untagged_positions():
    positions = [{'pair': 'EUR/USD', 'direction': 'LONG'}]    # no risk_pct recorded
    assert net_usd_risk_pct(positions, default_risk_pct=1.5) == -1.5


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for t in tests:
        t(); print(f'  ok  {t.__name__}')
    print(f'\n{len(tests)} tests passed.')
