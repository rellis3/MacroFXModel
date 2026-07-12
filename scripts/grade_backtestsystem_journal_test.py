"""Offline test for grade_backtestsystem_journal.py against the committed
synthetic fixture (scripts/fixtures/backtestsystem_journal_sample.json) — no
network, no MT5. Run:  python3 scripts/grade_backtestsystem_journal_test.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from grade_backtestsystem_journal import (  # noqa: E402
    closed_trades, metrics, spread_pips_for, parse_spread_override, verdict,
    CONVICTION_BUCKETS, FEATURE_FAMILY, MIN_N,
)

FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'backtestsystem_journal_sample.json'

_p = _f = 0
def ok(name, cond):
    global _p, _f
    if cond: _p += 1; print(f"  ok  {name}")
    else: _f += 1; print(f"  FAIL {name}")


journal = json.loads(FIXTURE.read_text())
trades = closed_trades(journal, {}, slip_pips=0.2)

# 8 records: 6 usable closed, 1 open, 1 closed with pnl_r null (skipped).
ok('6 closed & costed trades (open + null-pnl_r skipped)', len(trades) == 6)
ok('trades sorted by close time', [t['ticket'] for t in trades] == [1007, 1008, 1009, 1010, 1011, 1012])

# Cost model: replicated bot/backtest.py table, MT5-style symbols normalized.
ok('EURUSD spread 0.8p', spread_pips_for('EURUSD', {}) == 0.8)
ok('XAUUSD spread 0.3p', spread_pips_for('XAUUSD', {}) == 0.3)
ok('USTECH100M (broker alias) spread 2.0p', spread_pips_for('USTECH100M', {}) == 2.0)
ok('unknown pair falls back to 1.0p', spread_pips_for('ZZZXXX', {}) == 1.0)
ok('override parse: bare number → all pairs', parse_spread_override('0.6') == {'*': 0.6})
ok('override parse: per-pair', parse_spread_override('EUR/USD=0.6')['EURUSD'] == 0.6)

# Per-trade netting: cost_r = (spread + slip) / sl_dist_pips.
t1 = next(t for t in trades if t['ticket'] == 1007)   # EURUSD 20p SL: (0.8+0.2)/20 = 0.05
ok('EURUSD 20p-SL cost_r = 0.05', abs(t1['cost_r'] - 0.05) < 1e-9)
ok('gross +1.0R nets to +0.95R', abs(t1['net_r'] - 0.95) < 1e-9)
t3 = next(t for t in trades if t['ticket'] == 1009)   # gold 30p SL: (0.3+0.2)/30
ok('gold cost_r = 0.5/30', abs(t3['cost_r'] - 0.5 / 30) < 1e-9)
t4 = next(t for t in trades if t['ticket'] == 1010)   # BE exit gross 0.0 → net negative
ok('break-even trade is a small net LOSS after costs', t4['net_r'] < 0)

# Overall metrics (hand-computed from the fixture):
# net R sequence: +0.95, -1.05, +1.98333, -0.048, -1.055, +0.45
m = metrics(trades)
ok('n = 6', m['n'] == 6)
ok('expectancy ≈ +0.2051R', abs(m['exp_r'] - 0.205056) < 1e-4)
ok('profit factor ≈ 1.571', abs(m['pf'] - (0.95 + 1.98333 + 0.45) / (1.05 + 0.048 + 1.055)) < 1e-4)
ok('win rate = 3/6', abs(m['win_rate'] - 0.5) < 1e-9)
ok('max consecutive losses = 2', m['max_consec_loss'] == 2)
ok('max cumulative-R drawdown ≈ 1.103', abs(m['max_dd_r'] - 1.10313) < 1e-3)

# Conviction buckets: <0.3 → {1007}; 0.3–0.5 → {1008,1010,1012}; >0.5 → {1009,1011}.
by_label = {}
for label, pred in CONVICTION_BUCKETS:
    by_label[label] = [t['ticket'] for t in trades if pred(t.get('conviction'))]
ok('conv <0.3 bucket', by_label['conv <0.3'] == [1007])
ok('conv 0.3–0.5 bucket', by_label['conv 0.3–0.5'] == [1008, 1010, 1012])
ok('conv >0.5 bucket', by_label['conv >0.5'] == [1009, 1011])

# Family grouping: trend ← macdSignal(1007)+htfEma(1008)+vwapSlope(1010);
# structure ← orderBlock(1007)+chochBos(1010); divergence ← rsiDivergence(1009);
# other ← hurstRegime(1011). 1012 fired nothing → no family row. A trade
# appears in EVERY family it fired (1007 and 1010 are in two rows each).
def fam_tickets(fam):
    return [t['ticket'] for t in trades
            if any(FEATURE_FAMILY.get(f, 'other') == fam for f in (t.get('features') or []))]
ok('family trend', fam_tickets('trend') == [1007, 1008, 1010])
ok('family structure', fam_tickets('structure') == [1007, 1010])
ok('family divergence', fam_tickets('divergence') == [1009])
ok('family other', fam_tickets('other') == [1011])

# House floor: n=6 < 30 ⇒ no conclusion, positive expectancy notwithstanding.
ok('verdict applies the n<30 floor', verdict(m).startswith('no conclusion') and MIN_N == 30)
ok('empty bucket → no conclusion', verdict(None).startswith('no conclusion'))

print(f"\n{_p} passed, {_f} failed")
sys.exit(1 if _f else 0)
