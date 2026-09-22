"""Offline tests for verify_motif_live_vs_backtest.py's pure logic -- the
matching/comparison functions, which need no MT5 terminal or network.

Run:  python scripts/verify_motif_live_vs_backtest_test.py   (or pytest)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, for pylego.*
sys.path.insert(0, str(Path(__file__).resolve().parent))         # this dir, for the module itself

from verify_motif_live_vs_backtest import (  # noqa: E402
    _norm_pair, compare_to_backtest, match_trade_to_motif_key,
)


def _live(symbol='EURUSD', direction='BUY', time_open=1_800_000_000.0,
         reason=None, profit=0.0):
    return {'symbol': symbol, 'direction': direction, 'time_open': time_open,
           'reason': reason, 'profit': profit, 'position_id': 1,
           'open_price': 1.1, 'time_close': None, 'close_price': None}


def _entered(pair='eurusd', t=1_800_000_000.0, motif_key='eurusd:top:1-2'):
    return {'pair': pair, 't': t, 'motif_key': motif_key, 'status': 'entered'}


# ── _norm_pair -- gold is the case a naive suffix-strip gets wrong ─────────

def test_norm_pair_resolves_gold_symbol_to_gold_key():
    assert _norm_pair('XAUUSD') == 'gold'


def test_norm_pair_lowercases_a_plain_fx_symbol():
    assert _norm_pair('EURUSD') == 'eurusd'


def test_norm_pair_falls_back_to_lowercase_for_unknown_symbol():
    assert _norm_pair('SOMETHING_WEIRD') == 'something_weird'


# ── match_trade_to_motif_key ────────────────────────────────────────────────

def test_matches_same_pair_within_tolerance():
    lt = _live(time_open=1000.0)
    events = [_entered(t=1000.0 + 30, motif_key='eurusd:top:1-2')]
    assert match_trade_to_motif_key(lt, events) == 'eurusd:top:1-2'


def test_no_match_outside_tolerance():
    lt = _live(time_open=1000.0)
    events = [_entered(t=1000.0 + 700, motif_key='eurusd:top:1-2')]
    assert match_trade_to_motif_key(lt, events, tolerance_sec=600) is None


def test_no_match_different_pair():
    lt = _live(symbol='GBPUSD', time_open=1000.0)
    events = [_entered(pair='eurusd', t=1000.0, motif_key='eurusd:top:1-2')]
    assert match_trade_to_motif_key(lt, events) is None


def test_picks_the_closest_of_several_candidates():
    lt = _live(time_open=1000.0)
    events = [
        _entered(t=1000.0 + 500, motif_key='far'),
        _entered(t=1000.0 + 10, motif_key='near'),
    ]
    assert match_trade_to_motif_key(lt, events) == 'near'


def test_gold_symbol_matches_gold_pair_in_decision_log():
    lt = _live(symbol='XAUUSD', time_open=1000.0)
    events = [_entered(pair='gold', t=1000.0, motif_key='gold:top:1-2')]
    assert match_trade_to_motif_key(lt, events) == 'gold:top:1-2'


# ── compare_to_backtest ─────────────────────────────────────────────────────

def test_unmatched_when_no_motif_key():
    v = compare_to_backtest(_live(), None, {})
    assert v['verdict'] == 'UNMATCHED'


def test_divergence_when_motif_key_missing_from_backtest_log():
    v = compare_to_backtest(_live(), 'eurusd:top:1-2', {})
    assert v['verdict'] == 'DIVERGENCE'
    assert 'not found' in v['detail']


def test_divergence_on_direction_mismatch():
    bt = {'eurusd:top:1-2': {'direction': 'SELL', 'status': 'open'}}
    v = compare_to_backtest(_live(direction='BUY'), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'DIVERGENCE'
    assert 'direction mismatch' in v['detail']


def test_match_both_still_open():
    bt = {'eurusd:top:1-2': {'direction': 'BUY', 'status': 'open'}}
    v = compare_to_backtest(_live(direction='BUY', reason=None), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'MATCH'


def test_unresolved_when_live_closed_but_backtest_still_open():
    bt = {'eurusd:top:1-2': {'direction': 'BUY', 'status': 'open'}}
    v = compare_to_backtest(_live(direction='BUY', reason='tp'), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'UNRESOLVED'


def test_match_both_tp():
    bt = {'eurusd:top:1-2': {'direction': 'BUY', 'status': 'tp', 'r': 1.46}}
    v = compare_to_backtest(_live(direction='BUY', reason='tp', profit=145.0), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'MATCH'


def test_match_both_sl():
    bt = {'eurusd:top:1-2': {'direction': 'BUY', 'status': 'sl', 'r': -1.04}}
    v = compare_to_backtest(_live(direction='BUY', reason='sl', profit=-104.0), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'MATCH'


def test_divergence_when_live_tp_but_backtest_sl():
    """The exact failure mode this script exists to catch."""
    bt = {'eurusd:top:1-2': {'direction': 'BUY', 'status': 'sl', 'r': -1.04}}
    v = compare_to_backtest(_live(direction='BUY', reason='tp', profit=145.0), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'DIVERGENCE'
    assert 'outcome mismatch' in v['detail']


def test_divergence_when_live_closed_manually():
    bt = {'eurusd:top:1-2': {'direction': 'BUY', 'status': 'sl', 'r': -1.04}}
    v = compare_to_backtest(_live(direction='BUY', reason='manual'), 'eurusd:top:1-2', bt)
    assert v['verdict'] == 'DIVERGENCE'
    assert 'manual' in v['detail']


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for t in tests:
        t(); print(f'  ok  {t.__name__}')
    print(f'\n{len(tests)} tests passed.')
