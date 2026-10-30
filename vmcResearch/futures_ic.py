"""futures_ic.py - does any VuManChu component correlate with FUTURE price, on NQ futures vs the NQ CFD?

Owner question 2026-10-30 (register row nq-futures-vmc, exploratory). Same panels, same code, two price sources:
nqfut = the owner's CME NQ 1-minute file (real traded volume), nqcfd = the OANDA CFD cut to the same span. Only the
VWAP component uses volume (money_flow_vmc is candle-shape only), so that is where the sources can differ by construction.

For each component and timeframe: Spearman correlation with the PAST move (what it describes) and the FUTURE move (what it
predicts), and the partial future correlation after removing the recent return (does it add anything price doesn't
already say). Non-overlapping samples (every h-th base bar) so the t-stats are honest; first 60% / last 40% split.

    python vmcResearch/futures_ic.py
"""
import os

import numpy as np
import pandas as pd
from scipy import stats as sps

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
COMPONENTS = ('wt1', 'wt_spread', 'wt1_slope', 'mf', 'mf_slope', 'vwap_dist')


def rank_partial(x, y, z):
    """Spearman partial corr of x,y given z (residualise ranks on z ranks)."""
    rx, ry, rz = (sps.rankdata(v) for v in (x, y, z))
    A = np.c_[np.ones_like(rz), rz]
    ex = rx - A @ np.linalg.lstsq(A, rx, rcond=None)[0]
    ey = ry - A @ np.linalg.lstsq(A, ry, rcond=None)[0]
    return np.corrcoef(ex, ey)[0, 1]


def run(inst, rows):
    p = pd.read_parquet(os.path.join(DATA, 'panel_%s.parquet' % inst))
    c = p['close'].to_numpy(float)
    sig = p['sigma_price'].to_numpy(float)
    for h in (3, 10, 48):
        past = np.full(len(c), np.nan)
        past[h:] = (c[h:] - c[:-h]) / sig[h:]
        fut = p['fwd_sig_%d' % h].to_numpy(float)
        idx = np.arange(0, len(c), h)
        for tf in (5, 15, 60, 240):
            for comp in COMPONENTS:
                col = 'tf%d_%s' % (tf, comp)
                if col not in p:
                    continue
                x = p[col].to_numpy(float)
                ok = idx[np.isfinite(x[idx]) & np.isfinite(fut[idx]) & np.isfinite(past[idx])]
                if len(ok) < 1000:
                    continue
                cut = ok[int(len(ok) * 0.6)]
                r = {'instrument': inst, 'tf': tf, 'component': comp, 'h_bars5m': h, 'n': len(ok),
                     'past_ic': sps.spearmanr(x[ok], past[ok]).statistic,
                     'future_ic': sps.spearmanr(x[ok], fut[ok]).statistic,
                     'partial_future_ic': rank_partial(x[ok], fut[ok], past[ok])}
                r['t_partial'] = r['partial_future_ic'] * np.sqrt(len(ok) - 3)
                a, b = ok[ok < cut], ok[ok >= cut]
                r['partial_first60'] = rank_partial(x[a], fut[a], past[a])
                r['partial_last40'] = rank_partial(x[b], fut[b], past[b])
                rows.append(r)


def main():
    rows = []
    for inst in ('nqfut', 'nqcfd'):
        run(inst, rows)
    d = pd.DataFrame(rows)
    d.to_csv(os.path.join(DATA, 'futures_ic.csv'), index=False)
    w = d.pivot_table(index=['tf', 'component', 'h_bars5m'], columns='instrument',
                      values=['past_ic', 'future_ic', 'partial_future_ic', 't_partial'])
    pd.set_option('display.width', 250)
    print(w.round(3).to_string())
    print('\nmax |future_ic|:', d.groupby('instrument').future_ic.apply(lambda s: s.abs().max()).round(4).to_dict())
    print('max |partial|  :', d.groupby('instrument').partial_future_ic.apply(lambda s: s.abs().max()).round(4).to_dict())
    print('|t_partial|>3  :', d.groupby('instrument').t_partial.apply(lambda s: int((s.abs() > 3).sum())).to_dict(),
          'of', d.groupby('instrument').size().to_dict())
    s = d[d.t_partial.abs() > 3]
    print(s[['instrument', 'tf', 'component', 'h_bars5m', 'n', 'partial_future_ic', 't_partial', 'partial_first60', 'partial_last40']].round(4).to_string())


if __name__ == '__main__':
    main()
