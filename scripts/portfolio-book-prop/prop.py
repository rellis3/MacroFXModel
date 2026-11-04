"""portfolio-book-prop: the Portfolio Book's daily rows through the FTMO 2-step prop replica.

Prereg: forge/PORTFOLIO_BOOK_PROP_PREREG.md (§3 cells, §4 gate). The simulation is imported from
scripts/overnight-hold-toolkit/toolkit.py (one implementation for both studies). Reads rows_{A,B}.csv from
build_rows.mjs; writes results.json and toolkit_{A,B}.csv (C.OG's `Date,Return %,MAE %` upload format).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'overnight-hold-toolkit'))
import toolkit as tk  # noqa: E402

OUT = ROOT / 'analysis/output/portfolio-book-prop'
SEED = 20261104
SIZES = [0.5, 1, 2, 3, 5]
FEE = 0.54            # % of a 100k account (FTMO €540, owner to check)
HALF = '2021-01-01'
_cell = [0]


def rng():
    _cell[0] += 1
    return np.random.default_rng([SEED, _cell[0]])


def mean_ci(r, block=10, B=2000):
    """95% stationary-bootstrap CI of the daily mean (geometric block lengths, mean `block`)."""
    g = np.random.default_rng([SEED, 0])
    n, out = len(r), np.empty(B)
    for b in range(B):
        jump = g.random(n) < 1.0 / block            # a new block starts here
        jump[0] = True
        starts = g.integers(0, n, size=n)
        blk = np.cumsum(jump) - 1                   # block number of each step
        first = np.flatnonzero(jump)                # step at which each block starts
        idx = (starts[first][blk] + (np.arange(n) - first[blk])) % n
        out[b] = r[idx].mean()
    return float(np.quantile(out, 0.025)), float(np.quantile(out, 0.975))


def frame(df, mae_col='MAE %', shift=0.0):
    return pd.DataFrame({'Date': df.Date, 'Return %': df['Return %'] + shift, 'MAE %': df[mae_col] + shift})


def cell(rows, k):
    res = tk.simulate(rows, k, tk.FTMO, rng())
    res['ev_pct'] = res['breakeven_fee_pct_of_account'] - FEE
    return res


def slim(res):
    return {'funded': round(res['funded'], 4), 'median_days': res['median_days_to_funded'],
            'payout12m': round(res['payout_12m_pct_of_account'], 3), 'ev': round(res['ev_pct'], 3),
            'phase1_fail': round(res['phases'][0]['fail'], 4), 'phase1_timeout': round(res['phases'][0]['timeout'], 4)}


def grid(df, sizes, mae_col='MAE %', band=None):
    mu = df['Return %'].mean()
    out = {}
    for k in sizes:
        b, z = cell(frame(df, mae_col), k), cell(frame(df, mae_col, -mu), k)
        row = {'book': slim(b), 'zero': slim(z),
               'edge_pp': round(100 * (b['funded'] - z['funded']), 2),
               'edge_ev': round(b['ev_pct'] - z['ev_pct'], 3)}
        if band:
            lo, hi = cell(frame(df, mae_col, band[0] - mu), k), cell(frame(df, mae_col, band[1] - mu), k)
            row['band_low'], row['band_high'] = slim(lo), slim(hi)
            row['edge_ev_low'] = round(lo['ev_pct'] - z['ev_pct'], 3)
            row['edge_pp_low'] = round(100 * (lo['funded'] - z['funded']), 2)
        out[str(k)] = row
    return out


def main():
    build = json.loads((OUT / 'build.json').read_text())
    assert build['books']['A']['reconPass'], 'reconstruction check failed (prereg §3): no cell may run'
    res = {'id': 'portfolio-book-prop', 'seed': SEED, 'paths': tk.PATHS, 'fee_pct': FEE, 'program': tk.FTMO, 'books': {}}
    for bk in ['A', 'B']:
        df = pd.read_csv(OUT / f'rows_{bk}.csv')
        df[['Date', 'Return %', 'MAE %']].to_csv(OUT / f'toolkit_{bk}.csv', index=False)
        r = df['Return %'].to_numpy()
        ci = mean_ci(r)
        b = {'days': len(df), 'mean_daily_pct': float(r.mean()), 'ci95': ci,
             'sd_daily_pct': float(r.std()), 'worst_mae_pct': float(df['MAE %'].min())}
        tk.BLOCK = 5
        b['grid'] = grid(df, SIZES, band=ci)
        if bk == 'A':
            b['close_only'] = grid(df, SIZES, mae_col='MAE_cc %')
            tk.BLOCK = 21
            b['block21'] = grid(df, [0.5, 1, 2])
            tk.BLOCK = 5
            b['halves'] = {name: grid(part, SIZES) for name, part in
                           [('2016-2020', df[df.Date < HALF].reset_index(drop=True)),
                            ('2021-2026', df[df.Date >= HALF].reset_index(drop=True))]}
            # how far away: the k = 1 edge with the mean scaled up (descriptive, prereg §8)
            mu = r.mean()
            scaled = {}
            for m in [2, 3, 4, 6]:
                d2 = df.copy()
                d2['Return %'] += (m - 1) * mu
                d2['MAE %'] += (m - 1) * mu
                g = grid(d2, [1])['1']
                ann = (m * mu) / r.std() * np.sqrt(252)
                scaled[str(m)] = {'sharpe': round(float(ann), 2), 'edge_pp': g['edge_pp'], 'edge_ev': g['edge_ev'],
                                  'funded': g['book']['funded'], 'zero': g['zero']['funded']}
            b['mean_scaled_k1'] = scaled
        res['books'][bk] = b
        print(bk, 'done', flush=True)
    # THE GATE (§4): some k with edge >= 5pp, edge EV > 0 at the band's low end, and both halves edge EV > 0
    A = res['books']['A']
    gate = []
    for k, row in A['grid'].items():
        halves_ok = k in A['halves']['2016-2020'] and all(A['halves'][h][k]['edge_ev'] > 0 for h in A['halves'])
        gate.append({'k': float(k), 'a_edge_ge_5pp': row['edge_pp'] >= 5, 'b_edge_ev_low_gt_0': row['edge_ev_low'] > 0,
                     'c_halves': bool(halves_ok)})
    res['gate'] = {'cells': gate, 'reads_yes': any(g['a_edge_ge_5pp'] and g['b_edge_ev_low_gt_0'] and g['c_halves'] for g in gate)}
    (OUT / 'results.json').write_text(json.dumps(res, indent=1))
    print(json.dumps({'gate': res['gate']['reads_yes'],
                      'A_k1': A['grid']['1'], 'B_k1': res['books']['B']['grid']['1']}, indent=1))


if __name__ == '__main__':
    main()
