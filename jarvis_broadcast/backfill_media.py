"""Backfill the MEDIA section with the H.E.L.I.X. videos uploaded before the server kept a list of them (the published list starts on 2026-11-28).

  python backfill_media.py --dry-run                 read out/run.log (and out/*/meta.json for titles), print what it would send, send nothing
  python backfill_media.py --dry-run --youtube       also list the channel's uploads playlist (playlistItems.list, about 1 quota unit a page of 50)
  python backfill_media.py                           send it: POST /api/helix/broadcasts/backfill in chunks of 100

Where the rows come from:
  run.log   every line "uploaded (unlisted...): https://youtu.be/<id>" (or youtube.com/shorts/<id>). The programme comes from the encoded file name just before it
            (jarvis-<part>-<date>.mp4), a "recording the guide broadcast" run is the visual guide, and a /shorts/ link is a Short. The log has times but no dates: the
            date is carried from the file names and moved on at each midnight. The title is the one the run kept (a meta.json of the same file and length, or the
            podcast upload's title= logged right after that upload), else "H.E.L.I.X. <programme> · <Ddd D Mon>". Stand-in ids (DRYRUN...) are skipped.
  YouTube   (--youtube) the uploads playlist; its titles win over the made-up ones. Needs a token that can read: token_captions.json (youtube.force-ssl), since the
            upload token (youtube.upload) cannot list. Only titles with HELIX in them are kept.
The server checks every row (11-character id, known programme, a real time), dedupes by id and never sends a Telegram note. Auth: helix_notify.call (X-Auth-Token =
KV_WRITE_SECRET from the environment or push_secret.txt; the server refuses when it has no secret set). Unlisted videos stay unlisted: nothing here changes them.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
BASE = 'https://macrofxmodel-production.up.railway.app'
PARTS = ('morning', 'afternoon', 'evening', 'weekly', 'special', 'short', 'guide')
LABEL = {'morning': 'Morning', 'afternoon': 'Afternoon', 'evening': 'Evening', 'weekly': 'Weekly', 'special': 'Special', 'short': 'Short', 'guide': 'Visual guide'}
CHUNK = 100

RE_TIME = re.compile(r'^(\d{2}):(\d{2}):(\d{2})\s{2}(.*)$')
RE_UPLOADED = re.compile(r'^uploaded \(unlisted[^)]*\):\s*(https://\S+)')
RE_ENCODED = re.compile(r'^encoded jarvis-([a-z]+)-(\d{4}-\d{2}-\d{2})\.mp4:\s*([\d.]+)\s*s')
RE_RECORDING = re.compile(r'^recording the (\w+) broadcast')
RE_PODCAST = re.compile(r'^/api/helix/podcast/episode\?(\S+?):')
RE_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')


def video_id(url: str) -> tuple[str | None, str]:
    """(id, format) from a youtu.be / youtube.com/shorts / watch?v= link; (None, '') when it is not one."""
    u = urlparse(url.strip())
    host = (u.hostname or '').lower()
    fmt = 'wide'
    if host == 'youtu.be':
        vid = u.path.strip('/').split('/')[0]
    elif host.endswith('youtube.com') and u.path.startswith('/shorts/'):
        vid, fmt = u.path.split('/')[2] if len(u.path.split('/')) > 2 else '', 'short'
    elif host.endswith('youtube.com'):
        vid = (parse_qs(u.query).get('v') or [''])[0]
    else:
        return None, ''
    return (vid, fmt) if RE_ID.match(vid or '') and not vid.startswith('DRYRUN') else (None, '')


def day_words(d: date) -> str:
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def default_title(part: str, d: date) -> str:
    return f'H.E.L.I.X. {LABEL.get(part, "Briefing")} · {day_words(d)}'


def london_to_utc(d: date, hh: int, mm: int, ss: int) -> str:
    """The laptop logs London wall-clock time. ISO UTC for the server; without tz data it is taken as UTC (London is UTC from late October to late March)."""
    naive = datetime(d.year, d.month, d.day, hh, mm, ss)
    try:
        from zoneinfo import ZoneInfo
        aware = naive.replace(tzinfo=ZoneInfo('Europe/London'))
    except Exception:
        aware = naive.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def load_metas(out_dir: Path) -> list[dict]:
    """The meta.json files the recorder writes beside each run: {part, title, seconds, mp4}. Unreadable ones are skipped."""
    metas = []
    for f in sorted(out_dir.glob('*/meta.json')):
        try:
            m = json.loads(f.read_text(encoding='utf-8'))
            if m.get('title') and m.get('part') and not f.parent.name.endswith('-dry'):
                metas.append({'part': m['part'], 'title': str(m['title']), 'seconds': m.get('seconds'), 'mp4': Path(str(m.get('mp4', ''))).name})
        except (OSError, ValueError):
            continue
    return metas


def parse_run_log(text: str, metas: list[dict] | None = None) -> tuple[list[dict], list[str]]:
    """The uploads in run.log, oldest first: [{videoId, part, at, title, seconds, format}], and notes about lines that could not be placed."""
    metas = metas or []
    rows: list[dict] = []
    notes: list[str] = []
    cur: date | None = None
    last_secs = -1
    mode = None
    enc = None                     # (part, date, seconds) of the last encoded file
    run_row = None                 # the row uploaded in the current run (a podcast title logged after it belongs to it)
    for n, line in enumerate(text.splitlines(), 1):
        m = RE_TIME.match(line)
        if not m:
            continue
        hh, mm, ss, rest = int(m[1]), int(m[2]), int(m[3]), m[4].strip()
        secs = hh * 3600 + mm * 60 + ss
        if cur is not None and secs < last_secs - 60:          # the clock went back: a new day (a minute of slack for out-of-order lines)
            cur += timedelta(days=1)
        last_secs = secs
        if rest.startswith('[dry run]'):                    # a stand-in run: its titles and ids are not real
            continue
        if (r := RE_RECORDING.match(rest)):
            mode, enc, run_row = r[1], None, None
            continue
        if (e := RE_ENCODED.match(rest)):
            fdate = date.fromisoformat(e[2])
            if cur is None or fdate > cur:                   # the file name never runs ahead of the real date: catch up on days the log skipped
                cur = fdate
            enc = (e[1], fdate, float(e[3]))
            continue
        if (p := RE_PODCAST.match(rest)):                     # the podcast upload logs the programme's real title: give it to the video of the same programme and day
            q = parse_qs(p[1])
            ep, title = (q.get('id') or [''])[0], (q.get('title') or [''])[0]
            if run_row is not None and title and run_row.get('_generated') and ep.endswith(f"-{run_row['part']}"):
                run_row['title'], run_row['_generated'] = title[:100], False
            continue
        if (u := RE_UPLOADED.match(rest)):
            vid, fmt = video_id(u[1])
            if not vid:
                if 'DRYRUN' not in u[1]:
                    notes.append(f'line {n}: not a YouTube video link: {u[1]}')
                continue
            if cur is None:
                notes.append(f'line {n}: {vid} comes before any dated file name, skipped')
                continue
            if fmt == 'short':
                part = 'short'
            elif mode == 'guide':
                part = 'guide'
            elif enc:
                part = enc[0] if enc[0] in PARTS else 'morning'
            else:
                notes.append(f'line {n}: {vid} has no encoded file before it, filed as morning')
                part = 'morning'
            pdate = enc[1] if enc else cur
            seconds = enc[2] if enc else None
            title, generated = None, True
            if enc:
                mt = next((x for x in metas if x['mp4'] == f'jarvis-{enc[0]}-{enc[1].isoformat()}.mp4' and x['seconds'] is not None and abs(float(x['seconds']) - enc[2]) < 0.6), None)
                if mt:
                    title, generated = mt['title'], False
            rows.append({'videoId': vid, 'part': part, 'at': london_to_utc(cur, hh, mm, ss), 'title': (title or default_title(part, pdate))[:100],
                         'seconds': seconds, 'format': fmt, '_generated': generated})
            run_row = rows[-1]
    seen, out = set(), []
    for r in rows:                                          # one row per id (an id logged twice keeps its first upload)
        if r['videoId'] in seen:
            continue
        seen.add(r['videoId'])
        out.append(r)
    return out, notes


PART_FROM_TITLE = [('visual guide', 'guide'), ('guide', 'guide'), ('weekly', 'weekly'), ('special', 'special'), ('morning', 'morning'), ('afternoon', 'afternoon'),
                   ('evening', 'evening'), ('short', 'short')]


def part_from_title(title: str) -> str | None:
    t = title.lower()
    head = t.split('·')[0]
    for word, part in PART_FROM_TITLE:
        if word in head:
            return part
    for word, part in PART_FROM_TITLE:
        if word in t:
            return part
    return None


def playlist_rows(items: list[dict]) -> list[dict]:
    """Rows from playlistItems.list items (snippet + contentDetails). Only H.E.L.I.X. titles, a known programme and a public-API id."""
    out = []
    for it in items or []:
        sn, cd = it.get('snippet') or {}, it.get('contentDetails') or {}
        vid = cd.get('videoId') or (sn.get('resourceId') or {}).get('videoId') or ''
        title = str(sn.get('title') or '')
        if not RE_ID.match(vid) or 'helix' not in title.lower().replace('.', ''):
            continue
        part = part_from_title(title)
        at = cd.get('videoPublishedAt') or sn.get('publishedAt')
        if not part or not at:
            continue
        out.append({'videoId': vid, 'part': part, 'at': at, 'title': title[:100], 'seconds': None, 'format': 'short' if part == 'short' or '#shorts' in title.lower() else 'wide', '_generated': False})
    return out


def youtube_uploads(max_pages: int = 20, log=print) -> list[dict]:   # pragma: no cover - network; not run by the tests
    """The channel's uploads playlist through the existing sign-in. channels.list (1 unit) + playlistItems.list (1 unit a page of 50)."""
    import youtube_upload as yu
    from googleapiclient.discovery import build
    token, scopes = (yu.TOKEN_CAPTIONS, yu.SCOPES_CAPTIONS) if yu.TOKEN_CAPTIONS.exists() else (yu.TOKEN, yu.SCOPES)
    if token == yu.TOKEN:
        log('note: only the upload sign-in (youtube.upload) is here, which usually cannot list videos; run record_broadcast.py --youtube-auth-captions first')
    yt = build('youtube', 'v3', credentials=yu.authorise(token=token, scopes=scopes), cache_discovery=False)
    ch = yt.channels().list(part='contentDetails', mine=True).execute()
    pl = ch['items'][0]['contentDetails']['relatedPlaylists']['uploads']
    items, page = [], None
    for _ in range(max_pages):
        r = yt.playlistItems().list(part='snippet,contentDetails', playlistId=pl, maxResults=50, pageToken=page).execute()
        items += r.get('items', [])
        page = r.get('nextPageToken')
        if not page:
            break
    return playlist_rows(items)


def merge(log_rows: list[dict], yt_rows: list[dict]) -> list[dict]:
    """One row per id, oldest first. YouTube's title replaces a made-up one; YouTube adds what the log never saw."""
    by = {r['videoId']: dict(r) for r in log_rows}
    for y in yt_rows:
        have = by.get(y['videoId'])
        if have is None:
            by[y['videoId']] = dict(y)
        elif have.get('_generated'):
            have['title'], have['_generated'] = y['title'], False
    return sorted(by.values(), key=lambda r: r['at'])


def payload(rows: list[dict]) -> list[dict]:
    return [{k: r[k] for k in ('videoId', 'title', 'part', 'at', 'seconds', 'format') if r.get(k) is not None} for r in rows]


def chunks(xs: list, n: int = CHUNK):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--log', type=Path, default=HERE / 'out' / 'run.log', help='the recorder log (default out/run.log beside this script)')
    ap.add_argument('--youtube', action='store_true', help="also list the channel's uploads playlist (YouTube API, ~1 quota unit a page of 50)")
    ap.add_argument('--dry-run', action='store_true', help='print what would be sent and send nothing')
    ap.add_argument('--base', default=BASE)
    a = ap.parse_args(argv)
    try:
        text = a.log.read_text(encoding='utf-8', errors='replace')
    except OSError as e:
        print(f'cannot read {a.log}: {e}')
        return 2
    log_rows, notes = parse_run_log(text, load_metas(a.log.parent))
    yt_rows = youtube_uploads() if a.youtube else []
    rows = payload(merge(log_rows, yt_rows))
    by_part = {}
    for r in rows:
        by_part[r['part']] = by_part.get(r['part'], 0) + 1
    print(f'{len(rows)} videos ({len(log_rows)} from {a.log.name}{f", {len(yt_rows)} from YouTube" if a.youtube else ""}): '
          + ', '.join(f'{k} {v}' for k, v in sorted(by_part.items())) + (f'; {rows[0]["at"][:10]} to {rows[-1]["at"][:10]}' if rows else ''))
    for nt in notes:
        print('note:', nt)
    if a.dry_run:
        for r in rows:
            print(f"  {r['at']}  {r['part']:<9} {r['videoId']}  {r.get('seconds') or '':>6}  {r['title']}")
        print(f'[dry run] would POST {len(rows)} rows to {a.base}/api/helix/broadcasts/backfill in {max(1, -(-len(rows) // CHUNK))} request(s); nothing sent')
        return 0
    if not rows:
        print('nothing to send')
        return 0
    import helix_notify as hn
    total_added = 0
    for ch in chunks(rows):
        j = hn.call(a.base, '/api/helix/broadcasts/backfill', body={'items': ch}, retries=3)
        if not j or not j.get('ok'):
            print(f'the server refused or could not be reached: {(j or {}).get("error", "no answer")}')
            return 1
        total_added += int(j.get('added') or 0)
        for rj in j.get('rejected') or []:
            print(f"  rejected row {rj.get('i')}: {rj.get('error')}")
    print(f'sent: {total_added} new, the rest were already listed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
