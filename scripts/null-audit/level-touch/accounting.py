"""Step 5: row accounting at every stage, from the independent run (indep/<pair>.json), the
banked response files and the banked control files.

  python accounting.py <banked_response_dir> <banked_control_dir>
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import indep_core as ic

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
IND = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'level-touch', 'indep')
PARAMS = json.load(open(os.path.join(os.path.dirname(__file__), 'ladder_params_2026-09-10.json')))
rd, cd = sys.argv[1], sys.argv[2]
tot = dict(lon=0, lt200=0, ge200=0, warm=0, withtouch=0, touches=0, lastbar=0, nullext=0)
famT = {f: 0 for f in ic.FAMS}; famA = {f: 0 for f in ic.FAMS}; famB = {f: 0 for f in ic.FAMS}
print('pair     londonDates  <200bars  >=200  afterWarmup  withTouch  touches  lastBarDropped  ctrlA  ctrlB  coverage')
for f in sorted(os.listdir(IND)):
    p = f[:-5]; a = json.load(open(os.path.join(IND, f)))
    r = json.load(open(os.path.join(rd, f'{p}-response.json')))
    c = json.load(open(os.path.join(cd, f'{p}-control.json')))
    # touches dropped because they were on the session's last bar (no forward path): recount raw
    sec, o, h, l, cc, key = ic.load_m1(p)
    rows, _, _ = ic.day_table(p, sec, o, h, l, cc, key, PARAMS)
    last = 0
    for d in rows:
        e = d['e']
        # touches on bar e-1 of the static ladder (dynamic/dopen last-bar drops not counted here)
        for side, lv in ((1, d['up']), (-1, d['dn'])):
            for ri in range(3):
                ks = ic.walk_static(h, l, cc, d['s'], e, lv[ri + 1], lv[ri], side == 1)
                last += sum(1 for k in ks if k == e - 1)
    nA = sum(v['n'] for v in c['A'].values() if v); nB = sum(v['n'] for v in c['B'].values() if v)
    nt = sum(len(d['touches']) for d in r['days'])
    nnull = sum(1 for d in r['days'] for t in d['touches'] if t['maxExt'] is None or t['maxAdv'] is None)
    for d in r['days']:
        for t in d['touches']: famT[t['family']] += 1
    for fam, v in c['A'].items(): famA[fam] += v['n'] if v else 0
    for fam, v in c['B'].items(): famB[fam] += v['n'] if v else 0
    lon = a['sessions_ge200'] + a['sessions_lt200']
    print(f"{p:8s} {lon:11d} {a['sessions_lt200']:9d} {a['sessions_ge200']:6d} {a['days_after_warmup_sigma']:12d} "
          f"{a['days_banked']:10d} {nt:8d} {last:15d} {nA:6d} {nB:6d}  {r['coverage']['from']}..{r['coverage']['to']}")
    tot['lon'] += lon; tot['lt200'] += a['sessions_lt200']; tot['ge200'] += a['sessions_ge200']
    tot['warm'] += a['days_after_warmup_sigma']; tot['withtouch'] += a['days_banked']; tot['touches'] += nt
    tot['lastbar'] += last; tot['nullext'] += nnull
print('TOTAL', tot)
print('family  touches  ctrlA (share)  ctrlB (share)')
for fam in ic.FAMS:
    print(f'{fam:6s} {famT[fam]:8d} {famA[fam]:8d} ({famA[fam]/famT[fam]:.3f}) {famB[fam]:8d} ({famB[fam]/famT[fam]:.3f})')
