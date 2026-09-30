"""Cross-pair range book, Q1 + Q2 + per-pair descriptives — forge/CROSSPAIR_RANGE_BOOK_PREREG.md.
    python scripts/rangebook/crosspair_score.py > analysis/output/rangebook/CROSSPAIR_RESULTS.md
"""
import json, collections
from brier import counts, add_counts, predictor, bss

SPLIT = '2023-01-01'
USD = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd']
CROSS = ['eurgbp', 'eurjpy', 'gbpjpy', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy']
ALL = USD + CROSS + ['gold']

def bk(v, edges, names):
    for e, n in zip(edges, names):
        if v < e: return n
    return names[-1]
DIST = lambda v: bk(v, (0.25, 0.5, 1.0), ('<0.25', '0.25-0.5', '0.5-1', '>1'))
USED = lambda v: bk(v, (0.4, 0.7, 1.0), ('<0.4', '0.4-0.7', '0.7-1', '>1'))
EXTD = lambda v: bk(v, (0.1, 0.3, 0.6), ('<0.1', '0.1-0.3', '0.3-0.6', '>0.6'))
def lfam(line):
    if line.startswith('Range_'): return line
    return ('Close_' if line.startswith('Close') else 'OHOL_') + line.split('_')[1]

R, A, C = {}, {}, {}
for p in ALL:
    recs = json.load(open(f'analysis/output/rangebook/{p}.json'))['records']
    R[p] = recs
    A[p] = [(r['date'], (a['h'], lfam(a['line']), DIST(a['dist']), USED(a['used'])), {}, a['hit']) for r in recs for a in r['A']]
    C[p] = [(r['date'], (c['h'], USED(c['used']), EXTD(c['dist'])), {}, c['exceeded']) for r in recs for c in r['C']]
tr = lambda rows: [x for x in rows if x[0] < SPLIT]
te = lambda rows: [x for x in rows if x[0] >= SPLIT]
fmt = lambda s: f'{s[0]:+.4f} ({s[1]:+.4f} to {s[2]:+.4f})'

print('# Cross-pair Range Book — results\n')
print('Rule: forge/CROSSPAIR_RANGE_BOOK_PREREG.md. 16 instruments, train 2016 → 2022, test 2023 → 2026-08. '
      'Skill = Brier improvement on the instrument\'s TEST rows; 95% day-bootstrap interval.\n')

# ── Per-pair descriptives ──
print('## 1. Each instrument on its own (test period)\n')
print('| instrument | days | range ≥ p50 / p75 / p90 (nominal 50 / 25 / 10) | Book A skill vs unconditional | Book C skill vs unconditional |')
print('|---|---|---|---|---|')
own = {}
for p in ALL:
    cA, cC = counts(tr(A[p])), counts(tr(C[p])); own[p] = (cA, cC)
    uA = sum(y for *_, y in tr(A[p])) / len(tr(A[p])); uC = sum(y for *_, y in tr(C[p])) / len(tr(C[p]))
    sA = bss(te(A[p]), predictor(cA), lambda b, e: uA); sC = bss(te(C[p]), predictor(cC), lambda b, e: uC)
    T = [r for r in R[p] if r['date'] >= SPLIT]
    cov = ' / '.join(f"{sum(r['dayRange'] >= r[k] / r['hl50'] for r in T) / len(T):.0%}" for k in ('hl50', 'hl75', 'hl90'))
    print(f'| {p.upper()} | {len(T)} | {cov} | {sA[0]:+.3f} | {sC[0]:+.3f} |')

# ── Q1: pooled (leave-one-out) vs own ──
print('\n## 2. Q1 — is one pooled book as good as each pair\'s own?\n')
print('Pooled = fitted on the other 15 instruments\' train rows. Skill of pooled vs own on this instrument\'s test rows: '
      '≥ 0 means the shared book is at least as good. "OK" = not significantly worse (interval reaches 0 or above).\n')
print('| instrument | Book A: pooled vs own | OK? | Book C: pooled vs own | OK? |'); print('|---|---|---|---|---|')
okA = okC = 0
for p in ALL:
    others = [q for q in ALL if q != p]
    pA = predictor(add_counts(*[own[q][0] for q in others])); pC = predictor(add_counts(*[own[q][1] for q in others]))
    sA = bss(te(A[p]), pA, predictor(own[p][0])); sC = bss(te(C[p]), pC, predictor(own[p][1]))
    a_ok, c_ok = sA[2] >= 0, sC[2] >= 0; okA += a_ok; okC += c_ok
    print(f"| {p.upper()} | {fmt(sA)} | {'yes' if a_ok else '**no**'} | {fmt(sC)} | {'yes' if c_ok else '**no**'} |")
print(f"\n**Q1 verdict:** Book A — {'one book serves all' if okA >= 13 else 'pairs need their own'} ({okA}/16 OK); "
      f"Book C — {'one book serves all' if okC >= 13 else 'pairs need their own'} ({okC}/16 OK). Threshold 13/16.\n")

# ── Q2: USD-only pool vs all-others pool, for the USD pairs ──
print('## 3. Q2 — do USD pairs share a book more closely?\n')
print('| USD pair | Book A: USD-pool vs all-pool | better? | Book C: USD-pool vs all-pool | better? |'); print('|---|---|---|---|---|')
bA = bC = 0
for p in USD:
    usd_o = [q for q in USD if q != p]; all_o = [q for q in ALL if q != p]
    sA = bss(te(A[p]), predictor(add_counts(*[own[q][0] for q in usd_o])), predictor(add_counts(*[own[q][0] for q in all_o])))
    sC = bss(te(C[p]), predictor(add_counts(*[own[q][1] for q in usd_o])), predictor(add_counts(*[own[q][1] for q in all_o])))
    bA += sA[1] > 0; bC += sC[1] > 0
    print(f"| {p.upper()} | {fmt(sA)} | {'**yes**' if sA[1] > 0 else 'no'} | {fmt(sC)} | {'**yes**' if sC[1] > 0 else 'no'} |")
print(f"\n**Q2 verdict:** USD grouping {'helps' if bA >= 5 or bC >= 5 else 'does not help'} "
      f"(Book A {bA}/7, Book C {bC}/7 significantly better; threshold 5/7).\n")

# ── Timing profile: is the extreme in? (Book C by checkpoint), per instrument ──
print('## 4. Timing profile — chance the running high/low is exceeded later (test period)\n')
print('| instrument | 07:00 | 10:00 | 13:00 | 16:00 |'); print('|---|---|---|---|---|')
for p in ALL:
    T = te(C[p])
    cells = []
    for h in (7, 10, 13, 16):
        x = [y for _, base, _, y in T if base[0] == h]
        cells.append(f'{sum(x) / len(x):.0%}' if x else '–')
    print(f"| {p.upper()} | " + ' | '.join(cells) + ' |')
print('\n(The pre-registration listed a "time-of-day continuation profile"; touch data was not built for the 15 new '
      'instruments, so this Book C timing profile stands in for it.)')
