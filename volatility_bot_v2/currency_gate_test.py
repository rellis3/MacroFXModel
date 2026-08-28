"""Synthetic tests for the live currency loss gate. No network.
  python volatility_bot_v2/currency_gate_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from volatility_bot_v2.currency_gate import CurrencyLossGate, currency_legs  # noqa: E402

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'OK' if cond else 'FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1

BASE = 1700000000.0  # some UTC time well within a single day

print("[currency_legs]")
ok("splits a real FX pair into base/quote", currency_legs("USDJPY") == ["USD", "JPY"])
ok("falls back to the symbol itself for a non-FX instrument", currency_legs("GOLD") == ["GOLD"])
ok("case-insensitive lookup", currency_legs("eurusd") == ["EUR", "USD"])

print("[block once a currency's realized loss breaches the cap]")
g = CurrencyLossGate(max_daily_loss_pct=2.0)
ok("nothing blocked before any trade closes", g.blocked("USDJPY", BASE) is None)
g.record_close("USDJPY", -1.2, BASE, trade_id=1)
ok("still not blocked after a single small loss", g.blocked("USDJPY", BASE + 10) is None)
g.record_close("CADJPY", -1.1, BASE + 20, trade_id=2)   # cumulative JPY now -2.3%
ok("JPY-leg pair now blocked once cumulative JPY loss breaches the cap", g.blocked("CHFJPY", BASE + 30) is not None)
ok("an unrelated-currency pair is NEVER blocked by JPY's losses", g.blocked("EURUSD", BASE + 30) is None)

print("[idempotent — the same closed trade never double-counts]")
g2 = CurrencyLossGate(max_daily_loss_pct=2.0)
g2.record_close("USDJPY", -1.5, BASE, trade_id=99)
g2.record_close("USDJPY", -1.5, BASE + 5, trade_id=99)   # same id, replayed (e.g. re-sent in a status push)
ok("a repeated trade_id is folded in only once", g2.blocked("USDJPY", BASE + 10) is None, str(g2.snapshot()))

print("[tally resets at UTC midnight]")
g3 = CurrencyLossGate(max_daily_loss_pct=2.0)
g3.record_close("USDJPY", -3.0, BASE, trade_id=1)
ok("blocked within the same day", g3.blocked("USDJPY", BASE + 100) is not None)
NEXT_DAY = BASE + 86400 + 3600  # well past UTC midnight
ok("cleared once a new UTC day starts", g3.blocked("USDJPY", NEXT_DAY) is None)

print("[snapshot for the dashboard]")
g4 = CurrencyLossGate(max_daily_loss_pct=2.0)
g4.record_close("EURUSD", -0.5, BASE, trade_id=1)
snap = g4.snapshot()
ok("snapshot exposes today's date and per-currency tally", snap["tally"].get("EUR") == -0.5 and snap["tally"].get("USD") == -0.5, str(snap))

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILURE(S)'}")
sys.exit(1 if fails else 0)
