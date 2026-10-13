"""Cycle every input of C.OG's pasted Pine indicator to find his chart (video week, corrected digitised line cog_line_digitised_15m_full2.csv).

Inputs swept (all 1-min IBKR futures bars, resampled the way Pine's request.security does on a 15-min chart, lookahead off):
  EUR leg   : Euribor IV6 (I1!), IX6 (I2!), IZ6 (I3!), IF7, IG7, IH7, IM7, IU7
  USD leg   : SOFR SR3N6, Q6 (SR31!/SR32! if serial), U6 (his custom), V6, X6, Z6, H7, M7
  data tf   : 1m 5m 15m 30m 1h 4h 1D     source: close open high low hl2 ohlc4     price type: midpoint / trades
  smoothing : EMA 1..50                    lead: -4..+4 chart bars (positive = his t+N plot offset; negative = axis calibration slack)
asRate / invert / inBps / scale / offset are affine -> absorbed by a free sign and a fitted scale+offset, so they are not enumerated.
Selection on EXPLORE (Thu 17 - Fri 18 Sep), judged on HOLDOUT (Mon 21 - Tue 22 Sep). A placebo (his line rolled ~1 day out of alignment)
shows what best-of-all-configurations looks like by chance."""
import itertools, os, sys, time
import numpy as np, pandas as pd
from scipy.signal import lfilter
OUT = 'analysis/output/cog_video_0918/'
his = pd.read_csv(OUT + 'cog_line_digitised_15m_full2.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
IDX = his.index; n = len(IDX)
E = np.asarray(IDX < pd.Timestamp('2026-09-19', tz='UTC')); H = np.asarray(IDX >= pd.Timestamp('2026-09-21', tz='UTC'))
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
SW = 'analysis/output/stir_1m_sweep/'
MID = {'SR3U6': 'analysis/output/stir_1m/CME_SR3U6.parquet', 'SR3Z6': 'analysis/output/stir_1m/CME_SR3Z6.parquet', 'SR3H7': 'analysis/output/stir_1m/CME_SR3H7.parquet', 'SR3M7': 'analysis/output/stir_1m/CME_SR3M7.parquet',
       'SR3N6': SW + 'mid/CME_SR3N6.parquet', 'SR3Q6': SW + 'mid/CME_SR3Q6.parquet', 'SR3V6': SW + 'mid/CME_SR3V6.parquet', 'SR3X6': SW + 'mid/CME_SR3X6.parquet',
       'IV6': 'analysis/output/stir_1m_i2/ICEEU_IV6.parquet', 'IX6': 'analysis/output/stir_1m_i2/ICEEU_IX6.parquet', 'IZ6': 'analysis/output/stir_1m/ICEEU_IZ6.parquet', 'IH7': 'analysis/output/stir_1m/ICEEU_IH7.parquet',
       'IM7': 'analysis/output/stir_1m/ICEEU_IM7.parquet', 'IU7': 'analysis/output/stir_1m/ICEEU_IU7.parquet', 'IF7': SW + 'mid/ICEEU_IF7.parquet', 'IG7': SW + 'mid/ICEEU_IG7.parquet'}
TRD = {'SR3U6': 'analysis/output/stir_1m_trades/CME_SR3U6.parquet', 'IV6': 'analysis/output/stir_1m_trades/ICEEU_IV6.parquet', 'IX6': 'analysis/output/stir_1m_trades/ICEEU_IX6.parquet',
       'SR3N6': SW + 'trd/CME_SR3N6.parquet', 'SR3Q6': SW + 'trd/CME_SR3Q6.parquet', 'SR3V6': SW + 'trd/CME_SR3V6.parquet', 'SR3X6': SW + 'trd/CME_SR3X6.parquet', 'IF7': SW + 'trd/ICEEU_IF7.parquet', 'IG7': SW + 'trd/ICEEU_IG7.parquet'}
EUR = ['IV6', 'IX6', 'IZ6', 'IF7', 'IG7', 'IH7', 'IM7', 'IU7']; USD = ['SR3N6', 'SR3Q6', 'SR3U6', 'SR3V6', 'SR3X6', 'SR3Z6', 'SR3H7', 'SR3M7']
TFS = ['1min', '5min', '15min', '30min', '1h', '4h', '1D']; SRCS = ['close', 'open', 'high', 'low', 'hl2', 'ohlc4']
EMAS = [1, 2, 3, 4, 5, 6, 8, 10, 13, 15, 20, 21, 25, 30, 40, 50]; SHIFTS = list(range(-4, 5))
CHART = pd.date_range('2026-09-14', '2026-09-23', freq='15min', tz='UTC')
def tfbars(df, tf):
    g = df.resample(tf, label='right', closed='right'); o = pd.DataFrame({'open': g.open.first(), 'high': g.high.max(), 'low': g.low.min(), 'close': g.close.last()}).dropna()
    o['hl2'] = (o.high + o.low) / 2; o['ohlc4'] = o[['open', 'high', 'low', 'close']].mean(1); return o
def legs(table, tag):
    """(contract, tf, src) -> array on his chart bars: value of the latest closed tf-bar at each chart-bar close (Pine lookahead_off, historical)."""
    out = {}
    for c, p in table.items():
        if not os.path.exists(p): continue
        df = ld(p)
        for tf in TFS:
            b = tfbars(df, tf)
            for src in SRCS:
                s = b[src]; s = s.reindex(s.index.union(CHART)).ffill().reindex(CHART)           # latest closed tf bar at chart close
                out[(c, tf, src, tag)] = (100 - s).reindex(IDX).ffill().to_numpy()                  # rate = 100 - price
    return out
t0 = time.time(); LEG = {**legs(MID, 'mid'), **legs(TRD, 'trd')}; print(f'legs built: {len(LEG)} series in {time.time()-t0:.0f}s; contracts missing: {[c for c in list(MID) if not os.path.exists(MID[c])]}', flush=True)
def corr_rows(Y, X):          # Y: (n,) target; X: (m, n) candidates -> corr of each row with Y (NaN-safe on common finite)
    ok = np.isfinite(X).all(0) & np.isfinite(Y); Y, X = Y[ok], X[:, ok]
    if len(Y) < 20: return np.full(X.shape[0], np.nan)
    Yc = (Y - Y.mean()) / (Y.std() + 1e-12); Xc = (X - X.mean(1, keepdims=True)) / (X.std(1, keepdims=True) + 1e-12); return (Xc * Yc).mean(1)
def sweep(target):
    dY = np.r_[np.nan, np.diff(target)]; rows = []
    for tag in ('mid', 'trd'):
        for e, u, tf, src in itertools.product(EUR, USD, TFS, SRCS):
            le, lu = LEG.get((e, tf, src, tag)), LEG.get((u, tf, src, tag))
            if le is None or lu is None: continue
            spr = le - lu
            if not np.isfinite(spr).any(): continue
            for sm in EMAS:
                a = 2 / (sm + 1); f = spr if sm == 1 else lfilter([a], [1, -(1 - a)], spr, zi=[(1 - a) * spr[0]])[0]
                M = np.vstack([np.roll(f, k) for k in SHIFTS]); dM = np.hstack([np.full((len(SHIFTS), 1), np.nan), np.diff(M, axis=1)])
                for seg, name in ((E, 'e'), (H, 'h')):
                    pass
                lvE, chE = corr_rows(target[E], M[:, E]), corr_rows(dY[E], dM[:, E]); lvH, chH = corr_rows(target[H], M[:, H]), corr_rows(dY[H], dM[:, H])
                for i, k in enumerate(SHIFTS):
                    rows.append((tag, e, u, tf, src, sm, k, lvE[i], chE[i], lvH[i], chH[i]))
    R = pd.DataFrame(rows, columns=['type', 'eur', 'usd', 'tf', 'src', 'ema', 'shift', 'lvE', 'chE', 'lvH', 'chH'])
    R['sgn'] = np.sign(R.lvE); R['scoreE'] = R.chE * R.sgn; R['scoreH'] = R.chH * R.sgn; R['okH'] = np.sign(R.lvH) == R.sgn
    return R
t0 = time.time(); R = sweep(his.to_numpy()); print(f'real sweep: {len(R):,} configurations in {time.time()-t0:.0f}s', flush=True)
R.to_parquet(OUT + 'cog_param_sweep.parquet')
placebo = np.roll(his.to_numpy(), 97)       # ~1 day out of alignment: same line, wrong time
t0 = time.time(); P = sweep(placebo); print(f'placebo sweep done in {time.time()-t0:.0f}s', flush=True)
def top(R, k=15):
    T = R.dropna(subset=['scoreE']).sort_values('scoreE', ascending=False).head(k)
    return T[['type', 'eur', 'usd', 'tf', 'src', 'ema', 'shift', 'lvE', 'scoreE', 'lvH', 'scoreH']].round(3)
pd.set_option('display.width', 220)
print('\n=== REAL: top 15 by EXPLORE (Thu-Fri) bar-by-bar corr, with HOLDOUT (Mon-Tue) alongside ==='); print(top(R).to_string(index=False))
print('\n=== PLACEBO (his line rolled ~1 day): top 5 by explore, with holdout ==='); print(top(P, 5).to_string(index=False))
for name, X in (('REAL', R), ('PLACEBO', P)):
    Z = X.dropna(subset=['scoreE', 'scoreH']); sel = Z.sort_values('scoreE', ascending=False).head(200)
    print(f'{name}: of top-200-by-explore, holdout bar-by-bar median {sel.scoreH.median():+.2f}, share >= 0.3: {(sel.scoreH >= 0.3).mean():.0%}; best single holdout over ALL configs {Z.scoreH.max():+.2f}; best explore {Z.scoreE.max():+.2f}')
Z = R.dropna(subset=['scoreE', 'scoreH']); Z['both'] = np.minimum(Z.scoreE, Z.scoreH)
print('\n=== REAL: top 12 by the WORSE of the two halves (needs to work in both) ==='); print(Z.sort_values('both', ascending=False).head(12)[['type', 'eur', 'usd', 'tf', 'src', 'ema', 'shift', 'lvE', 'scoreE', 'lvH', 'scoreH']].round(3).to_string(index=False))
print('\nmarginals (best explore score per option, with its holdout):')
for col in ('tf', 'src', 'ema', 'eur', 'usd', 'type', 'shift'):
    g = Z.loc[Z.groupby(col).scoreE.idxmax()][[col, 'scoreE', 'scoreH']].round(2); print(f'  {col}:', '; '.join(f'{r[col]}: {r.scoreE:+.2f}/{r.scoreH:+.2f}' for _, r in g.iterrows()))
