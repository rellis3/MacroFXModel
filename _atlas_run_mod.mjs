
import { CHAIN_NODES, nodeDelta, evaluateChain } from './js/macroChain.js';
import { buildCountryCard } from './js/countryCard.js';
import { buildPairWhy, NODE_FOR } from './js/pairWhy.js';
import * as P from './js/atlasPosition.js';
import { buildNewsletter, eventNote, flagProximity, familyOf } from './js/newsletter.js';
import { buildNewsletterV2 } from './js/newsletterV2.js';
import { impliedRow, impliedKeyFor } from './js/impliedMove.js';
import { snapshotOf, diffSnapshots, scoreLine, weekRecord, plainRead } from './js/newsletterRecord.js';
import { closuresBetween } from './js/marketCalendars.js';
import { summarize as stateSummary } from './js/stateStrip.js';
import { rangePressure, pressureWords } from './js/rangePressure.js';
import { fearVsNasdaq, fearWords, vixBeta, vixBetaWords, impliedRatioChange, impliedRatioWords } from './js/fearVsNasdaq.js';
import { optionZone } from './js/optionZone.js';
import { DESK_EVIDENCE } from './js/deskEvidence.js';

const $ = id => document.getElementById(id);
const esc = s => (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ic = (n, c) => `<svg class="i${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const icS = n => `<svg class="i" style="width:15px;height:15px" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const sg = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
const ord = n => { n = Math.round(n); const m = n % 100; return n + (m >= 11 && m <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')); };
const J = (u, opt) => fetch(u, opt).then(r => r.json()).catch(() => null);

const FACT = [['rates', 'Rates & policy'], ['inflation', 'Inflation'], ['growth', 'Growth'], ['labour', 'Labour'], ['demand', 'Spending'], ['external', 'Trade']];
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭' };
const NAME = { USD: 'US Dollar', EUR: 'Euro', GBP: 'Pound', JPY: 'Yen', AUD: 'Australian Dollar', NZD: 'New Zealand Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc' };
const CROWD_WORDS = { 'crowded long': 'crowded long', 'crowded short': 'crowded short', 'smallest long in years': 'at their smallest long in years', 'smallest short in years': 'at their smallest short in years', 'mid-range': 'mid-range' };
const COT_SYM = { NQ: 'NQ', SPX500: 'ES', US30: 'YM', US2000: 'RTY', GOLD: 'GOLD', BTCUSD: 'BTC' };
const COUNTRY_OF = Object.fromEntries(Object.entries(P.CCY_OF_COUNTRY).map(([c, k]) => [k, c]));
const IDX_LABEL = { GOLD: 'Gold', NQ: 'Nasdaq', SPX500: 'S&P 500', DE30: 'DAX', UK100: 'FTSE 100', US30: 'Dow', US2000: 'Russell 2000', BTCUSD: 'Bitcoin' };
const GROUPS = [['all', 'All'], ['fx', 'FX'], ['index', 'Indices'], ['commodity', 'Gold'], ['crypto', 'Bitcoin']];
const DRILL_PAIR = { eurusd: ['EUR', 'USD'], gbpusd: ['GBP', 'USD'], audusd: ['AUD', 'USD'], nzdusd: ['NZD', 'USD'], usdjpy: ['USD', 'JPY'], usdcad: ['USD', 'CAD'], usdchf: ['USD', 'CHF'], eurjpy: ['EUR', 'JPY'], audjpy: ['AUD', 'JPY'], eurgbp: ['EUR', 'GBP'] };

const D = {};
const state = { view: 'global', ccy: 'USD', pair: 'EURUSD', pipe: null, group: 'all' };
let derived = null;

/* ── instruments: the same set today.html carries ── */
const insts = () => D.brief?.instruments ?? {};
const acOf = k => insts()[k]?.ac ?? (/^[A-Z]{6}$/.test(k) ? 'fx' : 'index');
const ccysOf = k => P.ccysOf(k, acOf(k));
const labelOf = k => { const c = ccysOf(k); return c ? c[0] + '/' + c[1] : IDX_LABEL[k] ?? k; };
const glyphOf = k => { const c = ccysOf(k); return c ? FLAG[c[0]] + FLAG[c[1]] : k === 'GOLD' ? '🥇' : k === 'BTCUSD' ? '₿' : '📈'; };

/* ── derived numbers ── */
function lastTwo(key) { const a = D.drill?.series?.[key]; if (!a) return null; let i = a.length - 1; while (i >= 0 && a[i] == null) i--; let j = i - 1; while (j >= 0 && a[j] == null) j--; return i < 0 ? null : { last: a[i], prev: j >= 0 ? a[j] : null, i }; }
// "n days back" is CALENDAR days, the same window the chain uses (CHAIN_WINDOW_DAYS), so the tiles, the cards and the chain can never disagree. It used to count 20 observations (about 4 weeks), which flipped the sign of any move that turned within that month.
function back(key, days) { const a = D.drill?.series?.[key], t = lastTwo(key); if (!a || !t) return null; const dts = D.drill.dates, cut = Date.parse(dts[t.i]) - days * 864e5; let k = t.i; while (k > 0 && (a[k] == null || Date.parse(dts[k]) > cut)) k--; return a[k] ?? null; }
function spark(key, n = 30) { const a = D.drill?.series?.[key]; return a ? a.slice(-n).filter(v => v != null) : []; }
function chainNow() {
  const S = D.drill.series, N = D.drill.dates.length - 1;
  const pts = key => { const a = S[key]; if (!a) return null; const out = []; for (let k = Math.max(0, N - 45); k <= N; k++) if (a[k] != null) out.push({ date: D.drill.dates[k], value: a[k] }); return out.length > 20 ? out : null; };
  const map = { smh: 'smh', xle: 'xle', xlre: 'xlre', move: 'move', ccc: 'ccc', real: 'tips', dxy: 'dxy', oil: 'oil', gold: 'gold', copper: 'copper', btc: 'btc', nq: 'nq', spx: 'spx', us2y: 'us2y', us10y: 'us10y', us30y: 'us30y', bei: 'bei', vix: 'vix', hy: 'hy', audusd: 'audusd', usdcad: 'usdcad', usdjpy: 'usdjpy', eurusd: 'eurusd', gbpusd: 'gbpusd' };
  const vals = {}; for (const [node, key] of Object.entries(map)) { const p = pts(key); vals[node] = p ? nodeDelta(p, CHAIN_NODES[node]) : null; }
  for (const node of ['emdollar', 'emoas']) { const p = D.cx?.series?.[node]; vals[node] = Array.isArray(p) && p.length > 20 ? nodeDelta(p, CHAIN_NODES[node]) : null; }   // the two chips FRED supplies (/api/chain-extra)
  let links = []; try { links = evaluateChain(vals); } catch { links = []; }
  // the last ~26 points of each market, for the V2 newsletter's charts of the links that broke
  // each series is turned into the move since its first point, in the node's own unit (percent, basis points or points), exactly as nodeDelta does for the verdict
  const moved = (vals, node) => { const v0 = vals[0], u = CHAIN_NODES[node]?.unit; return vals.map(v => u === 'pct' ? (v0 ? (v / v0 - 1) * 100 : 0) : u === 'bp' ? (v - v0) * 100 : v - v0); };
  const seg = (p, node) => { const ref = vals[node]?.refDate; const s = ref ? p.filter(x => x.date >= ref) : p.slice(-15); return (s.length >= 5 ? s : p.slice(-15)).map(x => x.value); };   // from the reference date nodeDelta used, so the chart ends where the number says
  const ser = {}; for (const [node, key] of Object.entries(map)) { const p = pts(key); if (p) ser[node] = moved(seg(p, node), node); }
  for (const node of ['emdollar', 'emoas']) { const p = D.cx?.series?.[node]; if (Array.isArray(p) && p.length > 20) ser[node] = moved(p.slice(-15).map(x => (typeof x === 'number' ? x : x?.value)), node); }
  return { vals, links, ser };
}
function strengths() {
  const acc = {}; for (const c of Object.keys(FLAG)) acc[c] = [];
  for (const [k, [b, q]] of Object.entries(DRILL_PAIR)) { const t = lastTwo(k); if (!t || t.prev == null || !t.prev) continue; const chg = (t.last / t.prev - 1) * 100; acc[b].push(chg); acc[q].push(-chg); }
  return Object.entries(acc).filter(([, v]) => v.length).map(([ccy, v]) => ({ ccy, score: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })).sort((a, b) => b.score - a.score);
}
const composites = () => Object.fromEntries((D.msc?.ranked ?? []).map(r => [r.ccy, { composite: r.composite, factorsScored: r.factorsScored, factorsTotal: r.factorsTotal, factors: r.factors }]));
const facVec = ccy => { const r = (D.msc?.ranked ?? []).find(x => x.ccy === ccy); return FACT.map(([k]) => (r?.factors?.[k]?.score ?? null)); };
const cbHist = () => ({ USD: D.hUSD?.history, EUR: D.hEUR?.history, GBP: D.hGBP?.history, JPY: D.hJPY?.history, NZD: D.hNZD?.history, AUD: D.hAUD?.history, CAD: D.hCAD?.history });
const loading = () => D.__extra ? '' : '<p class="note">Loading the analysis feeds…</p>';

/* ── small renderers ── */
const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const arc = (cx, cy, r, a0, a1) => { const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1); return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`; };
function dial(active, total) {
  const cx = 100, cy = 92, r = 74, v = total ? active / total * 100 : 0, np = polar(cx, cy, r - 16, -90 + v * 1.8);
  return `<svg viewBox="0 0 200 118" width="190" role="img" aria-label="${active} of ${total} risk flags active">
   <path d="${arc(cx, cy, r, -90, -30)}" stroke="var(--bull)" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>
   <path d="${arc(cx, cy, r, -26, 26)}" stroke="var(--amber)" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>
   <path d="${arc(cx, cy, r, 30, 90)}" stroke="var(--bear)" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>
   <line x1="${cx}" y1="${cy}" x2="${np[0].toFixed(1)}" y2="${np[1].toFixed(1)}" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="var(--text)"/>
   <text x="${cx}" y="${cy - 24}" text-anchor="middle" font-family="var(--disp)" font-weight="700" font-size="28" fill="var(--text)">${active}/${total}</text></svg><div class="lbl">Risk flags active</div>`;
}
function ukNow() { try { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return +p.find(x => x.type === 'hour').value + +p.find(x => x.type === 'minute').value / 60; } catch { return new Date().getUTCHours(); } }
function ring() {
  const cx = 80, cy = 80, h = ukNow(), sess = [['Asia', 23, 8, 'var(--violet)', 66], ['London', 8, 16.5, 'var(--blue)', 56], ['New York', 13.5, 21, 'var(--bull)', 46]];
  let o = `<svg viewBox="0 0 160 160" width="150" role="img" aria-label="24-hour clock with Asia, London and New York sessions"><circle cx="80" cy="80" r="34" fill="none" stroke="var(--line2)"/>`;
  sess.forEach(s => { const a0 = s[1] / 24 * 360; let a1 = s[2] / 24 * 360; if (a1 < a0) a1 += 360; o += `<path d="${arc(cx, cy, s[4], a0, a1)}" stroke="${s[3]}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".75"/>`; });
  [0, 6, 12, 18].forEach(t => { const p = polar(cx, cy, 72, t / 24 * 360); o += `<text x="${p[0].toFixed(1)}" y="${(p[1] + 3).toFixed(1)}" text-anchor="middle" font-size="8" font-family="var(--mono)" fill="var(--text3)">${t < 10 ? '0' : ''}${t}</text>`; });
  const n = polar(cx, cy, 66, h / 24 * 360), hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  o += `<circle cx="${n[0].toFixed(1)}" cy="${n[1].toFixed(1)}" r="5" fill="var(--amber)"/><text x="80" y="78" text-anchor="middle" font-family="var(--disp)" font-weight="700" font-size="15" fill="var(--text)">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</text><text x="80" y="92" text-anchor="middle" font-size="8.5" fill="var(--text3)">UK time</text></svg><div class="lbl">Sessions</div>`;
  return o;
}
function sparkSvg(arr, col, w = 76, h = 24) {
  if (arr.length < 3) return ''; const mn = Math.min(...arr), mx = Math.max(...arr), d = (mx - mn) || 1;
  const pts = arr.map((v, i) => `${(i * (w / (arr.length - 1))).toFixed(1)},${(h - 3 - ((v - mn) / d) * (h - 6)).toFixed(1)}`).join(' '), last = pts.split(' ').pop().split(',');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${col}"/></svg>`;
}
function radar(series, label) {
  const cx = 110, cy = 108, R = 78, n = 6; let o = `<svg viewBox="0 0 220 216" width="100%" style="max-width:300px;margin:0 auto" role="img" aria-label="${esc(label)}">`;
  [0.25, 0.5, 0.75, 1].forEach(k => { const pts = []; for (let i = 0; i < n; i++) { const p = polar(cx, cy, R * k, i * 60); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); } o += `<polygon points="${pts.join(' ')}" fill="none" stroke="var(--line)" stroke-width="${k === 0.5 ? 1.2 : 0.7}" ${k === 0.5 ? 'stroke-dasharray="3 3"' : ''}/>`; });
  for (let i = 0; i < n; i++) { const e = polar(cx, cy, R, i * 60), l = polar(cx, cy, R + 17, i * 60); o += `<line x1="${cx}" y1="${cy}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" stroke="var(--line2)"/><text x="${l[0].toFixed(1)}" y="${(l[1] + 3).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--text2)">${FACT[i][1]}</text>`; }
  series.forEach(s => { const have = [], pts = [];
    s.v.forEach((v, i) => { const r = v == null ? R * 0.5 : R * (0.5 + 0.5 * Math.max(-1, Math.min(1, v))), p = polar(cx, cy, r, i * 60);
      if (v == null) o += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="none" stroke="var(--text3)" stroke-dasharray="2 2"/>`; else { have.push(p); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); } });
    if (have.length >= 3) o += `<polygon points="${pts.join(' ')}" fill="${s.c}" fill-opacity=".18" stroke="${s.c}" stroke-width="2" stroke-linejoin="round"/>`;
    have.forEach(p => { o += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="${s.c}"/>`; }); });
  return o + '</svg>';
}
/** A signed horizontal bar row: label, bar scaled to `max`, text on the right. */
const barRow = (label, v, max, text, cls = '') => v == null ? `<div class="fr na ${cls}"><span class="nm">${esc(label)}</span><span class="tr"></span><span class="v">no data</span></div>`
  : `<div class="fr ${cls}"><span class="nm">${esc(label)}</span><span class="tr"><u></u><i style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${Math.min(50, Math.abs(v) / max * 50)}%;background:${v >= 0 ? 'var(--bull)' : 'var(--bear)'}"></i></span><span class="v ${v >= 0 ? 'up' : 'dn'}">${esc(text)}</span></div>`;
const ledgerPill = id => { const e = DESK_EVIDENCE.find(x => x.id === id); if (!e) return ''; const cls = e.verdict === 'validated' ? 'bull' : e.verdict === 'context' ? 'blue' : e.verdict === 'underpowered' ? 'amber' : ''; const w = { validated: 'validated', null: 'tested null', context: 'base rate', underpowered: 'underpowered' }[e.verdict] ?? e.verdict; return `<a class="pill ${cls}" href="evidence.html#ev-${esc(id)}" target="_blank" rel="noopener" title="${esc(e.claim)}">${w}</a>`; };
const ukTime = ms => new Date(ms).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const tl = lines => lines.map(l => `<p class="tl-line">${esc(l)}</p>`).join('');
const tense = (kind, title, icn, body) => `<div class="card tense ${kind}"><h2>${ic(icn)}${title}</h2>${body}</div>`;

/* ── nav ── */
const VIEWS = [['global', 'Global', 'globe'], ['ccy', 'Currency', 'coins'], ['pair', 'Pair', 'pair']];
const navHtml = cls => VIEWS.map(v => `<button class="${cls}" role="tab" data-v="${v[0]}" aria-selected="${state.view === v[0]}">${ic(v[2])}<span>${v[1]}</span></button>`).join('');
function drawNav() { $('rail').innerHTML = `<a class="logo" href="today.html" title="Classic page">${ic('globe')}</a>` + navHtml('rb'); $('tabbar').innerHTML = navHtml('tab'); document.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => go(b.getAttribute('data-v')); }); }
function go(v, opt) {
  state.view = v; if (opt) Object.assign(state, opt);
  ['global', 'ccy', 'pair'].forEach(x => { $('v-' + x).hidden = (x !== v); }); $('v-global').style.display = v === 'global' ? 'grid' : 'none';
  $('ttl').textContent = v === 'global' ? 'Global' : v === 'ccy' ? 'Currency' : 'Pair';
  drawNav(); if (v === 'ccy') drawCcy(); if (v === 'pair') drawPair(); window.scrollTo(0, 0);
}
const redraw = () => { if (!derived) return; if (state.view === 'global') drawGlobal(); else if (state.view === 'ccy') drawCcy(); else drawPair(); };

/* ── the model picker, same contract as today.html: one provider for every AI job, a server setting ── */
function drawAi() {
  const ai = D.ai; if (!ai?.ok) { $('aibox').innerHTML = ''; if ($('heroai')) $('heroai').innerHTML = ''; return; }
  const providers = ai.providers.filter(p => p.configured), used = [...new Set(ai.tasks.map(t => t.provider))], mixed = used.length > 1;
  const html = id => `${icS('bulb')}<label for="${id}">AI model</label><select id="${id}" title="Changes the model for EVERY AI job on the site (a server setting). Per-job control is on bot-config.html → AI Models.">${mixed ? '<option value="" selected>Mixed</option>' : ''}${providers.map(p => `<option value="${esc(p.id)}"${!mixed && used[0] === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select>`;
  $('aibox').innerHTML = html('aiSel'); if ($('heroai')) $('heroai').innerHTML = html('aiSel2');
  for (const id of ['aiSel', 'aiSel2']) { const sel = $(id); if (!sel) continue; sel.disabled = providers.length < 2 && !mixed; sel.onchange = () => switchProvider(sel); }
}
async function switchProvider(sel) {
  const ai = D.ai;
  { const provider = sel.value; if (!provider) return; sel.disabled = true; const tasks = {}; for (const t of ai.tasks) tasks[t.id] = provider;
    const r = await J('/api/ai-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks }) });
    if (!r?.ok) $('loaderr').innerHTML = `<div class="err">Could not change the model: ${esc(r?.error ?? 'no response')}</div>`;
    D.ai = await J('/api/ai-config'); drawAi(); if (state.view === 'global') drawGlobal(); };
}
const briefModel = () => D.ai?.tasks?.find(t => t.id === 'brief');


/* ── the full Intelligence brief, every section the model writes ── */
function intelBodyHtml() {
  const a = D.intel?.ok ? D.intel.analysis : null;
  if (!a) return '';
  const list = (arr, fn) => (Array.isArray(arr) && arr.length ? arr.map(fn).join('') : '');
  const stPill = st => /^RESPONDING/i.test(st) ? 'bull' : /NOT/i.test(st) ? 'amber' : '';
  const checks = (arr, tone) => list(arr, c => `<div class="rw"><span><b>${esc(c.check)}</b><small>${esc(c.level)} · ${esc(c.when)}</small></span><span class="pill ${tone}">${tone === 'bull' ? 'confirms' : 'breaks it'}</span></div>`) || '<p class="note">none given</p>';
  return `<div class="card"><h2>${ic('bulb')}The argument </h2>
    <h3 style="margin-top:0">What is driving markets</h3>
    <div class="two">${list(a.driver, d => `<div class="card" style="background:var(--card2)"><b>${esc(d.what)}</b><p class="note" style="margin-top:6px">${esc(d.evidence)}</p>${d.explain ? `<p class="tl-line" style="margin-top:8px"><b>How it works:</b> ${esc(d.explain)}</p>` : ''}</div>`)}</div>
    <h3>Transmission: what should respond, and whether it is</h3>
    <div class="rows">${list(a.transmission, t => `<div class="rw"><span><b>${esc(t.asset)}</b><small>should: ${esc(t.should)}<br>is: ${esc(t.is)}</small></span><span class="pill ${stPill(t.state)}">${esc(t.state)}</span></div>`)}</div>
    <div class="two"><div><h3>What would confirm it</h3><div class="rows">${checks(a.confirm, 'bull')}</div></div><div><h3>What would break it</h3><div class="rows">${checks(a.invalidate, 'amber')}</div></div></div>
    <h3>Catalysts</h3><div class="rows">${list(a.catalysts, c => `<div class="rw"><span><b>${esc(c.when)}</b> · ${esc(c.event)}<small>${esc(c.impact)} · tests: ${esc(c.touches)}</small></span></div>`) || '<p class="note">none given</p>'}</div>
    ${a.sizing ? `<h3>How much, not which way</h3><p class="tl-line">${esc(a.sizing)}</p>` : ''}
    ${a.lesson?.concept ? `<div class="lesson"><b>What to learn from today: ${esc(a.lesson.concept)}</b><p class="tl-line" style="margin:6px 0 0">${esc(a.lesson.today)}</p></div>` : ''}
    ${a.noEdge?.length ? `<details class="learn"><summary>${icS('shield')}Where this desk has no edge (${a.noEdge.length})</summary>${a.noEdge.map(x => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    <p class="note" style="margin-top:8px">An argument from measured links, not a forecast. Direction claims have tested null here almost every time, so nothing above states which way a market goes next.</p></div>`;
}

/* the rows Atlas shows, as text for the model, so the brief and the page can never disagree about the facts */

const MK_SERIES = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', USDCHF: 'usdchf', NZDUSD: 'nzdusd', GOLD: 'gold', NQ: 'nq', SPX500: 'spx', US2000: 'r2k', DE30: 'de30', UK100: 'uk100', BTCUSD: 'btc' };
/** One line of facts per market, so the model can write a real read for every card from numbers, not guesses. */
function marketFacts() {
  const cbs = P.cbTone(cbHist()), sbs = P.surpriseBars(D.es), crowd = P.crowding(D.ce, D.cs).map(P.crowdCcy), ahead = P.aheadEvents(D.events, Date.now(), { limit: 40, withinHours: 72 });
  const strMap = Object.fromEntries((derived.str ?? []).map(s => [s.ccy, s.score]));
  return NL_RANGE_KEYS.filter(k => insts()[k]).map(k => {
    const d = pairData(k), reg = P.regimeFor(D.regime, k), gam = P.gammaFor(D.oi, k), fire = P.deskFiring(D.ds, k).filter(f => f.instruments.includes(k)), cc = ccysOf(k), mv = MK_SERIES[k] ? fmtPct(MK_SERIES[k]) : null;
    const parts = [`KEY ${k} | ${labelOf(k)}${d.price != null ? ' at ' + d.price.toFixed(d.dp ?? 4) : ''}`];
    if (mv) parts.push(`moved ${sg(mv.d1, 2)}% on the day and ${sg(mv.d20, 1)}% over 20 days`);
    if (d.used != null) parts.push(`has used ${Math.round(d.used * 100)}% of a normal day's range (median ${d.hlMed != null ? d.hlMed.toFixed(2) + '%' : 'n/a'})`);
    if (reg) parts.push(`in the ${reg.regime} backdrop it has averaged ${sg(reg.mean)}% a month, up in ${reg.posShare}% of months`);
    for (const c of (cc ?? [])) {
      const cb = cbs.find(x => x.ccy === c), sb = sbs.find(x => x.ccy === c), cr = crowd.find(x => x.sym === c);
      parts.push(`${c}: ${strMap[c] != null ? 'moved ' + sg(strMap[c]) + '% against the others today' : ''}${cb ? `, ${cb.bank} tone ${cb.latest} (${cb.trend})` : ''}${sb ? `, data surprises ${sb.score}` : ''}${cr && cr.state !== 'mid-range' ? `, speculators ${CROWD_WORDS[cr.state] ?? cr.state}` : ''}`);
    }
    const cs = ccysOf(k) ?? [], evs = ahead.filter(e => (e.impact === 'high' || e.impact === 'medium') && (cs.length ? cs.includes(e.ccy) : (P.COUNTRIES_FOR_INDEX[k] ?? ['US']).includes(e.country))).slice(0, 2);
    if (evs.length) parts.push('next: ' + evs.map(e => `${ukTime(e.ms)} ${e.event}`).join('; '));
    if (gam?.regime) parts.push(`dealer gamma ${gam.regime}`);
    if (fire.length) parts.push('monitors flagging: ' + fire.map(f => f.label).slice(0, 2).join('; '));
    return parts.join(' | ');
  });
}
function positionContext() {
  const regime = P.regimeCard(D.regime), axes = P.axesRows(D.gr), firing = P.deskFiring(D.ds), ahead = P.aheadEvents(D.events, Date.now(), { limit: 10 }), fp = P.fedPathCard(D.fp), meeting = P.nextMeeting(D.fcal), nc = P.nowcastCard(D.nc);
  const L = P.positionLines({ regime, axes, firing, events: ahead, fedPath: fp, meeting }), out = [];
  out.push('BEHIND US', ...L.behind);
  if (regime) out.push('Regime record, monthly since 2007: ' + regime.markets.map(m => `${m.label} ${m.mean}% a month (${m.posShare}% of months up, n=${m.n})`).join('; ') + '.');
  const ch = P.changesRows(D.mc); if (ch.length) out.push('What changed (1d / 5d / 20d): ' + ch.map(r => `${r.label} ${r.d1 ?? '·'} / ${r.d5 ?? '·'} / ${r.d20 ?? '·'} ${r.unit}`).join('; ') + '.');
  const cb = P.cbTone(cbHist()); if (cb.length) out.push('Central-bank tone (latest, change vs previous meeting): ' + cb.map(c => `${c.bank} ${c.latest} (${c.trend})`).join('; ') + '. Tone momentum against price tested null.');
  const sb = P.surpriseBars(D.es); if (sb.length) out.push('Data surprises vs consensus by currency (positive = beating): ' + sb.map(s => `${s.ccy} ${s.score}`).join(', ') + '.');
  const cr = P.crowding(D.ce, D.cs).map(P.crowdCcy).filter(c => c.state !== 'mid-range'); if (cr.length) out.push('Speculative positioning at extremes: ' + cr.map(c => `${c.sym} ${c.state} (${ord(c.pct)} pct)${c.cot ? `, ${c.cot.label.toLowerCase()}` : ''}`).join('; ') + '. Context, never a direction.');
  const st = Object.entries(D.cs?.instruments ?? {}).filter(([, v]) => v?.state || v?.zone === 'against'); if (st.length) out.push('Crowding map (study cot-crowding-programme): ' + st.map(([k, v]) => `${k} ${v.label.toLowerCase()} (${v.ev ?? 'descriptive'}, ${v.verdict})`).join('; ') + '.');
  out.push('', 'RIGHT NOW', ...L.right);
  if (axes.length) out.push('Global axes: ' + axes.map(a => `${a.label} ${a.score} (${a.agree} agree: ${a.inputs.map(i => i.text).join('; ')})`).join(' | '));
  const gm = P.gammaRows(D.oi); if (gm.length) out.push('Dealer gamma and walls: ' + gm.map(g => `${g.pair} ${g.regime} ${g.where ?? ''}`).join('; ') + '. Gamma sign is a range read; walls are locations, not magnets.');
  if (firing.length) out.push('Desk Watch firing: ' + firing.map(f => f.label).join('; ') + '.');
  out.push('', 'AHEAD', ...L.ahead);
  if (ahead.length) out.push('Next releases (UK time): ' + ahead.map(e => `${ukTime(e.ms)} ${e.country} ${e.event} (${e.impact}) expected ${e.estimate ?? 'n/a'}, previous ${e.prev ?? 'n/a'}`).join('; ') + '.');
  if (fp) out.push(`Fed path: ${fp.hike}% odds of a higher rate by ${fp.ref}, ${fp.cut}% of a cut, current range ${fp.current}. Context, no measured link to FX or index moves.`);
  if (nc) out.push(`Nowcasts: GDPNow ${nc.gdpnow}%, Cleveland CPI ${nc.cpi}% a month, core ${nc.core}%. Context, not a lean.`);
  const sc = P.scenarios(D.gr); if (sc.length) out.push('Scenario probabilities: ' + sc.map(s => `${s.name} ${s.p}%`).join('; ') + '.');
  let mf = '';
  try { const l = marketFacts(); if (l.length) mf = '\n\nMARKET FACTS (one line per market; write one card for each, keyed by KEY)\n' + l.join('\n'); } catch (e) { console.warn('[atlas market facts]', e); }
  return out.join('\n').slice(0, 8500) + mf;
}

/* ── run the same brief prompt on another model ── */
function parseJsonText(t) { try { const c = String(t).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim(); const i = c.indexOf('{'); let d = 0, e = -1; for (let k = i; k < c.length; k++) { if (c[k] === '{') d++; else if (c[k] === '}') { d--; if (d === 0) { e = k; break; } } } return JSON.parse(c.slice(i, e + 1)); } catch { return null; } }
function abHtml(r) {
  const labels = Object.keys(r.answers ?? {}), side = (lab, meta) => { const a = parseJsonText(r.answers[lab]);
    return `<div class="abcol"><h4>${esc(lab)} <span class="pill">${meta?.chars ?? 0} chars</span>${meta?.ms ? `<span class="pill">${(meta.ms / 1000).toFixed(0)}s</span>` : ''}${meta?.cost?.usd != null ? `<span class="pill">$${Number(meta.cost.usd).toFixed(3)}</span>` : ''}${meta?.structural?.ok === false ? '<span class="pill amber">structure problem</span>' : ''}</h4>
      ${a ? `<p><b>${esc(a.headline ?? '')}</b></p><p class="note">${(a.driver ?? []).length} drivers · ${(a.transmission ?? []).length} transmission rows · ${(a.confirm ?? []).length} confirms · ${(a.invalidate ?? []).length} invalidates · ${(a.catalysts ?? []).length} catalysts · ${(a.noEdge ?? []).length} no-edge items</p>${a.lesson?.concept ? `<p><b>Lesson:</b> ${esc(a.lesson.concept)}</p>` : ''}` : '<p class="note">The answer is not valid JSON.</p>'}
      <p class="note">${esc(String(r.audit?.flags?.[lab]?.length ?? 0))} sentence(s) flagged against the evidence ledger</p></div>`; };
  return `<div class="ab"><div class="two">${side(labels[0], r.a)}${side(labels[1], r.b)}</div><p class="note">${esc(r.audit?.verdict ?? '')} ${esc(r.caveat ?? '')}</p></div>`;
}
async function runAb(provider, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Running the same prompt… ~60s';
  const r = await J('/api/ai-ab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'brief', provider }) });
  btn.disabled = false; btn.textContent = old;
  $('about').innerHTML = r?.ok ? abHtml(r) : `<div class="err">${esc(r?.error ?? 'no response')}${r?.how ? ' ' + esc(r.how) : ''}</div>`;
}
function drawAb() {
  const ai = D.ai; const box = $('abbox'); if (!box) return; if (!ai?.ok || !D.intel?.ok) { box.innerHTML = ''; return; }
  const cur = D.intel.llm?.provider ?? briefModel()?.provider, others = ai.providers.filter(p => p.configured && p.id !== cur);
  box.innerHTML = others.length ? `<div class="card"><h2>${ic('layers')}Compare models on the same brief</h2><p class="note" style="margin-bottom:8px">Replays the last brief call's exact prompt on another model, then shows both side by side with a check against the evidence ledger. One model call each.</p><div class="chips">${others.map(p => `<button class="btn" data-ab="${esc(p.id)}">Run on ${esc(p.label)}</button>`).join('')}</div><div id="about" style="margin-top:10px"></div></div>` : '';
  document.querySelectorAll('[data-ab]').forEach(b => { b.onclick = () => runAb(b.getAttribute('data-ab'), b); });
}


/* ── the daily newsletter: built from the same rows, one click ── */
function nlNumbers() {
  const us2 = fmtRate('us2y'), us10 = fmtRate('us10y'), tips = fmtRate('tips'), hy = fmtRate('hy'), dx = fmtPct('dxy'), nq = fmtPct('nq'), spx = fmtPct('spx'), vix = fmtPct('vix'), oil = fmtPct('oil'), brent = fmtPct('brent');
  const bp = x => (x == null ? '' : `${sg(x, 0)}bp`), pc = x => (x == null ? '' : `${sg(x, 2)}%`), tone = x => (x == null ? '' : x >= 0 ? 'up' : 'dn');
  const tiles = [
    us2 && { name: 'US 2Y', value: us2.v.toFixed(2) + '%', sub: `${bp(us2.d1)} · 20d ${bp(us2.d20)}`, tone: tone(us2.d1), spark: spark('us2y') },
    hy && { name: 'High-yield spread', value: Math.round(hy.v * 100) + 'bp', sub: `${bp(hy.d1)} · 20d ${bp(hy.d20)}`, tone: tone(hy.d1 == null ? null : -hy.d1), spark: spark('hy') },
    dx && { name: 'Dollar (broad)', value: dx.v.toFixed(1), sub: `${pc(dx.d1)} · 20d ${pc(dx.d20)}`, tone: tone(dx.d1), spark: spark('dxy') },
    nq && { name: 'Nasdaq, 20 days', value: pc(nq.d20), sub: `S&P 500 ${pc(spx?.d20)}`, tone: tone(nq.d20), spark: spark('nq') },
    vix && { name: 'VIX', value: vix.v.toFixed(1), sub: `${pc(vix.d1)} on the day`, tone: tone(vix.d1 == null ? null : -vix.d1), spark: spark('vix') },
    (brent || oil) && { name: brent ? 'Brent' : 'Oil (WTI)', value: '$' + (brent ?? oil).v.toFixed(1), sub: `${pc((brent ?? oil).d20)} over 20 days`, tone: tone((brent ?? oil).d20), spark: spark(brent ? 'brent' : 'oil') },
  ].filter(Boolean);
  const stages = [
    { n: 'Bonds', m: 'the reservoir', rows: [us2 && ['US 2Y', us2.v.toFixed(2) + '%', bp(us2.d1), tone(us2.d1)], us10 && ['US 10Y', us10.v.toFixed(2) + '%', bp(us10.d1), tone(us10.d1)], tips && ['Real 10Y', tips.v.toFixed(2) + '%', bp(tips.d1), tone(tips.d1)]].filter(Boolean) },
    { n: 'Credit', m: 'the pipes', rows: [hy && ['HY spread', Math.round(hy.v * 100) + 'bp', bp(hy.d1), tone(hy.d1)], hy && ['20 days', bp(hy.d20), '', tone(hy.d20)]].filter(Boolean) },
    { n: 'FX', m: 'the valves', rows: [dx && ['Dollar', dx.v.toFixed(1), pc(dx.d1), tone(dx.d1)], dx && ['20 days', pc(dx.d20), '', tone(dx.d20)]].filter(Boolean) },
    { n: 'Equities', m: 'the tap', rows: [nq && ['Nasdaq 20d', pc(nq.d20), '', tone(nq.d20)], spx && ['S&P 20d', pc(spx.d20), '', tone(spx.d20)], vix && ['VIX', vix.v.toFixed(1), '', tone(vix.d1 == null ? null : -vix.d1)]].filter(Boolean) },
  ];
  return { tiles, stages };
}
const NL_RANGE_KEYS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'BTCUSD'];
/** The feeds an issue leans on, each with its own as-of date and rhythm, for the sources list and the freshness check in the newsletter (js/dataFreshness.js). */
function nlSources(hmmAt) {
  const ukDay = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s ?? '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const oiAt = (D.oi?.pairs ?? []).map(p => ukDay(p.savedAt)).filter(Boolean).sort().at(-1) ?? null;
  const ivlAt = Object.values(D.ivl?.implied ?? {}).map(x => x?.savedAtMs).filter(Number.isFinite).sort().at(-1);
  const cbAt = Object.values(cbHist()).flatMap(h => (h ?? []).map(x => x?.meetingDate)).filter(Boolean).sort().at(-1) ?? null;
  return [
    { label: 'Market prices, yields, volatility, credit', source: 'OANDA, FRED, Cboe, Yahoo', asOf: D.drill?.dates?.at(-1) ?? null, cadence: 'daily' },
    { label: 'Speculative positioning', source: 'CFTC Commitments of Traders', asOf: D.ce?.reportDate ?? D.ce?.instruments?.find(i => i.reportDate)?.reportDate ?? null, cadence: 'cftc' },
    { label: 'Option positions and dealer gamma', source: 'CME QuikStrike settlements', asOf: oiAt, cadence: 'daily' },
    { label: 'Implied volatility', source: 'CME QuikStrike settlements', asOf: ivlAt ? new Date(ivlAt).toISOString() : null, cadence: 'daily' },
    { label: 'Release calendar', source: 'Nasdaq, ForexFactory', asOf: D.cal?.at ?? null, cadence: 'live' },
    { label: 'Data surprises', source: 'consensus against actual, own scoring', asOf: D.es?.generatedAt ?? null, cadence: 'live' },
    { label: 'Market-implied Fed path', source: 'CME fed funds futures', asOf: D.fp?.zq?.asOf ?? D.fp?.asOf ?? null, cadence: 'daily' },
    { label: 'Nowcasts', source: 'Atlanta Fed GDPNow, Cleveland Fed', asOf: D.nc?.cleveland?.asOf ?? null, cadence: 'irregular' },   // the Cleveland model updates on its own schedule, so its date is shown and never flagged
    { label: 'Range forecast', source: 'own model on OANDA prices', asOf: D.fc?.computed_at ?? null, cadence: 'live' },
    { label: 'Hourly volatility state', source: 'OANDA hourly prices, own model', asOf: hmmAt ?? null, cadence: 'hourly' },
    { label: 'Central-bank tone', source: 'bank statements, own scoring', asOf: cbAt, cadence: 'irregular' },
  ];
}
/** The 10-year yield, its real part (TIPS) and its inflation part (breakeven) measured on ONE date: the latest day all three printed. Three series that last printed on different days cannot be added
 *  (nominal = real + breakeven only holds on a shared date), so the later print of any one of them is kept apart as a note, not mixed in. */
function alignedYield() {
  const S = D.drill?.series, dts = D.drill?.dates; if (!S?.us10y || !S?.tips || !S?.bei || !dts?.length) return null;
  const ok = i => S.us10y[i] != null && S.tips[i] != null && S.bei[i] != null;
  let L = null; for (let i = dts.length - 1; i >= 0; i--) if (ok(i)) { L = i; break; } if (L == null) return null;
  const want = Date.parse(dts[L]) - 20 * 864e5; let R = null; for (let i = L; i >= 0; i--) if (Date.parse(dts[i]) <= want && ok(i)) { R = i; break; } if (R == null) return null;
  const idx = []; for (let i = R; i <= L; i++) if (ok(i)) idx.push(i);
  const bp = k => idx.map(i => +((S[k][i] - S[k][R]) * 100).toFixed(2));
  const series = { us10y: bp('us10y'), real: bp('tips'), bei: bp('bei') };
  let later = null; for (let i = dts.length - 1; i > L; i--) if (S.bei[i] != null) { later = { date: dts[i], d: +((S.bei[i] - S.bei[R]) * 100).toFixed(1) }; break; }
  return { asOf: dts[L], from: dts[R], nominal: S.us10y[L], real: S.tips[L], bei: S.bei[L], dNom: series.us10y.at(-1), dReal: series.real.at(-1), dBei: series.bei.at(-1), series, later };
}
function nlInput({ bookFor = () => null } = {}) {
  const regime = P.regimeCard(D.regime), axes = P.axesRows(D.gr), firing = P.deskFiring(D.ds), ahead = P.aheadEvents(D.events, Date.now(), { limit: 12, withinHours: 72 }), fp = P.fedPathCard(D.fp), meeting = P.nextMeeting(D.fcal), nc = P.nowcastCard(D.nc);
  const position = P.positionLines({ regime, axes, firing, events: ahead, fedPath: fp, meeting }), a = D.intel?.analysis ?? null, keys = Object.keys(insts()), { tiles, stages } = nlNumbers();
  return {
    date: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }),
    isoDate: ukDate(),
    generatedAt: D.intel?.generatedAt ?? null, headline: a?.headline, regimeWord: a?.regime ?? 'MIXED', riskFlags: D.rf ? { active: D.rf.active ?? 0, total: D.rf.available ?? D.rf.total ?? 5, flags: (D.rf.flags ?? []).map(f => ({ key: f.key, label: f.label, on: f.on, value: f.value, detail: f.detail })) } : null,
    brief: a, llm: D.intel?.llm ?? null, tiles, stages, links: derived.chain.links, nodeSeries: derived.chain.ser, position,
    events: ahead.map(e => ({ ...e, note: eventNote(e, bookFor(e), keys) })),
    ranges: NL_RANGE_KEYS.filter(k => insts()[k]).map(k => { const d = pairData(k); return { label: labelOf(k), price: d.price != null ? d.price.toFixed(d.dp ?? 4) : null, hlMed: d.hlMed, used: d.used }; }),
    assets: NL_RANGE_KEYS.filter(k => insts()[k]).map(k => { const d = pairData(k), reg = P.regimeFor(D.regime, k), gam = P.gammaFor(D.oi, k), fire = P.deskFiring(D.ds, k).filter(f => f.instruments.includes(k)).length, g = { fx: 'FX', index: 'Index', commodity: 'Gold', crypto: 'Bitcoin' }[acOf(k)] ?? '';
      const mk = (D.intel?.analysis?.markets ?? []).find(x => String(x.key).toUpperCase() === k), sk = MK_SERIES[k], mv = sk ? fmtPct(sk) : null; return { key: k, label: labelOf(k), groupLabel: g, spark: sk ? spark(sk, 40) : [], d1: mv?.d1 ?? null, d20: mv?.d20 ?? null, read: plainRead(mk?.read), watch: plainRead(mk?.watch), implied: impliedRow(D.ivl?.implied?.[impliedKeyFor(k)], k, Date.now()), zone: (() => { const row = (D.oi?.pairs ?? []).find(p => p.pair === P.OI_PAIR_FOR[k]); return row ? optionZone(row, k, d.dp ?? 4) : null; })(), price: d.price != null ? d.price.toFixed(d.dp ?? 4) : null, hlMed: d.hlMed, used: d.used, hl75Ratio: d.hl75 != null && d.hlMed ? d.hl75 / d.hlMed : null, chips: [reg ? `up in ${reg.posShare}% of months in this backdrop` : null, gam?.regime === 'PIN' ? 'options dealers tend to hold price in place' : null, fire ? `${fire} of our monitors flagging it` : null].filter(Boolean) }; }),
    yieldStack: (() => { const al = alignedYield(); if (al) return { nominal: al.nominal, real: al.real, bei: al.bei, dNom: al.dNom, dReal: al.dReal, dBei: al.dBei, asOf: al.asOf, from: al.from, later: al.later }; const y = fmtRate('us10y'), r = fmtRate('tips'), b = fmtRate('bei'); return y && r && b ? { nominal: y.v, real: r.v, bei: b.v, dNom: y.d20, dReal: r.d20, dBei: b.d20 } : null; })(),
    yieldSeries: alignedYield()?.series ?? null,
    rangePressure: rpNow(), fearVsNasdaq: fearNow(), vixBeta: betaNow(), impliedRatio: impNow(),
    ...nlStrips(),
    strengths: derived.str, surprise: P.surpriseBars(D.es), cb: P.cbTone(cbHist()), crowding: P.crowding(D.ce, D.cs), cotDate: D.ce?.instruments?.find(i => i.reportDate)?.reportDate ?? null, regimeCard: regime, changes: P.changesRows(D.mc), fedPath: fp, scenarios: P.scenarios(D.gr), nowcast: nc,
    watching: firing.map(f => ({ id: f.id, label: f.label, kind: f.kind })),
    eod: D.eod?.review ? { hook: D.eod.review.hook, right: D.eod.review.plan?.right, wrong: D.eod.review.plan?.wrong } : null,
  };
}
/* ── the extra strips: sectors, big companies, commodities, fear gauges, credit (all from the 5-year market bundle already loaded) ── */
const NL_SECTORS = [['xlk', 'Technology'], ['xlc', 'Communication'], ['xly', 'Consumer discretionary'], ['xlf', 'Financials'], ['xli', 'Industrials'], ['xlv', 'Health care'], ['xlp', 'Consumer staples'], ['xle', 'Energy'], ['xlu', 'Utilities'], ['xlb', 'Materials'], ['xlre', 'Real estate'], ['smh', 'Semiconductors']];
const NL_MEGA = [['nvda', 'Nvidia'], ['aapl', 'Apple'], ['msft', 'Microsoft'], ['amzn', 'Amazon'], ['googl', 'Alphabet (Google)'], ['meta', 'Meta'], ['tsla', 'Tesla'], ['avgo', 'Broadcom']];
const NL_COMMS = [['brent', 'Brent oil', '$'], ['oil', 'US oil (WTI)', '$'], ['natgas', 'Natural gas', '$'], ['copper', 'Copper', '$'], ['gold', 'Gold', '$'], ['silver', 'Silver', '$']];
const NL_VOLS = [['vix9d', 'VIX 9-day'], ['vix', 'VIX 1-month'], ['vix3m', 'VIX 3-month'], ['vix6m', 'VIX 6-month'], ['move', 'MOVE (bond-market fear)'], ['ovx', 'Oil volatility'], ['gvz', 'Gold volatility'], ['skew', 'SKEW (cost of crash protection)']];
const NL_CREDS = [['ig', 'Investment-grade companies'], ['hy', 'High-yield (junk) companies'], ['ccc', 'CCC (riskiest) companies']];
function nlStrips() {
  const pct = ([k, label]) => { const m = fmtPct(k); return m ? { label, d1: m.d1, d20: m.d20 } : null; };
  const lvl = ([k, label]) => { const t = lastTwo(k); if (!t) return null; const b = back(k, 20); return { label, v: t.last, d1: t.prev != null ? t.last - t.prev : null, d20: b != null ? t.last - b : null }; };
  return {
    stocks: { sectors: NL_SECTORS.map(pct).filter(Boolean), mega: NL_MEGA.map(pct).filter(Boolean) },
    commodities: NL_COMMS.map(([k, name, cur]) => { const m = fmtPct(k); if (!m) return null; return { name, value: cur + (m.v >= 100 ? m.v.toFixed(0) : m.v.toFixed(2)), sub: `${m.d1 != null ? sg(m.d1, 2) + '% today · ' : ''}20d ${sg(m.d20, 1)}%`, tone: m.d20 == null ? '' : m.d20 >= 0 ? 'up' : 'dn', spark: spark(k, 30), d1: m.d1, d20: m.d20 }; }).filter(Boolean),
    volatility: NL_VOLS.map(lvl).filter(Boolean),
    creditSpreads: NL_CREDS.map(([k, label]) => { const f = fmtRate(k); return f ? { label, bp: f.v * 100, d1: f.d1, d20: f.d20 } : null; }).filter(Boolean),
  };
}
/** The range-pressure gauge from the series already in the market bundle. */
function rpNow() { const S = D.drill?.series; if (!S) return null; return rangePressure({ vix: S.vix, vix3m: S.vix3m, vix9d: S.vix9d, spx: S.spx, nq: S.nq, dspx: S.dspx }); }
function fearNow() { const S = D.drill?.series; return S ? fearVsNasdaq({ vix: S.vix, vvix: S.vvix, nq: S.nq }) : null; }
/** C.OG's dR/dt (ledger vix-beta-change, research only): how fast the VIX's reaction to the Nasdaq is changing. */
/** dR/dt of the implied ratio VVIX/VXN (vix-calculus C2, ledger vix-second-derivative, research only). */
function impNow() { const S = D.drill?.series; return S?.vxn ? impliedRatioChange({ vvix: S.vvix, vxn: S.vxn, nq: S.nq, dates: D.drill.dates }) : null; }
function betaNow() { const S = D.drill?.series; return S ? vixBeta({ vix: S.vix, nq: S.nq, dates: D.drill.dates }) : null; }
function drawRp() {
  const box = $('rpbox'); if (!box) return; const rp = rpNow();
  if (!rp?.n) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card"><h2>${ic('pulse')}Is today set up for a bigger day than usual? <span class="note" style="text-transform:none;letter-spacing:0;margin-left:auto">${rp.on} of ${rp.n} validated signals on</span></h2>
    <p style="margin:0 0 8px"><b>${esc(pressureWords(rp))}</b></p>
    <div class="rows">${rp.rows.map(r => `<div class="rw"><span><b>${esc(r.label)}</b><small>${esc(r.value ?? 'not measurable today')}${r.on === true ? ' · ' + esc(r.effect) : ''}</small></span><span style="display:flex;gap:6px;align-items:center"><span class="pill ${r.on === true ? 'amber' : ''}">${r.on === true ? 'on' : r.on === false ? 'off' : 'no data'}</span>${ledgerPill(r.evidence)}</span></div>`).join('')}</div>
    <p class="note" style="margin-top:8px">Each signal is a validated finding that it went with bigger-than-usual ranges: size, never direction. Zero means no validated reason to expect more than the usual, not that the day will be quiet.</p>
    ${(() => { const fv = fearNow(); return fv ? `<h3 style="margin-top:14px">Fear versus the Nasdaq ${ledgerPill('vvix-ratio-range')}</h3><p style="margin:4px 0 6px">${esc(fearWords(fv))}</p><div class="rows">${[['VIX', fv.b], ['VVIX', fv.a]].filter(([, c]) => c).map(([l, c]) => `<div class="rw"><span><b>${l} against the Nasdaq</b><small>moved ${c.ratio} times as much over 20 sessions, ${c.pct}th percentile of the past year</small></span><span class="pill ${c.on ? 'amber' : ''}">${c.on ? 'extreme' : 'normal'}</span></div>`).join('')}</div>` : ''; })()}${(() => { const v = betaNow(); return v ? `<h3 style="margin-top:14px">C.OG's dR/dt: how fast the VIX's reaction is changing ${ledgerPill('vix-beta-change')}</h3><p style="margin:4px 0 6px">${esc(vixBetaWords(v))}</p><div class="rows"><div class="rw"><span><b>VIX per 1% Nasdaq move</b><small>${v.beta}% over 20 sessions, changed ${v.change > 0 ? '+' : ''}${v.change} in 5 sessions, ${v.pct}th percentile of the past year</small></span><span class="pill ${v.on ? 'amber' : ''}">${v.on ? 'bottom tenth' : 'normal'}</span></div>${v.flags.length ? `<div class="rw"><span><b>Times it fired in the past year</b><small>${v.flags.map(f => `${esc(f.date ?? '')}: Nasdaq ${f.nq5 == null ? 'pending' : (f.nq5 > 0 ? '+' : '') + f.nq5 + '%'}`).join(' · ')}</small></span><span class="pill">next 5 sessions</span></div>` : ''}</div>` : ''; })()}${(() => { const v = impNow(); return v ? `<h3 style="margin-top:14px">dR/dt of the priced-in ratio VVIX/VXN ${ledgerPill('vix-second-derivative')}</h3><p style="margin:4px 0 6px">${esc(impliedRatioWords(v))}</p><div class="rows"><div class="rw"><span><b>VVIX ÷ VXN</b><small>${v.ratio}, ${v.change5 > 0 ? '+' : ''}${v.change5}% in 5 sessions, ${v.pct}th percentile of the past year</small></span><span class="pill ${v.on ? 'amber' : ''}">${v.on ? 'top tenth' : 'normal'}</span></div>${v.flags.length ? `<div class="rw"><span><b>Times it fired in the past year</b><small>${v.flags.map(f => `${esc(f.date ?? '')}: Nasdaq ${f.nq20 == null ? 'pending' : (f.nq20 > 0 ? '+' : '') + f.nq20 + '%'}`).join(' · ')}</small></span><span class="pill">next 20 sessions</span></div>` : ''}</div>` : ''; })()}<p class="note" style="margin-top:10px">The full calculus suite behind these readings (Brownian scaling, integrals, second derivatives, Garin's intraday rule out of sample, the VIX give-back on VX futures): <a href="vix-calculus.html">VIX calculus suite</a>.</p></div>`;
}
/** The market-state read for each card: the daily model (already in the brief), the hourly log, the 30-day daily history. */
async function nlHmm(keys) {
  const [h, d] = await Promise.all([J('/api/hmm-hourly?days=2'), J('/api/hmm-daily-history')]), out = {}; D.hmmAt = h?.updatedAt ?? null;
  for (const k of keys) {
    const reg = insts()[k]?.regime, hr = h?.ok ? h.pairs?.[k] ?? null : null, ds = d?.ok ? d.pairs?.[k] ?? null : null, sm = hr ? stateSummary(hr, 48) : null;
    const daily = reg && (reg.label === 'TREND' || reg.label === 'RANGE') ? { state: reg.label === 'TREND' ? 'active' : 'quiet', prob: reg.label === 'TREND' ? reg.trend_prob : reg.range_prob } : null;
    const hourly = sm ? { state: sm.now, prob: sm.nowProb } : null;
    if (daily || hourly || ds) out[k] = { daily, hourly, hourlyStrip: hr, dailyStrip: ds };
  }
  return out;
}
async function nlExtras(horizonDays) {
  const today = ukDate(), to = ukDate(new Date(Date.now() + horizonDays * 864e5)), errors = [];
  const [ea, ta, fs] = await Promise.all([J('/api/earnings-ahead'), J('/api/treasury-auctions'), J('/api/fed-speakers')]);
  const within = r => r.date >= today && r.date <= to;
  if (!ea?.ok) errors.push('earnings'); if (!ta?.ok) errors.push('auctions'); if (!fs?.ok) errors.push('fed');
  return { closures: closuresBetween(today, to), earnings: (ea?.rows ?? []).filter(within), auctions: (ta?.rows ?? []).filter(within), fed: (fs?.rows ?? []).filter(within), errors };
}
const ukDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
let NL_ARCH = [];
async function loadArchive() { const r = await J('/api/newsletter/archive'); NL_ARCH = r?.ok ? r.issues : []; return NL_ARCH; }
function drawNl() {
  const box = $('nlbox'); if (!box || $('nlBuild')) return;   // built once; a redraw of the page must not wipe a finished issue
  box.innerHTML = `<div class="card"><h2>${ic('cal')}Newsletter</h2>
    <p class="note" style="margin-bottom:8px"><b>Daily</b> for the day, <b>weekly</b> best generated on Sunday evening for a Monday read (the weekly forecast refreshes after Friday 22:00 UTC and the whole week's releases are known). Each issue opens with a 30-second strip and what changed since the last one, covers the world, each currency and each market, and ends with a not-financial-advice footer that cannot be removed. Every build is saved, and the next issue marks how the previous one's day sizes came out. If today's brief is missing or older than 8 hours it generates one first.</p>
    <p style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0"><button class="btn" id="nlBuild">${icS('cal')}Build daily newsletter</button><button class="btn" id="nlBuildW">${icS('cal')}Build weekly newsletter</button><span class="note" id="nlStatus"></span></p><div id="nlOut"></div><h3 style="margin-top:14px">Past issues</h3><div id="nlPast" class="rows"><p class="note">Loading the archive…</p></div></div>`;
  $('nlBuild').onclick = () => buildIssue('daily'); $('nlBuildW').onclick = () => buildIssue('weekly');
  drawPast();
}
async function drawPast() {
  const el = $('nlPast'); if (!el) return; await loadArchive();
  el.innerHTML = NL_ARCH.length ? NL_ARCH.slice(0, 14).map(i => `<div class="rw"><span><b>${esc(i.kind === 'weekly' ? 'Weekly' : 'Daily')} · ${esc(i.date)}</b><small>${esc(i.subject)}${i.score ? ' · ' + esc(`median day ${i.score.median}x the expected size, ${i.score.pastShare}% past it`) : i.kind === 'daily' ? ' · not scored yet' : ''}</small></span><span style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn" href="/api/newsletter/issue?id=${encodeURIComponent(i.id)}" target="_blank" rel="noopener">Open</a><button class="btn" data-tg="${esc(i.id)}">Send to Telegram</button></span></div>`).join('') : '<p class="note">Nothing saved yet. Build an issue and it is saved here automatically.</p>';
  el.querySelectorAll('[data-tg]').forEach(b => { b.onclick = async () => { b.disabled = true; const r = await J('/api/newsletter/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.getAttribute('data-tg') }) }); $('nlStatus').textContent = r?.ok ? 'Sent to Telegram.' : (r?.error ?? 'Could not send.'); b.disabled = false; }; });
}
// A newsletter never generates a brief. Only the Generate button does (it costs a model call, and the owner decides when). If the stored brief is old, the issue is built from it and says so.
function ensureBrief(st) {
  if (!D.intel?.ok || !D.intel.analysis) { st.textContent = 'There is no Intelligence brief yet. Press Generate Intelligence brief on the Global page first.'; return false; }
  const hrs = (Date.now() - Date.parse(D.intel.generatedAt)) / 3.6e6;
  st.textContent = hrs > 8 ? `Using the stored brief, written ${hrs < 48 ? Math.round(hrs) + ' hours' : Math.round(hrs / 24) + ' days'} ago. Press Generate on the Global page for a fresh one.` : '';
  return true;
}
async function buildIssue(kind) {
  const weekly = kind === 'weekly', btn = $(weekly ? 'nlBuildW' : 'nlBuild'), st = $('nlStatus'); $('nlBuild').disabled = $('nlBuildW').disabled = true;
  try {
    if (!ensureBrief(st)) return;
    const arch = await loadArchive(), today = ukDate();
    const { eventImpactFor } = await import('./js/eventImpactMap.js');
    const bookFor = e => { try { return eventImpactFor(e.country, e.event); } catch { return null; } };
    const base = nlInput({ bookFor });
    st.textContent = 'Fetching earnings, auctions and the Fed diary…'; base.extras = await nlExtras(weekly ? 8 : 3); base.hmm = await nlHmm(NL_RANGE_KEYS); base.sources = nlSources(D.hmmAt);
    if (weekly) {
      base.edition = 'weekly';
      const wf = await J('/api/vol-forecast/weekly'), keys = Object.keys(insts());
      // ForexFactory lists only the current week, so on a Sunday the week ahead comes from the forward list (release type, no vendor rating) merged in without duplicates.
      // The main calendar covers only the current week. The forward list fills the days after it: only rows later than anything the main calendar holds
      // (so no release is shown twice), and one row per release type per time (Nasdaq lists a release several times: headline, core, manufacturing, services).
      const ca = await J('/api/calendar-ahead'), ffMax = Math.max(0, ...(D.events ?? []).map(e => e.ms)), seenK = new Set();
      const extra = (ca?.rows ?? []).filter(r => r.ms > ffMax).filter(r => { const k = `${r.country}|${r.ms}|${familyOf(r.event) ?? String(r.event).toLowerCase()}`; if (seenK.has(k)) return false; seenK.add(k); return true; })
        .map(r => ({ ms: r.ms, country: r.country, event: r.event, impact: /rate decision|interest rate|cash rate|bank rate|cpi|consumer price|inflation rate|nonfarm|non-farm|payroll|gdp/i.test(r.event) ? 'high' : 'medium', estimate: r.estimate ?? null, prev: r.prev ?? null }));
      const evs = P.aheadEvents([...(D.events ?? []), ...extra], Date.now(), { limit: 90, withinHours: 8 * 24 });
      base.week = { events: evs.map(e => ({ ...e, note: eventNote(e, bookFor(e), keys) })), ranges: NL_RANGE_KEYS.filter(k => wf?.instruments?.[k]).map(k => { const f = wf.instruments[k]; return { label: labelOf(k), hl5: f.hl_5d, hl5_75: f.hl_5d_75, hlMed: pairData(k).hlMed }; }) };
      const weekAgo = ukDate(new Date(Date.now() - 8 * 864e5)), wkd = arch.filter(i => i.kind === 'daily' && i.score && i.date > weekAgo), wr = weekRecord(wkd);
      base.record = wr ? { line: `${wr.days} daily issues, ${wr.n} market-days: the median day came out ${wr.median}x the expected size, ${wr.pastShare}% ran past it and ${wr.withinShare}% landed within half to one-and-a-half times. A well-calibrated forecast has the median near 1 and about half past it.`, days: wkd.map(i => ({ date: i.date, line: `median ${i.score.median}x the expected size, ${i.score.pastShare}% past it` })), date: today, week: { days: wr.days, n: wr.n, median: wr.median, pastShare: wr.pastShare, withinShare: wr.withinShare }, history: wkd.map(i => ({ date: i.date, median: i.score.median, pastShare: i.score.pastShare, withinShare: i.score.withinShare })) } : null;
    } else {
      const lastScored = arch.find(i => i.kind === 'daily' && i.score && i.date < today);
      base.record = lastScored ? { line: `Issue of ${lastScored.date}. ${scoreLine(lastScored.score)}`, date: lastScored.date, score: lastScored.score, history: arch.filter(i => i.kind === 'daily' && i.score && i.date <= today).slice(0, 8).map(i => ({ date: i.date, median: i.score.median, pastShare: i.score.pastShare, withinShare: i.score.withinShare })) } : null;
    }
    const snap = snapshotOf(base, { date: today, kind }), prev = arch.find(i => i.kind === kind && i.date < today);
    base.since = diffSnapshots(prev?.snapshot ?? null, snap);
    const out = buildNewsletter(base);
    let out2 = null; try { out2 = buildNewsletterV2(base); } catch (e) { console.warn('[atlas newsletter] V2 failed:', e.message); }   // the V2 draft is for comparing only: it is never saved or sent
    showNl(out, kind, out2);
    st.textContent = `Built: ${out.subject}. Saving…`;
    const sv = await J('/api/newsletter/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: out.subject, html: out.html, text: out.text, snapshot: snap }) });
    st.textContent = sv?.ok ? `Built and saved: ${out.subject}` : `Built, but not saved to the archive (${sv?.error ?? 'no response'}): ${out.subject}`;
    drawPast();
  } catch (e) { st.textContent = 'Could not build the newsletter: ' + e.message; console.error('[atlas newsletter]', e); }
  finally { $('nlBuild').disabled = $('nlBuildW').disabled = false; }
}
function showNl(out, kind = 'daily', out2 = null) {
  const url = URL.createObjectURL(new Blob([out.html], { type: 'text/html' })), fname = `desk-atlas-${kind}-${new Date().toISOString().slice(0, 10)}.html`;
  $('nlOut').innerHTML = `<div class="chips" style="margin:12px 0 8px"><button class="btn" id="nlPdf">Save as PDF</button><a class="btn" href="${url}" download="${fname}">Download .html</a><button class="btn" id="nlCopy">Copy plain text</button><a class="btn" href="${url}" target="_blank" rel="noopener">Open full page</a>${out2 ? '<button class="btn" id="nlCmp">Compare with V2</button><button class="btn" id="nlPdf2">Save V2 as PDF</button><a class="btn" id="nlDl2" download="' + fname.replace('desk-atlas-', 'desk-atlas-v2-') + '">Download V2 .html</a>' : ''}</div><p class="note" style="margin-bottom:8px"><b>Subject:</b> ${esc(out.subject)}</p><iframe id="nlFrame" title="Newsletter preview" sandbox style="width:100%;height:760px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe><p class="note" style="margin-top:6px">Self-contained: no scripts and no external requests, so it looks the same when attached, forwarded or printed to PDF.</p>`;
  $('nlFrame').srcdoc = out.html;
  if (out2) {   // side by side: the current issue on the left, the V2 draft on the right (stacked on a phone). Preview only, V2 is never saved or sent.
    const url2 = URL.createObjectURL(new Blob([out2.html], { type: 'text/html' }));
    $('nlOut').insertAdjacentHTML('beforeend', `<div id="nlCmpBox" class="cmp" hidden><div><p class="note"><b>Current</b></p><iframe id="nlFrameA" title="Current newsletter" sandbox></iframe></div><div><p class="note"><b>V2 draft</b> <a href="${url2}" target="_blank" rel="noopener">open full page</a></p><iframe id="nlFrameB" title="V2 newsletter draft" sandbox></iframe></div></div>`);
    $('nlFrameA').srcdoc = out.html; $('nlFrameB').srcdoc = out2.html;
    $('nlDl2').href = url2;
    $('nlPdf2').onclick = () => { const w = window.open(url2, '_blank'); if (!w) { $('nlStatus').textContent = 'Pop-up blocked: allow pop-ups, or use open full page then Ctrl+P.'; return; } w.addEventListener('load', () => setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 600)); $('nlStatus').textContent = 'In the print window choose Save as PDF, paper A4, and turn on Background graphics. The V2 issue is built for A4 and the chain page prints landscape.'; };
    $('nlCmp').onclick = () => { const box = $('nlCmpBox'); box.hidden = !box.hidden; $('nlFrame').style.display = box.hidden ? '' : 'none'; $('nlCmp').textContent = box.hidden ? 'Compare with V2' : 'Back to one view'; };
  }
  $('nlPdf').onclick = () => { const w = window.open(url, '_blank'); if (!w) { $('nlStatus').textContent = 'Pop-up blocked: allow pop-ups, or use Open full page then Ctrl+P.'; return; } w.addEventListener('load', () => setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 400)); $('nlStatus').textContent = 'In the print window choose Save as PDF, and turn on Background graphics if the colours look flat.'; };
  $('nlCopy').onclick = async () => { try { await navigator.clipboard.writeText(out.text); $('nlStatus').textContent = 'Copied the plain-text version.'; } catch { $('nlStatus').textContent = 'Copy was blocked here; use Download .html.'; } };
}

/* ── global ── */

function proxBlock(rf) {
  const rows = flagProximity(rf.flags);
  if (!rows.length) return '';
  return `<div style="margin-top:8px;display:grid;gap:5px;min-width:210px">${rows.map(r => `<div title="${esc(r.name)}: ${esc(r.valueText)}, fires at ${esc(r.thresholdText)}" style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;font-size:11.5px;color:var(--text2)"><span>${esc(r.name)}</span><span class="mono">${esc(r.valueText)} / ${esc(r.thresholdText)}</span><span style="grid-column:1/3;height:5px;border-radius:3px;background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:${Math.round(r.share * 100)}%;background:${r.on ? 'var(--red, #e8710a)' : r.share >= 0.7 ? '#d98a00' : 'var(--green, #0f9f6e)'}"></i></span></div>`).join('')}<div class="note" style="margin:0">how close each warning is to firing</div></div>`;
}
function heroHtml() {
  const a = D.intel?.ok ? D.intel.analysis : null, rf = D.rf;
  const kick = (a ? `<span class="pill ${/RISK-ON/i.test(a.regime) ? 'bull' : /RISK-OFF/i.test(a.regime) ? 'bear' : 'amber'}">${esc(a.regime)}</span>` : '') + `<span class="pill violet">${icS('bulb')}AI argument from measured links</span>`;
  let age = '', who = '';
  if (a && D.intel.generatedAt) { const h = (Date.now() - Date.parse(D.intel.generatedAt)) / 3.6e6; age = `<span class="pill ${h >= 6 ? 'amber' : ''}">${h < 1 ? Math.round(h * 60) + 'm old' : h < 24 ? h.toFixed(1) + 'h old' : Math.round(h / 24) + 'd old'}</span>`; }
  const part = D.intel?.analysis?.truncated ? `<span class="pill amber" title="${esc(D.intel.analysis.truncated.note)}">partial brief: the model ran out of room</span>` : '';
  const dev = D.intel?._device ? `<span class="pill amber" title="${esc(D.intel._why ?? '')}">device copy: ${esc(D.intel._why ?? 'this is the last brief this browser saw')}</span>` : '';
  const llm = D.intel?.llm, bm = briefModel();
  who = '';   // no "written by <model>" or "next: <model>" pills: the AI model selector beside Generate already says what will run, and the issue's footer carries the general AI disclosure.
  const unreachable = D.intel?._unreachable, head = a?.headline ? esc(a.headline) : unreachable ? 'The stored brief could not be loaded' : 'No Intelligence brief is stored';
  const body = a ? esc(a.driver?.[0]?.explain ?? a.driver?.[0]?.what ?? '') : unreachable ? 'The server did not answer after three tries. This is a loading problem, not a missing brief: reload the page, or press Load stored brief. Nothing has been generated or cleared.' : 'Press Generate for the argument: what is driving markets, how it transmits, what would confirm or break it, and what to learn from it. One model call.';
  return `<div><div class="kick">${kick}${age}${who}${dev}${part}</div><h2>${head}</h2><p>${body}</p>
     <p style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="aibox" id="heroai"></span>${unreachable ? `<button class="btn" id="reloadbtn">Load stored brief</button>` : ''}<button class="btn" id="genbtn">${icS('bulb')}Generate Intelligence brief</button> <span class="note">one model call, about 90 seconds, sends today's Behind / Now / Ahead rows with it</span></p></div>
     <div class="gauge">${rf ? dial(rf.active ?? 0, rf.available ?? rf.total ?? 5) : ''}${rf ? proxBlock(rf) : ''}</div><div class="gauge">${ring()}</div>`;
}
const fmtRate = key => { const t = lastTwo(key); if (!t) return null; const d1 = t.prev != null ? (t.last - t.prev) * 100 : null, b20 = back(key, 20), d20 = b20 != null ? (t.last - b20) * 100 : null; return { v: t.last, d1, d20 }; };
const fmtPct = key => { const t = lastTwo(key); if (!t) return null; const d1 = t.prev ? (t.last / t.prev - 1) * 100 : null, b20 = back(key, 20), d20 = b20 ? (t.last / b20 - 1) * 100 : null; return { v: t.last, d1, d20 }; };

function globalPosition() {
  const regime = P.regimeCard(D.regime), axes = P.axesRows(D.gr), firing = P.deskFiring(D.ds), ahead = P.aheadEvents(D.events), fp = P.fedPathCard(D.fp), meeting = P.nextMeeting(D.fcal), nc = P.nowcastCard(D.nc);
  const lines = P.positionLines({ regime, axes, firing, events: ahead, fedPath: fp, meeting });
  // BEHIND
  const pickKeys = ['SPX500', 'NQ', 'GOLD', 'DXY', 'WTI'], regRows = regime ? pickKeys.map(k => regime.markets.find(m => m.key === k)).filter(Boolean).map(m => barRow(m.label, m.mean, 3, `${sg(m.mean)}% · ${m.posShare}% up`)).join('') : '';
  const chg = P.changesRows(D.mc), unit = r => (r.unit === 'bps' ? 'bp' : '%'), cell = (v, r) => (v == null ? '·' : `${sg(v, r.unit === 'bps' ? 0 : 1)}${unit(r)}`);
  const chgHtml = chg.length ? `<div class="chg"><span>What changed</span><span>1d</span><span>5d</span><span>20d</span></div>` + chg.map(r => `<div class="chg"><span>${esc(r.label)}</span><span class="${r.d1 > 0 ? 'up' : r.d1 < 0 ? 'dn' : ''}">${cell(r.d1, r)}</span><span class="${r.d5 > 0 ? 'up' : r.d5 < 0 ? 'dn' : ''}">${cell(r.d5, r)}</span><span class="${r.d20 > 0 ? 'up' : r.d20 < 0 ? 'dn' : ''}">${cell(r.d20, r)}</span></div>`).join('') : '';
  const cb = P.cbTone(cbHist()), cbHtml = cb.length ? `<div class="cbgrid">${cb.map(c => `<div class="cbc"><b>${esc(c.bank)}</b> <span class="mono ${c.delta > 0.05 ? 'up' : c.delta < -0.05 ? 'dn' : ''}">${sg(c.latest)}</span><div>${sparkSvg(c.scores, 'var(--violet)', 90, 26)}</div><div class="note">${esc(c.trend)} · ${esc(String(c.regime ?? '').toLowerCase())}</div></div>`).join('')}</div>` : '';
  const sb = P.surpriseBars(D.es), sbHtml = sb.length ? sb.map(s => barRow(s.ccy, s.score, 0.6, `${sg(s.score)} · ${s.nRecent ?? s.n}`, 'l')).join('') : '';
  const crowd = P.crowding(D.ce, D.cs).map(P.crowdCcy).filter(c => c.state !== 'mid-range'), crowdHtml = crowd.length ? `<div class="chips">${crowd.map(c => `<span class="pill ${/crowded/.test(c.state) ? 'amber' : ''}" title="speculative position at the ${ord(c.pct)} percentile of its history">${esc(c.sym)} · ${esc(c.state)}</span>`).join('')}</div>` : '<p class="note">No FX position is at an extreme.</p>';
  const eod = D.eod?.review?.hook ? `<p class="tl-line" style="margin-top:10px"><b>Yesterday's review:</b> ${esc(D.eod.review.hook)} <span class="note">(${D.eod.stale ? 'stale, ' : ''}${Math.round((D.eod.ageMin ?? 0) / 60)}h old)</span></p>` : '';
  const behind = tense('behind', 'Behind us: what history and the week say', 'back',
    tl(lines.behind) + (regRows ? `<h3>What each market did in this regime, per month since 2007</h3><div class="fac">${regRows}</div><p class="note" style="margin-top:6px">${esc(regime.note)}</p>` : '') + `<h3>What changed</h3>${chgHtml || loading()}<h3>Central-bank tone, last 6 meetings</h3>${cbHtml || loading()}<h3>Who has been beating or missing consensus</h3><div class="fac">${sbHtml || loading()}</div><h3>Who is crowded</h3>${D.ce ? crowdHtml : loading()}${eod}<div class="shelf">${ledgerPill('cot-positioning-factor')}</div>`);
  // NOW
  const axHtml = axes.map(a => `<details class="learn" style="margin-top:6px"><summary>${esc(a.label)} <span class="mono ${a.score > 0.05 ? 'up' : a.score < -0.05 ? 'dn' : ''}">${sg(a.score)}</span> <span class="note">${esc(a.agree ?? '')} agree</span></summary><p>${a.inputs.map(i => esc(i.text)).join(' · ')}</p></details>`).join('');
  const gam = P.gammaRows(D.oi), gamHtml = gam.length ? gam.map(g => `<div class="rw"><span><b>${esc(g.pair)}</b><small>${esc(g.where ?? '')}${g.pc != null ? ` · put/call ${g.pc}` : ''}${g.dte != null ? ` · ${g.dte}d` : ''}</small></span><span class="pill ${g.regime === 'PIN' ? 'blue' : 'amber'}" title="PIN: dealers long gamma, moves are damped. BREAKOUT: dealers short gamma, moves are amplified.">${esc(g.regime ?? '?')}</span></div>`).join('') : '';
  const fireHtml = firing.length ? firing.map(f => `<div class="rw"><span>${esc(f.label)}<small>${esc(f.detail.slice(0, 160))}${f.detail.length > 160 ? '…' : ''}</small></span>${f.evidenceId ? ledgerPill(f.evidenceId) : ''}</div>`).join('') : '<p class="note">Nothing is firing.</p>';
  const crHook = D.cr?.read?.hook ? `<p class="tl-line" style="margin-top:10px"><b>The chain read (cached AI):</b> ${esc(D.cr.read.hook)} <span class="note">${D.cr.fresh ? '' : `(${Math.round((D.cr.ageMin ?? 0) / 60)}h old)`}</span></p>` : '';
  const now = tense('now', 'Right now: the state of play', 'pulse',
    tl(lines.right) + `<h3>The five global axes</h3>${axHtml || loading()}<h3>Desk Watch: conditions firing</h3>${D.ds ? fireHtml : loading()}<h3>Dealer gamma and the walls</h3><div class="rows">${gamHtml || loading()}</div><p class="note" style="margin-top:6px">What the ledger says about dealer gamma and range is in the badges; the walls are locations, not magnets. ${ledgerPill('gex-range')}${ledgerPill('gex-range-es')}</p>${crHook}`);
  // AHEAD
  const evHtml = ahead.length ? ahead.map(e => `<div class="evrow"><span class="tm">${esc(ukTime(e.ms))}</span><span>${e.ccy ? FLAG[e.ccy] + ' ' : ''}${esc(e.event)}<small>${e.estimate ? 'expected ' + esc(e.estimate) : 'no consensus listed'}${e.prev ? ', previous ' + esc(e.prev) : ''}</small></span><span class="pill ${e.impact === 'high' ? 'amber' : ''}">${esc(e.impact)}</span></div>`).join('') : '<p class="note">No high or medium impact release is listed in the next three days.</p>';
  const scn = P.scenarios(D.gr), scnHtml = scn.map(s => `<div class="scn"><div class="sn"><span>${esc(s.name)}</span><b>${s.p}%</b></div><div class="sb"><i style="width:${s.p}%"></i></div></div>`).join('');
  const fpHtml = fp ? `<p class="tl-line">${fp.hike}% odds of a higher rate by ${esc(fp.ref)}; ${fp.cut}% of a cut. Most likely band: ${esc(fp.mostLikely?.band ?? '?')} (${fp.mostLikely?.p}%).</p>` + fp.dist.map(d => `<div class="scn"><div class="sn"><span class="mono">${esc(d.band)}</span><span>${d.p}%</span></div><div class="sb"><i style="width:${Math.min(100, d.p)}%;background:var(--amber)"></i></div></div>`).join('') + `<p class="note">${esc(fp.note)} Source: ${esc(fp.source)}, ${esc(fp.asOf)}.</p>` : '';
  const ncHtml = nc ? `<p class="tl-line">GDPNow ${nc.gdpnow ?? '?'}% (Q3). Cleveland nowcast for ${esc(nc.month ?? '')}: CPI ${nc.cpi ?? '?'}% a month, core ${nc.core ?? '?'}%. <span class="note">${esc(nc.note)}</span></p>` : '';
  const inval = (D.gr?.invalidation ?? []).map(t => `<div class="rw"><span>${esc(t)}</span></div>`).join('');
  const aheadCard = tense('ahead', 'Ahead: what is already scheduled', 'fwd',
    tl(lines.ahead) + `<h3>Next releases, high and medium impact</h3>${D.events ? evHtml : loading()}<h3>Scenario probabilities</h3>${scnHtml || loading()}<h3>The Fed path</h3>${D.fp ? fpHtml : loading()}${ncHtml}<h3>What would change this view</h3><div class="rows">${inval || loading()}</div><div class="shelf">${ledgerPill('surprise-size')}<span class="pill">release direction: tested null</span></div>`);
  return `<div class="cols3">${behind}${now}${aheadCard}</div>`;
}

function drawGlobal() {
  $('hero').innerHTML = heroHtml(); const gb = $('genbtn'); if (gb) gb.onclick = generateIntel; const rb = $('reloadbtn'); if (rb) rb.onclick = async () => { rb.disabled = true; rb.textContent = 'Loading…'; D.intel = await loadIntel(); drawGlobal(); }; $('intelbody').innerHTML = intelBodyHtml(); drawAi(); drawAb(); drawRp(); drawNl();
  $('position').innerHTML = globalPosition();
  const { links } = derived.chain, g = (key, kind) => (kind === 'rate' ? fmtRate(key) : fmtPct(key));
  const bp = x => (x == null ? '' : `${sg(x, 0)}bp`), pc = x => (x == null ? '' : `${sg(x, 2)}%`);
  const us2 = g('us2y', 'rate'), us10 = g('us10y', 'rate'), tips = g('tips', 'rate'), hy = g('hy', 'rate'), dx = g('dxy', 'pct'), nq = g('nq', 'pct'), spx = g('spx', 'pct'), vix = g('vix', 'pct'), oil = g('oil', 'pct'), brent = g('brent', 'pct');
  const row = (n, v, d, c) => `<div class="nd"><span>${n}</span><span class="mono ${c || ''}">${v}${d ? ` <span style="color:var(--text3)">${d}</span>` : ''}</span></div>`, cls = x => (x == null ? '' : x >= 0 ? 'up' : 'dn');
  const ST = [
    { n: 'Bonds', m: 'the reservoir', ic: 'bank', rows: [us2 && row('US 2Y', us2.v.toFixed(2) + '%', bp(us2.d1), cls(us2.d1)), us10 && row('US 10Y', us10.v.toFixed(2) + '%', bp(us10.d1), cls(us10.d1)), tips && row('Real 10Y', tips.v.toFixed(2) + '%', bp(tips.d1), cls(tips.d1))] },
    { n: 'Credit', m: 'the pipes', ic: 'pipe', rows: [hy && row('HY spread', Math.round(hy.v * 100) + 'bp', bp(hy.d1), cls(hy.d1)), hy && row('20-day', bp(hy.d20), '', cls(hy.d20))] },
    { n: 'FX', m: 'the valves', ic: 'valve', rows: [dx && row('Dollar (broad)', dx.v.toFixed(1), pc(dx.d1), cls(dx.d1)), dx && row('20-day', pc(dx.d20), '', cls(dx.d20))] },
    { n: 'Equities', m: 'the tap', ic: 'tap', rows: [nq && row('Nasdaq 20d', pc(nq.d20), '', cls(nq.d20)), spx && row('S&P 500 20d', pc(spx.d20), '', cls(spx.d20)), vix && row('VIX', vix.v.toFixed(1), vix.d1 == null ? '' : sg(vix.d1 * vix.v / 100, 2), cls(vix.d1))] }];
  $('stages').innerHTML = ST.map((s, i) => `<div class="stage"><div class="sh"><div class="ico">${ic(s.ic)}</div><div><div class="nm">${s.n}</div><div class="metaphor">${s.m}</div></div></div>${s.rows.filter(Boolean).join('') || '<div class="note">no data</div>'}</div>` + (i < 3 ? '<div class="flowv"></div><div class="connector"><div class="flow"></div></div>' : '')).join('');
  const meas = links.filter(l => l.verdict !== 'unmeasured'), order = { broken: 0, holding: 1, quiet: 2 };
  const show = meas.filter(l => l.verdict !== 'quiet').sort((a, b) => order[a.verdict] - order[b.verdict]), quiet = meas.filter(l => l.verdict === 'quiet');
  const pipeHtml = (l, i) => { const cl = l.verdict === 'holding' ? 'hold' : l.verdict === 'broken' ? 'brk' : 'qt', lab = l.verdict === 'holding' ? 'Holding' : l.verdict === 'broken' ? 'Broken' : 'Quiet', icn = l.verdict === 'holding' ? 'check' : l.verdict === 'broken' ? 'break' : 'pause';
    return `<button class="pipe" data-i="${i}" aria-expanded="false"><span class="st ${cl}">${ic(icn)}</span><span><span class="t1">${esc(l.a.label)} → ${esc(l.b.label)}</span><br><span class="t2">${esc(l.a.text)} · ${esc(l.b.text)}</span></span><span class="pill ${l.verdict === 'holding' ? 'bull' : l.verdict === 'broken' ? 'amber' : ''}">${lab}</span></button>`; };
  const all = [...show, ...quiet];
  $('pipes').innerHTML = show.map((l, i) => pipeHtml(l, i)).join('') + (quiet.length ? `<details class="learn"><summary>${icS('pause')}${quiet.length} quiet links, not judged today</summary><div class="pipes">${quiet.map((l, i) => pipeHtml(l, show.length + i)).join('')}</div></details>` : '') || '<p class="note">No chain link has both ends measured today.</p>';
  document.querySelectorAll('.pipe').forEach(b => { b.onclick = () => { const i = +b.getAttribute('data-i'), open = state.pipe === i; state.pipe = open ? null : i;
    document.querySelectorAll('.pipe').forEach(x => x.setAttribute('aria-expanded', String(!open && x === b)));
    const l = all[i]; $('pipeinfo').innerHTML = open ? 'Tap a link to see what should have responded, and what did.' : `<b>${esc(l.a.label)} ${esc(l.a.text)} → ${esc(l.b.label)} ${esc(l.b.text)}.</b> The textbook: ${esc((l.textbook ?? '').toLowerCase())}. ${esc(l.read ?? '')}`; }; });
  const tile = (name, icn, main, sub, subCls, key, col) => `<div class="tile"><div class="tn">${ic(icn)}${name}</div><div class="tv">${main}</div><div class="td ${subCls}">${sub}</div>${sparkSvg(spark(key), col)}</div>`;
  const C = x => (x == null ? 'var(--text3)' : x >= 0 ? 'var(--bull)' : 'var(--bear)');
  $('tiles').innerHTML = [
    us2 && tile('Rates', 'chart', us2.v.toFixed(2) + '%', `2Y ${bp(us2.d1)} · 20d ${bp(us2.d20)}`, cls(us2.d1), 'us2y', C(us2.d1)),
    hy && tile('Credit', 'pipe', Math.round(hy.v * 100) + 'bp', `HY ${bp(hy.d1)} · 20d ${bp(hy.d20)}`, cls(hy.d1), 'hy', C(hy.d1 == null ? null : -hy.d1)),
    dx && tile('Dollar', 'coins', dx.v.toFixed(1), `${pc(dx.d1)} · 20d ${pc(dx.d20)}`, cls(dx.d1), 'dxy', C(dx.d1)),
    nq && tile('Equities', 'pulse', pc(nq.d20), `Nasdaq 20d · S&P ${pc(spx?.d20)}`, cls(nq.d20), 'nq', C(nq.d20)),
    vix && tile('Volatility', 'flame', vix.v.toFixed(1), `VIX ${pc(vix.d1)} on the day`, cls(vix.d1 == null ? null : -vix.d1), 'vix', C(vix.d1 == null ? null : -vix.d1)),
    (brent || oil) && tile('Oil', 'oil', '$' + (brent ?? oil).v.toFixed(1), `Brent ${pc((brent ?? oil).d20)} 20d${brent && oil ? ` · WTI $${oil.v.toFixed(1)}` : ''}`, cls((brent ?? oil).d20), brent ? 'brent' : 'oil', C((brent ?? oil).d20))].filter(Boolean).join('');
  $('flags').innerHTML = (D.rf?.flags ?? []).map(f => `<div class="rw"><span>${esc(f.label)}${f.detail ? `<small>${esc(f.detail)}</small>` : ''}</span><span class="pill ${f.on ? 'amber' : ''}">${f.on ? 'on' : 'off'}</span></div>`).join('') || '<p class="note">Risk flags unavailable.</p>';
  $('gstrip').innerHTML = stripHtml('g'); wireStrip('gstrip');
  const h = ukNow(); let t = '<div class="axis"></div>';
  [['Asia', 0, 8, 'var(--violet)'], ['Asia', 23, 24, 'var(--violet)'], ['London', 8, 16.5, 'var(--blue)'], ['New York', 13.5, 21, 'var(--bull)']].forEach(s => { t += `<div class="seg" style="left:${s[1] / 24 * 100}%;width:${(s[2] - s[1]) / 24 * 100}%;background:${s[3]}" title="${s[0]}"></div>`; });
  [0, 6, 12, 18, 24].forEach(x => { t += `<div class="tick" style="left:${x / 24 * 100}%">${x === 24 ? '00' : String(x).padStart(2, '0')}</div>`; });
  $('tl').innerHTML = t + `<div class="now" style="left:${h / 24 * 100}%"></div>`;
  const rows = (D.cal?.printed?.rows ?? []).filter(r => r.ms && Date.now() - r.ms < 36 * 3600e3 && Date.now() - r.ms > -3600e3).sort((a, b) => b.ms - a.ms).slice(0, 6);
  $('cats').innerHTML = rows.length ? rows.map(r => { const sp = r.surprise, when = new Date(r.ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
    return `<div class="rw"><span><b>${when}</b> · ${esc(r.country)} · ${esc(r.event)}<small>actual ${esc(r.actual)} against ${esc(r.consensus)} expected${r.previous != null ? `, was ${esc(r.previous)}` : ''}</small></span>${sp != null ? `<span class="pill ${sp > 0 ? 'bull' : sp < 0 ? 'bear' : ''}">${sp > 0 ? 'above' : sp < 0 ? 'below' : 'in line'}</span>` : ''}</div>`; }).join('') : '<p class="note">No releases printed in the last day.</p>';
}
function stripHtml(kind) { return derived.str.map(c => { const w = Math.min(50, Math.abs(c.score) / 0.6 * 50), col = c.score >= 0 ? 'var(--bull)' : 'var(--bear)';
  return `<button class="cc" data-c="${c.ccy}" aria-pressed="${kind === 'c' && state.ccy === c.ccy}"><div class="fl">${FLAG[c.ccy]}</div><div class="cd">${c.ccy}</div><div class="bar"><i style="${c.score >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${col}"></i></div><div class="mv ${c.score >= 0 ? 'up' : 'dn'}">${sg(c.score)}%</div></button>`; }).join(''); }
const wireStrip = id => document.querySelectorAll('#' + id + ' .cc').forEach(b => { b.onclick = () => go('ccy', { ccy: b.getAttribute('data-c') }); });
let _genP = null;
function generateIntel() { return (_genP ??= _generateIntel().finally(() => { _genP = null; })); }   // one at a time on this page: a second click or the newsletter button joins the first
async function _generateIntel() {
  const b = $('genbtn'); if (!b) return false; b.disabled = true; b.textContent = 'Starting…';
  const fail = msg => { b.disabled = false; b.textContent = 'Generate Intelligence brief'; $('loaderr').innerHTML = `<div class="err">Generate failed: ${esc(msg)}</div>`; return false; };
  const done = r => { D.intel = r; lsPut(r); drawGlobal(); if (r.saved === false) $('loaderr').innerHTML = '<div class="err">The brief was generated but could NOT be saved on the server, so it will be gone when you reload and other devices will not see it. Build the newsletter now to keep it, or press Generate again.</div>'; return true; };
  // The work runs on the server in the background. This page only starts it and watches, so a dropped phone connection or a long model no longer loses it.
  const r0 = await J('/api/morning-brief?mode=intel&async=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: positionContext() }) });
  const joined = !r0?.ok && /already generating/.test(r0?.error ?? '');
  if (!r0?.ok && !joined) return fail(r0?.error ?? 'the server did not answer');
  const t0 = r0?.startedAt ?? Date.now(); let sawRunning = false, quiet = 0;
  for (;;) {
    const el = Math.round((Date.now() - t0) / 1000); b.textContent = `${joined ? 'Another brief is generating' : 'Writing the brief'}… ${Math.floor(el / 60)}m ${String(el % 60).padStart(2, '0')}s`;
    await new Promise(x => setTimeout(x, 4000));
    const s = await J('/api/morning-brief/status');
    if (!s?.ok) { if (++quiet > 20) return fail('lost contact with the server'); continue; } quiet = 0;
    if (s.running) { sawRunning = true; continue; }
    const j = s.job;
    if (j?.status === 'done' && j.payload) return done(j.payload);
    if (j?.status === 'error') return fail(j.error ?? 'the model returned an error');
    if (sawRunning || joined) return fail('the server restarted or lost the job while it was writing; press Generate again');
    if (Date.now() - t0 > 14 * 60000) return fail('timed out after 14 minutes');
  }
}

/* ── currency ── */
function ccyPosition(k) {
  const bank = P.BANK_OF[k], cb = P.cbTone(cbHist()).find(c => c.ccy === k), sb = P.surpriseBars(D.es).find(s => s.ccy === k), crowd = P.crowding(D.ce, D.cs).map(P.crowdCcy).find(c => c.sym === k);
  const country = COUNTRY_OF[k], ahead = P.aheadEvents(D.events, Date.now(), { countries: country ? [country] : null, withinHours: 120 });
  const behindBody = (cb ? `<h3>${esc(cb.bank)} tone over its last ${cb.scores.length} meetings</h3><div>${sparkSvg(cb.scores, 'var(--violet)', 140, 34)}</div><p class="tl-line">Latest ${sg(cb.latest)} (${esc(String(cb.regime ?? '').toLowerCase())}), ${esc(cb.trend)} against the previous meeting.${cb.headline ? ' ' + esc(cb.headline) : ''}</p><p class="note">Tone momentum against forward price tested null here: context, not a lean. ${ledgerPill('cb-tone-direction')}</p>` : `<p class="note">${k} has no tracked central bank on this desk (FOMC, ECB, BoE, BoJ, RBNZ, RBA and BoC only).</p>`)
    + (sb ? `<h3>Beating or missing consensus</h3>${barRow(k, sb.score, 0.6, `${sg(sb.score)} · ${sb.nRecent ?? sb.n} recent`, 'l')}${sb.top.length ? `<div class="rows" style="margin-top:6px">${sb.top.map(t => `<div class="rw"><span>${esc(t.event)}<small>actual ${esc(t.actual)} against ${esc(t.estimate)}</small></span><span class="mono ${t.z > 0 ? 'up' : 'dn'}">z ${sg(t.z, 1)}</span></div>`).join('')}</div>` : ''}<p class="note">A positive score means releases have come in above consensus. The size of a surprise is validated for range; its direction is not. ${ledgerPill('surprise-size')}</p>` : '')
    + (crowd ? `<h3>Positioning</h3><p class="tl-line">Speculators are <b>${esc(CROWD_WORDS[crowd.state] ?? crowd.state)}</b> (${ord(crowd.pct)} percentile of their history). ${ledgerPill('cot-positioning-factor')}</p>` : '');
  const nowBody = `<p class="tl-line">Measured today: ${derived.str.find(x => x.ccy === k) ? sg(derived.str.find(x => x.ccy === k).score) + '% on the 1-day pair average' : 'no pair data'}. The macro read (the radar above) is the current state of the six factors.</p>${k === 'USD' ? `<p class="tl-line">Desk-watch conditions firing on the dollar: ${P.deskFiring(D.ds).filter(f => /dollar|USD|Treasur|real yield/i.test(f.label)).map(f => esc(f.label)).join('; ') || 'none'}.</p>` : ''}`;
  const aheadBody = (ahead.length ? ahead.map(e => `<div class="evrow"><span class="tm">${esc(ukTime(e.ms))}</span><span>${esc(e.event)}<small>${e.estimate ? 'expected ' + esc(e.estimate) : 'no consensus listed'}${e.prev ? ', previous ' + esc(e.prev) : ''}</small></span><span class="pill ${e.impact === 'high' ? 'amber' : ''}">${esc(e.impact)}</span></div>`).join('') : `<p class="note">No high or medium impact ${k} release is listed in the next five days.</p>`)
    + (k === 'USD' ? (() => { const fp = P.fedPathCard(D.fp), m = P.nextMeeting(D.fcal), nc = P.nowcastCard(D.nc); return `${m ? `<p class="tl-line">Next FOMC: ${esc(m.date)}, ${m.inDays} days away${m.sep ? ' (with projections)' : ''}.</p>` : ''}${fp ? `<p class="tl-line">The Fed path prices ${fp.hike}% odds of a higher rate by ${esc(fp.ref)}.</p>` : ''}${nc ? `<p class="tl-line">GDPNow ${nc.gdpnow ?? '?'}%; Cleveland CPI nowcast ${nc.cpi ?? '?'}% for ${esc(nc.month ?? '')}.</p>` : ''}`; })() : '');
  return `<div class="cols3">${tense('behind', 'Behind us', 'back', behindBody || loading())}${tense('now', 'Right now', 'pulse', nowBody)}${tense('ahead', 'Ahead', 'fwd', aheadBody || loading())}</div>`;
}
function drawCcy() {
  $('cstrip').innerHTML = stripHtml('c'); wireStrip('cstrip');
  const k = state.ccy, comp = composites(), row = comp[k];
  const card = buildCountryCard({ ccy: k, macro: row ? { composite: row.composite, factorsScored: row.factorsScored, factorsTotal: row.factorsTotal, factors: row.factors && Object.fromEntries(Object.entries(row.factors).map(([kk, f]) => [kk, { label: f.label, score: f.score, backedBy: f.dims, of: f.of }])) } : null,
    measured: (() => { const i = derived.str.findIndex(x => x.ccy === k); return i >= 0 ? { rank: i + 1, of: derived.str.length } : null; })(),
    boardDriver: D.msc?.driver && D.msc.driver.ranked ? { factor: D.msc.driver.label, spread: D.msc.driver.spread, thisCcyRank: D.msc.driver.ranked.findIndex(x => x.ccy === k) + 1 || null, of: D.msc.driver.ranked.length } : null,
    cb: null, board: Object.entries(comp).map(([ccy, v]) => ({ ccy, composite: v.composite })), pairs: Object.fromEntries(Object.keys(insts()).filter(n => acOf(n) === 'fx').map(n => [n, [n.slice(0, 3), n.slice(3)]])) });
  const vec = facVec(k), mv = derived.str.find(x => x.ccy === k);
  const facRows = FACT.map(([key, lab], i) => { const v = vec[i]; return barRow(lab, v, 1, v == null ? '' : sg(v)); }).join('');
  const reasons = card.drivers.map(d => `<div class="whyp"><div class="wh"><b>${esc(d.label)}</b> <span class="pill ${d.direction === 'strong' ? 'bull' : 'bear'}">${d.direction} ${sg(d.score)}</span> ${d.backing ? `<span class="fg">${esc(d.backing)}${d.thin ? ' · thin' : ''}</span>` : ''}</div><p>${esc(d.why)}</p></div>`).join('') || '<p class="note">No macro factor has enough fresh data for this currency.</p>';
  const rel = Object.keys(insts()).filter(p => acOf(p) === 'fx' && p.includes(k)), exprs = card.expressions;
  const cotKey = { EUR: 'EUR/USD', GBP: 'GBP/USD', AUD: 'AUD/USD' }[k], cd = cotKey && D.cot?.data?.[cotKey];
  const cotHtml = cd ? `<div class="cot">${[['Leveraged funds', cd.levNet, cd.levPct], ['Asset managers', cd.amNet, null]].map(r => r[2] == null ? `<div class="lab"><span>${r[0]}</span><span class="mono">${r[1] >= 0 ? 'net long' : 'net short'} ${Math.abs(r[1]).toLocaleString()} contracts</span></div>` : `<div><div class="lab"><span>${r[0]}</span><span class="mono">${r[1] >= 0 ? 'net long' : 'net short'} ${Math.abs(r[1]).toLocaleString()} · ${ord(Math.round(r[2]))} percentile</span></div><div class="pct"><i style="left:calc(${Math.max(0, Math.min(100, r[2]))}% - 2px)"></i></div></div>`).join('')}</div><p class="note" style="margin-top:8px">Positioning says who has to act if they are wrong. It does not say which way price goes.</p>` : `<p class="note">Positioning for ${k} is on its pair page (the report is keyed by pair).</p>`;
  $('ccybody').innerHTML =
   `<div class="hero"><div class="hd"><span class="fl2">${FLAG[k]}</span><div><div class="big">${k} <span style="font-weight:500;color:var(--text2);font-size:16px">${NAME[k]}</span></div>
     <div class="kick" style="margin:6px 0 0"><span class="pill ${card.thin ? '' : card.cls === 'bull' ? 'bull' : card.cls === 'bear' ? 'bear' : 'amber'}">${esc(card.word)}${card.composite != null && !card.thin ? ' ' + sg(card.composite) : ''}</span>${mv ? `<span class="pill">moved ${sg(mv.score)}% today (rank ${derived.str.findIndex(x => x.ccy === k) + 1} of ${derived.str.length})</span>` : ''}${card.coverage ? `<span class="pill">${esc(card.coverage)}${card.thinCoverage ? ' · thin' : ''}</span>` : ''}</div></div></div></div>
   ${ccyPosition(k)}
   <div class="two"><div class="card"><h2>${ic('layers')}The six reasons</h2>${radar([{ v: vec, c: 'var(--blue)' }], k + ' macro factors')}<p class="note" style="text-align:center;margin-top:4px">Dashed ring = zero. Hollow dots = no data.</p></div>
   <div class="card"><h2>${ic('chart')}Why it should be bid or offered</h2><div class="fac">${facRows}</div>
     <details class="learn"><summary>${icS('bulb')}What these mean</summary><p>Each bar is one slice of the economy scored from −1 to +1. A currency is usually preferred when rates, growth and inflation are firm, because money earns more there. This says why one currency should be favoured if the market is pricing these things. It is not a forecast: macro as a signal has tested null on this desk five times.</p></details></div></div>
   <div class="card"><h2>${ic('bulb')}The reasons, in words</h2>${reasons}${card.boardLine ? `<p class="note" style="margin-top:8px">${esc(card.boardLine)}</p>` : ''}</div>
   <div class="two"><div class="card"><h2>${ic('shield')}Who holds it</h2>${cotHtml}</div>
   <div class="card"><h2>${ic('pair')}Pairs this currency drives</h2><div class="rows">${rel.map(p => { const e = exprs.find(x => x.pair === p); return `<div class="rw"><span><b>${esc(labelOf(p))}</b><small>${e ? esc(e.line) : 'no macro gap to show'}</small></span><button class="btn" data-p="${p}">Open ${ic('pair', '')}</button></div>`; }).join('') || '<p class="note">No tracked pairs.</p>'}</div></div></div>
   <div class="shelf"><span class="pill">models: macro scorecard · measured 1-day currency moves</span><span class="pill">direction: tested null</span></div>`;
  document.querySelectorAll('#ccybody [data-p]').forEach(b => { b.onclick = () => go('pair', { pair: b.getAttribute('data-p') }); });
}

/* ── pair ── */
function pairData(k) {
  const bi = insts()[k], si = D.sess?.instruments?.[k], fi = D.fc?.instruments?.[k];
  const hlMed = bi?.levels?.hl_med?.pct ?? fi?.hl_median ?? null, used = (si?.hl != null && hlMed) ? si.hl / hlMed : null;
  return { price: bi?.current_price ?? null, dp: bi?.dp ?? 4, regime: bi?.regime, used, hlMed, hl75: bi?.levels?.hl_75?.pct ?? fi?.hl_75 ?? null, volPct: bi?.vol_pct ?? fi?.vol_pct ?? null, stale: bi?.stale };
}
function pairPosition(k, cc, d) {
  const regime = P.regimeFor(D.regime, k), cbs = P.cbTone(cbHist()), sbs = P.surpriseBars(D.es), crowd = P.crowding(D.ce, D.cs), crowdC = crowd.map(P.crowdCcy), gam = P.gammaFor(D.oi, k), card = D.gr?.cards?.[k];
  const ccs = cc ?? [], countries = cc ? cc.map(c => COUNTRY_OF[c]).filter(Boolean) : (P.COUNTRIES_FOR_INDEX[k] ?? ['US']);
  const ahead = P.aheadEvents(D.events, Date.now(), { countries, withinHours: 48 }), allFiring = P.deskFiring(D.ds, k), firing = allFiring.filter(f => f.instruments.includes(k)), globalFiring = allFiring.length - firing.length;
  const behindBody = [
    regime ? `<p class="tl-line">In the ${esc(regime.regime.toLowerCase())} regime since 2007, ${esc(labelOf(k))} has averaged <b>${sg(regime.mean)}%</b> a month, up in ${regime.posShare}% of months (${regime.n} months, typical monthly range ${regime.range}%).</p><p class="note">A base rate for the regime, not a forecast.</p>` : '<p class="note">The regime study does not cover this instrument.</p>',
    // where this market sits on the crowding map (js/cotState.js via /api/cot-state), with the ledger id it rests on
    // shifting beta: weekly, from the market review (scripts/market-review); context, not a signal
    ...(D.beta?.markets?.[k]?.line ? [`<div class="rw"><span><b>Shifting beta</b><small>${esc(D.beta.markets[k].line)} (as of ${esc(D.beta.asof)}) · <a href="market-review.html#beta" target="_blank">chart</a></small></span></div>`] : []),
    ...(D.cs?.instruments?.[k] ? [`<div class="rw"><span><b>Crowding map</b><small>${esc(D.cs.instruments[k].label)}. ${esc(D.cs.instruments[k].line)}</small></span>${D.cs.instruments[k].ev ? ledgerPill(D.cs.instruments[k].ev) : ''}</div>`] : []),
    ...(!cc && COT_SYM[k] && crowd.find(x => x.sym === COT_SYM[k]) ? [`<div class="rw"><span><b>Positioning</b><small>speculators ${CROWD_WORDS[crowd.find(x => x.sym === COT_SYM[k]).state]} (${ord(crowd.find(x => x.sym === COT_SYM[k]).pct)} percentile)</small></span>${ledgerPill('cot-positioning-factor')}</div>`] : []),
    ...ccs.map(c => { const cb = cbs.find(x => x.ccy === c), sb = sbs.find(x => x.ccy === c), cr = crowdC.find(x => x.sym === c); const bits = [cb ? `${cb.bank} tone ${sg(cb.latest)} (${cb.trend})` : null, sb ? `data surprises ${sg(sb.score)}` : null, cr ? `speculators ${CROWD_WORDS[cr.state] ?? cr.state}` : null].filter(Boolean); return bits.length ? `<div class="rw"><span><b>${FLAG[c]} ${c}</b><small>${esc(bits.join(' · '))}</small></span></div>` : ''; }),
  ].join('');
  const nowBody = [
    gam ? `<div class="rw"><span><b>Dealer gamma</b><small>${esc(gam.where ?? '')}${gam.toCall != null ? ` · call wall ${sg(gam.toCall)}% away, put wall ${sg(gam.toPut)}% away` : ''}${gam.pc != null ? ` · put/call ${gam.pc}` : ''}</small></span><span class="pill ${gam.regime === 'PIN' ? 'blue' : 'amber'}">${esc(gam.regime ?? '?')}</span></div><p class="note">PIN means dealers are long gamma and damp moves; BREAKOUT means short gamma and amplify them. What the ledger says about it is in the badges; the walls are locations, not magnets. ${ledgerPill('gex-range')}${ledgerPill('gex-range-es')}</p>` : '<p class="note">No option-OI book for this instrument.</p>',
    card ? `<p class="tl-line"><b>Range behaviour:</b> ${esc(card.behaviour?.label ?? '')}. ${esc(card.behaviour?.why ?? '')}</p><p class="tl-line">${esc(card.plan?.lines ?? '')}</p><p class="note">${esc(card.plan?.direction ?? '')}</p>` : '',
    firing.length ? `<h3>Desk Watch firing on this instrument</h3>${firing.map(f => `<div class="rw"><span>${esc(f.label)}</span>${f.evidenceId ? ledgerPill(f.evidenceId) : ''}</div>`).join('')}` : '',
    globalFiring ? `<p class="note" style="margin-top:8px">${globalFiring} market-wide condition${globalFiring > 1 ? 's are' : ' is'} also firing; they are listed on the Global page.</p>` : '',
  ].join('');
  const usd = cc?.includes('USD') || ['NQ', 'SPX500', 'US30', 'US2000', 'GOLD'].includes(k), m = usd ? P.nextMeeting(D.fcal) : null, fp = usd ? P.fedPathCard(D.fp) : null;
  const aheadBody = (ahead.length ? ahead.map(e => `<div class="evrow"><span class="tm">${esc(ukTime(e.ms))}</span><span>${e.ccy ? FLAG[e.ccy] + ' ' : ''}${esc(e.event)}<small>${e.estimate ? 'expected ' + esc(e.estimate) : 'no consensus listed'}${e.prev ? ', previous ' + esc(e.prev) : ''}</small></span><span class="pill ${e.impact === 'high' ? 'amber' : ''}">${esc(e.impact)}</span></div>`).join('') : '<p class="note">No high or medium impact release for this instrument in the next 48 hours.</p>')
    + (m ? `<p class="tl-line">Next FOMC: ${esc(m.date)}, ${m.inDays} days away.</p>` : '') + (fp ? `<p class="tl-line">The Fed path prices ${fp.hike}% odds of a higher rate by ${esc(fp.ref)}.</p>` : '')
    + `<p class="note">Scheduled releases are the one cause you can prepare for. The size of a surprise is validated for range; its direction is not. ${ledgerPill('surprise-size')}</p>`;
  return `<div class="cols3">${tense('behind', 'Behind us', 'back', behindBody || loading())}${tense('now', 'Right now', 'pulse', nowBody || loading())}${tense('ahead', 'Ahead', 'fwd', aheadBody)}</div>`;
}
function drawPair() {
  if (!insts()[state.pair]) state.pair = Object.keys(insts())[0] ?? state.pair;
  $('gchips').innerHTML = GROUPS.map(([g, l]) => `<button class="gchip" data-g="${g}" aria-pressed="${state.group === g}">${l}</button>`).join('');
  document.querySelectorAll('#gchips .gchip').forEach(b => { b.onclick = () => { state.group = b.getAttribute('data-g'); drawPair(); }; });
  const keys = Object.keys(insts()).filter(p => state.group === 'all' || acOf(p) === state.group);
  $('pstrip').innerHTML = keys.map(p => { const d = pairData(p); return `<button class="cc" data-p="${p}" aria-pressed="${state.pair === p}"><div class="fl">${glyphOf(p)}</div><div class="cd">${esc(labelOf(p))}</div><div class="mv">${d.used != null ? Math.round(d.used * 100) + '% used' : '—'}</div></button>`; }).join('');
  document.querySelectorAll('#pstrip .cc').forEach(b => { b.onclick = () => go('pair', { pair: b.getAttribute('data-p') }); });
  const k = state.pair, d = pairData(k), cc = ccysOf(k), comp = composites(), { vals, links } = derived.chain, node = NODE_FOR[k] ?? null;
  const why = buildPairWhy({ name: k, ccys: cc, csr: derived.str, composites: comp, links, used: d.used, hlMed: d.hlMed, event: null });
  const used = d.used != null ? Math.round(d.used * 100) : null, sc = 100 / 150;
  const ladder = used != null ? `<div class="rng" role="img" aria-label="${used}% of the expected range used"><div class="f" style="width:${Math.min(100, used * sc)}%"></div><div class="m" style="left:${100 * sc}%"><span>median day</span><em>100%</em></div><div class="m" style="left:${125 * sc}%"><span>wide day</span><em>125%</em></div></div>` : '<p class="note">The live session range is not available right now.</p>';
  let nodes = [];
  if (node) links.filter(l => l.verdict !== 'unmeasured' && (l.a.key === node || l.b.key === node)).forEach(l => { const o = l.a.key === node ? l.b : l.a; if (!nodes.some(n => n.name === o.label)) nodes.push({ name: o.label, text: o.text, st: l.verdict === 'holding' ? 'hold' : l.verdict === 'broken' ? 'brk' : 'qt' }); });
  if (nodes.length < 3) [['dxy', 'Dollar'], ['us2y', 'US 2Y'], ['vix', 'VIX']].forEach(([n, lab]) => { if (nodes.length < 5 && vals[n] && !nodes.some(x => x.name === lab)) nodes.push({ name: lab, text: vals[n].text ?? '', st: 'qt' }); });
  nodes = nodes.slice(0, 5);
  const cx = 170, cy = 118, colOf = s => s === 'hold' ? 'var(--bull)' : s === 'brk' ? 'var(--amber)' : 'var(--text3)'; let con = `<svg viewBox="0 0 340 236" width="100%" style="max-width:420px;margin:0 auto" role="img" aria-label="Linked markets">`;
  const posOf = i => polar(cx, cy, 92, (360 / nodes.length) * i + (nodes.length % 2 ? 0 : 18));
  nodes.forEach((n, i) => { const p = posOf(i); con += `<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="${colOf(n.st)}" stroke-width="${n.st === 'qt' ? 1.2 : 2.6}" ${n.st === 'qt' ? 'stroke-dasharray="3 4"' : ''}/>`; });
  nodes.forEach((n, i) => { const p = posOf(i); con += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="22" fill="var(--card2)" stroke="${colOf(n.st)}" stroke-width="2"/><text x="${p[0].toFixed(1)}" y="${(p[1] - 1).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="var(--text)">${esc(n.name.length > 11 ? n.name.slice(0, 10) + '…' : n.name)}</text><text x="${p[0].toFixed(1)}" y="${(p[1] + 10).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="var(--text3)" font-family="var(--mono)">${esc(String(n.text).slice(0, 9))}</text>`; });
  const label = labelOf(k); con += `<circle cx="${cx}" cy="${cy}" r="27" fill="var(--blue)"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="${label.length > 7 ? 9.5 : 11}" font-weight="700" fill="#fff" font-family="var(--disp)">${esc(label)}</text></svg>`;
  const two = cc ? `<div class="card"><h2>${ic('layers')}Two economies, side by side</h2>${radar([{ v: facVec(cc[0]), c: 'var(--blue)' }, { v: facVec(cc[1]), c: 'var(--bear)' }], cc[0] + ' against ' + cc[1])}<div class="legend" style="justify-content:center"><span><i style="background:var(--blue)"></i>${cc[0]}</span><span><i style="background:var(--bear)"></i>${cc[1]}</span></div></div>` : '';
  const reg = d.regime?.label ? `<span class="pill ${d.regime.label === 'TREND' ? 'violet' : 'blue'}">${esc(d.regime.label)}${d.regime.range_prob ? ' ' + d.regime.range_prob + '%' : ''}</span>` : '';
  $('pairbody').innerHTML =
   `<div class="hero"><div class="pairhd">${cc ? `<button class="flagbtn" data-c="${cc[0]}">${FLAG[cc[0]]} ${cc[0]}</button><span style="color:var(--text3)">${ic('pair', '')}</span><button class="flagbtn" data-c="${cc[1]}">${FLAG[cc[1]]} ${cc[1]}</button>` : `<span class="disp" style="font-size:22px;font-weight:700">${esc(label)}</span>`}
     <span class="disp" style="font-size:28px;font-weight:700;margin-left:6px">${d.price != null ? d.price.toFixed(d.dp ?? 4) : '—'}</span>${used != null ? `<span class="pill blue">${used}% of expected range</span>` : ''}${reg}${d.volPct != null ? `<span class="pill">vol ${ord(d.volPct)} pct</span>` : ''}${d.stale ? '<span class="pill amber">price stale</span>' : ''}</div></div>
   ${pairPosition(k, cc, d)}
   <div class="two"><div class="card"><h2>${ic('chart')}How much of the day is done</h2>${ladder}<p class="note">Expected range ${d.hlMed != null ? d.hlMed.toFixed(2) + '%' : '—'} (median high-to-low); a wide day ${d.hl75 != null ? d.hl75.toFixed(2) + '%' : '—'}. Calibrated: the median day uses about 100% of it.</p></div>
   <div class="card"><h2>${ic('link')}Linked markets today</h2>${con}<div class="legend"><span><i style="background:var(--bull)"></i>holding</span><span><i style="background:var(--amber)"></i>broken</span><span><i style="background:var(--text3)"></i>quiet</span></div></div></div>
   <div class="two">${two}<div class="card"><h2>${ic('bulb')}Why, in plain words</h2>${why.points.map(p => `<div class="whyp"><div class="wh"><span class="src ${p.kind === 'calendar' ? 'c' : ''}">${esc(p.kind)}</span> <b>${esc(p.title)}</b>${p.figure ? ` <span class="fg">${esc(p.figure)}</span>` : ''}</div><p>${esc(p.body)}</p></div>`).join('') || '<p class="note">No measured driver stands out for this instrument today.</p>'}
     <p class="note" style="margin-top:8px">${esc(why.foot)}</p><div class="shelf">${ledgerPill('combined-range')}${ledgerPill('intraday-range')}<span class="pill">direction: tested null</span></div></div></div>`;
  document.querySelectorAll('#pairbody [data-c]').forEach(b => { b.onclick = () => go('ccy', { ccy: b.getAttribute('data-c') }); });
}

/* ── boot, in two waves: the market bundle first so the page is useful at once, then the analysis feeds ── */
const CORE = [['/api/drill-series', 'drill', '75 market series, 5 years'], ['/api/macro-scorecard', 'msc', 'six-factor currency scorecard'], ['/api/risk-flags', 'rf', 'risk flags'], ['/api/cot', 'cot', 'CFTC positioning by pair'],
  ['/api/daily-brief', 'brief', 'prices, regimes, levels for all instruments'], ['/api/vol-forecast/session', 'sess', 'live session range'], ['/api/vol-forecast', 'fc', 'calibrated range forecast'], ['/api/calendar-feed', 'cal', 'releases printed'], ['/api/chain-extra', 'cx', 'chain chips: EM dollar and EM credit']];
const EXTRA = [['/api/global-read', 'gr', 'five axes, scenarios, per-instrument plans'], ['/api/regime', 'regime', 'macro regime and what each market did in it'], ['/api/macro-changes', 'mc', 'what changed, 1d / 5d / 20d'], ['/api/econ-surprise', 'es', 'consensus surprises by currency'],
  ['/api/cot-extremes', 'ce', 'crowding across 36 contracts'], ['/api/cot-state', 'cs', 'where each market sits on the crowding map'], ['/api/oi-today', 'oi', 'dealer gamma and option walls'], ['/api/oi-levels', 'ivl', 'options-implied day move per market'], ['/api/desk-watch', 'ds', 'watched conditions firing'], ['/api/events', 'events', 'the calendar ahead'], ['/api/fed-path', 'fp', 'market-implied Fed path'],
  ['/api/fomc/calendar', 'fcal', 'FOMC meeting dates'], ['/api/nowcast', 'nc', 'GDPNow and Cleveland nowcasts'], ['/api/fomc/history?n=6', 'hUSD', 'FOMC tone history'], ['/api/ecb/history?n=6', 'hEUR', 'ECB tone history'], ['/api/boe/history?n=6', 'hGBP', 'BoE tone history'],
  ['/api/boj/history?n=6', 'hJPY', 'BoJ tone history'], ['/api/rbnz/history?n=6', 'hNZD', 'RBNZ tone history'], ['/api/rba/history?n=6', 'hAUD', 'RBA tone history'], ['/api/boc/history?n=6', 'hCAD', 'BoC tone history'], ['/api/eod-review', 'eod', 'yesterday\'s review'], ['/api/chain-read', 'cr', 'the chain read (cached AI)'], ['/api/ai-config', 'ai', 'AI model routing'], ['analysis/output/market-review/beta_shift.json', 'beta', 'shifting betas (weekly market review)']];

/* ── the stored Intelligence brief: load it reliably, never confuse "could not load" with "none stored" ── */
const INTEL_LS = 'atlas_intel_v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(INTEL_LS) || 'null'); } catch { return null; } };
const lsPut = r => { try { localStorage.setItem(INTEL_LS, JSON.stringify(r)); } catch {} };
async function loadIntel() {
  let r = null;
  for (const wait of [0, 1500, 4000]) {   // a restart or a busy moment must not read as "no brief"
    if (wait) await new Promise(x => setTimeout(x, wait));
    r = await J('/api/morning-brief?mode=intel');
    if (r) break;
  }
  const local = lsGet();
  if (r?.ok && r.analysis) { if (!local || Date.parse(r.generatedAt) >= Date.parse(local.generatedAt ?? 0)) { lsPut(r); return r; } return { ...local, _device: true }; }
  if (local?.ok && local.analysis) return { ...local, _device: true, _why: r ? 'the server has no stored brief' : 'the server could not be reached' };
  return r ?? { ok: false, _unreachable: true };
}
const okOf = r => !(r == null || r.ok === false);
function drawSrcs() { $('srcs').innerHTML = [...CORE, ['/api/morning-brief?mode=intel', 'intel', 'stored Intelligence brief'], ...EXTRA].map(s => { const r = D[s[1]]; const pending = D[s[1]] === undefined; return `<span class="pill ${pending ? '' : okOf(r) ? '' : 'amber'}" title="${esc(s[2])}">${pending ? '…' : okOf(r) ? '✓' : '✗'} ${esc(s[0].replace('/api/', ''))}</span>`; }).join(''); }
async function main() {
  drawNav(); drawSrcs();
  const [coreRes, intelRes] = await Promise.all([Promise.all(CORE.map(s => J(s[0]))), loadIntel()]);
  coreRes.forEach((r, i) => { D[CORE[i][1]] = r; }); D.intel = intelRes;
  if (!D.drill?.ok) { $('loaderr').innerHTML = '<div class="err">The market bundle did not load (/api/drill-series). The page needs it for the chain and the currency moves. Reload to try again.</div>'; $('sub').textContent = 'data unavailable'; drawSrcs(); return; }
  derived = { chain: chainNow(), str: strengths() };
  $('sub').textContent = `${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })} · bundle to ${D.drill.to ?? D.drill.dates.at(-1)} · ${Object.keys(insts()).length} instruments`;
  drawGlobal(); drawSrcs();
  (await Promise.all(EXTRA.map(s => J(s[0])))).forEach((r, i) => { D[EXTRA[i][1]] = r; });
  D.__extra = true; drawAi(); redraw(); drawSrcs();
}
window.__atlas = { go, state, D, main, positionContext, abHtml, intelBodyHtml, nlInput, buildIssue, loadIntel, heroHtml, generateIntel };
// A brief generated on another device shows up when this tab comes back into view (no reload needed). Never while this page is generating one itself.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !D.drill || _genP) return;
  const r = await J('/api/morning-brief?mode=intel');
  if (r?.ok && r.analysis && Date.parse(r.generatedAt) > Date.parse(D.intel?.generatedAt ?? 0)) { D.intel = r; lsPut(r); drawGlobal(); }
});
main().catch(e => { $('loaderr').innerHTML = `<div class="err">Page error: ${esc(e.message)}</div>`; console.error('[atlas]', e); });
