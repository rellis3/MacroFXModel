"""Offline tests for the shared live pip-value helper (no MT5, no network).

Run:  python3 bot/utils/pip_values_test.py   (from the repo root, or anywhere)
"""
import logging
import sys
from pathlib import Path

_BOT_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BOT_DIR.parent
for p in (str(_BOT_DIR), str(_REPO_ROOT), str(_REPO_ROOT / 'backtestSystem')):
    if p not in sys.path:
        sys.path.insert(0, p)

from utils import pip_values as PVLIVE                       # noqa: E402
from utils.pip_values import pip_value_per_lot               # noqa: E402
from utils.sl_tp_engine import SLTPEngine                    # noqa: E402


class _Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


_cap = _Capture()
logging.getLogger('utils.pip_values').addHandler(_cap)
logging.getLogger('utils.pip_values').setLevel(logging.WARNING)


def test_usd_base_pair_computed_from_quote_not_static():
    # THE Batch-5 bug: USD/JPY static 9.0 vs true ~6.45 at 155 (~40% oversized).
    pv = pip_value_per_lot('USD/JPY', 0.01, price=155.0)
    assert abs(pv - 0.01 / 155.0 * 100_000) < 1e-9, pv        # ≈ 6.4516
    assert abs(pv - 9.0) > 2.0, 'must NOT be the stale static 9.0'


def test_usd_quote_pair_computed_without_price():
    assert pip_value_per_lot('EUR/USD', 0.0001) == 10.0       # rate-independent
    assert pip_value_per_lot('EURUSD', 0.0001, price=1.09) == 10.0
    assert pip_value_per_lot('XAU/USD', 1.0) == 100.0         # 100 oz contract


def test_usd_base_without_price_falls_back_with_warning():
    _cap.messages.clear()
    pv = pip_value_per_lot('USD/CAD', 0.0001)                 # no price, no MT5
    assert pv == 7.5, pv                                      # static table
    assert any('STATIC' in m and 'USD/CAD' in m for m in _cap.messages), _cap.messages
    # warn once per pair, not per call
    _cap.messages.clear()
    pip_value_per_lot('USD/CAD', 0.0001)
    assert _cap.messages == []


def test_cross_pair_falls_back_with_warning():
    _cap.messages.clear()
    pv = pip_value_per_lot('EUR/GBP', 0.0001, price=0.85)     # cross: own quote not enough
    assert pv == 12.5, pv
    assert any('STATIC' in m for m in _cap.messages), _cap.messages


def test_symbol_normalisation():
    assert PVLIVE._normalize('EURUSD') == 'EUR/USD'
    assert PVLIVE._normalize('EUR_USD') == 'EUR/USD'
    assert PVLIVE._normalize('XAUUSD') == 'XAU/USD'
    assert PVLIVE._normalize('NAS100_USD') == 'NAS100_USD'    # not a 3/3 pair — untouched
    assert PVLIVE._normalize('US100') == 'US100'
    assert pip_value_per_lot('NAS100_USD', 1.0) == 1.0        # static index value kept
    assert pip_value_per_lot('US100', 1.0) == 1.0


def test_sl_tp_engine_uses_live_quote_for_jpy_sizing():
    eng = SLTPEngine({})
    # 50-pip stop, 1% of 10k = $100 at risk.
    live = eng.position_size(10_000, 1.0, 0.50, 'USD/JPY', price=155.0)
    static = eng.position_size(10_000, 1.0, 0.50, 'USD/JPY')
    assert live == round(100 / (50 * (0.01 / 155.0 * 100_000)), 2), live   # 0.31
    assert static == round(100 / (50 * 9.0), 2), static                   # 0.22 (fallback)
    assert live > static, 'live JPY sizing must differ from the stale static table'


def test_backtestsystem_position_size_uses_shared_helper():
    from risk import position_size as bt_position_size
    # USD/JPY @155, 50-pip stop → same lots as the live helper computes.
    lots = bt_position_size(10_000, 1.0, 0.50, 0.01, 'USD/JPY', price=155.0)
    assert lots == round(100 / (50 * (0.01 / 155.0 * 100_000)), 2), lots
    # Gold: computed 100 $/pip/lot (old rough table said the same — no drift).
    assert bt_position_size(10_000, 1.0, 5.0, 1.0, 'XAU/USD') == 0.2


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for t in tests:
        t(); print(f'  ok  {t.__name__}')
    print(f'\n{len(tests)} tests passed.')
