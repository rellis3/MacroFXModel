"""Synthetic tests for the volatility_bot_v2 engine (touch detection + one-shot
+ bet direction). No network.
  python volatility_bot_v2/engine.py
  python volatility_bot_v2/engine_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from volatility_bot_v2.engine import (  # noqa: E402
    VoteSession, zone_key, should_fire, arm_above, bet_direction, make_spec, stack_conflict,
)

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'✓' if cond else '✗ FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1

FADE_UP = {"zone_id": "eurusd_2026-08-28_up_p50_1", "side": "up", "rung": "p50", "decision": "fade",
           "margin": 4, "entry": 1.1050, "sl": 1.1070, "tp": 1.1040, "rationale": "fade · margin 4"}
FOLLOW_DOWN = {"zone_id": "eurusd_2026-08-28_down_p75_1", "side": "down", "rung": "p75", "decision": "follow",
               "margin": 5, "entry": 1.0950, "sl": 1.0930, "tp": 1.0900, "rationale": "follow · margin 5"}

print("[bet_direction matches js betDirection exactly]")
ok("follow on an up-touch bets long", bet_direction({"decision": "follow", "side": "up"}) == "long")
ok("fade on a down-touch also bets long (mirrors follow+up)", bet_direction({"decision": "fade", "side": "down"}) == "long")
ok("follow on a down-touch bets short", bet_direction({"decision": "follow", "side": "down"}) == "short")
ok("fade on an up-touch also bets short", bet_direction({"decision": "fade", "side": "up"}) == "short")

print("[arm direction comes purely from side]")
ok("an 'up' rung arms from below (price must rise)", arm_above(FADE_UP) is True)
ok("a 'down' rung arms from above (price must fall)", arm_above(FOLLOW_DOWN) is False)

print("[should_fire / zone_key]")
ok("zone_key reads the plan's own zone_id verbatim", zone_key(FADE_UP) == "eurusd_2026-08-28_up_p50_1")
ok("up rung does not fire below entry", should_fire(FADE_UP, 1.1049) is False)
ok("up rung fires once price reaches entry", should_fire(FADE_UP, 1.1050) is True)
ok("up rung fires above entry too", should_fire(FADE_UP, 1.1060) is True)
ok("down rung does not fire above entry", should_fire(FOLLOW_DOWN, 1.0951) is False)
ok("down rung fires once price reaches entry", should_fire(FOLLOW_DOWN, 1.0950) is True)
ok("tol widens the trigger band on both sides", should_fire(FADE_UP, 1.1045, tol=0.0010) is True)

print("[make_spec: dir_up follows bet_direction, not side]")
spec_fade = make_spec("EURUSD", FADE_UP)
ok("a fade on an up rung -> SHORT (dir_up False)", spec_fade["dir_up"] is False, str(spec_fade))
spec_follow = make_spec("EURUSD", FOLLOW_DOWN)
ok("a follow on a down rung -> SHORT (dir_up False)", spec_follow["dir_up"] is False, str(spec_follow))
ok("spec carries entry/sl/tp straight from the zone", spec_fade["entry"] == 1.1050 and spec_fade["sl"] == 1.1070 and spec_fade["tp"] == 1.1040)

print("[VoteSession: fires once, primes overnight crossings, no re-entry]")
s = VoteSession("eurusd", [FADE_UP, FOLLOW_DOWN])
ok("no fire while price sits between the two entries", s.decide(1.1000) == [])
fired = s.decide(1.1050)
ok("up-rung zone fires when price reaches its entry", any(x["zone_id"] == FADE_UP["zone_id"] for x in fired))
s.mark_entered(FADE_UP["zone_id"])
ok("one-shot: an entered zone never fires again", all(x["zone_id"] != FADE_UP["zone_id"] for x in s.decide(1.1060)))

s2 = VoteSession("eurusd", [FADE_UP])
s2.decide(1.1055, dry_run=True, now=1000.0)   # price already past entry when the plan loaded
ok("dry_run primes a zone price has already passed", FADE_UP["zone_id"] in s2.primed)
ok("primed record carries when/price/entry for the dashboard", s2.primed[FADE_UP["zone_id"]]["price"] == 1.1055)
ok("a primed zone never fires for real either", s2.decide(1.1050) == [])

print("[set_zones preserves one-shot state across a plan refresh]")
s3 = VoteSession("eurusd", [FADE_UP])
s3.mark_entered(FADE_UP["zone_id"])
s3.set_zones([FADE_UP, FOLLOW_DOWN])   # SAME zone_id re-published + a genuinely new one
ok("the already-entered zone stays entered after a refresh", FADE_UP["zone_id"] in s3.entered)
ok("a new zone in the refreshed set is untouched", s3.decide(1.0950) != [])

print("[touches counts rising edges only]")
s4 = VoteSession("eurusd", [FADE_UP])
s4.decide(1.1049)   # not firing
s4.decide(1.1050)   # rising edge -> touch 1
s4.decide(1.1051)   # still firing, same edge
ok("touches counts rising edges, not every firing tick", s4.touches.get(FADE_UP["zone_id"]) == 1, str(s4.touches))

print("[stack_conflict]")
open_book = [{"symbol": "EURUSD", "direction": "SELL", "open_price": 1.1052, "ticket": 1}]
ok("a same-direction position within min_dist is a conflict", stack_conflict({"EURUSD"}, False, 1.1050, open_book, 0.0010) is not None)
ok("a position far away is NOT a conflict", stack_conflict({"EURUSD"}, False, 1.0900, open_book, 0.0010) is None)
ok("opposite direction is never a conflict", stack_conflict({"EURUSD"}, True, 1.1050, open_book, 0.0010) is None)
ok("min_dist=None disables the check (fail open)", stack_conflict({"EURUSD"}, False, 1.1050, open_book, None) is None)

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILURE(S)'}")
sys.exit(1 if fails else 0)
