/**
 * The news wire (/api/desk-news, js/newsImpact.js) drawn for the Desk Terminal: the News tab's headline list, its
 * filters and top-stories strip, the Pair tab's "Latest news for <market>" card and the Assets tab's one-line latest.
 *
 * A headline's tier is the analyst's read tier when there is one, else the feed's. Its keys are the currencies and
 * assets the read gives an impact for plus the ones the wire tagged it with (touches). A market's keys come from
 * newsImpact.marketKeys: an FX pair answers to its base and quote, an index to EQUITIES, gold to GOLD, WTI/Brent to
 * OIL. The direction a headline implies for a market is the server's own pairs[] entry when there is one (it carries
 * the card stance), else base minus quote from read.impact. Context, never a signal.
 *
 * Pure HTML-string builders, no fetch, no clock (pass `now`). Tested in js/terminal/terminal.test.mjs.
 */
import { marketKeys, stance as cardStance, TITLE_RX, titledImpact, pairImpacts, capPairs, isPreview } from '../newsImpact.js';

export const NEWS_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const NEWS_ASSETS = ['EQUITIES', 'GOLD', 'OIL'];
export const NEWS_KEYS = [...NEWS_CCYS, ...NEWS_ASSETS];
const KEY_LABEL = { EQUITIES: 'Equities', GOLD: 'Gold', OIL: 'Oil', CRYPTO: 'Crypto' };
export const keyLabel = k => KEY_LABEL[k] ?? k;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc as escNews };
/** Only http(s) links leave the page; anything else (javascript:, data:, junk) is dropped. */
export const safeHref = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : null; };
const link = (h, cls = 'nt-h') => { const u = safeHref(h?.link); return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(h.title)}</a>` : `<span class="${cls}">${esc(h?.title)}</span>`; };

export const tierOf = h => { const t = +(h?.read?.tier ?? h?.tier); return t >= 1 && t <= 3 ? t : 3; };
/** Every key the headline bears on: the read's impact keys and the wire's touches. */
export function keysOf(h) { const s = new Set(h?.touches ?? []); for (const k of Object.keys(h?.read?.impact ?? {})) s.add(k); return s; }
/** The keys a market answers to (['EUR','USD'] for EURUSD, ['EQUITIES'] for NQ), or [] when none. */
export const newsKeysFor = inst => marketKeys(String(inst ?? '').toUpperCase()) ?? [];

/** What a headline implies for one market: { dir (-4..4, 0 = none), stance: 'supports'|'against'|null }. */
export function marketDir(h, inst, rating = null) {
  const p = (h?.pairs ?? []).find(x => x.inst === inst);
  if (p && +p.dir) return { dir: +p.dir, stance: p.stance ?? cardStance(rating, +p.dir) };
  const k = newsKeysFor(inst), im = h?.read?.impact ?? {};
  const v = x => (Number.isFinite(+im[x]) ? +im[x] : 0);
  const dir = !k.length ? 0 : k.length === 2 ? v(k[0]) - v(k[1]) : v(k[0]);
  return { dir, stance: dir ? cardStance(rating, dir) : null };
}
/** Does the headline bear on this market? (its pairs[] names it, or it touches one of the market's keys) */
export function touchesMarket(h, inst) {
  if ((h?.pairs ?? []).some(p => p.inst === inst)) return true;
  const ks = keysOf(h);
  return newsKeysFor(inst).some(k => ks.has(k));
}

const newest = items => {
  const seen = new Set();
  return (items ?? []).filter(h => h && h.title && (h.id == null || (!seen.has(h.id) && seen.add(h.id)))).sort((a, b) => (+b.ms || 0) - (+a.ms || 0));
};

/**
 * The News tab's list. tier: 1 | 2 | 3 (= all); keys: any of these (empty = all); onlyBook: only headlines whose read
 * names one of today's live cards (book = { INST: rating }); q: every word must appear in the title, source, read or
 * topic. Newest first.
 */
export function filterNews(items, { tier = 3, keys = [], onlyBook = false, book = {}, q = '' } = {}) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const want = new Set(keys ?? []);
  return newest(items).filter(h => {
    if (tierOf(h) > tier) return false;
    if (want.size && ![...keysOf(h)].some(k => want.has(k)) && !(h.pairs ?? []).some(p => want.has(p.inst))) return false;
    if (onlyBook && !(h.pairs ?? []).some(p => p.stance || p.card || book[p.inst])) return false;
    if (words.length) {
      const hay = [h.title, h.source, ...(h.sources ?? []), h.read?.why, h.read?.book, h.topic].join(' ').toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Tier-1 headlines from the last `hours` (24: a quiet wire runs 6 h with no tier-1 story), newest first. */
export const topStories = (items, now, { hours = 24, max = 6 } = {}) => newest(items).filter(h => tierOf(h) === 1 && +h.ms >= now - hours * 3600e3).slice(0, max);

/**
 * Does the headline itself name one of the market's keys? The wire's read fans a story out to every pair of a currency it nudges
 * (review 2026-11-27: "Canadian Dollar draws support from BoC rate hike bets" read as USD down, then shown on 15 cards from USDCHF
 * to AUDUSD). A market's own news line keeps only headlines whose title names one of its keys; the wire's own fan-out is cut the same
 * way by tidyHeadline below (newsImpact.titledImpact).
 */
export function namesMarket(h, inst) {
  const keys = newsKeysFor(inst);
  // an index, gold or oil card answers to one asset key: a macro story the read scores on it directly ("US payrolls beat" → equities) stays
  if (keys.length === 1 && +(h?.read?.impact?.[keys[0]] ?? 0)) return true;
  const rx = keys.map(k => TITLE_RX[k]).filter(Boolean);
  return !rx.length || rx.some(r => r.test(String(h?.title ?? '')));
}
// ── the wire made honest (review 2026-11-27) ──
/**
 * One headline as the terminal shows it: the read restricted to the currencies its title names (newsImpact.titledImpact:
 * a rupee story loses its USD read), the markets recomputed from that read against the book (the server's cards, or
 * `book` = { INST: rating }) and capped at the book's markets plus 3, and no 5m / 30m verdict on a preview, forecast or
 * bank-research piece (newsImpact.isPreview). `read.dropped` lists the keys the read gave that the title does not name.
 */
export function tidyHeadline(h, book = null) {
  if (!h || h.tidy) return h;
  const out = { ...h, tidy: true, preview: isPreview(h.title) };
  const im = h.read?.impact;
  if (im && Object.keys(im).length) {
    const kept = titledImpact(im, h.title);
    out.read = { ...h.read, impact: kept, dropped: Object.keys(im).filter(k => !(k in kept) && +im[k]) };
    const bk = book ?? Object.fromEntries((h.pairs ?? []).filter(p => p.card).map(p => [p.inst, p.card]));
    out.pairs = pairImpacts(kept, { book: bk, extra: 3 });
  } else if (h.pairs) out.pairs = capPairs(h.pairs, 3);
  if (out.preview) out.react = null;
  return out;
}
const WORDS = t => new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w.length > 3));
const jaccard = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / ((a.size + b.size - n) || 1); };
/**
 * Near-identical stories folded into one row: the same lead source within `hours` (4) and titles sharing at least `min`
 * (0.6) of their words. The newest is kept and carries `similar` (the older titles). Newest first.
 */
export function dedupeNews(items, { hours = 4, min = 0.6 } = {}) {
  const kept = [];
  for (const h of newest(items)) {
    const w = WORDS(h.title), src = h.sources?.[0] ?? h.source;
    const twin = kept.find(k => (k.h.sources?.[0] ?? k.h.source) === src && Math.abs(k.h.ms - h.ms) <= hours * 3600e3 && jaccard(k.w, w) >= min);
    if (twin) { twin.h.similar = [...(twin.h.similar ?? []), { title: h.title, ms: h.ms }]; continue; }
    kept.push({ h: { ...h }, w });
  }
  return kept.map(k => k.h);
}

/**
 * The calendar print a headline is about (review 2026-11-27: the same Tokyo CPI, 2.9% against 3.0% expected, was read
 * "soft" at 00:27 and "hot" at 05:46, 08:29 and 10:38). `printed` = /api/calendar-feed printed.rows. A row matches when
 * it printed in the 30 h before the headline (or up to 5 min after its stamp), its country's currency is one the title
 * names, the title names the same kind of release (CPI / inflation, GDP, PMI, jobs, ...), and every place word in the
 * release's name ("Tokyo", "Spanish") is in the title, and the row has both an actual and a consensus (the check needs
 * both). Core prints are preferred when the title says core. A preview never matches. Returns the row or null.
 */
const COUNTRY_CCY = { 'United States': 'USD', US: 'USD', 'Euro Zone': 'EUR', Germany: 'EUR', France: 'EUR', Italy: 'EUR', Spain: 'EUR', 'United Kingdom': 'GBP', UK: 'GBP', Japan: 'JPY', Australia: 'AUD', 'New Zealand': 'NZD', Canada: 'CAD', Switzerland: 'CHF' };
const KINDS = [/\b(cpi|hicp|inflation|consumer prices?)\b/i, /\b(gdp|growth)\b/i, /\bpmi\b/i, /\b(payrolls|nfp|jobs|employment|unemployment|jobless)\b/i, /\bretail sales\b/i, /\bppi\b/i, /\b(wages?|earnings)\b/i];
const PLAIN = new Set(['core', 'cpi', 'hicp', 'gdp', 'pmi', 'ppi', 'inflation', 'consumer', 'price', 'prices', 'index', 'rate', 'change', 'final', 'prelim', 'preliminary', 'flash', 'advance', 'food', 'energy', 'fresh', 'and', 'ex', 'excl', 'excluding', 'the', 'of', 'non', 'farm', 'nonfarm', 'payrolls', 'employment', 'unemployment', 'retail', 'sales', 'trimmed', 'mean', 'annualized', 'growth', 'manufacturing', 'services', 'composite', 'national', 'harmonised', 'harmonized']);
const kindsOf = t => KINDS.map((rx, i) => (rx.test(t) ? i : -1)).filter(i => i >= 0);
export function printFor(h, printed) {
  const title = String(h?.title ?? ''), ms = +h?.ms; if (!title || !Number.isFinite(ms) || !printed?.length || isPreview(title)) return null;   // a preview is about a print still to come
  const tk = kindsOf(title); if (!tk.length) return null;
  const named = new Set(Object.keys(TITLE_RX).filter(k => TITLE_RX[k].test(title))), core = /\bcore\b/i.test(title), low = title.toLowerCase();
  const hits = printed.filter(r => {
    if (!(r?.released ?? true) || !Number.isFinite(+r.ms) || r.ms > ms + 5 * 60e3 || r.ms < ms - 30 * 3600e3) return false;
    if (r.consensus == null || !String(r.raw?.consensus ?? r.consensus).trim() || r.actual == null) return false;   // the check needs actual and consensus
    if (!named.has(COUNTRY_CCY[r.country])) return false;
    const ev = String(r.event ?? ''); if (!kindsOf(ev).some(k => tk.includes(k))) return false;
    const place = ev.toLowerCase().split(/[\s&()]+/).filter(w => w && !PLAIN.has(w) && /^[a-z]{4,}$/.test(w));
    return place.every(w => low.includes(w));
  });
  if (!hits.length) return null;
  const score = r => (/\bcore\b/i.test(r.event) === core ? 1 : 0);
  return hits.sort((a, b) => score(b) - score(a) || b.ms - a.ms)[0];
}
/** The print beside the headline: "print: Tokyo Core CPI 2.9% vs 3.0% expected · below expected". */
export function printChip(r) {
  if (!r) return '';
  const raw = r.raw ?? {}, a = String(raw.actual ?? r.actual ?? '').trim(), c = String(raw.consensus ?? r.consensus ?? '').trim(), pv = String(raw.previous ?? r.previous ?? '').trim();
  if (!a) return '';
  const cmp = Number.isFinite(+r.actual) && r.consensus != null && Number.isFinite(+r.consensus) && c ? (+r.actual > +r.consensus ? 'above expected' : +r.actual < +r.consensus ? 'below expected' : 'in line') : null;
  return `<span class="chip pur" title="The print this headline is about, from the economic calendar feed: check the headline's read against it">print: ${esc(r.event)} ${esc(a)}${c ? ` vs ${esc(c)} expected` : pv ? ` (previous ${esc(pv)})` : ''}${cmp ? ` · ${cmp}` : ''}</span>`;
}

/**
 * The wire's "The book:" note (Overview > News & events). The model writes it, and it can contradict its own arrows
 * (review 2026-11-27: USDJPY up "for card" beside "Against the USDJPY long"; "Against the AUDUSD short: AUD weakness
 * supports the position"; "supports the USD short side" with no USD short in the book). The line shown is computed
 * from the arrows and the cards (newsImpact.stance). The model's note is kept only when every clause in it that says
 * "supports" or "against" (or "benefits", "at risk", ...) names a market whose computed stance agrees and makes no group claim
 * ("JPY-cross shorts"), and it does not call the same print hot and soft.
 */
const SUP_RX = /\b(support|supports|supportive|helps?|backs?|favou?rs?|bolsters?|tailwind|benefits?|positive for|good for)\b/i, AG_RX = /\b(against|hurts?|undermines?|weighs on|headwind|threatens?|at risk|negative for|bad for|pressures?)\b/i;
// a claim about a group ("JPY-cross shorts", "the long USD cards", "the USD short side") cannot be checked market by market
const GROUP_RX = /\b(cross(es)?|cards|side|legs|longs|shorts|positions)\b/i;
/** The analyst calls the same print both hot and soft. */
export const mixedRead = t => /\bhot\b/i.test(String(t ?? '')) && /\bsoft\b/i.test(String(t ?? ''));
export function noteAgrees(note, pairs) {
  const t = String(note ?? ''); if (!t.trim()) return false;
  if (mixedRead(t)) return false;
  const by = Object.fromEntries((pairs ?? []).filter(p => p.stance).map(p => [p.inst, p.stance]));
  for (const cl of t.split(/[.;:]|,\s(?:but|while)\s/)) {
    const sup = SUP_RX.test(cl), ag = AG_RX.test(cl); if (!sup && !ag) continue;
    if (GROUP_RX.test(cl)) return false;
    const up = cl.toUpperCase().replace(/\//g, ''), insts = Object.keys(by).filter(n => up.includes(n));
    if (!insts.length) return false;
    const want = ag && !sup ? 'against' : sup && !ag ? 'supports' : null;
    if (!want || insts.some(n => by[n] !== want)) return false;
  }
  return true;
}
const side = r => (/LONG/.test(String(r ?? '')) ? 'long' : /SHORT/.test(String(r ?? '')) ? 'short' : '');
/** The computed "The book:" line, and the model's note only when it agrees (noteAgrees). '' when no card is touched. */
export function bookNoteHtml(h) {
  const ps = (h?.pairs ?? []).filter(p => p.stance && p.card);
  const grp = st => ps.filter(p => p.stance === st).map(p => `${esc(p.inst)} ${side(p.card)}`).join(', ');
  const sup = grp('supports'), ag = grp('against');
  if (!sup && !ag) return '';
  const note = h.read?.book && noteAgrees(h.read.book, h.pairs) ? ` <span class="muted">· ${esc(h.read.book)}</span>` : '';
  return `<div style="color:var(--gold);font-size:12.5px" title="Worked out from the arrows and today's cards; the analyst's own note is shown only when it agrees">The book: ${sup ? `supports ${sup}` : ''}${sup && ag ? '; ' : ''}${ag ? `against ${ag}` : ''}${note}</div>`;
}

/** The latest headlines that bear on a market (tier 1-2 by default), newest first, with what each implies for it. */
export function marketNews(items, inst, { n = 3, tier = 2, rating = null } = {}) {
  return newest(items).filter(h => tierOf(h) <= tier && touchesMarket(h, inst) && namesMarket(h, inst)).slice(0, n).map(h => ({ h, ...marketDir(h, inst, rating) }));
}

// ── formatting ──
const LONDON = 'Europe/London';
const dayKey = ms => new Date(ms).toLocaleDateString('en-GB', { timeZone: LONDON });
/** "14:05" today in London, "Wed 14:05" on an earlier day. */
export function whenTxt(ms, now) {
  if (!Number.isFinite(+ms)) return '–';
  const t = new Date(+ms).toLocaleTimeString('en-GB', { timeZone: LONDON, hour: '2-digit', minute: '2-digit' });
  return now != null && dayKey(+ms) !== dayKey(now) ? `${new Date(+ms).toLocaleDateString('en-GB', { timeZone: LONDON, weekday: 'short' })} ${t}` : t;
}
export const arrow = v => { const n = Math.min(2, Math.abs(Math.round(+v))) || 1; return (+v > 0 ? '↑' : '↓').repeat(n); };
const sources = h => { const s = h?.sources?.length ? h.sources : [h?.source].filter(Boolean); return s.length > 3 ? `${s.slice(0, 3).join(', ')} +${s.length - 3}` : s.join(', '); };
const tierChip = t => `<span class="chip ${t === 1 ? 'gold' : ''}" title="tier ${t}: ${t === 1 ? 'market-moving' : t === 2 ? 'relevant' : 'background'}">T${t}</span>`;
export function impactChips(h) {
  const im = h?.read?.impact ?? {}, ks = Object.keys(im).filter(k => +im[k]);
  if (ks.length) return ks.map(k => `<span class="chip ${+im[k] > 0 ? 'up' : 'dn'}" title="${esc(keyLabel(k))}: ${+im[k] > 0 ? 'up' : 'down'}${Math.abs(+im[k]) >= 2 ? ', strongly' : ''}">${esc(keyLabel(k))} ${arrow(im[k])}</span>`).join('');
  return [...new Set(h?.touches ?? [])].map(k => `<span class="chip" title="touches ${esc(keyLabel(k))}; no read">${esc(keyLabel(k))}</span>`).join('');
}
const STANCE = { supports: ['sup', 'supports your card'], against: ['ag', 'against your card'] };
export function marketChips(h, max = 6) {
  const ps = (h?.pairs ?? []).filter(p => +p.dir).slice().sort((a, b) => (b.stance ? 1 : 0) - (a.stance ? 1 : 0)).slice(0, max);
  if (!ps.length) return '';
  const more = (h.pairs.length > max) ? `<span class="muted" title="${esc(h.pairs.slice(max).map(p => p.inst).join(', '))}">+${h.pairs.length - max} more market${h.pairs.length - max === 1 ? '' : 's'}</span>` : '';
  return `<div class="nwp">${ps.map(p => `<span class="${STANCE[p.stance]?.[0] ?? ''}">${esc(p.inst)} ${arrow(p.dir)}${STANCE[p.stance] ? ` <b>${STANCE[p.stance][1]}</b>` : ''}</span>`).join('')}${more}</div>`;
}
const RX = { with: ['up', 'moved with the read'], against: ['dn', 'moved against the read'], none: ['', 'no clear move'] };
/** The 5m / 30m reaction, only once it is known. */
export function reactionHtml(h) {
  if (h?.preview ?? isPreview(h?.title)) return '<div class="nwr"><span class="chip" title="A preview, forecast or bank-research piece has no event to react to, so no 5m / 30m verdict is scored">preview: no reaction scored</span></div>';
  const r = h?.react; if (!r) return '';
  const one = (k, lab) => (r[k]?.label ? `<span class="chip ${RX[r[k].label]?.[0] ?? ''}" title="mean move ${r[k].units > 0 ? '+' : ''}${esc(r[k].units)} typical ${lab} moves, the way of the read">${lab}: ${RX[r[k].label]?.[1] ?? esc(r[k].label)}</span>` : '');
  const t = one('m5', '5m') + one('m30', '30m');
  return t ? `<div class="nwr">${t}</div>` : '';
}

const droppedTxt = h => (h?.read?.dropped?.length ? `<span class="chip" title="The analyst also read ${esc(h.read.dropped.map(keyLabel).join(', '))}, which the headline does not name; that part of the read is left out">${esc(h.read.dropped.map(keyLabel).join(', '))} read dropped: not in the headline</span>` : '');
const similarTxt = h => (h?.similar?.length ? `<span class="muted" title="${esc(h.similar.map(x => x.title).join(' | '))}" style="font-size:12px"> · ${h.similar.length} near-identical stor${h.similar.length === 1 ? 'y' : 'ies'} folded in</span>` : '');
/** One headline row. `printed` = the calendar feed's printed rows (a headline about a print we hold shows it). */
export function rowHtml(h, { now, printed = null } = {}) {
  const t = tierOf(h), ch = impactChips(h) + droppedTxt(h) + printChip(printFor(h, printed));
  return `<div class="nt-row${t === 1 ? ' t1' : ''}"><div class="nt-meta"><span class="mono">${esc(whenTxt(h.ms, now))}</span>${tierChip(t)}<span class="nt-src">${esc(sources(h))}</span>${similarTxt(h)}</div>
${link(h)}${ch ? `<div class="nt-chips">${ch}</div>` : ''}${h.read?.why ? `<div class="muted nt-why">${esc(h.read.why)}${mixedRead(h.read.why) ? ' <span class="chip dn" title="The analyst calls the same print hot and soft; check the print">read contradicts itself</span>' : ''}</div>` : ''}${marketChips(h)}${reactionHtml(h)}</div>`;
}
export function listHtml(items, { now, limit = 120, printed = null } = {}) {
  if (!items?.length) return '<p class="muted" style="margin:8px 0">No headlines match. Try a wider tier or clear the filters.</p>';
  return items.slice(0, limit).map(h => rowHtml(h, { now, printed })).join('') + (items.length > limit ? `<p class="muted">${items.length - limit} older headlines not shown; narrow the filters.</p>` : '');
}
export function topStripHtml(items, now) {
  const xs = topStories(items, now);
  if (!xs.length) return '<div class="nt-top muted">No tier-1 headlines in the last 24 hours.</div>';
  return `<div class="nt-top"><span class="lbl">Top stories · tier 1, last 24 h</span>${xs.map(h => `<div class="nt-topi"><span class="mono muted">${esc(whenTxt(h.ms, now))}</span> ${link(h, 'nt-toph')} ${impactChips(h)}</div>`).join('')}</div>`;
}
/** The filter bar. state = { tier, keys, market, onlyBook, q } */
export function filtersHtml(st = {}) {
  const keys = new Set(st.keys ?? []);
  const tb = (v, l) => `<button type="button" data-nt-tier="${v}" aria-pressed="${(st.tier ?? 2) === v}">${l}</button>`;
  const kb = k => `<button type="button" data-nt-key="${k}" aria-pressed="${keys.has(k)}">${esc(keyLabel(k))}</button>`;
  return `<div class="filters nt-f"><span class="lbl">Tier</span>${tb(1, '1')}${tb(2, '1-2')}${tb(3, 'All')}</div>
<div class="filters nt-f"><button type="button" data-nt-key="" aria-pressed="${!keys.size}">All</button>${NEWS_KEYS.map(kb).join('')}${st.market ? `<span class="chip pur" title="filtered to this market's currencies">${esc(st.market)} <button type="button" data-nt-clear aria-label="Clear market filter" style="all:unset;cursor:pointer">✕</button></span>` : ''}</div>
<div class="nt-f2"><label class="nt-book"><input type="checkbox" data-nt-book${st.onlyBook ? ' checked' : ''}> Only headlines on today's book</label><input type="search" data-nt-q placeholder="Search headlines" value="${esc(st.q ?? '')}" aria-label="Search headlines"><span class="chip nt-ctx" title="The arrows are the news analyst's reading of the first move a headline implies. The Evidence Book holds no validated headline-direction rule (the bad-versus-good surprise test, news-asymmetry, is null), so they describe what the wire says. They are not a signal.">arrows: context only</span></div>`;
}

/** The Pair tab's card: the 3 latest headlines that bear on this market. */
export function pairCard(items, inst, { rating = null, now, name = inst } = {}) {
  const head = `<div class="ch"><span class="lbl">Latest news for ${esc(name)}</span></div>`;
  if (!newsKeysFor(inst).length && !(items ?? []).some(h => (h.pairs ?? []).some(p => p.inst === inst))) return `${head}<p class="muted">The news wire has no read key for this market (it reads currencies, equities, gold and oil).</p>`;
  const xs = marketNews(items, inst, { n: 3, rating });
  const rows = xs.map(({ h, dir, stance }) => `<div class="nt-prow"><div class="nt-meta"><span class="mono">${esc(whenTxt(h.ms, now))}</span>${tierChip(tierOf(h))}<span class="nt-src">${esc(sources(h))}</span></div>${link(h)}
<div class="nt-chips">${dir ? `<span class="chip ${dir > 0 ? 'up' : 'dn'}">${esc(inst)} ${arrow(dir)}</span>` : '<span class="chip">no read for this market</span>'}${STANCE[stance] ? `<span class="chip ${stance === 'supports' ? 'gold' : 'dn'}">${STANCE[stance][1]}</span>` : ''}</div></div>`).join('');
  return `${head}${rows || '<p class="muted">No tier-1/2 headlines for this market in the last 72 hours.</p>'}
<p style="margin:8px 0 0"><a href="#" data-news-more="${esc(inst)}">More news →</a></p><p class="muted" style="font-size:12px">Arrow = the first move the headline implies for this market. Context, never a signal.</p>`;
}

/**
 * The Assets-tab card's news line (owner 2026-11-10: "make the news line say what it means for this market"): the
 * latest tier-1/2 headline on this market, led by its read: which of the market's keys it moves (USD ↑), what that
 * means for the market (USDCAD ↑), and whether that supports or goes against today's card. The headline title follows;
 * the analyst's one-line why is the tooltip.
 */
export function latestLine(items, inst, rating = null) {
  const x = marketNews(items, inst, { n: 1, rating })[0];
  if (!x) return '';
  const im = x.h?.read?.impact ?? {}, keys = newsKeysFor(inst).filter(k => Number.isFinite(+im[k]) && +im[k] !== 0);
  const drv = keys.map(k => `${keyLabel(k)} ${arrow(+im[k])}`).join(', ');
  const live = /LONG|SHORT/.test(String(rating ?? ''));
  // judged against the card on screen, not the book the wire saw when it read the headline (the card can change in the day)
  x.stance = rating != null ? cardStance(rating, x.dir) : x.stance;
  const meaning = x.dir
    ? `${drv ? `${esc(drv)} → ` : ''}<b class="${x.dir > 0 ? 'up' : 'dn'}">${esc(inst)} ${arrow(x.dir)}</b> · ${STANCE[x.stance] ? `<span class="${x.stance === 'supports' ? 'up' : 'dn'}">${STANCE[x.stance][1]}</span>` : live ? 'no read against the card' : 'card is flat'}`
    : '<span class="muted">no read for this market</span>';
  const tip = [x.h.title, x.h?.read?.why].filter(Boolean).join(' · ');
  return `<div class="nt-latest" title="${esc(tip)}"><span class="muted">news:</span> ${meaning}<div class="nt-latest-h">${esc(x.h.title)}</div></div>`;
}
