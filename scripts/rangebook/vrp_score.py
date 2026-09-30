"""Your vol forecast vs implied vol — scorer (forge/VRP_FORECAST_PREREG.md).
    python scripts/rangebook/vrp_score.py > analysis/output/rangebook/VRP_RESULTS.md
"""
import json, math

D = json.load(open('analysis/output/rangebook/vrp.json'))
SPLIT = '2023-01-01'

def st(x):
    n = len(x)
    if n < 2: return 0.0, 0.0, n
    m = sum(x) / n; sd = math.sqrt(sum((v - m) ** 2 for v in x) / (n - 1))
    return m, (m / sd * math.sqrt(n) if sd else 0.0), n

def pay(r, cost): return (r['iv'] ** 2 - r['rv'] ** 2) / (2 * r['iv']) - cost

def corr(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))

print('# Your vol forecast vs implied vol — variance risk premium\n')
print('Rule: forge/VRP_FORECAST_PREREG.md. Monthly short-variance proxy, payoff (IV² − RV²)/(2·IV) in vol points, '
      'entered at each month\'s last NY close, 21-day horizon. IV = CME CVOL; F = your forecast σ (annualised).\n')
verdict = {}
for cost in (0.4, 0.8):
    print(f'## Cost {cost} vol points per trade\n')
    print('| instrument | months | A always short: mean (t) | B only when IV > F: months traded | B mean per traded month | B mean over all months (t) | B − A paired (t) |')
    print('|---|---|---|---|---|---|---|')
    pooledA, pooledB, pooledD, half = [], [], [], {'h1': [], 'h2': []}
    for p, rows in D.items():
        A = [pay(r, cost) for r in rows]
        B = [pay(r, cost) if r['iv'] > r['f'] else 0.0 for r in rows]
        dif = [b - a for a, b in zip(A, B)]
        traded = [pay(r, cost) for r in rows if r['iv'] > r['f']]
        a, b, d = st(A), st(B), st(dif)
        print(f"| {p.upper()} | {len(rows)} | {a[0]:+.2f} ({a[1]:+.1f}) | {len(traded)} | {st(traded)[0]:+.2f} | {b[0]:+.2f} ({b[1]:+.1f}) | {d[0]:+.2f} ({d[1]:+.1f}) |")
        pooledA += A; pooledB += B; pooledD += dif
        for r, x in zip(rows, B): half['h1' if r['date'] < SPLIT else 'h2'].append(x)
    a, b, d = st(pooledA), st(pooledB), st(pooledD)
    h1, h2 = st(half['h1']), st(half['h2'])
    print(f"| **pooled** | {a[2]} | {a[0]:+.2f} ({a[1]:+.1f}) | — | — | {b[0]:+.2f} ({b[1]:+.1f}) | {d[0]:+.2f} ({d[1]:+.1f}) |")
    print(f'\nB by period: 2016–2022 {h1[0]:+.2f} (t {h1[1]:+.1f}); 2023–2026 {h2[0]:+.2f} (t {h2[1]:+.1f}).\n')
    if cost == 0.4:
        verdict = {'beats': d[0] > 0 and d[1] >= 2.0, 'halves': h1[0] > 0 and h2[0] > 0}

rows = [r for v in D.values() for r in v]
gap = [r['iv'] - r['f'] for r in rows]; prem = [r['iv'] - r['rv'] for r in rows]
A = [pay(r, 0.4) for r in rows]
print('## Descriptive\n')
print(f"- Implied vol above realised (the market's premium): {sum(p > 0 for p in prem) / len(prem):.0%} of months; "
      f"mean IV − RV {sum(prem) / len(prem):+.2f} vol points.")
print(f"- Implied vol above YOUR forecast: {sum(g > 0 for g in gap) / len(gap):.0%} of months; mean IV − F {sum(gap) / len(gap):+.2f}.")
print(f"- Does the gap (IV − your forecast) predict the premium (IV − RV)? correlation {corr(gap, prem):+.2f}.")
print(f"- Forecast accuracy for next month's realised vol: mean |F − RV| {sum(abs(r['f'] - r['rv']) for r in rows) / len(rows):.2f} "
      f"vs mean |IV − RV| {sum(abs(r['iv'] - r['rv']) for r in rows) / len(rows):.2f} vol points.")
srt = sorted(A)
print(f"- Always-short tail: worst month {srt[0]:+.2f}, 5th percentile {srt[len(srt) // 20]:+.2f}, best {srt[-1]:+.2f} (vol points).\n")
print(f"## Verdict (pre-registered, cost 0.4): **{'PASS' if verdict['beats'] and verdict['halves'] else 'FAIL'}**")
print(f"- Forecast-filtered beats always-short (paired t ≥ 2): {'yes' if verdict['beats'] else 'no'}; "
      f"net positive in both halves: {'yes' if verdict['halves'] else 'no'}")
