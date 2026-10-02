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

PUBLISHES TO oi_store_cmdty ONLY (2026-10-02). After a capture whose core views are
complete it runs ingest.mjs --key oi_store_cmdty. The analysis page and the indicator
export read that key; the bots, range-line and the history archive read oi_store and
never see a commodity (ingest.mjs refuses a commodity aimed anywhere else, and the
reverse). The products are described once, in js/oi.js OI_PRODUCT_SPEC (contract size,
price units, vol). No heartbeat: the server keeps ONE last-run stamp (oi_sweep_last),
and the main run owns it.

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
CMDTY_KEY = 'oi_store_cmdty'      # never oi_store - see the module docstring
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
    ap.add_argument('--no-write', action='store_true', help='capture only, do not publish')
    ap.add_argument('--skip-sweep', action='store_true', help="re-publish today's capture without pulling again")
    a = ap.parse_args()
    # The scheduler redirects stdout to a log file, which Windows opens as cp1252; the
    # sweep's output carries '·' and replacement chars, and printing them crashed the run
    # (2026-10-02, after a good capture) before the journal line was written.
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:                                    # noqa: BLE001
        pass

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

    day_dir = HERE / 'out' / date.today().isoformat() / SUB
    if a.skip_sweep:
        n_oi = len(list(day_dir.glob('*_rawOI.tsv'))) if day_dir.exists() else 0
        rc, capture = (0 if n_oi else 1), f"{n_oi} product(s) reused from today's capture"
        views = {}
        ok = n_oi > 0
    else:
        cmd = [PY, 'run_sweep.py'] + (['--headless'] if a.headless else []) + (['--chain'] if a.chain else [])
        rc, out = _run(cmd)
        print(out[-4000:])
        m = re.search(r'^.*tables captured.*$', out, re.M)
        capture = m.group(0).strip() if m else 'no summary line'
        # Volume is the one view allowed to be missing. On a thin product (palladium, Brent)
        # a single 250-lot trade makes the OI-change grid and the volume grid IDENTICAL, and
        # the scraper's duplicate guard -- right for the main run, where identical means the
        # view never switched -- refuses the second. Seen 2026-10-02 on both, Brent on one run
        # and not the next. Volume only feeds the volume-magnet levels, so it is not fatal here;
        # the settles/OI/change views still have to be complete.
        views = dict((k, (int(x), int(y))) for k, x, y in re.findall(r'(raw\w+) (\d+)/(\d+)', capture))
        core_ok = bool(views) and all(views.get(k, (0, 1))[0] == views.get(k, (0, 1))[1]
                                      for k in ('rawIVTerm', 'rawOI', 'rawChg'))
        vol = views.get('rawVol')
        ok = rc == 0 or core_ok
        if ok and vol and vol[0] < vol[1]:
            capture += f'  [{vol[1] - vol[0]} volume grid(s) refused as identical to the change grid - thin product, accepted]'

    # PUBLISH - only after a capture whose core views are complete.
    ingest = 'skipped (capture fell short)'
    if ok and a.no_write:
        ingest = 'skipped (--no-write)'
    elif ok:
        irc, iout = _run(['node', 'ingest.mjs', '--dir', str(day_dir), '--write', '--key', CMDTY_KEY])
        print(iout[-3000:])
        m2 = re.search(r'(\d+ complete .*skipped)', iout)
        ingest = (m2.group(1).strip() if m2 else 'no summary line') + ('' if irc == 0 else f'  [ingest exit {irc}]')
        if irc != 0:
            ok = False

    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open('a', encoding='utf-8') as f:
        f.write(json.dumps({'ts': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                            'day': date.today().isoformat(), 'ok': ok, 'products': ready,
                            'pending': pending, 'capture': capture, 'ingest': ingest,
                            'dir': f'out/{date.today().isoformat()}/{SUB}'}) + '\n')
    print(f'\n=== VERDICT ===\n\n  capture   {capture}\n  ingest    {ingest}\n  target    {CMDTY_KEY}\n'
          f'\n  VERDICT   {"OK" if ok else "NOT OK"}')
    sys.exit(0 if ok else (rc or 1))


if __name__ == '__main__':
    main()
