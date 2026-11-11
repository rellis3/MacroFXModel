"""nq-rates-residual-monitor (EXPLORATORY, not pre-registered; plans/RESEARCH_REGISTER.md).

Owner's question: regress Nasdaq returns on yield changes and read the residual. Does it show WHEN Nasdaq trades as a rates asset and when it
moves for other reasons? Descriptive only. The trading version (does price catch up to the rates-implied move?) is banked NULL in
analysis/output/rates_residual/RESULTS.md (S1), so it is not re-tested here.

Model, daily, past-only rolling OLS (window W trading days ending the day BEFORE t):
    r_t = a + b1 * d2y_t + b2 * dslope_t + e_t
r = Nasdaq-100 log return in %, d2y = change in the 2y Treasury yield in bp, dslope = change in (10y - 2y) in bp. The 2y and the slope replace
2y and 10y because d2y and d10y move together (corr ~0.8 here), which makes their separate coefficients unstable; the fitted value is the same.
e_t is out of sample (coefficients from before t), z_t = e_t / (residual sd in the window), z20 = 20-day sum of e / (sd * sqrt 20).

Data: FRED NASDAQ100 (close, 16:00 ET), DGS2 / DGS10 (Treasury constant-maturity, about 15:30 ET). The half-hour gap is a small timing mismatch
and is stated in RESULTS.md. Days are kept only where all three print; returns and changes are taken across the same kept days, so a bond holiday
does not pair a 2-day yield change with a 1-day equity return.
    python scripts/nq-rates-residual-monitor/run.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'nq-rates-residual-monitor'
START = '2005-01-01'
W = 120
ROBUST_W = (60, 250)


def load():
    s = {k: pd.read_csv(OUT / 'data' / f'{k}.csv', index_col=0, parse_dates=True, na_values='.').iloc[:, 0] for k in ('NASDAQ100', 'DGS2', 'DGS10')}
    d = pd.DataFrame(s).dropna()
    df = pd.DataFrame({'r': 100 * np.log(d.NASDAQ100).diff(), 'd2y': 100 * d.DGS2.diff(), 'dslope': 100 * (d.DGS10 - d.DGS2).diff(),
                       'nq': d.NASDAQ100, 'y2': d.DGS2, 'y10': d.DGS10}).dropna()
    return df[df.index >= START]


def rolling(df, w):
    X = np.column_stack([np.ones(len(df)), df.d2y.values, df.dslope.values])
    y = df.r.values
    rows = []
    for t in range(w, len(df)):
        Xw, yw = X[t - w:t], y[t - w:t]
        beta, *_ = np.linalg.lstsq(Xw, yw, rcond=None)
        fit_w = Xw @ beta
        res_w = yw - fit_w
        r2 = 1 - res_w.var() / yw.var()
        sd = res_w.std(ddof=3)
        e = y[t] - X[t] @ beta
        rows.append((df.index[t], beta[0], beta[1], beta[2], r2, sd, X[t] @ beta, e))
    out = pd.DataFrame(rows, columns=['date', 'a', 'b_2y', 'b_slope', 'r2', 'sd', 'fit', 'e']).set_index('date')
    out['z'] = out.e / out.sd
    out['z20'] = out.e.rolling(20).sum() / (out.sd * np.sqrt(20))
    out['implied20'] = out.fit.rolling(20).sum()
    out['actual20'] = df.r.reindex(out.index).rolling(20).sum()
    return out


def episodes(m, thr=2.5):
    """Contiguous runs with |z20| > thr; one row per run, at its peak."""
    hot = m.z20.abs() > thr
    grp = (hot != hot.shift()).cumsum()
    eps = []
    for _, g in m[hot].groupby(grp[hot]):
        pk = g.z20.abs().idxmax()
        eps.append(dict(start=str(g.index[0].date()), end=str(g.index[-1].date()), peak=str(pk.date()), z20=round(float(g.z20[pk]), 2),
                        nq_20d_pct=round(float(g.actual20[pk]), 1), rates_implied_20d_pct=round(float(g.implied20[pk]), 1),
                        r2_at_peak=round(float(g.r2[pk]), 2), b_2y_per10bp=round(float(10 * g.b_2y[pk]), 2)))
    return sorted(eps, key=lambda x: -abs(x['z20']))


if __name__ == '__main__':
    df = load()
    m = rolling(df, W)
    full = np.linalg.lstsq(np.column_stack([np.ones(len(df)), df.d2y, df.dslope]), df.r, rcond=None)[0]
    corr_2y_10y = float(np.corrcoef(df.d2y, df.d2y + df.dslope)[0, 1])
    by_year = []
    for y, g in df.groupby(df.index.year):
        X = np.column_stack([np.ones(len(g)), g.d2y, g.dslope]); b = np.linalg.lstsq(X, g.r, rcond=None)[0]
        r2 = 1 - (g.r - X @ b).var() / g.r.var()
        by_year.append(dict(year=int(y), r2=round(float(r2), 3), b_2y_per10bp=round(float(10 * b[1]), 2), b_slope_per10bp=round(float(10 * b[2]), 2),
                            corr_r_d2y=round(float(np.corrcoef(g.r, g.d2y)[0, 1]), 2), n=len(g)))
    rob = {}
    for w in ROBUST_W:
        mw = rolling(df, w)
        j = m.index.intersection(mw.index)
        rob[w] = dict(corr_r2_with_120=round(float(np.corrcoef(m.r2[j], mw.r2[j])[0, 1]), 2), corr_z20_with_120=round(float(np.corrcoef(m.z20[j].fillna(0), mw.z20[j].fillna(0))[0, 1]), 2),
                      share_abs_z_gt2=round(float((mw.z.abs() > 2).mean()), 3))
    z = m.z.dropna()
    eps = episodes(m)
    last = m.iloc[-1]
    res = dict(slug='nq-rates-residual-monitor', status='EXPLORATORY', verdict='CONTEXT', window=W, start=str(m.index[0].date()), end=str(m.index[-1].date()), n_days=len(m),
               full_sample=dict(b_2y_per10bp=round(float(10 * full[1]), 3), b_slope_per10bp=round(float(10 * full[2]), 3), corr_d2y_d10y=round(corr_2y_10y, 2)),
               rolling_r2=dict(median=round(float(m.r2.median()), 3), p10=round(float(m.r2.quantile(.1)), 3), p90=round(float(m.r2.quantile(.9)), 3), max=round(float(m.r2.max()), 3),
                               share_above_0_2=round(float((m.r2 > 0.2).mean()), 3)),
               beta_2y_sign=dict(share_negative=round(float((m.b_2y < 0).mean()), 3), sign_changes=int((np.sign(m.b_2y).diff().abs() > 0).sum())),
               residual=dict(share_abs_z_gt2=round(float((z.abs() > 2).mean()), 3), share_abs_z_gt3=round(float((z.abs() > 3).mean()), 3), lag1_autocorr=round(float(z.autocorr(1)), 3),
                             oos_r2=round(float(1 - (m.e ** 2).sum() / ((df.r.reindex(m.index) - df.r.reindex(m.index).mean()) ** 2).sum()), 3)),
               robustness=rob, by_year=by_year, episodes_top=eps[:12], n_episodes=len(eps),
               latest=dict(date=str(m.index[-1].date()), r2=round(float(last.r2), 3), b_2y_per10bp=round(float(10 * last.b_2y), 2), b_slope_per10bp=round(float(10 * last.b_slope), 2),
                           z=round(float(last.z), 2), z20=round(float(last.z20), 2), nq_20d_pct=round(float(last.actual20), 1), implied_20d_pct=round(float(last.implied20), 1)))
    (OUT / 'results.json').write_text(json.dumps(res, indent=1))
    m.to_csv(OUT / 'monitor_daily.csv', float_format='%.5f')

    fig, ax = plt.subplots(4, 1, figsize=(13, 12), sharex=True, gridspec_kw=dict(height_ratios=[1.2, 1, 1, 1.1]))
    ax[0].plot(df.nq, color='#333', lw=1); ax[0].set_yscale('log'); ax[0].set_title('Nasdaq-100 (log scale)', loc='left', fontsize=10)
    ax[1].plot(10 * m.b_2y, color='#2a6fdb', lw=1, label='2y beta (% NQ per +10 bp)'); ax[1].plot(10 * m.b_slope, color='#e07b00', lw=1, label='slope beta (% per +10 bp steeper)')
    ax[1].axhline(0, color='#999', lw=.6); ax[1].legend(loc='upper left', fontsize=8); ax[1].set_title(f'Rolling betas ({W}-day, past-only)', loc='left', fontsize=10)
    ax[2].fill_between(m.index, m.r2, color='#5a9', alpha=.6); ax[2].set_ylim(0, max(.6, m.r2.max())); ax[2].set_title('Rolling R2: share of daily NQ variance explained by 2y + slope', loc='left', fontsize=10)
    ax[3].plot(m.z20, color='#7a3fb0', lw=.9); [ax[3].axhline(v, color='#c33', lw=.6, ls='--') for v in (-2.5, 2.5)]; ax[3].axhline(0, color='#999', lw=.6)
    ax[3].set_title('20-day cumulative residual, z (above 0 = NQ ran ahead of what rates implied)', loc='left', fontsize=10)
    for a in ax: a.grid(alpha=.25)
    fig.tight_layout(); fig.savefig(OUT / 'monitor.png', dpi=110)
    print(json.dumps({k: res[k] for k in ('start', 'end', 'n_days', 'full_sample', 'rolling_r2', 'beta_2y_sign', 'residual', 'robustness', 'latest', 'n_episodes')}, indent=1))
    print('by year:'); [print(' ', r) for r in by_year]
    print('top episodes:'); [print(' ', e) for e in eps[:12]]
