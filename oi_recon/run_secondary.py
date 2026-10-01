"""SECONDARY nightly OI pull — the not-yet-critical products (commodities), run AFTER
the main one and walled off from it.

  python run_secondary.py --learn "XAG/USD"   record a product's QuikStrike pid (once each)
  python run_secondary.py --dry-run           list what it would pull
  python run_secondary.py --headless          the nightly run (run_secondary.bat calls this)

SAME SCRAPER, SEPARATE EVERYTHING ELSE. This does not copy pull_quikstrike.py /
run_sweep.py — those carry months of hard-won fixes (session mints, scoped views,
half-rendered ladders) and a fork would stop receiving them. It runs the same
scripts with two environment variables set in ITS OWN process only:

  QS_IDS_FILE=quikstrike_ids_secondary.json   its own product list
  OI_SWEEP_SUB=quikstrike_secondary           its own folder: out/<date>/quikstrike_secondary/

so it cannot add a product to, or overwrite a file of, the main run. Unset, both
default to the main run's values — the main run is byte-for-byte unaffected.

CAPTURE ONLY. Nothing here writes KV. js/oi.js does not know these products yet
(contract size, units, vol): built today they would get FX defaults and produce
wrong gamma with no error. Ingest comes after that is fixed, and to its own key —
never oi_store. It posts no heartbeat either: the server keeps ONE last-run stamp
(oi_sweep_last), and the main run owns it.

No --chain (per-strike smile) by default: phase 2 costs a QuikStrike session mint,
and the main run is the one that must never be refused one.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable
IDS_FILE = 'quikstrike_ids_secondary.json'
SUB = 'quikstrike_secondary'
JOURNAL = HERE / 'logs' / 'run_journal_secondary.jsonl'
ENV = {**os.environ, 'QS_IDS_FILE': IDS_FILE, 'OI_SWEEP_SUB': SUB}


def _run(cmd: list[str]) -> tuple[int, str]:
    r = subprocess.run(cmd, cwd=HERE, env=ENV, capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def main() -> None:
    ap = argparse.ArgumentParser(description='Secondary (commodities) OI capture.')
    ap.add_argument('--learn', metavar='PRODUCT', help='record this product\'s pid (opens Chrome)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--headless', action='store_true')
    ap.add_argument('--chain', action='store_true', help='also the per-strike smile (extra session mint)')
    a = ap.parse_args()

    if a.learn:
        # Interactive: you pick the product, close Chrome. Streams straight to the console.
        sys.exit(subprocess.call([PY, 'pull_quikstrike.py', '--learn-pid', '--product', a.learn],
                                 cwd=HERE, env=ENV))
    if a.dry_run:
        rc, out = _run([PY, 'run_sweep.py', '--dry-run'])
        print(out)
        sys.exit(rc)

    print(f'\n=== SECONDARY OI - {date.today().isoformat()} ===\n')
    ids = json.loads((HERE / IDS_FILE).read_text(encoding='utf-8'))
    ready = [k for k, v in ids.items() if isinstance(v, dict) and v.get('pid')]
    pending = [k for k, v in ids.items() if isinstance(v, dict) and not v.get('pid')]
    if pending:
        print(f'  no pid yet (skipped): {", ".join(pending)}')
    if not ready:
        print('  nothing to pull - learn a pid first:  python run_secondary.py --learn "XAG/USD"')
        sys.exit(0)

    cmd = [PY, 'run_sweep.py'] + (['--headless'] if a.headless else []) + (['--chain'] if a.chain else [])
    rc, out = _run(cmd)
    print(out[-4000:])
    m = re.search(r'^.*tables captured.*$', out, re.M)
    capture = m.group(0).strip() if m else 'no summary line'
    ok = rc == 0
    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open('a', encoding='utf-8') as f:
        f.write(json.dumps({'ts': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                            'day': date.today().isoformat(), 'ok': ok, 'products': ready,
                            'pending': pending, 'capture': capture,
                            'dir': f'out/{date.today().isoformat()}/{SUB}'}) + '\n')
    print(f'\n=== VERDICT ===\n\n  capture   {capture}\n  target    files only (no KV)\n'
          f'\n  VERDICT   {"OK" if ok else "NOT OK - capture fell short"}')
    sys.exit(rc)


if __name__ == '__main__':
    main()
