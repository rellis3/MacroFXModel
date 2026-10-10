"""Sensitivity (not a registered test) for IEP-TIME H4d: the extension flag under finer distance and range-used controls (FWL demeaning).
    python forge/iep_time_h4_sensitivity.py"""
import numpy as np, pandas as pd, sys
sys.path.insert(0, '.')
from forge.iep_time import load
from forge.iep_stage2 import ols_cr1
x = load(); a = x[x.test & x.h.between(7, 17) & x.U75.notna()].copy()
a["e"] = a.ohp50_done.astype(float)
q = lambda s, k: pd.qcut(s, k, labels=False, duplicates='drop').astype(str)
def eff(g):
    yd = a.U75 - a.groupby(g).U75.transform("mean"); ed = a.e - a.groupby(g).e.transform("mean")
    b, V, G = ols_cr1(yd.to_numpy(), ed.to_numpy()[:, None], a.date.to_numpy())   # FWL: same estimate as group dummies
    return f"{100*b[0]:+.2f} +/-{196*np.sqrt(V[0,0]):.2f}"
print("registered control (z10 x vleft3 x class):", eff(q(a.z_up75,10)+"_"+q(a.v_left,3)+"_"+a.cls))
print("finer (z40 x hour x class):              ", eff(q(a.z_up75,40)+"_"+a.h.astype(str)+"_"+a.cls))
print("finer + range used tercile:              ", eff(q(a.z_up75,40)+"_"+a.h.astype(str)+"_"+a.cls+"_"+q(a.used50x,3)))
print("z20 x hour x class x range used decile:  ", eff(q(a.z_up75,20)+"_"+a.h.astype(str)+"_"+a.cls+"_"+q(a.used50x,10)))
