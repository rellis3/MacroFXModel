"""COG-TURN-EVENTS Addendum A (forge/COG_TURN_EVENTS_ADDENDUM_A.md): is the extra Nasdaq movement after a line turn volatility information?
    python scripts/rate_diff_nq/cog_turn_events_vol.py [--placebo 200]   -> analysis/output/cog_video_0918/TURN_EVENTS_ADDENDUM_A.md
Reuses the data/event definitions of cog_turn_events.py (everything above its '# ---- run' marker)."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve(); MAIN = HERE.parent / 'cog_turn_events.py'
src = MAIN.read_text(encoding='utf-8'); pre = src[:src.index('# ---------------------------------------------------------------- run')]
g = {'__file__': str(MAIN), '__name__': 'turn_core'}; exec(compile(pre, str(MAIN), 'exec'), g); globals().update(g)

Vq = pd.qcut(pd.Series(rng8).rank(method='first'), 5, labels=False).to_numpy()          # trailing 2 h range quintile
def vpool(blocked):
    ok = np.isfinite(Y) & np.isfinite(ZN) & np.isfinite(Qb) & np.isfinite(Vq) & ~blocked & (half_of != '') & ~VIDEO
    pool = {}
    for i in np.where(ok)[0]: pool.setdefault((int(ZN[i]), int(G[i].hour), int(Qb[i]), int(Vq[i])), []).append(i)
    return {k: np.array(v) for k, v in pool.items()}
def vctrl(c, pool, K=20):
    if not (np.isfinite(ZN[c]) and np.isfinite(Qb[c]) and np.isfinite(Vq[c])): return np.array([], int)
    cand = np.concatenate([pool.get((int(ZN[c]), (int(G[c].hour) + dh) % 24, int(Qb[c]), int(Vq[c])), np.array([], int)) for dh in (-1, 0, 1)]); cand = cand[np.abs(cand - c) > 8]
    return rng.choice(cand, size=min(K, len(cand)), replace=False) if len(cand) else cand
import zoneinfo
NY = zoneinfo.ZoneInfo('America/New_York')
FOMC = {'2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16'}
def near_release(c):
    t = G[c].tz_convert(NY)
    if t.weekday() >= 5: return False
    for hh, mm, only_fomc in ((8, 30, False), (10, 0, False), (14, 0, True)):
        if only_fomc and t.strftime('%Y-%m-%d') not in FOMC: continue
        dt = (t - t.replace(hour=hh, minute=mm, second=0)).total_seconds() / 60
        if 0 <= dt <= 30: return True
    return False
def vtable(evs, pool, mask_fn=lambda c: True):
    rows = []
    for (c, e, d) in evs:
        if VIDEO[c] or half_of[c] == '' or not mask_fn(c): continue
        o = outcome(c, d, PH)
        if o is None: continue
        co = [outcome(j, d, PH) for j in vctrl(c, pool)]; co = [x for x in co if x is not None]
        if len(co) < 5: continue
        mv, bmv = float(o['fav'] or o['adv']), np.mean([x['fav'] or x['adv'] for x in co])
        fa, bfa = float(o['fav']), np.mean([x['fav'] for x in co]); ad, bad = float(o['adv']), np.mean([x['adv'] for x in co])
        rows.append(dict(i=c, day=str(G[c].date()), half=half_of[c], move=mv, b_move=bmv, fav=fa, b_fav=bfa, adv=ad, b_adv=bad, dirshare=(fa / (fa + ad)) if (fa + ad) else np.nan, b_dirshare=(bfa / (bfa + bad)) if (bfa + bad) else np.nan))
    return pd.DataFrame(rows)
EV = []
for (c, e, d) in line_events(X, 0.75)[1]:
    if np.isfinite(Y[c]): EV.append((c, e, d))
blocked = np.zeros(N, bool) if ARGS.own_only else block_mask([c for c, e, d in EV]); VP = vpool(blocked)
T0 = vtable(EV, VP); T1 = vtable(EV, VP, mask_fn=lambda c: not near_release(c))
def summ(T, label):
    out = []
    for hf in ('IS', 'VAL', 'OOS', 'ALL'):
        s = T if hf == 'ALL' else T[T.half == hf]
        m, lo, hi, p1, n, nd = boot(s, 'move', 'b_move', B=1500)
        r = s[s.dirshare.notna() & s.b_dirshare.notna()]; m2, lo2, hi2, p2, n2, nd2 = boot(r, 'dirshare', 'b_dirshare', B=1500)
        out.append(dict(controls=label, half=hf, n=n, days=nd, move_event=float(s.move.mean()), move_diff=m, ci_lo=lo, ci_hi=hi, p_one_sided=p1, dir_diff=m2, dir_ci_lo=lo2, dir_ci_hi=hi2, dir_p=p2))
    return out
S = pd.DataFrame(summ(T0, 'vol-matched') + summ(T1, 'vol-matched, no release bars'))
# placebo of the move-share difference
pl = []
for r in range(ARGS.placebo):
    sh = int(rng.integers(5, 61)) * 96 * (1 if rng.random() < .5 else -1); xs = np.roll(X, sh); ev2 = [(c, e, d) for (c, e, d) in line_events(xs, 0.75)[1] if np.isfinite(Y[c])][:500]
    t2 = vtable(ev2, VP); pl.append((t2.move - t2.b_move).mean() if len(t2) > 20 else np.nan)
    if r % 20 == 0: print('placebo', r, flush=True)
pl = np.array([v for v in pl if np.isfinite(v)])
# incremental volatility regression
ysr = pd.Series(Y, index=G); fwd = (ysr.shift(-8) - ysr).abs()
lg = lambda a: np.log(np.maximum(a, 1e-6))
r8 = pd.Series(rng8, index=G); r16 = ysr.diff(16).abs()
post = np.zeros(N)
for c, e, d in EV: post[c:min(N, c + 8)] = 1
H24 = pd.get_dummies(pd.Series(G.hour, index=G), prefix='h', dtype=float).iloc[:, 1:]
D = pd.concat([pd.DataFrame(dict(y=lg(fwd), r8=lg(r8), r16=lg(r16), base=lg(pd.Series(BN, index=G)), s=post, day=dayv, half=half_of, vid=VIDEO), index=G), H24], axis=1)
D = D[(D.half != '') & (~D.vid)].drop(columns='vid').replace([np.inf, -np.inf], np.nan).dropna()
cols = ['r8', 'r16', 'base'] + list(H24.columns)
def cfit(df, cs):
    Xm = np.column_stack([np.ones(len(df))] + [df[c].values for c in cs]); y = df['y'].values; XtXi = np.linalg.pinv(Xm.T @ Xm); b = XtXi @ Xm.T @ y; e = y - Xm @ b; Sm = np.zeros((Xm.shape[1],) * 2)
    for _, idx in pd.Series(np.arange(len(y))).groupby(df['day'].values):
        sc = Xm[idx.values].T @ e[idx.values]; Sm += np.outer(sc, sc)
    V = XtXi @ Sm @ XtXi; return b, np.sqrt(np.diag(V))
INC = []
for hf in ('IS', 'VAL', 'OOS'):
    sub = D[D.half == hf]; b, se = cfit(sub, cols + ['s']); INC.append(dict(half=hf, coef_s=b[-1], t=b[-1] / se[-1], n=len(sub), days=sub.day.nunique()))
tr, te = D[D.half != 'OOS'], D[D.half == 'OOS']
def r2(cs):
    b, _ = cfit(tr, cs); pred = np.column_stack([np.ones(len(te))] + [te[c].values for c in cs]) @ b; return 1 - ((te['y'] - pred) ** 2).sum() / ((te['y'] - tr['y'].mean()) ** 2).sum()
INC.append(dict(half='OOS R2 without s / with s', coef_s=r2(cols), t=r2(cols + ['s']), n=len(te), days=te.day.nunique())); INC = pd.DataFrame(INC)
# verdict
def cl(c_, hf, col): r = S[(S.controls == c_) & (S.half == hf)].iloc[0]; return r[col]
c1 = all(cl('vol-matched', hf, 'move_diff') > 0 and cl('vol-matched', hf, 'p_one_sided') < 0.05 for hf in ('VAL', 'OOS'))
c2 = all(cl('vol-matched, no release bars', hf, 'move_diff') > 0 and cl('vol-matched, no release bars', hf, 'p_one_sided') < 0.05 for hf in ('VAL', 'OOS'))
c3 = bool(len(pl) > 20 and cl('vol-matched', 'ALL', 'move_diff') > np.percentile(pl, 95))
c4 = bool(all(INC[INC.half == hf].iloc[0].coef_s > 0 and INC[INC.half == hf].iloc[0].t > 2 for hf in ('VAL', 'OOS')) and INC.iloc[-1].t > INC.iloc[-1].coef_s)
dirp = all(cl('vol-matched', hf, 'dir_diff') > 0 and cl('vol-matched', hf, 'dir_p') < 0.05 for hf in ('VAL', 'OOS'))
verdict = 'volatility information is real' if (c1 and c2 and c3 and c4) else 'explained by Nasdaq own recent volatility / news clustering (or not shown)'
md = lambda df: df.to_markdown(index=False, floatfmt='.3f')
txt = ['# COG-TURN-EVENTS Addendum A results', '', f'Registered in forge/COG_TURN_EVENTS_ADDENDUM_A.md after the debug table was seen (main run unread at the time). Line turns k = 0.75, 2 h horizon.', '',
       f'## Verdict: **{verdict}**', f'Gates: (1) vol-matched move-share above zero in VAL and OOS: {c1}; (2) survives release exclusion: {c2}; (3) beats placebo 95th ({np.percentile(pl, 95):+.3f}; placebo mean {pl.mean():+.3f}, n {len(pl)}): {c3}; (4) incremental volatility dummy positive |t|>2 VAL and OOS and OOS R2 rises: {c4}. Direction share beyond matched in VAL and OOS: {dirp}.', '',
       '### Move share (favourable + adverse) and direction share (favourable / (favourable + adverse)): event minus volatility-matched controls', md(S), '',
       '### Incremental volatility test (log |Nasdaq move| over next 2 h on its own trailing range, trailing move, 20-day RMS, hour dummies, plus the line-turn dummy)', md(INC), '',
       'OOS R2 row: coef_s column = without the dummy, t column = with the dummy.']
(OUTD / f'TURN_EVENTS_ADDENDUM_A{SUF}.md').write_text('\n'.join(txt), encoding='utf-8'); print('\n'.join(txt))
