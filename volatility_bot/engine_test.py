"""Offline tests for the Volatility Bot decision engine (no MT5, no network)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from volatility_bot.engine import SessionTracker, decide, session_open_epoch  # noqa: E402

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


def test_catch_up_rebuilds_extremes_and_velocity():
    tr = SessionTracker(1.10)
    # 16 session bars: a dip to 1.095 and a push to 1.107, ending near 1.107.
    bars = [{"high": 1.10, "low": 1.10, "close": 1.10} for _ in range(14)]
    bars += [{"high": 1.10, "low": 1.095, "close": 1.10}, {"high": 1.107, "low": 1.10, "close": 1.107}]
    tr.catch_up(bars)
    assert tr.run_low == 1.095 and tr.run_high == 1.107          # extremes from the whole session
    val, bucket = decide.__globals__["approach_velocity"](list(tr.closes), len(tr.closes) - 1, 1.10, 0.006)
    assert bucket is not None                                    # velocity buffer is primed (no 15-min wait)


def test_catch_up_reanchors_open_to_live_session_open():
    # The plan's open is STALE (refreshed mid-session) — e.g. gold ctor 4075 while
    # the live 22:00 session actually opened at 4015. catch_up must re-anchor on the
    # first session bar's open so the OC/Close lines hang off the true session open.
    tr = SessionTracker(4075.86)                                  # stale plan/D1 open
    bars = [{"open": 4015.0, "high": 4020.0, "low": 4010.0, "close": 4018.0},
            {"open": 4018.0, "high": 4060.0, "low": 4016.0, "close": 4058.0}]
    tr.catch_up(bars)
    assert tr.open == 4015.0                                      # re-anchored to live open, not 4075
    assert tr.run_low == 4010.0 and tr.run_high == 4060.0         # extremes from the real session
    # OC line now hangs off 4015, not the stale 4075.
    levels = decide.__globals__["line_levels"](tr.open, tr.run_low, tr.run_high,
                                               {"hl50": 0.025, "hl75": 0.03, "ocMed": 0.012, "oc75": 0.02})
    assert abs(levels["OC50_dn"] - 4015.0 * (1 - 0.012)) < 1e-6


def test_catch_up_falls_back_to_plan_open_without_bar_opens():
    # Older bars without an `open` field (or no bars) leave the ctor open intact.
    tr = SessionTracker(1.10)
    tr.catch_up([{"high": 1.105, "low": 1.095, "close": 1.10}])   # no 'open' key
    assert tr.open == 1.10


def test_catch_up_then_dry_run_prevents_retro_trade():
    # A line already crossed during the session must NOT fire after sync.
    tr = SessionTracker(1.10)
    tr.catch_up([{"high": 1.10, "low": 1.10, "close": 1.10}] * 14
                + [{"high": 1.10, "low": 1.10, "close": 1.107}])  # spike velocity, no HL touch yet
    policy = {"HL50_up|3·spike": {"decision": "fade"}}
    # Prime at a price already beyond HL50_up (1.10·1.0094≈1.1103) → marks it acted, no trade.
    primed = decide(PP, policy, tr, 1.112, dry_run=True)
    assert primed == [] and "HL50_up" in tr.acted
    # A subsequent live touch of the SAME line does nothing (already acted).
    assert decide(PP, policy, tr, 1.112) == []


def test_session_open_epoch_anchors_at_london_midnight():
    from datetime import datetime, timezone
    # SUMMER (BST, UTC+1): midnight London = 23:00 UTC the previous calendar day.
    # 2026-06-30 12:00 UTC is 13:00 London → most-recent London midnight is
    # 2026-06-30 00:00 London = 2026-06-29 23:00 UTC.
    t = datetime(2026, 6, 30, 12, 0, tzinfo=timezone.utc).timestamp()
    a = datetime.fromtimestamp(session_open_epoch(t), tz=timezone.utc)
    assert (a.day, a.hour) == (29, 23), a
    # Just BEFORE London midnight: 2026-06-29 22:30 UTC = 23:30 London → the
    # most-recent London midnight is 2026-06-29 00:00 London = 2026-06-28 23:00 UTC.
    t2 = datetime(2026, 6, 29, 22, 30, tzinfo=timezone.utc).timestamp()
    a2 = datetime.fromtimestamp(session_open_epoch(t2), tz=timezone.utc)
    assert (a2.day, a2.hour) == (28, 23), a2
    # WINTER (GMT, UTC+0): midnight London = 00:00 UTC the same day.
    t3 = datetime(2026, 1, 15, 9, 0, tzinfo=timezone.utc).timestamp()
    a3 = datetime.fromtimestamp(session_open_epoch(t3), tz=timezone.utc)
    assert (a3.day, a3.hour) == (15, 0), a3


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
