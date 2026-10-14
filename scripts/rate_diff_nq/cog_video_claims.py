"""forge/COG_VIDEO_CLAIMS_PREREG.md -- one run. C.OG's identified line vs Nasdaq, 15 min to 48 h: F1 continuous lead (direction + volatility), F2 his Friday
swing-then-confirm event, F3 his Monday divergence. Output: analysis/output/cog_video_0918/VIDEO_CLAIMS.md + csv."""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
from scipy.signal import lfilter
from scipy.stats import norm, rankdata
OUT = 'analysis/output/cog_video_0918/'; rng = np.random.default_rng(20261014)
T = lambda s: pd.Timestamp(s, tz='UTC')
G = pd.date_range('2026-04-13 00:15', '2026-10-10', freq='15min', tz='UTC')           # bar-close labels
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def rate(p): return 100 - ld(p).close.resample('15min', label='right', closed='right').last().reindex(G)
s = (rate('analysis/output/stir_1m/CME_SR3U6.parquet') - rate('analysis/output/stir_1m/ICEEU_IH7.parquet')) * 100                   # bp
ok = s.notna().to_numpy(); a = 2 / 3
f = pd.Series(np.nan, index=G); sv = s.ffill().bfill().to_numpy(); f[:] = lfilter([a], [1, -(1 - a)], sv, zi=[(1 - a) * sv[0]])[0]; f[~ok] = np.nan
LINE_O = (f * 0.1 + 1.445).shift(-1)      # bar-OPEN label (how TradingView DRAWS it): uses the bar's close, so it is NOT usable as information at the open -> case studies only
LINE = f * 0.1 + 1.445                    # bar-CLOSE label: information available at the bar's close -> ALL predictive tests (a first run used LINE_O here: one-bar look-ahead, fixed before any result was recorded)
B = pd.read_parquet('analysis/output/rate_curve_structure/bars15.parquet'); NQ = B['NQ'].reindex(G)                                    # stitched log level
R1 = NQ.diff(); DAY = pd.Series(G.date, index=G); HOUR = G.hour.to_numpy()
EXPL = np.asarray((G > T('2026-04-13')) & (G <= T('2026-07-18'))); CONF = np.asarray((G > T('2026-07-20')) & (G <= T('2026-10-10')))
HB = {'15m': 1, '30m': 2, '1h': 4, '2h': 8, '4h': 16, '8h': 32, '24h': 96, '48h': 192}
print(f'bars {len(G)}; line present {LINE.notna().mean():.0%}; NQ present {NQ.notna().mean():.0%}; both {(LINE.notna() & NQ.notna()).mean():.0%}')
def zprior(x):
    d = pd.Series(np.asarray(x) ** 2, index=G).groupby(DAY.values).mean(); sd = np.sqrt(d.rolling(20, min_periods=10).mean()).shift(1); return (x / DAY.map(sd)).to_numpy()
def cl(x, y, half, rank=False):
    k = half & np.isfinite(x) & np.isfinite(y)
    if k.sum() < 300: return np.nan, np.nan, int(k.sum())
    xs, ys = x[k], y[k]
    if rank: xs, ys = rankdata(xs), rankdata(ys)
    xs, ys = (xs - xs.mean()) / xs.std(), (ys - ys.mean()) / ys.std(); p = pd.Series(xs * ys, index=DAY.values[k]).groupby(level=0).sum()
    return float(np.mean(xs * ys)), float(p.sum() / np.sqrt((p ** 2).sum())), int(k.sum())
def bh(p, q=0.10):
    p = np.asarray(p, float); ok_ = np.isfinite(p); out = np.zeros(len(p), bool)
    if not ok_.any(): return out
    ps = p[ok_]; o = np.argsort(ps); m = len(ps); kk = np.where(ps[o] <= q * np.arange(1, m + 1) / m)[0]
    if len(kk): out[np.where(ok_)[0][o[:kk.max() + 1]]] = True
    return out
FWD = {h: (NQ.shift(-n) - NQ).to_numpy() for h, n in HB.items()}
def fwd_rv(n):
    r = (R1 ** 2).to_numpy(); c = np.nancumsum(np.nan_to_num(r)); cnt = np.cumsum(np.isfinite(r)); out = np.full(len(r), np.nan)
    out[:-n] = np.sqrt(c[n:] - c[:-n]); good = np.zeros(len(r), bool); good[:-n] = (cnt[n:] - cnt[:-n]) >= 0.8 * n; out[~good] = np.nan; return out
def rel(v):
    d = pd.DataFrame({'v': v, 'd': DAY.values, 'h': HOUR}); dh = d.groupby(['d', 'h']).v.mean().unstack('h'); base = dh.rolling(20, min_periods=10).mean().shift(1).stack()
    return v / base.reindex(pd.MultiIndex.from_arrays([DAY.values, HOUR])).to_numpy()
RV = {h: np.log(rel(fwd_rv(n)) + 1e-9) for h, n in HB.items() if n >= 2}
L = LINE.to_numpy(); WX = {w: zprior(LINE - LINE.shift(n)) for w, n in (('15m', 1), ('1h', 4), ('4h', 16))}
OUTL = ['# COG-VIDEO-CLAIMS results', '', f'Run once per forge/COG_VIDEO_CLAIMS_PREREG.md. Line = identified formula; explore to Jul 17, confirm from Jul 20.', '']
# ---------- power ----------
def f1_cells(half, plant=None, vol=False, rank=False):
    rows = []
    for w in WX:
        for h in HB:
            x = np.abs(WX[w]) if vol else WX[w]
            if vol:
                if h not in RV: continue
                y = RV[h].copy()
            else: y = FWD[h].copy()
            if plant and not vol:
                k = np.isfinite(x) & np.isfinite(y); y[k] += plant * np.nanstd(y[k]) * (x[k] - np.nanmean(x[k])) / np.nanstd(x[k])
            r, t, n = cl(x, y, half, rank); rows.append(dict(W=w, H=h, rho=r, t=t, n=n))
    return pd.DataFrame(rows)
OUTL += ['## Power (planted lead into explore, F1 direction; detected = any cell |t| >= 2.5)', '', '| planted rho | max abs t | detected |', '|---|---|---|']
for rho in (0.03, 0.05, 0.08, 0.12):
    m = f1_cells(EXPL, rho).t.abs().max(); OUTL.append(f'| {rho:.2f} | {m:.2f} | {"yes" if m >= 2.5 else "no"} |')
OUTL.append('')
def run_family(name, fn_cells):
    E, C = fn_cells(EXPL), fn_cells(CONF); M = E.merge(C, on=['W', 'H'] if 'W' in E else ['K', 'H'], suffixes=('_e', '_c'))
    M['fdr'] = bh(2 * norm.sf(np.abs(M.t_e))); M['p1_c'] = [norm.sf(np.sign(a) * b) if np.isfinite(b) else np.nan for a, b in zip(M.rho_e, M.t_c)]
    M['confirmed'] = M.fdr & (M.p1_c < 0.05); return M
# ---------- F1 ----------
F1d = run_family('F1d', lambda h: f1_cells(h)); F1v = run_family('F1v', lambda h: f1_cells(h, vol=True)); F1ic = f1_cells(EXPL, rank=True), f1_cells(CONF, rank=True)
OUTL += ['## F1 continuous lead', '', f'**Direction** (line change over W vs Nasdaq return over H): {int(F1d.fdr.sum())} of {len(F1d)} cells pass FDR 10% in explore; confirmed {int(F1d.confirmed.sum())}.', '',
         'explore correlation (rows W, cols H):', '', F1d.pivot(index='W', columns='H', values='rho_e')[list(HB)].round(3).to_markdown(), '', 'confirm correlation:', '', F1d.pivot(index='W', columns='H', values='rho_c')[list(HB)].round(3).to_markdown(), '',
         'confirm t:', '', F1d.pivot(index='W', columns='H', values='t_c')[list(HB)].round(2).to_markdown(), '',
         f'**Volatility** (|line change| vs log forward realised vol): {int(F1v.fdr.sum())} of {len(F1v)} pass FDR in explore; confirmed {int(F1v.confirmed.sum())}.', '',
         'explore correlation:', '', F1v.pivot(index='W', columns='H', values='rho_e')[[h for h in HB if h in RV]].round(3).to_markdown(), '', 'confirm correlation:', '', F1v.pivot(index='W', columns='H', values='rho_c')[[h for h in HB if h in RV]].round(3).to_markdown(), '',
         f'IC (rank correlation), explore max |rho| {F1ic[0].rho.abs().max():.3f}, confirm max |rho| {F1ic[1].rho.abs().max():.3f}.', '']
# same-bar link for context
OUTL += ['same-window link (line change over W vs Nasdaq return over the SAME W): ' + '; '.join(f'W={w}: explore rho {cl(WX[w], (NQ - NQ.shift(n)).to_numpy(), EXPL)[0]:+.3f} (t {cl(WX[w], (NQ - NQ.shift(n)).to_numpy(), EXPL)[1]:+.1f}), confirm {cl(WX[w], (NQ - NQ.shift(n)).to_numpy(), CONF)[0]:+.3f} (t {cl(WX[w], (NQ - NQ.shift(n)).to_numpy(), CONF)[1]:+.1f})' for w, n in (('15m', 1), ('1h', 4), ('4h', 16))), '']
# ---------- F2: swing then confirm ----------
def swing(K):
    s_ = pd.Series(L, index=G); lo = (s_ == s_.rolling(K, min_periods=K).min()) & (s_.shift(-1) > s_) & (s_.shift(-2) > s_) & (s_.shift(-3) > s_)
    hi = (s_ == s_.rolling(K, min_periods=K).max()) & (s_.shift(-1) < s_) & (s_.shift(-2) < s_) & (s_.shift(-3) < s_)
    sg = np.zeros(len(G)); sg[lo.to_numpy()] = 1; sg[hi.to_numpy()] = -1; out = np.zeros(len(G)); out[3:] = sg[:-3]; return out          # fires 3 bars (45 min) after the extreme
SIG = {K: swing(K) for K in (16, 32, 96)}; HF2 = ['1h', '2h', '4h', '8h', '24h', '48h']
def f2_cells(half, draws=1000, absolute=False):
    rows = []
    for K, sig in SIG.items():
        for h in HF2:
            v = np.abs(FWD[h]) if absolute else FWD[h]; valid = half & np.isfinite(FWD[h]); ev = valid & (sig != 0)
            if ev.sum() < 15: rows.append(dict(K=K, H=h, n=int(ev.sum()), rho=np.nan, t=np.nan, base=np.nan)); continue
            y = (v[ev] if absolute else sig[ev] * v[ev]); obs = y.mean(); pools = {hh: v[valid & (HOUR == hh)] for hh in np.unique(HOUR[ev])}
            sim = np.array([[(1 if absolute else g) * rng.choice(pools[hh]) for hh, g in zip(HOUR[ev], sig[ev])] for _ in range(300)]).mean(1)
            sdv = sim.std(); rows.append(dict(K=K, H=h, n=int(ev.sum()), rho=obs, t=(obs - sim.mean()) / (sdv + 1e-12), base=sim.mean()))
    return pd.DataFrame(rows)
F2d = run_family('F2d', lambda h: f2_cells(h)); F2v = run_family('F2v', lambda h: f2_cells(h, absolute=True))
OUTL += ['## F2 his Friday event: swing in the line, confirmed 45 min later, then Nasdaq', '',
         f'**Direction** (mean signed return after the event; t vs hour-matched random bars): {int(F2d.fdr.sum())} of {len(F2d)} pass FDR in explore; confirmed {int(F2d.confirmed.sum())}.', '', 'explore mean return (%) / t / n:', '',
         (F2d.assign(c=lambda d: (d.rho_e * 100).round(3).astype(str) + ' / ' + d.t_e.round(1).astype(str) + ' / ' + d.n_e.astype(str)).pivot(index='K', columns='H', values='c')[HF2]).to_markdown(), '', 'confirm mean return (%) / t / n:', '',
         (F2d.assign(c=lambda d: (d.rho_c * 100).round(3).astype(str) + ' / ' + d.t_c.round(1).astype(str) + ' / ' + d.n_c.astype(str)).pivot(index='K', columns='H', values='c')[HF2]).to_markdown(), '',
         f'**Volatility** (mean |return| after the event vs matched bars): {int(F2v.fdr.sum())} of {len(F2v)} pass FDR in explore; confirmed {int(F2v.confirmed.sum())}.', '']
# ---------- F3: divergence ----------
def f3_cells(half):
    rows = []
    for Lh, n in (('4h', 16), ('8h', 32), ('12h', 48)):
        D = zprior(LINE - LINE.shift(n)) - zprior(NQ - NQ.shift(n))
        for h in ('1h', '2h', '4h', '8h', '24h', '48h'):
            r, t, nn = cl(D, FWD[h], half); rows.append(dict(W=Lh, H=h, rho=r, t=t, n=nn))
    return pd.DataFrame(rows)
F3 = run_family('F3', f3_cells)
OUTL += ['## F3 his Monday event: line moves, Nasdaq does not (divergence)', '', f'{int(F3.fdr.sum())} of {len(F3)} pass FDR in explore; confirmed {int(F3.confirmed.sum())}.', '', 'explore correlation (rows L, cols H):', '',
         F3.pivot(index='W', columns='H', values='rho_e')[['1h', '2h', '4h', '8h', '24h', '48h']].round(3).to_markdown(), '', 'confirm correlation:', '', F3.pivot(index='W', columns='H', values='rho_c')[['1h', '2h', '4h', '8h', '24h', '48h']].round(3).to_markdown(), '']
# ---------- case studies ----------
LN, NQs = LINE_O, NQ
fr = LN['2026-09-18 12:00':'2026-09-18 18:00']; nqf = NQs['2026-09-18 12:00':'2026-09-18 18:00']
OUTL += ['## Case studies from the video (descriptive)', '', f'Friday 18 Sep (UTC): line low at **{fr.idxmin():%H:%M}** (his "key low" 15:00 UTC, confirmation 15:45 UTC); confirmation 45 min after the low = **{(fr.idxmin() + pd.Timedelta(minutes=45)):%H:%M}**; Nasdaq futures low that afternoon at **{nqf.idxmin():%H:%M}** (his "priced in" ~16:15 UTC). Line low to Nasdaq low: **{(nqf.idxmin() - fr.idxmin()).total_seconds() / 60:.0f} min**.']
a0, a1 = T('2026-09-21 01:15'), T('2026-09-21 13:15'); dl = LN.loc[a1] - LN.loc[a0]; dn = (NQs.loc[a1] - NQs.loc[a0]) * 100
OUTL += [f'Monday 21 Sep 01:15 → 13:15 UTC: line {LN.loc[a0]:.2f} → {LN.loc[a1]:.2f} ({dl:+.2f} units = {dl*10:+.1f} bp spread widening); Nasdaq {dn:+.2f}%; Nasdaq 13:15 → 16:00: {(NQs.loc[T("2026-09-21 16:00")] - NQs.loc[a1]) * 100:+.2f}%.', '']
M = {'F1_direction': F1d, 'F1_volatility': F1v, 'F2_direction': F2d, 'F2_volatility': F2v, 'F3': F3}
for k, v in M.items(): v.to_csv(OUT + f'video_claims_{k}.csv', index=False)
OUTL += ['## Summary', '', '| family | cells | pass FDR (explore) | confirmed |', '|---|---|---|---|'] + [f'| {k} | {len(v)} | {int(v.fdr.sum())} | {int(v.confirmed.sum())} |' for k, v in M.items()]
open(OUT + 'VIDEO_CLAIMS.md', 'w', encoding='utf-8').write('\n'.join(OUTL)); print('written'); print('\n'.join(OUTL[-12:]))
