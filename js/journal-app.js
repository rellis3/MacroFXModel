const JOURNAL_KEY = 'journal_store';
const PAIRS_ALL   = ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','XAU/USD','EUR/GBP','USD/CAD','USD/CHF','GBP/JPY'];
let journalData  = {};
let filterPair   = 'all';
let selectedDate = null;
let calViewYear  = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let currentView  = 'day';

// ── KV helpers ──────────────────────────────────────────────────────────────
async function kvGet(key){
  try{const res=await fetch('/api/kv/get?key='+encodeURIComponent(key));
    if(!res.ok)return null;const obj=await res.json();return obj.miss?null:obj;}
  catch(e){return null;}}
async function kvSet(key,data){
  try{await fetch('/api/kv/set',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key,data,timestamp:Date.now()})});}catch(e){}}

async function loadJournal(){
  // Load localStorage immediately so UI renders fast
  try{const raw=localStorage.getItem(JOURNAL_KEY);if(raw)journalData=JSON.parse(raw)||{};}
  catch(e){journalData={};}
  // Then merge from KV (may have data from another device)
  try{
    const kvObj=await kvGet(JOURNAL_KEY);
    if(kvObj&&kvObj.data){
      const kv=kvObj.data;let changed=false;
      for(const[date,dayObj]of Object.entries(kv)){
        if(!journalData[date]){journalData[date]=dayObj;changed=true;}
        else for(const[pair,pairObj]of Object.entries(dayObj)){
          if(!journalData[date][pair]){journalData[date][pair]=pairObj;changed=true;}
        }
      }
      if(changed){try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(journalData));}catch(e){}}
    }
  }catch(e){}
}
function saveJournal(){
  try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(journalData));}catch(e){showToast('Storage error','err');}
  kvSet(JOURNAL_KEY,journalData);}
function todayStr(){return new Date().toISOString().split('T')[0];}

function toggleDark(){
  document.body.classList.toggle('dark');
  const d=document.body.classList.contains('dark');
  document.getElementById('d-icon').textContent=d?'&#9728;':'&#127769;';
  document.getElementById('d-lbl').textContent=d?'Light':'Dark';
  localStorage.setItem('darkMode',d?'1':'0');
}
function applyDark(){
  if(localStorage.getItem('darkMode')==='1'){
    document.body.classList.add('dark');
    document.getElementById('d-icon').textContent='&#9728;';
    document.getElementById('d-lbl').textContent='Light';
  }
}

async function init(){
  applyDark();
  // Render with localStorage data immediately, then re-render after KV merge
  try{const raw=localStorage.getItem(JOURNAL_KEY);if(raw)journalData=JSON.parse(raw)||{};}catch(e){}
  selectedDate=todayStr();renderPairNav();renderCalendar();renderQuickStats();renderMain();
  // Now load+merge from KV and re-render if anything changed
  await loadJournal();
  renderPairNav();renderCalendar();renderQuickStats();renderMain();
}


function renderPairNav(){
  const counts={all:0};
  PAIRS_ALL.forEach(p=>counts[p]=0);
  Object.values(journalData).forEach(dayObj=>{
    Object.entries(dayObj).forEach(([pair,v])=>{
      const n=(v.levels||[]).length;
      if(counts[pair]!==undefined)counts[pair]+=n;
      counts.all+=n;
    });
  });
  const mk=(key,label)=>`<div class="pair-pill ${filterPair===key?'active':''}" onclick="setPairFilter('${key}')">${label}<span class="pair-pill-count">${counts[key]||0}</span></div>`;
  document.getElementById('pairNav').innerHTML=mk('all','All Pairs')+PAIRS_ALL.map(p=>mk(p,p)).join('');
}
function setPairFilter(p){filterPair=p;renderPairNav();renderMain();renderCalendar();}

function renderCalendar(){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('calMonth').textContent=months[calViewMonth]+' '+calViewYear;
  const days=['S','M','T','W','T','F','S'];
  const firstDay=new Date(calViewYear,calViewMonth,1).getDay();
  const dim=new Date(calViewYear,calViewMonth+1,0).getDate();
  const today=todayStr();
  const dataDates=new Set();
  Object.keys(journalData).forEach(date=>{
    const d=new Date(date);
    if(d.getFullYear()!==calViewYear||d.getMonth()!==calViewMonth)return;
    const dayObj=journalData[date];
    if(filterPair==='all'){if(Object.keys(dayObj).length>0)dataDates.add(date);}
    else{if(dayObj[filterPair])dataDates.add(date);}
  });
  let html=days.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++)html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=dim;d++){
    const ds=calViewYear+'-'+String(calViewMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const cls=['cal-day',ds===today?'today':'',dataDates.has(ds)?'has-data':'',ds===selectedDate?'selected':''].filter(Boolean).join(' ');
    html+=`<div class="${cls}" onclick="selectDate('${ds}')">${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML=html;
}
function calPrev(){calViewMonth--;if(calViewMonth<0){calViewMonth=11;calViewYear--;}renderCalendar();}
function calNext(){calViewMonth++;if(calViewMonth>11){calViewMonth=0;calViewYear++;}renderCalendar();}
function selectDate(date){selectedDate=date;if(currentView!=='day')setView('day');renderCalendar();renderMain();}

function renderQuickStats(){
  let total=0,taken=0,wins=0,losses=0,bes=0;
  Object.values(journalData).forEach(dayObj=>{
    Object.entries(dayObj).forEach(([pair,v])=>{
      if(filterPair!=='all'&&pair!==filterPair)return;
      (v.levels||[]).forEach(l=>{
        total++;
        if(l.trade==='long'||l.trade==='short'){taken++;if(l.outcome==='win')wins++;if(l.outcome==='loss')losses++;if(l.outcome==='be')bes++;}
      });
    });
  });
  const wr=taken>0?Math.round(wins/taken*100):0;
  const wrc=wr>=60?'vu':wr>=45?'vn':taken>0?'vd':'vp';
  document.getElementById('quickStats').innerHTML=`
    <div class="mrow"><span class="mrow-n">Levels saved</span><span class="mrow-v vp">${total}</span></div>
    <div class="mrow"><span class="mrow-n">Trades taken</span><span class="mrow-v vp">${taken}</span></div>
    <div class="mrow"><span class="mrow-n">Win rate</span><span class="mrow-v ${wrc}">${wr}%</span></div>
    <div class="mrow"><span class="mrow-n">W / L / BE</span><span class="mrow-v"><span class="vu">${wins}</span> / <span class="vd">${losses}</span> / <span class="vn">${bes}</span></span></div>`;
}

function setView(v){
  currentView=v;
  ['Day','All','Stats'].forEach(n=>{const el=document.getElementById('btnView'+n);if(el)el.classList.toggle('active',v.toLowerCase()===n.toLowerCase());});
  renderMain();
}

function renderMain(){
  const el=document.getElementById('mainContent');
  if(currentView==='day')  el.innerHTML=renderDayView();
  if(currentView==='all')  el.innerHTML=renderAllView();
  if(currentView==='stats')el.innerHTML=renderStatsView();
}

function renderDayView(){
  const dayObj=journalData[selectedDate];
  const fmt=new Date(selectedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const pairs=dayObj?Object.keys(dayObj).filter(p=>filterPair==='all'||p===filterPair):[];
  if(pairs.length===0)return`<div class="empty-state"><div class="em-icon">&#128197;</div><h3>${fmt}</h3><p>No levels saved for this day${filterPair!=='all'?' for '+filterPair:''}.<br>Open the dashboard and click <strong>Journal</strong>.</p></div>`;
  let html=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap"><div style="font-size:16px;font-weight:700">${fmt}</div><div style="font-size:11px;color:var(--text3)">${pairs.length} pair${pairs.length>1?'s':''}</div></div>`;
  pairs.forEach(pair=>{
    const levels=dayObj[pair].levels||[];
    const macro=dayObj[pair].macro||{};
    html+=`<div class="day-group">
      <div class="day-group-header">
        <span class="day-group-date">${pair}</span>
        <span class="day-group-meta">Macro ${macro.bias||'&mdash;'} ${macro.score!==undefined?(macro.score>0?'+':'')+macro.score:''} &middot; Vol ${macro.volRegime||'&mdash;'}</span>
        <div class="day-group-pills">${summaryPills(levels)}</div>
        <button class="export-day-btn" onclick="exportPairDate('${pair}','${selectedDate}')">Export</button>
      </div>
      <div class="levels-grid">${levels.map((l,i)=>renderLevelCard(l,i,selectedDate,pair)).join('')}</div>
    </div>`;
  });
  return html;
}

function summaryPills(levels){
  let w=0,l=0,b=0;
  levels.forEach(lv=>{if(lv.outcome==='win')w++;if(lv.outcome==='loss')l++;if(lv.outcome==='be')b++;});
  return(w?`<span class="day-pill win">${w}W</span>`:'')+( l?`<span class="day-pill loss">${l}L</span>`:'')+( b?`<span class="day-pill be">${b}BE</span>`:'');
}

function renderLevelCard(level,idx,date,pair){
  const trade=level.trade||'',outcome=level.outcome||'',notes=level.notes||'';
  const slVal=level.slOverride!==undefined?level.slOverride:(level.sl||'');
  const tpVal=level.tpOverride!==undefined?level.tpOverride:(level.tp||'');
  const digits=getDigits(pair);
  const priceStr=typeof level.price==='number'?level.price.toFixed(digits):level.price;
  const slStr=slVal!==''&&!isNaN(slVal)?Number(slVal).toFixed(digits):'';
  const tpStr=tpVal!==''&&!isNaN(tpVal)?Number(tpVal).toFixed(digits):'';
  let borderCls='';
  if(outcome==='win')borderCls='outcome-win';
  if(outcome==='loss')borderCls='outcome-loss';
  if(outcome==='be')borderCls='outcome-be';
  if(trade==='watching'&&!outcome)borderCls='trade-watching';
  const stars=level.stars||1;
  const starsHtml='<span style="color:var(--amber)">'+'&#9733;'.repeat(Math.min(stars,7))+'</span><span style="color:var(--border2)">'+'&#9734;'.repeat(Math.max(0,4-stars))+'</span>';
  const dirCls=level.direction==='long'?'long':'short';
  const dirLabel=level.direction==='long'?'&#8593; LONG':'&#8595; SHORT';
  const tags=(level.tags||[]).map(t=>`<span class="ec-tag ${t.cls||'range'}">${t.label}</span>`).join('');
  const tBtns=[{key:'watching',label:'Watch',cls:'active-watch'},{key:'long',label:'Long',cls:'active-long'},{key:'short',label:'Short',cls:'active-short'},{key:'skip',label:'Skip',cls:'active-skip'}]
    .map(s=>`<button class="trade-btn ${trade===s.key?s.cls:''}" onclick="setTrade('${date}','${pair}',${idx},'${s.key}')">${s.label}</button>`).join('');
  let ocBtns='';
  if(trade==='long'||trade==='short'){
    ocBtns=`<div class="trade-outcome">`+[{key:'win',label:'Win',cls:'active-win'},{key:'loss',label:'Loss',cls:'active-loss'},{key:'be',label:'BE',cls:'active-be'}]
      .map(o=>`<button class="outcome-btn ${outcome===o.key?o.cls:''}" onclick="setOutcome('${date}','${pair}',${idx},'${o.key}')">${o.label}</button>`).join('')+'</div>';
  }
  return `<div class="level-card ${borderCls}">
    <div class="level-top">
      <span class="level-stars">${starsHtml}</span>
      <span class="level-price">${priceStr}</span>
      <span class="level-dir ${dirCls}">${dirLabel}</span>
      <div class="level-sltp">
        <div class="sltp-item"><span class="sltp-lbl">SL</span><span class="sltp-val sl">${slStr||'&mdash;'}</span></div>
        <div class="sltp-item"><span class="sltp-lbl">TP</span><span class="sltp-val tp">${tpStr||'&mdash;'}</span></div>
      </div>
    </div>
    ${tags?`<div class="level-tags">${tags}</div>`:''}
    <div class="level-trade">
      <div class="trade-status-btns">${tBtns}</div>${ocBtns}
      <div class="sltp-inputs">
        <div class="sltp-input-group"><span class="sltp-input-lbl">SL Price</span><input class="sltp-input" type="number" step="${getStep(pair)}" value="${slStr}" placeholder="${slStr||'0'}" onchange="setSLTP('${date}','${pair}',${idx},'sl',this.value)"></div>
        <div class="sltp-input-group"><span class="sltp-input-lbl">TP Price</span><input class="sltp-input" type="number" step="${getStep(pair)}" value="${tpStr}" placeholder="${tpStr||'0'}" onchange="setSLTP('${date}','${pair}',${idx},'tp',this.value)"></div>
      </div>
    </div>
    <div class="level-notes-row"><textarea class="notes-input" rows="1" placeholder="Notes..." onchange="setNotes('${date}','${pair}',${idx},this.value)">${notes}</textarea></div>
  </div>`;
}

function getDigits(pair){if(pair.includes('JPY'))return 3;if(pair.includes('XAU'))return 2;return 5;}
function getStep(pair){if(pair.includes('JPY'))return '0.001';if(pair.includes('XAU'))return '0.01';return '0.00001';}

function ensurePath(date,pair,idx){
  if(!journalData[date])journalData[date]={};
  if(!journalData[date][pair])journalData[date][pair]={levels:[],macro:{}};
}
function setTrade(date,pair,idx,status){ensurePath(date,pair,idx);const l=journalData[date][pair].levels[idx];l.trade=l.trade===status?'':status;if(!l.trade||l.trade==='watching'||l.trade==='skip')l.outcome='';saveJournal();renderMain();renderQuickStats();}
function setOutcome(date,pair,idx,oc){ensurePath(date,pair,idx);const l=journalData[date][pair].levels[idx];l.outcome=l.outcome===oc?'':oc;saveJournal();renderMain();renderQuickStats();}
function setSLTP(date,pair,idx,field,val){ensurePath(date,pair,idx);const l=journalData[date][pair].levels[idx];if(field==='sl')l.slOverride=parseFloat(val);if(field==='tp')l.tpOverride=parseFloat(val);saveJournal();}
function setNotes(date,pair,idx,val){ensurePath(date,pair,idx);journalData[date][pair].levels[idx].notes=val;saveJournal();}

function renderAllView(){
  const dates=Object.keys(journalData).sort().reverse();
  if(dates.length===0)return`<div class="empty-state"><div class="em-icon">&#128237;</div><h3>No data yet</h3><p>Save levels from the dashboard to begin.</p></div>`;
  let html='';
  dates.forEach(date=>{
    const dayObj=journalData[date];
    const pairs=Object.keys(dayObj).filter(p=>filterPair==='all'||p===filterPair);
    if(pairs.length===0)return;
    const fmt=new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const allLevels=[];pairs.forEach(p=>(dayObj[p].levels||[]).forEach(l=>allLevels.push(l)));
    html+=`<div class="day-group"><div class="day-group-header" onclick="selectDate('${date}')" style="cursor:pointer">
      <span class="day-group-date">${fmt}</span>
      <span class="day-group-meta">${pairs.join(', ')} &middot; ${allLevels.length} levels</span>
      <div class="day-group-pills">${summaryPills(allLevels)}</div>
    </div>`;
    pairs.forEach(pair=>{
      const levels=dayObj[pair].levels||[];const macro=dayObj[pair].macro||{};
      html+=`<div class="day-pair-section"><div class="day-pair-lbl">${pair} <span style="font-weight:400;color:var(--text3)">Macro ${macro.bias||'&mdash;'} ${macro.score!==undefined?(macro.score>0?'+':'')+macro.score:''} &middot; Vol ${macro.volRegime||'&mdash;'}</span></div><div class="levels-grid">${levels.map((l,i)=>renderLevelCard(l,i,date,pair)).join('')}</div></div>`;
    });
    html+=`</div>`;
  });
  return html||`<div class="empty-state"><div class="em-icon">&#128237;</div><h3>No matching data</h3></div>`;
}

function renderStatsView(){
  const d=collectStats();
  const wr=d.taken>0?(d.wins/d.taken*100).toFixed(0):0;
  const pf=d.losses>0?(d.wins/d.losses).toFixed(2):d.wins>0?'&#8734;':'0';
  const wrc=wr>=60?'var(--green)':wr>=45?'var(--amber)':d.taken>0?'var(--red)':'var(--text)';
  const pfc=parseFloat(pf)>=2?'var(--green)':parseFloat(pf)>=1?'var(--amber)':d.taken>0?'var(--red)':'var(--text)';
  let pairRows=Object.entries(d.byPair).map(([p,s])=>{
    const pwr=s.taken>0?(s.wins/s.taken*100).toFixed(0)+'%':'&mdash;';
    const c=s.taken>0&&parseFloat(pwr)>=60?'var(--green)':s.taken>0&&parseFloat(pwr)>=45?'var(--amber)':s.taken>0?'var(--red)':'var(--text3)';
    return`<tr><td>${p}</td><td>${s.levels}</td><td>${s.taken}</td><td style="color:var(--green)">${s.wins}</td><td style="color:var(--red)">${s.losses}</td><td style="color:var(--amber)">${s.bes}</td><td style="color:${c}">${pwr}</td></tr>`;
  }).join('');
  let starRows=Object.entries(d.byStar).filter(([,s])=>s.levels>0).map(([stars,s])=>{
    const swr=s.taken>0?(s.wins/s.taken*100).toFixed(0)+'%':'&mdash;';
    const sc=s.taken>0&&parseFloat(swr)>=60?'var(--green)':s.taken>0&&parseFloat(swr)>=45?'var(--amber)':s.taken>0?'var(--red)':'var(--text3)';
    return`<tr><td><span style="color:var(--amber)">${'&#9733;'.repeat(Math.min(+stars,4))}</span> ${stars}&#9733;</td><td>${s.levels}</td><td>${s.taken}</td><td style="color:var(--green)">${s.wins}</td><td style="color:var(--red)">${s.losses}</td><td style="color:${sc}">${swr}</td></tr>`;
  }).join('');
  return`<div style="font-size:16px;font-weight:700;margin-bottom:16px">Performance Statistics${filterPair!=='all'?`<span style="font-size:12px;color:var(--text3);font-weight:400;margin-left:8px">${filterPair}</span>`:''}</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-lbl">Levels Saved</div><div class="stat-card-val">${d.total}</div><div class="stat-card-sub">${d.days} trading day${d.days!==1?'s':''}</div></div>
      <div class="stat-card"><div class="stat-card-lbl">Trades Taken</div><div class="stat-card-val">${d.taken}</div><div class="stat-card-sub">${d.total>0?Math.round(d.taken/d.total*100):0}% of levels</div></div>
      <div class="stat-card"><div class="stat-card-lbl">Win Rate</div><div class="stat-card-val" style="color:${wrc}">${wr}%</div><div class="stat-card-sub">${d.wins}W &middot; ${d.losses}L &middot; ${d.bes}BE</div></div>
      <div class="stat-card"><div class="stat-card-lbl">Profit Factor</div><div class="stat-card-val" style="color:${pfc}">${pf}</div><div class="stat-card-sub">Wins &divide; Losses</div></div>
    </div>
    <div class="sec-lbl" style="margin-bottom:10px">By Pair <span class="sec-badge">BREAKDOWN</span></div>
    <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:20px"><table class="breakdown-table"><thead><tr><th>Pair</th><th>Levels</th><th>Taken</th><th>W</th><th>L</th><th>BE</th><th>Win%</th></tr></thead><tbody>${pairRows||'<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:16px">No data yet</td></tr>'}</tbody></table></div>
    <div class="sec-lbl" style="margin-bottom:10px">By Star Rating <span class="sec-badge purple">QUALITY</span></div>
    <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden"><table class="breakdown-table"><thead><tr><th>Stars</th><th>Levels</th><th>Taken</th><th>W</th><th>L</th><th>Win%</th></tr></thead><tbody>${starRows||'<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:16px">No data yet</td></tr>'}</tbody></table></div>`;
}

function collectStats(){
  let total=0,taken=0,wins=0,losses=0,bes=0;
  const byPair={},byStar={},days=new Set();
  PAIRS_ALL.forEach(p=>byPair[p]={levels:0,taken:0,wins:0,losses:0,bes:0});
  for(let s=1;s<=7;s++)byStar[s]={levels:0,taken:0,wins:0,losses:0,bes:0};
  Object.entries(journalData).forEach(([date,dayObj])=>{
    Object.entries(dayObj).forEach(([pair,v])=>{
      if(filterPair!=='all'&&pair!==filterPair)return;
      days.add(date);
      (v.levels||[]).forEach(l=>{
        total++;if(byPair[pair])byPair[pair].levels++;
        const s=Math.min(l.stars||1,7);if(byStar[s])byStar[s].levels++;
        if(l.trade==='long'||l.trade==='short'){
          taken++;if(byPair[pair])byPair[pair].taken++;if(byStar[s])byStar[s].taken++;
          if(l.outcome==='win'){wins++;if(byPair[pair])byPair[pair].wins++;if(byStar[s])byStar[s].wins++;}
          if(l.outcome==='loss'){losses++;if(byPair[pair])byPair[pair].losses++;if(byStar[s])byStar[s].losses++;}
          if(l.outcome==='be'){bes++;if(byPair[pair])byPair[pair].bes++;if(byStar[s])byStar[s].bes++;}
        }
      });
    });
  });
  const activePairs={};Object.entries(byPair).forEach(([p,v])=>{if(v.levels>0)activePairs[p]=v;});
  return{total,taken,wins,losses,bes,days:days.size,byPair:activePairs,byStar};
}

function openExportModal(){document.getElementById('exportModal').classList.add('open');populateExportSelects();generateCSV();}
function closeExportModal(){document.getElementById('exportModal').classList.remove('open');}
function exportPairDate(pair,date){openExportModal();setTimeout(()=>{document.getElementById('exportPairSelect').value=pair;document.getElementById('exportDateSelect').value=date;generateCSV();},50);}

function populateExportSelects(){
  const pairSet=new Set(),dateSet=new Set();
  Object.entries(journalData).forEach(([date,dayObj])=>{Object.keys(dayObj).forEach(pair=>{pairSet.add(pair);dateSet.add(date);});});
  const pairs=[...pairSet].sort(),dates=[...dateSet].sort().reverse();
  const pairSel=document.getElementById('exportPairSelect');
  pairSel.innerHTML=pairs.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(filterPair!=='all'&&pairs.includes(filterPair))pairSel.value=filterPair;
  const dateSel=document.getElementById('exportDateSelect');
  dateSel.innerHTML=dates.map(d=>`<option value="${d}">${d}</option>`).join('');
  if(selectedDate&&dates.includes(selectedDate))dateSel.value=selectedDate;
}

function getLevelsForExport(){
  const pair=document.getElementById('exportPairSelect').value;
  const date=document.getElementById('exportDateSelect').value;
  const filter=document.getElementById('exportFilterSelect').value;
  const dayObj=journalData[date];
  if(!dayObj||!dayObj[pair])return{pair,date,levels:[],macro:{}};
  let levels=dayObj[pair].levels||[];
  if(filter==='taken')levels=levels.filter(l=>l.trade==='long'||l.trade==='short');
  if(filter==='3plus')levels=levels.filter(l=>(l.stars||1)>=3);
  return{pair,date,levels,macro:dayObj[pair].macro||{}};
}

// ============================================================
// CSV EXPORT — for fixed Pine indicator
// Format per row: entry,dir(1/-1),sl,tp,stars,label
// ============================================================
function generateCSV(){
  const{pair,date,levels,macro}=getLevelsForExport();
  const el=document.getElementById('csvOutput');
  if(levels.length===0){el.textContent='-- No levels match the current filter --';return;}
  el.textContent=buildCSV(pair,date,levels,macro);
}

function buildCSV(pair,date,levels,macro){
  const digits=getDigits(pair);
  const bias=macro.bias||'NEUTRAL';
  const score=macro.score!==undefined?macro.score:'?';
  const vol=macro.volRegime||'NORMAL';

  // Header comment lines (ignored by Pine parser - lines starting with #)
  const header=[
    '# Macro Range Journal — '+pair+' — '+date,
    '# Macro: '+bias+' | Score: '+score+' | Vol: '+vol,
    '# Generated: '+new Date().toLocaleString(),
    '# Paste this entire block into the Level Data input of the MR Journal indicator',
    '# entry,dir,sl,tp,stars,label',
  ].join('\n');

  const rows=levels.map(l=>{
    const entry = typeof l.price==='number' ? l.price.toFixed(digits) : l.price;
    const dir   = l.direction==='long' ? '1' : '-1';
    const sl    = l.slOverride!==undefined ? Number(l.slOverride).toFixed(digits)
                : l.sl ? Number(l.sl).toFixed(digits) : '0';
    const tp    = l.tpOverride!==undefined ? Number(l.tpOverride).toFixed(digits)
                : l.tp ? Number(l.tp).toFixed(digits) : '0';
    const stars = l.stars||1;
    // Label: star count + tags (semicolons safe inside CSV field since we quote it)
    const tagStr=(l.tags||[]).map(t=>t.label).join('+') || 'Fib';
    const taken =(l.trade==='long'||l.trade==='short') ? ' ['+l.trade.toUpperCase()+']' : '';
    const oc    = l.outcome ? ' ['+l.outcome.toUpperCase()+']' : '';
    const label = stars+'* '+tagStr+taken+oc;
    return entry+','+dir+','+sl+','+tp+','+stars+',"'+label+'"';
  });

  return header+'\n'+rows.join('\n');
}

function copyCSV(){
  navigator.clipboard.writeText(document.getElementById('csvOutput').textContent)
    .then(()=>showToast('CSV copied — paste into indicator Level Data input','ok'));
}

function showToast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show '+(type||'');setTimeout(()=>t.classList.remove('show'),2800);}

init();