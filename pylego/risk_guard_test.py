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


def test_force_unlock_preserves_dd_baseline():
    # Unlock clears the lockout flag but must NOT reset day_start: resetting it
    # to the drawn-down balance would let the daily limit ratchet down (a fresh
    # −ddlimit% from each new, lower start). Still breached ⇒ re-locks.
    g = _guard(ddlimit=3.0, monthlydd=99.0)
    g.update_balance(10_000)
    g.block_reason(9_600, "EUR/USD")          # trip the lockout at −4%
    g.force_unlock()
    assert g._day_start == 10_000, "baseline must survive force_unlock"
    why = g.block_reason(9_600, "EUR/USD")    # still −4% vs the ORIGINAL start
    assert why and "Daily DD" in why, why


def test_log_block_transition_once_per_state_change():
    import logging
    from pylego.risk_guard import log_block_transition
    msgs = []
    h = logging.Handler(); h.emit = lambda r: msgs.append(r.getMessage())
    lg = logging.getLogger("rg_transition_test"); lg.addHandler(h); lg.setLevel(logging.INFO)
    st = {}
    log_block_transition(lg, st, "eurusd", None)       # never blocked → silent
    assert msgs == []
    log_block_transition(lg, st, "eurusd", "Daily DD")
    log_block_transition(lg, st, "eurusd", "Daily DD")  # same reason → no repeat
    assert len(msgs) == 1 and "blocked" in msgs[0]
    log_block_transition(lg, st, "eurusd", None)        # cleared → one info line
    assert len(msgs) == 2 and "resumed" in msgs[1]


def test_log_block_transition_ignores_the_live_countdown():
    # Found 2026-09-01: a single 60s cooldown was producing ~9 near-identical
    # decision-log lines because block_reason()'s own message bakes a live
    # countdown into the string ("0.9m remaining" -> "0.8m remaining" -> ...),
    # so the naive `reason == prev` check in log_block_transition never saw
    # two calls with the exact same text. Must dedupe on the KIND of block,
    # not the exact string.
    import logging
    from pylego.risk_guard import log_block_transition
    msgs = []
    h = logging.Handler(); h.emit = lambda r: msgs.append(r.getMessage())
    lg = logging.getLogger("rg_countdown_test"); lg.addHandler(h); lg.setLevel(logging.INFO)
    st = {}
    log_block_transition(lg, st, "eurusd", "[eurusd] Cooldown — 0.9m remaining")
    log_block_transition(lg, st, "eurusd", "[eurusd] Cooldown — 0.8m remaining")
    log_block_transition(lg, st, "eurusd", "[eurusd] Cooldown — 0.1m remaining")
    assert len(msgs) == 1, f"countdown ticking should not re-trigger the block log, got {msgs}"
    log_block_transition(lg, st, "eurusd", None)  # cleared -> one info line
    assert len(msgs) == 2 and "resumed" in msgs[1]
    # A genuinely different kind of block (not just a countdown tick) must
    # still log — e.g. cooldown clearing straight into a daily-DD lockout.
    log_block_transition(lg, st, "eurusd", "Daily DD 3.2% >= 3.0% -- locked 3h")
    assert len(msgs) == 3 and "blocked" in msgs[2]


def test_sync_cfg_reads_values():
    g = RiskGuard()
    g.sync_cfg({"ddlimit": 2.5, "monthlydd": 4.0, "lockout": 6, "cooldown": 120})
    assert g.dd_limit_pct == 2.5
    assert g.monthly_dd_pct == 4.0
    assert g.lockout_secs == 6 * 3600
    assert g.cooldown_secs == 120


def test_snapshot_reflects_current_state_without_mutating_it():
    g = _guard(ddlimit=3.0)
    g.update_balance(10_000)
    s0 = g.snapshot(10_000)
    assert s0["locked"] is False and s0["day_dd_pct"] == 0.0
    # A snapshot call must never itself trigger a lockout, unlike block_reason.
    s1 = g.snapshot(9_600)  # 4% down -- would breach ddlimit=3.0 via block_reason
    assert s1["locked"] is False, "snapshot must not mutate/lock state on its own"
    assert s1["day_dd_pct"] == 4.0
    assert g.block_reason(9_600, "") is not None, "the guard itself is still unlocked until block_reason is actually called"
    # NOW it's really locked (block_reason just triggered it) -- snapshot should reflect that.
    s2 = g.snapshot(9_600)
    assert s2["locked"] is True and s2["locked_mins_remaining"] > 0


def test_snapshot_handles_no_balance_yet():
    g = RiskGuard()
    s = g.snapshot(None)
    assert s["day_dd_pct"] is None and s["month_dd_pct"] is None and s["locked"] is False


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
