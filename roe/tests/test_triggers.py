"""Each trigger: a synthetic series that must fire, one that must not, and the nominal rate on noise."""
from __future__ import annotations

import numpy as np

from roe import triggers as T
from roe.fixtures import make_series, weekdays_ending
from roe.measures import compute_measures
from roe.watch import Ctx, evaluate, make_drdt, make_ivrv, make_ratio

from .helpers import ASOF, NOW, cfg, noise_series


def _m(s, c=None):
    return compute_measures(s.dates, s.values, cadence=s.cadence, change_kind=s.change_kind, cfg=c or cfg())


def test_extreme_fires_on_planted_extreme_and_not_on_plain_noise():
    c = cfg()
    s = noise_series(1500, seed=5)
    s.values[-1] = 100 + 8                                           # +8 sigma: both windows must be above 95
    fired = T.extreme(_m(s), c)
    assert fired and fired[0]["side"] == "high"
    s.values[-1] = 100 - 8
    assert T.extreme(_m(s), c)[0]["side"] == "low"
    s.values[-1] = 100.0                                             # the median: must not fire
    assert T.extreme(_m(s), c) == []


def test_extreme_needs_both_windows():
    c = cfg()
    s = noise_series(1500, seed=6)
    # make the last 252 days low-level so today's moderate value is extreme on 252 but ordinary on 756
    s.values[-252:] = [v - 3 for v in s.values[-252:]]
    s.values[-1] = 100 + 0.5
    m = _m(s)
    assert m["pct"]["252"] >= 95 and m["pct"]["756"] < 95
    assert T.extreme(m, c) == []


def test_extreme_nominal_rate_on_noise():
    c = cfg()
    s = noise_series(3200, seed=11)
    fires, n = 0, 0
    for i in range(1000, 3200, 2):
        m = compute_measures(s.dates[: i + 1], s.values[: i + 1], cadence="daily", change_kind="diff", cfg=c)
        n += 1
        fires += bool(T.extreme(m, c))
    rate = fires / n
    assert 0.05 < rate < 0.13, rate            # two-sided: about 2 x 4% (5% on the short window x P(also on the long one))


def test_speed_fires_on_a_jump_and_has_nominal_rate_on_noise():
    c = cfg()
    s = noise_series(1500, seed=8)
    s.values[-1] = s.values[-6] + 12                                  # 5-session change of +12 (noise sd 1)
    f = T.speed(_m(s), c)
    assert f and f[0]["side"] == "up" and abs(f[0]["strength"]["robustZ"]) >= 2
    s2 = noise_series(3200, seed=12)
    fires, n = 0, 0
    for i in range(1000, 3200, 2):
        m = compute_measures(s2.dates[: i + 1], s2.values[: i + 1], cadence="daily", change_kind="diff", cfg=c)
        n += 1
        fires += bool(T.speed(m, c))
    assert 0.02 < fires / n < 0.10, fires / n


def test_flip_fires_once_on_the_confirming_session_only():
    c = cfg()                                       # hold = 3
    neg = [-1.0] * 10
    assert T.flip(neg + [1, 1, 1], 0.0, c)[0]["side"] == "to_positive"      # held 3 sessions: fires
    assert T.flip(neg + [1, 1], 0.0, c) == []                                # only 2 sessions: not yet
    assert T.flip(neg + [1, 1, 1, 1], 0.0, c) == []                          # already fired a session ago
    assert T.flip(neg + [1, -1, 1], 0.0, c) == []                            # a one-day blip is not a flip
    assert T.flip([1.0] * 10 + [-1, -1, -1], 0.0, c)[0]["side"] == "to_negative"
    assert T.flip([0.9] * 10 + [1.05] * 3, 1.0, c)[0]["side"] == "to_positive"   # centre 1.0 (term-structure ratios)


def test_regime_change_is_a_held_category_change():
    c = cfg()
    lab = T.regime_labels([14, 14, 14, 16, 16, 16], [15, 20, 30], ["low", "normal", "elevated", "high"])
    assert lab == ["low"] * 3 + ["normal"] * 3
    assert T.regime_change(lab, c)[0]["side"] == "to_normal"
    assert T.regime_change(lab[:5], c) == []                                  # only 2 sessions in the new state
    assert T.regime_change(["low", "low", "normal", "low", "normal", "normal"], c) == []
    assert T.regime_change(["normal"] * 6, c) == []


def _pair(n=700, seed=2, relation=1, jump=0.0, independent=False):
    rng = np.random.default_rng(seed)
    d = weekdays_ending("2026-11-06", n)
    f = np.cumsum(rng.normal(0, 0.02, n))
    b = 20 * np.exp(f + rng.normal(0, 0.005, n))
    a = (20 * np.exp(relation * f + rng.normal(0, 0.005, n))) if not independent else 20 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
    a = a.copy()
    a[-1] *= np.exp(jump)
    return d, list(a), list(b)


def test_divergence_fires_when_comoving_pair_splits():
    c = cfg()
    d, a, b = _pair(jump=0.45)
    fired, info = T.divergence(d, a, d, b, 1, "log", "log", c)
    assert fired and fired[0]["side"] == "a_above_b" and info["corr"] >= 0.4 and info["residualZ"] >= 2
    d, a, b = _pair(jump=-0.45)
    assert T.divergence(d, a, d, b, 1, "log", "log", c)[0][0]["side"] == "a_below_b"


def test_divergence_does_not_fire_without_a_split_or_without_comovement():
    c = cfg()
    d, a, b = _pair(jump=0.0)
    assert T.divergence(d, a, d, b, 1, "log", "log", c)[0] == []
    d, a, b = _pair(jump=0.45, independent=True)              # not normally co-moving: corr below 0.4
    fired, info = T.divergence(d, a, d, b, 1, "log", "log", c)
    assert fired == [] and info["corr"] < 0.4


def test_divergence_inverse_pair_uses_relation_sign():
    c = cfg()
    d, a, b = _pair(relation=-1, jump=0.45)
    assert T.divergence(d, a, d, b, -1, "log", "log", c)[0]            # inverse pair declared inverse: fires
    assert T.divergence(d, a, d, b, 1, "log", "log", c)[0] == []       # same data declared positive: corr < 0.4


def test_derived_series_helpers():
    d = weekdays_ending("2026-11-06", 60)
    a = make_series("A", d, [2.0] * 60, None)
    b = make_series("B", d, [4.0] * 60, None)
    r = make_ratio(a, b, "R")
    assert r.values[0] == 0.5 and r.meta["derived"]
    dr = make_drdt(a, b, 20, 5, "D")
    assert abs(dr.values[-1]) < 1e-12
    px = make_series("P", d, [100.0 * (1.01 ** i) for i in range(60)], None)    # constant 1% growth: RV = 0
    assert make_ivrv(a, px, 20, "I") is None or all(np.isfinite(x) for x in make_ivrv(a, px, 20, "I").values)


def test_staleness_trigger_fires_for_a_stale_input_and_not_for_a_fresh_one():
    from roe.fixtures import make_fixture_inputs
    c = cfg()
    inp = make_fixture_inputs(ASOF, c)                  # VXN is planted stale
    res = evaluate(Ctx(c, inp, NOW), ASOF, include_points=True)
    st = {r["id"]: r for r in res if r["kind"] == "input_staleness"}
    assert st["input_staleness:VXN"]["fired"] and st["input_staleness:VXN"]["fired"][0]["trigger"] == "stale"
    assert not st["input_staleness:VIX"]["fired"]
    assert any(f.startswith("STALE:VXN") for f in st["input_staleness:VXN"]["flags"])


def test_planted_fixture_fires_the_expected_triggers():
    from roe.fixtures import make_fixture_inputs
    c = cfg()
    inp = make_fixture_inputs(ASOF, c)
    res = evaluate(Ctx(c, inp, NOW), ASOF, include_points=True)
    fired = {(r["id"], f["trigger"]) for r in res for f in r["fired"]}
    for want in (("vix_vix3m", "flip"), ("curve_2s10s", "flip"), ("vix9d_vix", "regime"), ("cot_fx:EUR", "extreme"),
                 ("cot_crowd_release:EUR", "extreme"), ("gamma_breakout_breadth", "regime"),
                 ("gamma_flip_dist:SPX", "regime"), ("vol_breadth", "extreme"), ("desk_pack_quality", "stale"),
                 ("divergence:VIX~VXEEM", "divergence")):
        assert want in fired, (want, sorted(fired))
    # an unplanted run must not fire the planted-only structure
    inp2 = make_fixture_inputs(ASOF, c, plant=False)
    res2 = evaluate(Ctx(c, inp2, NOW), ASOF, include_points=True)
    f2 = {(r["id"], f["trigger"]) for r in res2 for f in r["fired"]}
    for gone in (("vix_vix3m", "flip"), ("cot_crowd_release:EUR", "extreme"), ("gamma_flip_dist:SPX", "regime"), ("desk_pack_quality", "stale")):
        assert gone not in f2, gone


def test_hl_p75_is_disabled_by_default_and_fires_when_enabled():
    """roe-watch-1.0.1 disables the realised-range-vs-shipped-line item (the live ladder is in the layer-3 file list of the lockbox manifest).
    The item itself still works when the owner enables it (a config change must bump watchVersion and re-pin)."""
    import copy
    from roe.fixtures import make_fixture_inputs
    c = cfg()
    item = next(i for i in c["items"] if i["id"] == "hl_p75")
    assert item["enabled"] is False
    inp = make_fixture_inputs(ASOF, c)
    res = evaluate(Ctx(c, inp, NOW), ASOF, include_points=True)
    assert not any(r["id"].startswith("hl_p75") for r in res)
    c2 = copy.deepcopy(c)
    next(i for i in c2["items"] if i["id"] == "hl_p75")["enabled"] = True
    res2 = evaluate(Ctx(c2, inp, NOW), ASOF, include_points=True)
    fired = {(r["id"], f["trigger"]) for r in res2 for f in r["fired"]}
    assert ("hl_p75:NQ", "extreme") in fired


def test_vol_breadth_does_not_fire_with_too_few_fresh_components():
    from roe.fixtures import make_fixture_inputs
    c = cfg()
    inp = make_fixture_inputs(ASOF, c)
    for nm in ("OVX", "GVZ", "VXTLT", "MOVE", "VXFXI", "VXEWZ"):
        inp.series[nm].dates = inp.series[nm].dates[:-30]               # stale
        inp.series[nm].values = inp.series[nm].values[:-30]
    res = {r["id"]: r for r in evaluate(Ctx(c, inp, NOW), ASOF, include_points=True)}
    assert res["vol_breadth"]["status"] == "partial" and not res["vol_breadth"]["fired"]
    assert "PARTIAL_COMPONENTS:vol_breadth" in res["vol_breadth"]["flags"]
