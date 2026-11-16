/**
 * The Deep dive tab (flow review item 5, 2026-11-16): the 13 reference cards that used to sit under every Pair page, grouped in four sections.
 * Pure data and parsing, so the section map, the hash and the command words are tested without a browser.
 *
 * While the Deep dive is a PREVIEW (registry tab.deep) a desk login still sees all 13 cards on the Pair page, exactly as before; when the
 * owner switches the tab on for the desk login (or for the owner, who always sees previews) the cards render here instead and the Pair page
 * is slim. Every card has its own surface id (panel.deep.<key>) so the Access page can switch it, wherever it renders.
 *
 *   #deep=GOLD            the Deep dive for gold, the section last used
 *   #deep=GOLD/rates      gold, the Rates and value section
 *   #deep/context         the market already selected, the Context section
 */
export const CARD_LABELS = {
  gr: 'Global Read', rates: 'Rates', fv: 'Fair value', stfv: 'Short-term fair value', pos: 'Positioning', carry: 'Carry and options',
  hours: 'Session hours and seasonality', ac: 'Autocorrelation', ll: 'Lead-lag', opt: 'Options', news: 'News', prec: 'Precedent and the chain', res: 'Research',
};
/** The order the cards had on the Pair page (kept for a desk login while the Deep dive is a preview). */
export const PAIR_ORDER = ['gr', 'rates', 'fv', 'stfv', 'pos', 'carry', 'hours', 'ac', 'll', 'opt', 'news', 'prec', 'res'];
/** What each card says while it loads (the wording the Pair page always used). */
export const LOADING_WORDS = {
  gr: 'the Global Read for this market', rates: 'rates', fv: 'fair value', stfv: 'short-term fair value', pos: 'positioning', carry: 'carry and options',
  hours: 'session hours and seasonality', ac: 'autocorrelation', ll: 'lead-lag', opt: 'options', news: 'the news', prec: 'precedent and the chain', res: 'research',
};
export const DEEP_SECTIONS = [
  { key: 'rates', label: 'Rates and value', words: ['rates', 'value', 'fair'], cards: ['rates', 'fv', 'stfv'] },
  { key: 'positioning', label: 'Positioning and options', words: ['positioning', 'options', 'pos', 'opt', 'carry'], cards: ['pos', 'carry', 'opt'] },
  { key: 'behaviour', label: 'How it behaves', words: ['behaviour', 'behavior', 'hours', 'behaves'], cards: ['hours', 'ac', 'll'] },
  { key: 'context', label: 'Context', words: ['context', 'news', 'research'], cards: ['gr', 'news', 'prec', 'res'] },
];
export const cardSurface = k => `panel.deep.${k}`;
export const sectionOf = word => {
  const w = String(word ?? '').trim().toLowerCase(); if (!w) return null;
  return DEEP_SECTIONS.find(s => s.key === w) ?? DEEP_SECTIONS.find(s => s.words.includes(w)) ?? null;
};
export const sectionOfCard = k => DEEP_SECTIONS.find(s => s.cards.includes(k)) ?? null;

export const deepHash = (inst, section) => `#deep${inst ? `=${String(inst).toUpperCase()}` : ''}${section ? `/${section}` : ''}`;
/** '#deep=GOLD/rates' -> { inst: 'GOLD', section: 'rates' }; '#deep/context' -> { inst: null, section: 'context' }; anything else -> null. */
export function parseDeepHash(hash) {
  const m = String(hash ?? '').match(/^#deep(?:=([A-Za-z0-9]+))?(?:\/([a-z]+))?$/i);
  if (!m) return null;
  return { inst: m[1] ? m[1].toUpperCase() : null, section: sectionOf(m[2])?.key ?? null };
}
