// js/jarvis/explainCore.js: pure helpers for the EXPLAIN panel (point at a day, hear what surrounded it). No I/O. Tested in explainCore.test.mjs.
// Description only: nothing here forecasts or advises, and the validator strips any trade wording the model lets through.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const WINDOWS = [1, 3, 5];
export const NEWS_KEEP_HOURS = 72;   // js/newsAnalyst.js mergeWire keeps 72 h of headlines: an older day has no wire to read

export const isDate = d => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const normDays = d => (WINDOWS.includes(Number(d)) ? Number(d) : 1);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

/** The London dates of a window of `days` calendar days ending at `date` (oldest first). */
export function windowDates(date, days) { const n = normDays(days), out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(date, -i)); return out; }
/** Calendar-day gap from `date` to `today` (>= 0 for a past date). */
export const daysAgo = (date, today) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400e3);
/** Does the news wire (72 h) reach the window? full = whole window inside, partial = some, none = none. */
export function newsCoverage(date, days, today) {
  const first = windowDates(date, days)[0], oldestKept = addDays(today, -Math.floor(NEWS_KEEP_HOURS / 24));
  if (date < oldestKept) return 'none';
  return first >= oldestKept ? 'full' : 'partial';
}
export const cacheKey = (date, days, market) => `${date}|${normDays(days)}|${String(market ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20) || '*'}`;

/** Headlines whose London date is in the window, newest first. */
export function pickWindowNews(wire, dates, londonDate, { limit = 30, tier = 2 } = {}) {
  const set = new Set(dates);
  return (wire ?? []).filter(h => { const ms = h?.ms ?? Date.parse(h?.t); return Number.isFinite(ms) && set.has(londonDate(ms)) && (h.read?.tier ?? h.tier ?? 3) <= tier; })
    .map(h => ({ ...h, ms: h.ms ?? Date.parse(h.t) })).sort((a, b) => b.ms - a.ms).slice(0, limit);
}
export const newsLine = h => `- ${new Date(h.ms).toISOString().slice(0, 16).replace('T', ' ')}Z [${h.source ?? '?'}] ${String(h.title ?? '').slice(0, 200)}${h.read?.why ? ` (${String(h.read.why).slice(0, 160)})` : ''}`;

/** Events whose London date is in the window. */
export function pickWindowEvents(events, dates, londonDate) {
  const set = new Set(dates);
  return (events ?? []).filter(e => { const t = Date.parse(e?.t); return Number.isFinite(t) && set.has(londonDate(t)); });
}

/** The client's chain summary, reduced to known fields and clipped to 4 KB. */
export function cleanChain(c) {
  if (!c || typeof c !== 'object') return null;
  const s = v => String(v ?? '').slice(0, 120);
  const moved = (Array.isArray(c.moved) ? c.moved : []).slice(0, 24).map(m => ({ node: s(m?.node), text: s(m?.text) }));
  const links = (Array.isArray(c.links) ? c.links : []).slice(0, 24).map(l => ({ link: s(l?.link), verdict: s(l?.verdict) }));
  const out = { moved, links };
  return JSON.stringify(out).length <= 4096 ? out : { moved: moved.slice(0, 8), links: links.slice(0, 8) };
}

/** The day's desk run reduced to its headline and tone (null when there is none). */
export function deskHeadline(run) { const b = run?.head?.book ?? run?.book; return b?.headline ? { headline: String(b.headline).slice(0, 400), tone: b.global?.tone ?? null } : null; }

export function buildPrompt({ date, days, market, today, news = [], events = [], chain = null, desk = null, coverage = {} }) {
  const dates = windowDates(date, days);
  const system = `You are Jarvis, describing what was going on in markets, from the material below only. DESCRIPTION ONLY: say what moved and what surrounded it (headlines, scheduled releases, the money-chain read). Never forecast, never use "will", never give an entry, stop, target, buy, sell or recommendation, and never claim a headline caused a move: say "alongside" or "around". If the material does not cover the dates, say so plainly in notExplained. Plain words, at most 150 words in answer. Never invent a number.
Reply with JSON only: { "answer": "plain text", "drivers": [{ "claim": "...", "evidence": "the headline, release or chain link it rests on" }], "notExplained": "what the material cannot account for", "sources": ["short names of what you used"] }`;
  const prompt = `Window: ${dates[0]} to ${dates[dates.length - 1]} (London dates; today is ${today}).${market ? ` Market in focus: ${market}.` : ''}
Coverage: news ${coverage.news ?? 'none'} (${news.length} headlines), events ${events.length}, desk book ${desk ? 'present' : 'absent'}, chain summary ${chain ? 'present' : 'absent'}. Positioning (COT / option open interest) is not in this material.

## Headlines in the window
${news.length ? news.map(newsLine).join('\n') : '(none stored for these dates)'}

## Scheduled releases and events in the window
${events.length ? events.map(e => `- ${e.t} ${e.name ?? e.family}: ${String(e.line ?? '').slice(0, 300)}`).join('\n') : '(none stored for these dates)'}

## Money-chain summary as of ${date} (moved nodes and link verdicts)
${chain ? JSON.stringify(chain) : '(none sent)'}

## The desk book headline that day
${desk ? JSON.stringify(desk) : '(no desk run saved for that date)'}

Describe what was going on. JSON only.`;
  return { system, prompt };
}

// Trade / forecast wording. A sentence containing any of these is dropped (never repaired), mirroring the shared-read rule.
const TRADE_RE = /\b(buy|buying|sell|selling|long|short(?:ing)?|entry|enter|stop[- ]?loss|stops?|target|take[- ]profit|tp|sl|recommend\w*|should (?:buy|sell|go|add|trim)|will (?:rise|fall|go|rally|drop|reach|hit|break|likely|continue|move)|expect(?:ed)? to (?:rise|fall|rally|drop))\b/i;
export const hasTradeWording = t => TRADE_RE.test(String(t ?? ''));
const sentences = t => String(t ?? '').split(/(?<=[.!?])(\s+)/).reduce((a, x, i) => { if (i % 2) a[a.length - 1] += x; else a.push(x); return a; }, []).filter(x => x.trim());
/** Remove sentences with trade wording; returns { text, stripped }. */
export function stripTradeWording(text) {
  let stripped = 0; const keep = [];
  for (const s of sentences(text)) { if (TRADE_RE.test(s)) stripped++; else keep.push(s); }
  return { text: keep.join('').trim(), stripped };
}
export const clipWords = (t, n) => { const w = String(t ?? '').trim().split(/\s+/).filter(Boolean); return w.length <= n ? w.join(' ') : `${w.slice(0, n).join(' ')}...`; };

/** Validate and clean a parsed model reply. { ok, value, stripped } or { ok:false, errors }. */
export function validateExplain(j) {
  if (!j || typeof j !== 'object') return { ok: false, errors: ['not an object'] };
  let stripped = 0;
  const clean = (t, max) => { const r = stripTradeWording(String(t ?? '')); stripped += r.stripped; return clipWords(r.text, max); };
  const answer = clean(j.answer, 150);
  if (!answer) return { ok: false, errors: ['no answer left after removing trade wording'] };
  const drivers = (Array.isArray(j.drivers) ? j.drivers : []).slice(0, 6).map(d => ({ claim: clean(d?.claim, 40), evidence: clean(d?.evidence, 50) })).filter(d => d.claim);
  const notExplained = clean(j.notExplained, 60);
  const sources = (Array.isArray(j.sources) ? j.sources : []).slice(0, 10).map(s => String(s).slice(0, 80));
  return { ok: true, value: { answer, drivers, notExplained, sources }, stripped };
}
