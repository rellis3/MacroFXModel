"""pylego.events tests — synthetic windows, offline.
Run: python3 pylego/events_test.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pylego.events import blackout, pair_ccys, stale_reason  # noqa: E402

passed = failed = 0


def ok(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name}")


HOUR = 3600 * 1000
NFP = 1_780_000_000_000  # arbitrary ms epoch
WINDOWS = [
    {"ccy": "GBP", "startMs": NFP - 8 * HOUR, "endMs": NFP - 7 * HOUR, "eventTimeMs": NFP - 7 * HOUR - 900_000, "title": "UK GDP"},
    {"ccy": "USD", "startMs": NFP - 45 * 60_000, "endMs": NFP + 15 * 60_000, "eventTimeMs": NFP, "title": "Nonfarm Payrolls"},
]

print("[pair_ccys]")
ok("eurusd -> EUR,USD", pair_ccys("eurusd") == ["EUR", "USD"])
ok("EUR_USD == EUR/USD", pair_ccys("EUR_USD") == pair_ccys("EUR/USD"))
ok("XAU_USD -> USD only", pair_ccys("XAU_USD") == ["USD"])
ok("NAS100_USD -> USD; DE30_EUR -> EUR",
   pair_ccys("NAS100_USD") == ["USD"] and pair_ccys("DE30_EUR") == ["EUR"])

print("[blackout]")
ok("inside NFP window for a USD pair", blackout(["EUR", "USD"], NFP - 10 * 60_000, WINDOWS)[0] is True)
ok("outside all windows", blackout(["EUR", "USD"], NFP - 2 * HOUR, WINDOWS)[0] is False)
ok("pair without the event ccy passes", blackout(["AUD", "JPY"], NFP, WINDOWS)[0] is False)
ok("GBP window catches GBP crosses", blackout(["GBP", "JPY"], NFP - 7.5 * HOUR, WINDOWS)[0] is True)
ok("reason names ccy + event", "USD" in (blackout(["USD"], NFP, WINDOWS)[1] or ""))
ok("empty windows never block", blackout(["USD"], NFP, [])[0] is False)

print("[stale_reason]")
now = NFP
ok("fresh payload is usable", stale_reason({"generatedAt": now - HOUR, "windows": []}, now) is None)
ok("25h-old payload is stale", "stale" in (stale_reason({"generatedAt": now - 25 * HOUR}, now) or ""))
ok("missing payload reported", "missing" in (stale_reason(None, now) or ""))

print(f"\n{passed} passed, {failed} failed")
if failed:
    sys.exit(1)
