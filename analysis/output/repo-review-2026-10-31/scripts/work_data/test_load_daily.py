import sys; sys.path.insert(0,'/home/user/MacroFXModel')
import numpy as np, pandas as pd
import forge.vol as V
def synth(a,b):
    idx=pd.date_range(a,b,freq='1min',tz='UTC',inclusive='left')
    ny=idx.tz_convert('America/New_York')
    dow=ny.dayofweek; h=ny.hour  # Mon=0..Sun=6
    openm=~((dow==5)|((dow==6)&(h<17))|((dow==4)&(h>=17)))
    idx=idx[openm]; n=len(idx); o=1+np.arange(n)*1e-7
    return pd.DataFrame({'open':o,'high':o+1e-5,'low':o-1e-5,'close':o,'volume':1},index=idx)
for a,b in [('2026-03-01','2026-04-06'),('2026-10-18','2026-11-10')]:
    m1=synth(a,b); V.load_m1=lambda pair,root=None,_m=m1:_m
    d=V.load_daily('x',session='london22')
    d['ldate']=(d.index.tz_localize('UTC').tz_convert('Europe/London')).date
    cnt=m1.tz_convert('Europe/London'); cnt=cnt[cnt.index.hour<22].groupby(cnt[cnt.index.hour<22].index.normalize()).size()
    print(f'== {a}..{b} london22: rows',len(d))
    for ix,r in d.iterrows():
        ld=pd.Timestamp(r.ldate); n=int(cnt.get(pd.Timestamp(r.ldate,tz='Europe/London'),0))
        if ld.dayofweek>=5 or n!=1320: print('  idx(naiveUTC)',ix,'londonDate',r.ldate,ld.day_name(),'bars',n, 'HL%%=%.4f'%((r.high-r.low)/r.open*100))
    # exact-date join trap: naive index .normalize() vs London date
    bad=(d.index.normalize().date!=d.ldate).sum(); print('  rows whose naive-UTC index date != London date:',bad,'of',len(d))
    # end= truncation stub
    d2=V.load_daily('x',session='london22',end=b[:8]+'05' if a.startswith('2026-03') else '2026-10-22')
    print('  end= last row', d2.index[-1], 'bars-in-last approx', )
