"""Same-night freshness check: does tonight's capture actually differ from the last
one we have on disk?

The nightly sweep validates SHAPE (right columns, non-zero OI, right product,
correct row/column count via validate_capture.mjs) but never asked whether the
CONTENT moved. A stale or cached QuikStrike session can pass every one of those
checks while quietly re-serving an old settlement — structurally perfect, factually
stale. Found live 2026-09: EUR/USD's archived OI was byte-identical for four
straight days (2026-08-29 through 2026-09-01) while the nightly heartbeat reported
"44/44 tables captured, 11/11 ingested, VERDICT OK" every single one of those
nights. Third time this exact shape of failure went unnoticed for weeks.

The durable, tolerance-aware version of this check lives SERVER-SIDE
(js/oiRawArchive.js `oiFreshnessStreak`, wired into server.js's
`_snapshotOIHistory`) because only the server can see the full archive and knows
which streak length a weekend legitimately explains (CME publishes no Saturday or
Sunday settlement, and an early-UTC run before Monday's own session has closed
still legitimately repeats Friday's numbers). THAT is the one with real teeth —
it alerts through the same Telegram channel the nightly heartbeat already uses.

This script is its same-night, purely ADVISORY sibling: cheap, local, no live-site
or KV access needed, so a human glancing at tonight's own log sees the same signal
immediately instead of waiting up to several days for the server-side alert to
accumulate. It NEVER fails the run on its own (see main()) — a lone "everything
looks the same" reading is not, by itself, proof of anything; the weekend-aware
judgement call belongs server-side, on purpose, so this script does not have to
re-solve trading-calendar logic to avoid crying wolf every Saturday.

  python freshness_check.py --sweep out/2026-09-06/quikstrike
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def find_prior_sweep(out_root: Path, sweep_dir: Path) -> Path | None:
    """The most recent OTHER dated capture dir under out_root/<date>/quikstrike,
    excluding sweep_dir's own date. Returns None when there is nothing to compare
    against (a fresh checkout, or every prior capture already cleaned up) — the
    caller must treat that as "nothing to compare", never as a failure; there is
    nothing wrong with today's capture just because yesterday's is gone."""
    try:
        today = sweep_dir.resolve().parent.name       # out/<date>/quikstrike -> <date>
    except OSError:
        return None
    if not out_root.is_dir():
        return None
    candidates = sorted(
        (d for d in out_root.iterdir()
         if d.is_dir() and d.name != today and (d / 'quikstrike').is_dir()),
        reverse=True,
    )
    return (candidates[0] / 'quikstrike') if candidates else None


def compare_captures(today_dir: Path, prior_dir: Path) -> dict:
    """Byte-for-byte comparison of each product's rawOI capture — the most
    information-dense box (strike x expiry open interest). If it is identical,
    rawChg/rawVol are almost certainly identical too, and comparing one file per
    product keeps this fast, simple, and exactly mirrors what oiContentFingerprint
    keys off server-side (OI content, not price levels — see that module for why).

    Returns {identical, changed, missing}: lists of product stems (the filename
    prefix before "_rawOI.tsv")."""
    identical, changed, missing = [], [], []
    for f in sorted(today_dir.glob('*_rawOI.tsv')):
        stem = f.name[:-len('_rawOI.tsv')]
        other = prior_dir / f.name
        if not other.exists():
            missing.append(stem)
            continue
        try:
            same = f.read_bytes() == other.read_bytes()
        except OSError:
            missing.append(stem)
            continue
        (identical if same else changed).append(stem)
    return {'identical': identical, 'changed': changed, 'missing': missing}


def main() -> None:
    ap = argparse.ArgumentParser(description='Same-night OI capture freshness check (advisory only).')
    ap.add_argument('--sweep', required=True, help="today's capture dir (…/quikstrike)")
    ap.add_argument('--out-root', default=str(HERE / 'out'), help='the out/ directory holding dated captures')
    a = ap.parse_args()

    today_dir = Path(a.sweep)
    out_root = Path(a.out_root)
    if not today_dir.is_dir():
        print(f'[freshness] {today_dir} does not exist - skipping (nothing to check)')
        sys.exit(0)                      # advisory stage: never fail the run over its own inputs

    prior_dir = find_prior_sweep(out_root, today_dir)
    if not prior_dir:
        print('[freshness] no prior local capture to compare against (first run, '
              'or nothing kept) - skipping')
        sys.exit(0)

    r = compare_captures(today_dir, prior_dir)
    total = len(r['identical']) + len(r['changed'])
    if not total:
        print(f'[freshness] no rawOI captures in {today_dir} to compare - skipping')
        sys.exit(0)
    print(f"[freshness] vs {prior_dir.parent.name}: "
          f"{len(r['changed'])}/{total} product(s) moved, {len(r['identical'])}/{total} identical"
          + (f", {len(r['missing'])} not in the prior capture" if r['missing'] else ''))
    if r['identical']:
        print(f"  identical to last time: {', '.join(r['identical'])}")
    if len(r['identical']) == total:
        # ALL products identical to the last LOCAL capture. On its own this is not
        # proof of anything wrong — it could be a weekend, or the prior capture
        # could itself be several days old — so this stays advisory rather than
        # failing the run; see the module docstring for why the judgement call
        # belongs to the server-side, weekend-aware detector instead.
        print('  ALL products identical to the last local capture — advisory, not '
              'failing the run. If this keeps happening, check the server-side '
              'freshness alert (it has the weekend tolerance this script does not).')
    sys.exit(0)                          # ALWAYS advisory — see module docstring


if __name__ == '__main__':
    main()
