"""Offline tests for the Volatility Bot decision engine (no MT5, no network)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from volatility_bot.engine import SessionTracker, decide  # noqa: E402

PP = {"open": 1.10, "sigma": 0.006, "hl50": 0.0094, "hl75": 0.0123, "ocMed": 0.0040, "oc75": 0.0069}


def _spike_tracker():
    tr = SessionTracker(1.10)                       # init close 1.10
    for c in [1.10] * 14 + [1.107]:                 # 15 more → 16 closes, move 0.007 over velWin
        tr.on_minute(c)
    return tr


def test_tracker_tracks_extremes():
    tr = SessionTracker(1.10)
    tr.on_price(1.105); tr.on_price(1.095)
    assert tr.run_high == 1.105 and tr.run_low == 1.095


def test_decide_fires_fade_on_spike_touch():
    tr = _spike_tracker()
    policy = {"HL50_up|3·spike": {"decision": "fade"}}
    specs = decide(PP, policy, tr, 1.111)           # px above HL50_up (1.10·1.0094≈1.1103)
    assert len(specs) == 1, specs
    s = specs[0]
    assert s["line"] == "HL50_up" and s["decision"] == "fade" and s["side"] == "sell"
    assert s["bucket"] == "3·spike"
    assert s["tp"] < s["entry"] < s["sl"]           # fade an up-line: TP toward open, SL away


def test_decide_dedups_per_session():
    tr = _spike_tracker()
    policy = {"HL50_up|3·spike": {"decision": "fade"}}
    assert len(decide(PP, policy, tr, 1.111)) == 1
    assert decide(PP, policy, tr, 1.111) == []      # already acted this session


def test_decide_skips_when_no_policy_cell():
    tr = _spike_tracker()
    specs = decide(PP, {}, tr, 1.111)               # touched but no tradeable cell
    assert specs == []


def test_decide_needs_velocity_window():
    tr = SessionTracker(1.10)                       # only the init close → bucket None
    specs = decide(PP, {"HL50_up|3·spike": {"decision": "fade"}}, tr, 1.111)
    assert specs == []


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
