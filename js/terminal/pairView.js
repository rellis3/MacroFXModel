/**
 * One page per pair in the Desk Terminal (desk-terminal.html#pair=EURUSD; the owner's build list #9). Pure helpers:
 * which currencies a market is made of, how a market is written in free text (for finding research that mentions
 * it), and how to pick a market's row out of each board's payload. The page does the fetching and drawing.
 */

const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
/** Non-FX markets: their dollar leg and the words people use for them. */
export const ASSET_WORDS = {
  GOLD: ['gold', 'xau', 'xauusd', 'bullion'], SILVER: ['silver', 'xag', 'xagusd'], COPPER: ['copper', 'xcu'], PLATINUM: ['platinum'], PALLADIUM: ['palladium'],
  NQ: ['nasdaq', 'nq', 'nas100', 'ndx', 'tech stocks'], SPX500: ['s&p 500', 's&p', 'spx', 'sp500', 'es futures'], US30: ['dow', 'us30', 'djia'], US2000: ['russell', 'us2000', 'rty', 'small caps'],
  DE30: ['dax', 'de30', 'de40'], UK100: ['ftse', 'uk100'], WTI: ['wti', 'crude', 'oil'], BRENT: ['brent', 'crude', 'oil'], NATGAS: ['natural gas', 'natgas', 'henry hub'],
  BTCUSD: ['bitcoin', 'btc'], SOYBEAN: ['soybean', 'soy'], WHEAT: ['wheat'], CORN: ['corn'], SUGAR: ['sugar'],
};
export const CCY_WORDS = { USD: ['dollar', 'usd', 'greenback'], EUR: ['euro', 'eur'], GBP: ['sterling', 'pound', 'gbp'], JPY: ['yen', 'jpy'], AUD: ['aussie', 'aud', 'australian dollar'], NZD: ['kiwi', 'nzd'], CAD: ['loonie', 'cad', 'canadian dollar'], CHF: ['franc', 'chf', 'swissie'] };

/** ['EUR', 'USD'] for EURUSD; for a non-FX market its dollar pricing ([null, 'USD']), or null. */
export function legsOf(inst) {
  const s = String(inst ?? '').toUpperCase();
  if (s.length === 6 && CCY.includes(s.slice(0, 3)) && CCY.includes(s.slice(3))) return [s.slice(0, 3), s.slice(3)];
  return ASSET_WORDS[s] ? [null, 'USD'] : null;
}
export const isFx = inst => { const l = legsOf(inst); return !!(l && l[0]); };
/** EUR/USD for EURUSD, the name otherwise. */
export const pairLabel = inst => (isFx(inst) ? `${inst.slice(0, 3)}/${inst.slice(3)}` : String(inst ?? ''));
/** OANDA's spelling (EUR_USD) where the terminal's key is an FX pair. */
export const oandaOf = inst => (isFx(inst) ? `${inst.slice(0, 3)}_${inst.slice(3)}` : ({ GOLD: 'XAU_USD', SILVER: 'XAG_USD' }[inst] ?? null));

/**
 * Does a piece of free text name this market? FX: EURUSD, EUR/USD, EUR-USD, "EUR USD", or both currencies' words
 * when `loose`; non-FX: any of its words as a whole word. Case-insensitive.
 */
export function mentions(text, inst, { loose = false } = {}) {
  const t = String(text ?? '').toLowerCase(); if (!t) return false;
  const s = String(inst ?? '').toUpperCase(), wb = w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(t);
  if (isFx(s)) {
    const a = s.slice(0, 3).toLowerCase(), b = s.slice(3).toLowerCase();
    if (new RegExp(`(^|[^a-z])${a}[\\s/_-]?${b}([^a-z]|$)`).test(t)) return true;
    return loose && CCY_WORDS[s.slice(0, 3)].some(wb) && CCY_WORDS[s.slice(3)].some(wb);
  }
  return (ASSET_WORDS[s] ?? [s.toLowerCase()]).some(wb);
}

/** The text a research proposal is about (title, thesis, rules, universe). */
const proposalText = p => [p.title, p.thesis, p.mechanism, ...(Array.isArray(p.rules?.universe) ? p.rules.universe : [p.rules?.universe]), p.rules?.signal, p.rules?.entry].filter(Boolean).join(' ');
const paperText = p => [p.title, p.abstract, p.notes?.claim, p.notes?.method, ...(p.notes?.markets ?? [])].filter(Boolean).join(' ');

/** Research pod proposals and library papers that name this market, newest first, capped. */
export function researchFor(inst, { library = [], papers = [] } = {}, cap = 8) {
  const props = (library ?? []).filter(p => mentions(proposalText(p), inst) || (Array.isArray(p.rules?.universe) && p.rules.universe.some(u => String(u).toUpperCase().replace(/[^A-Z0-9]/g, '') === inst)))
    .sort((a, b) => String(b.lastSeen ?? '').localeCompare(String(a.lastSeen ?? ''))).slice(0, cap);
  const pap = (papers ?? []).filter(p => mentions(paperText(p), inst)).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, cap);
  return { proposals: props, papers: pap };
}

/** A board's row for this market, matching on any of the usual key fields (pair, inst, sym, instrument). */
export function rowFor(rows, inst) {
  const want = String(inst ?? '').toUpperCase(), norm = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (rows ?? []).find(r => [r.pair, r.inst, r.sym, r.instrument, r.market].some(v => norm(v) === want)) ?? null;
}

/** The retail book row (/api/oanda-book/history, keyed EUR_USD / XAU_USD): share long now and its 24h change. */
export function crowdFor(book, inst) {
  const k = oandaOf(inst), v = k ? book?.instruments?.[k] : null;
  return v?.latest ? { long: v.latest[2], d24: v.change24h?.delta ?? null } : null;
}

/** The 2Y / short-rate gap for a pair from the rate-diff and real-yield boards (base minus quote). */
export function rateGap(inst, { rd = null, ry = null, policy = null } = {}) {
  const l = legsOf(inst); if (!l?.[0]) return null;
  const [a, b] = l, g = (m, k) => (m?.[a]?.[k] != null && m?.[b]?.[k] != null ? +(m[a][k] - m[b][k]).toFixed(2) : null);
  const pa = policy?.[a]?.rate, pb = policy?.[b]?.rate;
  return { base: a, quote: b, short: g(rd?.byCcy, 'latestRate'), shortZ: g(rd?.byCcy, 'z'), real: g(ry?.byCcy, 'latestReal'), y10: g(ry?.byCcy, 'latestY10'), policy: Number.isFinite(pa) && Number.isFinite(pb) ? +(pa - pb).toFixed(2) : null };
}
