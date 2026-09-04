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

print("[chandelier_stop - extreme_since measures the run extreme from ENTRY, not the whole lookback]")
# A long that rallied to 1.1200, then opened a NEW position after price fell
# back. Bars 0-2 are pre-entry (they carry the 1.1200 high), bars 3-5 are the
# position's own life, topping out at 1.1030. This is the AUDUSD 2026-09-04
# shape: a stale high far above where the position actually traded.
mixed = [
    {"time": 1000, "high": 1.1200, "low": 1.1180, "close": 1.1190},
    {"time": 1060, "high": 1.1150, "low": 1.1120, "close": 1.1130},
    {"time": 1120, "high": 1.1100, "low": 1.1060, "close": 1.1070},
    {"time": 1180, "high": 1.1030, "low": 1.1000, "close": 1.1020},   # <- entry bar
    {"time": 1240, "high": 1.1025, "low": 1.0995, "close": 1.1005},
    {"time": 1300, "high": 1.1010, "low": 1.0990, "close": 1.1000},
]
ENTRY = 1180
whole = chandelier_stop(mixed, mult=3.0, period=60, is_long=True)
since = chandelier_stop(mixed, mult=3.0, period=60, is_long=True, extreme_since=ENTRY)
ok("extreme_since trails from the post-entry high (1.1030), not the stale 1.1200 -> lower stop",
   since < whole, f"since={since:.5f} whole={whole:.5f}")
ok("the gap is exactly the two highs difference (ATR unchanged - the same bars fed it)",
   abs((whole - since) - (1.1200 - 1.1030)) < 1e-9, f"gap={whole - since:.5f}")
ok("the stale version is the one sitting ABOVE the last close (unplaceable SL on a long)",
   whole > mixed[-1]["close"] and since < mixed[-1]["close"],
   f"whole={whole:.5f} since={since:.5f} close={mixed[-1]['close']}")

print("[chandelier_stop - extreme_since: ATR still walks EVERY bar, only best is filtered]")
tail_only = chandelier_stop([b for b in mixed if b["time"] >= ENTRY],
                            mult=3.0, period=60, is_long=True)
ok("filtering best is NOT the same as passing only post-entry bars (that reseeds the ATR)",
   abs(since - tail_only) > 1e-9, f"since={since:.5f} tail_only={tail_only:.5f}")

print("[chandelier_stop - extreme_since edge cases]")
ok("no bar at/after entry (position younger than its first bar) -> None, not a stale trail",
   chandelier_stop(mixed, mult=3.0, period=60, is_long=True, extreme_since=99999) is None)
ok("extreme_since=None keeps the old whole-window behaviour exactly",
   chandelier_stop(mixed, mult=3.0, period=60, is_long=True, extreme_since=None) == whole)
ok("bars with no time key are excluded rather than silently counted",
   chandelier_stop([{"high": 1.11, "low": 1.10, "close": 1.105}], mult=3.0,
                   is_long=True, extreme_since=0) is None)

print("[chandelier_stop - extreme_since on a SHORT mirrors it (best = post-entry LOW)]")
mixed_dn = [
    {"time": 1000, "high": 1.0820, "low": 1.0800, "close": 1.0810},   # stale pre-entry LOW
    {"time": 1060, "high": 1.0900, "low": 1.0870, "close": 1.0890},
    {"time": 1120, "high": 1.0960, "low": 1.0930, "close": 1.0950},   # <- entry bar
    {"time": 1180, "high": 1.0970, "low": 1.0940, "close": 1.0960},
]
whole_dn = chandelier_stop(mixed_dn, mult=3.0, period=60, is_long=False)
since_dn = chandelier_stop(mixed_dn, mult=3.0, period=60, is_long=False, extreme_since=1120)
ok("short: extreme_since trails from the post-entry low -> a higher stop than the stale one",
   since_dn > whole_dn, f"since={since_dn:.5f} whole={whole_dn:.5f}")
ok("short: gap is exactly the two lows difference",
   abs((since_dn - whole_dn) - (1.0930 - 1.0800)) < 1e-9)

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
