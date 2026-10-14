"""forge/COG_EXACT_PAIR_LEAD_PREREG.md: C.OG's identified line (SOFR Sep26 - Euribor Mar27, bp x0.1 + 1.445) vs Nasdaq, hourly. One run."""
import numpy as np, pandas as pd
from scipy.stats import norm
OUT = 'analysis/output/cog_video_0918/'; rng = np.random.default_rng(20261014)
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
G = pd.date_range('2026-04-13 01:00', '2026-10-10', freq='1h', tz='UTC')
def hl2(p):
    g = ld(p).resample('1h', label='right', closed='right'); h, l, n = g.high.max(), g.low.min(), g.close.count(); s = (h + l) / 2; s[n < 5] = np.nan; return (100 - s).reindex(G)
line = ((hl2('analysis/output/stir_1m/CME_SR3U6.parquet') - hl2('analysis/output/stir_1m/ICEEU_IH7.parquet')) * 100) * 0.1 + 1.445   # (SOFR rate - Euribor rate) bp x 0.1 + 1.445
B = pd.read_parquet('analysis/output/rate_curve_structure/bars15.parquet'); nq15 = B['NQ']                                         # stitched log level, 15m
nq = nq15.reindex(G, method=None)                                                                                                    # hour-end values
r1 = nq.diff()                                                                                                                       # 1h log return (NaN across gaps)
DAY = pd.Series(G.date, index=G); T = lambda s: pd.Timestamp(s, tz='UTC')
EXPL = np.asarray((G > T('2026-04-13')) & (G <= T('2026-07-18'))); CONF = np.asarray((G > T('2026-07-20')) & (G <= T('2026-10-10')))
print(f'hours: {len(G)}; line present {line.notna().mean():.0%}, Nasdaq present {nq.notna().mean():.0%}, both {(line.notna() & nq.notna()).mean():.0%}')
def zprior(x):
    d = pd.Series(np.asarray(x) ** 2, index=G).groupby(DAY.values).mean(); sd = np.sqrt(d.rolling(20, min_periods=10).mean()).shift(1); return pd.Series(np.asarray(x) / DAY.map(sd).to_numpy(), index=G)
def cl(x, y, half):
    ok = half & np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 150: return np.nan, np.nan, int(ok.sum())
    xs, ys = (x[ok] - x[ok].mean()) / x[ok].std(), (y[ok] - y[ok].mean()) / y[ok].std(); p = pd.Series(xs * ys, index=DAY.values[ok]).groupby(level=0).sum()
    return float(np.mean(xs * ys)), float(p.sum() / np.sqrt((p ** 2).sum())), int(ok.sum())
fwd = {H: (nq.shift(-H) - nq) for H in (1, 2, 4, 24)}
X = {W: zprior(line - line.shift(W)).to_numpy() for W in (1, 4)}
def cells(half, plant=None):
    rows = []
    for W, H in [(w, h) for w in (1, 4) for h in (1, 2, 4, 24)]:
        x = X[W]; y = fwd[H].to_numpy().copy()
        if plant: ok = np.isfinite(x) & np.isfinite(y); y[ok] += plant * np.nanstd(y[ok]) * (x[ok] - np.nanmean(x[ok])) / np.nanstd(x[ok])
        r, t, n = cl(x, y, half); rows.append(dict(W=W, H=H, rho=r, t=t, n=n))
    return pd.DataFrame(rows)
print('\nPOWER (planted lead into explore; detected = any cell |t| >= 2.5):')
for rho in (0.03, 0.05, 0.08, 0.12):
    print(f'  rho {rho:.2f}: max|t| {cells(EXPL, rho).t.abs().max():.2f}  ->  {"detected" if cells(EXPL, rho).t.abs().max() >= 2.5 else "NOT detected"}')
E, C = cells(EXPL), cells(CONF)
M = E.merge(C, on=['W', 'H'], suffixes=('_e', '_c')); M['pass_e'] = M.t_e.abs() >= 2.5; M['p1_c'] = [norm.sf(np.sign(a) * b) if np.isfinite(b) else np.nan for a, b in zip(M.rho_e, M.t_c)]
pd.set_option('display.width', 200); print('\nEXPLORE / CONFIRM (W = change window h; H = horizon h):'); print(M.round(3).to_string(index=False))
print('\nsurvive explore (|t|>=2.5):', int(M.pass_e.sum()), '; confirmed (one-sided p<.05, sign fixed):', int((M.pass_e & (M.p1_c < 0.05)).sum()))
for W in (1, 4):
    for name, half in (('explore', EXPL), ('confirm', CONF)):
        print(f'same-bar (W={W}h, return over the same {W}h): {name} rho/t/n = {tuple(round(v, 3) for v in cl(X[W], (nq - nq.shift(W)).to_numpy(), half))}')
lvl = zprior(line - line.rolling(24 * 5, min_periods=48).mean()).to_numpy()
for name, half in (('explore', EXPL), ('confirm', CONF)): print(f'level (vs own 5-day mean) -> next-24h return, {name}: rho/t/n = {tuple(round(v, 3) for v in cl(lvl, fwd[24].to_numpy(), half))}')
M.to_csv(OUT + 'exact_pair_lead.csv', index=False)
