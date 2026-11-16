/**
 * The Evening edition's look-back pieces (owner, 2026-11-16): how the day unfolded as a picture, the morning's calls
 * against what the day did, and what tomorrow's calendar means for today's move. All rule-built from stored data (the
 * day's M1 bars, the morning book, the thesis-vs-reality record, the calendar): no model call, nothing invented.
 *
 *   dayPaths      every market's cumulative move in u at each 15 minutes of the 08:00-21:00 London window, and the book's
 *   dayShapeSvg   the six biggest movers and the book through the day, the busiest half hours shaded, releases ticked
 *   sessionHeatSvg markets x hour, shaded by the move in u that hour, London and New York bands
 *   morningVsDay  "this morning the desk said" beside "what the day did", right or wrong per call
 *   tomorrowBlock the next day's high-impact releases with the usual effect and what today's move means for them
 *
 * Pure. Tested in js/eveningDay.test.mjs.
 */
import { londonMs, windowFor, unitOf, cardDir } from './deskScore.js';
import { londonHM, buildTimeline } from './eveningTimeline.js';
import { instName } from './newsletterDesk.js';

const sg = (x, dp = 2) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(dp)}`;
const ESC = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (x, c = 3) => Math.max(-c, Math.min(c, x));
const short = n => (/^[A-Z]{6}$/.test(n) ? `${n.slice(0, 3)}/${n.slice(3)}` : instName ? instName(n) : n);

/** Cumulative move in u from the 08:00 open at every `stepMin` minutes to 21:00 London, per market that has forecast levels. */
export function dayPaths(barsByInst, cards, date, { stepMin = 15 } = {}) {
  const { entryMs, exitMs } = windowFor(date), out = {}, steps = Math.round((exitMs - entryMs) / (stepMin * 60_000));
  for (const [n, bars] of Object.entries(barsByInst ?? {})) {
    const u = unitOf(cards?.[n]?.levels); if (!u) continue;
    const w = (bars ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs); if (w.length < 10) continue;
    const o = w[0].open, pts = []; let j = 0;
    for (let k = 0; k <= steps; k++) {
      const t = entryMs + k * stepMin * 60_000;
      while (j < w.length - 1 && w[j + 1].time * 1000 <= t) j++;
      if (w[j].time * 1000 > t && k > 0) break;
      pts.push({ t, v: +(((k === 0 ? o : w[j].close) - o) / u).toFixed(3) });
    }
    if (pts.length > 2) out[n] = { u, pts, final: pts.at(-1).v };
  }
  return out;
}

/** The book through the day: the size-weighted mean of direction x move (clipped at +-3 as the score is) over the live sized cards. Its last point is the day score. */
export function bookPath(paths, cards) {
  const live = Object.entries(cards ?? {}).filter(([n, c]) => paths[n] && cardDir(c?.rating) && Number.isFinite(c?.size) && c.size > 0);
  if (!live.length) return null;
  const W = live.reduce((s, [, c]) => s + c.size, 0), len = Math.min(...live.map(([n]) => paths[n].pts.length));
  return Array.from({ length: len }, (_, k) => ({ t: paths[live[0][0]].pts[k].t, v: +(live.reduce((s, [n, c]) => s + c.size * clip(cardDir(c.rating) * paths[n].pts[k].v), 0) / W).toFixed(3) }));
}

const PALETTE = ['#b4232f', '#0b5cab', '#0b7a55', '#d98a00', '#6b3fa0', '#e0457b'];
const textW = (s, px) => String(s).length * px * 0.58;
const overlap = (a, b) => !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);

/**
 * The day shape: the six biggest movers (by the size of the day's move in u) and the book, cumulative in u, 08:00-21:00 London.
 * clusters (from js/eveningTimeline.js) are shaded and lettered; beats are ticked along the bottom axis (prints and gaps labelled).
 * Returns { svg, boxes, legend } - boxes are every text label's box so a test can prove none overlap.
 */
export function dayShapeSvg(paths, { book = null, clusters = [], beats = [], date, width = 680, height = 300, top = 6 } = {}) {
  const names = Object.keys(paths ?? {}).sort((a, b) => Math.abs(paths[b].final) - Math.abs(paths[a].final)).slice(0, top);
  if (!names.length) return { svg: '', boxes: [], legend: [] };
  const { entryMs, exitMs } = windowFor(date), L = 38, R = 96, T = 14, B = 54, W = width - L - R, Hh = height - T - B;
  const all = [...names.flatMap(n => paths[n].pts.map(p => p.v)), ...(book ?? []).map(p => p.v), 0];
  const lo = Math.floor(Math.min(...all) - 0.15), hi = Math.ceil(Math.max(...all) + 0.15);
  const X = t => L + ((t - entryMs) / (exitMs - entryMs)) * W, Y = v => T + (1 - (v - lo) / (hi - lo)) * Hh, boxes = [], legend = [];
  const line = (pts, col, wd, dash) => `<polyline fill="none" stroke="${col}" stroke-width="${wd}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}"/>`;
  let s = `<svg class="evd-svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="How the day unfolded: the six biggest movers and the book, cumulative move in u from 08:00 to 21:00 London"><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>`;
  // shaded busiest half hours, lettered
  clusters.forEach((c, i) => {
    const x1 = X(Math.max(c.fromMs, entryMs)), x2 = X(Math.min(c.toMs, exitMs)), ch = String.fromCharCode(65 + i);
    s += `<rect x="${x1.toFixed(1)}" y="${T}" width="${Math.max(3, x2 - x1).toFixed(1)}" height="${Hh}" fill="#d98a00" opacity=".13"/><text x="${(x1 + 2).toFixed(1)}" y="${T + 9}" font-size="9" font-family="monospace" font-weight="700" fill="#8a5a00">${ch}</text>`;
    boxes.push({ x1: x1 + 2, y1: T, x2: x1 + 2 + 7, y2: T + 10, id: `burst-${ch}` }); legend.push({ ch, hm: c.hm, label: c.label });
  });
  // grid: u ticks and hour ticks
  for (let v = lo; v <= hi; v++) { const y = Y(v); s += `<line x1="${L}" x2="${L + W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${v === 0 ? '#7a8aa0' : '#e6ecf5'}" stroke-width="${v === 0 ? 1.2 : 1}"/><text x="${L - 5}" y="${(y + 3).toFixed(1)}" font-size="9" font-family="monospace" text-anchor="end" fill="#5b6b82">${v > 0 ? '+' : ''}${v}</text>`; }
  for (let h = 8; h <= 21; h++) { const x = X(londonMs(date, h)); s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${T + Hh}" y2="${T + Hh + 3}" stroke="#7a8aa0"/>`; if (h % 2 === 0 || h === 21) { s += `<text x="${x.toFixed(1)}" y="${T + Hh + 13}" font-size="9" font-family="monospace" text-anchor="middle" fill="#5b6b82">${String(h).padStart(2, '0')}:00</text>`; boxes.push({ x1: x - 15, y1: T + Hh + 5, x2: x + 15, y2: T + Hh + 14, id: `tick-${h}` }); } }
  names.forEach((n, i) => { s += line(paths[n].pts, PALETTE[i % PALETTE.length], 1.6); });
  if (book?.length) s += line(book, '#14202e', 2.6, '5 3');
  // end labels, spread so none overlap
  const ends = [...names.map((n, i) => ({ y: Y(paths[n].final), txt: `${short(n)} ${sg(paths[n].final, 1)}`, col: PALETTE[i % PALETTE.length], id: n })), ...(book?.length ? [{ y: Y(book.at(-1).v), txt: `Book ${sg(book.at(-1).v, 2)}`, col: '#14202e', id: 'book', bold: true }] : [])].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11;
  for (const e of ends) { s += `<text x="${L + W + 5}" y="${(e.y + 3).toFixed(1)}" font-size="10" font-family="Segoe UI,system-ui,sans-serif" font-weight="${e.bold ? 800 : 600}" fill="${e.col}">${ESC(e.txt)}</text>`; boxes.push({ x1: L + W + 5, y1: e.y - 6, x2: L + W + 5 + textW(e.txt, 10), y2: e.y + 5, id: `end-${e.id}` }); }
  // beats along the bottom axis: prints and gaps are labelled (two rows so labels do not collide), headlines are small dots
  const yb = T + Hh + 24, placed = [];
  for (const b of (beats ?? []).filter(x => ['release', 'gap', 'speaker', 'headline'].includes(x.kind) && x.ms >= entryMs && x.ms <= exitMs)) {
    const x = X(b.ms), lab = b.kind === 'release' || b.kind === 'gap' || b.kind === 'speaker', col = b.kind === 'release' ? '#0b5cab' : b.kind === 'headline' ? '#14202e' : b.kind === 'gap' ? '#8a6d00' : '#6b3fa0';
    if (!lab) { s += `<circle cx="${x.toFixed(1)}" cy="${yb}" r="2" fill="${col}"/>`; continue; }
    const t = `${b.hm}${b.country ? ` ${b.country}` : ''}`, w = textW(t, 8.5);
    let row = 0, box; for (; row < 2; row++) { box = { x1: x - w / 2, y1: yb + 5 + row * 11, x2: x + w / 2, y2: yb + 14 + row * 11 }; if (!placed.some(p => overlap(p, box)) && box.x1 >= 0 && box.x2 <= width) break; }
    if (row === 2) continue;
    placed.push(box); boxes.push({ ...box, id: `beat-${b.hm}-${b.kind}` });
    s += `<path d="M${x.toFixed(1)} ${yb - 4} l3.5 4 l-3.5 4 l-3.5 -4 z" fill="${col}" ${b.kind === 'gap' ? 'opacity=".55"' : ''}/><text x="${x.toFixed(1)}" y="${box.y2 - 3}" font-size="8.5" font-family="monospace" text-anchor="middle" fill="${col}">${ESC(t)}</text>`;
  }
  s += '</svg>';
  return { svg: s, boxes, legend };
}

/** Markets x hour: the move in u within each hour, London (08:00-13:30) and New York (13:30-21:00) bands. Rows are the markets that moved most. */
export function sessionHeatSvg(paths, { date, rows = 16, width = 680 } = {}) {
  const names = Object.keys(paths ?? {}).sort((a, b) => Math.abs(paths[b].final) - Math.abs(paths[a].final)).slice(0, rows);
  if (!names.length) return { svg: '', boxes: [], cells: [] };
  const hours = Array.from({ length: 13 }, (_, i) => 8 + i), L = 92, T = 34, cw = Math.floor((width - L - 4) / hours.length), ch = 16, height = T + names.length * ch + 18;
  const at = (p, t) => { const pts = p.pts; let v = 0; for (const q of pts) { if (q.t <= t) v = q.v; else break; } return v; };
  const col = d => { const z = Math.max(-1, Math.min(1, d / 1.2)); return z >= 0 ? `rgba(11,122,85,${(0.08 + z * 0.8).toFixed(2)})` : `rgba(180,35,47,${(0.08 - z * 0.8).toFixed(2)})`; };
  const boxes = [], cells = [];
  let s = `<svg class="evd-svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Markets by hour, the move in u in each hour, London and New York"><rect width="${width}" height="${height}" fill="#fff"/>`;
  const bx = (h) => L + (h - 8) * cw;
  s += `<rect x="${bx(8)}" y="6" width="${(13.5 - 8) * cw}" height="14" fill="#e8eef8"/><text x="${bx(8) + 4}" y="16" font-size="9" font-family="monospace" font-weight="700" fill="#14202e">LONDON</text><rect x="${bx(13.5)}" y="6" width="${(21 - 13.5) * cw}" height="14" fill="#fdecc8"/><text x="${bx(13.5) + 4}" y="16" font-size="9" font-family="monospace" font-weight="700" fill="#8a5a00">NEW YORK (FROM 13:30)</text>`;
  boxes.push({ x1: bx(8) + 4, y1: 8, x2: bx(8) + 4 + textW('LONDON', 9), y2: 17, id: 'band-london' }, { x1: bx(13.5) + 4, y1: 8, x2: bx(13.5) + 4 + textW('NEW YORK (FROM 13:30)', 9), y2: 17, id: 'band-ny' });
  for (const h of hours) { const x = bx(h) + cw / 2; s += `<text x="${x.toFixed(1)}" y="30" font-size="8.5" font-family="monospace" text-anchor="middle" fill="#5b6b82">${String(h).padStart(2, '0')}</text>`; boxes.push({ x1: x - 6, y1: 22, x2: x + 6, y2: 31, id: `hh-${h}` }); }
  names.forEach((n, r) => {
    const y = T + r * ch; s += `<text x="${L - 6}" y="${y + 11}" font-size="10" font-family="Segoe UI,system-ui,sans-serif" font-weight="600" text-anchor="end" fill="#14202e">${ESC(short(n))}</text>`;
    boxes.push({ x1: L - 6 - textW(short(n), 10), y1: y + 2, x2: L - 6, y2: y + 13, id: `row-${n}` });
    for (const h of hours) {
      const a = at(paths[n], londonMs(date, h)), b = at(paths[n], londonMs(date, h + 1)), d = +(b - a).toFixed(2);
      cells.push({ inst: n, hour: h, d });
      s += `<rect x="${bx(h) + 0.5}" y="${y}" width="${cw - 1}" height="${ch - 1}" fill="${col(d)}"/>${Math.abs(d) >= 0.3 ? `<text x="${(bx(h) + cw / 2).toFixed(1)}" y="${y + 11}" font-size="8" font-family="monospace" text-anchor="middle" fill="${Math.abs(d) >= 0.7 ? '#fff' : '#14202e'}">${sg(d, 1).replace('+', '')}</text>` : ''}`;
    }
  });
  s += `<text x="${L}" y="${height - 4}" font-size="8.5" font-family="monospace" fill="#5b6b82">Each cell is the move in u during that hour. Green rose, red fell; the number shows hours that moved 0.3 u or more.</text></svg>`;
  return { svg: s, boxes, cells };
}

const CCY_OF = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF' };
const ORD = ['strongest', 'second strongest'];

/**
 * "This morning the desk said" beside "what the day did", from the thesis-vs-reality record (js/thesisReality.js).
 * tr: that record's day object; score: the day's score (S, placebo.p95). Right/wrong is the record's own verdict per call.
 */
export function morningVsDay(tr, score, H = { esc: ESC }) {
  const esc = H.esc ?? ESC;
  if (!tr?.regime && !tr?.currencies) return '';
  const rg = tr.regime ?? {}, cu = tr.currencies ?? {}, cards = tr.cards ?? [];
  const tone = String(rg.tone ?? '').replace('_', '-'), said = [], did = [];
  if (tone) { const head = String(tr.morning?.headline ?? '').split(/(?<=[.!?])\s/)[0].slice(0, 260), lead = `${tone} at ${rg.conviction ?? 'unstated'} conviction`;
    said.push(`<p><b>The ruling.</b> ${head && head.toLowerCase().startsWith(lead.toLowerCase()) ? esc(head) : `${esc(lead.charAt(0).toUpperCase() + lead.slice(1))}${head ? `: ${esc(head)}` : '.'}`}</p>`); }
  if (cu.ranking?.length) said.push(`<p><b>The currencies.</b> Strongest to weakest: ${esc(cu.ranking.join(', '))}. Leaning stronger: ${esc((cu.perCcy ?? []).filter(c => c.bias > 0).map(c => c.ccy).join(', ') || 'none')}; leaning weaker: ${esc((cu.perCcy ?? []).filter(c => c.bias < 0).map(c => c.ccy).join(', ') || 'none')}.</p>`);
  if (cards.length) said.push(`<p><b>The book.</b> ${cards.length} cards with a view.</p>`);
  if (rg.realised != null) did.push(`<p><b>The ruling:</b> the ${rg.basket ?? ''}-market risk basket moved ${sg(rg.realised, 2)} u, so the call was <b>${esc(rg.verdict ?? 'unscored')}</b>.</p>`);
  if (cu.realisedRanking?.length) {
    const called = (cu.perCcy ?? []).filter(c => c.bias !== 0), right = called.filter(c => c.verdict === 'right').length, wrong = called.filter(c => c.verdict === 'wrong');
    did.push(`<p><b>The currencies:</b> the day's order was ${esc(cu.realisedRanking.join(', '))}. ${called.length ? `${right} of ${called.length} leaning calls were right${wrong.length ? `; wrong: ${esc(wrong.map(c => `${c.ccy} ${c.bias > 0 ? 'stronger' : 'weaker'} but ${sg(c.realised, 1)} u`).join('; '))}` : ''}.` : ''}${cu.strongest ? ` ${esc(cu.strongest.ccy)} was ranked strongest and finished ${cu.strongest.realisedRank} of ${cu.strongest.of}; ${esc(cu.weakest?.ccy ?? '')} was ranked weakest and finished ${cu.weakest?.realisedRank} of ${cu.weakest?.of}.` : ''}</p>`);
  }
  if (cards.length) { const first = cards.filter(c => c.first === 'p50').length, reached = cards.filter(c => c.p50?.reached).length, right = cards.filter(c => c.verdict === 'right').length;
    did.push(`<p><b>The book:</b> ${right} of ${cards.length} cards finished on the right side; ${reached} reached their first forecast line; ${first} reached it before the other side.${score?.S != null ? ` The day's score was ${sg(score.S, 2)} u${score.placebo?.p95 != null ? `, ${score.S > score.placebo.p95 ? 'above' : 'inside'} the range random books score (95th percentile ${sg(score.placebo.p95, 2)} u)` : ''}.` : ''}</p>`); }
  return `<div class="evd-mv"><div class="evd-mv-c"><h4>This morning the desk said</h4>${said.join('')}</div><div class="evd-mv-c"><h4>What the day did</h4>${did.join('')}</div></div><p class="evd-note">Historical review, not proof of an edge: one day is a small sample, and the test that counts days is on the page about the book.</p>`;
}

/** The next London weekday after `date` (a Friday evening looks to Monday). */
export function nextTradingDate(date) {
  let d = new Date(Date.parse(`${date}T12:00:00Z`) + 864e5);
  while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 864e5);
  return d.toISOString().slice(0, 10);
}

/** Tomorrow's high-impact releases, each with what it usually does and, where it is one of today's most stretched currencies, one rule-built sentence. */
export function tomorrowBlock({ events = [], noteFn = null, realised = null, date, H = { esc: ESC } } = {}) {
  const esc = H.esc ?? ESC, d2 = nextTradingDate(date), s2 = londonMs(d2, 0), e2 = londonMs(new Date(Date.parse(`${d2}T12:00:00Z`) + 864e5).toISOString().slice(0, 10), 0);
  const evs = (events ?? []).filter(e => e?.ms >= s2 && e.ms < e2 && String(e.impact ?? '').toLowerCase() === 'high').sort((a, b) => a.ms - b.ms);
  const rank = realised ? Object.entries(realised).sort((a, b) => b[1] - a[1]).map(([c]) => c) : [];
  const grouped = []; for (const e of evs) { const g = grouped.find(x => x.ms === e.ms && x.country === e.country); if (g) g.all.push(e); else grouped.push({ ...e, all: [e] }); }
  const rows = grouped.slice(0, 8).map(e => {
    const ccy = CCY_OF[String(e.country ?? '').toUpperCase()], i = ccy ? rank.indexOf(ccy) : -1, n = rank.length;
    const tie = i >= 0 && i < 2 ? `${ccy} was today's ${ORD[i]} currency (${sg(realised[ccy], 1)} u), so this lands on a move that is already stretched.` : i >= 0 && n && i >= n - 2 ? `${ccy} was today's ${i === n - 1 ? 'weakest' : 'second weakest'} currency (${sg(realised[ccy], 1)} u), so this lands on a move that is already stretched.` : '';
    const note = noteFn ? noteFn(e) : null, hist = [note?.book, note?.range && `usual range effect: ${note.range}`].filter(Boolean).join('; ');
    const one = e.all.length === 1;
    return { hm: londonHM(e.ms), country: e.country, event: e.all.map(x => x.event).join(' and '), estimate: one ? e.estimate ?? null : null, prev: one ? e.prev ?? null : null, detail: one ? '' : e.all.map(x => `${x.event}: ${x.estimate != null ? `forecast ${x.estimate}` : 'no forecast'}${x.prev != null ? `, previous ${x.prev}` : ''}`).join('; '), hist, tie };
  });
  const html = rows.length ? `<div class="evd-tm">${rows.map(r => `<div class="evd-tr"><span class="evd-th">${esc(r.hm)}</span><div><b>${esc(r.country)} ${esc(r.event)}</b>${r.estimate != null || r.prev != null ? ` <span class="evd-mu">${r.estimate != null ? `forecast ${esc(r.estimate)}` : ''}${r.estimate != null && r.prev != null ? ', ' : ''}${r.prev != null ? `previous ${esc(r.prev)}` : ''}</span>` : ''}${r.detail ? `<div class="evd-mu">${esc(r.detail)}</div>` : ''}${r.hist ? `<div class="evd-mu">${esc(r.hist)}</div>` : '<div class="evd-mu">No measured effect on file for this release.</div>'}${r.tie ? `<div class="evd-ti">${esc(r.tie)}</div>` : ''}</div></div>`).join('')}</div>` : '<p class="evd-mu">No high-impact release on tomorrow\'s calendar.</p>';
  return { html, rows, date: d2 };
}

/**
 * Everything the evening issue's look-back pages need, built once from the day's stored inputs (the server and the dry run share it).
 * ev.day = { timeline, paths, book, tr, tomorrow }. Any input that is missing leaves its piece out; nothing is filled in.
 */
export function buildEveningDay({ date, wire = [], events = [], scorecards = [], bursts = [], bars = {}, cards = {}, tr = null, nextEvents = null, noteFn = null, now = Date.now() } = {}) {
  const paths = dayPaths(bars, cards, date), book = bookPath(paths, cards), timeline = buildTimeline({ date, wire, events, scorecards, bursts, now });
  const realised = tr?.currencies?.perCcy ? Object.fromEntries(tr.currencies.perCcy.map(c => [c.ccy, c.realised])) : null;
  const tomorrow = nextEvents ? tomorrowBlock({ events: nextEvents, noteFn, realised, date }) : null;
  return { timeline, paths, book, tr, tomorrow };
}

export const DAY_CSS = `
.evd-svg{display:block;max-width:100%;height:auto;margin:6px 0 4px;border:1px solid #e1e8f2}
.evd-leg{font:11px var(--sans,system-ui);color:#5b6b82;margin:0 0 10px}.evd-leg b{color:#8a5a00;font-family:var(--mono,monospace)}
.evd-mv{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:6px 0 6px;font-family:var(--sans,system-ui)}
.evd-mv-c{border:1px solid #d8e0ec;border-radius:6px;padding:8px 10px;background:#fafcff;break-inside:avoid}
.evd-mv-c h4{margin:0 0 4px;font:700 10px var(--sans,system-ui);letter-spacing:.14em;text-transform:uppercase;color:#14202e}
.evd-mv-c p{font-size:12.5px;line-height:1.42;margin:0 0 6px;color:#1c2a3f}
.evd-note{font:11.5px var(--sans,system-ui)!important;color:#5b6b82;margin:2px 0 8px!important}
.evd-tm{font-family:var(--sans,system-ui);margin:4px 0}
.evd-tr{display:grid;grid-template-columns:48px 1fr;gap:8px;padding:5px 0;border-bottom:1px solid #eef2f8;font-size:12.5px;line-height:1.4;break-inside:avoid}
.evd-th{font:700 11px var(--mono,monospace);color:#14202e}.evd-mu{font-size:11.5px;color:#5b6b82}.evd-ti{font-size:12px;color:#14202e;margin-top:2px}
@media (max-width:640px){.evd-mv{grid-template-columns:1fr}}
`;
