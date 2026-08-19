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
import re
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from pull_quikstrike import (VIEWS, _drop_cached_session, _launch,  # noqa: E402
                             _load_qs_ids, pull_chain, pull_product)
from recon import outdir, safe_name                               # noqa: E402

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
    # Phase 2: the per-strike IV smile -> charm/vanna/skew.
    #
    # Runs as a SECOND SWEEP over all products, not interleaved with phase 1. An
    # earlier interleaved version dropped the session after each product (the only
    # way to clear a selected expiry) and QuikStrike refused after ~5 mints,
    # taking the matrices down with it: 20/44 tables on 2026-08-19. As its own
    # phase it costs one mint per sweep.
    ap.add_argument('--chain', action='store_true',
                    help='also capture the per-strike IV smile (charm/vanna), as a '
                         'second phase after all four-view captures')
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

        # ── PHASE 1: the four matrix views, every product ────────────────────
        # No expiry is ever selected here, so the session stays unscoped for the
        # whole phase and one cached session serves all eleven products.
        print(f'--- PHASE 1: {", ".join(views)} for {len(products)} product(s) ---')
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

        # ── PHASE 2: the per-strike smile, every product ─────────────────────
        # Separated from phase 1 for one reason: selecting an expiry scopes the
        # tool, and the ONLY way to clear it is a fresh session. Interleaved, that
        # meant a mint per product, and QuikStrike refused after about five -
        # costing the matrices, not just the smiles (20/44 on 2026-08-19).
        #
        # Run as its own phase, contamination between products no longer matters:
        # every chain capture opens its own product and selects its own expiry,
        # and refuses to write unless the heading confirms it. So the session is
        # dropped ONCE, after the phase, purely so TOMORROW's phase 1 starts clean.
        if a.chain and 'settles' in views:
            print(f'\n\n--- PHASE 2: per-strike IV smile for {len(products)} product(s) ---')
            for i, prod in enumerate(products, 1):
                print(f'\n----- [{i}/{len(products)}] {prod} (smile) '
                      f'{"-" * max(0, 38 - len(prod))}')
                try:
                    _chain_pass(ctx, page, prod, results.setdefault(prod, {}), d)
                except Exception:                        # noqa: BLE001
                    print(f'  !! {prod} smile raised - continuing')
                    traceback.print_exc(file=sys.stdout)
                time.sleep(a.pause)
            _drop_cached_session()
            print('\n  [session dropped so the next run starts on an unscoped view]')
    finally:
        try:
            ctx.close()
        except Exception:                                # noqa: BLE001
            pass

    _report(results, products, views, d, stamp, time.time() - started, log)


def _chain_pass(ctx, page, prod: str, res: dict, d: Path) -> None:
    """Resolve which expiry the walls sit on, then capture just that chain.

    The resolution is delegated to resolve_smile.mjs (which imports js/oi.js)
    rather than reimplemented here: picking the expiry is exactly the decision
    that was silently wrong before oiPasteContract.test.mjs existed - correct
    maths, wrong expiry, entirely plausible output - and a Python second opinion
    would be free to drift from the dashboard's.

    Never fatal. A product without a smile still has its four matrices; charm and
    vanna are simply not shown, which is the documented behaviour when IV is
    absent.
    """
    stem = safe_name(prod)
    oi_f, term_f = d / f'{stem}_rawOI.tsv', d / f'{stem}_rawIVTerm.tsv'
    if not oi_f.exists():
        print('  chain      no rawOI from pass 1 - cannot resolve an expiry, skipping')
        return
    try:
        r = subprocess.run(
            ['node', str(HERE / 'resolve_smile.mjs'), str(oi_f),
             *( [str(term_f)] if term_f.exists() else [] )],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    except Exception as e:                               # noqa: BLE001
        print(f'  chain      could not run resolve_smile ({type(e).__name__}) - skipping')
        return
    m = re.search(r'RESOLVED_CODE=([A-Z0-9]+)', r.stdout or '')
    if not m:
        print('  chain      resolve_smile named no expiry - skipping (no smile is safe; '
              'a guessed one is not)')
        return
    code = m.group(1)
    print(f'  chain      walls sit on {code} - capturing that chain')
    path = pull_chain(ctx, page, prod, code)
    if path:
        res[Path(path).name] = path


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
    print(f'      {"(chain)":<8} -> {"rawIV":<10} per-strike IV smile for the walls\' expiry (pass 2)')
    print()
    print('  product      ' + '  '.join(f'{b:<10}' for b in boxes) + f'  {"rawIV":<10}')
    ok_total = 0
    per_box = {b: 0 for b in boxes}   # per-view hit count → names WHICH view fell short
    smiles = 0
    for prod in products:
        r = results.get(prod) or {}
        cells = []
        for b in boxes:
            hit = any(k.endswith(f'_{b}.tsv') for k in r)
            cells.append('ok' if hit else '--')
            ok_total += 1 if hit else 0
            if hit:
                per_box[b] += 1
        # rawIV is reported but NOT counted in the total. A smile can be legitimately
        # absent - resolve_smile may decline to name an expiry, and refusing to guess
        # one is the correct outcome. Counting it would make an honest abstention look
        # like a broken capture and mask a real 4-view failure behind it.
        got_iv = any(k.endswith('_rawIV.tsv') for k in r)
        smiles += 1 if got_iv else 0
        err = '  ERROR' if r.get('_error') else ('' if r.get('_validated', True) else '  (validation failed)')
        print(f'  {prod:<12} ' + '  '.join(f'{c:<10}' for c in cells)
              + f'  {"ok" if got_iv else "--":<10}' + err)

    want = len(products) * len(boxes)
    # Per-view breakdown rides the SAME "tables captured" line the heartbeat grabs
    # (run_daily.bat greps this line into oi_sweep_last.detail), so a partial night
    # says WHICH view failed remotely — "33/44" alone can't tell rawIVTerm 0/11
    # (no expected-move / IV term) from a scatter, and that ambiguity cost a manual
    # dig to diagnose. No .bat pattern change needed.
    by_view = ' · '.join(f'{b} {per_box[b]}/{len(products)}' for b in boxes)
    print(f'\n  {ok_total}/{want} tables captured  (by view: {by_view})')
    print(f'  {smiles}/{len(products)} per-strike smile(s) captured '
          f'(rawIV -> charm/vanna/skew; not counted above)')
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
