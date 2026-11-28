// js/terminal/helixDiaryCore.js: HELIX MEMORY, the diary. Pure. Turns the stored daily records (helix/days/<date>.json) and their scores (helix/scores/<date>.json) into a readable
// day (what Helix said, part by part, with the view each line played over) and searches across days: keywords (every word must appear), a market, a release family, "unusual only".
// No model call: plain text matching. DESCRIPTION ONLY: a record of what was said, and how the words held up by the close.
import { marketName, spokenName } from './jarvisNames.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const PART_ORDER = ['morning', 'afternoon', 'evening'];
const KEY_RE = /^[A-Z0-9_]{2,12}$/;

/** Release families the search knows, each a pattern over the spoken text and the calendar names. */
export const FAMILIES = {
  CPI: /\bcpi\b|consumer price|inflation/i, PCE: /\bpce\b/i, PPI: /\bppi\b|producer price/i, NFP: /payroll|non-?farm|\bnfp\b/i, JOBS: /payroll|non-?farm|unemployment|jobless|claimant|employment/i,
  FOMC: /fomc|\bfed\b|federal funds|powell/i, ECB: /\becb\b|lagarde|euro area rate|main refinancing/i, BOE: /\bboe\b|bank of england|bank rate|bailey/i, BOJ: /\bboj\b|bank of japan/i,
  GDP: /\bgdp\b|gross domestic/i, PMI: /\bpmi\b|purchasing managers/i, RETAIL: /retail sales/i,
};
export const UNUSUAL_AT = 2;      // a market at twice its usual move or more makes a day "unusual"

/** One run's spoken lines: [{ i, kind, title, view, text }] (bumpers and empty lines dropped). */
const linesOf = run => (run?.plan ?? []).map((x, i) => ({ i, kind: x?.kind ?? null, title: x?.title ?? null, view: x?.view ?? null, text: typeof x?.text === 'string' ? x.text : '' })).filter(x => x.text);

/**
 * A stored day for the diary panel: { date, updatedAt, parts: [{ part, savedAt, mode, headline, movers, events, lines, claims, degraded }], markets, families, unusual, maxRatio, score }.
 * score: the day's score file trimmed to { scoredAt, counts, results } or null.
 */
export function diaryDay(record, score = null) {
  if (!record?.date) return null;
  const runs = record.runs ?? {}, ix = p => { const i = PART_ORDER.indexOf(p); return i < 0 ? 99 : i; }, names = Object.keys(runs).sort((a, b) => ix(a) - ix(b));
  const parts = names.map(part => {
    const r = runs[part] ?? {};
    return { part, savedAt: r.savedAt ?? null, mode: r.mode ?? null, headline: r.headline?.headline ?? null, movers: (r.inputs?.movers ?? []).filter(m => m?.key), events: r.inputs?.events?.first ?? [],
      lines: linesOf(r), claims: Array.isArray(r.claims) ? r.claims : [], degraded: r.degraded ?? [], dayDelta: r.inputs?.dayDelta?.text ?? null };
  });
  const markets = new Set(), fams = new Set(); let maxRatio = 0;
  for (const p of parts) {
    for (const m of p.movers) { markets.add(m.key); if (fin(m.vsUsual)) maxRatio = Math.max(maxRatio, Math.abs(m.vsUsual)); }
    for (const c of p.claims) { for (const k of [c.key, c.anchor, ...(c.members ?? []).map(x => x.k)]) if (k && KEY_RE.test(k)) markets.add(k); if (c.kind === 'mover_big' && fin(c.ratio)) maxRatio = Math.max(maxRatio, Math.abs(c.ratio)); }
    const txt = [p.headline, ...p.lines.map(l => l.text), ...p.events.map(e => e?.event)].filter(Boolean).join(' ');
    for (const [f, re] of Object.entries(FAMILIES)) if (re.test(txt)) fams.add(f);
  }
  const sc = score ? { scoredAt: score.scoredAt ?? null, counts: score.counts ?? {}, results: (score.results ?? []).map(r => ({ id: r.id, kind: r.kind, part: r.part, key: r.key, hit: r.hit, why: r.why })) } : null;
  return { date: record.date, updatedAt: record.updatedAt ?? null, parts, markets: [...markets].sort(), families: [...fams].sort(), unusual: maxRatio >= UNUSUAL_AT, maxRatio: Math.round(maxRatio * 100) / 100, score: sc };
}

/** Parse the search box: words (lower case, 2+ letters, quotes keep a phrase) -> [term]. */
export function terms(q) {
  const out = []; const s = String(q ?? '').toLowerCase().slice(0, 200);
  for (const m of s.matchAll(/"([^"]+)"|(\S+)/g)) { const t = (m[1] ?? m[2]).trim().replace(/[^\p{L}\p{N} .%-]+/gu, ''); if (t.length >= 2) out.push(t); }
  return out.slice(0, 8);
}
/** Does a day name the market: in its movers or claims, or by name in what was said. */
const namesMarket = (d, key) => d.markets.includes(key) || d.parts.some(p => p.lines.some(l => { const t = l.text.toLowerCase(); return t.includes(spokenName(key).toLowerCase()) || t.includes(marketName(key).toLowerCase()); }));

/**
 * Search diary days (diaryDay shapes, any order). opts: { q, market (desk key), family (FAMILIES id), unusual (bool), limit }.
 * Every term must appear somewhere in the day (headline, lines, events); hits are the lines holding a term, with a snippet. Newest day first:
 * [{ date, unusual, families, score: { hits, n } | null, hits: [{ part, i, title, view, snippet }] }].
 */
export function searchDiary(days, { q = '', market = null, family = null, unusual = false, limit = 40 } = {}) {
  const T = terms(q), fam = family && FAMILIES[String(family).toUpperCase()] ? String(family).toUpperCase() : null, mk = market && KEY_RE.test(String(market).toUpperCase()) ? String(market).toUpperCase() : null;
  const out = [];
  for (const d of [...(days ?? [])].filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (unusual && !d.unusual) continue;
    if (fam && !d.families.includes(fam)) continue;
    if (mk && !namesMarket(d, mk)) continue;
    const blob = d.parts.map(p => [p.headline, ...p.lines.map(l => l.text), ...p.events.map(e => e?.event)].filter(Boolean).join(' ')).join(' ').toLowerCase();
    if (T.some(t => !blob.includes(t))) continue;
    const hits = [];
    for (const p of d.parts) for (const l of p.lines) {
      const lt = l.text.toLowerCase(), t = T.find(x => lt.includes(x)) ?? (mk ? [spokenName(mk), marketName(mk)].map(x => x.toLowerCase()).find(x => lt.includes(x)) : null) ?? (fam ? (lt.match(FAMILIES[fam]) ?? [])[0]?.toLowerCase() : null);
      if (!t && (T.length || mk || fam)) continue;
      const at = t ? lt.indexOf(t) : 0, a = Math.max(0, at - 70), b = Math.min(l.text.length, at + (t?.length ?? 0) + 110);
      hits.push({ part: p.part, i: l.i, title: l.title, view: l.view, snippet: `${a > 0 ? '…' : ''}${l.text.slice(a, b)}${b < l.text.length ? '…' : ''}` });
      if (hits.length >= 6) break;
    }
    const c = d.score?.counts ? Object.values(d.score.counts).reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0]) : null;
    out.push({ date: d.date, unusual: d.unusual, maxRatio: d.maxRatio, families: d.families, markets: d.markets.slice(0, 12), score: c ? { hits: c[0], n: c[1] } : null, hits });
    if (out.length >= limit) break;
  }
  return out;
}

/** Dates YYYY-MM-DD from..to inclusive, newest last, at most max (the range is clipped to its newest end). */
export function dateRange(from, to, max = 120) {
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')); if (!ok(from) || !ok(to) || from > to) return [];
  const out = []; for (let t = Date.parse(`${to}T12:00:00Z`), f = Date.parse(`${from}T12:00:00Z`); t >= f && out.length < max; t -= 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out.reverse();
}
