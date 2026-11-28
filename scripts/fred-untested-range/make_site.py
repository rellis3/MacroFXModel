"""fred-untested-range: compact site.json for fred-untested-range.html from results.json (no recomputation)."""
import json, math, os
from common import OUT

R = json.load(open(os.path.join(OUT, 'results.json')))
pe = lambda x: None if x is None else round(100 * (math.exp(x) - 1), 2)
cells = [dict(u=c['unit'], t=c['tr'], g=c['target'], de=pe(c['disc']['est']), dlo=pe(c['disc']['lo']), dhi=pe(c['disc']['hi']),
              p=round(c['disc']['p'], 4), fe=pe(c['full_est']), mde=pe(c['full_mde95']), grade=c['grade'], bh=c['bh'])
         for c in R['cells']]
site = dict(meta={k: R[k] for k in ['id', 'seed', 'n_units', 'n_scorable_cells', 'bh_survivors', 'confirmed', 'family_verdict',
                                    'discovery', 'heldout', 'bh_q', 'holm_alpha']},
            prereg='forge/FRED_UNTESTED_RANGE_PREREG.md', calibration=R['calibration'],
            control=dict(plants=[dict(rep=p['rep'], disc=pe(p['disc']['est']), p=round(p['disc']['p'], 4),
                                      held=pe(p['held']['est']) if p['held'] else None, confirmed=p['confirmed']) for p in R['positive_control']['plants']],
                         fresh_noise_p05=R['positive_control']['fresh_noise_frac_p_lt_05']),
            unscorable=[dict(u=x['unit'], t=x['tr'], cd=round(x['cov_disc'], 2), ch=round(x['cov_held'], 2),
                             top=round(x.get('min_top', 0), 2), bot=round(x.get('min_bot', 0), 2)) for x in R['unscorable']],
            cells=cells)
json.dump(site, open(os.path.join(OUT, 'site.json'), 'w'), separators=(',', ':'))
print(len(cells), 'cells ->', os.path.join(OUT, 'site.json'))
