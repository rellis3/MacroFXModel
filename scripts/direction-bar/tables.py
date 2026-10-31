"""direction-bar: render the RESULTS.md tables from results.json and scoreboard.json, and stamp the protocol fields
into results.json (id, verdict, ranAt, prereg). Usage: python -I scripts/direction-bar/tables.py > analysis/output/direction-bar/tables.md"""
import json, datetime, sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis/output/direction-bar'
r = json.loads((OUT / 'results.json').read_text()); sb = json.loads((OUT / 'scoreboard.json').read_text())
P = lambda x, d=3: '—' if x is None else f'{x:+.{d}f}'
print('### Baselines and detectability, per instrument x horizon (futures venue)\n')
print('| Instrument | h | Base P(up) (full) | P(up) FIT / CHECK / test yr | B0 bias (test yr) | Sparse MDE at historical K (σ_h) | same, hit pp over B0 | P(up) a sparse cell must show | Pooled MDE (σ_h) | Forward years for 0.25σ | Always-on IC MDE (fast / persistent) | Break-even long / short (σ_h, futures) | Short break-even (σ_h, CFD) | Label fut / CFD |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for n, I in r['instruments'].items():
    for h, c in I['h'].items():
        b = c['baselines']; bp = b['p_up_by_period']; sh = c['sparse_hist']; be = c['breakeven']; ic = c['always_on']
        p0 = b['p_up_full']
        print(f"| {n} | {h} | {p0:.3f} | {bp['FIT']['p_up']:.3f} / {bp['CHECK']['p_up']:.3f} / {bp['TESTYR']['p_up']:.3f} | {P(bp['TESTYR']['b0_bias'])} | "
              f"{sh['mde_sd_single']:.2f} (K={sh['K_hist']}) | {100*sh['mde_hit_single']:.1f} | ≥{p0+sh['mde_hit_single']:.2f} or ≤{p0-sh['mde_hit_single']:.2f} | {sh['mde_sd_pooled']:.2f} | {sh['forward_years_needed']:.0f} | "
              f"{ic[0]['mde_ic']['single']:.3f} / {ic[-1]['mde_ic']['single']:.3f} | {P(be['futures']['long_excess_sd_needed'],2)} / {P(be['futures']['short_excess_sd_needed'],2)} | {P(be['cfd']['short_excess_sd_needed'],2)} | {c['label']['futures']} / {c['label']['cfd']} |")
print('\n### MDE by multiplicity level (sparse design, K = 100 events, hit pp over B0; placebo vs analytic)\n')
print('| Instrument | h | single α 0.05 | family of 10 | whole ledger (217) | analytic single | placebo / analytic (after the finite-population correction) | B0 null bias (pp) |')
print('|---|---|---|---|---|---|---|---|')
for n, I in r['instruments'].items():
    for h, c in I['h'].items():
        s = c['sparse'].get('100') or c['sparse'].get(str(max(int(k) for k in c['sparse'])))
        m = s['mde_hit']; a = s['mde_hit_analytic']['single']
        print(f"| {n} | {h} | {100*m['single']:.1f} (K={s['K']}) | {100*m['family10']:.1f} | {100*m['ledger217']:.1f} | {100*a:.1f} | {s['hit_sd']/s['fpc']/s['analytic_hit_sd']:.2f} | {100*s['hit_mean']:+.1f} |")
print('\n### Costs (round trip, % of price)\n')
print('| Instrument | Futures | CFD h=1 (spread + 1.4 nights) | CFD h=20 | CFD spread source | Financing source |')
print('|---|---|---|---|---|---|')
for n, I in r['instruments'].items():
    c1, c20 = I['h']['1']['costs'], I['h']['20']['costs']
    print(f"| {n} | {c1['futures']['round_trip_pct']:.4f} ({c1['futures']['contract']}) | {c1['cfd']['round_trip_pct']:.4f} | {c20['cfd']['round_trip_pct']:.3f} | {c1['cfd']['spread_source']} | {c1['cfd']['financing_source']} |")
print('\n### B2 momentum and B3 carry as P(up) forecasts vs B0 (Brier skill; CI of the per-date Brier gain, block bootstrap)\n')
print('| Instrument | h | B2 BSS | B2 gain CI | B3 BSS | B3 gain CI |')
print('|---|---|---|---|---|---|')
for n, I in r['instruments'].items():
    for h, c in I['h'].items():
        s = c['baselines']['scores']; b2 = s['B2_momentum']; b3 = s.get('B3_carry')
        f = lambda x: f"[{x[0]:+.5f}, {x[1]:+.5f}]"
        print(f"| {n} | {h} | {b2['bss_vs_b0']:+.4f} | {f(b2['brier_diff_ci95'])} | {'—' if not b3 else f'{b3[chr(98)+chr(115)+chr(115)+chr(95)+chr(118)+chr(115)+chr(95)+chr(98)+chr(48)]:+.4f}'} | {'—' if not b3 else f(b3['brier_diff_ci95'])} |")
print('\n### Scoreboard: existing direction cells vs B0\n')
print('| Cell | Class | n | Raw mean (cell direction) | B0 drift in that direction | Excess over B0 | 95% CI | Excess hit (pp) | p (placebo or bootstrap) | × family | × ledger 241 | Net EV / event (futures) | Reading |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for c in sb['cells']:
    if 'excess_ret' not in c:
        print(f"| {c['cell']} | {c.get('class') or '—'} | {c.get('n') if c.get('n') is not None else '—'} | | | | | | | | | | {c['word']} |"); continue
    p = c.get('p_placebo', c['p_boot']); ci = c['ci_excess_ret']
    ne = c.get('net_ev_per_event')
    print(f"| {c['cell']} | {c['class']} | {c['n']} | {c['raw_mean']:+.5f} | {c['b0_mean_in_direction']:+.5f} | {c['excess_ret']:+.5f} | [{ci[0]:+.5f}, {ci[1]:+.5f}] | {100*c['excess_hit']:+.1f} | {p:.3f} | {c['p_family_bonf']:.3f} (×{c['family']}) | {c['p_ledger_bonf']:.2f} | {'—' if ne is None else f'{ne:+.5f}'} | {c['word']} |")
g = r['pooled']['fx_xs']['gate']
print(f"\nPhase 1 gate (FX cross-section, 8 currencies, {g['months']} months): MDE of the mean monthly rank IC, persistent signal φ 0.9: single {g['phi_0.9']['mde']['single']:.3f}, family-10 {g['phi_0.9']['mde']['family10']:.3f}, ledger {g['phi_0.9']['mde']['ledger217']:.3f}; φ 0: {g['phi_0.0']['mde']['single']:.3f}.")
r.update({'id': 'direction-bar', 'verdict': 'context', 'ranAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
          'prereg': 'forge/DIRECTION_BAR_PREREG.md', 'preregCommit': '0e0e73ba', 'branch': 'claude/direction-bar', 'B': 2000})
(OUT / 'results.json').write_text(json.dumps(r, indent=1))
