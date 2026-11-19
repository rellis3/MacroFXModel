"""bias-engine-audit, item 1: the observation date behind every driver in a stored issue.

Reads the GET responses saved in analysis/output/bias-engine-audit/live/ (fetched 2026-11-18/19 from production,
read-only) and writes a per-driver table: the asOf the engine saw, its age at the issue time, the budget it was judged
against, and, for monthly series stamped at the START of the observed month (FRED/OECD convention, e.g. 2026-10-01 =
the October average), the earliest date that value could have been known (month end) and the age measured from there.
For the data driver it also lists every dimension's own date (the engine keeps only the NEWEST of them).

    python3 -I scripts/bias-engine-audit/freshness.py [issue json]   -> analysis/output/bias-engine-audit/freshness.json
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'bias-engine-audit'
LIVE = OUT / 'live'
issue = json.loads((Path(sys.argv[1]) if len(sys.argv) > 1 else LIVE / 'bias-engine.json').read_text())
sc = json.loads((LIVE / 'macro-scorecard.json').read_text())
BUDGET = {'policy': 10, 'rates': 120, 'data': 120, 'realYield': 120, 'positioning': 14, 'risk': 7, 'trend': 7, 'commodity': 7}
MONTHLY_START_STAMPED = {'rates', 'realYield', 'data'}
iso = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
t0 = iso(issue['asOf'])


def month_end(d):
    n = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return n - timedelta(minutes=1)


rows = []
for c, v in issue['currencies'].items():
    for x in v['drivers']:
        a = x.get('asOf')
        r = {'ccy': c, 'driver': x['key'], 'd': x['d'], 'asOf': a, 'budgetDays': BUDGET.get(x['key']), 'reading': x['reading']}
        if a:
            r['ageDays'] = round((t0 - iso(a)).total_seconds() / 86400, 1)
            if x['key'] in MONTHLY_START_STAMPED and iso(a).day == 1:
                me = month_end(iso(a))
                r['earliestKnown_if_monthly_avg'] = me.date().isoformat()
                r['ageFromMonthEnd'] = round((t0 - me).total_seconds() / 86400, 1)
        if x['key'] == 'risk':
            r['note'] = 'asOf is the ISSUE time (R inherits it), not the VIX/HY/SPX observation dates'
        rows.append(r)
    for x in v['missing']:
        rows.append({'ccy': c, 'driver': x['key'], 'd': None, 'missing': x['why']})
dims = {}
FACT = {'growth': ['gdp', 'ism'], 'inflation': ['cpi', 'ppi'], 'labour': ['laborMarket'], 'demand': ['retailSales', 'consumerConfidence']}
for r in sc['ranked']:
    used = [(d, r['asOf'].get(d), r['ageDays'].get(d)) for f in FACT for d in r['factors'][f]['dims']]
    ds = sorted(x[1] for x in used if x[1])
    dims[r['ccy']] = {'dims': {d: {'asOf': a, 'ageDays_vs_scorecard_build': g} for d, a, g in used},
                      'engine_asOf_uses': ds[-1] if ds else None, 'oldest_dim': ds[0] if ds else None,
                      'factors_present': [f for f in FACT if r['factors'][f]['score'] is not None]}
out = {'issue': issue['asOf'], 'drivers': rows, 'data_driver_dims': dims}
(OUT / 'freshness.json').write_text(json.dumps(out, indent=1))
for r in rows:
    print(r)
for c, v in dims.items():
    print(c, 'engine asOf', v['engine_asOf_uses'], 'oldest', v['oldest_dim'], 'factors', v['factors_present'])
