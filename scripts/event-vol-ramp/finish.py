"""event-vol-ramp: write RESULTS.md, results.json wrapper, Evidence Book entry + POWER row (idempotent)."""
import json, re
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
O = REPO / 'analysis' / 'output' / 'event-vol-ramp'
R = json.loads((O / 'results.json').read_text(encoding='utf-8'))
if 'detail' in R: R = R['detail']
P = json.loads((O / 'power.json').read_text(encoding='utf-8'))
S, N = R['cells']['SPX500'], R['cells']['NQ']
ps, pn = P['cells']['SPX500'], P['cells']['NQ']
f = lambda x: '%+.3f' % x
md = f"""# event-vol-ramp — results

Prereg: `forge/EVENT_VOL_RAMP_PREREG.md` (committed in `d7acf234`, 2026-11-14; A1 PRE-RESULTS in `9b5874ea`). Run 2026-11-14, seed 20261114, B = 2000.
Branch `main`. Ledger id: `event-vol-ramp`. Scripts `scripts/event-vol-ramp/` (`run.py`, `finish.py`).

## Verdict: UNDERPOWERED (both cells)

With the level of the front ratio (the `vol-curve-front` variable), the implied-to-realised ratio, event-family and weekday controls in the model, the extra event-day range per one SD of pre-event front-ratio ramp is **SPX500 {f(S['b_ramp_x_event'])} [{f(S['ci95'][0])}, {f(S['ci95'][1])}]** and **NQ {f(N['b_ramp_x_event'])} [{f(N['ci95'][0])}, {f(N['ci95'][1])}]** (DR units per SD, {S['n_event']} event days; t {S['t']:.2f} and {N['t']:.2f}; Holm p {S['p_holm']:.2f} and {N['p_holm']:.2f}). The registered gate (b ≥ +0.05, lower end > 0, Holm p < 0.05, above 95% of shift placebos) fails in both, and the intervals reach past the +0.10 operational bar, so neither can be called null: the design MDE was {ps['mde']:.3f} / {pn['mde']:.3f}, just above that bar. The points are small and positive, in the direction the idea predicts, and the front level (b_L {S['b_L']:.2f} / {N['b_L']:.2f}) carries far more than the ramp.

## Scored cells

| Cell | n (events) | b_ramp×event | 95% CI | SE | t | Holm p | MDE | Placebo below real | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| SPX500 | {S['n']} ({S['n_event']}) | {f(S['b_ramp_x_event'])} | [{f(S['ci95'][0])}, {f(S['ci95'][1])}] | {S['se']:.3f} | {S['t']:.2f} | {S['p_holm']:.2f} | {ps['mde']:.3f} | {S['placebo']['real_above_share']:.2f} | UNDERPOWERED |
| NQ | {N['n']} ({N['n_event']}) | {f(N['b_ramp_x_event'])} | [{f(N['ci95'][0])}, {f(N['ci95'][1])}] | {N['se']:.3f} | {N['t']:.2f} | {N['p_holm']:.2f} | {pn['mde']:.3f} | {N['placebo']['real_above_share']:.2f} | UNDERPOWERED |

## Controls (THE MIRROR) and descriptive

- **Positive control (A1, before scoring):** event days are wider than ordinary days (mean DR {ps['event_mean_dr']:.2f} vs {ps['ordinary_mean_dr']:.2f} SPX500; {pn['event_mean_dr']:.2f} vs {pn['ordinary_mean_dr']:.2f} NQ) and the B0 family dummies are positive (SPX500 FOMC {f(S['descriptive']['B0_family']['FOMC'])}, CPI {f(S['descriptive']['B0_family']['CPI'])}, NFP {f(S['descriptive']['B0_family']['NFP'])}); the day after an FOMC is also wide.
- **The ramp on ordinary days is not zero:** SPX500 {f(S['b_ramp_ordinary'])} [{f(S['ci95_ordinary_ramp'][0])}, {f(S['ci95_ordinary_ramp'][1])}], NQ {f(N['b_ramp_ordinary'])} [{f(N['ci95_ordinary_ramp'][0])}, {f(N['ci95_ordinary_ramp'][1])}]: with the level in the model, a rising front ratio goes with a slightly narrower ordinary day (the ratio mean-reverts). The event interaction is the ramp's effect on event days over and above that.
- **By family (point estimates, not tested; BH not computed):** ramp × NFP {f(S['descriptive']['by_family_interaction']['NFP'])} (SPX500) / {f(N['descriptive']['by_family_interaction']['NFP'])} (NQ), CPI {f(S['descriptive']['by_family_interaction']['CPI'])} / {f(N['descriptive']['by_family_interaction']['CPI'])}, FOMC {f(S['descriptive']['by_family_interaction']['FOMC'])} / {f(N['descriptive']['by_family_interaction']['FOMC'])}. The pooled number is carried by payrolls; FOMC is negative.
- **Alternative ramps:** VIX9D alone over two sessions {f(S['descriptive']['b_ramp_x_event_r9'])} / {f(N['descriptive']['b_ramp_x_event_r9'])}; one-session ratio ramp {f(S['descriptive']['b_ramp_x_event_ramp1'])} / {f(N['descriptive']['b_ramp_x_event_ramp1'])}.
- **Halves (SPX500):** {f(S['descriptive']['halves']['first'])} then {f(S['descriptive']['halves']['second'])}; (NQ): {f(N['descriptive']['halves']['first'])} then {f(N['descriptive']['halves']['second'])}. Stable sign and size across halves.
- Both instruments share the same VIX inputs and event dates: one source of evidence counted twice.

## Deviations from the prereg

A1 (PRE-RESULTS): sample, design SE/MDE and the alignment check. No other changes. The prereg's "BH q = 0.10 for the family split" was not computed: the family estimates are reported as points only because the pooled cell did not pass.

## What this changes

Nothing live. The terminal may show the front ratio's level as a range read (`vol-curve-front`, validated) and may mention that "the front ratio rose into the event" as a description; it may not use the ramp as an input or multiplier. A larger sample (more event days, other events such as ECB/BoE, or the intraday VIX1D/VIX9D path) is the way to settle a ramp effect of about +0.05 per SD; this one cannot see anything under about +0.11.
"""
(O / 'RESULTS.md').write_text(md, encoding='utf-8')
wrap = {'id': 'event-vol-ramp', 'verdict': 'underpowered', 'ranAt': '2026-11-14T23:30:00Z', 'seed': 20261114, 'B': 2000, 'prereg': 'forge/EVENT_VOL_RAMP_PREREG.md', 'preregCommit': 'd7acf234', 'branch': 'main',
        'cells': [{'name': 'SPX500 ramp x event', 'n': S['n_event'], 'est': S['b_ramp_x_event'], 'lo': S['ci95'][0], 'hi': S['ci95'][1], 'mde': ps['mde'], 'p': S['p_holm'], 'verdict': 'underpowered'},
                  {'name': 'NQ ramp x event', 'n': N['n_event'], 'est': N['b_ramp_x_event'], 'lo': N['ci95'][0], 'hi': N['ci95'][1], 'mde': pn['mde'], 'p': N['p_holm'], 'verdict': 'underpowered'}], 'detail': R, 'power': P}
(O / 'results.json').write_text(json.dumps(wrap, indent=1, default=str), encoding='utf-8')
p = REPO / 'js' / 'deskEvidence.js'
s = p.read_text(encoding='utf-8'); nl = '\r\n' if '\r\n' in s else '\n'
if "id: 'event-vol-ramp'" not in s:
    esc = lambda t: t.replace("'", "\\'")
    res_txt = (f"UNDERPOWERED on both. 2,726 NY-close sessions 2016-02 to 2026-08-20 (lockbox), 322 event days (FOMC 82, CPI 121, NFP 126), level of VIX9D/VIX, implied-to-realised ratio, family and weekday controls in the model. Extra event-day DR per SD of pre-event front-ratio ramp: SPX500 {f(S['b_ramp_x_event'])} [{f(S['ci95'][0])}, {f(S['ci95'][1])}], NQ {f(N['b_ramp_x_event'])} [{f(N['ci95'][0])}, {f(N['ci95'][1])}]; Holm p 0.48; MDE {ps['mde']:.2f}/{pn['mde']:.2f} vs +0.05 gate and +0.10 operational bar; real above {S['placebo']['real_above_share']*100:.0f}% / {N['placebo']['real_above_share']*100:.0f}% of shift placebos (gate 95%). Positive and stable across halves; carried by payrolls (NFP interaction {f(S['descriptive']['by_family_interaction']['NFP'])} / {f(N['descriptive']['by_family_interaction']['NFP'])}), FOMC negative. On ordinary days a rising front ratio goes with a slightly narrower range (SPX500 {f(S['b_ramp_ordinary'])}).")
    use_txt = 'Say "the front ratio rose into the event" as a description only; the level of the front stays the range read (vol-curve-front, validated). Do not use the ramp as an input or a multiplier: the extra range per SD of ramp is small (about +0.03 to +0.04) and the design could not see anything under about +0.11. A larger event sample would be needed to settle a +0.05 effect.'
    entry = nl.join(["  {",
        "    id: 'event-vol-ramp', domain: 'volatility', verdict: 'underpowered', date: '2026-11-14', doc: 'forge/EVENT_VOL_RAMP_PREREG.md', also: ['analysis/output/event-vol-ramp/RESULTS.md'], instruments: ['NQ', 'SPX500'],",
        "    claim: 'Beyond the level of the front implied-vol ratio (VIX9D/VIX, vol-curve-front), a rise in that ratio over the two sessions before a scheduled FOMC, CPI or payrolls release adds to how wide the event-day range runs (NQ and SPX500, NY-close sessions)',",
        f"    result: '{esc(res_txt)}',", f"    use: '{esc(use_txt)}',", "  },"])
    m = re.search(r'(\n  \},\r?\n)(\];\r?\n\r?\n// The Theory Lab is the shareable zone)', s); assert m
    s = s[:m.end(1)] + entry + nl + s[m.start(2):]
    anchor = "  'gex-range-iv':            {"; i = s.index(anchor)
    s = s[:i] + f"  'event-vol-ramp':          {{ n: '322 event days (FOMC 82, CPI 121, NFP 126) in 2,726 sessions', note: 'MDE {ps['mde']:.2f} (SPX500) / {pn['mde']:.2f} (NQ) vs +0.05 gate; b {f(S['b_ramp_x_event'])} [{f(S['ci95'][0])}, {f(S['ci95'][1])}] / {f(N['b_ramp_x_event'])} [{f(N['ci95'][0])}, {f(N['ci95'][1])}] per SD ramp' }},{nl}" + s[i:]
    p.write_text(s, encoding='utf-8', newline='')
print('done')
