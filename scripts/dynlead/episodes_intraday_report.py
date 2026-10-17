"""COG-DYNAMIC-LEAD Addendum D report: intraday SOFR / Euribor / ESTR episodes. Writes analysis/output/dynlead/EPISODES_INTRADAY_RESULTS.md"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E
import intraday as I
import episodes_intraday as P

PAN = E.PAN
KEYC = ['trade', 'z0', 'k', 'm', 'c', 'h']
fm = lambda d, nd=3: d.to_markdown(index=False, floatfmt=f'.{nd}f') if len(d) else '_none_'
cells = pd.read_parquet(PAN / 'episodesB_cells.parquet')
pl = pd.read_csv(PAN / 'episodesB_placebo.csv')
plspec = pd.read_parquet(PAN / 'episodesB_placebo_specs.parquet')
ev = pd.read_parquet(PAN / 'episodesB_primary_events.parquet')
rng = np.random.default_rng(321)

head = pd.DataFrame([dict(sample='real', step1=int(cells.s1.sum()), step2=int(cells.s2.sum()), oos_pass=int(cells.oos_pass.sum())),
                     dict(sample='placebo mean', step1=pl.step1.mean(), step2=pl.step2.mean(), oos_pass=pl.oos_pass.mean()),
                     dict(sample='placebo 95th percentile', step1=pl.step1.quantile(.95), step2=pl.step2.quantile(.95), oos_pass=pl.oos_pass.quantile(.95)),
                     dict(sample='placebo max', step1=pl.step1.max(), step2=pl.step2.max(), oos_pass=pl.oos_pass.max())])
pm = plspec.groupby(KEYC)[['mean_DISC', 'mean_VAL', 'mean_OOS']].agg(['mean', 'std']).reset_index()
pm.columns = KEYC + ['pl_DISC', 'pl_DISC_sd', 'pl_VAL', 'pl_VAL_sd', 'pl_OOS', 'pl_OOS_sd']
M = cells.merge(pm, on=KEYC, how='left')
for p in ('DISC', 'VAL', 'OOS'):
    M[f'excess_{p}'] = M[f'mean_{p}'] - M[f'pl_{p}']
    M[f'z_{p}'] = M[f'excess_{p}'] / M[f'pl_{p}_sd']
cnt = pd.DataFrame([dict(period=p, specs=len(M), real_above_placebo_by_2sd=int((M[f'z_{p}'] > 2).sum()), expected_by_chance=round(0.0228 * len(M), 1), real_below_placebo_by_2sd=int((M[f'z_{p}'] < -2).sum()),
                         median_real_bp=float(M[f'mean_{p}'].median()), median_placebo_bp=float(M[f'pl_{p}'].median())) for p in ('DISC', 'VAL', 'OOS')])
main = M[M.trade.isin(['any', 'coupled'])]
share = pd.DataFrame([dict(period=p, share_real_mean_positive=float((main[f'mean_{p}'] > 0).mean()), share_placebo_mean_positive=float((main[f'pl_{p}'] > 0).mean())) for p in ('DISC', 'VAL', 'OOS')])

# primary spec by line and by quarter
ev['q'] = ev.date.dt.year.astype(str) + 'Q' + ev.date.dt.quarter.astype(str)
ev['dcode'] = ev.date.dt.strftime('%Y%m%d').astype(int)
by_line = []
for ln, g in ev.groupby('line'):
    u, inv = np.unique(g.dcode.values, return_inverse=True)
    sums = np.bincount(inv, g.net.values)
    cn = np.bincount(inv).astype(float)
    mean = g.net.mean()
    se = np.sqrt(((sums - mean * cn) ** 2).sum()) / len(g)
    by_line.append(dict(line=ln, episodes=len(g), mean_net_bp=mean * 1e4, t=mean / se if se > 0 else np.nan, share_negative=float((g.net < 0).mean())))
BL = pd.DataFrame(by_line).sort_values('t', ascending=False)
BQ = ev.groupby('q').net.agg(episodes='size', mean_net_bp=lambda v: v.mean() * 1e4, share_negative=lambda v: (v < 0).mean()).reset_index()

# a-priori pairs (pre-fixed spec), day-clustered, Holm over 24
rows = []
for ln, a in P.PAIRS:
    g = ev[(ev.line == ln) & (ev.asset == a)]
    row = dict(line=ln, asset=a, episodes=len(g))
    if len(g) >= 8:
        u, inv = np.unique(g.dcode.values, return_inverse=True)
        sums = np.bincount(inv, g.net.values)
        cn = np.bincount(inv).astype(float)
        mean = g.net.mean()
        se = np.sqrt(((sums - mean * cn) ** 2).sum()) / len(g)
        t = mean / se if se > 0 else np.nan
        row.update(mean_net_bp=mean * 1e4, t=t, p_one_sided=float(stats.norm.sf(t)) if np.isfinite(t) else np.nan, share_negative=float((g.net < 0).mean()))
    rows.append(row)
PR = pd.DataFrame(rows)
p = PR.get('p_one_sided', pd.Series(dtype=float)).fillna(1.0).values
order = np.argsort(p)
holm = np.empty(len(p))
run = 0.0
for rank, i in enumerate(order):
    run = max(run, min(1.0, p[i] * (len(p) - rank)))
    holm[i] = run
PR['holm_p'] = holm

# response delay by bars after the move (z0 1.5, k 16), all / coupled / confirmed, vs shifted lines (8 draws)
LAGS = (1, 2, 4, 8, 16, 32, 96, 192)


def curves(ctx):
    acc = {g: [] for g in ('all', 'coupled', 'confirmed')}
    N, LP = ctx.N, ctx.LP
    for name, s in ctx.lines.items():
        d1 = s.diff()
        sg = d1.rolling(P.W20, min_periods=P.W20 // 2).std().shift(1)
        xv = ((s - s.shift(16)) / (sg * 4.0)).values
        evx = P.find_events(xv, 1.5)
        evx = evx[evx + max(LAGS) < N]
        if not len(evx):
            continue
        d = np.sign(ctx.beta20[name][evx, :]) * np.sign(xv[evx])[:, None]
        path = np.stack([d * (LP[evx + L, :] - LP[evx, :]) for L in LAGS], axis=2)
        cr = d * (LP[evx + 4, :] - LP[evx, :]) / (ctx.sig[evx, :] * 2.0)
        ok = np.isfinite(d) & np.isfinite(path).all(axis=2)
        for g_, m in (('all', ok), ('coupled', ok & ctx.coupled[name][evx, :]), ('confirmed', ok & (cr >= 0.5))):
            r, c = np.where(m)
            acc[g_].append(path[r, c, :])
    return {k: np.concatenate(v) for k, v in acc.items()}


A, L = P.load()
real = curves(P.ICtx(A, L))
pl_c = []
for i in range(8):
    pl_c.append({k: v.mean(0) for k, v in curves(P.ICtx(A, I.shifted_lines(L, rng))).items()})
rows = []
for g_ in ('all', 'coupled', 'confirmed'):
    pmn = np.mean([c[g_] for c in pl_c], axis=0)
    for j, Lg in enumerate(LAGS):
        rows.append(dict(group=g_, bars_after_move=Lg, hours=Lg / 4, events=len(real[g_]), mean_signed_response_bp=real[g_][:, j].mean() * 1e4, placebo_bp=pmn[j] * 1e4, excess_bp=(real[g_][:, j].mean() - pmn[j]) * 1e4))
CV = pd.DataFrame(rows)

top = M.sort_values('p_DISC').head(6)[KEYC + ['mean_DISC', 'p_DISC', 'pl_DISC', 'mean_VAL', 'p_VAL', 'mean_OOS', 'p_OOS']]
txt = ['# COG-DYNAMIC-LEAD Addendum D: the episode framing on the intraday SOFR, Euribor (I2! stand-ins) and ESTR futures', '',
       'Registered in forge/COG_DYNAMIC_LEAD_ADDENDUM_D.md. 17 lines (7 legs, 5 calendar spreads, 5 cross-curve spreads) x 34 assets, 15-minute bars, 2024-04 to 2026-08-20; 896 specs; day-clustered; costs by class.', '',
       '## Headline: registered selection procedure, real versus the shifted-line placebo (200 draws)', fm(head, 1), '',
       '## Excess over the confirmation-rule baseline (specs whose real mean differs from the placebo mean by more than 2 placebo SDs)', fm(cnt, 2), '',
       '## How often is the mean positive (confirmation specs)', fm(share, 3), '',
       '## Primary episode definition (coupled, z0 1.5, k 16 bars, m 4, c 0.5, h 96) by line', fm(BL, 2), '', '### By quarter (all lines pooled)', fm(BQ, 2), '',
       '## A-priori pairs (24, pre-fixed spec, Holm)', fm(PR, 3), '',
       '## Response delay: signed asset response by bars after the line move (z0 1.5, k 16) versus shifted lines', fm(CV, 2), '',
       '## Best Discovery specs and what happened next (descriptive)', fm(top, 3), '']
(PAN / 'EPISODES_INTRADAY_RESULTS.md').write_text('\n'.join(txt), encoding='utf-8')
for n_, d_ in (('episodesB_head', head), ('episodesB_bylines', BL), ('episodesB_quarters', BQ), ('episodesB_pairs', PR), ('episodesB_curve', CV)):
    d_.to_csv(PAN / f'{n_}.csv', index=False)
print('\n'.join(txt[:30]))
