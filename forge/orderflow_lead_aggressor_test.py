"""scripts/orderflow-lead-aggressor/score.py on synthetic flow: known slopes must come back, and lookahead must not be possible."""
import importlib.util
import pathlib

import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location("ola", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "orderflow-lead-aggressor" / "score.py")
ola = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ola)
NB = ola.NB


def _frame(days=120, lead=0.0, seed=1):
    """Flow bars. A random-walk return per bar, with the next bar's return loaded on this bar's D when lead is not 0."""
    rng = np.random.default_rng(seed)
    rows = []
    p = 1.15
    for k in range(days):
        day = (pd.Timestamp("2024-01-01") + pd.Timedelta(days=k)).strftime("%Y-%m-%d")
        first = p
        D_prev = 0.0
        for i in range(NB):
            eps = rng.normal(0, 1e-4)
            p *= float(np.exp(eps + lead * 1e-4 * D_prev))
            D = float(rng.uniform(-.8, .8))
            vol = float(rng.integers(200, 800))
            buy, sell = vol * (1 + D) / 2, vol * (1 - D) / 2
            sgn = 1 if eps > 0 else -1
            rows.append((day, i, buy, sell, vol * (sgn > 0), vol * (sgn < 0), p, first, 0.0, vol))
            D_prev = D
    return pd.DataFrame(rows, columns="day i buy sell tbuy tsell close first none vol".split())


def test_no_lead_gives_a_slope_near_zero_and_a_quiet_placebo():
    d = ola.design(_frame())
    c = ola.cell(d, 5, np.random.default_rng(3))
    assert abs(c["slope"]) < .03 and c["lo"] < 0 < c["hi"], c["slope"]
    assert abs(c["placebo_mean"]) < .01


def test_a_planted_lead_comes_back_with_the_right_sign_and_the_mirror_too():
    d = ola.design(_frame(lead=2.0))
    c = ola.cell(d, 5, np.random.default_rng(3))
    assert c["slope"] > .3 and c["lo"] > 0
    assert c["slope"] > c["placebo_range"][1]
    m = ola.cell(ola.design(_frame(lead=-2.0)), 5, np.random.default_rng(3))
    assert m["slope"] < -.3 and m["hi"] < 0


def test_flow_in_the_outcome_bar_is_not_the_signal():
    """A signal built from the NEXT bar's return would score hugely; the design must line D(t) up with R from t's close."""
    d = ola.design(_frame())
    r = d["R5"].copy()
    r[~np.isfinite(r)] = 0
    y, X, ok = ola.fit(d, np.where(np.isfinite(d["R5"]), r, np.nan), 5)
    a, b, _ = ola.cross(y, X, ok)
    assert ola.solve(a, b) > .9                                                # the check can detect leakage
    c = ola.cell(d, 5, np.random.default_rng(3), boot=False)
    assert abs(c["slope"]) < .03


def test_outcome_window_never_passes_the_close():
    d = ola.design(_frame(days=30))
    assert np.isnan(d["R15"][:, NB - 3:]).all() and np.isfinite(d["R15"][10, NB - 4])


def test_session_bars_signs_flow_from_the_side_field_and_drops_rolls():
    idx = pd.date_range("2024-03-04 08:00", periods=NB * 5, freq="1min", tz="UTC")     # 03:00 New York in EST
    t = pd.DataFrame(dict(ts_event=idx, instrument_id=7, price=1.1 + np.arange(NB * 5) * 1e-5, size=2, side=["B", "A", "N", "B", "B"] * NB))
    s, why = ola.session_bars(t)
    assert why == "ok" and s["buy"][0] == 6 and s["sell"][0] == 2 and s["none"] == 2 * NB and s["tbuy"][0] == 8
    assert ola.session_bars(t.assign(instrument_id=np.r_[np.full(10, 7), np.full(NB * 5 - 10, 8)]))[1] == "roll"
    assert ola.session_bars(t.iloc[:NB * 2])[1] == "thin"


def test_holm():
    assert ola.holm([.01, .04, .03, .5]) == [.04, .09, .09, .5]
