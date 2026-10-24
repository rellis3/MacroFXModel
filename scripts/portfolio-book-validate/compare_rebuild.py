"""T9 (forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md): compare the independent rebuild's raw sleeve streams with the
parent's (analysis/output/portfolio-book/book.json, weekend-folded). Bar: corr >= 0.95 per sleeve, 2014-01..2026-08."""
import json, sys
import pandas as pd
B = json.load(open('analysis/output/portfolio-book/book.json', encoding='utf-8'))
orig = pd.DataFrame({s['id']: [sum(l['c'][t] for l in s['legs']) / 1e8 for t in range(len(B['dates']))] for s in B['sleeves']}, index=pd.to_datetime(B['dates']))
reb = pd.read_csv('analysis/output/portfolio-book-validate/rebuild/sleeves_raw.csv', parse_dates=['date']).set_index('date')
out = {}
for sid in ['S1g', 'S2', 'S3g', 'S4', 'S5g']:
    j = pd.concat([orig[sid].rename('o'), reb[sid].rename('r')], axis=1).fillna(0.0)
    row = {}
    for name, lo in [('full', '2008-01-02'), ('2014+', '2014-01-01')]:
        x = j[j.index >= lo]
        live = x[(x.o != 0) | (x.r != 0)]
        sr = lambda v: float(v.mean() / v.std() * 252 ** 0.5) if v.std() > 0 else None
        row[name] = {'corr': round(float(live.o.corr(live.r)), 4), 'days': int(len(live)), 'sr_orig': round(sr(x.o), 3), 'sr_rebuild': round(sr(x.r), 3),
                     'mean_abs_diff_bp': round(float((x.o - x.r).abs().mean() * 1e4), 3), 'only_orig_nonzero': int(((x.o != 0) & (x.r == 0)).sum()), 'only_rebuild_nonzero': int(((x.r != 0) & (x.o == 0)).sum())}
    row['pass'] = row['2014+']['corr'] >= 0.95
    out[sid] = row
json.dump(out, open('analysis/output/portfolio-book-validate/t9_rebuild_compare.json', 'w'), indent=1)
for k, v in out.items(): print(k, 'PASS' if v['pass'] else 'FAIL', v['full'], v['2014+'])
