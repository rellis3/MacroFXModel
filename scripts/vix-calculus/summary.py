"""vix-calculus: merge results_{A,BC,D,E}.json + robustness.json into analysis/output/vix-calculus/summary.json for vix-calculus.html. No new computation."""
import os, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus')
L = lambda f: json.load(open(os.path.join(OUT, f), encoding='utf-8'))
A, BC, D, E, R = L('results_A.json'), L('results_BC.json'), L('results_D.json'), L('results_E.json'), L('robustness.json')
cells = lambda part: [{k: c[k] for k in ('construction', 'tail', 'outcome', 'beta_sd', 't', 'n_flag', 'discover_beta', 'validate_beta', 'test_beta', 'placebo_t95', 'holm_part', 'holm46', 'gate', 'verdict_cell')} for c in BC['cells'] if c['part'] == part]
verdict = lambda cs: 'VALIDATED' if any(c['verdict_cell'] == 'validated' for c in cs) else ('NULL' if all(c['verdict_cell'] == 'null' for c in cs) else 'UNDERPOWERED')
GARIN = {'ES · Down since 10:00': dict(barely=-0.039, middle=0.005, hard=0.081, years_same_way='4/5'), 'ES · Up since 10:00': dict(barely=0.035, middle=0.086, hard=0.133, years_same_way='5/5'),
         'NQ · Down since 10:00': dict(barely=0.040, middle=0.027, hard=0.033, years_same_way='3/5'), 'NQ · Up since 10:00': dict(barely=0.119, middle=0.165, hard=0.104, years_same_way='3/5')}
S = dict(
    generated='2026-10-23', prereg='forge/VIX_CALCULUS_PREREG.md', results='analysis/output/vix-calculus/RESULTS.md',
    verdicts=dict(A='CONTEXT', B=verdict(cells('B')), C=verdict(cells('C')), D=D['verdict'].upper(), E='VALIDATED' if all(c['verdict_cell'] == 'validated' for c in E['cells']) else verdict(E['cells'])),
    A=dict(kappa={n: [dict(h=int(k.split('|h')[1]), v=v['kappa'], lo=v['ci'][0], hi=v['ci'][1]) for k, v in A['kappa'].items() if k.startswith(n + '|')] for n in ('NDX', 'VIX')},
           vr={n: [dict(h=int(k.split('|h')[1]), v=v['vr'], lo=v['ci'][0], hi=v['ci'][1]) for k, v in A['vr'].items() if k.startswith(n + '|')] for n in ('NDX', 'VIX')}, jordan=A['jordan']),
    B=dict(cells=cells('B')), C=dict(cells=cells('C'), robust=R['C2']),
    D=dict(garin=GARIN, repro=D['reproduction_2016_2020'], oos=D['oos_table'], cells=[{k: v for k, v in c.items()} for c in D['cells']], cuts=D['cuts'], tiny_share=D['tiny_share'], variants=L('garin_variants.json')),
    E=dict(cells=E['cells'], robust=R['E'], rule={k: v for k, v in E['rule'].items()}, unconditional=E['unconditional'], n_sessions=E['n_sessions']))
json.dump(S, open(os.path.join(OUT, 'summary.json'), 'w', encoding='utf-8'), indent=1); print('summary.json', {k: v for k, v in S['verdicts'].items()})
