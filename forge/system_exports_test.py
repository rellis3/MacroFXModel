"""forge/system_exports.py writes the same CSVs as js/systemExports.js (tests/fixtures/system_exports/)."""
import json
import os
import tempfile

from forge.system_exports import normalise_trades, toolkit_csv, terminal_csv, write_system_outputs

FIX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'fixtures', 'system_exports')


def _trades():
    with open(os.path.join(FIX, 'trades.json')) as f:
        return normalise_trades(json.load(f)['trades'])[0]


def _read(name):
    with open(os.path.join(FIX, name), newline='') as f:
        return f.read()


def test_toolkit_csvs_match_the_js_writer():
    t = _trades()
    for k in ('pct', 'r', 'cash'):
        assert toolkit_csv(t, k) == _read(f'toolkit_{k}.csv'), k


def test_data_terminal_csv_matches_the_js_writer():
    assert terminal_csv(_trades()) == _read('data_terminal.csv')


def test_writer_and_rejects():
    t, errs = normalise_trades([{'instrument': 'X', 'direction': 'up', 'exitMs': 1, 'R': 1}])
    assert not t and errs
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(FIX, 'trades.json')) as f:
            r = write_system_outputs('fixture', json.load(f)['trades'], model='Test', out_dir=d)
        assert r['trades'] == 3 and os.path.exists(os.path.join(d, 'data_terminal.csv'))
