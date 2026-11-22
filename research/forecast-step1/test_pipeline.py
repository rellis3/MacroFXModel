"""Synthetic checks for the step-1 forecast pipeline (no market data needed).

    python -m pytest research/forecast-step1/test_pipeline.py -q      (or: python research/forecast-step1/test_pipeline.py)

1. No look-ahead: changing sessions after a date leaves every forecast up to that date unchanged.
2. Calibration: on a known volatility process the well-specified models hit p50/p75/p90 at about 50/25/10%.
3. Positive control: a planted model that knows the true volatility is picked by both approaches and beats the
   benchmark, so the race can find a better model when one exists.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402


def synthetic_m1(seed=1, start="2016-01-04", end="2026-08-21"):
    """1-minute bars for 00:00-22:00 London on weekdays; daily vol follows a log-AR(1) (persistent, like markets)."""
    rng = np.random.default_rng(seed)
    days = pd.bdate_range(start, end)
    n = len(days)
    lv = np.empty(n)
    lv[0] = np.log(0.01)
    for t in range(1, n):
        lv[t] = np.log(0.01) * 0.03 + 0.97 * lv[t - 1] + 0.18 * rng.standard_normal()
    sig_day = np.exp(lv)
    mins = 1320
    frames, price = [], 100.0
    for d, sd in zip(days, sig_day):
        t0 = pd.Timestamp(d, tz="Europe/London").tz_convert("UTC")
        r = rng.standard_normal(mins) * sd / np.sqrt(mins)
        c = price * np.exp(np.cumsum(r))
        o = np.concatenate([[price], c[:-1]])
        wig = np.abs(rng.standard_normal(mins)) * sd / np.sqrt(mins) * 0.3 * o
        frames.append(pd.DataFrame({"open": o, "high": np.maximum(o, c) + wig, "low": np.minimum(o, c) - wig,
                                    "close": c}, index=t0 + pd.to_timedelta(np.arange(mins), "min")))
        price = c[-1] * np.exp(rng.standard_normal() * sd * 0.1)     # small overnight gap
    m1 = pd.concat(frames)
    true_sig = pd.Series(sig_day, index=days)
    return m1, true_sig


_cache = {}


def _data():
    if "s" not in _cache:
        m1, true_sig = synthetic_m1()
        s = P.sessions(m1)
        _cache["s"], _cache["true"] = s, true_sig.reindex(s.index)
    return _cache["s"], _cache["true"]


def test_sessions_shape():
    s, _ = _data()
    assert (s["n"] == 1320).all()
    assert (s["hl"] >= s["oh"]).all() and (s["hl"] >= s["ol"]).all()
    assert np.allclose(s["hl"], s["oh"] + s["ol"])
    assert s.index.max() <= P.LAST_DATE


def test_no_lookahead():
    s, _ = _data()
    cut = pd.Timestamp("2021-06-15")
    s2 = s.copy()
    after = s2.index > cut
    for col in ("h", "c", "rv5"):
        s2.loc[after, col] = s2.loc[after, col] * 1.7
    s2["hl"] = (s2["h"] - s2["l"]) / s2["o"]
    s2["oh"] = (s2["h"] - s2["o"]) / s2["o"]
    F1, F2 = P.all_forecasts(s), P.all_forecasts(s2)
    upto = s.index <= cut
    for name in F1:
        for key in F1[name]:
            a, b = F1[name][key][upto], F2[name][key][upto]
            assert np.allclose(a.fillna(-1), b.fillna(-1)), f"{name} {key} changed before the cut: look-ahead"


def test_calibration_and_positive_control():
    s, true_sig = _data()
    F = P.all_forecasts(s)
    F["oracle_true_sigma"] = P.sigma_forecasts(s, true_sig)          # planted: knows the real volatility
    r = P.run("SYN", "F", s=s, F=F).payload
    assert r["approach_A"]["model"] == "oracle_true_sigma", r["approach_A"]
    assert all(v == "oracle_true_sigma" for v in r["approach_B"].values()), r["approach_B"]
    assert r["winner_vs_benchmark_validation"]["hl"]["ci90"][1] < 0
    v = r["scoreboard"]["oracle_true_sigma"]["validation"]["hl"]
    assert abs(v["hit_p50"] - 0.50) < 0.04 and abs(v["hit_p75"] - 0.25) < 0.04 and abs(v["hit_p90"] - 0.10) < 0.03, v
    # a sensible real model should also be close to calibrated on this process
    g = r["scoreboard"]["har_rv5"]["validation"]["hl"]
    assert abs(g["hit_p75"] - 0.25) < 0.05, g


if __name__ == "__main__":
    for f in (test_sessions_shape, test_no_lookahead, test_calibration_and_positive_control):
        f()
        print("ok", f.__name__)
