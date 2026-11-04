/**
 * The live surprise reader (owner, 2026-11-04, build list item 5). When a high-impact release prints, work out the
 * surprise (actual - consensus, in the release's own units, and as a z against that release's own past surprises
 * where the desk has them), look up the economist's playbook for the release family (js/releasePlaybook.js: the
 * typical 30-minute and 4-hour moves, how much of the move is usually kept, and the median move after hot and cold
 * prints) and say it on Telegram within a minute, once per release.
 *
 * It is history, labelled with its count: never a forecast that this print will move markets the same way.
 *
 * Pure: no fetch, no KV, no clock (pass `now`). Tested in js/surpriseReader.test.mjs.
 */
import { familyOf, playbook } from './releasePlaybook.js';

/** Keep watching a release for this long after its time for the actual to appear. */
export const WATCH_BEFORE_MS = 2 * 60_000, WATCH_AFTER_MS = 30 * 60_000;
const COUNTRY_NAME = { US: 'United States', EU: 'Euro Zone', GB: 'United Kingdom', JP: 'Japan', AU: 'Australia', NZ: 'New Zealand', CA: 'Canada', CH: 'Switzerland', DE: 'Germany', CN: 'China' };
const NAME_COUNTRY = Object.fromEntries(Object.entries(COUNTRY_NAME).map(([k, v]) => [v, k]));
export const CCY_OF = { US: 'USD', EU: 'EUR', DE: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF', CN: 'CNY' };

/** Parse a calendar value: "0.3%", "-12.5K", "1.2M", "3.75" → { v, unit }; the K/M/B suffix is applied so 150K and 0.15M agree. */
export function parseValue(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? { v: raw, unit: '' } : null;
  const s = String(raw).replace(/&nbsp;|&#160;| /gi, '').replace(/,/g, '').trim();
  const m = s.match(/^([<>]?)\s*(-?\d+(?:\.\d+)?)\s*(%|K|M|B|T|bps?)?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[String(m[3] ?? '').toUpperCase()] ?? 1;
  return { v: Number(m[2]) * mult, unit: m[3] === '%' ? '%' : /bp/i.test(m[3] ?? '') ? 'bp' : mult > 1 ? String(m[3]).toUpperCase() : '' };
}
const fmt = (x, unit) => {
  if (!Number.isFinite(x)) return '?';
  const s = x > 0 ? '+' : '';
  if (unit === 'K') return `${s}${+(x / 1e3).toFixed(1)}K`;
  if (unit === 'M') return `${s}${+(x / 1e6).toFixed(2)}M`;
  if (unit === 'B') return `${s}${+(x / 1e9).toFixed(2)}B`;
  return `${s}${+x.toFixed(Math.abs(x) >= 10 ? 1 : 2)}${unit === '%' ? 'pp' : unit === 'bp' ? 'bp' : ''}`;
};

export const releaseKey = e => `${e.country}|${String(e.event ?? '').trim().toLowerCase()}|${Math.round(Number(e.ms) / 60_000)}`;

/** Calendar rows that never carry a number (speeches, pressers, statements, minutes): nothing to read a surprise from. */
export const NO_NUMBER = /speaks|speech|testif|press conference|statement|minutes|hearing|summit|meetings?\b|holiday|outlook|report\b|votes?\b|election|auction|projections|forecasts?\b/i;
/** High-impact releases whose time is inside the watch window and that have not been sent yet. */
export function dueReleases(events = [], now, sent = {}, { before = WATCH_BEFORE_MS, after = WATCH_AFTER_MS } = {}) {
  return (events ?? []).filter(e => /high/i.test(String(e.impact ?? '')) && !NO_NUMBER.test(String(e.event ?? '')) && Number.isFinite(Number(e.ms))
    && now >= Number(e.ms) - before && now <= Number(e.ms) + after && !sent[releaseKey(e)]);
}
/** Is any high-impact release near enough that the reader should fetch actuals this minute? */
export const anyDue = (events, now, sent) => dueReleases(events, now, sent).length > 0;

const words = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !['m', 'y', 'q', 'mm', 'yy', 'qq', 'the', 'of', 's'].includes(w));
/** Word overlap of two event names (0..1, against the shorter name). */
export function nameSimilarity(a, b) {
  const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
/** The Nasdaq row ({ ms, country (name), event, raw.actual, raw.consensus, released }) for a ForexFactory event, or null. */
export function matchActual(ev, rows = [], { slackMs = 5 * 60_000, minSim = 0.5 } = {}) {
  const name = COUNTRY_NAME[ev.country] ?? ev.country;
  let best = null, bestSim = 0;
  for (const r of rows ?? []) {
    if (!r?.released || Math.abs(r.ms - Number(ev.ms)) > slackMs) continue;
    if (r.country !== name && NAME_COUNTRY[r.country] !== ev.country) continue;
    const sim = nameSimilarity(ev.event, r.event);
    if (sim > bestSim) { best = r; bestSim = sim; }
  }
  return bestSim >= minSim ? best : null;
}

/** Past surprises for the same release (same country and event name) from the surprise store rows { country, event, ms, estimate, actual }. */
export function historyFor(store = [], ev, { before, max = 60 } = {}) {
  const key = String(ev.event ?? '').trim().toLowerCase(), out = [];
  for (const x of store ?? []) {
    if (String(x.country).toUpperCase() !== String(ev.country).toUpperCase() || String(x.event ?? '').trim().toLowerCase() !== key) continue;
    if (before != null && !(x.ms < before)) continue;
    const a = parseValue(x.actual), e = parseValue(x.estimate);
    if (a && e) out.push({ ms: x.ms, s: a.v - e.v });
  }
  return out.sort((a, b) => a.ms - b.ms).slice(-max).map(x => x.s);
}

/**
 * The surprise: actual - estimate in the release's own units, and z = surprise / the standard deviation of past
 * surprises (null with fewer than 6 past prints, said so). `direction` is the raw sign: 'above' / 'below' / 'in line'.
 */
export function surprise({ actual, estimate, history = [] }) {
  const a = parseValue(actual), e = parseValue(estimate);
  if (!a || !e) return { ok: false, why: !a ? 'no actual yet' : 'no consensus to compare with' };
  const diff = +(a.v - e.v).toFixed(6), unit = a.unit || e.unit;
  const h = (history ?? []).filter(Number.isFinite);
  let z = null, sd = null;
  if (h.length >= 6) {
    const m = h.reduce((s, x) => s + x, 0) / h.length;
    sd = Math.sqrt(h.reduce((s, x) => s + (x - m) ** 2, 0) / (h.length - 1));
    z = sd > 0 ? +(diff / sd).toFixed(2) : null;
  }
  const size = z == null ? (diff === 0 ? 'in line' : null) : Math.abs(z) >= 2 ? 'large' : Math.abs(z) >= 1 ? 'clear' : Math.abs(z) >= 0.5 ? 'small' : 'in line';
  return { ok: true, actual: a.v, estimate: e.v, unit, diff, diffText: fmt(diff, unit), direction: diff > 0 ? 'above' : diff < 0 ? 'below' : 'in line', z, sd: sd == null ? null : +sd.toPrecision(3), n: h.length, size };
}

/** What the playbook says for this print: the biggest movers, their usual size, how much is kept, and the median after this side of surprise. */
export function playbookRead(pb, direction, { top = 4 } = {}) {
  if (!pb) return null;
  const side = direction === 'above' ? 'hot' : direction === 'below' ? 'cold' : null;
  const markets = Object.entries(pb.markets ?? {}).slice(0, top).map(([id, m]) => ({ id, label: m.label, unit: m.unit, n: m.n, abs30: m.abs30, abs240: m.abs240, kept: m.kept, peakMin: m.peakMin,
    after: side && m[side] ? { n: m[side].n, m30: m[side].m30, m240: m[side].m240 } : null }));
  return { family: pb.family, n: pb.n, from: pb.from, to: pb.to, side, markets };
}

/** The full record for one printed release. */
export function readRelease(ev, nasRow, { store = [], studyRows = [], now } = {}) {
  const actual = ev.actual ?? nasRow?.raw?.actual ?? null, estimate = ev.estimate ?? nasRow?.raw?.consensus ?? null;
  const fam = familyOf(ev.event, ev.country);
  const s = surprise({ actual, estimate, history: historyFor(store, ev, { before: Number(ev.ms) }) });
  const pb = fam ? playbook(studyRows, fam) : null;
  return { key: releaseKey(ev), country: ev.country, ccy: CCY_OF[ev.country] ?? null, event: ev.event, ms: Number(ev.ms), at: new Date(Number(ev.ms)).toISOString(),
    seenAt: now != null ? new Date(now).toISOString() : null, lagSec: now != null ? Math.round((now - Number(ev.ms)) / 1000) : null,
    actual: actual == null ? null : String(actual), estimate: estimate == null ? null : String(estimate), prev: ev.prev ?? nasRow?.raw?.previous ?? null,
    source: ev.actual != null ? 'forexfactory' : nasRow ? 'nasdaq' : null, family: fam, surprise: s, playbook: playbookRead(pb, s.direction) };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sg = (x, u) => (x == null ? '?' : `${x > 0 ? '+' : ''}${x}${u}`);
/** Telegram HTML for one release. */
export function surpriseMessage(r) {
  const s = r.surprise, head = `⚡ <b>${esc(r.country)} ${esc(r.event)}</b> · ${r.at.slice(11, 16)} UTC`;
  const line = s.ok ? `Actual <b>${esc(r.actual)}</b> vs consensus ${esc(r.estimate)}: <b>${esc(s.diffText)}</b> ${s.direction === 'in line' ? '(in line)' : `${s.direction} consensus`}`
    + (s.z != null ? ` · z ${s.z > 0 ? '+' : ''}${s.z} against its last ${s.n} prints (${s.size})` : s.n ? ` · only ${s.n} past prints, no z` : ' · no history for a z')
    : `Printed ${esc(r.actual ?? '?')}${r.estimate ? ` vs ${esc(r.estimate)}` : ''}: ${esc(s.why)}`;
  const out = [head, line];
  const p = r.playbook;
  if (p?.markets?.length) {
    out.push(`<i>Playbook ${esc(p.family)} (${p.n} releases ${esc(p.from)} to ${esc(p.to)}):</i>`);
    for (const m of p.markets) out.push(`• ${esc(m.label)}: usually ${m.abs30}${m.unit} at 30 min, ${m.abs240}${m.unit} at 4 h, ${Math.round((m.kept ?? 0) * 100)}% of the peak kept`
      + (m.after ? `; after ${p.side} prints (n ${m.after.n}) ${sg(m.after.m30, m.unit)} at 30 min, ${sg(m.after.m240, m.unit)} at 4 h` : ''));
  } else out.push('<i>No playbook history for this release family.</i>');
  out.push('<i>History with its count, not a forecast of this print.</i>');
  return out.join('\n');
}

/** Add a record to the log (newest first, one per key), capped. */
export function addToLog(log = [], rec, { keep = 300 } = {}) {
  return [rec, ...(log ?? []).filter(x => x.key !== rec.key)].sort((a, b) => b.ms - a.ms).slice(0, keep);
}
/** Forget sent keys older than `days` so the dedupe map stays small. */
export function pruneSent(sent = {}, now, { days = 10 } = {}) {
  return Object.fromEntries(Object.entries(sent ?? {}).filter(([, t]) => now - t < days * 864e5));
}
