/**
 * Agent 21: the news analyst (plans/DESK_ANALYST_PIPELINE.md §9z). A headline wire for the desk: central-bank feeds,
 * Finnhub's forex and general news (FINNHUB_KEY), market RSS. Every headline is tagged here by rule (the currencies
 * and markets it touches, the topic, a tier); the server then asks a model to read the new tier-1 and tier-2 ones
 * (which way each currency, in one line why, and whether it changes the book). Tier 1 goes to the Desk Terminal's
 * ticker, the session updates, the chief of staff and, through the Desk Pack feed desk-news, the morning events analyst.
 *
 * A headline is context: the desk never trades one. Pure. Tested in js/newsAnalyst.test.mjs.
 */

const decode = s => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim();
const tagOf = (xml, t) => { const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')); return m ? decode(m[1]) : null; };

/** RSS <item> or Atom <entry> → [{ title, link, ms, source }]. */
export function parseFeed(xml, source) {
  const out = [], blocks = [...String(xml ?? '').matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(m => m[0]);
  for (const b of blocks) {
    const title = tagOf(b, 'title'); if (!title) continue;
    const link = tagOf(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/i) ?? [])[1] || null;
    const when = tagOf(b, 'pubDate') || tagOf(b, 'published') || tagOf(b, 'updated') || tagOf(b, 'dc:date');
    const ms = Date.parse(when ?? ''); out.push({ title, link, ms: Number.isFinite(ms) ? ms : null, source });
  }
  return out;
}
/** Finnhub /news rows → the same shape. */
export const fromFinnhub = (rows, source = 'Finnhub') => (Array.isArray(rows) ? rows : []).filter(r => r?.headline).map(r => ({ title: decode(r.headline), link: r.url ?? null, ms: Number(r.datetime) * 1000 || null, source: r.source ? `${source}/${r.source}` : source, summary: decode(r.summary ?? '').slice(0, 300) || null }));

// What a headline touches. Words, not names of officials (the desk never names a central banker).
const TOUCH = [
  ['USD', /\b(fed|fomc|federal reserve|treasur(y|ies)|u\.s(?=\.)|us (economy|inflation|jobs|data|yields?)|dollar|greenback|payrolls?|nfp|jobless claims|white house|washington|ism)\b/i],
  ['EUR', /\b(ecb|euro(zone| area)?|eu\b|european (central bank|union|commission)|germany|german|bund|france|french|italy|italian|spain)\b/i],
  ['GBP', /\b(boe|bank of england|sterling|pound|uk|u\.k(?=\.)|britain|british|gilts?)\b/i],
  ['JPY', /\b(boj|bank of japan|yen|japan|japanese|jgbs?)\b/i],
  ['AUD', /\b(rba|reserve bank of australia|aussie|australia|australian)\b/i],
  ['NZD', /\b(rbnz|kiwi|new zealand)\b/i],
  ['CAD', /\b(boc|bank of canada|loonie|canada|canadian)\b/i],
  ['CHF', /\b(snb|swiss national bank|swiss|franc|switzerland)\b/i],
  ['GOLD', /\b(gold|bullion|precious metals?)\b/i],
  ['OIL', /\b(oil|crude|opec\+?|brent|wti|barrels?)\b/i],
  ['EQUITIES', /\b(stocks?|equit(y|ies)|wall street|nasdaq|s&p|dow|shares|nikkei|dax|ftse)\b/i],
  ['CRYPTO', /\b(bitcoin|crypto|ether(eum)?)\b/i],
];
const TOPIC = [
  ['central bank', /\b(rate (decision|cut|hike|path)|cuts? rates?|hikes? rates?|holds? rates?|policy rate|monetary policy|minutes|fomc|ecb|boe|boj|rba|rbnz|snb|bank of (england|japan|canada)|federal reserve|central bank|hawkish|dovish|basis points?)\b/i],
  ['data', /\b(cpi|inflation|pce|gdp|payrolls?|jobs report|unemployment|retail sales|pmi|ism|jobless|wages?|trade balance|industrial production)\b/i],
  ['geopolitics', /\b(war|attacks?|strikes?|struck|airstrikes?|bomb(s|s|ed|ing)?|missiles?|invasion|ceasefire|truce|peace (deal|talks)|settlement|sanctions?|troops|conflict|nuclear|elections?|coup|iran|israel|gaza|russia|ukraine|north korea|taiwan|houthis?|red sea)\b/i],
  ['trade', /\b(tariffs?|trade (war|deal|talks)|export controls?|import duties)\b/i],
  ['fiscal', /\b(budget|deficit|debt ceiling|shutdown|fiscal|stimulus|spending bill|bond auction|refunding)\b/i],
  ['energy', /\b(opec\+?|oil (output|supply|production)|crude inventor(y|ies)|gas prices?)\b/i],
  ['earnings', /\b(earnings|revenue|profit (warning|beat|miss)|guidance)\b/i],
];
const BIG = /\b(surprise|unexpected(ly)?|shock|emergency|cuts? rates?|hikes? rates?|raises? rates?|lowers? rates?|rate decision|holds? rates?|intervene|intervention|resign|default|downgrade|war|invasion|attacks?|bomb(s|ed|ing)?|airstrikes?|missiles?|sanctions?|tariffs?|ceasefire|record (high|low)|plunges?|soars?|crash|collapse)\b/i;
const OFFICIAL = /^(Fed|ECB|BoE|BoJ|RBA|RBNZ|BoC|SNB)\b/;
// From a central bank's own feed, only monetary policy is tier 1 (not supervision notices, speeches on payments, etc.)
const POLICY = /\b(monetary policy|policy rate|interest rates?|rate decision|bank rate|deposit facility|fomc)\b/i;
const SOURCE_CCY = { Fed: 'USD', ECB: 'EUR', BoE: 'GBP', BoJ: 'JPY', RBA: 'AUD', RBNZ: 'NZD', BoC: 'CAD', SNB: 'CHF', BEA: 'USD' };

/** The rule tags for one headline: { ccys, topic, tier }. Tier 1 = market-moving, 2 = macro-relevant, 3 = background. */
export function tagHeadline(h) {
  const text = `${h.title} ${h.summary ?? ''}`;
  const own = SOURCE_CCY[String(h.source ?? '').split('/')[0]];
  const touches = [...new Set([...(own ? [own] : []), ...TOUCH.filter(([, re]) => re.test(text)).map(([k]) => k)])];
  const topic = (TOPIC.find(([, re]) => re.test(text)) ?? ['other'])[0];
  const macro = ['central bank', 'data', 'geopolitics', 'trade', 'fiscal', 'energy'].includes(topic);
  const official = OFFICIAL.test(h.source ?? '');
  const tier = (official && POLICY.test(text)) || (!official && macro && BIG.test(text) && touches.length) ? 1 : (official || (macro && touches.length)) ? 2 : 3;
  return { touches, topic, tier };
}

const norm = t => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = t => new Set(norm(t).split(' ').filter(w => w.length > 3));
const idOf = h => `${h.ms}-${norm(h.title).slice(0, 40)}`;
/**
 * Merge new headlines into the stored wire, newest first, `hours` kept. The same story from several feeds is one item:
 * a near-duplicate (70% of the shorter title's words shared) adds its feed to the item's `sources` instead of a new
 * item. `firstSeen` is when the wire first had it (the reaction check starts there when a feed's stamp is far older).
 */
export function mergeWire(stored, incoming, { now = Date.now(), hours = 72, max = 500 } = {}) {
  const keep = (stored ?? []).filter(h => h.ms && now - h.ms < hours * 3600e3).map(h => ({ ...h, sources: h.sources?.length ? [...h.sources] : [h.source] }));
  const byId = new Map(keep.map(h => [h.id, h])), seen = keep.map(h => [words(h.title), h]), added = [];
  for (const h of incoming ?? []) {
    if (!h.ms || now - h.ms > hours * 3600e3 || h.ms > now + 10 * 60_000) continue;
    const w = words(h.title);
    const same = byId.get(idOf(h)) ?? seen.find(([s]) => { let k = 0; for (const x of w) if (s.has(x)) k++; return w.size && k / Math.min(w.size, s.size || 1) >= 0.7; })?.[1];
    if (same) { if (h.source && !same.sources.includes(h.source)) same.sources.push(h.source); continue; }
    const t = { id: idOf(h), ...h, sources: [h.source], firstSeen: now, ...tagHeadline(h) };
    keep.push(t); added.push(t); seen.push([w, t]); byId.set(t.id, t);
  }
  keep.sort((a, b) => b.ms - a.ms);
  return { wire: keep.slice(0, max), added };
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'GOLD', 'OIL', 'EQUITIES', 'CRYPTO'];
/**
 * The model's read of a batch: { items: [{ i, tier, impact: { USD: -2..+2 }, why, book }] } keyed back onto the batch.
 * Impact is an integer from -2 to +2 (2 = a strong push); 0 and anything unreadable are dropped, a fraction rounds
 * away from zero to at least 1. Readers that only look at the sign (v > 0) read it as before.
 */
export function validateRead(obj, batch) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) return { ok: false, errors: ['no items'] };
  const out = {};
  for (const x of obj.items) {
    const i = Number(x?.i); if (!Number.isInteger(i) || i < 0 || i >= batch.length) continue;
    const impact = {}; for (const [k, v] of Object.entries(x?.impact ?? {})) { const q = Number(v); if (CCYS.includes(k) && Number.isFinite(q) && q !== 0) impact[k] = Math.sign(q) * Math.min(2, Math.max(1, Math.round(Math.abs(q)))); }
    out[batch[i].id] = { tier: [1, 2, 3].includes(Number(x?.tier)) ? Number(x.tier) : batch[i].tier, impact, why: str(x?.why, 240) ?? '', book: str(x?.book, 200) ?? null, ...(str(x?.detail, 260) ? { detail: str(x?.detail, 260) } : {}) };
  }
  return Object.keys(out).length ? { ok: true, value: out } : { ok: false, errors: ['no usable item'] };
}

/** The headlines a reader (terminal, session update, morning desk) wants: since `sinceMs`, at or above `tier`, newest first. */
export function pick(wire, { sinceMs = 0, tier = 2, ccy = null, limit = 40 } = {}) {
  return (wire ?? []).filter(h => h.ms >= sinceMs && (h.read?.tier ?? h.tier) <= tier && (!ccy || h.touches.includes(ccy) || h.read?.impact?.[ccy])).slice(0, limit);
}
/** One line per headline for a prompt. */
export const wireText = hs => hs.map(h => `- ${new Date(h.ms).toISOString().slice(0, 16).replace('T', ' ')} [${h.source}] ${h.title}${h.read?.why ? ` — ${h.read.why}` : ''}${Object.keys(h.read?.impact ?? {}).length ? ` (${Object.entries(h.read.impact).map(([k, v]) => `${k}${(v > 0 ? '+' : '−').repeat(Math.min(2, Math.abs(v)) || 1)}`).join(' ')})` : ''}`).join('\n');
