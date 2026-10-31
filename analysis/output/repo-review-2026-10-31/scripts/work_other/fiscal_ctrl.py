import json,sys,pandas as pd
sys.path.insert(0,'.')
from forge.ff_calendar import load_repaired
cal=load_repaired(); cal=cal[(cal.Currency=='USD')&(cal.impact=='high')]
cal['hm']=pd.to_datetime(cal.t_utc).dt.tz_convert('America/New_York').dt.strftime('%H:%M')
hi=set(cal[cal.hm.isin(['08:30','08:31'])].date)
r=json.load(open('backfill/fiscal_history.json'))
ev=[e for e in r['events'] if e['country']=='US' and e['scored']]
import datetime as dt
tot=0;hit=0;evhit=0
for e in ev:
  d=dt.date.fromisoformat(e['date'])
  if e['date']>'2025-04-07': continue
  evhit+= e['date'] in hi
  for w in range(1,9):
    c=(d-dt.timedelta(days=7*w)).isoformat(); tot+=1; hit+= c in hi
print('US events checked',sum(1 for e in ev if e['date']<='2025-04-07'),'events w/ high 08:30 US release',evhit,'controls',tot,'controls w/ high-impact 08:30 release',hit, round(hit/tot,2))
