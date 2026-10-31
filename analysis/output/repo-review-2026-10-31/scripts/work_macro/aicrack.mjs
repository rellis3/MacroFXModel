// Re-score ai-crack-metals GLD/SLV H=20 from the saved data with (a) the study's circular block-20 draw,
// (b) an iid bootstrap of the (non-overlapping, 20-session de-clustered) events + block-20 control.
import fs from 'node:fs';
const RAW=JSON.parse(fs.readFileSync('/home/user/MacroFXModel/analysis/output/ai-crack-metals/data_yahoo_adj.json','utf8'));
const dates=Object.keys(RAW.SMH).filter(d=>RAW.SPY[d]&&RAW.GLD[d]&&RAW.SLV[d]&&d>='2006-04-28'&&d<='2026-08-21').sort();
const S=Object.fromEntries(['SMH','SPY','GLD','SLV'].map(t=>[t,dates.map(d=>RAW[t][d])]));
const ratio=S.SMH.map((v,i)=>v/S.SPY[i]); const chg=ratio.map((v,i)=>i<20?null:(v/ratio[i-20]-1)*100);
const q=(a,p)=>{const s=a.filter(Number.isFinite).slice().sort((x,y)=>x-y);return s.length?s[Math.floor((s.length-1)*p)]:null;};
const hits=[];for(let i=504;i<dates.length;i++){if(!Number.isFinite(chg[i]))continue;const thr=q(chg.slice(i-504,i),0.10);if(chg[i]<=thr)hits.push(i);}
const crack=[];let last=-1e9;for(const i of hits)if(i-last>=20){crack.push(i);last=i;}
const H=20; const ret=(t,i)=>i+H<dates.length?(S[t][i+H]/S[t][i]-1)*100:null;
const sh=new Set();for(const i of crack)for(let k=i-H;k<=i+H;k++)sh.add(k);
let seed=20261019;const rng=()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const drawB=(x,b)=>{const o=[];while(o.length<x.length){const i=Math.floor(rng()*x.length);for(let k=0;k<b&&o.length<x.length;k++)o.push(x[(i+k)%x.length]);}return o;};
const drawI=x=>x.map(()=>x[Math.floor(rng()*x.length)]);
for(const t of ['GLD','SLV']){const ev=crack.map(i=>ret(t,i)).filter(v=>v!=null);const ctl=[];for(let i=0;i<dates.length-H;i++)if(!sh.has(i)){const v=ret(t,i);if(v!=null)ctl.push(v);}
 for(const [lab,fn] of [['study circular block20',x=>drawB(x,20)],['iid events',drawI]]){const d=[];for(let r=0;r<4000;r++)d.push(mean(fn(ev))-mean(drawB(ctl,20)));d.sort((a,b)=>a-b);
 console.log(t,lab,'n',ev.length,'diff',(mean(ev)-mean(ctl)).toFixed(2),'CI',d[100].toFixed(2),d[3899].toFixed(2));}}
