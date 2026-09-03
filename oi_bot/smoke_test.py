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
from oi_bot.oi_bot import (size_for, build_status, DEFAULT_CFG, entry_alert_text,  # noqa: E402
                           close_alert_text, _fmt_duration)

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
ok("Paper/LIVE tag + size", "Paper" in alert and "1.8×" in alert)
ok("icon + chart link + direction arrow", "🥇" in alert and "tradingview.com/chart" in alert and "▼" in alert)

print("[held-time formatting — both stamps are broker-clock, so the offset cancels]")
ok("minutes", _fmt_duration(0, 43 * 60) == "43m", _fmt_duration(0, 43 * 60))
ok("hours pad the minutes", _fmt_duration(0, 2 * 3600 + 5 * 60) == "2h 05m", _fmt_duration(0, 2 * 3600 + 5 * 60))
ok("multi-day hold rolls to days", _fmt_duration(0, 3 * 86400 + 4 * 3600) == "3d 4h", _fmt_duration(0, 3 * 86400 + 4 * 3600))
ok("sub-minute scalp is not '0m'", _fmt_duration(0, 20) == "<1m")
ok("a broker-clock offset on BOTH stamps changes nothing",
   _fmt_duration(10800, 10800 + 2 * 3600 + 5 * 60) == "2h 05m")
ok("missing / backwards stamps → em-dash, never a fake duration",
   _fmt_duration(None, 100) == "—" and _fmt_duration(500, 100) == "—")

print("[Telegram close alert — barrier, held time, net P&L]")
row = dict(closed[0])
row.update({"comment": "OI [fade_sell_4300]", "time_open": 1788240000, "time_close": 1788247500,
            "reason": "tp", "swap": -1.25, "commission": 0.0, "position_id": 90210})
ca = close_alert_text("gold", row, True)
ok("names the barrier that ended it", "TP HIT" in ca)
# the paper fill sits inside the spread (4299.85 / 4200.15), so assert against the
# row's own numbers rather than the plan's round levels.
ok("carries open → close prices",
   f"{row['open_price']:.2f}" in ca and f"{row['close_price']:.2f}" in ca, ca.splitlines()[3])
ok("shows how long it was held", "2h 05m" in ca)
ok("P&L is NET of swap, with the gross broken out",
   f"{row['profit'] - 1.25:+.2f}" in ca and "gross" in ca and "swap -1.25" in ca)
ok("mode + direction from the position's own comment tag", "FADE" in ca and "SELL" in ca)
ok("icon + chart link + ticket", "🥇" in ca and "tradingview.com/chart" in ca and "90210" in ca)
ok("Paper/LIVE tag", "Paper" in ca and "LIVE" in close_alert_text("gold", row, False))
sl_row = {**row, "reason": "sl", "profit": -80.0, "swap": 0.0}
sl_alert = close_alert_text("gold", sl_row, False)
ok("a loss reads as SL HIT with a red verdict + no gross breakdown",
   "SL HIT" in sl_alert and "🔴" in sl_alert and "-80.00" in sl_alert and "gross" not in sl_alert)
ok("an unknown close reason is not claimed as a barrier",
   "CLOSED" in close_alert_text("gold", {**row, "reason": "manual"}, True))

print(f"\n{'ALL PASSED ✓' if fails == 0 else str(fails) + ' FAILED ✗'}")
sys.exit(0 if fails == 0 else 1)
