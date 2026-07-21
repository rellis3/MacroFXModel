"""
Tier 6 — widen the evidence with the data we DO have (VolRangeForecaster/data/m1:
25 FX crosses + gold). Two things:

  A. GOLD conviction-gating — the closest available non-FX, drift-bearing asset (a
     partial proxy for the equity-index test we can't run). Does state-gating the
     trend edge help on gold as it did on NQ? (n is still tiny — 1 commodity — but
     it is a second non-FX data point on 'works where trend exists'.)
  B. 25-pair Asia-compression — re-run the Tier 2 expansion test across ALL FX crosses
     (not just the 6 majors) for a much stronger cross-section: does compressed Asia
     predict a bigger London+ move out-of-sample across the whole FX complex?

NOTE ON SCOPE: gold is NOT an equity index. The real MOP-style test (SPX/DAX/FTSE/
Nikkei/HSI) needs index M1 this sandbox lacks + OANDA (403 here). This is the honest
maximum with the available data, labelled as such.
"""
import os
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma_kind
from budget_research_lib import (momentum_signal, rolling_vol, sharpe, efficiency,
                                 VOL_TARGET, MAX_LEV, COST_BP, BM_P75)

M1DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'VolRangeForecaster', 'data', 'm1')
HL75_CORR = {'fx': 0.817, 'index': 0.967, 'commodity': 0.914}
TRAIN_FRAC = 0.60
T_MIN = 480
EFF_CHAOS = 0.35
FX_CROSSES = ['audcad','audchf','audjpy','audnzd','audusd','cadjpy','chfjpy','euraud',
              'eurcad','eurchf','eurgbp','eurjpy','eurnzd','eurusd','gbpaud','gbpcad',
              'gbpchf','gbpjpy','gbpnzd','gbpusd','nzdjpy','nzdusd','usdcad','usdchf','usdjpy']


def build(pair, asset):
    m1 = load_m1(os.path.join(M1DIR, f'{pair}_m1.parquet'))
    d = build_london_daily(m1)
    sig = causal_sigma_kind(d, 'hv' if asset == 'commodity' else 'yz')
    c = d['close']; rets = np.zeros(c.size); rets[1:] = np.where(c[:-1] > 0, (c[1:]-c[:-1])/c[:-1], 0)
    return dict(pair=pair, asset=asset, m1=m1, daily=d, open=d['open'], high=d['high'],
                low=d['low'], close=c, sigma=sig, rets=rets)


def strat_ret(dd, pos):
    rets = dd['rets']; n = rets.size; pos = np.nan_to_num(pos); dr = np.zeros(n)
    for i in range(1, n):
        dr[i] = pos[i-1]*rets[i] - (COST_BP/1e4)*abs(pos[i-1] - (pos[i-2] if i >= 2 else 0))
    return dr


def base_pos(dd):
    c = dd['close']; s = momentum_signal(c); vol = rolling_vol(dd['rets'])
    pos = np.zeros(c.size)
    for i in range(c.size):
        v = vol[i]
        if v and np.isfinite(v) and v > 0:
            pos[i] = np.clip(s[i]*(VOL_TARGET/v), -MAX_LEV, MAX_LEV)
    return pos


def gold_gating():
    print('=== A. GOLD conviction-gating (2nd non-FX, drift-bearing asset) ===')
    dd = build('gold', 'commodity')
    o,h,l,c,sig = dd['open'],dd['high'],dd['low'],dd['close'],dd['sigma']
    n = c.size; hl75 = BM_P75*HL75_CORR['commodity']
    er = efficiency(o,h,l,c)
    rhl = np.full(n,np.nan); ok=(sig>0)&(o>0); rhl[ok]=(h[ok]-l[ok])/o[ok]/sig[ok]
    exc = (rhl>hl75).astype(float)
    eff_prev=np.full(n,np.nan); eff_prev[1:]=er[:-1]
    exc_prev=np.full(n,np.nan); exc_prev[1:]=exc[:-1]
    pos = base_pos(dd)
    chaos = (exc_prev==1)|(eff_prev<EFF_CHAOS)
    gate = np.where(chaos,0.5,1.0)
    base = strat_ret(dd,pos); gated = strat_ret(dd,pos*gate)
    ntr=int(n*TRAIN_FRAC)
    print(f'  full Sharpe {sharpe(base):+.2f}  (validates gold trends)')
    print(f'  base  OOS Sharpe {sharpe(base[ntr:]):+.2f}')
    print(f'  gated OOS Sharpe {sharpe(gated[ntr:]):+.2f}')
    sg=np.sign(pos); al=np.zeros(n); al[1:]=sg[:-1]*dd['rets'][1:]
    sc=[al[i] for i in range(2,ntr) if np.isfinite(eff_prev[i]) and chaos[i]]
    ca=[al[i] for i in range(2,ntr) if np.isfinite(eff_prev[i]) and not chaos[i]]
    print(f'  IS edge  calm {np.mean(ca)*1e4:+.2f}bp (n={len(ca)}) vs spent/chaotic {np.mean(sc)*1e4:+.2f}bp (n={len(sc)})')
    print(f'  --> gating {"helps" if sharpe(gated[ntr:])>sharpe(base[ntr:]) else "does not help"} on gold'
          f' (echoes NQ? {"yes" if sharpe(gated[ntr:])>sharpe(base[ntr:]) else "no"})')


def asia_compression_all():
    print('\n=== B. Asia-compression -> London+ expansion across 25 FX crosses (OOS) ===')
    n_hold = 0; n_run = 0; deltas = []
    for pair in FX_CROSSES:
        try:
            dd = build(pair, 'fx')
        except Exception as e:
            print(f'  {pair}: skip ({e})'); continue
        d=dd['daily']; m1=dd['m1']; sig=dd['sigma']; mod=d['min_of_day_all']
        nd=d['open'].size; asia=np.full(nd,np.nan); ext=np.full(nd,np.nan)
        for i in range(nd):
            s=sig[i]; O=d['open'][i]
            if not (s>0 and O>0): continue
            a,b=d['start'][i],d['end'][i]
            hi=m1['high'][a:b]; lo=m1['low'][a:b]; mm=mod[a:b]
            pre=mm<T_MIN; post=mm>=T_MIN
            if pre.sum()<60 or post.sum()<120: continue
            hlT=hi[pre].max()-lo[pre].min()
            asia[i]=hlT/O/s; ext[i]=(hi.max()-lo.min()-hlT)/O/s
        compr=np.full(nd,np.nan); hist=[]
        for i in range(nd):
            if np.isfinite(asia[i]):
                if len(hist)>=30:
                    m=np.median(hist[-120:]);  compr[i]=asia[i]/m if m>0 else np.nan
                hist.append(asia[i])
        v=np.isfinite(compr)&np.isfinite(ext); idx=np.where(v)[0]; ntr=int(nd*TRAIN_FRAC)
        oos=idx[idx>=ntr]
        if oos.size<200: continue
        cc=compr[oos]; ee=ext[oos]; loq,hiq=np.quantile(cc,[0.33,0.66])
        co=ee[cc<=loq].mean(); so=ee[cc>=hiq].mean()
        hold=co>so; n_hold+=hold; n_run+=1; deltas.append(co-so)
        print(f'  {pair}: compressed {co:.3f} vs stretched {so:.3f}  {"HOLDS" if hold else "no"}')
    print(f'\n  compressed-extends-more holds OOS on {n_hold}/{n_run} FX crosses  '
          f'(mean Δ {np.mean(deltas):+.3f}σ)')
    print(f'  --> {"PASS (broad cross-section)" if n_hold/max(n_run,1)>=0.66 else "mixed"}')


if __name__ == '__main__':
    gold_gating()
    asia_compression_all()
