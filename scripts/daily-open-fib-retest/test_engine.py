"""Unit checks for engine.py on hand-built paths, including the video's 26 Oct 2026 trade.

    python3 scripts/daily-open-fib-retest/test_engine.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import find_fill, trade  # noqa: E402


def bars(points, wick=0.0):
    """Linear minute path through `points` (price, minute) -> o, h, l, c, mins."""
    px, mm = [], []
    for (p0, m0), (p1, m1) in zip(points[:-1], points[1:]):
        for m in range(m0, m1):
            px.append(p0 + (p1 - p0) * (m - m0) / (m1 - m0))
            mm.append(m)
    px.append(points[-1][0]); mm.append(points[-1][1])
    c = np.array(px)
    o = np.concatenate([[c[0]], c[:-1]])
    h = np.maximum(o, c) + wick
    l = np.minimum(o, c) - wick
    return o, h, l, c, np.array(mm)


ok = 0


def check(name, cond):
    global ok
    assert cond, name
    ok += 1


ADR = 40.0
# The video: open 4019.10 at the top, impulse down to 4004.11 (~23:45), back up through the 1
# to ~4019.6 (~00:15), then down through the low (~01:55). Minutes from the 23:00 UK first bar.
o, h, l, c, m = bars([(4019.10, 0), (4004.11, 45), (4019.60, 75), (4012.0, 120), (4004.00, 175), (4006, 600)])
f = find_fill(o, h, l, m, ADR, "high", 0.10)
check("video fills a sell", f is not None and f["side"] == -1)
check("the 1 is the opening high", abs(f["A"] - 4019.10) < 1e-9)
check("the 0 is the impulse low", abs(f["L0"] - 4004.11) < 1e-9)
t = trade(o, h, l, m, f, 0.2, "zero", True, 540)
check("video trade hits the 0 for +5R", t["how"] == "target" and abs(t["R"] - 5.0) < 1e-6)
check("stop is the 1.2", abs(t["risk_px"] - 0.2 * (4019.10 - 4004.11)) < 1e-9)

# Stop: return through the 1 and on past the 1.2
o, h, l, c, m = bars([(100, 0), (90, 30), (103, 60), (95, 100), (95, 600)])
f = find_fill(o, h, l, m, 50.0, "high", 0.10)
t = trade(o, h, l, m, f, 0.2, "zero", True, 540)
check("loss is -1R at the 1.2", t["how"] == "stop" and abs(t["R"] + 1.0) < 1e-6)

# Break-even: +1R reached, then back to the entry
o, h, l, c, m = bars([(100, 0), (90, 30), (100, 50), (97.5, 60), (100.5, 80), (95, 120), (95, 600)])
f = find_fill(o, h, l, m, 50.0, "high", 0.10)
t = trade(o, h, l, m, f, 0.2, "zero", True, 540)
check("BE exit is 0R", t["how"] == "be" and abs(t["R"]) < 1e-6)
t2 = trade(o, h, l, m, f, 0.2, "zero", False, 540)
check("without BE the same path runs to the time exit", t2["how"] == "time")

# Buy side mirrors the sell side
o, h, l, c, m = bars([(100, 0), (110, 30), (99.5, 60), (111, 120), (110, 600)])
f = find_fill(o, h, l, m, 50.0, "high", 0.10)
t = trade(o, h, l, m, f, 0.2, "zero", True, 540)
check("buy fill at the opening low", f["side"] == 1 and abs(f["A"] - 100) < 1e-9)
check("buy hits the 0 (the impulse high) for +5R", t["how"] == "target" and abs(t["R"] - 5.0) < 1e-6)

# No impulse big enough: no trade
o, h, l, c, m = bars([(100, 0), (99, 30), (100.5, 60), (100, 600)])
check("small impulse does not arm", find_fill(o, h, l, m, 50.0, "high", 0.10) is None)

# Entry cut-off: the return after 06:00 UK (minute 420) is not taken
o, h, l, c, m = bars([(100, 0), (90, 30), (91, 400), (101, 430), (100, 600)])
check("no fill after the entry cut-off", find_fill(o, h, l, m, 50.0, "high", 0.10, 360) is None)

# Same bar touches stop and target -> stop
o = np.array([100., 95, 91, 90.5, 99, 100.5, 100.0])
h = np.array([100., 95, 91, 91, 101, 104, 100.1])
l = np.array([99.9, 91, 90, 90.2, 98, 85, 99.9])
c = o.copy(); m = np.arange(7)
f = find_fill(o, h, l, m, 50.0, "high", 0.10)
t = trade(o, h, l, m, f, 0.2, "zero", True, 540)
check("ambiguous bar counts as the stop", t["how"] == "stop" and t["R"] <= -1.0 + 1e-9)

print(f"{ok} checks passed")
