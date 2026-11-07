"""scripts/flow-range-liquidity/score.py on hand-built data: inputs, past-only normalising, walk-forward with no leakage, the verdict rule."""
import importlib.util
import pathlib

import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location("frl", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "flow-range-liquidity" / "score.py")
frl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frl)


def test_window_inputs_measure_side_persistence_and_impact():
    n = 60
    buy, sell = np.full(n, 8.0), np.full(n, 2.0)
    ret = np.full(n, 1e-4)
    w = frl.window_inputs(ret, buy, sell, buy + sell, np.full(n, 101.0), np.full(n, 100.0))
    assert abs(w["absd"] - .6) < 1e-12 and abs(w["pers"] - 1) < 1e-12
    d = np.tile([5.0, -5.0], 30)
    ret2 = d * 2e-5                                                      # moves 2e-5 per signed contract
    b, s = np.where(d > 0, d, 0), np.where(d < 0, -d, 0)
    w2 = frl.window_inputs(ret2, b, s, b + s, np.full(n, 101.0), np.full(n, 100.0))
    assert abs(np.exp(w2["limp"]) - 2e-5) < 1e-9 and w2["pers"] == 0 and w2["absd"] == 0
    assert np.exp(w2["lamh"]) > 0


def test_normalising_uses_only_earlier_sessions():
    days = pd.date_range("2024-01-01", periods=40).strftime("%Y-%m-%d")
    T = pd.DataFrame(dict(root="6E", day=days, c=240, **{k: np.arange(40.0) for k in frl.BASE_IN + frl.M1_IN + frl.M2_IN}, y_h60=np.arange(40.0), y_rest=np.arange(40.0)))
    N = frl.normalise(T)
    assert N.lr60.iloc[:frl.MINHIST].isna().all()
    assert N.lr60.iloc[20] == 20 - np.arange(20.0).mean()
    # A later session cannot move an earlier value.
    T2 = T.copy()
    T2.loc[30:, frl.BASE_IN + frl.M1_IN + frl.M2_IN] = 1e6
    N2 = frl.normalise(T2)
    assert N2.lr60.iloc[:30].equals(N.lr60.iloc[:30]) and N2.absd.iloc[:30].equals(N.absd.iloc[:30])


def _panel(signal=0.0, n=400, seed=3):
    rng = np.random.default_rng(seed)
    days = pd.date_range("2023-01-01", periods=n).strftime("%Y-%m-%d")
    D = pd.DataFrame({k: rng.normal(size=n) for k in frl.BASE_IN + frl.M1_IN + frl.M2_IN})
    D["day"], D["root"], D["c"] = days, "6E", 240
    D["y_h60"] = .5 * D.lr60 + signal * D.limp + rng.normal(size=n)
    D["fold"] = D.day.map(frl.folds_for(D.day))
    return D


def _ratio(D, added):
    p0, p1 = frl.walk(D, "y_h60", frl.BASE_IN), frl.walk(D, "y_h60", frl.BASE_IN + added)
    ok = np.isfinite(p0) & np.isfinite(p1)
    return ((D.y_h60.to_numpy()[ok] - p1[ok]) ** 2).sum() / ((D.y_h60.to_numpy()[ok] - p0[ok]) ** 2).sum(), p0


def test_walk_finds_a_planted_input_and_not_a_noise_one():
    assert _ratio(_panel(signal=.6), ["limp"])[0] < .9
    assert .98 < _ratio(_panel(signal=0), ["limp"])[0] < 1.03


def test_walk_never_trains_on_the_future_and_skips_the_first_fold():
    D = _panel(n=1500)
    p = frl.walk(D, "y_h60", frl.BASE_IN)
    assert np.isnan(p[(D.fold == 0).to_numpy()]).all() and np.isfinite(p[(D.fold == 1).to_numpy()]).all()
    D2 = D.copy()
    D2.loc[D2.fold == 4, "y_h60"] = 1e6                                  # poison the last fold
    p2 = frl.walk(D2, "y_h60", frl.BASE_IN)
    m = (D.fold < 4).to_numpy() & np.isfinite(p)
    assert np.allclose(p[m], p2[m])


def test_ratio_boot_range_and_verdict_words():
    rng = np.random.default_rng(1)
    day = np.repeat(pd.date_range("2023-01-01", periods=200).strftime("%Y-%m-%d").to_numpy(), 5)
    e0 = rng.normal(size=1000)
    c = frl.ratio_boot(day, e0, e0 * .9, np.random.default_rng(2), B_=200)
    assert abs(c["ratio"] - .81) < 1e-9 and c["hi"] < 1 and c["p"] <= 1 / 200 + 1e-9
    v = frl.verdict_for
    assert v(dict(passed=True, lo=.97, hi=.99)) == "validated"
    assert v(dict(lo=.995, hi=.999)) == "context"
    assert v(dict(lo=.992, hi=1.002)) == "null"
    assert v(dict(lo=.98, hi=1.01)) == "underpowered"


def test_holm():
    assert frl.holm([.01, .04, .03, .5]) == [.04, .09, .09, .5]
