"""COG-CROSS-ASSET report (forge/COG_CROSS_ASSET_PREREG.md): stage-1 tables, then the family of 105 p-values, BH-FDR 10%, consistency across assets.
No threshold is set after results.
    python scripts/rate_diff_nq/cog_cross_asset_report.py [--stage1]"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUTD = ROOT / 'analysis' / 'output' / 'cog_video_0918'
ASSETS = ['xauusd', 'eurusd', 'usdjpy', 'us2000', 'us30', 'spx500', 'de30']
LINES = ['P0', 'P3', 'L-US']
PRIM = 'k1=0.5 continue(0.5) W=16'
LN = {'xauusd': 'gold', 'eurusd': 'EURUSD', 'usdjpy': 'USDJPY', 'us2000': 'Russell 2000', 'us30': 'Dow', 'spx500': 'S&P 500', 'de30': 'DAX'}
STAGE1 = '--stage1' in sys.argv


def rd(n):
    p = OUTD / n
    return pd.read_csv(p) if p.exists() else None


def fm(d, nd=3):
    return d.to_markdown(index=False, floatfmt=f'.{nd}f') if d is not None and len(d) else '_none_'


T1rows, T2rows, DECrows = [], [], []
for a in ASSETS:
    t1, t2, dec = rd(f'matched_pairs_t1_A_{a}.csv'), rd(f'matched_pairs_t2_A_{a}.csv'), rd(f'matched_pairs_decomp_A_{a}.csv')
    if t1 is None:
        continue
    for ln in LINES:
        r = t1[t1.candidate == ln]
        if len(r):
            r = r.iloc[0]
            T1rows.append(dict(asset=LN[a], line=ln, corr_IS=r.get('IS_corr'), corr_VAL=r.get('VAL_corr'), corr_OOS=r.get('OOS_corr'), R2_OOS=r.get('OOS_R2'),
                               share_20d_windows_negative_OOS=r.get('OOS_stab_neg20d'), days_OOS=r.get('OOS_days')))
        g = t2[t2.candidate == ln]
        if len(g):
            top = g.reindex(g.t_IS.abs().sort_values(ascending=False).index).iloc[0]
            T2rows.append(dict(asset=LN[a], line=ln, cells=len(g), fdr_in_sample=int(g.fdr_IS.sum()), confirmed=int(g.confirmed.sum()), max_abs_t_IS=abs(top.t_IS),
                               at=f'{top.W}->{top.H}', t_VAL_there=top.t_VAL, t_OOS_there=top.t_OOS))
        if dec is not None:
            d = dec[dec.candidate == ln]
            if len(d):
                DECrows.append(dict(asset=LN[a], line=ln, attributions=', '.join(sorted(set(d.attribution)))))
T1d, T2d, DECd = pd.DataFrame(T1rows), pd.DataFrame(T2rows), pd.DataFrame(DECrows)

if STAGE1:
    txt = ['# COG-CROSS-ASSET stage 1 (T1 same-hour link and T2 lead grid), published before stage 2', '',
           "Correlation of the line's 1-hour change with the asset's 1-hour return (EURUSD up = euro up; USDJPY up = dollar up). T2 confirmed = in-sample FDR and same sign one-sided p<0.05 in validation and out-of-sample. Window to 2026-08-20; out-of-sample 2026-01-01 to 2026-08-20.", '',
           '## T1', fm(T1d), '', '## T2 lead grid (24 cells per asset x line)', fm(T2d), '', '## Leg decomposition of the top in-sample lead cells', fm(DECd)]
    (OUTD / 'CROSS_ASSET_STAGE1.md').write_text('\n'.join(txt), encoding='utf-8')
    print('\n'.join(txt))
    sys.exit()

RES = []
for a in ASSETS:
    t2, dec = rd(f'matched_pairs_t2_A_{a}.csv'), rd(f'matched_pairs_decomp_A_{a}.csv')
    for ln in LINES:
        tag = f'_A_{a}_{ln.replace("-", "_")}'
        name = f'{LN[a]} / {ln}'
        if t2 is not None:
            g = t2[t2.candidate == ln]
            f = g[g.fdr_IS].copy()
            if ln != 'L-US' and dec is not None and len(f):
                f = f.merge(dec[dec.candidate == ln][['W', 'H', 'attribution']], on=['W', 'H'], how='left')
                f = f[f.attribution == 'spread effect']
            conf = f[f.confirmed] if len(f) else f
            pv = float(np.maximum(f.p_VAL_oneside, f.p_OOS_oneside).min()) if len(f) else 1.0
            RES.append(dict(asset=a, line=ln, name=name, test='T2 lead grid', p=pv, gate=bool(len(conf) > 0), sign=float(np.sign(conf.beta_IS.iloc[0])) if len(conf) else 0.0,
                            detail=f'FDR cells counted {len(f)}, confirmed {len(conf)}'))
        et, gt = rd(f'turn_events_table_ownctrl{tag}.csv'), rd(f'turn_events_gates_ownctrl{tag}.csv')
        if et is not None:
            ps, eff = [], {}
            for pat in ('A0', 'A1', 'A2'):
                r = et[(et.pattern == pat) & (et.H_bars == 8) & (et.metric == 'ret%') & et.half.isin(['VAL', 'OOS'])]
                if len(r) == 2:
                    ps.append(r.p_one_sided.max())
                    eff[pat] = float(r.matched_diff.mean())
            RES.append(dict(asset=a, line=ln, name=name, test='T3 turn events', p=min(ps) if ps else 1.0, gate=bool(gt is not None and gt.robust.any()), sign=float(np.sign(eff.get('A0', 0))),
                            detail='A0/A1/A2 matched 2h: ' + ', '.join(f'{k} {v:+.3f}' for k, v in eff.items())))
        fr, gq = rd(f'sequence_events_frozen{tag}.csv'), rd(f'sequence_events_gates{tag}.csv')
        if fr is not None:
            r = fr[(fr.spec == PRIM) & (fr.context == 'all') & (fr.metric == 'ret8') & fr.half.isin(['VAL', 'OOS'])]
            RES.append(dict(asset=a, line=ln, name=name, test='T4 interpretable sequence', p=float(r.p_one_sided.max()) if len(r) == 2 else 1.0, gate=bool(gq is not None and gq.passes.any()),
                            sign=float(np.sign(r.matched_diff.mean())) if len(r) else 0.0, detail='primary 2h matched ' + ', '.join(f'{x:+.3f}' for x in r.matched_diff)))
        v, ic = rd(f'shape_agnostic_gates{tag}.csv'), rd(f'shape_agnostic_ic{tag}.csv')
        if v is not None and ic is not None:
            for tn, nm in (('dir_16', 'T5 flexible model (4 h direction)'), ('vol_8', 'T5 flexible model (2 h volatility)')):
                r = v[v.target == tn].iloc[0]
                c = ic[(ic.target == tn) & ic.half.isin(['VAL', 'OOS'])]
                p = float(c.p_boot.max()) if 'p_boot' in c and len(c) == 2 else 1.0
                gate = bool(r.both_halves_CI_above_zero and r.beats_placebo95 == True and (r.economic_ok if tn == 'dir_16' else True))
                RES.append(dict(asset=a, line=ln, name=name, test=nm, p=p, gate=gate, sign=float(np.sign(r.real_gain_val_oos)),
                                detail=f'IC gain VAL+OOS {r.real_gain_val_oos:+.4f} (placebo mean {r.placebo_mean:+.4f}, p95 {r.placebo_p95:+.4f}); VAL/OOS {", ".join(f"{x:+.3f}" for x in c.IC_gain)}; CI>0 both halves {bool(r.both_halves_CI_above_zero)}; beats placebo p95 {r.beats_placebo95}; {r.economic_gate}'))
R = pd.DataFrame(RES).sort_values('p').reset_index(drop=True)
m = len(R)
R['bh_threshold'] = 0.10 * np.arange(1, m + 1) / m
ok = R.p.values <= R.bh_threshold.values
kk = np.zeros(m, bool)
if ok.any():
    kk[:np.max(np.where(ok)[0]) + 1] = True
R['passes_correction'] = kk


def consistent(r):
    o = R[(R.test == r.test) & R.gate & (R.asset != r.asset) & (R.sign == r.sign)]
    return bool(r.gate and r.sign != 0 and o.asset.nunique() >= 1)


R['consistent'] = [consistent(r) for _, r in R.iterrows()]
R['status'] = [('RESULT' if (g and pc and c) else ('exploratory' if (g or pc or p < 0.05) else 'no evidence')) for g, pc, c, p in zip(R.gate, R.passes_correction, R.consistent, R.p)]
R['failed'] = ['; '.join([x for x, bad in (('registered gate(s)', not r.gate), (f'BH correction (family of {m})', not r.passes_correction),
                                           ('consistency (same test passes on a second asset, same sign)', not r.consistent)) if bad]) for _, r in R.iterrows()]
nres = int((R.status == 'RESULT').sum())
verdict = 'at least one candidate passes the registered gates, the correction and the consistency rule' if nres else 'no asset-line combination passes the registered gates, the family-wise correction and the consistency rule'
txt = ['# COG-CROSS-ASSET results', '',
       'Registered in forge/COG_CROSS_ASSET_PREREG.md. Same data rules, horizons, controls and gates as COG-MATCHED-PAIRS; window to 2026-08-20 (the reserved forward block was not read); nothing changed after results.', '',
       f'## Verdict: **{verdict}**', f'Family size {m} (BH-FDR 10%). RESULT rows: {nres}. Exploratory rows: {int((R.status == "exploratory").sum())}.', '',
       '## Stage 1: same-hour link (T1)', fm(T1d), '', '## Stage 1: lead grid (T2)', fm(T2d), '', '### Leg decomposition', fm(DECd), '',
       '## Family-wise correction (40 smallest p-values; full table in cross_asset_family.csv)', fm(R[['name', 'test', 'p', 'bh_threshold', 'passes_correction', 'gate', 'consistent', 'status']].head(40)), '',
       '## Exploratory table (promising on one criterion, failing a registered gate; recorded, not promoted)', fm(R[R.status == 'exploratory'][['name', 'test', 'p', 'failed']]), '',
       '## Detail of rows with p < 0.05', *[f'- **{r["name"]} / {r.test}** [{r.status}] p = {r.p:.4f}: {r.detail}' for _, r in R[R.p < 0.05].iterrows()]]
(OUTD / 'CROSS_ASSET_RESULTS.md').write_text('\n'.join(txt), encoding='utf-8')
R.to_csv(OUTD / 'cross_asset_family.csv', index=False)
print('\n'.join(txt[:30]))
