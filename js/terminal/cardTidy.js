// js/terminal/cardTidy.js: the tidy full view of a market (owner 2026-11-24: "tidy the asset card and pair detail up"; the Pair page and the
// Assets pop-up). The full view used to read as four screens of text: the data pack's field names quoted back, the levels as one run-on
// paragraph, the same levels four times over and the macro tilt's two tables at full length. This module holds the pieces that replace that:
//   tidyText(s)                   the data pack's field names and raw timestamps rewritten in words (the deep read, the desk's line)
//   planLevels(card)              the plan's entry zone, invalidation and first target as prices (js/tradeWatch.js's rule, any size)
//   mergedLevels(card, m)         every level once, sorted by price and labelled in words, with its distance from price in u:
//                                 the forecast lines, the plan, the day's high and low, yesterday's high / low / close, the week open
//   ladderHtml(rows, m)           that list drawn as a vertical ladder with the live price in its place
//   statusStripHtml(o)            one line, pinned at the top while the page scrolls: price, the move, the call, whether the day is against it,
//                                 the day type, the range used, the next event, the risk tape
//   thenNowHtml(o)                three lines: what the morning said, what has happened since, the nearest levels that would change the read
//   details(summary, body, open)  the accordion every long section now sits in, with a one-line summary on its heading
// Pure: no fetch and no DOM. Tested in js/terminal/cardTidy.test.mjs. Theme tokens only.

const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sg = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}` : '–');
const px = v => (fin(v) ? v.toFixed(v >= 1000 ? 1 : v >= 100 ? 2 : v >= 10 ? 3 : 5) : '–');
const DIRN = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const WORD = { STRONG_LONG: 'strong long', LONG: 'long', SHORT: 'short', STRONG_SHORT: 'strong short', FLAT: 'flat' };

// ── words for the data pack's own names ──────────────────────────────────────────────────────────────────────────
const TERMS = [
  [/\bposInRange\b/g, "position in today's range"], [/\boh_rem\b/g, 'room left to the high'], [/\bol_rem\b/g, 'room left to the low'],
  [/\bbandDaily\b/g, 'the daily band'], [/\bround_half\b/g, 'round number'], [/\blevels_structure\b/g, 'the level structure'],
  [/\bplanCheck\b/g, 'the plan check'], [/\bat20dLow\s*=\s*true\b/g, 'at its 20-day low'], [/\bat20dHigh\s*=\s*true\b/g, 'at its 20-day high'],
  [/\bswing_state\b/g, 'the swing state'], [/\brelease-calls\b/g, 'the release calls'], [/\bnews-outcome\b/g, 'the news-reaction read'],
  [/\bevent-impact-map\b/g, 'the event-impact map'], [/\bevent-day\b/g, 'the event-day list'], [/\bvrp\b/g, 'variance risk premium'],
  [/\bpivot_s\b/g, 'pivot'], [/\bvol_band\b/g, 'volatility band'], [/\bround_big\b/g, 'big round number'],
  [/\bOI null\b/g, 'no open interest'], [/\bn=0\b/g, 'no readings'], [/\brows empty\b/g, 'nothing recorded'],
];
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
/** The data pack's field names and raw timestamps in words. Leaves ordinary prose alone. */
export function tidyText(s) {
  let t = String(s ?? '');
  for (const [re, w] of TERMS) t = t.replace(re, w);
  t = t.replace(/\b(1[5-9]\d{11})\b/g, (_, ms) => DATE_FMT.format(new Date(Number(ms))))   // epoch ms
    .replace(/\b(1[5-9]\d{8})\b(?!\.\d)/g, (m0, sec) => (/^\d{10}$/.test(sec) ? DATE_FMT.format(new Date(Number(sec) * 1000)) : m0))   // epoch s
    .replace(/\basOf\s*\(?\s*/g, 'as of ')
    .replace(/\s*\((?=[^()]*\b[a-z][a-z0-9-]*\/[a-z][^()]*\))[^()]*\)/g, '')   // a source citation in brackets, "(trade-decision/state:EURUSD, options oi)": the Sources line names them
    .replace(/\b([a-z]+)_([a-z]+)\b/g, '$1 $2');   // any other snake_case name
  return t.replace(/\(\s*as of ([^)]+)\)/g, '(as of $1)');
}

// ── levels ───────────────────────────────────────────────────────────────────────────────────────────────────────
const nums = s => (String(s ?? '').replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
/** The plan as prices: { zone: [lo, hi] | null, invalid, target } (the trade watcher's rule, without its size condition). */
export function planLevels(card) {
  const dir = DIRN[card?.rating] ?? 0, L = card?.levels, ref = fin(L?.open) ? L.open : null;
  const near = v => (ref ? v > ref * 0.9 && v < ref * 1.1 : v > 0);
  const z = nums(card?.plan?.zone).filter(near);
  const zone = z.length >= 2 ? [Math.min(...z), Math.max(...z)] : z.length === 1 ? [z[0], z[0]] : null;
  const inv = nums(card?.plan?.invalidation ?? card?.invalidation).filter(near);
  const against = dir && ref ? inv.filter(v => (dir < 0 ? v >= ref * 0.995 : v <= ref * 1.005)) : inv;
  const invalid = against.length ? (dir < 0 ? Math.min(...against) : dir > 0 ? Math.max(...against) : against[0]) : null;
  const target = dir > 0 ? (L?.up?.p50 ?? null) : dir < 0 ? (L?.down?.p50 ?? null) : null;
  return { dir, zone, invalid, target };
}

/**
 * Every level once: [{ price, labels: [..], kinds: [..], dU }], highest first. card: the book's card (levels, plan); m: the live market
 * (last, hi, lo, u, ref). Levels within 0.08u of each other are one row with both labels.
 */
export function mergedLevels(card, m) {
  const L = card?.levels, raw = [], add = (price, label, kind) => { if (fin(price)) raw.push({ price, label, kind }); };
  if (L) {
    add(L.open, "today's open", 'open');
    for (const q of ['p50', 'p75', 'p90']) { add(L.up?.[q], `forecast ${q} up`, 'line'); add(L.down?.[q], `forecast ${q} down`, 'line'); }
  } else if (m) add(m.open, "today's open", 'open');
  const p = planLevels(card);
  if (p.zone) { if (p.zone[0] === p.zone[1]) add(p.zone[0], 'plan entry', 'plan'); else { add(p.zone[0], 'plan entry zone (low)', 'plan'); add(p.zone[1], 'plan entry zone (high)', 'plan'); } }
  add(p.invalid, 'plan invalidation', 'invalid');
  if (m) { add(m.hi, "today's high", 'day'); add(m.lo, "today's low", 'day'); }
  const r = m?.ref;
  if (r) { add(r.pdh, "yesterday's high", 'ref'); add(r.pdl, "yesterday's low", 'ref'); add(r.pdc, "yesterday's close", 'ref'); add(r.wo, 'week open', 'ref'); }
  const u = fin(m?.u) && m.u > 0 ? m.u : (L && fin(L.up?.p50) && fin(L.down?.p50) ? (L.up.p50 - L.down.p50) / 2 : null);
  raw.sort((a, b) => b.price - a.price);
  const rows = [];
  for (const x of raw) {
    const prev = rows.at(-1);
    if (prev && u && Math.abs(prev.price - x.price) <= 0.08 * u) { if (!prev.labels.includes(x.label)) { prev.labels.push(x.label); prev.kinds.push(x.kind); } continue; }
    rows.push({ price: x.price, labels: [x.label], kinds: [x.kind] });
  }
  const last = fin(m?.last) ? m.last : null;
  for (const row of rows) row.dU = u && last != null ? Math.round(((row.price - last) / u) * 100) / 100 : null;
  return rows;
}

const KIND_CLS = { invalid: 'dn', plan: 'pur', line: '', open: 'gold', day: 'muted', ref: 'blue' };
/** The ladder: one row per level, the live price as a marked row between the levels above and below it. */
export function ladderHtml(rows, m) {
  if (!rows?.length) return '';
  const last = fin(m?.last) ? m.last : null, out = [];
  let placed = last == null;
  const priceRow = () => `<div class="ct-lad-row ct-now"><span class="mono"><b>${px(last)}</b></span><span><b>price now</b></span><span class="mono muted" title="from today's open">${fin(m?.nowU) ? `${sg(m.nowU)}u` : ''}</span></div>`;
  for (const r of rows) {
    if (!placed && r.price < last) { out.push(priceRow()); placed = true; }
    const k = r.kinds.includes('invalid') ? 'invalid' : r.kinds.includes('plan') ? 'plan' : r.kinds.includes('open') ? 'open' : r.kinds[0];
    out.push(`<div class="ct-lad-row ct-${k}"><span class="mono">${px(r.price)}</span><span class="${KIND_CLS[k] ?? ''}">${E(r.labels.join(' · '))}</span><span class="mono muted">${fin(r.dU) ? `${sg(r.dU)}u` : ''}</span></div>`);
  }
  if (!placed) out.push(priceRow());
  return `<div class="ct-ladder" role="list" aria-label="levels, highest first">${out.join('')}</div><p class="muted" style="font-size:11.5px;margin:6px 0 0">Every level once, highest first; levels within 0.08u are merged. The right column is the distance from the price now, in u (the day's p50 distance). Yesterday's levels and the week open are from completed daily bars.</p>`;
}

/** The nearest level above and below price (not today's own high or low), for "what changes the read". */
export function nearestLevels(rows, last) {
  if (!fin(last)) return { above: null, below: null };
  const use = (rows ?? []).filter(r => !(r.kinds.length === 1 && r.kinds[0] === 'day'));
  return { above: [...use].reverse().find(r => r.price > last) ?? null, below: use.find(r => r.price < last) ?? null };
}

// ── the top of the page ──────────────────────────────────────────────────────────────────────────────────────────
/** One pinned line. o: { card, m, against: [..], dayType, nextEvent (text), tape: { label, since } , planChip (html) } */
export function statusStripHtml(o) {
  const c = o.card, m = o.m, d = DIRN[c?.rating] ?? 0, parts = [];
  if (m) parts.push(`<b class="mono">${px(m.last)}</b>`, `<b class="${m.nowU > 0.05 ? 'up' : m.nowU < -0.05 ? 'dn' : ''}">${fin(m.nowU) ? `${m.nowU > 0 ? '▲' : m.nowU < 0 ? '▼' : '▬'} ${sg(m.nowU)}u` : `${sg(m.chgPct)}%`}</b>`);
  if (c?.rating) parts.push(`<span class="chip ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${E(WORD[c.rating] ?? c.rating)}</span>`);
  if (o.against?.length) parts.push(`<span class="chip gold" title="${E(o.against.join('; '))}">⚠ day against the call</span>`);
  if (o.planChip) parts.push(o.planChip);
  if (m?.dayType) parts.push(`<span class="muted">${E(m.dayType === 'quiet' ? 'quiet so far' : `${m.dayType} so far`)}</span>`);
  if (fin(m?.spanUsed)) parts.push(`<span class="muted" title="today's range against the forecast's p50-to-p50 span">range ${Math.round(m.spanUsed * 100)}% of the p50 span</span>`);
  if (o.nextEvent) parts.push(`<span class="gold">${E(o.nextEvent)}</span>`);
  if (o.tape?.label) parts.push(`<span class="${o.tape.label === 'risk-on' ? 'up' : o.tape.label === 'risk-off' ? 'dn' : 'muted'}">${E(o.tape.label)}</span>`);
  return parts.length ? `<div class="ct-strip">${parts.join('<span class="ct-dot">·</span>')}</div>` : '';
}

const firstSentence = s => { const t = String(s ?? '').trim(); const i = t.search(/[.!?](\s|$)/); return i > 0 ? t.slice(0, i + 1) : t; };
/** Then and now. o: { card, m, against, tilt: { now, at, turned }, tape, rows } */
export function thenNowHtml(o) {
  const c = o.card, m = o.m;
  if (!c && !m) return '';
  const since = [];
  if (m) {
    since.push(fin(m.nowU) ? `${sg(m.nowU)}u from the open` : `${sg(m.chgPct)}% from the open`);
    if (m.touched?.length) since.push(`${m.touched.join(', ')} hit`);
    if (m.dayType && m.dayType !== 'quiet') since.push(`${m.dayType} so far`);
  }
  if (o.tape?.label) since.push(`tape ${o.tape.label}${o.tape.since ? ` since ${new Date(o.tape.since).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}` : ''}`);
  if (o.tilt?.turned) since.push(`macro tilt turned ${o.tilt.turned}`);
  const nl = nearestLevels(o.rows, m?.last);
  const lvl = r => `${px(r.price)} (${r.labels.join(' · ')}${fin(r.dU) ? `, ${sg(r.dU)}u` : ''})`;
  const plan = planLevels(c);
  const change = [nl.above ? `above: ${lvl(nl.above)}` : '', nl.below ? `below: ${lvl(nl.below)}` : ''].filter(Boolean);
  const row = (k, v, cls = '') => `<div class="ct-tn-row"><span class="lbl">${k}</span><span class="${cls}">${v}</span></div>`;
  return `<div class="ct-tn">${c ? row('Morning', `<b>${E(WORD[c.rating] ?? c.rating ?? 'no call')}</b>${c.conviction ? `, ${E(c.conviction)} conviction` : ''}: ${E(tidyText(firstSentence(c.why)))}`) : row('Morning', '<span class="muted">no desk card for this market today</span>')}
${m ? row('Since', E(since.join(' · ')), o.against?.length ? 'gold' : '') : ''}
${change.length ? row('Next levels', E(change.join(' · '))) : ''}
${fin(plan.invalid) && c ? row('Plan out', planOut(px(plan.invalid), tidyText(c.plan?.invalidation ?? c.invalidation ?? '')), 'muted') : ''}</div>`;
}

/** "1.41837: a close above …", or just "1.41837" when the plan's wording is only the number again (it printed "1.41837: 1.41837"). */
export function planOut(level, words) {
  const w = String(words ?? '').trim(), bare = w.replace(/[\s,]/g, '');
  return !w || bare === String(level).replace(/[\s,]/g, '') || Number(bare) === Number(String(level).replace(/[\s,]/g, '')) ? E(level) : `${E(level)}: ${E(w)}`;
}
/** An accordion with a one-line summary. */
export const details = (summary, body, open = false, cls = '') => (body ? `<details class="ct-acc ${cls}"${open ? ' open' : ''}><summary>${summary}</summary><div class="ct-acc-body">${body}</div></details>` : '');

export const CSS = `.ct-strip{position:sticky;top:calc(var(--top-h, 0px) + 6px);z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:8px 12px;margin:0 0 12px;border:1px solid var(--line2);border-radius:12px;background:var(--bg2);font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.ct-strip .up{color:var(--up)} .ct-strip .dn{color:var(--dn)} .ct-strip .gold{color:var(--gold)}
.ct-dot{color:var(--line2)}
.ct-tn{display:grid;gap:6px;margin:10px 0 4px}
.ct-tn-row{display:grid;grid-template-columns:92px 1fr;gap:10px;font-size:13px;align-items:baseline}
.ct-tn-row.gold,.ct-tn-row .gold{color:var(--gold)}
@media (max-width:520px){.ct-tn-row{grid-template-columns:1fr;gap:2px}}
.ct-ladder{display:grid;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:8px}
.ct-lad-row{display:grid;grid-template-columns:86px 1fr 74px;gap:8px;padding:5px 10px;font-size:12.5px;border-top:1px solid var(--line)}
.ct-lad-row:first-child{border-top:0}
.ct-lad-row span:last-child{text-align:right}
.ct-lad-row .pur{color:var(--pur)} .ct-lad-row .dn{color:var(--dn)} .ct-lad-row .gold{color:var(--gold)} .ct-lad-row .blue{color:var(--blue)}
.ct-now{background:rgba(var(--goldrgb),.12);border-top:1px solid rgba(var(--goldrgb),.5);border-bottom:1px solid rgba(var(--goldrgb),.5)}
.ct-acc{margin-top:12px;border:1px solid var(--line);border-radius:12px;background:var(--bg2)}
.ct-acc>summary{cursor:pointer;padding:10px 14px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;list-style:none}
.ct-acc>summary::-webkit-details-marker{display:none}
.ct-acc>summary::before{content:'▸';color:var(--tx2);transition:transform .15s}
.ct-acc[open]>summary::before{transform:rotate(90deg)}
.ct-acc-body{padding:0 14px 12px}
.ct-bars{display:grid;gap:4px;margin:8px 0}
.ct-bar{display:grid;grid-template-columns:minmax(110px,38%) 1fr 52px;gap:8px;align-items:center;font-size:12px}
.ct-bar .tr{position:relative;height:8px;border-radius:4px;background:var(--bg3)}
.ct-bar .tr::after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}
.ct-bar .tr i{position:absolute;top:0;bottom:0;border-radius:4px}
.ct-bar .tr i.up{background:var(--up)} .ct-bar .tr i.dn{background:var(--dn)}
.ct-bar b{text-align:right}
.ct-bul{margin:4px 0 0;padding-left:18px}
.ct-bul li{margin:2px 0}`;
