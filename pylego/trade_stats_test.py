"""Synthetic, offline tests for trade_stats -- no network, no files."""
import numpy as np

from trade_stats import summarize_r


def test_empty_series():
    s = summarize_r([])
    assert s["n"] == 0
    assert np.isnan(s["win_rate"])
    assert np.isnan(s["profit_factor"])


def test_all_wins_pf_is_infinite():
    s = summarize_r([1.0, 2.0, 0.5])
    assert s["n"] == 3
    assert s["win_rate"] == 1.0
    assert s["profit_factor"] == float("inf")
    assert abs(s["total_r"] - 3.5) < 1e-9


def test_mixed_known_values():
    # wins: 2 + 1 = 3 gross; losses: 1 + 1 = 2 gross -> PF = 1.5
    s = summarize_r([2.0, 1.0, -1.0, -1.0])
    assert s["n"] == 4
    assert s["win_rate"] == 0.5
    assert abs(s["profit_factor"] - 1.5) < 1e-9
    assert abs(s["avg_r"] - 0.25) < 1e-9
    assert abs(s["total_r"] - 1.0) < 1e-9


def test_all_losses_pf_zero():
    s = summarize_r([-1.0, -2.0])
    assert s["win_rate"] == 0.0
    assert s["profit_factor"] == 0.0


def test_accepts_generic_iterable():
    s = summarize_r(x for x in [1.0, -1.0])
    assert s["n"] == 2


if __name__ == '__main__':
    import sys
    fns = [v for k, v in list(globals().items()) if k.startswith('test_')]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f'ok   {fn.__name__}')
        except Exception as e:
            failed += 1
            print(f'FAIL {fn.__name__}: {type(e).__name__}: {e}')
    print(f'\n{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
