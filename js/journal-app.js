const JOURNAL_KEY = 'journal_store';
const PAIRS_ALL   = ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','XAU/USD','EUR/GBP','USD/CAD','USD/CHF','GBP/JPY','NAS100_USD'];
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
  // Load cached replay results so level cards show colours on first render
  try{const raw=localStorage.getItem(REPLAY_KV_KEY);if(raw)Object.assign(_replayResults,JSON.parse(raw));}catch(e){}
  selectedDate=todayStr();renderPairNav();renderCalendar();renderQuickStats();renderMain();
  // Now load+merge from KV and re-render if anything changed
  await loadJournal();
  await loadReplayResults();
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
function setPairFilter(p){
  filterPair=p;
  // If selectedDate has no data for the new pair, snap to the nearest date that does
  if(p!=='all'){
    const hasCurrent=journalData[selectedDate]&&journalData[selectedDate][p]&&(journalData[selectedDate][p].levels||[]).length>0;
    if(!hasCurrent){
      const dates=Object.keys(journalData)
        .filter(d=>journalData[d]&&journalData[d][p]&&(journalData[d][p].levels||[]).length>0)
        .sort().reverse();
      if(dates.length>0){
        selectedDate=dates[0];
        const nd=new Date(selectedDate+'T12:00:00');
        calViewYear=nd.getFullYear();calViewMonth=nd.getMonth();
      }
    }
  }
  renderPairNav();renderMain();renderCalendar();
}

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

  // ── Replay cumulative stats ──────────────────────────────────────────────────
  let rpDays=0,rpTp=0,rpSl=0,rpEod=0,rpMissed=0,rpTotal=0,rpR=0;
  const rpByFib={};  // SD → { tp, sl, eod, missed }
  const rpByPairFib={}; // pair → { fib → { tp, sl, eod, missed } }
  for(const [key,payload] of Object.entries(_replayResults)){
    const [pair]=key.split('::');
    if(filterPair!=='all'&&pair!==filterPair)continue;
    if(!payload?.stats)continue;
    rpDays++;
    rpTotal+=payload.stats.total;
    rpTp    +=payload.stats.wins;
    rpSl    +=payload.stats.losses;
    rpEod   +=(payload.stats.eods||0);
    rpMissed+=(payload.stats.total-payload.stats.touched);
    rpR     +=payload.stats.totalR;
    // Fib breakdown
    for(const [fib,s] of Object.entries(payload.byFib||{})){
      if(!rpByFib[fib])rpByFib[fib]={tp:0,sl:0,eod:0,missed:0};
      rpByFib[fib].tp    +=s.tp;
      rpByFib[fib].sl    +=s.sl;
      rpByFib[fib].eod   +=s.eod;
      rpByFib[fib].missed+=(s.touched-(s.tp+s.sl+s.eod));
      // Per-pair fib
      if(filterPair==='all'){
        if(!rpByPairFib[pair])rpByPairFib[pair]={};
        if(!rpByPairFib[pair][fib])rpByPairFib[pair][fib]={tp:0,sl:0,eod:0};
        rpByPairFib[pair][fib].tp  +=s.tp;
        rpByPairFib[pair][fib].sl  +=s.sl;
        rpByPairFib[pair][fib].eod +=s.eod;
      }
    }
  }
  rpR=+rpR.toFixed(2);
  const rpTraded=rpTp+rpSl;
  const rpWr=rpTraded>0?Math.round(rpTp/rpTraded*100):null;
  const rpWrc=rpWr>=60?'vu':rpWr>=45?'vn':rpTraded>0?'vd':'vp';
  const rpRc=rpR>=0?'vu':'vd';

  // Build compact SD table rows (top 6 by volume)
  const fibEntries=Object.entries(rpByFib)
    .sort((a,b)=>(b[1].tp+b[1].sl)-(a[1].tp+a[1].sl))
    .slice(0,6);
  const fibRows=fibEntries.map(([fib,s])=>{
    const traded=s.tp+s.sl;
    const wr2=traded>0?Math.round(s.tp/traded*100):null;
    const wc2=wr2>=60?'vu':wr2>=45?'vn':traded>0?'vd':'vp';
    const label=fib==='other'?'Other':'SD'+fib;
    return`<tr><td style="color:var(--text2)">${label}</td><td class="vu">${s.tp}</td><td class="vd">${s.sl}</td><td class="vn">${s.eod}</td><td class="${wc2}">${wr2!==null?wr2+'%':'—'}</td></tr>`;
  }).join('');

  // Per-pair SD breakdown (compact, only when viewing all pairs and data exists)
  let pairFibHtml='';
  if(filterPair==='all'&&Object.keys(rpByPairFib).length>0){
    pairFibHtml=Object.entries(rpByPairFib).map(([pair,fibs])=>{
      const rows=Object.entries(fibs)
        .filter(([,s])=>s.tp+s.sl>0)
        .sort((a,b)=>(b[1].tp+b[1].sl)-(a[1].tp+a[1].sl))
        .slice(0,4)
        .map(([fib,s])=>{
          const t=s.tp+s.sl;
          const w=t>0?Math.round(s.tp/t*100):null;
          const wc2=w>=60?'vu':w>=45?'vn':t>0?'vd':'vp';
          return`<tr><td style="color:var(--text3);font-size:9px">SD${fib}</td><td class="vu" style="font-size:9px">${s.tp}W</td><td class="vd" style="font-size:9px">${s.sl}L</td><td class="${wc2}" style="font-size:9px">${w!==null?w+'%':'—'}</td></tr>`;
        }).join('');
      if(!rows)return'';
      return`<div style="margin-top:4px"><div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px">${pair}</div><table style="width:100%;border-collapse:collapse">${rows}</table></div>`;
    }).filter(Boolean).join('');
  }

  const rpSection=rpDays>0?`
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="font-size:9px;font-weight:600;color:var(--text3);letter-spacing:.05em;margin-bottom:6px">RUN DAY · ${rpDays} day${rpDays!==1?'s':''} replayed</div>
      <div class="mrow"><span class="mrow-n">W / L / EOD / Miss</span><span class="mrow-v"><span class="vu">${rpTp}</span> / <span class="vd">${rpSl}</span> / <span class="vn">${rpEod}</span> / <span style="color:var(--text3)">${rpMissed}</span></span></div>
      <div class="mrow"><span class="mrow-n">Win rate (traded)</span><span class="mrow-v ${rpWrc}">${rpWr!==null?rpWr+'%':'—'}</span></div>
      <div class="mrow"><span class="mrow-n">Total R</span><span class="mrow-v ${rpRc}">${rpR>=0?'+':''}${rpR}R</span></div>
      ${fibRows?`<div style="margin-top:6px"><div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:3px">BY SD LEVEL</div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="font-size:9px;color:var(--text3);font-weight:400;text-align:left">SD</th><th style="font-size:9px;color:var(--text3);font-weight:400">TP</th><th style="font-size:9px;color:var(--text3);font-weight:400">SL</th><th style="font-size:9px;color:var(--text3);font-weight:400">EOD</th><th style="font-size:9px;color:var(--text3);font-weight:400">W%</th></tr></thead><tbody>${fibRows}</tbody></table></div>`:''}
      ${pairFibHtml?`<div style="margin-top:6px"><div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:3px">BY PAIR · SD</div>${pairFibHtml}</div>`:''}
    </div>`:'';

  document.getElementById('quickStats').innerHTML=`
    <div class="mrow"><span class="mrow-n">Levels saved</span><span class="mrow-v vp">${total}</span></div>
    <div class="mrow"><span class="mrow-n">Trades taken</span><span class="mrow-v vp">${taken}</span></div>
    <div class="mrow"><span class="mrow-n">Win rate</span><span class="mrow-v ${wrc}">${wr}%</span></div>
    <div class="mrow"><span class="mrow-n">W / L / BE</span><span class="mrow-v"><span class="vu">${wins}</span> / <span class="vd">${losses}</span> / <span class="vn">${bes}</span></span></div>
    ${rpSection}`;
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
    html+=renderDayGroup(pair,selectedDate,levels,macro);
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
  // Overlay replay result as a secondary tint (doesn't override manual outcome colour)
  const replayKey=pair+'::'+date;
  const replayPayload=_replayResults[replayKey];
  const replayRes=replayPayload?.results?.[idx];
  let replayBadge='';
  if(replayRes&&replayRes.touched){
    if(!borderCls){
      if(replayRes.result==='tp')borderCls='replay-tp';
      else if(replayRes.result==='sl')borderCls='replay-sl';
      else if(replayRes.result==='eod')borderCls='replay-eod';
    }
    const rVal=replayRes.r!==null?`${replayRes.r>=0?'+':''}${replayRes.r}R`:'';
    const badgeCls=replayRes.result==='tp'?'rp-badge tp':replayRes.result==='sl'?'rp-badge sl':'rp-badge eod';
    replayBadge=`<span class="${badgeCls}" style="font-size:9px;margin-left:6px">${replayRes.touchTime||''} ${rVal}</span>`;
  } else if(replayPayload&&!replayRes?.touched){
    replayBadge=`<span class="rp-badge untouched" style="font-size:9px;margin-left:6px">missed</span>`;
  }
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
  const narrative = levelNarrative(level, pair);
  return `<div class="level-card ${borderCls}">
    <div class="level-top">
      <span class="level-stars">${starsHtml}</span>
      <span class="level-price">${priceStr}${replayBadge}</span>
      <span class="level-dir ${dirCls}">${dirLabel}</span>
      <div class="level-sltp">
        <div class="sltp-item"><span class="sltp-lbl">SL</span><span class="sltp-val sl">${slStr||'&mdash;'}</span></div>
        <div class="sltp-item"><span class="sltp-lbl">TP</span><span class="sltp-val tp">${tpStr||'&mdash;'}</span></div>
      </div>
    </div>
    ${tags?`<div class="level-tags">${tags}</div>`:''}
    ${narrative}
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
function getPipSz(pair){if(pair.includes('JPY'))return 0.01;if(pair.includes('XAU'))return 0.1;return 0.0001;}

function levelNarrative(level, pair) {
  const pipSize = getPipSz(pair);
  const slPx    = level.slOverride ?? level.sl;
  const tpPx    = level.tpOverride ?? level.tp;
  if (!slPx || !tpPx || !level.price) return '';

  const slPips = Math.abs(level.price - slPx) / pipSize;
  const tpPips = Math.abs(level.price - tpPx) / pipSize;
  const rr     = slPips > 0 ? (tpPips / slPips).toFixed(1) : '—';

  // Level name: prefer SD fib number, then first tag, then fallback
  const sdLabel = level.todayFib != null
    ? `SD ${+level.todayFib % 1 === 0 ? level.todayFib.toFixed(1) : level.todayFib}`
    : null;
  const tagLabel = level.tags?.[0]?.label || null;
  const name = sdLabel || tagLabel || 'Level';
  const roundBadge = level.isRoundNumber
    ? '<span style="color:var(--amber);font-size:9px;margin-left:4px">⊙ Round</span>' : '';

  const dirArrow = level.direction === 'long' ? '↑' : '↓';
  const risk  = `${slPips.toFixed(0)}p risk → ${tpPips.toFixed(0)}p reward (${rr}R)`;

  let outcome = '';
  if (level.trade === 'long' || level.trade === 'short') {
    if (level.outcome === 'win')
      outcome = `<span class="lnr-win">✓ Ran to full TP +${tpPips.toFixed(0)}p / +${rr}R</span>`;
    else if (level.outcome === 'loss')
      outcome = `<span class="lnr-loss">✗ SL hit −${slPips.toFixed(0)}p / −1R</span>`;
    else if (level.outcome === 'be')
      outcome = `<span class="lnr-be">~ Break even 0R</span>`;
    else
      outcome = `<span class="lnr-open">▷ Pending · TP ${tpPips.toFixed(0)}p away</span>`;
  } else {
    outcome = `<span class="lnr-skip">Not taken · TP was ${tpPips.toFixed(0)}p</span>`;
  }

  return `<div class="level-narrative"><span class="lnr-name">${name}${roundBadge}</span><span class="lnr-sep">·</span><span class="lnr-dir">${dirArrow}</span><span class="lnr-risk">${risk}</span><span class="lnr-sep">·</span>${outcome}</div>`;
}

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

// ── Aggregate all saved replay results respecting the current filterPair ──────
function collectReplayStats() {
  const agg = { days: 0, total: 0, touched: 0, traded: 0, wins: 0, losses: 0, eods: 0, totalR: 0, byFib: {}, byStar: {}, byPair: {}, byDate: [] };

  for (const [key, payload] of Object.entries(_replayResults)) {
    const [pair, date] = key.split('::');
    if (filterPair !== 'all' && pair !== filterPair) continue;
    if (!payload?.stats) continue;

    agg.days++;
    agg.total   += payload.stats.total;
    agg.touched += payload.stats.touched;
    agg.traded  += payload.stats.traded;
    agg.wins    += payload.stats.wins;
    agg.losses  += payload.stats.losses;
    agg.eods    += (payload.stats.eods || 0);
    agg.totalR  += payload.stats.totalR;

    // By pair
    if (!agg.byPair[pair]) agg.byPair[pair] = { days: 0, touched: 0, traded: 0, wins: 0, losses: 0, eods: 0, r: 0 };
    agg.byPair[pair].days++;
    agg.byPair[pair].touched += payload.stats.touched;
    agg.byPair[pair].traded  += payload.stats.traded;
    agg.byPair[pair].wins    += payload.stats.wins;
    agg.byPair[pair].losses  += payload.stats.losses;
    agg.byPair[pair].eods    += (payload.stats.eods || 0);
    agg.byPair[pair].r       += payload.stats.totalR;

    // By fib (merge across days)
    for (const [fib, s] of Object.entries(payload.byFib || {})) {
      if (!agg.byFib[fib]) agg.byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
      agg.byFib[fib].touched += s.touched;
      agg.byFib[fib].tp      += s.tp;
      agg.byFib[fib].sl      += s.sl;
      agg.byFib[fib].eod     += s.eod;
      agg.byFib[fib].r       += s.r;
    }

    // By star (merge across days)
    for (const [star, s] of Object.entries(payload.byStar || {})) {
      if (!agg.byStar[star]) agg.byStar[star] = { touched: 0, tp: 0, sl: 0, r: 0 };
      agg.byStar[star].touched += s.touched;
      agg.byStar[star].tp      += s.tp;
      agg.byStar[star].sl      += s.sl;
      agg.byStar[star].r       += s.r;
    }

    agg.byDate.push({ date, pair, r: payload.stats.totalR, wins: payload.stats.wins, losses: payload.stats.losses, winRate: payload.stats.winRate });
  }

  agg.totalR  = +agg.totalR.toFixed(2);
  agg.winRate = agg.traded > 0 ? Math.round(agg.wins / agg.traded * 100) : null;
  // Sort byDate descending
  agg.byDate.sort((a, b) => (b.date + b.pair).localeCompare(a.date + a.pair));
  return agg;
}

function renderReplayStatsPanel() {
  const d = collectReplayStats();
  if (d.days === 0) return `<div class="rp-inline-panel" style="margin-bottom:20px;padding:14px;text-align:center;color:var(--text3);font-size:12px">No replay data yet — open a day and click <strong>▶ Run Day</strong> to record results.</div>`;

  const rc  = d.totalR >= 0 ? 'var(--green)' : 'var(--red)';
  const wrc = d.winRate >= 60 ? 'var(--green)' : d.winRate >= 45 ? 'var(--amber)' : d.traded > 0 ? 'var(--red)' : 'var(--text)';

  // Top stats grid
  let html = `<div class="stats-grid" style="margin-bottom:16px">
    <div class="stat-card"><div class="stat-card-lbl">Days Replayed</div><div class="stat-card-val">${d.days}</div><div class="stat-card-sub">${d.total} levels across ${d.days} day${d.days!==1?'s':''}</div></div>
    <div class="stat-card"><div class="stat-card-lbl">Levels Touched</div><div class="stat-card-val">${d.touched}</div><div class="stat-card-sub">${d.total > 0 ? Math.round(d.touched/d.total*100) : 0}% touch rate</div></div>
    <div class="stat-card"><div class="stat-card-lbl">Win Rate</div><div class="stat-card-val" style="color:${wrc}">${d.winRate !== null ? d.winRate + '%' : '—'}</div><div class="stat-card-sub">${d.wins}W · ${d.losses}L · ${d.eods}EOD</div></div>
    <div class="stat-card"><div class="stat-card-lbl">Total R</div><div class="stat-card-val" style="color:${rc}">${d.totalR >= 0 ? '+' : ''}${d.totalR}R</div><div class="stat-card-sub">${d.traded} traded levels</div></div>
  </div>`;

  // By Pair table (only shown when viewing all pairs)
  if (filterPair === 'all' && Object.keys(d.byPair).length > 0) {
    const pairRows = Object.entries(d.byPair)
      .sort((a, b) => b[1].r - a[1].r)
      .map(([p, s]) => {
        const wr = s.traded > 0 ? Math.round(s.wins / s.traded * 100) : null;
        const wc = wr >= 60 ? 'var(--green)' : wr >= 45 ? 'var(--amber)' : s.traded > 0 ? 'var(--red)' : 'var(--text3)';
        const rc2 = s.r >= 0 ? 'var(--green)' : 'var(--red)';
        return `<tr><td>${p}</td><td>${s.days}</td><td>${s.touched}</td><td>${s.traded}</td>`
          + `<td style="color:var(--green)">${s.wins}</td><td style="color:var(--red)">${s.losses}</td><td style="color:var(--amber)">${s.eods}</td>`
          + `<td style="color:${wc}">${wr !== null ? wr + '%' : '—'}</td>`
          + `<td style="color:${rc2};font-family:'DM Mono',monospace">${s.r >= 0 ? '+' : ''}${s.r.toFixed(2)}R</td></tr>`;
      }).join('');
    html += `<div class="sec-lbl" style="margin-bottom:8px">By Pair <span class="sec-badge">REPLAY</span></div>
      <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:16px">
      <table class="breakdown-table"><thead><tr><th>Pair</th><th>Days</th><th>Touched</th><th>Traded</th><th>W</th><th>L</th><th>EOD</th><th>Win%</th><th>R</th></tr></thead><tbody>${pairRows}</tbody></table></div>`;
  }

  // By SD/Fib table
  if (Object.keys(d.byFib).length > 0) {
    const fibRows = Object.entries(d.byFib)
      .sort((a, b) => { const na=parseFloat(a[0]),nb=parseFloat(b[0]); if(!isNaN(na)&&!isNaN(nb))return na-nb; return a[0].localeCompare(b[0]); })
      .map(([fib, s]) => {
        const traded = s.tp + s.sl + s.eod;
        const wr = traded > 0 ? Math.round(s.tp / traded * 100) : null;
        const wc = wr >= 60 ? 'vu' : wr >= 45 ? 'vn' : traded > 0 ? 'vd' : '';
        const rc2 = s.r >= 0 ? 'vu' : 'vd';
        const fibLabel = fib==='asia'?'Asia Fib':fib==='monday'?'Mon Fib':fib==='other'?'Other':'SD'+fib;
        return `<tr><td>${fibLabel}</td><td>${s.touched}</td>`
          + `<td class="vu">${s.tp}</td><td class="vd">${s.sl}</td><td class="vn">${s.eod}</td>`
          + `<td class="mono ${rc2}">${s.r >= 0 ? '+' : ''}${s.r.toFixed(2)}R</td><td class="${wc}">${wr !== null ? wr + '%' : '—'}</td></tr>`;
      }).join('');
    html += `<div class="sec-lbl" style="margin-bottom:8px">By SD Level <span class="sec-badge purple">REPLAY</span></div>
      <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:16px">
      <table class="breakdown-table"><thead><tr><th>SD</th><th>Touched</th><th>TP</th><th>SL</th><th>EOD</th><th>R</th><th>Win%</th></tr></thead><tbody>${fibRows}</tbody></table></div>`;
  }

  // By Star table
  if (Object.keys(d.byStar).length > 0) {
    const starRows = Object.entries(d.byStar)
      .sort((a, b) => +b[0] - +a[0])
      .map(([star, s]) => {
        const traded = s.tp + s.sl;
        const wr = traded > 0 ? Math.round(s.tp / traded * 100) : null;
        const wc = wr >= 60 ? 'vu' : wr >= 45 ? 'vn' : traded > 0 ? 'vd' : '';
        const rc2 = s.r >= 0 ? 'vu' : 'vd';
        return `<tr><td><span style="color:var(--amber)">${'★'.repeat(Math.min(+star,5))}</span> ${star}★</td>`
          + `<td>${s.touched}</td><td class="vu">${s.tp}</td><td class="vd">${s.sl}</td>`
          + `<td class="mono ${rc2}">${s.r >= 0 ? '+' : ''}${s.r.toFixed(2)}R</td><td class="${wc}">${wr !== null ? wr + '%' : '—'}</td></tr>`;
      }).join('');
    html += `<div class="sec-lbl" style="margin-bottom:8px">By Star Rating <span class="sec-badge">REPLAY</span></div>
      <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:16px">
      <table class="breakdown-table"><thead><tr><th>Stars</th><th>Touched</th><th>TP</th><th>SL</th><th>R</th><th>Win%</th></tr></thead><tbody>${starRows}</tbody></table></div>`;
  }

  // Recent days log
  if (d.byDate.length > 0) {
    const dateRows = d.byDate.slice(0, 20).map(({ date, pair, r, wins, losses, winRate }) => {
      const rc2 = r >= 0 ? 'var(--green)' : 'var(--red)';
      const wc  = winRate >= 60 ? 'var(--green)' : winRate >= 45 ? 'var(--amber)' : winRate !== null ? 'var(--red)' : 'var(--text3)';
      return `<tr><td>${date}</td><td>${pair}</td>`
        + `<td style="color:var(--green)">${wins}</td><td style="color:var(--red)">${losses}</td>`
        + `<td style="color:${wc}">${winRate !== null ? winRate + '%' : '—'}</td>`
        + `<td style="color:${rc2};font-family:'DM Mono',monospace">${r >= 0 ? '+' : ''}${r}R</td>`
        + `<td><button class="dark-btn" style="padding:2px 8px;font-size:10px" onclick="selectDate('${date}');setPairFilter('${pair}');setView('day')">View</button></td></tr>`;
    }).join('');
    html += `<div class="sec-lbl" style="margin-bottom:8px">Replayed Days <span class="sec-badge">LOG</span></div>
      <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:4px">
      <table class="breakdown-table"><thead><tr><th>Date</th><th>Pair</th><th>W</th><th>L</th><th>Win%</th><th>R</th><th></th></tr></thead><tbody>${dateRows}</tbody></table></div>`;
  }

  return html;
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
    <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:24px"><table class="breakdown-table"><thead><tr><th>Stars</th><th>Levels</th><th>Taken</th><th>W</th><th>L</th><th>Win%</th></tr></thead><tbody>${starRows||'<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:16px">No data yet</td></tr>'}</tbody></table></div>
    <div style="font-size:15px;font-weight:700;margin-bottom:12px;padding-top:4px;border-top:1px solid var(--border)">Replay Performance${filterPair!=='all'?`<span style="font-size:12px;color:var(--text3);font-weight:400;margin-left:8px">${filterPair}</span>`:''} <span class="sec-badge purple" style="vertical-align:middle;font-size:10px">BACKTESTED</span></div>
    ${renderReplayStatsPanel()}`;
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
function exportPairDate(pair,date){
  openExportModal();
  setTimeout(()=>{
    const pairSel=document.getElementById('exportPairSelect');
    pairSel.value=pair;
    _refreshExportDates(pair);               // re-filter dates for this pair before setting
    const dateSel=document.getElementById('exportDateSelect');
    if([...dateSel.options].some(o=>o.value===date))dateSel.value=date;
    generateCSV();
  },50);
}

function populateExportSelects(){
  const pairSet=new Set(),dateSet=new Set();
  Object.entries(journalData).forEach(([date,dayObj])=>{Object.keys(dayObj).forEach(pair=>{pairSet.add(pair);dateSet.add(date);});});
  const pairs=[...pairSet].sort();
  const pairSel=document.getElementById('exportPairSelect');
  pairSel.innerHTML=`<option value="__all__">All Pairs</option>`+pairs.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(filterPair!=='all'&&pairs.includes(filterPair))pairSel.value=filterPair;
  // Populate dates filtered to the current pair selection
  _refreshExportDates(pairSel.value);
}

// Re-populates the date dropdown filtered to only dates where the selected pair has levels.
// Called on initial populate and whenever the pair select changes.
function _refreshExportDates(pair){
  const dateSel=document.getElementById('exportDateSelect');
  const current=dateSel.value;
  let dates;
  if(pair==='__all__'){
    const dateSet=new Set();
    Object.keys(journalData).forEach(d=>{if(journalData[d])dateSet.add(d);});
    dates=[...dateSet].sort().reverse();
  }else{
    dates=Object.keys(journalData)
      .filter(d=>journalData[d]&&journalData[d][pair]&&(journalData[d][pair].levels||[]).length>0)
      .sort().reverse();
  }
  dateSel.innerHTML=dates.length
    ? dates.map(d=>`<option value="${d}">${d}</option>`).join('')
    : `<option value="">-- No data for this pair --</option>`;
  // Restore previous selection if still valid, otherwise fall back to most recent
  if(current&&dates.includes(current))dateSel.value=current;
  else if(selectedDate&&dates.includes(selectedDate))dateSel.value=selectedDate;
}

function onExportPairChange(){_refreshExportDates(document.getElementById('exportPairSelect').value);generateCSV();}

// Shared filter logic — applies star, taken-only, and max-rows filters for one pair/date.
function getFilteredLevels(pair,date){
  const dayObj=journalData[date];
  if(!dayObj||!dayObj[pair])return{levels:[],macro:{}};
  let levels=dayObj[pair].levels||[];

  const checkedStars=[...document.querySelectorAll('.star-cb:checked')].map(el=>parseInt(el.value,10));
  if(checkedStars.length>0)levels=levels.filter(l=>checkedStars.includes(l.stars||1));

  if(document.getElementById('exportTakenOnly')?.checked)
    levels=levels.filter(l=>l.trade==='long'||l.trade==='short');

  const maxVal=parseInt(document.getElementById('exportMaxRows')?.value,10);
  if(!isNaN(maxVal)&&maxVal>0)levels=levels.slice(0,maxVal);

  return{levels,macro:dayObj[pair].macro||{}};
}

function getLevelsForExport(){
  const pair=document.getElementById('exportPairSelect').value;
  const date=document.getElementById('exportDateSelect').value;
  const{levels,macro}=getFilteredLevels(pair,date);
  return{pair,date,levels,macro};
}

// ============================================================
// CSV EXPORT — for fixed Pine indicator
// Format per row: entry,dir(1/-1),sl,tp,stars,label
// ============================================================
function generateCSV(){
  const pair=document.getElementById('exportPairSelect').value;
  const date=document.getElementById('exportDateSelect').value;
  const el=document.getElementById('csvOutput');

  if(pair==='__all__'){
    const dayObj=journalData[date];
    if(!dayObj){el.textContent='-- No data for selected date --';return;}
    const blocks=Object.keys(dayObj).sort().map(p=>{
      const{levels,macro}=getFilteredLevels(p,date);
      return levels.length>0?buildCSV(p,date,levels,macro):null;
    }).filter(Boolean);
    el.textContent=blocks.length>0?blocks.join('\n\n'):'-- No levels match the current filter --';
    return;
  }

  const{levels,macro}=getFilteredLevels(pair,date);
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

// ═══════════════════════════════════════════════════════════════════════════════
// REPLAY ENGINE  — runs on main thread (no Worker) for reliability
// ═══════════════════════════════════════════════════════════════════════════════

const REPLAY_KV_KEY = 'journal_replay_store';
const _replayResults = {};   // key: `${pair}::${date}` → payload (in-memory cache)

// Load saved replay results from KV/localStorage on startup
async function loadReplayResults() {
  try {
    const raw = localStorage.getItem(REPLAY_KV_KEY);
    if (raw) Object.assign(_replayResults, JSON.parse(raw));
  } catch(e) {}
  try {
    const kv = await kvGet(REPLAY_KV_KEY);
    if (kv?.data) Object.assign(_replayResults, kv.data);
  } catch(e) {}
}

function saveReplayResults() {
  try { localStorage.setItem(REPLAY_KV_KEY, JSON.stringify(_replayResults)); } catch(e) {}
  kvSet(REPLAY_KV_KEY, _replayResults);
}

function safePairId(pair) { return pair.replace(/\//g, '-').replace(/_/g, '-'); }

// ── Modal open/close ──────────────────────────────────────────────────────────

function openReplayModal(pair, date) {
  const modal = document.getElementById('replayModal');
  if (!modal) { alert('Replay modal missing from page — please hard-refresh (Ctrl+Shift+R)'); return; }

  const titleEl = document.getElementById('rp-pair-title');
  const symbolEl = document.getElementById('rp-symbol');
  if (titleEl)  titleEl.textContent  = pair + ' · ' + date;
  if (symbolEl) symbolEl.textContent = pair;

  modal.dataset.pair = pair;
  modal.dataset.date = date;
  modal.classList.add('open');

  // Reset star filter to "All" for each new open
  const starSel = document.getElementById('rp-min-stars');
  if (starSel) starSel.value = '1';
  _lastReplayPayload = null;

  const key    = pair + '::' + date;
  const cached = _replayResults[key];
  const btn    = document.getElementById('rp-fetch-btn');
  if (btn) { btn.disabled = false; btn.textContent = '▶ Fetch & Run'; }

  if (cached) {
    setReplayStatus(`Cached — ${cached.stats.touched}/${cached.stats.total} touched`, 'rp-fetch-ok');
    renderReplayInModal(cached);
  } else {
    setReplayStatus(`Ready — will fetch ${pair} M1 from Oanda`, 'rp-fetch-idle');
    const ra = document.getElementById('rp-result-area');
    if (ra) ra.innerHTML = '';
  }
}

function closeReplayModal() { document.getElementById('replayModal').classList.remove('open'); }

function setReplayStatus(msg, cls) {
  const el = document.getElementById('rp-fetch-status');
  if (el) { el.textContent = msg; el.className = cls; }
}

// ── Main entry point — fetch M1 then replay, all on main thread ───────────────

async function fetchAndReplay() {
  const modal = document.getElementById('replayModal');
  const pair  = modal.dataset.pair;
  const date  = modal.dataset.date;

  const btn = document.getElementById('rp-fetch-btn');
  btn.disabled = true;
  btn.textContent = '…';
  setReplayStatus(`Fetching ${pair} M1 from Oanda…`, 'rp-fetch-loading');
  document.getElementById('rp-result-area').innerHTML = '<div class="rp-loading">Fetching M1 bars from Oanda…</div>';

  // ── 1. Fetch M1 bars ──────────────────────────────────────────────────────
  let bars;
  try {
    const url = `/api/oanda_ohlc1m?symbol=${encodeURIComponent(pair)}&date=${encodeURIComponent(date)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.values?.length) throw new Error(`No M1 bars for ${pair} on ${date} — market may have been closed.`);
    bars = data.values.map(v => {
      const dt   = v.datetime || '';
      const hour = parseInt(dt.slice(11, 13), 10);
      const min  = parseInt(dt.slice(14, 16), 10);
      return { h: +v.high, l: +v.low, o: +v.open, c: +v.close, hour, min };
    });
  } catch(e) {
    setReplayStatus(e.message, 'rp-fetch-err');
    document.getElementById('rp-result-area').innerHTML = `<div class="rp-error">${e.message}</div>`;
    btn.disabled = false; btn.textContent = '▶ Fetch & Run';
    return;
  }

  setReplayStatus(`${bars.length} bars — running replay…`, 'rp-fetch-ok');
  document.getElementById('rp-result-area').innerHTML = '<div class="rp-loading">Running replay…</div>';

  // ── 2. Run replay synchronously ───────────────────────────────────────────
  const dayObj = journalData[date]?.[pair];
  if (!dayObj?.levels?.length) {
    document.getElementById('rp-result-area').innerHTML = '<div class="rp-error">No levels to replay for this pair/date.</div>';
    btn.disabled = false; btn.textContent = '▶ Fetch & Run';
    return;
  }

  const payload = runReplayEngine(pair, date, bars, dayObj.levels);

  // ── 3. Cache + persist ────────────────────────────────────────────────────
  const key = pair + '::' + date;
  _replayResults[key] = payload;
  saveReplayResults();
  renderQuickStats();

  // ── 4. Render ─────────────────────────────────────────────────────────────
  setReplayStatus(`Done — ${payload.stats.touched}/${payload.stats.total} touched · ${payload.stats.totalR >= 0 ? '+' : ''}${payload.stats.totalR}R`, 'rp-fetch-ok');
  renderReplayInModal(payload);
  updateInlineDayPanel(pair, date, payload);
  if (currentView === 'day' && selectedDate === date) renderMain();

  btn.disabled = false; btn.textContent = '▶ Fetch & Run';
}

function runReplay() { fetchAndReplay(); }   // Re-run button calls same path

// ── Replay computation (pure — no I/O) ────────────────────────────────────────

function runReplayEngine(pair, date, allBars, levels) {
  const pip = getPipSz(pair);
  const windowBars = allBars.filter(b => b.hour * 60 + b.min >= 480 && b.hour * 60 + b.min < 1260);

  const results = [];
  let runningR = 0;
  const equity = [{ label: 'Start', r: 0, cumR: 0 }];

  for (let li = 0; li < levels.length; li++) {
    const level      = levels[li];
    const entryPrice = level.price;
    const dir        = level.direction;
    const sl         = level.slOverride ?? level.sl;
    const tp         = level.tpOverride ?? level.tp;
    const stars      = level.stars || 1;

    if (!entryPrice || !dir || !sl || !tp) {
      results.push({ level, touched: false, result: 'no-data', r: null, touchTime: null, exitTime: null, maxFav: null, maxAdv: null, chartBars: null, entryPrice, sl, tp, dir });
      continue;
    }
    const slDist = Math.abs(entryPrice - sl);
    const tpDist = Math.abs(entryPrice - tp);
    if (slDist <= 0) {
      results.push({ level, touched: false, result: 'no-sl', r: null, touchTime: null, exitTime: null, maxFav: null, maxAdv: null, chartBars: null, entryPrice, sl, tp, dir });
      continue;
    }

    let touched = false, touchTime = null, result = 'untouched', r = null;
    let exitTime = null, maxFav = 0, maxAdv = 0, inTrade = false;
    let touchBarIdx = -1, exitBarIdx = -1;

    for (let bi = 0; bi < windowBars.length; bi++) {
      const bar     = windowBars[bi];
      const barMins = bar.hour * 60 + bar.min;

      if (!inTrade && bar.l <= entryPrice + pip * 0.5 && bar.h >= entryPrice - pip * 0.5) {
        touched = true; inTrade = true; touchBarIdx = bi;
        touchTime = hhmm(bar);
      }
      if (inTrade) {
        const fav = dir === 'long' ? (bar.h - entryPrice) / pip : (entryPrice - bar.l) / pip;
        const adv = dir === 'long' ? (entryPrice - bar.l) / pip : (bar.h - entryPrice) / pip;
        if (fav > maxFav) maxFav = fav;
        if (adv > maxAdv) maxAdv = adv;

        if (dir === 'long') {
          if (bar.l <= sl) { result = 'sl'; r = -1; exitTime = hhmm(bar); exitBarIdx = bi; break; }
          if (bar.h >= tp) { result = 'tp'; r = tpDist / slDist; exitTime = hhmm(bar); exitBarIdx = bi; break; }
        } else {
          if (bar.h >= sl) { result = 'sl'; r = -1; exitTime = hhmm(bar); exitBarIdx = bi; break; }
          if (bar.l <= tp) { result = 'tp'; r = tpDist / slDist; exitTime = hhmm(bar); exitBarIdx = bi; break; }
        }
        if (barMins >= 1259) {
          const eodPnl = dir === 'long' ? bar.c - entryPrice : entryPrice - bar.c;
          r = Math.max(-1, Math.min(tpDist / slDist, eodPnl / slDist));
          result = 'eod'; exitTime = '21:00'; exitBarIdx = bi; break;
        }
      }
    }

    if (inTrade && result === 'untouched') result = 'open';
    if (!touched) { result = 'untouched'; r = null; }

    // Slice chart bars: 12 before touch → exit + 8 after
    let chartBars = null;
    if (touchBarIdx >= 0) {
      const from = Math.max(0, touchBarIdx - 12);
      const to   = Math.min(windowBars.length, (exitBarIdx >= 0 ? exitBarIdx : touchBarIdx + 30) + 8);
      chartBars = windowBars.slice(from, to).map((b, i) => ({
        ...b,
        isTouchBar: (from + i) === touchBarIdx,
        isExitBar:  exitBarIdx >= 0 && (from + i) === exitBarIdx,
      }));
    }

    if (r !== null) {
      runningR += r;
      equity.push({ label: `${stars}★ ${level.todayFib != null ? 'SD' + level.todayFib : ''}`, r: +r.toFixed(2), cumR: +runningR.toFixed(2), result, touchTime });
    }

    results.push({ level, touched, result, r: r !== null ? +r.toFixed(2) : null, touchTime, exitTime, maxFav: maxFav > 0 ? +maxFav.toFixed(1) : null, maxAdv: maxAdv > 0 ? +maxAdv.toFixed(1) : null, chartBars, entryPrice, sl, tp, dir });
  }

  const traded  = results.filter(r => r.result === 'tp' || r.result === 'sl' || r.result === 'eod');
  const wins    = traded.filter(r => r.result === 'tp');
  const losses  = traded.filter(r => r.result === 'sl');
  const eods    = traded.filter(r => r.result === 'eod');
  const touched = results.filter(r => r.touched);
  const totalR  = +traded.reduce((s, r) => s + (r.r || 0), 0).toFixed(2);

  const byFib = {}, byStar = {};
  for (const res of results) {
    // Use todayFib (the SD number) if available; fall back to 'asia'/'monday' source label
    // so levels don't all collapse into a meaningless 'other' bucket.
    let fib;
    if (res.level.todayFib != null) {
      fib = String(res.level.todayFib);
    } else if (res.level.source === 'asia' || res.level.source === 'monday') {
      fib = res.level.source;
    } else {
      // Try to infer from tags
      const tagLabels = (res.level.tags || []).map(t => (t.label || '').toLowerCase());
      if (tagLabels.some(l => l.includes('asia')))   fib = 'asia';
      else if (tagLabels.some(l => l.includes('mon'))) fib = 'monday';
      else fib = 'other';
    }
    if (!byFib[fib]) byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
    if (res.touched) byFib[fib].touched++;
    if (res.result === 'tp')  { byFib[fib].tp++;  byFib[fib].r += res.r; }
    if (res.result === 'sl')  { byFib[fib].sl++;  byFib[fib].r -= 1; }
    if (res.result === 'eod') { byFib[fib].eod++; byFib[fib].r += res.r; }
    const s = String(res.level.stars || 1);
    if (!byStar[s]) byStar[s] = { touched: 0, tp: 0, sl: 0, r: 0 };
    if (res.touched) byStar[s].touched++;
    if (res.result === 'tp')  { byStar[s].tp++; byStar[s].r += res.r; }
    if (res.result === 'sl')  { byStar[s].sl++; byStar[s].r -= 1; }
  }

  return { pair, date, results, equity, byFib, byStar, stats: { total: results.length, touched: touched.length, traded: traded.length, wins: wins.length, losses: losses.length, eods: eods.length, totalR, winRate: traded.length > 0 ? Math.round(wins.length / traded.length * 100) : null } };
}

function hhmm(bar) { return `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`; }

let _lastReplayPayload = null; // for star filter re-render

function rpApplyStarFilter() {
  if (!_lastReplayPayload) return;
  const minStars = parseInt(document.getElementById('rp-min-stars')?.value || '1', 10);
  renderReplayInModal(_lastReplayPayload, minStars);
}

function renderReplayInModal(payload, minStars) {
  _lastReplayPayload = payload;
  const min = minStars ?? parseInt(document.getElementById('rp-min-stars')?.value || '1', 10);
  const el = document.getElementById('rp-result-area');
  if (!el) return;

  if (min <= 1) {
    el.innerHTML = buildReplayHTML(payload);
    return;
  }

  // Filter results to only levels meeting the star threshold, recompute breakdown tables
  const filteredResults = payload.results.filter(r => (r.level.stars || 1) >= min);
  const traded  = filteredResults.filter(r => r.result === 'tp' || r.result === 'sl' || r.result === 'eod');
  const wins    = traded.filter(r => r.result === 'tp');
  const losses  = traded.filter(r => r.result === 'sl');
  const eods    = traded.filter(r => r.result === 'eod');
  const touched = filteredResults.filter(r => r.touched);
  const totalR  = +traded.reduce((s, r) => s + (r.r || 0), 0).toFixed(2);

  // Rebuild byFib + byStar from filtered set
  const byFib = {}, byStar = {};
  for (const res of filteredResults) {
    let fib;
    if (res.level.todayFib != null) fib = String(res.level.todayFib);
    else if (res.level.source === 'asia' || res.level.source === 'monday') fib = res.level.source;
    else {
      const tl = (res.level.tags || []).map(t => (t.label || '').toLowerCase());
      fib = tl.some(l => l.includes('asia')) ? 'asia' : tl.some(l => l.includes('mon')) ? 'monday' : 'other';
    }
    if (!byFib[fib]) byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
    if (res.touched) byFib[fib].touched++;
    if (res.result === 'tp')  { byFib[fib].tp++;  byFib[fib].r += res.r; }
    if (res.result === 'sl')  { byFib[fib].sl++;  byFib[fib].r -= 1; }
    if (res.result === 'eod') { byFib[fib].eod++; byFib[fib].r += res.r; }
    const s = String(res.level.stars || 1);
    if (!byStar[s]) byStar[s] = { touched: 0, tp: 0, sl: 0, r: 0 };
    if (res.touched) byStar[s].touched++;
    if (res.result === 'tp')  { byStar[s].tp++; byStar[s].r += res.r; }
    if (res.result === 'sl')  { byStar[s].sl++; byStar[s].r -= 1; }
  }

  // Rebuild equity curve for filtered set
  let running = 0;
  const equity = [{ label: 'Start', r: 0, cumR: 0 }];
  for (const res of filteredResults) {
    if (res.result === 'tp' || res.result === 'sl' || res.result === 'eod') {
      running += res.r || 0;
      equity.push({ label: '', r: res.r || 0, cumR: +running.toFixed(2), result: res.result });
    }
  }

  const filteredPayload = {
    ...payload,
    results: filteredResults,
    equity,
    byFib,
    byStar,
    stats: { total: filteredResults.length, touched: touched.length, traded: traded.length, wins: wins.length, losses: losses.length, eods: eods.length, totalR, winRate: traded.length > 0 ? Math.round(wins.length / traded.length * 100) : null },
  };
  el.innerHTML = buildReplayHTML(filteredPayload);
}

function updateInlineDayPanel(pair, date, payload) {
  const panelEl = document.getElementById(`rp-inline-${safePairId(pair)}-${date}`);
  if (panelEl) panelEl.outerHTML = buildInlineReplayPanel(pair, date, payload);
}

function rpToggleChart(id) {
  const row = document.getElementById(id);
  if (!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : 'table-row';
  // Rotate chevron button
  const btn = row.previousElementSibling?.querySelector('.rp-chevron');
  if (btn) btn.textContent = open ? '▶' : '▼';
}

function buildCandleChart(res) {
  const bars       = res.chartBars;
  const entryPrice = res.entryPrice;
  const sl         = res.sl;
  const tp         = res.tp;
  const dir        = res.dir;
  const result     = res.result;

  // Hardcoded colours — CSS custom properties don't work in SVG fill/stroke attributes
  const isDark   = document.body.classList.contains('dark');
  const C = {
    green:   '#0a8a5c',
    red:     '#c8222a',
    blue:    '#1847c2',
    amber:   '#b45309',
    grey:    isDark ? '#2a2f45' : '#dde3ee',
    text3:   isDark ? '#5a6380' : '#8fa0b8',
    bg:      isDark ? '#0f1117' : '#f4f6fb',
    canvBg:  isDark ? '#1a1d27' : '#ffffff',
  };

  // Chart dimensions
  const W = 600, H = 170;
  const padL = 8, padR = 56, padT = 14, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Price range — include SL, TP, entry and all bar wicks with 10% padding
  const allPrices = bars.flatMap(b => [b.h, b.l]);
  allPrices.push(entryPrice, sl, tp);
  let priceMin = Math.min(...allPrices);
  let priceMax = Math.max(...allPrices);
  const priceRange = priceMax - priceMin || entryPrice * 0.001;
  priceMin -= priceRange * 0.10;
  priceMax += priceRange * 0.10;
  const priceSpan = priceMax - priceMin;

  const px = (i) => padL + (i + 0.5) * (chartW / bars.length);
  const py = (p) => padT + chartH - (p - priceMin) / priceSpan * chartH;
  const candleW = Math.max(1.5, Math.min(9, chartW / bars.length * 0.65));
  const digits  = entryPrice > 20 ? 2 : 5;
  const fmt     = (p) => p.toFixed(digits);

  // Background
  let svg = `<rect width="${W}" height="${H}" fill="${C.canvBg}" rx="4"/>`;

  // Shaded zones
  const entryY = py(entryPrice);
  const slY    = py(sl);
  const tpY    = py(tp);
  svg += `<rect x="${padL}" y="${Math.min(entryY,slY)}" width="${chartW}" height="${Math.abs(slY-entryY)}" fill="${C.red}" opacity="0.06"/>`;
  svg += `<rect x="${padL}" y="${Math.min(entryY,tpY)}" width="${chartW}" height="${Math.abs(tpY-entryY)}" fill="${C.green}" opacity="0.06"/>`;

  // Candles
  for (let i = 0; i < bars.length; i++) {
    const b    = bars[i];
    const x    = px(i);
    const isUp = b.c >= b.o;
    const col  = isUp ? C.green : C.red;
    const bodyT = py(Math.max(b.o, b.c));
    const bodyB = py(Math.min(b.o, b.c));
    const bodyH = Math.max(1, bodyB - bodyT);

    if (b.isTouchBar) {
      svg += `<rect x="${x - candleW * 1.5}" y="${padT}" width="${candleW * 3}" height="${chartH}" fill="${C.blue}" opacity="0.09" rx="2"/>`;
    }
    if (b.isExitBar) {
      const ec = result === 'tp' ? C.green : result === 'sl' ? C.red : C.amber;
      svg += `<rect x="${x - candleW * 1.5}" y="${padT}" width="${candleW * 3}" height="${chartH}" fill="${ec}" opacity="0.12" rx="2"/>`;
    }

    svg += `<line x1="${x}" y1="${py(b.h)}" x2="${x}" y2="${py(b.l)}" stroke="${col}" stroke-width="1"/>`;
    svg += `<rect x="${x - candleW/2}" y="${bodyT}" width="${candleW}" height="${bodyH}" fill="${col}" rx="0.5"/>`;
  }

  // Price lines
  const rightX = padL + chartW;
  svg += `<line x1="${padL}" y1="${entryY}" x2="${rightX}" y2="${entryY}" stroke="${C.blue}" stroke-width="1.2" stroke-dasharray="5,3"/>`;
  svg += `<text x="${rightX+3}" y="${entryY+4}" font-size="8" fill="${C.blue}" font-family="DM Mono,monospace">${fmt(entryPrice)}</text>`;
  svg += `<line x1="${padL}" y1="${slY}" x2="${rightX}" y2="${slY}" stroke="${C.red}" stroke-width="1.2" stroke-dasharray="3,3"/>`;
  svg += `<text x="${rightX+3}" y="${slY+4}" font-size="8" fill="${C.red}" font-family="DM Mono,monospace">SL ${fmt(sl)}</text>`;
  svg += `<line x1="${padL}" y1="${tpY}" x2="${rightX}" y2="${tpY}" stroke="${C.green}" stroke-width="1.2" stroke-dasharray="3,3"/>`;
  svg += `<text x="${rightX+3}" y="${tpY+4}" font-size="8" fill="${C.green}" font-family="DM Mono,monospace">TP ${fmt(tp)}</text>`;

  // Entry arrow at touch bar
  const touchIdx = bars.findIndex(b => b.isTouchBar);
  if (touchIdx >= 0) {
    const ax = px(touchIdx);
    if (dir === 'long') {
      const ay = Math.min(py(sl) + 12, padT + chartH - 2);
      svg += `<polygon points="${ax},${ay-9} ${ax-5},${ay} ${ax+5},${ay}" fill="${C.blue}"/>`;
    } else {
      const ay = Math.max(py(sl) - 12, padT + 2);
      svg += `<polygon points="${ax},${ay+9} ${ax-5},${ay} ${ax+5},${ay}" fill="${C.blue}"/>`;
    }
  }

  // Exit badge
  const exitIdx = bars.findIndex(b => b.isExitBar);
  if (exitIdx >= 0) {
    const ex  = px(exitIdx);
    const ec  = result === 'tp' ? C.green : result === 'sl' ? C.red : C.amber;
    const ey  = result === 'tp' ? tpY - 6 : result === 'sl' ? slY + 15 : entryY - 6;
    svg += `<rect x="${ex-11}" y="${ey-9}" width="22" height="12" rx="3" fill="${ec}"/>`;
    svg += `<text x="${ex}" y="${ey}" font-size="8" fill="white" text-anchor="middle" font-weight="bold" font-family="DM Sans,sans-serif">${result.toUpperCase()}</text>`;
  }

  // Time axis
  const step = Math.max(1, Math.round(bars.length / 8));
  for (let i = 0; i < bars.length; i += step) {
    svg += `<text x="${px(i)}" y="${H-5}" font-size="7.5" fill="${C.text3}" text-anchor="middle" font-family="DM Mono,monospace">${bars[i].t}</text>`;
  }

  return `<svg class="rp-candle-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

function buildReplayHTML(payload) {
  const { results, equity, stats, byFib, byStar } = payload;

  // ── Summary bar ──
  const wrc = stats.winRate >= 60 ? 'vu' : stats.winRate >= 45 ? 'vn' : stats.traded > 0 ? 'vd' : 'vp';
  const rc  = stats.totalR >= 0 ? 'vu' : 'vd';
  let summaryHtml = `<div class="rp-summary">
    <div class="rp-stat"><span class="rp-stat-lbl">Levels</span><span class="rp-stat-val">${stats.total}</span></div>
    <div class="rp-stat"><span class="rp-stat-lbl">Touched</span><span class="rp-stat-val">${stats.touched}</span></div>
    <div class="rp-stat"><span class="rp-stat-lbl">TP</span><span class="rp-stat-val vu">${stats.wins}</span></div>
    <div class="rp-stat"><span class="rp-stat-lbl">SL</span><span class="rp-stat-val vd">${stats.losses}</span></div>
    <div class="rp-stat"><span class="rp-stat-lbl">EOD</span><span class="rp-stat-val vn">${stats.eods}</span></div>
    <div class="rp-stat"><span class="rp-stat-lbl">Win%</span><span class="rp-stat-val ${wrc}">${stats.winRate !== null ? stats.winRate + '%' : '—'}</span></div>
    <div class="rp-stat"><span class="rp-stat-lbl">Total R</span><span class="rp-stat-val ${rc}">${stats.totalR > 0 ? '+' : ''}${stats.totalR}R</span></div>
  </div>`;

  // ── Equity curve (CSS-only sparkline) ──
  let equityHtml = '';
  if (equity.length > 1) {
    const vals = equity.map(e => e.cumR);
    const mn   = Math.min(...vals), mx = Math.max(...vals);
    const range = mx - mn || 1;
    const pts   = equity.map((e, i) => {
      const x = Math.round(i / (equity.length - 1) * 280);
      const y = Math.round(80 - (e.cumR - mn) / range * 70);
      return `${x},${y}`;
    }).join(' ');
    const zeroY  = Math.round(80 - (0 - mn) / range * 70);
    const lineCol = stats.totalR >= 0 ? 'var(--green)' : 'var(--red)';
    equityHtml = `<div class="rp-equity-wrap">
      <div class="rp-sec-lbl">Running R</div>
      <svg class="rp-equity-svg" viewBox="0 0 280 90" preserveAspectRatio="none">
        <line x1="0" y1="${zeroY}" x2="280" y2="${zeroY}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
        <polyline points="${pts}" fill="none" stroke="${lineCol}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${equity.map((e, i) => {
          if (!e.result) return '';
          const x = Math.round(i / Math.max(equity.length - 1, 1) * 280);
          const y = Math.round(80 - (e.cumR - mn) / range * 70);
          const col = e.result === 'tp' ? 'var(--green)' : e.result === 'sl' ? 'var(--red)' : 'var(--amber)';
          return `<circle cx="${x}" cy="${y}" r="3" fill="${col}"/>`;
        }).join('')}
      </svg>
      <div class="rp-equity-labels">
        <span class="vd">Low ${mn.toFixed(1)}R</span>
        <span style="font-size:9px;color:var(--text3)">${equity.length - 1} trades</span>
        <span class="vu">High ${mx.toFixed(1)}R</span>
      </div>
    </div>`;
  }

  // ── Level replay table ──
  let tableHtml = `<div class="rp-sec-lbl" style="margin-top:14px">Level by Level</div>
    <div class="rp-table-wrap"><table class="rp-table">
    <thead><tr><th></th><th>SD</th><th>Price</th><th>Dir</th><th>Stars</th><th>Touch</th><th>Exit</th><th>Result</th><th>R</th><th>MaxFav</th><th>MaxAdv</th></tr></thead><tbody>`;

  for (let ri = 0; ri < results.length; ri++) {
    const res = results[ri];
    const l   = res.level;
    const dig = 5;
    const priceStr = typeof l.price === 'number' ? l.price.toFixed(dig) : (l.price || '—');
    const sd    = l.todayFib != null ? 'SD' + l.todayFib : '—';
    const dir   = l.direction === 'long' ? '<span class="rp-long">↑L</span>' : '<span class="rp-short">↓S</span>';
    const stars  = '★'.repeat(Math.min(l.stars || 1, 5));
    const touch  = res.touchTime || '—';
    const exit   = res.exitTime  || '—';
    let resultBadge = '<span class="rp-badge untouched">—</span>';
    if (res.result === 'tp')        resultBadge = '<span class="rp-badge tp">TP</span>';
    else if (res.result === 'sl')   resultBadge = '<span class="rp-badge sl">SL</span>';
    else if (res.result === 'eod')  resultBadge = '<span class="rp-badge eod">EOD</span>';
    else if (res.result === 'open') resultBadge = '<span class="rp-badge open">Open</span>';
    const rStr   = res.r !== null ? `<span class="${res.r >= 0 ? 'vu' : 'vd'}">${res.r > 0 ? '+' : ''}${res.r}R</span>` : '—';
    const favStr = res.maxFav !== null ? `+${res.maxFav}p` : '—';
    const advStr = res.maxAdv !== null ? `<span class="vd">${res.maxAdv}p</span>` : '—';
    const rowCls = res.result === 'tp' ? 'rp-row-win' : res.result === 'sl' ? 'rp-row-loss' : '';
    const chartId = `rp-chart-${ri}`;
    const canExpand = !!res.chartBars;
    const chevron = canExpand
      ? `<button class="rp-chevron" onclick="rpToggleChart('${chartId}')" aria-label="Toggle chart">▶</button>`
      : `<span class="rp-chevron-ph"></span>`;

    tableHtml += `<tr class="${rowCls}">`
      + `<td class="rp-chevron-cell">${chevron}</td>`
      + `<td>${sd}</td><td class="mono">${priceStr}</td><td>${dir}</td><td class="rp-stars">${stars}</td>`
      + `<td class="mono">${touch}</td><td class="mono">${exit}</td><td>${resultBadge}</td>`
      + `<td class="mono">${rStr}</td><td class="mono vn">${favStr}</td><td class="mono">${advStr}</td></tr>`;

    if (canExpand) {
      tableHtml += `<tr id="${chartId}" class="rp-chart-row" style="display:none">`
        + `<td colspan="11" class="rp-chart-cell">${buildCandleChart(res)}</td></tr>`;
    }
  }
  tableHtml += '</tbody></table></div>';

  // ── By Fib/SD breakdown ──
  let fibHtml = `<div class="rp-sec-lbl" style="margin-top:14px">By SD Level</div>
    <div class="rp-table-wrap"><table class="rp-table">
    <thead><tr><th>SD</th><th>Touched</th><th>TP</th><th>SL</th><th>EOD</th><th>R</th><th>Win%</th></tr></thead><tbody>`;

  const fibEntries = Object.entries(byFib).sort((a, b) => {
    const na = parseFloat(a[0]), nb = parseFloat(b[0]);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a[0].localeCompare(b[0]);
  });
  for (const [fib, s] of fibEntries) {
    const traded = s.tp + s.sl + s.eod;
    const wr = traded > 0 ? Math.round(s.tp / traded * 100) + '%' : '—';
    const rc2 = s.r >= 0 ? 'vu' : 'vd';
    const wc  = traded > 0 && s.tp / traded >= 0.6 ? 'vu' : traded > 0 && s.tp / traded >= 0.45 ? 'vn' : traded > 0 ? 'vd' : '';
    const fibLabel = fib === 'asia' ? 'Asia Fib' : fib === 'monday' ? 'Mon Fib' : fib === 'other' ? 'Other' : 'SD' + fib;
    fibHtml += `<tr><td>${fibLabel}</td><td>${s.touched}</td><td class="vu">${s.tp}</td><td class="vd">${s.sl}</td><td class="vn">${s.eod}</td><td class="mono ${rc2}">${s.r >= 0 ? '+' : ''}${s.r.toFixed(1)}R</td><td class="${wc}">${wr}</td></tr>`;
  }
  fibHtml += '</tbody></table></div>';

  // ── By Star breakdown ──
  let starHtml = `<div class="rp-sec-lbl" style="margin-top:14px">By Star Rating</div>
    <div class="rp-table-wrap"><table class="rp-table">
    <thead><tr><th>Stars</th><th>Touched</th><th>TP</th><th>SL</th><th>R</th><th>Win%</th></tr></thead><tbody>`;

  const starEntries = Object.entries(byStar).sort((a, b) => +b[0] - +a[0]);
  for (const [star, s] of starEntries) {
    const traded = s.tp + s.sl;
    const wr = traded > 0 ? Math.round(s.tp / traded * 100) + '%' : '—';
    const rc2 = s.r >= 0 ? 'vu' : 'vd';
    const wc  = traded > 0 && s.tp / traded >= 0.6 ? 'vu' : traded > 0 && s.tp / traded >= 0.45 ? 'vn' : traded > 0 ? 'vd' : '';
    starHtml += `<tr><td><span style="color:var(--amber)">${'★'.repeat(Math.min(+star, 5))}</span> ${star}★</td><td>${s.touched}</td><td class="vu">${s.tp}</td><td class="vd">${s.sl}</td><td class="mono ${rc2}">${s.r >= 0 ? '+' : ''}${s.r.toFixed(1)}R</td><td class="${wc}">${wr}</td></tr>`;
  }
  starHtml += '</tbody></table></div>';

  return summaryHtml + equityHtml + tableHtml + fibHtml + starHtml;
}

function symbolToPair(symbol) {
  // Reverse of pairToSymbol — approximate
  if (symbol.includes('JPY')) return symbol.slice(0, 3) + '/' + symbol.slice(3);
  if (symbol === 'XAUUSD') return 'XAU/USD';
  if (symbol === 'NAS100') return 'NAS100_USD';
  return symbol.slice(0, 3) + '/' + symbol.slice(3);
}

// Inline panel rendered inside day view (collapsed by default)
function buildInlineReplayPanel(pair, date, payload) {
  const pid = safePairId(pair);
  if (!payload) return `<div id="rp-inline-${pid}-${date}"></div>`;
  const { stats } = payload;
  const rc = stats.totalR >= 0 ? 'vu' : 'vd';
  const wrc = stats.winRate >= 60 ? 'vu' : stats.winRate >= 45 ? 'vn' : stats.traded > 0 ? 'vd' : '';
  return `<div id="rp-inline-${pid}-${date}" class="rp-inline-panel">
    <div class="rp-inline-summary">
      <span class="rp-inline-badge">Replay</span>
      <span>${stats.touched}/${stats.total} touched</span>
      <span class="vu">${stats.wins}TP</span>
      <span class="vd">${stats.losses}SL</span>
      <span class="vn">${stats.eods}EOD</span>
      <span class="${wrc}">${stats.winRate !== null ? stats.winRate + '%' : '—'}</span>
      <span class="${rc} mono">${stats.totalR >= 0 ? '+' : ''}${stats.totalR}R</span>
      <button class="rp-detail-btn" onclick="openReplayModal('${pair}','${date}')">Details &rarr;</button>
    </div>
  </div>`;
}

// ── Inject replay button into day group header ───────────────────────────────
// Called from renderDayView — we override the pair group render to add the button + inline panel

function renderDayGroup(pair, date, levels, macro) {
  const key    = pair + '::' + date;
  const result = _replayResults[key];
  const inlinePanel = buildInlineReplayPanel(pair, date, result || null);

  return `<div class="day-group">
    <div class="day-group-header">
      <span class="day-group-date">${pair}</span>
      <span class="day-group-meta">Macro ${macro.bias||'&mdash;'} ${macro.score!==undefined?(macro.score>0?'+':'')+macro.score:''} &middot; Vol ${macro.volRegime||'&mdash;'}</span>
      <div class="day-group-pills">${summaryPills(levels)}</div>
      <button class="rp-run-btn" onclick="openReplayModal('${pair}','${date}')">&#9654; Run Day</button>
      <button class="export-day-btn" onclick="exportPairDate('${pair}','${date}')">Export</button>
    </div>
    ${inlinePanel}
    <div class="levels-grid">${levels.map((l, i) => renderLevelCard(l, i, date, pair)).join('')}</div>
  </div>`;
}

init();