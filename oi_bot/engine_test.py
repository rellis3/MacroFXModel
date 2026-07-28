"""Synthetic tests for the OI bot engine (touch detection + one-shot). No network.
  python oi_bot/engine_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from oi_bot.engine import OISession, zone_id, should_fire, make_spec, _tp  # noqa: E402

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

print("[maxpain — enters near current price, never primed]")
sm = OISession("gold", 4260, [MAXPAIN])
sm.decide(4260, dry_run=True)                      # priming must NOT swallow maxpain
specs = sm.decide(4258)
ok("maxpain fires on the next live tick", any(x["zone_id"] == "maxpain_sell_4200" for x in specs))
ok("maxpain spec carries SL + TP toward pin", specs and specs[0]["sl"] == 4310 and specs[0]["tp"] == 4200)

print("[spec shape]")
spec = make_spec("gold", SELL_FADE)
ok("dir_up False for a sell", spec["dir_up"] is False)
ok("size_factor carried through", spec["size_factor"] == 1.8)
ok("rationale + regime carried (for the comment/audit)", spec["rationale"] == "PIN call wall" and spec["regime"] == "PIN")

print("[guards]")
ok("px None → no fire", OISession("gold", 4200, [SELL_FADE]).decide(None) == [])
ok("no zones → no fire", OISession("gold", 4200, []).decide(4300) == [])

print(f"\n{'ALL PASSED ✓' if fails == 0 else str(fails) + ' FAILED ✗'}")
sys.exit(0 if fails == 0 else 1)
