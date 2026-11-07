"""forge/verdict_gate.py: a missing or failed proof can never become a bankable verdict."""
from __future__ import annotations

from forge import verdict_gate as G


def _ok(**kw):
    c = dict(effect=0.0, lo=-0.002, hi=0.002, min_effect=0.01, diagnostics={"ok": True}, planted_large={"injected": 0.2, "shift": 0.19},
             planted_min={"injected": 0.01, "shift": 0.009}, shuffle={"lo": -0.002, "hi": 0.002}, rows={"used": 100, "dropped": 0})
    c.update(kw)
    return c


def test_missing_proof_is_incomplete():
    c = _ok()
    del c["planted_min"]
    r = G.decide(c)
    assert r["verdict"] == "INCOMPLETE" and "planted_min" in r["reasons"][0]


def test_failed_proofs_are_invalid():
    assert G.decide(_ok(diagnostics={"ok": False, "why": "flags half of all sessions"}))["verdict"] == "INVALID"
    assert G.decide(_ok(planted_large={"injected": 0.2, "shift": 0.01}))["verdict"] == "INVALID"
    assert G.decide(_ok(planted_min={"injected": 0.01, "shift": 0.0}))["verdict"] == "INVALID"
    assert G.decide(_ok(shuffle={"lo": 0.01, "hi": 0.02}))["verdict"] == "INVALID"
    assert G.decide(_ok(shuffle={"real_beats_all": False}))["verdict"] == "INVALID"
    assert G.decide(_ok(effect=0.05, lo=0.04, hi=0.06, shuffle={"lo": 0.01, "hi": 0.02}))["verdict"] == "INVALID"


def test_the_four_words():
    assert G.decide(_ok(effect=0.03, lo=0.02, hi=0.04))["verdict"] == "VALIDATED"
    assert G.decide(_ok(effect=0.005, lo=0.002, hi=0.008))["verdict"] == "CONTEXT"
    assert G.decide(_ok(effect=0.0, lo=-0.002, hi=0.002))["verdict"] == "NULL"
    assert G.decide(_ok(effect=0.0, lo=-0.03, hi=0.03))["verdict"] == "UNDERPOWERED"


def test_a_null_needs_the_minimum_effect_ruled_out():
    assert G.decide(_ok(effect=0.001, lo=-0.009, hi=0.0099))["verdict"] == "NULL"
    assert G.decide(_ok(effect=0.001, lo=-0.009, hi=0.0101))["verdict"] == "UNDERPOWERED"


def test_power_uses_the_interval():
    assert 0.79 < G.power(0.01 / (1.644854 + 0.841621), 0.01) < 0.81
    assert G.power(G.se_from_ci(-0.03, 0.03), 0.01) < 0.3


def test_write_checks_roundtrip(tmp_path):
    import json
    G.write_checks("demo", {"q": _ok()}, root=tmp_path)
    r = json.loads((tmp_path / "demo" / "checks.json").read_text())
    assert r["q"]["verdict"] == "NULL"
