"""EURUSD Range Book scorer — applies forge/RANGE_BOOK_EURUSD_PREREG.md. Stdlib only.
    python scripts/rangebook/score.py [pair] > analysis/output/rangebook/<pair>_RESULTS.md
Also writes analysis/output/rangebook/<pair>_book.json (the train-fitted tables).
"""
import json, random, sys, collections

PAIR = (sys.argv[1] if len(sys.argv) > 1 else 'eurusd').lower()
SPLIT = '2023-01-01'
MIN_N = 50
recs = json.load(open(f'analysis/output/rangebook/{PAIR}.json'))['records']
recs = [r for r in recs if all(r['pre'][k] is not None for k in ('sigmaReg', 'hmm', 'yRange'))]


def bk(v, edges, names):
    for e, n in zip(edges, names):
        if v < e: return n
    return names[-1]


DIST = lambda v: bk(v, (0.25, 0.5, 1.0), ('<0.25', '0.25-0.5', '0.5-1', '>1'))
USED = lambda v: bk(v, (0.4, 0.7, 1.0), ('<0.4', '0.4-0.7', '0.7-1', '>1'))
EXTD = lambda v: bk(v, (0.1, 0.3, 0.6), ('<0.1', '0.1-0.3', '0.3-0.6', '>0.6'))
CTIME = lambda m: bk(m, (8 * 60, 13 * 60, 17 * 60), ('<08', '08-13', '13-17', '17+'))
DRIVE = lambda m: bk(m, (60, 240), ('<60m', '60-240m', '>240m'))


def fam(line):
    if line.startswith('Range_'): return line
    rung = line.split('_')[1]
    return ('Close_' if line.startswith('Close') else 'OHOL_') + rung


def hmm_or(h, side):
    if h == 'RANGE' or side is None: return 'RANGE' if h == 'RANGE' else 'TREND'
    return 'with' if (h == 'TREND_up') == (side in ('up',)) else 'against'


REG = ('sigmaReg', 'hmm', 'yRange', 'event')

# ── rows: (day, is_train, base_key, {extra: value}, y) per question ──
def rows_A():
    out = []
    for r in recs:
        for a in r['A']:
            p = r['pre']
            out.append((r['date'], (a['h'], fam(a['line']), DIST(a['dist']), USED(a['used'])),
                        {'sigmaReg': p['sigmaReg'], 'hmm': hmm_or(p['hmm'], a['side']), 'yRange': p['yRange'], 'event': p['event']},
                        a['hit']))
    return out


def rows_C():
    out = []
    for r in recs:
        for c in r['C']:
            p = r['pre']
            out.append((r['date'], (c['h'], USED(c['used']), EXTD(c['dist'])),
                        {'sigmaReg': p['sigmaReg'], 'hmm': hmm_or(p['hmm'], c['side']), 'yRange': p['yRange'], 'event': p['event']},
                        c['exceeded']))
    return out


def rows_B(outcome):
    out = []
    for r in recs:
        b = r['B']
        if not b or b[outcome] is None: continue
        p = r['pre']
        side = 'up' if b['dir'] == 'up' else 'dn'
        out.append((r['date'], (b['dir'], CTIME(b['londonMin'])),
                    {'drive': DRIVE(b['driveMin']), 'sigmaReg': p['sigmaReg'], 'hmm': hmm_or(p['hmm'], 'up' if side == 'up' else 'dn'),
                     'yRange': p['yRange'], 'event': p['event']}, b[outcome]))
    return out


def fit(train, extras):
    """Cell frequencies with back-off: full key -> base key -> base key minus trailing parts."""
    cnt = collections.defaultdict(lambda: [0, 0])
    for _, base, ex, y in train:
        full = base + tuple(ex[e] for e in extras)
        for i in range(len(full) + 1):
            c = cnt[full[:i]]; c[0] += y; c[1] += 1
    def pred(base, ex):
        full = base + tuple(ex[e] for e in extras)
        for i in range(len(full), -1, -1):
            h, n = cnt[full[:i]]
            if n >= MIN_N: return (h + 1) / (n + 2)
        h, n = cnt[()]
        return (h + 1) / (n + 2)
    return pred, cnt


def per_day_se(test, pred):
    se = collections.defaultdict(float)
    for d, base, ex, y in test:
        se[d] += (pred(base, ex) - y) ** 2
    return se


def bss(test, pred_m, pred_b, boots=1000, seed=7):
    a, b = per_day_se(test, pred_m), per_day_se(test, pred_b)
    days = sorted(b)
    A, B = [a[d] for d in days], [b[d] for d in days]
    point = 1 - sum(A) / sum(B)
    rnd = random.Random(seed); n = len(days); vals = []
    for _ in range(boots):
        idx = [rnd.randrange(n) for _ in range(n)]
        sb = sum(B[i] for i in idx)
        vals.append(1 - sum(A[i] for i in idx) / sb if sb else 0)
    vals.sort()
    return point, vals[int(0.025 * boots)], vals[int(0.975 * boots) - 1]


def split(rows):
    return [x for x in rows if x[0] < SPLIT], [x for x in rows if x[0] >= SPLIT]


def reliability(test, pred):
    bins = collections.defaultdict(lambda: [0.0, 0, 0])
    for _, base, ex, y in test:
        p = pred(base, ex); k = min(9, int(p * 10)); bins[k][0] += p; bins[k][1] += y; bins[k][2] += 1
    return [(k / 10, (k + 1) / 10, v[0] / v[2], v[1] / v[2], v[2]) for k, v in sorted(bins.items())]


def evaluate(name, rows, extras_list, base_desc):
    tr, te = split(rows)
    base_pred, base_cnt = fit(tr, ())
    uncond = sum(y for *_, y in tr) / len(tr)
    u_point, u_lo, u_hi = bss(te, base_pred, lambda b, e: uncond)
    print(f'\n### {name}\n')
    print(f'Train {len(tr):,} rows, test {len(te):,} rows. Base cells: {base_desc}. '
          f'Unconditional train rate {uncond:.1%}.\n')
    print(f'Base model vs the unconditional rate: BSS **{u_point:+.3f}** (95% CI {u_lo:+.3f} to {u_hi:+.3f}).\n')
    print('| added to base | test BSS vs base | 95% CI | informative? |')
    print('|---|---|---|---|')
    res = {}
    for ex in extras_list:
        m_pred, _ = fit(tr, ex)
        p, lo, hi = bss(te, m_pred, base_pred)
        res['+'.join(ex)] = (p, lo, hi)
        print(f"| {' + '.join(ex)} | {p:+.4f} | {lo:+.4f} to {hi:+.4f} | {'**YES**' if lo > 0 else 'no'} |")
    print('\nReliability of the base model on test (predicted vs observed):\n')
    print('| predicted bin | mean predicted | observed | n |'); print('|---|---|---|---|')
    for lo_, hi_, mp, ob, n in reliability(te, base_pred):
        print(f'| {lo_:.1f}-{hi_:.1f} | {mp:.1%} | {ob:.1%} | {n:,} |')
    return base_cnt, res


def table(cnt, prefix_len_keys, rows_order, cols_order, title, fmt_row):
    pass


print(f'# {PAIR.upper()} Range Book — results\n')
print('Rule: forge/RANGE_BOOK_EURUSD_PREREG.md. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. '
      'BSS = Brier skill score (0 = no better than the reference, 1 = perfect). A variable is informative '
      'only if its whole 95% interval is above 0.\n')

single = [(e,) for e in REG]
book = {}
cA, rA = evaluate('Book A — reach: does price reach the line today, from the checkpoint?', rows_A(), single + [REG],
                  'checkpoint hour × line (Close/OHOL rung, or Range rung) × distance in σ × range used')
cC, rC = evaluate('Book C — is the running extreme the day\'s?', rows_C(), single + [REG],
                  'checkpoint hour × range used × distance to the running extreme in σ')
B_OUT = {'ext75': 'range extends to hl p75', 'ext90': 'range extends to hl p90',
         'backOpen': 'price returns to the open', 'backMid': 'price returns to the middle of the range'}
rB = {}
for o, lab in B_OUT.items():
    _, rB[o] = evaluate(f'Book B — after the forecast range completes: {lab}', rows_B(o),
                        [('drive',)] + single + [('drive',) + REG], 'completion direction × completion time (London)')

# ── Readable tables (train-fitted, shown with test outcome) ──
def rate(rows):
    return (sum(y for *_, y in rows) / len(rows), len(rows)) if rows else (None, 0)

print('\n## The book, as tables (train rate → test rate)\n')
print('### A. 07:00 London: chance of reaching each line by the end of the day\n')
tr, te = split(rows_A())
print('| line | distance (σ) | train | test | n test |'); print('|---|---|---|---|---|')
for f in ('Close_p50', 'OHOL_p50', 'Close_p75', 'OHOL_p75', 'OHOL_p90', 'Range_p50', 'Range_p75', 'Range_p90'):
    for d in ('<0.25', '0.25-0.5', '0.5-1', '>1'):
        a = rate([x for x in tr if x[1][0] == 7 and x[1][1] == f and x[1][2] == d])
        b = rate([x for x in te if x[1][0] == 7 and x[1][1] == f and x[1][2] == d])
        if a[1] >= 30 and b[1] >= 15:
            print(f'| {f} | {d} | {a[0]:.0%} | {b[0]:.0%} | {b[1]} |')

print('\n### B. After the forecast range completes\n')
print('| completion | time (London) | days train/test | → p75 range | → p90 range | back to open | back to mid |')
print('|---|---|---|---|---|---|---|')
for dr in ('down', 'up'):
    for ct in ('<08', '08-13', '13-17', '17+'):
        cells = []
        ns = None
        for o in B_OUT:
            tr_, te_ = split([x for x in rows_B(o) if x[1] == (dr, ct)])
            a, b = rate(tr_), rate(te_)
            if o == 'backMid': ns = f'{a[1]}/{b[1]}'
            cells.append(f"{a[0]:.0%} → {b[0]:.0%}" if a[1] >= 20 and b[1] >= 10 else '–')
        print(f"| {'down-drive (Proj L)' if dr == 'down' else 'up-drive (Proj H)'} | {ct} | {ns} | " + ' | '.join(cells) + ' |')

print('\n### B. Down-drive (high set first, then the predicted low): the next line touched\n')
print('| next line | train | test |'); print('|---|---|---|')
nb = collections.Counter(); nt = collections.Counter()
for r in recs:
    b = r['B']
    if not b or b['dir'] != 'down': continue
    (nb if r['date'] < SPLIT else nt)[b['next']] += 1
tb, tt = sum(nb.values()), sum(nt.values())
for k, _ in nb.most_common():
    print(f'| {k} | {nb[k]/tb:.0%} | {nt[k]/tt:.0%} |')

print('\n### C. Is the running high/low the day\'s? Chance it gets exceeded later\n')
tr, te = split(rows_C())
print('| checkpoint | range used | train | test | n test |'); print('|---|---|---|---|---|')
for h in (7, 10, 13, 16):
    for u in ('<0.4', '0.4-0.7', '0.7-1', '>1'):
        a = rate([x for x in tr if x[1][0] == h and x[1][1] == u])
        b = rate([x for x in te if x[1][0] == h and x[1][1] == u])
        if a[1] >= 30 and b[1] >= 15:
            print(f'| {h:02d}:00 | {u} | {a[0]:.0%} | {b[0]:.0%} | {b[1]} |')

json.dump({'A': {'|'.join(map(str, k)): v for k, v in cA.items()}, 'C': {'|'.join(map(str, k)): v for k, v in cC.items()}},
          open(f'analysis/output/rangebook/{PAIR}_book.json', 'w'))
