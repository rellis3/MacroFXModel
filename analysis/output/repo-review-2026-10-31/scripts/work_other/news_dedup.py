import sys,importlib.util
sys.path.insert(0,'analysis')
spec=importlib.util.spec_from_file_location('na','analysis/news_asymmetry_study.py');na=importlib.util.module_from_spec(spec);spec.loader.exec_module(na)
rows,_=na.load()
from collections import Counter
c=Counter(r['ms'] for r in rows); print('rows',len(rows),'unique ms',len(c),'ms with >1 family',sum(v>1 for v in c.values()))
print('as-run',na.delta_fit(rows)['delta'],na.delta_fit(rows)['t'])
# drop unemployment & wage rows sharing ms with payroll
pay={r['ms'] for r in rows if r['fam']==1}
d1=[r for r in rows if not (r['fam'] in (2,3) and r['ms'] in pay)]
f=na.delta_fit(d1); print('payroll-only on NFP days n',f['n'],f['delta'],f['ci95'],f['t'])
# conflicting signs share
by={}
for r in rows:
  if r['ms'] in pay: by.setdefault(r['ms'],[]).append(r['z'])
conf=sum(1 for v in by.values() if any(x>0 for x in v) and any(x<0 for x in v)); print('NFP days with conflicting surprise signs',conf,'of',len(by))
