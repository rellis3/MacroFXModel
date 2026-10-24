"""London-midnight session anchors (owner rule 2026-10-24: London midnight on the London calendar,
whatever the clocks say). Run from the repo root:  python -m range_line_bot.london_anchor_test"""
from datetime import datetime, timezone

from range_line_bot.engine import session_anchor_epoch, london_date, london_midnight_epoch
from range_line_bot.range_line_bot import monday_anchor_epoch, check_plan_boundary_dst

passed = failed = 0
def ok(name, cond, extra=""):
    global passed, failed
    print(("✓ " if cond else "✗ ") + name + (f"  {extra}" if extra else ""))
    passed, failed = passed + bool(cond), failed + (not cond)

E = lambda iso: int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp())
F = lambda e: datetime.fromtimestamp(e, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
L = "Europe/London"

# session anchor
ok("BST Tuesday 10:00Z → London midnight = Mon 23:00Z", F(session_anchor_epoch(E("2026-10-20T10:00"), L)) == "2026-10-19 23:00")
ok("BST 23:30Z (00:30 London) → that night's 23:00Z", F(session_anchor_epoch(E("2026-10-20T23:30"), L)) == "2026-10-20 23:00")
ok("GMT Monday 10:00Z → 00:00Z", F(session_anchor_epoch(E("2026-11-02T10:00"), L)) == "2026-11-02 00:00")
ok("clock-change Sunday: midnight was still BST (Sat 23:00Z)", F(session_anchor_epoch(E("2026-10-25T10:00"), L)) == "2026-10-24 23:00")
ok("first GMT Monday after the change → 00:00Z", F(session_anchor_epoch(E("2026-10-26T03:00"), L)) == "2026-10-26 00:00")
ok("spring change Sunday: midnight was GMT (00:00Z)", F(session_anchor_epoch(E("2027-03-28T10:00"), L)) == "2027-03-28 00:00")
ok("numeric boundary unchanged (23)", F(session_anchor_epoch(E("2026-10-20T10:00"), 23)) == "2026-10-19 23:00")
ok("london_date 23:30Z in BST is the next day", str(london_date(E("2026-07-01T23:30"))) == "2026-07-02")

# Monday range = Monday's own London session; last week's on a Monday
ok("BST Monday → last week's Monday (Sun 23:00Z)", F(monday_anchor_epoch(E("2026-10-19T10:00"), L)) == "2026-10-11 23:00")
ok("BST Tuesday → this Monday (Sun 23:00Z)", F(monday_anchor_epoch(E("2026-10-20T10:00"), L)) == "2026-10-18 23:00")
ok("BST Friday → this Monday", F(monday_anchor_epoch(E("2026-10-23T10:00"), L)) == "2026-10-18 23:00")
ok("first GMT Monday → last week's Monday, still BST (Sun 23:00Z, not 00:00Z)", F(monday_anchor_epoch(E("2026-10-26T10:00"), L)) == "2026-10-18 23:00")
ok("first GMT Tuesday → this Monday 00:00Z", F(monday_anchor_epoch(E("2026-10-27T10:00"), L)) == "2026-10-26 00:00")

ok("DST check: a London plan always matches", check_plan_boundary_dst({"boundaryHour": L}, E("2026-11-02T10:00")) is True)

print(f"\n{'✓' if not failed else '✗'} {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
