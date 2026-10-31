import sys; sys.path.insert(0,'/home/user/MacroFXModel')
import numpy as np, pandas as pd
import forge.vol as V
exec(open('test_load_daily.py').read().split('for a,b in')[0])  # reuse synth()
m1=synth('2026-01-05','2026-08-01'); V.load_m1=lambda pair,root=None:m1
d=V.load_daily('x',session='london22')
tags={'2026-02-06':'NFP','2026-07-03':'NFP','2026-06-17':'FOMC','2026-01-28':'FOMC'}
f=V.build_forecast_frame(d,event_tags={'tags':tags,'covered':('2026-01-01','2026-08-01')})
f['london_date']=pd.DatetimeIndex(f['date']).tz_localize('UTC').tz_convert('Europe/London').strftime('%Y-%m-%d')
print(f[f.event_tag!='none'][['date','london_date','event_tag']].to_string())
print('rows tagged on wrong London date:', int(sum(1 for _,r in f[f.event_tag!='none'].iterrows() if tags.get(r.london_date)!=r.event_tag)))
