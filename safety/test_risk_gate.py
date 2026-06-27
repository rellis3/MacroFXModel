"""
Tests for the safety layer. Pure stdlib — no pytest, no MT5, no network.

Run either way:
    python -m safety.test_risk_gate     # plain runner, prints PASS/FAIL
    pytest safety/test_risk_gate.py     # also works (functions are test_*)

Every test uses a temp dir for state and a fake clock, so nothing touches real
state files or wall-clock time.
"""

from __future__ import annotations

import tempfile
import os

from .kill_switch import KillSwitch, FileBackend
from .risk_gate import (
    RiskGate, RiskLimits, OrderIntent, Position, AccountSnapshot,
    unexpected_positions,
)


# ── helpers ─────────────────────────────────────────────────────────────────────

class FakeClock:
    def __init__(self, t=1_700_000_000.0):
        self.t = t

    def __call__(self):
        return self.t

    def tick(self, dt):
        self.t += dt


def _gate(tmp, limits=None, clock=None):
    """Build a gate + kill switch rooted in a temp dir, with a fake clock."""
    clock = clock or FakeClock()
    ks = KillSwitch(FileBackend(os.path.join(tmp, "kill.json")), clock=clock)
    gate = RiskGate(limits or RiskLimits(), ks,
                    state_path=os.path.join(tmp, "gate.json"), clock=clock)
    return gate, ks, clock


def _acct(equity, positions=None):
    return AccountSnapshot(equity=equity, balance=equity, positions=positions or [])


def _intent(**kw):
    base = dict(magic=1, symbol="EURUSD", side="BUY", volume=0.1, bar_time="t0")
    base.update(kw)
    return OrderIntent(**base)


# ── tests ─────────────────────────────────────────────────────────────────────

def test_happy_path_allows():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp)
        d = gate.check(_intent(), _acct(10_000))
        assert d.allowed and d.code == "OK", d


def test_kill_switch_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        gate, ks, _ = _gate(tmp)
        ks.activate(reason="test", by="unit")
        d = gate.check(_intent(), _acct(10_000))
        assert not d.allowed and d.code == "KILL", d


def test_kill_switch_deactivate_restores():
    with tempfile.TemporaryDirectory() as tmp:
        gate, ks, _ = _gate(tmp)
        ks.activate(by="unit")
        ks.deactivate(by="unit")
        d = gate.check(_intent(), _acct(10_000))
        assert d.allowed, d


def test_kill_switch_fail_closed_on_unreadable():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "kill.json")
        with open(path, "w") as fh:
            fh.write("{ not json")          # corrupt -> read() returns None
        ks = KillSwitch(FileBackend(path))
        assert ks.is_active() is True       # fail-closed


def test_kill_switch_durable_across_instances():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "kill.json")
        KillSwitch(FileBackend(path)).activate(by="unit")
        # A brand-new instance (simulating a process restart) still sees it.
        assert KillSwitch(FileBackend(path)).is_active() is True


def test_daily_loss_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(daily_loss_pct=4.0))
        gate.check(_intent(), _acct(10_000))            # seeds day baseline @10k
        d = gate.check(_intent(bar_time="t1"), _acct(9_500))   # -5% > 4% limit
        assert not d.allowed and d.code == "DAILY_LOSS", d


def test_daily_loss_within_limit_allows():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(daily_loss_pct=4.0))
        gate.check(_intent(), _acct(10_000))
        d = gate.check(_intent(bar_time="t1"), _acct(9_700))   # -3% < 4%
        assert d.allowed, d


def test_max_dd_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(max_dd_pct=8.0, daily_loss_pct=99.0))
        gate.check(_intent(), _acct(10_000))            # peak 10k
        gate.check(_intent(bar_time="t1"), _acct(11_000))  # peak 11k
        d = gate.check(_intent(bar_time="t2"), _acct(10_000))  # -9.1% from peak
        assert not d.allowed and d.code == "MAX_DD", d


def test_duplicate_blocked_then_allowed_after_ttl():
    with tempfile.TemporaryDirectory() as tmp:
        clock = FakeClock()
        gate, _, _ = _gate(tmp, RiskLimits(idempotency_ttl_s=300), clock=clock)
        d1 = gate.check(_intent(), _acct(10_000))
        d2 = gate.check(_intent(), _acct(10_000))       # same cid, within TTL
        assert d1.allowed and not d2.allowed and d2.code == "DUPLICATE", (d1, d2)
        clock.tick(301)                                  # TTL expires
        d3 = gate.check(_intent(), _acct(10_000))
        assert d3.allowed, d3


def test_stale_data_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(max_data_age_s=120))
        d = gate.check(_intent(), _acct(10_000), data_age_s=200)
        assert not d.allowed and d.code == "STALE", d


def test_total_exposure_cap():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(max_total_notional=100_000))
        existing = [Position(magic=1, symbol="GBPUSD", side="BUY",
                             volume=1.0, notional=90_000)]
        d = gate.check(_intent(notional=20_000), _acct(10_000, existing))
        assert not d.allowed and d.code == "EXPOSURE", d


def test_total_exposure_cap_fails_closed_without_notional():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(max_total_notional=100_000))
        d = gate.check(_intent(notional=0), _acct(10_000))   # cap set, notional unknown
        assert not d.allowed and d.code == "EXPOSURE", d


def test_bucket_cap():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp, RiskLimits(max_bucket_notional={"risk_on": 50_000}))
        existing = [Position(magic=1, symbol="AUDUSD", side="BUY",
                             volume=1.0, notional=40_000, risk_bucket="risk_on")]
        d = gate.check(_intent(notional=20_000, risk_bucket="risk_on"),
                       _acct(10_000, existing))
        assert not d.allowed and d.code == "BUCKET", d


def test_unexpected_positions_reconciliation():
    acct = _acct(10_000, [
        Position(magic=20260001, symbol="EURUSD", side="BUY", volume=0.1),
        Position(magic=99999999, symbol="USDJPY", side="SELL", volume=0.1),  # stranger
    ])
    odd = unexpected_positions(acct, known_magics={20260001, 20260004, 20260005})
    assert len(odd) == 1 and odd[0].magic == 99999999, odd


def test_check_never_raises_fail_closed():
    with tempfile.TemporaryDirectory() as tmp:
        gate, _, _ = _gate(tmp)

        class Boom:
            @property
            def equity(self):
                raise RuntimeError("provider exploded")
            balance = 0
            positions = []

        d = gate.check(_intent(), Boom())   # type: ignore[arg-type]
        assert not d.allowed and d.code == "ERROR", d


# ── plain runner (no pytest needed) ─────────────────────────────────────────────

def _main() -> int:
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:  # noqa
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed, {len(tests)} total")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_main())
