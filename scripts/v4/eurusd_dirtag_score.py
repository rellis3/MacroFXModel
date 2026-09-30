"""Scores analysis/output/v4_dirtag/eurusd.json against forge/V4_EURUSD_DIRTAG_PREREG.md.
    python3 scripts/v4/eurusd_dirtag_score.py > analysis/output/v4_dirtag/RESULTS.md
"""
import json, math, collections

SPLIT = '2024-09-29'
d = json.load(open('analysis/output/v4_dirtag/eurusd.json'))


def binom_p(k, n):  # two-sided, normal approx with continuity correction
    if n == 0: return 1.0
    z = (abs(k - n / 2) - 0.5) / math.sqrt(n / 4)
    return math.erfc(max(z, 0) / math.sqrt(2))


def st(xs):
    n = len(xs)
    if n < 2: return 0.0, 0.0, n
    m = sum(xs) / n; sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n


print('# today.html direction tag — EURUSD 6-year replay\n')
print('Rule: forge/V4_EURUSD_DIRTAG_PREREG.md. Drivers only (HMM regime, structural travel, tape, range-used cap); '
      'COT/macro/carry/OI modifiers not replayed. H1 = 2020-09-29→2024-09-28, H2 = 2024-09-29→2026-09-28.\n')

# ── Test A ──
print('## A. Does the 08:00 London tag call the rest of the day?\n')
print('| half | tag | days | hit % | p vs 50% |'); print('|---|---|---|---|---|')
dist = collections.Counter()
passA = True
for half, sel in (('H1', lambda x: x['date'] < SPLIT), ('H2', lambda x: x['date'] >= SPLIT)):
    for lab, keep in (('all up/down', lambda t: t['direction'] in ('up', 'down')),
                      ('strong only', lambda t: t['direction'] in ('up', 'down') and t['strength'] == 'strong')):
        xs = [x for x in d['days'] if sel(x) and keep(x) and x['move'] != 0]
        hit = sum((x['move'] > 0) == (x['direction'] == 'up') for x in xs)
        p = binom_p(hit, len(xs))
        print(f"| {half} | {lab} | {len(xs)} | {100*hit/max(1,len(xs)):.1f} | {p:.3f} |")
        if lab == 'all up/down' and not (len(xs) and hit / len(xs) > 0.5 and p < 0.05): passA = False
for x in d['days']: dist[(x['direction'], x['strength'])] += 1
print(f"\nTag distribution at 08:00 over all days: {dict(dist)}")
print(f"\n**Test A: {'PASS' if passA else 'FAIL'}**\n")

# ── Test B ──
print('## B. Trading the forecast lines in the tag\'s direction\n')
print('| half | rule | trades | win % | net R | t | return @0.5% |'); print('|---|---|---|---|---|---|---|')
res = {}
for half, sel in (('H1', lambda x: x['date'] < SPLIT), ('H2', lambda x: x['date'] >= SPLIT)):
    for lab in ('with tag', 'with tag, strong only', 'against tag'):
        xs = []
        for t in d['touches']:
            if not sel(t) or not t['tag'] or t['tag']['direction'] not in ('up', 'down'): continue
            if lab == 'with tag, strong only' and t['tag']['strength'] != 'strong': continue
            tag_up = t['tag']['direction'] == 'up'
            line_up = t['side'] == 'up'
            follow = (tag_up == line_up)                # line on the tag's side -> follow
            if lab == 'against tag': follow = not follow
            g = -1.0 if t['r'] is None else (-t['r'] if follow else t['r'])
            xs.append(g - t['c'])
        m, tt, n = st(xs)
        res[(half, lab)] = (m, tt, n)
        wr = 100 * sum(x > 0 for x in xs) / n if n else 0
        print(f"| {half} | {lab} | {n} | {wr:.1f} | {m:+.3f} | {tt:+.1f} | {0.5*sum(xs):+.1f}% |")
h1, h2 = res[('H1', 'with tag')], res[('H2', 'with tag')]
passB = h1[0] > 0 and h2[0] > 0 and h2[1] >= 2
print(f"\n**Test B: {'PASS' if passB else 'FAIL'}**")
