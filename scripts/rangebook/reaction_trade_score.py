"""Reaction trades scorer — forge/REACTION_TRADES_PREREG.md.
    python scripts/rangebook/reaction_trade_score.py > analysis/output/rangebook/REACTION_TRADES_RESULTS.md
"""
import json, math
import numpy as np
from statistics import NormalDist
from crosspair_buckets import ALL

IDX = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']
SETS = {'16 FX + gold': ALL, '6 indices': IDX}
TGT = ['halfway to the line behind', 'the line behind', '1R', '2R']
SPLIT, B = '2023-01-01', 1000
N = NormalDist()
sess = lambda m: 'Asia' if m < 420 else 'London' if m < 780 else 'NY' if m < 1020 else 'Late'
rng = np.random.default_rng(20261001)

def load(pairs):
    out = []
    for p in pairs:
        for r in json.load(open(f'analysis/output/rangebook/{p}_reaction.json'))['rows']: r['inst'] = p; out.append(r)
    return out

def stats(v, h2):
    v, h2 = np.asarray(v, float), np.asarray(h2, bool)
    return {'n': len(v), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))) if len(v) > 1 else 0.0,
            'h1': float(v[~h2].mean()), 'h2': float(v[h2].mean())}

res = {}
for sname, pairs in SETS.items():
    rows = load(pairs); h2 = np.array([r['date'] >= SPLIT for r in rows])
    days = {}; day = np.array([days.setdefault(r['inst'] + r['date'], len(days)) for r in rows])
    A = {}
    for m in (5, 15, 30):
        for b in ('0.05', '0.15'):
            for ti, tn in enumerate(TGT):
                sel = [(r[f'a{m}'][b][ti], r['date'] >= SPLIT, sess(r['londonMin'])) for r in rows if r.get(f'a{m}') and r[f'a{m}'].get(b) and r[f'a{m}'][b][ti] is not None]
                st = stats([x[0] for x in sel], [x[1] for x in sel])
                st['sess'] = {s: float(np.mean([x[0] for x in sel if x[2] == s])) for s in ('Asia', 'London', 'NY', 'Late') if any(x[2] == s for x in sel)}
                A[(m, b, tn)] = st
    Bres = {}
    for rule in ('b1', 'b2'):
        ok = np.array([r.get(rule) is not None for r in rows])
        d = np.array([(r[rule] - r['hold']) if r.get(rule) is not None else 0.0 for r in rows])[ok]
        dd, hh = day[ok], h2[ok]
        est = d.mean(); bs = []
        for _ in range(B):
            w = rng.poisson(1.0, day.max() + 1)[dd]; bs.append((w * d).sum() / w.sum())
        lo, hi = np.percentile(bs, [2.5, 97.5])
        hold = np.array([r['hold'] for r in rows])[ok]; rv = hold + d
        Bres[rule] = {'n': int(ok.sum()), 'diff': float(est), 'lo': float(lo), 'hi': float(hi), 'h1': float(d[~hh].mean()), 'h2': float(d[hh].mean()),
                      'hold': float(hold.mean()), 'rule': float(rv.mean()), 'trig': float(np.mean([r.get('trig15', 0) for r in rows]))}
    res[sname] = {'A': A, 'B': Bres}

# PASS for A: primary set, BH 10% over the 24 cells, both halves > 0, and index set > 0 for the same cell
P = res['16 FX + gold']['A']; tests = sorted((1 - N.cdf(v['t']), k) for k, v in P.items())
M = len(tests); cut = 0
for i, (pv, _) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bh = {k for _, k in tests[:cut]}
for k, v in P.items(): v['pass'] = k in bh and v['h1'] > 0 and v['h2'] > 0 and res['6 indices']['A'][k]['R'] > 0
for s in res:
    for rule, v in res[s]['B'].items(): v['ok'] = v['lo'] > 0 and v['h1'] > 0 and v['h2'] > 0
for rule in ('b1', 'b2'): res['16 FX + gold']['B'][rule]['pass'] = res['16 FX + gold']['B'][rule]['ok'] and res['6 indices']['B'][rule]['ok']

f3 = lambda x: f'{x:+.3f}'
print('# Trading the reaction after the touch — results\n')
print('Pre-registration: forge/REACTION_TRADES_PREREG.md (ec1f51b). R per trade, net of spread. Primary set 16 FX + gold; '
      'confirmation set NQ, SPX, DOW, US2000, DE30, UK100. Every builder passed its future-scramble self-check.\n')
print('## A — the tighter fade (price back inside > 0.1σ at the decision)\n')
print('| decision | stop buffer | target | trades | net R | 2016–22 | 2023–26 | indices R | Asia / London / NY / Late | PASS |\n|---|---|---|---|---|---|---|---|---|---|')
for k, v in P.items():
    m, b, tn = k; ix = res['6 indices']['A'][k]; s = v['sess']
    print(f"| +{m} min | {b}σ | {tn} | {v['n']:,} | {f3(v['R'])} | {f3(v['h1'])} | {f3(v['h2'])} | {f3(ix['R'])} | "
          f"{' / '.join(f3(s[x]) if x in s else '–' for x in ('Asia', 'London', 'NY', 'Late'))} | {'**PASS**' if v['pass'] else '–'} |")
print(f'\nBH 10% over {M} cells: {cut} survive before the both-halves and index checks.\n')
print('## B — cutting continuation trades\n')
print('| set | rule | trades | hold R | rule R | improvement [95% CI] | 2016–22 | 2023–26 | B1 fires on | PASS |\n|---|---|---|---|---|---|---|---|---|---|')
for s, r in res.items():
    for rule, lab in (('b1', 'B1: back inside at +15 min'), ('b2', 'B2: B1 or a Cipher B divergence')):
        v = r['B'][rule]
        print(f"| {s} | {lab} | {v['n']:,} | {f3(v['hold'])} | {f3(v['rule'])} | {v['diff']:+.4f} [{v['lo']:+.4f}, {v['hi']:+.4f}] | {v['h1']:+.4f} | {v['h2']:+.4f} | "
              f"{v['trig']:.0%} | {('**PASS**' if v.get('pass') else '–') if s == '16 FX + gold' else ('ok' if v['ok'] else 'no')} |")
json.dump({s: {'A': {f'{k[0]}|{k[1]}|{k[2]}': v for k, v in r['A'].items()}, 'B': r['B']} for s, r in res.items()},
          open('analysis/output/rangebook/reaction_trades.json', 'w'))
