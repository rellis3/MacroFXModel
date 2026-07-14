"""Unit test for Mt5Broker._norm_volume — the fix for "Invalid volume argument"
(a risk-sized lot must be rounded to the symbol's step and clamped to min/max).
  python pylego/broker/mt5_volume_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pylego.broker.mt5 import Mt5Broker  # noqa: E402

norm = Mt5Broker._norm_volume
fails = 0
def ok(n, c, e=""):
    global fails
    print(f"  {'✓' if c else '✗ FAIL'} {n}{'  ' + e if e else ''}")
    if not c:
        fails += 1


class Info:
    def __init__(self, vmin, vmax, step):
        self.volume_min, self.volume_max, self.volume_step = vmin, vmax, step


print("[clamp to the symbol's max — the RUT / US2000 case]")
# US2000 rejected lot=2; a broker capping the index at 1.0 lot.
ok("2.0 lot clamps down to volume_max 1.0", norm(Info(0.1, 1.0, 0.1), 2.0) == 1.0, f"{norm(Info(0.1,1.0,0.1),2.0)}")
ok("clamp lands on the step grid", norm(Info(0.1, 1.5, 0.1), 2.0) == 1.5)
ok("integer-step index: 2.0 clamps to max 1", norm(Info(1.0, 1.0, 1.0), 2.0) == 1.0)

print("[round to the step]")
ok("0.37 rounds to step 0.1 → 0.4", abs(norm(Info(0.01, 100, 0.1), 0.37) - 0.4) < 1e-9, f"{norm(Info(0.01,100,0.1),0.37)}")
ok("0.026 rounds to step 0.01 → 0.03", abs(norm(Info(0.01, 100, 0.01), 0.026) - 0.03) < 1e-9)

print("[raise to the minimum]")
ok("0.001 raises to volume_min 0.01", norm(Info(0.01, 100, 0.01), 0.001) == 0.01)

print("[valid lots pass through]")
ok("2.0 within [0.1, 5] step 0.1 unchanged", norm(Info(0.1, 5.0, 0.1), 2.0) == 2.0)
ok("no info → raw lot (old behaviour)", norm(None, 2.0) == 2.0)
ok("zero/blank fields don't crash", norm(Info(0, 0, 0), 2.0) == 2.0)

print(f"\n{'ALL PASSED ✓' if fails == 0 else str(fails) + ' FAILED ✗'}")
sys.exit(0 if fails == 0 else 1)
