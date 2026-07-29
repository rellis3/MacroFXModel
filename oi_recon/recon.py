"""OI RECON — find out what CME actually serves, before building any pipeline.

READ-ONLY BY DESIGN. This script writes nothing except files under `oi_recon/out/`.
It does not touch the repo, localStorage, KV, or the dashboard. Nothing downstream
can break because of it. Its only job is to answer one question:

    Can we get, per instrument, EVERY strike's call/put open interest, the
    settlement price and the implied vol — and from which endpoint?

WHY IT CAPTURES RATHER THAN ASSUMES. Hard-coding "the CME JSON API URL" from
memory is how you get a script that fails silently against a changed path. So
the browser mode does the opposite: it drives a real Chrome, lets the CME page
make its OWN authenticated requests, and RECORDS every JSON response it sees.
The output is therefore the truth about today's endpoints and today's schema —
discovered, not recalled. A production fetcher gets written afterwards, against
whatever this proves exists.

MODES
  python recon.py --probe              no-login pass: what's reachable with plain HTTP?
  python recon.py --login              opens Chrome; YOU log in by hand; session persists
  python recon.py --browse             reuse that session, visit each product, capture everything
  python recon.py --diff               grade what was captured against what the parser needs

TERMS OF USE — READ THIS. cmegroup.com's Data Terms of Use prohibit automated
retrieval, and CME enforces it with IP blocks (verified 2026-07-29: the site
returns 403 "This IP address is blocked due to suspected web scraping activity"
to scripted requests). This tool is deliberately low-volume, single-pass and
serialised with a delay, and it makes NO attempt to evade detection or to defeat
the login — you sign in yourself, in a visible browser, with your own account.
Treat the sanctioned routes (CME's published settlement files, DataMine, or a
broker/vendor API) as the destination; treat this as the survey that tells you
whether you need them.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
PROFILE = HERE / '.chrome-profile'          # your logged-in Chrome session lives here
OUT_ROOT = HERE / 'out'

sys.path.insert(0, str(HERE))
from products import PRODUCTS, CME_PRODUCTS   # noqa: E402

# One honest browser identity. NOT rotated, NOT disguised — if CME wants to
# refuse this, it should be able to see exactly what it is.
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')


# ─────────────────────────────────────────────────────────────────────────────
# What "good enough" means. Derived from the three real pastes the parser is
# pinned against (js/fixtures/) — see js/oiPasteContract.test.mjs. A source is
# only useful if it carries these; anything less means the module still needs a
# manual paste for the missing field.
# ─────────────────────────────────────────────────────────────────────────────
#
# CALIBRATION NOTE. The first cut of this grader looked for 'call open interest'
# as one adjacent phrase and scored all three real fixtures as HAVING NO OI —
# i.e. it would have rejected a perfect source. CME splits the header across two
# rows ('Call<tab><tab>Put<tab>Volatility<tab>Open Interest' then
# 'Chg Prior Settle Strike ... Call | Call Chg | Put | Put Chg'), so the tokens
# are never adjacent. Patterns below are token-presence, and `--diff` prints the
# fixtures' own scores as the oracle: if a change here stops the fixtures
# scoring full marks, the grader is wrong, not the source.
REQUIRED_FIELDS = {
    'strike':     [r'\bstrike'],
    'open_int':   [r'open.?interest', r'\bopen int', r'\boi\b'],
    'call':       [r'\bcall'],
    'put':        [r'\bput'],
    'settle':     [r'\bsettle'],
    'iv':         [r'implied.?vol', r'\bvolatility\b', r'\bimplied\b'],
    'expiry':     [r'\bexpir', r'monthyear', r'contract.?month'],
    'underlying': [r'future.?price', r'\bunderlying', r'\bstraddle'],
}
NFIELDS = len(REQUIRED_FIELDS)


def outdir(sub: str) -> Path:
    d = OUT_ROOT / date.today().isoformat() / sub
    d.mkdir(parents=True, exist_ok=True)
    return d


def safe_name(s: str, maxlen: int = 120) -> str:
    s = re.sub(r'[^A-Za-z0-9._-]+', '_', s).strip('_')
    return s[:maxlen] or 'unnamed'


def grade(text: str) -> dict:
    """Which of the required fields does this blob appear to carry?

    Deliberately crude — presence of the field NAME, case-insensitive, in JSON
    keys or table headers. Recon answers 'is it plausibly in here', not 'is it
    correct'. Correctness is the --diff step against the fixtures.
    """
    low = text.lower()
    return {f: any(re.search(p, low) for p in pats) for f, pats in REQUIRED_FIELDS.items()}


def grade_line(g: dict) -> str:
    return ' '.join(('+' if v else '-') + k for k, v in g.items())


def shape(text: str) -> dict:
    """Structural signal, for the table that carries no useful header text.

    The heatmap matrix is the case that matters: a strike x expiry grid of bare
    numbers, so token-grading scores it ~1/8 while it is in fact complete. Its
    completeness is positional - depth of the strike ladder and column count -
    not lexical. Grade it on shape, and the term/chain tables on tokens.
    """
    rows = [r for r in text.splitlines() if r.strip()]
    # Leading [-+] is not optional-pedantry: the settlements chain's first column
    # is a Chg, so half its rows start negative. Without it the fixture's 41
    # strikes counted as 20 and a COMPLETE capture would read as truncated.
    strike_rows = [r for r in rows if re.match(r'^\s*[-+]?[\d,]+\.?\d*\s*\t', r)]
    widths = [r.count('\t') + 1 for r in strike_rows]
    return dict(rows=len(rows), strikes=len(strike_rows),
                cols=max(widths) if widths else 0)


def shape_line(s: dict) -> str:
    return f"{s['rows']:>4} rows {s['strikes']:>4} strikes {s['cols']:>3} cols"


# ─────────────────────────────────────────────────────────────────────────────
# MODE 1 — probe. No login, no browser. What does plain HTTP get us?
# ─────────────────────────────────────────────────────────────────────────────
def mode_probe(delay: float, limit: int | None) -> None:
    import requests

    d = outdir('probe')
    sess = requests.Session()
    sess.headers.update({
        'User-Agent': UA,
        'Accept': 'text/html,application/json,application/xhtml+xml,*/*',
        'Accept-Language': 'en-GB,en;q=0.9',
    })

    targets = []

    # (a) CME's published end-of-day files. These are the SANCTIONED route — if
    #     any of these carry per-strike OI, the browser path becomes unnecessary.
    #     Paths are candidates to be confirmed by this run, not known-good.
    for u in [
        'https://www.cmegroup.com/ftp/pub/settle/stlint_v2',
        'https://www.cmegroup.com/ftp/pub/settle/stlds_v2',
        'https://www.cmegroup.com/ftp/bulletin/',
        'https://ftp.cmegroup.com/settle/',
        'https://ftp.cmegroup.com/bulletin/',
        'https://datamine.cmegroup.com/',
    ]:
        targets.append(('sanctioned', 'ALL', u))

    # (b) The public product/settlement pages — the navigation entry points the
    #     browser mode will use. Status here tells us which slugs are current.
    prods = CME_PRODUCTS[:limit] if limit else CME_PRODUCTS
    for p in prods:
        base = f"https://www.cmegroup.com/markets/{p['slug']}"
        targets.append(('page', p['sym'], f'{base}.settlements.options.html'))
        targets.append(('page', p['sym'], f'{base}.volume.html'))

    manifest = []
    print(f'\n[probe] {len(targets)} targets, {delay}s apart - no login, no browser\n')
    for kind, sym, url in targets:
        rec = dict(kind=kind, sym=sym, url=url)
        try:
            r = sess.get(url, timeout=30, allow_redirects=True)
            body = r.content
            rec.update(status=r.status_code, bytes=len(body),
                       ctype=r.headers.get('content-type', ''), final=r.url)
            fn = d / f"{kind}_{safe_name(sym)}_{safe_name(url.split('/')[-1] or 'index')}.bin"
            fn.write_bytes(body[:5_000_000])
            rec['saved'] = fn.name
            text = body[:2_000_000].decode('utf-8', 'replace')
            rec['fields'] = grade(text)
            # CME's block notice is a 403 with a specific body — call it what it is.
            if 'suspected web scraping' in text.lower():
                rec['blocked'] = True
        except Exception as e:                       # noqa: BLE001 — recon records failures
            rec.update(status=0, error=f'{type(e).__name__}: {e}')
        manifest.append(rec)

        flag = ' BLOCKED' if rec.get('blocked') else ''
        fields = '  ' + grade_line(rec['fields']) if rec.get('fields') else ''
        print(f"  {str(rec.get('status')):>3}{flag:8} {rec.get('bytes', 0):>9,}b  "
              f"{sym:<11} {url}{fields}")
        time.sleep(delay)

    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f'\n[probe] -> {d}')
    _probe_verdict(manifest)


def _probe_verdict(manifest: list) -> None:
    blocked = sum(1 for m in manifest if m.get('blocked'))
    ok = [m for m in manifest if m.get('status') == 200]
    print(f'\n  {len(ok)}/{len(manifest)} returned 200 - {blocked} explicitly blocked')
    if blocked:
        print('  -> Your IP is being refused by CME. That is their anti-scraping block,')
        print('    not a bug here. The browser mode may still work (real session), but')
        print('    the sanctioned file/DataMine/vendor routes are the durable answer.')
    if not ok:
        print('  -> Nothing reachable unauthenticated. Run --login then --browse.')


# ─────────────────────────────────────────────────────────────────────────────
# MODE 2 — login. Opens YOUR Chrome. You type your own credentials. Nothing is
# automated about the sign-in and nothing is stored by this script but the
# browser profile Chrome writes itself.
# ─────────────────────────────────────────────────────────────────────────────
def mode_login() -> None:
    ctx = _launch(headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://www.cmegroup.com/', wait_until='domcontentloaded')
    print('\n' + '=' * 72)
    print(' A Chrome window is open. Sign in to CME yourself - this script does')
    print(' not read, store or transmit your credentials. Navigate to one of the')
    print(' options/QuikStrike pages you normally copy from, so the session is')
    print(' fully established.')
    print(f'\n Session persists in: {PROFILE}')
    print(' (gitignored - it holds live cookies. Do not commit or share it.)')
    print('=' * 72)
    input('\n Press Enter here when you are logged in and done... ')
    ctx.close()
    print('[login] session saved. Now run:  python recon.py --browse')


# ─────────────────────────────────────────────────────────────────────────────
# MODE 3 — browse. Reuse the session, visit each product, and record EVERYTHING
# the page fetches. This is where the real endpoint discovery happens.
# ─────────────────────────────────────────────────────────────────────────────
def mode_browse(delay: float, limit: int | None, headless: bool, only: str | None) -> None:
    d = outdir('browser')
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()

    captured: list = []

    def on_response(resp):
        """Record every JSON/XHR the page pulls — this IS the endpoint discovery."""
        try:
            req = resp.request
            if req.resource_type not in ('xhr', 'fetch'):
                return
            ctype = (resp.headers or {}).get('content-type', '')
            if 'json' not in ctype and 'javascript' not in ctype:
                return
            body = resp.body()
            if not body:
                return
            text = body[:2_000_000].decode('utf-8', 'replace')
            g = grade(text)
            rec = dict(url=resp.url, status=resp.status, bytes=len(body),
                       ctype=ctype, method=req.method, fields=g,
                       hits=sum(g.values()))
            fn = d / f"xhr_{rec['hits']}hits_{safe_name(resp.url.split('/')[-1])}_{len(captured)}.json"
            fn.write_bytes(body[:5_000_000])
            rec['saved'] = fn.name
            # POST bodies matter: CME's option endpoints take params we'd need to replay.
            if req.method == 'POST' and req.post_data:
                rec['post_data'] = req.post_data[:4000]
            captured.append(rec)
        except Exception:                            # noqa: BLE001 — never break the crawl
            pass

    page.on('response', on_response)

    prods = [p for p in CME_PRODUCTS if not only or p['sym'] == only]
    if limit:
        prods = prods[:limit]

    print(f'\n[browse] {len(prods)} products - headless={headless}\n')
    for p in prods:
        base = f"https://www.cmegroup.com/markets/{p['slug']}"
        for suffix in ('.settlements.options.html', '.volume.html'):
            url = base + suffix
            print(f"  -> {p['sym']:<11} {url}")
            try:
                page.goto(url, wait_until='domcontentloaded', timeout=60_000)
                # The tables are built client-side; give the XHRs time to land.
                try:
                    page.wait_for_load_state('networkidle', timeout=20_000)
                except Exception:
                    pass
                _dump_tables(page, d, p['sym'], suffix)
            except Exception as e:                   # noqa: BLE001
                print(f'     ! {type(e).__name__}: {e}')
            time.sleep(delay)

    (d / 'xhr_manifest.json').write_text(json.dumps(captured, indent=2))
    ctx.close()

    print(f'\n[browse] captured {len(captured)} JSON responses -> {d}')
    best = sorted(captured, key=lambda r: -r['hits'])[:8]
    if best:
        print('\n  Most promising endpoints (by required-field coverage):')
        for r in best:
            print(f"    {r['hits']}/7  {grade_line(r['fields'])}")
            print(f"          {r['url'][:150]}")
    print('\n  Next:  python recon.py --diff')


def _dump_tables(page, d: Path, sym: str, suffix: str) -> None:
    """Extract every rendered table as TAB-SEPARATED text.

    Tab-separated is not an arbitrary choice: it is exactly what the existing
    parser eats (js/oi.js `parseOIMatrix` / `parseIVSettlement` consume the
    clipboard text of these same tables). If a dumped .tsv here parses, the
    fetcher can feed the existing path with ZERO parser changes — and the
    vendor-oracle test in js/oiPasteContract.test.mjs keeps guarding it.

    Frames are walked because QuikStrike renders inside an iframe.
    """
    js = """() => Array.from(document.querySelectorAll('table')).map(t =>
        Array.from(t.querySelectorAll('tr')).map(r =>
            Array.from(r.querySelectorAll('th,td'))
                 .map(c => (c.innerText || '').replace(/\\s+/g, ' ').trim())
                 .join('\\t')
        ).join('\\n')
    )"""
    n = 0
    for frame in page.frames:
        try:
            tables = frame.evaluate(js)
        except Exception:                            # noqa: BLE001 — cross-origin frames
            continue
        for t in tables or []:
            if t.count('\n') < 3:                    # nav/layout tables, not data
                continue
            fn = d / f"table_{safe_name(sym)}_{safe_name(suffix)}_{n}.tsv"
            fn.write_text(t, encoding='utf-8')
            n += 1
    if n:
        print(f'     {n} data table(s) dumped as .tsv')


def _launch(headless: bool):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit('Playwright not installed.  pip install playwright  &&  playwright install chromium')
    pw = sync_playwright().start()
    PROFILE.mkdir(parents=True, exist_ok=True)
    kw = dict(user_data_dir=str(PROFILE), headless=headless,
              viewport={'width': 1600, 'height': 1000}, args=['--start-maximized'])
    # Prefer real installed Chrome — it is the browser you logged in with.
    try:
        return pw.chromium.launch_persistent_context(channel='chrome', **kw)
    except Exception:
        return pw.chromium.launch_persistent_context(**kw)


# ─────────────────────────────────────────────────────────────────────────────
# MODE 4 — diff. Grade what we captured against what the module needs, and
# against the real fixtures. This is the step that decides the design.
# ─────────────────────────────────────────────────────────────────────────────
def mode_diff() -> None:
    root = OUT_ROOT / date.today().isoformat()
    if not root.exists():
        sys.exit(f'No captures for today at {root} - run --probe / --browse first.')

    print('\n-- ORACLE: the three real pastes the parser is pinned against ------')
    print('   Any candidate source must match or beat the profile of the table')
    print('   it is meant to replace. These rows are ground truth, not targets')
    print('   to be argued with - if they ever score badly, the grader is wrong.')
    fixdir = REPO / 'js' / 'fixtures'
    fixtures = {p.name: p.read_text(encoding='utf-8', errors='replace')
                for p in sorted(fixdir.glob('oi-*.txt'))} if fixdir.exists() else {}
    for name, txt in fixtures.items():
        g = grade(txt)
        print(f'   {name:<38} {sum(g.values())}/{NFIELDS}  {shape_line(shape(txt))}')
        print(f'   {"":<38} {grade_line(g)}')

    # 1. Best JSON endpoints seen.
    xm = root / 'browser' / 'xhr_manifest.json'
    if xm.exists():
        recs = json.loads(xm.read_text())
        bar = NFIELDS - 2          # 2 misses allowed: no single table carries every field
        full = [r for r in recs if r['hits'] >= bar]
        print(f'\n-- Captured endpoints ---------------------------------------------')
        print(f'   {len(recs)} JSON responses - {len(full)} carry >={bar} of {NFIELDS} fields')
        for r in sorted(recs, key=lambda r: -r['hits'])[:12]:
            print(f"   {r['hits']}/{NFIELDS}  {r['url'][:120]}")
            missing = [k for k, v in r['fields'].items() if not v]
            if missing:
                print(f"          missing: {', '.join(missing)}")
    else:
        print('\n   (no browser capture yet)')

    # 2. Do the dumped tables reach the oracle's profile?
    print('\n-- Dumped tables (compare each against the oracle rows above) ------')

    tsvs = sorted((root / 'browser').glob('*.tsv')) if (root / 'browser').exists() else []
    print(f'\n   {len(tsvs)} table(s) dumped this run:')
    for t in tsvs[:25]:
        txt = t.read_text(encoding='utf-8', errors='replace')
        g = grade(txt)
        print(f'   {t.name[:46]:<46} {sum(g.values())}/{NFIELDS}  {shape_line(shape(txt))}')
        print(f'   {"":<46} {grade_line(g)}')

    print('\n-- Verdict to draw ------------------------------------------------')
    print('   A table is a REPLACEMENT for a manual paste only if it has every')
    print('   strike (not a 20-row visible window), both call and put OI, and the')
    print('   expiry code. A partial table is worse than no automation - it would')
    print('   silently move max pain and the walls.')
    print(f'\n   Raw captures: {root}')


def main() -> None:
    ap = argparse.ArgumentParser(description='Read-only recon for CME OI data sources.')
    ap.add_argument('--probe', action='store_true', help='no-login HTTP pass')
    ap.add_argument('--login', action='store_true', help='open Chrome, you sign in by hand')
    ap.add_argument('--browse', action='store_true', help='reuse session, capture endpoints/tables')
    ap.add_argument('--diff', action='store_true', help='grade captures against the fixtures')
    ap.add_argument('--headless', action='store_true', help='browse without a visible window')
    ap.add_argument('--only', help='single symbol, e.g. "EUR/USD"')
    ap.add_argument('--limit', type=int, help='cap products (start with 1)')
    ap.add_argument('--delay', type=float, default=3.0, help='seconds between requests (default 3)')
    a = ap.parse_args()

    if not any([a.probe, a.login, a.browse, a.diff]):
        ap.print_help()
        print('\nSuggested first run:\n'
              '  python recon.py --probe --limit 1\n'
              '  python recon.py --login\n'
              '  python recon.py --browse --only "EUR/USD"\n'
              '  python recon.py --diff\n')
        return

    if a.probe:
        mode_probe(a.delay, a.limit)
    if a.login:
        mode_login()
    if a.browse:
        mode_browse(a.delay, a.limit, a.headless, a.only)
    if a.diff:
        mode_diff()


if __name__ == '__main__':
    main()
