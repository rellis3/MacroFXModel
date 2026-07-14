"""OI bot smoke test — the engine + PaperBroker end-to-end, no network.
Validates: a planned zone fires on a touch, a bracketed SL/TP order is placed,
the barrier closes it, and it serialises for the positions/audit tabs.
  python oi_bot/smoke_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pylego.broker.paper import PaperBroker            # noqa: E402
from oi_bot.engine import OISession                    # noqa: E402
from oi_bot.oi_bot import size_for, build_status, DEFAULT_CFG, entry_alert_text  # noqa: E402

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'✓' if cond else '✗ FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1

# PIN gold plan: fade the call wall 4300 (sell), TP1 toward max pain 4200.
PLAN = {
    "strategy": "oi-bot", "generatedAt": "2026-07-14T00:00:00Z",
    "instruments": {
        "gold": {"spot": 4200, "maxPain": 4200, "regime": "PIN", "zoneCount": 1,
                 "zones": [{"mode": "fade", "side": "sell", "level": 4300, "entry": 4300,
                            "sl": 4305, "tp1": 4200, "tp2": 4100, "sizeFactor": 1.8,
                            "regime": "PIN", "rationale": "PIN call wall 4300 strong → fade"}]},
    },
}

broker = PaperBroker(balance=10_000.0)
sess = OISession("gold", 4200, PLAN["instruments"]["gold"]["zones"])

print("[fill on a touch of the call wall]")
broker.set_price("gold", 4200.0)
sess.decide(4200.0, dry_run=True)                     # prime — nothing triggered yet
ok("no fire at 4200 (between walls)", sess.decide(4200.0) == [])

broker.set_price("gold", 4300.0)                      # price rises to the wall
specs = sess.decide(4300.0)
ok("sell fade fires at the wall", len(specs) == 1 and specs[0]["side"] == "sell")

spec = specs[0]
lots = size_for("gold", 10_000.0, 0.5, spec["entry"] - spec["sl"], 2.0, spec["size_factor"])
ok("size scaled by the 1.8× wall-strength factor", lots > 0.01, f"lots={lots}")
tid = broker.enter("gold", "SHORT", spec["sl"], spec["tp"], lots, 6.0, True,
                   comment=f"OI [{spec['mode']}] {spec['rationale']}", dedupe_tag=spec["zone_id"])
sess.mark_entered(spec["zone_id"])
ok("order placed (ticket returned)", tid and tid > 0)

opens = broker.serialize_open_positions()
ok("open position serialises with SL/TP + comment", len(opens) == 1 and opens[0]["direction"] == "SELL"
   and "OI [fade]" in opens[0]["comment"])

print("[one-shot — a re-touch does not double-enter]")
ok("entered zone won't fire again", sess.decide(4301.0) == [])

print("[TP barrier closes the trade toward max pain]")
broker.set_price("gold", 4200.0)                      # price falls to TP1 = max pain
hit = broker.check_barriers()
ok("barrier closed the position at TP", any(h["reason"] == "tp" for h in hit))
closed = broker.serialize_closed_trades()
ok("closed trade serialises (position_id for audit dedup)", len(closed) == 1 and closed[0].get("position_id"))
ok("fade was profitable (sold 4300 → covered ~4200)", closed[0]["profit"] > 0, f"profit={closed[0]['profit']}")

print("[status payload for positions/audit tabs]")
st = build_status(DEFAULT_CFG, broker, PLAN, True, {"gold": sess})
ok("status has today_closed_trades", len(st["today_closed_trades"]) == 1)
ok("status lines carry regime + entered zones", st["lines"][0]["regime"] == "PIN"
   and "fade_sell_4300" in st["lines"][0]["entered"])
ok("universe reflects the plan", st["universe"] == ["gold"])

print("[Telegram entry alert — what/direction/SL/TP/why]")
alert = entry_alert_text("gold", spec, 0.18, 12345, True)
ok("names instrument + mode + direction", "GOLD" in alert and "FADE" in alert and "SELL" in alert)
ok("carries entry / SL / TP", "4300.00" in alert and "4305.00" in alert and "4200.00" in alert)
ok("includes the rationale (the reason)", "call wall 4300" in alert and "fade" in alert)
ok("PAPER/LIVE tag + size", "PAPER" in alert and "1.8×" in alert)

print(f"\n{'ALL PASSED ✓' if fails == 0 else str(fails) + ' FAILED ✗'}")
sys.exit(0 if fails == 0 else 1)
