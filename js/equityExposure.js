// js/equityExposure.js: WHICH equity indices a headline touches, so a note can say "Nasdaq 100, S&P 500, Dow" instead of just "equities". Pure: no fetch, no clock.
//
// Three honest rules, each stated in the note so the reader can disagree with it:
//   1. NAMED     the text names the index (Nasdaq, S&P, Dow, Russell, FTSE, DAX, Nikkei ...).
//   2. MEMBER    the text names a big company; the indices that company is a member of (MEMBERSHIP, below).
//   3. REGION    a macro headline about a currency area; that area's main index (US -> the four US indices, GBP -> FTSE 100 ...).
// It says which indices are EXPOSED, never how far they move: the direction is the sign of the headline's EQUITIES push (or the earnings verdict) and the
// size is not claimed. One company's EPS is a small part of an index; the note says so for a company item.
//
// MEMBERSHIP IS A HAND-KEPT TABLE (as of 2026-11; indices reconstitute, so treat it as a guide, not a feed). A name missing from it falls back to the
// S&P 500 only, which holds every company the earnings feed carries (all above $150bn, US-listed).

export const INDEXES = {
  NDX: 'Nasdaq 100', SPX: 'S&P 500', DJI: 'Dow', RUT: 'Russell 2000', SOX: 'Semiconductors (SOX)',
  FTSE: 'FTSE 100', DAX: 'DAX', SX5E: 'Euro Stoxx 50', N225: 'Nikkei 225', ASX: 'ASX 200', TSX: 'TSX', SMI: 'SMI',
};

const DOW = ['AAPL', 'AMGN', 'AMZN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS', 'GS', 'HD', 'HON', 'IBM', 'JNJ', 'JPM', 'KO', 'MCD', 'MMM', 'MRK', 'MSFT', 'NKE', 'NVDA', 'PG', 'SHW', 'TRV', 'UNH', 'V', 'VZ', 'WMT'];
const NDX = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'COST', 'NFLX', 'AMD', 'ADBE', 'PEP', 'CSCO', 'QCOM', 'TMUS', 'INTU', 'AMAT', 'TXN', 'AMGN', 'ISRG', 'BKNG', 'HON', 'PANW', 'MU', 'LRCX', 'KLAC', 'ADI', 'INTC', 'CRWD', 'SBUX', 'GILD', 'MDLZ', 'ASML', 'PDD', 'APP', 'PLTR', 'ARM', 'ADP', 'CMCSA', 'MRVL', 'SNPS', 'CDNS', 'WDAY', 'ABNB', 'ORLY', 'MAR', 'FTNT', 'MELI'];
const SOX = ['NVDA', 'AVGO', 'AMD', 'QCOM', 'TXN', 'AMAT', 'MU', 'LRCX', 'KLAC', 'ADI', 'INTC', 'MRVL', 'ASML', 'TSM', 'ARM', 'ON', 'NXPI', 'MPWR'];

/** Indices a US-listed symbol belongs to: S&P 500 always (see header), plus the others it is a member of. Order is display order. */
export function membership(symbol) {
  const s = String(symbol ?? '').toUpperCase();
  return [NDX.includes(s) && 'NDX', 'SPX', DOW.includes(s) && 'DJI', SOX.includes(s) && 'SOX'].filter(Boolean);
}

// Rule 1: an index named in the text.
const NAMED = [
  ['NDX', /\bnasdaq(?!\s*composite)(\s*100)?\b|\bndx\b|\bqqq\b/i], ['SPX', /\bs&p\s*500\b|\bs&p\b|\bspx\b|\bspy\b/i], ['DJI', /\bdow\b|\bdjia\b|\bdow jones\b/i],
  ['RUT', /\brussell\b|\bsmall[- ]caps?\b/i], ['SOX', /\bsemiconductors?\b|\bchip ?makers?\b|\bchip stocks?\b|\bsox\b/i],
  ['FTSE', /\bftse\b|\bfootsie\b/i], ['DAX', /\bdax\b/i], ['SX5E', /\bstoxx\b/i], ['N225', /\bnikkei\b/i], ['ASX', /\basx\b/i], ['TSX', /\btsx\b/i], ['SMI', /\bsmi\b/i],
];
// Rule 3: a currency area's main equity index. USD brings all four US indices; the Russell is included because small caps are the rate-sensitive end.
const REGION = { USD: ['NDX', 'SPX', 'DJI', 'RUT'], GBP: ['FTSE'], EUR: ['DAX', 'SX5E'], JPY: ['N225'], AUD: ['ASX'], CAD: ['TSX'], CHF: ['SMI'] };
const SYMBOL_RE = /\(([A-Z]{1,5})\)|\b(?:NYSE|NASDAQ|Nasdaq):\s*([A-Z]{1,5})\b/;

/**
 * h = a wire item: { title, summary, touches?, earn?: { symbol, verdict }, read?: { impact } }.
 * Returns { dir: 1 | -1 | 0, list: [{ key, name, why }], basis } ; list is empty when nothing can be said. `dir` is the sign of the EQUITIES push.
 * Only the order of first appearance is kept, so the most direct reason comes first (named, then member, then region).
 */
export function equityExposure(h) {
  const text = `${h?.title ?? ''} ${h?.summary ?? ''}`;
  const out = new Map(), add = (key, why) => { if (!out.has(key)) out.set(key, { key, name: INDEXES[key], why }); };
  for (const [key, re] of NAMED) if (re.test(text)) add(key, 'named in the headline');
  const sym = h?.earn?.symbol ?? (text.match(SYMBOL_RE)?.[1] ?? text.match(SYMBOL_RE)?.[2]);
  if (sym) for (const key of membership(sym)) add(key, `${sym} is a member`);
  const touches = h?.touches ?? [];
  if (!h?.earn) for (const c of touches) for (const key of REGION[c] ?? []) add(key, `${c} headline`);
  const e = Number(h?.read?.impact?.EQUITIES), dir = e > 0 ? 1 : e < 0 ? -1 : 0;
  const list = [...out.values()];
  const basis = h?.earn ? `${h.earn.symbol} is one company inside each index, so a result moves them a little, not by its own size.` : list.length ? 'Indices the headline names or the currency area it concerns.' : '';
  return { dir, list, basis };
}

/** One Telegram-ready line: "Nasdaq 100 · S&P 500 · Dow". '' when nothing. `cap` limits the names (the rest become "+n more"). */
export function exposureLine(x, cap = 5) {
  const l = x?.list ?? [];
  if (!l.length) return '';
  const names = l.slice(0, cap).map(i => i.name).join(' · ');
  return l.length > cap ? `${names} · +${l.length - cap} more` : names;
}
