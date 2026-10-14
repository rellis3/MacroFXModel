"""forge/COG_TREND_STATE_PREREG.md -- one run. Fuzzy causal trend states (adaptive zig-zag) of C.OG's line and of Nasdaq; M1 state cross-correlation at shifts -24 h..+48 h
with a day-shift scramble null; M2 'line turns while Nasdaq has not yet'. Output: analysis/output/cog_video_0918/TREND_STATE.md + trend_state.png"""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from scipy.stats import norm
OUT = 'analysis/output/cog_video_0918/'; rng = np.random.default_rng(20261014)
T = lambda s: pd.Timestamp(s, tz='UTC')
G = pd.date_range('2026-04-13 00:15', '2026-10-10', freq='15min', tz='UTC')
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def rate(p): return 100 - ld(p).close.resample('15min', label='right', closed='right').last().reindex(G)
LINE = ((rate('analysis/output/stir_1m/CME_SR3U6.parquet') - rate('analysis/output/stir_1m/ICEEU_IH7.parquet')) * 100)            # bp, close-labelled, raw
NQ = pd.read_parquet('analysis/output/rate_curve_structure/bars15.parquet')['NQ'].reindex(G)                                        # stitched log level
DAY = pd.Series(G.date, index=G); HOUR = G.hour.to_numpy()
EXPL = np.asarray((G > T('2026-04-13')) & (G <= T('2026-07-18'))); CONF = np.asarray((G > T('2026-07-20')) & (G <= T('2026-10-10')))
both = (LINE.notna() & NQ.notna()).to_numpy(); print(f'bars {len(G)}; line {LINE.notna().mean():.0%}; NQ {NQ.notna().mean():.0%}; both {both.mean():.0%}')
def theta_rms(x):
    d = (x - x.shift(16)); dd = pd.Series(np.asarray(d) ** 2, index=G).groupby(DAY.values).mean(); sd = np.sqrt(dd.rolling(20, min_periods=10).mean()).shift(1)
    return DAY.map(sd).to_numpy()
BASE = {'line': theta_rms(LINE), 'nq': theta_rms(NQ)}
def zigzag(x, base, k):
    """Causal adaptive zig-zag on the bars where x is present. Returns state array (+1/-1/nan), events [(confirm_idx, extreme_idx, dir)]."""
    n = len(x); state = np.full(n, np.nan); ev = []; trend = 0; hi = lo = np.nan; hi_i = lo_i = ext_i = -1; ext = np.nan
    for t in range(n):
        v = x[t]; th = k * base[t]
        if not np.isfinite(v) or not np.isfinite(th) or th <= 0: continue
        if trend == 0:
            if not np.isfinite(hi): hi = lo = v; hi_i = lo_i = t
            if v > hi: hi, hi_i = v, t
            if v < lo: lo, lo_i = v, t
            if v - lo >= th: trend = 1; ev.append((t, lo_i, 1)); ext, ext_i = v, t
            elif hi - v >= th: trend = -1; ev.append((t, hi_i, -1)); ext, ext_i = v, t
        elif trend == 1:
            if v > ext: ext, ext_i = v, t
            elif ext - v >= th: trend = -1; ev.append((t, ext_i, -1)); ext, ext_i = v, t
        else:
            if v < ext: ext, ext_i = v, t
            elif v - ext >= th: trend = 1; ev.append((t, ext_i, 1)); ext, ext_i = v, t
        if trend != 0: state[t] = trend
    return state, ev
def cc(a, b, half):
    k = half & np.isfinite(a) & np.isfinite(b)
    if k.sum() < 400: return np.nan, np.nan
    xs, ys = a[k] - a[k].mean(), b[k] - b[k].mean(); sx, sy = xs.std(), ys.std()
    if sx == 0 or sy == 0: return np.nan, np.nan
    p = pd.Series((xs / sx) * (ys / sy), index=DAY.values[k]).groupby(level=0).sum(); return float(np.mean((xs / sx) * (ys / sy))), float(p.sum() / np.sqrt((p ** 2).sum()))
def shifted(s, tau_h):                       # value of s at t + tau (bars of 15 min)
    n = int(round(tau_h * 4)); out = np.full(len(s), np.nan)
    if n >= 0: out[:len(s) - n] = s[n:]
    else: out[-n:] = s[:len(s) + n]
    return out
TAUS = list(range(-24, 49)); LEAD = [t for t in TAUS if t >= 1]
OUTL = ['# COG-TREND-STATE results', '', 'Run once per forge/COG_TREND_STATE_PREREG.md. Fuzzy causal trend states (adaptive zig-zag), line vs Nasdaq. Explore to Jul 17, confirm from Jul 20.', '']
fig, ax = plt.subplots(3, 2, figsize=(14, 10)); ST = {}
m1_rows = []; m2_rows = []
for ki, k in enumerate((0.75, 1.5, 2.5)):
    sL, evL = zigzag(LINE.to_numpy(), BASE['line'], k); sN, evN = zigzag(NQ.to_numpy(), BASE['nq'], k); ST[k] = (sL, sN, evL, evN)
    OUTL.append(f'## k = {k}: line flips {len(evL)} (explore {sum(1 for e in evL if EXPL[e[0]])}, confirm {sum(1 for e in evL if CONF[e[0]])}), Nasdaq flips {len(evN)} (explore {sum(1 for e in evN if EXPL[e[0]])}, confirm {sum(1 for e in evN if CONF[e[0]])})')
    # ---- M1 ----
    curves = {}
    for name, half in (('explore', EXPL), ('confirm', CONF)):
        curves[name] = np.array([cc(sL, shifted(sN, t), half)[0] for t in TAUS]); tt = np.array([cc(sL, shifted(sN, t), half)[1] for t in TAUS]); curves[name + '_t'] = tt
    # day-shift scramble: roll Nasdaq's state by whole days (96 bars each), keep the line's
    null_max = {n: [] for n in ('explore', 'confirm')}; null_all = {n: [] for n in ('explore', 'confirm')}
    for _ in range(300):
        d = int(rng.integers(3, 100)) * 96; sN_r = np.roll(sN, d)
        for name, half in (('explore', EXPL), ('confirm', CONF)):
            cs = np.array([cc(sL, shifted(sN_r, t), half)[0] for t in LEAD[::3]]); null_max[name].append(np.nanmax(np.abs(cs))); null_all[name].append(cs)
    band_fw = {n: float(np.nanpercentile(null_max[n], 95)) for n in null_max}; band_tau = {n: np.nanpercentile(np.abs(np.array(null_all[n])), 95, axis=0) for n in null_all}
    lead_e = curves['explore'][[TAUS.index(t) for t in LEAD]]; lead_c = curves['confirm'][[TAUS.index(t) for t in LEAD]]
    imax = int(np.nanargmax(np.abs(lead_e))); tau_best = LEAD[imax]
    ok_e = np.nanmax(np.abs(lead_e)) > band_fw['explore']; ok_c = np.sign(lead_c[imax]) == np.sign(lead_e[imax]) and abs(lead_c[imax]) > float(np.interp(tau_best, LEAD[::3], band_tau['confirm']))
    peak0 = {n: (TAUS[int(np.nanargmax(curves[n]))], float(np.nanmax(curves[n]))) for n in ('explore', 'confirm')}
    m1_rows.append(dict(k=k, same_time_explore=curves['explore'][TAUS.index(0)], same_time_confirm=curves['confirm'][TAUS.index(0)], peak_explore=peak0['explore'], peak_confirm=peak0['confirm'],
                        best_lead_tau_h=tau_best, lead_c_explore=lead_e[imax], lead_c_confirm=lead_c[imax], fw95_explore=band_fw['explore'], explore_exceeds=bool(ok_e), confirm_confirms=bool(ok_c), PASS=bool(ok_e and ok_c)))
    a = ax[ki, 0]
    for name, col in (('explore', 'tab:blue'), ('confirm', 'tab:orange')): a.plot(TAUS, curves[name], color=col, label=name)
    a.axhspan(-band_fw['explore'], band_fw['explore'], color='grey', alpha=0.2, label='scramble 95% (explore, lead range)'); a.axvline(0, color='k', lw=0.6); a.axhline(0, color='k', lw=0.4); a.set_title(f'k={k}: corr(line state(t), Nasdaq state(t+tau)); tau>0 = line leads', fontsize=9); a.set_xlabel('tau (hours)'); a.legend(fontsize=7)
    # ---- M2 ----
    for name, half in (('explore', EXPL), ('confirm', CONF)):
        pass
    res_k = []
    for d in (1, -1):
        for hname, H in (('1h', 4), ('2h', 8), ('4h', 16), ('8h', 32), ('24h', 96), ('48h', 192)):
            for name, half in (('explore', EXPL), ('confirm', CONF)):
                # per-day aggregates: events (line flips to d at t_c with Nasdaq state -d) and baseline bars (Nasdaq state -d)
                ev_day = {}; base_day = {}
                valid = half & np.isfinite(sN)
                succ_flip = np.zeros(len(G), bool)                    # from bar b with state -d: does state become d within H bars?
                isd = (sN == d)
                nxt = np.where(isd, np.arange(len(G)), len(G) * 10)   # next bar index where state == d, computed backwards
                nxt = np.minimum.accumulate(nxt[::-1])[::-1]
                succ_flip = (nxt - np.arange(len(G))) <= H
                for b in np.where(valid & (sN == -d))[0]:
                    dd = DAY.iloc[b]; e = base_day.setdefault(dd, [0, 0]); e[0] += 1; e[1] += int(succ_flip[b])
                lags = []
                for (tc, te, dr) in evL:
                    if dr != d or not half[tc] or not np.isfinite(sN[tc]) or sN[tc] != -d: continue
                    dd = DAY.iloc[tc]; e = ev_day.setdefault(dd, [0, 0]); e[0] += 1; e[1] += int(succ_flip[tc])
                nE = sum(v[0] for v in ev_day.values()); nB = sum(v[0] for v in base_day.values())
                if nE < 8 or nB < 100: res_k.append(dict(k=k, dir=d, H=hname, half=name, nE=nE, diff=np.nan, z=np.nan, mde=np.nan)); continue
                pE = sum(v[1] for v in ev_day.values()) / nE; pB = sum(v[1] for v in base_day.values()) / nB
                days = sorted(set(ev_day) | set(base_day)); bs = []
                for _ in range(400):
                    pick = rng.choice(len(days), len(days)); e0 = e1 = b0 = b1 = 0
                    for i in pick:
                        x = ev_day.get(days[i]); y = base_day.get(days[i])
                        if x: e0 += x[0]; e1 += x[1]
                        if y: b0 += y[0]; b1 += y[1]
                    if e0 > 0 and b0 > 0: bs.append(e1 / e0 - b1 / b0)
                se = np.std(bs); res_k.append(dict(k=k, dir=d, H=hname, half=name, nE=nE, pE=pE, pB=pB, diff=pE - pB, z=(pE - pB) / (se + 1e-12), mde=2.8 * se))
    m2_rows += res_k
    # flip-rate bars for the best-powered horizon (8h, up)
    a = ax[ki, 1]; R = pd.DataFrame(res_k); sel = R[(R['dir'] == 1)]
    for name, col, off in (('explore', 'tab:blue', -0.2), ('confirm', 'tab:orange', 0.2)):
        s_ = sel[sel['half'] == name]; a.bar(np.arange(len(s_)) + off, s_['diff'].fillna(0) * 100, width=0.4, color=col, label=name)
    a.set_xticks(range(6)); a.set_xticklabels(['1h', '2h', '4h', '8h', '24h', '48h']); a.axhline(0, color='k', lw=0.5); a.set_ylabel('percentage points'); a.set_title(f'k={k}: line turns UP while Nasdaq is in a down-trend: extra chance Nasdaq turns up within H', fontsize=8); a.legend(fontsize=7)
plt.tight_layout(); plt.savefig(OUT + 'trend_state.png', dpi=95)
M1 = pd.DataFrame(m1_rows); M2 = pd.DataFrame(m2_rows)
E = M2[M2['half'] == 'explore'].reset_index(drop=True); C = M2[M2['half'] == 'confirm'].reset_index(drop=True)
Mg = E.merge(C, on=['k', 'dir', 'H'], suffixes=('_e', '_c'))
def bh(p, q=0.10):
    p = np.asarray(p, float); ok = np.isfinite(p); out = np.zeros(len(p), bool)
    if not ok.any(): return out
    ps = p[ok]; o = np.argsort(ps); m = len(ps); kk = np.where(ps[o] <= q * np.arange(1, m + 1) / m)[0]
    if len(kk): out[np.where(ok)[0][o[:kk.max() + 1]]] = True
    return out
Mg['fdr'] = bh(2 * norm.sf(np.abs(Mg.z_e))); Mg['p1_c'] = [norm.sf(np.sign(a) * b) if np.isfinite(b) else np.nan for a, b in zip(Mg.diff_e, Mg.z_c)]; Mg['confirmed'] = Mg.fdr & (Mg.p1_c < 0.05)
pd.set_option('display.width', 220)
OUTL += ['', '## M1: state cross-correlation (line state at t vs Nasdaq state at t + tau)', '', M1.round(3).to_markdown(index=False), '',
         'same_time = correlation at tau 0; peak = (tau in hours, value) of the highest correlation over -24..+48 h; best_lead_tau = the lead (tau >= 1 h) with the largest |correlation| in explore.', '',
         '## M2: the line turns to a direction while Nasdaq is still in the opposite trend; does Nasdaq turn within H?', '',
         f'{len(Mg)} cells; {int(Mg.fdr.sum())} pass FDR 10% in explore; {int(Mg.confirmed.sum())} confirmed. Cells with enough events: {int(Mg.diff_e.notna().sum())}.', '',
         Mg[['k', 'dir', 'H', 'nE_e', 'pE_e', 'pB_e', 'diff_e', 'z_e', 'mde_e', 'nE_c', 'diff_c', 'z_c', 'fdr', 'confirmed']].round(3).to_markdown(index=False), '']
open(OUT + 'TREND_STATE.md', 'w', encoding='utf-8').write('\n'.join(OUTL)); Mg.to_csv(OUT + 'trend_state_m2.csv', index=False); M1.to_csv(OUT + 'trend_state_m1.csv', index=False); print('written')
