import json, urllib.request, numpy as np, pandas as pd, sys
sys.stdout.reconfigure(encoding='utf-8')
B='https://macrofxmodel-production.up.railway.app/api/cog-chart/'
g=lambda u: json.load(urllib.request.urlopen(B+u, timeout=60))
c=g('candles?asset=NAS100&tf=15m&count=1500')['candles']
P=pd.Series({pd.Timestamp(x['t'],unit='s',tz='UTC'):x['c'] for x in c})
def leg(n):
    j=g('leg?name='+n)['m15']; return pd.Series(j['c'],index=pd.to_datetime(j['t'],unit='s',utc=True),dtype=float)
eu,us=leg('IH7'),leg('SR3U6'); idx=P.index
X=(eu.reindex(idx)-us.reindex(idx)).ffill().ewm(span=6,adjust=False).mean().values   # page settings: raw prices, EMA 6
p=P.values; n=len(p)
W=48; CW=16; LAGS=range(2,193); HS=[2,4,8,16,32]
def fit(t):
    """best lead l (bars) such that the line shifted forward by l matches price over the last W bars"""
    best=None
    for l in LAGS:
        if t-W+1-l<0: break
        a=p[t-W+1:t+1]; b=X[t-W+1-l:t+1-l]
        if np.std(a)==0 or np.std(b)==0: continue
        r=np.corrcoef(a,b)[0,1]
        if best is None or abs(r)>abs(best[1]): best=(l,r)
    if best is None: return None
    l,r=best
    a=p[t-CW+1:t+1]; b=X[t-CW+1-l:t+1-l]; rc=np.corrcoef(a,b)[0,1] if np.std(a)>0 and np.std(b)>0 else np.nan
    return l,r,rc
def project(t,l,r,h):
    if h>l: return np.nan
    return np.sign(r)*(X[t+h-l]-X[t-l])                      # price move over next h bars implied by the shifted line
t0=idx.get_indexer([pd.Timestamp('2026-10-23 12:00',tz='UTC')],method='pad')[0]
print('decision bar',idx[t0],'price',p[t0])
f=fit(t0); print('best lead %d bars (%.2f h), match corr %+.2f, recent-16-bar confirm corr %+.2f'%(f[0],f[0]/4,f[1],f[2]))
for h in HS:
    pr=project(t0,f[0],f[1],h); real=p[t0+h]-p[t0] if t0+h<n else np.nan
    print(f'  next {h/4:>4.1f}h: line implies {"UP" if pr>0 else "DOWN"} ({pr:+.4f}) | realised {real:+.1f} pts' if np.isfinite(pr) else f'  next {h/4:.1f}h: n/a')
print('last candle',idx[-1],p[-1],'-> move since decision',round(p[-1]-p[t0],1))
# the same fit over every hour in the window: how often does it call, and how often right?
rows=[]
for t in range(300,n-32):
    if idx[t].minute!=0 or idx[t].weekday()>=5: continue
    f=fit(t)
    if f is None: continue
    l,r,rc=f
    for h in HS:
        pr=project(t,l,r,h)
        if np.isfinite(pr) and pr!=0: rows.append(dict(t=idx[t],h=h,l=l,r=r,rc=rc,pred=np.sign(pr),real=np.sign(p[t+h]-p[t]),strong=(abs(r)>=0.8 and np.sign(rc)==np.sign(r) and abs(rc)>=0.5)))
R=pd.DataFrame(rows)
print('\nall decisions in the 22-day window:',R.t.nunique(),'hours')
for name,s in (('every call',R),('strong match + confirm',R[R.strong])):
    print(name)
    for h in HS:
        q=s[s.h==h]
        if len(q)>5: print(f'   {h/4:>4.1f}h  n={len(q):4d}  sign right {np.mean(q.pred==q.real)*100:5.1f}%  (share of up moves {np.mean(q.real>0)*100:4.1f}%)')
print('median fitted lead (bars):',R.l.median(),'| share of decisions where fitted lead is >=96 bars:',round((R.drop_duplicates("t").l>=96).mean(),2))
