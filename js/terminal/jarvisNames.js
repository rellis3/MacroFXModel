// js/terminal/jarvisNames.js: one source of truth for how Jarvis says a market. Pure apart from the saved NAMES/CODES preference.
// DISPLAY ONLY: keys stay the internal ids; only the text a person reads or hears changes.
const CCY = { EUR: 'Euro', USD: 'Dollar', GBP: 'Pound', JPY: 'Yen', AUD: 'Aussie', NZD: 'Kiwi', CAD: 'Loonie', CHF: 'Franc', NOK: 'Krone', SEK: 'Krona', CNH: 'Yuan', ZAR: 'Rand' };
const LONG = { CHF: 'Swiss franc' };
/** Plain words for the non-pair markets: [long, short, spoken]. */
const FIXED = {
  NQ: ['Nasdaq', 'Nasdaq', 'Nasdaq'], SPX500: ['S&P 500', 'S&P', 'the S and P'], US30: ['Dow', 'Dow', 'the Dow'], US2000: ['Russell 2000', 'Russell', 'the Russell'], DE30: ['DAX', 'DAX', 'the DAX'], UK100: ['FTSE 100', 'FTSE', 'the FTSE'],
  GOLD: ['Gold', 'Gold', 'gold'], SILVER: ['Silver', 'Silver', 'silver'], COPPER: ['Copper', 'Copper', 'copper'], PLATINUM: ['Platinum', 'Platinum', 'platinum'], PALLADIUM: ['Palladium', 'Palladium', 'palladium'],
  WTI: ['Crude (WTI)', 'Crude', 'W T I crude'], BRENT: ['Brent', 'Brent', 'Brent'], NATGAS: ['Nat gas', 'Gas', 'natural gas'], SOYBEAN: ['Soybeans', 'Soy', 'soybeans'], WHEAT: ['Wheat', 'Wheat', 'wheat'], CORN: ['Corn', 'Corn', 'corn'], SUGAR: ['Sugar', 'Sugar', 'sugar'], BTCUSD: ['Bitcoin', 'Bitcoin', 'Bitcoin'],
};
const KEY = 'jarvis.nameStyle';
let style = null;
/** 'names' (default) or 'codes'. */
export function getNameStyle() {
  if (style) return style;
  try { const v = globalThis.localStorage?.getItem(KEY); style = v === 'codes' ? 'codes' : 'names'; } catch { style = 'names'; }
  return style;
}
export function setNameStyle(s) { style = s === 'codes' ? 'codes' : 'names'; try { globalThis.localStorage?.setItem(KEY, style); } catch { /* storage blocked */ } return style; }
/** A lone currency in words: EUR -> Euro. Unknown codes pass through. Honours the CODES switch. */
export function currencyName(code, { short } = {}) {
  if (getNameStyle() === 'codes') return code;
  return (!short && LONG[code]) || CCY[code] || code;
}
const isPair = k => typeof k === 'string' && /^[A-Z]{6}$/.test(k) && CCY[k.slice(0, 3)] && CCY[k.slice(3)] && k !== 'BTCUSD';
/** A market for display. names: "Euro / Dollar", "Nasdaq". codes: "EUR/USD", "NQ". short: tighter (no spaces round the slash, shorter index words). Unknown keys pass through. */
export function marketName(key, { short } = {}) {
  if (typeof key !== 'string') return key;
  const codes = getNameStyle() === 'codes';
  if (isPair(key)) {
    const a = key.slice(0, 3), b = key.slice(3);
    if (codes) return `${a}/${b}`;
    return short ? `${CCY[a]}/${CCY[b]}` : `${CCY[a]} / ${CCY[b]}`;
  }
  if (codes) return key;
  const f = FIXED[key];
  return f ? (short ? f[1] : f[0]) : key;
}
/** Words for the voice: "Euro Dollar", "Nasdaq". Always names, whatever the display switch says. */
export function spokenName(key) {
  if (isPair(key)) return `${CCY[key.slice(0, 3)]} ${CCY[key.slice(3)]}`;
  return FIXED[key]?.[2] ?? (CCY[key] ?? key);
}
