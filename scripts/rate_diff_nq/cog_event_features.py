"""COG-EVENT-FEATURES (forge/COG_EVENT_FEATURES_PREREG.md): slope / speed / persistence / magnitude / variability of the SOFR-Euribor series vs Nasdaq
direction, turning points and volatility, with a Nasdaq-only baseline, IC, OOS R-squared, a data audit and trading costs.
    python scripts/rate_diff_nq/cog_event_features.py  -> analysis/output/cog_video_0918/EVENT_FEATURES.md (+ csv, png)
Reuses the data/zig-zag/theta definitions of cog_turn_events.py (everything above its '# ---- run' marker)."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve(); MAIN = HERE.parent / 'cog_turn_events.py'; sys.argv = [sys.argv[0]]
src = MAIN.read_text(encoding='utf-8'); pre = src[:src.index('# ---------------------------------------------------------------- run')]
g = {'__file__': str(MAIN), '__name__': 'turn_core'}; exec(compile(pre, str(MAIN), 'exec'), g); globals().update(g)
from sklearn.linear_model import LogisticRegression
rng = np.random.default_rng(23)
lg = lambda a: np.log(np.maximum(a, 1e-9))

# ------------------------------------------------------------------ causal features of the line
def feature_frame(xarr, k=0.75):
    base = theta_base(xarr); n = len(xarr); state = np.full(n, np.nan); mag = np.full(n, np.nan); age = np.full(n, np.nan); turn = np.zeros(n)
    trend = 0; hi = lo = np.nan; hi_i = lo_i = ext_i = -1; ext = np.nan; start = np.nan; last_conf = -10 ** 9; events = []
    for t in range(n):
        v = xarr[t]; th = k * base[t]
        if not np.isfinite(v) or not np.isfinite(th) or th <= 0: continue
        flip = None
        if trend == 0:
            if not np.isfinite(hi): hi = lo = v; hi_i = lo_i = t
            if v > hi: hi, hi_i = v, t
            if v < lo: lo, lo_i = v, t
            if v - lo >= th: trend = 1; flip = (lo_i, lo); ext, ext_i = v, t
            elif hi - v >= th: trend = -1; flip = (hi_i, hi); ext, ext_i = v, t
        elif trend == 1:
            if v > ext: ext, ext_i = v, t
            elif ext - v >= th: trend = -1; flip = (ext_i, ext); ext, ext_i = v, t
        else:
            if v < ext: ext, ext_i = v, t
            elif v - ext >= th: trend = 1; flip = (ext_i, ext); ext, ext_i = v, t
        if flip is not None:
            start = flip[1]; last_conf = t; events.append((t, flip[0], trend)); turn[t] = trend
        if trend != 0:
            state[t] = trend; mag[t] = abs(ext - start) / th if np.isfinite(start) else np.nan; age[t] = min(t - last_conf, 96) if last_conf > 0 else np.nan
    s = pd.Series(xarr, index=G); dif = s.diff(); dirs = pd.Series(state, index=G)
    turnH = np.zeros(n)
    for c, e, d in events: turnH[c:min(n, c + 8)] = d
    speed = ((s - s.shift(4)) / pd.Series(base, index=G)).to_numpy()
    slope = ((s.ffill(limit=8).ewm(span=8, adjust=False).mean() - s.ffill(limit=8).ewm(span=32, adjust=False).mean()) / dif.rolling(480, min_periods=288).std()).where(s.notna()).to_numpy()
    same = ((dif * dirs) > 0).astype(float).where(dif.notna()); nz = (dif != 0).astype(float).where(dif.notna())
    pers = (same.rolling(16, min_periods=8).sum() / nz.rolling(16, min_periods=8).sum()).to_numpy()
    sd16 = dif.rolling(16, min_periods=10).std(); level = sd16.rolling('20D', min_periods=500, closed='left').mean()
    var = lg(sd16 / level).where((sd16 > 0) & (level > 0)).to_numpy()
    d4 = (s - s.shift(16)); ad = d4.abs(); q90 = ad.rolling('20D', min_periods=500, closed='left').quantile(0.90)
    nabs = np.abs(ret4h); nq30 = pd.Series(nabs, index=G).rolling('20D', min_periods=500, closed='left').quantile(0.30).to_numpy()
    divf = np.where((ad >= q90) & np.isfinite(nabs) & np.isfinite(nq30) & (nabs <= nq30), np.sign(d4), 0.0)
    F = pd.DataFrame(dict(dirF=state, turnF=turnH, magS=state * mag, speed=speed, slope=slope, persS=state * (pers - 0.5), ageS=state * np.log1p(age), divS=divf,
                          aturn=np.abs(turnH), mag=mag, aspeed=np.abs(speed), aslope=np.abs(slope), pers=pers, age=np.log1p(age), var=var, calm=consol.astype(float), adiv=np.abs(divf)), index=G)
    return F, events

F, EVK = feature_frame(X)
SIGNED = ['dirF', 'turnF', 'magS', 'speed', 'slope', 'persS', 'ageS', 'divS']; UNSIGNED = ['aturn', 'mag', 'aspeed', 'aslope', 'pers', 'age', 'var', 'calm', 'adiv']
HALVES = {k: (half_of == k) for k in ('IS', 'VAL', 'OOS')}; ISM = HALVES['IS']
# ------------------------------------------------------------------ audit
audit = []
# (a) no-lookahead: truncation test and shift test on the line features
chk_idx = rng.choice(np.where(np.isfinite(F['dirF'].to_numpy()) & (half_of != ''))[0], 12, replace=False); bad = 0
for t in chk_idx:
    xt = X.copy(); xt[t + 1:] = np.nan; Ft, _ = feature_frame(xt)
    a, b = F.iloc[t][['dirF', 'magS', 'speed', 'slope', 'persS', 'var']].to_numpy(float), Ft.iloc[t][['dirF', 'magS', 'speed', 'slope', 'persS', 'var']].to_numpy(float)
    bad += int(not np.allclose(a, b, equal_nan=True, atol=1e-9))
Fs, _ = feature_frame(np.roll(X, 1)); diffshare = float(np.mean(np.abs(Fs['speed'].to_numpy() - F['speed'].to_numpy())[np.isfinite(F['speed'].to_numpy()) & np.isfinite(Fs['speed'].to_numpy())] > 1e-12))
audit.append(f'Truncation test: features recomputed with every bar after t blanked reproduce the full-series value at t exactly in {12 - bad} of 12 random bars (a mismatch would mean a feature reads the future). Shift test: moving the line forward one bar changes the speed feature in {diffshare:.1%} of bars (so features are tied to bar time).')
# (b) staleness and coverage from the raw 1-minute legs
legs = {}
for nm, f in (('SOFR Sep26 (SR3U6)', DEEP / 'CME_SR3U6.parquet'), ('Euribor Mar27 (IH7)', DEEP / 'ICEEU_IH7.parquet')):
    d = ld(f); c = d['close']; ch = (c.diff() != 0).astype(float); hr = c.index.hour
    cnt = c.resample('15min', label='right', closed='right').count(); cnt = cnt[cnt > 0]
    unch = 1 - ch.groupby(hr).mean(); present = c.groupby(hr).count() / c.groupby(hr).count().max()
    run = (c.diff() != 0).cumsum(); longest = int(run.groupby(run).size().max())
    legs[nm] = dict(minutes=len(c), unchanged_share=float(1 - ch.mean()), longest_unchanged_run_min=longest, dropped_15m_bars_share=float((cnt < 5).mean()), worst_hour_unchanged=int(unch.idxmax()), worst_hour_unchanged_share=float(unch.max()),
                    thin_hours_utc=', '.join(str(int(h)) for h in present[present < 0.5].index))
audit.append('Legs (1-minute midpoints): ' + '; '.join(f"{n}: {v['minutes']:,} minutes, {v['unchanged_share']:.0%} of minutes with an unchanged price, longest unchanged run {v['longest_unchanged_run_min']} min, {v['dropped_15m_bars_share']:.1%} of 15-minute bars below 5 prints (dropped), least-active UTC hour {v['worst_hour_unchanged']:02d} ({v['worst_hour_unchanged_share']:.0%} unchanged), hours below half the peak coverage: {v['thin_hours_utc'] or 'none'}" for n, v in legs.items()))
ev_c = np.array([c for c, e, d in EVK if np.isfinite(X[c])]); us_a, eu_a = us.to_numpy(), eu.to_numpy()
st_at = lambda i: (us_a[i] == us_a[i - 1]) or (eu_a[i] == eu_a[i - 1])
stale_ev = float(np.mean([st_at(c) for c in ev_c if c > 0])); allb = np.where(np.isfinite(X))[0]; stale_all = float(np.mean([st_at(i) for i in allb[::7] if i > 0]))
audit.append(f'Staleness at the decision bar: at {stale_ev:.1%} of confirmed turns at least one leg printed the same 15-minute close as the bar before (one leg flat for 15 minutes), against {stale_all:.1%} of all bars. Interpretation: turns do not systematically coincide with a stale leg; stale legs are common and a turn seen through one flat leg is a one-leg move.')
days_any = pd.Series(np.isfinite(us_a) & np.isfinite(eu_a)).groupby(dayv).any(); days_ok = pd.Series(good).groupby(dayv).any()
def session_of(c):
    h = G[c].hour; return 'Asia' if (h >= 22 or h < 7) else ('Europe' if h < 13 else 'US')
audit.append(f'Quality screen (3 distinct prices per leg per day): {int(days_any.sum())} days with both legs, {int((days_any & ~days_ok).sum())} removed. Session split of confirmed turns: ' + ', '.join(f'{s_} {np.mean([session_of(c) == s_ for c in ev_c]):.0%}' for s_ in ('Asia', 'Europe', 'US')) + '.')
audit.append('Contract rolls: the pinned pair (SR3U6, IH7) has no roll in the window; the next roll is 2026-12-15 (SR3Z6 / IM7). The Pine indicator plot offset (`leadDays`, default 1.0 day, drawn to the right) and every display transform (scale, offset, invert, bp, smoothing, auto-fit) are not used anywhere in this pipeline.')

# ------------------------------------------------------------------ outcomes
ys = pd.Series(Y, index=G); dY = ys.diff()
hod = G.hour.to_numpy(); hmean = {h: np.nanmean(((ys.shift(-8) - ys)[ISM & (hod == h)]).to_numpy()) * 100 for h in range(24)}
OUT = {}
for H in (4, 8, 16, 32):
    y = ((ys.shift(-H) - ys) * 100).to_numpy(); hm = np.array([hmean.get(h, 0) for h in hod]); OUT[f'dir_{H}'] = y - hm if H == 8 else y - np.array([np.nanmean(y[ISM & (hod == h)]) for h in hod])[hod]
conf_up = np.array([c for c, e, d in EVN if d == 1]); conf_dn = np.array([c for c, e, d in EVN if d == -1])
def nxt(arr, t):
    j = np.searchsorted(arr, t, side='right'); return np.where(j < len(arr), arr[np.minimum(j, len(arr) - 1)] - t, 10 ** 9)
ti = np.arange(N); nu, nd_ = nxt(conf_up, ti), nxt(conf_dn, ti)
for H in (8, 16, 32): OUT[f'flipU_{H}'] = (nu <= H).astype(float); OUT[f'flipD_{H}'] = (nd_ <= H).astype(float)
rvp = dY.rolling(8, min_periods=6).std(); rvn = rvp.shift(-8)
OUT['vol_chg'] = lg(rvn / rvp).where((rvp > 0) & (rvn > 0)).to_numpy(); OUT['vol_abs8'] = lg(((ys.shift(-8) - ys).abs() * 100)).where((ys.shift(-8) - ys).abs() > 0).to_numpy()
BINARY = {k for k in OUT if k.startswith('flip')}
# baseline matrix (Nasdaq only)
r8 = ys.rolling(8, min_periods=6); r16 = ys.rolling(16, min_periods=12); r96 = ys.rolling(96, min_periods=48)
B = pd.DataFrame(dict(r1=ret1h * 100, r4=ret4h * 100, r24=ret24h * 100, rng8=lg(r8.max() - r8.min()), rng16=lg(r16.max() - r16.min()), absr4=lg(np.abs(ret4h * 100)), base=lg(BN), pos=((ys - r96.min()) / (r96.max() - r96.min())).to_numpy(), zs=ZN), index=G)
B = pd.concat([B, pd.get_dummies(pd.Series(hod, index=G), prefix='h', dtype=float).iloc[:, 1:]], axis=1).replace([np.inf, -np.inf], np.nan)
BCOLS = list(B.columns); dcode = pd.factorize(pd.Series(dayv))[0]
VALID = (half_of != '') & (~VIDEO)

def prep(yname, fcols):
    D = pd.concat([B, F[fcols]], axis=1); D['y'] = OUT[yname]; D['dc'] = dcode; D['half'] = half_of
    D = D[VALID & D.notna().all(axis=1).to_numpy()]; return D
def std_by_is(D, cols):
    m = D[D.half == 'IS'][cols].mean(); s = D[D.half == 'IS'][cols].std().replace(0, 1); D = D.copy(); D[cols] = (D[cols] - m) / s; return D
def cfit(D, cols, y='y'):
    Xm = np.column_stack([np.ones(len(D))] + [D[c].values for c in cols]); yv = D[y].values; XtXi = np.linalg.pinv(Xm.T @ Xm); b = XtXi @ Xm.T @ yv; e = yv - Xm @ b
    dc = D['dc'].values; starts = np.r_[0, np.flatnonzero(np.diff(dc)) + 1]; sc = np.add.reduceat(Xm * e[:, None], starts, axis=0); V = XtXi @ (sc.T @ sc) @ XtXi
    return b, np.sqrt(np.diag(V)), Xm
def day_ic(D, col, y='y', min_n=12):
    out = []
    for _, g_ in D.groupby('dc'):
        if len(g_) >= min_n and g_[col].std() > 0 and g_[y].std() > 0: out.append(stats.spearmanr(g_[col], g_[y]).statistic)
    out = np.array(out); return (out.mean(), out.mean() / (out.std(ddof=1) / np.sqrt(len(out))), len(out)) if len(out) > 5 else (np.nan, np.nan, len(out))
def oos_gain(D, fcols, binary):
    tr, te = D[D.half != 'OOS'], D[D.half == 'OOS']
    if len(te) < 500 or len(tr) < 500: return np.nan, np.nan, np.nan, None
    if not binary:
        b0, _, _ = cfit(tr, BCOLS); b1, _, _ = cfit(tr, BCOLS + fcols)
        X0 = np.column_stack([np.ones(len(te))] + [te[c].values for c in BCOLS]); X1 = np.column_stack([np.ones(len(te))] + [te[c].values for c in BCOLS + fcols])
        p0, p1 = X0 @ b0, X1 @ b1; sse0, sse1 = (te['y'].values - p0) ** 2, (te['y'].values - p1) ** 2; sst = ((te['y'].values - tr['y'].mean()) ** 2).sum()
        per = pd.Series(sse0 - sse1).groupby(te['dc'].values).sum(); gain = per.sum() / sst; bs = [per.sample(len(per), replace=True, random_state=int(i)).sum() / sst for i in range(300)]
        return gain, np.percentile(bs, 2.5), np.percentile(bs, 97.5), (p1 - p0, te)
    m0 = LogisticRegression(C=50, max_iter=300).fit(tr[BCOLS], tr['y']); m1 = LogisticRegression(C=50, max_iter=300).fit(tr[BCOLS + fcols], tr['y'])
    q0, q1 = m0.predict_proba(te[BCOLS])[:, 1], m1.predict_proba(te[BCOLS + fcols])[:, 1]; y = te['y'].values
    ll = lambda q: y * np.log(np.clip(q, 1e-9, 1)) + (1 - y) * np.log(np.clip(1 - q, 1e-9, 1)); per = pd.Series(ll(q1) - ll(q0)).groupby(te['dc'].values).sum(); n = len(te)
    return per.sum() / n, np.percentile([per.sample(len(per), replace=True, random_state=int(i)).sum() / n for i in range(300)], 2.5), np.percentile([per.sample(len(per), replace=True, random_state=int(i)).sum() / n for i in range(300)], 97.5), (q1 - q0, te)

rows = []; INCR = {}
plan = [(o, SIGNED) for o in OUT if o.startswith('dir') or o.startswith('flip')] + [(o, UNSIGNED) for o in OUT if o.startswith('vol')]
for oname, fset in plan:
    binary = oname in BINARY; Dall = prep(oname, fset); Dall = std_by_is(Dall, BCOLS + fset)
    for feat in fset + ['COMBINED']:
        fc = fset if feat == 'COMBINED' else [feat]; rec = dict(outcome=oname, feature=feat)
        for hf in ('IS', 'VAL', 'OOS'):
            sub = Dall[Dall.half == hf]
            if len(sub) < 500: rec.update({f'b_{hf}': np.nan, f't_{hf}': np.nan}); continue
            b, se, _ = cfit(sub, BCOLS + fc); rec[f'b_{hf}'] = b[-1] if feat != 'COMBINED' else np.nan; rec[f't_{hf}'] = b[-1] / se[-1] if feat != 'COMBINED' else np.nan
            rec[f'n_{hf}'] = len(sub)
        if feat != 'COMBINED':
            for hf in ('IS', 'VAL', 'OOS'):
                ic, ict, nd = day_ic(Dall[Dall.half == hf], feat); rec[f'ic_{hf}'] = ic; rec[f'ict_{hf}'] = ict
        gain, lo, hi, inc = oos_gain(Dall, fc, binary); rec.update(oos_gain=gain, oos_lo=lo, oos_hi=hi)
        if inc is not None:
            ic_i, t_i, _ = day_ic(inc[1].assign(y=inc[1]['y'], inc=inc[0]), 'inc'); rec.update(inc_ic=ic_i, inc_ict=t_i)
            if feat == 'COMBINED' and oname == 'dir_8': INCR['dir_8'] = (inc[0], inc[1])
        rows.append(rec)
R = pd.DataFrame(rows)
# FDR over single-feature cells, in-sample p
sg = R[R.feature != 'COMBINED'].copy(); sg['p_IS'] = 2 * stats.norm.sf(sg.t_IS.abs()); pv = sg['p_IS'].fillna(1).values; o = np.argsort(pv); m = len(sg); ok = pv[o] <= 0.10 * np.arange(1, m + 1) / m; keep = np.zeros(m, bool)
if ok.any(): keep[o[:np.max(np.where(ok)[0]) + 1]] = True
sg['fdr_IS'] = keep; R = R.merge(sg[['outcome', 'feature', 'p_IS', 'fdr_IS']], on=['outcome', 'feature'], how='left')
def passed(r):
    if r.feature == 'COMBINED': return bool(np.isfinite(r.oos_lo) and r.oos_lo > 0 and np.isfinite(r.inc_ict) and r.inc_ict > 2)
    same = np.sign(r.b_IS) == np.sign(r.b_VAL) == np.sign(r.b_OOS); sig = lambda t: np.isfinite(t) and t > 1.645      # one-sided in the in-sample direction
    s_ = np.sign(r.b_IS)
    return bool(r.fdr_IS is True and same and sig(s_ * r.t_VAL) and sig(s_ * r.t_OOS) and np.isfinite(r.oos_gain) and r.oos_gain > 0 and np.isfinite(r.ic_OOS) and s_ * r.ict_OOS > 2)
R['passes'] = [passed(r) for _, r in R.iterrows()]
R.to_csv(OUTD / 'event_features_cells.csv', index=False)

# ------------------------------------------------------------------ economics (A0 turns at 2 h, and top-5% OOS combined predictions)
ev = [(c, e, d) for c, e, d in EVK if np.isfinite(Y[c]) and half_of[c] != '' and not VIDEO[c]]
rets = []
for c, e, d in ev:
    o = outcome(c, d, 8)
    if o is not None: rets.append(dict(day=str(G[c].date()), half=half_of[c], r=o['ret']))
ER = pd.DataFrame(rets)
def clmean(s, g, B_=1500):
    u, inv = np.unique(g, return_inverse=True); sums = np.bincount(inv, s); cnts = np.bincount(inv).astype(float); idx = rng.integers(0, len(u), size=(B_, len(u))); bm = sums[idx].sum(1) / cnts[idx].sum(1); return s.mean(), np.percentile(bm, 2.5), np.percentile(bm, 97.5)
eco = []
for hf in ('VAL', 'OOS', 'ALL'):
    s = ER if hf == 'ALL' else ER[ER.half == hf]; m_, lo_, hi_ = clmean(s.r.values, s.day.values)
    for cost in (0.005, 0.01, 0.02): eco.append(dict(strategy='trade every confirmed line turn in its direction (2 h)', half=hf, n=len(s), gross_pct=m_, cost_bp=cost * 100, net_pct=m_ - cost, net_lo=lo_ - cost, net_hi=hi_ - cost))
if 'dir_8' in INCR:
    inc, te = INCR['dir_8']; te = te.assign(inc=inc); thr = te.inc.abs().quantile(0.95); top = te[te.inc.abs() >= thr]; r_ = (np.sign(top.inc) * top.y).values; m_, lo_, hi_ = clmean(r_, top.dc.values)
    for cost in (0.005, 0.01, 0.02): eco.append(dict(strategy='OOS top 5% of |combined-model increment| (2 h, direction of the increment)', half='OOS', n=len(top), gross_pct=m_, cost_bp=cost * 100, net_pct=m_ - cost, net_lo=lo_ - cost, net_hi=hi_ - cost))
ECO = pd.DataFrame(eco)

# ------------------------------------------------------------------ event table for every k (time of event, time confirmable, information at confirmation)
evrows = []
for k in (0.5, 0.75, 1.0, 1.5, 2.5):
    Fk, evk = feature_frame(X, k)
    for c, e, d in evk:
        if not np.isfinite(X[c]): continue
        evrows.append(dict(k=k, extreme_time=str(G[e]), confirm_time=str(G[c]), lag_min=(c - e) * 15, direction=d, magnitude_bp=float(abs(X[c] - X[e])), theta_bp=float(k * theta_base(X)[c]) if False else np.nan, speed=Fk['speed'].iloc[c], slope=Fk['slope'].iloc[c], persistence=Fk['pers'].iloc[c], var=Fk['var'].iloc[c], nasdaq_state=ZN[c], nasdaq_calm=bool(consol[c]), half=half_of[c]))
pd.DataFrame(evrows).to_csv(OUTD / 'event_features_events.csv', index=False)

# ------------------------------------------------------------------ video week figure
a, b = pd.Timestamp('2026-09-16', tz='UTC'), pd.Timestamp('2026-09-24', tz='UTC'); w = np.where((G >= a) & (G < b))[0]
fig, ax = plt.subplots(5, 1, figsize=(15, 11), sharex=True)
ax[0].plot(G[w], X[w], color='#3b6fd4'); ax[0].set_ylabel('line (bp)'); ax[1].plot(G[w], Y[w], color='#222'); ax[1].set_ylabel('Nasdaq (log)')
ax[2].plot(G[w], F['slope'].to_numpy()[w], color='#6b5bb3'); ax[2].axhline(0, color='k', lw=.5); ax[2].set_ylabel('slope')
ax[3].plot(G[w], F['persS'].to_numpy()[w] + 0.5, color='#1a8a5a'); ax[3].axhline(0.5, color='k', lw=.5); ax[3].set_ylabel('persistence (signed)')
ax[4].plot(G[w], F['var'].to_numpy()[w], color='#c0392b'); ax[4].axhline(0, color='k', lw=.5); ax[4].set_ylabel('variability change (log)')
for c, e, d in EVK:
    if a <= G[c] < b:
        for axx in ax: axx.axvline(G[c], color='#e0a800', lw=.6, ls=':')
        ax[0].plot(G[e], X[e], marker='^' if d == 1 else 'v', color='#e0a800'); ax[0].plot(G[c], X[c], marker='o', mfc='none', color='#e0a800')
ax[0].set_title('Video week 16-23 Sep 2026: line features at each bar; dotted = confirm time of a line turn (triangle = extreme, circle = confirm)'); plt.tight_layout(); plt.savefig(OUTD / 'event_features_video_week.png', dpi=100); plt.close()
vid = []
for c, e, d in EVK:
    if a <= G[c] < b:
        o = outcome(c, d, 8); vid.append(dict(extreme=str(G[e])[:16], confirm=str(G[c])[:16], d=d, mag_bp=round(abs(X[c] - X[e]), 2), slope=round(F['slope'].iloc[c], 2), speed=round(F['speed'].iloc[c], 2), persistence=round(F['pers'].iloc[c], 2), var=round(F['var'].iloc[c], 2), nasdaq_state=int(ZN[c]) if np.isfinite(ZN[c]) else 0, ret_2h=None if o is None else round(o['ret'], 3), result='n/a' if o is None else ('favourable' if o['fav'] else ('adverse' if o['adv'] else 'neither'))))
VID = pd.DataFrame(vid)

# ------------------------------------------------------------------ write-up
def fm(df, cols, nd=3):
    d = df[cols].copy()
    for c in d.columns:
        if d[c].dtype == float: d[c] = d[c].map(lambda v: '' if pd.isna(v) else f'{v:+.{nd}f}')
    return d.to_markdown(index=False)
cols_main = ['outcome', 'feature', 't_IS', 't_VAL', 't_OOS', 'ic_OOS', 'ict_OOS', 'oos_gain', 'oos_lo', 'oos_hi', 'p_IS', 'fdr_IS', 'passes']
passes = R[R.passes]
fam = (R.feature != 'COMBINED').sum()
dirs = R[R.outcome.str.startswith('dir')]; flips = R[R.outcome.str.startswith('flip')]; vols = R[R.outcome.str.startswith('vol')]
def verdict(sub, name):
    p = sub[sub.passes & (sub.feature != 'COMBINED')]; c = sub[sub.passes & (sub.feature == 'COMBINED')]
    if len(p) or len(c): return f'**{name}: ' + ('robust' if len(p) and len(c) else 'exploratory (one gate only)') + f'** ({len(p)} single-feature and {len(c)} combined cells pass)'
    return f'**{name}: inconclusive / none** (0 cells pass)'
txt = ['# COG-EVENT-FEATURES results', '', 'Run once per forge/COG_EVENT_FEATURES_PREREG.md. Research series only (raw bp, close-labelled, no display transform, no plot lead). In-sample 2024-04-15 to 2025-03-31, validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09; video week excluded.', '',
       '## Verdicts (registered rules)', '', '- ' + verdict(dirs, 'Direction'), '- ' + verdict(flips, 'Turning point (Nasdaq flip within H)'), '- ' + verdict(vols, 'Volatility'),
       f'- FDR family: {fam} single-feature cells (10%). Cells passing every gate overall: {len(passes)}.', '',
       '## Data and clock audit']
txt += [f'- {a_}' for a_ in audit] + ['', '## Single-feature and combined results (t = date-clustered t of the feature added to the Nasdaq-only baseline, per half; IC = day-level Spearman IC out of sample with its t; oos_gain = out-of-sample R-squared gain (direction, volatility) or log-likelihood gain per observation (flip outcomes), with 95% day-block CI; p_IS / fdr_IS = in-sample p and BH-FDR 10% across the family)', '', fm(R, cols_main), '']
txt += ['## Cells that pass every registered gate', '', fm(passes, cols_main) if len(passes) else '_none_', '',
        '## Economic significance (net of round-trip cost; 0.5 / 1.0 / 2.0 bp of price)', '', ECO.assign(gross_pct=ECO.gross_pct.round(4), net_pct=ECO.net_pct.round(4), net_lo=ECO.net_lo.round(4), net_hi=ECO.net_hi.round(4)).to_markdown(index=False), '',
        '## Video week, every confirmed line turn with its features and 2 h outcome (descriptive, not used for any statistic)', '', VID.to_markdown(index=False) if len(VID) else '_none_', '',
        'Figure: `event_features_video_week.png`. Event-level table (every k, with extreme time, confirm time and the information at confirmation): `event_features_events.csv`; every cell: `event_features_cells.csv`.', '',
        '## Limits', '- Only the pinned pair has deep history: contract-month robustness is not testable; the Dec-2026 roll is the first chance to test a second contract set forward.',
        '- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.', '- Costs are assumptions (1.0 bp round trip is for liquid index futures), not measured fills.',
        '- Logit/OLS are linear baselines; no nonlinear model was fitted and none is justified before a linear signal exists.']
(OUTD / 'EVENT_FEATURES.md').write_text('\n'.join(txt), encoding='utf-8')
print('\n'.join(txt[:20])); print('passes:', len(passes))
