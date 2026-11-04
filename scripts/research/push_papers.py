"""Push the research papers downloaded on the laptop to the literature desk (plan §9ai). Stdlib only.

The PDFs under education/papers/ are gitignored (copyrighted; the repo is public), so the server never sees them
unless they are uploaded. This walks education/papers/**/*.pdf, asks the server which papers it already holds
(GET /api/research-pod/upload/have), and uploads the rest one at a time (POST /api/research-pod/upload, raw PDF body).
The server stores each privately in R2, extracts its text, and matches it to its backlog entry by the id in the file
name: "<ssrn id>_anything.pdf" (education/papers/manifest.csv) or "<arXiv id>_anything.pdf" (the open reading list).
They are then read, full text, by "Read the backlog" on the Desk Office Research tab and by the Sunday pod run.

    python scripts/research/push_papers.py              # list what would be uploaded
    python scripts/research/push_papers.py --push       # upload it
    python scripts/research/push_papers.py --push --read --limit 1    # upload one and have it read now

Options: --base URL (default env MACROFX_BASE or the production server), --dir DIR (default education/papers),
--limit N, --max-mb N (default 30, the server's cap). Exit 0 when everything went (or nothing was needed), 1 when an
upload failed, 2 when the server could not be reached.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get('MACROFX_BASE', 'https://macrofxmodel-production.up.railway.app')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def paper_id(name):
    """The id the server will give this file (js/researchLibrary.js matchUpload), or None for an unnamed upload."""
    base = re.sub(r'\.pdf$', '', os.path.basename(name), flags=re.I)
    m = re.match(r'^(\d{4}\.\d{4,5})(?:v\d+)?(?:[_\- ]|$)', base)
    if m:
        return 'arxiv:' + m.group(1)
    m = re.match(r'^(\d{5,9})(?:[_\- ]|$)', base)
    if m:
        return 'doi:10.2139/ssrn.' + m.group(1)
    return None


def get_json(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept': 'application/json'}), timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def upload(base, path, read=False, timeout=180):
    with open(path, 'rb') as f:
        body = f.read()
    url = base + '/api/research-pod/upload' + ('?read=1' if read else '')
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': 'application/pdf', 'X-Filename': urllib.parse.quote(os.path.basename(path))})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode('utf-8'))
        except Exception:
            return {'ok': False, 'error': 'HTTP %s' % e.code}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--push', action='store_true', help='upload (default: only list)')
    ap.add_argument('--read', action='store_true', help='ask the server to read each upload now (one at a time)')
    ap.add_argument('--base', default=BASE)
    ap.add_argument('--dir', default=os.path.join(ROOT, 'education', 'papers'))
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--max-mb', type=float, default=30)
    a = ap.parse_args()
    base = a.base.rstrip('/')

    files = []
    for d, _, names in os.walk(a.dir):
        files += [os.path.join(d, n) for n in sorted(names) if n.lower().endswith('.pdf')]
    if not files:
        print('No PDFs under %s.' % a.dir)
        return 0

    try:
        have = get_json(base + '/api/research-pod/upload/have')
    except Exception as e:
        print('Cannot reach %s: %s' % (base, e))
        return 2
    ids, names = set(have.get('ids', [])), set(have.get('names', []))
    todo = []
    for p in files:
        pid, name = paper_id(p), os.path.basename(p)
        if (pid and pid in ids) or name in names:
            continue
        if os.path.getsize(p) > a.max_mb * 1e6:
            print('skip (over %s MB): %s' % (a.max_mb, name))
            continue
        todo.append((p, pid))
    if a.limit:
        todo = todo[:a.limit]
    print('%d PDFs found, %d already on the server, %d to upload (stored: %s).' % (len(files), len(files) - len(todo), len(todo), have.get('stored')))
    if not a.push:
        for p, pid in todo:
            print('  %s  %s' % (pid or '(no id: a new entry)', os.path.relpath(p, ROOT)))
        print('Run again with --push to upload.')
        return 0

    failed = 0
    for i, (p, pid) in enumerate(todo, 1):
        r = upload(base, p, read=a.read)
        if r.get('ok'):
            print('[%d/%d] %s -> %s%s, %s chars%s' % (i, len(todo), os.path.basename(p), r.get('id'), ' (matched %s)' % r['matched'] if r.get('matched') else ' (new)', r.get('chars'), ', reading' if r.get('reading') else ''))
        else:
            failed += 1
            print('[%d/%d] %s FAILED: %s' % (i, len(todo), os.path.basename(p), r.get('error')))
    print('Done: %d uploaded, %d failed. Press "Read the backlog" on the Research tab, or wait for Sunday.' % (len(todo) - failed, failed))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
