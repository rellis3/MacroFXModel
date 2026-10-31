import json, urllib.request, numpy as np, pandas as pd, sys
sys.stdout.reconfigure(encoding='utf-8')
B='https://macrofxmodel-production.up.railway.app/api/cog-chart/'
g=lambda u: json.load(urllib.request.urlopen(B+u, timeout=60))
c=g('candles?asset=NAS100&tf=15m&count=1500')['candles']
P=pd.Series({pd.Timestamp(x['t'],unit='s',tz='UTC'):x['c'] for x in c})
def leg(n):
    j=g('leg?name='+n)['m15']; return pd.Series(j['c'],index=pd.to_datetime(j['t'],unit='s',utc=True),dtype=float)
eu,us=leg('IH7'),leg('SR3U6')
idx=P.index
x=(eu.reindex(idx)-us.reindex(idx))           # page default for the chart's settings: raw prices, no carry
xe=x.ewm(span=6,adjust=False).mean()          # Pine ema, seed first value
print('candles',P.index[0],'->',P.index[-1],len(P),'| legs last',eu.index[-1],us.index[-1],'| x finite',x.notna().sum())
def corr_at(a,b,lag):                         # a shifted RIGHT by lag bars (drawn later) vs b
    s=a.shift(lag); m=s.notna()&b.notna(); return np.corrcoef(s[m],b[m])[0,1] if m.sum()>200 else np.nan
lags=range(-150,151)
lev=np.array([corr_at(xe,P,l) for l in lags]); d=np.array([corr_at(xe.diff(),P.diff(),l) for l in lags])
i=list(lags).index(107)
print('LEVEL corr at +107: %.3f | best level lag %d (%.3f) | corr at 0: %.3f'%(lev[i],list(lags)[np.nanargmax(np.abs(lev))],np.nanmax(np.abs(lev)),lev[150]))
print('CHANGE corr at +107: %+.3f | best change lag %d (%+.3f) | change corr at 0: %+.3f'%(d[i],list(lags)[np.nanargmax(np.abs(d))],d[np.nanargmax(np.abs(d))],d[150]))
print('levels: share of lags in -150..150 with |corr| >= that at +107: %.0f%%'%(np.mean(np.abs(lev)>=abs(lev[i]))*100))
# placebo: rotate the line by a random whole number of days; how often does some lag in +-150 reach |corr| as high as the real best?
rng=np.random.default_rng(3); real=np.nanmax(np.abs(lev)); n=len(xe); best=[]
for _ in range(300):
    k=int(rng.integers(96*3,n-96*3)); r=pd.Series(np.roll(xe.values,k),index=idx)
    best.append(np.nanmax([abs(corr_at(r,P,l)) for l in range(-150,151,3)]))
best=np.array(best); print('placebo (line rotated by random days): best |level corr| over lags: median %.2f, 95th %.2f; real best %.2f -> real above 95th? %s'%(np.median(best),np.percentile(best,95),real,real>np.percentile(best,95)))
print('window days:',round((P.index[-1]-P.index[0]).total_seconds()/86400,1),'| effective independent swings are few')
