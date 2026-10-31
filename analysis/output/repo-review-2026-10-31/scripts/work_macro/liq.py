# Compare the macro-confluence liquidity leg AS CODED (analysis/macro_confluence_*_study.mjs:
# daily-indexed, z of 1-day change vs trailing 24 DAILY changes) with AS REGISTERED
# (prereg: z of latest WEEKLY change vs trailing 24-period baseline, liquidityGateEngine convention).
import pandas as pd, numpy as np
r=lambda s: pd.read_csv(f'fred/{s}.csv',parse_dates=[0]).set_index('observation_date').iloc[:,0].pipe(pd.to_numeric,errors='coerce').dropna()
w,t,rr=r('WALCL'),r('WTREGEN'),r('RRPONTSYD')
days=pd.bdate_range('2009-01-01','2026-10-02')
def asof(s): s=s.copy(); s.index=s.index+pd.Timedelta(days=1); return s.reindex(s.index.union(days)).ffill().reindex(days)
nl=asof(w)/1000-asof(t)/1000-asof(rr)
ch=nl.diff()
def z_daily(i):
    if i<25: return np.nan
    base=ch.iloc[max(0,i-24):i].dropna()
    if len(base)<6: return np.nan
    sd=base.std(ddof=0)
    return np.nan if sd<1e-9 else (ch.iloc[i]-base.mean())/sd
zd=pd.Series([z_daily(i) for i in range(len(ch))],index=days)
dirD=np.sign(zd).where(zd.abs()>=0.3,0)
# registered: weekly series on WALCL dates
wk=(w/1000 - t.reindex(w.index,method='ffill')/1000 - rr.reindex(rr.index.union(w.index)).ffill().reindex(w.index)).dropna()
wch=wk.diff(); zw=(wch-wch.shift(1).rolling(24).mean())/wch.shift(1).rolling(24).std(ddof=0)
zw.index=zw.index+pd.Timedelta(days=1)
dirW=np.sign(zw).where(zw.abs()>=0.3,0).reindex(zw.index.union(days)).ffill().reindex(days)
m=pd.concat([dirD,dirW],axis=1,keys=['coded','registered']).dropna()
print('days',len(m)); print('share nonzero coded',(m.coded!=0).mean().round(3),'registered',(m.registered!=0).mean().round(3))
nz=m[(m.coded!=0)&(m.registered!=0)]
print('agreement when both nonzero',(nz.coded==nz.registered).mean().round(3),'n',len(nz))
print('exact agreement incl flat',(m.coded==m.registered).mean().round(3))
for per,(a,b) in {'2009-12':('2009','2012'),'2013-20':('2013','2020'),'2021-26':('2021','2026')}.items():
    s=m.loc[a:b]; print(per,'coded nonzero',(s.coded!=0).mean().round(2),'agree',(s.coded==s.registered).mean().round(2),
      'coded day-to-day sign flips/yr', int(((s.coded.diff()!=0)).sum()/ (len(s)/252)))
