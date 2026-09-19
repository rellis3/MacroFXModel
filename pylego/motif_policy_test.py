"""Offline tests for the motif_policy brick.

Run:  python pylego/motif_policy_test.py   (or pytest)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.motif_policy import passes_best_config  # noqa: E402


def test_tight_pair_with_range_regime_passes():
    assert passes_best_config("eurusd", "range") is True


def test_with_trend_regime_no_longer_gates():
    # 2026-09-19: the regime gate was retired (its selection carried pivot
    # lookahead); a with-trend 2-touch on a tight pair now trades.
    assert passes_best_config("eurusd", "with", n_touches=2) is True


def test_three_touch_motif_is_skipped_regardless_of_regime_or_spread():
    assert passes_best_config("eurusd", "range", n_touches=3) is False
    assert passes_best_config("eurusd", "against", spread_pips=0.5, n_touches=3) is False


def test_two_touch_motif_passes():
    assert passes_best_config("eurusd", "range", n_touches=2) is True


def test_missing_n_touches_fails_open():
    # A caller that could not read the touch count must not silently drop
    # the trade -- same convention as a missing regime read.
    assert passes_best_config("eurusd", "range") is True


def test_wide_static_spread_pair_fails():
    assert passes_best_config("gbpnzd", "range") is False   # 4.2p static estimate > 2.0p cap


def test_unknown_pair_with_no_static_estimate_passes_on_spread():
    assert passes_best_config("not_a_real_pair", "range") is True


def test_spread_pips_override_can_fail_a_normally_passing_pair():
    assert passes_best_config("eurusd", "range", spread_pips=2.5) is False


def test_spread_pips_override_can_pass_a_normally_failing_pair():
    # gbpcad's static estimate (2.9p) fails the cap; a tighter live reading
    # (e.g. this account's real spread) should be allowed to pass instead.
    assert passes_best_config("gbpcad", "range", spread_pips=1.8) is True


def test_spread_pips_override_does_not_bypass_the_touch_filter():
    assert passes_best_config("gbpcad", "range", spread_pips=0.1, n_touches=3) is False


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
