"""Offline tests for asof_check.py. No network, no Playwright, no live session.

The cases that matter are the ones that must NOT fire: this gate refuses to publish
a night's data, so a false positive costs a real trading day of OI. Every calendar
shape that legitimately repeats a book — weekend, bank holiday, the matrices simply
running a day behind the settles view — is asserted silent here.

  python asof_check_test.py
"""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asof_check import (asof_from_label, business_days_between,  # noqa: E402
                        check, settles_asof)

fails = 0


def ok(name, cond, extra=''):
    global fails
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'   ' + extra if extra else ''}")
    if not cond:
        fails += 1


# ── the vendor's heading ────────────────────────────────────────────────────
print('\n[asof_from_label]')
ok('reads the FIRST date (the book), not the comparison date',
   asof_from_label('EUR/USD (EUU|6E) Open Interest Change Matrix (08/09/2026 vs 04/09/2026)')
   == date(2026, 9, 8))
ok('dd/mm, not mm/dd — a day past 12 proves the order',
   asof_from_label('X Open Interest Change Matrix (31/08/2026 vs 28/08/2026)') == date(2026, 8, 31))
ok('the OI matrix heading carries no date -> None, not a guess',
   asof_from_label('Gold (OG|GC) Open Interest Matrix') is None)
ok('empty / missing label -> None', asof_from_label('') is None and asof_from_label(None) is None)
ok('an impossible date is refused rather than raising',
   asof_from_label('X Open Interest Change Matrix (32/13/2026 vs 01/01/2026)') is None)

# ── weekday arithmetic ──────────────────────────────────────────────────────
print('\n[business_days_between]')
ok('Fri -> Mon is ONE session, not three days',
   business_days_between(date(2026, 9, 4), date(2026, 9, 7)) == 1)
ok('Fri -> Tue is two sessions (the 2026-09-09 failure)',
   business_days_between(date(2026, 9, 4), date(2026, 9, 8)) == 2)
ok('same day is zero', business_days_between(date(2026, 9, 8), date(2026, 9, 8)) == 0)
ok('never negative when the matrix leads the settles view',
   business_days_between(date(2026, 9, 8), date(2026, 9, 4)) == 0)
ok('a whole weekend alone is zero sessions',
   business_days_between(date(2026, 9, 5), date(2026, 9, 6)) == 0)


def _sweep(tmp: Path, matrix: str | None, first_exp: str, first_dte: int) -> Path:
    """A minimal capture dir: one product's settles table + the sweep's asof.json."""
    d = tmp
    d.mkdir(parents=True, exist_ok=True)
    (d / 'EUR_USD_rawIVTerm.tsv').write_text(
        'SYMBOL\tDTE\tEXPIRATION\n'
        'DATE\tFUTURE PRICE\tSTRADDLE PRICE\tVOLATILITY\tOPEN INTEREST\n'
        f'WE2U6\t{first_dte}\t{first_exp}\t1.1675\t1.16715\t0.0017\t3.87\n'
        f'SU2U6\t{first_dte + 1}\t{first_exp}\t1.1675\t1.16715\t0.0017\t5.15\n',
        encoding='utf-8')
    if matrix is not None:
        (d / 'asof.json').write_text(json.dumps({'updated': 't', 'asOf': {'EUR/USD': matrix}}))
    return d


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)

    print('\n[settles_asof]')
    d = _sweep(root / 'a', '2026-09-08', '09/09/2026', 1)
    ok('expiry minus DTE is the session the view priced against',
       settles_asof(d / 'EUR_USD_rawIVTerm.tsv') == date(2026, 9, 8))
    ok('a missing file is None, never a date', settles_asof(root / 'nope.tsv') is None)

    print('\n[check — must stay SILENT]')
    # Matrices genuinely publish a day behind the settles view sometimes; 2026-09-02
    # and 09-03 were both healthy nights that looked exactly like this.
    r = check(_sweep(root / 'b', '2026-08-31', '02/09/2026', 1))   # settles 01/09, matrix 31/08
    ok('one business day behind is normal, not stale',
       not r['stale'] and r['rows'][0]['lag'] == 1, str(r['rows']))
    # Monday: settles and matrices BOTH still on Friday. The clock says 3 days; the
    # exchange says nothing happened. Comparing the two views is what sees that.
    r = check(_sweep(root / 'c', '2026-09-04', '07/09/2026', 3))
    ok('Monday repeating Friday is silent (weekend)', not r['stale'], str(r['rows']))
    # Labor Day: Tuesday still legitimately on Friday's book — the case that would
    # have made a "book older than N days" rule cry wolf.
    r = check(_sweep(root / 'd', '2026-09-04', '08/09/2026', 4))
    ok('a bank holiday repeating Friday is silent', not r['stale'], str(r['rows']))

    print('\n[check — must FIRE]')
    # The real 2026-09-09: settles rolled to Tuesday, the matrices did not.
    r = check(_sweep(root / 'e', '2026-09-04', '09/09/2026', 1))
    ok('two business days behind is stale', len(r['stale']) == 1, str(r['rows']))
    ok('and it names both dates so the log is self-explaining',
       r['stale'][0]['matrix'] == date(2026, 9, 4) and r['stale'][0]['settles'] == date(2026, 9, 8))

    print('\n[check — must not pass on ignorance]')
    # A guard that reports "fine" when it could not look is worse than no guard.
    r = check(_sweep(root / 'f', None, '09/09/2026', 1))
    ok('no asof.json -> nothing judged and nothing claimed',
       r['rows'] == [] and r['judged'] == 0 and not r['stale'])
    d = _sweep(root / 'g', '2026-09-04', '09/09/2026', 1)
    (d / 'EUR_USD_rawIVTerm.tsv').unlink()
    r = check(d)
    ok('settles missing -> NOT JUDGED, never silently ok',
       r['judged'] == 0 and not r['stale'] and r['rows'][0]['lag'] is None, str(r['rows']))

    print('\n[check — tolerance is configurable]')
    r = check(_sweep(root / 'h', '2026-08-31', '02/09/2026', 1), max_lag=0)
    ok('max_lag=0 makes even a one-day lag stale',
       len(r['stale']) == 1 and r['rows'][0]['lag'] == 1, str(r['rows']))

print(f"\n{'ALL PASSED' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(0 if fails == 0 else 1)
