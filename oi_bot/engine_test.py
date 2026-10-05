"""Synthetic tests for the OI bot engine (touch detection + one-shot). No network.
  python oi_bot/engine_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from oi_bot.engine import (OISession, opposing_position, zone_id, should_fire, make_spec, maxpain_stop,  # noqa: E402
                           _tp, stack_conflict, position_mode)

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'✓' if cond else '✗ FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1

# Gold-ish PIN plan: spot 4200, fade the call wall 4300 (sell), fade put wall 4100 (buy).
SELL_FADE = {"mode": "fade", "side": "sell", "level": 4300, "entry": 4300, "sl": 4305, "tp1": 4200, "tp2": 4100, "sizeFactor": 1.8, "regime": "PIN", "rationale": "PIN call wall"}
BUY_FADE  = {"mode": "fade", "side": "buy",  "level": 4100, "entry": 4100, "sl": 4095, "tp1": 4200, "tp2": 4300, "sizeFactor": 1.5, "regime": "PIN", "rationale": "PIN put wall"}
# BREAKOUT: follow a call-wall break up (entry above spot), a put-wall break down (below).
BUY_BREAK  = {"mode": "break", "side": "buy",  "level": 4300, "entry": 4320, "sl": 4295, "tp1": None, "tp2": None, "sizeFactor": 1.5, "regime": "BREAKOUT", "rationale": "squeeze up"}
SELL_BREAK = {"mode": "break", "side": "sell", "level": 4100, "entry": 4080, "sl": 4105, "tp1": None, "tp2": None, "sizeFactor": 1.5, "regime": "BREAKOUT", "rationale": "squeeze down"}
MAXPAIN = {"mode": "maxpain", "side": "sell", "level": 4200, "entry": 4260, "sl": 4310, "tp1": 4200, "tp2": None, "sizeFactor": 1.0, "regime": "PIN", "rationale": "max-pain reversion 1DTE"}

print("[zone_id stable + TP fallback]")
ok("zone_id is mode_side_level", zone_id(SELL_FADE) == "fade_sell_4300")
ok("TP = tp1 when present", _tp(SELL_FADE) == 4200)
ok("TP falls back to tp2", _tp({"tp1": None, "tp2": 4100}) == 4100)
ok("TP = 0 when neither (SL-only)", _tp({"tp1": None, "tp2": None}) == 0.0)

print("[fade fires when price REACHES the wall from the plan side]")
s = OISession("gold", 4200, [SELL_FADE, BUY_FADE])
ok("no fire while price sits between the walls", s.decide(4200) == [])
ok("sell fade fires when price RISES to the call wall", any(x["zone_id"] == "fade_sell_4300" for x in s.decide(4300)))
s.mark_entered("fade_sell_4300")
ok("one-shot: an entered zone never fires again", all(x["zone_id"] != "fade_sell_4300" for x in s.decide(4305)))
s2 = OISession("gold", 4200, [BUY_FADE])
ok("buy fade fires when price FALLS to the put wall", any(x["zone_id"] == "fade_buy_4100" for x in s2.decide(4100)))

print("[break fires in the follow direction]")
sb = OISession("gold", 4200, [BUY_BREAK, SELL_BREAK])
ok("no fire before the break", sb.decide(4200) == [])
ok("buy break fires past wall+brk (4320)", any(x["zone_id"] == "break_buy_4300" and x["dir_up"] for x in sb.decide(4320)))
sb2 = OISession("gold", 4200, [SELL_BREAK])
ok("sell break fires past wall-brk (4080)", any(x["zone_id"] == "break_sell_4100" and not x["dir_up"] for x in sb2.decide(4080)))

print("[priming — never retro-enter an overnight crossing]")
sp = OISession("gold", 4200, [SELL_FADE, BUY_FADE])
# Bot starts with price already ABOVE the call wall (4310) → prime it away, don't sell into a broken wall.
sp.decide(4310, dry_run=True, now=1000.0)
ok("primed call-wall fade does NOT fire later", all(x["zone_id"] != "fade_sell_4300" for x in sp.decide(4300)))
ok("the un-primed put-wall fade still fires", any(x["zone_id"] == "fade_buy_4100" for x in sp.decide(4100)))
# Priming now records WHEN + at what price, and how far past the entry — so a "hit but
# no trade" is legible (was a silent set before).
rec = sp.primed.get("fade_sell_4300")
ok("primed record stores the time", rec and rec["at"] == 1000.0, str(rec))
ok("primed record stores the price + entry", rec and rec["price"] == 4310 and rec["entry"] == 4300, str(rec))
ok("primed record stores how far price was past the entry", rec and rec["past"] == 10, str(rec))
ok("un-primed zone has no record", "fade_buy_4100" not in sp.primed)

print("[priming ignores the touch tolerance — approach is not crossing]")
# The two real gold skips from 2026-09-16, reproduced with the fixtures' geometry.
# A 2-point tolerance makes a LIVE touch fire when price is within 2 of the level.
# Priming must not inherit that: price 1 point SHORT of a level has not gone through it.
sa = OISession("gold", 4200, [SELL_FADE, BUY_FADE])
sa.decide(4299, dry_run=True, tol=2.0, now=1.0)    # 1 below the 4300 resistance, approaching
ok("sell fade 1pt BELOW resistance is NOT primed (was: bug-primed via tol)",
   "fade_sell_4300" not in sa.primed, str(sa.primed))
sa.decide(4101, dry_run=True, tol=2.0, now=2.0)    # 1 above the 4100 support, approaching
ok("buy fade 1pt ABOVE support is NOT primed (was: bug-primed via tol)",
   "fade_buy_4100" not in sa.primed, str(sa.primed))
ok("...and both still fire on a live touch inside tol",
   any(x["zone_id"] == "fade_sell_4300" for x in sa.decide(4299, tol=2.0))
   and any(x["zone_id"] == "fade_buy_4100" for x in sa.decide(4101, tol=2.0)))

sb2 = OISession("gold", 4200, [SELL_FADE, BUY_FADE])
sb2.decide(4301, dry_run=True, tol=2.0, now=3.0)   # 1 THROUGH the resistance
ok("sell fade 1pt THROUGH resistance IS primed (genuine crossing, tol irrelevant)",
   "fade_sell_4300" in sb2.primed and sb2.primed["fade_sell_4300"]["past"] == 1)
sb2.decide(4099, dry_run=True, tol=2.0, now=4.0)
ok("buy fade 1pt THROUGH support IS primed", "fade_buy_4100" in sb2.primed)

sc = OISession("gold", 4200, [SELL_FADE])
sc.decide(4300, dry_run=True, tol=2.0, now=5.0)    # exactly ON the level
ok("price exactly AT the level is 'at', not 'past' -> not primed",
   "fade_sell_4300" not in sc.primed)
ok("...and it fires live at the level", any(x["zone_id"] == "fade_sell_4300" for x in sc.decide(4300)))

print("[maxpain — enters near current price, never primed]")
sm = OISession("gold", 4260, [MAXPAIN])
sm.decide(4260, dry_run=True)                      # priming must NOT swallow maxpain
specs = sm.decide(4258)
ok("maxpain fires on the next live tick", any(x["zone_id"] == "maxpain_sell_4200" for x in specs))
ok("maxpain spec carries SL + TP toward pin", specs and specs[0]["sl"] == 4310 and specs[0]["tp"] == 4200)

print("[position_mode — a live position's mode from its own comment tag]")
ok("fade parsed from the dedup tag", position_mode("OI [fade_sell_4300]") == "fade")
ok("runner suffix stripped", position_mode("OI [break_buy_4300~r]") == "break")
ok("maxpain + react recognised", position_mode("[maxpain_sell_4200]") == "maxpain" and position_mode("[react_buy_4210]") == "react")
ok("unknown tag → None (never guess a mode)", position_mode("OI [garbage]") is None)
ok("no tag / empty / None → None", position_mode("Vol L1 fade") is None and position_mode("") is None and position_mode(None) is None)

print("[maxpain fire-time revalidation — minDist re-checks the extension live]")
MP2 = {**MAXPAIN, "minDist": 30}
sm2 = OISession("gold", 4260, [MP2])
ok("still extended (45 >= 30) → fires", any(x["zone_id"] == "maxpain_sell_4200" for x in sm2.decide(4245)))
sm3 = OISession("gold", 4260, [MP2])
ok("price already back at the pin (10 < 30) → does NOT fire", sm3.decide(4210) == [])
ok("wrong side of the pin → does NOT fire (a sell must be ABOVE it)", sm3.decide(4180) == [])
ok("fires once the extension returns", any(x["zone_id"] == "maxpain_sell_4200" for x in sm3.decide(4250)))
ok("no minDist on the zone → old fire-immediately behaviour", any(OISession("gold", 4260, [MAXPAIN]).decide(4205)))

print("[maxpain stop is RE-ANCHORED to live price — the plan's spot is a daily capture]")
# The 2026-09-01 spx case: the plan's spot (7684.25) is the 05:17Z OI capture, the pin is
# 7701.5, and the stamped stop 7667 is spot − 1.0 × the distance to the pin. By midday the
# market is 7640 — the planned stop sits 27 points ABOVE it, so the BUY is rejected with
# "Invalid stops" on every retry, and the trigger only gets stronger as price runs away.
SPX_MP = {"mode": "maxpain", "side": "buy", "level": 7701.5, "entry": 7684.25, "sl": 7667,
          "tp1": 7701.5, "tp2": None, "minDist": 11.060831, "sizeFactor": 1.0,
          "slGuardWall": 7650, "slFrac": 1.0, "slFloor": 5, "slDist": 17.25,
          "regime": "BREAKOUT", "rationale": "max-pain reversion 1DTE"}
smp = OISession("spx", 7684.25, [SPX_MP])
spx = smp.decide(7640.0)
ok("the stale zone still fires (running from the pin strengthens the trigger)", len(spx) == 1)
ok("stop is re-anchored BELOW live price, not left at the plan's 7667",
   spx and spx[0]["sl"] < 7640.0, str(spx and spx[0]["sl"]))
ok("entry is live price, not the capture's spot", spx and spx[0]["entry"] == 7640.0)
ok("spec says which anchor it used", spx and spx[0]["sl_anchor"] == "live")
ok("guard wall 7650 is behind price → ignored, cap does the work (61.5 = 1.0 × pin distance)",
   spx and abs(spx[0]["sl"] - (7640.0 - 61.5)) < 1e-6, str(spx and spx[0]["sl"]))
ok("reward:risk ≥ 1/slFrac against the LIVE pin distance",
   spx and (spx[0]["tp"] - spx[0]["entry"]) / (spx[0]["entry"] - spx[0]["sl"]) >= 1.0)

print("[maxpain stop — resolution mirrors the planner's own]")
ok("a guard wall still on the protective side wins when it is nearer than the cap",
   maxpain_stop({**SPX_MP, "slGuardWall": 7630}, 7640.0) == 7640.0 - (10 + 5))
ok("sell side mirrors (stop ABOVE live price)",
   maxpain_stop({**SPX_MP, "side": "sell", "level": 7600, "slGuardWall": None}, 7640.0)
   == 7640.0 + 40)
ok("floored at slFloor so the stop is never inside the noise band",
   maxpain_stop({**SPX_MP, "slGuardWall": None}, 7701.0) == 7701.0 - 5)
ok("no ingredients (older plan shape) → None, caller keeps the stamped sl",
   maxpain_stop(MAXPAIN, 4258) is None)
mp_legacy = make_spec("gold", MAXPAIN, 4258)
ok("legacy maxpain spec keeps the plan's stop and SAYS so",
   mp_legacy["sl"] == 4310 and mp_legacy["sl_anchor"] == "plan")
ok("strike-anchored modes are untouched by a live px",
   make_spec("gold", SELL_FADE, 4310)["sl"] == 4305 and make_spec("gold", SELL_FADE, 4310)["entry"] == 4300)

print("[break dwell — a wick through the trigger is not a decisive break]")
sd = OISession("gold", 4200, [BUY_BREAK])
ok("1st tick past the trigger (confirm=2) → no fire yet", sd.decide(4321, break_confirm=2) == [])
ok("wick back inside resets the streak", sd.decide(4310, break_confirm=2) == [] and sd.streak["break_buy_4300"] == 0)
sd.decide(4321, break_confirm=2)
ok("2nd consecutive tick past it → fires", any(x["zone_id"] == "break_buy_4300" for x in sd.decide(4322, break_confirm=2)))
ok("fades are NOT dwell-gated (touch = the trade)", any(OISession("gold", 4200, [SELL_FADE]).decide(4300, break_confirm=3)))
ok("confirm=0 → old first-touch behaviour", any(OISession("gold", 4200, [BUY_BREAK]).decide(4321, break_confirm=0)))

print("[touch counting — rising edges, for the hold-score calibration]")
st = OISession("gold", 4200, [SELL_FADE])
st.decide(4300); st.decide(4310); st.decide(4200); st.decide(4300)
ok("two separate visits to the wall = 2 touches (not 3 ticks)", st.touches.get("fade_sell_4300") == 2, str(st.touches))

print("[spec shape]")
spec = make_spec("gold", SELL_FADE)
ok("dir_up False for a sell", spec["dir_up"] is False)
ok("size_factor carried through", spec["size_factor"] == 1.8)
ok("rationale + regime carried (for the comment/audit)", spec["rationale"] == "PIN call wall" and spec["regime"] == "PIN")
ok("tp2 rides the spec (scale-out runner target)", spec["tp2"] == 4100)
spec2 = make_spec("gold", {**SELL_FADE, "hold": 0.72, "holdParts": {"gex": 0.9}, "conviction": 1.3})
ok("hold score + components + conviction ride the spec (calibration features)",
   spec2["hold"] == 0.72 and spec2["hold_parts"] == {"gex": 0.9} and spec2["conviction"] == 1.3)
spec3 = make_spec("gold", {**SELL_FADE, "sizeBreakdown": {"base": 1.8, "vanna": 1.15, "hold": 1.26, "capped": False}})
ok("sizeBreakdown rides the spec as size_breakdown (the audit trail for a REAL fired trade)",
   spec3["size_breakdown"] == {"base": 1.8, "vanna": 1.15, "hold": 1.26, "capped": False})
ok("no sizeBreakdown on the zone (older plan shape) -> None, never a KeyError",
   make_spec("gold", SELL_FADE)["size_breakdown"] is None)

print("[guards]")
ok("px None → no fire", OISession("gold", 4200, [SELL_FADE]).decide(None) == [])
ok("no zones → no fire", OISession("gold", 4200, []).decide(4300) == [])

print("[stack guard — one bet, not two: same instrument + direction near an open]")
SYMS = {"gbpusd", "GBPUSD"}
# One long GBPUSD already open at 1.34525; a second long zone at 1.34526 is 0.1 pip away.
OPEN = [{"symbol": "gbpusd", "direction": "BUY", "open_price": 1.34525, "ticket": 111}]
ok("blocks a same-dir entry within min_dist",
   stack_conflict(SYMS, True, 1.34526, OPEN, 0.0010) is not None)
ok("returns the actual conflicting position",
   (stack_conflict(SYMS, True, 1.34526, OPEN, 0.0010) or {}).get("ticket") == 111)
ok("allows a genuinely distant same-dir level (60 pips away)",
   stack_conflict(SYMS, True, 1.35125, OPEN, 0.0010) is None)
ok("opposite direction is never a stack (a hedge, not a double)",
   stack_conflict(SYMS, False, 1.34526, OPEN, 0.0010) is None)
ok("different instrument is never a stack",
   stack_conflict(SYMS, True, 1.34526,
                  [{"symbol": "eurusd", "direction": "BUY", "open_price": 1.34525, "ticket": 9}],
                  0.0010) is None)
ok("matches the VENUE symbol spelling too (MT5 book)",
   stack_conflict(SYMS, True, 1.34526,
                  [{"symbol": "GBPUSD", "direction": "BUY", "open_price": 1.34525, "ticket": 7}],
                  0.0010) is not None)
ok("negative min_dist disables the guard",
   stack_conflict(SYMS, True, 1.34525, OPEN, -1) is None)
print("[2026-09-25 NQ replay — guard-wall ladder + implied-move TP cap]")
# The real trade: max-pain sell, pin 30090.85, fired at px 30691.7 — 0.85 past the 30690.85
# guard wall. Old engine: guard dropped → stop = full pin distance → 31292.55 (live SL was
# 31292.5). Implied move that day (1-DTE straddle) 232.75; slFloor 23.275 (0.10 × refMove).
NQ_MP = {"mode": "maxpain", "side": "sell", "level": 30090.85, "entry": 30530.35, "sl": 30714.0,
         "tp1": 30090.85, "tp2": None, "minDist": 58.19, "sizeFactor": 1.0,
         "slGuardWall": 30690.85, "slFrac": 1.0, "slFloor": 23.275, "slDist": 183.8,
         "regime": "PIN", "rationale": "max-pain reversion 1DTE"}
old = make_spec("nq", NQ_MP, 30691.7)
ok("REPRODUCES the live bug: single guard wall behind px → 601pt stop at 31292.55",
   abs(old["sl"] - 31292.55) < 1e-6, str(old["sl"]))
LADDER = {**NQ_MP, "slGuardWalls": [30490.85 + 200, 30790.85, 31290.85]}
new = make_spec("nq", LADDER, 30691.7)
ok("ladder → the NEXT wall up (30790.85) guards: stop 30790.85 + 23.275",
   abs(new["sl"] - (30790.85 + 23.275)) < 1e-6, str(new["sl"]))
ok("ladder ignores walls already behind live price",
   maxpain_stop({**LADDER, "slGuardWalls": [30690.85]}, 30691.7) == round(30691.7 + 600.85, 6))
CAPPED = {**LADDER, "tpCapDist": 232.75, "minRR": 0.8}
c = make_spec("nq", CAPPED, 30691.7)
ok("TP capped at 1× implied move from the LIVE entry (30691.7 − 232.75)",
   abs(c["tp"] - (30691.7 - 232.75)) < 1e-6 and c["tp_capped"], str(c["tp"]))
ok("capped trade still clears minRR with the ladder stop (≈1.9R) → not skipped",
   c["rr_skip"] is None)
c_old = make_spec("nq", {**NQ_MP, "tpCapDist": 232.75, "minRR": 0.8}, 30691.7)
ok("capped target against the OLD 601pt stop → 0.39R → rr_skip (never entered)",
   c_old["rr_skip"] is not None and c_old["rr_skip"] < 0.8, str(c_old["rr_skip"]))
ok("a target already inside the cap is untouched",
   make_spec("gold", {**SELL_FADE, "tpCapDist": 500}, None)["tp"] == 4200)
ok("no tpCapDist (older plan) → TP unchanged, no skip",
   make_spec("nq", LADDER, 30691.7)["tp"] == 30090.85)
bf = make_spec("gold", {**BUY_FADE, "tpCapDist": 50, "tp2": 4300}, None)
ok("buy side caps upward, and tp1/tp2 both capped collapse to one target",
   bf["tp"] == 4150 and bf["tp2"] is None, f"{bf['tp']} {bf['tp2']}")

# 2026-09-28 NQ: the 5-min basis refresh re-projects every strike, the zone_id (which
# carries the level) changes, and a stopped-out max-pain sell fired again — three
# times inside an hour, each stopped at the next wall. One zone, one trade.
def _mp(shift):
    return {"mode": "maxpain", "side": "sell", "level": 29654.95 + shift, "entry": 30100,
            "minDist": 60, "sl": 30500, "slGuardWalls": [30254.95 + shift, 30304.95 + shift],
            "slFrac": 1.0, "slFloor": 25, "tp1": 29654.95 + shift, "sizeFactor": 1}
rs = OISession("nq", 30100, [_mp(0.0)])
fired = []
for px, shift in [(30182.3, 0.0), (30231.3, 0.35), (30241.4, -0.2)]:
    rs.set_zones(30100, [_mp(shift)])
    for sp in rs.decide(px):
        fired.append(sp["zone_id"]); rs.mark_entered(sp["zone_id"])
ok("basis-shifted max-pain zone does NOT re-fire after its trade (1 entry, not 3)",
   len(fired) == 1, str(fired))
fz = {"mode": "fade", "side": "sell", "level": 30804.95, "entry": 30804.95, "sl": 30830, "tp1": 30700}
rs2 = OISession("nq", 30700, [fz]); rs2.mark_entered(zone_id(fz))
rs2.set_zones(30700, [{**fz, "level": 30805.4, "entry": 30805.4}])
ok("fade re-projected by 0.45pt is still the traded zone", rs2.decide(30806) == [])
rs2.set_zones(30700, [{**fz, "level": 30854.95, "entry": 30854.95}])
ok("the NEXT wall (50pt away) is a different zone and still fires", len(rs2.decide(30855)) == 1)

ch = OISession("nq", 30100, [_mp(0.0)])
ok("first chain set → nothing dropped", ch.set_chain("oi:1") is False)
ch.mark_entered(zone_id(_mp(0.0)))
ok("same chain (basis re-plan) keeps the one-shot state",
   ch.set_chain("oi:1") is False and ch.decide(30241.4) == [])
ok("NEW chain (next day's capture) resets it → today's max pain can trade once",
   ch.set_chain("oi:2") is True and len(ch.decide(30241.4)) == 1)

# 2026-10-05 gold: fade_buy_4142.13 filled 13:39 (long), then the same wall came back as
# fade_sell_4142.39 after price dipped under it and filled 13:50 (short). Both open at once.
GSYMS = {"gold", "XAUUSD"}
book = [{"symbol": "XAUUSD", "direction": "BUY", "open_price": 4144.34, "ticket": 43174711}]
ok("a SELL while this bot is long gold is an opposing position", opposing_position(GSYMS, False, book)["ticket"] == 43174711)
ok("another BUY is not opposing (that is the stack guard's question)", opposing_position(GSYMS, True, book) is None)
ok("a different instrument's long does not block a gold sell",
   opposing_position(GSYMS, False, [{"symbol": "US100", "direction": "BUY", "ticket": 1}]) is None)
ok("flat book → nothing opposes", opposing_position(GSYMS, False, []) is None)

ok("empty book → nothing to conflict with",
   stack_conflict(SYMS, True, 1.34526, [], 0.0010) is None)
ok("missing open_price is skipped, not crashed",
   stack_conflict(SYMS, True, 1.34526,
                  [{"symbol": "gbpusd", "direction": "BUY", "ticket": 5}], 0.0010) is None)

print(f"\n{'ALL PASSED ✓' if fails == 0 else str(fails) + ' FAILED ✗'}")
sys.exit(0 if fails == 0 else 1)
