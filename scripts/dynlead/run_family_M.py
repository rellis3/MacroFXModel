"""Run COG-DYNAMIC-LEAD family M: the real pass (steps 1-3) and the selection-aware placebo draws.
    python scripts/dynlead/run_family_M.py [--draws 40] [--workers 8]
Writes analysis/output/dynlead/familyM_cells.parquet, familyM_placebo.csv"""
import argparse
import sys
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E


def one_draw(seed):
    ad, yd, S = E.load()
    rng = np.random.default_rng(1000 + seed)
    df = E.family_M(ad, E.shifted_spreads(S, rng))
    d, c = E.pipeline(df)
    return dict(draw=seed, **c)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--draws', type=int, default=40)
    ap.add_argument('--workers', type=int, default=8)
    A = ap.parse_args()
    ad, yd, S = E.load()
    df = E.family_M(ad, S)
    d, c = E.pipeline(df)
    d.to_parquet(E.PAN / 'familyM_cells.parquet')
    print('REAL family M:', c, 'cells', len(d), flush=True)
    with ProcessPoolExecutor(max_workers=A.workers) as ex:
        res = list(ex.map(one_draw, range(A.draws)))
    pl = pd.DataFrame(res)
    pl.to_csv(E.PAN / 'familyM_placebo.csv', index=False)
    print('PLACEBO', pl.describe().round(2).to_string(), flush=True)
    real = c
    print('real oos_pass', real['oos_pass'], 'placebo p95', float(pl.oos_pass.quantile(0.95)), '| real best OOS Sharpe', real['best_oos_sharpe'], 'placebo p95', float(pl.best_oos_sharpe.quantile(0.95)))
    print('FAMILY_M_DONE', flush=True)
