"""Offline tests for freshness_check.py's pure comparison logic. No network, no
Playwright, no live QuikStrike session — only local temp directories.

  python freshness_check_test.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from freshness_check import compare_captures, find_prior_sweep  # noqa: E402

fails = 0


def ok(name, cond, extra=''):
    global fails
    print(f"  {'✓' if cond else '✗ FAIL'} {name}{'  ' + extra if extra else ''}")
    if not cond:
        fails += 1


def _write(d: Path, product: str, rawOI: str) -> None:
    d.mkdir(parents=True, exist_ok=True)
    (d / f'{product}_rawOI.tsv').write_text(rawOI, encoding='utf-8')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)

    print('[find_prior_sweep]')
    out_root = root / 'out'
    (out_root / '2026-08-31' / 'quikstrike').mkdir(parents=True)
    (out_root / '2026-09-01' / 'quikstrike').mkdir(parents=True)
    today = out_root / '2026-09-02' / 'quikstrike'
    today.mkdir(parents=True)
    prior = find_prior_sweep(out_root, today)
    ok('picks the most recent OTHER dated dir', prior is not None and prior.parent.name == '2026-09-01',
       str(prior))
    ok('never picks its own date',
       find_prior_sweep(out_root, out_root / '2026-08-31' / 'quikstrike').parent.name != '2026-08-31')
    empty_root = root / 'empty_out'
    empty_root.mkdir()
    ok('no prior directories -> None', find_prior_sweep(empty_root, today) is None)
    ok('missing out_root -> None (never throws)',
       find_prior_sweep(root / 'does_not_exist', today) is None)

    print('\n[compare_captures]')
    day1 = root / 'd1'
    day2 = root / 'd2'
    _write(day1, 'EURUSD', 'strike\toi\n1.2000\t500\n')
    _write(day1, 'GBPUSD', 'strike\toi\n1.3000\t400\n')
    # EURUSD identical, GBPUSD genuinely different, XAUUSD only present today.
    _write(day2, 'EURUSD', 'strike\toi\n1.2000\t500\n')
    _write(day2, 'GBPUSD', 'strike\toi\n1.3000\t999\n')
    _write(day2, 'XAUUSD', 'strike\toi\n3900\t100\n')
    r = compare_captures(day2, day1)
    ok('byte-identical capture flagged identical', 'EURUSD' in r['identical'], str(r))
    ok('a genuinely different capture flagged changed', 'GBPUSD' in r['changed'], str(r))
    ok('a product absent from the prior capture is "missing", not "identical"',
       'XAUUSD' in r['missing'] and 'XAUUSD' not in r['identical'], str(r))
    ok('changed does not also claim identical', 'GBPUSD' not in r['identical'])

    print('\n[compare_captures — all identical]')
    day3 = root / 'd3'
    _write(day3, 'EURUSD', 'strike\toi\n1.2000\t500\n')
    r2 = compare_captures(day3, day1)
    # day1 has EURUSD + GBPUSD; day3 only has EURUSD, so GBPUSD from day1 is simply
    # not scanned (compare_captures walks TODAY's files, not the prior day's) —
    # this must not crash or silently invent a GBPUSD entry.
    ok('only scans today\'s own captures, not the prior day\'s extra products',
       r2['identical'] == ['EURUSD'] and r2['changed'] == [] and r2['missing'] == [], str(r2))

    print('\n[compare_captures — empty dir]')
    empty_today = root / 'empty_today'
    empty_today.mkdir()
    r3 = compare_captures(empty_today, day1)
    ok('no rawOI files at all -> everything empty, no crash', r3 == {'identical': [], 'changed': [], 'missing': []})

print(f"\n{'ALL PASSED' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(0 if fails == 0 else 1)
