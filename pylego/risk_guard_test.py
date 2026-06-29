"""Offline tests for the risk_guard brick.

Run:  python pylego/risk_guard_test.py   (or pytest)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.risk_guard import RiskGuard  # noqa: E402


def _guard(**cfg):
    g = RiskGuard()
    g.sync_cfg({"ddlimit": 3.0, "monthlydd": 5.0, "lockout": 3, "cooldown": 240, **cfg})
    return g


def test_clear_when_flat():
    g = _guard()
    g.update_balance(10_000)
    assert g.block_reason(10_000, "EUR/USD") is None


def test_daily_dd_locks_out():
    g = _guard(ddlimit=3.0)
    g.update_balance(10_000)
    # 4% down breaches the 3% daily limit → lockout string, and stays locked.
    why = g.block_reason(9_600, "EUR/USD")
    assert why and "Daily DD" in why, why
    assert g.block_reason(10_000, "EUR/USD").startswith("Locked out"), "should remain locked"


def test_monthly_dd_locks_out():
    g = _guard(ddlimit=99.0, monthlydd=5.0)  # disable daily so monthly triggers
    g.update_balance(10_000)
    why = g.block_reason(9_400, "EUR/USD")   # 6% < daily 99% but ≥ monthly 5%
    assert why and "Monthly DD" in why, why


def test_cooldown_blocks_same_pair():
    g = _guard(cooldown=240)
    g.update_balance(10_000)
    g.record_trade("EUR/USD")
    assert "Cooldown" in g.block_reason(10_000, "EUR/USD")
    assert g.block_reason(10_000, "GBP/USD") is None  # other pair unaffected


def test_force_unlock_clears():
    g = _guard(ddlimit=3.0)
    g.update_balance(10_000)
    g.block_reason(9_600, "EUR/USD")          # trip the lockout
    g.force_unlock()
    assert g.block_reason(10_000, "EUR/USD") is None


def test_sync_cfg_reads_values():
    g = RiskGuard()
    g.sync_cfg({"ddlimit": 2.5, "monthlydd": 4.0, "lockout": 6, "cooldown": 120})
    assert g.dd_limit_pct == 2.5
    assert g.monthly_dd_pct == 4.0
    assert g.lockout_secs == 6 * 3600
    assert g.cooldown_secs == 120


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
