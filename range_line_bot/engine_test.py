"""Offline tests for the range-line bot strategy brick + engine (no MT5/network).
    python -m range_line_bot.engine_test   (from repo root)
"""
from datetime import datetime, timezone

from pylego.strategy.rangeline import (
    body_range, build_ladder, ladder_side, neighbours, trade_spec, chandelier_stop, cell_key,
)
from range_line_bot.engine import RangeSession, session_anchor_epoch

_p = _f = 0


def ok(name, cond):
    global _p, _f
    if cond:
        _p += 1; print(f"  ✓ {name}")
    else:
        _f += 1; print(f"  ✗ {name}")


# A clean range: 5m body extremes low=100, high=110 (mid=105).
BARS = [
    {"time": 0,   "open": 105, "high": 106, "low": 99,  "close": 100},
    {"time": 300, "open": 108, "high": 111, "low": 107, "close": 110},
    {"time": 600, "open": 102, "high": 105, "low": 101, "close": 104},
]
FIBS = [-0.5, 0, 0.5, 1, 1.5]

print("[strategy brick]")
br = body_range(BARS, 5)
ok("body_range = open/close extremes (wicks ignored)", br == {"low": 100, "high": 110, "range": 10})

lad = build_ladder(100, 10, "A", FIBS)
labels = [r["label"] for r in lad]
ok("build_ladder labels match JS Number→String", labels == ["A_-0.5", "A_0", "A_0.5", "A_1", "A_1.5"])
ok("build_ladder prices = low + range*fib", [r["level"] for r in lad] == [95, 100, 105, 110, 115])

ok("ladder_side up above mid / dn at-or-below", ladder_side(110, 100, 110) == "up" and ladder_side(105, 100, 110) == "dn")

prices = [95, 100, 105, 110, 115]
i_up, o_up = neighbours(110, "up", prices)
ok("neighbours(up): inner=toward mid (below), outer=away (above)", i_up == 105 and o_up == 115)
i_dn, o_dn = neighbours(100, "dn", prices)
ok("neighbours(dn): inner=above, outer=below", i_dn == 105 and o_dn == 95)
ok("neighbours: extreme level (no barrier) → (None,None)", neighbours(115, "up", prices) == (None, None))

# follow on an up-level → buy, protect stop = inner (toward mid).
sp = trade_spec(110, "up", "follow", 105, 115)
ok("trade_spec follow/up → buy, stop=inner, rung=|outer-L|", sp == {"side": "buy", "entry": 110, "protect_stop": 105, "rung": 5})
# fade on an up-level → sell (revert down), protect stop = outer (away).
sp2 = trade_spec(110, "up", "fade", 105, 115)
ok("trade_spec fade/up → sell, stop=outer", sp2["side"] == "sell" and sp2["protect_stop"] == 115)
# fade on a dn-level → buy (revert up toward mid).
ok("trade_spec fade/dn → buy", trade_spec(100, "dn", "fade", 105, 95)["side"] == "buy")
ok("trade_spec skip cell → None", trade_spec(110, "up", "skip", 105, 115) is None)

# chandelier: long entry 110, peak 120, rung 5, stop=max(protect, peak-2.5)=117.5.
ok("chandelier long = max(protect, peak-frac*rung) once peak>entry", chandelier_stop(True, 110, 120, 5, 105, 0.5) == 117.5)
ok("chandelier long holds at protect until a new high past entry", chandelier_stop(True, 110, 110, 5, 105, 0.5) == 105)
ok("chandelier short = min(protect, peak+frac*rung) once peak<entry", chandelier_stop(False, 100, 90, 5, 105, 0.5) == 92.5)
ok("chandelier short holds at protect until a new low past entry", chandelier_stop(False, 100, 100, 5, 105, 0.5) == 105)

ok("cell_key = label_side| (empty condition bucket)", cell_key("A_1", "up") == "A_1_up|")

print("[engine — RangeSession]")
sess = RangeSession("nq", FIBS, chand_frac=0.5)
ok("set_range builds the Asia ladder", sess.set_range("A", BARS) is True)

# policy: follow the A_1 up-line; A_1.5 is also up but should be suppressed by the
# held-position (one per src/side) rule within a single tick.
policy = {"A_1_up|": {"decision": "follow"}, "A_1.5_up|": {"decision": "follow"}}
specs = sess.decide(115, policy)              # px 115 touches both 110 and 115
ok("decide returns exactly ONE spec (one per src/side per tick)", len(specs) == 1)
ok("decide picks the follow buy on A_1", specs[0]["label"] == "A_1" and specs[0]["side_order"] == "buy" and specs[0]["dir_up"])
ok("decide does NOT auto-burn the slot (only mark_entered does)", ("A", "up") not in sess.entered)
sess.mark_entered("A", "up")                  # the bot calls this after a SUCCESSFUL fill
ok("(src,side) slot taken after mark_entered", ("A", "up") in sess.entered)
specs2 = sess.decide(116, policy)             # same side touched again
ok("no re-entry on an already-taken (src,side)", specs2 == [])

# don't-burn-slot: a produced spec that is NOT marked entered (rejected order) can
# still be retried on a fresh session (slot never taken).
sret = RangeSession("nq", FIBS); sret.set_range("A", BARS)
sret.decide(110, {"A_1_up|": {"decision": "follow"}})     # A_1 touched, spec produced, NOT marked
ok("slot stays open when entry not marked (rejected order)", ("A", "up") not in sret.entered)

# skip cell → no trade; dn side independent of the up slot.
sess2 = RangeSession("eurusd", FIBS)
sess2.set_range("A", BARS)
ok("skip/unseen cell → no trade", sess2.decide(100, {"A_0_dn|": {"decision": "skip"}}) == [])

# dry_run primes (marks acted) but never trades.
sess3 = RangeSession("eurusd", FIBS)
sess3.set_range("A", BARS)
ok("dry_run primes without trading", sess3.decide(115, {"A_1_up|": {"decision": "follow"}}, dry_run=True) == [])
ok("primed level does not retro-fire", sess3.decide(115, {"A_1_up|": {"decision": "follow"}}) == [])

print("[engine — session anchor]")
# 2026-06-30 10:00:00 UTC; boundary 23 → most recent 23:00 UTC = 2026-06-29 23:00.
now = int(datetime(2026, 6, 30, 10, 0, 0, tzinfo=timezone.utc).timestamp())
anc = session_anchor_epoch(now, 23)
ok("anchor = most recent boundary_hour:00 UTC (prior day)",
   datetime.fromtimestamp(anc, tz=timezone.utc) == datetime(2026, 6, 29, 23, 0, 0, tzinfo=timezone.utc))
now2 = int(datetime(2026, 6, 30, 23, 30, 0, tzinfo=timezone.utc).timestamp())
ok("anchor = today's boundary when already past it",
   datetime.fromtimestamp(session_anchor_epoch(now2, 23), tz=timezone.utc) == datetime(2026, 6, 30, 23, 0, 0, tzinfo=timezone.utc))

print(f"\n{'✗' if _f else '✓'} {_p} passed, {_f} failed")
import sys
sys.exit(1 if _f else 0)
