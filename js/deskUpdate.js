/**
 * Phase 5: session updates (plans/DESK_ANALYST_PIPELINE.md §9m). At the London open (08:05) and the New York open
 * (14:35) the desk re-reads what changed since the morning book and changes only the cards it must.
 *
 * The morning book is never edited: the pre-registered test (forge/DESK_ANALYST_PIPELINE_PREREG.md, amendment A2)
 * scores the book as written before 08:00. Updates are stored beside it, shown as the live view, and scored on their
 * own in the evening: for each changed card, the move from the update to 21:00 London under the new view against the
 * old one, each weighted by its size, so a size cut counts too. That is a description, never a scored cell.
 *
 * Pure. Tested in js/deskUpdate.test.mjs.
 */
import { cardDir, londonMs, unitOf } from './deskScore.js';

export const SLOTS = { london: { hh: 8, mm: 5, label: 'London open' }, ny: { hh: 14, mm: 35, label: 'New York open' } };
export const slotMs = (date, slot) => londonMs(date, SLOTS[slot].hh, SLOTS[slot].mm);
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const LINES = ['p50', 'p75', 'p90'];

/**
 * Each market since the session open, in the day's forecast unit: where price is now against the open and against
 * 08:00, the day's high and low, and which forecast lines have been touched. bars: M1 from 00:00 London to now.
 */
export function marketSince(cards, barsByInst, date, nowMs) {
  const open0 = londonMs(date, 0), at8 = londonMs(date, 8), out = {};
  for (const [n, c] of Object.entries(cards ?? {})) {
    const L = c?.levels, u = unitOf(L), bars = (barsByInst?.[n] ?? []).filter(b => b.time * 1000 >= open0 && b.time * 1000 < nowMs);
    if (!u || !bars.length) continue;
    const last = bars.at(-1).close, hi = Math.max(...bars.map(b => b.high)), lo = Math.min(...bars.map(b => b.low));
    const b8 = bars.find(b => b.time * 1000 >= at8);
    const touched = [...LINES.filter(q => Number.isFinite(L.up?.[q]) && hi >= L.up[q]).map(q => `up ${q}`), ...LINES.filter(q => Number.isFinite(L.down?.[q]) && lo <= L.down[q]).map(q => `down ${q}`)];
    out[n] = { nowU: r2((last - L.open) / u), since8U: b8 ? r2((last - b8.open) / u) : null, highU: r2((hi - L.open) / u), lowU: r2((lo - L.open) / u), touched };
  }
  return out;
}

/** The text the update agent reads about the markets, one line each, with the book's current view. */
export function marketText(market, view) {
  return Object.entries(market).map(([n, m]) => `${n}: book ${view[n]?.rating ?? '-'} size ${view[n]?.size ?? '-'} · now ${m.nowU > 0 ? '+' : ''}${m.nowU} u from the open${m.since8U != null ? `, ${m.since8U > 0 ? '+' : ''}${m.since8U} u since 08:00` : ''} · range ${m.lowU} to +${m.highU} u · lines touched: ${m.touched.length ? m.touched.join(', ') : 'none'}`).join('\n');
}

/** The book as it stands after the updates so far (later slots win). Never written back to the morning book. */
export function liveView(book, updates) {
  const view = Object.fromEntries(Object.entries(book?.instruments ?? {}).map(([n, c]) => [n, { rating: c.rating, size: c.size ?? null, from: 'book' }]));
  for (const slot of Object.keys(SLOTS)) {
    for (const ch of updates?.slots?.[slot]?.changes ?? []) if (view[ch.instrument]) view[ch.instrument] = { rating: ch.to, size: ch.size ?? view[ch.instrument].size, from: slot, was: view[ch.instrument].rating, why: ch.why };
  }
  return view;
}

/**
 * Evening, descriptive only: did each change help? For a changed card, the move from the first bar at or after the
 * update to the last bar before 21:00, in u, under the new view and under the view it replaced.
 */
export function scoreUpdates(run, updates, barsByInst, date) {
  const cards = run?.head?.book?.instruments ?? {}, exitMs = londonMs(date, 21), out = {};
  const prev = Object.fromEntries(Object.entries(cards).map(([n, c]) => [n, c.rating])), prevSize = Object.fromEntries(Object.entries(cards).map(([n, c]) => [n, Number.isFinite(c.size) ? c.size : 1]));
  for (const slot of Object.keys(SLOTS)) {
    const up = updates?.slots?.[slot]; if (!up?.changes?.length) continue;
    const from = Date.parse(up.at ?? '') || slotMs(date, slot), rows = [];
    for (const ch of up.changes) {
      const u = unitOf(cards[ch.instrument]?.levels), w = (barsByInst?.[ch.instrument] ?? []).filter(b => b.time * 1000 >= from && b.time * 1000 < exitMs);
      if (!u || !w.length) { rows.push({ instrument: ch.instrument, from: prev[ch.instrument], to: ch.to, missing: !u ? 'no levels' : 'no bars' }); continue; }
      const move = (w.at(-1).close - w[0].open) / u, sNew = Number.isFinite(ch.size) ? ch.size : prevSize[ch.instrument];
      const Rold = r2(cardDir(prev[ch.instrument]) * move * prevSize[ch.instrument]), Rnew = r2(cardDir(ch.to) * move * sNew);
      rows.push({ instrument: ch.instrument, from: prev[ch.instrument], to: ch.to, sizeFrom: prevSize[ch.instrument], sizeTo: sNew, Rold, Rnew, delta: r2(Rnew - Rold) });
    }
    for (const ch of up.changes) { prev[ch.instrument] = ch.to; if (Number.isFinite(ch.size)) prevSize[ch.instrument] = ch.size; }
    const scored = rows.filter(r => r.delta != null);
    out[slot] = { changes: rows, helped: scored.filter(r => r.delta > 0).length, hurt: scored.filter(r => r.delta < 0).length, netDelta: r2(scored.reduce((s, r) => s + r.delta, 0)) };
  }
  return { label: 'descriptive, not in any pre-registered cell', slots: out };
}
