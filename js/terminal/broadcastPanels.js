// js/terminal/broadcastPanels.js: the WIDE broadcast's market-wide panels (owner, 25 Nov 2026: "the full brief wider in a professional setting", "my worry is always the data is
// about 1 asset, not the market-wide impacts", "bias based on the v2 engine ... then end of day how they progressed, in a candle chart view from morning to night").
// Each is a show scene (registerShowScene) whose picture is a full-screen broadcast PANEL drawn by the broadcast overlay (jarvisModBroadcast.js O.panel), over a dimmed globe:
//   tone      MARKET TONE: the live risk tape (/api/market-live), the six stress flags (/api/risk-flags), geopolitical risk (/api/gpr), the 8-currency ranking
//   wire      WHAT DROVE IT: the desk's headline wire (/api/desk-news?pack=1), each headline with the markets it touched
//   curve     THE CURVE: Treasury yields now, a week and a month ago, and the slopes against their own history (/api/rates-board)
//   biasboard THE BIAS (morning): Bias Engine V2's issued calls, only the markets with a lean (/api/bias-engine-v2), labelled unproven
//   biasday   THE BIAS AGAINST THE DAY (evening): each called market's 15-minute candles from 07:00 London, the call, its intraday changes, and how it went
// The text builders are pure (tested in broadcastPanels.test.mjs). The bias is the engine's lean, never the broadcast's own call; it is said as such.
import { registerShowScene } from './showCore.js';
import { intradayAsset } from './jarvisSessionCore.js';
import { marketName, spokenName } from './jarvisNames.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numWord = n => NUMW[n] ?? String(n);
const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const CCY = { USD: 'the US dollar', EUR: 'the euro', GBP: 'sterling', JPY: 'the yen', CHF: 'the Swiss franc', AUD: 'the Australian dollar', NZD: 'the New Zealand dollar', CAD: 'the Canadian dollar' };
const label = k => { try { return marketName(k, { short: true }) || k; } catch (e) { return k; } };
const say = k => { try { return spokenName(k) || k; } catch (e) { return k; } };
const londonHM = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const londonDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
/** A theme colour for canvas drawing, read from the page's CSS custom properties (the desk's palette rule: nothing hard-coded). */
const tc = (el, name) => { try { const cs = getComputedStyle(el); return cs.getPropertyValue(name).trim() || cs.color; } catch (e) { return 'currentColor'; } };
const ok = async p => { try { const j = await p; return j && j.ok !== false ? j : null; } catch (e) { return null; } };
const isEvening = ms => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(new Date(ms)) >= 18;

// ───────────────────────── MARKET TONE ─────────────────────────
/** { label, score, flagsOn: [{label, detail}], flagsTotal, ccy: [{ccy, score}], gpr } from the three feeds, or null. */
export function toneData(ml, flags, gpr) {
  const tape = ml?.tape; if (!tape?.label && !flags?.flags) return null;
  const on = (flags?.flags ?? []).filter(f => f?.on).map(f => ({ label: f.label, detail: f.detail ?? '' }));
  const ccy = (Array.isArray(ml?.ccy) ? ml.ccy : []).filter(c => c?.ccy && fin(c.score)).sort((a, b) => b.score - a.score);
  return { label: String(tape?.label ?? '').toLowerCase() || null, score: fin(tape?.score) ? tape.score : null, legs: tape?.legs ?? {}, flags: flags?.flags ?? [], flagsOn: on, flagsTotal: flags?.total ?? (flags?.flags ?? []).length,
    level: flags?.level ?? null, ccy, gpr: fin(gpr?.level) ? { level: gpr.level, z: gpr.z, trend: gpr.trend, asOf: gpr.asOfDate } : null };
}
export function toneText(d) {
  if (!d) return '';
  const t = [];
  t.push(d.label ? `Market tone: ${d.label === 'mixed' ? 'mixed, no clear risk direction' : d.label}.` : 'Market tone.');
  if (d.flagsTotal) t.push(d.flagsOn.length ? `${cap1(numWord(d.flagsOn.length))} of ${numWord(d.flagsTotal)} stress flags are on: ${list(d.flagsOn.slice(0, 3).map(f => f.label.toLowerCase()))}.` : `None of the ${numWord(d.flagsTotal)} stress flags is on.`);
  if (d.ccy.length >= 4) t.push(`The strongest currency today is ${CCY[d.ccy[0].ccy] ?? d.ccy[0].ccy}, the weakest ${CCY[d.ccy[d.ccy.length - 1].ccy] ?? d.ccy[d.ccy.length - 1].ccy}.`);
  return t.join(' ');
}
function toneHtml(d) {
  const sc = fin(d.score) ? Math.max(-1, Math.min(1, d.score)) : 0, tone = d.label === 'risk-off' ? 'dn' : d.label === 'risk-on' ? 'up' : 'tx';
  const mx = Math.max(0.5, ...d.ccy.map(c => Math.abs(c.score)));
  const legs = Object.entries(d.legs ?? {}).filter(([, v]) => fin(v));
  return `<div class="bp-grid bp-g3">
  <section class="bp-box bp-gauge"><h3>RISK TAPE</h3><div class="bp-big bp-${tone}">${esc((d.label ?? '—').toUpperCase())}</div>
    <div class="bp-meter"><i style="left:${((sc + 1) / 2 * 100).toFixed(1)}%"></i><span>RISK-OFF</span><span>RISK-ON</span></div>
    <div class="bp-legs">${legs.map(([k, v], i) => `<div class="bp-row" style="--i:${i}"><span>${esc(k.replace(/([A-Z])/g, ' $1').toUpperCase())}</span><b class="bp-${v > 0.05 ? 'up' : v < -0.05 ? 'dn' : 'tx'}">${v > 0 ? '+' : ''}${v.toFixed(2)}</b></div>`).join('')}</div></section>
  <section class="bp-box"><h3>STRESS FLAGS · ${d.flagsOn.length} OF ${d.flagsTotal} ON</h3>${d.flags.map((f, i) => `<div class="bp-flag ${f.on ? 'on' : ''}" style="--i:${i}"><i></i><div><b>${esc(f.label)}</b><small>${esc(f.detail ?? (f.on ? 'on' : 'off'))}</small></div></div>`).join('')}
    ${d.gpr ? `<div class="bp-foot">Geopolitical risk ${d.gpr.level.toFixed(0)} · z ${fin(d.gpr.z) ? d.gpr.z.toFixed(2) : '—'} · ${esc(d.gpr.trend ?? '')} · as of ${esc(d.gpr.asOf ?? '')}</div>` : ''}</section>
  <section class="bp-box"><h3>CURRENCY STRENGTH · TODAY</h3>${d.ccy.map((c, i) => `<div class="bp-bar" style="--i:${i}"><span>${esc(c.ccy)}</span><div class="bp-track"><i class="${c.score >= 0 ? 'up' : 'dn'}" style="${c.score >= 0 ? 'left:50%' : `left:${(50 - Math.abs(c.score) / mx * 50).toFixed(1)}%`};width:${(Math.abs(c.score) / mx * 50).toFixed(1)}%"></i></div><b class="bp-${c.score >= 0 ? 'up' : 'dn'}">${c.score > 0 ? '+' : ''}${c.score.toFixed(2)}</b></div>`).join('')}</section>
</div>`;
}

// ───────────────────────── WHAT DROVE IT ─────────────────────────
/** The top headlines: tier 1-2, the newest first within tier, from `sinceMs`. [{ t, source, title, why, impact: [[name, dir]] }] */
export function wireItems(news, sinceMs, n = 4) {
  const items = (Array.isArray(news?.items) ? news.items : []).filter(x => x?.title && (x.tier ?? 9) <= 2 && Date.parse(x.t) >= sinceMs);
  const seen = new Set(), out = [];
  for (const x of items.sort((a, b) => (a.tier - b.tier) || (Date.parse(b.t) - Date.parse(a.t)))) {
    const k = String(x.why || x.title).toLowerCase().slice(0, 40); if (seen.has(k)) continue; seen.add(k);
    out.push({ t: Date.parse(x.t), source: x.source ?? '', title: String(x.title).trim(), why: String(x.why ?? '').trim(), tier: x.tier, impact: Object.entries(x.impact ?? {}).filter(([, v]) => fin(v) && v !== 0) });
    if (out.length >= n) break;
  }
  return out;
}
export function wireText(items) {
  if (!items.length) return '';
  const whys = items.map(x => x.why || x.title).filter(Boolean).slice(0, 3).map(s => s.replace(/\s+/g, ' ').replace(/[.!?]?$/, '.'));
  return `What drove it, from the news wire. ${whys.join(' ')}`;
}
function wireHtml(items) {
  return `<div class="bp-wire">${items.map((x, i) => `<article class="bp-news" style="--i:${i}"><div class="bp-nt"><b>${londonHM(x.t)}</b><span>${esc(x.source)}</span><em>TIER ${x.tier}</em></div>
    <h4>${esc(x.title)}</h4>${x.why ? `<p>${esc(x.why)}</p>` : ''}<div class="bp-chips">${x.impact.map(([k, v]) => `<span class="bp-${v > 0 ? 'up' : 'dn'}">${esc(k)} ${v > 0 ? '▲' : '▼'}</span>`).join('')}</div></article>`).join('')}</div>
  <div class="bp-foot">Headlines are context for what moved, never a signal.</div>`;
}

// ───────────────────────── THE CURVE ─────────────────────────
export function curveText(rb) {
  const s = (rb?.slopes ?? []).find(x => x.k === '2s10s'), two = (rb?.tenors ?? []).find(x => x.k === '2y'); if (!s || !fin(s.bp)) return '';
  const old = (s.ageDays ?? 0) > 1 ? ` as of ${new Date(`${s.asOf}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}'s close` : '';
  const t = [`The Treasury curve${old}: the two-to-ten year spread is ${s.bp} basis points`];
  if (fin(s.chg5d) && s.chg5d !== 0) t[0] += `, ${s.chg5d > 0 ? 'steeper' : 'flatter'} by ${Math.abs(s.chg5d)} over the week`;
  t[0] += '.';
  if (fin(s.pct1y)) t.push(`That is the ${ordinal(s.pct1y)} percentile of the past year.`);
  if (two && fin(two.level)) t.push(`The two-year yield is ${two.level.toFixed(2)} percent${fin(two.chg5d) && two.chg5d ? `, ${two.chg5d > 0 ? 'up' : 'down'} ${Math.abs(two.chg5d)} basis points on the week` : ''}.`);
  return t.join(' ');
}
const ordinal = n => { const v = Math.round(n), s = ['th', 'st', 'nd', 'rd'], m = v % 100; return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`; };
function curveHtml(rb) {
  return `<div class="bp-grid bp-g2"><section class="bp-box"><h3>US TREASURY CURVE · NOW vs 1 WEEK vs 1 MONTH</h3><canvas class="bp-cv" data-draw="curve" width="1000" height="520"></canvas>
    <div class="bp-key"><span class="k0">NOW ${esc(rb.curve?.now?.date ?? '')}</span><span class="k1">1W ${esc(rb.curve?.w1?.date ?? '')}</span><span class="k2">1M ${esc(rb.curve?.m1?.date ?? '')}</span></div></section>
  <section class="bp-box"><h3>SLOPES vs THEIR OWN PAST YEAR</h3>${(rb.slopes ?? []).map((s, i) => `<div class="bp-slope" style="--i:${i}"><div><b>${esc(s.label ?? s.k)}</b><small>${fin(s.chg5d) ? `${s.chg5d > 0 ? '+' : ''}${s.chg5d} bp on the week` : ''}</small></div><strong>${fin(s.bp) ? `${s.bp} bp` : '—'}</strong>
    <div class="bp-pct"><i style="left:${fin(s.pct1y) ? s.pct1y : 50}%"></i></div><em>${fin(s.pct1y) ? `${ordinal(s.pct1y)} pct` : ''}</em></div>`).join('')}
    ${rb.policy ? `<div class="bp-foot">Fed funds ${rb.policy.effr}% · 2y ${rb.policy.twoYear}% · gap ${rb.policy.gapBp} bp</div>` : ''}</section></div>`;
}
function drawCurve(cv, rb) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, P = { l: 70, r: 30, t: 30, b: 50 };
  const sets = [['now', tc(cv, '--bca'), 3.5, 1], ['w1', tc(cv, '--gold'), 2, 0.85], ['m1', tc(cv, '--tx2'), 2, 0.55]].map(([k, c, w, a]) => ({ c, w, a, pts: (rb.curve?.[k]?.pts ?? []).filter(p => fin(p.v) && fin(p.y)) })).filter(s => s.pts.length >= 2);
  if (!sets.length) return;
  const all = sets.flatMap(s => s.pts), xs = all.map(p => p.y), vs = all.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), v0 = Math.min(...vs) - 0.08, v1 = Math.max(...vs) + 0.08;
  const X = y => P.l + (Math.log(y) - Math.log(x0)) / (Math.log(x1) - Math.log(x0) || 1) * (W - P.l - P.r), Y = v => P.t + (1 - (v - v0) / (v1 - v0 || 1)) * (H - P.t - P.b);
  const tx2 = tc(cv, '--tx2'); g.clearRect(0, 0, W, H); g.font = '20px ui-monospace,monospace'; g.fillStyle = tx2; g.strokeStyle = tx2; g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) { const v = v0 + (v1 - v0) * k / 4, y = Y(v); g.globalAlpha = 0.2; g.beginPath(); g.moveTo(P.l, y); g.lineTo(W - P.r, y); g.stroke(); g.globalAlpha = 0.8; g.fillText(`${v.toFixed(2)}%`, 0, y + 6); }
  for (const p of sets[0].pts) g.fillText(p.k, X(p.y) - 14, H - 14);
  for (const s of [...sets].reverse()) { g.globalAlpha = s.a; g.strokeStyle = s.c; g.lineWidth = s.w; g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(X(p.y), Y(p.v)) : g.moveTo(X(p.y), Y(p.v)))); g.stroke(); for (const p of s.pts) { g.fillStyle = s.c; g.beginPath(); g.arc(X(p.y), Y(p.v), s.w + 2, 0, 7); g.fill(); } }
  g.globalAlpha = 1; g.fillStyle = sets[0].c; for (const p of sets[0].pts) g.fillText(`${p.v.toFixed(2)}`, X(p.y) - 22, Y(p.v) - 14);
}

// ───────────────────────── THE BIAS (morning board) ─────────────────────────
const GROUP = k => (/^[A-Z]{6}$/.test(k) ? 'FX' : ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'].includes(k) ? 'INDICES' : ['GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM'].includes(k) ? 'METALS' : 'ENERGY');
/** The markets with a lean: [{ key, dir 'up'|'dn', strength, score, driver }], strongest first. */
export function biasCalls(bev2) {
  const m = bev2?.variants?.v2?.markets ?? {};
  return Object.entries(m).filter(([, x]) => x && (x.dir === 'BULLISH' || x.dir === 'BEARISH')).map(([key, x]) => {
    const dr = (Array.isArray(x.drivers) ? x.drivers : []).filter(d => fin(d.contrib) && d.contrib !== 0).sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))[0];
    return { key, dir: x.dir === 'BULLISH' ? 'up' : 'dn', strength: fin(x.strength) ? x.strength : 0, score: fin(x.score) ? x.score : 0, driver: dr?.label ?? '', group: GROUP(key) };
  }).sort((a, b) => (b.strength - a.strength) || (Math.abs(b.score) - Math.abs(a.score)));
}
export function biasText(calls, issuedAt) {
  if (!calls.length) return '';
  const up = calls.filter(c => c.dir === 'up'), dn = calls.filter(c => c.dir === 'dn');
  const names = a => list(a.slice(0, 5).map(c => say(c.key))) + (a.length > 5 ? `, and ${numWord(a.length - 5)} more` : '');
  const t = [`The bias engine. This is its lean, not a forecast we stand behind: it is unproven, and it is scored every night.`];
  if (dn.length) t.push(`It leans lower on ${names(dn)}.`);
  if (up.length) t.push(`It leans higher on ${names(up)}.`);
  t.push(`${cap1(numWord(calls.length))} markets have a lean; the rest are neutral.`);
  return t.join(' ');
}
function biasHtml(calls, issuedAt) {
  const col = (dir, title) => { const a = calls.filter(c => c.dir === dir); return `<section class="bp-box"><h3 class="bp-${dir}">${title} · ${a.length}</h3>${a.map((c, i) => `<div class="bp-call" style="--i:${i}"><span class="g">${c.group}</span><b>${esc(label(c.key))}</b><span class="pips">${Array.from({ length: 6 }, (_, k) => `<i class="${k < c.strength ? `on ${dir}` : ''}"></i>`).join('')}</span><small>${esc(c.driver)}</small></div>`).join('') || '<div class="bp-foot">none</div>'}</section>`; };
  return `<div class="bp-grid bp-g2">${col('up', '▲ LEANS HIGHER')}${col('dn', '▼ LEANS LOWER')}</div>
  <div class="bp-foot">Bias Engine V2 · issued ${issuedAt ? londonHM(Date.parse(issuedAt)) : ''} London · strength 0–6 · main driver shown · the engine's lean, unproven, scored nightly · not advice</div>`;
}

// ───────────────────────── THE BIAS AGAINST THE DAY (evening) ─────────────────────────
/** One market's day from 07:00 London: { key, dir, bars, open, last, moveU, verdict 'with'|'against'|'flat', changes: [[slot, dir]] }. u = the market's usual daily move (price units). */
export function biasDay(call, bars, u, intraMarket, fromMs) {
  const b = (bars ?? []).filter(x => x.t >= fromMs); if (b.length < 3) return null;
  const open = b[0].o, last = b[b.length - 1].c, move = last - open, moveU = fin(u) && u > 0 ? move / u : null;
  const s = call.dir === 'up' ? 1 : -1, big = moveU != null ? Math.abs(moveU) >= 0.25 : Math.abs(move / open) >= 0.001;
  const verdict = !big ? 'flat' : Math.sign(move) === s ? 'with' : 'against';
  const v2 = intraMarket?.calls?.v2 ?? [], changes = []; let prev = v2[0]?.[1];
  for (const p of v2.slice(1)) { if (p[1] !== prev) changes.push([p[0], p[1] === 'BULLISH' ? 'up' : p[1] === 'BEARISH' ? 'dn' : 'flat']); prev = p[1]; }
  return { ...call, bars: b, open, last, movePct: move / open * 100, moveU, verdict, changes };
}
export function biasDayText(days) {
  if (!days.length) return '';
  const w = days.filter(d => d.verdict === 'with'), a = days.filter(d => d.verdict === 'against'), f = days.filter(d => d.verdict === 'flat');
  const t = [`The bias engine against the day, from seven this morning. Of ${numWord(days.length)} calls, ${numWord(w.length)} went the called way, ${numWord(a.length)} went against it${f.length ? `, and ${numWord(f.length)} barely moved` : ''}.`];
  const best = [...w].sort((x, y) => Math.abs(y.moveU ?? 0) - Math.abs(x.moveU ?? 0))[0], worst = [...a].sort((x, y) => Math.abs(y.moveU ?? 0) - Math.abs(x.moveU ?? 0))[0];
  const u = d => (d.moveU != null ? `${Math.abs(d.moveU).toFixed(1)} times its usual move` : `${Math.abs(d.movePct).toFixed(2)} percent`);
  if (best) t.push(`Best: ${say(best.key)}, called ${best.dir === 'up' ? 'higher' : 'lower'}, ${best.dir === 'up' ? 'rose' : 'fell'} ${u(best)}.`);
  if (worst) t.push(`Worst: ${say(worst.key)}, called ${worst.dir === 'up' ? 'higher' : 'lower'}, ${worst.dir === 'up' ? 'fell' : 'rose'} ${u(worst)}.`);
  const flipped = days.filter(d => d.changes.length).length; if (flipped) t.push(`${cap1(numWord(flipped))} of the calls changed during the day.`);
  return t.join(' ');
}
function biasDayHtml(days) {
  const V = { with: ['✓', 'WITH THE CALL', 'up'], against: ['✗', 'AGAINST', 'dn'], flat: ['–', 'FLAT', 'tx'] };
  return `<div class="bp-mini">${days.map((d, i) => `<section class="bp-box bp-mc" style="--i:${i}"><div class="bp-mh"><b>${esc(label(d.key))}</b><span class="bp-${d.dir}">CALLED ${d.dir === 'up' ? '▲ HIGHER' : '▼ LOWER'}</span></div>
    <canvas class="bp-cv" data-draw="day" data-i="${i}" width="420" height="230"></canvas>
    <div class="bp-mv"><strong class="bp-${V[d.verdict][2]}">${V[d.verdict][0]} ${V[d.verdict][1]}</strong><span>${d.movePct >= 0 ? '+' : ''}${d.movePct.toFixed(2)}%${d.moveU != null ? ` · ${d.moveU >= 0 ? '+' : ''}${d.moveU.toFixed(1)}× usual` : ''}</span></div>
    ${d.changes.length ? `<small class="bp-ch">changed: ${d.changes.slice(0, 3).map(([s, x]) => `${esc(s)} ${x === 'up' ? '▲' : x === 'dn' ? '▼' : '–'}`).join(' · ')}</small>` : '<small class="bp-ch">held all day</small>'}</section>`).join('')}</div>
  <div class="bp-foot">15-minute candles from 07:00 London · dashed line = the 07:00 price · ✓ moved the called way by at least a quarter of its usual daily move · the engine's lean, unproven</div>`;
}
function drawDay(cv, d) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, P = 10, b = d.bars;
  const lo = Math.min(...b.map(x => x.l)), hi = Math.max(...b.map(x => x.h)), r = hi - lo || 1, cw = (W - 2 * P) / b.length;
  const Y = v => P + (1 - (v - lo) / r) * (H - 2 * P);
  g.clearRect(0, 0, W, H);
  const UP = tc(cv, '--up'), DN = tc(cv, '--dn'); g.globalAlpha = 0.5; g.strokeStyle = tc(cv, '--tx2'); g.setLineDash([6, 6]); g.beginPath(); g.moveTo(P, Y(d.open)); g.lineTo(W - P, Y(d.open)); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  b.forEach((x, i) => {
    const up = x.c >= x.o, c = up ? UP : DN, cx = P + (i + 0.5) * cw;
    g.strokeStyle = c; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, Y(x.h)); g.lineTo(cx, Y(x.l)); g.stroke();
    g.fillStyle = c; const y0 = Y(Math.max(x.o, x.c)), y1 = Y(Math.min(x.o, x.c)); g.fillRect(cx - cw * 0.34, y0, cw * 0.68, Math.max(1.2, y1 - y0));
  });
}

// ───────────────────────── scenes ─────────────────────────
const panel = (kind, kicker, title, html, draw = null) => ({ kind, kicker, title, html, draw });
const bars15 = async (api, key) => {
  const asset = intradayAsset(key); if (!asset) return null;
  const j = await ok(api.jf(`/api/cog-chart/candles?asset=${asset}&tf=15m&count=80`)); if (!Array.isArray(j?.candles)) return null;
  return j.candles.map(c => { let t = +c.t; if (t < 1e12) t *= 1000; return { t, o: +c.o, h: +c.h, l: +c.l, c: +c.c }; }).filter(x => fin(x.o) && fin(x.c)).sort((a, b) => a.t - b.t);
};
/** 07:00 London today, in ms. */
const sevenLondon = nowMs => { const d = londonDate(nowMs); for (const off of [0, -1]) { const t = Date.parse(`${d}T${String(7 + off).padStart(2, '0')}:00:00Z`); if (londonHM(t) === '07:00') return t; } return Date.parse(`${d}T07:00:00Z`); };

registerShowScene({
  id: 'tone', after: 'candles',
  async prepare(api) { const [ml, fl, gp] = await Promise.all([ok(api.jf('/api/market-live')), ok(api.jf('/api/risk-flags')), ok(api.jf('/api/gpr'))]); return toneData(ml, fl, gp); },
  build(inp, d) { const text = toneText(d); if (!d || !text) return null; return { title: 'Market tone', view: 'globe', cam: { region: 'world' }, text, figure: d.label ? { value: d.label.toUpperCase(), label: 'risk tape' } : null, panel: panel('tone', 'MARKET TONE', 'Risk, stress and currencies, across the whole market', toneHtml(d)) }; },
});
registerShowScene({
  id: 'wire', after: 'tone',
  async prepare(api) { const now = Date.now(), n = await ok(api.jf('/api/desk-news?pack=1')); return wireItems(n, isEvening(now) ? sevenLondon(now) - 3600e3 : now - 18 * 3600e3); },
  build(inp, items) { const text = wireText(items ?? []); if (!text) return null; return { title: 'What drove it', view: 'globe', cam: { region: 'world' }, text, panel: panel('wire', 'WHAT DROVE IT', 'The news wire, and the markets each story touched', wireHtml(items)) }; },
});
registerShowScene({
  id: 'curve', after: 'yields',
  async prepare(api) { return ok(api.jf('/api/rates-board')); },
  build(inp, rb) { const text = curveText(rb); if (!text) return null; const s = rb.slopes.find(x => x.k === '2s10s'); return { title: 'The Treasury curve', view: 'globe', cam: { region: 'world' }, text, figure: { value: `${s.bp} bp`, label: '2s10s' }, panel: panel('curve', 'THE CURVE', 'US Treasury yields and slopes', curveHtml(rb), el => { const cv = el.querySelector('[data-draw="curve"]'); if (cv) drawCurve(cv, rb); }) }; },
});
registerShowScene({
  id: 'biasboard', after: 'ahead',
  async prepare(api) { const b = await ok(api.jf('/api/bias-engine-v2')); return b ? { calls: biasCalls(b), issuedAt: b.issuedAt } : null; },
  build(inp, d) { const text = biasText(d?.calls ?? [], d?.issuedAt); if (!text) return null; return { title: 'The bias engine', view: 'globe', cam: { region: 'world' }, text, figure: { value: String(d.calls.length), label: 'markets with a lean' }, panel: panel('bias', 'THE BIAS', "Bias Engine V2: the engine's lean for today, unproven", biasHtml(d.calls, d.issuedAt)) }; },
});
registerShowScene({
  id: 'biasday', after: 'biasboard',
  async prepare(api) {
    const now = Date.now(), [b, it, ml] = await Promise.all([ok(api.jf('/api/bias-engine-v2')), ok(api.jf('/api/bias-engine-v2/intraday')), ok(api.jf('/api/market-live'))]); if (!b) return null;
    const calls = biasCalls(b).filter(c => intradayAsset(c.key)).slice(0, 8), from = sevenLondon(now);
    const days = await Promise.all(calls.map(async c => { try { return biasDay(c, await bars15(api, c.key), ml?.markets?.[c.key]?.u, (it?.markets ?? []).find(m => m.market === c.key), from); } catch (e) { return null; } }));
    return days.filter(Boolean);
  },
  build(inp, days) { const text = biasDayText(days ?? []); if (!text) return null; const w = days.filter(d => d.verdict === 'with').length;
    return { title: 'The bias against the day', view: 'globe', cam: { region: 'world' }, text, figure: { value: `${w} / ${days.length}`, label: 'went the called way' },
      panel: panel('biasday', 'THE BIAS · HOW IT WENT', 'Each call against its market, 07:00 to now', biasDayHtml(days), el => el.querySelectorAll('[data-draw="day"]').forEach(cv => { const d = days[+cv.dataset.i]; if (d) drawDay(cv, d); })) }; },
});

/** The panel CSS (the broadcast overlay adds it; R = the overlay's id). Sized for the wide 1920x1080 page; the phone layout scales it down. */
export const PANEL_CSS = R => `
#${R} .bc-panel{background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--bg) 78%,transparent),color-mix(in srgb,var(--bg) 94%,transparent))}
#${R} .bc-pw{position:absolute;left:clamp(16px,4vw,90px);right:clamp(16px,4vw,90px);top:clamp(50px,8vh,92px);bottom:calc(var(--l3h,110px) + 64px);display:flex;flex-direction:column;gap:14px}
#${R} .bc-pk{font:600 15px/1 var(--mono,monospace);letter-spacing:.34em;color:var(--bca)}#${R} .bc-pt{font:600 clamp(20px,2.2vw,34px)/1.15 Georgia,"Times New Roman",serif;color:var(--tx);margin-top:-4px}
#${R} .bc-pb{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}
#${R} .bp-grid{display:grid;gap:18px;flex:1;min-height:0}#${R} .bp-g3{grid-template-columns:1fr 1.2fr 1fr}#${R} .bp-g2{grid-template-columns:1fr 1fr}
#${R} .bp-box{border:1px solid color-mix(in srgb,var(--bca) 35%,transparent);border-radius:14px;padding:16px 20px;background:color-mix(in srgb,var(--bg1,var(--bg)) 70%,transparent);overflow:hidden;min-height:0}
#${R} .bp-box h3{margin:0 0 12px;font:600 14px/1 var(--mono,monospace);letter-spacing:.24em;color:var(--tx2)}
#${R} .bp-up{color:var(--up)}#${R} .bp-dn{color:var(--dn)}#${R} .bp-tx{color:var(--tx)}
#${R} .bp-big{font-weight:200;font-size:clamp(40px,4.6vw,84px);letter-spacing:.04em;margin:8px 0 18px}
#${R} .bp-meter{position:relative;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--dn),color-mix(in srgb,var(--tx2) 40%,transparent),var(--up));margin:0 0 30px;display:flex;justify-content:space-between}
#${R} .bp-meter i{position:absolute;top:-7px;width:4px;height:26px;margin-left:-2px;background:var(--tx);box-shadow:0 0 12px var(--tx)}#${R} .bp-meter span{position:relative;top:20px;font:500 12px var(--mono,monospace);letter-spacing:.18em;color:var(--tx2)}
#${R} .bp-row,#${R} .bp-bar,#${R} .bp-flag,#${R} .bp-call,#${R} .bp-slope,#${R} .bp-news,#${R} .bp-mc{opacity:0;animation:bp-in .6s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(.35s + var(--i,0) * .12s)}
@keyframes bp-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#${R} .bp-row{display:flex;justify-content:space-between;font:500 17px/2 var(--mono,monospace);color:var(--tx2);letter-spacing:.08em}
#${R} .bp-flag{display:flex;gap:14px;align-items:center;padding:7px 0;color:var(--tx2)}#${R} .bp-flag i{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,var(--tx2) 50%,transparent);flex:none}
#${R} .bp-flag.on i{background:var(--dn);border-color:var(--dn);box-shadow:0 0 14px var(--dn)}#${R} .bp-flag b{display:block;font-size:19px;color:var(--tx);font-weight:500}#${R} .bp-flag small{font-size:15px}
#${R} .bp-bar{display:grid;grid-template-columns:54px 1fr 70px;gap:12px;align-items:center;font:600 18px/2.1 var(--mono,monospace);color:var(--tx)}
#${R} .bp-track{position:relative;height:14px;background:color-mix(in srgb,var(--tx2) 12%,transparent);border-radius:7px}#${R} .bp-track i{position:absolute;top:0;bottom:0;border-radius:7px}#${R} .bp-track i.up{background:var(--up)}#${R} .bp-track i.dn{background:var(--dn)}
#${R} .bp-bar b{text-align:right;font-weight:500}
#${R} .bp-foot{font:500 14px/1.4 var(--mono,monospace);letter-spacing:.06em;color:var(--tx2);margin-top:auto;padding-top:8px}
#${R} .bp-wire{display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:1;min-height:0}
#${R} .bp-news{border:1px solid color-mix(in srgb,var(--bca) 30%,transparent);border-left:4px solid var(--bca);border-radius:12px;padding:16px 20px;background:color-mix(in srgb,var(--bg1,var(--bg)) 72%,transparent);overflow:hidden}
#${R} .bp-nt{display:flex;gap:14px;font:500 14px var(--mono,monospace);letter-spacing:.12em;color:var(--tx2)}#${R} .bp-nt b{color:var(--bca)}#${R} .bp-nt em{font-style:normal;margin-left:auto}
#${R} .bp-news h4{margin:10px 0 8px;font:600 clamp(18px,1.6vw,26px)/1.25 Georgia,serif;color:var(--tx)}#${R} .bp-news p{margin:0 0 10px;font-size:clamp(15px,1.15vw,19px);line-height:1.4;color:var(--tx2)}
#${R} .bp-chips{display:flex;gap:8px;flex-wrap:wrap}#${R} .bp-chips span{font:600 13px var(--mono,monospace);letter-spacing:.1em;padding:4px 9px;border-radius:6px;border:1px solid currentColor}
#${R} .bp-cv{width:100%;height:auto;max-height:100%;display:block}
#${R} .bp-key{display:flex;gap:22px;font:500 14px var(--mono,monospace);letter-spacing:.12em}#${R} .bp-key .k0{color:var(--bca)}#${R} .bp-key .k1{color:var(--gold)}#${R} .bp-key .k2{color:var(--tx2)}
#${R} .bp-slope{display:grid;grid-template-columns:1.3fr .8fr 1.4fr .7fr;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--tx2) 15%,transparent)}
#${R} .bp-slope b{display:block;font-size:20px;color:var(--tx);font-weight:500}#${R} .bp-slope small{color:var(--tx2);font-size:14px}#${R} .bp-slope strong{font-weight:300;font-size:32px;color:var(--tx)}#${R} .bp-slope em{font:500 14px var(--mono,monospace);color:var(--tx2);font-style:normal}
#${R} .bp-pct{position:relative;height:8px;border-radius:4px;background:linear-gradient(90deg,color-mix(in srgb,var(--tx2) 25%,transparent),color-mix(in srgb,var(--bca) 60%,transparent))}#${R} .bp-pct i{position:absolute;top:-6px;width:4px;height:20px;margin-left:-2px;background:var(--tx)}
#${R} .bp-call{display:grid;grid-template-columns:84px 170px 120px 1fr;gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid color-mix(in srgb,var(--tx2) 12%,transparent)}
#${R} .bp-call .g{font:500 12px var(--mono,monospace);letter-spacing:.16em;color:var(--tx2)}#${R} .bp-call b{font-size:20px;font-weight:500;color:var(--tx)}#${R} .bp-call small{color:var(--tx2);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${R} .pips{display:flex;gap:4px}#${R} .pips i{width:14px;height:14px;border-radius:3px;background:color-mix(in srgb,var(--tx2) 18%,transparent)}#${R} .pips i.on.up{background:var(--up)}#${R} .pips i.on.dn{background:var(--dn)}
#${R} .bp-mini{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:14px;flex:1;min-height:0}
#${R} .bp-mc{display:flex;flex-direction:column;gap:6px;padding:12px 14px}#${R} .bp-mh{display:flex;justify-content:space-between;align-items:baseline}#${R} .bp-mh b{font-size:20px;font-weight:500;color:var(--tx)}#${R} .bp-mh span{font:600 13px var(--mono,monospace);letter-spacing:.12em}
#${R} .bp-mc .bp-cv{flex:1;min-height:0;object-fit:contain}#${R} .bp-mv{display:flex;justify-content:space-between;align-items:baseline;font:500 15px var(--mono,monospace);color:var(--tx2)}#${R} .bp-mv strong{font-size:16px;letter-spacing:.1em}
#${R} .bp-ch{font:500 12px var(--mono,monospace);letter-spacing:.08em;color:var(--tx2)}
#${R}.jv-compact .bp-g3,#${R}.jv-compact .bp-g2,#${R}.jv-compact .bp-wire{grid-template-columns:1fr}#${R}.jv-compact .bp-mini{grid-template-columns:1fr 1fr}
`;
