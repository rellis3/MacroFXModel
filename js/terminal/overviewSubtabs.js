// js/terminal/overviewSubtabs.js: the Overview tab's five sections (Today / Currencies / Risk & markets / News & events / The desk), 2026-11-17.
// Pure: no DOM, no fetch. The DOM part is overviewSections.js (an OWNER-ONLY PREVIEW, registry surface widget.ov.sections): it adds a pill row under the
// "At a glance" block and shows only the blocks of the open section. Every Overview block stays its own registered surface (panel.ov.*), so the Access page
// switches work as before and a desk login keeps its hidden blocks hidden (trade, P&L and internal blocks are never shown by a section: a section only
// chooses WHICH of the blocks already allowed for the session are on screen). overviewSubtabs.test.mjs fails if an Overview surface has no section, a section
// names a surface that is not registered, or a surface sits in two sections.

/** The sections, in pill order, with their blocks in on-screen order. `alias` is the URL hash part: #overview/currencies. */
export const OV_SUBS = [
  // the picture of the day: the map, the headline, the regime, the week, the risks to the read (the globe and map stay with Today: it is the first thing the page has always shown)
  { id: 'today', alias: 'today', label: 'Today',
    blocks: ['panel.ov.hero', 'panel.ov.book', 'panel.ov.regime', 'panel.ov.week', 'panel.ov.riskwarn'] },
  // every currency read side by side: the desk ranking, the price read in sigma, analyst against price, exposure, the bias engine
  { id: 'currencies', alias: 'currencies', label: 'Currencies',
    blocks: ['panel.ov.strength', 'panel.ov.ccystrength', 'panel.ov.priceread', 'panel.ov.exposure', 'panel.ov.engine'] },
  { id: 'risk', alias: 'risk', label: 'Risk & markets',
    blocks: ['panel.ov.riskstate', 'panel.ov.em', 'panel.ov.dayshape'] },
  { id: 'news', alias: 'news', label: 'News & events',
    blocks: ['panel.ov.wire', 'panel.ov.releases'] },
  { id: 'desk', alias: 'desk', label: 'The desk',
    blocks: ['panel.ov.bookintel', 'panel.ov.record', 'panel.ov.bestpairs', 'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.alerts'] },
];

/** Overview surfaces that are NOT blocks of a section: the tab itself, the block above the pills, the lean lists that live inside the regime card, and the switch. */
export const OV_NOT_BLOCKS = ['tab.overview', 'panel.ov.glance', 'panel.ov.regime-lists', 'widget.ov.sections'];

export const SURFACE = 'widget.ov.sections';
export const SUB_IDS = OV_SUBS.map(s => s.id);
export const ALL_BLOCKS = OV_SUBS.flatMap(s => s.blocks);
export const BLOCK_SUB = Object.fromEntries(OV_SUBS.flatMap(s => s.blocks.map(b => [b, s.id])));
export const LS_KEY = 'deskOverviewSub:v1';

export const subById = id => OV_SUBS.find(s => s.id === id) ?? null;
export const subOfBlock = b => BLOCK_SUB[b] ?? BLOCK_SUB[`panel.ov.${b}`] ?? null;

/** A section shows when at least one of its blocks is switched on for this session (isOn(surfaceId) -> bool). `present` (optional) narrows it to blocks that are on the page. */
export function visibleSubs(isOn = () => true, present = null) {
  return OV_SUBS.filter(s => s.blocks.some(b => isOn(b) && (!present || present(b)))).map(s => s.id);
}

/** "#overview/currencies" -> { sub: 'currencies', block: null }; "#overview/priceread" -> { sub: 'currencies', block: 'panel.ov.priceread' }; "#overview" -> { sub: null, block: null }; else null. */
export function parseHash(h) {
  const m = /^#?overview(?:\/([a-z]+))?$/i.exec(String(h ?? '').trim());
  if (!m) return null;
  const a = (m[1] ?? '').toLowerCase();
  if (!a) return { sub: null, block: null };
  const byAlias = OV_SUBS.find(s => s.alias === a)?.id ?? null;
  if (byAlias) return { sub: byAlias, block: null };
  const id = `panel.ov.${a}`;
  return ALL_BLOCKS.includes(id) ? { sub: BLOCK_SUB[id], block: id } : { sub: null, block: null };
}
export const hashFor = sub => `#overview/${subById(sub)?.alias ?? 'today'}`;

/** Which section opens: the URL hash, else the remembered one, else the first visible. Always one of the visible sections (null when none). */
export function pickSub({ hash = '', saved = '', visible = SUB_IDS } = {}) {
  const h = parseHash(hash)?.sub, ok = id => id && visible.includes(id);
  return ok(h) ? h : ok(saved) ? saved : (visible[0] ?? null);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The pill row. One visible section means no row (nothing to choose between). */
export function pillsHtml(active, visible = SUB_IDS) {
  const subs = OV_SUBS.filter(s => visible.includes(s.id));
  if (subs.length < 2) return '';
  return `<div class="ovs-pills" role="tablist" aria-label="Overview sections" data-surface="widget.ov.sections">${subs.map(s => `<button type="button" role="tab" id="ovsubtab-${s.id}" data-ovsub="${s.id}" aria-selected="${s.id === active}" aria-pressed="${s.id === active}" tabindex="${s.id === active ? 0 : -1}">${esc(s.label)}</button>`).join('')}</div>`;
}

/** Arrow-key movement along the pills (roving tabindex): returns the id to move to. */
export function stepSub(current, dir, visible = SUB_IDS) {
  if (!visible.length) return null;
  const i = visible.indexOf(current);
  return visible[(i < 0 ? 0 : i + (dir < 0 ? -1 : 1) + visible.length) % visible.length];
}

/** Home / End jump to the first / last visible pill. */
export const edgeSub = (end, visible = SUB_IDS) => (visible.length ? visible[end ? visible.length - 1 : 0] : null);
