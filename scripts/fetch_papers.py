"""Collect the SSRN papers our notes cite, and download every one that has a legal open copy elsewhere.

What it does
  1. Finds SSRN ids in the files you name (ssrn.com/abstract=NNN, including ones wrapped across a line).
  2. Looks each id up on Crossref (title, authors, year) and on OpenAlex (is there an open-access copy?).
  3. Downloads the open copies (author pages, NBER, arXiv, university repositories, publishers' free versions),
     checks each file really is a PDF, and saves it as <id>_<title>.pdf.
  4. Writes manifest.csv (one row per paper: what was found, where from) and MISSING.md (a clickable SSRN link
     for every paper with no open copy, to download yourself while signed in).

What it deliberately does NOT do: fetch anything from ssrn.com. SSRN's terms bar automated bulk download and it
sits behind bot protection; the papers it will not give us are listed in MISSING.md for you to click.

Usage (from the repo root; run it with the interpreter's isolated mode so nothing in the output folder is imported):
  python -I scripts/fetch_papers.py "education/151 Trading Strategies.md" --out education/papers
  python -I scripts/fetch_papers.py --ids 2293684 3331229 --out education/papers
Re-running skips papers already saved.

Papers downloaded by hand (SSRN names them ssrn-<id>.pdf) are picked up from your Downloads folder:
  python -I scripts/fetch_papers.py "education/151 Trading Strategies.md" --out education/papers --ingest "%USERPROFILE%\\Downloads"
"""
import argparse, csv, difflib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = {'User-Agent': 'research-paper-fetch/1.0 (personal research notes)'}
SSRN_HOSTS = ('ssrn.com', 'papers.ssrn.com', 'dx.doi.org', 'doi.org')   # never fetched: see the module docstring
MAX_BYTES = 60 * 1024 * 1024
DELAY = 0.7                                                           # seconds between requests: be polite


def get(url, accept=None, timeout=30):
    h = dict(UA)
    if accept: h['Accept'] = accept
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout)


def get_json(url):
    try:
        with get(url, 'application/json') as r:
            return json.loads(r.read().decode('utf-8', 'replace'))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None
    finally:
        time.sleep(DELAY)


def ids_from_files(paths):
    found = []
    for p in paths:
        t = open(p, encoding='utf-8', errors='replace').read()
        # ssrn.com/abstract=123, "abstract = 123", or the number on the next line after a wrapped "abstract="
        for m in re.finditer(r'abstract_?(?:id)?\s*=\s*(\d{5,8})', t, re.I):
            found.append(m.group(1))
        for m in re.finditer(r'ssrn[^\n]{0,60}?(?:abstract|id)\s*=\s*\n\s*(\d{5,8})', t, re.I):
            found.append(m.group(1))
    seen, out = set(), []
    for i in found:
        if i not in seen: seen.add(i); out.append(i)
    return out


def crossref(sid):
    j = get_json('https://api.crossref.org/works/10.2139/ssrn.' + sid)
    if not j or 'message' not in j: return {}
    m = j['message']
    title = html.unescape((m.get('title') or [''])[0])
    authors = '; '.join(((a.get('given', '') + ' ' + a.get('family', '')).strip()) for a in m.get('author', [])[:6])
    dp = (m.get('issued') or m.get('posted') or {}).get('date-parts', [[None]])[0]
    return {'title': re.sub(r'\s+', ' ', title).strip(), 'authors': authors, 'year': dp[0] if dp else None}


def usable(u):
    if not u or not u.lower().startswith(('http://', 'https://')): return False
    host = urllib.parse.urlparse(u).netloc.lower()
    return not any(host == s or host.endswith('.' + s) for s in SSRN_HOSTS)


def candidates(work):
    """Every non-SSRN place OpenAlex knows this paper lives: direct PDF links first, then pages that link to one.
    OpenAlex's is_oa flag is not used as a filter: author and university copies often carry no licence, so they
    are marked not-OA although they download fine. Whether a URL really gives us a PDF is checked on download."""
    pdfs, pages = [], []
    for loc in ([work.get('best_oa_location')] if work.get('best_oa_location') else []) + (work.get('locations') or []):
        if not loc: continue
        u = loc.get('pdf_url')
        if usable(u) and u not in pdfs: pdfs.append(u)
        u = loc.get('landing_page_url')
        if usable(u) and u not in pdfs and u not in pages:
            (pdfs if re.search(r'\.pdf($|\?)', u, re.I) else pages).append(u)
    return pdfs + pages


def openalex(sid, meta):
    """The SSRN record's own open locations, then (many papers were later published or posted elsewhere) the best title match."""
    w = get_json('https://api.openalex.org/works/doi:10.2139/ssrn.' + sid)
    urls = candidates(w) if w else []
    note = 'same record'
    if not urls and meta.get('title'):
        q = urllib.parse.quote(meta['title'])
        r = get_json('https://api.openalex.org/works?filter=title.search:%s&per-page=5' % q)
        first_author = (meta.get('authors') or '').split(';')[0].split(' ')[-1].lower()
        for cand in (r or {}).get('results', []):
            t = re.sub(r'\W+', ' ', (cand.get('title') or '').lower()).strip()
            mine = re.sub(r'\W+', ' ', meta['title'].lower()).strip()
            if difflib.SequenceMatcher(None, t, mine).ratio() < 0.92: continue
            names = ' '.join((a.get('author', {}).get('display_name') or '') for a in cand.get('authorships', [])).lower()
            if first_author and first_author not in names: continue
            urls = candidates(cand); note = 'matched by title: ' + (cand.get('doi') or cand.get('id') or '')
            if urls: break
    return urls, note


def save_pdf(url, dest, depth=0):
    """Download url; keep it only if it is a PDF. A landing page is searched once for a direct PDF link."""
    try:
        with get(url, 'application/pdf,*/*', timeout=45) as r:
            head = r.read(8)
            if head.startswith(b'%PDF'):
                body = head + r.read(MAX_BYTES)
                if len(body) < 20000: return False
                open(dest, 'wb').write(body); return True
            page = (head + r.read(400000)).decode('utf-8', 'replace')
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return False
    finally:
        time.sleep(DELAY)
    # a landing page: look for the direct PDF link it advertises (Highwire/EPrints meta tags), else its first .pdf link
    for pat in (r'<meta[^>]+name=["\']citation_pdf_url["\'][^>]+content=["\']([^"\']+)',
                r'<meta[^>]+name=["\']eprints\.document_url["\'][^>]+content=["\']([^"\']+)',
                r'href=["\']([^"\']+\.pdf)["\']'):
        m = re.search(pat, page, re.I)
        if m:
            nxt = urllib.parse.urljoin(url, html.unescape(m.group(1)))
            if usable(nxt) and nxt != url and depth < 1: return save_pdf(nxt, dest, depth + 1)
    return False


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60] or 'paper'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='*', help='notes to scan for SSRN ids')
    ap.add_argument('--ids', nargs='*', default=[], help='SSRN ids to fetch directly')
    ap.add_argument('--out', required=True, help='folder for the PDFs, manifest.csv and MISSING.md')
    ap.add_argument('--limit', type=int, default=0, help='only the first N ids (to try it out)')
    ap.add_argument('--ingest', help='folder holding PDFs you downloaded by hand from SSRN (named ssrn-<id>.pdf); copied into --out')
    ap.add_argument('--page', action='store_true', help='only rebuild MISSING.html (a clickable checklist) from manifest.csv')
    a = ap.parse_args()
    if a.page:
        rows = [r for r in csv.DictReader(open(os.path.join(a.out, 'manifest.csv'), encoding='utf-8')) if r['status'] != 'downloaded']
        items = ''.join('<li><label><input type="checkbox"> <a href="%s" target="_blank" rel="noopener">%s</a> <small>%s %s</small></label></li>\n' % (
            html.escape(r['ssrn_page']), html.escape(r['title'] or 'SSRN ' + r['ssrn_id']), html.escape(str(r['year'])), html.escape(r['authors'])) for r in rows)
        open(os.path.join(a.out, 'MISSING.html'), 'w', encoding='utf-8').write(
            '<!doctype html><meta charset="utf-8"><title>SSRN papers to download</title>'
            '<style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}li{margin:.5rem 0}small{color:#666}</style>'
            '<h1>%d SSRN papers to download</h1><p>Signed in to SSRN: click a title, then <b>Download This Paper</b>. '
            'Save into your Downloads folder without renaming, then run the --ingest command.</p><ul style="list-style:none;padding:0">\n%s</ul>' % (len(rows), items))
        print('wrote MISSING.html with %d papers' % len(rows)); return
    if a.ingest:
        os.makedirs(a.out, exist_ok=True)
        for fn in sorted(os.listdir(a.ingest)):
            m = re.match(r'ssrn[-_ ]?(\d{5,8})', fn, re.I)
            if not m or not fn.lower().endswith('.pdf'): continue
            src = os.path.join(a.ingest, fn)
            with open(src, 'rb') as fh:
                ok = fh.read(4) == b'%PDF'
            dest = os.path.join(a.out, '%s_manual.pdf' % m.group(1))
            if ok and not os.path.exists(dest) and not any(f.startswith(m.group(1) + '_') for f in os.listdir(a.out)):
                open(dest, 'wb').write(open(src, 'rb').read()); print('ingested', fn)
    ids = list(dict.fromkeys(a.ids + ids_from_files(a.files)))
    if a.limit: ids = ids[:a.limit]
    if not ids: sys.exit('no SSRN ids found')
    os.makedirs(a.out, exist_ok=True)
    mpath = os.path.join(a.out, 'manifest.csv')
    old = {}
    if os.path.exists(mpath):
        for r in csv.DictReader(open(mpath, encoding='utf-8')): old[r['ssrn_id']] = r
    rows = []
    print('%d ids' % len(ids))
    for n, sid in enumerate(ids, 1):
        prev = old.get(sid)
        have = next((f for f in os.listdir(a.out) if f.startswith(sid + '_') and f.lower().endswith('.pdf')), '')
        if have and not (prev and prev.get('file')):
            meta = crossref(sid)
            rows.append({'ssrn_id': sid, 'title': meta.get('title', ''), 'authors': meta.get('authors', ''), 'year': meta.get('year') or '',
                         'status': 'downloaded', 'source': 'manual (signed-in SSRN download)', 'file': have,
                         'ssrn_page': 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=' + sid})
            print('%3d/%d %s  added by hand' % (n, len(ids), sid)); continue
        if prev and prev.get('file') and os.path.exists(os.path.join(a.out, prev['file'])):
            rows.append(prev); print('%3d/%d %s  already saved' % (n, len(ids), sid)); continue
        meta = crossref(sid)
        urls, note = openalex(sid, meta)
        row = {'ssrn_id': sid, 'title': meta.get('title', ''), 'authors': meta.get('authors', ''), 'year': meta.get('year') or '',
               'status': 'no open copy', 'source': '', 'file': '', 'ssrn_page': 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=' + sid}
        fname = '%s_%s.pdf' % (sid, slug(meta.get('title', '')))
        for u in urls[:4]:
            if save_pdf(u, os.path.join(a.out, fname)):
                row.update(status='downloaded', source=u + ('  (' + note + ')' if note != 'same record' else ''), file=fname); break
        else:
            if urls: row.update(status='open copy listed but not downloadable', source=urls[0])
        rows.append(row)
        print('%3d/%d %s  %-34s %s' % (n, len(ids), sid, row['status'], (row['title'] or '(no Crossref record)')[:60]))
    cols = ['ssrn_id', 'title', 'authors', 'year', 'status', 'source', 'file', 'ssrn_page']
    with open(mpath, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); [w.writerow({c: r.get(c, '') for c in cols}) for r in rows]
    miss = [r for r in rows if r['status'] != 'downloaded']
    with open(os.path.join(a.out, 'MISSING.md'), 'w', encoding='utf-8') as f:
        f.write('# SSRN papers with no open copy found\n\nDownload these yourself from SSRN (free account; click "Download This Paper") '
                'and drop the PDF in this folder, named `<ssrn id>_anything.pdf`.\n\n')
        for r in miss: f.write('- [%s](%s)%s %s\n' % (r['title'] or 'SSRN ' + r['ssrn_id'], r['ssrn_page'], ' (%s)' % r['year'] if r['year'] else '', '· ' + r['authors'] if r['authors'] else ''))
    got = len(rows) - len(miss)
    print('\n%d downloaded, %d need a manual download -> %s' % (got, len(miss), os.path.join(a.out, 'MISSING.md')))


if __name__ == '__main__':
    main()
