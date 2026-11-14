"""gex-range-iv-calm: write RESULTS.md, results.json wrapper, the Evidence Book entries (two ids: the two cells carry different verdict words) and the register row."""
import json, re, sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
O = REPO / 'analysis' / 'output' / 'gex-range-iv-calm'
R = json.loads((O / 'results.json').read_text(encoding='utf-8'))
if 'detail' in R: R = R['detail']
P = json.loads((O / 'power.json').read_text(encoding='utf-8'))
E, N = R['cells']['ES'], R['cells']['NQ']


def f(x): return '%+.3f' % x


def cell(c):
    a, ci = c['coef'], c['ci']
    return dict(b=a['B1_calm'], lo=ci['B1_calm']['lo95'], hi=ci['B1_calm']['hi95'], se=ci['B1_calm']['se'], t=c['t_calm'], hp=c['p_calm_holm'],
                bs=a['B1_stress'], slo=ci['B1_stress']['lo95'], shi=ci['B1_stress']['hi95'], b0c=a['B0_calm'], b0s=a['B0_stress'],
                d=c['calm_minus_stress_B1'], d0=c['calm_minus_stress_B0'], it=c['interaction_short_x_calm'], itc=c['ci_interaction'], pl=c['placebo_calm']['real_above_share'],
                ab=c['absorbed_calm'], sens=c['sensitivities'], mde=P['cells'][[k for k in ('ES', 'NQ') if R['cells'][k] is c][0]]['mde_calm'])


e, n = cell(E), cell(N)
md = f"""# gex-range-iv-calm — results

Prereg: `forge/GEX_RANGE_IV_CALM_PREREG.md` (committed in `1e468058`, 2026-11-14; A1 PRE-RESULTS in `8c6af604`). Run 2026-11-14, seed 20261114, B = 4000 (the parent's block bootstrap).
Branch `main`. Ledger ids: `gex-range-iv-calm-es` and `gex-range-iv-calm-nq` (the two scored cells carry different verdict words under the registered rule). Scripts `scripts/gex-range-iv-calm/` (`run.py`, `finish.py`).

## Verdict: ES-calm NULL (marginal), NQ-calm UNDERPOWERED

Calm = the Cboe IV (VIX for ES, VXN for NQ) at or below its trailing 252-session median on the label date of S(D+1): 475 / 461 of 770 sessions, of which only 59 (ES) / 87 (NQ) are short-gamma. In the calm sessions, with the IV ratio in the baseline, the short-gamma coefficient is **ES {f(e['b'])} [{f(e['lo'])}, {f(e['hi'])}]** (t {e['t']:.2f}) and **NQ {f(n['b'])} [{f(n['lo'])}, {f(n['hi'])}]** (t {n['t']:.2f}); the Holm-adjusted p are {e['hp']:.2f} and {n['hp']:.2f}. The registered gate (b ≥ +0.05, interval lower end > 0, Holm p < 0.05, above 95% of shift placebos) fails in both. By the verdict rule ES is `NULL` (the interval's upper end, {e['hi']:.4f}, sits just under the +0.10 operational bar: a marginal null) and NQ is `UNDERPOWERED` (the interval spans both 0 and the +0.10 bar; MDE {n['mde']:.2f}). Calm sessions do not rescue the CME gamma sign once implied vol is controlled, but the arm is thin and a small calm-only remainder is not ruled out for NQ.

## Scored cells

| Cell | n calm (short) | b_IV,calm | 95% CI | SE | t | Holm p | MDE (design) | Placebo share below real | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| ES-calm | {E['n_calm']} ({E['n_short_calm']}) | {f(e['b'])} | [{f(e['lo'])}, {f(e['hi'])}] | {e['se']:.3f} | {e['t']:.2f} | {e['hp']:.2f} | {e['mde']:.2f} | {e['pl']:.2f} | NULL (marginal) |
| NQ-calm | {N['n_calm']} ({N['n_short_calm']}) | {f(n['b'])} | [{f(n['lo'])}, {f(n['hi'])}] | {n['se']:.3f} | {n['t']:.2f} | {n['hp']:.2f} | {n['mde']:.2f} | {n['pl']:.2f} | UNDERPOWERED |

Whole-sample B0 reproduces the banked coefficients (ES +0.147, NQ +0.165; check passed for both) and B1 reproduces the parent (ES +0.054, NQ +0.044).

## Controls (THE MIRROR and the contrast the paper claims)

| | ES | NQ |
|---|---|---|
| b_IV in **stress** sessions (B1) | {f(e['bs'])} [{f(e['slo'])}, {f(e['shi'])}] | {f(n['bs'])} [{f(n['slo'])}, {f(n['shi'])}] |
| B0 (no IV): calm / stress | {f(e['b0c'])} / {f(e['b0s'])} | {f(n['b0c'])} / {f(n['b0s'])} |
| calm − stress, B1 (paired bootstrap) | {f(e['d']['est'])} [{f(e['d']['lo95'])}, {f(e['d']['hi95'])}] | {f(n['d']['est'])} [{f(n['d']['lo95'])}, {f(n['d']['hi95'])}] |
| calm − stress, B0 | {f(e['d0']['est'])} [{f(e['d0']['lo95'])}, {f(e['d0']['hi95'])}] | {f(n['d0']['est'])} [{f(n['d0']['lo95'])}, {f(n['d0']['hi95'])}] |
| pooled interaction short × calm (B1 + calm) | {f(e['it'])} [{f(e['itc']['lo95'])}, {f(e['itc']['hi95'])}] | {f(n['it'])} [{f(n['itc']['lo95'])}, {f(n['itc']['hi95'])}] |
| IV-absorbed share in calm (Δb = B0 − B1) | {e['ab']['d_b']:+.3f} [{e['ab']['lo95']:+.3f}, {e['ab']['hi95']:+.3f}] | {n['ab']['d_b']:+.3f} [{n['ab']['lo95']:+.3f}, {n['ab']['hi95']:+.3f}] |

Reading: in calm sessions IV absorbs more than half of the range widening on both instruments (the paired interval of the absorbed amount excludes 0 for both). The calm-versus-stress contrast is not established: every difference interval spans zero. For NQ, calm (B0 +0.201) is larger than stress (+0.072), the paper's direction; for ES it is not (+0.076 vs +0.104). The pooled interaction coefficient is positive on both (+0.145 and +0.141) with lower ends just under zero, but it disagrees in sign with the split ES estimate (calm − stress −0.065), so the answer depends on whether the controls are allowed to differ by regime.

## Deviations from the prereg

A1 (PRE-RESULTS): sample sizes and design SEs; nothing else changed. **A2 (POST-HOC, results seen, bookkeeping only):** the prereg planned one ledger id; the two cells came out with different registered verdict words, so they are banked as `gex-range-iv-calm-es` (null) and `gex-range-iv-calm-nq` (underpowered) with the same prereg as `doc`. The calm-from-D variant listed in §3 was not run (the parent frame carries no separate OI-date IV column); the fixed-cut, tercile and half-sample variants were.

## Descriptive (never scored; sensitivities to the calm definition)

- Fixed cut (VIX < 20 / VXN < 25), B1 calm / stress: ES {f(E['sensitivities']['fixed']['B1_calm'])} / {f(E['sensitivities']['fixed']['B1_stress'])}; NQ {f(N['sensitivities']['fixed']['B1_calm'])} / {f(N['sensitivities']['fixed']['B1_stress'])}.
- Lowest-tercile calm, B1: ES {f(E['sensitivities']['tercile']['B1_calm'])}; NQ {f(N['sensitivities']['tercile']['B1_calm'])}.
- Halves (B1 calm): ES {f(E['sensitivities']['first_half']['B1_calm'])} then {f(E['sensitivities']['second_half']['B1_calm'])}; NQ {f(N['sensitivities']['first_half']['B1_calm'])} then {f(N['sensitivities']['second_half']['B1_calm'])}. NQ's calm estimate is positive in both halves; ES's is not.
- **The ES null depends on the calm definition:** the fixed cut gives ES +0.080 where the registered median cut gives {f(e['b'])}. Report the registered cell; do not quote either as a calm-regime effect.
- Seen-data family: the sixth analysis of this window. Any pass would have needed |t| ≥ 3 and unseen data.

## What this changes

Nothing live. The terminal's dealer-gamma board and Replay may say "implied vol already prices most of the gamma widening, in calm sessions too" and may not say "gamma is informative in calm regimes". The CME-book calm-regime question is closed for ES (marginal null) and stays open as underpowered for NQ; the next test would need the Cboe full book or more sessions (about 4-6 times the calm short-gamma sessions to reach a 0.05 effect).
"""
(O / 'RESULTS.md').write_text(md, encoding='utf-8')
wrap = {'id': 'gex-range-iv-calm', 'ids': ['gex-range-iv-calm-es', 'gex-range-iv-calm-nq'], 'verdict': {'ES': 'null', 'NQ': 'underpowered'}, 'ranAt': '2026-11-14T23:00:00Z', 'seed': 20261114, 'B': 4000,
        'prereg': 'forge/GEX_RANGE_IV_CALM_PREREG.md', 'preregCommit': '1e468058', 'branch': 'main',
        'cells': [{'name': 'ES-calm b_IV', 'n': E['n_calm'], 'est': e['b'], 'lo': e['lo'], 'hi': e['hi'], 'mde': e['mde'], 'p': e['hp'], 'verdict': 'null'},
                  {'name': 'NQ-calm b_IV', 'n': N['n_calm'], 'est': n['b'], 'lo': n['lo'], 'hi': n['hi'], 'mde': n['mde'], 'p': n['hp'], 'verdict': 'underpowered'}], 'detail': R, 'power': P}
(O / 'results.json').write_text(json.dumps(wrap, indent=1, default=str), encoding='utf-8')

# ---- Evidence Book
p = REPO / 'js' / 'deskEvidence.js'
s = p.read_text(encoding='utf-8'); nl = '\r\n' if '\r\n' in s else '\n'
if "id: 'gex-range-iv-calm-es'" not in s:
    def entry(i, inst, verdict, res_txt, use_txt):
        return nl.join([
            "  {",
            f"    id: '{i}', domain: 'positioning', verdict: '{verdict}', date: '2026-11-14', doc: 'forge/GEX_RANGE_IV_CALM_PREREG.md', also: ['analysis/output/gex-range-iv-calm/RESULTS.md'], instruments: ['{inst}'],",
            f"    claim: 'In calm-VIX sessions only (implied vol at or below its trailing 252-session median), the short-gamma sessions still run wider than long-gamma at the same trailing vol once the implied-to-realised ratio is in the baseline ({inst}, CME near book, OI(D) to session D+2)',",
            f"    result: '{res_txt}',",
            f"    use: '{use_txt}',",
            "  },"])
    es_res = (f"NULL, marginal (registered rule: gate fails and the interval upper end is under +0.10). 770 sessions to 2026-08-20 (lockbox), calm 475 of which 59 short-gamma. b_IV,calm {f(e['b'])} [{f(e['lo'])}, {f(e['hi'])}], t {e['t']:.2f}, Holm p {e['hp']:.2f}; in stress {f(e['bs'])} [{f(e['slo'])}, {f(e['shi'])}]; calm minus stress {f(e['d']['est'])} [{f(e['d']['lo95'])}, {f(e['d']['hi95'])}]. IV absorbs more than half of the calm effect (B0 {f(e['b0c'])} to B1 {f(e['b'])}). The result depends on the calm definition: fixed VIX<20 gives {f(E['sensitivities']['fixed']['B1_calm'])}. MDE {e['mde']:.2f}.")
    nq_res = (f"UNDERPOWERED. 770 sessions to 2026-08-20 (lockbox), calm 461 of which 87 short-gamma. b_IV,calm {f(n['b'])} [{f(n['lo'])}, {f(n['hi'])}], t {n['t']:.2f}, Holm p {n['hp']:.2f}, real above {n['pl']*100:.0f}% of shift placebos (gate 95%); in stress {f(n['bs'])} [{f(n['slo'])}, {f(n['shi'])}]; calm minus stress {f(n['d']['est'])} [{f(n['d']['lo95'])}, {f(n['d']['hi95'])}]. IV absorbs 59% of the calm effect (B0 {f(n['b0c'])} to B1 {f(n['b'])}). Positive in both halves and under the fixed and tercile cuts ({f(N['sensitivities']['fixed']['B1_calm'])}, {f(N['sensitivities']['tercile']['B1_calm'])}) but never distinguishable from 0. MDE {n['mde']:.2f}.")
    use_es = 'Say "calm sessions do not rescue the CME gamma sign on ES: with implied vol controlled the calm-only coefficient is about zero (upper end just under +0.10)". Do not say gamma is informative in calm regimes. The ES CME-book calm question is closed; a calm-only remainder is not ruled out by the fixed-cut sensitivity, only by the registered cut.'
    use_nq = 'Say "on NQ, implied vol already prices most of the gamma widening in calm sessions too; a small calm-only remainder (point +0.08, interval -0.04 to +0.20) is not ruled out and not shown". Do not print "gamma is informative in calm regimes". Reopen only with the Cboe full book or roughly four to six times the calm short-gamma sessions.'
    ins = entry('gex-range-iv-calm-es', 'SPX500', 'null', es_res.replace("'", "\\'"), use_es.replace("'", "\\'")) + nl + entry('gex-range-iv-calm-nq', 'NQ', 'underpowered', nq_res.replace("'", "\\'"), use_nq.replace("'", "\\'"))
    m = re.search(r'(\n  \},\r?\n)(\];\r?\n\r?\n// The Theory Lab is the shareable zone)', s)
    assert m
    s = s[:m.end(1)] + ins + nl + s[m.start(2):]
    anchor = "  'gex-range-iv':            {"
    i = s.index(anchor)
    rows = nl.join([f"  'gex-range-iv-calm-es':    {{ n: '770 ES sessions (475 calm, 59 short-gamma calm)', note: 'calm design MDE {e['mde']:.2f} vs +0.05 gate; b_IV,calm {f(e['b'])} [{f(e['lo'])}, {f(e['hi'])}], upper end under +0.10 so NULL by rule (marginal)' }},",
                    f"  'gex-range-iv-calm-nq':    {{ n: '770 NQ sessions (461 calm, 87 short-gamma calm)', note: 'calm design MDE {n['mde']:.2f} vs +0.05 gate; b_IV,calm {f(n['b'])} [{f(n['lo'])}, {f(n['hi'])}]' }},"]) + nl
    s = s[:i] + rows + s[i:]
    p.write_text(s, encoding='utf-8', newline='')
print('done')
