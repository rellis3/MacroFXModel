/**
 * The calendar past ForexFactory's week (review 2026-11-27). ForexFactory publishes only the current week (its next-week file 404s), so from
 * Thursday the terminal showed no releases ahead: the Calendar tab said "No events", the Overview said "no high-impact release in sight" with
 * ISM and payrolls days away. Nasdaq publishes forward lists but rates nothing, and a word pattern called every CPI, retail or GDP row "High"
 * (German state CPIs, Japan's large-scale retail).
 *
 * This rates each forward Nasdaq row with ForexFactory's OWN impact for the same release, read from the surprise store's live rows (which keep
 * ForexFactory's name and rating), using the live reader's name rules (js/surpriseReader.js nameWords). A row that matches no ForexFactory
 * release is left out rather than guessed. Pure: no fetch, no clock (pass `now`). Tested in js/calendarAhead.test.mjs.
 */
import { nameWords, HARMLESS } from './surpriseReader.js';

/** Nasdaq country -> the calendar's code. ForexFactory files every euro-area print under EUR (EU), naming the member state in the title. */
export const NAS_CC = { 'United States': 'US', 'Euro Zone': 'EU', Germany: 'EU', France: 'EU', Italy: 'EU', Spain: 'EU', 'United Kingdom': 'GB', Japan: 'JP', Switzerland: 'CH', Australia: 'AU', 'New Zealand': 'NZ', Canada: 'CA' };
const MEMBER = { Germany: 'German', France: 'French', Italy: 'Italian', Spain: 'Spanish' };
const RANK = { high: 3, medium: 2, low: 1 };

/**
 * ForexFactory's rating per release, from stored rows ({ country, event, impact, ms }): { [cc]: [{ name, words, impact }] }, the latest rating
 * of each release name. Only rows from `since` on count (the store's older backfill came from another vendor with other names and ratings).
 */
export function impactIndex(rows = [], { since = 0 } = {}) {
  const latest = new Map();
  for (const r of rows ?? []) {
    // Nasdaq-sourced rows ("Large Scale Retail Sales YoY", "CPI, n.s.a") carry a guessed rating under Nasdaq's names: rating a Nasdaq row
    // with them would only repeat the guess, so the index is ForexFactory's names and ratings alone
    if (/^nasdaq/i.test(String(r?.src ?? ''))) continue;
    const imp = String(r?.impact ?? '').toLowerCase(); if (!RANK[imp] || !(Number(r.ms) >= since)) continue;
    const k = `${String(r.country).toUpperCase()}|${String(r.event ?? '').trim().toLowerCase()}`, had = latest.get(k);
    if (!had || Number(r.ms) > had.ms) latest.set(k, { cc: String(r.country).toUpperCase(), name: String(r.event).trim(), impact: imp, ms: Number(r.ms) });
  }
  const out = {};
  for (const x of latest.values()) { const w = new Set(nameWords(x.name)); if (w.size) (out[x.cc] ??= []).push({ name: x.name, words: w, impact: x.impact }); }
  return out;
}

/**
 * ForexFactory's release for one Nasdaq row ({ country, event }), or null: the best word match among the country's releases (Jaccard), where a
 * word one side has and the other lacks ("Baden Wuerttemberg", "Large Scale", "Core") counts against it. Releases that differ only by period
 * (CPI m/m and CPI y/y) share a name here, so the higher rating of the two is taken. At 0.8 one unmatched word in a three-word name is
 * already too many: "German Bavaria CPI", "U6 Unemployment Rate" and "Private Nonfarm Payrolls" are not their headline releases.
 */
export function rateRow(row, index, { min = 0.8 } = {}) {
  const cc = NAS_CC[row?.country]; if (!cc) return null;
  const pre = MEMBER[row.country], event = String(row.event ?? '').trim();
  const W = new Set(nameWords(pre && !new RegExp(`^${pre}\\b`, 'i').test(event) ? `${pre} ${event}` : event)); if (!W.size) return null;
  let best = null, bestJ = 0;
  for (const s of index?.[cc] ?? []) {
    let inter = 0; for (const w of W) if (s.words.has(w)) inter++;
    if (!inter) continue;
    const loose = [...W].filter(w => !s.words.has(w) && !HARMLESS.has(w)).length + [...s.words].filter(w => !W.has(w) && !HARMLESS.has(w)).length;
    const j = inter / (inter + loose);
    if (j > bestJ || (j === bestJ && best && RANK[s.impact] > RANK[best.impact])) { best = s; bestJ = j; }
  }
  return best && bestJ >= min ? { cc, name: best.name, impact: best.impact, score: +bestJ.toFixed(2) } : null;
}

/**
 * Forward Nasdaq rows ({ ms, country, event, released, raw: { consensus, previous } }) -> calendar events in the /api/events shape
 * ({ country, event, impact, time, ms, estimate, prev, actual }) for the gate countries, rated, one per release and time, after `after` (ms).
 */
export function forwardEvents(nasRows = [], index, { now, after = now } = {}) {
  const out = new Map();
  for (const x of nasRows ?? []) {
    if (!x || x.released || !(Number(x.ms) > after)) continue;
    const r = rateRow(x, index); if (!r) continue;
    const pre = MEMBER[x.country], event = pre && !new RegExp(`^${pre}\\b`, 'i').test(x.event) ? `${pre} ${x.event}` : x.event;
    const key = `${r.cc}|${String(event).toLowerCase()}|${x.ms}`, cons = String(x.raw?.consensus ?? '').trim() || null;
    const had = out.get(key); if (had && (had.estimate || !cons)) continue;
    out.set(key, { country: r.cc, event, impact: r.impact, time: new Date(x.ms).toISOString().replace('T', ' ').slice(0, 19), ms: x.ms,
      estimate: cons, prev: String(x.raw?.previous ?? '').replace(/&nbsp;/gi, '').trim() || null, actual: null, source: 'nasdaq', ratedAs: r.name });
  }
  return [...out.values()].sort((a, b) => a.ms - b.ms);
}
