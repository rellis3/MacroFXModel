"""Causality: appending future rows must not change today's values (data-rules: no lookahead)."""
from __future__ import annotations

import copy
import json

import numpy as np

from roe.fixtures import make_fixture_inputs, make_series, weekdays_ending
from roe.measures import compute_measures
from roe.series import Series
from roe.util import clean
from roe.watch import Ctx, evaluate

from .helpers import ASOF, NOW, cfg, noise_series


def test_future_rows_do_not_change_measures():
    c = cfg()
    s = noise_series(1500, seed=3)
    cut = 1100
    a = compute_measures(s.dates[:cut], s.values[:cut], cadence="daily", change_kind="diff", cfg=c)
    # same series with 400 future rows appended, then cut back to the as-of date the point-in-time way
    t = s.truncate(s.dates[cut - 1])
    b = compute_measures(t.dates, t.values, cadence="daily", change_kind="diff", cfg=c)
    assert clean(a) == clean(b)
    # and: mutating the future rows to wild values changes nothing about today's measures
    s2 = Series(s.id, list(s.dates), list(s.values), cadence="daily", change_kind="diff")
    s2.values[cut:] = [1e6] * (len(s2.values) - cut)
    t2 = s2.truncate(s.dates[cut - 1])
    c2 = compute_measures(t2.dates, t2.values, cadence="daily", change_kind="diff", cfg=c)
    assert clean(a) == clean(c2)


def test_percentile_uses_prior_observations_only():
    c = copy.deepcopy(cfg())
    c["windows"]["daily"] = [10, 20]
    c["minPriorFraction"] = 0.5
    vals = list(range(1, 21)) + [21]            # today is the highest value seen
    m = compute_measures([f"d{i:02d}" for i in range(len(vals))], vals, cadence="daily", change_kind="diff", cfg=c)
    assert m["pct"]["10"] == 100.0 and m["pct"]["20"] == 100.0          # all PRIOR values are below today
    vals2 = list(range(1, 21)) + [10]
    m2 = compute_measures([f"d{i:02d}" for i in range(len(vals2))], vals2, cadence="daily", change_kind="diff", cfg=c)
    # prior window of 10 = 11..20; today (10) is below all of them: 0, not diluted by including itself
    assert m2["pct"]["10"] == 0.0


def test_percentile_building_state_when_too_few_priors():
    c = cfg()
    s = noise_series(200)
    m = compute_measures(s.dates, s.values, cadence="daily", change_kind="diff", cfg=c)
    assert m["status"] == "building" and m["pct"]["252"] is None and m["pct"]["756"] is None


def _digest(results):
    return json.dumps(clean([{k: r[k] for k in ("id", "status", "obsDate", "measures", "fired", "flags")} for r in results]), sort_keys=True)


def test_evaluate_ignores_future_rows_for_every_item():
    c = cfg()
    base = make_fixture_inputs(ASOF, c)
    ext = make_fixture_inputs(ASOF, c)
    rng = np.random.default_rng(99)
    for sid, s in ext.series.items():            # append 40 wild rows dated AFTER the as-of date to every series
        fut = [str(np.datetime64(ASOF) + np.timedelta64(i, "D")) for i in range(1, 41)]
        s.dates = s.dates + fut
        s.values = s.values + list(1e4 * rng.random(40))
        if s.known:
            s.known = s.known + fut
    r1 = evaluate(Ctx(c, base, NOW), ASOF, include_points=True)
    r2 = evaluate(Ctx(c, ext, NOW), ASOF, include_points=True)
    assert _digest(r1) == _digest(r2)
