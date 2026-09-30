"""Study 3 scorer — forge/RESIDUAL_INTRADAY_PREREG.md.
    python scripts/rangebook/residual_score.py > analysis/output/rangebook/RESIDUAL_RESULTS.md
"""
import json, math, statistics as stt

PAIRS = {'gold': 'Gold ← USD basket', 'nq': 'NAS100 ← SPX500', 'gbpusd': 'GBPUSD ← EURUSD', 'nzdusd': 'NZDUSD ← AUDUSD'}
SPLIT = '2023-01-01'

def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n

D = {p: json.load(open(f'analysis/output/rangebook/{p}_residual.json'))['rows'] for p in PAIRS}
print('# Study 3 — intraday relative value: does a lagging market catch up?\n')
print('Rule: forge/RESIDUAL_INTRADAY_PREREG.md. First |z| ≥ 2 residual between 07:00 and 16:00 London each day; trade the '
      'target toward closing the gap; exit when the gap closes, after 60 minutes, or at the day end. Net of spread, σ units.\n')
print('| pair | median β | trades | win % | net 2016–22 (t) | net 2023–26 (t) | hedged (both legs) | median hold (min) |')
print('|---|---|---|---|---|---|---|---|')
pos = 0; allr = {'a': [], 'b': []}
for p, lab in PAIRS.items():
    R = D[p]
    a = st([r['ret'] for r in R if r['date'] < SPLIT]); b = st([r['ret'] for r in R if r['date'] >= SPLIT])
    allr['a'] += [r['ret'] for r in R if r['date'] < SPLIT]; allr['b'] += [r['ret'] for r in R if r['date'] >= SPLIT]
    full = st([r['ret'] for r in R]); pos += full[0] > 0
    h = st([r['hedged'] for r in R])
    print(f"| {lab} | {stt.median(r['beta'] for r in R):+.2f} | {len(R)} | {sum(r['ret'] > 0 for r in R) / len(R):.0%} | "
          f"{a[0]:+.3f} ({a[1]:+.1f}) | {b[0]:+.3f} ({b[1]:+.1f}) | {h[0]:+.3f} ({h[1]:+.1f}) | {stt.median(r['mins'] for r in R):.0f} |")
A, B = st(allr['a']), st(allr['b'])
ok = A[0] > 0 and A[1] >= 2 and B[0] > 0 and B[1] >= 2 and pos >= 3
print(f'\nPooled: 2016–22 {A[0]:+.3f} (t {A[1]:+.1f}, n {A[2]}); 2023–26 {B[0]:+.3f} (t {B[1]:+.1f}, n {B[2]}); positive on {pos} of 4.\n')
print(f"**Verdict (pre-registered): {'PASS' if ok else 'FAIL'}**\n")
print('Descriptive (not a pass rule): the opposite trade (follow the gap) earns roughly minus these figures before a second '
      'spread; it was not pre-registered and is not a finding.')
