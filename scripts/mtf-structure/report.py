"""Tables for analysis/output/mtf-structure/RESULTS.md from results.json (no computation of outcomes here).

python -X utf8 -I scripts/mtf-structure/report.py  ->  analysis/output/mtf-structure/tables.md
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'analysis', 'output', 'mtf-structure'))
R = json.load(open(os.path.join(OUT, 'results.json')))
f = lambda x, d=4: '—' if x is None else f'{x:+.{d}f}'
pc = lambda x: '—' if x is None else f'{x*100:.1f}%'
L = []
L += ['## Scored cells', '',
      '| Cell | rows (dates) | Estimate [95% CI] | bar | z | Holm p | halves H1 / H2 | noise q97.5 (pct) | vs named [CI] | planted 1x bar found | hit vs B0 hit | G1-G6 | Word |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
for c in R['cells']:
    g = ''.join('✓' if v else '✗' for v in c['gates'].values())
    vn = f"{f(c['vs_named']['diff'])} [{f(c['vs_named']['lo'])}, {f(c['vs_named']['hi'])}]" if 'vs_named' in c else '—'
    pct = c['random_abst']['real_pct'] if 'random_abst' in c else c['shuffle_pct']
    L.append(f"| {c['name']} | {c['n_rows']} ({c['n_dates']}) | {f(c['est'])} [{f(c['lo'])}, {f(c['hi'])}] | {c['bar']:+.2f} | {c['z']:+.2f} | "
             f"{c['holm_p']:.3f} | {f(c['H1'])} / {f(c['H2'])} | {f(c['g4_q'])} ({pct:.0f}) | {vn} | {c['plant']['detected']:.0%} | "
             f"{pc(c.get('hit_rate'))} vs {pc(c.get('b0_hit'))} | {g} | **{c['word']}** |")
L += ['', 'Families: ' + ', '.join(f'`{k}` **{v}**' for k, v in R['family_verdicts'].items()), '']
L += ['## Benchmarks', '', '| Benchmark | h1 | h3 | h5 |', '|---|---|---|---|']
for nm in ('named', 'conflict-named', 'hmm_smooth', 'conflict-hmm-smooth'):
    row = [f"{f(R['bench'][f'{nm}|h{h}']['est'])} [{f(R['bench'][f'{nm}|h{h}']['lo'])}, {f(R['bench'][f'{nm}|h{h}']['hi'])}]" for h in (1, 3, 5)]
    L.append(f'| {nm} | ' + ' | '.join(row) + ' |')
L += ['', '## Coverage (share of test instrument-sessions called / kept)', '',
      ', '.join(f'{k} {v:.1%}' for k, v in R['descriptive']['coverage'].items()), '']
L += ['## By asset group (descriptive)', '', '| family | h | group | n | est [95% CI] | hit | B0 hit |', '|---|---|---|---|---|---|---|']
for d in R['descriptive']['slices']:
    if d['slice'] == 'group':
        L.append(f"| {d['family']} | {d['h']} | {d['key']} | {d['n']} | {f(d['est'])} [{f(d['lo'])}, {f(d['hi'])}] | {pc(d['hit'])} | {pc(d['b0_hit'])} |")
L += ['', f"Instrument slices: {R['descriptive']['bh_instrument_passes']} of {R['descriptive']['bh_instrument_tests']} positive slices pass BH q = 0.10.", '']
bh = [d for d in R['descriptive']['slices'] if d['slice'] == 'inst' and d.get('bh_pass')]
for d in bh:
    L.append(f"- BH survivor (candidate only): {d['family']} h{d['h']} {d['key']} {f(d['est'])} [{f(d['lo'])}, {f(d['hi'])}]")
L += ['', '## By year (estimate, descriptive)', '', '| family | h | ' + ' | '.join(str(y) for y in range(2018, 2027)) + ' |', '|---|---|' + '---|' * 9]
for fam in ('ema', 'swing', 'hmm', 'pullback', 'conflict-ema', 'conflict-hmm'):
    for h in (1, 3, 5):
        ys = {d['key']: d['est'] for d in R['descriptive']['slices'] if d['slice'] == 'year' and d['family'] == fam and d['h'] == h}
        L.append(f'| {fam} | {h} | ' + ' | '.join(f(ys.get(str(y)), 3) for y in range(2018, 2027)) + ' |')
L += ['', '## State behaviour (descriptive)', '', 'Flip rate per session (share of sessions whose state differs from the previous session):', '']
L.append(', '.join(f'{k} {v:.2f}' for k, v in R['descriptive']['flip_rate_per_session'].items()))
if 'hmm_K_share3' in R['descriptive']:
    L += ['', f"HMM fits: {R['descriptive']['hmm_fits']}; share choosing K = 3 on held-out likelihood: " +
          ', '.join(f'{k} {v:.0%}' for k, v in R['descriptive']['hmm_K_share3'].items()) +
          '; median implied dwell (bars): ' + ', '.join(f'{k} {v:.0f}' for k, v in R['descriptive']['hmm_median_dwell_bars'].items())]
L += ['', '## Sigma-scaled move on called / kept rows (descriptive, mean side x move / sigma_day)', '']
L.append(', '.join(f"{c['name']} {f(c['sigma_move'], 3)}" for c in R['cells']))
if 'evidence_packs' in R:
    L += ['', '## Evidence packs (24h)', '', '| family | diagnosis | pack estimate [CI] | placebo band | planted 0.5x / 1x / 2x found | leak canary (with leak / clean) |', '|---|---|---|---|---|---|']
    for fam, p in R['evidence_packs'].items():
        pcs = ' / '.join(f"{x['detected_share']:.0%}" for x in p['positive_control'])
        lc = p.get('lookahead_canary') or {}
        L.append(f"| {fam} | {p['label']} | {f(p['estimate'])} [{f(p['ci'][0])}, {f(p['ci'][1])}] | [{f(p['placebo']['p2_5'])}, {f(p['placebo']['p97_5'])}] | {pcs} | {f(lc.get('estimate_with_leak'))} / {f(lc.get('estimate_clean'))} |")
open(os.path.join(OUT, 'tables.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('\n'.join(L))
