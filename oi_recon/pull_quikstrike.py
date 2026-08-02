"""Pull the QuikStrike tables the settlement JSON cannot give us.

  python pull_quikstrike.py --product "EUR/USD"
  python pull_quikstrike.py --product "EUR/USD" --views settles
  python pull_quikstrike.py --inspect          dump the widget's controls, click nothing

WHY THIS EXISTS. The JSON route (fetch_oi.py) covers OI and volume, and from
`rawOI` alone the dashboard already derives walls, max pain, GEX, DEX, gamma flip
and HVL - those use a FLAT vol, not the pasted surface (js/oi.js:1383/1484/1648).
What it cannot give us is implied vol, and everything gated behind it at
js/oi.js:1393: charm, vanna, risk reversal, IV dynamics, the smile and the IV
term structure. Those live only in QuikStrike, so this drives QuikStrike.

WHAT IT EMITS. Tab-separated text identical in shape to a manual copy-paste, so
js/oi.js parses it unchanged. Note this sidesteps the merged-header/colspan
problem entirely: we are reproducing the clipboard, not interpreting columns, and
the existing parser already handles that ragged shape. Every file is written
atomically and put through validate_capture.mjs before being called usable.

TECHNIQUE NOTES (learned the hard way, and from a playbook worth crediting):
  * TRUE HEADLESS IS BLOCKED. --headless here launches a real rendering browser
    parked off-screen instead (see recon._launch). A genuine headless flag fails
    at 2am in a way an interactive test never reproduces.
  * CLICKS MUST BE TRUSTED. Playwright's native click dispatches a real OS-level
    event; `evaluate(el => el.click())` dispatches an UNTRUSTED one, which some
    menu widgets ignore silently - no error, no effect. Everything here uses the
    native action.
  * FIND CONTROLS BY CONTENT, NOT ID. ASP.NET ids shift with the last selection,
    so dropdowns are located by their OPTIONS (the select offering '(All)', the
    select offering 'Standard'), with the observed ids as hints only.
  * PICK TABLES BY STRUCTURE. The page carries decoy tables (menus, toolbars);
    the data table is the one with the deepest ladder of numeric first cells.
  * A CLICK MAY OPEN A NEW TAB. Every page in the context is searched, not just
    the one we started on.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from recon import _launch, outdir, safe_name, shape, shape_line, grade, grade_line  # noqa: E402

WRAPPER = ('https://www.cmegroup.com/tools-information/quikstrike/'
           'open-interest-heatmap.html')

# Left-nav links, read out of a captured QuikStrikeView.aspx document. Ids are
# hints: each is tried first, then the same link by its visible text.
VIEWS = {
    'oi':      ('lbOIMatrix',     'OI',         'rawOI'),
    'chg':     ('lbOIChgMatrix',  'OI Change',  'rawChg'),
    'vol':     ('lbVolumeMatrix', 'Volume',     'rawVol'),
    # NOTE: this view is the per-EXPIRY settlements table -> rawIVTerm.
    # The per-strike chain (rawIV) sits behind an expiry selection; see README.
    'settles': ('lbSettles',      'Settlements', 'rawIVTerm'),
}


def _frames(ctx):
    """Every frame of every open page - a click can open a new tab."""
    out = []
    for p in ctx.pages:
        if p.is_closed():
            continue
        out.extend(p.frames)
    return out


QS_HOST = 'quikstrike.net'


def _is_qs(url: str) -> bool:
    """Match the tool's HOST, not the substring 'quikstrike'.

    The CME wrapper lives at /tools-information/quikstrike/... so a substring
    test matches the wrapper itself. That is exactly how this failed: it reported
    'tool frame ready' pointing at the wrapper page, then found no nav links in
    it. Only cmegroup-tools.quikstrike.net is the tool.
    """
    u = (url or '').lower()
    return QS_HOST in u.split('/')[2] if '://' in u and len(u.split('/')) > 2 else False


def _qs_frame(ctx):
    for fr in _frames(ctx):
        if _is_qs(fr.url):
            return fr
    return None


def _wait_for_tool(ctx, page, timeout_s: int = 45):
    """Wait until the QuikStrike frame actually holds the TOOL, not the bootstrap.

    The iframe first loads a tiny auto-submitting WebForms <form> (3.4KB, a
    __VIEWSTATE and a POST), which only then becomes the real view. Grabbing the
    frame as soon as its URL matches 'quikstrike' therefore yields a document
    with no nav links at all - which is exactly how this failed: 'view link not
    found' on every view, with no frame error, because the frame was real and
    empty. So poll for a frame that has the controls, re-resolving each time
    (the frame object itself is replaced by the postback).
    """
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        for fr in _frames(ctx):
            if not _is_qs(fr.url):
                continue
            last = fr
            try:
                n = fr.evaluate("""() => document.querySelectorAll(
                    'a[id*="Matrix"], a[id*="Settles"], select').length""")
            except Exception:                            # noqa: BLE001
                continue
            if n and n > 0:
                return fr
        try:
            page.wait_for_timeout(1500)
        except Exception:                                # noqa: BLE001
            break
    return last


def _dump_frame(fr, label: str) -> None:
    """Say what IS there when what we wanted isn't. Beats a second blind run."""
    print(f'\n  -- {label} --')
    if not fr:
        print('     no quikstrike frame at all')
        return
    print(f'     frame: {(fr.url or "")[:100]}')
    try:
        links = fr.evaluate("""() => Array.from(document.querySelectorAll('a[id]'))
            .map(a => ({ id: a.id, t: (a.innerText||'').trim() }))
            .filter(x => x.t && x.t.length < 24).slice(0, 30)""")
        sels = fr.evaluate("""() => Array.from(document.querySelectorAll('select'))
            .map(s => ({ id: s.id, opts: Array.from(s.options).map(o=>o.text.trim()).slice(0,6) }))""")
        body = fr.evaluate("() => (document.body?.innerText || '').length")
        print(f'     {len(links or [])} labelled links, {len(sels or [])} selects, {body} chars of text')
        for a in (links or [])[:16]:
            print(f"       link   {a['id'][-44:]:<44} {a['t']}")
        for s in (sels or [])[:8]:
            print(f"       select {s['id'][-44:]:<44} {s['opts']}")
        # Checkboxes/radios are where a COLUMN TOGGLE hides. The settles table
        # arrived with extra Basis-Point / Black-Scholes volatility groups that
        # no <select> controls, and those extra columns shift open interest onto
        # vol figures - the failure this whole validator exists to catch.
        boxes = fr.evaluate("""() => Array.from(
            document.querySelectorAll('input[type=checkbox], input[type=radio]'))
            .map(i => ({ id: i.id, on: i.checked,
                         lab: (document.querySelector('label[for="'+i.id+'"]')?.innerText
                               || i.parentElement?.innerText || '').trim().slice(0,40) }))""")
        for b in (boxes or [])[:14]:
            print(f"       {'[x]' if b['on'] else '[ ]'}    {b['id'][-40:]:<40} {b['lab']}")
        if not boxes:
            print('       (no checkboxes/radios in this frame)')
    except Exception as e:                               # noqa: BLE001
        print('     could not read frame:', e)


QS_IDS = HERE / 'quikstrike_ids.json'


QS_SESSION = HERE / '.qs_session.json'      # holds insid/qsid - gitignored


def _cached_url() -> str | None:
    """Last tool URL that worked. Session ids outlive a single run.

    Observed 2026-07-31: a URL minted the previous day still loaded. So try the
    cached one first and skip the wrapper entirely - but never TRUST it, because
    it will expire eventually and a silent redirect to a login page would look
    like an empty tool. `_pull_tool` falls back to minting whenever the cached
    URL fails to produce a loaded tool.
    """
    try:
        return json.loads(QS_SESSION.read_text()).get('url')
    except (OSError, json.JSONDecodeError):
        return None


def _cache_url(url: str) -> None:
    try:
        QS_SESSION.write_text(json.dumps({'url': url}, indent=2))
    except OSError:
        pass


def _mint_tool_url(ctx, page) -> str | None:
    """Load the wrapper once and return the tool's OWN url, session ids and all.

    The URL carries insid/qsid, both minted per session (observed changing
    between two sessions on the same day), so it cannot be hard-coded - but it
    CAN be harvested at run time and then reused for every product in that run.
    """
    page.goto(WRAPPER, wait_until='domcontentloaded', timeout=90_000)
    fr = _wait_for_tool(ctx, page)
    return fr.url if fr and _is_qs(fr.url) else None


def _with_pid(url: str, pid, pf) -> str:
    """Swap the product ids in a minted tool URL.

    This is the whole point of the direct-URL route: pid identifies the product,
    so there is no iframe to find and no product popup to click through - the two
    things that broke the first version (a substring match landed on the wrapper,
    then a loose text match navigated the page to /international/emea.html).
    """
    import re
    out = re.sub(r'([?&]pid=)\d+', rf'\g<1>{pid}', url)
    if pf not in (None, ''):
        out = re.sub(r'([?&]pf=)\d+', rf'\g<1>{pf}', out)
    return out


def _load_qs_ids() -> dict:
    try:
        return json.loads(QS_IDS.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def mode_learn_pid(product: str, headless: bool) -> None:
    """You pick the product once; it records that product's pid/pf.

    Same shape as fetch_oi.py --watch, and for the same reason: guessing an
    identifier wastes runs, whereas the page states it plainly the moment the
    right product is loaded.
    """
    import re
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    seen = []

    def note(u):
        if _is_qs(u):
            m = re.search(r'[?&]pid=(\d+)', u)
            f = re.search(r'[?&]pf=(\d+)', u)
            if m:
                seen.append((m.group(1), f.group(1) if f else None, u))

    page.on('framenavigated', lambda fr: note(fr.url))
    ctx.on('page', lambda p: p.on('framenavigated', lambda fr: note(fr.url)))
    page.goto(WRAPPER, wait_until='domcontentloaded', timeout=90_000)

    print('\n' + '=' * 72)
    print(f' Select {product} in the QuikStrike product picker, by hand.')
    print(' Then CLOSE THE CHROME WINDOW. Do not type here.')
    print('=' * 72 + '\n')
    while True:
        try:
            if not [p for p in ctx.pages if not p.is_closed()]:
                break
            page.wait_for_timeout(1500)
        except Exception:                                # noqa: BLE001
            break
    if not seen:
        print('[learn-pid] no tool URL seen - was the widget loaded?')
        return
    pid, pf, url = seen[-1]
    ids = _load_qs_ids()
    ids[product] = dict(pid=int(pid), pf=int(pf) if pf else None)
    QS_IDS.write_text(json.dumps(ids, indent=2))
    print(f'[learn-pid] {product}: pid={pid} pf={pf} -> {QS_IDS.name}')
    print(f'            from {url[:100]}')


def _tables(frame):
    """Every table as tab-separated text - the clipboard shape js/oi.js expects."""
    js = """() => Array.from(document.querySelectorAll('table')).map(t =>
        Array.from(t.querySelectorAll('tr')).map(r =>
            Array.from(r.querySelectorAll('th,td'))
                 .map(c => (c.innerText || '').replace(/[ \\t]+/g, ' ').trim())
                 .join('\\t')
        ).join('\\n')
    )"""
    try:
        return frame.evaluate(js) or []
    except Exception:                                    # noqa: BLE001
        return []


import re as _re


def _score_table(t: str):
    """Is this a data table, and how good? -> (score, why) with 0 = reject.

    Ranking on 'deepest numeric first column' alone was wrong: it scores the
    per-expiry SETTLEMENTS table at ZERO, because its first column is a SYMBOL
    (WE5N6), not a strike. That silently discarded the exact table we were after
    while decoy menus ('(Set Expiration List)', month tabs) had far more rows.

    So recognise the two data shapes explicitly, and reject everything else:
      * strike ladder  - many rows whose first cell is a number (matrix, chain)
      * expiry table   - a SYMBOL/DTE/EXPIRATION header, one row per expiry
    """
    if not t:
        return 0, ''
    rows = [r for r in t.split('\n') if r.strip()]
    head = ' '.join(rows[:3]).upper()
    sh = shape(t)
    if sh['strikes'] >= 3:
        return sh['strikes'] * 10, f"strike ladder ({sh['strikes']} strikes)"
    has_sym = 'SYMBOL' in head and 'DTE' in head
    has_exp = 'EXPIRATION' in head or 'EXP DATE' in head
    if len(rows) >= 5 and has_sym and has_exp:
        return len(rows), f'expiry table ({len(rows)} rows)'
    # A chain whose first column is a signed CHG still counts as a ladder, but a
    # menu of month names never does - require STRIKE in the header to accept it.
    if len(rows) >= 5 and 'STRIKE' in head:
        return len(rows), f'strike table by header ({len(rows)} rows)'
    return 0, ''


# The canonical settlements layout js/oi.js parses positionally (17 columns):
#   SYMBOL DTE EXPIRATION-DATE STRIKE | FUTURE(3) | STRADDLE(3) | VOLATILITY(3) | OI(4)
# Anything else in the group header - the profile here also renders 'BS Volatility'
# and 'BP Volatility' - shifts open interest onto volatility figures and parses
# silently wrong. Rather than hunt a display toggle (the checkbox dump showed
# none: only expiry selectors), drop the unwanted GROUPS by their colspans.
KEEP_GROUPS = ('FUTURE PRICE', 'STRADDLE PRICE', 'VOLATILITY', 'OPEN INTEREST')


def _settles_normalised(frame):
    """Re-emit the settlements table as the canonical 17 columns.

    Reads real `colspan` values off the DOM instead of guessing widths - the
    group header has FEWER cells than a data row, so a 1:1 column mapping is
    wrong by construction. Each group's data columns are [cursor, cursor+span).
    Returns None if the table doesn't look like the expected shape, so a layout
    change fails loudly rather than emitting a plausible-but-shifted table.
    """
    js = """() => {
      const tables = Array.from(document.querySelectorAll('table'));
      for (const t of tables) {
        const rows = Array.from(t.querySelectorAll('tr'));
        if (rows.length < 4) continue;
        const txt = rows.slice(0,3).map(r => r.innerText.toUpperCase()).join(' ');
        if (!(txt.includes('SYMBOL') && txt.includes('OPEN INTEREST'))) continue;
        const cellsOf = r => Array.from(r.querySelectorAll('th,td')).map(c => ({
          text: (c.innerText||'').replace(/[ \\t]+/g,' ').trim(),
          span: parseInt(c.getAttribute('colspan') || '1', 10)
        }));
        return {
          head: rows.slice(0,3).map(cellsOf),
          body: rows.slice(3).map(r => Array.from(r.querySelectorAll('th,td'))
                                          .map(c => (c.innerText||'').replace(/[ \\t]+/g,' ').trim()))
        };
      }
      return null;
    }"""
    try:
        t = frame.evaluate(js)
    except Exception:                                    # noqa: BLE001
        return None
    if not t or not t.get('body'):
        return None

    # The GROUP row is whichever header row carries colspans > 1.
    grp = None
    for row in t['head']:
        if any(c['span'] > 1 for c in row):
            grp = row
            break
    if not grp:
        return None

    ncols = max(len(r) for r in t['body'])
    lead = ncols - sum(c['span'] for c in grp if c['span'] > 1)   # SYMBOL/DTE/DATE/STRIKE
    if lead < 1:
        return None

    keep = list(range(lead))                             # always keep the lead columns
    cursor = lead
    kept_labels = []
    for c in grp:
        if c['span'] <= 1:
            continue
        if c['text'].upper() in KEEP_GROUPS:
            keep.extend(range(cursor, cursor + c['span']))
            kept_labels.append(c['text'])
        cursor += c['span']

    if len(keep) != 17:
        return None                                      # not the shape we know - refuse
    sub = t['head'][2] if len(t['head']) > 2 else []
    out = []
    # Rebuild the two-row header the parser expects, then the kept data columns.
    out.append('\t'.join([x['text'] for x in t['head'][0]][:3]))
    out.append('\t'.join(['DATE'] + [g for g in kept_labels]))
    subtexts = [c['text'] for c in sub]
    out.append('\t'.join(subtexts[i] for i in keep if i < len(subtexts)))
    for row in t['body']:
        if len(row) < ncols:
            continue
        out.append('\t'.join(row[i] for i in keep))
    return '\n'.join(out) + '\n'


def _best_table(frame, ctx=None):
    """Highest-scoring data table across EVERY frame, not just the one held.

    A WebForms postback can leave the grid in a different frame than the toolbar,
    and holding one frame reference then reports 'no data table' while the table
    is right there.
    """
    frames = [frame] if frame else []
    if ctx:
        frames = list(_frames(ctx)) or frames
    best, best_s, best_why = None, 0, ''
    for fr in frames:
        for t in _tables(fr):
            s, why = _score_table(t)
            if s > best_s:
                best, best_s, best_why = t, s, why
    return best, best_s, best_why


def _stable_table(frame, ctx, page, tries: int = 5, gap_ms: int = 1500):
    """Read the table repeatedly until two consecutive reads agree.

    THE FAILURE THIS FIXES. On 2026-08-02 the S&P capture came back with 76 rows
    and 31 strikes; the same table had given 482 strikes on previous runs, and the
    manual paste had 342. It was read mid-render. Nothing caught it: 31 strikes
    clears the validator's 10-strike floor, the open interest was non-zero and
    plausible, and 31 is not one of the 10/15/25/50 window sizes the strike guard
    watches for. It would have been ingested as a real book missing 311 strikes.

    A partially rendered table GROWS between reads; a finished one does not. So
    stability is the signal, and it costs one extra read on the happy path.
    """
    prev, prev_n = None, -1
    for _ in range(tries):
        tsv, score, why = _best_table(frame, ctx)
        n = shape(tsv or '')['rows']
        if tsv and n == prev_n and n > 0:
            return tsv, score, why, True            # two reads agree
        prev, prev_n = tsv, n
        try:
            page.wait_for_timeout(gap_ms)
        except Exception:                            # noqa: BLE001
            break
        frame = _qs_frame(ctx) or frame
    # Never settled: hand back the last read but say so, so the caller can refuse.
    tsv, score, why = _best_table(frame, ctx)
    return tsv, score, why, False


def _dump_tables(frame, ctx=None) -> None:
    """What tables ARE present, when none looked like a strike ladder."""
    frames = list(_frames(ctx)) if ctx else [frame]
    total = 0
    for fr in frames:
        ts = _tables(fr)
        if not ts:
            continue
        print(f'     frame {(fr.url or "")[:74]}  -> {len(ts)} table(s)')
        for t in ts:
            sh = shape(t)
            total += 1
            first = (t.split('\n')[0] if t else '')[:76].replace('\t', ' | ')
            print(f'       {shape_line(sh)}   {first}')
    if not total:
        print('     no <table> elements anywhere - the grid may not have rendered yet')


def _set_select_by_option(frame, wanted: str) -> str | None:
    """Set whichever <select> offers `wanted`, and return its id.

    Content-addressed on purpose: the Strikes control is
    `..._ucMatrixTB_ddlStrikes` today, but ASP.NET ids move with the last
    selection, whereas '(All)' is always '(All)'.
    """
    try:
        sels = frame.evaluate("""() => Array.from(document.querySelectorAll('select'))
            .map(s => ({ id: s.id, opts: Array.from(s.options).map(o => o.text.trim()) }))""")
    except Exception:                                    # noqa: BLE001
        return None
    for s in sels or []:
        if wanted in s['opts']:
            try:
                frame.select_option(f"#{s['id']}", label=wanted)
                return s['id']
            except Exception:                            # noqa: BLE001
                continue
    return None


def _click_view(ctx, frame, ids: str, text: str) -> bool:
    """Native (trusted) click on a left-nav view link. Id first, then text."""
    for sel in (f'a[id$="{ids}"]', f'a:text-is("{text}")'):
        try:
            loc = frame.locator(sel).first
            if loc.count() == 0:
                continue
            loc.click(timeout=15_000)                    # NATIVE - not el.click()
            return True
        except Exception:                                # noqa: BLE001
            continue
    return False


def _has_option(frame, wanted: str) -> bool:
    try:
        return bool(frame.evaluate(
            """(w) => Array.from(document.querySelectorAll('select'))
                 .some(s => Array.from(s.options).some(o => o.text.trim() === w))""", wanted))
    except Exception:                                    # noqa: BLE001
        return False


# The tool prints the view in its own header ("Gold (OG|GC) Open Interest Matrix").
# That is the ONLY reliable per-view marker: all three heatmap views expose the
# same '(All)' strike selector, so waiting on that confirmed "a matrix view" and
# happily returned the previous one - which is how OI, OI Change and Volume came
# back byte-identical for gold.
VIEW_TITLE = {
    'oi':      ('open interest matrix', 'change'),   # (must contain, must NOT contain)
    'chg':     ('change', None),
    'vol':     ('volume', None),
    'settles': ('settle', None),
}


def _view_label(frame) -> str:
    """The tool's own view heading, e.g. 'Gold (OG|GC) Open Interest Matrix'.

    Read from the TITLE ELEMENT, not from body.innerText. The first cut sliced
    the first 300 characters of the body, which includes the LEFT NAV - and the
    nav lists 'OI Change'. So the OI view was rejected for containing 'change'
    while Change and Volume passed on menu text rather than on the actual view.
    The check was reading the menu, not the page.

    Leaf elements only, and never inside an <a>, so nav links cannot match.
    """
    # Scan ALL elements and keep the SHORTEST match, rather than childless ones
    # only: the settles heading is assembled from several <span>s, so no leaf node
    # holds the whole string and gold's Settlements view was rejected while being
    # unmistakably loaded (its ucSettlesTB toolbar was right there).
    # 'Settles' is also a clean discriminator against the nav's 'Settlements' -
    # that word does not contain the substring.
    js = r"""() => {
      const re = /(Open Interest Change|OI Change|Open Interest|Volume)\s+Matrix|\bSettles\b/i;
      let best = '';
      for (const e of Array.from(document.querySelectorAll('div,span,td,h1,h2,h3,b'))) {
        if (e.closest('a')) continue;
        const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 120 || !re.test(t)) continue;
        if (!best || t.length < best.length) best = t;
      }
      return best;
    }"""
    try:
        return (frame.evaluate(js) or '').strip()
    except Exception:                                    # noqa: BLE001
        return ''


def _view_title_ok(frame, key: str) -> bool:
    lab = _view_label(frame).lower()
    if not lab:
        return False
    # Order matters: 'Open Interest Change Matrix' contains 'Open Interest'.
    if 'settles' in lab:
        return key == 'settles'
    if 'change' in lab:
        return key == 'chg'
    if 'volume' in lab:
        return key == 'vol'
    if 'open interest' in lab:
        return key == 'oi'
    return False


def _ensure_view(ctx, page, fr, key: str, tries: int = 3):
    """Click a view and WAIT until its own toolbar appears; retry if it doesn't.

    A single click was not enough: the session restores the last view, and on
    gold the nav click silently no-opped, leaving all three heatmap pulls reading
    the Settlements table. The marker is the view's distinctive control - the
    strike selector offering '(All)' for the matrix views, the report selector
    offering 'Standard' for settlements - so we wait for evidence the view
    actually changed rather than for a fixed delay.
    """
    ids, text, _ = VIEWS[key]
    marker = 'Standard' if key == 'settles' else '(All)'
    for attempt in range(tries):
        if not _click_view(ctx, fr, ids, text):
            return fr, False
        _settle(fr, page, 2500)
        fr = _wait_for_tool(ctx, page, 20) or fr
        for _ in range(12):                              # up to ~24s for the postback
            if _has_option(fr, marker) and _view_title_ok(fr, key):
                return fr, True
            page.wait_for_timeout(2000)
            fr = _qs_frame(ctx) or fr
        # Say WHAT was on screen, not just that it wasn't right. Four rounds were
        # lost this session to "did not switch" messages that named no evidence.
        print(f'  {key:<8}   view did not switch (attempt {attempt + 1}/{tries}) '
              f'- marker {marker!r}={_has_option(fr, marker)}, '
              f'label={_view_label(fr)!r}')
    return fr, False


def _settle(frame, page, ms: int = 2500) -> None:
    """WebForms postbacks have no completion signal we can await reliably."""
    try:
        page.wait_for_timeout(ms)
    except Exception:                                    # noqa: BLE001
        pass


def _atomic(path: Path, text: str) -> None:
    import os
    tmp = path.with_suffix(path.suffix + '.part')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, path)


def mode_inspect(headless: bool) -> None:
    """Click nothing. Report what the widget exposes, so the next run is informed."""
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(WRAPPER, wait_until='domcontentloaded', timeout=90_000)
    _settle(None, page, 8000)
    fr = _wait_for_tool(ctx, page)
    if not fr:
        print('\n[inspect] No QuikStrike frame. Frames seen:')
        for f in _frames(ctx):
            print('   ', (f.url or '')[:110])
        ctx.close()
        return
    print(f'\n[inspect] QuikStrike frame: {fr.url[:110]}\n')
    try:
        sels = fr.evaluate("""() => Array.from(document.querySelectorAll('select'))
            .map(s => ({ id: s.id, opts: Array.from(s.options).map(o => o.text.trim()).slice(0,8) }))""")
        for s in sels or []:
            print(f"   select {s['id'][-46:]:<46} {s['opts']}")
        links = fr.evaluate("""() => Array.from(document.querySelectorAll('a[id]'))
            .map(a => ({ id: a.id, t: (a.innerText||'').trim() }))
            .filter(x => x.t && x.t.length < 22)""")
        print()
        for a in (links or [])[:28]:
            print(f"   link   {a['id'][-46:]:<46} {a['t']}")
    except Exception as e:                               # noqa: BLE001
        print('  ! could not read controls:', e)
    tables = _tables(fr)
    _b, _s, _why = _best_table(fr)
    print(f'\n   {len(tables)} table(s); best = {_why or "none recognised"}')
    ctx.close()


def mode_pull(product: str | None, views: list, headless: bool, all_strikes: bool) -> None:
    ctx = _launch(headless=headless)
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        pull_product(ctx, page, product, views, all_strikes)
    finally:
        try:
            ctx.close()
        except Exception:                                # noqa: BLE001
            pass


def pull_product(ctx, page, product: str | None, views: list,
                 all_strikes: bool = True) -> dict:
    """One product, on an EXISTING browser context. Returns {box: path|None}.

    Split out of mode_pull so a scheduled sweep can drive every product through
    a single session instead of launching (and re-minting) a browser per product.
    Never raises: a scheduled run must not lose nine products because the tenth
    misbehaved.
    """
    d = outdir('quikstrike')
    results: dict = {}
    # Cached session first (no wrapper load at all), minting only if it fails.
    minted = _cached_url()
    src = 'cached'
    if not minted:
        minted = _mint_tool_url(ctx, page)
        src = 'minted'
    if not minted:
        print('[pull] could not reach the QuikStrike tool - is the session logged in?')
        return results
    print(f'[pull] session ({src}): {minted[:80]}')

    # DIRECT NAVIGATION, no iframe and no product popup. pid identifies the
    # product; the minted URL supplies the session. Promoting the tool to the
    # top-level document also means every later lookup is the main frame.
    qs_ids = _load_qs_ids()
    ent = qs_ids.get(product) if product else None
    if product and not ent:
        print(f'[pull] no pid for "{product}" - run:  --learn-pid --product "{product}"')
        print('       Continuing with whatever product the tool loaded.')
    target = _with_pid(minted, ent['pid'], ent.get('pf')) if ent else minted
    try:
        page.goto(target, wait_until='domcontentloaded', timeout=90_000)
    except Exception as e:                               # noqa: BLE001
        print(f'[pull] navigation failed: {type(e).__name__}')
        return results
    _settle(None, page, 4000)
    fr = _wait_for_tool(ctx, page, 30)
    if not fr and src == 'cached':
        # A cached session expires silently - the page loads, it just is not the
        # tool. Re-mint once and retry before giving up, so expiry self-heals.
        print('[pull] cached session did not load the tool - re-minting')
        minted = _mint_tool_url(ctx, page)
        if minted:
            target = _with_pid(minted, ent['pid'], ent.get('pf')) if ent else minted
            try:
                page.goto(target, wait_until='domcontentloaded', timeout=90_000)
                _settle(None, page, 4000)
                fr = _wait_for_tool(ctx, page, 30)
            except Exception:                            # noqa: BLE001
                fr = None
    if not fr:
        print('[pull] tool did not finish loading')
        _dump_frame(page.main_frame, 'main document')
        return results
    if minted:
        _cache_url(minted)
    print(f'[pull] tool ready{" (pid " + str(ent["pid"]) + ")" if ent else ""}')

    # VERIFY THE PRODUCT before trusting anything. pid came from a hand-supplied
    # list and pf is INFERRED by family, so a wrong pairing is entirely possible.
    # The failure it would cause is the worst kind available here: a complete,
    # valid-looking table of the wrong instrument, written under the right name.
    # The tool prints the product in its header, so check it and refuse if wrong.
    want = (ent or {}).get('match')
    if want:
        try:
            head = fr.evaluate("() => (document.body?.innerText || '').slice(0, 400)")
        except Exception:                                # noqa: BLE001
            head = ''
        # A CACHED SESSION EXPIRES INTO AN ERROR PAGE, not into a failure to load.
        # 2026-08-02: a URL minted on 31 July returned "There was a problem loading
        # this content or tool" for all 11 products. That page still has selects and
        # links, so _wait_for_tool reported the tool ready and the re-mint fallback
        # never fired - the run refused 11 times instead of recovering once. So an
        # expired session is detected HERE, where the evidence is, and retried.
        expired = 'problem loading this content' in (head or '').lower()
        if (expired or want.lower() not in (head or '').lower()) and src == 'cached':
            print(f'  [pull] cached session looks {"expired" if expired else "wrong"}'
                  ' - re-minting and retrying once')
            fresh = _mint_tool_url(ctx, page)
            if fresh:
                _cache_url(fresh)
                target = _with_pid(fresh, ent['pid'], ent.get('pf')) if ent else fresh
                try:
                    page.goto(target, wait_until='domcontentloaded', timeout=90_000)
                    _settle(None, page, 4000)
                    fr = _wait_for_tool(ctx, page, 30) or fr
                    head = fr.evaluate("() => (document.body?.innerText || '').slice(0, 400)")
                except Exception:                        # noqa: BLE001
                    pass

        if want.lower() not in (head or '').lower():
            first = (head or '').strip().splitlines()
            print(f'  ! REFUSING: expected "{want}" in the tool header, not found.')
            print(f'    header says: {" | ".join(first[:3])[:120]}')
            print(f'    pid={ent["pid"]} pf={ent.get("pf")} may be mispaired - '
                  f'run --learn-pid --product "{product}" to record the real one.')
            return results
        print(f'[pull] product confirmed: "{want}" present in header')

    written = []
    seen_tables: dict = {}          # content hash -> which view produced it
    for key in views:
        ids, text, box = VIEWS[key]
        fr, switched = _ensure_view(ctx, page, fr, key)
        if switched:
            print(f'  {key:<8} view    -> "{_view_label(fr)}"')
        if not switched:
            print(f'  {key:<8} ! could not switch to this view - skipping it')
            _dump_frame(fr, f'what the frame actually contains ({key})')
            continue
        if all_strikes:
            got = _set_select_by_option(fr, '(All)')
            if got:
                print(f'  {key:<8} strikes -> (All)')
            elif key == 'settles':
                # Expected: the per-expiry table has one row per expiry, so there
                # is no strike window to widen. Not a failure.
                print(f'  {key:<8} strikes -> n/a (per-expiry table has no strike window)')
            else:
                print(f'  {key:<8} strikes -> NOT SET, and this view NEEDS it '
                      '- the capture may be a window, not the full ladder')
            if not got and key != 'settles':
                try:
                    sels = fr.evaluate("""() => Array.from(document.querySelectorAll('select'))
                        .map(s => s.id + ' :: ' + Array.from(s.options).map(o=>o.text.trim()).join('/'))""")
                    for x in (sels or [])[:8]:
                        print(f'           select {x[-92:]}')
                except Exception:                        # noqa: BLE001
                    pass
            if got:
                _settle(fr, page)
                fr = _wait_for_tool(ctx, page, 20) or fr
        if key == 'settles':
            # The Report mode decides the column layout; a non-Standard report
            # shifts OI onto volatility columns and parses to ZERO OI silently.
            rep = _set_select_by_option(fr, 'Standard')
            print(f"  {key:<8} report  -> {'Standard' if rep else 'NOT SET - check --inspect'}")
            if rep:
                _settle(fr, page)
                fr = _wait_for_tool(ctx, page, 20) or fr
        # VERIFY THE VIEW, don't trust the click. On gold, the session restored
        # the Settlements view from the previous run, the nav click did not move
        # off it, and all three heatmap views captured the SAME settlements table
        # - three byte-identical files under three names. A wrong-view capture is
        # complete, well-formed and wrong, so shape is checked against the view.
        tsv, n, why, stable = _stable_table(fr, ctx, page)
        if not stable:
            print(f'  {key:<8} ! table never stopped growing - refusing a mid-render read')
            continue
        want_kind = 'expiry table' if key == 'settles' else 'strike ladder'
        if tsv and not why.startswith(want_kind):
            print(f'  {key:<8} ! wrong view: expected a {want_kind}, got "{why}".')
            print(f'  {"":<8}   The nav click did not land - refusing to write '
                  f'another view\'s table under {VIEWS[key][2]}.')
            continue
        if key == 'settles':
            norm = _settles_normalised(fr)
            if norm:
                tsv, why = norm, 'expiry table, normalised to 17 columns'
            else:
                print(f'  {key:<8}    ! could not normalise columns - writing as captured')
        if not tsv:
            print(f'  {key:<8} ! no data table recognised')
            _dump_tables(fr, ctx)
            _dump_frame(fr, f'controls on the {key} view')
            continue
        import hashlib
        h = hashlib.sha1(tsv.encode('utf-8', 'replace')).hexdigest()[:12]
        # Two EMPTY grids over the same strikes are legitimately identical - Dow's
        # change and volume matrices both came back blank because Dow options
        # barely trade (term-table OI of 11). Only treat a repeat as a failed view
        # switch when the table actually carries data.
        has_data = any(
            any(c.strip() for c in row.split('\t')[1:])
            for row in tsv.split('\n')
            if row and row[0].isdigit())
        if h in seen_tables and has_data:
            print(f'  {key:<8} ! IDENTICAL to the {seen_tables[h]} capture - the view '
                  'did not actually change. Refusing to write a duplicate.')
            continue
        seen_tables[h] = key
        fn = d / f'{safe_name(product or "current")}_{box}.tsv'
        _atomic(fn, tsv)
        written.append(fn)
        print(f'  {key:<8} -> {fn.name}  [{why}]')
        print(f'  {"":<8}    {shape_line(shape(tsv))}  {grade_line(grade(tsv))}')
        # Column-count check against the layout js/oi.js parses positionally.
        # 17 (term) / 14 (chain) are the documented widths; anything wider means
        # extra volatility groups have shifted the OI columns, and the numbers
        # will parse cleanly while being wrong.
        # STRIKE-WINDOW GUARD. The selector offers 10/15/25/50/(All); a capture
        # landing on one of those counts is far more likely a window than a book
        # that happens to have exactly 25 strikes. A truncated ladder parses
        # perfectly and moves max pain and the walls, so it must be loud - the
        # measured damage on ES was walls at 7425/7400 (50 strikes) versus
        # 7800/6300 (full), which is not a rounding difference.
        n_str = shape(tsv)['strikes']
        if key in ('oi', 'chg', 'vol') and n_str in (10, 15, 25, 50):
            print(f'  {"":<8}    ! exactly {n_str} strikes - that is a WINDOW size, '
                  'not a full ladder. Set Strikes to (All).')
        widest = max((r.count('\t') + 1 for r in tsv.split('\n') if r.strip()), default=0)
        if key == 'settles' and widest > 17:
            print(f'  {"":<8}    ! {widest} columns, expected 17 - extra volatility '
                  'groups are shifting OI. See the toggle dump below.')
            _dump_frame(fr, 'controls that might hide the extra vol columns')

    # No ctx.close() here: the CALLER owns the browser, so a scheduled sweep can
    # drive every product through one session instead of re-launching per product.
    if written:
        print()
        r = subprocess.run(['node', str(HERE / 'validate_capture.mjs'), *map(str, written)],
                           capture_output=True, text=True)
        print('\n'.join(l for l in (r.stdout or '').splitlines()
                        if 'ExperimentalWarning' not in l and 'trace-warnings' not in l))
        if r.returncode:
            print('  *** a table FAILED validation - do not ingest it ***')
        results['_validated'] = (r.returncode == 0)
    print(f'\n[pull] {len(written)} file(s) -> {d}')
    for f in written:
        results[f.name] = str(f)
    return results


def mode_settings(product: str | None, view: str, headless: bool) -> None:
    """Open the AUTOMATION profile on the tool and wait, so you can set its
    display preferences by hand.

    Needed because the scraper runs in `.chrome-profile/` - a different logged-in
    QuikStrike session from your everyday browser - and the column layout and
    strike window are per-session PREFERENCES, not per-request controls. That is
    why the pull returned 23 columns while your own pastes were always 17.

    `recon.py --login` lands on the CME homepage, which is the wrong place; this
    goes straight to the view whose preferences need changing.
    """
    ctx = _launch(headless=headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    url = _cached_url() or _mint_tool_url(ctx, page)
    if not url:
        print('[settings] could not reach the tool')
        ctx.close()
        return
    ent = _load_qs_ids().get(product) if product else None
    if ent:
        url = _with_pid(url, ent['pid'], ent.get('pf'))
    page.goto(url, wait_until='domcontentloaded', timeout=90_000)
    _settle(None, page, 5000)
    fr = _wait_for_tool(ctx, page, 30)
    if fr and view in VIEWS:
        ids, text, _ = VIEWS[view]
        if _click_view(ctx, fr, ids, text):
            _settle(fr, page)
            print(f'[settings] opened the "{text}" view')

    print('\n' + '=' * 72)
    print(' This is the AUTOMATION profile - its preferences are separate from')
    print(' your normal Chrome. Set them here, once:')
    print('   1. Settlements view: turn OFF Basis Point and Black-Scholes')
    print('      volatility columns  (23 columns -> the 17 the parser expects)')
    print('   2. OI / OI Change / Volume heatmaps: set Strikes to (All)')
    print('\n CLOSE THE CHROME WINDOW when done. Do not type here.')
    print('=' * 72 + '\n')
    while True:
        try:
            if not [p for p in ctx.pages if not p.is_closed()]:
                break
            page.wait_for_timeout(1500)
        except Exception:                                # noqa: BLE001
            break
    print('[settings] saved to the automation profile. Re-run the pull to check.')


def _select_product(frame, product: str) -> bool:
    """Open the product popup and pick by VISIBLE TEXT, hierarchically.

    Ids inside this popup shift with the last selection, so text is the only
    stable handle. Returns False (loudly) rather than pretending, because a
    silent failure here means pulling the previous product's book under a new
    name - the worst outcome available.
    """
    for opener in ('a[id$="hlProductArrow"]', 'a[id$="hlProductText"]'):
        try:
            loc = frame.locator(opener).first
            if loc.count() == 0:
                continue
            loc.click(timeout=15_000)                    # NATIVE click
            frame.page.wait_for_timeout(2500)
            break
        except Exception:                                # noqa: BLE001
            continue
    # Try the product name and common variants, longest first.
    cands = [product, product.replace('/', ''), product.split('/')[0]]
    for c in cands:
        try:
            loc = frame.get_by_text(c, exact=False).first
            if loc.count():
                loc.click(timeout=10_000)
                frame.page.wait_for_timeout(2500)
                return True
        except Exception:                                # noqa: BLE001
            continue
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description='Pull QuikStrike tables (IV et al).')
    ap.add_argument('--inspect', action='store_true', help='dump controls, click nothing')
    ap.add_argument('--settings', action='store_true',
                    help='open the automation profile ON the tool so you can set its display preferences by hand')
    ap.add_argument('--learn-pid', action='store_true',
                    help='with --product: you pick it once, it records the pid')
    ap.add_argument('--product', help='e.g. "EUR/USD" (omit = whatever is loaded)')
    ap.add_argument('--views', default='settles',
                    help='comma list of: ' + ','.join(VIEWS) + ' (default settles)')
    ap.add_argument('--no-all-strikes', action='store_true',
                    help='leave the strike window alone (default is to set "(All)")')
    ap.add_argument('--headless', action='store_true',
                    help='off-screen window (true headless is blocked by the site)')
    a = ap.parse_args()
    if a.learn_pid:
        if not a.product:
            sys.exit('--learn-pid needs --product')
        return mode_learn_pid(a.product, a.headless)
    if a.settings:
        return mode_settings(a.product, 'settles', a.headless)
    if a.inspect:
        return mode_inspect(a.headless)
    asked = [v.strip() for v in a.views.split(',') if v.strip()]
    views = [v for v in asked if v in VIEWS]
    # Silently dropping a typo'd view name means you think you captured it.
    unknown = [v for v in asked if v not in VIEWS]
    if unknown:
        print(f'! unknown view(s) ignored: {", ".join(unknown)} '
              f'(valid: {", ".join(VIEWS)})')
    if not views:
        sys.exit('no valid --views; choose from ' + ','.join(VIEWS))
    # Settles first: it is the light view, and switching TO it from a 482x43
    # matrix is what timed out. Views are independent, so order is free.
    views.sort(key=lambda v: 0 if v == 'settles' else 1)
    mode_pull(a.product, views, a.headless, not a.no_all_strikes)


if __name__ == '__main__':
    main()
