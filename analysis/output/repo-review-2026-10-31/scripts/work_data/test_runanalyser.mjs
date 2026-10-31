import { synth } from './synth.mjs';
import { bucketM1IntoSessions, runAnalyser } from '/home/user/MacroFXModel/js/forecastAnalyser.js';
const p = synth('2025-06-01T00:00:00Z','2026-01-31T00:00:00Z');
// random walk prices so σ is non-zero
let x=1.1, seed=7; const rnd=()=>{seed=(seed*16807)%2147483647; return seed/2147483647-0.5;};
for(let i=0;i<p.n;i++){ const o=x; x*=1+rnd()*4e-4; p.opens[i]=o; p.closes[i]=x; p.highs[i]=Math.max(o,x)*(1+2e-5); p.lows[i]=Math.min(o,x)*(1-2e-5); }
const s = bucketM1IntoSessions(p,'Europe/London');
for (const h of ['daily','weekly']) {
  const recs = runAnalyser(s,'fx',{horizon:h});
  const dates=[...new Set(recs.map(r=>r.date))];
  const sun=dates.filter(d=>new Date(d+'T12:00:00Z').getUTCDay()===0);
  console.log(h,'windows',dates.length,'Sunday-dated windows',sun.length, sun.slice(0,4).join(' '));
}
