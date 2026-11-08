"""Deterministic observation ids and episode grouping with g = 3 sessions."""
from __future__ import annotations

from roe.episodes import build_episodes, obs_id
from roe.util import add_sessions

from .helpers import cfg

D0 = "2026-10-05"            # a Monday


def _ob(i, item="X", trigger="extreme", side="high", cadence="daily"):
    date = add_sessions(D0, i)
    return {"item": item, "trigger": trigger, "side": side, "date": date, "cadence": cadence,
            "obsId": obs_id(item, trigger, "v1", side, date)}


def test_observation_id_is_deterministic_and_sensitive_to_every_field():
    a = obs_id("vix", "extreme", "v1", "high", "2026-11-06")
    assert a == obs_id("vix", "extreme", "v1", "high", "2026-11-06") and len(a) == 16
    for other in (obs_id("vxn", "extreme", "v1", "high", "2026-11-06"), obs_id("vix", "speed", "v1", "high", "2026-11-06"),
                  obs_id("vix", "extreme", "v2", "high", "2026-11-06"), obs_id("vix", "extreme", "v1", "low", "2026-11-06"),
                  obs_id("vix", "extreme", "v1", "high", "2026-11-05")):
        assert other != a


def test_consecutive_days_are_one_episode():
    c = cfg()
    obs = [_ob(0), _ob(1), _ob(2)]
    eps, mp = build_episodes(obs, add_sessions(D0, 2), c)
    assert len(eps) == 1 and eps[0]["nObservations"] == 3 and eps[0]["state"] == "persisting"
    assert eps[0]["openedAt"] == D0 and eps[0]["familyId"] is None
    assert set(mp) == {o["obsId"] for o in obs}                  # no observation is dropped


def test_gap_below_g_continues_and_gap_of_g_starts_a_new_episode():
    c = cfg()                                                   # g = 3
    two_silent = [_ob(0), _ob(3)]                               # sessions 1 and 2 silent: 2 < 3
    eps, _ = build_episodes(two_silent, add_sessions(D0, 3), c)
    assert len(eps) == 1
    three_silent = [_ob(0), _ob(4)]                             # sessions 1, 2, 3 silent: 3 >= g
    eps, _ = build_episodes(three_silent, add_sessions(D0, 4), c)
    assert len(eps) == 2
    assert {e["openedAt"] for e in eps} == {D0, add_sessions(D0, 4)}


def test_episode_states_opened_persisting_closed():
    c = cfg()
    obs = [_ob(0)]
    e = build_episodes(obs, D0, c)[0][0]
    assert e["state"] == "opened" and e["closedAt"] is None
    e = build_episodes(obs, add_sessions(D0, 2), c)[0][0]
    assert e["state"] == "persisting"                           # silent for 2 < g sessions
    e = build_episodes(obs, add_sessions(D0, 3), c)[0][0]
    assert e["state"] == "closed" and e["closedAt"] == add_sessions(D0, 3)
    obs2 = [_ob(0), _ob(1)]
    assert build_episodes(obs2, add_sessions(D0, 1), c)[0][0]["state"] == "persisting"   # fired again


def test_different_sides_and_items_are_separate_episodes():
    c = cfg()
    obs = [_ob(0), _ob(0, side="low"), _ob(0, item="Y"), _ob(0, trigger="speed")]
    eps, _ = build_episodes(obs, D0, c)
    assert len(eps) == 4


def test_duplicates_are_not_double_counted_and_future_rows_are_ignored():
    c = cfg()
    obs = [_ob(0), _ob(0), _ob(1)]
    eps, mp = build_episodes(obs, D0, c)                        # as-of D0: the D1 observation does not exist yet
    assert eps[0]["nObservations"] == 1 and len(mp) == 1


def test_weekly_items_count_g_reports_not_g_sessions():
    c = cfg()
    w = [_ob(0, cadence="weekly"), _ob(5, cadence="weekly"), _ob(10, cadence="weekly")]     # one report per week
    eps, _ = build_episodes(w, add_sessions(D0, 10), c)
    assert len(eps) == 1 and eps[0]["nObservations"] == 3
    gap = [_ob(0, cadence="weekly"), _ob(20, cadence="weekly")]                             # three reports silent
    assert len(build_episodes(gap, add_sessions(D0, 20), c)[0]) == 2
