"""python scripts/run_py_tests.py  (or: python jarvis_broadcast/test_backfill_media.py). backfill_media.py: run.log parsing, titles, YouTube rows, merge, dry run. No network."""
import io
import json
import os
import sys
import tempfile
import urllib.error
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backfill_media as bm  # noqa: E402
import helix_notify as hn  # noqa: E402

LOG = """20:39:18  recording the short broadcast (voice: server)
20:47:19  encoded jarvis-morning-2026-11-22.mp4: 165.1 s, loudest moment -0.4 dB
21:33:11  uploaded (unlisted): https://youtube.com/shorts/Lz5J1LqNiPo
00:21:55  recording the short broadcast (voice: server)
00:27:33  encoded jarvis-morning-2026-11-23.mp4: 133.7 s, loudest moment -2.2 dB
00:27:57  uploaded (unlisted): https://youtube.com/shorts/baReNitONa0
09:04:01  uploaded (unlisted, by hand after the 09:02 sign-in fault): https://youtube.com/shorts/wbyyAlOzPAM
07:02:13  recording the quick broadcast frame by frame at 30 fps (voice: server, speed 1.1x)
08:42:41  encoded jarvis-morning-2026-11-26.mp4: 288.7 s, loudest moment -3.1 dB
08:43:42  uploaded (unlisted): https://youtu.be/Dp72bawELA4
10:17:21  recording the guide broadcast frame by frame at 30 fps (voice: server, speed 1.1x)
11:01:04  encoded jarvis-morning-2026-11-26.mp4: 402.8 s, loudest moment -2.9 dB
11:02:09  uploaded (unlisted): https://youtu.be/SdeVk8D2qE8
23:22:30  [dry run] stand-in capture: 350 frames, 70 s of tone (no browser, no voice call)
23:22:58  encoded jarvis-evening-2026-11-27.mp4: 70.0 s, loudest moment -9.8 dB
23:23:09  [dry run] would upload jarvis-evening-2026-11-27.mp4 as unlisted: 'Stand-in title' (7 tags, 531 chars of description)
23:23:09  uploaded (unlisted): https://youtu.be/DRYRUN00001
23:27:41  recording the quick broadcast frame by frame at 30 fps (voice: server, speed 1.1x)
00:10:57  encoded jarvis-evening-2026-11-27.mp4: 362.7 s, loudest moment -0.6 dB
00:13:36  uploaded (unlisted): https://youtu.be/TuIKKm8ZgRk
00:13:59  /api/helix/podcast/episode?id=2026-11-28-evening&title=H.E.L.I.X.+Evening+%C2%B7+Gold+edges+higher+2.4%25+%C2%B7+Sat+28+Nov&part=evening&seconds=362: <urlopen error>
00:20:00  uploaded (unlisted): https://example.com/not-youtube
"""


def test_run_log_rows_parts_dates_and_titles():
    rows, notes = bm.parse_run_log(LOG)
    ids = [r['videoId'] for r in rows]
    assert ids == ['Lz5J1LqNiPo', 'baReNitONa0', 'wbyyAlOzPAM', 'Dp72bawELA4', 'SdeVk8D2qE8', 'TuIKKm8ZgRk'], ids
    by = {r['videoId']: r for r in rows}
    assert by['Lz5J1LqNiPo']['part'] == 'short' and by['Lz5J1LqNiPo']['format'] == 'short' and by['Lz5J1LqNiPo']['at'] == '2026-11-22T21:33:11Z'
    assert by['baReNitONa0']['at'].startswith('2026-11-23T00:27'), 'the clock went back past midnight: a new day'
    assert by['Dp72bawELA4']['part'] == 'morning' and by['Dp72bawELA4']['at'] == '2026-11-26T08:43:42Z' and by['Dp72bawELA4']['seconds'] == 288.7, 'the file name catches the date up over days the log skipped'
    assert by['SdeVk8D2qE8']['part'] == 'guide', 'a guide run is the visual guide, whatever the file is called'
    assert by['Dp72bawELA4']['title'] == 'H.E.L.I.X. Morning · Thu 26 Nov'
    t = by['TuIKKm8ZgRk']
    assert t['part'] == 'evening' and t['at'] == '2026-11-28T00:13:36Z' and t['title'] == 'H.E.L.I.X. Evening · Gold edges higher 2.4% · Sat 28 Nov', t
    assert not any('Stand-in' in r['title'] for r in rows), 'dry-run titles are stand-ins'
    assert any('not a YouTube video link' in n for n in notes) and not any('DRYRUN' in n for n in notes)


def test_meta_json_titles_and_summer_time():
    metas = [{'part': 'morning', 'title': 'H.E.L.I.X. Morning · Dollar firm · Thu 26 Nov', 'seconds': 288.7, 'mp4': 'jarvis-morning-2026-11-26.mp4'},
             {'part': 'morning', 'title': 'wrong length', 'seconds': 100.0, 'mp4': 'jarvis-morning-2026-11-26.mp4'}]
    rows, _ = bm.parse_run_log(LOG, metas)
    assert {r['videoId']: r['title'] for r in rows}['Dp72bawELA4'] == 'H.E.L.I.X. Morning · Dollar firm · Thu 26 Nov'
    assert {r['videoId']: r['title'] for r in rows}['SdeVk8D2qE8'] == 'H.E.L.I.X. Visual guide · Thu 26 Nov', 'a meta of another length is not used'
    assert bm.london_to_utc(bm.date(2026, 6, 10), 8, 0, 0) == '2026-06-10T07:00:00Z', 'British summer time'
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / '2026-11-26_0700').mkdir()
        (Path(d) / '2026-11-26_0700' / 'meta.json').write_text(json.dumps({'part': 'morning', 'title': 'T', 'seconds': 288.7, 'mp4': 'C:\\x\\jarvis-morning-2026-11-26.mp4'}), encoding='utf-8')
        (Path(d) / '2026-11-27_2322-dry').mkdir()
        (Path(d) / '2026-11-27_2322-dry' / 'meta.json').write_text(json.dumps({'part': 'evening', 'title': 'dry', 'seconds': 70}), encoding='utf-8')
        (Path(d) / 'bad').mkdir()
        (Path(d) / 'bad' / 'meta.json').write_text('{not json', encoding='utf-8')
        assert bm.load_metas(Path(d)) == [{'part': 'morning', 'title': 'T', 'seconds': 288.7, 'mp4': 'jarvis-morning-2026-11-26.mp4'}]


def test_video_ids():
    assert bm.video_id('https://youtu.be/Dp72bawELA4') == ('Dp72bawELA4', 'wide')
    assert bm.video_id('https://youtube.com/shorts/Lz5J1LqNiPo') == ('Lz5J1LqNiPo', 'short')
    assert bm.video_id('https://www.youtube.com/watch?v=Dp72bawELA4&t=1') == ('Dp72bawELA4', 'wide')
    for bad in ('https://youtu.be/DRYRUN00001', 'https://youtu.be/short', 'https://evil.example/Dp72bawELA4'):
        assert bm.video_id(bad) == (None, ''), bad


def test_youtube_rows_and_merge():
    items = [
        {'snippet': {'title': 'H.E.L.I.X. Evening · Gold runs · Thu 26 Nov', 'publishedAt': '2026-11-26T22:01:00Z'}, 'contentDetails': {'videoId': 'acW4P7woNqA', 'videoPublishedAt': '2026-11-26T22:00:30Z'}},
        {'snippet': {'title': 'H.E.L.I.X. Visual guide · how to read the pictures'}, 'contentDetails': {'videoId': 'SdeVk8D2qE8', 'videoPublishedAt': '2026-11-26T11:03:00Z'}},
        {'snippet': {'title': 'Holiday clip'}, 'contentDetails': {'videoId': 'zzzzzzzzzzz', 'videoPublishedAt': '2026-11-26T11:03:00Z'}},
        {'snippet': {'title': 'HELIX something'}, 'contentDetails': {'videoId': 'yyyyyyyyyyy', 'videoPublishedAt': '2026-11-26T11:03:00Z'}},
    ]
    yt = bm.playlist_rows(items)
    assert [(r['videoId'], r['part']) for r in yt] == [('acW4P7woNqA', 'evening'), ('SdeVk8D2qE8', 'guide')], 'only H.E.L.I.X. titles with a programme'
    rows, _ = bm.parse_run_log(LOG)
    m = bm.merge(rows, yt)
    by = {r['videoId']: r for r in m}
    assert by['SdeVk8D2qE8']['title'] == 'H.E.L.I.X. Visual guide · how to read the pictures' and by['SdeVk8D2qE8']['at'].startswith('2026-11-26T11:02'), 'YouTube names it; the log keeps its time'
    assert 'acW4P7woNqA' in by and [r['at'] for r in m] == sorted(r['at'] for r in m)
    assert by['TuIKKm8ZgRk']['title'].endswith('Sat 28 Nov'), 'a real logged title is not replaced'
    p = bm.payload(m)
    assert all(set(r) <= {'videoId', 'title', 'part', 'at', 'seconds', 'format'} for r in p) and all('_generated' not in r for r in p)
    assert [len(c) for c in bm.chunks(list(range(250)))] == [100, 100, 50]


def test_dry_run_prints_and_sends_nothing():
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / 'run.log'
        f.write_text(LOG, encoding='utf-8')
        calls = []
        real = hn.call
        hn.call = lambda *a, **k: calls.append(a) or {'ok': True}
        try:
            out = io.StringIO()
            with redirect_stdout(out):
                assert bm.main(['--dry-run', '--log', str(f)]) == 0
        finally:
            hn.call = real
        txt = out.getvalue()
        assert calls == [] and '6 videos' in txt and '[dry run] would POST 6 rows' in txt and 'nothing sent' in txt, txt


def test_send_goes_through_helix_notify_with_the_push_secret():
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / 'run.log'
        f.write_text(LOG, encoding='utf-8')
        seen = []

        def opener(req, timeout):
            seen.append((req.full_url, req.get_header('X-auth-token'), json.loads(req.data)))
            return io.BytesIO(b'{"ok":true,"added":6,"rejected":[]}')
        os.environ['KV_WRITE_SECRET'] = 'sek'
        real = hn.call
        hn.call = lambda base, path, **k: real(base, path, opener=opener, sleep=lambda s: None, log=lambda m: None, **k)
        try:
            with redirect_stdout(io.StringIO()):
                assert bm.main(['--log', str(f), '--base', 'https://h']) == 0
        finally:
            hn.call = real
            del os.environ['KV_WRITE_SECRET']
        assert len(seen) == 1 and seen[0][0] == 'https://h/api/helix/broadcasts/backfill' and seen[0][1] == 'sek' and len(seen[0][2]['items']) == 6

        def refused(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 403, 'no', {}, io.BytesIO(b'{"ok":false,"error":"Owner only"}'))
        hn.call = lambda base, path, **k: real(base, path, opener=refused, sleep=lambda s: None, log=lambda m: None, **k)
        try:
            with redirect_stdout(io.StringIO()):
                assert bm.main(['--log', str(f), '--base', 'https://h']) == 1
        finally:
            hn.call = real


if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_') and callable(fn):
            fn()
            print('ok', name)
