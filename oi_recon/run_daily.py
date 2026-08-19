"""THE one command. Capture -> build -> log -> compare -> verdict.

  python run_daily.py                 capture + build + compare, writes NO KV
  python run_daily.py --write         publish (target decided by the OI modal toggle)
  python run_daily.py --write --live  force the REAL key oi_store, ignoring the toggle
  python run_daily.py --skip-sweep    reuse today's captures, just rebuild + compare

Runs the stages that were separate commands, and ends with one verdict a human
(or a scheduler) can act on without reading the scrollback:

    capture   44/44 tables
    ingest    11/11 entries complete
    expect    284 level(s) logged for 2026-08-03
    compare   41/44 agree with your pastes
    VERDICT   OK

EXIT CODE IS THE POINT. Non-zero if any stage falls short, because a scheduled
job can only alert on what the process reports, and "captured 3 of 44 but exited
0" is how a broken nightly goes unnoticed for a week. Every stage below already
signals honestly; this only aggregates them.

WHERE IT PUBLISHES IS NOT DECIDED HERE. `ingest.mjs` asks the server for the
`oi_auto_target` setting (the toggle in the OI modal), so the feed can be handed
back to manual pasting from a phone without editing the scheduled task on a
machine nobody is sitting at. --live forces the real key for a one-off run.

COMPARE IS ADVISORY WHEN THERE ARE NO FRESH PASTES. It measures the automation
against manually pasted data; if nobody has pasted for days, divergence is the
expected result of comparing today's book with a stale one, not a fault. Left
fatal, an unattended fortnight would report FAILED every single night and the
exit code would stop distinguishing a broken scrape from an idle human.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable
SWEEP_DIR = HERE / 'out' / date.today().isoformat() / 'quikstrike'
BASE = 'https://macrofxmodel-production.up.railway.app'

# How stale the manual pastes may be before `compare` stops being treated as a
# failure. Two days covers a weekend; beyond that nobody is pasting and the
# comparison is measuring the gap between a live book and an abandoned one.
STALE_PASTE_DAYS = 2

# Appended once per run so a fortnight of unattended nights can be read back in
# one go, including the nights that never got as far as writing a log file.
JOURNAL = HERE / 'logs' / 'run_journal.jsonl'


def run(cmd, label):
    """Run a stage, stream nothing, return (rc, output). Each stage already
    prints its own detail to its own log; here we only need the verdict."""
    print(f'  [{label}] running...', flush=True)
    # text=True alone decodes with the console codepage (cp1252 here) while node
    # emits UTF-8, so the '·' in "11 complete · 0 skipped" arrived as 'Â·' and was
    # written that way into the run journal - the file meant to be read after a
    # fortnight away. errors='replace' keeps a stray byte from killing the run.
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    out = (r.stdout or '') + (r.stderr or '')
    return r.returncode, out


def ascii_only(s):
    """Windows consoles here are cp1252 and cannot render the separators node
    prints ('·', '→'), so a summary line quoted verbatim comes out as mojibake in
    both the console and the run journal. Fold to ASCII rather than fight the
    codepage - this tool's own output has been ASCII since the first crash."""
    return (str(s).replace('·', '-').replace('→', '->')
            .replace('—', '-').replace('–', '-')
            .encode('ascii', 'replace').decode('ascii'))


def grab(out, *needles):
    """Pull the summary line a stage prints, so the verdict quotes the stage
    rather than re-deriving (and possibly disagreeing with) it."""
    for line in out.splitlines():
        if all(n in line for n in needles):
            return ascii_only(line.strip())
    return None


def paste_age_days():
    """Days since the most recent MANUAL paste in oi_store.

    Decides whether `compare` is a real check or a formality. Returns None when
    the answer cannot be established - and the caller then keeps compare fatal,
    because "I could not tell" must not be the reason a genuine failure is
    downgraded to a warning.
    """
    try:
        with urllib.request.urlopen(f'{BASE}/api/kv/get?key=oi_store', timeout=30) as r:
            store = (json.load(r) or {}).get('data') or {}
    except Exception:
        return None
    newest = None
    for inst in store.values():
        if not isinstance(inst, dict):
            continue
        # savedAt is written by the modal as a locale string ("02/08/2026, 13:37:53"),
        # so parse dd/mm/yyyy explicitly rather than trusting a generic parser to
        # guess - on a US-format read 03/08 would come back as 8 March.
        m = re.match(r'(\d{2})/(\d{2})/(\d{4})', str(inst.get('savedAt') or ''))
        if not m:
            continue
        try:
            d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            continue
        if newest is None or d > newest:
            newest = d
    return None if newest is None else (date.today() - newest).days


def journal(entry):
    """Append one line per run. Survives the log file being rotated or a run dying
    before it printed anything useful, so 'which nights actually ran' is answerable
    from a single file rather than by collating fourteen logs."""
    try:
        JOURNAL.parent.mkdir(parents=True, exist_ok=True)
        with JOURNAL.open('a', encoding='utf-8') as f:
            f.write(json.dumps(entry) + '\n')
    except OSError:
        pass          # never let bookkeeping fail the run


def main() -> None:
    ap = argparse.ArgumentParser(description='Daily OI: capture, build, compare.')
    ap.add_argument('--write', action='store_true', help='publish to KV')
    ap.add_argument('--live', action='store_true',
                    help='force oi_store, overriding the oi_auto_target toggle (one-off runs)')
    ap.add_argument('--skip-sweep', action='store_true', help='reuse today\'s captures')
    # Pass 2 (the per-strike IV smile -> charm/vanna) is ON here. Its failure mode
    # is degraded, not corrupt: it drops the cached session after selecting an
    # expiry, so a bad pass 2 costs a smile and never narrows pass 1's matrices.
    ap.add_argument('--no-chain', action='store_true',
                    help='skip the per-strike IV smile capture (charm/vanna)')
    ap.add_argument('--headless', action='store_true', help='off-screen browser')
    ap.add_argument('--dir', help="capture dir to use (default: today's)")
    a = ap.parse_args()

    global SWEEP_DIR
    if a.dir:
        SWEEP_DIR = Path(a.dir) if Path(a.dir).is_absolute() else HERE / a.dir

    print(f'\n=== DAILY OI - {date.today().isoformat()} ===\n')
    stages, failed = {}, []

    # 1. CAPTURE
    if a.skip_sweep:
        n = len(list(SWEEP_DIR.glob('*.tsv'))) if SWEEP_DIR.exists() else 0
        stages['capture'] = f'{n} table(s) reused from {SWEEP_DIR.name}'
        if not n:
            failed.append('capture')
    else:
        cmd = ([PY, 'run_sweep.py']
               + (['--headless'] if a.headless else [])
               + ([] if a.no_chain else ['--chain']))
        rc, out = run(cmd, 'capture')
        stages['capture'] = grab(out, 'tables captured') or 'no summary line'
        if rc:
            failed.append('capture')

    # 2. INGEST - always runs, so a partial capture is still diagnosed.
    # No --key unless forced: ingest.mjs reads the oi_auto_target setting itself.
    cmd = ['node', 'ingest.mjs', '--dir', str(SWEEP_DIR)]
    if a.live:
        cmd += ['--key', 'oi_store']
    if a.write:
        cmd.append('--write')
    rc, out = run(cmd, 'ingest')
    stages['ingest'] = grab(out, 'complete', 'skipped') or 'no summary line'
    # Quote the key ingest actually chose rather than re-deriving it here; the
    # decision lives on the server and this must not print a second opinion.
    key_line = grab(out, 'target:') or ''
    key = (re.search(r'target:\s*(\S+)', key_line).group(1) if key_line else
           ('oi_store' if a.live else '(decided by oi_auto_target)'))
    if rc:
        failed.append('ingest')

    # 3. LOG EXPECTATIONS - what every level CLAIMED today, against the key just
    # written. This is the forward record; miss a night and that day is gone for
    # good, because CME serves no history and the spot it was judged against is
    # only true once. Runs only on a --write run: logging claims for entries that
    # were never published would build a record of a store that does not exist.
    if a.write and 'ingest' not in failed:
        lcmd = ['node', 'log_expectations.mjs', '--write']
        if key.startswith('oi_'):
            lcmd += ['--key', key]
        rc, out = run(lcmd, 'expect')
        stages['expect'] = grab(out, 'level(s) across') or 'no summary line'
        if rc:
            failed.append('expect')
    else:
        stages['expect'] = 'skipped (no --write)' if not a.write else 'skipped (ingest fell short)'

    # 4. COMPARE against the manual pastes in oi_store. Advisory once those pastes
    # are stale - see the module docstring.
    age = paste_age_days()
    rc, out = run(['node', 'compare_matrix.mjs', '--sweep', str(SWEEP_DIR)], 'compare')
    stages['compare'] = grab(out, 'agree') or 'no summary line'
    if rc:
        if age is not None and age > STALE_PASTE_DAYS:
            stages['compare'] += f'  (ADVISORY - newest manual paste is {age}d old)'
        else:
            failed.append('compare')

    print(f'\n=== VERDICT ===\n')
    for k, v in stages.items():
        print(f'  {k:<9} {v}')
    print(f'\n  target    {key}{"" if a.write else "  (DRY RUN - nothing published)"}')
    if age is not None:
        print(f'  pastes    newest manual paste is {age}d old'
              + (f'  -> compare is advisory' if age > STALE_PASTE_DAYS else ''))

    ok = not failed
    journal({
        'ts': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'day': date.today().isoformat(), 'ok': ok, 'target': key,
        'pasteAgeDays': age, 'failed': failed, 'stages': stages,
    })

    if failed:
        print(f'\n  VERDICT   NOT OK - {", ".join(failed)} fell short')
        print(f'  Detail is in {SWEEP_DIR}\\sweep_*.log')
        sys.exit(1)
    print('\n  VERDICT   OK')


if __name__ == '__main__':
    main()
