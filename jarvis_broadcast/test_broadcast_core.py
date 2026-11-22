"""python -m pytest jarvis_broadcast/test_broadcast_core.py  (or: python scripts/run_py_tests.py)"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from broadcast_core import concat_list, max_volume, is_silent, title_for, description_for, short_warning  # noqa: E402


def test_concat_holds_each_frame_until_the_next_and_cuts_to_the_window():
    frames = [('c.jpg', 12.0), ('a.jpg', 9.0), ('b.jpg', 10.5), ('d.jpg', 30.0)]
    text, total = concat_list(frames, t_start=10.0, t_end=13.0)
    lines = text.strip().split('\n')
    assert lines[0] == 'ffconcat version 1.0'
    # a.jpg was on screen at the start (10.0), b from 10.5, c from 12.0 to the end (13.0); d is after the end
    assert lines[1:7] == ["file 'a.jpg'", 'duration 0.500000', "file 'b.jpg'", 'duration 1.500000', "file 'c.jpg'", 'duration 1.000000']
    assert lines[-1] == "file 'c.jpg'"
    assert abs(total - 3.0) < 1e-9


def test_concat_without_an_earlier_frame_starts_at_the_first_frame_in_the_window():
    text, total = concat_list([('x.jpg', 11.0), ('y.jpg', 12.0)], 10.0, 12.5)
    assert "file 'x.jpg'" in text and abs(total - 1.5) < 1e-9


def test_concat_rejects_an_empty_window_and_a_bad_range():
    for args in (([('x.jpg', 20.0)], 10.0, 12.0), ([], 1.0, 2.0), ([('x.jpg', 1.0)], 5.0, 5.0)):
        try:
            concat_list(*args)
        except ValueError:
            continue
        raise AssertionError(f'expected ValueError for {args}')


def test_concat_never_writes_a_zero_duration():
    text, _ = concat_list([('a.jpg', 10.0), ('b.jpg', 10.0), ('c.jpg', 10.2)], 10.0, 10.4)
    assert 'duration 0.000000' not in text


def test_max_volume_and_silence():
    err = '[Parsed_volumedetect_0 @ 0x1] mean_volume: -24.1 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -3.2 dB\n'
    assert max_volume(err) == -3.2 and not is_silent(-3.2)
    assert max_volume('max_volume: -inf dB') == float('-inf') and is_silent(float('-inf'))
    assert max_volume('nothing here') is None and is_silent(None)
    assert is_silent(-60.0)


def test_titles_and_text_say_description_only():
    d = date(2026, 11, 23)
    t = title_for(d)
    assert t == 'M.A.C.H. Morning Briefing · Mon 23 Nov 2026 #Shorts' and len(t) <= 100
    desc = description_for(d, voice='server voice', seconds=131.4)
    assert 'Not a forecast' in desc and '131 s' in desc and '#Shorts' in desc
    assert 'will' not in desc.lower().split('narrated')[0]


def test_short_warning():
    assert short_warning(150) is None
    assert 'Shorts limit' in short_warning(200)
