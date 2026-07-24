/**
 * The Desk — one-page market read (desk.html).
 *
 * Pure COMPOSITION: every panel binds to an existing API endpoint; no vol math,
 * no level math, no scoring is computed here beyond display arithmetic
 * (percent-of-forecast, distances, staleness). Charts render through the
 * shared levelChart brick; pip sizes come from instrumentRegistry.
 *
 * Section → source map (see MARKET_DESK_PROPOSAL.md):
 *   A weather   /api/risk-flags · /api/events · /api/monitor/status · /api/kv-health
 *   B story     /api/morning-brief
 *   C board     /api/vol-forecast(+/live) · /api/daily-brief · /api/forecast-path/summary
 *               /api/hmm5m-v2 · /api/hmm1h-v2 · /api/monitor/status (prices)
 *   D zones     /api/range-line-bot/zones · /api/oi-bot/zones · /api/range-line-bot/oi-audit
 *   E book      /api/kv/get?key=<bot>_status · /api/trade-history · /api/forward-track
 *               /api/forecast-path/forward · /api/giveback
 *   F except.   derived client-side from A/C/D + /api/cot-extremes · /api/credit-stress
 *   G context   /api/fred · /api/liquidity-gate/live · /api/cot-extremes · /api/sentiment
 *               /api/hedge-alerts
 */

import { createLevelChart } from './levelChart.js';
import { resolveKey, pipSize, priceDigits } from './instrumentRegistry.js';

/* ───────────────────────── state ───────────────────────── */

const S = {
  forecast: null,      // /api/vol-forecast
  live: null,          // /api/vol-forecast/live
  brief: null,         // /api/daily-brief
  cones: null,         // /api/forecast-path/summary .pairs
  hmm5: null, hmm1h: null,
  monitor: null, kvHealth: null,
  risk: null, events: null,
  story: null,
  rlZones: null, oiZones: null, oiAudit: null,
  bots: {},            // key → {label, ageMin, blob}
  fwd: null, coneFwd: null, giveback: null,
  fred: null, cot: null, sentiment: null, hedge: null, credit: null, liq: null,
  chart: null,         // levelChart handle for the drill-in
  drillName: null,
};

// Production bot status keys shown in §E (bot-config.html TAB_BOT_KEY_MAP subset).
const BOTS = [
  ['regime_bot_v2_status', 'RegimeV2'],
  ['bot_status', 'Level'],
  ['gold_bot_status', 'Gold'],
  ['gold_v2_status', 'Gold V2'],
  ['volatility_bot_status', 'Volatility'],
  ['range_line_bot_status', 'Range-Line'],
  ['oi_bot_status', 'OI Gamma'],
  ['confluence_bot_status', 'Confluence'],
  ['yield_spread_status', 'Yield-Spread'],
  ['dyn_anchor_status', 'DynAnchor'],
  ['macro_equity_bot_status', 'MacroEquity'],
];

// vol-forecast NAME → HMM pair symbol (server DEFAULT_PAIRS convention).
const HMM_SYM = {
  GOLD: 'XAU/USD', NQ: 'NAS100_USD', SPX500: 'SPX500_USD', DE30: 'DE30_USD',
  UK100: 'UK100_GBP', US30: 'US30_USD', US2000: 'US2000_USD',
};
const hmmSym = n => HMM_SYM[n] || (n.length === 6 ? n.slice(0, 3) + '/' + n.slice(3) : n);

const AC_ORDER = { fx: 0, index: 1, commodity: 2 };
const AC_LABEL = { fx: 'FX', index: 'Indices', commodity: 'Metals & Commodities' };

/* ───────────────────────── utils ───────────────────────── */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 2) => (v == null || !Number.isFinite(+v)) ? '—' : (+v).toFixed(d);

async function j(url, opts) {
  const r = await fetch(url, opts);
  if (r.status === 202) return { __computing: true };
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}
// Every loader is isolated: one dead feed must never blank the page.
async function safe(p) { try { return await p; } catch (e) { console.warn('[desk]', e.message || e); return null; } }

async function kvGet(key) {
  const r = await safe(j(`/api/kv/get?key=${encodeURIComponent(key)}`));
  if (!r || r.miss) return null;
  return r.data ?? null;
}

function ageMin(ts) {
  if (!ts) return null;
  const ms = typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 60000;
}
const agoTxt = m => m == null ? '—' : m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m` : m < 60 * 24 ? `${(m / 60).toFixed(1)}h` : `${(m / 1440).toFixed(1)}d`;

function pipsBetween(name, a, b) {
  try { return Math.abs(a - b) / pipSize(resolveKey(name)); } catch { return null; }
}
function digitsFor(name, fallback = 5) {
  try { return priceDigits(resolveKey(name)); } catch { return fallback; }
}

function chip(txt, cls = '', title = '') {
  return `<span class="chip ${cls}" ${title ? `title="${esc(title)}"` : ''}>${txt}</span>`;
}
const TRUST = {
  valid: chip('✅ validated', 'c-green', 'OOS-validated per PROJECT_STATUS.md / BACKTEST_INDEX.md'),
  fwd: chip('📈 forward record', 'c-blue', 'Evidence accruing live — not yet a validated edge'),
  ctx: chip('🧪 context', 'c-dim', 'Context only — explicitly NOT a trading signal'),
};

/* ───────────────────────── A. weather ───────────────────────── */

const RISK_CLS = { CALM: 'c-green', CAUTION: 'c-amber', RISK_OFF: 'c-red' };

function renderWeather() {
  const el = $('weather'); if (!el) return;
  const parts = [];

  // Risk light
  const r = S.risk;
  if (r?.ok) {
    const detail = (r.flags || []).map(f => `${f.on ? '⚑' : '·'} ${f.label}: ${f.detail || '—'}`).join('\n');
    parts.push(`<span class="chip big ${RISK_CLS[r.level] || 'c-dim'}" title="${esc(detail)}">${r.level === 'RISK_OFF' ? '🔴' : r.level === 'CAUTION' ? '🟠' : '🟢'} ${esc(r.level.replace('_', '-'))} <small>${r.active}/${r.available} flags</small></span>`);
  } else parts.push(chip('risk: no data', 'c-dim'));

  // Session clock (approx UTC windows; display only)
  const h = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const sess = (h >= 7 && h < 12) ? 'LONDON' : (h >= 12 && h < 16) ? 'LDN+NY overlap' : (h >= 16 && h < 21) ? 'NEW YORK' : (h >= 23 || h < 7) ? 'ASIA' : 'BETWEEN SESSIONS';
  parts.push(chip(`🕐 ${sess} · ${new Date().toISOString().slice(11, 16)}Z`, 'c-blue'));

  // Data-age pills
  const fcDate = S.forecast?.session_date;
  const today = new Date().toISOString().slice(0, 10);
  const fcAge = ageMin(S.forecast?.computed_at);
  parts.push(chip(`forecast ${fcDate || '—'}${fcAge != null ? ` · ${agoTxt(fcAge)}` : ''}`,
    !fcDate ? 'c-dim' : (fcDate === today || fcAge < 60 * 26) ? 'c-dim' : 'c-amber',
    'Vol forecast session date / compute age'));
  const mon = S.monitor;
  if (mon) parts.push(chip(`monitor ${mon.running ? 'live' : 'STOPPED'}`, mon.running ? 'c-dim' : 'c-red', `last run ${esc(String(mon.lastRun || '—'))}`));
  if (S.kvHealth) parts.push(chip(`KV ${S.kvHealth.persistent ? 'durable' : 'EPHEMERAL'}`, S.kvHealth.persistent ? 'c-dim' : 'c-amber', esc(S.kvHealth.warning || S.kvHealth.backend || '')));

  el.innerHTML = parts.join('');

  // Calendar ribbon: next 24 h, high + medium impact.
  const cal = $('calendar'); if (!cal) return;
  const ev = Array.isArray(S.events) ? S.events : [];
  const now = Date.now(), day = now + 24 * 3600e3;
  const next = ev.filter(e => e.ms >= now - 30 * 60e3 && e.ms <= day && (e.impact === 'high' || e.impact === 'medium')).slice(0, 10);
  cal.innerHTML = next.length
    ? next.map(e => {
        const t = new Date(e.ms).toISOString().slice(11, 16);
        const soon = e.ms - now < 60 * 60e3;
        return chip(`${e.impact === 'high' ? '🔴' : '🟡'} ${t}Z ${esc(e.country)} ${esc(e.event)}`,
          e.impact === 'high' ? (soon ? 'c-red' : 'c-amber') : 'c-dim',
          `est ${esc(e.estimate ?? '—')} prev ${esc(e.prev ?? '—')}`);
      }).join('')
    : chip('no high/medium-impact events in the next 24h', 'c-dim');
}

/* ───────────────────────── B. story ───────────────────────── */

function renderStory() {
  const el = $('story'); if (!el) return;
  const a = S.story?.analysis;
  if (!a) { el.innerHTML = `<div class="dim">No morning brief yet — <button class="btn" id="storyGen">generate</button></div>`; wireStoryBtn(); return; }
  const regCls = a.regime === 'RISK-ON' ? 'c-green' : a.regime === 'RISK-OFF' ? 'c-red' : 'c-amber';
  el.innerHTML = `
    <div class="story-top">${chip(esc(a.regime || ''), regCls)} <b>${esc(a.headline || '')}</b>
      <span class="dim sm">· ${agoTxt(ageMin(S.story.generatedAt))} ago</span>
      <button class="btn sm" id="storyGen" title="Regenerate via Claude">↻</button></div>
    <div class="story-tldr">${esc(a.tldr || '')}</div>
    <details class="story-more"><summary class="dim sm">full column</summary>
      <div class="story-grid">
        ${['theme', 'dollar', 'rates', 'risk', 'complex'].map(k => a[k] ? `<div><span class="dim sm">${k}</span><br>${esc(a[k])}</div>` : '').join('')}
      </div>
      ${Array.isArray(a.watch) && a.watch.length ? `<div class="sm">👀 ${a.watch.map(esc).join(' · ')}</div>` : ''}
      ${Array.isArray(a.byAsset) ? `<div class="story-assets">${a.byAsset.map(x =>
        chip(`${esc(x.asset)} ${x.lean === 'BULLISH' ? '▲' : x.lean === 'BEARISH' ? '▼' : '•'}`,
          x.lean === 'BULLISH' ? 'c-green' : x.lean === 'BEARISH' ? 'c-red' : 'c-dim', esc(x.note || ''))).join('')}</div>` : ''}
    </details>`;
  wireStoryBtn();
}
function wireStoryBtn() {
  const b = $('storyGen');
  if (b) b.onclick = async () => { b.disabled = true; b.textContent = '…'; S.story = await safe(j('/api/morning-brief', { method: 'POST' })); renderStory(); };
}

/* ───────────────────────── C. board ───────────────────────── */

// Live price: monitor lastPrices (HMM-style keys), fallback daily-brief.
function livePrice(name) {
  const lp = S.monitor?.lastPrices?.[hmmSym(name)];
  if (lp && Number.isFinite(+lp.price) && (lp.ageS == null || lp.ageS < 900)) return +lp.price;
  const b = S.brief?.instruments?.[name];
  return Number.isFinite(+b?.current_price) ? +b.current_price : null;
}

function coneState(name) {
  const c = S.cones?.[name.toLowerCase()];
  const pct = c?.surprise?.pct;
  if (pct == null) return null;
  return { pct, z: c.surprise.z, label: pct >= 85 ? 'STRETCHED' : pct <= 15 ? 'QUIET' : 'NORMAL' };
}

// Nearest untouched forecast level from the daily brief (has price + hit%).
function nearestLevel(name, px) {
  const lv = S.brief?.instruments?.[name]?.levels;
  if (!lv || px == null) return null;
  let best = null;
  for (const k of ['oh_med', 'oh_75', 'ol_med', 'ol_75']) {
    const o = lv[k];
    if (!o || !Number.isFinite(+o.price)) continue;
    const d = Math.abs(+o.price - px);
    if (!best || d < best.d) best = { k, d, ...o };
  }
  return best;
}

function nearestZone(name) {
  const p = (S.rlZones?.pairs || []).find(x => x.pair === name.toLowerCase());
  if (!p) return null;
  let best = null;
  for (const z of p.zones || []) {
    if (!z.tradeable || z.gated || z.taken || !Number.isFinite(+z.distPips)) continue;
    if (!best || +z.distPips < +best.distPips) best = z;
  }
  return best;
}

function boardRows() {
  const names = Object.keys(S.brief?.instruments || S.forecast?.instruments || {});
  const rows = names.map(name => {
    const b = S.brief?.instruments?.[name] || {};
    const lv = S.live?.instruments?.[name];
    const fc = S.forecast?.instruments?.[name];
    const px = livePrice(name);
    const usedMed = (lv && !lv.error && lv.forecast?.hl_median > 0) ? lv.hl / lv.forecast.hl_median * 100 : null;
    const used75 = (lv && !lv.error && lv.forecast?.hl_75 > 0) ? lv.hl / lv.forecast.hl_75 * 100 : null;
    const cone = coneState(name);
    const h5 = S.hmm5?.[hmmSym(name)], h1 = S.hmm1h?.[hmmSym(name)];
    const nl = nearestLevel(name, px);
    const nz = nearestZone(name);
    const held = Object.values(S.bots).some(bot => (bot.blob?.mt5_positions || [])
      .some(pos => String(pos.symbol || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().includes(name === 'GOLD' ? 'XAU' : name.slice(0, 6))));
    // notability score → default sort
    let score = 0;
    if (usedMed != null && usedMed >= 100) score += 3;
    if (cone?.label === 'STRETCHED') score += 3;
    if (cone?.label === 'QUIET') score += 1;
    if (nz && +nz.distPips < 15) score += 2;
    if (lv?.bias && /Strong/.test(lv.bias)) score += 1;
    if (held) score += 1;
    return { name, ac: b.ac || (name === 'GOLD' ? 'commodity' : /USD|JPY|GBP|EUR|AUD|NZD|CAD|CHF/.test(name) && name.length === 6 ? 'fx' : 'index'), px, dp: b.dp, lv, fc, usedMed, used75, cone, h5, h1, nl, nz, held, score };
  });
  rows.sort((a, b2) => (AC_ORDER[a.ac] ?? 9) - (AC_ORDER[b2.ac] ?? 9) || b2.score - a.score || a.name.localeCompare(b2.name));
  return rows;
}

const REGIME_CLS = { BULL: 'c-green', BEAR: 'c-red', RANGE: 'c-blue', CHOP: 'c-amber' };

function usedBar(pct, pct75) {
  if (pct == null) return '<span class="dim">—</span>';
  const w = Math.min(130, pct);
  const cls = pct >= 100 ? 'ub-over' : pct >= 70 ? 'ub-hot' : 'ub-ok';
  return `<div class="ub" title="${fmt(pct, 0)}% of forecast median range consumed${pct75 != null ? ` · ${fmt(pct75, 0)}% of P75` : ''}">
    <div class="ub-fill ${cls}" style="width:${(w / 130 * 100).toFixed(0)}%"></div>
    <div class="ub-med"></div><span class="ub-txt">${fmt(pct, 0)}%</span></div>`;
}

function renderBoard() {
  const el = $('board'); if (!el) return;
  if (!S.forecast || S.forecast.__computing) { el.innerHTML = `<div class="dim pad">Vol forecast is ${S.forecast?.__computing ? 'computing…' : 'unavailable'} — board needs it.</div>`; return; }
  const rows = boardRows();
  if (!rows.length) { el.innerHTML = '<div class="dim pad">No instruments.</div>'; return; }

  let lastAc = null;
  const body = rows.map(r => {
    const grp = r.ac !== lastAc ? `<tr class="grp"><td colspan="9">${AC_LABEL[r.ac] || r.ac}</td></tr>` : '';
    lastAc = r.ac;
    const oc = (r.lv && !r.lv.error) ? r.lv.oc : null;
    const dp = r.dp ?? digitsFor(r.name);
    const nlTxt = r.nl ? `${r.nl.k.replace('_', ' ')} ${(+r.nl.price).toFixed(dp)} <span class="dim">(${fmt(pipsBetween(r.name, r.px, +r.nl.price), 0)}p · hit ${fmt(r.nl.hit_pct, 0)}%)</span>` : '<span class="dim">—</span>';
    const zTxt = r.nz ? chip(`${r.nz.decision} @ ${(+r.nz.level).toFixed(dp)} · ${fmt(r.nz.distPips, 0)}p`, r.nz.decision === 'fade' ? 'c-purple' : 'c-blue', `${r.nz.label} · confluence ${r.nz.confluence?.count ?? '—'} (${(r.nz.confluence?.sources || []).join(', ')})`) : '';
    return `${grp}<tr class="rowi" data-name="${r.name}">
      <td class="sym">${r.held ? '<span class="held" title="a bot holds a position">●</span> ' : ''}<b>${r.name}</b></td>
      <td class="num">${r.px != null ? r.px.toFixed(dp) : '—'}</td>
      <td class="num ${oc > 0 ? 'pos' : oc < 0 ? 'neg' : ''}">${oc != null ? (oc > 0 ? '+' : '') + fmt(oc) + '%' : '—'}</td>
      <td>${usedBar(r.usedMed, r.used75)}</td>
      <td>${r.cone ? chip(`${r.cone.label} ${fmt(r.cone.pct, 0)}ᵖ`, r.cone.label === 'STRETCHED' ? 'c-red' : r.cone.label === 'QUIET' ? 'c-blue' : 'c-dim', `4h cone surprise percentile (z ${fmt(r.cone.z, 1)})`) : '<span class="dim">—</span>'}</td>
      <td>${r.h5 ? chip(`${r.h5.regime}${r.h1 && r.h1.regime === r.h5.regime ? ' ✓1h' : ''}`, REGIME_CLS[r.h5.regime] || 'c-dim', `5m conf ${fmt(r.h5.confidence, 0)}%${r.h1 ? ` · 1h ${r.h1.regime}` : ''}`) : '<span class="dim">—</span>'}</td>
      <td class="sm">${r.lv && !r.lv.error ? `${esc(r.lv.bias)}<br><span class="dim">${esc(r.lv.shape || '')}</span>` : '<span class="dim">—</span>'}</td>
      <td class="sm">${nlTxt}</td>
      <td>${zTxt}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="tbl"><thead><tr>
    <th>Instrument</th><th>Price</th><th>Day Δ</th>
    <th title="today's H-L as % of the forecast median range — the validated σ estimate">Range used</th>
    <th title="4h cone surprise percentile">Cone</th><th>Regime</th><th>Session read</th>
    <th title="nearest forecast level + its historical hit rate">Nearest level</th>
    <th title="nearest tradeable range-line zone">Zone</th></tr></thead><tbody>${body}</tbody></table>`;

  el.querySelectorAll('tr.rowi').forEach(tr => tr.addEventListener('click', () => openDrill(tr.dataset.name)));
}

/* ─────────────────── C½. drill-in chart drawer ─────────────────── */

async function openDrill(name) {
  S.drillName = name;
  const box = $('drill'); box.classList.add('open');
  $('drillTitle').textContent = `${name} — today vs forecast`;
  $('drillLinks').innerHTML = `<a href="today.html" target="_blank">full brief ↗</a> · <a href="vol-forecast-v2.html" target="_blank">forecast v2 ↗</a> · <a href="forecast-path.html" target="_blank">cone ↗</a>`;
  const cEl = $('drillChart');

  const b = S.brief?.instruments?.[name];
  const sym = b?.sym || (name.length === 6 ? name.slice(0, 3) + '_' + name.slice(3) : name);
  const res = await safe(j(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(sym)}&granularity=M15`));
  const vals = res?.values;
  if (!Array.isArray(vals) || !vals.length) { cEl.innerHTML = '<div class="dim pad">no candles</div>'; return; }
  // Server returns strings, newest first, with UTC epoch `t`.
  const bars = vals.map(v => ({ time: v.t, open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
    .filter(v => Number.isFinite(v.time)).sort((a, x) => a.time - x.time).slice(-192);

  const levels = [];
  const lv = S.live?.instruments?.[name];
  if (lv && !lv.error && Number.isFinite(+lv.anchor_open)) levels.push({ price: +lv.anchor_open, kind: 'daily_open', label: 'session open' });
  const L = b?.levels || {};
  const kindOf = k => k.startsWith('oh') ? 'resistance' : 'support';
  for (const k of ['oh_med', 'oh_75', 'ol_med', 'ol_75']) {
    const o = L[k];
    if (o && Number.isFinite(+o.price)) levels.push({ price: +o.price, kind: kindOf(k), label: `${k.replace('_', ' ')} · hit ${fmt(o.hit_pct, 0)}%` });
  }
  const rp = (S.rlZones?.pairs || []).find(x => x.pair === name.toLowerCase());
  for (const z of rp?.zones || []) {
    if (z.tradeable && !z.gated) levels.push({ price: +z.level, kind: 'zone', label: `${z.decision} ${z.label} ×${z.confluence?.count ?? ''}` });
  }
  const oiKey = (() => { try { return resolveKey(name); } catch { return name.toLowerCase(); } })();
  const oi = S.oiZones?.instruments?.[oiKey];
  for (const z of oi?.zones || []) levels.push({ price: +z.entry, kind: z.side === 'buy' ? 'support' : 'resistance', label: `OI ${z.mode} ${z.side}` });
  if (oi && Number.isFinite(+oi.maxPain)) levels.push({ price: +oi.maxPain, kind: 'poc', label: 'max pain' });

  cEl.innerHTML = '';
  if (S.chart) { try { S.chart.destroy(); } catch { /* ignore */ } S.chart = null; }
  try {
    S.chart = createLevelChart(cEl, { height: 380 });
    S.chart.setCandles(bars).setLevels(levels).fit();
  } catch (e) {
    // Chart lib unavailable (CDN blocked / offline) — degrade to a level list.
    console.warn('[desk] chart fallback:', e.message || e);
    const dp = b?.dp ?? digitsFor(name);
    const px = livePrice(name);
    const rows = levels.sort((a, x) => x.price - a.price).map(l =>
      `<tr><td class="num">${l.price.toFixed(dp)}</td><td>${esc(l.label)}</td><td class="num dim">${px != null ? fmt(pipsBetween(name, px, l.price), 0) + 'p' : ''}</td></tr>`).join('');
    cEl.innerHTML = `<div class="pad dim sm">chart library unavailable — levels only</div>
      <table class="tbl sm"><thead><tr><th>Price</th><th>Level</th><th>Dist</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

/* ───────────────────────── D. zones ───────────────────────── */

function renderZones() {
  const el = $('zones'); if (!el) return;
  const out = [];

  const rl = S.rlZones;
  if (rl?.ok) {
    const near = [];
    for (const p of rl.pairs || []) for (const z of p.zones || []) {
      if (z.tradeable && !z.gated && !z.taken && Number.isFinite(+z.distPips)) near.push({ pair: p.pair, z });
    }
    near.sort((a, b) => +a.z.distPips - +b.z.distPips);
    const rows = near.slice(0, 14).map(({ pair, z }) => `<tr>
      <td><b>${pair.toUpperCase()}</b></td>
      <td>${chip(z.decision, z.decision === 'fade' ? 'c-purple' : 'c-blue')}</td>
      <td class="num">${esc(String(z.level))}</td>
      <td>${esc(z.label)} <span class="dim">(${z.src === 'A' ? 'Asia' : 'Monday'})</span></td>
      <td>${'★'.repeat(Math.min(3, z.confluence?.count || 0)) || '—'} <span class="dim sm">${(z.confluence?.sources || []).slice(0, 3).map(esc).join('+')}</span></td>
      <td class="num">${fmt(z.distPips, 0)}p</td>
      <td class="num dim">${z.sl != null ? esc(String(z.sl)) : '—'} / ${z.target != null ? esc(String(z.target)) : '—'}</td></tr>`).join('');
    out.push(`<div class="card"><div class="card-hd">Range-line ladder ${TRUST.valid}
        <span class="dim sm">plan ${agoTxt(ageMin(rl.planGeneratedAt))} · confluence ${agoTxt(ageMin(rl.confluenceGeneratedAt))} · min conf ${rl.confluenceMin}</span>
        <a class="dim sm" href="range-zones.html" target="_blank">full page ↗</a></div>
      ${near.length ? `<table class="tbl sm"><thead><tr><th>Pair</th><th>Action</th><th>Level</th><th>Line</th><th>Confluence</th><th>Dist</th><th>SL / TP</th></tr></thead><tbody>${rows}</tbody></table>
        ${near.length > 14 ? `<div class="dim sm pad">+${near.length - 14} more on the full page</div>` : ''}`
        : '<div class="dim pad">No tradeable zones in range right now.</div>'}</div>`);
  } else out.push(`<div class="card"><div class="card-hd">Range-line ladder ${TRUST.valid}</div><div class="dim pad">plan unavailable</div></div>`);

  const oi = S.oiZones;
  if (oi?.ok) {
    const rows = Object.entries(oi.instruments || {}).filter(([, v]) => v).map(([k, v]) => `<tr>
      <td><b>${k.toUpperCase()}</b></td>
      <td>${chip(v.regime || '—', v.regime === 'PIN' ? 'c-purple' : v.regime === 'BREAKOUT' ? 'c-amber' : 'c-dim')}${v.stale ? chip('stale', 'c-red', esc(v.stale)) : ''}</td>
      <td class="num">${fmt(v.spot, 1)}</td><td class="num">${fmt(v.maxPain, 1)}</td>
      <td class="num">${v.gammaFlow ? `${fmt(v.gammaFlow.flip, 1)} <span class="dim sm">(${fmt(v.gammaFlow.dist, 1)} away)</span>` : '—'}</td>
      <td class="sm">${(v.zones || []).slice(0, 3).map(z => chip(`${z.side} ${z.mode} @${fmt(z.entry, 1)}`, z.side === 'buy' ? 'c-green' : 'c-red', esc(z.rationale || ''))).join('')}</td></tr>`).join('');
    const a = S.oiAudit?.audit;
    const auditLine = a ? `<div class="sm pad">forward test: OI-dir agree <b>${a.oiDirAgree?.n ?? 0}</b> trades · win ${fmt((a.oiDirAgree?.winRate ?? 0) * 100, 0)}% vs disagree ${fmt((a.oiDirDisagree?.winRate ?? 0) * 100, 0)}% · edge ${fmt(S.oiAudit.audit.oiDirEdge, 2)}</div>` : '';
    out.push(`<div class="card"><div class="card-hd">OI gamma zones ${TRUST.fwd}
        <span class="dim sm">${agoTxt(ageMin(oi.generatedAt))} ago</span>
        <a class="dim sm" href="oi-zones.html" target="_blank">full page ↗</a></div>
      ${rows ? `<table class="tbl sm"><thead><tr><th></th><th>Regime</th><th>Spot</th><th>Max pain</th><th>γ flip</th><th>Zones</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="dim pad">no OI data (paste today\'s OI on the OI page)</div>'}
      ${auditLine}</div>`);
  }
  el.innerHTML = out.join('');
}

/* ───────────────────────── E. book ───────────────────────── */

function renderBook() {
  const el = $('book'); if (!el) return;
  const out = [];

  // Heartbeats
  const hb = BOTS.map(([key, label]) => {
    const b = S.bots[key];
    const m = b?.ageMin;
    const cls = m == null ? 'c-dim' : m < 10 ? 'c-green' : m < 60 ? 'c-amber' : 'c-red';
    const extra = b?.blob ? `${b.blob.paper === false ? 'LIVE' : 'paper'} · pos ${b.blob.open_positions ?? (b.blob.mt5_positions || []).length ?? 0}` : 'no status';
    return chip(`${label} ${m == null ? '∅' : agoTxt(m)}`, cls, extra);
  }).join('');
  out.push(`<div class="card"><div class="card-hd">Bot heartbeats <a class="dim sm" href="bot-config.html" target="_blank">bot config ↗</a></div><div class="pad chips">${hb}</div></div>`);

  // Open positions
  const pos = [];
  for (const [key, label] of BOTS) {
    for (const p of S.bots[key]?.blob?.mt5_positions || []) {
      pos.push({ bot: label, sym: p.symbol, dir: p.direction || p.type, lots: p.lots ?? p.volume, profit: p.profit, open: p.open_price ?? p.price_open });
    }
  }
  out.push(`<div class="card"><div class="card-hd">Open positions</div>${pos.length
    ? `<table class="tbl sm"><thead><tr><th>Bot</th><th>Symbol</th><th>Dir</th><th>Lots</th><th>Entry</th><th>P/L</th></tr></thead><tbody>${pos.map(p =>
        `<tr><td>${esc(p.bot)}</td><td><b>${esc(p.sym)}</b></td><td>${chip(esc(p.dir ?? '—'), /buy|BUY|0/.test(String(p.dir)) ? 'c-green' : 'c-red')}</td><td class="num">${fmt(p.lots)}</td><td class="num">${fmt(p.open, 4)}</td><td class="num ${+p.profit > 0 ? 'pos' : +p.profit < 0 ? 'neg' : ''}">${fmt(p.profit)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="dim pad">flat — no open bot positions reported</div>'}</div>`);

  // Forward evidence strip
  const f = S.fwd?.stats?.forward;
  const cf = S.coneFwd?.stats;
  const gb = S.giveback?.bots;
  out.push(`<div class="card"><div class="card-hd">Forward evidence ${TRUST.fwd}
      <a class="dim sm" href="forward-track.html" target="_blank">forward-track ↗</a></div>
    <div class="pad chips">
      ${f ? chip(`fade fwd: n ${f.n} · Sharpe ${fmt(f.sharpe, 2)} · win ${fmt(f.win != null ? f.win * 100 : null, 0)}% ${f.x3 ? `· ×3cost ${fmt(f.x3.sharpe, 2)}` : ''}`, (f.sharpe ?? 0) > 0 ? 'c-green' : 'c-red', `since ${S.fwd.stats.trackingStart || '—'} · last ${S.fwd.stats.lastDate || '—'}`) : chip('forward-track: no data', 'c-dim')}
      ${cf ? chip(`cone: close-in-P75 ${fmt(cf.closeIn75 != null ? cf.closeIn75 * 100 : null, 0)}% (claim 75%) · dir ${fmt(cf.dirHit != null ? cf.dirHit * 100 : null, 0)}% (claim 50%) · n ${cf.resolved}`, cf.closeIn75 != null && cf.closeIn75 >= 0.7 ? 'c-green' : 'c-amber') : ''}
      ${gb ? Object.values(gb).map(g => g.n ? chip(`${esc(g.label)} give-back ${fmt(g.medianGivebackFrac != null ? g.medianGivebackFrac * 100 : null, 0)}% · n ${g.n}`, 'c-dim', `median MFE ${fmt(g.medianMfePips, 1)}p → realized ${fmt(g.medianRealizedPips, 1)}p`) : '').join('') : ''}
    </div></div>`);

  el.innerHTML = out.join('');
}

/* ───────────────────────── F. exceptions ───────────────────────── */

function renderExceptions() {
  const el = $('except'); if (!el) return;
  const items = [];

  if (S.risk?.ok && S.risk.level !== 'CALM') items.push({ cls: S.risk.level === 'RISK_OFF' ? 'c-red' : 'c-amber', txt: `Risk composite is ${S.risk.level.replace('_', '-')} — ${(S.risk.flags || []).filter(f => f.on).map(f => f.label).join(', ')}` });

  for (const r of boardRows()) {
    if (r.usedMed != null && r.usedMed >= 100) items.push({ cls: 'c-amber', txt: `${r.name} has consumed ${fmt(r.usedMed, 0)}% of its forecast median range — ${r.lv?.outlook || ''}` });
    if (r.cone?.label === 'STRETCHED') items.push({ cls: 'c-red', txt: `${r.name} 4h cone STRETCHED (p${fmt(r.cone.pct, 0)})${S.cones?.[r.name.toLowerCase()]?.surprise?.reversing ? ' — and reversing' : ''}` });
    if (r.nz && +r.nz.distPips <= 10) items.push({ cls: 'c-purple', txt: `${r.name} within ${fmt(r.nz.distPips, 0)} pips of a tradeable ${r.nz.decision} zone (${r.nz.label})` });
  }

  const cs = S.credit?.current;
  if (cs && cs.exposure < 1) items.push({ cls: cs.exposure === 0 ? 'c-red' : 'c-amber', txt: `Credit stress: CSI ${fmt(cs.csi, 2)}σ → exposure tier ${cs.exposure} (${cs.date})` });

  for (const c of (S.cot?.instruments || [])) {
    if (Math.abs(c.specZ ?? 0) >= 2) items.push({ cls: 'c-blue', txt: `COT extreme: ${c.label || c.sym} spec ${c.specZ > 0 ? 'long' : 'short'} z ${fmt(c.specZ, 1)} (pct ${fmt(c.specPct, 0)}) — ${c.reportDate}` });
  }

  const ev = Array.isArray(S.events) ? S.events : [];
  for (const e of ev) {
    const dt = e.ms - Date.now();
    if (e.impact === 'high' && dt > 0 && dt < 60 * 60e3) items.push({ cls: 'c-red', txt: `High-impact event in ${Math.round(dt / 60e3)}m: ${e.country} ${e.event}` });
  }

  for (const [key, label] of BOTS) {
    const m = S.bots[key]?.ageMin;
    if (m != null && m > 60 && m < 60 * 72) items.push({ cls: 'c-amber', txt: `${label} bot heartbeat is ${agoTxt(m)} old` });
  }
  const today = new Date().toISOString().slice(0, 10);
  const dow = new Date().getUTCDay();
  if (S.forecast?.session_date && S.forecast.session_date !== today && dow >= 1 && dow <= 5) items.push({ cls: 'c-amber', txt: `Vol forecast is for ${S.forecast.session_date}, not today — check the scheduler` });

  el.innerHTML = items.length
    ? `<ul class="ex-list">${items.slice(0, 20).map(i => `<li>${chip('●', i.cls)} ${esc(i.txt)}</li>`).join('')}</ul>`
    : '<div class="dim pad">Nothing unusual — calm tape. ☕</div>';
}

/* ───────────────────────── G. context ───────────────────────── */

function fredRow(label, o, d = 2, inv = false) {
  if (!o || o.value == null) return '';
  const delta = o.prev != null ? o.value - o.prev : null;
  const up = delta != null && delta > 0;
  const cls = delta == null ? '' : (up !== inv ? 'pos' : 'neg');
  return `<tr><td class="dim">${label}</td><td class="num">${fmt(o.value, d)}</td><td class="num ${cls}">${delta != null ? (up ? '+' : '') + fmt(delta, d) : ''}</td></tr>`;
}

function renderContext() {
  const el = $('context'); if (!el) return;
  const F = S.fred || {};
  const cards = [];

  const curve = (F.us10y?.value != null && F.us2y?.value != null) ? F.us10y.value - F.us2y.value : null;
  cards.push(`<div class="card"><div class="card-hd">Macro snapshot ${TRUST.ctx}</div>
    <table class="tbl sm"><tbody>
      ${fredRow('VIX', F.vix, 1, true)}${fredRow('US 10Y', F.us10y)}${fredRow('US 2Y', F.us2y)}
      ${curve != null ? `<tr><td class="dim">2s10s</td><td class="num">${fmt(curve)}</td><td></td></tr>` : ''}
      ${fredRow('DXY', F.dxy, 1)}${fredRow('HY spread', F.hy, 2, true)}${fredRow('10Y TIPS', F.tips)}
      ${fredRow('NFCI', F.nfci, 2, true)}${fredRow('WTI', F.wti, 1)}
    </tbody></table></div>`);

  const liq = S.liq;
  if (liq && !liq.error) {
    cards.push(`<div class="card"><div class="card-hd">Net-liquidity gate ${TRUST.ctx}</div><div class="pad chips">
      ${chip(`gate: ${liq.gate1 ?? '—'}`, liq.gate1 === 'LONG' ? 'c-green' : liq.gate1 === 'SHORT' ? 'c-red' : 'c-dim')}
      ${chip(`netliq z ${fmt(liq.netliqZ, 2)}`, 'c-dim')}${chip(`curve z ${fmt(liq.curveZ, 2)}`, 'c-dim')}${chip(`credit z ${fmt(liq.creditZ, 2)}`, 'c-dim')}
      <a class="dim sm" href="global-liquidity.html" target="_blank">GLI ↗</a></div>
      <div class="dim sm pad">context only — gate backtests did not validate as a standalone signal</div></div>`);
  }

  const cot = S.cot?.instruments;
  if (Array.isArray(cot)) {
    const fx = cot.filter(c => c.group === 'fx' || ['GOLD', 'NQ', 'ES'].includes(c.sym)).slice(0, 14);
    cards.push(`<div class="card"><div class="card-hd">COT positioning ${TRUST.ctx} <span class="dim sm">${esc(S.cot.reportDate || '')}</span>
      <a class="dim sm" href="cot-extremes.html" target="_blank">↗</a></div>
      <table class="tbl sm"><tbody>${fx.map(c => `<tr><td class="dim">${esc(c.sym)}</td>
        <td><div class="pbar" title="spec percentile ${fmt(c.specPct, 0)} · z ${fmt(c.specZ, 1)}"><div class="pbar-f ${c.specPct >= 85 ? 'ub-over' : c.specPct <= 15 ? 'ub-hot' : 'ub-ok'}" style="width:${Math.max(2, Math.min(100, c.specPct ?? 0)).toFixed(0)}%"></div></div></td>
        <td class="num">${fmt(c.specPct, 0)}</td></tr>`).join('')}</tbody></table></div>`);
  }

  const sn = S.sentiment;
  if (sn && !sn.error) {
    const rows = Object.entries(sn).filter(([k, v]) => v && typeof v === 'object' && v.longPct != null)
      .map(([k, v]) => `<tr><td class="dim">${esc(k)}</td>
        <td><div class="pbar" style="width:64px"><div class="pbar-f ub-ok" style="width:${Math.min(100, v.longPct).toFixed(0)}%"></div></div></td>
        <td class="num">${fmt(v.longPct, 0)}% long</td><td>${v.crowding && v.crowding !== 'BALANCED' ? chip(v.crowding, 'c-amber') : ''}</td></tr>`).join('');
    cards.push(`<div class="card"><div class="card-hd">Retail sentiment ${TRUST.ctx}</div><div class="scroll"><table class="tbl sm"><tbody>${rows}</tbody></table></div></div>`);
  }

  const hg = S.hedge;
  if (hg?.pairs?.length) {
    const top = Object.entries(hg.last_corr || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
    cards.push(`<div class="card"><div class="card-hd">Correlation clusters ${TRUST.ctx} <a class="dim sm" href="correlations.html" target="_blank">↗</a></div>
      <table class="tbl sm"><tbody>${top.map(([k, v]) => `<tr><td class="dim">${esc(k)}</td><td class="num ${Math.abs(v) > 0.85 ? 'neg' : ''}">${fmt(v, 2)}</td></tr>`).join('')}</tbody></table></div>`);
  }

  el.innerHTML = cards.join('');
}

/* ───────────────────────── loaders ───────────────────────── */

async function loadFast() {   // 60s cadence — the live read
  const names = () => Object.keys(S.forecast?.instruments || {}).map(n => n.toLowerCase()).join(',');
  [S.live, S.monitor, S.hmm5, S.hmm1h] = await Promise.all([
    safe(j('/api/vol-forecast/live')),
    safe(j('/api/monitor/status')),
    safe(j('/api/hmm5m-v2')),
    safe(j('/api/hmm1h-v2')),
  ]);
  if (S.forecast?.instruments) S.cones = (await safe(j(`/api/forecast-path/summary?pairs=${names()}`)))?.pairs ?? S.cones;
  renderWeather(); renderBoard(); renderExceptions();
}

async function loadMedium() { // 5min cadence — zones, risk, calendar, story
  [S.risk, S.events, S.rlZones, S.oiZones, S.oiAudit, S.story] = await Promise.all([
    safe(j('/api/risk-flags')),
    safe(j('/api/events')),
    safe(j('/api/range-line-bot/zones')),
    safe(j('/api/oi-bot/zones')),
    safe(j('/api/range-line-bot/oi-audit')),
    safe(j('/api/morning-brief')),
  ]);
  renderWeather(); renderStory(); renderZones(); renderExceptions();
}

async function loadBook() {   // 2min cadence — bots + forward records
  const blobs = await Promise.all(BOTS.map(([key]) => kvGet(key)));
  BOTS.forEach(([key, label], i) => {
    const wrap = blobs[i];
    const blob = wrap?.data ?? wrap;
    const ts = wrap?.timestamp ?? blob?.loop_at ?? blob?.timestamp;
    S.bots[key] = { label, blob: blob || null, ageMin: ageMin(ts) };
  });
  [S.fwd, S.coneFwd, S.giveback] = await Promise.all([
    safe(j('/api/forward-track')),
    safe(j('/api/forecast-path/forward')),
    safe(j('/api/giveback')),
  ]);
  renderBook(); renderBoard(); renderExceptions();
}

async function loadSlow() {   // 10min cadence — macro context
  [S.fred, S.cot, S.sentiment, S.hedge, S.credit, S.liq, S.kvHealth] = await Promise.all([
    safe(j('/api/fred')),
    safe(j('/api/cot-extremes')),
    safe(j('/api/sentiment')),
    safe(j('/api/hedge-alerts')),
    safe(j('/api/credit-stress')),
    safe(j('/api/liquidity-gate/live')),
    safe(j('/api/kv-health')),
  ]);
  renderContext(); renderExceptions(); renderWeather();
}

async function boot() {
  // The board's skeleton depends on the forecast + brief — load those first.
  [S.forecast, S.brief] = await Promise.all([safe(j('/api/vol-forecast')), safe(j('/api/daily-brief'))]);
  renderBoard();
  await Promise.all([loadFast(), loadMedium(), loadBook(), loadSlow()]);
  setInterval(loadFast, 60e3);
  setInterval(loadMedium, 5 * 60e3);
  setInterval(loadBook, 2 * 60e3);
  setInterval(loadSlow, 10 * 60e3);
  setInterval(() => { // re-fetch the forecast itself hourly (it changes once a day)
    safe(j('/api/vol-forecast')).then(f => { if (f && !f.__computing) S.forecast = f; });
    safe(j('/api/daily-brief')).then(b => { if (b?.ok) S.brief = b; });
  }, 60 * 60e3);
  const closeBtn = $('drillClose');
  if (closeBtn) closeBtn.onclick = () => $('drill').classList.remove('open');
}

boot();
