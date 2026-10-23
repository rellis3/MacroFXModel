"""vvix-nasdaq-ratio step 1: daily panel of the three ratio constructions, their causal extreme flags and the controls.
No post-signal outcome is computed here. C.OG, Discord 2026-10-23 (education/cog-snippets.md section 3).
Writes analysis/output/vvix-nasdaq-ratio/panel.parquet and FEATURES.md."""
import os
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'vvix-nasdaq-ratio'); os.makedirs(OUT, exist_ok=True)
END = '2026-08-21'                           # lockbox
W, PCT_WIN, EXT = 20, 252, 0.10              # realised window (sessions), percentile look-back, extreme tail


def cboe(name):
    d = pd.read_csv(os.path.join(ROOT, 'analysis/surfaces/cboe', f'{name}.csv'), header=None)
    d = d[pd.to_datetime(d[0], format='%m/%d/%Y', errors='coerce').notna()]
    s = pd.Series(pd.to_numeric(d[d.columns[-1]], errors='coerce').to_numpy(), index=pd.to_datetime(d[0], format='%m/%d/%Y'))
    return s.dropna().sort_index()


def fred(sid):
    d = pd.read_csv(os.path.join(ROOT, 'analysis/output/yield-predictive-ladder/raw', f'{sid}.csv')); d.columns = ['date', 'v']
    return pd.Series(pd.to_numeric(d['v'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()


if __name__ == '__main__':
    S = {k: cboe(k) for k in ('VVIX', 'VIX', 'VXN', 'VIX3M', 'VIX9D')}
    S['NDX'] = fred('NASDAQ100')
    P = pd.concat(S, axis=1).dropna(subset=['VVIX', 'VIX', 'VXN', 'NDX'])
    P = P[(P.index >= '2009-09-14') & (P.index <= END)]
    r = np.log(P).diff()
    # (a) realised: % VVIX moves per % Nasdaq moves (ratio of 20-session realised vols; "per unit time" cancels in the ratio)
    P['R_a'] = r['VVIX'].rolling(W).std() / r['NDX'].rolling(W).std()
    # (b) the same with VIX (C.OG names VVIX, then writes "vix")
    P['R_b'] = r['VIX'].rolling(W).std() / r['NDX'].rolling(W).std()
    # (c) implied: vol-of-vol priced per unit of Nasdaq implied vol
    P['R_c'] = P['VVIX'] / P['VXN']
    for k in ('R_a', 'R_b', 'R_c'):
        pc = P[k].rolling(PCT_WIN, min_periods=200).rank(pct=True)          # causal: today's value within the last 252 sessions incl. today
        P[f'{k}_pct'] = pc
        P[f'{k}_hi'] = (pc >= 1 - EXT).astype(float).where(pc.notna())
        P[f'{k}_lo'] = (pc <= EXT).astype(float).where(pc.notna())
    # controls known at the close of day d (validated range effects + recent price)
    P['c_vix_pct'] = P['VIX'].rolling(PCT_WIN, min_periods=200).rank(pct=True)
    P['c_inverted'] = (P['VIX'] > P['VIX3M']).astype(float).where(P['VIX3M'].notna())
    P['c_front'] = (P['VIX9D'] / P['VIX']).where(P['VIX9D'].notna())
    P['c_ret20'] = np.log(P['NDX']).diff(20)
    P['c_rv20_over_vxn'] = r['NDX'].rolling(20).std() * np.sqrt(252) * 100 / P['VXN']
    P['split'] = np.select([P.index < '2016-01-01', P.index < '2021-01-01'], ['discover', 'validate'], 'test')
    P.to_parquet(os.path.join(OUT, 'panel.parquet'))
    L = ['# vvix-nasdaq-ratio: features (no outcomes)', '', f'Rows {len(P)} ({P.index[0].date()} → {P.index[-1].date()}); splits ' + ', '.join(f"{k} {int((P.split == k).sum())}" for k in ('discover', 'validate', 'test')) + '.', '',
         '| construction | median | p10 | p90 | days in top decile | days in bottom decile | corr with VIX percentile |', '|---|---|---|---|---|---|---|']
    for k in ('R_a', 'R_b', 'R_c'):
        L.append(f"| {k} | {P[k].median():.2f} | {P[k].quantile(.1):.2f} | {P[k].quantile(.9):.2f} | {int(P[f'{k}_hi'].sum())} | {int(P[f'{k}_lo'].sum())} | {P[f'{k}_pct'].corr(P['c_vix_pct']):+.2f} |")
    L += ['', 'Pairwise correlation of the three percentiles: ' + ', '.join(f"{a}/{b} {P[a + '_pct'].corr(P[b + '_pct']):+.2f}" for a, b in (('R_a', 'R_b'), ('R_a', 'R_c'), ('R_b', 'R_c')))]
    open(os.path.join(OUT, 'FEATURES.md'), 'w', encoding='utf-8').write('\n'.join(L)); print('\n'.join(L))
