"""bias-engine-audit, items 3 and 6: how much of each stored score comes from each driver, and from the shared risk score.

Descriptive, on the saved production issues in analysis/output/bias-engine-audit/live/ (read-only GETs). For every
currency and every one of the 28 crosses: the share of the absolute contribution carried by each driver key, the largest
single normalised weight, and the share of the pair score explained by the risk-role driver of both legs.

    python3 -I scripts/bias-engine-audit/live_structure.py   -> analysis/output/bias-engine-audit/live_structure.json
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'bias-engine-audit'
LIVE = OUT / 'live'
res = {}
for f in ['issue-2026-11-16.json', 'issue-2026-11-17.json', 'bias-engine.json']:
    d = json.loads((LIVE / f).read_text())
    ccy = {}
    for c, v in d['currencies'].items():
        tot = sum(abs(x['contrib']) for x in v['drivers']) or 1
        ccy[c] = {'score': v['score'], 'dir': v['dir'], 'coverage': v['coverage'], 'max_wNorm': max(x['wNorm'] for x in v['drivers']),
                  'n_drivers': len(v['drivers']), 'abs_share': {x['key']: round(abs(x['contrib']) / tot, 2) for x in v['drivers'] if x['contrib']}}
    pairs = {}
    by_key = defaultdict(float)
    tot_all = 0.0
    for p, v in d['markets'].items():
        if len(p) != 6 or not v.get('legs'):
            continue
        tot = sum(abs(x['contrib']) for x in v['drivers']) or 1
        risk = sum(x['contrib'] for x in v['drivers'] if x['key'] == 'risk')
        for x in v['drivers']:
            by_key[x['key']] += abs(x['contrib'])
        tot_all += tot
        pairs[p] = {'score': v['score'], 'dir': v['dir'], 'strength': v['strength'], 'risk_contrib': round(risk, 3),
                    'risk_abs_share': round(sum(abs(x['contrib']) for x in v['drivers'] if x['key'] == 'risk') / tot, 2),
                    'score_without_risk': round(v['score'] - risk, 3)}
    flips = [p for p, x in pairs.items() if abs(x['score']) >= 0.5 and abs(x['score_without_risk']) < 0.5 or (x['score'] * x['score_without_risk'] < 0)]
    res[d['asOf']] = {'R': d['risk']['score'], 'currencies': ccy,
                      'pairs_called': {p: x for p, x in pairs.items() if x['dir'] != 'NEUTRAL'},
                      'n_pairs_called': sum(1 for x in pairs.values() if x['dir'] != 'NEUTRAL'),
                      'pair_abs_contrib_share_by_driver': {k: round(v / tot_all, 3) for k, v in sorted(by_key.items(), key=lambda kv: -kv[1])},
                      'pairs_where_risk_decides_call_or_sign': flips,
                      'AUDJPY': pairs.get('AUDJPY'), 'NZDJPY': pairs.get('NZDJPY')}
(OUT / 'live_structure.json').write_text(json.dumps(res, indent=1))
for k, v in res.items():
    print('==', k, 'R', v['R'], 'called', v['n_pairs_called'], v['pair_abs_contrib_share_by_driver'])
    print('   risk decides:', v['pairs_where_risk_decides_call_or_sign'])
    print('   AUDJPY', v['AUDJPY'], 'NZDJPY', v['NZDJPY'])
    print('   called', {p: (x['dir'][:4], x['strength'], x['risk_abs_share']) for p, x in v['pairs_called'].items()})
    for c, x in v['currencies'].items():
        print('   ', c, x['score'], x['dir'][:4], 'cov', x['coverage'], 'maxw', x['max_wNorm'], x['abs_share'])
