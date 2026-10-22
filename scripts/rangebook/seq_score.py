"""EURUSD Sequence Book scorer — forge/SEQUENCE_BOOK_EURUSD_PREREG.md. Stdlib only.
    python scripts/rangebook/seq_score.py > analysis/output/rangebook/eurusd_SEQUENCE_RESULTS.md
"""
import json, math, random, sys, collections
from brier import fit, bss

PAIR = (sys.argv[1] if len(sys.argv) > 1 else 'eurusd').lower()
SPLIT = '2023-01-01'
S = json.load(open(f'analysis/output/rangebook/{PAIR}_sequence.json'))
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
SESS = ['Asia', 'London', 'NY', 'Late']
P = lambda x: f'{x:.0%}'


def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung


def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n


def pct(xs, q):
    s = sorted(xs); return s[min(len(s) - 1, int(q * len(s)))] if s else None


rows = [p for p in S['passes'] if not p['sameBar']]
for r in rows:
    dc, df, lm, c, o = r['dc'], r['df'], r['lastMove'], r['costSig'], r['outcome']
    if o == 'cont': f, a = dc / df, -1.0
    elif o == 'fade': f, a = -1.0, df / dc
    elif o == 'both': f, a = -1.0, -1.0
    else: f, a = max(-1.0, min(dc / df, lm / df)), max(-1.0, min(df / dc, -lm / dc))
    r['follow'], r['fadeR'] = f - c / df, a - c / dc
    r['fam'], r['pb'], r['train'] = fam(r['line']), ('3+' if r['pass'] >= 3 else str(r['pass'])), r['date'] < SPLIT

print(f'# {PAIR.upper()} Sequence Book — every pass at the lines\n')
print(f'Rule: forge/SEQUENCE_BOOK_EURUSD_PREREG.md. {len(rows):,} passes (same-bar excluded); a line re-arms after a '
      'close 0.1σ back inside. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. R net of spread.\n')

# ── Descriptive: by pass ──
print('## 1. First pass vs later passes\n')
print('| line | pass | period | passes | continue | fade | neither | break-even | follow R | fade R |')
print('|---|---|---|---|---|---|---|---|---|---|')
for fm in FAMS:
    for pb in ('1', '2', '3+'):
        for lab, flag in (('train', True), ('test', False)):
            rs = [r for r in rows if r['fam'] == fm and r['pb'] == pb and r['train'] == flag]
            if len(rs) < 30: continue
            n = len(rs); c = sum(r['outcome'] == 'cont' for r in rs) / n; f = sum(r['outcome'] in ('fade', 'both') for r in rs) / n
            be = sum(r['df'] / (r['dc'] + r['df']) for r in rs) / n
            print(f"| {fm} | {pb} | {lab} | {n} | {P(c)} | {P(f)} | {P(1 - c - f)} | {P(be)} | "
                  f"{st([r['follow'] for r in rs])[0]:+.3f} | {st([r['fadeR'] for r in rs])[0]:+.3f} |")

print('\n## 2. Pullback before a later pass, and the previous overshoot (σ; median / 90th, train | test)\n')
print('| line | pullback before pass 2 | overshoot of pass 1 before it re-armed |'); print('|---|---|---|')
for fm in FAMS:
    cells = []
    for key in ('pullback', 'prevOver'):
        parts = []
        for flag in (True, False):
            xs = [r[key] for r in rows if r['fam'] == fm and r['pass'] == 2 and r['train'] == flag and r[key] is not None]
            parts.append(f'{pct(xs, .5):.2f} / {pct(xs, .9):.2f}' if xs else '–')
        cells.append(' \\| '.join(parts))
    print(f'| {fm} | ' + ' | '.join(cells) + ' |')

print('\n## 3. The 75th line: first reached in which session → continues to the 90th / fades to the median on that pass\n')
print('| session first reached | days train / test | continue | fade | neither |'); print('|---|---|---|---|---|')
for s in SESS:
    out = []; ns = []
    for flag in (True, False):
        rs = [r for r in rows if r['fam'] == 'OHOL_p75' and r['pass'] == 1 and r['session'] == s and r['train'] == flag]
        ns.append(str(len(rs)))
        out.append(rs)
    if min(len(x) for x in out) < 15: continue
    fmt = lambda k: ' → '.join(P(sum((r['outcome'] in k) for r in x) / len(x)) for x in out)
    print(f"| {s} | {' / '.join(ns)} | {fmt(('cont',))} | {fmt(('fade', 'both'))} | {fmt(('open',))} |")

# ── Q1: pre-registered selection ──
def cells(r):
    return [(r['fam'], r['pb'], None), (r['fam'], r['pb'], r['session'])]

def select(rs, kf='follow', ka='fadeR'):
    g = collections.defaultdict(list)
    for r in rs:
        for c in cells(r): g[c].append(r)
    out = []
    for c, xs in g.items():
        for dr, key in (('follow', kf), ('fade', ka)):
            m, t, n = st([x[key] for x in xs])
            if n >= 100 and m > 0 and t >= 2.5: out.append((c, dr, m, t, n))
    return out

train = [r for r in rows if r['train']]; test = [r for r in rows if not r['train']]
real = select(train)
rnd = random.Random(7); chance = []
for _ in range(20):
    perm = [(r['follow'], r['fadeR']) for r in train]; rnd.shuffle(perm)
    chance.append(len(select([dict(r, sf=a, sa=b) for r, (a, b) in zip(train, perm)], 'sf', 'sa')))
chance.sort()
print('\n## 4. Question 1 — does any pass × session cell pay? (pre-registered)\n')
print(f'Cells selected on train: **{len(real)}**. Shuffled outcomes (20 runs): median {chance[10]}, 95th pct {chance[18]}, max {chance[-1]}.\n')
confirmed = 0
if real:
    print('| line | pass | session | trade | train net R (t, n) | test net R (t, n) | confirmed? |'); print('|---|---|---|---|---|---|---|')
    for (fm, pb, s), dr, m, t, n in sorted(real, key=lambda x: -x[3]):
        xs = [r for r in test if r['fam'] == fm and r['pb'] == pb and (s is None or r['session'] == s)]
        tm, tt, tn = st([x['follow' if dr == 'follow' else 'fadeR'] for x in xs])
        ok = tn >= 20 and tm > 0 and tt >= 2.0; confirmed += ok
        print(f"| {fm} | {pb} | {s or 'any'} | {dr} | {m:+.3f} ({t:+.1f}, {n}) | {tm:+.3f} ({tt:+.1f}, {tn}) | {'**YES**' if ok else 'no'} |")
print(f"\n**Question 1 verdict: {'PASS' if confirmed > chance[18] else 'FAIL'}** — {confirmed} confirmed vs chance 95th pct {chance[18]}.\n")

# ── Q2: path variables on the range book's reach rows ──
R = [r for r in json.load(open(f'analysis/output/rangebook/{PAIR}.json'))['records'] if all(r['pre'][k] is not None for k in ('sigmaReg', 'hmm', 'yRange'))]
CP = {(c['date'], c['h']): c for c in S['checkpoints']}
RANK = {'none': 0, 'p50': 1, 'p75': 2, 'p90': 3}
def bk(v, edges, names):
    for e, n in zip(edges, names):
        if v < e: return n
    return names[-1]
DIST = lambda v: bk(v, (0.25, 0.5, 1.0), ('<0.25', '0.25-0.5', '0.5-1', '>1'))
USED = lambda v: bk(v, (0.4, 0.7, 1.0), ('<0.4', '0.4-0.7', '0.7-1', '>1'))
def lfam(line):
    if line.startswith('Range_'): return line
    return ('Close_' if line.startswith('Close') else 'OHOL_') + line.split('_')[1]
A = []
for r in R:
    for a in r['A']:
        cp = CP.get((r['date'], a['h']))
        if not cp: continue
        if a['side'] in ('up', 'dn'): sd = cp[a['side']]
        else:
            u, d = cp['up'], cp['dn']
            sd = u if (RANK[u['top']], u['passes']) >= (RANK[d['top']], d['passes']) else d
        A.append((r['date'], (a['h'], lfam(a['line']), DIST(a['dist']), USED(a['used'])),
                  {'top': sd['top'], 'when': sd['when'], 'passes': min(sd['passes'], 3)}, a['hit']))
trA = [x for x in A if x[0] < SPLIT]; teA = [x for x in A if x[0] >= SPLIT]
base_pred, _ = fit(trA, ())
print('## 5. Question 2 — does the path so far sharpen the reach odds? (pre-registered)\n')
print(f'Range-book reach rows at 07/10/13/16 London: train {len(trA):,}, test {len(teA):,}. Base = checkpoint × line × '
      'distance × range used. Skill = Brier improvement on test over the base; 95% day-bootstrap interval.\n')
print('| path variable added | test skill vs base | 95% interval | informative? |'); print('|---|---|---|---|')
anyq2 = False
for ex in (('top',), ('when',), ('passes',), ('top', 'when', 'passes')):
    m_pred, _ = fit(trA, ex)
    p, lo, hi = bss(teA, m_pred, base_pred)
    if len(ex) == 1 and lo > 0: anyq2 = True
    print(f"| {' + '.join(ex)} | {p:+.4f} | {lo:+.4f} to {hi:+.4f} | {'**YES**' if lo > 0 else 'no'} |")
print(f"\n**Question 2 verdict: {'at least one path variable is informative' if anyq2 else 'no path variable adds skill'}**\n")

# Readable: 10:00 London reach odds for the OH/OL 75th line, by what that side has done so far
print('### Reach the OH/OL 75th line from 10:00, by what that side has done so far (train → test)\n')
print('| side so far | first reached p50 in | chance of reaching its 75th today | n test |'); print('|---|---|---|---|')
for top in ('none', 'p50'):
    for when in (('notYet',) if top == 'none' else ('Asia', 'London')):
        a = [x for x in trA if x[1][0] == 10 and x[1][1] == 'OHOL_p75' and x[2]['top'] == top and x[2]['when'] == when]
        b = [x for x in teA if x[1][0] == 10 and x[1][1] == 'OHOL_p75' and x[2]['top'] == top and x[2]['when'] == when]
        if len(a) >= 30 and len(b) >= 15:
            print(f"| {'nothing yet' if top == 'none' else 'reached its median'} | {'–' if when == 'notYet' else when} | "
                  f"{P(sum(x[3] for x in a) / len(a))} → {P(sum(x[3] for x in b) / len(b))} | {len(b)} |")
