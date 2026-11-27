/**
 * The live surprise reader (owner, 2026-11-04, build list item 5). When a high-impact release prints, work out the
 * surprise (actual - consensus, in the release's own units, and as a z against that release's own past surprises
 * where the desk has them), look up the economist's playbook for the release family (js/releasePlaybook.js: the
 * typical 30-minute and 4-hour moves, how much of the move is usually kept, and the median move after hot and cold
 * prints) and say it on Telegram once per release, as soon as the free feed has the actual (usually 25-30 minutes after the print).
 *
 * It is history, labelled with its count: never a forecast that this print will move markets the same way.
 *
 * Pure: no fetch, no KV, no clock (pass `now`). Tested in js/surpriseReader.test.mjs.
 */
import { familyOf, playbook } from './releasePlaybook.js';

/** Keep watching a release for this long after its time for the actual to appear. */
// The free feed (Nasdaq) posts actuals about 25-30 minutes after the print: a 30-minute window recorded most high-impact releases as
// "no actual" (18 of 26 in Nov 2026) and never asked again. Three hours catches them; the lag is kept on each row.
export const WATCH_BEFORE_MS = 2 * 60_000, WATCH_AFTER_MS = 3 * 3600_000;
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
export const NO_NUMBER = /speaks|speech|testif|press conference|statement|minutes|hearing|summit|meetings?\b|holiday|outlook|report\b|votes?\b|election|auction|projections|forecasts?\b|summary/i;
/** High-impact releases whose time is inside the watch window and that have not been sent yet. */
export function dueReleases(events = [], now, sent = {}, { before = WATCH_BEFORE_MS, after = WATCH_AFTER_MS } = {}) {
  return (events ?? []).filter(e => /high/i.test(String(e.impact ?? '')) && !NO_NUMBER.test(String(e.event ?? '')) && Number.isFinite(Number(e.ms))
    && now >= Number(e.ms) - before && now <= Number(e.ms) + after && !sent[releaseKey(e)]);
}
/** Is any high-impact release near enough that the reader should fetch actuals this minute? */
export const anyDue = (events, now, sent) => dueReleases(events, now, sent).length > 0;

// Release names are compared as word sets. Period tags (m/m, y/y, MoM, YoY), print stages (prelim, flash, final) and filler words carry no
// identity; "n.s.a" / "s.a" do, so they are kept as one word each.
const DROP = new Set(['m', 'y', 'q', 'mm', 'yy', 'qq', 'mom', 'yoy', 'qoq', 'the', 'of', 'prelim', 'preliminary', 'flash', 'final', 'advance', 'estimate', 'u.k', 'uk']);
const words = s => String(s ?? '').toLowerCase().replace(/n\.s\.a\.?/g, ' nsa ').replace(/\bs\.a\.?/g, ' sa ').replace(/non-farm/g, 'nonfarm')
  .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !DROP.has(w));
/** Word overlap of two event names (0..1, against the shorter name). Kept for callers that only need a rough likeness. */
export function nameSimilarity(a, b) {
  const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
// ForexFactory and Nasdaq name a few releases with no words in common.
const NAME_ALIAS = [
  // whole names only: "ADP Non-Farm Employment Change" is a different release from payrolls
  [/^non-?farm employment change$/i, 'Nonfarm Payrolls'],
  [/^(official bank rate|cash rate|overnight rate|main refinancing rate|federal funds rate|(boj |snb )?policy rate|official cash rate)$/i, 'Interest Rate Decision'],
  [/^ism non-manufacturing pmi$/i, 'ISM Services PMI'],
];
export const aliasName = n => { for (const [rx, to] of NAME_ALIAS) if (rx.test(String(n ?? ''))) return to; return n; };
/** A release name as the matcher sees it: lower-case words, period tags and print stages dropped, vendor aliases applied. */
export const nameWords = n => words(aliasName(n));
// Words a candidate may carry beyond the calendar's name without becoming a different release ("Monthly CPI Indicator" is Australia's CPI y/y,
// "BoE Interest Rate Decision" is the Official Bank Rate). Any OTHER extra word ("U6", "Core", "Common", "Private", "n.s.a") makes it a
// different series: the old matcher scored "U6 Unemployment Rate" (7.9%) and "Common CPI" (2.5%) as perfect matches for the headline prints.
export const HARMLESS = new Set(['monthly', 'indicator', 'change', 'rate', 'fed', 'fomc', 'boe', 'ecb', 'boc', 'rba', 'rbnz', 'snb', 'boj']);
const close = (a, b) => a && b && a.unit === b.unit && Math.abs(a.v - b.v) <= (a.unit === '%' ? 0.0501 : Math.max(1e-9, Math.abs(b.v) * 0.01));
/**
 * Can `actual` be the print the calendar expects? Rejects a value in the wrong units, or a percentage too far from the calendar's own
 * consensus and previous to be the same release (a y/y 3.8% against an m/m consensus of 0.3%: the old matcher stored Canadian CPI m/m as
 * 2.5% vs 0.3%, z +10).
 */
export function plausibleActual(ev, actual) {
  const a = parseValue(actual); if (!a) return false;
  const refs = [parseValue(ev?.estimate), parseValue(ev?.prev)].filter(Boolean); if (!refs.length) return true;
  if (refs.every(r => r.unit !== a.unit) && !(refs.every(r => r.unit === '') && a.unit === '')) return false;
  if (a.unit !== '%') return true;
  return refs.some(r => r.unit === '%' && Math.abs(a.v - r.v) <= Math.max(1.0, 2 * Math.abs(r.v)));
}
/**
 * The Nasdaq row ({ ms, country (name), event, raw.actual, raw.consensus, raw.previous, released }) for a ForexFactory event, or null.
 * Scored on: how much of the calendar's name the row covers, extra words that make it a different series, whether its consensus and previous
 * agree with the calendar's (which tells Nasdaq's same-named m/m and y/y rows apart), and whether its value is plausible at all.
 */
export function matchActual(ev, rows = [], { slackMs = 5 * 60_000, minCover = 0.5 } = {}) {
  const name = COUNTRY_NAME[ev.country] ?? ev.country;
  const E = new Set(words(aliasName(ev.event))); if (!E.size) return null;
  const est = parseValue(ev.estimate), prev = parseValue(ev.prev);
  let best = null, bestScore = -Infinity;
  for (const r of rows ?? []) {
    if (!r?.released || Math.abs(r.ms - Number(ev.ms)) > slackMs) continue;
    if (r.country !== name && NAME_COUNTRY[r.country] !== ev.country) continue;
    const C = new Set(words(r.event));
    let hit = 0; for (const w of E) if (C.has(w)) hit++;
    const cover = hit / E.size; if (cover < minCover) continue;
    if (!plausibleActual(ev, r.raw?.actual)) continue;
    const extra = [...C].filter(w => !E.has(w) && !HARMLESS.has(w)).length;
    const cons = parseValue(r.raw?.consensus), pr = parseValue(r.raw?.previous);
    const score = cover - 0.6 * extra + (close(cons, est) ? 2 : cons && est ? -0.5 : 0) + (close(pr, prev) ? 1 : 0);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return bestScore > 0.3 ? best : null;
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
  // A "surprise" several times larger than any in the release's last 60 prints, at |z| >= 5, is almost always the wrong row on the feed
  // (U6 unemployment 7.9% read as the headline rate; Canada's y/y CPI read as m/m): it is held back, shown, and not scored.
  const maxAbs = h.length >= 12 ? Math.max(...h.map(Math.abs)) : null;
  if (maxAbs > 0 && z != null && Math.abs(z) >= 5 && Math.abs(diff) > 3 * maxAbs) {
    return { ok: false, heldBack: true, actual: a.v, estimate: e.v, unit, diff, diffText: fmt(diff, unit), z, n: h.length,
      why: `held back: ${fmt(diff, unit)} is ${+(Math.abs(diff) / maxAbs).toFixed(1)}× the largest surprise in its last ${h.length} prints, most likely a different release on the feed` };
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
/**
 * Re-checks a stored log against today's rules: a row whose actual is implausible for the release, or whose surprise is now held back, is kept
 * (so it shows) but marked `rejected` and no longer counts as a read. Rows logged before the 2026-11-27 matcher fix stored U6 unemployment and
 * Canada's y/y CPI as headline prints; this stops them feeding "Expectations vs reality" and the live layer.
 */
export function recheckLog(log = [], store = []) {
  return (log ?? []).map(r => {
    if (!r || r.rejected || r.actual == null || !r.surprise?.ok) return r;
    const bad = !plausibleActual({ estimate: r.estimate, prev: r.prev }, r.actual);
    const s = bad ? null : surprise({ actual: r.actual, estimate: r.estimate, history: historyFor(store, r, { before: Number(r.ms) }) });
    if (!bad && s.ok) return r;
    return { ...r, rejected: true, surprise: { ok: false, heldBack: true, diffText: r.surprise.diffText, z: r.surprise.z ?? null,
      why: bad ? 'held back: not a plausible value for this release (a different row on the feed)' : s.why } };
  });
}
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
