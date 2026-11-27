// js/terminal/liveLayer.js: the Desk Terminal's live layer (owner, 2026-11-23: "a moving dashboard ... should show real-time data as the day
// progresses"). The morning views stay as they were; beside them, every card shows where its market is NOW and how the rule-based bias reads
// NOW, and both refresh in place through the day:
//   - asset cards: the move since the open in u (the day's p50 distance) and %, where price sits in the day's range, forecast lines touched,
//     a sparkline of the day (GET /api/market-live, every minute);
//   - the macro tilt through the day: the bias engine's hourly re-run (V1's logic on fresh data) against the morning issue, with the time of
//     any change of direction (GET /api/bias-engine-v2/intraday, every 5 minutes; owner only, as the route is);
//   - currency cards and a strip on the Currencies and Assets tabs: each currency's strength since the open across its pairs, ranked.
// The page leaves empty placeholders (data-lv-asset, data-lv-ccy, data-lv-strip) and calls patch() after it renders a section; this module
// fills them and refills them on every poll, without redrawing anything else (an open card and its chart stay put).
// Description only: a move since the open is not a forecast, and the tilt's back-test found no direction skill. Theme tokens only.

import * as CT from './cardTidy.js';
import { ccyStrength } from '../marketLive.js';

const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sg = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}` : '–');
const cls = v => (fin(v) ? (v > 0.05 ? 'up' : v < -0.05 ? 'dn' : '') : '');
const hhmm = iso => { const d = new Date(iso ?? ''); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : ''; };
const px = v => (fin(v) ? v.toFixed(v >= 1000 ? 1 : v >= 100 ? 2 : v >= 10 ? 3 : 5) : '–');
// the bias engine names some markets differently from the book (server.js _BEVI_ALIAS)
const ALIAS = { XAUUSD: 'GOLD', NAS100: 'NQ', NAS100USD: 'NQ', US100: 'NQ', SPX500USD: 'SPX500', US500: 'SPX500', XAGUSD: 'SILVER', WTICOUSD: 'WTI', USOIL: 'WTI', DE40: 'DE30', GER40: 'DE30' };
const DIRW = { BULLISH: ['▲', 'up', 'Bullish'], BEARISH: ['▼', 'dn', 'Bearish'], NEUTRAL: ['▬', '', 'Neutral'] };

let LIVE = null, BEI = null, liveErr = null;
// the hourly tilt's latest direction for a market (v1r), or null
const tiltDirOf = n => { const mk = (BEI?.markets ?? []).find(x => x.market === (ALIAS[n] ?? n)); return mk?.calls?.v1r?.at(-1)?.[1] ?? null; };
const MOVED = new Map();   // market -> { at, points }: the full card's "what moved", fetched once per market every 5 minutes

/** The day's path as a sparkline: the line coloured by the move, a dashed line at the open. Two points at least, '' otherwise. */
export function sparkSvg(path, open, w = 120, h = 26) {
  const v = (path ?? []).filter(fin); if (v.length < 2) return '';
  const all = fin(open) ? [...v, open] : v, lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const X = i => (i / (v.length - 1)) * (w - 4) + 2, Y = a => h - 3 - ((a - lo) / span) * (h - 6);
  const d = v.map((a, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(a).toFixed(1)}`).join(' ');
  const c = fin(open) ? (v.at(-1) >= open ? 'var(--up)' : 'var(--dn)') : 'var(--tx2)';
  return `<svg class="lv-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="today so far">${fin(open) ? `<line x1="0" x2="${w}" y1="${Y(open).toFixed(1)}" y2="${Y(open).toFixed(1)}" stroke="var(--line2)" stroke-dasharray="3 3"/>` : ''}<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${X(v.length - 1).toFixed(1)}" cy="${Y(v.at(-1)).toFixed(1)}" r="2.4" fill="${c}"/></svg>`;
}

/** An asset card's "now" block from one market of /api/market-live. */
export function assetHtml(m, at, { compact = false } = {}) {
  if (!m) return '';
  const pos = fin(m.pos) ? Math.round(m.pos * 100) : null;
  const move = fin(m.nowU) ? `<b class="${cls(m.nowU)}">${m.nowU > 0 ? '▲' : m.nowU < 0 ? '▼' : '▬'} ${sg(m.nowU)}u</b>` : `<b class="${cls(m.chgPct)}">${sg(m.chgPct, 2)}%</b>`;
  return `<div class="lv-row"><span class="lv-tag" title="Live: where this market is now against the day's open (updated ${E(hhmm(at))} London). u = the day's p50 distance, so a move reads alike across markets.">NOW</span>${move}<span class="muted mono">${fin(m.nowU) ? `${sg(m.chgPct)}% · ` : ''}${px(m.last)}</span>${sparkSvg(m.path, m.open)}</div>
<div class="lv-row lv-sub">${pos != null ? `<span class="lv-rng" title="Where price sits in today's range: ${E(px(m.lo))} to ${E(px(m.hi))}"><i style="left:${pos}%"></i></span><span class="muted">${pos}% of the day's range${fin(m.highU) && fin(m.lowU) ? ` (${sg(m.lowU)}u to ${sg(m.highU)}u)` : ''}</span>` : ''}${fin(m.spanUsed) ? `<span class="muted" title="today's range against the forecast's p50-to-p50 span">· range ${Math.round(m.spanUsed * 100)}% of the p50 span</span>` : ''}${(m.touched ?? []).length ? `<span class="lv-touch">lines hit: ${E(m.touched.join(', '))}</span>` : ''}</div>${compact ? '' : shapeHtml(m)}`;
}

const SESS = [['asia', 'Asia'], ['london', 'London'], ['ny', 'New York']];
/** The day's shape so far and each session's range, in u from the open (raw prices without a unit). */
export function shapeHtml(m) {
  if (!m?.dayType && !m?.sess) return '';
  const rng = x => (fin(x?.loU) ? `${sg(x.loU)} to ${sg(x.hiU)}u` : fin(x?.lo) ? `${px(x.lo)}–${px(x.hi)}` : '');
  const ss = SESS.filter(([k]) => m.sess?.[k]).map(([k, l]) => `${l} ${rng(m.sess[k])}`);
  const dt = m.dayType ? `<b class="${/up/.test(m.dayType) ? 'up' : /down/.test(m.dayType) ? 'dn' : ''}">${E(m.dayType === 'quiet' ? 'quiet so far' : `${m.dayType} so far`)}</b>` : '';
  return `<div class="lv-row lv-sub" title="Day type, the day forecaster's rule: a trend day is at least half its range from the open; under half a unit of range it is too early to say. Sessions by London hour: Asia 00-07, London 07-12, New York 12-21.">${dt}${ss.length ? `<span class="muted">${E(ss.join(' · '))}</span>` : ''}</div>`;
}

const DIRN = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const IDX_CCY = { NQ: 'USD', SPX500: 'USD', US30: 'USD', US2000: 'USD', DE30: 'EUR', UK100: 'GBP' };
/** The currencies a market answers to, for its events: an FX pair's two legs, an index's home currency, the dollar for commodities. */
export function ccysOf(n) {
  const m = /^([A-Z]{3})([A-Z]{3})$/.exec(String(n ?? ''));
  if (m && ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'].includes(m[1])) return [m[1], m[2]];
  return [IDX_CCY[n] ?? 'USD'];
}
/** Why the day is against the morning call, or [] : the move since the open at least 0.75u against it, or the hourly tilt now the other way. */
export function againstCall(rating, m, tiltDir) {
  const d = DIRN[rating] ?? 0; if (!d) return [];
  const out = [];
  if (fin(m?.nowU) && m.nowU * d <= -0.75) out.push(`the day is ${sg(m.nowU)}u from the open`);
  const t = tiltDir === 'BULLISH' ? 1 : tiltDir === 'BEARISH' ? -1 : 0;
  if (t && t === -d) out.push(`the macro tilt is now ${tiltDir.toLowerCase()}`);
  return out;
}
const mins = ms => { const m = Math.round(ms / 60_000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
/** The card's event line: the next medium/high event for its currencies in the next 3 hours, and today's latest print with the reaction. */
export function eventHtml(n, events, reactions, now = Date.now()) {
  const cs = ccysOf(n), out = [];
  const next = (events ?? []).map(e => ({ ...e, ms: Number(e.ms ?? Date.parse(e.time ?? e.date)) })).filter(e => cs.includes(e.country) && /high|medium/i.test(e.impact ?? '') && e.ms > now && e.ms < now + 3 * 3600e3).sort((a, b) => a.ms - b.ms)[0];
  if (next) out.push(`<span class="${/high/i.test(next.impact) ? 'lv-touch' : ''}">⏱ ${E(next.country)} ${E(next.event ?? next.title)} in ${mins(next.ms - now)}${next.estimate ?? next.forecast ? ` <span class="muted">(est ${E(next.estimate ?? next.forecast)})</span>` : ''}</span>`);
  const r = (reactions ?? []).filter(x => cs.includes(x.ccy) && now - x.ms < 6 * 3600e3).sort((a, b) => b.ms - a.ms)[0];
  if (r) out.push(`<span>⚡ ${E(r.ccy)} ${E(r.event)} ${r.actual != null ? `<b>${E(r.actual)}</b>` : ''}${r.estimate != null ? ` vs ${E(r.estimate)}` : ''}${fin(r.z) ? ` <span class="muted">(z ${sg(r.z, 1)})</span>` : ''} · ${E(r.ccy)} ${fin(r.m15) ? `<b class="${cls(r.m15)}">${sg(r.m15)}u</b> at 15m` : 'reaction at 15m pending'}${fin(r.m60) ? `, <b class="${cls(r.m60)}">${sg(r.m60)}u</b> at 60m` : ''}</span>`);
  return out.length ? `<div class="lv-row lv-sub">${out.join('')}</div>` : '';
}
/** Retail positioning since 07:00 London (OANDA position book, about every 20 minutes). */
export function retailHtml(r) {
  if (!r || !fin(r.longPct)) return '';
  return `<div class="lv-row lv-sub muted" title="OANDA clients' share of positions long. Retail positioning is context, not a signal.">retail long <b>${Math.round(r.longPct)}%</b>${fin(r.d) ? ` (${sg(r.d, 1)}pp since 07:00)` : ''} · ${E(hhmm(new Date(r.at).toISOString()))}</div>`;
}
/** The risk tape for the top bar: { text, cls, title }. backdrop: the end-of-day risk flags (/api/risk-flags). */
export function tapeChip(tape, backdrop) {
  if (!tape) return { text: 'tape –', cls: '', title: 'The live risk tape: no read yet.' };
  const L = tape.legs ?? {}, on = (backdrop?.flags ?? []).filter(f => f.on === true).map(f => f.label);
  const since = tape.since ? ` since ${hhmm(tape.since)}` : '';
  // "live tape:" so it is never read against the regime card's morning call (review 2026-11-27: "RISK-ON since 18:31" beside "RISK-OFF")
  return { text: `live tape: ${tape.label}${since}`, cls: tape.label === 'risk-on' ? 'up' : tape.label === 'risk-off' ? 'dn' : '',
    title: `Live risk tape ${sg(tape.score)}u: equities ${sg(L.equities)}u, havens JPY/CHF ${sg(L.havens)}u (counted against), AUD/NZD ${sg(L.commodityFx)}u; gold ${sg(L.gold)}u (shown, not scored). Risk-on above +0.25, risk-off below -0.25. ${(tape.history ?? []).length > 1 ? `Today: ${tape.history.map(h => `${hhmm(h.at)} ${h.label}`).join(' → ')}. ` : ''}Morning backdrop (end-of-day data): ${on.length ? on.join(', ') : 'no risk flags on'}. What the tape is doing, not a call.` };
}
/** The Overview line: which morning calls the day is against. rows: [{ n, label, why: [] }]. */
export function againstHtml(rows, total) {
  if (!total) return '';
  if (!rows.length) return `<div class="lv-row lv-sub muted lv-against"><span class="lv-tag">CALLS</span>the day is not against any of the ${total} desk calls</div>`;
  return `<div class="card lv-against"><div class="ch"><span class="lbl">Day against the call · ${rows.length} of ${total}</span><span class="r muted">a move of 0.75u or more against the morning call, or the hourly tilt turned against it</span></div><div class="drv">${rows.map(r => `<span class="click" tabindex="0" data-lv-open="${E(r.n)}" title="${E(r.why.join('; '))}">⚠ ${E(r.label)}</span>`).join('')}</div></div>`;
}
/**
 * The first block of the Overview's Today section (review 2026-11-27): the book against the tape, one row per live card. What has tested
 * well here is about RANGE (the p50/p75 day lines, release-day widening), not direction, so each row leads with how much of the day's
 * expected range is used and which lines have traded, then the morning call, the move against it, the plan state and the next release.
 * rows: [{ n, rating, size, conviction, m (a /api/market-live market), against: [], plan (html chip or ''), next ({ country, event, ms }|null) }]
 */
export function bookTapeHtml(rows, { at = null, open = true, now = Date.now() } = {}) {
  if (!rows.length) return '';
  const word = r => String(r ?? '').replace('STRONG_', 'strong ').toLowerCase();
  const used = m => (fin(m?.spanUsed) ? Math.round(m.spanUsed * 100) : null);
  const head = `<div class="ch"><span class="lbl">Book against the tape</span><span class="r muted">${open ? `live ${E(hhmm(at))} London` : 'markets closed: the last session'} · range used = today's high-to-low as a share of the expected p50 range</span></div>`;
  const tr = r => {
    const u = used(r.m), d = DIRN[r.rating] ?? 0;
    const move = fin(r.m?.nowU) ? `<b class="${cls(r.m.nowU * d)}" title="since the open, in u (the day's p50 distance); coloured by whether it is with the call">${sg(r.m.nowU)}u</b>` : '<span class="muted">–</span>';
    const hit = (r.m?.touched ?? []).slice(-2).join(', ');
    const nx = r.next ? `${E(r.next.country)} ${E(r.next.event)} <span class="muted">in ${E(r.next.ms - now >= 864e5 ? `${Math.floor((r.next.ms - now) / 864e5)}d ${Math.round(((r.next.ms - now) % 864e5) / 3600e3)}h` : mins(r.next.ms - now))}</span>` : '<span class="muted">none in 48h</span>';
    return `<tr class="click" tabindex="0" data-lv-open="${E(r.n)}"><td class="mono"><b>${E(r.n)}</b></td><td class="${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${E(word(r.rating))}${fin(r.size) ? ` <span class="muted">${E(r.size)}</span>` : ''}</td>
<td class="n mono">${move}${r.against.length ? ' <span class="chip dn" title="' + E(r.against.join('; ')) + '">against</span>' : ''}</td>
<td class="n mono"${u != null && u >= 100 ? ' style="color:var(--gold)" title="the day has already covered its expected p50 range"' : ''}>${u != null ? `${u}%` : '–'}</td>
<td class="muted" style="font-size:12px">${E(hit) || '–'}</td><td>${r.plan || '<span class="muted">–</span>'}</td><td style="font-size:12px">${nx}</td></tr>`;
  };
  return `<div class="card lv-booktape">${head}<div class="scroll"><table><thead><tr><th>Market</th><th>Morning call</th><th class="n">Since open</th><th class="n" title="today's high-to-low as a share of the expected p50 range">Range used</th><th>Lines traded</th><th>Plan</th><th>Next high-impact release</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div></div>`;
}
/** The live favourites board: one row per starred market. */
export function favsHtml(rows) {
  if (!rows.length) return '';
  return `<div class="card lv-favs"><div class="ch"><span class="lbl">★ Your markets · live</span><span class="r muted">tap a row for its card</span></div><div class="scroll"><table><tbody>${rows.map(r => `<tr class="click" tabindex="0" data-lv-open="${E(r.n)}"><td><b class="mono">${E(r.n)}</b>${r.next ? `<div class="muted" style="font-size:11px;margin-top:2px">${E(r.next)}</div>` : ''}</td><td>${r.call ? `<span class="chip ${r.dir > 0 ? 'up' : r.dir < 0 ? 'dn' : ''}">${E(r.call)}</span>` : ''}</td><td class="mono"><b class="${cls(r.m?.nowU)}">${fin(r.m?.nowU) ? `${sg(r.m.nowU)}u` : fin(r.m?.chgPct) ? `${sg(r.m.chgPct)}%` : '–'}</b></td><td class="muted">${E(r.m?.dayType ?? '')}</td><td>${r.against.length ? `<span class="chip gold" title="Against the call: ${E(r.against.join('; '))}">⚠ against</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}

/** The macro tilt through the day for one market, from the intraday timeline (v1r = V1's logic re-run on fresh data). */
export function tiltHtml(bei, name, { compact = false } = {}) {
  const key = ALIAS[name] ?? name, mk = (bei?.markets ?? []).find(x => x.market === key);
  const calls = mk?.calls?.v1r ?? []; if (!calls.length) return '';
  const first = calls[0], last = calls.at(-1), shifts = mk.shifts?.v1r ?? [];
  const one = c => { const [a, k, w] = DIRW[c[1]] ?? DIRW.NEUTRAL; return `<span class="${k}">${a} ${w} ${sg(c[2])}</span>`; };
  const pt = p => (p === 'issue' ? `issue ${hhmm(bei.issueAt)}` : p);
  const moved = last[0] !== first[0] && fin(last[2]) && fin(first[2]) ? last[2] - first[2] : null;
  return `<div class="lv-row lv-sub" title="The bias engine re-run hourly on fresh data (V1's logic). The morning issue stays the record. Back-test: no direction skill at 1, 5 or 20 days, so read it as context."><span class="lv-tag">TILT</span><span>now (${E(pt(last[0]))}) ${one(last)}</span>${!compact && last[0] !== first[0] ? `<span class="muted">· ${E(pt(first[0]))} ${one(first)}${fin(moved) ? ` · ${sg(moved)} since` : ''}</span>` : ''}${shifts.length ? `<span class="chip gold">turned ${E((DIRW[shifts.at(-1).to] ?? DIRW.NEUTRAL)[2].toLowerCase())} at ${E(shifts.at(-1).at)}</span>` : ''}</div>`;
}

/**
 * What moved the tilt between the morning issue and the latest hourly re-run, from /api/bias-engine-v2/intraday?market=X:
 * points[{point, v1r: [[driver, contrib, reading]]}]. The drivers whose contribution changed most, largest first.
 */
export function movedSince(points, n = 3) {
  const pts = (points ?? []).filter(p => Array.isArray(p?.v1r) && p.v1r.length);
  if (pts.length < 2) return [];
  const A = new Map(pts[0].v1r.map(d => [d[0], d])), B = new Map(pts.at(-1).v1r.map(d => [d[0], d]));
  return [...new Set([...A.keys(), ...B.keys()])].map(k => { const a = A.get(k)?.[1] ?? 0, b = B.get(k)?.[1] ?? 0; return { driver: k, from: a, to: b, d: b - a, now: B.get(k)?.[2] ?? null }; })
    .filter(x => Math.abs(x.d) >= 0.005).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, n);
}
export function movedHtml(points) {
  const pts = (points ?? []).filter(p => Array.isArray(p?.v1r) && p.v1r.length);
  if (pts.length < 2) return '';
  const mv = movedSince(pts), from = pts[0].point === 'issue' ? 'the morning issue' : pts[0].point, to = pts.at(-1).point;
  if (!mv.length) return `<div class="lv-row lv-sub muted"><span class="lv-tag">WHY</span>no driver of the tilt has moved since ${E(from)}</div>`;
  return `<div class="lv-row lv-sub" style="align-items:flex-start"><span class="lv-tag">WHY</span><span>what moved the tilt from ${E(from)} to ${E(to)}: ${mv.map(x => `<b>${E(x.driver)}</b> <span class="${x.d > 0 ? 'up' : 'dn'}">${sg(x.from)} → ${sg(x.to)}</span>${x.now ? ` <span class="muted">(${E(x.now)})</span>` : ''}`).join('; ')}</span></div>`;
}

/** A currency card's line: its strength since the open and its rank of 8. */
export function ccyHtml(row, at) {
  if (!row) return '';
  return `<div class="lv-row lv-sub" title="Live: the mean move since the open across this currency's pairs on the book, in u (base counts for, quote against). Updated ${E(hhmm(at))} London."><span class="lv-tag">NOW</span><b class="${cls(row.score)}">${sg(row.score)}u</b><span class="muted">today, in typical moves (u) · ${row.rank === 1 ? 'strongest' : row.rank === 8 ? 'weakest' : `${row.rank} of 8`} · ${row.pairs} pair${row.pairs === 1 ? '' : 's'}</span></div>`;
}

/** The ranked strength strip: one bar per currency, strongest first. */
export function stripHtml(rows, at) {
  if (!rows?.length) return '';
  const max = Math.max(0.25, ...rows.map(r => Math.abs(r.score)));
  return `<div class="card lv-strip"><div class="ch"><span class="lbl">Currency strength today · live</span><span class="r muted">since the open, in u across each currency's pairs · ${E(hhmm(at))} London</span></div>
<div class="lv-bars">${rows.map(r => `<div class="lv-bar" data-ccy="${E(r.ccy)}"><span class="mono">${E(r.ccy)}</span><span class="lv-track"><i class="${r.score >= 0 ? 'up' : 'dn'}" style="${r.score >= 0 ? 'left:50%' : `left:${50 - (Math.abs(r.score) / max) * 50}%`};width:${(Math.abs(r.score) / max) * 50}%"></i></span><b class="mono ${cls(r.score)}">${sg(r.score)}</b></div>`).join('')}</div>
<p class="muted" style="margin:6px 0 0;font-size:11.5px">What the day has done, not what it will do.</p></div>`;
}

/**
 * "How fresh is each part of this page": one line per speed, so nothing daily looks live. info (from the page, globalThis.deskAsOf):
 * { book: ISO the morning book finished, upd: {london|ny: ISO}, cot: 'YYYY-MM-DD' report date }. liveAt: the last live read; tiltAt: the last hourly slot.
 */
export function speedsHtml(info, liveAt, tiltAt) {
  const d = iso => { const t = new Date(iso ?? ''); return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : ''; };
  const upd = Object.entries(info?.upd ?? {}).filter(([, v]) => v).map(([k, v]) => `${k === 'ny' ? 'New York' : 'London'} update ${hhmm(v)}`);
  const rows = [
    ['LIVE', 'gold', `prices, moves since the open, the day's range, lines hit, currency strength`, liveAt ? `every minute · last ${hhmm(liveAt)}` : 'waiting for the first read'],
    ...(tiltAt ? [['HOURLY', '', 'the macro tilt (rule-based re-run)', `last ${tiltAt}`]] : []),
    ['SET TIMES', '', `the desk call and its reasoning${upd.length ? `, then ${upd.join(', ')}` : ''}`, info?.book ? `issued ${hhmm(info.book)} ${d(info.book)}` : 'no book yet'],
    ['RECORD', '', 'the live layer\'s whole day is saved at 21:05 London: Replay a day steps through any saved day', 'once a day'],
    ['DAILY / WEEKLY', '', `forecast lines (with the book), rates, central-bank pricing, macro prints as published${info?.cot ? `; COT weekly, report of ${d(info.cot)}` : '; COT weekly'}`, 'not live'],
  ];
  return `<details class="lv-speeds"><summary><span class="lv-tag">DATA</span> what is live and what is not · prices ${liveAt ? hhmm(liveAt) : '–'}${info?.book ? ` · desk call ${hhmm(info.book)}` : ''}</summary><table>${rows.map(([k, c, w, t]) => `<tr><td><span class="chip ${c}">${E(k)}</span></td><td>${E(w)}</td><td class="muted mono">${E(t)}</td></tr>`).join('')}</table><button class="btn" type="button" data-lv-replay style="margin-top:6px">▶ Replay a day</button></details>`;
}

const stripPlan = c => (c ? { ...c, plan: null, invalidation: null } : c);

// ── since you last looked (owner 2026-11-24): what changed on a market since its full view was last opened, kept in this browser ──
const SEEN_KEY = 'lvSeen';
const readSeen = () => { try { const j = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const writeSeen = o => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch { /* private window: no memory, no dot */ } };
/** What the dot compares: the call's state, the lines hit, the tilt's direction and the day type, for one market. */
export function sigOf(m, card, tiltDir) {
  return { ag: againstCall(card?.rating, m, tiltDir).length > 0, t: [...(m?.touched ?? [])].sort().join(','), tilt: tiltDir ?? null, dt: m?.dayType && m.dayType !== 'quiet' ? m.dayType : null };
}
/** The changes between two signatures, in words ([] when none). */
export function sigDiff(a, b) {
  if (!a || !b) return [];
  const out = [], was = new Set((a.t || '').split(',').filter(Boolean));
  const hit = (b.t || '').split(',').filter(x => x && !was.has(x)); if (hit.length) out.push(`${hit.join(', ')} hit`);
  if (!a.ag && b.ag) out.push('day now against the call'); if (a.ag && !b.ag) out.push('day no longer against the call');
  if (b.tilt && a.tilt && a.tilt !== b.tilt) out.push(`tilt turned ${b.tilt.toLowerCase()}`);
  if (b.dt && a.dt !== b.dt) out.push(`now ${b.dt}`);
  return out;
}
function newSinceHtml(n, m, card) {
  if (!m) return '';
  const seen = readSeen(), cur = sigOf(m, card, tiltDirOf(n)), day = LIVE?.date;
  if (!seen[n] || seen[n].day !== day) { seen[n] = { day, sig: cur }; writeSeen(seen); return ''; }   // first sight today: the baseline
  const d = sigDiff(seen[n].sig, cur);
  return d.length ? `<div class="lv-row lv-sub"><span class="chip pur" title="Changed since you last opened this market today">● new</span><span>${E(d.join(' · '))}</span></div>` : '';
}
function markSeen(n, m, card) { if (!m) return; const seen = readSeen(); seen[n] = { day: LIVE?.date, sig: sigOf(m, card, tiltDirOf(n)) }; writeSeen(seen); }

// ── replay a stored day (owner 2026-11-24): the 21:05 record, stepped through in 15-minute steps ──
/** Each market's move at time t from a stored day's paths (the last 15-minute close at or before t), and the currency strength then. */
export function replayAt(day, t) {
  const mk = {};
  for (const [n, m] of Object.entries(day?.markets ?? {})) {
    const T = m.pathT ?? [], P = m.path ?? []; let v = null;
    for (let i = 0; i < T.length; i++) { if (T[i] <= t) v = P[i]; else break; }
    if (!fin(v) || !fin(m.open)) continue;
    mk[n] = { nowU: fin(m.u) && m.u > 0 ? Math.round(((v - m.open) / m.u) * 100) / 100 : null, chgPct: Math.round(((v - m.open) / m.open) * 100000) / 1000, last: v };
  }
  return { markets: mk, ccy: ccyStrength(mk) };
}
export function replayTimes(day) { const s = new Set(); for (const m of Object.values(day?.markets ?? {})) for (const t of m.pathT ?? []) s.add(t); return [...s].sort((a, b) => a - b); }
function replayFrameHtml(day, t) {
  const r = replayAt(day, t), movers = Object.entries(r.markets).filter(([, m]) => fin(m.nowU)).sort((a, b) => Math.abs(b[1].nowU) - Math.abs(a[1].nowU)).slice(0, 10);
  const tape = (day.tape?.history ?? []).filter(h => Date.parse(h.at) <= t).at(-1);
  const prints = (day.reactions ?? []).filter(x => x.ms <= t).slice(0, 5);
  return `<p style="margin:6px 0"><b class="mono">${hhmm(new Date(t).toISOString())}</b> London${tape ? ` · tape <b class="${tape.label === 'risk-on' ? 'up' : tape.label === 'risk-off' ? 'dn' : ''}">${E(tape.label)}</b>` : ''}</p>${stripHtml(r.ccy, new Date(t).toISOString())}
<div class="lbl" style="margin-top:8px">Biggest moves so far</div><div class="drv">${movers.map(([n, m]) => `<span>${E(n)} <b class="${cls(m.nowU)}">${sg(m.nowU)}u</b></span>`).join('') || '<span class="muted">none yet</span>'}</div>
${prints.length ? `<div class="lbl" style="margin-top:8px">Prints so far</div><div class="drv">${prints.map(p => `<span>${E(p.ccy)} ${E(p.event)}${fin(p.m15) ? ` <b class="${cls(p.m15)}">${sg(p.m15)}u</b> at 15m` : ''}</span>`).join('')}</div>` : ''}`;
}
async function openReplay(date) {
  const prevWeekday = () => { const d = new Date(); do { d.setUTCDate(d.getUTCDate() - 1); } while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); };
  const day0 = date || prevWeekday();
  globalThis.openModal?.(`<div class="ch"><span class="lbl">Replay a day · the live layer's record</span><span class="r"><button class="x" aria-label="Close">✕</button></span></div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><input type="date" id="lvrp-d" value="${E(day0)}" max="${new Date().toISOString().slice(0, 10)}"><button class="btn" type="button" id="lvrp-go">Load</button><span class="muted" id="lvrp-msg"></span></div>
<input type="range" id="lvrp-t" min="0" max="0" value="0" style="width:100%" aria-label="time of day" disabled><div id="lvrp-f"><p class="muted">Pick a day. A record is written at 21:05 London on each day the live layer ran.</p></div>`);
  const $ = id => document.getElementById(id), load = async () => {
    const d = $('lvrp-d')?.value; if (!d) return;
    $('lvrp-msg').textContent = 'Loading…';
    const day = await get(`/api/market-live?date=${encodeURIComponent(d)}`);
    if (!day?.ok || !day.markets) { $('lvrp-msg').textContent = day?.error ?? 'No record for that day.'; $('lvrp-t').disabled = true; $('lvrp-f').innerHTML = ''; return; }
    const ts = replayTimes(day); $('lvrp-msg').textContent = `${Object.keys(day.markets).length} markets · ${ts.length} steps`;
    const sl = $('lvrp-t'); sl.disabled = !ts.length; sl.max = String(Math.max(0, ts.length - 1)); sl.value = sl.max;
    const draw = () => { const t = ts[Number(sl.value)]; if (t != null) $('lvrp-f').innerHTML = replayFrameHtml(day, t); };
    sl.oninput = draw; draw();
  };
  $('lvrp-go').onclick = load;
  load();
}

// ── the price tape (owner 2026-11-24: "a Bloomberg-style feed"): every market the live layer prices, in a fixed order, updated in place ──
const TAPE_FIRST = ['SPX500', 'NQ', 'US30', 'DE30', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
/** The tape's order: the indices, gold and the majors first, then everything else alphabetically. */
export function tapeOrder(names) { const set = new Set(names); return [...TAPE_FIRST.filter(n => set.has(n)), ...names.filter(n => !TAPE_FIRST.includes(n)).sort()]; }
/** One market's text on the tape: { v, c, cls, u }. */
export function tapeBits(m) {
  const c = fin(m?.chgPct) ? m.chgPct : null;
  return { v: px(m?.last), c: c == null ? '–' : `${c > 0 ? '▲' : c < 0 ? '▼' : '▬'}${Math.abs(c).toFixed(2)}%`, cls: c > 0 ? 'up' : c < 0 ? 'dn' : '', u: fin(m?.nowU) ? `${sg(m.nowU)}u` : '' };
}
function patchTape(doc) {
  const el = doc.getElementById('pk'); if (!el || !LIVE?.markets) return;
  const names = tapeOrder(Object.keys(LIVE.markets)), key = names.join(',');
  if (el.dataset.key !== key) {   // the set of markets changed: build it (twice, so the scroll loops), then fill in place from here on
    const one = names.map(n => `<span data-pt="${E(n)}"><span class="s">${E(n)}</span> <span class="v"></span> <span class="c"></span> <span class="u"></span></span>`).join('');
    el.innerHTML = one + one; el.dataset.key = key;
  }
  for (const n of names) {
    const b = tapeBits(LIVE.markets[n]);
    for (const sp of el.querySelectorAll(`[data-pt="${globalThis.CSS?.escape ? globalThis.CSS.escape(n) : n}"]`)) {
      sp.querySelector('.v').textContent = b.v; const c = sp.querySelector('.c'); c.textContent = b.c; c.className = `c ${b.cls}`; sp.querySelector('.u').textContent = b.u;
    }
  }
}
// the Pair page's pinned strip sits just under the sticky top bar, whatever height the bar has on this screen
function topOffset(doc) { const t = doc.querySelector('header.top, .top'); if (t) doc.documentElement.style.setProperty('--top-h', `${Math.round(t.getBoundingClientRect().height)}px`); }

/** Fill every placeholder on the page from the latest reads. */
export function patch(doc = document) {
  try { patchTape(doc); topOffset(doc); } catch (e) { console.warn('price tape', e); }
  const mk = LIVE?.markets ?? {}, at = LIVE?.at, ccy = Object.fromEntries((LIVE?.ccy ?? []).map(r => [r.ccy, r]));
  const set = (el, h) => { el.dataset.lvDone = '1'; if (el.innerHTML !== h) el.innerHTML = h; };
  const plansOn = () => globalThis.deskSurfaceOn?.('panel.asset.plan') ?? true;   // the plan's prices are a trade surface: off for the desk login unless switched on
  doc.querySelectorAll('[data-lv-asset]').forEach(el => {
    const n = el.dataset.lvAsset, full = el.hasAttribute('data-lv-full') || !!el.closest('#modal'), card = globalThis.deskCardOf?.(n), t = tiltHtml(BEI, n), ag = againstCall(card?.rating, mk[n], tiltDirOf(n));
    const agRow = ag.length ? `<div class="lv-row lv-sub"><span class="chip gold" title="${E(ag.join('; '))}">⚠ day against the call</span>${full ? `<span class="muted">${E(ag.join('; '))}</span>` : ''}</div>` : '';
    if (full) {
      // the full view's strip and then-and-now already say whether the day is against the call: the live block starts at the move
      set(el, (el.closest('#modal') ? agRow : '') + assetHtml(mk[n], at) + eventHtml(n, globalThis.deskEvents?.(), LIVE?.reactions) + retailHtml(LIVE?.retail?.[n]) + t + (t ? movedHtml(MOVED.get(n)?.points) : ''));
      if (t) loadMoved(n);
      markSeen(n, mk[n], card);
    } else {
      // the grid card stays short: what changed since you looked, the call's state, the move, the next event and the tilt in one line each
      set(el, newSinceHtml(n, mk[n], card) + agRow + assetHtml(mk[n], at, { compact: true }) + eventHtml(n, globalThis.deskEvents?.(), []) + tiltHtml(BEI, n, { compact: true }));
    }
  });
  // the Pair page: the pinned strip, then and now, and the level ladder
  doc.querySelectorAll('[data-lv-pstrip]').forEach(el => {
    const n = el.dataset.lvPstrip, card = globalThis.deskCardOf?.(n), m = mk[n];
    const nx = eventHtml(n, globalThis.deskEvents?.(), []).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    set(el, CT.statusStripHtml({ card, m, against: againstCall(card?.rating, m, tiltDirOf(n)), planChip: plansOn() ? (globalThis.twChip?.(n) ?? '') : '', nextEvent: nx, tape: LIVE?.tape }));
  });
  doc.querySelectorAll('[data-lv-thennow]').forEach(el => {
    const n = el.dataset.lvThennow, card = globalThis.deskCardOf?.(n), m = mk[n], c = plansOn() ? card : stripPlan(card);
    const sh = (BEI?.markets ?? []).find(x => x.market === (ALIAS[n] ?? n))?.shifts?.v1r?.at(-1);
    set(el, CT.thenNowHtml({ card: c, m, against: againstCall(card?.rating, m, tiltDirOf(n)), tilt: sh ? { turned: `${String(sh.to).toLowerCase()} at ${sh.at}` } : null, tape: LIVE?.tape, rows: CT.mergedLevels(c, m) }));
  });
  doc.querySelectorAll('[data-lv-ladder]').forEach(el => {
    const n = el.dataset.lvLadder, card = globalThis.deskCardOf?.(n), m = mk[n], c = plansOn() ? card : stripPlan(card);
    if (!card && !m) return;
    set(el, CT.ladderHtml(CT.mergedLevels(c, m), m));
  });
  doc.querySelectorAll('[data-lv-ccy]').forEach(el => set(el, ccyHtml(ccy[el.dataset.lvCcy], at)));
  doc.querySelectorAll('[data-lv-strip]').forEach(el => set(el, stripHtml(LIVE?.ccy, at)));
  const tiltAt = Object.keys(BEI?.slotTimes ?? {}).sort().at(-1) ?? null;
  doc.querySelectorAll('[data-lv-speeds]').forEach(el => { const open = el.querySelector('details')?.open; set(el, speedsHtml(globalThis.deskAsOf?.() ?? null, at, tiltAt)); if (open) el.querySelector('details')?.setAttribute('open', ''); });
  // the ladder's price marker: the live price for every card (the trade watcher only prices the cards it watches)
  doc.querySelectorAll('[data-twpx]').forEach(el => {
    const lad = el.closest('.ladder'), lo = +lad?.dataset.lo, hi = +lad?.dataset.hi, v = mk[el.dataset.twpx]?.last;
    if (!fin(v) || !(hi > lo)) return;   // no live price here: leave whatever the trade watcher drew
    el.hidden = false; el.style.left = `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`; el.title = `live ${px(v)}`;
  });
  const tc = doc.getElementById('lvtape');
  if (tc) { const c = tapeChip(LIVE?.tape, globalThis.deskRiskFlags?.()); tc.textContent = c.text; tc.className = `chip ${c.cls}`; tc.title = c.title; }
  const cards = globalThis.deskCardsAll?.() ?? {}, called = Object.entries(cards).filter(([, c]) => DIRN[c?.rating]);
  const agRows = called.map(([n, c]) => ({ n, label: `${n} ${c.rating.replace('STRONG_', 'strong ').toLowerCase()}`, why: againstCall(c.rating, mk[n], tiltDirOf(n)) })).filter(r => r.why.length);
  doc.querySelectorAll('[data-lv-against]').forEach(el => set(el, LIVE ? againstHtml(agRows, called.length) : ''));
  if (doc.querySelector('[data-lv-booktape]')) {
    const evs = (globalThis.deskEvents?.() ?? []).map(e => ({ ...e, ms: Number(e.ms ?? Date.parse(e.time ?? e.date)) })).filter(e => /high/i.test(e.impact ?? '') && e.ms > Date.now() && e.ms < Date.now() + 48 * 3600e3).sort((a, b) => a.ms - b.ms);
    const bt = called.filter(([, c]) => +c.size > 0).sort((a, b) => +b[1].size - +a[1].size).map(([n, c]) => ({ n, rating: c.rating, size: c.size, m: mk[n], against: againstCall(c.rating, mk[n], tiltDirOf(n)),
      plan: plansOn() ? (globalThis.twChip?.(n) ?? '') : '', next: evs.find(e => ccysOf(n).includes(e.country) || (e.country === 'EU' && ccysOf(n).includes('EUR'))) ?? null }));
    doc.querySelectorAll('[data-lv-booktape]').forEach(el => set(el, bookTapeHtml(bt, { at, open: !!LIVE?.open })));
  }
  const favs = (globalThis.assetFav?.fav?.list?.() ?? []).filter(n => cards[n] || mk[n]).map(n => { const c = cards[n], ev = eventHtml(n, globalThis.deskEvents?.(), []); return { n, call: c?.rating, dir: DIRN[c?.rating] ?? 0, m: mk[n], against: againstCall(c?.rating, mk[n], tiltDirOf(n)), next: ev ? ev.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '' }; });
  doc.querySelectorAll('[data-lv-favs]').forEach(el => set(el, favsHtml(favs)));
  const chip = doc.getElementById('lvstamp');
  if (chip) { chip.textContent = at ? `live ${hhmm(at)}` : 'live –'; chip.title = liveErr ? `Live layer: ${liveErr}` : `Prices refreshed every minute; the macro tilt hourly. Last price update ${hhmm(at)} London.`; }
}

const may = u => { const A = globalThis.deskAccessState; return !A || A.role !== 'viewer' || A.mayCall('GET', u); };
const get = u => (may(u) ? fetch(u, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
async function pollLive() { const j = await get('/api/market-live'); if (j?.ok) { LIVE = j; liveErr = null; } else if (j) liveErr = j.error ?? 'no data'; patch(); dispatchEvent(new CustomEvent('marketlive', { detail: LIVE })); }
async function loadMoved(n) {
  const c = MOVED.get(n); if (c && (c.busy || Date.now() - c.at < 5 * 60_000)) return;
  MOVED.set(n, { ...(c ?? {}), at: Date.now(), busy: true });
  const j = await get(`/api/bias-engine-v2/intraday?market=${encodeURIComponent(n)}`);
  MOVED.set(n, { at: Date.now(), busy: false, points: j?.ok ? j.points : (c?.points ?? null) });
  if (j?.ok) patch();
}
async function pollTilt() { const j = await get('/api/bias-engine-v2/intraday'); if (j?.ok) BEI = j; patch(); }

const CSS = `.lv{margin-top:8px;display:flex;flex-direction:column;gap:4px}
.lv:empty{display:none}
.lv-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}
.lv-row b.up,.lv-row .up{color:var(--up)} .lv-row b.dn,.lv-row .dn{color:var(--dn)}
.lv-sub{font-size:11.5px}
.lv-tag{font:600 9.5px var(--mono);letter-spacing:.1em;color:var(--gold);border:1px solid rgba(var(--goldrgb),.45);border-radius:4px;padding:1px 5px}
.lv-spark{margin-left:auto;flex:none}
.lv-rng{position:relative;display:inline-block;width:70px;height:6px;border-radius:4px;background:linear-gradient(90deg,var(--dnbg),var(--bg3),var(--upbg))}
.lv-rng i{position:absolute;top:-3px;width:3px;height:12px;margin-left:-1px;border-radius:2px;background:var(--tx)}
.lv-touch{color:var(--gold)}
.lv-strip{margin-bottom:10px}
.lv-against,.lv-favs{margin-bottom:14px}
.lv-against .drv span.click{cursor:pointer}
.lv-favs td{padding:6px 8px 6px 0;font-size:12.5px}
.lv-speeds{margin:0 0 14px;font-size:12px}
.lv-speeds summary{cursor:pointer;color:var(--tx2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lv-speeds table{margin-top:6px;border-collapse:collapse;width:100%}
.lv-speeds td{padding:4px 8px 4px 0;vertical-align:top}
.lv-bars{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 16px;margin-top:6px}
.lv-bar{display:grid;grid-template-columns:34px 1fr 46px;align-items:center;gap:8px;font-size:12px}
.lv-track{position:relative;height:8px;border-radius:4px;background:var(--bg3)}
.lv-track::after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}
.lv-track i{position:absolute;top:0;bottom:0;border-radius:4px}
.lv-track i.up{background:var(--up)} .lv-track i.dn{background:var(--dn)}
.lv-bar b{text-align:right}`;

if (typeof document !== 'undefined') {
  const st = document.createElement('style'); st.id = 'liveLayerCss'; st.textContent = CSS + '\n' + CT.CSS; document.head.appendChild(st);
  globalThis.liveLayer = { patch, last: n => LIVE?.markets?.[n]?.last ?? null, ccy: () => LIVE?.ccy ?? null, at: () => LIVE?.at ?? null, move: n => LIVE?.markets?.[n] ?? null };
  const start = () => { pollLive(); pollTilt(); setInterval(() => { if (!document.hidden) pollLive(); }, 60_000); setInterval(() => { if (!document.hidden) pollTilt(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollLive(); }); };
  // a section re-render leaves fresh, empty placeholders: fill them at once from the last reads (patch marks what it filled, so this never loops)
  let queued = false;
  new MutationObserver(() => { if (queued || !(LIVE || BEI) || !document.querySelector('[data-lv-asset]:not([data-lv-done]),[data-lv-ccy]:not([data-lv-done]),[data-lv-strip]:not([data-lv-done]),[data-lv-speeds]:not([data-lv-done]),[data-lv-against]:not([data-lv-done]),[data-lv-booktape]:not([data-lv-done]),[data-lv-favs]:not([data-lv-done]),[data-lv-pstrip]:not([data-lv-done]),[data-lv-thennow]:not([data-lv-done]),[data-lv-ladder]:not([data-lv-done])')) return;
    queued = true; requestAnimationFrame(() => { queued = false; patch(); }); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', e => { const el = e.target.closest?.('[data-lv-open]'); if (el) globalThis.openAsset?.(el.dataset.lvOpen); if (e.target.closest?.('[data-lv-replay]')) openReplay(); });
  document.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const el = e.target.closest?.('[data-lv-open]'); if (el) globalThis.openAsset?.(el.dataset.lvOpen); });
  addEventListener('resize', () => topOffset(document));
  if (globalThis.deskAccessState) start(); else addEventListener('deskaccess', start, { once: true });
}
