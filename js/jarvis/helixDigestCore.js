// js/jarvis/helixDigestCore.js: the pure half of the H.E.L.I.X. WEEKLY DIGEST, the written companion to the Friday weekly recap (GET /api/helix/weekly-digest, js/jarvis/helixBroadcast.js).
// Its inputs are the weekly recap programme's own: the week's Helix day records (helix/days/<date>.json in R2, written by every broadcast run: the movers against their usual size,
// the chain's verdicts, the headline and every spoken line, including the evening's release review), the calendar (/api/events: this week's prints and the rows ahead) and the
// published list (the videos and podcast episodes of the week). No fetch, no clock: `now` and every input are passed in.
//
//   weekDates(iso)              the Monday-Friday London dates of the week holding iso (a Saturday or Sunday means the week just ended)
//   buildDigest(inp)            { week, moves, reactions, releases, chain, next, videos, headlines, missing }
//   digestText(d, link)         the plain-text digest (Telegram-safe length is the caller's business)
//   digestHtml(d, opts)         a printable page (print CSS: it saves as a PDF from the browser)
// DESCRIPTION ONLY: what moved, what printed and what followed, and what is on the calendar. Never a forecast or a trade, and no P&L.

const fin = v => v != null && v !== '' && Number.isFinite(+v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 864e5;
const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = iso => { const d = new Date(`${iso}T12:00:00Z`); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

/** The five weekdays (Mon..Fri, ISO dates) of the week that holds `iso`; Saturday and Sunday belong to the week just ended. */
export function weekDates(iso) {
  if (!ISO.test(String(iso ?? ''))) return [];
  const t = Date.parse(`${iso}T12:00:00Z`), dow = new Date(t).getUTCDay();          // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow === 6 ? 5 : dow - 1;
  const mon = t - back * DAY;
  return [0, 1, 2, 3, 4].map(i => isoOf(mon + i * DAY));
}

/** The run of a day record to read for the day's moves: the evening (the day done) first, else the weekly, else the latest morning. */
const dayRun = rec => rec?.runs?.evening ?? rec?.runs?.weekly ?? rec?.runs?.morning ?? rec?.runs?.afternoon ?? null;
const chainOf = run => { const c = run?.inputs?.chain; return c ? { holding: fin(c.holding) ? +c.holding : null, broken: fin(c.broken) ? +c.broken : null, links: (Array.isArray(c.brokenShort) ? c.brokenShort : []).map(String).filter(Boolean) } : null; };
const headText = h => (typeof h === 'string' ? h : h?.headline ?? h?.text ?? null);
const evMs = e => (fin(e?.ms) ? +e.ms : Date.parse(e?.date ?? ''));
const evName = e => String(e?.event ?? e?.title ?? e?.name ?? '').trim();
const evCcy = e => String(e?.country ?? e?.ccy ?? '').toUpperCase();
const evRank = e => (fin(e?.rank) ? +e.rank : { high: 3, medium: 2, low: 1 }[String(e?.impact ?? '').toLowerCase()] ?? 0);
// one formatter each, made once at module load (never per row: Intl.DateTimeFormat holds native memory, the Railway memory root cause of 22 Nov 2026)
const HM_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ISO_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' });
const londonHm = ms => HM_FMT.format(new Date(ms));
const londonIso = ms => ISO_FMT.format(new Date(ms));

/**
 * inp = { week: ['YYYY-MM-DD' x5], records: { date: dayRecord | null }, events: [calendar rows], items: [published { kind, part, title, url, seconds, at }], now (ms) }
 * moves:     each market's biggest day of the week against its usual size (the records' movers: oc % and vsUsual ×), the 10 largest by vsUsual
 * reactions: the evening programme's own release review lines, by day (what printed against forecast and what followed in the half hour after)
 * releases:  the week's high-impact prints with actual / forecast / previous (the calendar), oldest first
 * chain:     { days: [{ date, holding, broken }], broke: [links broken at the week's end that were not at its start], healed: [the other way], from, to }
 * next:      the high-impact rows of the following week (empty when the calendar does not reach it yet)
 */
export function buildDigest({ week = [], records = {}, events = [], items = [], now = Date.now() } = {}) {
  const dates = week.filter(d => ISO.test(d));
  if (!dates.length) return { ok: false, error: 'no week' };
  const from = dates[0], to = dates[dates.length - 1];
  const t0 = Date.parse(`${from}T00:00:00Z`) - 2 * 3600e3, t1 = Date.parse(`${to}T23:59:59Z`) + 2 * 3600e3;      // London is UTC or UTC+1: a little slack, then the London date decides
  const missing = [], headlines = [], reactions = [], best = new Map(), chainDays = [];
  for (const date of dates) {
    const rec = records?.[date] ?? null, run = dayRun(rec);
    if (!rec || !run) { missing.push(date); continue; }
    for (const part of ['morning', 'evening', 'weekly']) { const h = headText(rec.runs?.[part]?.headline); if (h) headlines.push({ date, part, text: String(h).slice(0, 200) }); }
    for (const m of run.inputs?.movers ?? []) {
      if (!m?.key || !fin(m.vsUsual)) continue;
      const x = { date, key: String(m.key), oc: fin(m.oc) ? +m.oc : null, vsUsual: +m.vsUsual };
      const prev = best.get(x.key); if (!prev || Math.abs(x.vsUsual) > Math.abs(prev.vsUsual)) best.set(x.key, x);
    }
    const ev = rec.runs?.evening;
    for (const p of ev?.plan ?? []) if ((p?.id === 'dayreview' || p?.id === 'shocktoday' || /releases/i.test(String(p?.title ?? ''))) && p.text) reactions.push({ date, text: String(p.text).replace(/\s+/g, ' ').trim().slice(0, 600) });
    const c = chainOf(rec.runs?.morning) ?? chainOf(run), ce = chainOf(run) ?? c;
    if (c || ce) chainDays.push({ date, start: c, end: ce });
  }
  const moves = [...best.values()].sort((a, b) => Math.abs(b.vsUsual) - Math.abs(a.vsUsual)).slice(0, 10);
  const first = chainDays[0]?.start, last = chainDays[chainDays.length - 1]?.end;
  const a = new Set(first?.links ?? []), b = new Set(last?.links ?? []);
  const chain = { from: chainDays[0]?.date ?? null, to: chainDays[chainDays.length - 1]?.date ?? null, days: chainDays.map(d => ({ date: d.date, holding: d.end?.holding ?? null, broken: d.end?.broken ?? null })),
    broke: [...b].filter(x => !a.has(x)), healed: [...a].filter(x => !b.has(x)), stillBroken: [...b].filter(x => a.has(x)) };
  const evs = (Array.isArray(events) ? events : []).map(e => ({ ms: evMs(e), e })).filter(x => Number.isFinite(x.ms)).sort((p, q) => p.ms - q.ms);
  const inWeek = ms => { const d = londonIso(ms); return d >= from && d <= to; };
  const releases = evs.filter(x => inWeek(x.ms) && x.ms <= now && evRank(x.e) >= 3 && x.e.actual != null && x.e.actual !== '').slice(0, 30)
    .map(({ ms, e }) => ({ date: londonIso(ms), time: londonHm(ms), ccy: evCcy(e), event: evName(e), actual: String(e.actual), forecast: e.estimate ?? e.forecast ?? null, previous: e.prev ?? e.previous ?? null }));
  const nextFrom = isoOf(Date.parse(`${to}T12:00:00Z`) + 3 * DAY), nextTo = isoOf(Date.parse(`${to}T12:00:00Z`) + 7 * DAY);
  const next = evs.filter(x => { const d = londonIso(x.ms); return d >= nextFrom && d <= nextTo && evRank(x.e) >= 3; }).slice(0, 25)
    .map(({ ms, e }) => ({ date: londonIso(ms), time: londonHm(ms), ccy: evCcy(e), event: evName(e), forecast: e.estimate ?? e.forecast ?? null }));
  const videos = (Array.isArray(items) ? items : []).filter(v => v?.url && v.at && (() => { const d = londonIso(Date.parse(v.at)); return d >= from && d <= isoOf(Date.parse(`${to}T12:00:00Z`) + 1 * DAY); })())
    .map(v => ({ kind: v.kind ?? 'video', part: v.part ?? null, title: String(v.title ?? '').slice(0, 140), url: String(v.url), seconds: fin(v.seconds) ? +v.seconds : null, at: v.at }))
    .sort((p, q) => Date.parse(p.at) - Date.parse(q.at));
  return { ok: true, week: { from, to, label: `${dayLabel(from)} to ${dayLabel(to)}` }, moves, reactions, releases, chain, next, nextWeek: { from: nextFrom, to: nextTo }, videos, headlines, missing };
}

const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '');
export const pctTxt = v => (fin(v) ? `${sgn(+v)}${Math.abs(+v) >= 10 ? Math.abs(+v).toFixed(1) : Math.abs(+v).toFixed(2)}%` : '–');
export const timesTxt = v => (fin(v) ? `${Math.abs(+v) >= 10 ? Math.round(Math.abs(+v)) : Math.abs(+v).toFixed(1)}×` : '–');
const relTxt = r => `${r.ccy ? `${r.ccy} ` : ''}${r.event}: ${r.actual}${r.forecast != null && r.forecast !== '' ? ` (forecast ${r.forecast}` : ''}${r.previous != null && r.previous !== '' ? `${r.forecast != null && r.forecast !== '' ? ', ' : ' ('}previous ${r.previous})` : r.forecast != null && r.forecast !== '' ? ')' : ''}`;

/** The digest as plain text. link = the page's address (optional). */
export function digestText(d, link = null) {
  if (!d?.ok) return 'H.E.L.I.X. weekly digest: nothing to show for that week.';
  const L = [`H.E.L.I.X. WEEKLY DIGEST · ${d.week.label}`, 'Description only. Not a forecast, not advice, not a trade.', ''];
  L.push('THE BIGGEST MOVES AGAINST THEIR USUAL SIZE');
  if (d.moves.length) for (const m of d.moves) L.push(`- ${m.key} ${pctTxt(m.oc)} on ${dayLabel(m.date)}, ${timesTxt(m.vsUsual)} its usual day`); else L.push('- No day records for this week.');
  L.push('', 'THE RELEASES');
  if (d.releases.length) for (const r of d.releases) L.push(`- ${dayLabel(r.date)} ${r.time} ${relTxt(r)}`); else L.push('- No high-impact prints on the calendar for this week.');
  if (d.reactions.length) { L.push('', 'WHAT FOLLOWED (the evening briefings)'); for (const r of d.reactions) L.push(`- ${dayLabel(r.date)}: ${r.text}`); }
  L.push('', 'THE CHAIN');
  if (d.chain.days.length) {
    L.push(`- ${d.chain.days.map(c => `${dayLabel(c.date)}: ${c.holding ?? '?'} holding, ${c.broken ?? '?'} broken`).join('; ')}`);
    L.push(`- Broke this week: ${d.chain.broke.join(', ') || 'none'}`, `- Healed this week: ${d.chain.healed.join(', ') || 'none'}`);
    if (d.chain.stillBroken.length) L.push(`- Broken all week: ${d.chain.stillBroken.join(', ')}`);
  } else L.push('- No chain readings for this week.');
  L.push('', `NEXT WEEK (${dayLabel(d.nextWeek.from)} to ${dayLabel(d.nextWeek.to)}, high impact)`);
  if (d.next.length) for (const e of d.next) L.push(`- ${dayLabel(e.date)} ${e.time} ${e.ccy} ${e.event}${e.forecast != null && e.forecast !== '' ? ` (forecast ${e.forecast})` : ''}`); else L.push('- The calendar does not list next week yet (ForexFactory publishes it over the weekend).');
  L.push('', "THIS WEEK'S PROGRAMMES");
  if (d.videos.length) for (const v of d.videos) L.push(`- ${v.title || v.part}: ${v.url}`); else L.push('- None published.');
  if (d.missing.length) L.push('', `No Helix record for: ${d.missing.map(dayLabel).join(', ')}.`);
  if (link) L.push('', `Page (prints to PDF): ${link}`);
  return L.join('\n');
}

const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//i.test(String(u ?? '')) || /^\/[^/]/.test(String(u ?? '')) ? String(u) : '#');

/** The digest as a printable HTML page. opts = { textHref (the plain-text link), prevHref, nextHref, builtAt (ms) }. */
export function digestHtml(d, { textHref = null, prevHref = null, nextHref = null, builtAt = null } = {}) {
  const e = escH;
  const css = `:root{--bg:#0b1016;--bg1:#121a23;--tx:#e6edf3;--tx2:#9fb0c0;--line:#243241;--acc:#5fb7ff;--gold:#d9a21b;--up:#3fb68b;--dn:#e5534b}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f7f8fa;--bg1:#fff;--tx:#1b2430;--tx2:#5a6878;--line:#d9dee5;--acc:#1f6fb2;--gold:#9a6b00;--up:#1d7f5c;--dn:#b3261e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 16px 60px}h1{font-size:22px;letter-spacing:.06em;margin:0 0 4px}h2{font-size:14px;letter-spacing:.14em;color:var(--acc);margin:28px 0 8px;text-transform:uppercase}
.sub{color:var(--tx2);font-size:13px}.nav{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.nav a{color:var(--tx);border:1px solid var(--line);border-radius:999px;padding:4px 12px;text-decoration:none;font-size:13px}
.nav button{font:inherit;font-size:13px;color:var(--tx);background:var(--bg1);border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--tx2);font-weight:500;font-size:12px;letter-spacing:.06em}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.up{color:var(--up)}.dn{color:var(--dn)}.gold{color:var(--gold)}ul{margin:6px 0;padding-left:20px}li{margin:4px 0}
.card{background:var(--bg1);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.foot{margin-top:36px;color:var(--tx2);font-size:12px}a{color:var(--acc)}
@media (max-width:560px){td,th{padding:5px 4px;font-size:13px}}
@media print{:root{--bg:#fff;--bg1:#fff;--tx:#000;--tx2:#444;--line:#bbb;--acc:#000;--gold:#7a5200;--up:#11643f;--dn:#9c1c16}body{font-size:11pt}.nav{display:none}main{max-width:none;padding:0}h2{break-after:avoid}tr,li,.card{break-inside:avoid}a{color:#000;text-decoration:none}a[href^="http"]::after{content:" (" attr(href) ")";font-size:9pt;color:#444}@page{margin:16mm}}`;
  if (!d?.ok) return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Helix Weekly Digest</title><style>${css}</style></head><body><main><h1>H.E.L.I.X. Weekly Digest</h1><p class="sub">Nothing to show for that week.</p></main></body></html>`;
  const tone = v => (fin(v) ? (+v > 0 ? 'up' : +v < 0 ? 'dn' : '') : '');
  const moves = d.moves.length ? `<table><thead><tr><th>MARKET</th><th>DAY</th><th class="n">MOVE</th><th class="n">AGAINST USUAL</th></tr></thead><tbody>${d.moves.map(m => `<tr><td>${e(m.key)}</td><td>${e(dayLabel(m.date))}</td><td class="n ${tone(m.oc)}">${e(pctTxt(m.oc))} ${+m.oc > 0 ? '▲' : +m.oc < 0 ? '▼' : ''}</td><td class="n${Math.abs(m.vsUsual) >= 2 ? ' gold' : ''}">${e(timesTxt(m.vsUsual))}</td></tr>`).join('')}</tbody></table><p class="sub">Each market's biggest day this week, from the briefings' own records: the open-to-close move, and that move against the market's usual day (gold at twice or more). Half of all days run bigger than the usual (median) day.</p>` : '<p class="sub">No Helix day records for this week.</p>';
  const rel = d.releases.length ? `<table><thead><tr><th>WHEN</th><th>RELEASE</th><th class="n">ACTUAL</th><th class="n">FORECAST</th><th class="n">PREVIOUS</th></tr></thead><tbody>${d.releases.map(r => `<tr><td>${e(dayLabel(r.date))} ${e(r.time)}</td><td>${e(r.ccy)} ${e(r.event)}</td><td class="n">${e(r.actual)}</td><td class="n">${e(r.forecast ?? '–')}</td><td class="n">${e(r.previous ?? '–')}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No high-impact prints on the calendar for this week (the calendar keeps the current week only).</p>';
  const react = d.reactions.length ? `<h2>What followed</h2><div class="card"><ul>${d.reactions.map(r => `<li><b>${e(dayLabel(r.date))}.</b> ${e(r.text)}</li>`).join('')}</ul><p class="sub">The evening briefings' release review: the move in the half hour after a print, which is not proof the print caused it.</p></div>` : '';
  const ch = d.chain.days.length ? `<table><thead><tr><th>DAY</th><th class="n">HOLDING</th><th class="n">BROKEN</th></tr></thead><tbody>${d.chain.days.map(c => `<tr><td>${e(dayLabel(c.date))}</td><td class="n">${e(c.holding ?? '–')}</td><td class="n">${e(c.broken ?? '–')}</td></tr>`).join('')}</tbody></table>
<ul><li><b>Broke this week:</b> ${e(d.chain.broke.join(', ') || 'none')}</li><li><b>Healed this week:</b> ${e(d.chain.healed.join(', ') || 'none')}</li>${d.chain.stillBroken.length ? `<li><b>Broken all week:</b> ${e(d.chain.stillBroken.join(', '))}</li>` : ''}</ul><p class="sub">The textbook links between markets (the macro chain) and whether each held, from the first morning to the last evening of the week. A broken link is a description of the week, not a signal.</p>` : '<p class="sub">No chain readings for this week.</p>';
  const nx = d.next.length ? `<table><thead><tr><th>WHEN (LONDON)</th><th>RELEASE</th><th class="n">FORECAST</th></tr></thead><tbody>${d.next.map(r => `<tr><td>${e(dayLabel(r.date))} ${e(r.time)}</td><td>${e(r.ccy)} ${e(r.event)}</td><td class="n">${e(r.forecast ?? '–')}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">The calendar does not list next week yet (ForexFactory publishes it over the weekend).</p>';
  const vids = d.videos.length ? `<ul>${d.videos.map(v => `<li><a href="${e(safeUrl(v.url))}" target="_blank" rel="noopener">${e(v.title || v.part || 'programme')}</a>${v.kind === 'podcast' ? ' <span class="sub">(podcast)</span>' : ''}</li>`).join('')}</ul><p class="sub">Unlisted: only people with the link can see them.</p>` : '<p class="sub">None published this week.</p>';
  const heads = d.headlines.length ? `<h2>The headlines</h2><ul>${d.headlines.map(h => `<li><b>${e(dayLabel(h.date))} ${e(h.part)}.</b> ${e(h.text)}</li>`).join('')}</ul>` : '';
  const nav = `<div class="nav">${prevHref ? `<a href="${e(prevHref)}">◀ Previous week</a>` : ''}${nextHref ? `<a href="${e(nextHref)}">Next week ▶</a>` : ''}${textHref ? `<a href="${e(textHref)}">Plain text</a>` : ''}<button type="button" onclick="window.print()">Print or save as PDF</button></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Helix Weekly Digest</title><style>${css}</style></head><body><main>
<h1>H.E.L.I.X. Weekly Digest</h1><div class="sub">${e(d.week.label)} · description only: not a forecast, not advice, not a trade</div>${nav}
<h2>The biggest moves against their usual size</h2>${moves}
<h2>The releases</h2>${rel}${react}
<h2>The chain: breaks and heals</h2>${ch}
<h2>Next week</h2>${nx}
<h2>This week's programmes</h2>${vids}${heads}
${d.missing.length ? `<p class="foot">No Helix record for ${e(d.missing.map(dayLabel).join(', '))} (no briefing ran or it was not saved).</p>` : ''}
<p class="foot">Built ${e(builtAt ? new Date(builtAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '')} from the Helix day records, the calendar and the published list. Owner only.</p>
</main></body></html>`;
}
