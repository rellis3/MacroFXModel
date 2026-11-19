// js/terminal/macroSubtabs.js: the Macro tab's six sections (Policy / Rates & curve / Economy / Credit & liquidity / Markets & FX / Bias engine).
// Pure: no DOM, no fetch. desk-terminal.html draws ONLY the open section (the others are built on first open), and fetches the feeds only
// one section reads (SUB_FEEDS) when that section is first opened. Every Macro block is a registered surface (panel.macro.*, js/terminal/tabRegistry.js)
// and sits in exactly one section here; macroSubtabs.test.mjs fails if a block has no section, a section names a block that is not registered,
// or a block is in two sections.

/** The sections, in pill order, with their blocks in on-screen order. `alias` is the URL hash part: #macro/rates, #macro/rates/fedyields. */
export const MACRO_SUBS = [
  { id: 'policy', alias: 'policy', label: 'Policy',
    blocks: ['panel.macro.cbcards', 'panel.macro.cbboard', 'panel.macro.cbfutures', 'panel.macro.ratediff', 'panel.macro.speakers', 'panel.macro.speechdrift', 'panel.macro.ratecycle', 'panel.macro.fomcstrip', 'panel.macro.pathdiff'] },
  { id: 'rates', alias: 'rates', label: 'Rates & curve',
    blocks: ['panel.macro.legchart', 'panel.macro.ratesboard', 'panel.macro.fedyields', 'panel.macro.boepath', 'panel.macro.curve', 'panel.macro.globalyields', 'panel.macro.termprem', 'panel.macro.jgb', 'panel.macro.inflation', 'panel.macro.fiscalauct'] },
  { id: 'economy', alias: 'economy', label: 'Economy',
    blocks: ['panel.macro.engines', 'panel.macro.scorecard', 'panel.macro.nowcasts', 'panel.macro.cli', 'panel.macro.releases'] },
  { id: 'credit', alias: 'credit', label: 'Credit & liquidity',
    blocks: ['panel.macro.creditliq', 'panel.macro.creditspreads', 'panel.macro.fedliq', 'panel.macro.plumbing', 'panel.macro.xccy', 'panel.macro.bankcredit'] },
  { id: 'markets', alias: 'markets', label: 'Markets & FX',
    blocks: ['panel.macro.analogues', 'panel.macro.regime', 'panel.macro.vol', 'panel.macro.livelayer', 'panel.macro.fairvalue', 'panel.macro.fxfv', 'panel.macro.carry', 'panel.macro.commodfx', 'panel.macro.copper', 'panel.macro.gpr', 'panel.macro.rangecoverage', 'panel.macro.connected', 'panel.macro.coupling', 'panel.macro.uncertainty', 'panel.macro.skewhist', 'panel.macro.trendbasket', 'panel.macro.walls'] },
  // the bias engine (js/biasEngine.js, plans/BIAS_ENGINE_SPEC.md): currencies x drivers, the weights, coverage and the gaps. Its data is loaded with the page (load()).
  { id: 'engine', alias: 'engine', label: 'Bias engine', blocks: ['panel.macro.biasengine', 'panel.macro.bev2'] },
];

/** panel.macro.carryside is a column inside the carry block, not a block of its own. */
export const MACRO_CHILD_SURFACES = ['panel.macro.carryside'];

export const SUB_IDS = MACRO_SUBS.map(s => s.id);
export const ALL_BLOCKS = MACRO_SUBS.flatMap(s => s.blocks);
export const BLOCK_SUB = Object.fromEntries(MACRO_SUBS.flatMap(s => s.blocks.map(b => [b, s.id])));
const shortOf = b => b.replace(/^panel\.macro\./, '');

/** The feeds ONLY the Macro tab reads, per section: fetched the first time the section opens, not on page load. Everything the Overview map layers
 *  or another tab reads (world-rates, fed-path, global-yields, bank-credit, fair-value, cb-board, macro-engines-board) stays on the page-load list. */
export const SUB_FEEDS = {
  policy: ['speech-drift', 'policy-extra'],
  rates: ['rates-board', 'curve-board', 'term-premium', 'rates-extra', 'cb-path/boe'],
  economy: ['nowcast', 'leading-indicators', 'releases-board'],
  credit: ['credit-board', 'liquidity-board', 'xccy-basis', 'funding-read?spark=0', 'credit-liquidity'],
  markets: ['regime-board', 'vol-board', 'live-layer', 'fx-fair-value', 'carry-vol', 'commodity-fx', 'copper-gold', 'markets-extra'],
  engine: [],   // /api/bias-engine is fetched by load() (the Assets, Currencies and Overview cards read it too)
};

export const subById = id => MACRO_SUBS.find(s => s.id === id) ?? null;
export const subOfBlock = b => BLOCK_SUB[b] ?? BLOCK_SUB[`panel.macro.${b}`] ?? null;

/** A section shows when at least one of its blocks is switched on for this session (isOn(surfaceId) -> bool). */
export function visibleSubs(isOn = () => true) { return MACRO_SUBS.filter(s => s.blocks.some(b => isOn(b))).map(s => s.id); }

/** "#macro/rates/fedyields" -> { sub: 'rates', block: 'panel.macro.fedyields' }; "#macro/credit" -> { sub: 'credit', block: null }; anything else -> null. */
export function parseHash(h) {
  const m = /^#?macro(?:\/([a-z]+))?(?:\/([a-z0-9]+))?$/i.exec(String(h ?? '').trim());
  if (!m) return null;
  const a = (m[1] ?? '').toLowerCase(), b = (m[2] ?? '').toLowerCase();
  let sub = MACRO_SUBS.find(s => s.alias === a)?.id ?? null, block = null;
  if (b) { const id = `panel.macro.${b}`; if (ALL_BLOCKS.includes(id)) { block = id; sub = BLOCK_SUB[id]; } }
  else if (a && !sub) { const id = `panel.macro.${a}`; if (ALL_BLOCKS.includes(id)) { block = id; sub = BLOCK_SUB[id]; } }   // "#macro/fedyields"
  return { sub, block };
}
export const hashFor = (sub, block = null) => `#macro/${subById(sub)?.alias ?? 'policy'}${block ? `/${shortOf(block)}` : ''}`;

/** Which section opens: the URL hash, else the remembered one, else the first visible. Always one of the visible sections (null when none). */
export function pickSub({ hash = '', saved = '', visible = SUB_IDS } = {}) {
  const h = parseHash(hash)?.sub, ok = id => id && visible.includes(id);
  return ok(h) ? h : ok(saved) ? saved : (visible[0] ?? null);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The pill row. Same look as the other pills (.filters); phone: scrolls sideways (.msub-pills in desk-terminal.html). */
export function pillsHtml(active, visible = SUB_IDS) {
  const subs = MACRO_SUBS.filter(s => visible.includes(s.id));
  return `<div class="filters msub-pills" role="tablist" aria-label="Macro sections">${subs.map(s => `<button role="tab" id="msubtab-${s.id}" aria-selected="${s.id === active}" aria-pressed="${s.id === active}" aria-controls="msub" tabindex="${s.id === active ? 0 : -1}" data-msub="${s.id}">${esc(s.label)}</button>`).join('')}</div>`;
}

/** Arrow-key movement along the pills (roving tabindex): returns the id to move to. */
export function stepSub(current, dir, visible = SUB_IDS) {
  if (!visible.length) return null;
  const i = visible.indexOf(current);
  return visible[(i < 0 ? 0 : i + (dir < 0 ? -1 : 1) + visible.length) % visible.length];
}

/** Feeds a section still needs: its SUB_FEEDS names whose store key (the part before "?") is not in `have` (an object keyed by feed name). */
export const missingFeeds = (sub, have = {}) => (SUB_FEEDS[sub] ?? []).filter(f => have[f.replace(/\?.*$/, '')] === undefined);
