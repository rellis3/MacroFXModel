"""Synthetic, offline tests for portfolio_sim -- no network, no files.

Run: python pylego/portfolio_sim_test.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.portfolio_sim import (  # noqa: E402
    matched_utilization_benchmark,
    monte_carlo_bootstrap,
    pairwise_correlation_summary,
    sharpe_and_dd,
    simulate_portfolio,
    time_weighted_avg,
)


def test_equity_sequencing_hand_verified():
    # eq=1.0 -> trade1 risk=0.1, r=+2.0 -> eq += 0.1*2.0 = 1.2
    # -> trade2 risk=0.1*1.2=0.12, r=-1.0 -> eq -= 0.12 -> eq=1.08
    trades = [
        {"pair": "a", "entry_date": pd.Timestamp("2020-01-01"), "exit_date": pd.Timestamp("2020-01-02"), "r": 2.0},
        {"pair": "a", "entry_date": pd.Timestamp("2020-01-03"), "exit_date": pd.Timestamp("2020-01-04"), "r": -1.0},
    ]
    result = simulate_portfolio(trades, risk_pct=0.1, max_concurrent_risk_pct=1.0)
    assert result["taken"] == 2 and result["skipped"] == 0
    assert abs(result["final_equity"] - 1.08) < 1e-9


def test_size_mult_scales_risk_and_defaults_to_one():
    # Two identical trades, one with size_mult=0.5 -- its equity impact
    # should be exactly half the unscaled trade's.
    trades = [
        {"pair": "a", "entry_date": pd.Timestamp("2020-01-01"), "exit_date": pd.Timestamp("2020-01-02"), "r": 2.0},
        {"pair": "b", "entry_date": pd.Timestamp("2020-02-01"), "exit_date": pd.Timestamp("2020-02-02"),
         "r": 2.0, "size_mult": 0.5},
    ]
    r1 = simulate_portfolio([trades[0]], risk_pct=0.1, max_concurrent_risk_pct=1.0)
    r2 = simulate_portfolio([trades[1]], risk_pct=0.1, max_concurrent_risk_pct=1.0)
    gain1 = r1["final_equity"] - 1.0  # 0.1 * 2.0 = 0.2
    gain2 = r2["final_equity"] - 1.0  # 0.5 * 0.1 * 2.0 = 0.1
    assert abs(gain1 - 0.2) < 1e-9
    assert abs(gain2 - 0.1) < 1e-9
    assert abs(gain2 - gain1 / 2) < 1e-9


def test_concurrent_risk_cap_refuses_second_entry():
    # Two overlapping trades, each risking 10%; cap at 15% can't fit both.
    trades = [
        {"pair": "a", "entry_date": pd.Timestamp("2020-01-01"), "exit_date": pd.Timestamp("2020-01-05"), "r": 1.0},
        {"pair": "b", "entry_date": pd.Timestamp("2020-01-02"), "exit_date": pd.Timestamp("2020-01-03"), "r": 1.0},
    ]
    result = simulate_portfolio(trades, risk_pct=0.1, max_concurrent_risk_pct=0.15)
    assert result["taken"] == 1 and result["skipped"] == 1


def test_concurrent_risk_cap_allows_both_when_non_overlapping():
    trades = [
        {"pair": "a", "entry_date": pd.Timestamp("2020-01-01"), "exit_date": pd.Timestamp("2020-01-02"), "r": 1.0},
        {"pair": "b", "entry_date": pd.Timestamp("2020-01-03"), "exit_date": pd.Timestamp("2020-01-04"), "r": 1.0},
    ]
    result = simulate_portfolio(trades, risk_pct=0.1, max_concurrent_risk_pct=0.15)
    assert result["taken"] == 2 and result["skipped"] == 0


def test_time_weighted_avg_hand_verified():
    # value=1.0 for 2 days, then value=0.0 for 1 day -> weighted avg = 2/3
    samples = [
        (pd.Timestamp("2020-01-01"), 1.0),
        (pd.Timestamp("2020-01-03"), 0.0),
        (pd.Timestamp("2020-01-04"), 0.0),
    ]
    avg = time_weighted_avg(samples)
    assert abs(avg - (2 / 3)) < 1e-9


def test_sharpe_and_dd_flat_growth_near_zero_drawdown():
    dates = pd.date_range("2020-01-01", periods=100, freq="D")
    curve = [(d, 1.0 + 0.001 * i) for i, d in enumerate(dates)]  # monotonic growth
    stats = sharpe_and_dd(curve)
    assert stats["max_dd"] > -0.01  # essentially no drawdown
    assert stats["total_return"] > 0
    assert stats["sharpe"] > 0


def test_sharpe_and_dd_detects_real_drawdown():
    dates = pd.date_range("2020-01-01", periods=10, freq="D")
    values = [1.0, 1.1, 1.2, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6]  # 50% drop from peak 1.2
    curve = list(zip(dates, values))
    stats = sharpe_and_dd(curve)
    assert stats["max_dd"] < -0.45  # roughly (0.6-1.2)/1.2 = -0.5


def test_sharpe_and_dd_cagr_matches_hand_calc():
    # Exactly 2.0x over exactly 2 years -> CAGR = sqrt(2) - 1 ~= 0.41421356
    dates = pd.date_range("2020-01-01", periods=int(365.25 * 2) + 1, freq="D")
    n = len(dates)
    curve = [(d, 1.0 * (2.0 ** (i / (n - 1)))) for i, d in enumerate(dates)]  # smooth exponential 1 -> 2
    stats = sharpe_and_dd(curve)
    assert abs(stats["cagr"] - (2.0 ** 0.5 - 1.0)) < 0.01


def test_sharpe_and_dd_max_dd_days_counts_the_underwater_stretch():
    # Peak on day 3 (value 1.2), doesn't recover above 1.2 until day 9 -> 6 days underwater.
    dates = pd.date_range("2020-01-01", periods=10, freq="D")
    values = [1.0, 1.1, 1.2, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.25]
    stats = sharpe_and_dd(list(zip(dates, values)))
    assert stats["max_dd_days"] == 6


def test_sharpe_and_dd_sortino_ignores_upside_volatility():
    # Same downside days, but one curve also has big UP days (higher total
    # vol, same downside vol) -- Sharpe should drop, Sortino should not.
    dates = pd.date_range("2020-01-01", periods=20, freq="D")
    calm_up = [1.0]
    wild_up = [1.0]
    for i in range(1, 20):
        step_down = -0.01 if i % 4 == 0 else 0.0
        calm_up.append(calm_up[-1] * (1 + 0.005 + step_down))
        wild_up.append(wild_up[-1] * (1 + (0.03 if i % 3 == 0 else 0.001) + step_down))
    calm = sharpe_and_dd(list(zip(dates, calm_up)))
    wild = sharpe_and_dd(list(zip(dates, wild_up)))
    assert wild["sharpe"] < calm["sharpe"]
    assert wild["sortino"] > wild["sharpe"]  # upside vol hurts Sharpe, not Sortino


def test_sharpe_and_dd_calmar_is_cagr_over_abs_max_dd():
    dates = pd.date_range("2020-01-01", periods=10, freq="D")
    values = [1.0, 1.1, 1.2, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]
    stats = sharpe_and_dd(list(zip(dates, values)))
    assert abs(stats["calmar"] - stats["cagr"] / abs(stats["max_dd"])) < 1e-9


def test_monte_carlo_bootstrap_reproducible_with_fixed_seed():
    trades = [{"r": r} for r in [1.5, -1.0, 0.5, 2.0, -1.0, 0.8, -0.5, 1.2, -1.0, 0.6]]
    m1 = monte_carlo_bootstrap(trades, risk_pct=0.02, n_sims=500, seed=42)
    m2 = monte_carlo_bootstrap(trades, risk_pct=0.02, n_sims=500, seed=42)
    assert m1 == m2  # same seed, same trades -> byte-identical bands, not a fresh draw each call


def test_monte_carlo_bootstrap_all_losers_means_certain_loss():
    trades = [{"r": -1.0} for _ in range(20)]
    m = monte_carlo_bootstrap(trades, risk_pct=0.05, n_sims=200, seed=1)
    assert m["prob_net_loss"] == 1.0
    assert m["final_return_p95"] < 0


def test_monte_carlo_bootstrap_empty_trades_reports_zero():
    m = monte_carlo_bootstrap([], risk_pct=0.01, n_sims=100)
    assert m["n_trades"] == 0 and m["n_sims"] == 0


def test_matched_utilization_benchmark_scales_risk_linearly():
    # Utilization scales linearly with risk_pct when uncapped -- doubling the
    # target utilization should double the matched risk_pct.
    trades = [
        {"pair": "a", "entry_date": pd.Timestamp("2020-01-01"), "exit_date": pd.Timestamp("2020-06-01"), "r": 1.0},
    ]
    m1 = matched_utilization_benchmark(trades, base_risk_pct=0.01, target_utilization=0.02)
    m2 = matched_utilization_benchmark(trades, base_risk_pct=0.01, target_utilization=0.04)
    assert m1["matched_risk_pct"] is not None and m2["matched_risk_pct"] is not None
    assert abs(m2["matched_risk_pct"] / m1["matched_risk_pct"] - 2.0) < 1e-6


def test_pairwise_correlation_perfectly_correlated_pairs():
    # Two pairs whose weekly R always moves together -> correlation near +1.
    trades = []
    for week_start in ["2020-01-06", "2020-01-13", "2020-01-20", "2020-01-27", "2020-02-03"]:
        d = pd.Timestamp(week_start)
        r = 1.0 if week_start != "2020-01-20" else -1.0
        for pair in ("a", "b"):
            trades.append({"pair": pair, "entry_date": d, "exit_date": d + pd.Timedelta(hours=1), "r": r})
    corr = pairwise_correlation_summary(trades)
    assert corr is not None and corr > 0.9


def test_pairwise_correlation_none_with_single_pair():
    trades = [{"pair": "a", "entry_date": pd.Timestamp("2020-01-01"),
              "exit_date": pd.Timestamp("2020-01-02"), "r": 1.0}]
    assert pairwise_correlation_summary(trades) is None


if __name__ == '__main__':
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
