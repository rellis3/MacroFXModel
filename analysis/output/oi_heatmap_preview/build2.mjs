import fs from 'fs';
const j=JSON.parse(fs.readFileSync('store.json')); const s=j.data??j;
const pick=(k,name)=>{ const e=s[k], L=e.gexLadder, rm=e.refMove.move, spot=e.spot;
  const idx=L.strikes.map((x,i)=>i).filter(i=>Math.abs(L.strikes[i]-spot)<=1.5*rm);
  const total=L.series.reduce((a,x)=>a+idx.reduce((b,i)=>b+Math.abs(x.net[i]||0),0),0)||1;
  const pts=[]; L.series.forEach(x=>idx.forEach(i=>{ const v=x.net[i]||0; const sh=Math.abs(v)/total*100; if(sh>=0.35) pts.push({k:L.strikes[i],dte:x.rest?90:x.dte,rest:!!x.rest,v,sh}); }));
  return {name,spot,rm,flip:e.gexFlip,mp:e.maxPain,pts,lo:spot-1.5*rm,hi:spot+1.5*rm,
    dtes:L.series.map(x=>({dte:x.rest?90:x.dte,label:x.rest?'later':x.dte+'d',sh:idx.reduce((b,i)=>b+Math.abs(x.net[i]||0),0)/total*100}))}; };
const data=[pick('XAU/USD','Gold'),pick('NAS100_USD','Nasdaq 100')];
fs.writeFileSync('expiry_map_preview.html',`<!doctype html><meta charset=utf-8><title>Expiry map preview</title>
<style>:root{--bg:#0b0d10;--bg2:#111419;--line:#232830;--tx:#eef1f5;--tx2:#a8b1bd;--tx3:#71798a;--acc:#e0a339}
body{margin:0;background:var(--bg);color:var(--tx);font:14px ui-sans-serif,"Segoe UI",sans-serif;padding:24px}
h1{font-size:15px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 4px}.sub{color:var(--tx3);font-size:12.5px;margin-bottom:16px;max-width:1150px}
.wrap{display:flex;gap:20px;flex-wrap:wrap}.card{background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:12px 14px;flex:1;min-width:560px}
.card h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px;color:var(--tx2)}svg text{font-family:ui-monospace,Consolas,monospace}</style>
<h1>Expiry map — preview (real data, mock layout)</h1>
<div class=sub>Price runs up the side (same axis as your price chart). Across is <b>time to expiry</b> on a true scale — today on the left, the far months on the right — so you see how soon each pile of gamma bites. Bubble area = share of the whole book's gamma; green = long gamma (pins), red = short gamma (amplifies). The amber band is the near-dated zone (≤3 DTE), the percentages under each expiry say how much of the book lives there.</div>
<div class=wrap id=w></div><script>
const D=${JSON.stringify(data)};
D.forEach(d=>{
 const W=640,H=620,L=70,R=20,T=44,B=40, x0=L,x1=W-R, maxX=Math.log(1+60);
 const X=dte=>x0+(Math.log(1+Math.min(dte,60))/maxX)*(x1-x0);
 const Y=p=>T+(d.hi-p)/(d.hi-d.lo)*(H-T-B);
 let s='<svg viewBox="0 0 '+W+' '+H+'" width=100%>';
 s+='<rect x="'+X(0)+'" y="'+T+'" width="'+(X(3.2)-X(0))+'" height="'+(H-T-B)+'" fill="rgba(224,163,57,.08)"/>';
 // price gridlines
 const step=Math.pow(10,Math.floor(Math.log10((d.hi-d.lo)/6)))*([1,2,5].find(m=>(d.hi-d.lo)/6/Math.pow(10,Math.floor(Math.log10((d.hi-d.lo)/6)))<=m*1.01)||10);
 for(let p=Math.ceil(d.lo/step)*step;p<=d.hi;p+=step){ s+='<line x1="'+x0+'" x2="'+x1+'" y1="'+Y(p)+'" y2="'+Y(p)+'" stroke="#1b2027"/><text x="'+(x0-8)+'" y="'+(Y(p)+4)+'" text-anchor="end" fill="#71798a" font-size="11">'+p.toFixed(0)+'</text>'; }
 // expiry columns
 d.dtes.forEach(c=>{ const x=X(c.dte); s+='<line x1="'+x+'" x2="'+x+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#232830" stroke-dasharray="2 4"/>'
   +'<text x="'+x+'" y="'+(H-B+16)+'" text-anchor="middle" fill="'+(c.dte<=3?'#e0a339':'#a8b1bd')+'" font-size="11">'+c.label+'</text>'
   +'<text x="'+x+'" y="'+(H-B+30)+'" text-anchor="middle" fill="#71798a" font-size="10">'+c.sh.toFixed(0)+'%</text>'; });
 // level lines
 [[d.spot,'#eef1f5','spot',1],[d.mp,'#d9c04a','max pain',0],[d.flip,'#9b7de0','GEX flip',0]].forEach(([p,c,t,solid])=>{ if(p<d.lo||p>d.hi) return;
   s+='<line x1="'+x0+'" x2="'+x1+'" y1="'+Y(p)+'" y2="'+Y(p)+'" stroke="'+c+'" stroke-width="'+(solid?1.4:1)+'"'+(solid?'':' stroke-dasharray="6 4"')+'/><text x="'+(x1)+'" y="'+(Y(p)-4)+'" text-anchor="end" fill="'+c+'" font-size="11">'+t+' '+p.toFixed(0)+'</text>'; });
 // bubbles
 const maxSh=Math.max(...d.pts.map(p=>p.sh));
 const pts=d.pts.slice().sort((a,b)=>b.sh-a.sh);
 pts.slice().reverse().forEach(p=>{ const r=3+Math.sqrt(p.sh/maxSh)*22; const c=p.v>=0?'70,184,122':'232,97,95';
   s+='<circle cx="'+X(p.dte)+'" cy="'+Y(p.k)+'" r="'+r.toFixed(1)+'" fill="rgba('+c+',.55)" stroke="rgba('+c+',.95)"/>'; });
 pts.slice(0,9).forEach(p=>{ const r=3+Math.sqrt(p.sh/maxSh)*22; s+='<text x="'+(X(p.dte)+r+4)+'" y="'+(Y(p.k)+4)+'" fill="#eef1f5" font-size="11" paint-order="stroke" stroke="#111419" stroke-width="3">'+p.k.toFixed(0)+' · '+p.sh.toFixed(1)+'%</text>'; });
 s+='<text x="'+x0+'" y="'+(T-24)+'" fill="#e0a339" font-size="11">near-dated ≤3 DTE = '+d.dtes.filter(c=>c.dte<=3).reduce((a,c)=>a+c.sh,0).toFixed(0)+'% of book</text></svg>';
 document.getElementById('w').insertAdjacentHTML('beforeend','<div class=card><h2>'+d.name+' · spot '+d.spot.toFixed(1)+'</h2>'+s+'</div>');
});
</script>`);
