"""COG-DYNAMIC-LEAD family D (divergence / catch-up): real pass and the selection-aware placebo. Writes familyD_cells.parquet, familyD_placebo.csv"""
import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E


def one_draw(seed):
    ad, yd, S = E.load()
    rng = np.random.default_rng(3000 + seed)
    d, c = E.pipeline(E.family_D(ad, E.shifted_spreads(S, rng)))
    return dict(draw=seed, **c)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--draws', type=int, default=40)
    ap.add_argument('--workers', type=int, default=2)
    A = ap.parse_args()
    ad, yd, S = E.load()
    d, c = E.pipeline(E.family_D(ad, S))
    d.to_parquet(E.PAN / 'familyD_cells.parquet')
    print('REAL family D:', c, 'cells', len(d), flush=True)
    with ProcessPoolExecutor(max_workers=A.workers) as ex:
        res = list(ex.map(one_draw, range(A.draws)))
    pl = pd.DataFrame(res)
    pl.to_csv(E.PAN / 'familyD_placebo.csv', index=False)
    print('PLACEBO', pl.describe().round(2).to_string(), flush=True)
    print('FAMILY_D_DONE', flush=True)
