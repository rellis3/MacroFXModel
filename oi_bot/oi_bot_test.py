"""Offline tests for oi_bot.py's own pure helpers (not engine.py — see engine_test.py
for that). No network, no MT5, no broker.

  python oi_bot/oi_bot_test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oi_bot.oi_bot import _size_audit_summary  # noqa: E402

fails = 0


def ok(name, cond, extra=""):
    global fails
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'   ' + extra if extra else ''}")
    if not cond:
        fails += 1


def _plan(*zones_per_instr):
    """Wrap zone lists into the {instruments: {k: {zones: [...]}}} shape the real
    plan carries, one synthetic instrument per positional arg."""
    return {"instruments": {f"i{i}": {"zones": zs} for i, zs in enumerate(zones_per_instr)}}


print("[size-audit summary — the ongoing, automatic form of the 2026-09-13 live-evidence audit]")

ok("empty plan -> None (nothing to audit, not a blank line)", _size_audit_summary({}) is None)
ok("plan with instruments but no zones -> None", _size_audit_summary(_plan([], [])) is None)
ok("zones present but none carry sizeBreakdown (older plan shape) -> None",
   _size_audit_summary(_plan([{"mode": "fade"}, {"mode": "break"}])) is None)

# One zone where nothing fired at all: every multiplier at 1, not capped.
neutral = [{"sizeBreakdown": {"base": 1.0, "vanna": 1, "blocker": 1, "reach": 1, "hold": 1, "conviction": 1, "localRegime": 1, "capped": False, "preCap": 1.0}}]
s = _size_audit_summary(_plan(neutral))
ok("all-neutral zone -> summary exists, names the zone count, nothing 'fired'",
   s is not None and s.startswith("1 zone(s)") and "vanna" not in s and "hold" not in s, s)
ok("cap-hit rate is always reported, even at 0%", "cap hit 0/1 (0%)" in s, s)

# A realistic mixed plan: 4 zones, 2 with a firing hold multiplier, 1 capped.
mixed = [
    {"sizeBreakdown": {"base": 1.5, "vanna": 1, "blocker": 1, "reach": 1, "hold": 1.3, "conviction": 1, "localRegime": 1, "capped": False, "preCap": 1.95}},
    {"sizeBreakdown": {"base": 1.5, "vanna": 1, "blocker": 1, "reach": 1, "hold": 0.7, "conviction": 1, "localRegime": 1, "capped": False, "preCap": 1.05}},
    {"sizeBreakdown": {"base": 2.0, "vanna": 1.15, "blocker": 1, "reach": 1, "hold": 1, "conviction": 1.2, "localRegime": 1, "capped": True, "preCap": 2.76}},
    {"sizeBreakdown": {"base": 0.8, "vanna": 1, "blocker": 1, "reach": 1, "hold": 1, "conviction": 1, "localRegime": 1, "capped": False, "preCap": 0.8}},
]
sm = _size_audit_summary(_plan(mixed))
ok("mixed plan reports 4 zones", sm.startswith("4 zone(s)"), sm)
ok("hold fired on 2/4 zones (1.3 and 0.7 average to 1.0x)", "hold 2/4 (avg 1.00x, 0.70-1.30)" in sm, sm)
ok("vanna fired on 1/4 zones", "vanna 1/4 (avg 1.15x" in sm, sm)
ok("conviction fired on 1/4 zones", "conviction 1/4 (avg 1.20x" in sm, sm)
ok("cap hit 1/4 (25%)", "cap hit 1/4 (25%)" in sm, sm)
ok("blocker/reach/localRegime never fired -> not named at all (silent when nothing happened)",
   "blocker" not in sm and "reach" not in sm and "localRegime" not in sm, sm)

# Multiple instruments in one plan are pooled into one summary, not reported per-pair —
# this is a PLAN-wide audit, matching the review finding's own scope.
pooled = _size_audit_summary(_plan(
    [{"sizeBreakdown": {"base": 1, "vanna": 1.15, "blocker": 1, "reach": 1, "hold": 1, "conviction": 1, "localRegime": 1, "capped": False, "preCap": 1.15}}],
    [{"sizeBreakdown": {"base": 1, "vanna": 1.15, "blocker": 1, "reach": 1, "hold": 1, "conviction": 1, "localRegime": 1, "capped": False, "preCap": 1.15}}],
))
ok("two instruments, one zone each -> pooled as 2 zones total", pooled.startswith("2 zone(s)"), pooled)

print(f"\n{'ALL PASSED' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(0 if fails == 0 else 1)
