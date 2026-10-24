"""Step 4: run the independent implementation on a pair and compare touch-by-touch with the
banked response file (analysis/output/line-touch-response/<pair>-response.json).

  python scripts/null-audit/level-touch/indep_compare.py eurusd [banked_dir]
Writes analysis/output/null-audit/level-touch/indep/<pair>.json
"""
import json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import indep_core as ic

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'level-touch', 'indep')
os.makedirs(OUT, exist_ok=True)
PARAMS = json.load(open(os.path.join(os.path.dirname(__file__), 'ladder_params_2026-09-10.json')))


def main(pair, banked_dir):
    t0 = time.time()
    sec, o, h, l, c, key = ic.load_m1(pair)
    rows, sess, dropped = ic.day_table(pair, sec, o, h, l, c, key, PARAMS)
    mine = {}
    days_with = 0
    for d in rows:
        ts = ic.touches_for_day(sec, h, l, c, d)
        if not ts: continue
        days_with += 1
        for x in ts:
            mine[(d['date'], x['family'], x['side'], x['t'])] = (x, d['dayScale'], d['sigma'])
    b = json.load(open(os.path.join(banked_dir, f'{pair}-response.json')))
    bank = {}
    sig_err = []
    for d in b['days']:
        for x in d['touches']:
            bank[(d['date'], x['family'], 1 if x['side'] == 'up' else -1, x['t'])] = (x, d['dayScale'], d['sigma'])
    bydate = {d['date']: d for d in rows}
    for d in b['days']:
        m = bydate.get(d['date'])
        if m: sig_err.append(abs(m['sigma'] - d['sigma']) / d['sigma'])
    both = set(mine) & set(bank)
    only_m = set(mine) - set(bank); only_b = set(bank) - set(mine)
    fam = {}
    for f in ic.FAMS:
        em = [(v[0]['maxExt'] - abs(v[0]['maxAdv'])) / v[1] for k, v in mine.items() if k[1] == f]
        eb = [(v[0]['maxExt'] - abs(v[0]['maxAdv'])) / v[1] for k, v in bank.items() if k[1] == f]
        dm = [abs(((mine[k][0]['maxExt'] - abs(mine[k][0]['maxAdv'])) / mine[k][1]) -
                  ((bank[k][0]['maxExt'] - abs(bank[k][0]['maxAdv'])) / bank[k][1])) for k in both if k[1] == f]
        fam[f] = dict(n_indep=len(em), n_banked=len(eb), edge_indep=float(np.mean(em)) if em else None,
                      edge_banked=float(np.mean(eb)) if eb else None,
                      matched=sum(1 for k in both if k[1] == f),
                      max_abs_edge_diff_matched=float(max(dm)) if dm else None)
    res = dict(pair=pair, sessions_ge200=len(sess), sessions_lt200=len(dropped),
               days_after_warmup_sigma=len(rows), days_with_touch_indep=days_with,
               days_banked=len(b['days']), touches_indep=len(mine), touches_banked=len(bank),
               matched=len(both), only_indep=len(only_m), only_banked=len(only_b),
               sigma_rel_err_median=float(np.median(sig_err)) if sig_err else None,
               sigma_rel_err_max=float(np.max(sig_err)) if sig_err else None,
               examples_only_indep=[list(map(str, k)) for k in sorted(only_m)[:5]],
               examples_only_banked=[list(map(str, k)) for k in sorted(only_b)[:5]],
               families=fam, secs=round(time.time() - t0, 1))
    json.dump(res, open(os.path.join(OUT, f'{pair}.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != 'families'}))
    for f, v in fam.items(): print(' ', f, v)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'analysis', 'output', 'line-touch-response'))
