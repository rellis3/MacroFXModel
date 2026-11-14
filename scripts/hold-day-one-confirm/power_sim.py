"""hold-day-one-confirm power (forge/HOLD_DAY_ONE_CONFIRM_PREREG.md §5).
Run: python -I scripts/hold-day-one-confirm/power_sim.py [nsim]
Reads only the SETUP side and unconditional control moments from the shipped sigma export
(analysis/output/vf3_stage_b/part1_lines.parquet, 00:00-22:00 London session as a proxy for the 07:00-21:00 window):
  - setup counts per cell from day-one features (|OC|/sigma, close location, first-touch minute, p90 reach, event tag);
  - control moments: per-instrument SD of OC/sigma over ALL days and the cross-instrument correlation of OC/sigma.
No forward (day+1..+5) move is read. Forward outcomes are synthetic: correlated Gaussian days (and a Student-t df 4
sensitivity), 24 sub-steps a day for the 1-sigma stop. Seed 20261114."""
import sys, os, numpy as np, pandas as pd
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
NSIM = int(sys.argv[1]) if len(sys.argv) > 1 else 200
K = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
rng = np.random.default_rng(20261114)
INST = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURJPY','GBPJPY','GOLD','NQ','SPX500','DOW']
T = pd.read_parquet(os.path.join(ROOT, 'analysis/output/vf3_stage_b/part1_lines.parquet'),
                    columns=['inst','date','oos','event','pit_sig_used','pit_oh_p90','pit_ol_p90','r_oh','r_ol','r_hl','r_ocs','ft_OH_p50','ft_OL_p50'])
T = T[(T.oos == 1) & T.inst.isin(INST) & (T.date <= '2026-08-21')].copy(); T['date'] = pd.to_datetime(T.date)
T['z'] = T.r_ocs / T.pit_sig_used
up = T.r_ocs > 0
T['q'] = np.where(up, (T.r_ocs + T.r_ol) / T.r_hl, (T.r_oh - T.r_ocs) / T.r_hl)        # close location in the close direction
T['ft'] = np.where(up, T.ft_OH_p50, T.ft_OL_p50)                                       # minute from 00:00 London
T['p90'] = np.where(up, T.r_oh >= T.pit_oh_p90, T.r_ol >= T.pit_ol_p90)
T['tier1'] = T.event.isin(['NFP','CPI','FOMC']); T['known'] = T.event != 'unknown'
dates = pd.DatetimeIndex(sorted(T.date.unique())); D = len(dates); I = len(INST)
Z = T.pivot(index='date', columns='inst', values='z').reindex(index=dates, columns=INST)
sd = Z.std().values; C = Z.corr().fillna(0).values
w, V = np.linalg.eigh(C); C = V @ np.diag(np.clip(w, 1e-6, None)) @ V.T; L = np.linalg.cholesky(C)
# 07:00-21:00 carries ~75% of the day's variance (assumption, stated in the prereg): a k-sigma 07-21 close ~ k/sqrt(0.75) here
KP = K / np.sqrt(0.75)
def cells(k=KP):
    big = T[T.z.abs() >= k]
    cl = {'STRONG': big.q >= 0.90, 'MID': big.q < 0.75,
          'FAST': big.ft <= 540, 'SLOW': big.ft > 540, 'P90': big.p90, 'NOP90': ~big.p90,
          'EVT': big.tier1 & big.known, 'NOEVT': ~big.tier1 & big.known, 'ALL': big.q > -1}
    out = {c: big[m] for c, m in cl.items()}
    # mirror: the day travelled >= k sigma one way from the open but gave back >= half of it by the close
    ex_up = T.r_oh / T.pit_sig_used >= k; ex_dn = T.r_ol / T.pit_sig_used >= k
    fu = T[ex_up & (T.r_ocs < 0.5 * T.r_oh) & ~(ex_dn & (T.r_ol > T.r_oh))].assign(z=1.0)
    fd = T[ex_dn & (-T.r_ocs < 0.5 * T.r_ol) & ~(ex_up & (T.r_oh >= T.r_ol))].assign(z=-1.0)
    out['FADED'] = pd.concat([fu, fd])
    return big, out
big, CL = cells()
print(f'proxy k={KP:.2f}: big days {len(big)} of {len(T)} ({len(big)/len(T):.1%}); per-inst SD of OC/sigma (control) {np.round(sd,2)}')
for c, d in CL.items(): print(f'  {c:6s} n={len(d):5d}  dates={d.date.nunique():4d}')
di = {d: i for i, d in enumerate(dates)}; ii = {s: j for j, s in enumerate(INST)}
idx = {c: (np.array([di[x] for x in d.date]), np.array([ii[x] for x in d.inst]), np.sign(d.z.values)) for c, d in CL.items()}
H = [1, 2, 3, 5]; NS = 24
def draw(t=False):
    e = rng.standard_normal((D + 6, I))
    if t: e = e / np.sqrt(rng.chisquare(4, (D + 6, 1)) / 4) / np.sqrt(2)
    return (e @ L.T) * sd
def fwd(R, c, h):
    di_, ij, s = idx[c]; ok = di_ + h < D + 6
    cs = np.cumsum(R, axis=0)
    return s[ok] * (cs[di_[ok] + h, ij[ok]] - cs[di_[ok], ij[ok]]), di_[ok]
def block_se(x, dd, B=200, blk=21):
    nb = int(np.ceil(D / blk)); out = []
    for _ in range(B):
        st = rng.integers(0, D - blk, nb); w_ = np.zeros(D)
        for s0 in st: w_[s0:s0+blk] += 1
        ww = w_[dd]; out.append((ww * x).sum() / ww.sum())
    return np.std(out)
PAIRS = [('STRONG', None), ('FADED', None), ('STRONG','MID'), ('FAST','SLOW'), ('P90','NOP90'), ('EVT','NOEVT')]
res = {(a + (b or ''), h): [] for a, b in PAIRS for h in H}; bse = {(a + (b or ''), h): [] for a, b in PAIRS for h in H}
for k_ in range(NSIM):
    R = draw()
    for a, b in PAIRS:
        for h in H:
            xa, da = fwd(R, a, h)
            if b is None:
                res[(a + (b or ''), h)].append(xa.mean())
                if k_ < 10: bse[(a + (b or ''), h)].append(block_se(xa, da))
                continue
            xb, db = fwd(R, b, h)
            res[(a + (b or ''), h)].append(xa.mean() - xb.mean())
            if k_ < 10: bse[(a + (b or ''), h)].append(np.hypot(block_se(xa, da), block_se(xb, db)))
print('\nContrast cells (sigma units). MC SD under the null; date-block bootstrap SE (10 draws); descriptive per-horizon cells; MDE = 3.86 / 2.80 x SD shown for scale only')
for a, b in PAIRS:
    for h in H:
        s_ = np.std(res[(a + (b or ''), h)]); bs = np.mean(bse[(a + (b or ''), h)])
        print(f'  {a}-{b} h={h}: nA={len(idx[a][0])} nB={len(idx[b][0]) if b else 0} MC SD {s_:.4f} boot {bs:.4f}  MDE {3.86*max(s_,bs):.3f} / {2.80*max(s_,bs):.3f}  bar {0.05*np.sqrt(h):.3f}')
# fat-tail sensitivity on the main contrast
tt = {h: [] for h in H}
for _ in range(max(50, NSIM // 4)):
    R = draw(t=True)
    for h in H: tt[h].append(fwd(R, 'STRONG', h)[0].mean() - fwd(R, 'MID', h)[0].mean())
print('\nPooled scored statistic Pbar = mean over h of cell_h / sqrt(h) (sigma per sqrt-day). MDE = 3.48 / 2.80 x SD (Holm over 6: first / last step)')
for a, b in PAIRS:
    key = a + (b or ''); P = np.mean([np.array(res[(key, h)]) / np.sqrt(h) for h in H], axis=0)
    print(f'  {a}-{b}: MC SD {P.std():.4f}  MDE {3.48*P.std():.3f} / {2.80*P.std():.3f}  bar 0.100')
print('  t(4) STRONG-MID MC SD:', {h: round(float(np.std(v)), 4) for h, v in tt.items()})
# R-based: enter at day-one close, 1-sigma stop, exit at h or stop; one position per instrument; zero drift
def hold_R(c, nsim):
    """Same synthetic paths for every horizon. Stop fill = the first sub-step at/below -1R (gap-through fill, pessimistic)."""
    di_, ij, s = idx[c]; o = np.argsort(di_ * I + ij); di_, ij, s = di_[o], ij[o], s[o]
    M = {h: [] for h in H}; SD = {h: [] for h in H}; N = {h: [] for h in H}
    for _ in range(nsim):
        e = rng.standard_normal(((D + 6) * NS, I)) @ L.T * (sd / np.sqrt(NS)); cs = np.cumsum(e, axis=0)
        for h in H:
            busy = -np.ones(I, int); r = []
            for d0, j, sg in zip(di_, ij, s):
                if d0 <= busy[j] or d0 + h >= D + 6: continue
                p = sg * (cs[(d0 + 1) * NS:(d0 + h + 1) * NS, j] - cs[(d0 + 1) * NS - 1, j])
                hit = np.nonzero(p <= -1.0)[0]
                if len(hit): r.append(p[hit[0]]); busy[j] = d0 + hit[0] // NS + 1
                else: r.append(p[-1]); busy[j] = d0 + h
            r = np.array(r) - 0.03; M[h].append(r.mean()); SD[h].append(r.std()); N[h].append(len(r))
    return M, SD, N
print('\nR-based hold (STRONG entries, 1-sigma stop, 0.03R cost, zero drift): n, SD per trade, mean, MC SD of mean, MDE first/last of 6')
M, SD_, N_ = hold_R('STRONG', max(40, NSIM // 4))
for h in H:
    m_ = np.std(M[h]); print(f'  h={h}: n={np.mean(N_[h]):.0f} SD/trade {np.mean(SD_[h]):.3f} mean {np.mean(M[h]):+.4f} MC SD {m_:.4f} (iid {np.mean(SD_[h])/np.sqrt(np.mean(N_[h])):.4f}) MDE {3.48*m_:.3f} / {2.80*m_:.3f}')
P = np.mean([np.array(M[h]) / np.sqrt(h) for h in H], axis=0)
print(f'  pooled R-bar: mean {P.mean():+.4f} MC SD {P.std():.4f}  MDE {3.48*P.std():.3f} / {2.80*P.std():.3f}  bar 0.100')
