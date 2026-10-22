"""Power + calibration audit for the EURUSD range/touch books (descriptive, no selection).
    python scripts/rangebook/audit.py > analysis/output/rangebook/eurusd_AUDIT.md
1. Line coverage: how often each forecast line is reached vs its nominal rate.
2. The forecast vs dumb baselines for the day's range, by quantile loss at p50/p75/p90.
3. Minimum detectable effects of the tests already run.
"""
import json, math, collections

SPLIT = '2023-01-01'
recs = json.load(open('analysis/output/rangebook/eurusd.json'))['records']
touch = json.load(open('analysis/output/rangebook/eurusd_touches.json'))['rows']
HL = {'p50': 1.4417, 'p75': 1.8877, 'p90': 2.3967}            # EURUSD fitted hl widths (forecastLadderParams.js)
Q = {'p50': 0.5, 'p75': 0.75, 'p90': 0.9}
half = lambda d: 'train' if d < SPLIT else 'test'

print('# EURUSD books — power and calibration audit\n')
print('Descriptive checks prompted by an outside review; no selection happens here. Train = 2016-03 → 2022-12, '
      'test = 2023-01 → 2026-08.\n')

# ── 1. Coverage ──
touched = collections.defaultdict(set)
for r in touch: touched[r['date']].add(r['line'])
days = {h: [r['date'] for r in recs if half(r['date']) == h] for h in ('train', 'test')}
print('## 1. Is the forecast itself calibrated? Share of days each line is reached\n')
print('| line | nominal | train | test |'); print('|---|---|---|---|')
for name, nominal, test in [
    ('OH p50 (up side)', 0.50, lambda s: 'OH_p50' in s), ('OL p50 (down side)', 0.50, lambda s: 'OL_p50' in s),
    ('OH p75', 0.25, lambda s: 'OH_p75' in s), ('OL p75', 0.25, lambda s: 'OL_p75' in s),
    ('OH p90', 0.10, lambda s: 'OH_p90' in s), ('OL p90', 0.10, lambda s: 'OL_p90' in s),
    ('Close p50 (up)', 0.25, lambda s: 'CloseUp_p50' in s), ('Close p50 (down)', 0.25, lambda s: 'CloseDn_p50' in s)]:
    print(f"| {name} | {nominal:.0%} | " + ' | '.join(f"{sum(test(touched[d]) for d in days[h]) / len(days[h]):.0%}" for h in ('train', 'test')) + ' |')
print('\nClose lines are a CLOSE forecast (|close − open| ≥ line on 50%/25% of days), so being *touched* intraday '
      'is expected to exceed the nominal rate; they are listed for reference, not as a calibration failure.\n')
print('| day range reaches | nominal | train | test |'); print('|---|---|---|---|')
for rung in ('p50', 'p75', 'p90'):
    thr = HL[rung] / HL['p50']
    nominal = {'p50': .5, 'p75': .25, 'p90': .1}[rung]
    print(f"| hl {rung} | {nominal:.0%} | " + ' | '.join(
        f"{sum(r['dayRange'] >= thr for r in recs if half(r['date']) == h) / len(days[h]):.0%}" for h in ('train', 'test')) + ' |')

# ── 2. Forecast vs dumb baselines (quantile loss of the day range in %) ──
rng = [(r['date'], r['dayRange'] * r['hl50'], r['hl50'] / HL['p50']) for r in recs]   # (date, realized %, sigma % pre-width)
base = {'forecast σ (your lines)': [], "yesterday's range": [], 'EWMA of daily range (λ=0.94)': [], '20-day average range': []}
ew = None
for i, (d, real, sig) in enumerate(rng):
    prev = [x[1] for x in rng[max(0, i - 20):i]]
    if i >= 20:
        base['forecast σ (your lines)'].append((d, real, sig))
        base["yesterday's range"].append((d, real, rng[i - 1][1]))
        base['EWMA of daily range (λ=0.94)'].append((d, real, ew))
        base['20-day average range'].append((d, real, sum(prev) / len(prev)))
    ew = real if ew is None else 0.94 * ew + 0.06 * real

def pinball(rows, c, tau):
    return sum(max(tau * (y - c * x), (tau - 1) * (y - c * x)) for _, y, x in rows) / len(rows)

def fit_c(rows, tau):   # quantile multiplier fitted on TRAIN only (so every baseline gets the same calibration help)
    ratios = sorted(y / x for _, y, x in rows if x > 0)
    return ratios[int(tau * len(ratios))]

print('## 2. Your forecast vs simple baselines — quantile loss of the day\'s range (lower is better)\n')
print('Each predictor is scaled by a multiplier fitted on train only, at each quantile, so the comparison is about '
      'information, not calibration. Scored on TEST. Relative = loss ÷ the forecast\'s loss.\n')
print('| predictor | p50 loss (rel) | p75 loss (rel) | p90 loss (rel) |'); print('|---|---|---|---|')
ref = {}
for name, rows in base.items():
    tr = [x for x in rows if x[0] < SPLIT and x[2]]; te = [x for x in rows if x[0] >= SPLIT and x[2]]
    cells = []
    for rung, tau in Q.items():
        loss = pinball(te, fit_c(tr, tau), tau)
        if name.startswith('forecast'): ref[rung] = loss
        cells.append(f'{loss:.4f} ({loss / ref[rung]:.2f})')
    print(f'| {name} | ' + ' | '.join(cells) + ' |')
tr = [x for x in base['forecast σ (your lines)'] if x[0] >= SPLIT]
print('\nUnscaled (your lines as drawn) on test: ' + ', '.join(f'{rung} {pinball(tr, HL[rung], Q[rung]):.4f}' for rung in Q) + '.\n')

# ── 3. Minimum detectable effects ──
print('## 3. How small an edge could the tests have seen?\n')
print('Minimum detectable effect (MDE) at 80% power, two-sided 5%: ≈ 2.8 × standard error.\n')
print('| test | sample (test period) | standard error | MDE |'); print('|---|---|---|---|')
def sd(xs):
    m = sum(xs) / len(xs); return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))
def fam(line):
    f, rung = line.split('_'); return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
tt = [r for r in touch if not r['sameBar'] and r['date'] >= SPLIT]
for fm in ('OHOL_p50', 'OHOL_p75', 'Proj_p50'):
    xs = [r for r in tt if fam(r['line']) == fm]
    fol = []
    for r in xs:
        o = r['outcome']; dc, df = r['dc'], r['df']
        g = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, r['lastMove'] / df))
        fol.append(g)
    se = sd(fol) / math.sqrt(len(fol))
    p = sum(r['outcome'] == 'cont' for r in xs) / len(xs); sep = math.sqrt(p * (1 - p) / len(xs))
    print(f'| {fm} follow, per trade | {len(xs)} touches | {se:.3f} R ({sep * 100:.1f}pp continue rate) | {2.8 * se:.3f} R ({2.8 * sep * 100:.1f}pp) |')
for lab, n in (('a pre-day subgroup, e.g. FOMC/NFP/CPI days', 111), ('a mid-size subgroup (~400 days)', 400), ('all test days', 943)):
    se = math.sqrt(0.25 / n)
    print(f'| day range ≥ p50, {lab} | {n} days | {se * 100:.1f}pp | {2.8 * se * 100:.1f}pp |')
cost = sorted(r['costSig'] for r in touch)[len(touch) // 2]
print(f'\nFor scale: the round-trip spread is ≈{cost:.3f}σ, which is ≈{cost / 0.62:.3f}R on a follow trade at the '
      'OH/OL median (stop at the open, ~0.62σ away) — about 3pp of continue rate.')
