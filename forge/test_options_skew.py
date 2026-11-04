"""Tests for forge/options_skew.py.   python -m pytest forge/test_options_skew.py  (or scripts/run_py_tests.py)"""
import math
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
from options_skew import interp, skew_from_chain, pick_expiries, strike_window  # noqa: E402


def _bs_delta(F, K, vol, t, call=True):
    d1 = (math.log(F / K) + 0.5 * vol * vol * t) / (vol * math.sqrt(t))
    n = 0.5 * (1 + math.erf(d1 / math.sqrt(2)))
    return n if call else n - 1


def _chain(F, t, smile):
    """A synthetic chain: vol = smile(strike), deltas from Black-76."""
    ks = [F * (1 + i / 100) for i in range(-8, 9)]
    calls = [{'strike': k, 'iv': smile(k), 'delta': _bs_delta(F, k, smile(k), t)} for k in ks]
    puts = [{'strike': k, 'iv': smile(k), 'delta': _bs_delta(F, k, smile(k), t, call=False)} for k in ks]
    return calls, puts


def test_interp():
    assert interp([(0, 0), (10, 10)], 5) == 5
    assert interp([(10, 1), (0, 0)], 5) == 0.5
    assert interp([(0, 0), (1, 1)], 2) is None
    assert interp([(0, 0)], 0) is None


def test_flat_smile_has_no_skew():
    calls, puts = _chain(1.10, 30 / 365, lambda k: 0.08)
    s = skew_from_chain(1.10, calls, puts)
    assert s['atm'] == 8.0 and s['rr25'] == 0.0 and s['bf25'] == 0.0 and s['n'] > 8


def test_put_skew_is_a_negative_risk_reversal():
    F = 100.0
    calls, puts = _chain(F, 30 / 365, lambda k: 0.20 + 0.8 * (F - k) / F)   # vol rises as strikes fall
    s = skew_from_chain(F, calls, puts)
    assert s['rr25'] < -1 and s['p25'] > s['atm'] > s['c25']


def test_smile_has_a_positive_butterfly():
    F = 100.0
    calls, puts = _chain(F, 30 / 365, lambda k: 0.20 + 4 * ((k - F) / F) ** 2)
    s = skew_from_chain(F, calls, puts)
    assert s['bf25'] > 0 and abs(s['rr25']) < 0.3


def test_thin_chain_returns_none():
    assert skew_from_chain(1.0, [{'strike': 1.01, 'iv': 0.1, 'delta': 0.4}], []) is None


def test_pick_expiries_and_strikes():
    ex = ['20261106', '20261113', '20261204', '20270205', '20270305', 'bad']
    p = pick_expiries(ex, today=date(2026, 11, 4))
    assert p['1w'][0] == '20261113'          # the 6th is only 2 days out, under the minimum
    assert p['1m'][0] == '20261204' and p['3m'][0] == '20270205'
    ks = strike_window(1.10, [1.0 + i * 0.005 for i in range(41)], 30, 0.08)
    assert min(ks) < 1.10 < max(ks) and len(ks) <= 20
    # only near-dated chains listed: no 3-month reading made up from a 1-month option
    near = pick_expiries(['20261113', '20261204'], today=date(2026, 11, 4))
    assert '3m' not in near and near['1m'][0] == '20261204'
