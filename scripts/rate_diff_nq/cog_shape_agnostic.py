"""COG-SHAPE-AGNOSTIC (forge/COG_SHAPE_AGNOSTIC_PREREG.md): a flexible model sees the line's multi-scale path (turn, confirmation, second move, divergence);
its out-of-sample gain over a Nasdaq-only model is the evidence.
    python scripts/rate_diff_nq/cog_shape_agnostic.py [--placebo 60]  -> analysis/output/cog_video_0918/SHAPE_AGNOSTIC.md
Reuses data / theta / zig-zag definitions from cog_turn_events.py (everything above its '# ---- run' marker)."""
import sys, warnings
from pathlib import Path
warnings.filterwarnings('ignore')
HERE = Path(__file__).resolve(); MAIN = HERE.parent / 'cog_turn_events.py'
_n = int(sys.argv[sys.argv.index('--placebo') + 1]) if '--placebo' in sys.argv else 60; sys.argv = [sys.argv[0]]
src = MAIN.read_text(encoding='utf-8'); pre = src[:src.index('# ---------------------------------------------------------------- run')]
g = {'__file__': str(MAIN), '__name__': 'turn_core'}; exec(compile(pre, str(MAIN), 'exec'), g); globals().update(g)
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import roc_auc_score
rng = np.random.default_rng(31); lg = lambda a: np.log(np.maximum(a, 1e-9))
SC = (2, 4, 8, 16, 32, 64, 128); POSW = (16, 64, 256); TSW = (32, 128)

def zz_features(xarr, base, k=0.75):
    n = len(xarr); state = np.full(n, np.nan); age = np.full(n, np.nan); mag = np.full(n, np.nan); ratio = np.full(n, np.nan); turn = np.zeros(n)
    trend = 0; hi = lo = np.nan; hi_i = lo_i = ext_i = -1; ext = np.nan; start = np.nan; prev_leg = np.nan; last_conf = -10 ** 9; ev = []
    for t in range(n):
        v = xarr[t]; th = k * base[t]
        if not np.isfinite(v) or not np.isfinite(th) or th <= 0: continue
        flip = None
        if trend == 0:
            if not np.isfinite(hi): hi = lo = v; hi_i = lo_i = t
            if v > hi: hi, hi_i = v, t
            if v < lo: lo, lo_i = v, t
            if v - lo >= th: trend = 1; flip = lo; ext = v
            elif hi - v >= th: trend = -1; flip = hi; ext = v
        elif trend == 1:
            if v > ext: ext = v
            elif ext - v >= th: trend = -1; flip = ext; ext = v
        else:
            if v < ext: ext = v
            elif v - ext >= th: trend = 1; flip = ext; ext = v
        if flip is not None:
            if np.isfinite(start): prev_leg = abs(flip - start)
            start = flip; last_conf = t; ev.append((t, trend)); turn[t] = trend
        if trend != 0:
            leg = abs(ext - start) if np.isfinite(start) else np.nan; state[t] = trend; age[t] = min(t - last_conf, 96) if last_conf > 0 else np.nan
            mag[t] = leg / th if np.isfinite(leg) else np.nan; ratio[t] = min(leg / prev_leg, 5.0) if (np.isfinite(leg) and np.isfinite(prev_leg) and prev_leg > 0) else np.nan
    held = np.zeros(n)
    for c, d in ev: held[c:min(n, c + 8)] = d
    return state, age, mag, ratio, held

def line_features(xarr):
    base = theta_base(xarr); th = pd.Series(base, index=G); s = pd.Series(xarr, index=G); F = {}
    for sc in SC:
        d = (s - s.shift(sc)) / th; F[f'L_mom{sc}'] = d; F[f'L_curv{sc}'] = d - (s.shift(sc) - s.shift(2 * sc)) / th
    for w in POSW:
        r = s.rolling(w, min_periods=int(.6 * w)); F[f'L_pos{w}'] = (s - r.min()) / (r.max() - r.min())
    for w in TSW:
        F[f'L_bhi{w}'] = s.rolling(w, min_periods=int(.6 * w)).apply(lambda a: (len(a) - 1 - np.nanargmax(a)) / len(a) if np.isfinite(a).any() else np.nan, raw=True)
        F[f'L_blo{w}'] = s.rolling(w, min_periods=int(.6 * w)).apply(lambda a: (len(a) - 1 - np.nanargmin(a)) / len(a) if np.isfinite(a).any() else np.nan, raw=True)
    st, age, mag, ratio, held = zz_features(xarr, base)
    F['L_state'] = st; F['L_age'] = age; F['L_leg'] = mag; F['L_legratio'] = ratio; F['L_turn8'] = held
    dif = s.diff(); sd16 = dif.rolling(16, min_periods=10).std(); level = sd16.rolling('20D', min_periods=500, closed='left').mean(); F['L_var'] = lg(sd16 / level).where((sd16 > 0) & (level > 0))
    return pd.DataFrame(F, index=G)
bn = pd.Series(BN, index=G); ysr = pd.Series(Y, index=G); NF = {}
for sc in SC:
    d = (ysr - ysr.shift(sc)) / bn; NF[f'N_mom{sc}'] = d; NF[f'N_curv{sc}'] = d - (ysr.shift(sc) - ysr.shift(2 * sc)) / bn
for w in POSW:
    r = ysr.rolling(w, min_periods=int(.6 * w)); NF[f'N_pos{w}'] = (ysr - r.min()) / (r.max() - r.min())
NF['N_state'] = ZN; r8 = ysr.rolling(8, min_periods=6); r16 = ysr.rolling(16, min_periods=12); NF['N_rng8'] = lg(r8.max() - r8.min()); NF['N_rng16'] = lg(r16.max() - r16.min()); NF['N_base'] = lg(bn)
NFD = pd.DataFrame(NF, index=G); HOUR = pd.get_dummies(pd.Series(G.hour, index=G), prefix='h', dtype=float)
LF = line_features(X)
def divergence(L): return pd.DataFrame({f'D_{sc}': L[f'L_mom{sc}'] - NFD[f'N_mom{sc}'] for sc in SC}, index=G)
GROUPS = {'momentum': [f'L_mom{s}' for s in SC], 'curvature': [f'L_curv{s}' for s in SC], 'position': [f'L_pos{w}' for w in POSW], 'time-since high/low': [f'L_bhi{w}' for w in TSW] + [f'L_blo{w}' for w in TSW],
          'zig-zag / confluence': ['L_state', 'L_age', 'L_leg', 'L_legratio', 'L_turn8'], 'variability': ['L_var'], 'divergence': [f'D_{s}' for s in SC]}
M0COLS = list(NFD.columns) + list(HOUR.columns); ys_pct = ysr
TARG = {}
for H in (8, 16, 32): TARG[f'dir_{H}'] = ((ysr.shift(-H) - ysr) * 100).to_numpy()
fw8 = (ysr.shift(-8) - ysr).abs() * 100; TARG['vol_8'] = lg(fw8).where(fw8 > 0).to_numpy()
VALIDROW = (half_of != '') & (~VIDEO)
BL = pd.to_datetime(['2025-04-01', '2025-07-01', '2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-10'], utc=True)
HP = dict(max_depth=3, max_iter=100, learning_rate=0.05, min_samples_leaf=200, l2_regularization=1.0, early_stopping=False, random_state=0)
def walk(M, ytar, keep_models=False):
    pred = np.full(N, np.nan); models = []
    for b in range(len(BL) - 1):
        a, e = BL[b], BL[b + 1]; test = (G >= a) & (G < e) & VALIDROW & np.isfinite(ytar); train = (G < a - pd.Timedelta(minutes=15 * 96)) & VALIDROW & np.isfinite(ytar)
        if test.sum() < 100 or train.sum() < 2000: continue
        mdl = HistGradientBoostingRegressor(**HP).fit(M[train], ytar[train]); pred[test] = mdl.predict(M[test])
        if keep_models: models.append((mdl, test))
    return pred, models
dcode = pd.factorize(pd.Series(dayv))[0]
def day_ic(pred, y, mask, min_n=12):
    out = {}
    d = pd.DataFrame(dict(p=pred[mask], y=y[mask], dc=dcode[mask]))
    for k, g_ in d.groupby('dc'):
        if len(g_) >= min_n and g_.p.std() > 0 and g_.y.std() > 0: out[k] = stats.spearmanr(g_.p, g_.y).statistic
    return pd.Series(out)
def auc(pred, y, mask):
    m = mask & (y != 0); yy = (y[m] > 0).astype(int)
    return roc_auc_score(yy, pred[m]) if len(np.unique(yy)) == 2 else np.nan
HALF = {'VAL': (G >= BL[0]) & (G < BL[3]), 'OOS': (G >= BL[3]) & (G < BL[-1]), 'VAL+OOS': (G >= BL[0]) & (G < BL[-1])}
def gain(p1, p0, y, mask, B=2000):
    a, b = day_ic(p1, y, mask), day_ic(p0, y, mask); idx = a.index.intersection(b.index); d = (a[idx] - b[idx]).to_numpy()
    if len(d) < 10: return np.nan, np.nan, np.nan, np.nan, np.nan, len(d)
    bm = d[rng.integers(0, len(d), size=(B, len(d)))].mean(1); return d.mean(), np.percentile(bm, 2.5), np.percentile(bm, 97.5), a[idx].mean(), b[idx].mean(), len(d)

# ------------------------------------------------------------------ real run
M0 = np.column_stack([NFD.to_numpy(float), HOUR.to_numpy(float)]); DV = divergence(LF)
M1df = pd.concat([NFD, HOUR, LF, DV], axis=1); M1cols = list(M1df.columns); M1 = M1df.to_numpy(float)
print('features: M0', M0.shape[1], 'M1', M1.shape[1], flush=True)
RES = []; P0, P1, MOD = {}, {}, {}
for tn, y in TARG.items():
    p0, _ = walk(M0, y); p1, mods = walk(M1, y, keep_models=tn in ('dir_16', 'vol_8')); P0[tn], P1[tn] = p0, p1; MOD[tn] = mods
    for hf, mk in HALF.items():
        gm, lo, hi, ic1, ic0, nd = gain(p1, p0, y, mk & np.isfinite(p0) & np.isfinite(p1))
        a1, a0 = auc(p1, y, mk & np.isfinite(p1)), auc(p0, y, mk & np.isfinite(p0)) if tn.startswith('dir') else (np.nan, np.nan)
        RES.append(dict(target=tn, half=hf, days=nd, IC_M0=ic0, IC_M1=ic1, IC_gain=gm, ci_lo=lo, ci_hi=hi, AUC_M0=a0, AUC_M1=a1))
    print('done', tn, flush=True)
RES = pd.DataFrame(RES)
# placebo on the two primary targets
PL = {'dir_16': [], 'vol_8': []}
for r in range(_n):
    sh = int(rng.integers(5, 61)) * 96 * (1 if rng.random() < .5 else -1); Ls = LF.apply(lambda c: np.roll(c.to_numpy(float), sh)); Ls = pd.DataFrame(Ls.to_numpy(), index=G, columns=LF.columns)
    Ds = pd.DataFrame({f'D_{sc}': Ls[f'L_mom{sc}'] - NFD[f'N_mom{sc}'] for sc in SC}, index=G)
    Mp = pd.concat([NFD, HOUR, Ls, Ds], axis=1).to_numpy(float)
    for tn in PL:
        y = TARG[tn]; p, _ = walk(Mp, y); gm = gain(p, P0[tn], y, HALF['VAL+OOS'] & np.isfinite(p) & np.isfinite(P0[tn]), B=50)[0]; PL[tn].append(gm)
    if r % 5 == 0: print('placebo', r, flush=True)
# importance (OOS, grouped row-shuffle within the kept models)
IMP = []
for tn in ('dir_16', 'vol_8'):
    y = TARG[tn]; mask = HALF['OOS'] & np.isfinite(P1[tn]); base_ic = day_ic(P1[tn], y, mask).mean()
    for gname, cols in GROUPS.items():
        idx = [M1cols.index(c) for c in cols]; pp = np.full(N, np.nan)
        for mdl, test in MOD[tn]:
            if not (test & HALF['OOS']).any(): continue
            Mt = M1[test].copy(); perm = rng.permutation(len(Mt)); Mt[:, idx] = Mt[perm][:, idx]; pp[test] = mdl.predict(Mt)
        IMP.append(dict(target=tn, group=gname, IC_with=base_ic, IC_group_shuffled=day_ic(pp, y, mask).mean()))
IMP = pd.DataFrame(IMP); IMP['IC_drop'] = IMP.IC_with - IMP.IC_group_shuffled
# economic
def clboot(r, dd, B=1500):
    u, inv = np.unique(dd, return_inverse=True); sums = np.bincount(inv, r); cnts = np.bincount(inv).astype(float); idx = rng.integers(0, len(u), size=(B, len(u))); bm = sums[idx].sum(1) / cnts[idx].sum(1); return r.mean(), np.percentile(bm, 2.5), np.percentile(bm, 97.5)
ECO = []
for tn, H in (('dir_16', 16), ('dir_8', 8)):
    y = TARG[tn]
    for mname, P in (('M1 (with line)', P1[tn]), ('M0 (Nasdaq only)', P0[tn])):
        m = HALF['OOS'] & np.isfinite(P) & np.isfinite(y); thr = np.nanpercentile(np.abs(P[m]), 95); sel = m & (np.abs(P) >= thr); r = np.sign(P[sel]) * y[sel]; mm, lo, hi = clboot(r, dcode[sel])
        for cost in (0.005, 0.01, 0.02): ECO.append(dict(target=tn, model=mname, n=int(sel.sum()), gross_pct=mm, cost_bp=cost * 100, net_pct=mm - cost, net_lo=lo - cost, net_hi=hi - cost))
ECO = pd.DataFrame(ECO)
# verdict
def row(tn, hf): return RES[(RES.target == tn) & (RES.half == hf)].iloc[0]
verdicts = []
for tn in TARG:
    ok = all(row(tn, hf).ci_lo > 0 for hf in ('VAL', 'OOS')); real = row(tn, 'VAL+OOS').IC_gain; pl = np.array([v for v in PL.get(tn, []) if np.isfinite(v)])
    beats = bool(len(pl) > 20 and real > np.percentile(pl, 95)) if tn in PL else None
    if tn.startswith('vol'): econ = 'volatility context (no trade)'; econ_ok = True
    else:
        r_ = ECO[(ECO.target == tn) & (ECO.model == 'M1 (with line)') & (np.isclose(ECO.cost_bp, 1.0))]; econ_ok = bool(len(r_) and r_.iloc[0].net_lo > 0); econ = 'net lower bound at 1.0 bp: ' + (f'{r_.iloc[0].net_lo:+.4f}%' if len(r_) else 'not computed')
    verdicts.append(dict(target=tn, both_halves_CI_above_zero=ok, beats_placebo95=beats, real_gain_val_oos=real, placebo_mean=pl.mean() if len(pl) else np.nan, placebo_p95=np.percentile(pl, 95) if len(pl) else np.nan, economic_gate=econ, economic_ok=econ_ok))
V = pd.DataFrame(verdicts)
stat = V[(V.both_halves_CI_above_zero) & (V.beats_placebo95 == True)]
found = stat[stat.economic_ok]
verdict = ('a repeatable shape exists (see importance table for which)' if len(found) else ('statistical signal without economic significance: context only, no trade (' + ', '.join(stat.target) + ')' if len(stat) else 'no shape-agnostic evidence'))
fm = lambda d: d.to_markdown(index=False, floatfmt='.4f')
txt = ['# COG-SHAPE-AGNOSTIC results', '', 'Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line\'s multi-scale shape + divergence.', '',
       f'## Verdict (registered rule): **{verdict}**', '', f'Features: M0 {M0.shape[1]}, M1 {M1.shape[1]} (line shape: {len(LF.columns)}, divergence: {len(DV.columns)}). Placebo draws: {len(PL["dir_16"])}.', '',
       '### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)', fm(RES), '',
       '### Gates per target', fm(V), '', '### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)', fm(IMP), '',
       '### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)', fm(ECO), '',
       '### Reading the table', '- IC_gain near zero with a CI straddling it means the line\'s shape adds nothing a Nasdaq-only model does not already have.', '- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.',
       '- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.']
(OUTD / 'SHAPE_AGNOSTIC.md').write_text('\n'.join(txt), encoding='utf-8'); print('VERDICT:', verdict); print(V.to_string()); print(RES.to_string())
