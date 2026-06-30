"""Integration smoke test for the range-line bot — drives the entry + chandelier
trail through PaperBroker WITHOUT the live loop (no MT5/network).
    python -m range_line_bot.smoke_test
"""
import sys

from pylego.broker.paper import PaperBroker
from range_line_bot.engine import RangeSession
from range_line_bot.range_line_bot import _manage_chandeliers, size_for, _apply_broker_symbols, _broker_sym, _in_formation

_p = _f = 0
def ok(name, cond):
    global _p, _f
    if cond: _p += 1; print(f"  ✓ {name}")
    else: _f += 1; print(f"  ✗ {name}")

# Range 100..110 (mid 105); follow the A_1 up-line (level 110, inner 105, outer 115).
BARS = [
    {"time": 0,   "open": 105, "high": 106, "low": 99,  "close": 100},
    {"time": 300, "open": 108, "high": 111, "low": 107, "close": 110},
    {"time": 600, "open": 102, "high": 105, "low": 101, "close": 104},
]
FIBS = [-0.5, 0, 0.5, 1, 1.5]
PLAN = {"chandFrac": 0.5}
POLICY = {"A_1_up|": {"decision": "follow"}}

br = PaperBroker(balance=10_000.0)
sess = RangeSession("nq", FIBS, chand_frac=0.5)
sess.set_range("A", BARS)

# price touches 110 → one follow buy.
br.set_price("nq", 110.0)
specs = sess.decide(110.0, POLICY)
ok("entry fires on the A_1 touch", len(specs) == 1 and specs[0]["dir_up"])
spec = specs[0]

positions = {}
lots = size_for("nq", 10_000.0, 0.5, spec["entry"] - spec["protect_stop"], 2.0)
tid = br.enter("nq", "LONG", spec["protect_stop"], spec["entry"] + 100 * spec["rung"], lots, 1e9, True, comment="RL A_1 f")
positions[tid] = {"instr": "nq", "dir_up": True, "entry": spec["entry"],
                  "peak": spec["entry"], "rung": spec["rung"], "protect": spec["protect_stop"]}
ok("position opened on PaperBroker", len(br.serialize_open_positions()) == 1)

# Price runs up to 120 (peak), then drops to 116. Chandelier = max(105, 120-2.5)=117.5
# → 116 < 117.5 → exit.
br.set_price("nq", 120.0); _manage_chandeliers(positions, br, PLAN, {"paper_mode": True})
ok("no exit while price keeps making highs", len(br.serialize_open_positions()) == 1)
br.set_price("nq", 116.0); _manage_chandeliers(positions, br, PLAN, {"paper_mode": True})
ok("chandelier closes when price retraces past peak-0.5*rung", len(br.serialize_open_positions()) == 0)
ok("closed trade recorded for the journal/positions table", len(br.serialize_closed_trades()) == 1)
ok("local position state cleared", not positions)

print("[broker symbol overrides]")
_apply_broker_symbols({"broker_symbols": {"nq": "USTEC", "us30": "  ", "spx500": "US500"}})
ok("config override wins (nq → USTEC)", _broker_sym("nq") == "USTEC")
ok("blank override falls back to built-in default (us30 → US30)", _broker_sym("us30") == "US30")
ok("override applies to another index (spx500 → US500)", _broker_sym("spx500") == "US500")
_apply_broker_symbols({})                       # cleared → all built-in defaults
ok("cleared overrides → built-in default (nq → USTECH100)", _broker_sym("nq") == "USTECH100")
ok("non-index resolves via registry/upper (eurusd)", _broker_sym("eurusd").upper() == _broker_sym("eurusd"))

print("[formation window — no entries 00:00–06:00]")
from datetime import datetime, timezone
P = {"boundaryHour": 23, "asiaHrs": 6}                # window = 23:00–05:00 UTC (London 00:00–06:00 BST)
t_form = int(datetime(2026, 6, 30, 2, 0, 0, tzinfo=timezone.utc).timestamp())   # 02:00 UTC → inside window
t_open = int(datetime(2026, 6, 30, 10, 0, 0, tzinfo=timezone.utc).timestamp())  # 10:00 UTC → after pull
ok("forming True while the Asia range builds (02:00 UTC)", _in_formation(P, t_form) is True)
ok("forming False after the 06:00 pull (10:00 UTC)", _in_formation(P, t_open) is False)
ok("forming False right at window close (05:00 UTC)",
   _in_formation(P, int(datetime(2026, 6, 30, 5, 0, 0, tzinfo=timezone.utc).timestamp())) is False)
# dry_run during formation → no entry even on a touch; a fresh session entered
# after the window opens DOES fire (the real-entry path is covered above).
s_form = RangeSession("nq", FIBS); s_form.set_range("A", BARS)
ok("no entry while forming (dry_run gate suppresses the touch)", s_form.decide(110.0, POLICY, dry_run=True) == [])
s_open = RangeSession("nq", FIBS); s_open.set_range("A", BARS)
ok("entry fires when the window is open (dry_run False)", len(s_open.decide(110.0, POLICY, dry_run=False)) == 1)

print(f"\n{'✗' if _f else '✓'} {_p} passed, {_f} failed")
sys.exit(1 if _f else 0)
