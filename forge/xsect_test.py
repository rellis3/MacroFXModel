"""Tests for xsect.py, led by the same causality discipline as the rest of
`forge`: a leak in `ext_score` (which is read at the OPEN of a rebalance bar,
before that bar's own move is known) would make every result look better than
it should, the same way the three `levels.py` bugs did.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.xsect import (_rebalance_dates, _weekly_open, add_forward_returns,
                         basket_returns, discover_universe, shuffle_scores)
from forge.bars import frame


def _synthetic_m1(n: int = 60 * 24 * 200, seed: int = 3, drift: float = 0.0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq="1min", tz="UTC")
    step = rng.normal(drift, 0.25, n)
    close = 2000 + np.cumsum(step)
    spread = np.abs(rng.normal(0, 0.15, n)) + 0.02
    return pd.DataFrame({
        "open": close - step, "high": np.maximum(close, close - step) + spread,
        "low": np.minimum(close, close - step) - spread, "close": close,
        "volume": rng.integers(1, 500, n).astype(float),
    }, index=idx)


def _mini_panel(pairs_and_seeds) -> pd.DataFrame:
    rows = []
    for pair, seed, drift in pairs_and_seeds:
        m1 = _synthetic_m1(seed=seed, drift=drift)
        bars = frame(m1, "d1")
        wopen = _weekly_open(bars, 0)
        scale = bars["atr0"].replace(0, np.nan)
        rows.append(pd.DataFrame({
            "date": bars.index, "pair": pair, "open": bars["open"].to_numpy(),
            "atr0": scale.to_numpy(), "week_open": wopen.to_numpy(),
            "ext_score": ((bars["open"] - wopen) / scale).to_numpy(),
            "cost_price": 0.3,
        }))
    panel = pd.concat(rows, ignore_index=True).dropna(subset=["ext_score", "atr0"])
    return panel.sort_values(["date", "pair"]).reset_index(drop=True)


def test_weekly_open_is_prefix_invariant():
    """This week's open, read from any bar mid-week, must not change when
    later bars (even later bars in the SAME week) are removed."""
    m1 = _synthetic_m1()
    bars_full = frame(m1, "d1")
    wopen_full = _weekly_open(bars_full, 0)

    cut = m1.index[int(len(m1) * 0.6)]
    bars_pre = frame(m1[m1.index < cut], "d1")
    wopen_pre = _weekly_open(bars_pre, 0)

    margin = cut - pd.Timedelta(days=3)
    probe = wopen_pre.index[wopen_pre.index <= margin]
    assert len(probe) > 50, "test is vacuous"
    pd.testing.assert_series_equal(wopen_full.loc[probe], wopen_pre.loc[probe],
                                   check_names=False)


def test_ext_score_is_prefix_invariant():
    """The full panel-building path, not just the weekly-open helper: a bar's
    ext_score must be identical whether or not later bars exist in the data."""
    m1 = _synthetic_m1()
    cut = m1.index[int(len(m1) * 0.6)]

    def score(mm1):
        bars = frame(mm1, "d1")
        wopen = _weekly_open(bars, 0)
        scale = bars["atr0"].replace(0, np.nan)
        return ((bars["open"] - wopen) / scale)

    full = score(m1)
    pre = score(m1[m1.index < cut])
    margin = cut - pd.Timedelta(days=3)
    probe = pre.index[pre.index <= margin]
    assert len(probe) > 50
    diff = (full.loc[probe] - pre.loc[probe]).abs()
    assert diff.max() < 1e-9, f"ext_score changed under truncation, max diff {diff.max()}"


def test_forward_return_never_looks_further_than_its_own_h():
    panel = _mini_panel([("a", 1, 0.0)])
    panel = add_forward_returns(panel, h_grid=(1, 3))
    pair = panel[panel["pair"] == "a"].reset_index(drop=True)
    for h in (1, 3):
        col = f"fwd_r_{h}"
        # Row i's forward return must equal the price move from bar i to
        # bar i+h, independently recomputed — catches an off-by-one in the
        # shift direction (a very easy bug to introduce here: shift(-h) vs
        # shift(h) silently swaps "forward" for "backward" and nothing
        # about the code would look wrong).
        for i in range(len(pair) - h - 1):
            expect = (pair["open"].iloc[i + h] - pair["open"].iloc[i]) / pair["atr0"].iloc[i]
            expect -= pair["cost_price"].iloc[i] / pair["atr0"].iloc[i]
            got = pair[col].iloc[i]
            if np.isnan(got):
                continue
            assert abs(got - expect) < 1e-9


def test_rebalance_dates_are_non_overlapping_by_construction():
    dates = pd.date_range("2024-01-01", periods=100, freq="D")
    for h in (1, 3, 5, 7):
        reb = _rebalance_dates(pd.DatetimeIndex(dates), h)
        gaps = np.diff(reb.to_numpy()).astype("timedelta64[D]").astype(int)
        assert (gaps == h).all(), f"h={h} produced non-uniform gaps {set(gaps)}"


def test_basket_returns_reversion_and_momentum_are_mirror_images():
    """With no cost, FADE and FOLLOW on the identical panel must be exact
    negatives of each other — a sanity check on the long/short assignment
    logic that would catch a swapped sign silently producing 'a result'."""
    panel = _mini_panel([(p, i, 0.0) for i, p in enumerate("abcdef")])
    panel = add_forward_returns(panel, h_grid=(1,))
    panel["cost_price"] = 0.0   # isolate the sign logic from cost
    panel = add_forward_returns(panel.drop(columns=[c for c in panel.columns
                                                     if c.startswith("fwd_r_")]), h_grid=(1,))
    rev = basket_returns(panel, k=2, h=1, sign="reversion")
    mom = basket_returns(panel, k=2, h=1, sign="momentum")
    common = rev.index.intersection(mom.index)
    assert len(common) > 10
    np.testing.assert_allclose(rev.loc[common].to_numpy(), -mom.loc[common].to_numpy(),
                               atol=1e-9)


def test_shuffle_scores_preserves_each_dates_own_multiset_and_returns():
    panel = _mini_panel([(p, i, 0.0) for i, p in enumerate("abcdef")])
    rng = np.random.default_rng(0)
    shuffled = shuffle_scores(panel, rng)
    # Same forward-return/atr0/pair identity — only ext_score moved.
    pd.testing.assert_series_equal(panel["atr0"], shuffled["atr0"])
    pd.testing.assert_series_equal(panel["pair"], shuffled["pair"])
    # Within each date, the SET of scores is unchanged (a permutation).
    for d, idx in panel.groupby("date").groups.items():
        a = np.sort(panel.loc[idx, "ext_score"].to_numpy())
        b = np.sort(shuffled.loc[idx, "ext_score"].to_numpy())
        np.testing.assert_allclose(a, b)


def test_discover_universe_matches_real_data_dir():
    pairs = discover_universe()
    assert "gold" in pairs
    assert len(pairs) >= 20


def test_years_cutoff_is_anchored_to_one_shared_reference_not_per_pair(tmp_path):
    """The bug found while smoke-testing: cutting each pair back `years` from
    ITS OWN last bar breaks the cross-section the moment one pair's data ends
    earlier than the rest — that pair's window lands on a completely
    different calendar range than everyone else's, and the concatenated
    panel silently spans far more than `years` with most dates covered by
    only one or two names. Build two synthetic pairs, one of which stops
    years before the other, and assert the resulting panel's date range is
    anchored to the LATER pair's last bar for both.
    """
    from forge.bars import load_m1
    from forge import xsect as xs

    root = tmp_path
    fresh = _synthetic_m1(60 * 24 * 200, seed=1)                 # 200 days, ends "now"
    # `stale` covers the SAME calendar window but is truncated to its first
    # third — ending well before `fresh` does, the same shape of problem as
    # the real audchf/others gap (just compressed to fit a fast synthetic
    # test instead of the real six-year one).
    stale_full = _synthetic_m1(60 * 24 * 200, seed=2)
    stale_end = stale_full.index[0] + (stale_full.index[-1] - stale_full.index[0]) / 3
    stale = stale_full[stale_full.index <= stale_end]
    assert stale.index[-1] < fresh.index[-1] - pd.Timedelta(days=30), "test setup is wrong"

    fresh.to_parquet(root / "fresh_m1.parquet")
    stale.to_parquet(root / "stale_m1.parquet")

    panel = xs.build_panel(["fresh", "stale"], tf="d1", data_root=str(root), years=0.15)
    # The reference must be FRESH's last bar, not STALE's — so fresh
    # contributes rows right up to (near) the true end of its own history,
    # regardless of stale being in the same call.
    fresh_rows = panel[panel["pair"] == "fresh"]
    assert fresh_rows["date"].max() >= fresh.index[-1] - pd.Timedelta(days=5)
    # And stale, whose own history ended 3 years before the 0.3y window even
    # starts, must contribute NOTHING rather than a stale, misaligned slice.
    assert (panel["pair"] == "stale").sum() == 0


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all xsect tests passed")
