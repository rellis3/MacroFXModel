"""Offline tests for the DST-correct session windows (no network).

Run:  python3 bot/utils/config_helpers_test.py
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

_BOT_DIR = Path(__file__).resolve().parents[1]
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from utils import config_helpers as ch                        # noqa: E402
from utils.config_helpers import (session_threshold_mult,     # noqa: E402
                                  _london_offset_hours, _ny_offset_hours)


def _utc(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


def test_london_offset_jan_vs_jul():
    assert _london_offset_hours(_utc(2026, 1, 15, 8)) == 0    # GMT
    assert _london_offset_hours(_utc(2026, 7, 15, 8)) == 1    # BST


def test_ny_offset_jan_vs_jul():
    assert _ny_offset_hours(_utc(2026, 1, 15, 14)) == -5      # EST
    assert _ny_offset_hours(_utc(2026, 7, 15, 14)) == -4      # EDT


def test_manual_fallback_rule_matches_tz():
    # The last-Sunday-March/October + 2nd-Sun-Mar/1st-Sun-Nov manual rules must
    # agree with zoneinfo (when available) on plain mid-season dates.
    saved_lon, saved_ny = ch._LONDON_TZ, ch._NY_TZ
    try:
        ch._LONDON_TZ = ch._NY_TZ = None                       # force manual rule
        assert _london_offset_hours(_utc(2026, 1, 15, 8)) == 0
        assert _london_offset_hours(_utc(2026, 7, 15, 8)) == 1
        assert _london_offset_hours(_utc(2026, 3, 29, 2)) == 1   # after 01:00 UTC last Sun Mar
        assert _london_offset_hours(_utc(2026, 3, 29, 0)) == 0   # before switch
        assert _ny_offset_hours(_utc(2026, 1, 15, 14)) == -5
        assert _ny_offset_hours(_utc(2026, 7, 15, 14)) == -4
    finally:
        ch._LONDON_TZ, ch._NY_TZ = saved_lon, saved_ny


def test_london_open_window_winter():
    # Winter: London 07-09 local == 07-09 UTC.
    assert session_threshold_mult(_utc(2026, 1, 15, 7, 30)) == 0.90
    assert session_threshold_mult(_utc(2026, 1, 15, 6, 30)) != 0.90


def test_london_open_window_summer_shifts_one_hour():
    # Summer (BST): London 07-09 local == 06-08 UTC. The old fixed-UTC code
    # returned 0.90 at 07-09 UTC year-round — 08:30 UTC is 09:30 London in
    # July, AFTER the open window.
    assert session_threshold_mult(_utc(2026, 7, 15, 6, 30)) == 0.90
    assert session_threshold_mult(_utc(2026, 7, 15, 8, 30)) != 0.90


def test_ny_open_window():
    # Winter: NY 08-10 local == 13-15 UTC; summer == 12-14 UTC.
    assert session_threshold_mult(_utc(2026, 1, 15, 13, 30)) == 0.90
    assert session_threshold_mult(_utc(2026, 7, 15, 12, 30)) == 0.90
    assert session_threshold_mult(_utc(2026, 7, 15, 14, 30)) != 0.90


def test_asian_session_tightens():
    assert session_threshold_mult(_utc(2026, 1, 15, 23, 0)) == 1.15
    # 22:30 London in July is 21:30 UTC.
    assert session_threshold_mult(_utc(2026, 7, 15, 21, 30)) == 1.15
    assert session_threshold_mult(_utc(2026, 1, 15, 11, 0)) == 1.0


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for t in tests:
        t(); print(f'  ok  {t.__name__}')
    print(f'\n{len(tests)} tests passed.')
