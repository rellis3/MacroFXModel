"""EURUSD Touch Book scorer — applies forge/TOUCH_BOOK_EURUSD_PREREG.md. Stdlib only.
    python scripts/rangebook/touch_score.py [pair] > analysis/output/rangebook/<pair>_TOUCH_RESULTS.md
"""
import json, math, random, sys, collections

PAIR = (sys.argv[1] if len(sys.argv) > 1 else 'eurusd').lower()
SPLIT = '2023-01-01'
D = json.load(open(f'analysis/output/rangebook/{PAIR}_touches.json'))
rows = [r for r in D['rows'] if not r['sameBar']]

FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def side(line):
    return 'up' if line.split('_')[0] in ('OH', 'CloseUp', 'ProjH') else 'dn'

def bk(v, edges, names):
    if v is None: return None
    for e, n in zip(edges, names):
        if v < e: return n
    return names[-1]

def buckets(r):
    s = side(r['line'])
    h = r['hmm']
    hmm = None if h is None else ('RANGE' if h == 'RANGE' else ('with' if (h == 'TREND_up') == (s == 'up') else 'against'))
    return {
        'time': bk(r['londonMin'], (7 * 60, 10 * 60, 13 * 60, 17 * 60), ('00-07', '07-10', '10-13', '13-17', '17+')),
        'used': bk(r['used'], (0.5, 0.8, 1.0), ('<0.5', '0.5-0.8', '0.8-1.0', '>1.0')),
        'linesBefore': bk(r['linesBefore'], (1, 3, 6), ('0', '1-2', '3-5', '6+')),
        'mom60': bk(r['mom60'], (0.2, 0.5), ('<0.2', '0.2-0.5', '>0.5')),
        'event': r['event'], 'sigmaReg': r['sigmaReg'], 'hmm': hmm, 'yRange': r['yRange'],
    }

def trade_R(r):
    dc, df, lm, o = r['dc'], r['df'], r['lastMove'], r['outcome']
    if o == 'cont': f, a = dc / df, -1.0
    elif o in ('fade',): f, a = -1.0, df / dc
    elif o == 'both': f, a = -1.0, -1.0
    else: f, a = max(-1.0, min(dc / df, lm / df)), max(-1.0, min(df / dc, -lm / dc))
    return f - r['costSig'] / df, a - r['costSig'] / dc, f, a

for r in rows:
    r['fam'] = fam(r['line']); r['B'] = buckets(r)
    r['follow'], r['fadeR'], r['followG'], r['fadeG'] = trade_R(r)
    r['train'] = r['date'] < SPLIT

def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n

def pct(xs, q):
    if not xs: return None
    s = sorted(xs); return s[min(len(s) - 1, int(q * len(s)))]

def summary(rs):
    n = len(rs)
    if not n: return None
    c = sum(r['outcome'] == 'cont' for r in rs) / n
    f = sum(r['outcome'] in ('fade', 'both') for r in rs) / n
    be = sum(r['df'] / (r['dc'] + r['df']) for r in rs) / n
    return dict(n=n, cont=c, fade=f, open=1 - c - f, be=be, fol=st([r['follow'] for r in rs]), fad=st([r['fadeR'] for r in rs]))

P = lambda x: f'{x:.0%}'
print(f'# {PAIR.upper()} Touch Book — continue vs fade at the forecast lines\n')
print('Rule: forge/TOUCH_BOOK_EURUSD_PREREG.md. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. '
      f'{len(rows):,} first touches ({sum(r["sameBar"] for r in D["rows"])} same-bar touches excluded). '
      'Break-even = the continue rate at which a follow trade (target next line, stop line behind) breaks even '
      'before cost. R = net of spread, in each trade\'s own stop distance.\n')

print('## 1. Each line: continue vs fade\n')
print('| line | period | touches | continue | fade | neither | break-even continue | follow net R (t) | fade net R (t) |')
print('|---|---|---|---|---|---|---|---|---|')
for fm in FAMS:
    for lab, flag in (('train', True), ('test', False)):
        s = summary([r for r in rows if r['fam'] == fm and r['train'] == flag])
        if not s: continue
        print(f"| {fm} | {lab} | {s['n']} | {P(s['cont'])} | {P(s['fade'])} | {P(s['open'])} | {P(s['be'])} | "
              f"{s['fol'][0]:+.3f} ({s['fol'][1]:+.1f}) | {s['fad'][0]:+.3f} ({s['fad'][1]:+.1f}) |")

print('\n## 2. Excursions: how far price moves against itself first\n')
print('Pullback before continuing = on touches that reached the next line, the deepest move back first. '
      'Overshoot before fading = on touches that faded, the furthest move beyond the line first. '
      'In σ of the day (pips in brackets, at the median σ).\n')
print('| line | period | pullback before continuing: median / 75th / 90th | overshoot before fading: median / 75th / 90th | distance to next line / to line behind (median) |')
print('|---|---|---|---|---|')
for fm in FAMS:
    for lab, flag in (('train', True), ('test', False)):
        rs = [r for r in rows if r['fam'] == fm and r['train'] == flag]
        if not rs: continue
        pps = pct([r['pipsPerSig'] for r in rs], 0.5)
        cb = [r['backBefore'] for r in rs if r['outcome'] == 'cont']
        fb = [r['beyondBefore'] for r in rs if r['outcome'] == 'fade']
        fmt = lambda xs: ' / '.join(f'{pct(xs, q):.2f} ({pct(xs, q) * pps:.0f}p)' for q in (0.5, 0.75, 0.9)) if xs else '–'
        print(f"| {fm} | {lab} | {fmt(cb)} | {fmt(fb)} | {pct([r['dc'] for r in rs], .5):.2f} / {pct([r['df'] for r in rs], .5):.2f} |")

print('\n## 3. By time of day (train → test)\n')
print('| line | time | touches (test) | continue | break-even | follow net R | fade net R |')
print('|---|---|---|---|---|---|---|')
for fm in FAMS:
    for tb in ('00-07', '07-10', '10-13', '13-17', '17+'):
        a = summary([r for r in rows if r['fam'] == fm and r['B']['time'] == tb and r['train']])
        b = summary([r for r in rows if r['fam'] == fm and r['B']['time'] == tb and not r['train']])
        if not a or not b or a['n'] < 40 or b['n'] < 20: continue
        print(f"| {fm} | {tb} | {b['n']} | {P(a['cont'])} → {P(b['cont'])} | {P(a['be'])} → {P(b['be'])} | "
              f"{a['fol'][0]:+.3f} → {b['fol'][0]:+.3f} | {a['fad'][0]:+.3f} → {b['fad'][0]:+.3f} |")

# ── 4. Pre-registered selection, chance benchmark, test confirmation ──
VARS = ['time', 'used', 'linesBefore', 'mom60', 'event', 'sigmaReg', 'hmm', 'yRange']
def cells(r):
    out = [(r['fam'], v, r['B'][v]) for v in VARS if r['B'][v] is not None]
    if r['B']['time'] and r['B']['used']: out.append((r['fam'], 'time×used', f"{r['B']['time']}|{r['B']['used']}"))
    return out

def select(rs, kf='follow', ka='fadeR'):
    g = collections.defaultdict(list)
    for r in rs:
        for c in cells(r): g[c].append(r)
    sel = []
    for c, xs in g.items():
        for dr, key in (('follow', kf), ('fade', ka)):
            m, t, n = st([x[key] for x in xs])
            if n >= 100 and m > 0 and t >= 2.5: sel.append((c, dr, m, t, n))
    return sel

train = [r for r in rows if r['train']]; test = [r for r in rows if not r['train']]
real = select(train)
rnd = random.Random(7); chance = []
for _ in range(20):
    perm = [(r['follow'], r['fadeR']) for r in train]; rnd.shuffle(perm)
    sh = [dict(r, sf=a, sa=b) for r, (a, b) in zip(train, perm)]
    chance.append(len(select(sh, 'sf', 'sa')))
chance.sort()
print('\n## 4. Pre-registered test: situations where following or fading pays\n')
print(f'Cells selected on train: **{len(real)}**. With outcomes shuffled (20 runs): median {chance[10]}, '
      f'95th percentile {chance[18]}, max {chance[-1]}.\n')
print('| line | situation | trade | train net R (t, n) | test net R (t, n) | confirmed? |')
print('|---|---|---|---|---|---|')
confirmed = 0
for (fm, var, val), dr, m, t, n in sorted(real, key=lambda x: -x[3]):
    xs = [r for r in test if (fm, var, val) in cells(r)]
    tm, tt, tn = st([x['follow' if dr == 'follow' else 'fadeR'] for x in xs])
    ok = tn >= 20 and tm > 0 and tt >= 2.0
    confirmed += ok
    print(f"| {fm} | {var} = {val} | {dr} | {m:+.3f} ({t:+.1f}, {n}) | {tm:+.3f} ({tt:+.1f}, {tn}) | {'**YES**' if ok else 'no'} |")
print(f"\n**Verdict: {'PASS' if confirmed > chance[18] else 'FAIL'}** — {confirmed} confirmed on test vs chance 95th percentile {chance[18]}.")
