# Re-check of analysis/yield_asset_coupling.py forward cells: original (lag 1, UTC-date Yahoo FX)
# vs lag 0 for assets whose close is after the 15:30 ET yield print, and FX dates fixed per season.
import pandas as pd, numpy as np
D='/home/user/MacroFXModel/analysis/output/yield_coupling/'
y=pd.read_csv(D+'yields.csv',index_col=0,parse_dates=True); y=y[y.index<='2026-08-21']
def px(n,fix=False):
    s=pd.read_csv(D+'px_%s.csv'%n,index_col=0,parse_dates=True)['close'].sort_index()
    if fix:
        # winter stamps (00:00 UTC) carry the previous day's close; summer stamps (23:00 UTC) are that UTC date
        idx=s.index.tz_localize('UTC')+pd.Timedelta(hours=12)
        bst=np.array([bool(t.tz_convert('Europe/London').dst()) for t in idx])
        newi=s.index.where(bst, s.index-pd.Timedelta(days=1))
        s=pd.Series(s.values,index=newi); s=s[~s.index.duplicated(keep='last')].sort_index()
    return s
def rz(a): r=pd.Series(a).rank().to_numpy(); r=r-r.mean(); return r/r.std()
def nw(x,yv,lag):
    n=len(x);X=np.column_stack([np.ones(n),x]);xi=np.linalg.pinv(X.T@X);b=xi@X.T@yv;e=yv-X@b;Xe=X*e[:,None];S=Xe.T@Xe
    for L in range(1,max(lag,1)+1):
        w=1-L/(max(lag,1)+1);A=Xe[L:].T@Xe[:-L];S+=w*(A+A.T)
    V=xi@S@xi;return b[1]/np.sqrt(V[1,1])
def cell(s,drv,k,h,lag):
    yy=y.reindex(s.index.union(y.index)).sort_index().ffill(limit=4).reindex(s.index)
    lp=np.log(s); dy=yy[drv].diff(k).shift(lag); fwd=lp.shift(-h)-lp
    m=pd.concat([dy,fwd],axis=1).dropna(); x,v=m.iloc[:,0].to_numpy(),m.iloc[:,1].to_numpy()
    return len(m), float(rz(x)@rz(v)/len(x)), nw(x,v,h)
for n,fx in [('EURUSD',1),('USDJPY',1),('GBPUSD',1),('AUDUSD',1),('SPX',0),('NDX',0)]:
    for drv in ['y2','y10','real10']:
        a=cell(px(n),drv,1,1,1); b=cell(px(n,fix=bool(fx)),drv,1,1,1); c=cell(px(n,fix=bool(fx)),drv,1,1,0)
        print(f"{n:7s}{drv:7s} orig lag1 IC {a[1]:+.4f} t {a[2]:+.2f} | fixedFX lag1 IC {b[1]:+.4f} t {b[2]:+.2f} | fixedFX lag0 IC {c[1]:+.4f} t {c[2]:+.2f} n {c[0]}")
# contemporaneous sanity: same-day coupling with original vs fixed FX dates
for n in ['EURUSD','USDJPY']:
    for f in [False,True]:
        s=px(n,f); yy=y.reindex(s.index.union(y.index)).sort_index().ffill(limit=4).reindex(s.index)
        m=pd.concat([yy['y2'].diff(),np.log(s).diff()],axis=1).dropna()
        print(n,'fixed' if f else 'orig','same-day IC(dy2,ret)',round(float(rz(m.iloc[:,0].values)@rz(m.iloc[:,1].values)/len(m)),3))
