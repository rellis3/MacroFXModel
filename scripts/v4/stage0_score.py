"""Stage 0 scorer — applies forge/V4_STAGE0_PREREG.md's pass rule to
analysis/output/v4_stage0/*.json. Pure stdlib.
    python3 scripts/v4/stage0_score.py > analysis/output/v4_stage0/RESULTS.md
"""
import glob, json, math, collections

SPLIT = '2021-09-28'
FAM = {'OH_p50': 'OH/OL p50', 'OL_p50': 'OH/OL p50', 'OH_p75': 'OH/OL p75', 'OL_p75': 'OH/OL p75',
       'OH_p90': 'OH/OL p90', 'OL_p90': 'OH/OL p90', 'CloseUp_p50': 'Close p50', 'CloseDn_p50': 'Close p50',
       'CloseUp_p75': 'Close p75', 'CloseDn_p75': 'Close p75', 'ProjH_p50': 'Proj p50', 'ProjL_p50': 'Proj p50',
       'ProjH_p75': 'Proj p75', 'ProjL_p75': 'Proj p75', 'CtrlUp': 'Control (random)', 'CtrlDn': 'Control (random)'}
ORDER = ['OH/OL p50', 'OH/OL p75', 'OH/OL p90', 'Close p50', 'Close p75', 'Proj p50', 'Proj p75', 'Control (random)']


def mstat(xs):
    n = len(xs)
    if n < 2: return (float('nan'), float('nan'), n)
    m = sum(xs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return (m, m / sd * math.sqrt(n) if sd > 0 else float('nan'), n)


def score(mode):
    data = collections.defaultdict(list)   # (fam, dir, m) -> [(pair, date, gross, net)]
    for f in sorted(glob.glob(f'analysis/output/v4_stage0/*-{mode}.json')):
        d = json.load(open(f))
        for r in d['rows']:
            fam = FAM.get(r['line'])
            if not fam: continue
            for m in ('0.25', '0.5'):
                base = r['r' + m]
                for dr in ('fade', 'follow'):
                    g = -1.0 if base is None else (base if dr == 'fade' else -base)
                    data[(fam, dr, m)].append((d['pair'], r['date'], g, g - r['c' + m]))
    out = {}
    for key, rows in data.items():
        h1 = [x[3] for x in rows if x[1] < SPLIT]; h2 = [x[3] for x in rows if x[1] >= SPLIT]
        full = mstat([x[3] for x in rows]); gross = mstat([x[2] for x in rows])
        byday = collections.defaultdict(list)
        for x in rows: byday[(x[0], x[1])].append(x[3])
        clustered = mstat([sum(v) / len(v) for v in byday.values()])
        bypair = collections.defaultdict(list)
        for x in rows: bypair[x[0]].append(x[3])
        pos = sum(1 for v in bypair.values() if len(v) >= 30 and sum(v) / len(v) > 0)
        npairs = sum(1 for v in bypair.values() if len(v) >= 30)
        m1, m2 = mstat(h1)[0], mstat(h2)[0]
        passed = m1 > 0 and m2 > 0 and full[1] >= 2.0 and pos >= 11
        out[key] = dict(n=full[2], h1=m1, h2=m2, net=full[0], t=full[1], tc=clustered[1],
                        gross=gross[0], tg=gross[1], pos=pos, npairs=npairs, passed=passed,
                        carry=(not passed) and abs(gross[1]) >= 3.0 and gross[0] > 0)
    return out


res = {mode: score(mode) for mode in ('proxy', 'none')}
print('# Vote Atlas v4 — Stage 0 results\n')
print('Pass rule: forge/V4_STAGE0_PREREG.md. Net/gross in R (barrier = m·σ_day). '
      '`t` = pooled (registered); `t_day` = day-clustered (stricter, reported only). '
      'A row passes only if it passes under BOTH tag runs.\n')
for m in ('0.25', '0.5'):
    for dr in ('fade', 'follow'):
        print(f'\n## {dr}, m = {m}\n')
        print('| family | n | net H1 | net H2 | net | t | t_day | gross | t_gross | pairs>0 | proxy | none |')
        print('|---|---|---|---|---|---|---|---|---|---|---|---|')
        for fam in ORDER:
            a, b = res['proxy'].get((fam, dr, m)), res['none'].get((fam, dr, m))
            if not a: continue
            v = lambda s: 'PASS' if s['passed'] else ('carry' if s['carry'] else 'fail')
            print(f"| {fam} | {a['n']} | {a['h1']:+.3f} | {a['h2']:+.3f} | {a['net']:+.3f} | {a['t']:+.1f} | "
                  f"{a['tc']:+.1f} | {a['gross']:+.3f} | {a['tg']:+.1f} | {a['pos']}/{a['npairs']} | {v(a)} | {v(b)} |")
