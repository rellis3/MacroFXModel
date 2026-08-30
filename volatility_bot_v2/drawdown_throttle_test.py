"""Synthetic tests for the live drawdown throttle. No network.
  python volatility_bot_v2/drawdown_throttle_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from volatility_bot_v2.drawdown_throttle import DrawdownThrottle  # noqa: E402

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'OK' if cond else 'FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1

print("[normal size while flat or growing]")
t = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
ok("full size on the very first update", t.update(10_000) == 1.0)
ok("full size while balance keeps rising", t.update(10_500) == 1.0)
ok("full size on a small, sub-trigger dip", t.update(10_200) == 1.0)  # -2.9% off the 10,500 peak

print("[throttles once drawdown from PEAK breaches trigger]")
t2 = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
t2.update(10_000)
ok("not yet throttled at -5% from peak", t2.update(9_500) == 1.0)
ok("throttled once past -8% from peak", t2.update(9_150) == 0.25)  # -8.5%
ok("stays throttled on a further dip", t2.update(8_900) == 0.25)

print("[restores only once recovered to restore_dd, not merely off trigger_dd]")
t3 = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
t3.update(10_000)
t3.update(9_100)  # -9%, triggers
ok("triggered", t3.update(9_100) == 0.25)
ok("still throttled at -5% (better than trigger, but not yet at restore)", t3.update(9_500) == 0.25)
ok("restored once back to -2% from the SAME peak (10,000, never moved down)", t3.update(9_800) == 1.0)

print("[peak only ever ratchets UP, never resets down during a drawdown]")
t4 = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
t4.update(10_000)
t4.update(9_000)   # -10%, triggers, peak stays 10,000
t4.update(9_820)   # -1.8% off the ORIGINAL 10,000 peak -- should restore
ok("restore measured against the original peak, not a reset one", t4.update(9_820) == 1.0)
t4.update(11_000)  # new genuine peak
ok("peak correctly advances on a real new high", t4.update(10_200) == 1.0)  # -7.3% off 11,000, still under trigger

print("[edge cases]")
t5 = DrawdownThrottle()
ok("None balance keeps prior (untouched) state", t5.update(None) == 1.0)
ok("non-positive balance keeps prior state, doesn't crash", t5.update(0) == 1.0)
t5.update(10_000)
t5.update(9_000)  # triggers (default trigger_dd=-8)
ok("None balance while throttled keeps the throttled mult, doesn't silently restore", t5.update(None) == t5.mult)

print("[sync_cfg reads config live]")
t6 = DrawdownThrottle()
t6.sync_cfg({"throttle_trigger_dd": -5.0, "throttle_restore_dd": -1.0, "throttle_mult": 0.5})
ok("trigger updated from cfg", t6.trigger_dd == -5.0)
ok("restore updated from cfg", t6.restore_dd == -1.0)
ok("mult updated from cfg", t6.mult == 0.5)

print("[snapshot/restore round-trips state across a restart]")
t7 = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
t7.update(10_000)
t7.update(9_000)  # triggers, peak=10,000
snap = t7.snapshot()
t8 = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
t8.restore(snap)
ok("restored peak matches", t8.update(9_820) == 1.0)   # -1.8% off restored 10,000 peak -> should already be at/above restore
t9 = DrawdownThrottle()
ok("restore(None) is a no-op, not a crash", (t9.restore(None), t9.update(10_000))[1] == 1.0)

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
