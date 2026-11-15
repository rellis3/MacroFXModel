"""Tables for analysis/output/positioning-flow-inputs/RESULTS.md from results.json (the narrative is written by hand
around them). Prints markdown to stdout.

    python -X utf8 -I scripts/positioning-flow-inputs/report.py > <scratch>/tables.md
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'analysis', 'output', 'positioning-flow-inputs')
r = json.load(open(os.path.join(OUT, 'results.json')))


def pc(x, nd=3):
    return 'n/a' if x is None else f'{x * 100:+.{nd}f}%'


print('## Scored cells\n')
print('| Cell | n rows (dates) | Estimate | 95% CI | Placebo 95th | MDE | Pass bar U | Holm p | G1 G2 G3 G4 | Cell verdict |')
print('|---|---|---|---|---|---|---|---|---|---|')
for c in r['cells']:
    g = c['gates']
    gs = ' '.join('✓' if g[k] else '✗' for k in ('G1', 'G2', 'G3', 'G4'))
    print(f"| `{c['name']}` | {c['n_rows']} ({c['n_dates']}) | {pc(c['est'])} | [{pc(c['lo'])}, {pc(c['hi'])}] | "
          f"{pc(c['placebo_p95'])} | {pc(c['mde'])} | {pc(c['U'])} | {c['p_holm']:.3f} | {gs} | **{c['verdict']}** |")

print('\n## Diagnostics per cell (descriptive)\n')
print('| Cell | Halves | Lead reading (sign share, sign) | Hit rate of the lean | Recal. slope | Base (learner) BSS | Placebo pct | Single readings |')
print('|---|---|---|---|---|---|---|---|')
for c in r['cells']:
    single = ', '.join(f'{k} {pc(v)}' for k, v in (c.get('single') or {}).items()) or '—'
    print(f"| `{c['name']}` | {pc(c['halves'][0])} / {pc(c['halves'][1])} | {c['lead_reading']} "
          f"({c['lead_sign_share']:.2f}, {c['lead_sign']:+d}) | {c['hit_rate_lean']:.3f} | {c['recal_slope']:.2f} | "
          f"{pc(c['base_bss'])} | {c['placebo_pct']:.0f} | {single} |")

if r.get('packs'):
    print('\n## Evidence packs\n')
    print('| Cell | Pack diagnosis | Plant 1x found | Placebo pct (pack) | Canary (leak) | Without top 1% |')
    print('|---|---|---|---|---|---|')
    for k, p in r['packs'].items():
        print(f"| `{k}` | {p['label']} | {p['plant_1x_detected']:.2f} | {p['placebo_pct']:.0f} | {p['canary']:+.3f} | "
              f"{pc(p['without_top1pct'])} |")

print('\n## By instrument (alone/incremental statistic per instrument)\n')
for c in r['cells']:
    print(f"- `{c['name']}`: " + ', '.join(f'{k} {pc(v)}' for k, v in c['by_inst'].items()))
print('\n## By year\n')
for c in r['cells']:
    print(f"- `{c['name']}`: " + ', '.join(f'{k} {pc(v)}' for k, v in c['by_year'].items()))
print('\nWords by input:', r['verdict_by_input'])
