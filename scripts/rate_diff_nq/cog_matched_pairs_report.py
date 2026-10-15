"""COG-MATCHED-PAIRS final report (forge/COG_MATCHED_PAIRS_PREREG.md + ADDENDUM_A section 3 and 6). Reads the outputs of the registered tests; applies the registered
p-value definitions, BH-FDR 10% across the full candidate x test family, the consistency rule, and writes MATCHED_PAIRS_RESULTS.md. No threshold here is set after results.
    python scripts/rate_diff_nq/cog_matched_pairs_report.py"""
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUTD = ROOT / 'analysis' / 'output' / 'cog_video_0918'
CANDS = ['P0', 'P1', 'P2', 'P3', 'P4', 'L-US', 'L-EU-Euribor', 'L-EU-ESTR']; PAIRS = ['P1', 'P2', 'P3', 'P4']; LEGS = ['L-US', 'L-EU-Euribor', 'L-EU-ESTR']
TAG = {k: '_' + k.replace('-', '_') for k in CANDS}; PRIM = 'k1=0.5 continue(0.5) W=16'
def rd(name):
    p = OUTD / name; return pd.read_csv(p) if p.exists() else None
SAM = rd('matched_pairs_audit_samples.csv'); T1 = rd('matched_pairs_t1.csv'); T2 = rd('matched_pairs_t2.csv'); DEC = rd('matched_pairs_decomp.csv')
def elig(k):
    r = SAM[SAM.candidate == k]
    return bool(len(r) and 'IS_days' in r and r.iloc[0].IS_days == r.iloc[0].IS_days and float(r.iloc[0].IS_days) >= 60)
ELIG = {k: elig(k) for k in CANDS}
RES = []                                                     # (candidate, test, p, gate_pass, gate_detail, key_effect_sign, note)
# ---------------------------------------------------------------- T1
for k in PAIRS:
    if not ELIG[k] or T1 is None: continue
    r = T1[T1.candidate == k]
    if not len(r): continue
    r = r.iloc[0]; pv = max(r.get('VAL_p_better_than_P0', np.nan), r.get('OOS_p_better_than_P0', np.nan))
    g_ci = all(r.get(f'{h}_R2_diff_ci_lo', -1) > 0 for h in ('VAL', 'OOS')); g_st = all(r.get(f'{h}_stab_minus_P0', 1) < 0 for h in ('VAL', 'OOS'))
    RES.append(dict(candidate=k, test='T1 same-hour link vs P0', p=pv if pv == pv else 1.0, gate=bool(g_ci and g_st), detail=f'R2 diff CI above 0 in VAL and OOS: {g_ci}; stability better than P0 in both: {g_st}', sign=np.sign(r.get('VAL_R2_minus_P0', 0))))
# ---------------------------------------------------------------- T2 (pairs: only cells whose attribution is a spread effect count for the pair)
for k in PAIRS + LEGS:
    if not ELIG[k] or T2 is None: continue
    g_ = T2[T2.candidate == k]
    if not len(g_): continue
    f = g_[g_.fdr_IS].copy()
    if k in PAIRS and DEC is not None and len(f):
        att = DEC[DEC.candidate == k][['W', 'H', 'attribution']]; f = f.merge(att, on=['W', 'H'], how='left'); keep = f[f.attribution == 'spread effect']; dropped = f[f.attribution != 'spread effect']
    else: keep, dropped = f, f.iloc[0:0]
    conf = keep[keep.confirmed] if len(keep) else keep
    pv = float(np.minimum.reduce([np.maximum(keep.p_VAL_oneside, keep.p_OOS_oneside).min()])) if len(keep) else 1.0
    RES.append(dict(candidate=k, test='T2 lead grid', p=pv, gate=bool(len(conf) > 0), detail=f'cells {len(g_)}; in-sample FDR {len(f)}; counted as spread effect {len(keep)}; confirmed {len(conf)}; attributed to a leg/common level instead: {len(dropped)}', sign=np.sign(conf.beta_IS.iloc[0]) if len(conf) else 0))
# ---------------------------------------------------------------- T3 / T4 / T5
def t3(k):
    et = rd(f'turn_events_table_ownctrl{TAG[k]}.csv'); gt = rd(f'turn_events_gates_ownctrl{TAG[k]}.csv')
    if et is None: return None
    ps, eff = [], {}
    for pat in ('A0', 'A1', 'A2'):
        r = et[(et.pattern == pat) & (et.H_bars == 8) & (et.metric == 'ret%') & et.half.isin(['VAL', 'OOS'])]
        if len(r) == 2: ps.append(r.p_one_sided.max()); eff[pat] = float(r.matched_diff.mean())
    return dict(p=min(ps) if ps else 1.0, gate=bool(gt is not None and gt.robust.any()), eff=eff.get('A0', 0.0), detail=f"gates robust per pattern: {dict(zip(gt.pattern, gt.robust)) if gt is not None else 'n/a'}; A0/A1/A2 matched 2h effects {{{', '.join(f'{a}: {v:+.3f}' for a, v in eff.items())}}}")
def t4(k):
    fr = rd(f'sequence_events_frozen{TAG[k]}.csv'); gt = rd(f'sequence_events_gates{TAG[k]}.csv'); vg = rd(f'sequence_events_volgate{TAG[k]}.csv')
    if fr is None: return None
    r = fr[(fr.spec == PRIM) & (fr.context == 'all') & (fr.metric == 'ret8') & fr.half.isin(['VAL', 'OOS'])]
    p = r.p_one_sided.max() if len(r) == 2 else 1.0; eff = float(r.matched_diff.mean()) if len(r) else 0.0
    return dict(p=p, gate=bool(gt is not None and gt.passes.any()), eff=eff, detail=f"primary sequence matched 2h effect VAL/OOS {', '.join(f'{x:+.3f}' for x in r.matched_diff)}; gates pass: {bool(gt is not None and gt.passes.any())}; volatility gate pass: {bool(vg is not None and vg.passes.iloc[0])}")
def t5(k):
    v = rd(f'shape_agnostic_gates{TAG[k]}.csv'); pl = rd(f'shape_agnostic_placebo{TAG[k]}.csv'); ic = rd(f'shape_agnostic_ic{TAG[k]}.csv')
    if v is None or pl is None: return None
    out = {}
    for tn, nm in (('dir_16', 'dir'), ('vol_8', 'vol')):
        r = v[v.target == tn].iloc[0]; arr = pl[tn].dropna().to_numpy(); real = float(r.real_gain_val_oos); p = (1 + (arr >= real).sum()) / (1 + len(arr)) if real == real else 1.0
        ci = ic[(ic.target == tn) & (ic.half.isin(['VAL', 'OOS']))]
        gate = bool(r.both_halves_CI_above_zero and r.beats_placebo95 == True and (r.economic_ok if nm == 'dir' else True))
        out[nm] = dict(p=p, gate=gate, eff=real, detail=f"IC gain VAL+OOS {real:+.4f} (placebo mean {r.placebo_mean:+.4f}, p95 {r.placebo_p95:+.4f}); VAL/OOS IC gain {', '.join(f'{x:+.3f}' for x in ci.IC_gain)}; CI above 0 both halves {bool(r.both_halves_CI_above_zero)}; beats placebo p95 {r.beats_placebo95}; economic: {r.economic_gate}")
    return out
for k in PAIRS:
    if not ELIG[k]: continue
    for nm, fn in (('T3 turn events', t3), ('T4 interpretable sequence', t4)):
        r = fn(k)
        if r: RES.append(dict(candidate=k, test=nm, p=r['p'], gate=r['gate'], detail=r['detail'], sign=np.sign(r['eff'])))
for k in PAIRS + LEGS:
    if not ELIG[k]: continue
    r = t5(k)
    if r:
        for nm in ('dir', 'vol'): RES.append(dict(candidate=k, test=f'T5 flexible model ({"4 h direction" if nm == "dir" else "2 h volatility"})', p=r[nm]['p'], gate=r[nm]['gate'], detail=r[nm]['detail'], sign=np.sign(r[nm]['eff'])))
R = pd.DataFrame(RES)
# ---------------------------------------------------------------- reference P0 (not in the family)
REF = {}
if ELIG['P0']:
    for nm, fn in (('T3 turn events', t3), ('T4 interpretable sequence', t4)):
        r = fn('P0')
        if r: REF[nm] = dict(p=r['p'], gate=r['gate'], sign=np.sign(r['eff']), detail=r['detail'])
    r = t5('P0')
    if r:
        for nm in ('dir', 'vol'): REF[f'T5 flexible model ({"4 h direction" if nm == "dir" else "2 h volatility"})'] = dict(p=r[nm]['p'], gate=r[nm]['gate'], sign=np.sign(r[nm]['eff']), detail=r[nm]['detail'])
# ---------------------------------------------------------------- BH-FDR 10% across the whole family
if len(R):
    R = R.sort_values('p').reset_index(drop=True); m = len(R); R['bh_threshold'] = 0.10 * (np.arange(1, m + 1)) / m; ok = R.p.values <= R.bh_threshold.values; kk = np.zeros(m, bool)
    if ok.any(): kk[:np.max(np.where(ok)[0]) + 1] = True
    R['passes_correction'] = kk
    # consistency rule: a pair-level finding needs the same test to pass its gate in at least 2 of the 4 pairs AND the same sign as P0 (T1 compares to P0, so only the 2-pair part applies)
    n_pass = R[R.candidate.isin(PAIRS) & R.gate].groupby('test').candidate.nunique()
    def consistent(r):
        if r.candidate in LEGS: return bool(R[R.candidate.isin(LEGS) & R.gate & (R.test == r.test)].candidate.nunique() >= 2)
        if n_pass.get(r.test, 0) < 2: return False
        if r.test.startswith('T1'): return True
        ref = REF.get(r.test); return bool(ref is not None and ref['sign'] == r.sign and r.sign != 0)
    R['consistent'] = [consistent(r) for _, r in R.iterrows()]
    R['status'] = np.where(R.gate & R.passes_correction & R.consistent, 'RESULT', np.where(R.gate | R.passes_correction | (R.p < 0.10), 'exploratory (promising, fails: ' + 'XX', 'no evidence'))
    fails = []
    for _, r in R.iterrows():
        f = []
        if not r.gate: f.append('registered gate(s) of the cited study')
        if not r.passes_correction: f.append('BH correction across the full family')
        if not r.consistent: f.append('consistency rule (>=2 pairs and P0 same sign)')
        fails.append('; '.join(f))
    R['failed'] = fails; R['status'] = [('RESULT' if (g and pc and c) else ('exploratory' if (g or pc or p < 0.10) else 'no evidence')) for g, pc, c, p in zip(R.gate, R.passes_correction, R.consistent, R.p)]
fm = lambda d, cols=None: (d[cols] if cols else d).to_markdown(index=False, floatfmt='.4f') if d is not None and len(d) else '_none_'
n_results = int((R.status == 'RESULT').sum()) if len(R) else 0
verdict = ('At least one candidate passes the registered gates, the family-wise correction and the consistency rule (see RESULT rows).' if n_results else 'No pair or leg passes the registered gates, the family-wise correction and the consistency rule.')
txt = ['# COG-MATCHED-PAIRS results', '', 'Registered in forge/COG_MATCHED_PAIRS_PREREG.md and forge/COG_MATCHED_PAIRS_ADDENDUM_A.md (audit: MATCHED_PAIRS_AUDIT.md, published before the tests ran). Same data-quality rules, horizons, controls, splits and gates for every candidate; nothing was changed after results.', '',
       f'## Verdict: **{verdict}**', '', f'Eligible candidates (at least 60 in-sample days; registered rule): ' + ', '.join(f'{k} {"yes" if ELIG[k] else "NO (descriptive only)"}' for k in CANDS), '',
       '## Usable samples', fm(SAM), '', '## Same-hour link and stability against C.OG\'s pair (T1)', fm(T1), '',
       '## Lead grid (T2) summary per candidate', fm(T2.groupby('candidate').agg(cells=('t_IS', 'size'), fdr_in_sample=('fdr_IS', 'sum'), confirmed=('confirmed', 'sum'), max_abs_t_in_sample=('t_IS', lambda v: v.abs().max())).reset_index()) if T2 is not None else '_none_', '',
       '### Leg decomposition of every FDR-passing or top-3 in-sample lead cell (spread / US leg / euro leg / common level)', fm(DEC), '',
       '## Family-wise correction (BH-FDR 10% over all candidate x test p-values; P0 is the reference and is not in the family)', '',
       fm(R, ['candidate', 'test', 'p', 'bh_threshold', 'passes_correction', 'gate', 'consistent', 'status']) if len(R) else '_none_', '', f'Family size: {len(R)}.', '',
       '## What each test found (with the gate detail, incremental out-of-sample performance versus the Nasdaq-only baseline, and the placebo beside the real number)', '']
for _, r in R.sort_values(['candidate', 'test']).iterrows(): txt.append(f'- **{r.candidate} / {r.test}** [{r.status}] p = {r.p:.4f}: {r.detail}')
txt += ['', '## Reference: C.OG\'s pair (P0) through the same pipeline', *[f'- **{k}** p = {v["p"]:.4f}, gate {v["gate"]}: {v["detail"]}' for k, v in REF.items()], '',
        '## Exploratory table (promising on one criterion but failing a registered gate or the correction; recorded, not promoted)', '', fm(R[R.status == 'exploratory'], ['candidate', 'test', 'p', 'failed']) if len(R) else '_none_', '',
        '## Limits', '- Contract-month robustness for each pair taken alone is untestable before the December 2026 roll.', '- No untouched sample exists for any pair; the forward record from 2026-10-15 is the untouched test.', '- Candidates with fewer than 60 in-sample days are descriptive only and are not in the correction.']
(OUTD / 'MATCHED_PAIRS_RESULTS.md').write_text('\n'.join(txt), encoding='utf-8'); R.to_csv(OUTD / 'matched_pairs_family.csv', index=False); print('\n'.join(txt[:40]))
