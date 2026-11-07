"""scripts/failed-auction-volume/run.py: the setup machine and trade rules on hand-built sessions."""
import importlib.util
import pathlib

import numpy as np

spec = importlib.util.spec_from_file_location("fav", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "failed-auction-volume" / "run.py")
fav = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fav)
TICK = .25


def _session(n=390, px=100.0, day="2022-01-03"):
    p = np.full(n, px)
    return dict(day=day, o=p.copy(), h=p + .25, l=p - .25, c=p.copy(), v=np.full(n, 10.0), contract={"NQ_03-22"})


def _set(s, i, o, h, l, c):
    s["o"][i], s["h"][i], s["l"][i], s["c"][i] = o, h, l, c


def test_probe_and_reclaim_found_with_extreme():
    s = _session()
    _set(s, 100, 100, 100, 98.5, 99)      # probe starts: low under L - 1 tick
    _set(s, 101, 99, 99.5, 98, 99)        # deeper, still above the void level
    _set(s, 102, 99, 100.5, 99, 100.25)   # closes back at or above L
    assert fav.machine(s, 106.0, 100.0, 90, 1, TICK, -1) == (100, 102, 98)    # void level 97


def test_probe_voided_past_half_the_range_and_expires_after_15_minutes():
    s2 = _session()
    _set(s2, 100, 100, 100, 98.5, 99)
    _set(s2, 101, 99, 99, 96.5, 97)       # under L - 0.5 x width = 97.5: acceptance
    assert fav.machine(s2, 102.0, 100.0, 90, 1, TICK, -1) is None
    s3 = _session(px=99.0)
    for i in range(0, 390):
        _set(s3, i, 99, 99.25, 98.75, 99)  # sits below L and never closes back
    assert fav.machine(s3, 102.0, 100.0, 90, 1, TICK, -1) is None


def test_stop_wins_when_both_inside_one_minute_and_costs_are_charged():
    s = _session()
    _set(s, 200, 100, 103, 97, 100)       # both 102 and 98 inside
    t = fav.trade(s, 200, 1, 98.0, 102.0, TICK, 20)
    assert t["why"] == "stop" and t["exit"] == 98.0
    assert abs(t["r"] - ((98 - 100) - 2 * TICK - 4 / 20) / 2) < 1e-12        # two ticks slip, $4


def test_target_fill_and_session_close_and_short_side():
    s = _session()
    _set(s, 200, 100, 102.5, 99.5, 102)
    t = fav.trade(s, 200, 1, 98.0, 102.0, TICK, 20)
    assert t["why"] == "target" and abs(t["r"] - (2 - TICK - .2) / 2) < 1e-12  # the limit target has no exit slip
    s = _session()
    t = fav.trade(s, 200, 1, 98.0, 110.0, TICK, 20)
    assert t["why"] == "close" and t["exit"] == 100.0
    s = _session()
    _set(s, 200, 100, 100.5, 97.5, 98)
    t = fav.trade(s, 200, -1, 102.0, 98.0, TICK, 20)
    assert t["why"] == "target" and t["r_gross"] == 1.0


def test_tight_stop_is_skipped():
    s = _session()
    assert fav.trade(s, 200, 1, 99.5, 102.0, TICK, 20) is None                # 2 ticks < 4


def test_volume_ratio_uses_only_prior_sessions():
    ss = [_session(day=f"2022-01-{i + 1:02d}") for i in range(21)]
    ss[20]["v"][100:103] = 5.0                                                 # half normal on the probe
    assert abs(fav.vol_ratio(ss, 20, 100, 102, 30, 89) - .5) < 1e-9
    ss[5]["v"][:] = 1e6                                                        # one odd past day cannot move a 20-day median
    assert abs(fav.vol_ratio(ss, 20, 100, 102, 30, 89) - .5) < 1e-9


def test_end_to_end_one_up_impulse_setup():
    ss = [_session(day=f"2021-12-{i + 1:02d}") for i in range(20)]
    for s in ss:                                                               # gives sigma30 something to work with
        s["c"] = s["c"] + np.sin(np.arange(390) / 7) * .05
    today = _session(day="2022-01-03")
    _set(today, 40, 100, 115, 100, 113)                                        # a one-minute impulse, size 15
    for i in range(41, 390):
        _set(today, i, 113, 114, 112, 113)                                     # balance 112-114, width well under 0.6 x 15
    _set(today, 140, 113, 113, 111.5, 111.75)                                  # probe under L
    _set(today, 141, 111.75, 112.5, 111.5, 112.25)                             # reclaim
    _set(today, 142, 112.25, 114.25, 112, 114)                                 # entry open, target hit
    rows, c = fav.setups_for("NQ", ss + [today])
    m = [r for r in rows if r["kind"] == "main"]
    assert len(m) == 1 and m[0]["side"] == 1 and m[0]["why"] == "target" and m[0]["rec"] == 141
