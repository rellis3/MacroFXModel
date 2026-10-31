import { synth } from './synth.mjs';
import { bucketM1IntoSessions, londonDateKey, londonMidnightEpochSec } from '/home/user/MacroFXModel/js/forecastAnalyser.js';
import { nyCloseDailyBars } from '/home/user/MacroFXModel/js/voteAtlasV4Lines.js';
const lf=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
// 1. DST rule vs Intl over 2000-2035 every hour near transitions
let bad=0; for(let t=Date.UTC(2000,0,1)/1000;t<Date.UTC(2036,0,1)/1000;t+=1800){ if(londonDateKey(new Date(t*1000))!==lf.format(new Date(t*1000))) bad++; }
console.log('londonDateKey mismatches vs Intl 2000-2035 (30-min grid):',bad);
for (const [a,b] of [['2026-03-01T00:00:00Z','2026-04-06T00:00:00Z'],['2026-10-18T00:00:00Z','2026-11-10T00:00:00Z'],['2025-03-02T00:00:00Z','2025-04-05T00:00:00Z'],['2025-10-19T00:00:00Z','2025-11-08T00:00:00Z']]){
  const p=synth(a,b);
  const s=bucketM1IntoSessions(p,'Europe/London');
  console.log(`\n== ${a.slice(0,10)}..${b.slice(0,10)} bucketM1IntoSessions(London)`);
  for(const [k,bars] of [...s].sort()){ const dow=new Date(k+'T12:00:00Z').getUTCDay(); const first=new Date(bars[0].time*1000).toISOString().slice(11,16); const last=new Date(bars.at(-1).time*1000).toISOString().slice(5,16);
    const lm=londonMidnightEpochSec(Date.parse(k+'T12:00:00Z')/1000); const openOk = dow===1? '' : (bars[0].time===lm?'open@LondonMidnight':'OPEN!=LondonMidnight');
    if(dow===0||dow===1||dow===5||bars.length!==1440) console.log(k,['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow],'bars',bars.length,'first',first,'UTC last',last,openOk); }
  const s22=bucketM1IntoSessions(p); const sundays=[...s22.keys()].filter(k=>new Date(k+'T12:00:00Z').getUTCDay()===0);
  console.log('default(22 UTC) Sunday-labelled sessions:',sundays.map(k=>k+':'+s22.get(k).length).join(' ')||'none');
  const ny=nyCloseDailyBars(p); console.log('nyCloseDailyBars keys n<60 (stubs):',ny.filter(d=>d.n<60).map(d=>d.key+':'+d.n).join(' ')||'none',' | n per key:',[...new Set(ny.map(d=>d.n))].join(','));
  const badEnd=ny.filter(d=>{const nextMid=new Date(d.endSec*1000); const h=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hour12:false}).format(nextMid); return h!=='17';});
  console.log('nyCloseDailyBars endSec not at 17:00 NY:',badEnd.map(d=>d.key).join(' ')||'none');
}
