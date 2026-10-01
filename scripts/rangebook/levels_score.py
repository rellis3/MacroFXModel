"""Confluence levels scorer — forge/CONFLUENCE_LEVELS_PREREG.md.
    python scripts/rangebook/levels_score.py > analysis/output/rangebook/CONFLUENCE_RESULTS.md
Writes analysis/output/rangebook/confluence_levels.json (for the book page).
"""
import json, math
import numpy as np
from statistics import NormalDist
from crosspair_buckets import ALL

SPLIT, TOL, TOL2, B = '2023-01-01', 0.05, 0.10, 1000
TYPES = ['sessionOpens', 'prevDayOpen', 'weekOpen', 'pdhl', 'pwhl', 'prevClose', 'roundNum', 'fibGP', 'fibExt',
         'poc', 'valueArea', 'nakedPOC', 'fvgM15', 'fvgH1']
LABEL = {'sessionOpens': 'Session opens', 'prevDayOpen': 'Previous day open', 'weekOpen': 'Week open', 'pdhl': 'Previous day high/low',
         'pwhl': 'Previous week high/low', 'prevClose': 'Previous day close', 'roundNum': 'Round numbers', 'fibGP': 'Golden pocket (prev day)',
         'fibExt': 'Fib extension 1.272/1.618', 'poc': 'Previous day POC', 'valueArea': 'Value area high/low', 'nakedPOC': 'Naked POC (20 days)',
         'fvgM15': 'Fair value gap M15', 'fvgH1': 'Fair value gap H1'}
N = NormalDist()

def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def sess(m): return 0 if m < 420 else 1 if m < 780 else 2 if m < 1020 else 3
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc

# ── load ──
cols = None; R = {k: [] for k in ('day', 'cell', 'cont', 'h2', 'fol', 'fad', 'dc', 'fam')}; X = {}
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
dayid = {}
for p in ALL:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
    lv = json.load(open(f'analysis/output/rangebook/{p}_levels.json'))
    cols = lv['cols']; ci = {c: i for i, c in enumerate(cols)}
    for r in lv['rows']:
        s = seq[f'{r[0]}|{r[1]}|{r[2]}']
        fm = FAMS.index(fam(s['line']))
        R['day'].append(dayid.setdefault(p + r[0], len(dayid)))
        R['cell'].append((fm * 4 + sess(s['londonMin'])) * 5 + usedb(s['used']))
        R['cont'].append(s['outcome'] == 'cont'); R['h2'].append(r[0] >= SPLIT); R['fam'].append(fm)
        fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig']); R['fol'].append(fo); R['fad'].append(fa); R['dc'].append(s['dc'])
        for c in cols[3:]: X.setdefault(c, []).append(np.nan if r[ci[c]] is None else r[ci[c]])
R = {k: np.asarray(v) for k, v in R.items()}; X = {k: np.asarray(v, dtype=float) for k, v in X.items()}
n, NC, ND = len(R['cont']), 7 * 4 * 5, len(dayid)
cont = R['cont'].astype(float)

def within(flag, w=None, mask=None):
    """Weighted within-cell difference in continue rate, flag vs not (prereg T1 statistic)."""
    w = np.ones(n) if w is None else w
    if mask is not None: w = w * mask
    k = R['cell'] * 2 + flag.astype(int)
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * cont, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() > 0 else float('nan')

rng = np.random.default_rng(20261001)
POIS = [rng.poisson(1.0, ND) for _ in range(B)]
def t1(flag, ctrl):
    """Real-minus-control statistic, its bootstrap CI, and the two halves."""
    est = within(flag) - within(ctrl)
    bs = np.array([within(flag, P[R['day']]) - within(ctrl, P[R['day']]) for P in POIS])
    h1 = within(flag, mask=~R['h2']) - within(ctrl, mask=~R['h2']); h2 = within(flag, mask=R['h2']) - within(ctrl, mask=R['h2'])
    lo, hi = np.percentile(bs, [2.5, 97.5])
    return {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': h1, 'h2': h2,
            'real': bool((lo > 0 or hi < 0) and np.sign(h1) == np.sign(h2) == np.sign(est))}

def trade(m):
    out = {'n': int(m.sum()), 'cont': float(cont[m].mean()) if m.any() else None}
    for d in ('fol', 'fad'):
        x = R[d][m]; mu = x.mean(); sd = x.std(ddof=1)
        out[d] = float(mu); out[d + 't'] = float(mu / sd * math.sqrt(len(x))) if sd else 0.0
        out[d + '_h1'] = float(R[d][m & ~R['h2']].mean()); out[d + '_h2'] = float(R[d][m & R['h2']].mean())
    return out

res = {'types': {}, 'trend': {}}
for ty in TYPES:
    at, atP = X[ty] <= TOL, X[ty + '_p'] <= TOL                     # NaN compares False
    at2, at2P = X[ty] <= TOL2, X[ty + '_p'] <= TOL2
    way, wayP = X[ty + 'A'] <= R['dc'], X[ty + 'A_p'] <= R['dc']
    res['types'][ty] = {'share': float(at.mean()), 'shareP': float(atP.mean()), 'T1': t1(at, atP),
                        'within_real': within(at), 'within_placebo': within(atP),
                        'T1_tol10': {'est': within(at2) - within(at2P)}, 'inway': {'est': within(way) - within(wayP), 'share': float(way.mean())},
                        'trade': trade(at), 'trade_placebo': trade(atP),
                        'byfam': {FAMS[f]: {'real': trade(at & (R['fam'] == f))['cont'], 'placebo': trade(atP & (R['fam'] == f))['cont'],
                                            'not': float(cont[~at & (R['fam'] == f)].mean()), 'n': int((at & (R['fam'] == f)).sum())} for f in range(7)}}
    print(f'{ty}: share {at.mean():.3f} T1 {res["types"][ty]["T1"]["est"]:+.4f}', flush=True)

stack = sum((X[ty] <= TOL).astype(int) for ty in TYPES); stackP = sum((X[ty + '_p'] <= TOL).astype(int) for ty in TYPES)
res['stack'] = {k: {'real': trade(stack >= k)['cont'], 'placebo': trade(stackP >= k)['cont'], 'n': int((stack >= k).sum()), 'nP': int((stackP >= k).sum())} for k in (0, 1, 2, 3)}
res['stack']['T1_2plus'] = t1(stack >= 2, stackP >= 2)

# Trend alignment: up line = side +1; LINE side from family isn't kept, so read it from the line name in the sequence files.
side = []
for p in ALL:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s['line'] for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
    for r in json.load(open(f'analysis/output/rangebook/{p}_levels.json'))['rows']:
        ln = r[1]; side.append(1 if ln.startswith(('OH_', 'CloseUp', 'ProjH')) else -1)
side = np.asarray(side); tz = X['trend'] * side
withT, against = tz > 0.5, tz < -0.5
both = withT | against
res['trend'] = {'share_with': float(withT.mean()), 'share_against': float(against.mean()),
                'diff': within(withT, mask=both), 'diff_h1': within(withT, mask=both & ~R['h2']), 'diff_h2': within(withT, mask=both & R['h2']),
                'with': trade(withT), 'against': trade(against), 'flat': trade(~both & ~np.isnan(tz)),
                'down_with': trade(withT & (side < 0)), 'up_with': trade(withT & (side > 0))}
bsd = np.array([within(withT, P[R['day']], mask=both) for P in POIS]); res['trend']['diff_ci'] = [float(x) for x in np.percentile(bsd, [2.5, 97.5])]

# ── T2: BH 10% over every type × direction + trend with/against × direction ──
tests = []
for ty in TYPES:
    for d in ('fol', 'fad'): tests.append((1 - N.cdf(res['types'][ty]['trade'][d + 't']), 'types', ty, d))
for g in ('with', 'against'):
    for d in ('fol', 'fad'): tests.append((1 - N.cdf(res['trend'][g][d + 't']), 'trend', g, d))
tests.sort(); m = len(tests); cut = 0
for i, (pv, *_) in enumerate(tests, 1):
    if pv <= 0.10 * i / m: cut = i
bh = {(a, b, c) for _, a, b, c in tests[:cut]}
for ty in TYPES:
    t = res['types'][ty]['trade']; t['pass'] = [d for d in ('fol', 'fad') if ('types', ty, d) in bh and t[d + '_h1'] > 0 and t[d + '_h2'] > 0 and res['types'][ty]['T1']['real']]
for g in ('with', 'against'):
    t = res['trend'][g]; t['pass'] = [d for d in ('fol', 'fad') if ('trend', g, d) in bh and t[d + '_h1'] > 0 and t[d + '_h2'] > 0]
res['meta'] = {'n': n, 'days': ND, 'tests': m, 'bh_pass': cut, 'base_cont': float(cont.mean())}
json.dump(res, open('analysis/output/rangebook/confluence_levels.json', 'w'))

# ── markdown ──
pp = lambda x: '–' if x is None or x != x else f'{x * 100:+.1f}pp'
P = lambda x: '–' if x is None else f'{x:.0%}'
print('\n# Confluence levels at the vol lines — results\n')
print(f'Pre-registration: forge/CONFLUENCE_LEVELS_PREREG.md (commit 62fc60c). {n:,} passes, {len(ALL)} instruments, {ND:,} instrument-days. '
      f'At the line = within {TOL}σ. Effect = within-cell (line × session × range used) difference in continue rate, at the line vs not. '
      f'Real − placebo = that effect minus the same for the level shifted 0.15–0.5σ. REAL = 95% CI excludes 0 and both halves agree.\n')
print('## T1 — does the level change what happens, beyond its placebo?\n')
print('| level | at the line | effect (real) | effect (placebo) | real − placebo [95% CI] | 2016–22 | 2023–26 | REAL? | 0.10σ | in the way |')
print('|---|---|---|---|---|---|---|---|---|---|')
for ty in TYPES:
    r = res['types'][ty]; t = r['T1']
    print(f"| {LABEL[ty]} | {r['share']:.1%} | {pp(r['within_real'])} | {pp(r['within_placebo'])} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | "
          f"{pp(t['h1'])} | {pp(t['h2'])} | {'**yes**' if t['real'] else 'no'} | {pp(r['T1_tol10']['est'])} | {pp(r['inway']['est'])} |")
t = res['stack']['T1_2plus']
print(f"| 2+ types stacked | {res['stack'][2]['n'] / n:.1%} | | | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | {pp(t['h1'])} | {pp(t['h2'])} | {'**yes**' if t['real'] else 'no'} | | |")
print('\n## T2 — can you trade it? (at-the-line passes; R net of spread)\n')
print('| level | passes | continue | follow R | fade R | follow 16–22 / 23–26 | fade 16–22 / 23–26 | placebo follow / fade | PASS |')
print('|---|---|---|---|---|---|---|---|---|')
for ty in TYPES:
    a, b = res['types'][ty]['trade'], res['types'][ty]['trade_placebo']
    print(f"| {LABEL[ty]} | {a['n']:,} | {P(a['cont'])} | {a['fol']:+.3f} | {a['fad']:+.3f} | {a['fol_h1']:+.3f} / {a['fol_h2']:+.3f} | {a['fad_h1']:+.3f} / {a['fad_h2']:+.3f} | "
          f"{b['fol']:+.3f} / {b['fad']:+.3f} | {'+'.join(a['pass']) or '–'} |")
tr = res['trend']
print(f"\n## Trend alignment (5-day trend beyond ±0.5)\n\nWith-trend touches {tr['share_with']:.0%}, against {tr['share_against']:.0%}. "
      f"Within-cell continue difference, with − against: {pp(tr['diff'])} [{pp(tr['diff_ci'][0])}, {pp(tr['diff_ci'][1])}] (2016–22 {pp(tr['diff_h1'])}, 2023–26 {pp(tr['diff_h2'])}).\n")
print('| group | passes | continue | follow R | fade R | follow halves | fade halves | PASS |\n|---|---|---|---|---|---|---|---|')
for g, lab in (('with', 'with trend'), ('against', 'against trend'), ('flat', 'flat'), ('down_with', 'downtrend, down line (owner\'s bounce)'), ('up_with', 'uptrend, up line')):
    a = tr[g]
    print(f"| {lab} | {a['n']:,} | {P(a['cont'])} | {a['fol']:+.3f} | {a['fad']:+.3f} | {a['fol_h1']:+.3f} / {a['fol_h2']:+.3f} | {a['fad_h1']:+.3f} / {a['fad_h2']:+.3f} | {'+'.join(a.get('pass', [])) or '–'} |")
print(f"\nBH 10% over {m} tests: {cut} survive before the both-halves and REAL checks.")
