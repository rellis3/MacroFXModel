"""hl-spread-estimator: RESULTS.md, results.json wrapper, Evidence Book entry + POWER row (idempotent)."""
import json, re
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
O = REPO / 'analysis' / 'output' / 'hl-spread-estimator'
R = json.loads((O / 'results.json').read_text(encoding='utf-8'))
if 'detail' in R: R = R['detail']
CS, AR = R['CS'], R['AR']
g = lambda e, k: R[e]['by_group'][k]
md = f"""# hl-spread-estimator — results

Prereg: `forge/HL_SPREAD_ESTIMATOR_PREREG.md` (committed in `55647800`, 2026-11-14, before any estimate was computed; no amendment). Run 2026-11-14, seed 20261114, month bootstrap B = 1000, mirror 200 pairings.
Branch `main`. Ledger id: `hl-spread-estimator`. Scripts `scripts/hl-spread-estimator/` (`run.py`, `finish.py`); per-instrument table `per_instrument.csv`.

## Verdict: NULL

Neither published estimator reproduces the quoted OANDA spread on the {R['n_instruments']} instruments where we hold bid/ask. **Level:** the pooled median relative error is **{CS['pooled_median_rel_err']*100:.0f}%** for Corwin-Schultz (95% CI {CS['boot']['rel']['lo95']*100:.0f}% to {CS['boot']['rel']['hi95']*100:.0f}%) and **{AR['pooled_median_rel_err']*100:.0f}%** for Abdi-Ranaldo ({AR['boot']['rel']['lo95']*100:.0f}% to {AR['boot']['rel']['hi95']*100:.0f}%), against a gate of 30% (upper end ≤ 40%): both estimators overstate the spread, by a median factor of {CS['bias_ratio_median']:.1f}x (CS) and {AR['bias_ratio_median']:.1f}x (AR), because the daily range is dominated by volatility, not the spread. **Variation:** the median within-instrument month-to-month Spearman is {CS['pooled_median_spearman']:.2f} (CI {CS['boot']['rho']['lo95']:.2f} to {CS['boot']['rho']['hi95']:.2f}) for CS and {AR['pooled_median_spearman']:.2f} ({AR['boot']['rho']['lo95']:.2f} to {AR['boot']['rho']['hi95']:.2f}) for AR against a bar of 0.50. **Ordering across instruments:** {CS['ordering_spearman']:+.2f} (CS) and {AR['ordering_spearman']:+.2f} (AR) against 0.80. Every gate fails for both; the registered NULL rule (the error interval's lower end above 0.40 for both estimators) holds. The measurement is powered: the intervals are tight and far from the bars.

## Scored cells

| Estimator | Pooled median relative error (95% CI) | Gate | Pooled median Spearman (95% CI) | Gate | Cross-instrument ordering | Gate | Bias (median est/measured) |
|---|---|---|---|---|---|---|---|
| Corwin-Schultz | {CS['pooled_median_rel_err']:.2f} ({CS['boot']['rel']['lo95']:.2f}, {CS['boot']['rel']['hi95']:.2f}) | ≤ 0.30 FAIL | {CS['pooled_median_spearman']:.2f} ({CS['boot']['rho']['lo95']:.2f}, {CS['boot']['rho']['hi95']:.2f}) | ≥ 0.50 FAIL | {CS['ordering_spearman']:+.2f} ({CS['ordering_boot']['lo95']:+.2f}, {CS['ordering_boot']['hi95']:+.2f}) | ≥ 0.80 FAIL | {CS['bias_ratio_median']:.1f}x |
| Abdi-Ranaldo | {AR['pooled_median_rel_err']:.2f} ({AR['boot']['rel']['lo95']:.2f}, {AR['boot']['rel']['hi95']:.2f}) | ≤ 0.30 FAIL | {AR['pooled_median_spearman']:.2f} ({AR['boot']['rho']['lo95']:.2f}, {AR['boot']['rho']['hi95']:.2f}) | ≥ 0.50 FAIL | {AR['ordering_spearman']:+.2f} ({AR['ordering_boot']['lo95']:+.2f}, {AR['ordering_boot']['hi95']:+.2f}) | ≥ 0.80 FAIL | {AR['bias_ratio_median']:.1f}x |

## Controls (THE MIRROR)

Pairing each instrument's estimate with a randomly chosen other instrument's measured spread (200 pairings, same months) gives a median relative error of {CS['mirror_random_pairing']['rel_err_median']:.1f} (CS) and {AR['mirror_random_pairing']['rel_err_median']:.1f} (AR), and a median Spearman of {CS['mirror_random_pairing']['spearman_median']:.2f} (CS) and {AR['mirror_random_pairing']['spearman_median']:.2f} (AR). The real pairing is barely different from a random one (CS Spearman {CS['pooled_median_spearman']:.2f} real vs {CS['mirror_random_pairing']['spearman_median']:.2f} random; AR {AR['pooled_median_spearman']:.2f} vs {AR['mirror_random_pairing']['spearman_median']:.2f}): the estimators are not tracking anything instrument-specific beyond the shared volatility cycle.

## Descriptive

- **By group (CS relative error / Spearman / bias):** FX majors {g('CS','FX major')['rel_err_median']:.1f} / {g('CS','FX major')['spearman_median']:.2f} / {g('CS','FX major')['bias_ratio_median']:.1f}x (n 7); FX crosses {g('CS','FX cross')['rel_err_median']:.1f} / {g('CS','FX cross')['spearman_median']:.2f} / {g('CS','FX cross')['bias_ratio_median']:.1f}x (n 20); gold {g('CS','gold')['rel_err_median']:.1f} / {g('CS','gold')['spearman_median']:.2f} / {g('CS','gold')['bias_ratio_median']:.1f}x; indices {g('CS','index')['rel_err_median']:.1f} / {g('CS','index')['spearman_median']:.2f} / {g('CS','index')['bias_ratio_median']:.1f}x (n 6).
- **By group (AR):** FX majors {g('AR','FX major')['rel_err_median']:.2f} / {g('AR','FX major')['spearman_median']:.2f} / {g('AR','FX major')['bias_ratio_median']:.1f}x; FX crosses {g('AR','FX cross')['rel_err_median']:.2f} / {g('AR','FX cross')['spearman_median']:.2f} / {g('AR','FX cross')['bias_ratio_median']:.1f}x; indices {g('AR','index')['rel_err_median']:.2f} / {g('AR','index')['spearman_median']:.2f} / {g('AR','index')['bias_ratio_median']:.1f}x.
- CS follows the month-to-month swings in FX majors a little (median Spearman {g('CS','FX major')['spearman_median']:.2f}), which is the volatility cycle the measured spread also shows, but its level is about {CS['bias_ratio_median']:.0f}x too high. A scaled or volatility-adjusted version would be a new prereg (the prereg fixed "used as published"): the within-instrument tracking of CS (0.29 pooled) is too weak to support one on FX crosses, gold or indices.

## Deviations from the prereg

None. The measured spread is the quoted ask minus bid (OANDA 1-minute closes) over the London session; it is not the realised fill cost of an account (`cost-verification` found NQ and gold fills inside the quote), which is a limit stated in the prereg.

## What this changes

No bar-only spread estimator is usable for costs on this universe. Keep using the bid/ask M1 history (2016-10 to 2026-08) for the cost of any net-of-cost test within that window, and the live `spread_profile_v1` from 2026-09; pre-2016-10 net-of-cost verdicts are not extended by this route and stay "gross". For history before 2016, a measured spread source (broker or vendor quotes) is needed.
"""
(O / 'RESULTS.md').write_text(md, encoding='utf-8')
wrap = {'id': 'hl-spread-estimator', 'verdict': 'null', 'ranAt': '2026-11-14T23:45:00Z', 'seed': 20261114, 'B': 1000, 'prereg': 'forge/HL_SPREAD_ESTIMATOR_PREREG.md', 'preregCommit': '55647800', 'branch': 'main',
        'cells': [{'name': e + ' ' + k, 'n': R['n_instruments'], 'est': R[e][a], 'verdict': 'null'} for e in ('CS', 'AR') for k, a in (('pooled median relative error', 'pooled_median_rel_err'), ('pooled median Spearman', 'pooled_median_spearman'), ('ordering Spearman', 'ordering_spearman'))], 'detail': R}
(O / 'results.json').write_text(json.dumps(wrap, indent=1, default=str), encoding='utf-8')
p = REPO / 'js' / 'deskEvidence.js'
s = p.read_text(encoding='utf-8'); nl = '\r\n' if '\r\n' in s else '\n'
if "id: 'hl-spread-estimator'" not in s:
    esc = lambda t: t.replace("'", "\\'")
    res_txt = (f"NULL. 34 instruments with OANDA bid/ask M1 (2016-10 to 2026-08-20, lockbox respected), monthly values vs the quoted London-session spread. Corwin-Schultz: pooled median relative error {CS['pooled_median_rel_err']*100:.0f}% (95% CI {CS['boot']['rel']['lo95']*100:.0f}% to {CS['boot']['rel']['hi95']*100:.0f}%), median bias {CS['bias_ratio_median']:.1f}x, within-instrument Spearman {CS['pooled_median_spearman']:.2f} ({CS['boot']['rho']['lo95']:.2f} to {CS['boot']['rho']['hi95']:.2f}), cross-instrument ordering {CS['ordering_spearman']:+.2f}. Abdi-Ranaldo: relative error {AR['pooled_median_rel_err']*100:.0f}% ({AR['boot']['rel']['lo95']*100:.0f}% to {AR['boot']['rel']['hi95']*100:.0f}%), bias {AR['bias_ratio_median']:.1f}x, Spearman {AR['pooled_median_spearman']:.2f}, ordering {AR['ordering_spearman']:+.2f}. Gates (error <= 30%, Spearman >= 0.50, ordering >= 0.80) all fail for both. A random-pairing mirror gives nearly the same agreement (CS Spearman {CS['mirror_random_pairing']['spearman_median']:.2f}), so the estimators track the shared volatility cycle, not the spread.")
    use_txt = 'Say "a daily high-low-close spread estimator does not reproduce the OANDA spread: it overstates it about 6 to 11 times and does not rank instruments"; do not build a pre-2016 cost series from Corwin-Schultz or Abdi-Ranaldo, and keep pre-2016-10 net-of-cost verdicts gross. The measured bid/ask M1 history (2016-10 on) and the live spread profile are the cost sources. A scaled version would need its own prereg.'
    entry = nl.join(["  {",
        "    id: 'hl-spread-estimator', domain: 'execution', verdict: 'null', date: '2026-11-14', doc: 'forge/HL_SPREAD_ESTIMATOR_PREREG.md', also: ['analysis/output/hl-spread-estimator/RESULTS.md'], instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500'],",
        "    claim: 'A daily high-low-close spread estimator (Corwin-Schultz, Abdi-Ranaldo) reproduces the quoted OANDA bid-ask spread closely enough (median error <= 30%, month-to-month Spearman >= 0.5, correct ordering of instruments) to extend cost history beyond the bid/ask M1 window',",
        f"    result: '{esc(res_txt)}',", f"    use: '{esc(use_txt)}',", "  },"])
    m = re.search(r'(\n  \},\r?\n)(\];\r?\n\r?\n// The Theory Lab is the shareable zone)', s); assert m
    s = s[:m.end(1)] + entry + nl + s[m.start(2):]
    anchor = "  'gex-range-iv':            {"; i = s.index(anchor)
    s = s[:i] + f"  'hl-spread-estimator':     {{ n: '34 instruments x ~117 months (month-bootstrap CIs)', note: 'measurement-agreement design, intervals far from the bars: CS error {CS['pooled_median_rel_err']*100:.0f}% (CI {CS['boot']['rel']['lo95']*100:.0f}-{CS['boot']['rel']['hi95']*100:.0f}%), AR {AR['pooled_median_rel_err']*100:.0f}%; gate 30%' }},{nl}" + s[i:]
    p.write_text(s, encoding='utf-8', newline='')
print('done')
