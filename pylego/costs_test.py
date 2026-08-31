"""Synthetic tests for max_spread's per-pair/per-class/scalar precedence. No network.
  python pylego/costs_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pylego.costs import max_spread  # noqa: E402

fails = 0
def ok(name, cond, extra=""):
    global fails
    print(f"  {'OK' if cond else 'FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1

print("[scalar cfg -- flat FX cap, scaled per class]")
ok("fx pair gets the scalar as-is", max_spread("eurusd", {"max_spread_pips": 1.0}) == 1.0)
ok("index gets the scalar x6 (MAX_SPREAD_MULT)", max_spread("uk100", {"max_spread_pips": 1.0}) == 6.0)
ok("no cfg at all -> DEFAULT_FX_SPREAD_CAP (2.0)", max_spread("eurusd", {}) == 2.0)

print("[per-class dict override -- pre-existing behavior, unchanged]")
cls_cfg = {"max_spread_pips": {"fx": 1.0, "index": 6.0, "commodity": 5.0}}
ok("fx pair uses the fx class entry", max_spread("eurusd", cls_cfg) == 1.0)
ok("a JPY cross with NO pair-specific entry still falls through to the flat fx class cap",
   max_spread("chfjpy", cls_cfg) == 1.0)
ok("gold uses the commodity class entry", max_spread("gold", cls_cfg) == 5.0)

print("[per-pair dict override -- the new, real-data-driven path]")
pair_cfg = {"max_spread_pips": {"chfjpy": 2.8, "fx": 1.0, "index": 6.0}}
ok("a pair with its OWN entry uses that directly, not the class scaling", max_spread("chfjpy", pair_cfg) == 2.8)
ok("a pair WITHOUT its own entry still falls through to the class default", max_spread("eurusd", pair_cfg) == 1.0)
ok("per-pair beats per-class even though both exist in the same dict",
   max_spread("chfjpy", {"max_spread_pips": {"chfjpy": 2.8, "fx_jpy": 1.0, "fx": 1.0}}) == 2.8)

print("[unknown/malformed input -- fails safe, never throws]")
ok("an unresolvable symbol still returns a sane fx-scaled default, doesn't throw",
   max_spread("not-a-real-pair", {"max_spread_pips": 1.0}) == 1.0)
ok("None cfg doesn't throw", max_spread("eurusd", None) == 2.0)

print(f"\n{'ALL PASSED' if fails == 0 else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
