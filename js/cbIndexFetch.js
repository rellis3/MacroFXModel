// js/cbIndexFetch.js — generic index-page link discovery for central banks
// whose document URLs aren't directly constructible from a date the way the
// Fed's are (see js/fomcFetch.js's header comment). The ECB (and likely
// BoE/BoJ) publish through a hashed-URL scheme — e.g.
// ecb.is260611~372040d313.en.html — where the trailing hash is
// unpredictable. The only reliable way to get the real URL is to find it on
// an index/listing page the bank itself publishes. Two matching strategies,
// both pure and unit-tested on synthetic HTML fixtures (this sandbox cannot
// fetch a live index page to verify against — see the fetch module headers
// that use these for the same caveat already applied to the FOMC build).

// For documents whose URL embeds a KNOWN, predictable date fragment (e.g.
// ECB's statement URLs use the meeting date itself, just followed by an
// unguessable hash) — regex-matches the href directly on the index page's
// raw HTML. No assumption about surrounding page structure beyond "it's a
// real href attribute somewhere in the document."
export function findLinkByUrlDatePattern(html, prefix, datePart) {
  const re = new RegExp(`href="([^"]*\\b${prefix}${datePart}~[a-z0-9]+\\.en\\.html)"`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

// For documents whose URL date is NOT predictable (e.g. ECB's Accounts
// publish 5+ weeks after the meeting on a date that isn't derivable from the
// meeting date), but the index page's own link TEXT names the meeting date
// in prose ("Meeting of 17-18 December 2025"). Lower-confidence than the
// URL-pattern match above — best-effort proximity match: the first <a> whose
// visible text contains ALL of the given terms (case-insensitive), e.g.
// ['17', 'December', '2025'] to match either end of a 2-day meeting. Callers
// should try both day-numbers of a 2-day meeting before giving up.
export function findLinkByDateText(html, terms) {
  const anchorRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchorRe)) {
    const [, href, inner] = m;
    const text = inner.replace(/<[^>]+>/g, ' ');
    if (terms.every(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text))) return href;
  }
  return null;
}

// href from either finder above may be relative ("/press/..."); resolve
// against the site origin so callers always get a fetchable absolute URL.
export function resolveUrl(href, origin) {
  if (!href) return null;
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return origin.replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href);
}
