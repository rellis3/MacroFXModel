"""Step 3: write a PLANTED copy of a pair's M1 parquet: at every real open-anchored ladder touch
(oh/ol p50/p75/p90), with probability p, price fades back by delta x dayScale over 30 minutes.

  python plant.py <pair> <p> <delta_frac> <out_dir> [seed]
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import indep_core as ic

PARAMS = json.load(open(os.path.join(os.path.dirname(__file__), 'ladder_params_2026-09-10.json')))

if __name__ == '__main__':
    pair, p, delta, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    seed = int(sys.argv[5]) if len(sys.argv) > 5 else 20260910
    t0 = time.time()
    os.makedirs(out, exist_ok=True)
    sec, o, h, l, c, key = ic.load_m1(pair)
    o2, h2, l2, c2, n = ic.plant_pair(pair, sec, o, h, l, c, key, PARAMS, p, delta, seed)
    ic.write_parquet(os.path.join(out, f'{pair}_m1.parquet'), sec, o2, h2, l2, c2)
    json.dump(dict(pair=pair, p=p, delta=delta, seed=seed, planted=n), open(os.path.join(out, f'{pair}_plant.json'), 'w'))
    print(pair, 'planted', n, 'reactions', round(time.time() - t0, 1), 's')
