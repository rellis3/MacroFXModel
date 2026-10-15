"""COG-SEQUENCE-EVENTS (forge/COG_SEQUENCE_EVENTS_PREREG.md): direction change -> confirmation/confluence -> lagged Nasdaq, an interpretable test read
alongside the flexible model of cog_shape_agnostic.py.
    python scripts/rate_diff_nq/cog_sequence_events.py [--placebo 200] [--sel-placebo 60]   -> analysis/output/cog_video_0918/SEQUENCE_EVENTS.md (+ csv, png)
"""
import sys, warnings, itertools
from pathlib import Path
warnings.filterwarnings('ignore')
HERE = Path(__file__).resolve()
def _arg(n, d): return int(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else d
NPL, NSEL = _arg('--placebo', 200), _arg('--sel-placebo', 60); sys.argv = [sys.argv[0]]
shape_src = (HERE.parent / 'cog_shape_agnostic.py').read_text(encoding='utf-8'); shape_src = shape_src[:shape_src.index('# ------------------------------------------------------------------ real run')]
g0 = {'__file__': str(HERE.parent / 'cog_shape_agnostic.py'), '__name__': 'shape_core'}; exec(compile(shape_src, 'cog_shape_agnostic.py', 'exec'), g0); globals().update(g0)
rng = np.random.default_rng(41)
import zoneinfo
from sklearn.tree import DecisionTreeRegressor, export_text
from sklearn.linear_model import Ridge
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
NY = zoneinfo.ZoneInfo('America/New_York')
FOMC = {'2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16'}
def near_release(c):
    t = G[c].tz_convert(NY)
    if t.weekday() >= 5: return False
    for hh, mm, only_fomc in ((8, 30, False), (10, 0, False), (14, 0, True)):
        if only_fomc and t.strftime('%Y-%m-%d') not in FOMC: continue
        if 0 <= (t - t.replace(hour=hh, minute=mm, second=0)).total_seconds() / 60 <= 30: return True
    return False

# ------------------------------------------------------------------ the state machine
BASE_LINE = theta_base(X)
def stage1(xarr, base, k1):
    return zigzag(xarr, base, k1)[1]                     # [(trigger bar t1, extreme bar e, dir)]
def confirm(xarr, base, ev, typ, par, W):
    """For each stage-1 event, find the first bar t2 in (t1, t1+W] where stage 2 holds without the line passing the extreme e. Returns [(t2, e, t1, d)]."""
    out = []; n = len(xarr)
    for (t1, e, d) in ev:
        th = base[t1]
        if not np.isfinite(th) or th <= 0: continue
        xe = xarr[e]; x1 = xarr[t1]; pm = d * (x1 - xe); pulled = False; pm_at = np.nan
        for t in range(t1 + 1, min(n, t1 + W + 1)):
            v = xarr[t]
            if not np.isfinite(v): continue
            leg = d * (v - xe)
            if leg <= 0: break                           # sequence cancelled: the line gave back the whole first push
            ok = False
            if typ == 'continue': ok = d * (v - x1) >= par * th
            elif typ == 'accelerate':
                if t - 4 >= 0 and np.isfinite(xarr[t - 4]): ok = d * (v - xarr[t - 4]) >= par * th
            else:                                         # retest
                if not pulled:
                    pm = max(pm, leg)
                    if leg <= pm * (1 - par): pulled = True; pm_at = pm
                elif leg > pm_at: ok = True
            if ok: out.append((t, e, t1, d)); break
    return out
SPECS = [dict(k1=k1, typ=typ, par=par, W=W) for k1 in (0.25, 0.5) for (typ, par) in (('continue', 0.5), ('continue', 1.0), ('retest', 0.3), ('retest', 0.5), ('accelerate', 0.5), ('accelerate', 1.0)) for W in (8, 16, 32)]
PRIMARY = dict(k1=0.5, typ='continue', par=0.5, W=16)
sname = lambda s: f"k1={s['k1']} {s['typ']}({s['par']}) W={s['W']}"
S1 = {k1: stage1(X, BASE_LINE, k1) for k1 in (0.25, 0.5)}
EV = {sname(s): confirm(X, BASE_LINE, S1[s['k1']], s['typ'], s['par'], s['W']) for s in SPECS}
print('events per spec:', {k: len(v) for k, v in list(EV.items())[:6]}, '...', flush=True)

# ------------------------------------------------------------------ per-bar Nasdaq outcome arrays (unsigned) and controls
NBN = np.where(np.isfinite(BN), BN, np.nan); U = 0.75 * NBN
def ret_arr(H): a = np.full(N, np.nan); a[:N - H] = (Y[H:] - Y[:N - H]) * 100; return a
RET = {H: ret_arr(H) for H in (4, 8, 16, 32)}
BUCK = [(0, 4), (4, 8), (8, 16), (16, 32), (32, 64)]
def bucket_arr(a, b): r = np.full(N, np.nan); r[:N - b] = (Y[b:] - Y[a:N - b + a]) * 100 if False else (Y[b:] - Y[a:N - b + a][:N - b]) * 100; return r
def bucket_arr2(a, b):
    r = np.full(N, np.nan); idx = np.arange(N - b); r[idx] = (Y[idx + b] - Y[idx + a]) * 100; return r
BK = {(a, b): bucket_arr2(a, b) for a, b in BUCK}
TU = np.full(N, 10 ** 6); TD = np.full(N, 10 ** 6)
for t in range(N - 1):
    if not np.isfinite(Y[t]) or not np.isfinite(U[t]) or U[t] <= 0: continue
    seg = Y[t + 1:t + 65] - Y[t]
    if len(seg) == 0: continue
    seg = np.where(np.isfinite(seg), seg, 0.0); up = np.flatnonzero(seg >= U[t]); dn = np.flatnonzero(seg <= -U[t])
    if len(up): TU[t] = up[0] + 1
    if len(dn): TD[t] = dn[0] + 1
fw8 = np.abs(RET[8]); VOLA = np.where(fw8 > 0, np.log(np.maximum(fw8, 1e-9)), np.nan)
Vq = pd.qcut(pd.Series(rng8).rank(method='first'), 5, labels=False).to_numpy()
okc = np.isfinite(Y) & np.isfinite(ZN) & np.isfinite(Qb) & np.isfinite(Vq) & (half_of != '') & (~VIDEO)
POOLV = {}
for i in np.where(okc)[0]: POOLV.setdefault((int(ZN[i]), int(G[i].hour), int(Qb[i]), int(Vq[i])), []).append(i)
POOLV = {k: np.array(v) for k, v in POOLV.items()}
def ctrls(c, K=20):
    if not (np.isfinite(ZN[c]) and np.isfinite(Qb[c]) and np.isfinite(Vq[c])): return np.array([], int)
    cand = np.concatenate([POOLV.get((int(ZN[c]), (int(G[c].hour) + dh) % 24, int(Qb[c]), int(Vq[c])), np.array([], int)) for dh in (-1, 0, 1)]); cand = cand[np.abs(cand - c) > 64]
    return rng.choice(cand, size=min(K, len(cand)), replace=False) if len(cand) else cand
def own_seq_dir():
    """Nasdaq's own primary-spec sequence: direction of any Nasdaq stage-2 confirmation in the previous 32 bars (+1, -1, 0 none, 2 both)."""
    ev = confirm(Y, BN, stage1(Y, BN, PRIMARY['k1']), PRIMARY['typ'], PRIMARY['par'], PRIMARY['W'])
    up = np.zeros(N, bool); dn = np.zeros(N, bool)
    for t2, e, t1, d in ev:
        (up if d == 1 else dn)[t2:min(N, t2 + 33)] = True
    return up, dn
NUP, NDN = own_seq_dir()
def contexts(c, d):
    return {'all': True, 'nasdaq opposed': ZN[c] == -d, 'nasdaq consolidating': bool(consol[c]), 'nasdaq has not yet shown its own sequence': not (NUP[c] if d == 1 else NDN[c])}
def spec_frame(evs, K=20):
    rows = []
    for (t2, e, t1, d) in evs:
        if VIDEO[t2] or half_of[t2] == '' or not np.isfinite(Y[t2]): continue
        cs = ctrls(t2, K)
        if len(cs) < 5: continue
        r = dict(i=t2, day=str(G[t2].date()), half=half_of[t2], d=d, lag_min=(t2 - e) * 15, rel=near_release(t2), **contexts(t2, d))
        ok = True
        for H in (4, 8, 16, 32): r[f'ret{H}'] = RET[H][t2] * d; r[f'b_ret{H}'] = np.nanmean(RET[H][cs]) * d
        for (a, b) in BUCK: r[f'bk{a}_{b}'] = BK[(a, b)][t2] * d; r[f'b_bk{a}_{b}'] = np.nanmean(BK[(a, b)][cs]) * d
        ft = TU[t2] if d == 1 else TD[t2]; at = TD[t2] if d == 1 else TU[t2]; r['resp64'] = float(ft <= 64); r['b_resp64'] = np.mean([(TU[j] if d == 1 else TD[j]) <= 64 for j in cs])
        r['fav16'] = float(ft <= 16 and ft < at); r['adv16'] = float(at <= 16 and at < ft); r['b_fav16'] = np.mean([((TU[j] if d == 1 else TD[j]) <= 16) and ((TU[j] if d == 1 else TD[j]) < (TD[j] if d == 1 else TU[j])) for j in cs]); r['b_adv16'] = np.mean([((TD[j] if d == 1 else TU[j]) <= 16) and ((TD[j] if d == 1 else TU[j]) < (TU[j] if d == 1 else TD[j])) for j in cs])
        r['vol'] = VOLA[t2]; r['b_vol'] = np.nanmean(VOLA[cs]); r['resp_time'] = ft if ft <= 64 else np.nan
        if np.isfinite(r['ret8']) and np.isfinite(r['b_ret8']): rows.append(r)
    return pd.DataFrame(rows)
def cluster_t(e, days):
    u, inv = np.unique(days, return_inverse=True); S = np.bincount(inv, e); n = np.bincount(inv).astype(float); m = e.mean(); se = np.sqrt(((S - m * n) ** 2).sum()) / len(e)
    return m, (m / se if se > 0 else np.nan)

# ------------------------------------------------------------------ in-sample selection over the grid
CTX = ['all', 'nasdaq opposed', 'nasdaq consolidating', 'nasdaq has not yet shown its own sequence']
FR = {sname(s): spec_frame(EV[sname(s)]) for s in SPECS}
sel = []
for s in SPECS:
    df = FR[sname(s)]; isd = df[df.half == 'IS']
    for cx in CTX:
        sub = isd[isd[cx]]
        for H in (4, 8, 16, 32):
            if len(sub) < 30: continue
            m, t = cluster_t((sub[f'ret{H}'] - sub[f'b_ret{H}']).to_numpy(), sub.day.to_numpy()); sel.append(dict(spec=sname(s), ctx=cx, H=H, n=len(sub), diff=m, t=t))
SEL = pd.DataFrame(sel); SEL['p'] = 2 * stats.norm.sf(SEL.t.abs()); pv = SEL.p.fillna(1).values; o = np.argsort(pv); m_ = len(SEL); thr = 0.10 * np.arange(1, m_ + 1) / m_; ok = pv[o] <= thr; kp = np.zeros(m_, bool)
if ok.any(): kp[o[:np.max(np.where(ok)[0]) + 1]] = True
SEL['fdr'] = kp
top = SEL[(SEL.ctx == 'all') & (SEL.H == 8)].sort_values('t', ascending=False)
topfdr = SEL[SEL.fdr & (SEL.H == 8)].sort_values('t', ascending=False).drop_duplicates('spec').head(3).spec.tolist()
FROZEN = [sname(PRIMARY)] + [x for x in topfdr if x != sname(PRIMARY)]
print('frozen:', FROZEN, 'FDR cells in-sample:', int(SEL.fdr.sum()), 'of', len(SEL), flush=True)

# ------------------------------------------------------------------ frozen evaluation on validation and OOS
def eff(df, col, bcol, B=2000):
    if len(df) < 8: return (np.nan,) * 3 + (np.nan, len(df), 0)
    return boot(df.assign(day=df.day), col, bcol, B)
ROWS = []
for nm in FROZEN:
    df = FR[nm]
    for cx in CTX:
        for hf in ('IS', 'VAL', 'OOS'):
            sub = df[(df.half == hf) & df[cx]]
            for met, col, bcol in (('ret8', 'ret8', 'b_ret8'), ('ret4', 'ret4', 'b_ret4'), ('ret16', 'ret16', 'b_ret16'), ('ret32', 'ret32', 'b_ret32'), ('fav16', 'fav16', 'b_fav16'), ('adv16', 'adv16', 'b_adv16'), ('resp64', 'resp64', 'b_resp64'), ('vol8', 'vol', 'b_vol')):
                m, lo, hi, p1, n, nd = eff(sub, col, bcol, B=1000); ROWS.append(dict(spec=nm, context=cx, half=hf, metric=met, n=n, days=nd, event_mean=float(sub[col].mean()) if len(sub) else np.nan, matched_diff=m, ci_lo=lo, ci_hi=hi, p_one_sided=p1))
EVT = pd.DataFrame(ROWS)
def cell(nm, cx, hf, met): r = EVT[(EVT.spec == nm) & (EVT.context == cx) & (EVT.half == hf) & (EVT.metric == met)]; return r.iloc[0] if len(r) else None

# ------------------------------------------------------------------ plain placebo (primary spec) and selection-aware placebo
def sign_ok(r): return r is not None and np.isfinite(r.matched_diff) and r.matched_diff > 0 and r.p_one_sided < 0.05
pl_eff = {m: [] for m in ('ret8', 'fav16', 'resp64', 'vol8')}
def shifted(sh):
    xs = np.roll(X, sh); bs = np.roll(BASE_LINE, sh); return xs, bs
for r_ in range(NPL):
    sh = int(rng.integers(5, 61)) * 96 * (1 if rng.random() < .5 else -1); xs, bs = shifted(sh)
    ev = confirm(xs, bs, zigzag(xs, bs, PRIMARY['k1'])[1], PRIMARY['typ'], PRIMARY['par'], PRIMARY['W'])[:700]
    df = spec_frame(ev, K=8)
    if len(df) > 30:
        pl_eff['ret8'].append((df.ret8 - df.b_ret8).mean()); pl_eff['fav16'].append((df.fav16 - df.b_fav16).mean()); pl_eff['resp64'].append((df.resp64 - df.b_resp64).mean()); pl_eff['vol8'].append((df.vol - df.b_vol).mean())
    if r_ % 20 == 0: print('plain placebo', r_, flush=True)
# selection-aware: all specs in-sample (unmatched, hour-demeaned), pick best, score on VAL+OOS
hm8 = np.array([np.nanmean(RET[8][(half_of == 'IS') & (G.hour.to_numpy() == h)]) for h in range(24)]); DM8 = RET[8] - hm8[G.hour.to_numpy()]
def quick_t(evs, mask):
    r = [(d * DM8[t2], str(G[t2].date())) for (t2, e, t1, d) in evs if mask[t2] and np.isfinite(DM8[t2]) and not VIDEO[t2]]
    if len(r) < 30: return np.nan, 0
    v = np.array([a for a, b in r]); dd = np.array([b for a, b in r]); return cluster_t(v, dd)[1], len(v)
ISM, VOM = (half_of == 'IS'), np.isin(half_of, ['VAL', 'OOS'])
def best_in_sample(xs, bs):
    S1x = {k1: zigzag(xs, bs, k1)[1] for k1 in (0.25, 0.5)}; best = (-1e9, None, None)
    allev = {}
    for s in SPECS:
        ev = confirm(xs, bs, S1x[s['k1']], s['typ'], s['par'], s['W']); allev[sname(s)] = ev; t, n = quick_t(ev, ISM)
        if np.isfinite(t) and t > best[0]: best = (t, sname(s), ev)
    t_out, n_out = quick_t(best[2], VOM) if best[2] is not None else (np.nan, 0); return best[0], best[1], t_out
real_best = best_in_sample(X, BASE_LINE); SELPL = []
for r_ in range(NSEL):
    sh = int(rng.integers(5, 61)) * 96 * (1 if rng.random() < .5 else -1); xs, bs = shifted(sh); SELPL.append(best_in_sample(xs, bs))
    if r_ % 10 == 0: print('selection-aware placebo', r_, flush=True)
SELPL = pd.DataFrame(SELPL, columns=['is_t_best', 'spec', 'val_oos_t_of_best'])

# ------------------------------------------------------------------ Nasdaq-only regression with the sequence signal (primary spec)
sig = np.zeros(N)
for (t2, e, t1, d) in EV[sname(PRIMARY)]: sig[t2:min(N, t2 + 8)] = d
DES = pd.DataFrame(dict(y=RET[8], s=sig, r1=ret1h * 100, r4=ret4h * 100, r24=ret24h * 100, rv=((pd.Series(BN, index=G) - np.nanmean(BN)) / np.nanstd(BN)).to_numpy(), pos=NFD['N_pos64'].to_numpy(), zs=ZN, day=dcode, half=half_of, vid=VIDEO), index=G)
DES = pd.concat([DES, pd.get_dummies(pd.Series(G.hour, index=G), prefix='h', dtype=float).iloc[:, 1:]], axis=1)
DES = DES[(DES.half != '') & (~DES.vid)].drop(columns='vid').replace([np.inf, -np.inf], np.nan).dropna()
RC = ['r1', 'r4', 'r24', 'rv', 'pos', 'zs'] + [c for c in DES.columns if c.startswith('h_')]
def cfit(D, cols):
    Xm = np.column_stack([np.ones(len(D))] + [D[c].values for c in cols]); y = D['y'].values; XtXi = np.linalg.pinv(Xm.T @ Xm); b = XtXi @ Xm.T @ y; e = y - Xm @ b
    dc = D['day'].values; st = np.r_[0, np.flatnonzero(np.diff(dc)) + 1]; sc = np.add.reduceat(Xm * e[:, None], st, axis=0); V = XtXi @ (sc.T @ sc) @ XtXi; return b, np.sqrt(np.diag(V))
REG = []
for hf in ('IS', 'VAL', 'OOS'):
    sub = DES[DES.half == hf]; b, se = cfit(sub, RC + ['s']); REG.append(dict(half=hf, coef_s=b[-1], t_s=b[-1] / se[-1], n=len(sub), days=sub.day.nunique()))
tr, te = DES[DES.half != 'OOS'], DES[DES.half == 'OOS']
def r2(cols):
    b, _ = cfit(tr, cols); p = np.column_stack([np.ones(len(te))] + [te[c].values for c in cols]) @ b; return 1 - ((te.y - p) ** 2).sum() / ((te.y - tr.y.mean()) ** 2).sum()
REG.append(dict(half='OOS R2 without s / with s', coef_s=r2(RC), t_s=r2(RC + ['s']), n=len(te), days=te.day.nunique())); REG = pd.DataFrame(REG)

DESV = DES.copy(); DESV['y'] = VOLA[DES.index.map(lambda t: G.get_loc(t))] if False else pd.Series(VOLA, index=G).reindex(DES.index).to_numpy()
DESV['rng8'] = NFD['N_rng8'].reindex(DES.index).to_numpy(); DESV['rng16'] = NFD['N_rng16'].reindex(DES.index).to_numpy(); DESV['absr4'] = np.log(np.maximum(np.abs(DES['r4']), 1e-6)); DESV['base'] = NFD['N_base'].reindex(DES.index).to_numpy()
DESV = DESV.replace([np.inf, -np.inf], np.nan).dropna(); RCV = ['rng8', 'rng16', 'absr4', 'base'] + [c for c in DES.columns if c.startswith('h_')]
REGV = []
for hf in ('IS', 'VAL', 'OOS'):
    sub = DESV[DESV.half == hf]; b, se = cfit(sub, RCV + ['s']); REGV.append(dict(half=hf, coef_s=b[-1], t_s=b[-1] / se[-1], n=len(sub), days=sub.day.nunique()))
trv, tev = DESV[DESV.half != 'OOS'], DESV[DESV.half == 'OOS']
def r2v(cols):
    b, _ = cfit(trv, cols); p_ = np.column_stack([np.ones(len(tev))] + [tev[c].values for c in cols]) @ b; return 1 - ((tev.y - p_) ** 2).sum() / ((tev.y - trv.y.mean()) ** 2).sum()
REGV.append(dict(half='OOS R2 without s / with s', coef_s=r2v(RCV), t_s=r2v(RCV + ['s']), n=len(tev), days=tev.day.nunique())); REGV = pd.DataFrame(REGV)
# ------------------------------------------------------------------ verdict for each frozen spec
PL = {k: np.array([v for v in vv if np.isfinite(v)]) for k, vv in pl_eff.items()}
sel_p = float((SELPL.val_oos_t_of_best >= real_best[2]).mean()) if np.isfinite(real_best[2]) else np.nan
VER = []
for nm in FROZEN:
    c = {hf: cell(nm, 'all', hf, 'ret8') for hf in ('VAL', 'OOS')}; f = {hf: cell(nm, 'all', hf, 'fav16') for hf in ('VAL', 'OOS')}; a = {hf: cell(nm, 'all', hf, 'adv16') for hf in ('VAL', 'OOS')}
    ret_ok = all(sign_ok(c[h]) for h in c); race_ok = all((f[h] is not None and a[h] is not None and f[h].matched_diff - a[h].matched_diff > 0 and f[h].p_one_sided < 0.05) for h in f)
    allret = cell(nm, 'all', 'VAL', 'ret8')
    n_all = FR[nm][FR[nm].half.isin(['VAL', 'OOS'])]; real_eff = (n_all.ret8 - n_all.b_ret8).mean() if len(n_all) else np.nan
    beats = bool(len(PL['ret8']) > 20 and nm == sname(PRIMARY) and real_eff > np.percentile(PL['ret8'], 95)) if nm == sname(PRIMARY) else None
    mean_pl = float(PL['ret8'].mean()) if len(PL['ret8']) else np.nan
    inc_ok = bool(nm == sname(PRIMARY) and all(REG[REG.half == hf].iloc[0].t_s > 2 for hf in ('VAL', 'OOS')) and REG.iloc[-1].t_s >= REG.iloc[-1].coef_s) if nm == sname(PRIMARY) else None
    nr = n_all[~n_all.rel]; nr_eff = (nr.ret8 - nr.b_ret8).mean() if len(nr) else np.nan
    VER.append(dict(spec=nm, ret_ok=ret_ok, race_ok=race_ok, beats_plain_placebo95=beats, placebo_mean_ret8=mean_pl, selection_aware_p=(sel_p if nm != sname(PRIMARY) else None), incremental_ok=inc_ok, no_release_effect=nr_eff, real_val_oos_effect=real_eff))
VER = pd.DataFrame(VER)
VER['passes'] = [bool(r.ret_ok and r.race_ok and (r.beats_plain_placebo95 is not False) and (r.incremental_ok is not False) and np.isfinite(r.no_release_effect) and r.no_release_effect > 0 and (r.selection_aware_p is None or (np.isfinite(r.selection_aware_p) and r.selection_aware_p < 0.05))) for _, r in VER.iterrows()]
# economics, primary spec
ev_p = FR[sname(PRIMARY)]; ECO = []
for hf in ('VAL', 'OOS', 'VAL+OOS'):
    sub = ev_p[ev_p.half.isin(['VAL', 'OOS'])] if hf == 'VAL+OOS' else ev_p[ev_p.half == hf]
    if len(sub) < 10: continue
    u_, inv = np.unique(sub.day.values, return_inverse=True); sums = np.bincount(inv, sub.ret8.values); cnt = np.bincount(inv).astype(float); idx = rng.integers(0, len(u_), size=(1500, len(u_))); bm = sums[idx].sum(1) / cnt[idx].sum(1)
    for cost in (0.005, 0.01, 0.02): ECO.append(dict(half=hf, n=len(sub), gross_pct=sub.ret8.mean(), cost_bp=cost * 100, net_pct=sub.ret8.mean() - cost, net_lo=np.percentile(bm, 2.5) - cost, net_hi=np.percentile(bm, 97.5) - cost))
ECO = pd.DataFrame(ECO)
nmP = sname(PRIMARY); vv = {hf: cell(nmP, 'all', hf, 'vol8') for hf in ('VAL', 'OOS')}
vol_all = FR[nmP][FR[nmP].half.isin(['VAL', 'OOS'])]; vol_real = (vol_all.vol - vol_all.b_vol).mean(); vol_nr = vol_all[~vol_all.rel]; vol_nr_eff = (vol_nr.vol - vol_nr.b_vol).mean()
VOLG = dict(matched_VAL_and_OOS=all(sign_ok(vv[h]) for h in vv), real_val_oos=float(vol_real), plain_placebo_mean=float(PL['vol8'].mean()), plain_placebo_p95=float(np.percentile(PL['vol8'], 95)), beats_placebo95=bool(vol_real > np.percentile(PL['vol8'], 95)),
            regression_t_VAL=float(REGV[REGV.half == 'VAL'].iloc[0].t_s), regression_t_OOS=float(REGV[REGV.half == 'OOS'].iloc[0].t_s), oos_R2_rises=bool(REGV.iloc[-1].t_s > REGV.iloc[-1].coef_s), no_release_effect=float(vol_nr_eff))
VOLG['passes'] = bool(VOLG['matched_VAL_and_OOS'] and VOLG['beats_placebo95'] and VOLG['regression_t_VAL'] > 2 and VOLG['regression_t_OOS'] > 2 and VOLG['oos_R2_rises'] and VOLG['no_release_effect'] > 0)
verdict = 'repeatable sequence found' if VER.passes.any() else 'no repeatable sequence (direction / turn / response)'
vol_verdict = 'volatility context found (no trade)' if VOLG['passes'] else 'volatility effect not validated'

# ------------------------------------------------------------------ (C) flexible model alongside
print('flexible model walk-forward ...', flush=True)
M0 = np.column_stack([NFD.to_numpy(float), HOUR.to_numpy(float)]); DV = divergence(LF); M1df = pd.concat([NFD, HOUR, LF, DV], axis=1); M1 = M1df.to_numpy(float); M1cols = list(M1df.columns)
LINEIDX = [M1cols.index(c) for c in list(LF.columns) + list(DV.columns)]
yd, yv = TARG['dir_16'], TARG['vol_8']
p0d, _ = walk(M0, yd); p1d, _ = walk(M1, yd); p0v, _ = walk(M0, yv); p1v, _ = walk(M1, yv)
union = np.zeros(N, bool)
for nm, evs in EV.items():
    for (t2, e, t1, d) in evs: union[t2 + 1:min(N, t2 + 33)] = True
inc = p1d - p0d; z = np.sign(inc) * yd; mk = HALF['OOS'] & np.isfinite(z)
def inside_outside(z, mask, flag, B=2000):
    d = pd.DataFrame(dict(z=z[mask], f=flag[mask], dc=dcode[mask])); g = d.groupby(['dc', 'f']).z.agg(['sum', 'count']).unstack(fill_value=0)
    s1, c1 = g[('sum', True)].to_numpy(), g[('count', True)].to_numpy(); s0, c0 = g[('sum', False)].to_numpy(), g[('count', False)].to_numpy()
    est = s1.sum() / c1.sum() - s0.sum() / c0.sum(); idx = rng.integers(0, len(s1), size=(B, len(s1))); bs = s1[idx].sum(1) / c1[idx].sum(1) - s0[idx].sum(1) / c0[idx].sum(1)
    return s1.sum() / c1.sum(), s0.sum() / c0.sum(), est, np.percentile(bs, 2.5), np.percentile(bs, 97.5), int(c1.sum())
C1 = inside_outside(z, mk, union)
C1b = float(pd.Series(inc[mk]).corr(pd.Series(sig[mk] * 1.0)))
C1v_in, C1v_out = np.nanmean(np.abs(inc)[mk & union]), np.nanmean(np.abs(inc)[mk & ~union])
# C2 surrogate
Xs = M1df.iloc[:, [M1cols.index(c) for c in list(LF.columns) + list(DV.columns)]]; trm = HALF['VAL'] & np.isfinite(inc); tem = HALF['OOS'] & np.isfinite(inc)
imp = SimpleImputer(strategy='median').fit(Xs[trm]); tree = DecisionTreeRegressor(max_depth=3, min_samples_leaf=500, random_state=0).fit(imp.transform(Xs[trm]), inc[trm])
fid = 1 - ((inc[tem] - tree.predict(imp.transform(Xs[tem]))) ** 2).sum() / ((inc[tem] - inc[trm].mean()) ** 2).sum(); rules = export_text(tree, feature_names=list(Xs.columns))
# C3 quarterly stability
C3 = []
for b in range(len(BL) - 1):
    mq = (G >= BL[b]) & (G < BL[b + 1]) & np.isfinite(p1d) & np.isfinite(p0d)
    for tn, p1, p0, y in (('dir_16', p1d, p0d, yd), ('vol_8', p1v, p0v, yv)):
        a, c = day_ic(p1, y, mq), day_ic(p0, y, mq); idx = a.index.intersection(c.index); C3.append(dict(quarter=str(BL[b])[:10], target=tn, days=len(idx), IC_M0=c[idx].mean(), IC_M1=a[idx].mean(), IC_gain=(a[idx] - c[idx]).mean()))
C3 = pd.DataFrame(C3)
# C4 ablations
def walk_gen(Mat, ytar, make):
    pred = np.full(N, np.nan)
    for b in range(len(BL) - 1):
        a, e = BL[b], BL[b + 1]; test = (G >= a) & (G < e) & VALIDROW & np.isfinite(ytar); train = (G < a - pd.Timedelta(minutes=15 * 96)) & VALIDROW & np.isfinite(ytar)
        if test.sum() < 100 or train.sum() < 2000: continue
        pred[test] = make().fit(Mat[train], ytar[train]).predict(Mat[test])
    return pred
ABL = []
SUBCOLS = [M1cols.index(c) for c in M0COLS] + [M1cols.index(c) for c in GROUPS['zig-zag / confluence'] + GROUPS['momentum']]
variants = {'trees depth 3 (registered)': (None, None), 'ridge, all features': (lambda: make_pipeline(SimpleImputer(strategy='median'), StandardScaler(), Ridge(alpha=1000.0)), 'all'),
            'trees depth 2, 30 iterations': (lambda: HistGradientBoostingRegressor(max_depth=2, max_iter=30, learning_rate=0.05, min_samples_leaf=200, l2_regularization=1.0, early_stopping=False, random_state=0), 'all'),
            'trees depth 3, only zig-zag/confluence + momentum': (lambda: HistGradientBoostingRegressor(**HP), 'sub')}
for vn, (mk_, kind) in variants.items():
    for tn, y, P1r, P0r in (('dir_16', yd, p1d, p0d), ('vol_8', yv, p1v, p0v)):
        if mk_ is None: p1, p0 = P1r, P0r
        else:
            M1x = M1 if kind == 'all' else M1[:, SUBCOLS]; p1 = walk_gen(M1x, y, mk_); p0 = walk_gen(M0, y, mk_)
        gm, lo, hi, ic1, ic0, nd = gain(p1, p0, y, HALF['VAL+OOS'] & np.isfinite(p0) & np.isfinite(p1), B=1000); ABL.append(dict(model=vn, target=tn, IC_M0=ic0, IC_M1=ic1, IC_gain=gm, ci_lo=lo, ci_hi=hi))
ABL = pd.DataFrame(ABL)

# ------------------------------------------------------------------ figures
prim = FR[sname(PRIMARY)]
def fig_lag():
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.5)); labs = [f'{a * 15 // 60 if a else 0}-{b * 15 / 60:g}h' for a, b in BUCK]
    for k, (cx, col) in enumerate((('all', '#3b6fd4'), ('nasdaq has not yet shown its own sequence', '#1a8a5a'))):
        for hf, ls in (('VAL', '-'), ('OOS', '--')):
            sub = prim[(prim.half == hf) & prim[cx]]
            if len(sub) < 10: continue
            m = [(sub[f'bk{a}_{b}'] - sub[f'b_bk{a}_{b}']).mean() for a, b in BUCK]; se = [(sub[f'bk{a}_{b}'] - sub[f'b_bk{a}_{b}']).std() / np.sqrt(len(sub)) for a, b in BUCK]
            ax[0].errorbar(np.arange(5) + 0.08 * k + (0.04 if hf == 'OOS' else 0), m, yerr=1.96 * np.array(se), fmt='o' + ls, color=col, label=f'{cx[:22]} {hf} (n={len(sub)})', alpha=.85)
    ax[0].axhline(0, color='k', lw=.6); ax[0].set_xticks(range(5)); ax[0].set_xticklabels(labs); ax[0].set_ylabel('Nasdaq signed return minus matched baseline (%)'); ax[0].set_title('Primary sequence: what Nasdaq does in each lag window after confirmation'); ax[0].legend(fontsize=7)
    cum = [0]; sub = prim[prim.half.isin(['VAL', 'OOS'])]
    for a, b in BUCK: cum.append(cum[-1] + (sub[f'bk{a}_{b}'] - sub[f'b_bk{a}_{b}']).mean())
    ax[1].plot([0, 1, 2, 4, 8, 16], cum, marker='o', color='#6b5bb3'); ax[1].axhline(0, color='k', lw=.6); ax[1].set_xlabel('hours after confirmation'); ax[1].set_title('Cumulative signed excess return (validation + out-of-sample)'); plt.tight_layout(); plt.savefig(OUTD / 'sequence_events_lag.png', dpi=105); plt.close()
def fig_video():
    a, b = pd.Timestamp('2026-09-16', tz='UTC'), pd.Timestamp('2026-09-24', tz='UTC'); w = np.where((G >= a) & (G < b))[0]
    fig, ax = plt.subplots(2, 1, figsize=(15, 8), sharex=True); ax[0].plot(G[w], X[w], color='#3b6fd4', lw=1.3); ax[1].plot(G[w], Y[w], color='#222', lw=1.1); ax[0].set_ylabel('line (bp)'); ax[1].set_ylabel('Nasdaq (log)')
    for (t2, e, t1, d) in confirm(X, BASE_LINE, S1[PRIMARY['k1']], PRIMARY['typ'], PRIMARY['par'], PRIMARY['W']):
        if a <= G[t2] < b:
            col = '#1a8a5a' if d == 1 else '#c0392b'
            ax[0].plot(G[e], X[e], marker='^' if d == 1 else 'v', color=col, ms=9); ax[0].plot(G[t1], X[t1], marker='s', color=col, ms=5, mfc='none'); ax[0].plot(G[t2], X[t2], marker='o', color=col, ms=6)
            ax[0].plot([G[e], G[t2]], [X[e], X[t2]], color=col, lw=.6, ls=':'); ax[1].axvline(G[t2], color=col, lw=.8, ls=':')
            if np.isfinite(Y[t2]): ax[1].plot(G[t2], Y[t2], marker='o', color=col, ms=5)
    ax[0].set_title('Primary sequence in the video week: triangle = direction change (when it happened), square = trigger (first retrace), filled circle = confirmation (the only moment a signal exists); green up / red down'); plt.tight_layout(); plt.savefig(OUTD / 'sequence_events_video_week.png', dpi=105); plt.close()
fig_lag(); fig_video()
VIDEO_EV = []
for (t2, e, t1, d) in confirm(X, BASE_LINE, S1[PRIMARY['k1']], PRIMARY['typ'], PRIMARY['par'], PRIMARY['W']):
    if pd.Timestamp('2026-09-16', tz='UTC') <= G[t2] < pd.Timestamp('2026-09-24', tz='UTC'):
        ft = TU[t2] if d == 1 else TD[t2]; at = TD[t2] if d == 1 else TU[t2]
        VIDEO_EV.append(dict(direction_change=str(G[e])[:16], trigger=str(G[t1])[:16], confirmed=str(G[t2])[:16], d=d, minutes_to_confirm=(t2 - e) * 15, nasdaq_state=int(ZN[t2]) if np.isfinite(ZN[t2]) else 0, ret_1h=round(RET[4][t2] * d, 3) if np.isfinite(RET[4][t2]) else None, ret_2h=round(RET[8][t2] * d, 3) if np.isfinite(RET[8][t2]) else None, ret_4h=round(RET[16][t2] * d, 3) if np.isfinite(RET[16][t2]) else None, nasdaq_responded_within_16h=bool(ft <= 64), minutes_to_response=(ft * 15 if ft <= 64 else None), result_4h_race='favourable' if (ft <= 16 and ft < at) else ('adverse' if (at <= 16 and at < ft) else 'neither')))
VIDEO_EV = pd.DataFrame(VIDEO_EV)

# ------------------------------------------------------------------ write-up
fm = lambda d, nd=3: d.to_markdown(index=False, floatfmt=f'.{nd}f')
prim_rows = EVT[(EVT.spec == sname(PRIMARY)) & (EVT.context == 'all')]
lagtab = []
for hf in ('IS', 'VAL', 'OOS'):
    sub = prim[prim.half == hf]
    for a, b in BUCK:
        m, lo, hi, p1, n, nd = boot(sub.assign(e=1), f'bk{a}_{b}', f'b_bk{a}_{b}', B=800); lagtab.append(dict(half=hf, bucket=f'{a * 15 // 60 if a else 0}-{b * 15 / 60:g} h', n=n, diff_pct=m, ci_lo=lo, ci_hi=hi, p_one_sided=p1))
LAGT = pd.DataFrame(lagtab)
cnt = pd.DataFrame([dict(spec=sname(s), events=len(EV[sname(s)]), scored=len(FR[sname(s)])) for s in SPECS])
txt = ['# COG-SEQUENCE-EVENTS results', '', 'Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.', '',
       f'## Verdict (registered rule, interpretable events): **{verdict}**', '', f'- Specs in the grid: {len(SPECS)}; in-sample FDR cells passing: {int(SEL.fdr.sum())} of {len(SEL)}. Frozen for evaluation: {FROZEN}.',
       f'- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = {real_best[0]:+.2f} ({real_best[1]}), its validation+OOS t = {real_best[2]:+.2f}; placebo (n = {len(SELPL)}): in-sample best-of-36 t averages {SELPL.is_t_best.mean():+.2f} (95th pct {SELPL.is_t_best.quantile(.95):+.2f}), and their validation+OOS t averages {SELPL.val_oos_t_of_best.mean():+.2f} (95th pct {SELPL.val_oos_t_of_best.quantile(.95):+.2f}). Share of placebo picks scoring at least as well as the real pick out of sample: {sel_p:.3f}.',
       f'- Plain placebo, primary spec (n = {len(PL["ret8"])}): mean matched effect on the 2 h signed return {PL["ret8"].mean():+.4f} (5-95%: {np.percentile(PL["ret8"], 5):+.4f} to {np.percentile(PL["ret8"], 95):+.4f}); move to favourable share {PL["fav16"].mean():+.4f}; response share {PL["resp64"].mean():+.4f}.', '',
       f'## Volatility verdict (separate, same gates against its own matched baseline): **{vol_verdict}**', '', pd.DataFrame([VOLG]).to_markdown(index=False, floatfmt='.4f'), '', 'Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):', '', fm(REGV), '',
       '### Gates for each frozen spec', fm(VER), '', '### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)', fm(prim_rows[['context', 'half', 'metric', 'n', 'days', 'event_mean', 'matched_diff', 'ci_lo', 'ci_hi', 'p_one_sided']]), '',
       '### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation', fm(LAGT), '', '### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)', fm(REG), '',
       'The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.', '', '### Economic check, primary spec, 2 h signed return per event net of round-trip cost', fm(ECO, 4), '',
       '### In-sample grid (all contexts, H = 8): top 12 by t', fm(top.head(12)[['spec', 'n', 'diff', 't']]), '', '### Events per spec', fm(cnt), '',
       '## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)', '',
       f'- **C1, where the model\'s edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = {C1[0]:+.4f}% inside the 32 bars after any confirmed sequence (n = {C1[5]:,}) versus {C1[1]:+.4f}% outside; difference {C1[2]:+.4f}% (95% day-block CI {C1[3]:+.4f} to {C1[4]:+.4f}). Mean |M1 - M0| inside {C1v_in:.4f} versus outside {C1v_out:.4f}. Correlation of (M1 - M0) with the primary sequence signal: {C1b:+.3f}.',
       f'- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared {fid:+.3f}. Rules:', '```', rules, '```', '- **C3, stability by quarter**', fm(C3), '', '- **C4, complexity ablation** (reporting only; nothing selected from it)', fm(ABL), '',
       '## The video week, every primary-spec sequence (descriptive, not used in any statistic)', fm(VIDEO_EV) if len(VIDEO_EV) else '_none_', '', '## Figures', '`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.', '',
       '## Limits (stated, not hidden)', '- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.', '- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.', '- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.', '- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.']
(OUTD / 'SEQUENCE_EVENTS.md').write_text('\n'.join(txt), encoding='utf-8')
SEL.to_csv(OUTD / 'sequence_events_grid_insample.csv', index=False); EVT.to_csv(OUTD / 'sequence_events_frozen.csv', index=False)
print('VERDICT:', verdict, '|', vol_verdict, VOLG); print(VER.to_string()); print(C1, C1b, fid); print(ABL.to_string())
