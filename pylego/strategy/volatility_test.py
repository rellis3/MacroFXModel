"""Offline tests for the Volatility Bot strategy bricks.

The headline is the GOLDEN test: approach_velocity must reproduce the canonical
js/touchFeatures.approachVelocity for every vector in volatility_vectors.json
(regenerate with `node scripts/gen_volatility_vectors.mjs`). Plus unit checks on
the line geometry, inner/outer pick and the fade/follow trade spec.

Run:  python pylego/strategy/volatility_test.py   (or pytest)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pylego.strategy.volatility import (  # noqa: E402
    approach_velocity, line_levels, neighbours, trade_spec, cell_key,
)

VEC_PATH = Path(__file__).resolve().parent / "volatility_vectors.json"

# A realistic-ish fraction set (EUR/USD-scale): ocMed < oc75 < hl50 < hl75.
FRAC = {"ocMed": 0.0040, "oc75": 0.0069, "hl50": 0.0094, "hl75": 0.0123}
OPEN = 1.10


def test_golden_approach_velocity_matches_js():
    data = json.loads(VEC_PATH.read_text())
    for c in data["cases"]:
        cfg = c["cfg"]
        val, bucket = approach_velocity(
            c["closes"], c["touchIdx"], c["open"], c["sigma"],
            vel_win=cfg["velWin"], vel_fast=cfg["velFast"], vel_slow=cfg["velSlow"],
        )
        exp = c["expect"]
        assert bucket == exp["bucket"], (c["label"], bucket, exp["bucket"])
        if exp["value"] is None:
            assert val is None, (c["label"], val)
        else:
            assert abs(val - exp["value"]) < 1e-4, (c["label"], val, exp["value"])


def test_line_geometry_static_oc_dynamic_hl():
    # At session start run_low = run_high = open → all lines symmetric off open.
    lv = line_levels(OPEN, OPEN, OPEN, FRAC)
    assert abs(lv["OC50_up"] - OPEN * (1 + FRAC["ocMed"])) < 1e-12
    assert abs(lv["HL75_dn"] - OPEN * (1 - FRAC["hl75"])) < 1e-12
    # HL is dynamic: a higher running low pushes the up proj-line UP.
    lv2 = line_levels(OPEN, OPEN * 1.002, OPEN, FRAC)
    assert lv2["HL50_up"] > lv["HL50_up"]          # trails the running low
    assert lv2["OC50_up"] == lv["OC50_up"]         # OC stays static off open


def test_neighbours_inner_outer_pick():
    lv = line_levels(OPEN, OPEN, OPEN, FRAC)
    # Touch HL50_up: inner = next line toward open (OC75_up), outer = HL75_up.
    inner, outer = neighbours("HL50", "up", lv, OPEN, FRAC)
    assert abs(inner - lv["OC75_up"]) < 1e-12, (inner, lv["OC75_up"])
    assert abs(outer - lv["HL75_up"]) < 1e-12, (outer, lv["HL75_up"])
    # Touch the OUTERMOST line (HL75_up): outer falls back to touched + span.
    _, outer2 = neighbours("HL75", "up", lv, OPEN, FRAC)
    assert outer2 > lv["HL75_up"]


def test_trade_spec_fade_and_follow():
    lv = line_levels(OPEN, OPEN, OPEN, FRAC)
    # FADE an up-line → SELL, TP = inner (toward open), SL = outer (away).
    fade = trade_spec("HL50", "up", lv, "fade", OPEN, FRAC)
    assert fade["side"] == "sell"
    assert fade["tp"] < fade["entry"] < fade["sl"], fade
    # FOLLOW an up-line → BUY, TP = outer, SL = inner.
    follow = trade_spec("HL50", "up", lv, "follow", OPEN, FRAC)
    assert follow["side"] == "buy"
    assert follow["sl"] < follow["entry"] < follow["tp"], follow
    # FADE a down-line → BUY, TP = inner (toward open, higher), SL = outer (lower).
    faded = trade_spec("HL50", "dn", lv, "fade", OPEN, FRAC)
    assert faded["side"] == "buy"
    assert faded["sl"] < faded["entry"] < faded["tp"], faded
    # A skip cell yields no spec.
    assert trade_spec("HL50", "up", lv, "skip", OPEN, FRAC) is None


def test_cell_key_matches_js_format():
    assert cell_key("HL50", "up", "3·spike") == "HL50_up|3·spike"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
