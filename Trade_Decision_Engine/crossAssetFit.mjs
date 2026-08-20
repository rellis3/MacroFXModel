// Trade Decision Engine — cross-asset direction experiment (macro regime + USD trend).
// Builds a CAUSAL macro context from the M1 cache (no FRED): risk regime from NQ (20d),
// per-pair riskSens = -corr(pair,NQ) (60d) -> activates the engine's macro_align; plus a
// leave-one-out synthetic USD trend (10d, other majors) -> new candidate usd_trend_align.
// Backfills the 6 FX majors, adds the feature, and A/B-fits vs the v0 set. Run offline:
//   R2_ACCESS_KEY= R2_SECRET_KEY= node Trade_Decision_Engine/crossAssetFit.mjs
// Result (110,883 events): usd_trend_align agree 58.4% vs oppose 52.8% (~50k each), fitted
// weight +0.094, OOS Brier 0.2469->0.2458 — the first feature to discriminate DIRECTION.

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { backfillPair, fitLogistic, deriveD1Packed } from './backfill.js';
import { MODEL_V0 } from './modelV0.js';

const FX = ['eurusd','gbpusd','audusd','nzdusd','usdcad','usdchf'];
const USD_BASE = { eurusd:-1, gbpusd:-1, audusd:-1, nzdusd:-1, usdcad:+1, usdchf:+1 }; // +1: USD is base
const cacheDir = new URL('../portfolioBacktest/cache', import.meta.url).pathname;
const D = (t)=> new Date(t*1000).toISOString().slice(0,10);

function dailySeries(packed){ // date -> close (London day)
  const m = new Map(); for (const b of deriveD1Packed(packed)) m.set(D(b.time), b.close); return m;
}
const packedFX={}, dcFX={};
for (const p of FX){ packedFX[p]=await loadM1ForPair(p,cacheDir); dcFX[p]=dailySeries(packedFX[p]); console.error('loaded',p); }
const nqDaily = dailySeries(await loadM1ForPair('nq',cacheDir)); console.error('loaded nq');

// union of dates (sorted)
const dates=[...new Set([...FX.flatMap(p=>[...dcFX[p].keys()]),...nqDaily.keys()])].sort();
const lr=(a,b)=> (a>0&&b>0)? Math.log(b/a):0;
// per-date log returns
const nqRet=new Map(), fxRet={}; FX.forEach(p=>fxRet[p]=new Map());
for(let i=1;i<dates.length;i++){ const d=dates[i],pd=dates[i-1];
  if(nqDaily.has(d)&&nqDaily.has(pd)) nqRet.set(d,lr(nqDaily.get(pd),nqDaily.get(d)));
  for(const p of FX) if(dcFX[p].has(d)&&dcFX[p].has(pd)) fxRet[p].set(d,lr(dcFX[p].get(pd),dcFX[p].get(d)));
}
// CAUSAL trailing helpers ending at PRIOR date (strictly before d)
function trail(map, dIdx, win){ const out=[]; for(let k=Math.max(1,dIdx-win);k<dIdx;k++){ const v=map.get(dates[k]); if(Number.isFinite(v)) out.push(v);} return out; }
const idxOf=new Map(dates.map((d,i)=>[d,i]));

// risk regime (NQ 20d) + per-pair riskSens (−corr to NQ, 60d) + USD trend (10d, per date)
const regimeAt=new Map(), usdRetByPairDate={}; FX.forEach(p=>usdRetByPairDate[p]=new Map());
const riskSens={}; FX.forEach(p=>riskSens[p]=new Map());
for(let i=0;i<dates.length;i++){ const d=dates[i];
  const nq20=trail(nqRet,i,20); const s=nq20.reduce((a,b)=>a+b,0);
  regimeAt.set(d, s>0.01?'RISK_ON':s<-0.01?'RISK_OFF':'NEUTRAL');
  for(const p of FX){
    const pr=trail(fxRet[p],i,60), nr=trail(nqRet,i,60); const n=Math.min(pr.length,nr.length);
    if(n>=30){ const a=pr.slice(-n),b=nr.slice(-n); const ma=a.reduce((x,y)=>x+y,0)/n, mb=b.reduce((x,y)=>x+y,0)/n;
      let cov=0,va=0,vb=0; for(let k=0;k<n;k++){cov+=(a[k]-ma)*(b[k]-mb);va+=(a[k]-ma)**2;vb+=(b[k]-mb)**2;}
      const corr=(va>0&&vb>0)?cov/Math.sqrt(va*vb):0; riskSens[p].set(d, -corr); } // risk currency: corr>0 → riskSens<0
  }
}
// USD trend per pair per date (leave-one-out, 10d trailing sum of usdRet across OTHER majors)
for(let i=0;i<dates.length;i++){ const d=dates[i];
  for(const P of FX){ let sum=0,cnt=0;
    for(const q of FX){ if(q===P) continue; const w=trail(fxRet[q],i,10); const u=w.reduce((a,b)=>a+b,0)*USD_BASE[q]; if(w.length){sum+=u;cnt++;} }
    usdRetByPairDate[P].set(d, cnt?sum:0); }
}

// backfill per pair with macro context; collect events
const all=[];
for(const p of FX){
  const ctx={}; for(const d of dates){ const rs=riskSens[p].get(d); if(rs!=null) ctx[d]={ macro:{ regime:regimeAt.get(d)||'NEUTRAL', riskSens:rs } }; }
  const evs=[]; backfillPair(p, packedFX[p], { contextByDate:ctx, onEvent:e=>evs.push(e) });
  // add usd_trend_align post-hoc
  for(const e of evs){ const trend=usdRetByPairDate[p].get(e.date)||0; const dirSign=e.direction==='long'?1:-1;
    const tradeUsd=dirSign*USD_BASE[p]; const al=(trend===0)?0:Math.sign(tradeUsd*trend); e.features.usd_trend_align=al; }
  all.push(...evs); console.error(p,evs.length,'events');
}
console.log('pooled events:',all.length);
const wr=a=>a.length?+(100*a.filter(e=>e.outcome.win).length/a.length).toFixed(1):NaN;
const ma1=all.filter(e=>e.features.macro_align===1), ma0=all.filter(e=>e.features.macro_align===-1);
console.log(`macro_align: agree n=${ma1.length} win=${wr(ma1)}% | oppose n=${ma0.length} win=${wr(ma0)}% | base=${wr(all)}%`);
const ua1=all.filter(e=>e.features.usd_trend_align===1), ua0=all.filter(e=>e.features.usd_trend_align===-1);
console.log(`usd_trend_align: agree n=${ua1.length} win=${wr(ua1)}% | oppose n=${ua0.length} win=${wr(ua0)}%`);
const base=Object.keys(MODEL_V0.weights);
const fits={ baseline:fitLogistic(all,{features:base}),
  plus_macro:fitLogistic(all,{features:[...base,'macro_align']}),
  plus_usd:fitLogistic(all,{features:[...base,'usd_trend_align']}),
  plus_both:fitLogistic(all,{features:[...base,'macro_align','usd_trend_align']}) };
for(const [k,r] of Object.entries(fits))
  console.log(`${k.padEnd(11)} OOS brier=${r.oos.fitted.brier} (v0 ${r.oos.prior_v0.brier}) macro_w=${r.candidate?.weights?.macro_align??'-'} usd_w=${r.candidate?.weights?.usd_trend_align??'-'}`);

// ── Expectancy check (added — was NOT in the committed script; FIT_FINDINGS.md's
// Result 5 table said "reproduce with crossAssetFit.mjs (add the expectancy block,
// or see git history)" — this IS that block, using the same OOS split fitLogistic
// itself used (oosFrac 0.35, embargo 10d) so the split is identical to the fit above.
const sorted = all.filter(e=>e.features&&e.outcome).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
const splitIdx = Math.floor(sorted.length*(1-0.35));
const splitDate = sorted[splitIdx].date;
const addDays=(d,n)=>{const t=new Date(d+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10);};
const embargoEnd = addDays(splitDate,10);
const oos = sorted.filter(e=>e.date>=embargoEnd);
console.log(`\nOOS split date=${splitDate} embargoEnd=${embargoEnd} oos_n=${oos.length}`);
// outcome.pnlPct is already in PERCENT units (labelOutcome: gross = ... * 100), so
// bp = pnlPct * 100 (1% = 100bp) — NOT *10000, which would double-convert.
const meanBp=a=>a.length?+(100*a.reduce((s,e)=>s+e.outcome.pnlPct,0)/a.length).toFixed(2):NaN;
for(const act of ['fade','follow']){
  const acts=oos.filter(e=>e.action===act);
  const al=acts.filter(e=>e.features.usd_trend_align===1), op=acts.filter(e=>e.features.usd_trend_align===-1);
  console.log(`${act.padEnd(6)} OOS: aligned n=${al.length} mean=${meanBp(al)}bp | opposed n=${op.length} mean=${meanBp(op)}bp | all n=${acts.length} mean=${meanBp(acts)}bp`);
}
// per-pair fade breakdown (aligned vs opposed), OOS — the "6/6" claim
console.log('\nPer-pair fade OOS (aligned vs opposed):');
for(const p of FX){
  const acts=oos.filter(e=>e.action==='fade'&&e.pair===p);
  const al=acts.filter(e=>e.features.usd_trend_align===1), op=acts.filter(e=>e.features.usd_trend_align===-1);
  console.log(`  ${p}: aligned n=${al.length} mean=${meanBp(al)}bp | opposed n=${op.length} mean=${meanBp(op)}bp`);
}
