"""python scripts/run_py_tests.py  (or: python -m pytest jarvis_broadcast/test_helix_extras.py). The Helix additions: window guard, voiced check, YouTube text, loudness,
freeze/black, the Short, the desk-run launcher, the retry queue, the server notify (fake network) and the special launcher's choice. No browser, no network, no ffmpeg."""
import io
import json
import os
import sys
import urllib.error
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import broadcast_core as bc  # noqa: E402
import helix_notify as hn  # noqa: E402
import special_check as sc  # noqa: E402


def test_window_guard_skips_late_and_missed_runs():
    assert bc.resolve_part(datetime(2026, 11, 27, 7, 2)) == ('morning', None)
    assert bc.resolve_part(datetime(2026, 11, 27, 21, 3)) == ('evening', None)
    part, why = bc.resolve_part(datetime(2026, 11, 27, 13, 5))
    assert part is None and 'afternoon' in why, 'a 07:00 run starting at 13:05 is not an afternoon briefing'
    part, why = bc.resolve_part(datetime(2026, 11, 28, 7, 0), 'evening')
    assert part is None and 'outside its window' in why, 'a missed 21:00 run fired next morning is skipped'
    assert bc.resolve_part(datetime(2026, 11, 28, 7, 0), 'evening', force=True) == ('evening', None)
    assert bc.resolve_part(datetime(2026, 11, 27, 22, 0), 'weekly') == ('weekly', None)
    assert bc.resolve_part(datetime(2026, 11, 26, 22, 0), 'weekly')[0] is None, 'the weekly is Fridays only'
    assert bc.resolve_part(datetime(2026, 12, 4, 14, 5), 'special') == ('special', None)
    assert bc.resolve_part(datetime(2026, 12, 4, 6, 30))[0] is None, 'before 06:45 is not the morning briefing'


def test_voiced_check_refuses_any_silent_line():
    assert bc.voiced_problem({}) is None, 'an old page without counts passes'
    assert bc.voiced_problem({'lines': 30, 'voiced': 30}) is None
    why = bc.voiced_problem({'lines': 30, 'voiced': 29, 'script': [{'text': 'ok', 'voiced': True}, {'text': 'The yen slipped.', 'voiced': False}]})
    assert '29 of 30' in why and 'The yen slipped.' in why
    assert 'no lines' in bc.voiced_problem({'lines': 0, 'voiced': 0})


def test_title_carries_the_headline_and_fits():
    d = date(2026, 11, 27)
    assert bc.title_for(d) == 'H.E.L.I.X. Morning Briefing · Fri 27 Nov 2026 #Shorts', 'unchanged without a headline'
    t = bc.title_for(d, 'morning', 'Gold runs 2.4 times its usual move.')
    assert t == 'H.E.L.I.X. Morning · Gold runs 2.4 times its usual move · Fri 27 Nov #Shorts'
    long = bc.title_for(d, 'evening', 'word ' * 60)
    assert len(long) <= 100 and long.endswith(' · Fri 27 Nov #Shorts') and '…' in long
    assert bc.title_for(d, 'weekly').startswith('H.E.L.I.X. Weekly Recap · ')
    assert bc.title_for(d, 'special', 'USD Non-Farm Employment Change').startswith('H.E.L.I.X. Release Special · USD Non-Farm')


def test_description_has_chapters_and_no_meta_line():
    d = date(2026, 11, 27)
    ch = bc.chapters_text([{'t': 0.4, 'kind': 'open'}, {'t': 8, 'kind': 'headline'}, {'t': 15, 'kind': 'lead'}, {'t': 22, 'kind': 'lead'}, {'t': 40, 'kind': 'bumper', 'title': 'Markets'},
                           {'t': 45, 'kind': 'scene'}, {'t': 80, 'kind': 'bumper', 'title': 'The Chain'}, {'t': 130, 'kind': 'close'}], 140, open_title='Morning Briefing')
    assert ch.split('\n') == ['0:00 Morning Briefing', '0:15 The Lead', '0:40 Markets', '1:20 The Chain', '2:10 Sign-off'], ch
    assert bc.chapters_text([{'t': 0, 'kind': 'open'}, {'t': 30, 'kind': 'close'}], 40) == '', 'YouTube needs three'
    desc = bc.description_for(d, 'server voice', 131.4, 'evening', chapters=ch, headline='Gold ran')
    assert '0:40 Markets' in desc and 'The headline: Gold ran' in desc and 'voice:' not in desc and 'Not a forecast' in desc
    assert 'weekly recap' in bc.description_for(d, part='weekly') and 'release special' in bc.description_for(d, part='special', release='CPI')
    assert bc.clock(3725) == '1:02:05'


def test_srt_from_the_script():
    s = bc.srt_text([{'a': 1.0, 'b': 5.0, 'text': 'Good morning. This is Helix, with the morning briefing for Friday the twenty-seventh of November and more words here.'}, {'a': 6, 'b': 6, 'text': 'skip'}], max_words=8)
    cues = s.strip().split('\n\n')
    assert cues[0].startswith('1\n00:00:01,000 --> ') and 'Good morning.' in cues[0]
    assert len(cues) == 4 and cues[-1].split('\n')[1].endswith('--> 00:00:05,000')
    assert all(len(c.split('\n')[2].split()) <= 8 for c in cues)


def test_tags_from_the_markets_named():
    t = bc.tags_for(['GOLD', 'NQ', 'EURUSD', 'GOLD', 'bad key!'], 'morning')
    assert t[:4] == ['HELIX', 'macro', 'markets', 'morning briefing'] and 'gold' in t and 'Nasdaq' in t and 'EURUSD' in t and t.count('gold') == 1
    assert bc.tags_for([], 'special', short=True)[-1] == 'Shorts'


def test_loudnorm_passes():
    err = 'blah\n[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-27.61",\n\t"input_tp" : "-4.47",\n\t"input_lra" : "18.06",\n\t"input_thresh" : "-39.20",\n\t"target_offset" : "0.58"\n}\n'
    m = bc.loudnorm_measured(err)
    assert m['input_i'] == '-27.61'
    f = bc.loudnorm_second(m)
    assert 'measured_I=-27.61' in f and 'linear=true' in f and 'I=-14.0' in f and 'TP=-1.0' in f
    assert bc.loudnorm_measured('no json') is None and bc.loudnorm_second(None).startswith('loudnorm=I=-14.0')
    assert bc.loudnorm_measured('{"input_i" : "-inf", "input_tp" : "-inf", "input_lra" : "0", "input_thresh" : "-70"}') is None, 'silence measures -inf: one pass instead'


def test_freeze_and_black_detection():
    assert bc.detect_problem('', 120) is None
    assert 'froze for 25 s' in bc.detect_problem('lavfi.freezedetect.freeze_duration: 25.0', 120)
    assert bc.detect_problem('lavfi.freezedetect.freeze_duration: 9.0', 120) is None
    assert 'black' in bc.detect_problem('black_start:0 black_end:20 black_duration:20\nblack_duration:15', 120)
    assert bc.detect_problem('black_duration:4', 120) is None


def test_short_window():
    marks = [{'t': 0, 'kind': 'open'}, {'t': 30, 'kind': 'bumper'}, {'t': 52, 'kind': 'bumper'}, {'t': 70, 'kind': 'bumper'}]
    assert bc.short_window(marks, 300) == (0.0, 52.0), 'ends at the first bumper in 45-60 s'
    assert bc.short_window([{'t': 70, 'kind': 'bumper'}], 300) == (0.0, 60.0)
    assert bc.short_window([], 50) == (0.0, 50.0) and bc.short_window([], 40) is None


def test_desk_run_launcher_state():
    log = ('2026-11-27 06:30:01  waiting for the OI pull (x)\n2026-11-27 06:52:10  OI pull: finished with exit code 0\n')
    assert bc.desk_run_state(log, '2026-11-27') == 'pending'
    assert bc.desk_run_state(log + '2026-11-27 06:52:40  started: HTTP 202 {}\n', '2026-11-27') == 'done'
    assert bc.desk_run_state(log + '2026-11-27 06:52:40  not started: a desk run for today already exists\n', '2026-11-27') == 'done'
    assert bc.desk_run_state(log, '2026-11-28') == 'none'


def test_upload_queue_backs_off_and_gives_up():
    q = bc.queue_push([], {'dir': 'a', 'part': 'morning'}, 100)
    assert bc.queue_due(q, 100) == q
    q = bc.queue_after_fail(q, q[0], 100)
    assert q[0]['tries'] == 1 and q[0]['next_at'] == 1000 and not bc.queue_due(q, 999)
    e = q[0]
    for _ in range(bc.QUEUE_MAX_TRIES):
        q = bc.queue_after_fail(q, e, 0)
        e = q[0] if q else e
    assert q == [], 'dropped after the last try'
    assert bc.queue_done(bc.queue_push([], {'dir': 'b'}, 0), {'dir': 'b'}) == []
    assert bc.podcast_id(date(2026, 12, 4), 'special', '2026-12-04|USD|13:30') == '2026-12-04-special-2026-12-04-usd-13-30'


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_notify_retries_never_raises_and_sends_the_secret():
    calls, sleeps = [], []
    os.environ['KV_WRITE_SECRET'] = 'sekret'

    def flaky(req, timeout):
        calls.append(req)
        if len(calls) < 3:
            raise urllib.error.URLError('down')
        return _Resp(json.dumps({'ok': True, 'sent': True}).encode())
    try:
        ok = hn.notify_published('https://h', 'abcDEF12345', 'T', 'morning', 200, opener=flaky, sleep=sleeps.append, log=lambda m: None)
        assert ok and len(calls) == 3 and sleeps == [2, 4]
        req = calls[-1]
        assert req.full_url == 'https://h/api/helix/broadcast-published' and req.get_header('X-auth-token') == 'sekret'
        assert json.loads(req.data)['videoId'] == 'abcDEF12345'

        def dead(req, timeout):
            raise OSError('no network')
        assert hn.notify_failed('https://h', 'evening', 'boom', opener=dead, sleep=lambda s: None, log=lambda m: None) is False, 'a dead network is logged, never raised'

        def refused(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 401, 'no', {}, io.BytesIO(b'{"ok":false,"error":"X-Auth-Token required"}'))
        n = []
        assert hn.notify_published('https://h', 'abcDEF12345', 'T', 'morning', opener=lambda r, t: (n.append(1), refused(r, t))[1], sleep=lambda s: None, log=lambda m: None) is False
        assert len(n) == 1, 'a 4xx is not retried'
    finally:
        del os.environ['KV_WRITE_SECRET']


def test_special_launcher_picks_once_per_release():
    due = [{'key': 'k1', 'ccy': 'USD', 'ms': 1764855000000, 'name': 'Non-Farm Employment Change'}, {'key': 'k2', 'ccy': 'CAD', 'ms': 1764855000000, 'name': 'Unemployment Rate'}]
    assert sc.pick_special(due, {})['key'] == 'k1'
    assert sc.pick_special(due, {'k1': {'ok': True}})['key'] == 'k2'
    assert sc.pick_special(due, {'k1': {'tries': 2}, 'k2': {'tries': 2}}) is None, 'two failed tries and it stops'
    args = sc.release_args(due[0])
    assert args[:4] == ['--part', 'special', '--release-key', 'k1'] and '--wait-busy' in args and args[args.index('--release-ccy') + 1] == 'USD'
