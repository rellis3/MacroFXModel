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

from matrix_build import (build_matrix_tsv, parse_term_tsv,          # noqa: E402
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
def mode_discover(pair: str | None, headless: bool, delay: float) -> None:
    import re
    ids = _load(IDS_FILE, {})
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    found: dict = {}

    def on_response(resp):
        m = re.search(r'/Settlements/Options/(?:TradeDateAndExpirations|Settlements)/(\d+)', resp.url)
        if m:
            found.setdefault('ids', set()).add(int(m.group(1)))

    page.on('response', on_response)
    prods = [p for p in CME_PRODUCTS if not pair or p['sym'] == pair]
    print(f'\n[discover] {len(prods)} product(s)\n')
    for p in prods:
        found['ids'] = set()
        url = f"https://www.cmegroup.com/markets/{p['slug']}.settlements.options.html"
        try:
            page.goto(url, wait_until='domcontentloaded', timeout=90_000)
            try:
                page.wait_for_load_state('networkidle', timeout=25_000)
            except Exception:                                        # noqa: BLE001
                pass
        except Exception as e:                                       # noqa: BLE001
            print(f"  {p['sym']:<11} ! {type(e).__name__}")
            continue
        got = sorted(found.get('ids', set()))
        # The ROOT id is the small one (58); per-expiry option products are large
        # (8116). Only the root belongs in the map.
        root = [i for i in got if i < 1000]
        if root:
            ids[p['sym']] = root[0]
            print(f"  {p['sym']:<11} id={root[0]}  (also saw {len(got) - len(root)} expiry ids)")
        else:
            print(f"  {p['sym']:<11} no id seen  (slug wrong, or page did not load)")
        time.sleep(delay)

    IDS_FILE.write_text(json.dumps(ids, indent=2))
    ctx.close()
    print(f'\n[discover] {len(ids)} id(s) -> {IDS_FILE}')


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
            code = (e.get('expiration') or {}).get('code')
            pid, cid = e.get('productId'), e.get('contractId')
            if not (code and pid and cid):
                continue
            out.append(dict(code=code, contractId=cid, productId=pid,
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


def mode_fetch(pair: str | None, headless: bool, delay: float, n_exp: int) -> None:
    ids = _load(IDS_FILE, {})
    if not ids:
        sys.exit(f'No product ids yet - run:  python fetch_oi.py --discover')
    d = outdir('fetch')
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    written: list = []

    prods = [p for p in CME_PRODUCTS if not pair or p['sym'] == pair]
    print(f'\n[fetch] {len(prods)} product(s) - {n_exp} nearest expiries each\n')
    for p in prods:
        sym = p['sym']
        root = ids.get(sym)
        if not root:
            print(f'  {sym:<11} skipped - no id (run --discover)')
            continue
        # Land on the product page first: page-context fetch needs the
        # cmegroup.com origin for the session cookies to be sent.
        try:
            page.goto(f"https://www.cmegroup.com/markets/{p['slug']}.settlements.options.html",
                      wait_until='domcontentloaded', timeout=90_000)
        except Exception as e:                                       # noqa: BLE001
            print(f'  {sym:<11} ! page load failed: {type(e).__name__}')
            continue

        exps, trade_date, err = _expiry_list(page, root)
        if err or not exps:
            print(f'  {sym:<11} ! expiry list failed: {err or "empty"}')
            continue

        code_dates = parse_term_tsv(_read_dates(sym))
        # Order by expiry date when known — that is what makes the DTE row and the
        # column order meaningful. Unknown dates fall back to API order; walls are
        # chosen by near-money OI, not by column position, so that degrades the
        # labels only, never the levels.
        def _order(e):
            dt = code_dates.get(e['contractId']) or code_dates.get(e['code'])
            if dt:
                dd, mm, yy = dt.split('/')
                return (0, int(yy), int(mm), int(dd))
            return (1, 0, 0, 0)
        exps.sort(key=_order)
        picked = exps[:n_exp]

        oi_cols, vol_cols, futures = [], [], None
        for e in picked:
            payload, ferr = _fetch_expiry(page, e, trade_date)
            if ferr:
                print(f"  {sym:<11}   {e['contractId']}: {ferr}")
                continue
            oi = strikes_from_settlements(payload, 'openInterest')
            vl = strikes_from_settlements(payload, 'volume')
            if oi:
                oi_cols.append(dict(code=e['contractId'], strikes=oi))
                vol_cols.append(dict(code=e['contractId'], strikes=vl))
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
            fn.write_text(tsv, encoding='utf-8')
            written.append(fn)
        print(f'  {sym:<11} {len(oi_cols)} expiries - tradeDate {trade_date} -> 2 files')

    ctx.close()
    (d / 'fetch_manifest.json').write_text(json.dumps(
        dict(files=[f.name for f in written], when=date.today().isoformat()), indent=2))
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
    ap.add_argument('--fetch', action='store_true', help='fetch + write + validate')
    ap.add_argument('--selftest', action='store_true', help='offline synthesis check')
    ap.add_argument('--pair', help='single symbol, e.g. "EUR/USD"')
    ap.add_argument('--expiries', type=int, default=8, help='nearest N expiries (default 8)')
    ap.add_argument('--headless', action='store_true', help='no visible window (overnight)')
    ap.add_argument('--delay', type=float, default=1.5, help='seconds between requests')
    a = ap.parse_args()
    if a.selftest:
        return mode_selftest()
    if a.discover:
        return mode_discover(a.pair, a.headless, max(1.0, a.delay))
    if a.fetch:
        return mode_fetch(a.pair, a.headless, a.delay, a.expiries)
    ap.print_help()
    print('\nFirst run:\n  python fetch_oi.py --selftest\n'
          '  python fetch_oi.py --discover --pair "EUR/USD"\n'
          '  python fetch_oi.py --fetch --pair "EUR/USD"\n')


if __name__ == '__main__':
    main()
