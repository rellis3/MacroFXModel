import pandas as pd,numpy as np
g=pd.read_parquet('oi_research_book/data/gamma_iv_nas100_usd.parquet'); g['date']=pd.to_datetime(g['date'])
s=pd.read_parquet('oi_research_book/data/gex_range_es/nas100_nyclose_d1.parquet').sort_index(); s.index=pd.to_datetime(s.index).tz_localize(None)
s=s[s.index<='2026-08-21']; print(s.columns.tolist()[:10], len(s), s.index[:3].tolist())
s['lr']=np.log(np.log(s.high/s.low))
s['ret']=np.log(s.close/s.close.shift(1)); s['sig']=s.ret.rolling(20).std()
pos=s.index.get_indexer(g.date)
for lag in (1,2):
  ok=(pos>=0)&(pos+lag<len(s))
  y=s.lr.values[pos[ok]+lag]; sig=np.log(s.sig.values[pos[ok]+lag-1]); neg=1-g.regime_pos.values[ok]
  m=np.isfinite(y)&np.isfinite(neg)&np.isfinite(sig)
  X=np.c_[np.ones(m.sum()),neg[m]]; b=np.linalg.lstsq(X,y[m],rcond=None)[0]
  X2=np.c_[np.ones(m.sum()),neg[m],sig[m]]; b2,res,*_=np.linalg.lstsq(X2,y[m],rcond=None); e=y[m]-X2@b2
  se=np.sqrt(e@e/(m.sum()-3)*np.linalg.inv(X2.T@X2)[1,1])
  print('lag',lag,'n',m.sum(),'raw diff',round(b[1],3),'vol-ctrl diff',round(b2[1],3),'t~',round(b2[1]/se,2))
  ng=g.net_gex.values[ok][m]<0
  X3=np.c_[np.ones(m.sum()),ng,sig[m]]; b3=np.linalg.lstsq(X3,y[m],rcond=None)[0]; e3=y[m]-X3@b3; se3=np.sqrt(e3@e3/(m.sum()-3)*np.linalg.inv(X3.T@X3)[1,1])
  print('   net_gex<0 vol-ctrl diff',round(b3[1],3),'t~',round(b3[1]/se3,2))
