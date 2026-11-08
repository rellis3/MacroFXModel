"""Freshness flags and the explicit scan FAILURE state."""
from __future__ import annotations

import datetime as dt

from roe.fixtures import make_fixture_inputs, make_series, weekdays_ending
from roe.freshness import series_flags
from roe.inputs import InputSet
from roe.scan import run_scan
from roe.util import london_time

from .helpers import ASOF, NOW, cfg, fixture_run, jread, noise_series, read_obs


def codes(s, asof=ASOF, now=NOW, prior=None):
    return {f["code"] for f in series_flags(s, asof, now, cfg(), prior)}


def test_missing_and_empty_series_are_flagged_missing():
    assert codes(None) == {"MISSING"}
    s = noise_series(10)
    s.dates, s.values = [], []
    assert codes(s) == {"MISSING"}


def test_stale_depends_on_cadence_and_max_age():
    s = noise_series(300)
    assert "STALE" not in codes(s)                                   # last obs = ASOF
    old = s.truncate("2026-10-20")
    assert "STALE" in codes(old)                                     # 17 days old, daily max 4
    w = make_series("COT:EUR", ["2026-10-20"], [1.0], None, cadence="weekly", kind="positioning", known=["2026-10-23"])
    assert "STALE" in codes(w)                                       # public 14 days ago, weekly max 10
    w2 = make_series("COT:EUR", ["2026-10-27"], [1.0], None, cadence="weekly", kind="positioning", known=["2026-10-30"])
    assert "STALE" not in codes(w2)


def test_frozen_feed_weekend_stub_and_future_timestamps():
    s = noise_series(50)
    s.values[-6:] = [5.0] * 6
    assert "STALE_RUN" in codes(s)
    stub = make_series("X", ["2026-11-04", "2026-11-05", "2026-11-07"], [1, 2, 3], None, cadence="daily")    # 2026-11-07 is a Saturday
    assert "WEEKEND_STUB" in codes(stub, asof="2026-11-08")
    fut = noise_series(50)
    fut.meta["droppedAfterTo"] = 2
    assert "FUTURE_TS" in codes(fut)


def test_incomplete_session_before_22_london():
    s = make_series("HL75:NQ", ["2026-11-05", "2026-11-06"], [1.0, 1.1], None, cadence="daily", kind="session")
    before = dt.datetime(2026, 11, 6, 20, 0, 0)                     # 20:00 UTC = 20:00 London in November (GMT)
    after = dt.datetime(2026, 11, 6, 23, 0, 0)
    assert "INCOMPLETE_SESSION" in codes(s, now=before)
    assert "INCOMPLETE_SESSION" not in codes(s, now=after)
    # BST: 21:30 UTC in July is 22:30 London
    assert london_time(dt.datetime(2026, 7, 1, 21, 30)).hour == 22
    assert london_time(dt.datetime(2026, 11, 1, 21, 30)).hour == 21


def test_revised_macro_value_is_flagged_against_the_previous_snapshot():
    s = noise_series(60, kind="macro", sid="X")
    prior = {d: v for d, v in zip(s.dates[-30:], s.values[-30:])}
    assert "REVISED" not in codes(s, prior=prior)
    prior[s.dates[-5]] += 0.5
    assert "REVISED" in codes(s, prior=prior)
    m = noise_series(60, kind="market", sid="X")                      # market closes are not 'revised macro'
    assert "REVISED" not in codes(m, prior={d: v + 1 for d, v in zip(m.dates[-30:], m.values[-30:])})


def test_revised_flag_end_to_end_between_two_runs(tmp_path):
    c = cfg()
    r1 = run_scan(asof="2026-11-05", out_dir=tmp_path, cfg=c, inputs=make_fixture_inputs("2026-11-05", c), now_utc=NOW, commit="testcommit", lookback=0)
    inp = make_fixture_inputs("2026-11-05", c)
    inp.series["DGS10"].values[-3] += 0.25                               # a revised macro print
    inp.blobs[0] = dict(inp.blobs[0], sha256="f" * 64)                    # a different input blob -> a different run id
    r2 = run_scan(asof="2026-11-05", out_dir=tmp_path, cfg=c, inputs=inp, now_utc=NOW, commit="testcommit", lookback=0)
    snap = jread(r2["dir"], "snapshot.json")
    dgs10 = next(s for s in snap["series"] if s["id"] == "DGS10")
    assert any(f["code"] == "REVISED" for f in dgs10["flags"])
    assert r1["runId"] != r2["runId"]


def test_flagged_series_may_still_be_observed_and_the_flag_travels_with_the_observation(tmp_path):
    r, _ = fixture_run(tmp_path)
    obs = read_obs(r["dir"])
    flagged = [o for o in obs if any(f.startswith("STALE:VXN") for f in o["inputFlags"])]
    assert flagged                                                       # VXN is stale but its items still produce observations
    assert {"vol_breadth"} & {o["item"] for o in flagged}


def test_failure_state_when_required_inputs_are_missing(tmp_path):
    c = cfg()
    empty = InputSet()
    empty.blobs.append({"name": "nothing", "source": "none", "sha256": "0" * 64, "bytes": 0})
    r = run_scan(asof=ASOF, out_dir=tmp_path, cfg=c, inputs=empty, now_utc=NOW, commit="testcommit")
    assert r["status"] == "failed"
    st = jread(r["dir"], "status.json")
    assert st["state"] == "failed" and st["discoveryCompleted"] is False
    assert any("VIX" in x for x in st["reasons"]) and st["message"].startswith("discovery not completed")
    summary = (tmp_path / r["runId"] / "summary.md").read_text(encoding="utf-8")
    assert "DISCOVERY NOT COMPLETED" in summary
    assert jread(r["dir"], "episodes.json")["episodes"] == []
    assert read_obs(r["dir"]) == []


def test_failure_state_when_the_state_document_is_required_and_absent(tmp_path):
    c = cfg()
    inp = make_fixture_inputs(ASOF, c)                                    # plenty of data, but the server document was required
    r = run_scan(asof=ASOF, out_dir=tmp_path, cfg=c, inputs=inp, now_utc=NOW, commit="testcommit", required_docs=("api_state",))
    assert r["status"] == "failed"
    assert any("api_state" in x for x in jread(r["dir"], "status.json")["reasons"])


def test_status_degraded_with_flags_and_ok_without(tmp_path):
    r, _ = fixture_run(tmp_path / "a")
    assert r["status"] == "degraded"
    st = jread(r["dir"], "status.json")
    assert st["state"] == "degraded" and st["discoveryCompleted"] is True and st["reasons"]
    c = cfg()
    clean_inp = make_fixture_inputs(ASOF, c, plant=False)
    r2 = run_scan(asof=ASOF, out_dir=tmp_path / "b", cfg=c, inputs=clean_inp, now_utc=NOW, commit="testcommit")
    assert r2["status"] == "ok", r2.get("reasons")
