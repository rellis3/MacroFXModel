"""THE one command. Capture -> build -> compare -> verdict.

  python run_daily.py                 capture + build + compare, writes NO KV
  python run_daily.py --write         also publish to the shadow key oi_store_py
  python run_daily.py --write --live  publish to the REAL key oi_store  (see below)
  python run_daily.py --skip-sweep    reuse today's captures, just rebuild + compare

Runs the three stages that were separate commands, and ends with one verdict a
human (or a scheduler) can act on without reading the scrollback:

    capture   44/44 tables
    ingest    11/11 entries complete
    compare   41/44 agree with your pastes
    VERDICT   OK

EXIT CODE IS THE POINT. Non-zero if any stage falls short, because a scheduled
job can only alert on what the process reports, and "captured 3 of 44 but exited
0" is how a broken nightly goes unnoticed for a week. Every stage below already
signals honestly; this only aggregates them.

--live IS NOT THE DEFAULT, deliberately. oi_store is what the bots read. The
shadow key exists so the two can be compared over several sessions first - one
day of agreement is not evidence that expiry rolls, month-end and illiquid
products all behave.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable
SWEEP_DIR = HERE / 'out' / date.today().isoformat() / 'quikstrike'


def run(cmd, label):
    """Run a stage, stream nothing, return (rc, output). Each stage already
    prints its own detail to its own log; here we only need the verdict."""
    print(f'  [{label}] running...', flush=True)
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    out = (r.stdout or '') + (r.stderr or '')
    return r.returncode, out


def grab(out, *needles):
    """Pull the summary line a stage prints, so the verdict quotes the stage
    rather than re-deriving (and possibly disagreeing with) it."""
    for line in out.splitlines():
        if all(n in line for n in needles):
            return line.strip()
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description='Daily OI: capture, build, compare.')
    ap.add_argument('--write', action='store_true', help='publish to KV')
    ap.add_argument('--live', action='store_true',
                    help='with --write: publish to oi_store instead of the shadow key')
    ap.add_argument('--skip-sweep', action='store_true', help='reuse today\'s captures')
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
        cmd = [PY, 'run_sweep.py'] + (['--headless'] if a.headless else [])
        rc, out = run(cmd, 'capture')
        stages['capture'] = grab(out, 'tables captured') or 'no summary line'
        if rc:
            failed.append('capture')

    # 2. INGEST - always runs, so a partial capture is still diagnosed
    key = 'oi_store' if a.live else 'oi_store_py'
    cmd = ['node', 'ingest.mjs', '--dir', str(SWEEP_DIR), '--key', key]
    if a.write:
        cmd.append('--write')
    rc, out = run(cmd, 'ingest')
    stages['ingest'] = grab(out, 'complete', 'skipped') or 'no summary line'
    if rc:
        failed.append('ingest')

    # 3. COMPARE against the manual pastes in oi_store
    rc, out = run(['node', 'compare_matrix.mjs', '--sweep', str(SWEEP_DIR)], 'compare')
    stages['compare'] = grab(out, 'agree') or 'no summary line'
    if rc:
        failed.append('compare')

    print(f'\n=== VERDICT ===\n')
    for k, v in stages.items():
        print(f'  {k:<9} {v}')
    print(f'\n  target    {key}{"" if a.write else "  (DRY RUN - nothing published)"}')
    if failed:
        print(f'\n  VERDICT   NOT OK - {", ".join(failed)} fell short')
        print(f'  Detail is in {SWEEP_DIR}\\sweep_*.log')
        sys.exit(1)
    print('\n  VERDICT   OK')


if __name__ == '__main__':
    main()
