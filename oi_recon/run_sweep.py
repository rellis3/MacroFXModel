"""Nightly sweep: every product, every table, one browser session.

  python run_sweep.py                       every product in quikstrike_ids.json
  python run_sweep.py --products "EUR/USD,XAU/USD"
  python run_sweep.py --headless            off-screen window, for the scheduler
  python run_sweep.py --dry-run             list what it WOULD pull, touch nothing

This is the thing a scheduler calls. Design rules it follows, each of them
earned during the build rather than assumed:

  ONE SESSION FOR THE WHOLE RUN. Products are driven through a single browser
  context (pull_product takes an existing ctx), so eleven products cost one
  session mint, not eleven.

  ONE PRODUCT'S FAILURE MUST NOT COST THE OTHERS. Every product is wrapped;
  an exception is recorded and the sweep continues. Losing ten instruments
  because the eleventh timed out is the failure mode of a naive loop.

  IT MUST BE READABLE THE NEXT MORNING. Everything goes to a timestamped log
  as well as the console, and the run ends with a product x table grid so a
  glance answers 'did last night work'.

  IT MUST EXIT NON-ZERO WHEN SOMETHING IS WRONG. A scheduler can only alert on
  what the process reports. Silent partial success is the thing to avoid: a
  sweep that captured 3 of 11 products should look FAILED, not finished.

NOT YET WIRED: nothing here writes to KV or the dashboard. The sweep produces
validated files under out/<date>/quikstrike/ and a run manifest; ingestion is
the next stage and is deliberately a separate step, so a bad capture cannot
reach the store before anyone has looked at it.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from pull_quikstrike import (VIEWS, _launch, _load_qs_ids,        # noqa: E402
                             pull_product)
from recon import outdir                                          # noqa: E402

DEFAULT_VIEWS = ['settles', 'oi', 'chg', 'vol']   # settles first: it is the light view

_BOX_DESC = {
    'rawIVTerm': 'the Settlements table: per-expiry ATM IV + straddle + OI',
    'rawOI':     'strike x expiry open interest',
    'rawChg':    'strike x expiry OI change (day over day)',
    'rawVol':    'strike x expiry EOD volume',
}


class Tee:
    """Console AND a log file. A scheduled run nobody watched still has to be
    reconstructable in the morning."""

    def __init__(self, path: Path):
        self.f = open(path, 'a', encoding='utf-8')

    def write(self, s):
        sys.__stdout__.write(s)
        self.f.write(s)
        # Flush every write. Without this the log stays 0 bytes until the process
        # exits, which is useless precisely when you want it: watching an 8-minute
        # sweep that may be failing.
        self.f.flush()

    def flush(self):
        sys.__stdout__.flush()
        self.f.flush()


def main() -> None:
    ap = argparse.ArgumentParser(description='Nightly QuikStrike sweep.')
    ap.add_argument('--products', help='comma list; default = all in quikstrike_ids.json')
    ap.add_argument('--views', default=','.join(DEFAULT_VIEWS))
    ap.add_argument('--headless', action='store_true',
                    help='off-screen window (true headless is blocked by the site)')
    ap.add_argument('--dry-run', action='store_true', help='list the plan, do nothing')
    ap.add_argument('--pause', type=float, default=3.0,
                    help='seconds between products (default 3)')
    a = ap.parse_args()

    # Filter by SHAPE, not by key prefix: quikstrike_ids.json carries explanatory
    # string entries (why pid 130 was remapped, for instance) and a '_'-prefix
    # rule missed a '//'-prefixed one, crashing the dry-run on a string index.
    ids = {k: v for k, v in _load_qs_ids().items()
           if isinstance(v, dict) and v.get('pid')}
    wanted = ([p.strip() for p in a.products.split(',') if p.strip()]
              if a.products else list(ids))
    missing = [p for p in wanted if p not in ids]
    products = [p for p in wanted if p in ids]
    views = [v.strip() for v in a.views.split(',') if v.strip() in VIEWS]
    views.sort(key=lambda v: 0 if v == 'settles' else 1)

    if missing:
        print(f'! no pid for: {", ".join(missing)} '
              f'- run pull_quikstrike.py --learn-pid --product "<sym>"')
    if not products:
        sys.exit('nothing to sweep')

    if a.dry_run:
        print(f'\n[dry-run] {len(products)} product(s) x {len(views)} view(s):')
        for p in products:
            print(f'   {p:<12} pid={ids[p]["pid"]:<4} pf={ids[p].get("pf")}  -> {", ".join(views)}')
        print('\n  Nothing was fetched, written or validated.')
        return

    d = outdir('quikstrike')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    log = d / f'sweep_{stamp}.log'
    sys.stdout = Tee(log)                                # noqa: SIM115

    started = time.time()
    print(f'\n=== SWEEP {stamp} · {len(products)} product(s) · views: {", ".join(views)} ===\n')

    results: dict = {}
    ctx = _launch(headless=a.headless)
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        for i, prod in enumerate(products, 1):
            print(f'\n----- [{i}/{len(products)}] {prod} '
                  f'{"-" * max(0, 46 - len(prod))}')
            try:
                results[prod] = pull_product(ctx, page, prod, list(views))
            except Exception:                            # noqa: BLE001
                # Deliberately broad: a scheduled sweep must survive anything one
                # product does, and the traceback goes to the log for diagnosis.
                print(f'  !! {prod} raised - continuing with the rest')
                traceback.print_exc(file=sys.stdout)
                results[prod] = {'_error': traceback.format_exc(limit=3)}
            time.sleep(a.pause)
    finally:
        try:
            ctx.close()
        except Exception:                                # noqa: BLE001
            pass

    _report(results, products, views, d, stamp, time.time() - started, log)


def _report(results: dict, products: list, views: list, d: Path,
            stamp: str, secs: float, log: Path) -> None:
    """Product x table grid, a manifest, and an exit code a scheduler can act on."""
    boxes = [VIEWS[v][2] for v in views]
    print(f'\n\n=== RESULT ({secs:.0f}s) ===\n')
    # Name the VIEW as well as the box. Labelling columns by destination box
    # alone reads as if the Settlements table is missing, when 'settles' IS
    # rawIVTerm - the per-expiry settlements table carrying ATM IV.
    print('  columns are  view -> store box:')
    for v in views:
        print(f'      {v:<8} -> {VIEWS[v][2]:<10} {_BOX_DESC.get(VIEWS[v][2], "")}')
    print(f'      {"(chain)":<8} -> {"rawIV":<10} per-strike IV smile - NOT YET AUTOMATED')
    print()
    print('  product      ' + '  '.join(f'{b:<10}' for b in boxes))
    ok_total = 0
    for prod in products:
        r = results.get(prod) or {}
        cells = []
        for b in boxes:
            hit = any(k.endswith(f'_{b}.tsv') for k in r)
            cells.append('ok' if hit else '--')
            ok_total += 1 if hit else 0
        err = '  ERROR' if r.get('_error') else ('' if r.get('_validated', True) else '  (validation failed)')
        print(f'  {prod:<12} ' + '  '.join(f'{c:<10}' for c in cells) + err)

    want = len(products) * len(boxes)
    print(f'\n  {ok_total}/{want} tables captured')
    manifest = d / f'sweep_{stamp}.json'
    manifest.write_text(json.dumps(
        dict(when=stamp, seconds=round(secs), products=products, views=views,
             captured=ok_total, expected=want, results=results), indent=2))
    print(f'  manifest: {manifest.name}')
    print(f'  log:      {log.name}')

    # A partial sweep must LOOK failed. Reporting success on 3 of 44 tables is
    # how a broken nightly job goes unnoticed for a week.
    if ok_total < want:
        print(f'\n  INCOMPLETE - {want - ok_total} table(s) missing')
        sys.exit(1)
    print('\n  complete')


if __name__ == '__main__':
    main()
