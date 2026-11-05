/**
 * The news wire's plumbing (owner, 2026-11-05): which feeds it polls, the back-off that keeps a slow or failing feed
 * from costing the others anything, and the breaking-headline Telegram note with its throttle.
 *
 * Every feed was checked from the build container on 2026-11-05 (curl, then parsed with js/newsAnalyst.js parseFeed).
 * Refused there, not added: FXStreet www.fxstreet.com/rss/news (403; its xml.fxstreet.com feed works and is used),
 * RBNZ /hub/news/rss (403; /feeds/news works), BLS (403), IMF news (403), DailyFX (403), CNBC (403), Treasury OFAC
 * (403). Reachable but not added: FX Empire (its feed was months stale), BBC business and the FT front page (general
 * news), the Bundesbank and the Riksbank (no NOK/SEK or Bundesbank tag on the wire).
 *
 * Pure: no fetch, no clock (pass `now`). Tested in js/newsOps.test.mjs.
 */

/** [name, url]. Names that are central banks match newsAnalyst.js SOURCE_CCY / OFFICIAL (their policy items are tier 1). */
export const NEWS_SOURCES = [
  ['Fed', 'https://www.federalreserve.gov/feeds/press_all.xml'],
  ['ECB', 'https://www.ecb.europa.eu/rss/press.html'],
  ['BoE', 'https://www.bankofengland.co.uk/rss/news'],
  ['BoJ', 'https://www.boj.or.jp/en/rss/whatsnew.xml'],
  ['RBA', 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml'],
  ['BoC', 'https://www.bankofcanada.ca/content_type/press-releases/feed/'],
  ['SNB', 'https://www.snb.ch/public/en/rss/pressrel'],
  ['RBNZ', 'https://www.rbnz.govt.nz/feeds/news'],
  ['BEA', 'https://apps.bea.gov/rss/rss.xml'],
  ['ForexLive', 'https://www.forexlive.com/feed/news'],
  ['FXStreet', 'https://xml.fxstreet.com/news/forex-news/index.xml'],
  ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['Investing.com', 'https://www.investing.com/rss/news_1.rss'],
  ['Yahoo', `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent('EURUSD=X,GBPUSD=X,JPY=X,GC=F,CL=F,^GSPC,DX-Y.NYB,^TNX')}&region=US&lang=en-US`],
];

export const POLL_MIN = 2;
/**
 * A feed's next allowed attempt after this one. Success: the next poll. Failure: double the wait each time in a row
 * (2, 4, 8, 16 min), capped at `maxMin`. Returns the new per-feed state { fails, nextAt, lastOk, lastError }.
 */
export function backoff(prev, ok, now, { everyMin = POLL_MIN, maxMin = 30, error = null } = {}) {
  const p = prev ?? { fails: 0, nextAt: 0, lastOk: null, lastError: null };
  if (ok) return { fails: 0, nextAt: now + everyMin * 60e3 - 15e3, lastOk: now, lastError: null };
  const fails = (p.fails ?? 0) + 1;
  return { fails, nextAt: now + Math.min(maxMin, everyMin * 2 ** fails) * 60e3 - 15e3, lastOk: p.lastOk ?? null, lastError: error ?? 'failed' };
}
/** The feeds due now (a feed with no state is due). */
export const dueSources = (sources, state, now) => (sources ?? []).filter(([name]) => !(state?.[name]?.nextAt > now));

/**
 * The breaking-alert throttle: at most one note per headline id, at most `perHour` in any rolling hour.
 * state = { sent: { id: ms }, times: [ms] }. Returns { ok, why, state } (state updated only when ok).
 */
export function allowAlert(state, id, now, { perHour = 6, keepH = 96 } = {}) {
  const s = { sent: { ...(state?.sent ?? {}) }, times: (state?.times ?? []).filter(t => now - t < 3600e3) };
  for (const [k, t] of Object.entries(s.sent)) if (now - t > keepH * 3600e3) delete s.sent[k];
  if (id in s.sent) return { ok: false, why: 'already sent', state: s };
  if (s.times.length >= perHour) return { ok: false, why: `cap ${perHour} an hour`, state: s };
  s.sent[id] = now; s.times.push(now);
  return { ok: true, why: null, state: s };
}

/** Which headlines qualify for a breaking note: tier 1 by the read, with an impact, recent, not yet sent. */
export const breakingCandidates = (wire, now, { maxAgeMin = 60, sent = {} } = {}) => (wire ?? [])
  .filter(h => (h.read?.tier ?? h.tier) === 1 && Object.keys(h.read?.impact ?? {}).length && now - (h.firstSeen ?? h.ms) <= maxAgeMin * 60e3 && !(h.id in (sent ?? {})))
  .sort((a, b) => a.ms - b.ms);

const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const arrows = v => (v > 0 ? '▲' : '▼').repeat(Math.min(2, Math.abs(v)) || 1);
/** The Telegram note (HTML): headline, source(s), impact per currency, and the book cards it bears on. */
export function breakingMessage(h, pairs = []) {
  const im = Object.entries(h.read?.impact ?? {}).map(([k, v]) => `${k} ${arrows(v)}`).join(' · ');
  const cards = (pairs ?? []).filter(p => p.stance);
  const sup = cards.filter(p => p.stance === 'supports').map(p => `${p.inst} ${String(p.card).replace('STRONG_', '').toLowerCase()}`);
  const ag = cards.filter(p => p.stance === 'against').map(p => `${p.inst} ${String(p.card).replace('STRONG_', '').toLowerCase()}`);
  const srcs = h.sources?.length ? h.sources.join(', ') : h.source;
  return [`📰 <b>${esc(h.title)}</b>`, h.read?.why ? esc(h.read.why) : null, im ? `Read: ${esc(im)}` : null,
    sup.length ? `Supports: ${esc(sup.join(', '))}` : null, ag.length ? `Against: ${esc(ag.join(', '))}` : null,
    !cards.length ? 'No live card on these markets.' : null,
    `<i>${esc(srcs)} · context, not a signal</i>`].filter(Boolean).join('\n');
}
