"""spread-episodes: tables for RESULTS.md from results_case1.json / results_case2.json (no computation of outcomes here).
Writes analysis/output/spread-episodes/TABLES.md; RESULTS.md (verdicts) is written by hand from these tables."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import OUT

P = ('discover', 'validate', 'final')
f = lambda v, d=3: '—' if v is None else f'{v:+.{d}f}'
pc = lambda v: '—' if v is None else f'{100 * v:.0f}%'


def case_tables(c):
    R = json.load(open(os.path.join(OUT, f'results_{c}.json')))
    H = ['1h', '4h', '8h', '24h'] if c == 'case1' else ['1d', '3d', '5d', '10d', '20d']
    L = [f'## {c}', '']
    L += ['### E1 / E2: do episodes exist?', '', '| period | sessions | mean corr | overdispersion | shifted p95 | const-link p95 | persistence AC1 | shifted p95 | const-link p95 | outcome AC1 | shifted p95 | P(f|f)−P(f|not) |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for p in P:
        e, cb, e2 = R['E1'][p], R.get('E1_constbeta', {}).get(p, {}), R['E2'][p]
        L.append(f"| {p} | {e['n']} | {f(e['mean_r'])} | {e['OD']['real']:.2f} | {e['OD']['plc_p95']:.2f} | {cb.get('OD', {}).get('null_p95', float('nan')):.2f} | {f(e['AC1']['real'])} | {f(e['AC1']['plc_p95'])} | {f(cb.get('AC1', {}).get('null_p95'))} | {f(e2['AC1']['real'])} | {f(e2['AC1']['plc_p95'])} | {f(e2['dP']['real'])} |")
    L += ['', '### Primary cell and its mirror, and any validated survivors', '', '| cell | period | mean σ | t | n | P(follow) | P(revert) | control (a) | diff t | placebo 5–95% |', '|---|---|---|---|---|---|---|---|---|---|']
    for fr in R['finals']:
        nm = ('primary' + (' MIRROR (revert)' if fr.get('mirror') else '')) if fr['is_primary'] else f"{fr['series']} k{fr['k']} {fr['sign']} {fr['conf']} {fr['type']} {fr['h']}"
        for p in P:
            L.append(f"| {nm} | {p} | {f(fr[p + '_mean'])} | {f(fr[p + '_t'], 2)} | {fr[p + '_n']:.0f} | {pc(fr[p + '_p_follow'])} | {pc(fr[p + '_p_revert'])} | {f(fr[p + '_ctrl_mean'])} | {f(fr[p + '_diff_t'], 2)} | {f(fr[p + '_plc_p05'], 2)} … {f(fr[p + '_plc_p95'], 2)} |")
        L.append(f"| → gate | | final pass {fr['final_pass']}, control (a) {fr['ctrl_a_pass']}, placebo {fr['placebo_pass']} | | | | | | | |")
    L += ['', f"Grid: {R['n_cells']} cells per period; Discover BH passes {R['disc_bh']}; Discover-BH + Validate: real {R['selection']['real_sign_p']} vs placebo mean {R['selection']['placebo_mean']:.2f} (p95 {R['selection']['placebo_p95']:.1f}).", '']
    if R['survivors']:
        L += ['Discover-BH survivors:', '', '| cell | disc mean | disc t | val mean | val t | val pass |', '|---|---|---|---|---|---|']
        L += [f"| {s['series']} k{s['k']} {s['sign']} {s['conf']} {s['type']} {s['h']} | {f(s['disc_mean'])} | {f(s['disc_t'], 2)} | {f(s['val_mean'])} | {f(s['val_t'], 2)} | {s['val_pass']} |" for s in R['survivors']]
        L.append('')
    L += ['### Episode type × horizon (k 0.75, adaptive, C0)', '']
    for p in P:
        L += [f'**{p}**', '', '| type | ' + ' | '.join(H) + ' |', '|---|' + '---|' * len(H)]
        for ty in ('all', 'up', 'down', 'toward_mean', 'away_mean', 'with_trend', 'against_trend', 'prior_aligned', 'prior_diverged'):
            cells = []
            for h in H:
                r = next((x for x in R['type_table'] if x['type'] == ty and x['h'] == h and x['period'] == p), None)
                cells.append('—' if not r or r['mean'] is None else f"{r['mean']:+.3f} ({r['t']:+.1f}) f{100 * r['p_follow']:.0f}/r{100 * r['p_revert']:.0f} n{r['n']}")
            L.append(f'| {ty} | ' + ' | '.join(cells) + ' |')
        L.append('')
    L += ['### Confirmation (the sequence)', '', '| conf | period | ' + ' | '.join(H) + ' |', '|---|---|' + '---|' * len(H)]
    for cf in ('C0', 'C1', 'C2'):
        for p in P:
            L.append(f'| {cf} | {p} | ' + ' | '.join(next((f"{x['mean']:+.3f} ({x['t']:+.1f}) n{x['n']}" for x in R['conf_table'] if x['conf'] == cf and x['h'] == h and x['period'] == p and x['mean'] is not None), '—') for h in H) + ' |')
    L += ['', '### Conditions (primary spec)', '', '| condition | h | discover | validate | final | BH | val pass |', '|---|---|---|---|---|---|---|']
    rows = R['conditions']['rows']; keys = []
    for r in rows:
        k = (r['cond'], r['h'])
        if k not in keys: keys.append(k)
    for cd, h in keys:
        g = {r['period']: r for r in rows if r['cond'] == cd and r['h'] == h}
        L.append(f"| {cd} | {h} | " + ' | '.join('—' if g[p]['mean'] is None else f"{g[p]['mean']:+.3f} ({g[p]['t']:+.1f}, {g[p]['n']})" for p in P) + f" | {g['discover'].get('bh')} | {g['discover'].get('val_pass')} |")
    L += ['', 'Q2 (recognisable): top coupling tercile and C2 minus all events, primary horizon:', '']
    for k, v in R['conditions']['q2'].items():
        L.append(f"- {k}: {f(v['diff'])} (t {f(v['t'], 2)}, n {v['n']})")
    L += ['', '### Timing: first to ±1σ', '', '| period | spread turns: n / follow first / revert first / median | price-only turns |', '|---|---|---|']
    for p in P:
        a, b = R['race'][p]['spread'], R['race'][p]['price_only']
        L.append(f"| {p} | {a['n']} / {pc(a['p_follow_first'])} / {pc(a['p_revert_first'])} / {a['median_bars']} | {b['n']} / {pc(b['p_follow_first'])} / {pc(b['p_revert_first'])} / {b['median_bars']} |")
    L += ['', '### Price-only controls', '', '(c1) price follows its own confirmed turn (k 0.75):', '', '| period | ' + ' | '.join(H) + ' |', '|---|' + '---|' * len(H)]
    for p in P:
        L.append(f'| {p} | ' + ' | '.join(next((f"{x['mean']:+.3f} ({x['t']:+.1f})" for x in R['price_only_c1'] if x['k'] == 0.75 and x['h'] == h and x['period'] == p and x['mean'] is not None), '—') for h in H) + ' |')
    L += ['', '(c2) IC gain from adding the spread to the price-only model:', '', '| h | period | IC price | IC + spread | gain | 95% |', '|---|---|---|---|---|---|']
    for h, v in R['price_only_c2'].items():
        for p in ('validate', 'final'):
            if p in v:
                L.append(f"| {h} | {p} | {f(v[p]['ic_price'])} | {f(v[p]['ic_with_spread'])} | {f(v[p]['d_ic'])} | {f(v[p]['d_ic_lo'])} … {f(v[p]['d_ic_hi'])} |")
    L += ['', '### By year (primary cell)', '', '| year | mean σ | t | n | follow |', '|---|---|---|---|---|']
    L += [f"| {r['key']} | {f(r['mean'])} | {f(r['t'], 2)} | {r['n']} | {pc(r['p_follow'])} |" for r in R['by_year'] if r['kind'] == 'year']
    L += ['', f"Same-bar link (positive control, corr of changes): " + ', '.join(f"{p} {R['same_bar'][p]:+.3f}" for p in P)]
    if 'entry_plus1' in R:
        L.append('Entry one bar later (primary, 4h): ' + ', '.join(f"{p} {f(R['entry_plus1'][p]['mean'])} (t {f(R['entry_plus1'][p]['t'], 2)})" for p in P))
    return L


if __name__ == '__main__':
    L = ['# spread-episodes: full tables', '', 'Generated by scripts/spread-episodes/report.py from results_case*.json.', '']
    for c in ('case1', 'case2'):
        if os.path.exists(os.path.join(OUT, f'results_{c}.json')):
            L += case_tables(c) + ['']
    open(os.path.join(OUT, 'TABLES.md'), 'w', encoding='utf-8').write('\n'.join(L))
    print('written', len(L), 'lines')
