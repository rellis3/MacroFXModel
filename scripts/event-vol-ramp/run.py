"""event-vol-ramp -- does the rise in the VIX9D/VIX ratio into a scheduled FOMC/CPI/NFP add to the event-day range, beyond the level (vol-curve-front)?
Prereg: forge/EVENT_VOL_RAMP_PREREG.md (seed 20261114). Stages: --stage power (alignment check on B0 + design SE; no ramp coefficient is read), --stage score.
Run with the repo venv: python -I scripts/event-vol-ramp/run.py --stage power|score"""
import argparse, importlib.util, json
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve(); REPO = HERE.parents[2]
OUT = REPO / 'analysis' / 'output' / 'event-vol-ramp'; OUT.mkdir(parents=True, exist_ok=True)
SEED, B = 20261114, 2000
GATE, OPERATIONAL = 0.05, 0.10
END = pd.Timestamp('2026-08-21')
_s = importlib.util.spec_from_file_location('p27', REPO / 'oi_research_book' / 'scripts' / '27_gex_range_es.py')
p27 = importlib.util.module_from_spec(_s); _s.loader.exec_module(p27)
INSTR = {'SPX500': 'spx500', 'NQ': 'nas100'}
CBOE = REPO / 'analysis' / 'surfaces' / 'cboe'


def cboe(name):
    c = pd.read_csv(CBOE / f'{name}.csv'); c['DATE'] = pd.to_datetime(c['DATE'], format='%m/%d/%Y')
    return c.set_index('DATE')['CLOSE'].sort_index().dropna()


def asof(series, dates):
    idx = series.index.searchsorted(pd.DatetimeIndex(dates), side='right') - 1
    return np.where(idx >= 0, series.to_numpy()[np.clip(idx, 0, None)], np.nan)


def events_ny():
    e = pd.read_parquet(REPO / 'analysis' / 'output' / 'rate-surprise-events' / 'events.parquet', columns=['family', 't'])
    e['t'] = pd.to_datetime(e['t'], utc=True); e = e[(e['t'] >= '2016-01-01') & (e['t'] < END.tz_localize('UTC'))]
    e['d'] = e['t'].dt.tz_convert('America/New_York').dt.tz_localize(None).dt.normalize()
    return e


def frame(px):
    S = pd.read_parquet(REPO / 'oi_research_book' / 'data' / 'gex_range_es' / f'{px}_nyclose_d1.parquet').sort_index()
    S.index = pd.to_datetime(S.index).tz_localize(None); S = S[S.index < END]
    ret = np.log(S['close'] / S['close'].shift(1))
    sig = ret.rolling(20).std().shift(1)
    d = pd.DataFrame({'dr': np.log(S['high'] / S['low']) / (sig * np.sqrt(8 / np.pi)), 'sig': sig}, index=S.index)
    v9, v = cboe('VIX9D'), cboe('VIX')
    idx = S.index; p1, p2, p3 = idx.to_series().shift(1), idx.to_series().shift(2), idx.to_series().shift(3)
    def r(ser_d, ser_m, when): return np.log(asof(ser_d, when) / asof(ser_m, when))
    L1, L3 = r(v9, v, p1.fillna(idx[0])), r(v9, v, p3.fillna(idx[0]))
    d['L'] = L1; d['ramp_raw'] = L1 - L3
    d['v'] = np.log(asof(v, p1.fillna(idx[0])) / 100.0 / (sig * np.sqrt(252.0)))
    d['r9_raw'] = np.log(asof(v9, p1.fillna(idx[0])) / asof(v9, p3.fillna(idx[0])))
    d['ramp1_raw'] = L1 - r(v9, v, p2.fillna(idx[0]))
    ev = events_ny()
    for fam in ('FOMC', 'CPI', 'NFP'):
        d[fam] = idx.isin(set(ev.loc[ev['family'] == fam, 'd'])).astype(float)
    d['event'] = (d[['FOMC', 'CPI', 'NFP']].sum(axis=1) > 0).astype(float)
    d['dow'] = idx.dayofweek
    d = d.replace([np.inf, -np.inf], np.nan).dropna(subset=['dr', 'L', 'ramp_raw', 'v', 'r9_raw', 'ramp1_raw']).copy()
    for k in ('ramp', 'r9', 'ramp1'):
        d[k] = d[k + '_raw'] / d[k + '_raw'].std()
    return d


def X_of(d, ramp='ramp', with_ramp=True, shift_event=0):
    X = pd.DataFrame(index=d.index); X['c'] = 1.0
    ev = d[['FOMC', 'CPI', 'NFP', 'event']].shift(shift_event).fillna(0.0) if shift_event else d[['FOMC', 'CPI', 'NFP', 'event']]
    for fam in ('FOMC', 'CPI', 'NFP'): X[fam] = ev[fam].values
    for w in (1, 2, 3, 4): X[f'dow{w}'] = (d['dow'] == w).astype(float).values
    X['L'] = d['L'].values; X['v'] = d['v'].values
    if with_ramp:
        X['ramp'] = d[ramp].values; X['ramp_x_event'] = (d[ramp] * ev['event']).values
    return X


def coef(X, y, name):
    j = list(X.columns).index(name)
    return float(np.linalg.lstsq(X.values, y, rcond=None)[0][j])


def stage_power(F):
    res = {'seed': SEED, 'stage': 'power', 'cells': {}}
    for name, d in F.items():
        y = d['dr'].to_numpy(); X0 = X_of(d, with_ramp=False); X1 = X_of(d)
        b0 = np.linalg.lstsq(X0.values, y, rcond=None)[0]; sd0 = float((y - X0.values @ b0).std(ddof=X0.shape[1]))
        XtXi = np.linalg.pinv(X1.values.T @ X1.values); j = list(X1.columns).index('ramp_x_event')
        se = sd0 * float(np.sqrt(XtXi[j, j]))
        fam = {k: float(b0[list(X0.columns).index(k)]) for k in ('FOMC', 'CPI', 'NFP')}
        shifted = {}
        for sh in (-1, 1):
            Xs = X_of(d, with_ramp=False, shift_event=sh); bs = np.linalg.lstsq(Xs.values, y, rcond=None)[0]
            shifted[str(sh)] = {k: float(bs[list(Xs.columns).index(k)]) for k in ('FOMC', 'CPI', 'NFP')}
        res['cells'][name] = {'n': int(len(d)), 'n_event': int(d['event'].sum()), 'n_FOMC': int(d['FOMC'].sum()), 'n_CPI': int(d['CPI'].sum()), 'n_NFP': int(d['NFP'].sum()),
                              'first': str(d.index[0].date()), 'last': str(d.index[-1].date()), 'resid_sd_B0': sd0, 'se_design_interaction': se, 'mde': 3.0 * se,
                              'positive_control_B0_family_dummies': fam, 'time_shifted_family_dummies': shifted,
                              'ordinary_mean_dr': float(d.loc[d['event'] == 0, 'dr'].mean()), 'event_mean_dr': float(d.loc[d['event'] == 1, 'dr'].mean())}
    json.dump(res, open(OUT / 'power.json', 'w'), indent=1); print(json.dumps(res, indent=1))


def stage_score(F):
    rng = np.random.default_rng(SEED)
    res = {'seed': SEED, 'stage': 'score', 'cells': {}}
    for name, d in F.items():
        y = d['dr'].to_numpy(); X1 = X_of(d); A = X1.values; names = list(X1.columns)
        jr, jx = names.index('ramp'), names.index('ramp_x_event')
        beta = np.linalg.lstsq(A, y, rcond=None)[0]
        r = {'n': int(len(d)), 'n_event': int(d['event'].sum()), 'b_ramp_x_event': float(beta[jx]), 'b_ramp_ordinary': float(beta[jr]),
             'b_L': float(beta[names.index('L')]), 'b_v': float(beta[names.index('v')]), 'b_family': {k: float(beta[names.index(k)]) for k in ('FOMC', 'CPI', 'NFP')}}
        bx, br = [], []
        for ch in p27.s18._boot_stats(len(y), B, rng, chunk=500):
            for ix in ch:
                bb = np.linalg.lstsq(A[ix], y[ix], rcond=None)[0]; bx.append(bb[jx]); br.append(bb[jr])
        bx, br = np.array(bx), np.array(br); se = float(bx.std())
        r['se'] = se; r['ci95'] = [float(r['b_ramp_x_event'] - 1.96 * se), float(r['b_ramp_x_event'] + 1.96 * se)]; r['t'] = r['b_ramp_x_event'] / se
        r['ci95_ordinary_ramp'] = [float(np.quantile(br, .025)), float(np.quantile(br, .975))]
        # all-shift placebo on the ramp series (the event label stays put)
        pl = []; ramp = d['ramp'].to_numpy(); ev = d['event'].to_numpy()
        for k in range(60, len(y) - 60, 5):
            A2 = A.copy(); A2[:, jr] = np.roll(ramp, k); A2[:, jx] = np.roll(ramp, k) * ev; pl.append(float(np.linalg.lstsq(A2, y, rcond=None)[0][jx]))
        pl = np.array(pl); r['placebo'] = {'n_shifts': int(len(pl)), 'mean': float(pl.mean()), 'sd': float(pl.std()), 'real_above_share': float((pl < r['b_ramp_x_event']).mean())}
        # descriptive: alternative ramps, per family, halves, B0 positive control
        desc = {}
        for alt in ('r9', 'ramp1'):
            Xa = X_of(d, ramp=alt); desc[f'b_ramp_x_event_{alt}'] = coef(Xa, y, 'ramp_x_event')
        fam = {}
        for f in ('FOMC', 'CPI', 'NFP'):
            Xf = X_of(d); Xf['ramp_x_' + f] = (d['ramp'] * d[f]).values; Xf = Xf.drop(columns=['ramp_x_event'])
            fam[f] = coef(Xf, y, 'ramp_x_' + f)
        desc['by_family_interaction'] = fam
        h = len(y) // 2
        desc['halves'] = {lab: coef(X_of(d.iloc[sl]), y[sl], 'ramp_x_event') for lab, sl in (('first', slice(0, h)), ('second', slice(h, None)))}
        X0 = X_of(d, with_ramp=False); b0 = np.linalg.lstsq(X0.values, y, rcond=None)[0]; desc['B0_family'] = {k: float(b0[list(X0.columns).index(k)]) for k in ('FOMC', 'CPI', 'NFP')}
        r['descriptive'] = desc; res['cells'][name] = r
    from math import erf, sqrt
    pn = lambda t: 2 * (1 - 0.5 * (1 + erf(abs(t) / sqrt(2))))
    plist = [pn(res['cells'][k]['t']) for k in ('SPX500', 'NQ')]
    adj = p27.holm(plist)
    for k, h in zip(('SPX500', 'NQ'), adj):
        c = res['cells'][k]; c['p_holm'] = float(h)
        gate = {'b_ge_0.05': c['b_ramp_x_event'] >= GATE, 'ci_lower_gt_0': c['ci95'][0] > 0, 'holm_p_lt_0.05': bool(h < 0.05), 'placebo_above_95pct': c['placebo']['real_above_share'] >= 0.95}
        c['gate'] = gate
        c['verdict'] = 'VALIDATED' if all(gate.values()) else ('NULL' if c['ci95'][1] < OPERATIONAL else 'UNDERPOWERED')
    res['verdict'] = {k: res['cells'][k]['verdict'] for k in ('SPX500', 'NQ')}
    json.dump(res, open(OUT / 'results.json', 'w'), indent=1, default=str); print(json.dumps(res, indent=1, default=str))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--stage', required=True, choices=['power', 'score']); a = ap.parse_args()
    F = {k: frame(v) for k, v in INSTR.items()}
    stage_power(F) if a.stage == 'power' else stage_score(F)
