"""Offline tests for the sizing brick.

Run:  python pylego/sizing_test.py   (or pytest)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.sizing import position_size  # noqa: E402
from pylego import instruments as I       # noqa: E402
from pylego import point_values as PV      # noqa: E402


def test_basic_risk_math():
    # balance 10k, risk 1% = $100; SL 20 pips on EUR/USD (pip 0.0001, pv 10):
    # raw = 100 / (20 * 10) = 0.5 lots.
    lots = position_size(10_000, 1.0, 0.0020, pip=0.0001, pip_value=10.0, max_lot=5.0)
    assert lots == 0.5, lots


def test_decay_discount():
    base = position_size(10_000, 1.0, 0.0020, pip=0.0001, pip_value=10.0, max_lot=5.0)
    half = position_size(10_000, 1.0, 0.0020, pip=0.0001, pip_value=10.0, max_lot=5.0, decay_score=0.5)
    assert abs(half - base * 0.5) < 1e-9, (base, half)


def test_max_lot_clamp():
    lots = position_size(1_000_000, 5.0, 0.0005, pip=0.0001, pip_value=10.0, max_lot=2.0)
    assert lots == 2.0, lots


def test_min_floor():
    lots = position_size(100, 0.1, 0.0050, pip=0.0001, pip_value=10.0, max_lot=5.0)
    assert lots == 0.01, lots


def test_nonpositive_guards():
    assert position_size(10_000, 1.0, 0.0, pip=0.0001, pip_value=10.0, max_lot=5.0) == 0.01
    assert position_size(10_000, 1.0, 0.0020, pip=0.0001, pip_value=0.0, max_lot=5.0) == 0.01


def test_golden_reproduces_old_regime_bot():
    # Reproduce bot/regime_bot.py's former inline formula exactly, sourcing pip
    # and pip_value from the shared bricks — proves the wiring is behavior-preserving.
    def old(balance, risk_pct, sl_dist, pip, pv, max_lot, decay):
        sl_pips = sl_dist / pip
        risk_amt = balance * (risk_pct / 100)
        if sl_pips <= 0 or pv <= 0:
            return 0.01
        raw = risk_amt / (sl_pips * pv)
        lots = raw * (1.0 - decay)
        return float(max(0.01, min(round(lots, 2), float(max_lot))))

    cases = [
        ("EUR/USD", 10_000, 1.0, 0.0025, 1.0, 0.0),
        ("USD/JPY", 25_000, 0.5, 0.150, 2.0, 0.2),
        ("XAU/USD", 50_000, 2.0, 5.0, 1.0, 0.0),
        ("GBP/JPY", 8_000, 1.5, 0.220, 3.0, 0.4),
    ]
    for pair, bal, rp, sl, ml, dc in cases:
        pip = I.pip_size(pair)
        pv = PV.point_value(pair)
        got = position_size(bal, rp, sl, pip=pip, pip_value=pv, max_lot=ml, decay_score=dc)
        want = old(bal, rp, sl, pip, pv, ml, dc)
        assert got == want, (pair, got, want)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
