import sys; sys.path.insert(0,'scripts/dynlead')
import numpy as np, pandas as pd, engine as E
ad, yd, S = E.load()
df = E.family_M(ad, S, cost_mult=0.0)
d, c = E.pipeline(df)
ok = df[df.n_DISC>=200]
print('GROSS (zero-cost) diagnostic, family M:', c)
for p in ('DISC','VAL','OOS'):
    x=ok[f'p_{p}']; print(p, 'share p<0.05 %.3f (null 0.05)'%(x<0.05).mean(), '| median Sharpe %.2f'%ok[f'sh_{p}'].median(), '| share Sharpe>0 %.3f'%(ok[f'sh_{p}']>0).mean(), '| min p %.2e'%x.min())
print('corr(Sharpe DISC,VAL) %.3f  (VAL,OOS) %.3f'%(ok.sh_DISC.corr(ok.sh_VAL), ok.sh_VAL.corr(ok.sh_OOS)))
d.to_parquet('analysis/output/dynlead/familyM_gross_cells.parquet')
