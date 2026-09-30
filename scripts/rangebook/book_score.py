"""The Fade / Continue Book — builds the tables of forge/FADE_CONTINUE_BOOK_SPEC.md.
    python scripts/rangebook/book_score.py > analysis/output/rangebook/FADE_CONTINUE_BOOK.md
Also writes analysis/output/rangebook/fade_continue_book.json (the page's data).
"""
import json, math, os, statistics
from statistics import NormalDist
from crosspair_buckets import ALL

SPLIT = '2023-01-01'
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
FAM_LABEL = {'OHOL_p50': 'OH/OL median', 'OHOL_p75': 'OH/OL 75th', 'OHOL_p90': 'OH/OL 90th', 'Close_p50': 'Close median',
             'Close_p75': 'Close 75th', 'Proj_p50': 'Proj H/L median', 'Proj_p75': 'Proj H/L 75th'}
SESS = ['Asia', 'London', 'NY', 'Late']
USED = ['<0.5', '0.5-0.8', '0.8-1.0', '>1.0']
N = NormalDist()

def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def sess(m): return 'Asia' if m < 420 else 'London' if m < 780 else 'NY' if m < 1020 else 'Late'
def usedb(u): return None if u is None else '<0.5' if u < 0.5 else '0.5-0.8' if u < 0.8 else '0.8-1.0' if u < 1.0 else '>1.0'
def rr(r):
    o, dc, df, lm, c = r['outcome'], r['dc'], r['df'], r['lastMove'], r['costSig']
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc

# ── Load: sequence passes (outcome, excursions) joined with approach features ──
q75 = {}
hl = json.load(open('analysis/output/rangebook/hl_ratio.json')) if os.path.exists('analysis/output/rangebook/hl_ratio.json') else {}
for p in ALL:
    f = f'analysis/output/rangebook/{p}_pred_q75.json'
    if os.path.exists(f) and p in hl: q75[p] = (json.load(open(f)), hl[p])
rows = []
for p in ALL:
    seq = [s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']]
    ap = {f"{a['date']}|{a['line']}|{a['pass']}": a for a in json.load(open(f'analysis/output/rangebook/{p}_approach.json'))['rows']}
    for s in seq:
        a = ap.get(f"{s['date']}|{s['line']}|{s['pass']}")
        if a is None: continue
        fol, fad = rr(s)
        big = None
        if p in q75:
            v = q75[p][0].get(s['date'])
            if v is not None: big = v > q75[p][1]
        rows.append({'inst': p, 'date': s['date'], 'half': 'h1' if s['date'] < SPLIT else 'h2', 'fam': fam(s['line']),
                     'sess': sess(s['londonMin']), 'used': usedb(s['used']), 'pass': min(s['pass'], 3), 'outcome': s['outcome'],
                     'be': s['df'] / (s['dc'] + s['df']), 'fol': fol, 'fad': fad, 'over': s['beyondBefore'], 'pull': s['backBefore'],
                     'stretch': a.get('mtfStretch'), 'vol': a.get('relVol15'), 'mv60': a.get('mv60'), 'big': big})

def thirds(key):
    xs = sorted(r[key] for r in rows if r['half'] == 'h1' and r[key] is not None)
    return xs[len(xs) // 3], xs[2 * len(xs) // 3]
VOL, MOV = thirds('vol'), thirds('mv60')
tb = lambda v, e: None if v is None else 'low' if v < e[0] else 'mid' if v < e[1] else 'high'
for r in rows: r['volb'], r['movb'] = tb(r['vol'], VOL), tb(r['mv60'], MOV)

# EURUSD pips per σ (median, from the touch book) for the excursion columns
pps = None
try: pps = statistics.median(t['pipsPerSig'] for t in json.load(open('analysis/output/rangebook/eurusd_touches.json'))['rows'])
except Exception: pass

def stat(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((v - m) ** 2 for v in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n
def pct(xs, q): s = sorted(xs); return s[min(len(s) - 1, int(q * len(s)))] if s else None

def cell(rs):
    if not rs: return None
    out = {'n': len(rs)}
    for h in ('h1', 'h2'):
        x = [r for r in rs if r['half'] == h]
        out[h] = {'n': len(x), 'cont': sum(r['outcome'] == 'cont' for r in x) / len(x) if x else None}
    n = len(rs)
    out.update(cont=sum(r['outcome'] == 'cont' for r in rs) / n, fade=sum(r['outcome'] in ('fade', 'both') for r in rs) / n,
               be=sum(r['be'] for r in rs) / n)
    out['stall'] = 1 - out['cont'] - out['fade']
    for k, key in (('fol', 'fol'), ('fad', 'fad')):
        m, t, _ = stat([r[key] for r in rs]); out[k] = m; out[k + 't'] = t
        out[k + '_h1'] = stat([r[key] for r in rs if r['half'] == 'h1'])[0]; out[k + '_h2'] = stat([r[key] for r in rs if r['half'] == 'h2'])[0]
    ov = [r['over'] for r in rs if r['outcome'] == 'fade' and r['over'] is not None]
    pb = [r['pull'] for r in rs if r['outcome'] == 'cont' and r['pull'] is not None]
    out.update(over50=pct(ov, .5), over90=pct(ov, .9), pull50=pct(pb, .5), pull90=pct(pb, .9))
    out['stable'] = out['h1']['n'] >= 100 and out['h2']['n'] >= 100 and abs(out['h1']['cont'] - out['h2']['cont']) <= 0.05
    return out

def build(rs):
    book = {'main': {}, 'mods': {}}
    for fm in FAMS:
        for s in SESS:
            for u in USED:
                c = cell([r for r in rs if r['fam'] == fm and r['sess'] == s and r['used'] == u])
                if c and c['n'] >= 30: book['main'][f'{fm}|{s}|{u}'] = c
        for mod, key, vals in (('pass', 'pass', (1, 2, 3)), ('WaveTrend M15+H1 stretched', 'stretch', (0, 1)),
                               ('volume into the line (15 min, vs usual)', 'volb', ('low', 'mid', 'high')),
                               ('60-min move into the line', 'movb', ('low', 'mid', 'high')), ('big day forecast (2023–26, CVOL pairs)', 'big', (False, True))):
            for v in vals:
                c = cell([r for r in rs if r['fam'] == fm and r[key] == v])
                if c and c['n'] >= 30: book['mods'][f'{fm}|{mod}|{v}'] = c
    return book

books = {'pooled': build(rows), 'eurusd': build([r for r in rows if r['inst'] == 'eurusd'])}

# ── Edge flag: both halves positive + Benjamini-Hochberg at 10% over every row × direction ──
tests = []
for bk, b in books.items():
    for part in ('main', 'mods'):
        for k, c in b[part].items():
            for d in ('fol', 'fad'):
                tests.append((1 - N.cdf(c[d + 't']), bk, part, k, d))
tests.sort(); m = len(tests); cutoff = 0
for i, (pv, *_ ) in enumerate(tests, 1):
    if pv <= 0.10 * i / m: cutoff = i
passed = {(bk, part, k, d) for pv, bk, part, k, d in tests[:cutoff]}
for bk, b in books.items():
    for part in ('main', 'mods'):
        for k, c in b[part].items():
            c['edge'] = [d for d in ('fol', 'fad') if (bk, part, k, d) in passed and c[d + '_h1'] > 0 and c[d + '_h2'] > 0]

json.dump({'books': books, 'meta': {'instruments': ALL, 'rows_pooled': len(rows), 'rows_eurusd': sum(r['inst'] == 'eurusd' for r in rows),
           'pips_per_sigma_eurusd': pps, 'tests': m, 'bh_pass': cutoff, 'vol_thirds': VOL, 'move_thirds': MOV}},
          open('analysis/output/rangebook/fade_continue_book.json', 'w'))

# ── Markdown ──
P = lambda x: '–' if x is None else f'{x:.0%}'
def line(label, c, pip=False):
    ex = lambda a, b: '–' if a is None else (f'{a:.2f}/{b:.2f}σ' + (f' ({a * pps:.0f}/{b * pps:.0f}p)' if pip and pps else ''))
    flag = ('✓ stable' if c['stable'] else '') + (' · **EDGE ' + '+'.join('follow' if d == 'fol' else 'fade' for d in c['edge']) + '**' if c['edge'] else '')
    return (f"| {label} | {c['n']} | {P(c['cont'])} | {P(c['fade'])} | {P(c['stall'])} | {P(c['be'])} | {c['fol']:+.3f} | {c['fad']:+.3f} | "
            f"{P(c['h1']['cont'])} → {P(c['h2']['cont'])} | {ex(c['pull50'], c['pull90'])} | {ex(c['over50'], c['over90'])} | {flag} |")
HDR = ('| situation | touches | continue | fade | stall | break-even | follow R | fade R | continue 16–22 → 23–26 | pullback before continuing (med/90th) | overshoot before fading (med/90th) | flags |\n'
       '|---|---|---|---|---|---|---|---|---|---|---|---|')
print('# The Fade / Continue Book\n')
print(f"Spec: forge/FADE_CONTINUE_BOOK_SPEC.md. Every pass of every Vol Forecast v3 line, 2016 → 2026-08. Pooled: {len(rows):,} passes over "
      f"16 instruments in σ units; EURUSD alone: {books and sum(r['inst'] == 'eurusd' for r in rows):,}. Continue = reached the next line out first; "
      "fade = reached the line behind first; stall = neither by the London day end. Break-even = the continue rate a follow trade needs at that "
      "line spacing (before spread). R = net of spread.\n")
print(f"**Edge rows:** {sum(len(c['edge']) > 0 for b in books.values() for part in ('main', 'mods') for c in b[part].values())} "
      f"of {sum(len(b[part]) for b in books.values() for part in ('main', 'mods'))} rows ({m} tests, Benjamini–Hochberg 10%: {cutoff} survive before the both-halves check).\n")
for bk, title, pip in (('pooled', 'All 16 instruments pooled', False), ('eurusd', 'EURUSD alone', True)):
    b = books[bk]
    print(f'## {title}\n')
    for fm in FAMS:
        print(f'### {FAM_LABEL[fm]}\n\n{HDR}')
        for s in SESS:
            for u in USED:
                c = b['main'].get(f'{fm}|{s}|{u}')
                if c: print(line(f'{s}, range used {u}', c, pip))
        for k, c in b['mods'].items():
            if k.startswith(fm + '|'):
                _, mod, v = k.split('|'); print(line(f'_{mod}: {v}_', c, pip))
        print()
