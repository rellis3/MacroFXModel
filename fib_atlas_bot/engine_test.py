"""Synthetic tests for fib_atlas_bot's pure engine pieces. No network, no MT5.
  python3 fib_atlas_bot/engine_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fib_atlas_bot.engine import (      # noqa: E402
    RearmTracker, rearm_distance, zone_is_long, chandelier_stop, occupied_directions,
)

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'OK' if cond else 'FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1


print("[RearmTracker — priming: never retro-fires on the first observation]")
t = RearmTracker()
ok("price already past the rung on first sight -> primed, does NOT fire",
   t.touch("k1", "above", 1.1000, "2026-08-31", 1.1005, rearm_dist=0.0010) is False)
ok("... and it's left UNARMED (a real touch already happened before we existed)",
   t.is_armed("k1") is False)

t2 = RearmTracker()
ok("price NOT yet at the rung on first sight -> stays armed, doesn't fire",
   t2.touch("k2", "above", 1.1000, "2026-08-31", 1.0990, rearm_dist=0.0010) is False)
ok("... and IS armed (nothing has touched it yet)", t2.is_armed("k2") is True)

print("[RearmTracker — a genuine live touch fires exactly once]")
t3 = RearmTracker()
t3.touch("k3", "above", 1.1000, "2026-08-31", 1.0990, rearm_dist=0.0010)   # prime, armed
ok("price crosses UP through the rung -> fires",
   t3.touch("k3", "above", 1.1000, "2026-08-31", 1.1001, rearm_dist=0.0010) is True)
ok("immediately un-armed after firing", t3.is_armed("k3") is False)
ok("price still sitting past the rung -> does NOT fire again",
   t3.touch("k3", "above", 1.1000, "2026-08-31", 1.1002, rearm_dist=0.0010) is False)

print("[RearmTracker — 'below' side fires on a downward touch]")
t4 = RearmTracker()
t4.touch("k4", "below", 1.0900, "2026-08-31", 1.0910, rearm_dist=0.0010)  # prime, armed
ok("price crosses DOWN through the rung -> fires",
   t4.touch("k4", "below", 1.0900, "2026-08-31", 1.0899, rearm_dist=0.0010) is True)
ok("un-armed after firing", t4.is_armed("k4") is False)

print("[RearmTracker — rearm only after travelling rearm_dist away, and never on the re-arming tick itself]")
t5 = RearmTracker()
t5.touch("k5", "above", 1.1000, "2026-08-31", 1.0990, rearm_dist=0.0010)   # prime, armed
t5.touch("k5", "above", 1.1000, "2026-08-31", 1.1001, rearm_dist=0.0010)   # fires, unarmed
ok("still unarmed on a small pullback (< rearm_dist away)",
   (t5.touch("k5", "above", 1.1000, "2026-08-31", 1.0996, rearm_dist=0.0010), t5.is_armed("k5"))[1] is False)
ok("re-arms once price has travelled rearm_dist BACK below the rung, but does not fire on that same tick",
   t5.touch("k5", "above", 1.1000, "2026-08-31", 1.0989, rearm_dist=0.0010) is False)
ok("... and it IS now armed", t5.is_armed("k5") is True)
ok("a fresh touch on the NEXT tick fires",
   t5.touch("k5", "above", 1.1000, "2026-08-31", 1.1001, rearm_dist=0.0010) is True)

print("[RearmTracker — a new session date resets state fresh, even at the same key]")
t6 = RearmTracker()
t6.touch("k6", "above", 1.1000, "2026-08-31", 1.1001, rearm_dist=0.0010)   # fires, unarmed
ok("unarmed within the same day", t6.is_armed("k6") is False)
ok("new date -> primes fresh (price still past the rung -> primed unarmed, not a fire)",
   t6.touch("k6", "above", 1.1000, "2026-09-01", 1.1001, rearm_dist=0.0010) is False)
t7 = RearmTracker()
t7.touch("k7", "above", 1.1000, "2026-08-31", 1.1001, rearm_dist=0.0010)   # fires, unarmed
ok("new date with price now BELOW the rung -> primes armed and can fire again",
   (t7.touch("k7", "above", 1.1000, "2026-09-01", 1.0990, rearm_dist=0.0010),
    t7.touch("k7", "above", 1.1000, "2026-09-01", 1.1001, rearm_dist=0.0010))[1] is True)

print("[rearm_distance — exact rungSpan reconstruction from targetPips/sizingStopPips]")
fade_zone = {"decision": "fade", "targetPips": 12.0, "sizingStopPips": 30.0, "pip": 0.0001, "rearmFrac": 0.3}
ok("fade: rungSpan is targetPips (the INNER distance for a fade zone)",
   abs(rearm_distance(fade_zone) - 0.3 * 12.0 * 0.0001) < 1e-12)
follow_zone = {"decision": "follow", "targetPips": 30.0, "sizingStopPips": 12.0, "pip": 0.0001, "rearmFrac": 0.3}
ok("follow: rungSpan is sizingStopPips (the INNER distance for a follow zone)",
   abs(rearm_distance(follow_zone) - 0.3 * 12.0 * 0.0001) < 1e-12)
ok("defaults rearmFrac to 0.3 when absent",
   abs(rearm_distance({"decision": "fade", "targetPips": 10.0, "sizingStopPips": 20.0, "pip": 0.0001})
       - 0.3 * 10.0 * 0.0001) < 1e-12)

print("[zone_is_long — reads direction off the zone's own tp-vs-entry sign]")
ok("tp above entry -> long", zone_is_long({"entry": 1.1000, "tp": 1.1020, "sl": 1.0980}) is True)
ok("tp below entry -> short", zone_is_long({"entry": 1.1000, "tp": 1.0980, "sl": 1.1020}) is False)

print("[chandelier_stop — edge cases]")
ok("empty bars -> None", chandelier_stop([], mult=3.0) is None)
one_bar = [{"high": 1.1010, "low": 1.0990, "close": 1.1000}]
r = chandelier_stop(one_bar, mult=3.0, is_long=True)
ok("single bar still computes (ATR seeded at bar0's own H-L)", r is not None)
ok("single-bar long: best(high)=1.1010, atr=H-L=0.0020 -> 1.1010 - 3*0.0020 = 1.0950",
   abs(r - (1.1010 - 3.0 * 0.0020)) < 1e-9, f"got {r}")

print("[chandelier_stop — long trails BELOW the running high by mult*ATR, never above]")
bars_up = [
    {"high": 1.1010, "low": 1.0990, "close": 1.1000},
    {"high": 1.1030, "low": 1.1005, "close": 1.1025},
    {"high": 1.1050, "low": 1.1020, "close": 1.1045},
    {"high": 1.1060, "low": 1.1040, "close": 1.1055},
]
stop_up = chandelier_stop(bars_up, mult=2.0, period=60, is_long=True)
best_up = max(b["high"] for b in bars_up)
ok("long stop sits below the running best high", stop_up < best_up)
ok("long stop is a finite, sane number near price (not NaN/absurd)", 1.0 < stop_up < 1.2)

print("[chandelier_stop — short trails ABOVE the running low by mult*ATR, never below]")
bars_dn = [
    {"high": 1.1010, "low": 1.0990, "close": 1.1000},
    {"high": 1.0985, "low": 1.0965, "close": 1.0970},
    {"high": 1.0960, "low": 1.0940, "close": 1.0945},
    {"high": 1.0940, "low": 1.0920, "close": 1.0925},
]
stop_dn = chandelier_stop(bars_dn, mult=2.0, period=60, is_long=False)
best_dn = min(b["low"] for b in bars_dn)
ok("short stop sits above the running best low", stop_dn > best_dn)

print("[chandelier_stop — a wider chandelier_mult trails further away (looser stop)]")
tight = chandelier_stop(bars_up, mult=1.0, period=60, is_long=True)
loose = chandelier_stop(bars_up, mult=5.0, period=60, is_long=True)
ok("mult=5 trails further below price than mult=1", loose < tight)

print("[chandelier_stop — flat bars (zero range after bar0) hold ATR near the seed, never crash]")
flat = [{"high": 1.1000, "low": 1.1000, "close": 1.1000} for _ in range(5)]
flat[0] = {"high": 1.1010, "low": 1.0990, "close": 1.1000}   # seed bar has real range
r_flat = chandelier_stop(flat, mult=3.0, period=60, is_long=True)
ok("doesn't crash / returns a number on degenerate (flat) bars", isinstance(r_flat, float))

print("[occupied_directions — hedge-only concurrency: which direction(s) are already open for THIS (pair, ladder)]")
EG = {"eurgbp", "EURGBP"}
ok("no open positions on this pair -> empty",
   occupied_directions([], {}, EG, "asia") == set())
book_one_long = [{"ticket": 1, "symbol": "EURGBP", "direction": "BUY"}]
ok("one open long on this (pair, ladder) -> {'BUY'} occupied",
   occupied_directions(book_one_long, {1: "asia"}, EG, "asia") == {"BUY"})
ok("SAME position, but querying a DIFFERENT ladder -> not occupied (ladders are independent budgets)",
   occupied_directions(book_one_long, {1: "asia"}, EG, "monday") == set())
book_hedged = [{"ticket": 1, "symbol": "EURGBP", "direction": "BUY"},
               {"ticket": 2, "symbol": "EURGBP", "direction": "SELL"}]
ok("one long + one short already open (a genuine hedge) -> BOTH directions occupied",
   occupied_directions(book_hedged, {1: "asia", 2: "asia"}, EG, "asia") == {"BUY", "SELL"})
book_other_pair = [{"ticket": 1, "symbol": "GBPUSD", "direction": "BUY"}]
ok("a position on a DIFFERENT pair's symbol -> ignored entirely",
   occupied_directions(book_other_pair, {1: "asia"}, EG, "asia") == set())
ok("a ticket this bot never tracked the ladder for (opened before restart) -> ignored, not guessed",
   occupied_directions(book_one_long, {}, EG, "asia") == set())

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
