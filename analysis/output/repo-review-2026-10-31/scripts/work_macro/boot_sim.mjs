// Reproduce the drawBlock/bootDiff helper verbatim from analysis/crack_spread_study.mjs:19-20 and test coverage
const REPS=1000; let seed=20260921; const rnd=()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
const mean=x=>x.reduce((s,v)=>s+v,0)/x.length;
const drawBlock=(x,block)=>{const n=x.length,nb=Math.ceil(n/block),s=[];for(let q=0;q<nb;q++){const st=Math.floor(rnd()*(n-block+1));for(let i=0;i<block&&s.length<n;i++)s.push(x[st+i]);}return s;};
const bootDiff=(a,b,block=+process.argv[2]||20)=>{const out=[];for(let k=0;k<REPS;k++)out.push(mean(drawBlock(a,Math.min(block,a.length)))-mean(drawBlock(b,block)));out.sort((p,q)=>p-q);return{diff:mean(a)-mean(b),lo:out[25],hi:out[974]};};
// gaussian
let g=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
for (const nA of [17,24,45,58,61]) { let cover=0, width=0, offc=0; const T=300;
 for(let t=0;t<T;t++){ const a=Array.from({length:nA},g), b=Array.from({length:1500},g); const r=bootDiff(a,b); if(r.lo<=0&&0<=r.hi)cover++; width+=(r.hi-r.lo); offc+= (r.diff-r.lo)/(r.hi-r.lo); }
 console.log(`nA=${nA}: coverage of true 0 = ${(cover/T*100).toFixed(0)}% (should be 95), mean width ${(width/T).toFixed(3)} vs correct ${(2*1.96*Math.sqrt(1/nA+1/1500)).toFixed(3)}, point-estimate position in CI ${(offc/T).toFixed(2)} (0.5=centred)`); }
