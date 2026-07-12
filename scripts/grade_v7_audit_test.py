"""Offline test for grade_v7_audit.py against the committed synthetic fixture
(scripts/fixtures/regime_bot_v7_audit_sample.json) — no network, no MT5.
Run:  python3 scripts/grade_v7_audit_test.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from grade_v7_audit import closed_trades, metrics, paper_cost_price, verdict, MIN_N  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'regime_bot_v7_audit_sample.json'

_p = _f = 0
def ok(name, cond):
    global _p, _f
    if cond: _p += 1; print(f"  ok  {name}")
    else: _f += 1; print(f"  FAIL {name}")


audit = json.loads(FIXTURE.read_text())
trades, counts = closed_trades(audit)

# 8 records: 6 exits (2 entry events ignored), sorted by ts.
ok('6 closed trades, entries ignored', len(trades) == 6)
ok('sorted by ts (ccc hash trades logged earlier come first)',
   [t['cfg_hash'] for t in trades][:2] == ['ccc333ddd444', 'ccc333ddd444'])

# Cost accounting: 4 Batch-4+ paper (paper_cost_pips key), 1 pre-Batch-4 paper
# (no key → retro-costed), 1 live.
ok('cost classes counted', counts == {'net_already': 4, 'retro_costed': 1, 'live': 1})

# Retro-cost math: EUR/USD gross -20p, SL_HIT → bp = 1.2+0.4, entry 1.1000
# → cost 1.1×1.6/1e4 = 0.000176 = 1.76p; net -21.76p, net R -1.088.
retro = next(t for t in trades if t['cfg_hash'] == 'ccc333ddd444' and t['pair'] == 'EUR/USD')
ok('paper_cost_price matches the bot formula', abs(paper_cost_price(1.10, 'SL_HIT') - 0.000176) < 1e-12)
ok('pre-Batch-4 paper record retro-costed in pips', abs(retro['net_pips'] - (-21.76)) < 1e-9)
ok('pre-Batch-4 paper record retro-costed in R', abs(retro['net_r'] - (-1.088)) < 1e-9)

# Live record untouched (broker spread already in the fill).
live = next(t for t in trades if t['pair'] == 'USD/JPY')
ok('live record not re-costed', live['net_pips'] == 30.0 and live['net_r'] == 1.2)

# Batch-4+ paper records pass through as already net.
a = [t for t in trades if t['cfg_hash'] == 'aaa111bbb222']
ok('Batch-4+ pips pass through net', [t['net_pips'] for t in a] == [15.0, -10.0, -8.0, 25.0])

# Per-hash metrics, hash aaa111bbb222 (hand-computed):
# pips [15,-10,-8,25]: exp 5.5p; R [0.75,-0.5,-0.4,1.25]: exp 0.275R;
# PF 40/18; win 2/4; max consec losses 2; cum pips 15,5,-3,22 → maxDD 18.
m = metrics(a)
ok('n = 4', m['n'] == 4)
ok('expectancy +5.5 pips', abs(m['exp_pips'] - 5.5) < 1e-9)
ok('expectancy +0.275R', abs(m['exp_r'] - 0.275) < 1e-9)
ok('PF = 40/18', abs(m['pf'] - 40.0 / 18.0) < 1e-9)
ok('win rate 50%', abs(m['win_rate'] - 0.5) < 1e-9)
ok('max consecutive losses = 2', m['max_consec_loss'] == 2)
ok('cumulative-pips max DD = 18', abs(m['max_dd_pips'] - 18.0) < 1e-9)

# House floor.
ok('n=4 hash → no conclusion', verdict(m).startswith('no conclusion') and MIN_N == 30)
ok('empty hash → no conclusion', verdict(None).startswith('no conclusion'))

# R-coverage bookkeeping (all fixture trades have usable SL distances).
ok('R computed over all 4 (n_r == n)', m['n_r'] == 4)

print(f"\n{_p} passed, {_f} failed")
sys.exit(1 if _f else 0)
