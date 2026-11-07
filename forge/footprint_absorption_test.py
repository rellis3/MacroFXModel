"""scripts/footprint-absorption/score.py on hand-built bars: flow at the extremes, thresholds from the past only, next-bar entry, costs, stop first."""
import importlib.util
import pathlib

import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location("fa", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "footprint-absorption" / "score.py")
fa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fa)
NB = 78
TICK = .25


def test_session_arrays_measures_flow_in_the_extreme_thirds():
    idx = pd.date_range("2024-03-04 14:30", periods=NB * 5, freq="1min", tz="UTC")     # 09:30 New York in EST
    px = np.full(NB * 5, 100.0)
    side = np.array(["B"] * (NB * 5), dtype=object)
    px[:5] = [100, 103, 100.5, 102.9, 101.5]                                          # first bar: low 100, high 103
    side[:5] = ["A", "B", "A", "B", "A"]
    t = pd.DataFrame(dict(ts_event=idx, instrument_id=1, price=px, size=2, side=side))
    a, why = fa.session_arrays(t, 570, NB)
    assert why == "ok"
    assert a["o"][0] == 100 and a["h"][0] == 103 and a["l"][0] == 100 and a["c"][0] == 101.5
    assert a["sell"][0] == 6 and a["buy"][0] == 4
    assert a["sell_low"][0] == 4 and a["buy_high"][0] == 4                            # sells at 100 and 100.5 are low; 101.5 is not
    assert fa.session_arrays(t.assign(instrument_id=np.r_[np.full(9, 1), np.full(NB * 5 - 9, 2)]), 570, NB)[1] == "roll"


def _frame(n=40, seed=1):
    """A quiet market with random flow and steady range, so conditions are mostly set by what the test plants."""
    rng = np.random.default_rng(seed)
    o = 100 + rng.normal(0, .2, (n, NB))
    h, l = o + 1, o - 1
    c = o + rng.choice([-.5, .5], (n, NB))
    vol = np.full((n, NB), 100.0)
    D = rng.uniform(-.5, .5, (n, NB))
    d = dict(days=np.array([f"2024-{1 + k // 28:02d}-{1 + k % 28:02d}" for k in range(n)]), o=o, h=h, l=l, c=c, buy=vol * (1 + D) / 2, sell=vol * (1 - D) / 2,
             tbuy=vol * .5, tsell=vol * .5, sell_low=vol * rng.uniform(0, .2, (n, NB)), buy_high=vol * rng.uniform(0, .2, (n, NB)))
    return d


def test_event_a_and_b_fire_on_planted_bars_and_use_only_earlier_sessions():
    d = _frame()
    k, i = 30, 40
    d["o"][k, i], d["c"][k, i], d["h"][k, i], d["l"][k, i] = 100, 101.5, 102, 99.5     # up bar, close top half
    d["buy"][k, i], d["sell"][k, i] = 5, 195                                           # very negative delta, heavy volume
    d["sell_low"][k, i] = 150                                                          # most of it at the low
    p = fa.prepare(d)
    rows = pd.DataFrame(fa.events_for("NQ", d, p))
    hit = rows[(rows.k == k) & (rows.i == i)]
    assert set(hit[hit.what == "event"].ev) == {"A", "B"} and set(hit.side) == {1}
    assert rows.k.min() >= fa.MINHIST                                                  # needs history first
    # A later change cannot move an earlier session's events.
    d2 = {x: (v.copy() if x != "days" else v) for x, v in d.items()}
    d2["sell"][k + 2:, :] *= 50
    d2["sell_low"][k + 2:, :] *= 50
    rows2 = pd.DataFrame(fa.events_for("NQ", d2, fa.prepare(d2)))
    a = rows[rows.k <= k + 1][["k", "i", "ev", "what"]].reset_index(drop=True)
    b = rows2[rows2.k <= k + 1][["k", "i", "ev", "what"]].reset_index(drop=True)
    assert a.equals(b)


def test_trade_stop_first_target_and_session_close():
    high, low, close = np.full(NB, 101.0), np.full(NB, 99.0), np.full(NB, 100.0)
    assert fa.trade(high, low, close, 10, NB, 1, 100, 99.5, 101)[2] == "stop"          # both inside one bar: stop
    high2, low2 = np.full(NB, 100.5), np.full(NB, 99.75)
    high2[20] = 101.5
    g, slip, why = fa.trade(high2, low2, close, 10, NB, 1, 100, 99.5, 101)
    assert why == "target" and g == 1 and slip == 1
    g, slip, why = fa.trade(np.full(NB, 100.25), np.full(NB, 99.75), close, 10, NB, 1, 100, 99.5, 101)
    assert why == "close" and slip == 2
    assert fa.trade(np.full(NB, 100.75), np.full(NB, 99.25), close, 10, NB, -1, 100, 100.5, 99)[2] == "stop"


def test_entry_is_the_next_bar_and_returns_are_signed():
    d = _frame(n=25)
    p = fa.prepare(d)
    k, i = 22, 10
    d["o"][k, i + 1] = 100.0
    p["close"][k, i + 3] = 101.0                                                        # 15 minutes after entry = the close of the third bar from entry
    p["sig"] = p["sig"].copy()
    p["sig"][k, i] = .01
    up = fa.outcome(d, p, k, i, 1, TICK, 20, NB)
    dn = fa.outcome(d, p, k, i, -1, TICK, 20, NB)
    assert abs(up["O15"] - np.log(1.01) / (.01 * np.sqrt(3))) < 1e-9 and abs(dn["O15"] + up["O15"]) < 1e-9
    late = fa.outcome(d, p, k, NB - 3, 1, TICK, 20, NB)
    assert np.isnan(late["O60"])                                                        # the window would pass the close


def test_costs_in_net_r():
    d = _frame(n=25)
    p = fa.prepare(d)
    k, i = 22, 10
    d["o"][k, i + 1], d["l"][k, i] = 100.0, 99.0
    d["h"][k, i + 1:], d["l"][k, i + 1:] = 100.5, 98.0                                  # stops on the entry bar
    m = fa.outcome(d, p, k, i, 1, TICK, 20, NB)
    dist = 100 - (99 - 2 * TICK)
    assert m["why"] == "stop" and abs(m["Rg"] + 1) < 1e-9 and abs(m["R"] - (-dist - 2 * TICK - 4 / 20) / dist) < 1e-9


def test_declutter_and_contrast():
    base = dict(root="6E", ev="A", side=1, hour=10, O15=0.0, R=0.0)
    df = pd.DataFrame([{**base, "day": "d", "k": 1, "i": 10, "what": "event", "O15": 2.0}, {**base, "day": "d", "k": 1, "i": 15, "what": "event", "O15": 9.0},
                       {**base, "day": "d", "k": 1, "i": 30, "what": "event", "O15": 3.0}, {**base, "day": "d", "k": 1, "i": 11, "what": "control", "O15": 1.0},
                       {**base, "day": "d", "k": 1, "i": 12, "what": "control", "O15": 3.0}, {**base, "day": "d", "k": 1, "i": 50, "what": "event", "hour": 11, "O15": 5.0}])
    kept = fa.declutter(df)
    assert sorted(kept[kept.what == "event"].i) == [10, 30, 50]
    e, dropped = fa.contrasts(kept, "O15")
    assert dropped == 1 and sorted(e.contrast) == [0.0, 1.0]                            # against the control mean of 2; hour 11 has no control


def test_holm():
    assert fa.holm([.01, .04, .03, .5]) == [.04, .09, .09, .5]
