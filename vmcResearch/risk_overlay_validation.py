"""risk_overlay_validation.py - R1, R6, R7, R8 from the post-Q47 research plan.

Scoped subset of the full R1-R9 list, chosen for what would actually change the
conclusion if it failed, and for what is cheap given data already on disk:

  R1  STABILITY   does extension->MAE hold by instrument, long/short, and
                  volatility regime, or is the pooled z~5 hiding a single
                  driving subgroup?
  R6  SECOND STRATEGY  does extension predict MAE at a SECOND, mechanically
                  unrelated strategy's entries (the ConfluenceBot zone engine,
                  not the vol-forecast fade)? This is the test that would turn
                  "improves my vol-fade" into "a general risk state".
  R7  INCREMENTAL over the fade's OWN volatility info  the vol-forecast fade's
                  entry distance is itself derived from an EWMA volatility
                  forecast (HL_75 ~ sigma_d). If extension only proxies for
                  "the forecast under/over-shot", it adds nothing incremental.
                  Tested via a rank-partial correlation against vol_rank.
  R8  INDEPENDENCE from M15 OB/OS  does M15 WaveTrend zone add anything to
                  extension's MAE prediction, or is it the same information
                  twice?

NOT run here: R2 (alternate stop definitions), R3/R4/R5 (sizing
implementation - premature before stability is established), R9 (gated
architecture - depends on R8's answer).
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
from scipy import stats as sps

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')


def block_z(a, b, n_reps=400):
    """z of mean(a)-mean(b) via independent bootstrap resampling of each group.

    a and b are generally different lengths (unequal quintile sizes), so each
    must be resampled with its OWN index array - resampling both with one
    shared index (the original bug here) throws whenever len(a) != len(b).
    """
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    if len(a) < 10 or len(b) < 10:
        return np.nan, np.nan
    rng = np.random.default_rng(0)
    na, nb = len(a), len(b)
    diffs = np.empty(n_reps)
    for i in range(n_reps):
        diffs[i] = a[rng.integers(0, na, na)].mean() - b[rng.integers(0, nb, nb)].mean()
    d0 = a.mean() - b.mean()
    return d0, d0 / diffs.std() if diffs.std() > 0 else np.nan


def r1_stability():
    t = pd.read_parquet(os.path.join(DATA, 'q47_trades.parquet'))
    print('=' * 78)
    print('R1  STABILITY  -  does extension->MAE hold across subgroups?')
    print('=' * 78)
    q = pd.qcut(t.ext_signed, 5, labels=False, duplicates='drop')
    t['q'] = q

    def split(name, mask):
        g = t[mask]
        if len(g) < 200:
            print('  %-24s n too small (%d)' % (name, len(g)))
            return
        lo = g[g.q == 0].mae_atr.to_numpy()
        hi = g[g.q == g.q.max()].mae_atr.to_numpy()
        if len(lo) < 30 or len(hi) < 30:
            print('  %-24s insufficient tail n' % name)
            return
        d, z = block_z(hi, lo)
        so_lo = g[g.q == 0].stopped.mean()
        so_hi = g[g.q == g.q.max()].stopped.mean()
        print('  %-24s n=%6d  MAE Q1->Q5 %+.3f (z=%5.2f)  stopout %.3f->%.3f'
              % (name, len(g), d, z, so_lo, so_hi))

    print('\n-- by instrument --')
    for inst, g in t.groupby('instrument'):
        split(inst, t.instrument == inst)

    print('\n-- by direction (does it work for both fade directions?) --')
    split('side = SELL (short)', t.side == -1)
    split('side = BUY (long)', t.side == 1)

    print('\n-- by volatility regime (vol_rank tercile) --')
    vt = pd.qcut(t.vol_rank.rank(method='first'), 3, labels=False)
    for k, name in enumerate(['low vol', 'mid vol', 'high vol']):
        split(name, vt == k)

    print('\n-- by session --')
    for lo, hi, name in ((0, 7, 'Asia'), (7, 12, 'London'), (12, 17, 'NY overlap'), (17, 24, 'NY late')):
        split(name, (t.ny_hour >= lo) & (t.ny_hour < hi))
    return t


def r7_incremental(t):
    print('\n' + '=' * 78)
    print('R7  INCREMENTAL OVER THE FADE\'S OWN VOLATILITY FORECAST')
    print('=' * 78)
    print('  The vol-fade entry distance IS an EWMA vol forecast (HL_75 ~ sigma_d).')
    print('  If extension only echoes "forecast under/over-shot", it adds nothing.')

    def rank(x):
        r = np.full(len(x), np.nan)
        ok = np.isfinite(x)
        r[ok] = sps.rankdata(x[ok]) / ok.sum()
        return r

    y = rank(t.mae_atr.to_numpy(float))
    x = rank(t.ext_signed.to_numpy(float))
    v = rank(t.vol_rank.to_numpy(float))
    m = np.isfinite(y) & np.isfinite(x) & np.isfinite(v)
    y, x, v = y[m], x[m], v[m]

    ic_raw = sps.spearmanr(x, y).statistic
    ic_vol_alone = sps.spearmanr(v, y).statistic
    # Partial: residualise x and y on v (rank vol), correlate residuals.
    A = np.column_stack([np.ones(m.sum()), v])
    bx = np.linalg.lstsq(A, x, rcond=None)[0]
    by = np.linalg.lstsq(A, y, rcond=None)[0]
    ex = x - A @ bx
    ey = y - A @ by
    ic_partial = sps.spearmanr(ex, ey).statistic

    print('  IC(extension -> MAE) raw                 : %+.4f' % ic_raw)
    print('  IC(vol_rank alone -> MAE)                 : %+.4f' % ic_vol_alone)
    print('  IC(extension -> MAE | vol_rank removed)   : %+.4f   <-- the incremental number' % ic_partial)
    if abs(ic_partial) > 0.5 * abs(ic_raw):
        print('  => extension survives controlling for the strategy\'s own vol forecast: INCREMENTAL')
    else:
        print('  => extension mostly restates the vol forecast: WEAK / NOT incremental')


def r8_independence_m15():
    print('\n' + '=' * 78)
    print('R8  IS M15 OB/OS INDEPENDENT OF VWAP EXTENSION?')
    print('=' * 78)
    print('  Using the main 5m panels (12 instruments) where tf15_wt1 already exists.')
    from vmcResearch import events as EV
    rows = []
    for inst in ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf',
                'eurjpy', 'gbpjpy', 'audjpy', 'eurgbp', 'xauusd', 'nq']:
        f = os.path.join(DATA, 'panel_%s.parquet' % inst)
        if not os.path.exists(f):
            continue
        p = EV.add_events(pd.read_parquet(f), horizons=(48,))
        r48 = p['resolve_48'].to_numpy()
        y = np.where(r48 == 1, 1.0, np.where(r48 == -1, 0.0, np.nan))
        wt15 = p['tf15_wt1'].to_numpy(float)
        vw = p['tf5_vwap_dist'].to_numpy(float)
        ph = p['phase'].to_numpy()
        ob_os = (np.abs(wt15) >= 53) & (ph == 0)
        ext_hi = np.abs(vw) >= np.nanpercentile(np.abs(vw[np.isfinite(vw)]), 80)
        m = np.isfinite(y)
        base = float(np.nanmean(y[m]))

        def cell(mask, lbl):
            mm = m & mask
            if mm.sum() < 300:
                return None
            return {'instrument': inst, 'cell': lbl, 'n': int(mm.sum()),
                    'delta': float(np.mean(y[mm])) - base}

        for lbl, mask in (('neither', ~ob_os & ~ext_hi), ('ext_only', ext_hi & ~ob_os),
                          ('obos_only', ob_os & ~ext_hi), ('both', ob_os & ext_hi)):
            r = cell(mask, lbl)
            if r:
                rows.append(r)
    d = pd.DataFrame(rows)
    piv = d.pivot_table(index='instrument', columns='cell', values='delta')
    print('\n  delta P(continuation) vs instrument base, by combination (pp):')
    print((piv * 100).round(2).to_string())
    print('\n  pooled mean delta by cell:')
    print((d.groupby('cell').delta.mean() * 100).round(2).to_string())
    # Additivity check: does "both" ~= "ext_only" + "obos_only"?
    m2 = d.groupby('cell').delta.mean()
    if {'ext_only', 'obos_only', 'both'}.issubset(m2.index):
        add = m2['ext_only'] + m2['obos_only']
        print('\n  additivity: ext_only + obos_only = %.4f   vs actual both = %.4f'
              % (add, m2['both']))
        print('  (close = independent/additive information; both >> sum = synergy; both << sum = redundant)')


def r6_second_strategy():
    print('\n' + '=' * 78)
    print('R6  SECOND, MECHANICALLY UNRELATED STRATEGY: the ConfluenceBot zone engine')
    print('=' * 78)
    f = os.path.join(DATA, 'zone_backtest.parquet')
    if not os.path.exists(f):
        print('  zone_backtest.parquet not found - skipping')
        return
    zt = pd.read_parquet(f)
    print('  %s zone-engine trades available' % format(len(zt), ','))
    # Need VWAP extension AT the zone entry timestamps - compute per instrument.
    from vmcResearch.ext.feasibility import prep
    from vmcResearch.panel import load_m1
    rows = []
    for inst, g in zt.groupby('instrument'):
        try:
            m1 = load_m1(inst)
        except Exception:
            continue
        h, l, c, a, e = prep(m1)
        idx = m1.index
        pos = idx.searchsorted(g['time'].to_numpy())
        ok = (pos > 0) & (pos < len(e))
        pos = pos[ok]
        gg = g[ok].copy()
        gg['ext_at_entry'] = e[pos]
        # Sign toward the fade direction, matching Q47's convention.
        side = np.where(gg.direction == 'long', 1, -1)
        gg['ext_signed'] = gg['ext_at_entry'].to_numpy() * -side
        # MAE already in the zone_backtest as risk-normalised R is not MAE in
        # ATR; approximate adverse excursion via the 'sl' outcome as a proxy
        # is circular, so instead use the raw structural risk realised: a
        # trade that hit SL saw >= 1 unit of adverse movement, TP/timeout saw
        # whatever r_net implies. Use -min(r,0) capped, and stop flag directly.
        gg['stopped'] = (gg.outcome == 'sl').astype(float)
        rows.append(gg)
    if not rows:
        print('  could not attach extension - skipping')
        return
    d = pd.concat(rows, ignore_index=True)
    d = d.dropna(subset=['ext_signed'])
    q = pd.qcut(d.ext_signed, 5, labels=False, duplicates='drop')
    print('\n  P(stopped out) by extension-at-entry quintile, zone-engine trades:')
    for k in range(int(q.max()) + 1):
        g = d[q == k]
        print('    Q%d  n=%6d  ext med %+.2f  stop-out %.3f  net R %+.4f'
              % (k + 1, len(g), g.ext_signed.median(), g.stopped.mean(), g.r_net.mean()))
    lo, hi = d[q == 0].stopped, d[q == q.max()].stopped
    dz, z = block_z(hi.to_numpy(), lo.to_numpy())
    print('\n  Q1->Q5 stop-out delta %+.3f  (z=%.2f)' % (dz, z))
    if z > 3:
        print('  => TRANSFERS to a second, mechanically unrelated strategy: extension is a general risk state')
    else:
        print('  => does NOT clearly transfer to this second strategy - treat as vol-fade-specific for now')


if __name__ == '__main__':
    t = r1_stability()
    r7_incremental(t)
    r8_independence_m15()
    r6_second_strategy()
