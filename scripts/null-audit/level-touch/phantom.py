"""Phantom-level placebo (steps 3-4): the comparison the Evidence Book entry describes
("paired controls at random non-level prices") but the banked code does not run.

For every session, touches are detected on the REAL geometry (scale 1) and on PHANTOM
geometries whose every distance from the anchor is scaled by 0.8 / 0.9 / 1.1 / 1.2 -- same
day, same anchor, same touch rule, same rearm fraction, same forward measure. A phantom line
is a price that is not a drawn line but sits at a similar depth, so it shares the
momentum / day-selection / time-of-day profile the random-time control cannot match.

  python phantom.py <pair> <tag> [m1_dir]
Writes analysis/output/null-audit/level-touch/phantom/<tag>/<pair>.npz
"""
import json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import indep_core as ic

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PARAMS = json.load(open(os.path.join(os.path.dirname(__file__), 'ladder_params_2026-09-10.json')))
SCALES = [1.0, 0.8, 0.9, 1.1, 1.2]


def run(pair, tag, m1_dir=None):
    t0 = time.time()
    sec, o, h, l, c, key = ic.load_m1(pair, m1_dir)
    rows, sess, dropped = ic.day_table(pair, sec, o, h, l, c, key, PARAMS)
    cols = {k: [] for k in ['date', 'fam', 'scale', 'side', 'minsLeft', 'edge', 'lim0', 'eod',
                            'r5', 'r15', 'r30', 'r60', 'r120', 'hour']}
    for d in rows:
        ds = d['dayScale']
        for sc in SCALES:
            for x in ic.touches_for_day(sec, h, l, c, d, scale=sc):
                cols['date'].append(d['date']); cols['fam'].append(ic.FAMS.index(x['family']))
                cols['scale'].append(sc); cols['side'].append(x['side']); cols['minsLeft'].append(x['minsLeft'])
                cols['edge'].append((x['maxExt'] - abs(x['maxAdv'])) / ds)
                # within-bar part a LIMIT order at the line would have had: line -> touch-bar close,
                # signed in continuation direction (negative = already faded inside the bar)
                cols['lim0'].append((x['entry'] - x['level']) * x['side'] / ds)
                cols['eod'].append(x['eod'] / ds)
                for i, hz in enumerate(['r5', 'r15', 'r30', 'r60', 'r120']):
                    cols[hz].append(x['ret'][i] / ds)
                cols['hour'].append(int((x['t'] // 3600) % 24))
    out = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'level-touch', 'phantom', tag)
    os.makedirs(out, exist_ok=True)
    np.savez_compressed(os.path.join(out, f'{pair}.npz'),
                        **{k: np.array(v) for k, v in cols.items()},
                        meta=json.dumps(dict(pair=pair, sessions_ge200=len(sess), sessions_lt200=len(dropped),
                                             days=len(rows), secs=round(time.time() - t0, 1))))
    print(pair, tag, len(cols['date']), 'touches', round(time.time() - t0, 1), 's')


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
