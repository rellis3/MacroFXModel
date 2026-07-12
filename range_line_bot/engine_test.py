"""Offline tests for the range-line bot strategy brick + engine (no MT5/network).
    python -m range_line_bot.engine_test   (from repo root)
"""
from datetime import datetime, timezone

from pylego.strategy.rangeline import (
    body_range, build_ladder, ladder_side, neighbours, trade_spec, chandelier_stop, cell_key,
    confluence_bucket, confluence_rank,
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
ok("session_open starts unset (the loop stamps it from the Asia window's first bar)",
   sess.session_open is None)
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

# Two ladders (Asia + Monday) can EACH produce a same-side spec in ONE tick — the
# condition the loop's single_position_per_pair guard collapses to one fill/pair/tick
# (else two coincident slots open identical duplicate positions before the broker's
# positions_get reflects the first). decide() itself returns one-per-(src,side).
print("[engine — two-source same-tick coincidence]")
MBARS = [
    {"time": 0,   "open": 100, "high": 100, "low": 100, "close": 100},
    {"time": 900, "open": 110, "high": 110, "low": 110, "close": 110},
]
sboth = RangeSession("eurusd", FIBS)
sboth.set_range("A", BARS)
ok("Monday ladder builds (15m body range)", sboth.set_range("M", MBARS) is True)
both = sboth.decide(115, {"A_1_up|": {"decision": "follow"}, "M_1_up|": {"decision": "follow"}})
ok("decide returns one spec PER source at a coincident touch (2 specs)", len(both) == 2)
ok("both specs are the same pair/side (loop must dedupe to one fill/tick)",
   {s["src"] for s in both} == {"A", "M"} and all(s["side"] == "up" for s in both))

print("[confluence bucket — parity with rangeLineAnalyser.confluenceBucketAt]")
CL = [{"price": 110.001, "source": "pivots"}, {"price": 110.002, "source": "poc"}, {"price": 120.0, "source": "vwap"}]
ok("2 distinct sources within tol → 3·multi", confluence_bucket(110.0, CL, 0.01) == "3·multi")
ok("1 source within tol → 2·single", confluence_bucket(110.0, [{"price": 110.001, "source": "pivots"}], 0.01) == "2·single")
ok("0 within tol → 1·none", confluence_bucket(110.0, CL, 0.0001) == "1·none")
ok("same source twice counts once", confluence_bucket(110.0, [{"price": 110.001, "source": "p"}, {"price": 110.002, "source": "p"}], 0.01) == "2·single")
ok("None when no levels / tol<=0", confluence_bucket(110.0, [], 0.01) is None and confluence_bucket(110.0, CL, 0) is None)
ok("rank: multi>single>none, unknown=-1", confluence_rank("3·multi") == 2 and confluence_rank("2·single") == 1 and confluence_rank("1·none") == 0 and confluence_rank(None) == -1)

print("[confluence gate in decide() — opt-in, direction unchanged]")
# Range 100-110 (mid 105); A_1 = 110 (up). Confluence: 2 sources at 110 → strong.
sg = RangeSession("eurusd", FIBS); sg.set_range("A", BARS)
sg.set_confluence([{"price": 110.0, "source": "pivots"}, {"price": 110.0, "source": "poc"}], tol_frac=0.1)   # tol = 0.1×10 = 1.0
polg = {"A_1_up|": {"decision": "follow"}}
ok("gate OFF (confluence_min=0) → trades as today", len(sg.decide(110, polg, confluence_min=0)) == 1)
sg2 = RangeSession("eurusd", FIBS); sg2.set_range("A", BARS)
sg2.set_confluence([{"price": 110.0, "source": "pivots"}, {"price": 110.0, "source": "poc"}], tol_frac=0.1)
ok("strong level passes the ≥2 gate", len(sg2.decide(110, polg, confluence_min=2)) == 1)
sg3 = RangeSession("eurusd", FIBS); sg3.set_range("A", BARS)
sg3.set_confluence([{"price": 130.0, "source": "pivots"}], tol_frac=0.1)     # nothing near 110 → 1·none
ok("bare level (no confluence) is gated out at ≥2", sg3.decide(110, polg, confluence_min=2) == [])
sg4 = RangeSession("eurusd", FIBS); sg4.set_range("A", BARS)
sg4.set_confluence([{"price": 110.0, "source": "pivots"}], tol_frac=0.1)     # 1 source → 2·single
ok("single-source level passes ≥1 but fails ≥2",
   len(sg4.decide(110, polg, confluence_min=1)) == 1)
sg5 = RangeSession("eurusd", FIBS); sg5.set_range("A", BARS)
sg5.set_confluence([{"price": 110.0, "source": "pivots"}], tol_frac=0.1)
ok("single-source level gated out at ≥2", sg5.decide(110, polg, confluence_min=2) == [])

print("[entry-slip audit — sign convention (pylego.costs)]")
from pylego.costs import entry_slip_pct
# Favourable is NEGATIVE: a BUY filled ABOVE the modeled level pays up (+); a
# SELL filled ABOVE the modeled level collects more (−). % of session open.
ok("BUY filled above the modeled level → adverse (+)", entry_slip_pct(True, 111.0, 110.0, 100.0) == 1.0)
ok("BUY filled below the modeled level → favourable (−)", entry_slip_pct(True, 109.0, 110.0, 100.0) == -1.0)
ok("SELL filled above the modeled level → favourable (−)", entry_slip_pct(False, 111.0, 110.0, 100.0) == -1.0)
ok("missing fill → None (never fabricate the measurement)", entry_slip_pct(True, None, 110.0, 100.0) is None)
ok("no denominator → None", entry_slip_pct(True, 111.0, 110.0, None) is None)

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
