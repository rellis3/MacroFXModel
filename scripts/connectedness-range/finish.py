"""connectedness-range: RESULTS.md, results.json wrapper, Evidence Book entry + POWER row (idempotent)."""
import json, re
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
O = REPO / 'analysis' / 'output' / 'connectedness-range'
R = json.loads((O / 'results.json').read_text(encoding='utf-8'))
if 'detail' in R: R = R['detail']
P = json.loads((O / 'power.json').read_text(encoding='utf-8'))
D = R['descriptive']
f = lambda x: '%+.3f' % x
md = f"""# connectedness-range — results

Prereg: `forge/CONNECTEDNESS_RANGE_PREREG.md` (committed in `61c10328`, 2026-11-14; A1 PRE-RESULTS in `f5b35b64`). Run 2026-11-14, seed 20261114, B = 2000.
Branch `main`. Ledger id: `connectedness-range`. Scripts `scripts/connectedness-range/` (`run.py`, `finish.py`).

## Verdict: NULL

Total connectedness of the ten markets' London-session log ranges (Diebold-Yilmaz, VAR(1), W = 250 days, H = 10; mean {D['C_mean_sd'][0]:.1f}%, SD {D['C_mean_sd'][1]:.1f}) adds almost nothing to the next session's pooled log range once range persistence (HAR terms), the VIX level, the mean absolute correlation and weekday are in the model: **b_C = {f(R['b_C'])} log points per SD of C, 95% CI [{f(R['ci95'][0])}, {f(R['ci95'][1])}]** (t {R['t']:.2f}, {R['n']} sessions {P['first']} to {P['last']}), i.e. a more connected state goes with a next-day range about {R['b_C']*100:.1f}% wider per SD, and the data rule out anything above about {R['ci95'][1]*100:.1f}% per SD. The registered gate (b ≥ +0.02, lower end > 0, real above 95% of shift placebos) fails and the interval's upper end sits below the +0.05 operational bar, so the verdict is `NULL`. The design was powered for it: the MDE was {P['mde_range'][0]:.3f} to {P['mde_range'][1]:.3f} per SD, above the +0.02 gate but well below +0.05. Adding C to the baseline raises R² by {R['r2_gain']*100:.3f}%.

## Scored cell

| Cell | n | b_C (per SD) | 95% CI (block bootstrap) | SE | t | MDE | Placebo below real | Verdict |
|---|---|---|---|---|---|---|---|---|
| Pooled ten-market log range, next London session | {R['n']} | {f(R['b_C'])} | [{f(R['ci95'][0])}, {f(R['ci95'][1])}] | {R['se']:.4f} | {R['t']:.2f} | {P['mde_range'][0]:.3f}-{P['mde_range'][1]:.3f} | {R['placebo']['real_above_share']:.2f} | NULL |

Controls' coefficients in B1 for scale: pooled log range today {f(R['b_controls']['p'])}, 5-day {f(R['b_controls']['p5'])}, 20-day {f(R['b_controls']['p20'])}, ln VIX {f(R['b_controls']['lvix'])}, mean |rho| {f(R['b_controls']['rho'])}.

## Controls (THE MIRROR) and descriptive

- **The shift placebo:** the all-shift distribution of b_C has mean {R['placebo']['mean']:+.4f} and SD {R['placebo']['sd']:.3f} ({R['placebo']['n_shifts']} shifts); the real coefficient sits at the {R['placebo']['real_above_share']*100:.0f}th percentile (gate 95th).
- **C is a new variable, not a proxy:** rank correlation with ln VIX {D['spearman_C_vix']:+.2f}, with mean |rho| {D['spearman_C_rho']:+.2f}; it moves with neither, and it still does not predict.
- **Sensitivities (never scored):** without the VIX control {f(D['without_vix'])}; 5-day change in C {f(D['dC5'])}; W = 120 {f(D['W120_H10']['b_C'])}; W = 500 {f(D['W500_H10']['b_C'])}; H = 5 {f(D['W250_H5']['b_C'])}. All inside ±0.02.
- **Halves:** first {f(D['halves']['first'])}, second {f(D['halves']['second'])}: the first-half estimate is negative; no stable sign.
- **By group target (point estimates, no tests, BH not computed):** FX {f(D['by_group_target']['FX'])}, gold {f(D['by_group_target']['gold'])}, indices {f(D['by_group_target']['index'])}. Gold's +0.05 is one of three post-hoc looks with no interval and is not a result.

## Deviations from the prereg

A1 (PRE-RESULTS): units clarified (the VAR series and target are ln(ln(H/L)), the log range; a first power-stage run on ln(H/L) read no coefficient and was discarded), the sample starts 2019-01-04 because the ten-market VAR needs all ten markets and the SPX500 minute file has many missing sessions in 2016-18, and the design SE/MDE. Nothing else changed.

## What this changes

Nothing live. The connectedness dial/network idea is only a description of the volatility web: the terminal may draw it, and must say it carries no range information beyond VIX, correlation and range persistence ("connectedness did not predict the next day's range"). It is not a risk-state input. A TVP-VAR version, implied-vol connectedness, or commodity futures are different questions and would need their own prereg.
"""
(O / 'RESULTS.md').write_text(md, encoding='utf-8')
wrap = {'id': 'connectedness-range', 'verdict': 'null', 'ranAt': '2026-11-15T00:30:00Z', 'seed': 20261114, 'B': 2000, 'prereg': 'forge/CONNECTEDNESS_RANGE_PREREG.md', 'preregCommit': '61c10328', 'branch': 'main',
        'cells': [{'name': 'b_C pooled next-session log range', 'n': R['n'], 'est': R['b_C'], 'lo': R['ci95'][0], 'hi': R['ci95'][1], 'mde': P['mde_range'][1], 'verdict': 'null'}], 'detail': R, 'power': P}
(O / 'results.json').write_text(json.dumps(wrap, indent=1, default=str), encoding='utf-8')
p = REPO / 'js' / 'deskEvidence.js'
s = p.read_text(encoding='utf-8'); nl = '\r\n' if '\r\n' in s else '\n'
if "id: 'connectedness-range'" not in s:
    esc = lambda t: t.replace("'", "\\'")
    res_txt = (f"NULL. Ten markets (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, gold, NAS100, SPX500), London-session log ranges, {R['n']} sessions {P['first']} to {P['last']} (lockbox respected; start limited by the all-ten VAR). Diebold-Yilmaz total connectedness (VAR(1), W 250, H 10; mean {D['C_mean_sd'][0]:.0f}%, SD {D['C_mean_sd'][1]:.1f}) added to HAR terms, ln VIX, mean |rho| and weekday: b_C {f(R['b_C'])} log points per SD [{f(R['ci95'][0])}, {f(R['ci95'][1])}], t {R['t']:.2f}; MDE {P['mde_range'][0]:.3f}-{P['mde_range'][1]:.3f} vs +0.02 gate and +0.05 bar; real at the {R['placebo']['real_above_share']*100:.0f}th percentile of shift placebos; R2 gain {R['r2_gain']*100:.3f}%. Sensitivities (no VIX, 5-day change, W 120/500, H 5) all within +/-0.02; halves {f(D['halves']['first'])} / {f(D['halves']['second'])}. C is not a proxy for VIX or correlation (rank corr {D['spearman_C_vix']:+.2f} / {D['spearman_C_rho']:+.2f}) and still does not predict.")
    use_txt = 'Say "connectedness did not predict the next day\'s range once VIX, correlation and range persistence are in: a more connected state goes with a range at most about 2% wider per SD, and probably none". A connectedness dial or network may be drawn as a description of the volatility web; it is not a range input or a risk-state trigger. TVP-VAR, implied-vol or commodity versions are untested.'
    entry = nl.join(["  {",
        "    id: 'connectedness-range', domain: 'volatility', verdict: 'null', date: '2026-11-14', doc: 'forge/CONNECTEDNESS_RANGE_PREREG.md', also: ['analysis/output/connectedness-range/RESULTS.md'], instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500'],",
        "    claim: 'A Diebold-Yilmaz total connectedness index of ten markets\\' realised log ranges predicts the next London session\\'s pooled log range beyond range persistence, the VIX level and the mean absolute correlation',",
        f"    result: '{esc(res_txt)}',", f"    use: '{esc(use_txt)}',", "  },"])
    m = re.search(r'(\n  \},\r?\n)(\];\r?\n\r?\n// The Theory Lab is the shareable zone)', s); assert m
    s = s[:m.end(1)] + entry + nl + s[m.start(2):]
    anchor = "  'gex-range-iv':            {"; i = s.index(anchor)
    s = s[:i] + f"  'connectedness-range':     {{ n: '{R['n']} sessions 2019-01 to 2026-08 (block bootstrap)', note: 'MDE {P['mde_range'][0]:.3f}-{P['mde_range'][1]:.3f} vs +0.02 gate / +0.05 bar; b_C {f(R['b_C'])} [{f(R['ci95'][0])}, {f(R['ci95'][1])}] per SD, upper end under the bar' }},{nl}" + s[i:]
    p.write_text(s, encoding='utf-8', newline='')
print('done')
