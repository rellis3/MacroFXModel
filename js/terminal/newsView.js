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
import { marketKeys, stance as cardStance } from '../newsImpact.js';

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

/** Tier-1 headlines from the last `hours` (6), newest first. */
export const topStories = (items, now, { hours = 6, max = 6 } = {}) => newest(items).filter(h => tierOf(h) === 1 && +h.ms >= now - hours * 3600e3).slice(0, max);

/** The latest headlines that bear on a market (tier 1-2 by default), newest first, with what each implies for it. */
export function marketNews(items, inst, { n = 3, tier = 2, rating = null } = {}) {
  return newest(items).filter(h => tierOf(h) <= tier && touchesMarket(h, inst)).slice(0, n).map(h => ({ h, ...marketDir(h, inst, rating) }));
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
  const more = (h.pairs.length > max) ? `<span class="muted">+${h.pairs.length - max}</span>` : '';
  return `<div class="nwp">${ps.map(p => `<span class="${STANCE[p.stance]?.[0] ?? ''}">${esc(p.inst)} ${arrow(p.dir)}${STANCE[p.stance] ? ` <b>${STANCE[p.stance][1]}</b>` : ''}</span>`).join('')}${more}</div>`;
}
const RX = { with: ['up', 'moved with the read'], against: ['dn', 'moved against the read'], none: ['', 'no clear move'] };
/** The 5m / 30m reaction, only once it is known. */
export function reactionHtml(h) {
  const r = h?.react; if (!r) return '';
  const one = (k, lab) => (r[k]?.label ? `<span class="chip ${RX[r[k].label]?.[0] ?? ''}" title="mean move ${r[k].units > 0 ? '+' : ''}${esc(r[k].units)} typical ${lab} moves, the way of the read">${lab}: ${RX[r[k].label]?.[1] ?? esc(r[k].label)}</span>` : '');
  const t = one('m5', '5m') + one('m30', '30m');
  return t ? `<div class="nwr">${t}</div>` : '';
}

/** One headline row. */
export function rowHtml(h, { now } = {}) {
  const t = tierOf(h);
  return `<div class="nt-row${t === 1 ? ' t1' : ''}"><div class="nt-meta"><span class="mono">${esc(whenTxt(h.ms, now))}</span>${tierChip(t)}<span class="nt-src">${esc(sources(h))}</span></div>
${link(h)}${impactChips(h) ? `<div class="nt-chips">${impactChips(h)}</div>` : ''}${h.read?.why ? `<div class="muted nt-why">${esc(h.read.why)}</div>` : ''}${marketChips(h)}${reactionHtml(h)}</div>`;
}
export function listHtml(items, { now, limit = 120 } = {}) {
  if (!items?.length) return '<p class="muted" style="margin:8px 0">No headlines match. Try a wider tier or clear the filters.</p>';
  return items.slice(0, limit).map(h => rowHtml(h, { now })).join('') + (items.length > limit ? `<p class="muted">${items.length - limit} older headlines not shown; narrow the filters.</p>` : '');
}
export function topStripHtml(items, now) {
  const xs = topStories(items, now);
  if (!xs.length) return '<div class="nt-top muted">No tier-1 headlines in the last 6 hours.</div>';
  return `<div class="nt-top"><span class="lbl">Top stories · last 6 h</span>${xs.map(h => `<div class="nt-topi"><span class="mono muted">${esc(whenTxt(h.ms, now))}</span> ${link(h, 'nt-toph')} ${impactChips(h)}</div>`).join('')}</div>`;
}
/** The filter bar. state = { tier, keys, market, onlyBook, q } */
export function filtersHtml(st = {}) {
  const keys = new Set(st.keys ?? []);
  const tb = (v, l) => `<button type="button" data-nt-tier="${v}" aria-pressed="${(st.tier ?? 2) === v}">${l}</button>`;
  const kb = k => `<button type="button" data-nt-key="${k}" aria-pressed="${keys.has(k)}">${esc(keyLabel(k))}</button>`;
  return `<div class="filters nt-f"><span class="lbl">Tier</span>${tb(1, '1')}${tb(2, '1-2')}${tb(3, 'All')}</div>
<div class="filters nt-f"><button type="button" data-nt-key="" aria-pressed="${!keys.size}">All</button>${NEWS_KEYS.map(kb).join('')}${st.market ? `<span class="chip pur" title="filtered to this market's currencies">${esc(st.market)} <button type="button" data-nt-clear aria-label="Clear market filter" style="all:unset;cursor:pointer">✕</button></span>` : ''}</div>
<div class="nt-f2"><label class="nt-book"><input type="checkbox" data-nt-book${st.onlyBook ? ' checked' : ''}> Only headlines on today's book</label><input type="search" data-nt-q placeholder="Search headlines" value="${esc(st.q ?? '')}" aria-label="Search headlines"></div>`;
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
