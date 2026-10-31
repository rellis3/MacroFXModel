// circular block draw as in scripts/ai-crack-metals/run.mjs (and macro_confluence_*: block 5)
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length; let rng=Math.random;
const draw=(x,b)=>{const o=[];while(o.length<x.length){const i=Math.floor(rng()*x.length);for(let k=0;k<b&&o.length<x.length;k++)o.push(x[(i+k)%x.length]);}return o;};
const g=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
for(const [n,B] of [[60,20],[24,20],[45,5],[17,10]]){let cov=0;const T=300;for(let t=0;t<T;t++){const a=Array.from({length:n},g),c=Array.from({length:2000},g);const d=[];for(let r=0;r<600;r++)d.push(mean(draw(a,B))-mean(draw(c,B)));d.sort((p,q)=>p-q);if(d[15]<=0&&0<=d[584])cov++;}console.log(`circular n=${n} block=${B}: coverage ${(cov/T*100).toFixed(0)}%`);}
