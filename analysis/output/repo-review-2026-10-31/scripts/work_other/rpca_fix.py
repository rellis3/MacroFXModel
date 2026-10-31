import sys,os,numpy as np,importlib.util
sys.path.insert(0,'scripts/residual-pca-family'); sys.path.insert(0,'.')
spec=importlib.util.spec_from_file_location('rf','scripts/residual-pca-family/run_family.py'); rf=importlib.util.module_from_spec(spec); spec.loader.exec_module(rf)
T=rf.T
F=rf.run_universe("fx8",1); idx=F["disp"].index
cr0=T.crowd_tags(idx); sg=np.sign(F["disp"])
for lab,cr in (('as-run',cr0),('fixed',cr0.assign(**{c:-cr0[c] for c in ('JPY','CAD','CHF')}))):
  valid3=cr.notna().all(axis=1); A3=(cr!=0)&cr.notna()&(sg==cr); B3=cr==0; M3=(cr!=0)&cr.notna()&(sg==-cr)
  res,_=rf.contrast_test(lab,F,A3,B3,valid3,mirror=M3)
  print(lab,{k:res[k] for k in ('nA','D_full','se_full','z_full','D_IS','D_OOS','mean_s_mirror')})
  print('  per',{k:v['D'] for k,v in res['per_instrument'].items()})
