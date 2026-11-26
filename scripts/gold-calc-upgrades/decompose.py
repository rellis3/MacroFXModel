"""gold-calc-upgrades POST-HOC descriptive (prereg A2): FRESH window lookahead audit, decomposition, concentration, top days."""
import sys, importlib.util, numpy as np, pandas as pd
R=str(__import__("pathlib").Path(__file__).resolve().parents[2]).replace("\\","/")+"/"
sp=importlib.util.spec_from_file_location("g", R+"scripts/gold-calc-upgrades/score.py"); G=importlib.util.module_from_spec(sp); sp.loader.exec_module(G)
L=G.L
for tr in ("F","C"):
    F,b=G.features(tr)
    S=pd.read_parquet(R+G.BUILD+f"/rows_{tr}.parquet")
    D=pd.DatetimeIndex(S.date)
    nxt=pd.Series(F.index,index=F.index).shift(-1)
    left=pd.DataFrame({"d":D.astype("datetime64[ns]")})
    right=pd.DataFrame({"d":pd.DatetimeIndex(F.index).astype("datetime64[ns]"),"nx":pd.to_datetime(nxt.to_numpy()).astype("datetime64[ns]")})
    mm=pd.merge_asof(left,right,on="d",allow_exact_matches=False,direction="backward")
    nd=mm.nx.to_numpy()
    bad=(pd.to_datetime(nd)!=D)
    print(tr,"sessions",len(D),"asof row's next NY day != session date:",int(bad.sum()))
    print("   examples:", [(str(D[i].date()), str(pd.Timestamp(nd[i]).date()) if pd.notna(nd[i]) else None) for i in np.flatnonzero(bad)[:8]])
    # where are the fresh bars in London clock time
    m=L.load_m1("GOLD",tr,"ratio")
    o5=m.resample("5min",label="left",closed="left").last().dropna()
    nyt=o5.index.tz_convert("America/New_York").tz_localize(None); dk=(nyt+pd.Timedelta(hours=7)).normalize()
    lt=o5.index.tz_convert("Europe/London"); pre=lt.tz_localize(None).normalize()<dk
    h=pd.Series(lt.hour[pre]).value_counts().sort_index(); print("   fresh bars by London hour:",h.to_dict())
    print("   share of NY-day RV in the fresh window (median):", float((F.fresh/F.rv).median()))

# ---- decomposition / concentration

R=str(__import__("pathlib").Path(__file__).resolve().parents[2]).replace("\\","/")+"/"
sp=importlib.util.spec_from_file_location("g", R+"scripts/gold-calc-upgrades/score.py"); G=importlib.util.module_from_spec(sp); sp.loader.exec_module(G)
orig=G.design
def design(F, iv):
    X,nxt=orig(F,iv)
    har,y,_=X["HARCJ"]; rv=F["rv"]
    y_post=np.log(F["post"]).shift(-1)
    fresh_next=np.log(np.maximum(F["fresh"].shift(-1),G.FRESH_FLOOR*rv))   # fixed floor (prereg A3)
    X["T_target_only"]=(har,y_post,"ols")
    X["T_fresh_fullY"]=(har.assign(fr=fresh_next),y,"ols")
    X["T_fresh_IV"]=(har.assign(fr=fresh_next,iv=X["N6_HARCJ_IV"][0]["iv"]),y_post,"ols")
    return X,nxt
G.design=design
G.TESTED=G.TESTED+["T_target_only","T_fresh_fullY","T_fresh_IV"]
for tr in ("F","C"):
    T,Q,masks,test,_=G.run(tr)
    base=G.daily(Q,lambda q:G.BASE[tr][q],G.JORDAN,test,len(T))
    yrs=T.year.to_numpy()[test]; wd=pd.to_datetime(T.date).dt.dayofweek.to_numpy()[test]
    rng=np.random.default_rng(1)
    for a in ["N4_FRESH","T_target_only","T_fresh_fullY","T_fresh_IV","N6_HARCJ_IV","N7_ALL"]:
        arm=G.daily(Q,lambda q:a,G.JORDAN,test,len(T))
        pt,ci,p,hv=G.boot_ratio(arm,base,yrs,rng)
        print(f"{tr} {a:14s} {pt:+6.2f}% [{ci[0]:+.2f},{ci[1]:+.2f}]")
    arm=G.daily(Q,lambda q:"N4_FRESH",G.JORDAN,test,len(T))
    print("  N4 by weekday:",{d:round((arm[wd==d].sum()/base[wd==d].sum()-1)*100,1) for d in range(5)})
    print("  N4 by year:",{int(y):round((arm[yrs==y].sum()/base[yrs==y].sum()-1)*100,1) for y in np.unique(yrs)})
    dlt=base-arm; o=np.sort(dlt)[::-1]; print("  share of total gain from top 1%/5% of days:",round(o[:len(o)//100].sum()/dlt.sum(),2),round(o[:len(o)//20].sum()/dlt.sum(),2))
    for q in G.LINES:
        v=Q[("N4_FRESH",q)][test&masks[q]]; b=Q[(G.BASE[tr][q],q)][test&masks[q]]
        print(f"   line {q}: {(np.nanmean(v)/np.nanmean(b)-1)*100:+.1f}%", end="")
    print()

print("\nTOP DAYS (F)")
T,Q,masks,test,_=G.run("F")
F,b=G.features("F")
base=G.daily(Q,lambda q:"HARCJ",G.JORDAN,test,len(T)); arm=G.daily(Q,lambda q:"N4_FRESH",G.JORDAN,test,len(T))
d=pd.to_datetime(T.date)[test].reset_index(drop=True); dl=base-arm
fr=F["fresh"]; fr_rel=(F["fresh"]/F["rv"].rolling(22).median().shift(1))
Tt=T[test].reset_index(drop=True)
for i in np.argsort(dl)[::-1][:15]:
    D=d[i]
    print(D.date(), D.day_name()[:3], f"gain {dl[i]:.2f}  base loss {base[i]:.2f}", f"HL {Tt.hl[i]:.2f}%  HARCJ sig {Tt.HARCJ[i]:.2f} FRESH sig {Tt.N4_FRESH[i]:.2f}",
          f"fresh/medianRV {fr_rel.get(D, np.nan):.2f}")
