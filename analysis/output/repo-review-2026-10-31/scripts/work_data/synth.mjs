// Synthetic FX M1: trading from Sunday 17:00 New York to Friday 17:00 New York, every minute.
export function nyOffset(tSec){
  const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const p=Object.fromEntries(f.formatToParts(new Date(tSec*1000)).map(x=>[x.type,x.value]));
  return (Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute)/1000 - tSec)/3600;
}
export function nyLocal(tSec){ const o=nyOffset(tSec); const d=new Date((tSec+o*3600)*1000); return {dow:d.getUTCDay(), h:d.getUTCHours()}; }
export function isFxOpen(tSec){ const {dow,h}=nyLocal(tSec); if(dow===6) return false; if(dow===0) return h>=17; if(dow===5) return h<17; return true; }
export function synth(fromIso,toIso){
  const t0=Date.parse(fromIso)/1000, t1=Date.parse(toIso)/1000; const T=[];
  for(let t=t0;t<t1;t+=60) if(isFxOpen(t)) T.push(t);
  const n=T.length, times=new Int32Array(T), o=new Float64Array(n),h=new Float64Array(n),l=new Float64Array(n),c=new Float64Array(n),v=new Float64Array(n).fill(1);
  for(let i=0;i<n;i++){o[i]=1+i*1e-7;h[i]=o[i]+1e-5;l[i]=o[i]-1e-5;c[i]=o[i];}
  return {n,times,opens:o,highs:h,lows:l,closes:c,volumes:v};
}
