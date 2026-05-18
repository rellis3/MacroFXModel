const JOURNAL_KEY = 'journal_store';
const PAIRS_ALL   = ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','XAU/USD','EUR/GBP','USD/CAD','USD/CHF','GBP/JPY','NAS100_USD'];

// Pip value per standard lot in USD — JPY pairs are approximate at ~110 rate
const PIP_VALUE_PER_LOT = {
  'EUR/USD':10,'GBP/USD':10,'AUD/USD':10,'EUR/GBP':10,
  'USD/CAD':10,'USD/CHF':10,
  'USD/JPY':9, 'GBP/JPY':9,
  'XAU/USD':10,'NAS100_USD':1,
};

// Realistic ECN broker defaults per pair: spread + round-trip slippage in pips, commission $/lot RT
const COST_DEFAULTS = {
  'EUR/USD':    { spread:1.0, slip:0.3, comm:7.0, lots:1 },
  'GBP/USD':    { spread:1.2, slip:0.3, comm:7.0, lots:1 },
  'USD/JPY':    { spread:1.0, slip:0.3, comm:7.0, lots:1 },
  'AUD/USD':    { spread:1.3, slip:0.3, comm:7.0, lots:1 },
  'EUR/GBP':    { spread:1.2, slip:0.3, comm:7.0, lots:1 },
  'USD/CAD':    { spread:1.5, slip:0.3, comm:7.0, lots:1 },
  'USD/CHF':    { spread:1.5, slip:0.3, comm:7.0, lots:1 },
  'GBP/JPY':    { spread:2.0, slip:0.5, comm:7.0, lots:1 },
  'XAU/USD':    { spread:3.0, slip:1.0, comm:7.0, lots:1 }, // pip=0.1 so 3p=$0.30 spread
  'NAS100_USD': { spread:2.0, slip:0.5, comm:2.0, lots:1 },
};

let journalData  = {};
let filterPair   = 'all';
let selectedDate = null;
let calViewYear  = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let currentView  = 'day';
let levelSortOrder = 'default'; // 'default'|'price-asc'|'price-desc'|'stars-asc'|'stars-desc'|'sd-asc'|'sd-desc'
let filterWatchlist = false;
let filterStrength  = 'all'; // 'all' | 'strong' (all confs) | 'strongest' (tight only)

const RUNNING_TOTALS_KEY = 'journal_running_totals';
let runningTotalsConfig = { accountSize: 0, riskPct: 1, dayResets: {}, overallOffsets: {} };

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
      if(changed){try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(journalData));}catch(e){console.warn('journal load-merge: localStorage full',e);}}
    }
  }catch(e){}
}
function saveJournal(){
  const json=JSON.stringify(journalData);
  try{localStorage.setItem(JOURNAL_KEY,json);}catch(e){
    // Quota exceeded — prune dates older than 30 days then retry
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);
    const cutoffStr=cutoff.toISOString().split('T')[0];
    let pruned=false;
    for(const d of Object.keys(journalData)){if(d<cutoffStr){delete journalData[d];pruned=true;}}
    if(pruned){try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(journalData));}catch(e2){
      console.warn('journal localStorage full after pruning, relying on KV only',e2);}}
    else{console.warn('journal localStorage full, relying on KV only',e);}
  }
  kvSet(JOURNAL_KEY,journalData);}
function todayStr(){return new Date().toISOString().split('T')[0];}

// ── Running Totals persistence ────────────────────────────────────────────────
function loadRunningTotalsLocal(){
  try{const raw=localStorage.getItem(RUNNING_TOTALS_KEY);if(raw)Object.assign(runningTotalsConfig,JSON.parse(raw));}catch(e){}
}
async function loadRunningTotals(){
  loadRunningTotalsLocal();
  try{const kv=await kvGet(RUNNING_TOTALS_KEY);if(kv?.data)Object.assign(runningTotalsConfig,kv.data);}catch(e){}
}
function saveRunningTotals(){
  try{localStorage.setItem(RUNNING_TOTALS_KEY,JSON.stringify(runningTotalsConfig));}catch(e){}
  kvSet(RUNNING_TOTALS_KEY,runningTotalsConfig);
}

// Compute R earned/lost for a single level
function computeLevelR(level,pair){
  if(!level.price||(level.trade!=='long'&&level.trade!=='short'))return null;
  const sl=level.slOverride??level.sl;const tp=level.tpOverride??level.tp;
  if(!sl||!tp)return null;
  const slDist=Math.abs(level.price-sl);if(slDist<=0)return null;
  const tpDist=Math.abs(level.price-tp);
  if(level.outcome==='win')return+(tpDist/slDist).toFixed(2);
  if(level.outcome==='loss')return-1;
  if(level.outcome==='be')return 0;
  return null; // taken but no outcome
}

// Aggregate daily trade P&L respecting current filterPair
function computeDayTotals(date){
  const dayObj=journalData[date];
  if(!dayObj)return{r:0,wins:0,losses:0,bes:0,pending:0};
  let r=0,wins=0,losses=0,bes=0,pending=0;
  for(const[pair,v]of Object.entries(dayObj)){
    if(filterPair!=='all'&&pair!==filterPair)continue;
    for(const level of(v.levels||[])){
      if(level.trade!=='long'&&level.trade!=='short')continue;
      if(level.outcome==='win'){wins++;r+=computeLevelR(level,pair)||0;}
      else if(level.outcome==='loss'){losses++;r-=1;}
      else if(level.outcome==='be'){bes++;}
      else{pending++;}
    }
  }
  return{r:+r.toFixed(2),wins,losses,bes,pending};
}

// Reset a single day's counter (stores the current R as an offset so display shows 0)
function resetDayTotal(date){
  const totals=computeDayTotals(date);
  const key=date+'::'+filterPair;
  if(!runningTotalsConfig.dayResets)runningTotalsConfig.dayResets={};
  runningTotalsConfig.dayResets[key]=totals.r;
  saveRunningTotals();renderMain();
}

// Reset the combined running total (stores current cumulative as offset)
function resetOverallTotal(){
  const dates=Object.keys(journalData).sort();
  let cumR=0;
  for(const date of dates)cumR+=computeDayTotals(date).r;
  if(!runningTotalsConfig.overallOffsets)runningTotalsConfig.overallOffsets={};
  runningTotalsConfig.overallOffsets[filterPair]=+cumR.toFixed(2);
  saveRunningTotals();renderMain();
}

// Called when account/risk inputs change in the Stats view
function rtUpdateSettings(){
  const acct=parseFloat(document.getElementById('rt-account')?.value||'');
  const rpct=parseFloat(document.getElementById('rt-risk-pct')?.value||'');
  if(!isNaN(acct))runningTotalsConfig.accountSize=acct>0?acct:0;
  if(!isNaN(rpct))runningTotalsConfig.riskPct=rpct>0?rpct:0;
  saveRunningTotals();renderMain();
}

function renderRunningTotalsSection(){
  const acct=runningTotalsConfig.accountSize||0;
  const rpct=runningTotalsConfig.riskPct||0;
  const showPnl=acct>0&&rpct>0;
  const riskAmt=showPnl?acct*(rpct/100):0;
  const fmtPnl=(r)=>{
    if(!showPnl)return'';
    const v=r*riskAmt;const col=v>=0?'var(--green)':'var(--red)';
    return` <span style="color:${col};font-family:'DM Mono',monospace">${v>=0?'+':''}$${Math.abs(v).toFixed(0)}</span>`;
  };

  // Compute per-day data in date order
  const allDates=Object.keys(journalData).sort();
  let cumR=0;
  const days=[];
  const overallOffset=(runningTotalsConfig.overallOffsets||{})[filterPair]||0;
  for(const date of allDates){
    const totals=computeDayTotals(date);
    if(totals.wins+totals.losses+totals.bes+totals.pending===0)continue;
    cumR+=totals.r;
    const dayKey=date+'::'+filterPair;
    const dayOffset=(runningTotalsConfig.dayResets||{})[dayKey]||0;
    const displayDayR=+(totals.r-dayOffset).toFixed(2);
    const displayCumR=+(cumR-overallOffset).toFixed(2);
    days.push({date,totals,displayDayR,displayCumR,wasReset:dayOffset!==0});
  }

  const overallR=days.length>0?days[days.length-1].displayCumR:0;
  const overallRc=overallR>=0?'var(--green)':'var(--red)';

  const settingsHtml=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:600;color:var(--purple)">$ P&L</span>
      <label style="font-size:10px;color:var(--text3)">Account</label>
      <input type="number" id="rt-account" value="${acct||''}" placeholder="e.g. 10000" min="100" step="1000"
        style="width:90px;font-size:11px;background:var(--s1);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:2px 7px;font-family:'DM Mono',monospace;text-align:right"
        oninput="rtUpdateSettings()">
      <label style="font-size:10px;color:var(--text3)">Risk %</label>
      <input type="number" id="rt-risk-pct" value="${rpct||''}" placeholder="1" min="0.1" max="10" step="0.1"
        style="width:60px;font-size:11px;background:var(--s1);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:2px 7px;font-family:'DM Mono',monospace;text-align:right"
        oninput="rtUpdateSettings()">
      ${showPnl?`<span style="font-size:10px;color:var(--text3)">risk/trade = <strong style="color:var(--text)">$${riskAmt.toFixed(0)}</strong></span>`:`<span style="font-size:10px;color:var(--text3);font-style:italic">enter account + risk% to see $ P&L</span>`}
    </div>`;

  const overallHtml=`
    <div style="display:flex;align-items:center;gap:16px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);padding:14px 18px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.07em;margin-bottom:4px;text-transform:uppercase">Combined Running Total</div>
        <div style="font-size:26px;font-weight:700;font-family:'DM Mono',monospace;color:${overallRc}">${overallR>=0?'+':''}${overallR}R${fmtPnl(overallR)}</div>
        ${days.length>0?`<div style="font-size:9px;color:var(--text3);margin-top:2px">${days.length} day${days.length!==1?'s':''} tracked${overallOffset!==0?' · reset active':''}</div>`:''}
      </div>
      <div style="margin-left:auto">
        <button class="dark-btn" style="font-size:10px;padding:4px 12px;border-color:var(--red);color:var(--red)" onclick="resetOverallTotal()">&#8635; Reset All</button>
      </div>
    </div>`;

  if(days.length===0){
    return`<div class="sec-lbl" style="margin-top:20px;margin-bottom:10px">Running Totals <span class="sec-badge purple">LIVE</span></div>
      ${settingsHtml}${overallHtml}
      <div style="text-align:center;color:var(--text3);font-size:12px;padding:12px">Mark trade outcomes in the Day view to see running totals here.</div>`;
  }

  const tableRows=[...days].reverse().map(({date,totals,displayDayR,displayCumR,wasReset})=>{
    const drRc=displayDayR>=0?'vu':'vd';
    const cumRc=displayCumR>=0?'vu':'vd';
    const wld=[
      totals.wins>0?`<span class="vu">${totals.wins}W</span>`:'',
      totals.losses>0?`<span class="vd">${totals.losses}L</span>`:'',
      totals.bes>0?`<span class="vn">${totals.bes}BE</span>`:'',
      totals.pending>0?`<span style="color:var(--text3)">${totals.pending}?</span>`:'',
    ].filter(Boolean).join(' ');
    const resetNote=wasReset?`<span style="font-size:8px;color:var(--amber);margin-left:3px">↺</span>`:'';
    return`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${date}</td>
      <td>${wld}</td>
      <td class="mono ${drRc}">${displayDayR>=0?'+':''}${displayDayR}R${fmtPnl(displayDayR)}${resetNote}</td>
      <td class="mono ${cumRc}">${displayCumR>=0?'+':''}${displayCumR}R</td>
      <td style="text-align:right"><button class="dark-btn" style="font-size:9px;padding:1px 8px;border-color:${wasReset?'var(--amber)':'var(--border)'};color:${wasReset?'var(--amber)':'var(--text3)'}" onclick="resetDayTotal('${date}')" title="Reset this day to zero">&#8635;</button></td>
    </tr>`;
  }).join('');

  return`<div class="sec-lbl" style="margin-top:20px;margin-bottom:10px">Running Totals <span class="sec-badge purple">LIVE</span></div>
    ${settingsHtml}
    ${overallHtml}
    <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:20px">
      <table class="breakdown-table">
        <thead><tr><th>Date</th><th>W / L / BE</th><th>Day R</th><th>Running Total</th><th></th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

// ── Replay cost + aggregation helpers (used by quick stats sidebar) ───────────

// Compute net R from a results array using per-pair cost settings
function computeNetRFromResults(pair, results){
  const cs=(runningTotalsConfig.costSettings||{})[pair]||COST_DEFAULTS[pair]||{};
  const spread=cs.spread||0,slip=cs.slip||0,comm=cs.comm||0;
  const pip=getPipSz(pair),pipVal=PIP_VALUE_PER_LOT[pair]||10;
  const totalCostPips=spread+slip+comm/pipVal;
  let grossR=0,costR=0,winsR=0,lossesR=0;
  for(const res of results){
    if(!res.touched)continue;
    const slPips=(res.entryPrice&&res.sl)?Math.abs(res.entryPrice-res.sl)/pip:0;
    const cR=slPips>0?totalCostPips/slPips:0;
    for(const p of(res.passes||[])){
      if(p.result==='tp'||p.result==='sl'||p.result==='eod'){
        const r=p.r||0;
        grossR+=r;costR+=cR;
        if(r>0)winsR+=r; else if(r<0)lossesR+=r;
      }
    }
  }
  return{grossR:+grossR.toFixed(2),costR:+costR.toFixed(2),netR:+(grossR-costR).toFixed(2),winsR:+winsR.toFixed(2),lossesR:+lossesR.toFixed(2)};
}

// For each pair::date, prefer ::custom over standard so ATR/pip override runs win
function getLatestResultsMap(){
  const map={};
  for(const[key,payload]of Object.entries(_replayResults)){
    const parts=key.split('::');
    const pairDate=parts[0]+'::'+parts[1];
    const isCustom=parts.length>2;
    if(isCustom||!map[pairDate])map[pairDate]={pair:parts[0],date:parts[1],payload,isCustom};
  }
  return map;
}

// Aggregate across ALL days per pair (for cumulative sidebar table)
function aggregateReplayByPair(){
  const byPair={};
  for(const{pair,payload}of Object.values(getLatestResultsMap())){
    if(!payload?.stats)continue;
    if(!byPair[pair])byPair[pair]={days:0,wins:0,losses:0,eods:0,traded:0,allResults:[]};
    const d=byPair[pair];
    d.days++;d.wins+=payload.stats.wins;d.losses+=payload.stats.losses;
    d.eods+=(payload.stats.eods||0);d.traded+=payload.stats.traded;
    d.allResults.push(...(payload.results||[]));
  }
  const out={};
  for(const[pair,d]of Object.entries(byPair)){
    const{grossR,costR,netR,winsR,lossesR}=computeNetRFromResults(pair,d.allResults);
    out[pair]={days:d.days,wins:d.wins,losses:d.losses,eods:d.eods,traded:d.traded,grossR,costR,netR,winsR,lossesR};
  }
  return out;
}

// Aggregate for one specific date (for the selected-day sidebar table)
function aggregateReplayByDay(date){
  const byPair={};
  for(const{pair,date:d,payload}of Object.values(getLatestResultsMap())){
    if(d!==date||!payload?.stats)continue;
    const{grossR,costR,netR,winsR,lossesR}=computeNetRFromResults(pair,payload.results||[]);
    byPair[pair]={wins:payload.stats.wins,losses:payload.stats.losses,eods:payload.stats.eods||0,traded:payload.stats.traded,grossR,costR,netR,winsR,lossesR};
  }
  return byPair;
}

// Reset cumulative display for one pair (stores current net R as offset)
function resetReplayPair(pair){
  const byPair=aggregateReplayByPair();
  if(!byPair[pair])return;
  if(!runningTotalsConfig.replayOffsets)runningTotalsConfig.replayOffsets={pairR:{}};
  if(!runningTotalsConfig.replayOffsets.pairR)runningTotalsConfig.replayOffsets.pairR={};
  runningTotalsConfig.replayOffsets.pairR[pair]=byPair[pair].netR;
  saveRunningTotals();renderQuickStats();
}

// Reset all pairs at once (good for comparing ATR vs pip runs)
function resetReplayAll(){
  const byPair=aggregateReplayByPair();
  const offsets={};
  for(const[pair,d]of Object.entries(byPair))offsets[pair]=d.netR;
  if(!runningTotalsConfig.replayOffsets)runningTotalsConfig.replayOffsets={pairR:{}};
  runningTotalsConfig.replayOffsets.pairR=offsets;
  saveRunningTotals();renderQuickStats();
}

// ── SL/TP Sweep Analysis ──────────────────────────────────────────────────────
const SWEEP_SL_FRACS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5];
const SWEEP_TP_MULTS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

function sweepAnalysis() {
  const tradesByPair = {};
  for (const [key, payload] of Object.entries(_replayResults)) {
    const [pair] = key.split('::');
    const pip = getPipSz(pair);
    const cs = (runningTotalsConfig.costSettings || {})[pair] || COST_DEFAULTS[pair] || {};
    const totalCostPips = (cs.spread || 0) + (cs.slip || 0) + (cs.comm || 0) / (PIP_VALUE_PER_LOT[pair] || 10);
    if (!tradesByPair[pair]) tradesByPair[pair] = { trades: [], costPips: totalCostPips };
    for (const res of (payload.results || [])) {
      if (!res.touched || !res.entryPrice || !res.sl) continue;
      const slDistPips = Math.abs(res.entryPrice - res.sl) / pip;
      if (slDistPips <= 0) continue;
      for (const pass of (res.passes || [])) {
        const r = pass.result;
        if (!r || r === 'untouched' || r === 'open') continue;
        tradesByPair[pair].trades.push({
          slDistPips,
          maxFav: pass.maxFav || 0,
          maxAdv: pass.maxAdv || 0,
          origR: pass.r || 0,
          result: r,
        });
      }
    }
  }

  const results = {};
  for (const [pair, { trades, costPips }] of Object.entries(tradesByPair)) {
    if (trades.length === 0) continue;
    let bestNetR = -Infinity, bestSlFrac = 1.0, bestTpMult = 1.5;
    let bestWins = 0, bestLosses = 0;
    const grid = {};

    for (const slFrac of SWEEP_SL_FRACS) {
      for (const tpMult of SWEEP_TP_MULTS) {
        let totalNetR = 0, wins = 0, losses = 0, eods = 0;
        for (const t of trades) {
          const newSlPips = slFrac * t.slDistPips;
          const newTpPips = tpMult * newSlPips;
          const costR = newSlPips > 0 ? costPips / newSlPips : 0;
          let grossR;
          if (t.maxAdv > newSlPips) {
            grossR = -1; losses++;
          } else if (t.maxFav >= newTpPips) {
            grossR = tpMult; wins++;
          } else {
            // EOD: actual close P&L doesn't change, but SL distance does
            grossR = t.origR / slFrac; eods++;
          }
          totalNetR += grossR - costR;
        }
        const netR = +totalNetR.toFixed(2);
        grid[`${slFrac}:${tpMult}`] = { netR, wins, losses, eods };
        if (netR > bestNetR) {
          bestNetR = netR; bestSlFrac = slFrac; bestTpMult = tpMult;
          bestWins = wins; bestLosses = losses;
        }
      }
    }

    // Best net R achievable keeping SL at 1.0× (TP sweep only) — for comparison
    let baselineNetR = -Infinity;
    for (const tpMult of SWEEP_TP_MULTS) {
      const cell = grid[`1:${tpMult}`];
      if (cell && cell.netR > baselineNetR) baselineNetR = cell.netR;
    }

    results[pair] = { bestSlFrac, bestTpMult, bestNetR, bestWins, bestLosses, baselineNetR, trades: trades.length, grid };
  }
  return results;
}

function runAndLogSweep() {
  const results = sweepAnalysis();
  if (Object.keys(results).length === 0) { alert('No replay data to sweep — run the replay modal on at least one day first.'); return; }
  if (!runningTotalsConfig.sweepLog) runningTotalsConfig.sweepLog = [];
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
  runningTotalsConfig.sweepLog.unshift({ ts, results });
  if (runningTotalsConfig.sweepLog.length > 20) runningTotalsConfig.sweepLog.length = 20;
  saveRunningTotals();
  renderQuickStats();
}

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
  loadRunningTotalsLocal();
  selectedDate=todayStr();renderPairNav();renderCalendar();renderQuickStats();renderMain();
  // Now load+merge from KV and re-render if anything changed
  await loadJournal();
  await loadReplayResults();
  await loadRunningTotals();
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

  // ── Cumulative per-pair net R table with resets ───────────────────────────────
  const byPairAgg=aggregateReplayByPair();
  const pairEntries=Object.entries(byPairAgg)
    .filter(([p])=>filterPair==='all'||p===filterPair)
    .sort((a,b)=>b[1].netR-a[1].netR);
  const hasCostData=pairEntries.some(([p])=>{const cs=(runningTotalsConfig.costSettings||{})[p]||{};return(cs.spread||0)+(cs.slip||0)+(cs.comm||0)>0;});
  const riskAmt=(runningTotalsConfig.accountSize||0)*(runningTotalsConfig.riskPct||1)/100;
  const showDollar=riskAmt>0;

  let pairSection='';
  if(pairEntries.length>0){
    const pOffsets=runningTotalsConfig.replayOffsets?.pairR||{};
    const pRows=pairEntries.map(([pair,d])=>{
      const offset=pOffsets[pair]||0;
      const dispR=+(d.netR-offset).toFixed(2);
      const rc=dispR>=0?'vu':'vd';
      const wasReset=offset!==0;
      const wrc2=d.traded>0?Math.round(d.wins/d.traded*100)+'%':'—';
      const wDollar=showDollar?`<br><span style="font-size:7px;color:var(--green)">+${Math.round(d.winsR*riskAmt)}</span>`:'';
      const lDollar=showDollar?`<br><span style="font-size:7px;color:var(--red)">-${Math.abs(Math.round(d.lossesR*riskAmt))}</span>`:'';
      const netDollar=showDollar?`<br><span style="font-size:7px;color:${dispR>=0?'var(--green)':'var(--red)'}">${dispR>=0?'+':''}${Math.round(dispR*riskAmt)}</span>`:'';
      const costDollar=showDollar&&d.costR>0?`<span style="font-size:7px;color:var(--text3)">-${Math.round(d.costR*riskAmt)}c</span>`:'';
      return`<tr>
        <td style="color:var(--text2);font-size:9px;padding:2px 0;white-space:nowrap">${pair}</td>
        <td style="text-align:center;font-size:9px"><span class="vu">${d.wins}${wDollar}</span> / <span class="vd">${d.losses}${lDollar}</span></td>
        <td style="text-align:center;font-size:9px;color:var(--text3)">${wrc2}</td>
        <td class="mono ${rc}" style="font-size:9px;text-align:right;white-space:nowrap">${dispR>=0?'+':''}${dispR}R${wasReset?`<span style="color:var(--amber);font-size:7px;margin-left:1px">↺</span>`:''}${netDollar}${hasCostData&&d.costR>0?`<br>${costDollar}`:''}</td>
        <td style="padding-left:3px"><button onclick="resetReplayPair('${pair}')" title="Reset ${pair} to zero — use to baseline before switching ATR/pip"
          style="font-size:8px;color:${wasReset?'var(--amber)':'var(--text3)'};background:none;border:1px solid ${wasReset?'var(--amber)':'var(--border)'};border-radius:3px;padding:0 4px;cursor:pointer;line-height:1.6">↺</button></td>
      </tr>`;
    }).join('');
    const totW=pairEntries.reduce((s,[,d])=>s+d.wins,0);
    const totL=pairEntries.reduce((s,[,d])=>s+d.losses,0);
    const totNetR=pairEntries.reduce((s,[,d])=>s+d.netR,0);
    const totOffset=pairEntries.reduce((s,[p])=>s+(pOffsets[p]||0),0);
    const dispTot=+(totNetR-totOffset).toFixed(2);
    const totTrad=pairEntries.reduce((s,[,d])=>s+d.traded,0);
    const totWr=totTrad>0?Math.round(totW/totTrad*100)+'%':'—';
    const totWinsR=pairEntries.reduce((s,[,d])=>s+d.winsR,0);
    const totLossesR=pairEntries.reduce((s,[,d])=>s+d.lossesR,0);
    const totWDollar=showDollar?`<br><span style="font-size:7px;color:var(--green)">+${Math.round(totWinsR*riskAmt)}</span>`:'';
    const totLDollar=showDollar?`<br><span style="font-size:7px;color:var(--red)">-${Math.abs(Math.round(totLossesR*riskAmt))}</span>`:'';
    const totNetDollar=showDollar?`<br><span style="font-size:7px;color:${dispTot>=0?'var(--green)':'var(--red)'}">${dispTot>=0?'+':''}${Math.round(dispTot*riskAmt)}</span>`:'';
    pairSection=`
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <div style="font-size:9px;font-weight:600;color:var(--text3);letter-spacing:.05em">CUMUL · PER PAIR${hasCostData?' · net':''}</div>
        <button onclick="resetReplayAll()" title="Reset all pairs to zero — baseline for ATR vs pip comparison"
          style="font-size:8px;color:var(--red);background:none;border:1px solid var(--red);border-radius:3px;padding:0 6px;cursor:pointer;line-height:1.6">↺ All</button>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:left;padding-bottom:3px">Pair</th>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:center">W/L</th>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:center">WR%</th>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:right">${hasCostData?'Net R':'R'}</th>
          <th></th>
        </tr></thead>
        <tbody>${pRows}</tbody>
        <tfoot><tr style="border-top:1px solid var(--border)">
          <td style="font-size:9px;font-weight:600;color:var(--text2);padding-top:3px">Total</td>
          <td style="text-align:center;font-size:9px;padding-top:3px"><span class="vu">${totW}${totWDollar}</span> / <span class="vd">${totL}${totLDollar}</span></td>
          <td style="text-align:center;font-size:9px;color:var(--text3);padding-top:3px">${totWr}</td>
          <td class="mono ${dispTot>=0?'vu':'vd'}" style="font-size:9px;text-align:right;font-weight:700;padding-top:3px">${dispTot>=0?'+':''}${dispTot}R${totNetDollar}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`;
  }

  // ── Selected-day per-pair breakdown (updates on calendar click) ───────────────
  const dayByPair=aggregateReplayByDay(selectedDate);
  const dayEntries=Object.entries(dayByPair)
    .filter(([p])=>filterPair==='all'||p===filterPair);
  let daySection='';
  if(dayEntries.length>0){
    const dow=new Date(selectedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'});
    const dRows=dayEntries.map(([pair,d])=>{
      const rc=d.netR>=0?'vu':'vd';
      const wrc2=d.traded>0?Math.round(d.wins/d.traded*100)+'%':'—';
      const dwDollar=showDollar?`<br><span style="font-size:7px;color:var(--green)">+${Math.round(d.winsR*riskAmt)}</span>`:'';
      const dlDollar=showDollar?`<br><span style="font-size:7px;color:var(--red)">-${Math.abs(Math.round(d.lossesR*riskAmt))}</span>`:'';
      const dnetDollar=showDollar?`<br><span style="font-size:7px;color:${d.netR>=0?'var(--green)':'var(--red)'}">${d.netR>=0?'+':''}${Math.round(d.netR*riskAmt)}</span>`:'';
      const dcostDollar=showDollar&&d.costR>0?`<br><span style="font-size:7px;color:var(--text3)">-${Math.round(d.costR*riskAmt)}c</span>`:'';
      return`<tr>
        <td style="color:var(--text2);font-size:9px;padding:2px 0;white-space:nowrap">${pair}</td>
        <td style="text-align:center;font-size:9px"><span class="vu">${d.wins}${dwDollar}</span> / <span class="vd">${d.losses}${dlDollar}</span></td>
        <td style="text-align:center;font-size:9px;color:var(--text3)">${wrc2}</td>
        <td class="mono ${rc}" style="font-size:9px;text-align:right;white-space:nowrap">${d.netR>=0?'+':''}${d.netR}R${dnetDollar}${dcostDollar}</td>
      </tr>`;
    }).join('');
    const dTotW=dayEntries.reduce((s,[,d])=>s+d.wins,0);
    const dTotL=dayEntries.reduce((s,[,d])=>s+d.losses,0);
    const dTotR=+(dayEntries.reduce((s,[,d])=>s+d.netR,0)).toFixed(2);
    const dTotTrad=dayEntries.reduce((s,[,d])=>s+d.traded,0);
    const dTotWr=dTotTrad>0?Math.round(dTotW/dTotTrad*100)+'%':'—';
    const dTotWinsR=dayEntries.reduce((s,[,d])=>s+d.winsR,0);
    const dTotLossesR=dayEntries.reduce((s,[,d])=>s+d.lossesR,0);
    const dtWDollar=showDollar?`<br><span style="font-size:7px;color:var(--green)">+${Math.round(dTotWinsR*riskAmt)}</span>`:'';
    const dtLDollar=showDollar?`<br><span style="font-size:7px;color:var(--red)">-${Math.abs(Math.round(dTotLossesR*riskAmt))}</span>`:'';
    const dtNetDollar=showDollar?`<br><span style="font-size:7px;color:${dTotR>=0?'var(--green)':'var(--red)'}">${dTotR>=0?'+':''}${Math.round(dTotR*riskAmt)}</span>`:'';
    daySection=`
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="font-size:9px;font-weight:600;color:var(--text3);letter-spacing:.05em;margin-bottom:5px">DAY · ${dow} ${selectedDate}</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:left;padding-bottom:3px">Pair</th>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:center">W/L</th>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:center">WR%</th>
          <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:right">${hasCostData?'Net R':'R'}</th>
        </tr></thead>
        <tbody>${dRows}</tbody>
        <tfoot><tr style="border-top:1px solid var(--border)">
          <td style="font-size:9px;font-weight:600;color:var(--text2);padding-top:3px">Total</td>
          <td style="text-align:center;font-size:9px;padding-top:3px"><span class="vu">${dTotW}${dtWDollar}</span> / <span class="vd">${dTotL}${dtLDollar}</span></td>
          <td style="text-align:center;font-size:9px;color:var(--text3);padding-top:3px">${dTotWr}</td>
          <td class="mono ${dTotR>=0?'vu':'vd'}" style="font-size:9px;text-align:right;font-weight:700;padding-top:3px">${dTotR>=0?'+':''}${dTotR}R${dtNetDollar}</td>
        </tr></tfoot>
      </table>
    </div>`;
  }

  // ── SL/TP sweep section ──────────────────────────────────────────────────────
  const sweepLog = runningTotalsConfig.sweepLog || [];
  const latestSweep = sweepLog[0];
  const btnSweepStyle = `font-size:8px;background:none;border:1px solid var(--blue,#4a9eff);color:var(--blue,#4a9eff);border-radius:3px;padding:0 6px;cursor:pointer;line-height:1.6`;
  let sweepContent = `<div style="font-size:8px;color:var(--text3)">Analyses price action stored from replays to find optimal SL×TP per pair. Run after replaying days.</div>`;
  if (latestSweep) {
    const sweepEntries = Object.entries(latestSweep.results)
      .filter(([p]) => filterPair === 'all' || p === filterPair)
      .sort((a, b) => b[1].bestNetR - a[1].bestNetR);
    if (sweepEntries.length > 0) {
      const sRows = sweepEntries.map(([pair, d]) => {
        const slTight = d.bestSlFrac < 1.0;
        const slWide  = d.bestSlFrac > 1.0;
        const slColor = slTight ? 'var(--amber)' : slWide ? 'var(--text3)' : 'var(--text2)';
        const slLabel = `<span style="color:${slColor}">${d.bestSlFrac}×</span>`;
        const netCls  = d.bestNetR >= 0 ? 'vu' : 'vd';
        const vs      = +(d.bestNetR - d.baselineNetR).toFixed(1);
        const vsLabel = vs > 0.05 ? `<span style="font-size:7px;color:var(--green)"> ↑${vs}</span>` :
                        vs < -0.05 ? `<span style="font-size:7px;color:var(--red)"> ↓${Math.abs(vs)}</span>` : '';
        const wl = d.bestWins + d.bestLosses > 0
          ? `<span style="font-size:7px;color:var(--text3)">${Math.round(d.bestWins/(d.bestWins+d.bestLosses)*100)}%wr</span>`
          : '';
        return `<tr>
          <td style="font-size:9px;color:var(--text2);padding:2px 0;white-space:nowrap">${pair}</td>
          <td style="font-size:9px;text-align:center">${slLabel}</td>
          <td style="font-size:9px;text-align:center">${d.bestTpMult}R</td>
          <td class="mono ${netCls}" style="font-size:9px;text-align:right;white-space:nowrap">${d.bestNetR >= 0 ? '+' : ''}${d.bestNetR}R${vsLabel}</td>
          <td style="font-size:8px;color:var(--text3);padding-left:2px">${wl}</td>
        </tr>`;
      }).join('');

      // History summary: previous runs listed compactly
      let histHtml = '';
      if (sweepLog.length > 1) {
        const prevRows = sweepLog.slice(1, 4).map(run => {
          const pairsSnap = Object.entries(run.results)
            .filter(([p]) => filterPair === 'all' || p === filterPair)
            .map(([p, d]) => `${p} ${d.bestSlFrac}×/${d.bestTpMult}R`)
            .join(', ');
          return `<div style="font-size:7px;color:var(--text3);margin-top:2px">${run.ts}: ${pairsSnap}</div>`;
        }).join('');
        histHtml = `<details style="margin-top:4px"><summary style="font-size:7px;color:var(--text3);cursor:pointer">▸ ${sweepLog.length - 1} previous run${sweepLog.length > 2 ? 's' : ''}</summary>${prevRows}</details>`;
      }

      sweepContent = `
        <table style="width:100%;border-collapse:collapse;margin-top:2px">
          <thead><tr>
            <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:left;padding-bottom:2px">Pair</th>
            <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:center">SL</th>
            <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:center">TP</th>
            <th style="font-size:8px;color:var(--text3);font-weight:400;text-align:right">Net R</th>
            <th></th>
          </tr></thead>
          <tbody>${sRows}</tbody>
        </table>
        <div style="font-size:7px;color:var(--text3);margin-top:3px">
          Last: ${latestSweep.ts} · SL amber = tighten, ↑ = better than 1.0×SL baseline
        </div>
        ${histHtml}`;
    }
  }
  const sweepSection = `
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <div style="font-size:9px;font-weight:600;color:var(--text3);letter-spacing:.05em">SL/TP SWEEP${latestSweep ? ' ✓' : ''}</div>
        <button onclick="runAndLogSweep()" style="${btnSweepStyle}">▶ Run</button>
      </div>
      ${sweepContent}
    </div>`;

  document.getElementById('quickStats').innerHTML=`
    <div class="mrow"><span class="mrow-n">Levels saved</span><span class="mrow-v vp">${total}</span></div>
    <div class="mrow"><span class="mrow-n">Trades taken</span><span class="mrow-v vp">${taken}</span></div>
    <div class="mrow"><span class="mrow-n">Win rate</span><span class="mrow-v ${wrc}">${wr}%</span></div>
    <div class="mrow"><span class="mrow-n">W / L / BE</span><span class="mrow-v"><span class="vu">${wins}</span> / <span class="vd">${losses}</span> / <span class="vn">${bes}</span></span></div>
    ${rpSection}${pairSection}${daySection}${sweepSection}`;
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
  let html=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap"><div style="font-size:16px;font-weight:700">${fmt}</div><div style="font-size:11px;color:var(--text3)">${pairs.length} pair${pairs.length>1?'s':''}</div>${renderSortBar()}</div>`;
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
    const passes=replayRes.passes&&replayRes.passes.length>0?replayRes.passes
      :[{touchTime:replayRes.touchTime,result:replayRes.result,r:replayRes.r}];
    if(!borderCls){
      const hasSl=passes.some(p=>p.result==='sl');
      const allTp=passes.every(p=>p.result==='tp');
      if(hasSl)borderCls='replay-sl';
      else if(allTp)borderCls='replay-tp';
      else borderCls='replay-eod';
    }
    replayBadge=passes.map(p=>{
      const cls=p.result==='tp'?'rp-badge tp':p.result==='sl'?'rp-badge sl':'rp-badge eod';
      const rStr=p.r!==null?` ${p.r>=0?'+':''}${p.r}R`:'';
      const durStr=p.duration?` · ${p.duration}`:'';
      return`<span class="${cls}" style="font-size:9px;margin-left:4px">${p.touchTime||''}${rStr}${durStr}</span>`;
    }).join('');
    if(passes.length>1){
      const tot=passes.reduce((s,p)=>s+(p.r||0),0);
      replayBadge+=`<span style="font-size:9px;margin-left:4px;color:var(--text3)">= ${tot>=0?'+':''}${tot.toFixed(2)}R</span>`;
    }
  } else if(replayPayload&&!replayRes?.touched){
    replayBadge=`<span class="rp-badge untouched" style="font-size:9px;margin-left:6px">missed</span>`;
  }
  const stars=level.stars||1;
  const starsHtml='<span style="color:var(--amber)">'+'&#9733;'.repeat(Math.min(stars,5))+'</span><span style="color:var(--border2)">'+'&#9734;'.repeat(Math.max(0,5-stars))+'</span>';
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
  const isWl    = !!level.watchlist;
  const wlBadge = isWl ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);margin-left:4px">⭐ Watchlist</span>` : '';
  const wlBtn   = `<button title="${isWl?'Remove from watchlist':'Mark as watchlist level'}" onclick="toggleWatchlistLevel('${date}','${pair}',${idx})" style="background:none;border:1px solid ${isWl?'rgba(99,102,241,0.4)':'var(--border)'};border-radius:5px;padding:1px 7px;cursor:pointer;font-size:10px;color:${isWl?'#a5b4fc':'var(--text3)'};margin-left:auto">${isWl?'★ WL':'☆ WL'}</button>`;
  const narrative = levelNarrative(level, pair);
  return `<div class="level-card ${borderCls}">
    <div class="level-top">
      <span class="level-stars">${starsHtml}</span>
      <span class="level-price">${priceStr}${wlBadge}${replayBadge}</span>
      <span class="level-dir ${dirCls}">${dirLabel}</span>
      <div class="level-sltp">
        <div class="sltp-item"><span class="sltp-lbl">SL</span><span class="sltp-val sl">${slStr||'&mdash;'}</span></div>
        <div class="sltp-item"><span class="sltp-lbl">TP</span><span class="sltp-val tp">${tpStr||'&mdash;'}</span></div>
      </div>
    </div>
    ${tags?`<div class="level-tags">${tags}</div>`:''}
    ${narrative}
    <div class="level-trade">
      <div class="trade-status-btns">${tBtns}${wlBtn}</div>${ocBtns}
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
function getPipSz(pair){if(pair.includes('JPY'))return 0.01;if(pair.includes('XAU'))return 0.1;if(pair.includes('NAS100'))return 1;return 0.0001;}

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
function toggleWatchlistLevel(date,pair,idx){ensurePath(date,pair,idx);const l=journalData[date][pair].levels[idx];l.watchlist=!l.watchlist;saveJournal();renderMain();renderQuickStats();}

function setWatchlistFilter(v){
  filterWatchlist=v;
  document.getElementById('wlFilterBtn').classList.toggle('active',v);
  renderPairNav();renderMain();renderCalendar();renderQuickStats();
}

function levelPassesStrengthFilter(l) {
  if (filterStrength === 'strongest') return l.isTight === true;
  return true; // 'strong' and 'all' show everything
}

function setStrengthFilter(v) {
  filterStrength = v;
  renderMain();renderQuickStats();
}

// Recompute replay stats from a (potentially filtered) results array
function computeReplayStatsFromResults(results){
  const stats={total:0,touched:0,traded:0,wins:0,losses:0,eods:0,totalR:0};
  const byFib={},byStar={};
  for(const r of results){
    stats.total++;
    if(!r.touched)continue;
    stats.touched++;
    // Count each pass as a separate trade instance
    const passes=r.passes&&r.passes.length>0?r.passes:[{result:r.result,r:r.r}];
    for(const p of passes){
      if(p.result==='tp'||p.result==='sl'||p.result==='eod')stats.traded++;
      if(p.result==='tp')stats.wins++;
      if(p.result==='sl')stats.losses++;
      if(p.result==='eod')stats.eods++;
      if(p.r!=null)stats.totalR+=p.r;
    }
    const fib=String(r.level?.todayFib??'other');
    if(!byFib[fib])byFib[fib]={touched:0,tp:0,sl:0,eod:0,r:0};
    byFib[fib].touched++;
    for(const p of passes){
      if(p.result==='tp'){byFib[fib].tp++;if(p.r!=null)byFib[fib].r+=p.r;}
      if(p.result==='sl'){byFib[fib].sl++;byFib[fib].r-=1;}
      if(p.result==='eod'){byFib[fib].eod++;if(p.r!=null)byFib[fib].r+=p.r;}
    }
    const star=String(r.level?.stars??1);
    if(!byStar[star])byStar[star]={touched:0,tp:0,sl:0,r:0};
    byStar[star].touched++;
    for(const p of passes){
      if(p.result==='tp'){byStar[star].tp++;if(p.r!=null)byStar[star].r+=p.r;}
      if(p.result==='sl'){byStar[star].sl++;byStar[star].r-=1;}
    }
  }
  stats.totalR=+stats.totalR.toFixed(2);
  stats.winRate=stats.traded>0?Math.round(stats.wins/stats.traded*100):null;
  return{stats,byFib,byStar};
}

// ── Level sort helpers ───────────────────────────────────────────────────────

function setLevelSort(order) {
  levelSortOrder = order;
  renderMain();
}

// Returns [{l, i}] where i is the original stored index (safe to use for mutations)
function sortedIndexed(levels) {
  const arr = levels.map((l, i) => ({ l, i })).filter(({l}) => levelPassesStrengthFilter(l));
  switch (levelSortOrder) {
    case 'price-asc':  arr.sort((a, b) => (a.l.price || 0) - (b.l.price || 0)); break;
    case 'price-desc': arr.sort((a, b) => (b.l.price || 0) - (a.l.price || 0)); break;
    case 'stars-asc':  arr.sort((a, b) => (a.l.stars || 1) - (b.l.stars || 1)); break;
    case 'stars-desc': arr.sort((a, b) => (b.l.stars || 1) - (a.l.stars || 1)); break;
    case 'sd-asc':     arr.sort((a, b) => { const fa = a.l.todayFib != null ? +a.l.todayFib : 999; const fb = b.l.todayFib != null ? +b.l.todayFib : 999; return fa - fb; }); break;
    case 'sd-desc':    arr.sort((a, b) => { const fa = a.l.todayFib != null ? +a.l.todayFib : -1;  const fb = b.l.todayFib != null ? +b.l.todayFib : -1;  return fb - fa; }); break;
  }
  return arr;
}

function renderSortBar() {
  const OPTS = [
    { key: 'price', label: 'Price',    asc: 'price-asc',  desc: 'price-desc' },
    { key: 'stars', label: 'Stars',    asc: 'stars-asc',  desc: 'stars-desc' },
    { key: 'sd',    label: 'SD Level', asc: 'sd-asc',     desc: 'sd-desc'    },
  ];
  const sortBtns = OPTS.map(o => {
    let arrow = '⇅', active = '';
    let next;
    if (levelSortOrder === o.asc)       { arrow = '↑'; active = ' active'; next = o.desc; }
    else if (levelSortOrder === o.desc) { arrow = '↓'; active = ' active'; next = 'default'; }
    else                                { next = o.asc; }
    return `<button class="sort-btn${active}" onclick="setLevelSort('${next}')">${o.label} ${arrow}</button>`;
  }).join('');

  const strengthBtns = [
    { v: 'all',      label: 'All' },
    { v: 'strong',   label: 'Strong' },
    { v: 'strongest',label: 'Tight' },
  ].map(o =>
    `<button class="sort-btn${filterStrength===o.v?' active':''}" onclick="setStrengthFilter('${o.v}')" title="${o.v==='strongest'?'Tight confluences only':o.v==='strong'?'All confluences':'All saved levels'}">${o.label}</button>`
  ).join('');

  return `<div class="sort-bar"><span class="sort-lbl">Sort</span>${sortBtns}<span class="sort-lbl" style="margin-left:8px">View</span>${strengthBtns}</div>`;
}

function renderAllView(){
  const dates=Object.keys(journalData).sort().reverse();
  if(dates.length===0)return`<div class="empty-state"><div class="em-icon">&#128237;</div><h3>No data yet</h3><p>Save levels from the dashboard to begin.</p></div>`;
  let html=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">${renderSortBar()}</div>`;
  dates.forEach(date=>{
    const dayObj=journalData[date];
    const pairs=Object.keys(dayObj).filter(p=>filterPair==='all'||p===filterPair);
    if(pairs.length===0)return;
    const fmt=new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const allLevels=[];pairs.forEach(p=>(dayObj[p].levels||[]).forEach(l=>{if(levelPassesStrengthFilter(l))allLevels.push(l);}));
    html+=`<div class="day-group"><div class="day-group-header" onclick="selectDate('${date}')" style="cursor:pointer">
      <span class="day-group-date">${fmt}</span>
      <span class="day-group-meta">${pairs.join(', ')} &middot; ${allLevels.length} levels</span>
      <div class="day-group-pills">${summaryPills(allLevels)}</div>
    </div>`;
    pairs.forEach(pair=>{
      const levels=dayObj[pair].levels||[];const macro=dayObj[pair].macro||{};
      html+=`<div class="day-pair-section"><div class="day-pair-lbl">${pair} <span style="font-weight:400;color:var(--text3)">Macro ${macro.bias||'&mdash;'} ${macro.score!==undefined?(macro.score>0?'+':'')+macro.score:''} &middot; Vol ${macro.volRegime||'&mdash;'}</span></div><div class="levels-grid">${sortedIndexed(levels).map(({l,i})=>renderLevelCard(l,i,date,pair)).join('')}</div></div>`;
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

    // When watchlist filter is on, recompute stats from per-level results filtered to watchlist only
    let stats = payload.stats, byFib = payload.byFib || {}, byStar = payload.byStar || {};
    if (filterWatchlist) {
      const wlResults = (payload.results || []).filter(r => r.level?.watchlist);
      if (!wlResults.length) continue;
      ({ stats, byFib, byStar } = computeReplayStatsFromResults(wlResults));
    }

    agg.days++;
    agg.total   += stats.total;
    agg.touched += stats.touched;
    agg.traded  += stats.traded;
    agg.wins    += stats.wins;
    agg.losses  += stats.losses;
    agg.eods    += (stats.eods || 0);
    agg.totalR  += stats.totalR;

    if (!agg.byPair[pair]) agg.byPair[pair] = { days: 0, touched: 0, traded: 0, wins: 0, losses: 0, eods: 0, r: 0 };
    agg.byPair[pair].days++;
    agg.byPair[pair].touched += stats.touched;
    agg.byPair[pair].traded  += stats.traded;
    agg.byPair[pair].wins    += stats.wins;
    agg.byPair[pair].losses  += stats.losses;
    agg.byPair[pair].eods    += (stats.eods || 0);
    agg.byPair[pair].r       += stats.totalR;

    for (const [fib, s] of Object.entries(byFib)) {
      if (!agg.byFib[fib]) agg.byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
      agg.byFib[fib].touched += s.touched; agg.byFib[fib].tp += s.tp; agg.byFib[fib].sl += s.sl; agg.byFib[fib].eod += s.eod; agg.byFib[fib].r += s.r;
    }

    for (const [star, s] of Object.entries(byStar)) {
      if (!agg.byStar[star]) agg.byStar[star] = { touched: 0, tp: 0, sl: 0, r: 0 };
      agg.byStar[star].touched += s.touched; agg.byStar[star].tp += s.tp; agg.byStar[star].sl += s.sl; agg.byStar[star].r += s.r;
    }

    agg.byDate.push({ date, pair, r: stats.totalR, wins: stats.wins, losses: stats.losses, winRate: stats.winRate });
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
    <div class="stat-card"><div class="stat-card-lbl">Total R</div><div class="stat-card-val" style="color:${rc}">${d.totalR >= 0 ? '+' : ''}${d.totalR}R</div><div class="stat-card-sub">${d.traded} traded passes</div></div>
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
    ${renderRunningTotalsSection()}
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
        if(filterWatchlist&&!l.watchlist)return;
        if(!levelPassesStrengthFilter(l))return;
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

// Shared filter logic — applies star, taken-only, watchlist, and max-rows filters for one pair/date.
function getFilteredLevels(pair,date){
  const dayObj=journalData[date];
  if(!dayObj||!dayObj[pair])return{levels:[],macro:{}};
  let levels=dayObj[pair].levels||[];

  if(filterWatchlist||document.getElementById('exportWatchlistOnly')?.checked)
    levels=levels.filter(l=>l.watchlist);

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

function _slimReplayResults() {
  const slim = {};
  for (const [key, payload] of Object.entries(_replayResults)) {
    slim[key] = {
      ...payload,
      results: (payload.results || []).map(r => {
        const { chartBars, level, passes, ...rest } = r;
        return {
          ...rest,
          passes: (passes || []).map(({ chartBars: _cb, ...p }) => p),
          level: level ? {
            price: level.price, direction: level.direction,
            stars: level.stars, todayFib: level.todayFib,
            source: level.source, tags: level.tags,
            sl: level.sl, tp: level.tp,
          } : null,
        };
      }),
    };
  }
  return slim;
}

function saveReplayResults() {
  // Prune entries older than 60 days to prevent unbounded growth
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const key of Object.keys(_replayResults)) {
    const datePart = key.split('::')[1];
    if (datePart && datePart < cutoffStr) delete _replayResults[key];
  }

  const slim = _slimReplayResults();
  try { localStorage.setItem(REPLAY_KV_KEY, JSON.stringify(slim)); } catch(e) {
    console.warn('saveReplayResults: localStorage write failed', e);
  }
  kvSet(REPLAY_KV_KEY, slim);
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

  // Reset controls to defaults for each new open
  const starSel = document.getElementById('rp-min-stars');
  if (starSel) starSel.value = '1';
  const endDtEl = document.getElementById('rp-end-dt');
  if (endDtEl) { endDtEl.value = ''; endDtEl.max = new Date().toISOString().slice(0, 16); }
  const slModeEl = document.getElementById('rp-sl-mode'); if (slModeEl) slModeEl.value = '';
  const slValEl  = document.getElementById('rp-sl-val');  if (slValEl)  slValEl.value  = '';
  const tpModeEl = document.getElementById('rp-tp-mode'); if (tpModeEl) tpModeEl.value = '';
  const tpValEl  = document.getElementById('rp-tp-val');  if (tpValEl)  tpValEl.value  = '';
  const atrInfo  = document.getElementById('rp-atr-info'); if (atrInfo) atrInfo.textContent = '';
  // Restore persisted cost settings for this pair, falling back to per-pair defaults
  const savedCosts = (runningTotalsConfig.costSettings || {})[pair];
  const pairCs = savedCosts || COST_DEFAULTS[pair] || { spread:1.2, slip:0.3, comm:7.0, lots:1 };
  const spreadEl=document.getElementById('rp-spread'); if(spreadEl) spreadEl.value=pairCs.spread;
  const slipEl  =document.getElementById('rp-slip');   if(slipEl)   slipEl.value  =pairCs.slip;
  const commEl  =document.getElementById('rp-comm');   if(commEl)   commEl.value  =pairCs.comm;
  const lotsEl  =document.getElementById('rp-lots');   if(lotsEl)   lotsEl.value  =pairCs.lots;
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

  // ── 1. Parse options ──────────────────────────────────────────────────────
  const endDtVal = document.getElementById('rp-end-dt')?.value || '';
  const slMode   = document.getElementById('rp-sl-mode')?.value || '';
  const slValRaw = parseFloat(document.getElementById('rp-sl-val')?.value  || '');
  const slVal    = !isNaN(slValRaw) && slValRaw > 0 ? slValRaw : null;
  const tpMode   = document.getElementById('rp-tp-mode')?.value || '';
  const tpValRaw = parseFloat(document.getElementById('rp-tp-val')?.value  || '');
  const tpVal    = !isNaN(tpValRaw) && tpValRaw > 0 ? tpValRaw : null;

  let endDt = null; // { dateStr, mins }
  let days  = 1;
  if (endDtVal) {
    const [endDateStr, endTimeStr] = endDtVal.split('T');
    const [endH, endM] = (endTimeStr || '21:00').split(':').map(Number);
    endDt = { dateStr: endDateStr, mins: endH * 60 + (endM || 0) };
    const diff = (new Date(endDateStr + 'T00:00:00') - new Date(date + 'T00:00:00')) / 86400000;
    days = Math.min(7, Math.max(1, Math.ceil(diff) + 1));
  }

  // ── 2. Fetch M1 bars ──────────────────────────────────────────────────────
  let bars;
  try {
    const url = `/api/oanda_ohlc1m?symbol=${encodeURIComponent(pair)}&date=${encodeURIComponent(date)}&days=${days}`;
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
      return { h: +v.high, l: +v.low, o: +v.open, c: +v.close, hour, min, date: dt.slice(0, 10) };
    });
  } catch(e) {
    setReplayStatus(e.message, 'rp-fetch-err');
    document.getElementById('rp-result-area').innerHTML = `<div class="rp-error">${e.message}</div>`;
    btn.disabled = false; btn.textContent = '▶ Fetch & Run';
    return;
  }

  setReplayStatus(`${bars.length} bars — running replay…`, 'rp-fetch-ok');
  document.getElementById('rp-result-area').innerHTML = '<div class="rp-loading">Running replay…</div>';

  // ── 3. Run replay synchronously ───────────────────────────────────────────
  const dayObj = journalData[date]?.[pair];
  if (!dayObj?.levels?.length) {
    document.getElementById('rp-result-area').innerHTML = '<div class="rp-error">No levels to replay for this pair/date.</div>';
    btn.disabled = false; btn.textContent = '▶ Fetch & Run';
    return;
  }

  const payload = runReplayEngine(pair, date, bars, dayObj.levels, { endDt, slMode: slMode || null, slVal, tpMode: tpMode || null, tpVal });

  // ── 3. Cache + persist ────────────────────────────────────────────────────
  const isCustom = !!(endDtVal || (slMode && slVal) || (tpMode && tpVal));
  const key = pair + '::' + date + (isCustom ? '::custom' : '');
  _replayResults[key] = payload;
  saveReplayResults();
  renderQuickStats();

  // ── 4. Render ─────────────────────────────────────────────────────────────
  const atrInfoEl = document.getElementById('rp-atr-info');
  if (atrInfoEl) atrInfoEl.textContent = payload.stats.atr30Pips ? `30M ATR: ${payload.stats.atr30Pips.toFixed(1)}p` : '';
  const atrNote = payload.stats.atr30Pips ? ` · 30M ATR ${payload.stats.atr30Pips.toFixed(1)}p` : '';
  setReplayStatus(`Done — ${payload.stats.touched}/${payload.stats.total} touched · ${payload.stats.totalR >= 0 ? '+' : ''}${payload.stats.totalR}R${atrNote}`, 'rp-fetch-ok');
  renderReplayInModal(payload);
  updateInlineDayPanel(pair, date, payload);
  if (currentView === 'day' && selectedDate === date) renderMain();

  btn.disabled = false; btn.textContent = '▶ Fetch & Run';
}

function runReplay() { fetchAndReplay(); }   // Re-run button calls same path

// ── Replay computation (pure — no I/O) ────────────────────────────────────────

function runReplayEngine(pair, date, allBars, levels, opts = {}) {
  const pip    = getPipSz(pair);
  const endDt  = opts.endDt  ?? null;
  const slMode = opts.slMode ?? null;  // 'pips' | 'atr' | null
  const slVal  = opts.slVal  ?? null;
  const tpMode = opts.tpMode ?? null;  // 'pips' | 'atr' | null
  const tpVal  = opts.tpVal  ?? null;
  // Compute 30M ATR once for the whole run if either override uses it
  const atr30Pips = (slMode === 'atr' || tpMode === 'atr') ? compute30mATR(allBars, pip) : null;

  // Window: 08:00 on target date → endDt (or 21:00 on target date)
  const windowBars = allBars.filter(b => {
    if (!b.date || b.date < date) return false;
    const mins = b.hour * 60 + b.min;
    if (b.date === date && mins < 480) return false;
    if (endDt) {
      if (b.date > endDt.dateStr) return false;
      if (b.date === endDt.dateStr && mins > endDt.mins) return false;
    } else {
      if (b.date !== date) return false;
      if (mins >= 1260) return false;
    }
    return true;
  });

  // Format exit time — include date prefix for multi-day windows
  const fmtExitTime = (bar) => {
    const hm = hhmm(bar);
    if (endDt && bar.date && bar.date !== date) return `${bar.date.slice(5)} ${hm}`;
    return hm;
  };

  const results = [];
  let runningR = 0;
  const equity = [{ label: 'Start', r: 0, cumR: 0 }];

  // Use the 08:00 open of the replay day as the anchor for direction so that
  // levels which have since flipped (e.g. a former short that price has moved
  // above, now showing as long on the live dashboard) are replayed with the
  // direction they actually had at the start of that session.
  const dayOpenPrice = windowBars[0]?.o ?? null;

  for (let li = 0; li < levels.length; li++) {
    const level      = levels[li];
    const entryPrice = level.price;
    const replayDir  = (dayOpenPrice != null && entryPrice)
      ? (entryPrice > dayOpenPrice + pip * 0.5 ? 'short'
       : entryPrice < dayOpenPrice - pip * 0.5 ? 'long' : null)
      : null;
    const dir        = replayDir ?? level.direction;
    const stars      = level.stars || 1;

    // SL / TP overrides — pips from entry, or ATR multiplier, or level default
    let sl = level.slOverride ?? level.sl;
    let tp = level.tpOverride ?? level.tp;
    if (entryPrice && dir) {
      if (slMode === 'pips' && slVal > 0) {
        sl = dir === 'long' ? entryPrice - slVal * pip : entryPrice + slVal * pip;
      } else if (slMode === 'atr' && slVal > 0 && atr30Pips) {
        sl = dir === 'long' ? entryPrice - slVal * atr30Pips * pip : entryPrice + slVal * atr30Pips * pip;
      }
      if (tpMode === 'pips' && tpVal > 0) {
        tp = dir === 'long' ? entryPrice + tpVal * pip : entryPrice - tpVal * pip;
      } else if (tpMode === 'atr' && tpVal > 0 && atr30Pips) {
        tp = dir === 'long' ? entryPrice + tpVal * atr30Pips * pip : entryPrice - tpVal * atr30Pips * pip;
      }
    }

    if (!entryPrice || !dir || !sl || !tp) {
      results.push({ level, passes: [], touched: false, result: 'no-data', r: null, touchTime: null, exitTime: null, maxFav: null, maxAdv: null, chartBars: null, entryPrice, sl, tp, dir });
      continue;
    }
    const slDist = Math.abs(entryPrice - sl);
    const tpDist = Math.abs(entryPrice - tp);
    if (slDist <= 0) {
      results.push({ level, passes: [], touched: false, result: 'no-sl', r: null, touchTime: null, exitTime: null, maxFav: null, maxAdv: null, chartBars: null, entryPrice, sl, tp, dir });
      continue;
    }

    // Multi-pass: keep scanning after each SL/TP exit until no more touches found
    const passes = [];
    let scanFrom = 0;

    while (scanFrom < windowBars.length) {
      let inTrade = false, touchBarIdx = -1, exitBarIdx = -1;
      let pTouchTime = null, pExitTime = null, pResult = 'untouched', pR = null;
      let pMaxFav = 0, pMaxAdv = 0, nextScan = windowBars.length;
      // Per-pass direction and SL/TP — re-derived at touch time from approach bar so
      // a level touched from above (support) and from below (resistance) scores correctly.
      let passDir = dir;
      let passSl  = sl;
      let passTp  = tp;

      for (let bi = scanFrom; bi < windowBars.length; bi++) {
        const bar     = windowBars[bi];
        const barMins = bar.hour * 60 + bar.min;

        if (!inTrade && bar.l <= entryPrice + pip * 0.5 && bar.h >= entryPrice - pip * 0.5) {
          inTrade = true; touchBarIdx = bi; pTouchTime = hhmm(bar);
          // Derive approach direction from the bar before the touch:
          // prior close above level → price fell to it → support → long
          // prior close below level → price rose to it → resistance → short
          if (bi > 0) {
            const prevClose = windowBars[bi - 1].c;
            if      (prevClose > entryPrice + pip * 0.5) passDir = 'long';
            else if (prevClose < entryPrice - pip * 0.5) passDir = 'short';
          }
          if (passDir !== dir) {
            passSl = passDir === 'long' ? entryPrice - slDist : entryPrice + slDist;
            passTp = passDir === 'long' ? entryPrice + tpDist : entryPrice - tpDist;
          }
        }
        if (inTrade) {
          const fav = passDir === 'long' ? (bar.h - entryPrice) / pip : (entryPrice - bar.l) / pip;
          const adv = passDir === 'long' ? (entryPrice - bar.l) / pip : (bar.h - entryPrice) / pip;
          if (fav > pMaxFav) pMaxFav = fav;
          if (adv > pMaxAdv) pMaxAdv = adv;

          if (passDir === 'long') {
            if (bar.l <= passSl) { pResult = 'sl'; pR = -1; pExitTime = fmtExitTime(bar); exitBarIdx = bi; nextScan = bi + 1; break; }
            if (bar.h >= passTp) { pResult = 'tp'; pR = tpDist / slDist; pExitTime = fmtExitTime(bar); exitBarIdx = bi; nextScan = bi + 1; break; }
          } else {
            if (bar.h >= passSl) { pResult = 'sl'; pR = -1; pExitTime = fmtExitTime(bar); exitBarIdx = bi; nextScan = bi + 1; break; }
            if (bar.l <= passTp) { pResult = 'tp'; pR = tpDist / slDist; pExitTime = fmtExitTime(bar); exitBarIdx = bi; nextScan = bi + 1; break; }
          }
          if (bi === windowBars.length - 1) {
            // Last bar in window (21:00 EOD or custom end datetime)
            const eodPnl = passDir === 'long' ? bar.c - entryPrice : entryPrice - bar.c;
            pR = Math.max(-1, Math.min(tpDist / slDist, eodPnl / slDist));
            pResult = 'eod';
            pExitTime = endDt ? fmtExitTime(bar) : '21:00';
            exitBarIdx = bi; break;
          }
        }
      }

      if (!inTrade) break; // no touch found from scanFrom — done with this level
      if (pResult === 'untouched') pResult = 'open';

      const from = Math.max(0, touchBarIdx - 12);
      const to   = Math.min(windowBars.length, (exitBarIdx >= 0 ? exitBarIdx : touchBarIdx + 30) + 8);
      const chartBarsPass = windowBars.slice(from, to).map((b, i2) => ({
        ...b, t: hhmm(b),
        isTouchBar: (from + i2) === touchBarIdx,
        isExitBar:  exitBarIdx >= 0 && (from + i2) === exitBarIdx,
      }));

      const touchBar = touchBarIdx >= 0 ? windowBars[touchBarIdx] : null;
      const exitBar  = exitBarIdx  >= 0 ? windowBars[exitBarIdx]  : null;
      const durationMs = (touchBar && exitBar) ? barToMs(exitBar) - barToMs(touchBar) : null;

      passes.push({
        touchTime: pTouchTime, exitTime: pExitTime, result: pResult,
        r: pR !== null ? +pR.toFixed(2) : null,
        duration: durationMs !== null ? formatDuration(durationMs) : null,
        maxFav: pMaxFav > 0 ? +pMaxFav.toFixed(1) : null,
        maxAdv: pMaxAdv > 0 ? +pMaxAdv.toFixed(1) : null,
        chartBars: chartBarsPass,
        dir: passDir, sl: passSl, tp: passTp,
      });

      // EOD or open (still in trade) stops scanning; SL/TP continue from nextScan
      if (pResult === 'eod' || pResult === 'open') break;
      scanFrom = nextScan;
    }

    // Derive level-level fields from passes (backward-compat)
    const touched    = passes.length > 0;
    const touchTime  = passes[0]?.touchTime ?? null;
    const exitTime   = passes[passes.length - 1]?.exitTime ?? null;
    const chartBars  = passes[0]?.chartBars ?? null;
    const result     = touched ? passes[passes.length - 1].result : 'untouched';
    const rSum       = passes.reduce((s, p) => s + (p.r ?? 0), 0);
    const r          = touched ? +rSum.toFixed(2) : null;
    const maxFav     = passes.length > 0 ? Math.max(...passes.map(p => p.maxFav || 0)) : null;
    const maxAdv     = passes.length > 0 ? Math.max(...passes.map(p => p.maxAdv || 0)) : null;

    // Equity: one point per closed pass
    for (const pass of passes) {
      if (pass.result === 'tp' || pass.result === 'sl' || pass.result === 'eod') {
        runningR += pass.r || 0;
        equity.push({ label: `${stars}★ ${level.todayFib != null ? 'SD' + level.todayFib : ''}`, r: +(pass.r || 0).toFixed(2), cumR: +runningR.toFixed(2), result: pass.result, touchTime: pass.touchTime });
      }
    }

    results.push({ level, touched, passes, result, r, touchTime, exitTime, maxFav: maxFav !== null && maxFav > 0 ? maxFav : null, maxAdv: maxAdv !== null && maxAdv > 0 ? maxAdv : null, chartBars, entryPrice, sl, tp, dir });
  }

  // Count all passes (not levels) for P&L stats
  const allPasses    = results.flatMap(r => r.passes || []);
  const tradedPasses = allPasses.filter(p => p.result === 'tp' || p.result === 'sl' || p.result === 'eod');
  const winPasses    = tradedPasses.filter(p => p.result === 'tp');
  const lossPasses   = tradedPasses.filter(p => p.result === 'sl');
  const eodPasses    = tradedPasses.filter(p => p.result === 'eod');
  const touchedLevels = results.filter(r => r.touched);
  const totalR       = +tradedPasses.reduce((s, p) => s + (p.r || 0), 0).toFixed(2);

  const byFib = {}, byStar = {};
  for (const res of results) {
    let fib;
    if (res.level.todayFib != null) {
      fib = String(res.level.todayFib);
    } else if (res.level.source === 'asia' || res.level.source === 'monday') {
      fib = res.level.source;
    } else {
      const tagLabels = (res.level.tags || []).map(t => (t.label || '').toLowerCase());
      if (tagLabels.some(l => l.includes('asia')))    fib = 'asia';
      else if (tagLabels.some(l => l.includes('mon'))) fib = 'monday';
      else fib = 'other';
    }
    if (!byFib[fib]) byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
    if (res.touched) byFib[fib].touched++;
    for (const p of (res.passes || [])) {
      if (p.result === 'tp')  { byFib[fib].tp++;  byFib[fib].r += p.r || 0; }
      if (p.result === 'sl')  { byFib[fib].sl++;  byFib[fib].r -= 1; }
      if (p.result === 'eod') { byFib[fib].eod++; byFib[fib].r += p.r || 0; }
    }
    const s = String(res.level.stars || 1);
    if (!byStar[s]) byStar[s] = { touched: 0, tp: 0, sl: 0, r: 0 };
    if (res.touched) byStar[s].touched++;
    for (const p of (res.passes || [])) {
      if (p.result === 'tp')  { byStar[s].tp++; byStar[s].r += p.r || 0; }
      if (p.result === 'sl')  { byStar[s].sl++; byStar[s].r -= 1; }
    }
  }

  return { pair, date, results, equity, byFib, byStar, stats: { total: results.length, touched: touchedLevels.length, traded: tradedPasses.length, wins: winPasses.length, losses: lossPasses.length, eods: eodPasses.length, totalR, winRate: tradedPasses.length > 0 ? Math.round(winPasses.length / tradedPasses.length * 100) : null, atr30Pips: atr30Pips ? +atr30Pips.toFixed(1) : null } };
}

function hhmm(bar) { return `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`; }

function barToMs(bar) {
  return new Date(`${bar.date}T${hhmm(bar)}:00Z`).getTime();
}

function compute30mATR(bars, pip) {
  // Aggregate M1 bars into 30-min candles, return average TR in pips
  const candles = [];
  let slot = -1, grpH = 0, grpL = Infinity, grpC = 0, hasGrp = false;
  for (const b of bars) {
    const s = Math.floor((b.hour * 60 + b.min) / 30);
    if (s !== slot) {
      if (hasGrp) candles.push({ h: grpH, l: grpL, c: grpC });
      slot = s; grpH = b.h; grpL = b.l; grpC = b.c; hasGrp = true;
    } else {
      if (b.h > grpH) grpH = b.h;
      if (b.l < grpL) grpL = b.l;
      grpC = b.c;
    }
  }
  if (hasGrp) candles.push({ h: grpH, l: grpL, c: grpC });
  if (candles.length < 2) return null;
  let trSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], pc = candles[i - 1].c;
    trSum += Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
  }
  return (trSum / (candles.length - 1)) / pip;
}
function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

let _lastReplayPayload = null; // for star filter re-render

function rpApplyStarFilter() {
  if (!_lastReplayPayload) return;
  const minStars = parseInt(document.getElementById('rp-min-stars')?.value || '1', 10);
  renderReplayInModal(_lastReplayPayload, minStars);
}

function rpPnlChanged() {
  // Account/risk% changed — just re-render with new P&L values, no re-fetch needed
  if (_lastReplayPayload) renderReplayInModal(_lastReplayPayload);
}

function rpOptionsChanged() {
  // Options changed — clear custom cache and prompt re-run
  const modal = document.getElementById('replayModal');
  if (!modal) return;
  const baseKey = modal.dataset.pair + '::' + modal.dataset.date;
  delete _replayResults[baseKey + '::custom'];
  saveReplayResults();
  _lastReplayPayload = null;
  const ra = document.getElementById('rp-result-area');
  if (ra) ra.innerHTML = '';
  setReplayStatus('Option changed — click Fetch & Run to re-run', 'rp-fetch-idle');
}

// Save cost settings per-pair and re-render results with updated costs
function rpCostChanged() {
  const pair   = document.getElementById('replayModal')?.dataset.pair || '';
  const spread = parseFloat(document.getElementById('rp-spread')?.value || '') || 0;
  const slip   = parseFloat(document.getElementById('rp-slip')?.value   || '') || 0;
  const comm   = parseFloat(document.getElementById('rp-comm')?.value   || '') || 0;
  const lots   = parseFloat(document.getElementById('rp-lots')?.value   || '') || 1;
  if (!runningTotalsConfig.costSettings) runningTotalsConfig.costSettings = {};
  runningTotalsConfig.costSettings[pair] = { spread, slip, comm, lots };
  saveRunningTotals();
  if (_lastReplayPayload) renderReplayInModal(_lastReplayPayload);
}

// Auto-fill ATR defaults when mode switches to ATR
function rpSlModeChanged() {
  const mode = document.getElementById('rp-sl-mode').value;
  const valEl = document.getElementById('rp-sl-val');
  if (mode === 'atr' && !valEl.value) valEl.value = '1';
  rpOptionsChanged();
}
function rpTpModeChanged() {
  const mode = document.getElementById('rp-tp-mode').value;
  const valEl = document.getElementById('rp-tp-val');
  if (mode === 'atr' && !valEl.value) valEl.value = '2.2';
  rpOptionsChanged();
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
  const filteredPasses  = filteredResults.flatMap(r => r.passes || []);
  const tradedPasses    = filteredPasses.filter(p => p.result === 'tp' || p.result === 'sl' || p.result === 'eod');
  const wins    = tradedPasses.filter(p => p.result === 'tp');
  const losses  = tradedPasses.filter(p => p.result === 'sl');
  const eods    = tradedPasses.filter(p => p.result === 'eod');
  const touched = filteredResults.filter(r => r.touched);
  const totalR  = +tradedPasses.reduce((s, p) => s + (p.r || 0), 0).toFixed(2);

  // Rebuild byFib + byStar from filtered set (pass-counting)
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
    for (const p of (res.passes || [])) {
      if (p.result === 'tp')  { byFib[fib].tp++;  byFib[fib].r += p.r || 0; }
      if (p.result === 'sl')  { byFib[fib].sl++;  byFib[fib].r -= 1; }
      if (p.result === 'eod') { byFib[fib].eod++; byFib[fib].r += p.r || 0; }
    }
    const s = String(res.level.stars || 1);
    if (!byStar[s]) byStar[s] = { touched: 0, tp: 0, sl: 0, r: 0 };
    if (res.touched) byStar[s].touched++;
    for (const p of (res.passes || [])) {
      if (p.result === 'tp')  { byStar[s].tp++; byStar[s].r += p.r || 0; }
      if (p.result === 'sl')  { byStar[s].sl++; byStar[s].r -= 1; }
    }
  }

  // Rebuild equity curve for filtered set (one point per pass)
  let running = 0;
  const equity = [{ label: 'Start', r: 0, cumR: 0 }];
  for (const res of filteredResults) {
    for (const p of (res.passes || [])) {
      if (p.result === 'tp' || p.result === 'sl' || p.result === 'eod') {
        running += p.r || 0;
        equity.push({ label: '', r: p.r || 0, cumR: +running.toFixed(2), result: p.result });
      }
    }
  }

  const filteredPayload = {
    ...payload,
    results: filteredResults,
    equity,
    byFib,
    byStar,
    stats: { total: filteredResults.length, touched: touched.length, traded: tradedPasses.length, wins: wins.length, losses: losses.length, eods: eods.length, totalR, winRate: tradedPasses.length > 0 ? Math.round(wins.length / tradedPasses.length * 100) : null, atr30Pips: payload.stats.atr30Pips ?? null },
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

  // ── P&L helpers — active only when account + risk% are both set ──
  const _acct   = parseFloat(document.getElementById('rp-account')?.value   || '');
  const _rpct   = parseFloat(document.getElementById('rp-risk-pct')?.value  || '');
  const showPnl = !isNaN(_acct) && _acct > 0 && !isNaN(_rpct) && _rpct > 0;
  const riskAmt = showPnl ? _acct * (_rpct / 100) : 0;
  const fmtPnl  = (r) => {
    if (!showPnl || r === null) return '';
    const v = r * riskAmt;
    return `<span style="font-size:9px;color:${v >= 0 ? 'var(--green)' : 'var(--red)'}"> ${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(0)}</span>`;
  };

  // ── Transaction cost helpers ──
  const _spread = parseFloat(document.getElementById('rp-spread')?.value || '') || 0;
  const _slip   = parseFloat(document.getElementById('rp-slip')?.value   || '') || 0;
  const _comm   = parseFloat(document.getElementById('rp-comm')?.value   || '') || 0;
  const _lots   = parseFloat(document.getElementById('rp-lots')?.value   || '') || 1;
  const hasCosts = _spread > 0 || _slip > 0 || _comm > 0;
  const pip      = getPipSz(payload.pair);
  const pipVal   = PIP_VALUE_PER_LOT[payload.pair] || 10;
  // Commission expressed as equivalent pips (so it can be divided by SL pips to get R)
  const commPips     = _comm / pipVal;
  const totalCostPips = _spread + _slip + commPips;

  // Cost in R for one trade — lot-size cancels for R, only matters for $ display
  const costRForTrade = (entryPrice, sl) => {
    if (!hasCosts || !entryPrice || !sl) return 0;
    const slPips = Math.abs(entryPrice - sl) / pip;
    return slPips > 0 ? +(totalCostPips / slPips).toFixed(3) : 0;
  };
  // Cost in $ for one trade (needs lot size)
  const costDollarForTrade = () => hasCosts ? +(_lots * totalCostPips * pipVal).toFixed(2) : 0;

  // Sum cost R across all traded passes
  let totalCostR = 0;
  for (const res of results) {
    if (!res.touched) continue;
    const cR = costRForTrade(res.entryPrice, res.sl);
    for (const p of (res.passes || [])) {
      if (p.result === 'tp' || p.result === 'sl' || p.result === 'eod') totalCostR += cR;
    }
  }
  totalCostR = +totalCostR.toFixed(2);
  const netR  = +(stats.totalR - totalCostR).toFixed(2);
  const netRc = netR >= 0 ? 'vu' : 'vd';

  // Build per-trade R cell: shows gross R + "net X.XXR" annotation when costs active
  const mkRCell = (grossR, entryPrice, sl, traded) => {
    if (grossR === null) return '—';
    if (!hasCosts || !traded) return `<span class="${grossR >= 0 ? 'vu' : 'vd'}">${grossR > 0 ? '+' : ''}${grossR}R</span>${fmtPnl(grossR)}`;
    const cR  = costRForTrade(entryPrice, sl);
    const nR  = +(grossR - cR).toFixed(2);
    const nCol = nR >= 0 ? 'var(--green)' : 'var(--red)';
    return `<span class="${grossR >= 0 ? 'vu' : 'vd'}">${grossR > 0 ? '+' : ''}${grossR}R</span>`
      + ` <span style="font-size:9px;color:${nCol}">→${nR >= 0 ? '+' : ''}${nR}</span>${fmtPnl(nR)}`;
  };

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
    <div class="rp-stat"><span class="rp-stat-lbl">Gross R</span><span class="rp-stat-val ${rc}">${stats.totalR > 0 ? '+' : ''}${stats.totalR}R</span></div>
    ${hasCosts ? `
    <div class="rp-stat" style="border-left:1px solid var(--border);padding-left:10px;margin-left:2px">
      <span class="rp-stat-lbl">Costs</span>
      <span class="rp-stat-val vd" title="${_spread}p spread + ${_slip}p slip + $${_comm} comm = ${totalCostPips.toFixed(1)}p/trade">-${totalCostR}R${hasCosts&&_lots!==1?` <span style="font-size:9px">($${(costDollarForTrade()).toFixed(0)}/trade × ${_lots}L)</span>`:''}</span>
    </div>
    <div class="rp-stat">
      <span class="rp-stat-lbl">Net R</span>
      <span class="rp-stat-val ${netRc}">${netR >= 0 ? '+' : ''}${netR}R${fmtPnl(netR)}</span>
    </div>` : showPnl ? `
    <div class="rp-stat" style="border-left:1px solid var(--border);padding-left:10px;margin-left:2px">
      <span class="rp-stat-lbl">Day P&amp;L</span>
      <span class="rp-stat-val ${stats.totalR >= 0 ? 'vu' : 'vd'}">${stats.totalR >= 0 ? '+' : ''}$${Math.abs(stats.totalR * riskAmt).toFixed(0)}</span>
    </div>` : ''}
    ${stats.atr30Pips ? `<div class="rp-stat" style="border-left:1px solid var(--border);padding-left:10px;margin-left:2px"><span class="rp-stat-lbl">30M ATR</span><span class="rp-stat-val" style="font-size:14px;color:var(--purple)">${stats.atr30Pips}p</span></div>` : ''}
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
    <thead><tr><th></th><th>SD</th><th>Price</th><th>Dir</th><th>Stars</th><th>Touch</th><th>Exit</th><th>Open</th><th>Result</th><th>R</th><th>MaxFav</th><th>MaxAdv</th></tr></thead><tbody>`;

  for (let ri = 0; ri < results.length; ri++) {
    const res = results[ri];
    const l   = res.level;
    const dig = 5;
    const priceStr = typeof l.price === 'number' ? l.price.toFixed(dig) : (l.price || '—');
    const sd    = l.todayFib != null ? 'SD' + l.todayFib : '—';
    const dirHtml = l.direction === 'long' ? '<span class="rp-long">↑L</span>' : '<span class="rp-short">↓S</span>';
    const stars  = '★'.repeat(Math.min(l.stars || 1, 5));

    const passes = res.passes && res.passes.length > 0 ? res.passes : null;

    if (!passes) {
      // Untouched or old cached result without passes
      const touch  = res.touchTime || '—';
      const exit   = res.exitTime  || '—';
      let resultBadge = '<span class="rp-badge untouched">—</span>';
      if (res.result === 'tp')        resultBadge = '<span class="rp-badge tp">TP</span>';
      else if (res.result === 'sl')   resultBadge = '<span class="rp-badge sl">SL</span>';
      else if (res.result === 'eod')  resultBadge = '<span class="rp-badge eod">EOD</span>';
      else if (res.result === 'open') resultBadge = '<span class="rp-badge open">OPEN</span>';
      const rStr   = mkRCell(res.r, res.entryPrice, res.sl, res.result === 'tp' || res.result === 'sl' || res.result === 'eod');
      const favStr = res.maxFav !== null ? `+${res.maxFav}p` : '—';
      const advStr = res.maxAdv !== null ? `<span class="vd">${res.maxAdv}p</span>` : '—';
      const rowCls = res.result === 'tp' ? 'rp-row-win' : res.result === 'sl' ? 'rp-row-loss' : '';
      const chartId = `rp-chart-${ri}-0`;
      const canExpand = !!res.chartBars;
      const chevron = canExpand
        ? `<button class="rp-chevron" onclick="rpToggleChart('${chartId}')" aria-label="Toggle chart">▶</button>`
        : `<span class="rp-chevron-ph"></span>`;
      tableHtml += `<tr class="${rowCls}"><td class="rp-chevron-cell">${chevron}</td>`
        + `<td>${sd}</td><td class="mono">${priceStr}</td><td>${dirHtml}</td><td class="rp-stars">${stars}</td>`
        + `<td class="mono">${touch}</td><td class="mono">${exit}</td><td>${resultBadge}</td>`
        + `<td class="mono">${rStr}</td><td class="mono vn">${favStr}</td><td class="mono">${advStr}</td></tr>`;
      if (canExpand) {
        tableHtml += `<tr id="${chartId}" class="rp-chart-row" style="display:none">`
          + `<td colspan="11" class="rp-chart-cell">${buildCandleChart(res)}</td></tr>`;
      }
    } else if (passes.length === 1) {
      // Single pass — standard row
      const p = passes[0];
      const resultBadge = p.result === 'tp' ? '<span class="rp-badge tp">TP</span>'
        : p.result === 'sl'  ? '<span class="rp-badge sl">SL</span>'
        : p.result === 'eod' ? '<span class="rp-badge eod">EOD</span>'
        : `<span class="rp-badge open">${p.result.toUpperCase()}</span>`;
      const pSl    = p.sl ?? res.sl;
      const pTp    = p.tp ?? res.tp;
      const pDir   = p.dir ?? res.dir;
      const rStr   = mkRCell(p.r, res.entryPrice, pSl, p.result === 'tp' || p.result === 'sl' || p.result === 'eod');
      const favStr = p.maxFav !== null ? `+${p.maxFav}p` : '—';
      const advStr = p.maxAdv !== null ? `<span class="vd">${p.maxAdv}p</span>` : '—';
      const rowCls = p.result === 'tp' ? 'rp-row-win' : p.result === 'sl' ? 'rp-row-loss' : '';
      const chartId = `rp-chart-${ri}-0`;
      const canExpand = !!p.chartBars;
      const chevron = canExpand
        ? `<button class="rp-chevron" onclick="rpToggleChart('${chartId}')" aria-label="Toggle chart">▶</button>`
        : `<span class="rp-chevron-ph"></span>`;
      const durCell = p.duration ? `<span style="font-size:10px;color:var(--text3)">${p.duration}</span>` : '—';
      const pDirHtml = pDir === 'long' ? '<span class="rp-long">↑L</span>' : '<span class="rp-short">↓S</span>';
      tableHtml += `<tr class="${rowCls}"><td class="rp-chevron-cell">${chevron}</td>`
        + `<td>${sd}</td><td class="mono">${priceStr}</td><td>${pDirHtml}</td><td class="rp-stars">${stars}</td>`
        + `<td class="mono">${p.touchTime || '—'}</td><td class="mono">${p.exitTime || '—'}</td><td>${durCell}</td><td>${resultBadge}</td>`
        + `<td class="mono">${rStr}</td><td class="mono vn">${favStr}</td><td class="mono">${advStr}</td></tr>`;
      if (canExpand) {
        tableHtml += `<tr id="${chartId}" class="rp-chart-row" style="display:none">`
          + `<td colspan="11" class="rp-chart-cell">${buildCandleChart({ ...p, entryPrice: res.entryPrice, sl: pSl, tp: pTp, dir: pDir })}</td></tr>`;
      }
    } else {
      // Multi-pass: header row + sub-rows per pass
      const totalR    = passes.reduce((s, p) => s + (p.r || 0), 0);
      const hasSl     = passes.some(p => p.result === 'sl');
      const allTp     = passes.every(p => p.result === 'tp');
      const rowCls    = hasSl ? 'rp-row-loss' : allTp ? 'rp-row-win' : '';
      const totalCostRMulti = hasCosts ? +(passes.filter(p=>p.result==='tp'||p.result==='sl'||p.result==='eod').length * costRForTrade(res.entryPrice, res.sl)).toFixed(2) : 0;
      const netTotalR = +(totalR - totalCostRMulti).toFixed(2);
      const rStr      = hasCosts
        ? `<span class="${totalR >= 0 ? 'vu' : 'vd'}">${totalR > 0 ? '+' : ''}${totalR.toFixed(2)}R</span> <span style="font-size:9px;color:${netTotalR>=0?'var(--green)':'var(--red)'}">→${netTotalR>=0?'+':''}${netTotalR}</span>${fmtPnl(netTotalR)}`
        : `<span class="${totalR >= 0 ? 'vu' : 'vd'}">${totalR > 0 ? '+' : ''}${totalR.toFixed(2)}R</span>${fmtPnl(totalR)}`;
      const passBadges = passes.map(p => `<span class="rp-badge ${p.result === 'tp' ? 'tp' : p.result === 'sl' ? 'sl' : 'eod'}">${p.touchTime || ''} ${p.result.toUpperCase()}</span>`).join(' ');
      tableHtml += `<tr class="${rowCls}"><td class="rp-chevron-cell"><span class="rp-chevron-ph"></span></td>`
        + `<td>${sd}</td><td class="mono">${priceStr}</td><td>${dirHtml}</td><td class="rp-stars">${stars}</td>`
        + `<td class="mono">${passes[0].touchTime || '—'}</td>`
        + `<td style="font-size:10px;color:var(--text3)">${passes.length} passes</td>`
        + `<td colspan="3">${passBadges}&nbsp;${rStr}</td>`
        + `<td colspan="2"></td></tr>`;
      for (let pi = 0; pi < passes.length; pi++) {
        const p = passes[pi];
        const chartId = `rp-chart-${ri}-${pi}`;
        const canExpand = !!p.chartBars;
        const chevron = canExpand
          ? `<button class="rp-chevron" onclick="rpToggleChart('${chartId}')" aria-label="Toggle chart">▶</button>`
          : `<span class="rp-chevron-ph"></span>`;
        const resultBadge = p.result === 'tp' ? '<span class="rp-badge tp">TP</span>'
          : p.result === 'sl'  ? '<span class="rp-badge sl">SL</span>'
          : p.result === 'eod' ? '<span class="rp-badge eod">EOD</span>'
          : `<span class="rp-badge open">${p.result.toUpperCase()}</span>`;
        const pSl2   = p.sl ?? res.sl;
        const pTp2   = p.tp ?? res.tp;
        const pDir2  = p.dir ?? res.dir;
        const rp      = mkRCell(p.r, res.entryPrice, pSl2, p.result === 'tp' || p.result === 'sl' || p.result === 'eod');
        const subCls  = p.result === 'tp' ? 'rp-row-win' : p.result === 'sl' ? 'rp-row-loss' : '';
        const subDur = p.duration ? `<span style="font-size:10px;color:var(--text3)">${p.duration}</span>` : '—';
        const subDirHtml = pDir2 === 'long' ? '<span class="rp-long" style="font-size:10px">↑L</span>' : '<span class="rp-short" style="font-size:10px">↓S</span>';
        tableHtml += `<tr class="${subCls}" style="opacity:0.88"><td class="rp-chevron-cell">${chevron}</td>`
          + `<td style="padding-left:18px;color:var(--text3);font-size:10px">↳ #${pi + 1}</td>`
          + `<td>${subDirHtml}</td><td colspan="2"></td>`
          + `<td class="mono">${p.touchTime || '—'}</td><td class="mono">${p.exitTime || '—'}</td>`
          + `<td>${subDur}</td><td>${resultBadge}</td><td class="mono">${rp}</td>`
          + `<td class="mono vn">${p.maxFav ? '+' + p.maxFav + 'p' : '—'}</td>`
          + `<td class="mono">${p.maxAdv ? `<span class="vd">${p.maxAdv}p</span>` : '—'}</td></tr>`;
        if (canExpand) {
          tableHtml += `<tr id="${chartId}" class="rp-chart-row" style="display:none">`
            + `<td colspan="11" class="rp-chart-cell">${buildCandleChart({ ...p, entryPrice: res.entryPrice, sl: pSl2, tp: pTp2, dir: pDir2 })}</td></tr>`;
        }
      }
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
    <div class="levels-grid">${sortedIndexed(levels).map(({l, i}) => renderLevelCard(l, i, date, pair)).join('')}</div>
  </div>`;
}

init();