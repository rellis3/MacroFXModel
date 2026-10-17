"""COG-DYNAMIC-LEAD descriptive dynamic questions D1-D5 (forge/COG_DYNAMIC_LEAD_PREREG.md), daily spreads.
    python scripts/dynlead/describe_dynamics.py [--placebo 20]  -> analysis/output/dynlead/DESCRIBE_DYNAMICS.md
D1 lead-lag structure and its repeatability, D2 regime persistence (can the state be recognised before it pays?), D3 regime shape, D4 response delay while active, D5 failure rate."""
import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E

ap = argparse.ArgumentParser()
ap.add_argument('--placebo', type=int, default=20)
A = ap.parse_args()
ad, yd, S = E.load()
idx = ad.index
LP = np.log(ad)
r1 = LP.diff()
MASK = {p: E.period_mask(idx, p) for p in E.PERIODS}
rng = np.random.default_rng(77)
LAGS = list(range(0, 21))


# ---------------------------------------------------------------- D1
def lead_lag(Sd):
    """corr(daily spread move at t, asset return of day t+L) per spread, asset, lag, period."""
    out = {}
    for j, s in Sd.items():
        x = E.make_x(s, 1)
        for L in LAGS:
            rl = r1.shift(-L)
            for p, m in MASK.items():
                xm, rm = x[m], rl[m]
                out[(j, L, p)] = rm.corrwith(xm)
    return out


def d1_summary(ll, label):
    rows = []
    n = {p: int(MASK[p].sum()) for p in MASK}
    for p in MASK:
        thr = 1.96 / np.sqrt(n[p])
        vals = []
        for (j, L, pp), ser in ll.items():
            if pp == p and L >= 1:
                vals.append(ser.values)
        v = np.concatenate(vals)
        v = v[np.isfinite(v)]
        pv = 2 * stats.norm.sf(np.abs(v) * np.sqrt(n[p]))
        keep = E.bh(pv, 0.05)
        rows.append(dict(sample=label, period=p, forward_cells=len(v), share_nominal_p05=float((pv < 0.05).mean()), bh5_significant=int(keep.sum()), median_abs_corr=float(np.median(np.abs(v)))))
    return rows


real_ll = lead_lag(S)
D1 = d1_summary(real_ll, 'real')
contemp = {p: np.nanmedian(np.abs(np.concatenate([ser.values for (j, L, pp), ser in real_ll.items() if pp == p and L == 0]))) for p in MASK}
for i in range(A.placebo):
    D1 += d1_summary(lead_lag(E.shifted_spreads(S, rng)), f'placebo{i}')
D1 = pd.DataFrame(D1)
d1_real = D1[D1['sample'] == 'real'].set_index('period')
d1_pl = D1[D1['sample'] != 'real'].groupby('period').agg(placebo_mean_bh5=('bh5_significant', 'mean'), placebo_p95_bh5=('bh5_significant', lambda v: np.percentile(v, 95)), placebo_mean_share=('share_nominal_p05', 'mean'))
D1t = d1_real.join(d1_pl)
D1t['same_day_median_abs_corr'] = pd.Series(contemp)
# repeatability of the peak lag / sign
peak = {}
for p in MASK:
    arr = np.stack([np.stack([real_ll[(j, L, p)].reindex(ad.columns).values for L in range(1, 21)], axis=1) for j in S])      # spread x asset x lag
    peak[p] = arr
dsc = peak['DISC']
best_lag = np.nanargmax(np.abs(np.nan_to_num(dsc)), axis=2)
best_val = np.take_along_axis(dsc, best_lag[:, :, None], 2)[:, :, 0]
n_d = int(MASK['DISC'].sum())
sig = np.abs(best_val) * np.sqrt(n_d) > 3.0                         # roughly the best of 20 lags at p~0.05 after the 20-lag maximum
rep = []
for p in ('VAL', 'OOS'):
    other = peak[p]
    same_lag = np.nanargmax(np.abs(np.nan_to_num(other)), axis=2) == best_lag
    same_sign = np.sign(np.take_along_axis(other, best_lag[:, :, None], 2)[:, :, 0]) == np.sign(best_val)
    rep.append(dict(period=p, discovery_pairs_with_strong_peak=int(sig.sum()), share_same_peak_lag=float(same_lag[sig].mean()) if sig.any() else np.nan, chance_same_lag=0.05,
                    share_same_sign_at_that_lag=float(same_sign[sig].mean()) if sig.any() else np.nan, chance_same_sign=0.5, correlation_of_pair_corrs_across_periods=float(np.corrcoef(np.nan_to_num(dsc).ravel(), np.nan_to_num(other).ravel())[0, 1])))
REP = pd.DataFrame(rep)
peak_lags = pd.Series(best_lag[sig] + 1).value_counts().sort_index() if sig.any() else pd.Series(dtype=int)


# ---------------------------------------------------------------- D2 persistence, D3 shape, D4/D5 response and failure (W = 250, gate as registered)
def ic_roll(Sd, j, k, h, W=250):
    x = E.make_x(Sd[j], k)
    yh = LP.shift(-h) - LP
    return x, yh, yh.rolling(W, min_periods=int(0.8 * W)).corr(x).shift(h)


def persistence(Sd, ks=(5, 20), hs=(1, 5, 20), Wf=125):
    rows = []
    for k in ks:
        for h in hs:
            past, fut = [], []
            for j in Sd:
                x = E.make_x(Sd[j], k)
                yh = LP.shift(-h) - LP
                ic = yh.rolling(250, min_periods=200).corr(x).shift(h)
                icf = yh.rolling(Wf, min_periods=int(0.8 * Wf)).corr(x).shift(-Wf)         # pairs s in (t, t+Wf]: their outcomes complete after t
                dates = np.arange(300, len(idx) - Wf - h, Wf)
                a, b = ic.values[dates].ravel(), icf.values[dates].ravel()
                m = np.isfinite(a) & np.isfinite(b)
                past.append(a[m])
                fut.append(b[m])
            a, b = np.concatenate(past), np.concatenate(fut)
            rows.append(dict(k=k, h=h, pooled_corr_past_vs_future_state=float(np.corrcoef(a, b)[0, 1]), n=len(a)))
    return pd.DataFrame(rows)


real_pers = persistence(S)
pl_p = []
for i in range(min(A.placebo, 10)):
    pp = persistence(E.shifted_spreads(S, rng))
    pp['draw'] = i
    pl_p.append(pp)
pl_p = pd.concat(pl_p)
pers = real_pers.merge(pl_p.groupby(['k', 'h']).pooled_corr_past_vs_future_state.agg(placebo_mean='mean', placebo_p95=lambda v: np.percentile(v, 95), placebo_sd='std').reset_index(), on=['k', 'h'])

# D3 / D4 / D5 at k = 5, W = 250 for h in the registered set
shape_rows, resp_rows, fail_rows, year_rows = [], [], [], []
k = 5
for h in E.H_LIST:
    plus = minus = off = 0
    spells, reversals, nplus = [], 0, 0
    resp = {hh: [] for hh in E.H_LIST}
    resp_off = {hh: [] for hh in E.H_LIST}
    resp_year = {}
    for j in S:
        x, yh, ic = ic_roll(S, j, k, h)
        thr = 2.0 / np.sqrt(250 / h)
        st = np.where(ic.abs() >= thr, np.sign(ic), 0.0)
        st = np.where(ic.notna(), st, np.nan)
        for ai, a in enumerate(ad.columns):
            s_ = st[:, ai]
            m = np.isfinite(s_)
            plus += int((s_[m] > 0).sum())
            minus += int((s_[m] < 0).sum())
            off += int((s_[m] == 0).sum())
            run = 1
            vals = s_[m]
            for q in range(1, len(vals)):
                if vals[q] == vals[q - 1]:
                    run += 1
                else:
                    if vals[q - 1] != 0:
                        spells.append(run)
                        if vals[q - 1] > 0:
                            nplus += 1
                            if (vals[q:q + 250] < 0).any():
                                reversals += 1
                    run = 1
        # response while active / off, entries with |x| >= 1 (the spread has moved)
        ext = (x.abs() >= 1).values[:, None] & ic.notna().values
        sgn = np.sign(ic.values) * np.sign(x.values)[:, None]
        act = (ic.abs().values >= thr)
        for hh in E.H_LIST:
            yy = (LP.shift(-hh) - LP).values
            r = sgn * yy
            sel_a = ext & act & np.isfinite(r)
            sel_o = ext & (~act) & np.isfinite(r)
            resp[hh].append(r[sel_a])
            resp_off[hh].append(r[sel_o])
            if hh == h:
                yrs = np.broadcast_to(idx.year.values[:, None], r.shape)
                for yv in np.unique(idx.year.values):
                    mm = sel_a & (yrs == yv)
                    resp_year.setdefault(yv, []).append(r[mm])
    tot = plus + minus + off
    shape_rows.append(dict(h=h, share_active_positive=plus / tot, share_active_negative=minus / tot, share_off=off / tot, mean_active_spell_days=float(np.mean(spells)) if spells else np.nan,
                           active_positive_spells=nplus, share_followed_by_negative_within_250d=reversals / max(1, nplus)))
    for hh in E.H_LIST:
        a = np.concatenate(resp[hh])
        o = np.concatenate(resp_off[hh])
        resp_rows.append(dict(gate_horizon_h=h, response_horizon=hh, active_n=len(a), active_mean_signed_return_bp=float(np.mean(a) * 1e4), active_share_wrong_sign=float((a < 0).mean()), off_mean_signed_return_bp=float(np.mean(o) * 1e4), off_share_wrong_sign=float((o < 0).mean())))
    for yv, parts in sorted(resp_year.items()):
        a = np.concatenate(parts)
        if len(a) > 50:
            year_rows.append(dict(gate_horizon_h=h, year=int(yv), active_n=len(a), mean_signed_return_bp=float(np.mean(a) * 1e4), share_wrong_sign=float((a < 0).mean())))
SHAPE, RESP, YEAR = pd.DataFrame(shape_rows), pd.DataFrame(resp_rows), pd.DataFrame(year_rows)
# delay: half-time of the cumulative signed response when active (for the gate horizon equal to the response horizon structure, report profile)
prof = RESP[RESP.gate_horizon_h == 5].set_index('response_horizon')
fm = lambda d, nd=3: d.to_markdown(floatfmt=f'.{nd}f') if d.index.name else d.to_markdown(index=False, floatfmt=f'.{nd}f')
txt = ['# COG-DYNAMIC-LEAD descriptive dynamics (daily spreads, 28 series x 34 assets)', '', 'Registered in forge/COG_DYNAMIC_LEAD_PREREG.md. Window: 2016 to 2026-08-20 (warm-up 2016; Discovery 2017-2020, Validation 2021-2023, out-of-sample 2024-2026-08).', '',
       '## D1 Lead-lag structure: how many forward (lag 1-20 days) spread-asset correlations are significant, against the shifted-spread placebo', '',
       fm(D1t.reset_index()[['period', 'forward_cells', 'share_nominal_p05', 'placebo_mean_share', 'bh5_significant', 'placebo_mean_bh5', 'placebo_p95_bh5', 'median_abs_corr', 'same_day_median_abs_corr']], 4), '',
       f'`same_day_median_abs_corr` is the median |correlation| at lag 0 (the same-day link); `median_abs_corr` is the median over forward lags 1-20. Placebo draws: {A.placebo}.', '',
       '### Is the peak lag repeatable? (pairs whose Discovery peak is strong; chance for the same lag is 5%, for the same sign 50%)', '', fm(REP, 3), '',
       f'Peak-lag distribution of the strong Discovery pairs (lag in days: count): {dict(peak_lags)}', '',
       '## D2 Regime persistence: does the relationship state known at t (trailing 250 completed pairs) predict the relationship over the next 125 days? Pooled over 28 spreads x 34 assets, non-overlapping dates; placebo = shifted spreads', '', fm(pers, 4), '',
       '## D3 Regime shape (k = 5, W = 250, gate = 2 standard errors)', '', fm(SHAPE, 3), '',
       '## D4 Response while active versus off (entries where the spread has moved by at least one standard deviation; signed return = sign(relationship) x sign(spread move) x asset return; k = 5)', '', fm(RESP[RESP.gate_horizon_h == 5][['response_horizon', 'active_n', 'active_mean_signed_return_bp', 'active_share_wrong_sign', 'off_mean_signed_return_bp', 'off_share_wrong_sign']], 3), '',
       '### Same, by calendar year, gate horizon 5 days (is the delay or the sign consistent?)', '', fm(YEAR[YEAR.gate_horizon_h == 5][['year', 'active_n', 'mean_signed_return_bp', 'share_wrong_sign']], 3), '',
       '## D5 Failure rate', '', 'In D4, `active_share_wrong_sign` is the share of gated entries whose subsequent return went against the relationship\'s sign (50% = no information). D3 `share_followed_by_negative_within_250d` is the share of active-positive spells followed by an active-negative state within 250 days (relationship reversal).', '']
(E.PAN / 'DESCRIBE_DYNAMICS.md').write_text('\n'.join(txt), encoding='utf-8')
for n_, d_ in (('d1', D1t.reset_index()), ('d1_repeat', REP), ('d2', pers), ('d3', SHAPE), ('d4', RESP), ('d4_year', YEAR)):
    d_.to_csv(E.PAN / f'describe_{n_}.csv', index=False)
print('\n'.join(txt[:60]))
