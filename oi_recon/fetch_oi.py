"""Unattended OI fetch — the overnight job.

  python fetch_oi.py --discover              learn each product's CME id (once)
  python fetch_oi.py --fetch                 fetch every product, write + validate
  python fetch_oi.py --fetch --pair EUR/USD  one instrument
  python fetch_oi.py --selftest              offline: synthesise + validate, no network

WHAT IT DOES. Calls CME's own settlement JSON endpoints — the ones the settlements
page itself uses — and turns them into the exact tab-separated text the dashboard's
paste path already parses. Output per instrument:

    <SYM>_oi_matrix.tsv       strike x expiry OPEN INTEREST   -> the rawOI box
    <SYM>_vol_matrix.tsv      strike x expiry VOLUME          -> the rawVol box

Nothing is written to KV, localStorage or the dashboard. Files land under
out/<date>/fetch/ and every one is put through validate_capture.mjs before being
reported as usable.

WHY THE JSON AND NOT THE WIDGET. The QuikStrike heatmap's column layout depends on
a `Report:` dropdown, and the wrong setting yields a table that parses to zero open
interest without erroring (verified 2026-07-29 — see validate_capture.mjs). The
JSON is a per-strike record with named fields, so there is no column to misread.

WHY IN-BROWSER. Requests are issued with page.evaluate + fetch from inside a real
logged-in Chrome page, not from `requests`. The same host refused scripted clients
25/25 times with an explicit anti-scraping 403. This is not fingerprint spoofing —
it is a real browser, your session, one pass a day. cmegroup.com's Data Terms of
Use prohibit automated retrieval; that is a decision for the operator, and the
sanctioned routes (published settlement files, DataMine, a vendor feed) remain the
durable answer.

NOT DONE YET, deliberately: no KV write and no OI-change matrix. See README.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from matrix_build import (build_matrix_tsv, futures_from_parity,     # noqa: E402
                          parse_term_tsv, quikstrike_code,
                          strikes_from_settlements)
from products import CME_PRODUCTS                                    # noqa: E402
from recon import _launch, outdir, safe_name                         # noqa: E402

IDS_FILE = HERE / 'cme_ids.json'
DATES_DIR = HERE / 'code_dates'          # per-instrument code -> expiry-date maps

API = 'https://www.cmegroup.com/CmeWS/mvc/Settlements/Options'


# ─────────────────────────────────────────────────────────────────────────────
# In-page fetch. Runs in the page's own origin so the session cookies apply and
# the request is issued BY the browser, not alongside it.
# ─────────────────────────────────────────────────────────────────────────────
def _api_get(page, url: str):
    r = page.evaluate("""async (u) => {
        try {
          const r = await fetch(u, { headers: { 'Accept': 'application/json' },
                                     credentials: 'include' });
          return { status: r.status, body: await r.text() };
        } catch (e) { return { status: 0, body: String(e) }; }
    }""", url)
    if r.get('status') != 200:
        return None, f"HTTP {r.get('status')}: {str(r.get('body'))[:160]}"
    try:
        return json.loads(r['body']), None
    except json.JSONDecodeError as e:
        return None, f'bad JSON: {e}'


def _atomic_write(path: Path, text: str) -> None:
    """Write via a temp file + rename, never in place.

    Once anything reads these on a schedule (a dashboard, a cron ingest), a
    partial file must be unobservable. os.replace is atomic on the same volume,
    so a reader sees either the old file or the whole new one - never a
    half-written matrix, which would parse cleanly and be wrong.
    """
    import os
    tmp = path.with_suffix(path.suffix + '.part')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, path)


def _load(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return default


# ─────────────────────────────────────────────────────────────────────────────
# DISCOVER — learn the numeric product id behind each instrument.
#
# The ids are not guessable and not documented; they appear in the URLs the
# settlements page fires. So load each page and harvest them from the network,
# rather than hard-coding numbers that would silently point at another product.
# ─────────────────────────────────────────────────────────────────────────────
def _slug_from(text: str) -> str:
    """Accept a full CME URL or a bare slug and return the slug.

    'https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.settlements.options.html'
      -> 'equities/nasdaq/e-mini-nasdaq-100'
    """
    import re
    s = (text or '').strip()
    m = re.search(r'/markets/([a-z0-9\-/]+?)(?:\.[a-z.]+)?\.html', s)
    if m:
        return m.group(1)
    return s.strip('/').removesuffix('.html')


def mode_discover(pair: str | None, headless: bool, delay: float,
                  slug_override: str | None = None) -> None:
    import re
    ids = _load(IDS_FILE, {})
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    found: dict = {'ids': set()}

    def on_response(resp):
        m = re.search(r'/Settlements/Options/(?:TradeDateAndExpirations|Settlements)/(\d+)', resp.url)
        if m:
            found['ids'].add(int(m.group(1)))

    page.on('response', on_response)

    def try_slug(slug: str):
        """Load a candidate settlements page; return its ROOT product id or None.

        The root id is the small one (EUR/USD = 58); the large ones (8116) are
        per-expiry option products and must not be stored as the root.
        """
        found['ids'] = set()
        try:
            page.goto(f'https://www.cmegroup.com/markets/{slug}.settlements.options.html',
                      wait_until='domcontentloaded', timeout=90_000)
            try:
                page.wait_for_load_state('networkidle', timeout=25_000)
            except Exception:                                        # noqa: BLE001
                pass
        except Exception:                                            # noqa: BLE001
            return None
        root = [i for i in sorted(found['ids']) if i < 1000]
        return root[0] if root else None

    def candidates(p) -> list:
        """Harvest real product URLs from CME's own sector index.

        Three of my hand-written slugs were wrong (the index products), and
        guessing again would just be a slower way to be wrong. The sector page
        lists every product's real path, so match on the distinctive tail of the
        name ('nasdaq-100', 'e-mini-sandp-500') and try what the site itself says
        exists.
        """
        sector = p['slug'].split('/')[0]
        hint = p.get('hint') or p['slug'].split('/')[-1]
        try:
            page.goto(f'https://www.cmegroup.com/markets/{sector}.html',
                      wait_until='domcontentloaded', timeout=90_000)
            hrefs = page.eval_on_selector_all(
                'a[href]', '(els) => els.map(e => e.getAttribute("href") || "")')
        except Exception:                                            # noqa: BLE001
            return []
        out, seen, in_sector = [], set(), 0
        for h in hrefs:
            m = re.match(rf'^/markets/({re.escape(sector)}/[a-z0-9\-/]*?)\.html$', h or '')
            if not m:
                continue
            in_sector += 1
            slug = m.group(1)
            if hint in slug and slug not in seen:
                seen.add(slug)
                out.append(slug)
        # Say WHY the harvest came back empty: no links at all on the page (it
        # renders them in JS) is a different problem from links present but none
        # matching the hint, and they need different fixes.
        print(f"  {p['sym']:<11}   index scan: {len(hrefs)} links, {in_sector} in "
              f"/{sector}/, {len(out)} matching '{hint}'")
        return out[:4]

    prods = [p for p in CME_PRODUCTS if not pair or p['sym'] == pair]
    print(f'\n[discover] {len(prods)} product(s)\n')
    for p in prods:
        sym = p['sym']
        # An explicit --slug is authoritative: you read it off the real page, so
        # trying my guess first would just waste a request to fail.
        start = _slug_from(slug_override) if (slug_override and pair) else p['slug']
        rid = try_slug(start)
        slug = start
        if rid is None and slug_override:
            print(f'  {sym:<11} NO ID at the slug you gave ({start}) - is that the '
                  'OPTIONS settlements page?')
        if rid is None and not slug_override:
            # Configured alternates first (cheap, curated), then the index harvest.
            for alt in p.get('alts', []):
                rid = try_slug(alt)
                if rid is not None:
                    slug = alt
                    break
                time.sleep(delay)
        if rid is None and not slug_override:
            cands = candidates(p)
            if cands:
                print(f"  {sym:<11} configured slug failed; trying {len(cands)} "
                      f"from CME's own index: {', '.join(c.split('/')[-1] for c in cands)}")
            for c in cands:
                if c == p['slug']:
                    continue
                rid = try_slug(c)
                if rid is not None:
                    slug = c
                    break
                time.sleep(delay)
        if rid is None:
            print(f'  {sym:<11} NO ID - no candidate page exposed a product id')
        else:
            # Store the WORKING slug too, so fetch stops using the bad one.
            ids[sym] = dict(id=rid, slug=slug)
            note = '' if slug == p['slug'] else f'  (slug corrected -> {slug})'
            print(f'  {sym:<11} id={rid}{note}')
        time.sleep(delay)

    IDS_FILE.write_text(json.dumps(ids, indent=2))
    ctx.close()
    ok = sum(1 for v in ids.values() if _id_of(v))
    print(f'\n[discover] {ok} id(s) -> {IDS_FILE}')


def _id_of(v):
    """cme_ids.json holds either a bare int (older runs) or {id, slug}."""
    return v.get('id') if isinstance(v, dict) else v


def _slug_of(v, default):
    return (v.get('slug') or default) if isinstance(v, dict) else default


# ─────────────────────────────────────────────────────────────────────────────
# FETCH
# ─────────────────────────────────────────────────────────────────────────────
def _expiry_list(page, root_id: int):
    """-> ([{code, contractId, productId}], tradeDate 'MM/DD/YYYY', error)"""
    data, err = _api_get(page, f'{API}/TradeDateAndExpirations/{root_id}?isProtected')
    if err:
        return [], None, err
    out, trade_date = [], None
    for group in data if isinstance(data, list) else []:
        for e in group.get('expirations', []) or []:
            exp = e.get('expiration') or {}
            code = exp.get('code')
            pid, cid = e.get('productId'), e.get('contractId')
            if not (code and pid and cid):
                continue
            out.append(dict(code=code, contractId=cid, productId=pid,
                            # 'EUUQ6' — what QuikStrike, the term table and
                            # resolveSmileExpiry all speak. See quikstrike_code.
                            qs=quikstrike_code(cid, code, exp.get('twoDigitsCode')),
                            label=e.get('label'), group=group.get('label')))
            for td in e.get('tradeDates', []) or []:
                d = td.get('formatedDate')
                # Most recent settlement wins — never invent today's date, since
                # a fetch before the evening publish would ask for a date that
                # does not exist yet and return an empty book.
                if d and (trade_date is None or _mdy(d) > _mdy(trade_date)):
                    trade_date = d
    return out, trade_date, None


def _mdy(s: str):
    m, d, y = (s or '01/01/1970').split('/')
    return (int(y), int(m), int(d))


def _fetch_expiry(page, exp: dict, trade_date: str):
    url = (f"{API}/Settlements/{exp['productId']}/OOF?strategy=DEFAULT"
           f"&optionProductId={exp['productId']}&monthYear={exp['contractId']}"
           f"&optionExpiration={exp['productId']}-{exp['code']}"
           f"&tradeDate={trade_date}&pageSize=500")
    return _api_get(page, url)


def mode_fetch(pair: str | None, headless: bool, delay: float, n_exp: int,
               want_date: str | None = None) -> None:
    ids = _load(IDS_FILE, {})
    if not ids:
        sys.exit(f'No product ids yet - run:  python fetch_oi.py --discover')
    d = outdir('fetch')
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    written: list = []
    written_syms: list = []

    prods = [p for p in CME_PRODUCTS if not pair or p['sym'] == pair]
    print(f'\n[fetch] {len(prods)} product(s) - {n_exp} nearest expiries each\n')
    for p in prods:
        sym = p['sym']
        root = _id_of(ids.get(sym))
        if not root:
            print(f'  {sym:<11} skipped - no id (run --discover)')
            continue
        # Use the slug DISCOVERY confirmed, not the one hard-coded in products.py:
        # three of those were wrong, and silently reusing them here would throw
        # away the correction discover just made.
        slug = _slug_of(ids.get(sym), p['slug'])
        # Land on the product page first: page-context fetch needs the
        # cmegroup.com origin for the session cookies to be sent.
        try:
            page.goto(f'https://www.cmegroup.com/markets/{slug}.settlements.options.html',
                      wait_until='domcontentloaded', timeout=90_000)
        except Exception as e:                                       # noqa: BLE001
            print(f'  {sym:<11} ! page load failed: {type(e).__name__}')
            continue

        exps, trade_date, err = _expiry_list(page, root)
        # Pinning the date is what makes a paste-vs-fetch diff meaningful: OI
        # moves every session, so comparing two different settlements shows
        # drift and reads exactly like a bug.
        if want_date:
            trade_date = want_date
        if err or not exps:
            print(f'  {sym:<11} ! expiry list failed: {err or "empty"}')
            continue

        code_dates = parse_term_tsv(_read_dates(sym))
        # Order by expiry date when known — that is what makes the DTE row and the
        # column order meaningful. Unknown dates fall back to API order; walls are
        # chosen by near-money OI, not by column position, so that degrades the
        # labels only, never the levels.
        def _order(e):
            dt = code_dates.get(e['qs']) or code_dates.get(e['contractId'])
            if dt:
                dd, mm, yy = dt.split('/')
                return (0, int(yy), int(mm), int(dd))
            return (1, 0, 0, 0)                    # undated: after everything dated
        exps.sort(key=_order)
        picked = exps[:n_exp]
        undated = sum(1 for e in picked if not code_dates.get(e['qs']))
        if undated:
            print(f'  {sym:<11}   note: {undated}/{len(picked)} picked expiries have no '
                  'date seed - order is API order and DTE labels are omitted')

        oi_cols, vol_cols, futures = [], [], None
        for e in picked:
            payload, ferr = _fetch_expiry(page, e, trade_date)
            if ferr:
                print(f"  {sym:<11}   {e['contractId']}: {ferr}")
                continue
            oi = strikes_from_settlements(payload, 'openInterest')
            vl = strikes_from_settlements(payload, 'volume')
            if oi:
                oi_cols.append(dict(code=e['qs'], strikes=oi))
                vol_cols.append(dict(code=e['qs'], strikes=vl))
                # The anchor comes from the FRONT expiry, where the ATM strike is
                # most liquid and put-call parity is tightest. Without it
                # pickPrimaryExpiry cannot score near-money OI at all.
                if futures is None:
                    futures = futures_from_parity(payload)
            time.sleep(delay)

        if len(oi_cols) < 2:
            print(f'  {sym:<11} ! only {len(oi_cols)} expiry column(s) - '
                  'need >=2 for a parseable matrix')
            continue

        for label, cols in (('oi', oi_cols), ('vol', vol_cols)):
            try:
                tsv = build_matrix_tsv(cols, futures=futures, code_dates=code_dates,
                                       as_of=_as_of(trade_date))
            except ValueError as e:
                print(f'  {sym:<11} ! {label}: {e}')
                continue
            fn = d / f'{safe_name(sym)}_{label}_matrix.tsv'
            _atomic_write(fn, tsv)
            written.append(fn)
            # Record the SYMBOL alongside the filename. safe_name() is not
            # reversible: 'EUR/USD' and 'EUR_USD' both flatten to 'EUR_USD', and
            # 'NAS100_USD' is already underscored - so the comparator must be told
            # the symbol, not made to guess it back out of the path.
            written_syms.append(dict(file=fn.name, sym=sym, kind=label,
                                     tradeDate=trade_date, expiries=len(oi_cols),
                                     futures=futures))
        anchor = (f'{futures:g} (put-call parity)' if futures else
                  'NONE - primary expiry will be scored on total OI, not near-money')
        print(f'  {sym:<11} {len(oi_cols)} expiries - tradeDate {trade_date} '
              f'- futures {anchor} -> 2 files')

    ctx.close()
    _atomic_write(d / 'fetch_manifest.json', json.dumps(
        dict(files=written_syms, when=date.today().isoformat()), indent=2))
    print(f'\n[fetch] {len(written)} file(s) -> {d}')
    _validate(written)


def _as_of(trade_date: str) -> date:
    y, m, dd = _mdy(trade_date)[0], _mdy(trade_date)[1], _mdy(trade_date)[2]
    return date(y, m, dd)


def _read_dates(sym: str) -> str:
    """A captured Settlements term table, used only for code -> expiry date.

    Seeded by hand from one `recon.py --record` pass per instrument. Absent is
    fine: DTE labels and column ordering are then omitted rather than guessed.
    """
    f = DATES_DIR / f'{safe_name(sym)}.tsv'
    try:
        return f.read_text(encoding='utf-8')
    except OSError:
        return ''


def _validate(files: list) -> None:
    """Never report a fetch as usable without the gate. Zeroed or truncated OI
    parses cleanly and produces confident wrong levels — that is the whole point
    of validate_capture.mjs."""
    if not files:
        return
    import subprocess
    print()
    r = subprocess.run(['node', str(HERE / 'validate_capture.mjs'), *[str(f) for f in files]],
                       capture_output=True, text=True)
    print('\n'.join(l for l in (r.stdout or '').splitlines()
                    if 'ExperimentalWarning' not in l and 'trace-warnings' not in l))
    if r.returncode:
        print('  *** At least one file FAILED validation - do not ingest it. ***')
        if r.stderr.strip():
            print(r.stderr.strip()[:400])


def mode_check_id(rid: int, pair: str | None, save: bool, headless: bool) -> None:
    """Ask the JSON API what a given product id actually IS.

    QuikStrike's URL carries `pid=103`; the CmeWS API wants ids like 58/42/192.
    Both are small integers, so they look interchangeable and might silently not
    be. Rather than assert either way, call TradeDateAndExpirations/<id> once and
    print what comes back - the contract codes name the product unambiguously.
    """
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        page.goto('https://www.cmegroup.com/', wait_until='domcontentloaded', timeout=90_000)
    except Exception:                                            # noqa: BLE001
        pass
    data, err = _api_get(page, f'{API}/TradeDateAndExpirations/{rid}?isProtected')
    if err:
        print(f'\n[check-id] id {rid}: {err}')
        print('           -> that id is not valid for the CmeWS options API.')
        ctx.close()
        return
    groups = data if isinstance(data, list) else []
    print(f'\n[check-id] id {rid} resolves to {len(groups)} option group(s):\n')
    sample = None
    for g in groups:
        exps = g.get('expirations') or []
        cids = [e.get('contractId') for e in exps[:4] if e.get('contractId')]
        sample = sample or (cids[0] if cids else None)
        print(f"   {str(g.get('label')):<26} {len(exps):>3} expiries   {', '.join(cids)}")
    print(f'\n   Read the contract codes above: they name the product. If they are '
          f'not\n   {pair or "the instrument you expect"}, this id belongs to something else.')
    if save and pair and sample:
        ids = _load(IDS_FILE, {})
        prev = ids.get(pair)
        ids[pair] = dict(id=rid, slug=_slug_of(prev, None)) if _slug_of(prev, None) else rid
        IDS_FILE.write_text(json.dumps(ids, indent=2))
        print(f'\n   saved {pair} -> id {rid} (no slug; --fetch will use products.py\'s)')
    ctx.close()


def mode_watch(pair: str, headless: bool) -> None:
    """You navigate; it records the product id. The end of guessing.

    Slug guessing failed for the three index products and the sector index page
    renders its links in JS, so there is nothing to harvest. But the id is emitted
    by the page itself the moment a settlements view loads — so open a browser,
    let the human navigate to the right page by whatever route they normally use,
    and read the id off the wire. No candidate URLs, no wasted requests.

    Stop by closing the window (never a console prompt - that ate a command once).
    """
    import re
    ids = _load(IDS_FILE, {})
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    seen: list = []

    def on_response(resp):
        m = re.search(r'/Settlements/Options/(?:TradeDateAndExpirations|Settlements)/(\d+)',
                      resp.url)
        if m:
            rid = int(m.group(1))
            if rid < 1000:                      # root id, not a per-expiry product
                seen.append((rid, resp.frame.url if resp.frame else ''))
                print(f'    saw product id {rid}')

    page.on('response', on_response)
    ctx.on('page', lambda p: p.on('response', on_response))
    try:
        page.goto('https://www.cmegroup.com/', wait_until='domcontentloaded', timeout=90_000)
    except Exception:                                            # noqa: BLE001
        pass

    print('\n' + '=' * 72)
    print(f' WATCHING for: {pair}')
    print(' Navigate to that product\'s SETTLEMENTS -> OPTIONS page however you')
    print(' normally would. The product id appears here as soon as it loads.')
    print('\n CLOSE THE CHROME WINDOW when the settlements table is showing.')
    print('=' * 72 + '\n')

    while True:
        try:
            if not [p for p in ctx.pages if not p.is_closed()]:
                break
            url = page.url
            page.wait_for_timeout(1500)
        except Exception:                                        # noqa: BLE001
            break

    if not seen:
        print('\n[watch] no product id seen - did the settlements table actually load?')
        return
    rid, frame_url = seen[-1]                    # the last page you were on wins
    m = re.search(r'/markets/([a-z0-9\-/]+?)(?:\.[a-z.]+)?\.html', url or frame_url or '')
    slug = m.group(1) if m else None
    ids[pair] = dict(id=rid, slug=slug) if slug else rid
    IDS_FILE.write_text(json.dumps(ids, indent=2))
    print(f'\n[watch] {pair}: id={rid} slug={slug or "(not read from URL)"} -> {IDS_FILE}')
    if not slug:
        print('        No slug captured, so --fetch will fall back to the guess in')
        print('        products.py. Re-run and finish ON the settlements page.')


def mode_audit_dates(pair: str, contract: str, n: int, headless: bool) -> None:
    """Same expiry, several settlement dates - which one matches the paste?

    A paste-vs-fetch gap that is mostly-equal with scattered revisions is the
    signature of preliminary vs final open interest, not of a parsing fault. CME
    publishes preliminary OI in the evening and revises it next morning, and the
    payload says which it is (`reportType`). So pull the same contract across the
    last few dates and print totals + reportType: whichever row matches the paste
    identifies both the date AND the revision state we should be requesting.
    """
    ids = _load(IDS_FILE, {})
    root = _id_of(ids.get(pair))
    if not root:
        sys.exit(f'no product id for {pair} - run --discover first')
    prod = next((x for x in CME_PRODUCTS if x['sym'] == pair), None)
    slug = _slug_of(ids.get(pair), prod['slug'] if prod else '')
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(f'https://www.cmegroup.com/markets/{slug}.settlements.options.html',
              wait_until='domcontentloaded', timeout=90_000)
    exps, _, err = _expiry_list(page, root)
    if err:
        ctx.close()
        sys.exit(f'expiry list failed: {err}')
    exp = next((e for e in exps if e['contractId'] == contract or e['qs'] == contract), None)
    if not exp:
        ctx.close()
        sys.exit(f'{contract} not listed. Saw: ' + ', '.join(e['qs'] for e in exps[:12]))
    data, err = _api_get(page, f'{API}/TradeDateAndExpirations/{root}?isProtected')
    dates = []
    for g in data or []:
        for e in g.get('expirations') or []:
            if e.get('contractId') == exp['contractId']:
                dates = [t.get('formatedDate') for t in (e.get('tradeDates') or [])][:n]
    print(f'\n[audit-dates] {pair} {exp["qs"]} ({exp["contractId"]}) - {len(dates)} date(s)\n')
    print('  tradeDate    reportType    updateTime                     callOI      putOI')
    for d in dates:
        payload, ferr = _fetch_expiry(page, exp, d)
        if ferr:
            print(f'  {d}  {ferr}')
            continue
        oi = strikes_from_settlements(payload, 'openInterest')
        c = int(sum(x for x, _ in oi.values()))
        p_ = int(sum(y for _, y in oi.values()))
        print(f'  {d}   {str(payload.get("reportType")):<13} '
              f'{str(payload.get("updateTime"))[:28]:<30} {c:>9,} {p_:>10,}')
        time.sleep(1.5)
    ctx.close()
    print('\n  Compare each row against the pasted totals for the same expiry.')


def mode_seed_dates(base: str) -> None:
    """Write code_dates/<SYM>.tsv for every instrument, from the pasted term tables.

    The expiry-date seed is what gives the matrix real DTE labels and a meaningful
    column order (see build_matrix_tsv). It was going to need one `--record` pass
    per instrument — but the term table is already in `oi_store[pair].rawIVTerm`
    from the morning paste, so read it from there instead. Read-only on KV.
    """
    import urllib.request
    url = f'{base.rstrip("/")}/api/kv/get?key=oi_store'
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            store = json.loads(r.read().decode('utf-8')).get('data') or {}
    except Exception as e:                                       # noqa: BLE001
        sys.exit(f'cannot read oi_store from {base}: {e}')
    if not store:
        sys.exit('oi_store is empty')
    DATES_DIR.mkdir(exist_ok=True)
    print(f'\n[seed-dates] {len(store)} instrument(s) in oi_store\n')
    for sym, e in store.items():
        term = e.get('rawIVTerm') or ''
        codes = parse_term_tsv(term)
        # Keep only real expiry rows: a code mapped to a dd/mm/yyyy date. Header
        # rows ('SYMBOL', 'DATE') never satisfy that, so they drop out here.
        if not codes:
            print(f'  {sym:<12} no usable term table - skipped')
            continue
        f = DATES_DIR / f'{safe_name(sym)}.tsv'
        f.write_text(term, encoding='utf-8')
        print(f'  {sym:<12} {len(codes):>3} expiry dates -> {f.name}')
    print(f'\n[seed-dates] -> {DATES_DIR}')


def mode_selftest() -> None:
    """Offline proof that synthesis round-trips, using a captured payload."""
    import subprocess
    oof = sorted(HERE.glob('out/*/browser/*OOF*.json')) or sorted(HERE.glob('.tmp/oof.json'))
    if not oof:
        sys.exit('No captured settlements payload found to self-test against.')
    payload = json.loads(oof[0].read_text(encoding='utf-8'))
    oi = strikes_from_settlements(payload, 'openInterest')
    tc = int(sum(c for c, _ in oi.values()))
    tp = int(sum(p for _, p in oi.values()))
    print(f'source payload: {len(oi)} strikes - callOI {tc:,} - putOI {tp:,}')
    # Two columns, because one is unparseable by design (see build_matrix_tsv).
    half = {k: (c * 2, p * 3) for i, (k, (c, p)) in enumerate(sorted(oi.items())) if i % 2 == 0}
    tsv = build_matrix_tsv([dict(code='AAAQ6', strikes=oi), dict(code='BBBQ6', strikes=half)],
                           futures=1.14105)
    out = HERE / '.tmp'
    out.mkdir(exist_ok=True)
    f = out / 'selftest_matrix.tsv'
    f.write_text(tsv, encoding='utf-8')
    print(f'wrote {f}\n')
    subprocess.run(['node', str(HERE / 'validate_capture.mjs'), str(f)])


def main() -> None:
    ap = argparse.ArgumentParser(description='Fetch CME option OI into paste-format TSV.')
    ap.add_argument('--discover', action='store_true', help='learn product ids (once)')
    ap.add_argument('--check-id', type=int, metavar='N',
                    help='ask the API what product id N is (1 request)')
    ap.add_argument('--save', action='store_true',
                    help='with --check-id --pair: store it if it looks right')
    ap.add_argument('--audit-dates', action='store_true',
                    help='with --pair --contract: same expiry across recent settlement dates')
    ap.add_argument('--contract', help='contract id or QuikStrike code, e.g. EUUQ26')
    ap.add_argument('--n', type=int, default=4, help='how many dates (default 4)')
    ap.add_argument('--watch', action='store_true',
                    help='with --pair: open a browser, YOU navigate, it records the id')
    ap.add_argument('--fetch', action='store_true', help='fetch + write + validate')
    ap.add_argument('--selftest', action='store_true', help='offline synthesis check')
    ap.add_argument('--seed-dates', action='store_true',
                    help='write code_dates/*.tsv from the pasted term tables in KV')
    ap.add_argument('--base', default='https://macrofxmodel-production.up.railway.app',
                    help='dashboard to read oi_store from (--seed-dates)')
    ap.add_argument('--pair', help='single symbol, e.g. "EUR/USD"')
    ap.add_argument('--slug', help='with --discover --pair: the real CME path or full '
                                   'URL of that product OPTIONS settlements page')
    ap.add_argument('--expiries', type=int, default=8, help='nearest N expiries (default 8)')
    ap.add_argument('--trade-date', metavar='MM/DD/YYYY',
                    help='pin the settlement date (default: latest published)')
    ap.add_argument('--headless', action='store_true', help='no visible window (overnight)')
    ap.add_argument('--delay', type=float, default=1.5, help='seconds between requests')
    a = ap.parse_args()
    if a.seed_dates:
        return mode_seed_dates(a.base)
    if a.selftest:
        return mode_selftest()
    if a.check_id:
        return mode_check_id(a.check_id, a.pair, a.save, a.headless)
    if a.audit_dates:
        if not (a.pair and a.contract):
            sys.exit('--audit-dates needs --pair and --contract')
        return mode_audit_dates(a.pair, a.contract, a.n, a.headless)
    if a.watch:
        if not a.pair:
            sys.exit('--watch needs --pair, e.g. --watch --pair "SPX500_USD"')
        return mode_watch(a.pair, a.headless)
    if a.discover:
        return mode_discover(a.pair, a.headless, max(1.0, a.delay), a.slug)
    if a.fetch:
        return mode_fetch(a.pair, a.headless, a.delay, a.expiries, a.trade_date)
    ap.print_help()
    print('\nFirst run:\n  python fetch_oi.py --selftest\n'
          '  python fetch_oi.py --discover --pair "EUR/USD"\n'
          '  python fetch_oi.py --fetch --pair "EUR/USD"\n')


if __name__ == '__main__':
    main()
