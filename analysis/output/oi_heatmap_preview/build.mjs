import fs from 'fs';
const j=JSON.parse(fs.readFileSync('store.json')); const s=j.data??j;
const pick=(k,name)=>{ const e=s[k], L=e.gexLadder, rm=e.refMove.move, spot=e.spot;
  const idx=L.strikes.map((x,i)=>i).filter(i=>Math.abs(L.strikes[i]-spot)<=1.6*rm);
  // group to ~5-wide display steps already (strikes are the ladder's own)
  const ser=L.series.map(x=>({label:x.label,dte:x.dte,rest:!!x.rest,net:idx.map(i=>x.net[i]||0)}));
  const total=ser.reduce((a,x)=>a+x.net.reduce((b,v)=>b+Math.abs(v),0),0)||1;
  const rows=idx.map((i,r)=>({strike:L.strikes[i],cells:ser.map(x=>x.net[r])}));
  const nearIdx=ser.map((x,i)=>(!x.rest&&x.dte<=3)?i:-1).filter(i=>i>=0);
  return {name,spot,rm,flip:e.gexFlip,mp:e.maxPain,ser:ser.map(x=>({label:x.label,dte:x.dte,rest:x.rest,abs:x.net.reduce((a,v)=>a+Math.abs(v),0)})),rows,total,nearIdx,
    cw:e.callWall,pw:e.putWall}; };
const data=[pick('XAU/USD','Gold'),pick('NAS100_USD','Nasdaq 100')];
const html=`<!doctype html><meta charset=utf-8><title>OI heatmap preview</title>
<style>
:root{--bg:#0b0d10;--bg2:#111419;--line:#232830;--tx:#eef1f5;--tx2:#a8b1bd;--tx3:#71798a;--acc:#e0a339;--long:70,184,122;--short:232,97,95}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 ui-sans-serif,"Segoe UI",sans-serif;padding:24px}
h1{font-size:15px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 4px}
.sub{color:var(--tx3);font-size:12.5px;margin-bottom:18px;max-width:1100px}
.wrap{display:flex;gap:22px;flex-wrap:wrap}
.card{background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:14px 16px;flex:1;min-width:520px}
.card h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px;color:var(--tx2)}
table{border-collapse:separate;border-spacing:2px;width:100%;font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
th{color:var(--tx3);font-weight:500;text-align:center;padding:3px 2px;font-size:11px}
th small{display:block;color:var(--tx3);font-size:10px}
td.k{color:var(--tx2);text-align:right;padding-right:8px;white-space:nowrap}
td.c{height:17px;text-align:center;color:#fff;border-radius:2px;font-size:10.5px}
td.tot{border-left:2px solid var(--line);padding-left:6px}
tr.spot td.k{color:var(--acc);font-weight:700}
tr.spot td{box-shadow:inset 0 1px 0 var(--acc),inset 0 -1px 0 var(--acc)}
.tag{font-size:10px;padding:0 5px;border-radius:3px;margin-left:5px;font-family:ui-sans-serif}
.sumline{color:var(--tx2);font-size:12.5px;margin:-4px 0 8px}.sumline b{color:var(--acc)}
.legend{display:flex;gap:16px;align-items:center;margin-top:10px;color:var(--tx3);font-size:11.5px}
.sw{display:inline-block;width:14px;height:10px;border-radius:2px;vertical-align:middle;margin-right:5px}
.near{background:rgba(224,163,57,.10)}
.hdrnear{color:var(--acc)}
.note{margin-top:10px;color:var(--tx2);font-size:12.5px;border-left:2px solid var(--line);padding-left:10px}
</style>
<h1>Strike × expiry heatmap — preview (real data, mock layout)</h1>
<div class=sub>Rows = strikes, columns = expiries (amber headers = near-dated, the ones that hedge today). Cell colour = dealer gamma at that strike &amp; expiry (green = long gamma / pins, red = short gamma / amplifies); the number in the cell is that cell's <b>share of the whole book's absolute gamma</b>. Right-hand column = the strike's total share.</div>
<div class=wrap id=w></div>
<script>
const D=${JSON.stringify(data)};
const fmtK=v=>v>=10000?v.toFixed(0):v.toFixed(v<100?2:1);
D.forEach(d=>{
  const maxCell=Math.max(...d.rows.flatMap(r=>r.cells.map(Math.abs)));
  const colTot=d.ser.map(x=>x.abs/d.total*100);
  let h='<div class=card><h2>'+d.name+' · spot '+d.spot.toFixed(1)+'</h2>'+'<div class=sumline>Near-dated (≤3 DTE) = <b>'+d.nearIdx.reduce((a,i)=>a+colTot[i],0).toFixed(0)+'%</b> of the book&#39;s gamma</div><table><tr><th></th>';
  d.ser.forEach((x,i)=>{const near=d.nearIdx.includes(i); h+='<th class="'+(near?'hdrnear':'')+'">'+(x.rest?'later':x.dte+' DTE')+'<small>'+colTot[i].toFixed(0)+'% of book</small></th>';});
  h+='<th class=tot>strike<br>total</th></tr>';
  // Only strikes that matter: >=0.6% of the book in total, or a key level (spot / max pain / flip). Gaps collapse to a thin separator.
  const keep=r=>{ const t=r.cells.reduce((a,v)=>a+Math.abs(v),0)/d.total*100; return t>=0.6||Math.abs(r.strike-d.mp)<=d.rm*0.03||Math.abs(r.strike-d.flip)<=d.rm*0.03; };
  const rows=d.rows.slice().sort((a,b)=>b.strike-a.strike).filter(keep);
  const step=1;
  let placedSpot=false;
  rows.forEach((r,ri)=>{ if(ri%step) return;
    const isSpot=!placedSpot && r.strike<=d.spot && (placedSpot=true);
    let h2='<tr class="'+(isSpot?'spot':'')+'"><td class=k>'+fmtK(r.strike)+(isSpot?' ◄ spot':'')
      +(Math.abs(r.strike-d.mp)<=d.rm*0.03?'<span class=tag style="background:#d9c04a;color:#000">max pain</span>':'')
      +(Math.abs(r.strike-d.flip)<=d.rm*0.03?'<span class=tag style="background:#9b7de0;color:#000">GEX flip</span>':'')+'</td>';
    let tot=0;
    r.cells.forEach((v,i)=>{ tot+=Math.abs(v); const sh=Math.abs(v)/d.total*100; const a=Math.min(1,Math.pow(Math.abs(v)/maxCell,0.55));
      const c=v>=0?'var(--long)':'var(--short)';
      const near=d.nearIdx.includes(i);
      h2+='<td class="c'+(near?'':'')+'" style="background:'+(a<0.02?'transparent':'rgba('+c+','+(0.12+0.85*a).toFixed(2)+')')+'">'+(sh>=0.4?sh.toFixed(1):'')+'</td>'; });
    h2+='<td class="c tot" style="color:var(--tx2)">'+(tot/d.total*100).toFixed(1)+'%</td></tr>';
    h+=h2; });
  h+='</table><div class=legend><span><i class=sw style="background:rgba(var(--long),.8)"></i>long gamma (pin / dampen)</span><span><i class=sw style="background:rgba(var(--short),.8)"></i>short gamma (amplify)</span><span>blank = under 0.4% of book</span></div></div>';
  document.getElementById('w').insertAdjacentHTML('beforeend',h);
});
</script>`;
fs.writeFileSync('heatmap_preview.html',html);
