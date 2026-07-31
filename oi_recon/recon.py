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
def mode_login(url: str = 'https://www.cmegroup.com/') -> None:
    ctx = _launch(headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(url, wait_until='domcontentloaded')
    print('\n' + '=' * 72)
    print(' A Chrome window is open. Sign in to CME yourself - this script does')
    print(' not read, store or transmit your credentials. Navigate to one of the')
    print(' options/QuikStrike pages you normally copy from, so the session is')
    print(' fully established.')
    print(f'\n Session persists in: {PROFILE}')
    print(' (gitignored - it holds live cookies. Do not commit or share it.)')
    print('=' * 72)
    # This prompt is a footgun: typing the NEXT command here gets consumed as the
    # keypress, the browser closes, and --browse silently never runs. Caught it
    # happening on the first real use, so the mistake is now named out loud.
    typed = input('\n Press Enter here when you are logged in and done... ')
    ctx.close()
    if 'recon.py' in typed or typed.strip().startswith(('python', 'py ')):
        print('\n  !! You typed a COMMAND at that prompt, not Enter. It was consumed')
        print('     as the keypress - your command did NOT run. The session is')
        print('     still saved, so just run it again now at the shell prompt.')
    print('[login] session saved. Now run:  python recon.py --browse --only "EUR/USD"')


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


# ─────────────────────────────────────────────────────────────────────────────
# MODE 5 — record. The QuikStrike answer.
#
# The OI heatmap (tools-information/quikstrike/open-interest-heatmap.html) is an
# ASP.NET WebForms widget inside a cross-origin iframe. Two consequences that
# make --browse the wrong tool for it:
#   • its updates arrive as `text/html` __doPostBack fragments, not JSON, so the
#     --browse handler (JSON-only) would capture NOTHING from it; and
#   • the table you want only exists after dropdown/toggle choices — expiry,
#     All-strikes-vs-ATM, and the Standard / Change / Volume view switch.
# Automating those blind is the fragile path. So this mode does not drive the
# widget at all: it watches while YOU click, snapshotting every distinct table
# state it sees. Switching view = a new snapshot, automatically.
#
# Stop signal is CLOSING THE CHROME WINDOW, deliberately — not a console prompt,
# because a prompt eats the next command you type (learned the hard way).
# ─────────────────────────────────────────────────────────────────────────────
QUIKSTRIKE_OI_HEATMAP = ('https://www.cmegroup.com/tools-information/quikstrike/'
                         'open-interest-heatmap.html')


def _is_num(cell: str) -> bool:
    return bool(re.fullmatch(r'[-+]?[\d,]+\.?\d*%?', cell.strip())) and any(c.isdigit() for c in cell)


def _merge_rows(merged: dict, tsv: str):
    """Fold one DOM read of a table into its row-union bucket.

    Bucket key is the header row when there is one, else the column count — so
    OI / OI-Change / Volume views never merge into each other, while successive
    pages or scroll positions OF THE SAME view do.

    Dedupe is on full row text, and order is first-seen. That is right for a
    strike ladder (rows are unique) and it means paging BACKWARDS still lands
    rows in the correct place, because the final write sorts by the first cell
    whenever that column is numeric.
    """
    lines = [ln for ln in tsv.split('\n') if ln.strip()]
    if not lines:
        return 0, 0
    first_cells = [ln.split('\t')[0] for ln in lines]
    hdr = lines[0] if not _is_num(first_cells[0]) else ''
    key = hdr if hdr else f'cols{lines[0].count(chr(9)) + 1}'
    b = merged.setdefault(key, dict(header=hdr, rows={}))
    added = 0
    for ln in (lines[1:] if hdr else lines):
        if ln not in b['rows']:
            b['rows'][ln] = None
            added += 1
    return added, len(b['rows'])


def _write_merged(merged: dict, d: Path) -> list:
    """Write one union-ed TSV per bucket. This is the file to actually use."""
    out = []
    for i, (key, b) in enumerate(merged.items()):
        rows = list(b['rows'])
        # WHICH column is the strike must be READ FROM THE HEADER, never assumed
        # to be column 0. In the settlements chain it is column 3 (col 0 is Chg);
        # sorting on col 0 produced a file that reported itself sorted while the
        # strike ladder ran 1.1375 -> 1.07. A wrong sort is worse than none.
        col = None
        if b['header']:
            for j, cell in enumerate(b['header'].split('\t')):
                if re.search(r'\bstrike', cell, re.I):
                    col = j
                    break
        def _key(row, c=col):
            return float(row.split('\t')[c].replace(',', '').rstrip('%'))
        did_sort, note = False, ''
        if col is None:
            note = 'no Strike header found - first-seen order kept'
        elif rows:
            cells = [r.split('\t') for r in rows]
            clean = sum(1 for c in cells if len(c) > col and _is_num(c[col]))
            if clean / len(rows) < 0.8:
                note = f'strike col only {clean}/{len(rows)} numeric - not sorted'
            else:
                try:
                    rows.sort(key=_key)
                    did_sort = True
                except (ValueError, IndexError):
                    # The real heatmap interleaves structural rows ('1 DTE', a
                    # repeated Strike header). Reordering around those would
                    # scramble the grid, so abandoning the sort is correct - but
                    # say so, don't leave it looking like a clean sorted ladder.
                    note = 'interleaved non-strike rows - first-seen order kept'
        txt = '\n'.join(([b['header']] if b['header'] else []) + rows)
        fn = d / f'merged_{i:02d}_{len(rows)}rows.tsv'
        fn.write_text(txt, encoding='utf-8')
        out.append(dict(saved=fn.name, rows=len(rows), key=key[:120],
                        strike_col=col, sorted_by_strike=did_sort, sort_note=note,
                        shape=shape(txt), fields=grade(txt)))
    return out


def mode_record(url: str, minutes: float, delay: float) -> None:
    import hashlib

    d = outdir('record')
    ctx = _launch(headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    net: list = []

    def on_response(resp):
        """Save every CME/QuikStrike response, INCLUDING text/html.

        --browse filters to JSON and would therefore miss QuikStrike's postback
        fragments entirely. Third-party noise (cookielaw, evergage) is dropped
        by host instead, which also cleans up the 41-response dross from the
        earlier run.
        """
        try:
            host = resp.url.split('/')[2] if '://' in resp.url else ''
            if not ('cmegroup.com' in host or 'quikstrike.net' in host):
                return
            rt = resp.request.resource_type
            if rt not in ('xhr', 'fetch', 'document'):
                return
            body = resp.body()
            if not body or len(body) < 200:
                return
            text = body[:2_000_000].decode('utf-8', 'replace')
            g = grade(text)
            rec = dict(url=resp.url, status=resp.status, bytes=len(body),
                       ctype=(resp.headers or {}).get('content-type', ''),
                       method=resp.request.method, rtype=rt,
                       fields=g, hits=sum(g.values()))
            fn = d / f"net_{rec['hits']}hits_{rt}_{len(net)}_{safe_name(resp.url.split('/')[-1])[:40]}.txt"
            fn.write_bytes(body[:5_000_000])
            rec['saved'] = fn.name
            if resp.request.method == 'POST' and resp.request.post_data:
                # WebForms postbacks carry the view/expiry selection in here —
                # this is what a production fetcher would have to reproduce.
                rec['post_data'] = resp.request.post_data[:8000]
            net.append(rec)
        except Exception:                            # noqa: BLE001 — never interrupt the human
            pass

    page.on('response', on_response)
    # A tool that opens in a new tab/popup would otherwise go unrecorded — the
    # handler must follow every page the session creates, not just the first.
    ctx.on('page', lambda p: p.on('response', on_response))
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=90_000)
    except Exception as e:                           # noqa: BLE001
        print(f'  ! initial goto failed ({type(e).__name__}) - navigate manually')

    print('\n' + '=' * 72)
    print(' RECORDING. Drive the page yourself, exactly as you normally would:')
    print('   1. pick the instrument / expiry you copy')
    print('   2. switch strikes to ALL (not the ~25 ATM window)')
    print('   3. if the table pages or scrolls, GO THROUGH ALL OF IT - rows are')
    print('      unioned, not overwritten, so every page/scroll position adds to')
    print('      the same bucket (gold is ~924 strikes; one screen is never it)')
    print('   4. cycle every view you want: OI, OI Change, Volume')
    print(' Live lines below show +N new rows per read, so you can SEE it filling.')
    print('\n STOP BY CLOSING THE CHROME WINDOW. Do not type here.')
    print('=' * 72 + '\n')

    js = """() => Array.from(document.querySelectorAll('table')).map(t =>
        Array.from(t.querySelectorAll('tr')).map(r =>
            Array.from(r.querySelectorAll('th,td'))
                 .map(c => (c.innerText || '').replace(/[ \\t]+/g, ' ').trim())
                 .join('\\t')
        ).join('\\n')
    )"""

    seen: set = set()
    snaps: list = []
    # ROW UNION, not table snapshots. A long ladder (gold: 924 strikes) may be
    # paginated or virtual-scrolled, so any single DOM read is a WINDOW onto it,
    # not the whole thing. Snapshotting tables would leave partials to stitch by
    # hand; accumulating rows means paging/scrolling through simply fills the set
    # in. Keyed by header row so the three views (OI / Change / Volume) stay in
    # separate buckets instead of merging into one nonsense table.
    merged: dict = {}
    # The first run of this mode ended with 0 snapshots and no way to tell WHY —
    # window closed, loop crashed, or the grid simply isn't a <table>. Guessing
    # between those wastes a re-run each time, so the loop now reports: an exit
    # reason, a heartbeat, and per-frame structure (tables / canvas / text size).
    exit_reason = 'time limit reached'
    started = time.time()
    reads = 0
    rejected = 0
    last_beat = 0.0
    diag: dict = {}
    deadline = started + minutes * 60
    while time.time() < deadline:
        try:
            pages = [p for p in ctx.pages if not p.is_closed()]
            if not pages:
                exit_reason = 'Chrome window closed'
                break
            # Scan EVERY page, not just the first: a QuikStrike tool that opens
            # in a new tab/popup would otherwise be invisible to this loop.
            frames = [fr for p in pages for fr in p.frames]
        except Exception as e:                       # noqa: BLE001 — browser gone
            exit_reason = f'browser detached ({type(e).__name__})'
            break
        reads += 1
        for fr in frames:
            try:
                st = fr.evaluate("""() => ({
                    tables: document.querySelectorAll('table').length,
                    rows: document.querySelectorAll('tr').length,
                    canvas: document.querySelectorAll('canvas').length,
                    grids: document.querySelectorAll('[role=grid],[role=table]').length,
                    textLen: (document.body?.innerText || '').length,
                })""")
                diag[fr.url[:150]] = st
                tables = fr.evaluate(js)
            except Exception:                        # noqa: BLE001 — frame navigating
                continue
            for t in tables or []:
                if t.count('\n') < 3:                # was 5 — count what we drop
                    rejected += 1
                    continue
                h = hashlib.sha1(t.encode('utf-8', 'replace')).hexdigest()[:12]
                if h in seen:
                    continue
                seen.add(h)
                sh = shape(t)
                n = len(snaps)
                fn = d / f'snap_{n:03d}_{sh["strikes"]}x{sh["cols"]}_{h}.tsv'
                fn.write_text(t, encoding='utf-8')
                snaps.append(dict(saved=fn.name, frame=fr.url[:200],
                                  shape=sh, fields=grade(t)))
                added, total = _merge_rows(merged, t)
                print(f'  snap {n:03d}  {shape_line(sh)}  {grade_line(grade(t))}'
                      f'  +{added} new rows (bucket now {total})')
        # Heartbeat: proves the recorder is alive during the minutes you spend
        # logging in and clicking, and shows what it can SEE while it waits.
        elapsed = time.time() - started
        if elapsed - last_beat >= 10:
            last_beat = elapsed
            best = max((v['rows'] for v in diag.values()), default=0)
            tbl = sum(v['tables'] for v in diag.values())
            cnv = sum(v['canvas'] for v in diag.values())
            print(f'  ..{int(elapsed):>4}s  {len(frames)} frames  {tbl} tables'
                  f'  {best} tr  {cnv} canvas  {len(snaps)} snaps'
                  + (f'  ({rejected} tables too small)' if rejected else ''))
        try:
            pages[0].wait_for_timeout(int(delay * 1000))
        except Exception as e:                       # noqa: BLE001 — closed mid-wait
            exit_reason = f'closed during wait ({type(e).__name__})'
            break

    mrg = _write_merged(merged, d)
    (d / 'record_manifest.json').write_text(
        json.dumps(dict(net=net, snaps=snaps, merged=mrg, frames=diag,
                        exit_reason=exit_reason, reads=reads,
                        seconds=round(time.time() - started, 1)), indent=2))
    try:
        ctx.close()
    except Exception:                                # noqa: BLE001
        pass
    print(f'\n[record] stopped: {exit_reason}'
          f'  ({round(time.time() - started)}s, {reads} DOM scans)')
    print(f'  {len(snaps)} table snapshot(s), {len(net)} response(s) -> {d}')
    if diag:
        print('\n  What each frame contained on the last scan:')
        for u, v in diag.items():
            print(f"    {v['tables']:>3} tables {v['rows']:>5} tr {v['canvas']:>2} canvas"
                  f" {v['grids']:>2} grids {v['textLen']:>7} chars  {u[:88]}")
        if not any(v['tables'] for v in diag.values()) and any(v['canvas'] for v in diag.values()):
            print('\n  -> Frames have canvas but no <table>: the grid is DRAWN, not marked')
            print('     up. A DOM scrape cannot read it; the postback/JSON payload can.')
    print(f'\n  ROW-UNION buckets ({len(mrg)}) - these are the files to use:')
    for m in mrg:
        biggest = max((s['shape']['rows'] for s in snaps), default=0)
        gain = '' if m['rows'] <= biggest else f'  (vs {biggest} in the largest single read)'
        print(f"    {m['saved']:<28} {shape_line(m['shape'])}"
              f"{'  sorted by strike' if m['sorted_by_strike'] else ''}{gain}")
        if m['sort_note']:
            print(f"    {'':<28} note: {m['sort_note']}")
    deep = [m for m in mrg if m['shape']['strikes'] >= 40]
    print(f'\n  {len(deep)} bucket(s) reached >=40 strikes (the oracle matrix has 94)')
    if not deep:
        print('  -> No deep ladder. Either the strike selector stayed on the ATM')
        print('     window, or a long table was never paged/scrolled to the end.')
        print('     An ATM-only ladder is the truncation trap - re-run and scroll.')
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
    """Launch the persistent, already-logged-in Chrome.

    `headless=True` does NOT use Chrome's headless mode. Akamai blocks true
    headless outright, so an unattended run would fail at 2am in a way an
    interactive test never reproduces. Instead the same real, rendering browser
    is launched with its window parked far off-screen: identical to the browser
    you use by hand, just not in your way.

    Note what this is and isn't. It is not fingerprint spoofing or impersonation
    - it is the same Chrome, the same profile, the same session you logged into
    yourself. It IS the difference between an unattended run working and not, so
    treat it as part of the same operator decision as everything else here.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit('Playwright not installed.  pip install playwright  &&  playwright install chromium')
    pw = sync_playwright().start()
    PROFILE.mkdir(parents=True, exist_ok=True)
    args = ['--start-maximized'] if not headless else [
        '--window-position=-32000,-32000', '--window-size=1600,1000']
    kw = dict(user_data_dir=str(PROFILE), headless=False,
              viewport={'width': 1600, 'height': 1000}, args=args)
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

    # 1. Best endpoints seen, across both capture modes.
    recs = []
    xm = root / 'browser' / 'xhr_manifest.json'
    if xm.exists():
        recs += json.loads(xm.read_text())
    rm = root / 'record' / 'record_manifest.json'
    if rm.exists():
        recs += json.loads(rm.read_text()).get('net', [])
    if recs:
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
        print('\n   (no browser/record capture yet)')

    # 2. Do the dumped tables reach the oracle's profile?
    print('\n-- Dumped tables (compare each against the oracle rows above) ------')

    tsvs = sorted(p for sub in ('browser', 'record')
                  for p in (root / sub).glob('*.tsv') if (root / sub).exists())
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
    ap.add_argument('--record', action='store_true',
                    help='QuikStrike: watch while YOU click; snapshot every table state')
    ap.add_argument('--diff', action='store_true', help='grade captures against the fixtures')
    ap.add_argument('--url', default=QUIKSTRIKE_OI_HEATMAP, help='page for --record')
    ap.add_argument('--minutes', type=float, default=20.0, help='--record time limit (default 20)')
    ap.add_argument('--headless', action='store_true', help='browse without a visible window')
    ap.add_argument('--only', help='single symbol, e.g. "EUR/USD"')
    ap.add_argument('--limit', type=int, help='cap products (start with 1)')
    ap.add_argument('--delay', type=float, default=3.0, help='seconds between requests (default 3)')
    a = ap.parse_args()

    if not any([a.probe, a.login, a.browse, a.record, a.diff]):
        ap.print_help()
        print('\nSuggested first run:\n'
              '  python recon.py --probe --limit 1\n'
              '  python recon.py --login\n'
              '  python recon.py --browse --only "EUR/USD"\n'
              '  python recon.py --record        # QuikStrike heatmap, you drive\n'
              '  python recon.py --diff\n')
        return

    if a.probe:
        mode_probe(a.delay, a.limit)
    if a.login:
        mode_login(a.url)
    if a.browse:
        mode_browse(a.delay, a.limit, a.headless, a.only)
    if a.record:
        mode_record(a.url, a.minutes, max(1.0, a.delay))
    if a.diff:
        mode_diff()


if __name__ == '__main__':
    main()
