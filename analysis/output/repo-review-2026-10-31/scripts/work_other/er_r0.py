import json,numpy as np,sys
d=json.load(open(sys.argv[1]))
FL={'eurusd','gbpusd','audusd','nzdusd'};KP={'usdjpy','usdcad','usdchf'}
def rows(key,dedup):
  out=[];seen=set()
  for k,f in d['families'].items():
    if f.get('ccy')!='USD':continue
    by={}
    for inst,evs in f['instruments'].items():
      if inst not in FL|KP or not isinstance(evs,list):continue
      for e in evs:
        if e.get(key) is None or not e.get('state') or e['state'].get('d2y5') is None: continue
        s=by.setdefault(e['ms'],{'z':e['z'],'d':e['state']['d2y5'],'l':[]}); s['l'].append(-e[key] if inst in FL else e[key])
    for ms,s in by.items():
      if s['z'] is None or len(s['l'])<5: continue
      if dedup and ms in seen: continue
      seen.add(ms); out.append((ms,s['z'],s['d'],np.mean(s['l']),k))
  return out
def fit(r):
  r=np.array([x[:4] for x in r],float); z=(r[:,1]-r[:,1].mean())/r[:,1].std(); dd=(r[:,2]-r[:,2].mean())/r[:,2].std()
  X=np.c_[np.ones(len(r)),z,dd,z*dd]; y=r[:,3]; b,*_=np.linalg.lstsq(X,y,rcond=None); e=y-X@b; s2=e@e/(len(y)-4); se=np.sqrt(np.diag(s2*np.linalg.inv(X.T@X)))
  return len(r),np.round(b/se,2)
for key in ('r0','r1'):
  for dd in (False,True):
    print(key,'dedup' if dd else 'as-run',fit(rows(key,dd)))
print('--- R0 dedup detail')
r=rows('r0',True); mid=1609459200000
print('h1',fit([x for x in r if x[0]<mid]),'h2',fit([x for x in r if x[0]>=mid]))
fams=sorted(set(x[4] for x in r))
for f in fams:
  s=[x for x in r if x[4]==f]
  if len(s)>20: print(f,fit(s))
# drop top 1% |r0|
a=np.array([abs(x[3]) for x in r]); c=np.quantile(a,0.98)
print('trim2%',fit([x for x in r if abs(x[3])<=c]))
# placebo: shuffle d2y
rng=np.random.default_rng(1); ts=[]
for _ in range(200):
  dd=rng.permutation([x[2] for x in r]); ts.append(fit([(x[0],x[1],dd[i],x[3]) for i,x in enumerate(r)])[1][3])
print('perm |t3|>=3.92 share',np.mean(np.abs(ts)>=3.92))
