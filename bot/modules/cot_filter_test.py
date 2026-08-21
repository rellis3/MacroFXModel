"""Offline tests for the DF-01 COT filter (no network).

Run:  python3 bot/modules/cot_filter_test.py
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_BOT_DIR = Path(__file__).resolve().parents[1]
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from modules.base import ModuleResult                         # noqa: E402
from modules.cot_filter import COTFilterModule, STALE_DAYS    # noqa: E402


def _state(cot: dict | None) -> dict:
    return {'regime_snapshot': {'pairs': {'EUR/USD': {'cot': cot} if cot is not None else {}}}}


def _ctx(direction: str | None) -> dict:
    if direction is None:
        return {}
    return {'confluence': ModuleResult(passed=True, signal=direction, score=0.7,
                                       confidence='HIGH', reason='stub')}


def _fresh_date(days_old: int = 3) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_old)).strftime('%Y-%m-%d')


MOD = COTFilterModule()


def test_no_cot_data_skips_neutral():
    r = MOD.evaluate(_state(None), 'EUR/USD', {}, {})
    assert r.passed and r.signal == 'NEUTRAL' and r.score == 0.5


def test_stale_report_stands_down_with_warning():
    cot = {'levNet': 50000, 'specPct': 99.0, 'reportDate': _fresh_date(STALE_DAYS + 5)}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert r.passed and r.signal == 'NEUTRAL'
    assert 'stale' in r.reason.lower()
    assert r.metadata['report_age_days'] > STALE_DAYS


def test_missing_report_date_stands_down():
    cot = {'levNet': 50000, 'specPct': 99.0}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert r.passed and r.signal == 'NEUTRAL'
    assert 'date' in r.reason.lower()


def test_legacy_changedate_format_parses():
    raw = (datetime.now(timezone.utc) - timedelta(days=4)).strftime('%B %d, %Y')
    cot = {'levNet': 1000, 'specPct': 50.0, 'changeDate': raw}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, {})
    assert 'stale' not in r.reason.lower() and 'missing' not in r.reason.lower()
    assert r.metadata['report_age_days'] <= 5


def test_non_extreme_is_neutral_no_vote():
    # Old module would have voted LONG on positive levNet + rising change.
    cot = {'levNet': 40000, 'levNetChg': 5000, 'specPct': 55.0,
           'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert r.passed and r.signal == 'NEUTRAL' and r.score == 0.5


def test_extreme_same_direction_entry_vetoed():
    # Crowd stretched long (>90th pct) and the entry is LONG → caution veto.
    cot = {'levNet': 90000, 'specPct': 95.0, 'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert not r.passed
    assert 'EXTREME' in r.reason and 'crowded' in r.reason.lower()
    # NEUTRAL, never a hard BLOCK — other modules keep their say.
    assert r.signal == 'NEUTRAL'


def test_extreme_contrarian_entry_supported():
    # Crowd stretched long, entry SHORT (fading the crowd) → pass with bump.
    cot = {'levNet': 90000, 'specPct': 95.0, 'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('SHORT'))
    assert r.passed and r.score > 0.5 and r.signal == 'NEUTRAL'


def test_extreme_low_percentile_blocks_short():
    cot = {'levNet': -90000, 'specPct': 4.0, 'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('SHORT'))
    assert not r.passed
    r2 = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert r2.passed and r2.score > 0.5


def test_zscore_fallback_when_percentile_missing():
    cot = {'levNet': 90000, 'specZ': 2.5, 'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert not r.passed and 'z=' in r.reason


def test_no_history_fields_stands_down_documented():
    # Legacy snapshot shape (raw parseCFTCFile) has neither specPct nor specZ —
    # the DF-01 recipe is not computable; the module must say so, not fake it.
    cot = {'levNet': 90000, 'levNetChg': 10000,
           'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert r.passed and r.signal == 'NEUTRAL' and 'not computable' in r.reason


def test_oi_normalised_percentile_preferred_over_raw():
    # DF-01 step 2: rank the net as a SHARE of open interest. When both are
    # present the share read must win — here raw says "extreme long" (95th) but
    # the OI-normalised read says middling (50th), so the entry must NOT be
    # vetoed. This is the §4.3 defect in one assertion.
    cot = {'levNet': 90000, 'specPct': 95.0, 'specZ': 2.5,
           'specSharePct': 50.0, 'specShareZ': 0.1, 'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert r.passed and r.signal == 'NEUTRAL', r.reason
    assert r.metadata['oi_basis'] == 'OI-normalised'
    assert r.metadata['spec_pct'] == 50.0


def test_oi_normalised_extreme_vetoes_when_raw_is_calm():
    # The mirror case: raw looks calm (50th) but as a share of OI the crowd is
    # stretched long (95th) — the veto must fire on the share read.
    cot = {'levNet': 90000, 'specPct': 50.0, 'specSharePct': 95.0,
           'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert not r.passed, r.reason
    assert r.metadata['oi_basis'] == 'OI-normalised'


def test_falls_back_to_raw_when_share_absent():
    # Legacy/extremes-without-history snapshots carry no share fields; the module
    # must still work off the raw rank rather than going dark, and must SAY which
    # basis it used so a reader can tell the two apart.
    cot = {'levNet': 90000, 'specPct': 95.0, 'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert not r.passed
    assert r.metadata['oi_basis'] == 'raw net'


def test_share_zscore_fallback_when_share_percentile_missing():
    # Short history nulls the percentile but not the z — share z still preferred.
    cot = {'levNet': 90000, 'specZ': 0.2, 'specShareZ': 2.5,
           'reportDate': _fresh_date()}
    r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx('LONG'))
    assert not r.passed and 'z=' in r.reason
    assert r.metadata['oi_basis'] == 'OI-normalised'


def test_never_votes_directionally():
    # DF-01: positioning is never confirmation — the signal must be NEUTRAL in
    # every branch so cot_filter can never count toward min_agree.
    cases = [
        ({'levNet': 90000, 'specPct': 95.0, 'reportDate': _fresh_date()}, 'LONG'),
        ({'levNet': 90000, 'specPct': 95.0, 'reportDate': _fresh_date()}, 'SHORT'),
        ({'levNet': 500, 'specPct': 50.0, 'reportDate': _fresh_date()}, 'LONG'),
        ({'levNet': 500, 'specPct': 99.0, 'reportDate': _fresh_date(30)}, 'LONG'),
        ({'levNet': 500}, 'LONG'),
    ]
    for cot, d in cases:
        r = MOD.evaluate(_state(cot), 'EUR/USD', {}, _ctx(d))
        assert r.signal == 'NEUTRAL', (cot, d, r.signal)


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for t in tests:
        t(); print(f'  ok  {t.__name__}')
    print(f'\n{len(tests)} tests passed.')
