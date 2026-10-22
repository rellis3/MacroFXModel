"""Study 1 scorer — forge/EXITS_PREREG.md.
    python scripts/rangebook/exit_score.py > analysis/output/rangebook/EXITS_RESULTS.md
"""
import json, math
from crosspair_buckets import ALL

SPLIT = '2023-01-01'
FOLLOW = {'X0': 'target next line (baseline)', 'X1': 'hold to day end', 'X2': 'exit when range reaches p75',
          'X3': 'exit when the extreme is probably in (P < 0.35)', 'X5': 'breakeven stop after 0.3σ', 'X6': 'time exit 16:00'}
FADE = {'F0': 'stop at p75, target open (baseline)', 'F4': 'stop 0.4σ beyond the line', 'F3': 'exit if the extreme will probably break (P > 0.65)',
        'F5': 'breakeven stop after 0.3σ', 'F6': 'time exit 16:00'}

def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n

data = {p: json.load(open(f'analysis/output/rangebook/{p}_exits.json'))['rows'] for p in ALL}
def pooled(key, train):
    return [r['r'][key] for p in ALL for r in data[p] if (r['date'] < SPLIT) == train]

print('# Study 1 — exits driven by the range book\n')
print(f"Rule: forge/EXITS_PREREG.md. Entries: first OH/OL p50 touch, 16 instruments "
      f"({sum(len(v) for v in data.values()):,} entries). Net R after spread, R = initial stop distance. "
      "Train 2016–2022 (selection), test 2023–2026-08 (confirmation).\n")
verdicts = []
for side, grid in (('Follow', FOLLOW), ('Fade', FADE)):
    print(f'## {side}\n')
    print('| exit | rule | train net R (t) | test net R (t) | test instruments positive |'); print('|---|---|---|---|---|')
    best = None
    for key, lab in grid.items():
        a, b = st(pooled(key, True)), st(pooled(key, False))
        pos = sum(st([r['r'][key] for r in data[p] if r['date'] >= SPLIT])[0] > 0 for p in ALL)
        print(f'| {key} | {lab} | {a[0]:+.3f} ({a[1]:+.1f}) | {b[0]:+.3f} ({b[1]:+.1f}) | {pos}/16 |')
        if a[0] > 0 and a[1] >= 2.5 and (best is None or a[0] > best[1]): best = (key, a[0], b, pos)
    if best:
        key, _, b, pos = best
        ok = b[0] > 0 and b[1] >= 2.0 and pos >= 10
        verdicts.append(f"{side}: selected **{key}** ({grid[key]}) → test {b[0]:+.3f}R (t {b[1]:+.1f}), {pos}/16 positive → **{'CONFIRMED' if ok else 'FAIL'}**")
    else:
        verdicts.append(f'{side}: no exit qualified on train (net R > 0 with t ≥ 2.5) → **FAIL**')
    print()
print('## Verdicts (pre-registered)\n')
for v in verdicts: print(f'- {v}')
