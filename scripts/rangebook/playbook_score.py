"""Exhaustion playbook on EURUSD — scorer (forge/EXHAUSTION_PLAYBOOK_EURUSD_PREREG.md).
    python scripts/rangebook/playbook_score.py > analysis/output/rangebook/PLAYBOOK_RESULTS.md
"""
import json, math

R = json.load(open('analysis/output/rangebook/eurusd_playbook.json'))
SPLIT = '2023-01-01'

def st(x):
    n = len(x)
    if n < 2: return 0.0, 0.0, n
    m = sum(x) / n; sd = math.sqrt(sum((v - m) ** 2 for v in x) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n

def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung

def row(label, xs_all):
    a = st([v for d, v in xs_all if d < SPLIT]); b = st([v for d, v in xs_all if d >= SPLIT]); f = st([v for _, v in xs_all])
    wr = sum(v > 0 for _, v in xs_all) / len(xs_all) if xs_all else 0
    return f'| {label} | {f[2]} | {wr:.0%} | {a[0]:+.3f} ({a[1]:+.1f}) | {b[0]:+.3f} ({b[1]:+.1f}) | {f[0]:+.3f} ({f[1]:+.1f}) |', f, a, b

def playbook(r):
    if r['stretched'] and r['aligned'] and r['confirmed'] is not None: return r['confirmed']
    if (not r['stretched']) and r['expansion']: return r['follow']
    return None

comps = [
    ('all passes — fade at the touch (baseline)', lambda r: r['fade']),
    ('all passes — follow at the touch (baseline)', lambda r: r['follow']),
    ('WT stretched — fade at the touch', lambda r: r['fade'] if r['stretched'] else None),
    ('WT stretched — confirmed fade', lambda r: r['confirmed'] if r['stretched'] else None),
    ('USD-aligned — fade at the touch', lambda r: r['fade'] if r['aligned'] else None),
    ('USD-opposed — fade at the touch', lambda r: r['fade'] if r['aligned'] is False else None),
    ('WT stretched AND USD-aligned — fade at the touch', lambda r: r['fade'] if r['stretched'] and r['aligned'] else None),
    ('WT stretched AND USD-aligned — confirmed fade', lambda r: r['confirmed'] if r['stretched'] and r['aligned'] else None),
    ('not stretched — follow at the touch', lambda r: r['follow'] if not r['stretched'] else None),
    ('expansion day, not stretched — follow at the touch', lambda r: r['follow'] if (not r['stretched']) and r['expansion'] else None),
    ('**THE PLAYBOOK**', playbook),
]
print('# The exhaustion playbook on EURUSD\n')
print(f'Rule: forge/EXHAUSTION_PLAYBOOK_EURUSD_PREREG.md. {len(R):,} passes of every line, 2016–2026. Net R after spread, '
      'R = each trade\'s own stop. Fade target = the line behind, stop = the next line out; follow is the mirror.\n')
print('## 1. Each piece, then the playbook\n')
print('| rule | trades | win % | 2016–22 net R (t) | 2023–26 net R (t) | full net R (t) |'); print('|---|---|---|---|---|---|')
res = None
for lab, fn in comps:
    xs = [(r['date'], fn(r)) for r in R if fn(r) is not None]
    line, f, a, b = row(lab, xs); print(line)
    if lab.startswith('**THE'): res = (f, a, b)

print('\n## 2. The playbook by line family\n')
print('| line | trades | win % | 2016–22 | 2023–26 | full |'); print('|---|---|---|---|---|---|')
for fm in ('OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75'):
    xs = [(r['date'], playbook(r)) for r in R if fam(r['line']) == fm and playbook(r) is not None]
    if xs: print(row(fm, xs)[0])

f, a, b = res
ok = f[0] > 0 and f[1] >= 2.0 and a[0] > 0 and b[0] > 0
print(f"\n## Verdict (pre-registered): **{'PASS' if ok else 'FAIL'}** — playbook {f[0]:+.3f}R (t {f[1]:+.1f}, n {f[2]}); "
      f"2016–22 {a[0]:+.3f}, 2023–26 {b[0]:+.3f}. About the 13th level test on these lines.")
