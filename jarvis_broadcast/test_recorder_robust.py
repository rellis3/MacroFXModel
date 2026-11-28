"""python scripts/run_py_tests.py. Recorder robustness (28 Nov 2026): the busy-machine wait, the page-load retry, the run keeping its START date, one SSL helper for every
urllib call, and the failure note at every stage including pre-flight. No browser, no network, no ffmpeg."""
import glob
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import broadcast_core as bc  # noqa: E402
import helix_notify as hn  # noqa: E402
import record_broadcast as rb  # noqa: E402

HERE = Path(__file__).resolve().parent


def test_machine_busy_and_backoff():
    assert bc.machine_busy(8000, 30) is None
    assert 'RAM' in bc.machine_busy(900, 30) and 'CPU' in bc.machine_busy(8000, 97)
    assert ' and ' in bc.machine_busy(500, 99)
    assert bc.machine_busy(None, None) is None, 'an unreadable machine never blocks the run'
    assert [bc.backoff_s(i) for i in (1, 2, 3, 4, 5)] == [20, 40, 80, 120, 120]


def test_page_load_errors_are_retried_but_a_logout_or_voice_gap_is_not():
    assert bc.is_page_load_error('Timeout 60000ms exceeded. Page.wait_for_function')
    assert bc.is_page_load_error(RuntimeError('net::ERR_CONNECTION_RESET at https://x'))
    assert not bc.is_page_load_error('the saved browser profile is logged out: run --login')
    assert not bc.is_page_load_error('VOICE_GAP line 3')
    assert not bc.is_page_load_error('the virtual clock did not load (vclock.js)')


def test_open_broadcast_retry_backs_off_then_succeeds_or_raises():
    calls, sleeps, waits = [], [], []

    def flaky(ctx, base):
        calls.append(base)
        if len(calls) < 3:
            raise TimeoutError('Timeout 60000ms exceeded while waiting for wait_for_function')
        return 'PAGE'
    assert rb.open_broadcast_retry(None, 'https://h', tries=4, sleep=sleeps.append, opener=flaky, machine=lambda: waits.append(1)) == 'PAGE'
    assert len(calls) == 3 and sleeps == [20, 40] and len(waits) == 2

    def always(ctx, base):
        raise TimeoutError('Timeout exceeded')
    try:
        rb.open_broadcast_retry(None, 'https://h', tries=2, sleep=lambda s: None, opener=always, machine=lambda: None)
        assert False, 'should raise after the last try'
    except TimeoutError:
        pass
    n = []

    def logged_out(ctx, base):
        n.append(1)
        raise RuntimeError('the saved browser profile is logged out')
    try:
        rb.open_broadcast_retry(None, 'https://h', tries=4, sleep=lambda s: None, opener=logged_out, machine=lambda: None)
    except RuntimeError:
        pass
    assert len(n) == 1, 'a logged-out profile is not retried'


def test_wait_machine_is_bounded_and_never_blocks_a_quiet_machine():
    t = {'now': 0.0}
    readings = iter([(500, 99), (600, 98), (9000, 20)])
    assert rb.wait_machine(limit_s=600, every_s=30, reader=lambda: next(readings), sleep=lambda s: t.__setitem__('now', t['now'] + s), clock=lambda: t['now']) is None
    assert t['now'] == 60
    t['now'] = 0.0
    why = rb.wait_machine(limit_s=90, every_s=30, reader=lambda: (400, 99), sleep=lambda s: t.__setitem__('now', t['now'] + s), clock=lambda: t['now'])
    assert why and t['now'] == 90, 'still busy at the limit: it records anyway'


def test_a_late_run_keeps_its_start_date(tmp_path):
    mp4 = tmp_path / 'jarvis-evening-2026-11-27.mp4'
    mp4.write_bytes(b'')
    cap = {'seconds': 200, 'voice': 'server', 'log': {'headline': 'Gold runs 2.4 times its usual move', 'marks': [], 'script': []}}
    meta = rb.build_meta(cap, mp4, 'evening', 'wide', None, None, started=datetime(2026, 11, 27, 23, 26))
    assert meta['date'] == '2026-11-27' and 'Fri 27 Nov' in meta['title'], meta['title']
    assert bc.podcast_id(datetime.fromisoformat(meta['date']).date(), 'evening') == '2026-11-27-evening'


def test_every_urllib_call_goes_through_the_one_ssl_helper():
    assert hn.urlopen is hn._open and callable(hn.ssl_context)
    for f in glob.glob(str(HERE / '*.py')):
        if Path(f).name in ('helix_notify.py',) or Path(f).name.startswith('test_'):
            continue
        src = Path(f).read_text(encoding='utf-8')
        assert not re.search(r'urllib\.request\.urlopen|from urllib\.request import[^\n]*urlopen|requests\.(get|post)\(', src), f'{Path(f).name}: open URLs with helix_notify.urlopen (certifi)'


def test_a_preflight_failure_still_sends_the_failure_note(tmp_path, monkeypatch=None):
    sent = []
    saved = (rb.preflight, rb.helix_notify.notify_failed, rb.keep_awake, sys.argv)
    try:
        def boom(a, out_dir):
            raise RuntimeError('ffmpeg not found')
        rb.preflight = boom
        rb.helix_notify.notify_failed = lambda base, part, err, **kw: sent.append((part, err)) or True
        rb.keep_awake = lambda on: None
        sys.argv = ['record_broadcast.py', '--part', 'evening', '--force', '--out', str(tmp_path), '--base', 'https://h']
        try:
            rb.main()
            assert False, 'main should exit 1'
        except SystemExit as e:
            assert e.code == 1
        assert sent and sent[0][0] == 'evening' and sent[0][1].startswith('pre-flight: ffmpeg not found'), sent
        lr = json.loads((tmp_path / 'last_run.json').read_text(encoding='utf-8'))
        assert lr['ok'] is False and lr['stage'] == 'pre-flight' and lr['started']
    finally:
        rb.preflight, rb.helix_notify.notify_failed, rb.keep_awake, sys.argv = saved


def test_the_short_never_uploads_captions():
    src = (HERE / 'record_broadcast.py').read_text(encoding='utf-8')
    i = src.index("if fmt == 'short':")
    assert i < src.index('yu.upload_captions(vid'), 'the Short skips captions.insert (400 quota units)'


def test_every_laptop_push_to_the_server_can_carry_the_push_secret():
    """PUSH-SECRET READINESS: a laptop script that POSTs to the desk server sends X-Auth-Token when KV_WRITE_SECRET or push_secret.txt is present (unchanged without)."""
    root = HERE.parent
    for d in ('scripts', 'oi_bot', 'oi_vol_bot', 'SignalCopier'):
        for f in (root / d).rglob('*.py'):
            src = f.read_text(encoding='utf-8', errors='replace')
            if '/api/' in src and re.search(r"method=['\"]POST['\"]", src):
                assert '_push_auth(' in src or 'X-Auth-Token' in src, f'{f.relative_to(root)}: POSTs to the server without the push-secret header'
