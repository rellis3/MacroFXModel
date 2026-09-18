"""Synthetic tests for the live drawdown throttle. No network.
  python volatility_bot_v3/drawdown_throttle_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from volatility_bot_v3.drawdown_throttle import DrawdownThrottle  # noqa: E402

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

print("[manual reset() override — bot-config page's 'Reset throttle now' button]")
t10 = DrawdownThrottle(trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
t10.update(10_000)
t10.update(9_000)  # -10%, triggers, peak=10,000
ok("triggered before reset", t10.update(9_000) == 0.25)
t10.reset()
ok("reset() clears throttled state immediately, no waiting for restore_dd", t10.update(9_000) == 1.0)
ok("reset() clears the running peak — re-seeds from the NEXT balance given, not the old 10,000", t10.update(9_000) == 1.0)
t10.update(9_500)  # a real new high above the re-seeded 9,000 peak
ok("peak re-seeded from post-reset balance, not stuck at the old one", t10.update(8_800) == 1.0)  # -7.4% off 9,500, still under -8% trigger

print("[graded mode — steps through tiers on the way down and back up]")
t11 = DrawdownThrottle(mode="graded")  # default tiers: (-4,.65) (-6,.40) (-8,.25), restore -2
ok("full size while flat/growing", t11.update(10_000) == 1.0)
ok("full size on a small, sub-first-tier dip", t11.update(9_700) == 1.0)  # -3% off peak
t11b = DrawdownThrottle(mode="graded")
t11b.update(10_000)
ok("shallowest tier (.65) applied the SAME call once past -4%", t11b.update(9_550) == 0.65)  # -4.5% off peak
ok("mid tier (.40) once past -6%", t11b.update(9_300) == 0.40)  # -7% off peak
ok("deepest tier (.25) once past -8%", t11b.update(9_000) == 0.25)  # -10% off peak
ok("stays at deepest tier on a further dip", t11b.update(8_500) == 0.25)

print("[graded mode — restore behaviour matches cliff (hysteresis off the SAME peak, never resets)]")
t12 = DrawdownThrottle(mode="graded")
t12.update(10_000)
t12.update(9_000)   # -10%, throttles at the deepest tier, peak stays 10,000
ok("throttled at the floor", t12.update(9_000) == 0.25)
ok("still throttled while only back to -3% (better than -2%? no -- -3 < -2, i.e. NOT yet recovered)", t12.update(9_700) == 0.65)  # eased back up a tier, still throttled
ok("fully restores once back to -2% off the ORIGINAL peak", t12.update(9_800) == 1.0)

print("[graded mode — sync_cfg reads throttle_mode from live config, falls back to cliff on anything else]")
t13 = DrawdownThrottle()
t13.sync_cfg({"throttle_mode": "graded"})
ok("mode switches to graded", t13.mode == "graded")
t13.sync_cfg({"throttle_mode": "cliff"})
ok("mode switches back to cliff", t13.mode == "cliff")
t13.sync_cfg({"throttle_mode": "something_unrecognized"})
ok("an unrecognized mode falls back to cliff, not a crash/silent graded", t13.mode == "cliff")
t14 = DrawdownThrottle(mode="graded")
t14.sync_cfg({})
ok("sync_cfg with no throttle_mode key preserves the constructor's mode", t14.mode == "graded")

print("[graded mode — snapshot/restore round-trips mode and last mult too]")
t15 = DrawdownThrottle(mode="graded")
t15.update(10_000)
t15.update(9_000)  # triggers at the floor tier
snap15 = t15.snapshot()
ok("snapshot reports mode", snap15["mode"] == "graded")
ok("snapshot reports the active mult", snap15["mult"] == 0.25)
t16 = DrawdownThrottle(mode="graded")
t16.restore(snap15)
ok("restored throttled state", t16._throttled is True)
ok("restored last mult, usable before the first post-restart update() call", t16._last_mult == 0.25)

print("[graded mode — an invalid/garbage mode string never crashes, silently coerces to cliff]")
t17 = DrawdownThrottle(mode="not-a-real-mode", trigger_dd=-8.0, restore_dd=-2.0, mult=0.25)
ok("constructor coerces an unrecognized mode to cliff", t17.mode == "cliff")
t17.update(10_000)
ok("behaves as cliff (not graded) after coercion", t17.update(9_100) == 0.25)  # -9%, past cliff trigger -8

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
