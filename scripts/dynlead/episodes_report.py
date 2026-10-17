"""COG-DYNAMIC-LEAD Addendum C report: episode results, the momentum-baseline comparison (shifted spreads), the a-priori pairs, the response delay and the failure rate.
    python scripts/dynlead/episodes_report.py  -> analysis/output/dynlead/EPISODES_RESULTS.md"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E
import episodes as P

rng = np.random.default_rng(123)
PAN = E.PAN
ad, yd, S = E.load()
ctx = P.Ctx(ad, S)
cells = pd.read_parquet(PAN / 'episodes_cells.parquet')
pl = pd.read_csv(PAN / 'episodes_placebo.csv')
plspec = pd.read_parquet(PAN / 'episodes_placebo_specs.parquet')
KEYC = ['trade', 'z0', 'k', 'm', 'c', 'h']
fm = lambda d, nd=3: d.to_markdown(index=False, floatfmt=f'.{nd}f') if len(d) else '_none_'

# ---- 1 headline counts against the placebo
real_counts = dict(step1=int(cells.s1.sum()), step2=int(cells.s2.sum()), oos_pass=int(cells.oos_pass.sum()))
head = pd.DataFrame([dict(sample='real', **real_counts), dict(sample='placebo mean', step1=pl.step1.mean(), step2=pl.step2.mean(), oos_pass=pl.oos_pass.mean()),
                     dict(sample='placebo 95th percentile', step1=pl.step1.quantile(.95), step2=pl.step2.quantile(.95), oos_pass=pl.oos_pass.quantile(.95)), dict(sample='placebo max', step1=pl.step1.max(), step2=pl.step2.max(), oos_pass=pl.oos_pass.max())])

# ---- 2 spec-level excess over the momentum baseline (placebo mean of the same spec), per period
pm = plspec.groupby(KEYC)[['mean_DISC', 'mean_VAL', 'mean_OOS']].agg(['mean', 'std']).reset_index()
pm.columns = KEYC + ['pl_DISC', 'pl_DISC_sd', 'pl_VAL', 'pl_VAL_sd', 'pl_OOS', 'pl_OOS_sd']
M = cells.merge(pm, on=KEYC, how='left')
for p in ('DISC', 'VAL', 'OOS'):
    M[f'excess_{p}'] = M[f'mean_{p}'] - M[f'pl_{p}']
    M[f'z_{p}'] = M[f'excess_{p}'] / M[f'pl_{p}_sd']
pri = M[(M.trade == 'any') & (M.z0 == 1.5) & (M.k == 5) & (M.m == 2) & (M.c == 0.5) & (M.h == 5)]
pri_c = M[(M.trade == 'coupled') & (M.z0 == 1.5) & (M.k == 5) & (M.m == 2) & (M.c == 0.5) & (M.h == 5)]
prim = pd.concat([pri, pri_c])[['trade', 'mean_DISC', 'pl_DISC', 'z_DISC', 'mean_VAL', 'pl_VAL', 'z_VAL', 'mean_OOS', 'pl_OOS', 'z_OOS', 'n_OOS', 'neg_OOS']]
# how many specs have a real mean above the placebo mean by 2 placebo SDs, per period
cnt_z = pd.DataFrame([dict(period=p, specs=len(M), excess_above_2sd=int((M[f'z_{p}'] > 2).sum()), expected_by_chance=round(0.0228 * len(M), 1), median_excess_bp=float(M[f'excess_{p}'].median())) for p in ('DISC', 'VAL', 'OOS')])
# same restricted to the main (confirmation) specs, excluding divergence specs
main = M[M.trade.isin(['any', 'coupled'])]
cnt_main = pd.DataFrame([dict(period=p, specs=len(main), share_real_mean_positive=float((main[f'mean_{p}'] > 0).mean()), share_placebo_mean_positive=float((main[f'pl_{p}'] > 0).mean()), median_real_bp=float(main[f'mean_{p}'].median()), median_placebo_bp=float(main[f'pl_{p}'].median())) for p in ('DISC', 'VAL', 'OOS')])

# ---- 3 confirmed versus not confirmed (same events), primary episode definition, by year
KEY = ('any', 1.5, 5, 2, 0.5, 5)
KEYC_ = ('coupled', 1.5, 5, 2, 0.5, 5)
_, recs = P.episode_pass(ctx, collect=True, specs_only={KEY, KEYC_})
R = pd.DataFrame(recs, columns=['key', 'spread', 'asset', 'date', 'net'])
R['year'] = R.date.dt.year
R['month'] = R.date.dt.year * 100 + R.date.dt.month
by_year = []
for key, nm in ((KEY, 'any'), (KEYC_, 'coupled')):
    g = R[R.key == key]
    for y, gg in g.groupby('year'):
        by_year.append(dict(state=nm, year=int(y), episodes=len(gg), mean_net_bp=gg.net.mean() * 1e4, share_negative=float((gg.net < 0).mean())))
BY = pd.DataFrame(by_year)

# ---- 4 a-priori pairs at the pre-fixed spec (coupled), month-clustered, Holm over 15
rows = []
g = R[R.key == KEYC_]
for sp, a in P.PAIRS:
    gg = g[(g.spread == sp) & (g.asset == a)]
    row = dict(spread=sp, asset=a, episodes=len(gg))
    if len(gg) >= 8:
        mean, t, n = P.cluster_stats(gg.net.values, gg.date.dt.year.values * 100 + gg.date.dt.month.values)
        row.update(mean_net_bp=mean * 1e4, t=t, p_one_sided=float(stats.norm.sf(t)) if np.isfinite(t) else np.nan, share_negative=float((gg.net < 0).mean()))
        for lo, hi, nm in (('2017-01-01', '2020-12-31', 'DISC'), ('2021-01-01', '2023-12-31', 'VAL'), ('2024-01-01', '2026-08-20', 'OOS')):
            s_ = gg[(gg.date >= lo) & (gg.date <= hi)]
            row[f'mean_{nm}_bp'] = s_.net.mean() * 1e4 if len(s_) else np.nan
            row[f'n_{nm}'] = len(s_)
    rows.append(row)
PR = pd.DataFrame(rows)
if 'p_one_sided' in PR:
    p = PR.p_one_sided.fillna(1.0).values
    order = np.argsort(p)
    holm = np.empty(len(p))
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, p[i] * (len(p) - rank)))
        holm[i] = run
    PR['holm_p'] = holm

# ---- 5 response delay: signed response of the asset by day after the spread move (z0 = 1.5, k = 5), all / coupled / confirmed, versus shifted spreads
def response_curves(ctx_, S_):
    acc = {c: [] for c in ('all', 'coupled', 'confirmed')}
    T, LP = ctx_.T, ctx_.LP
    for j, s in S_.items():
        x = E.make_x(s, 5)
        ev = P.find_events(x, 1.5)
        ev = ev[ev + 20 < T]
        if not len(ev):
            continue
        d = np.sign(ctx_.beta250[j][ev, :]) * np.sign(x.values[ev])[:, None]
        path = np.stack([d * (LP[ev + L, :] - LP[ev, :]) for L in range(1, 21)], axis=2)           # events x assets x 20
        cr = d * (LP[ev + 2, :] - LP[ev, :]) / (ctx_.sig[ev, :] * np.sqrt(2))
        ok = np.isfinite(d) & np.isfinite(path).all(axis=2)
        yrs = ctx_.idx.year.values[ev]
        for name, msk in (('all', ok), ('coupled', ok & ctx_.coupled[j][ev, :]), ('confirmed', ok & (cr >= 0.5))):
            r, c = np.where(msk)
            acc[name].append((path[r, c, :], yrs[r]))
    return {k: (np.concatenate([a for a, _ in v]), np.concatenate([b for _, b in v])) for k, v in acc.items()}


real_rc = response_curves(ctx, S)
pl_curves = []
for i in range(20):
    Sh = E.shifted_spreads(S, rng)
    cx = P.Ctx(ad, Sh)
    pl_curves.append({k: v[0].mean(0) for k, v in response_curves(cx, Sh).items()})
curve_rows = []
for name in ('all', 'coupled', 'confirmed'):
    arr = real_rc[name][0]
    pm_ = np.mean([c[name] for c in pl_curves], axis=0)
    for L in (1, 2, 3, 5, 10, 15, 20):
        curve_rows.append(dict(group=name, day_after_move=L, events=len(arr), mean_signed_response_bp=arr[:, L - 1].mean() * 1e4, placebo_mean_bp=pm_[L - 1] * 1e4, excess_bp=(arr[:, L - 1].mean() - pm_[L - 1]) * 1e4))
CURVE = pd.DataFrame(curve_rows)
# half-time by year for the confirmed group (days after the move at which half of the day-20 excess response is reached), only where day-20 excess is positive
half = []
arr, yrs = real_rc['confirmed']
pm_c = np.mean([c['confirmed'] for c in pl_curves], axis=0)
for y in sorted(set(yrs)):
    m_ = arr[yrs == y]
    if len(m_) < 100:
        continue
    prof = m_.mean(0) - pm_c
    half.append(dict(year=int(y), events=len(m_), excess_day5_bp=prof[4] * 1e4, excess_day20_bp=prof[19] * 1e4, half_time_day=(int(np.argmax(prof >= 0.5 * prof[19]) + 1) if prof[19] > 0 else np.nan)))
HALF = pd.DataFrame(half)

top_exp = M.sort_values('p_DISC').head(6)[KEYC + ['mean_DISC', 'p_DISC', 'pl_DISC', 'mean_VAL', 'p_VAL', 'mean_OOS', 'p_OOS']]
txt = ['# COG-DYNAMIC-LEAD Addendum C: spread-move episodes with an asset-follow confirmation', '',
       'Registered in forge/COG_DYNAMIC_LEAD_ADDENDUM_C.md after the rolling-gate families returned negative. Episode = a spread move of at least z0 standard deviations; expected direction from the rolling contemporaneous slope; confirmation = the asset follows by at least c of its typical move within m days; enter at the confirmation close, hold h days; net of class costs. 608 specs pooled over 28 spreads x 34 assets; clusters = calendar weeks.', '',
       '## Headline: the registered selection procedure, real versus the shifted-spread placebo (200 draws)', fm(head, 1), '',
       'Step 1 = Discovery survivors after BH 10% (mean > 0); Step 2 = also pass Validation; oos_pass = frozen specs positive and p < 0.05 out of sample.', '',
       '## Is there an excess over what the confirmation rule alone gives (the momentum baseline)? Number of specs whose real mean exceeds the placebo mean by more than 2 placebo standard deviations', fm(cnt_z, 3), '',
       '## Main (confirmation) specs: how often is the mean positive, real versus placebo, by period', fm(cnt_main, 3), '',
       '## Primary episode definition (z0 1.5, k 5, m 2, c 0.5, h 5) in bp per trade, with the placebo mean and the distance in placebo SDs', fm(prim, 2), '',
       '## The same episodes by calendar year (does the relationship come and go?)', fm(BY, 2), '',
       '## A-priori pairs at the pre-fixed spec (coupled state, month-clustered, Holm over 15)', fm(PR, 3), '',
       '## Response delay: average signed asset response by day after the spread move (z0 1.5, k 5), against the shifted-spread placebo', fm(CURVE, 2), '',
       '### Half-time of the confirmed-episode excess response by year (only where the day-20 excess is positive)', fm(HALF, 2), '',
       '## Best Discovery specs and what happened next (descriptive)', fm(top_exp, 3), '',
       '## Reading', 'Real counts below or equal to the placebo mean and 95th percentile mean there is no evidence beyond what the confirmation rule produces with a random spread (momentum, drift and chance). Year-by-year sign changes are the "periods when it works, weakens or reverses"; whether such periods can be recognised in time is what the coupling state and the confirmation are for, and the out-of-sample rows say whether they were.']
(PAN / 'EPISODES_RESULTS.md').write_text('\n'.join(txt), encoding='utf-8')
for n_, d_ in (('episodes_head', head), ('episodes_primary', prim), ('episodes_by_year', BY), ('episodes_pairs', PR), ('episodes_curve', CURVE), ('episodes_halftime', HALF)):
    d_.to_csv(PAN / f'{n_}.csv', index=False)
print('\n'.join(txt[:40]))
