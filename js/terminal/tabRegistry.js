// js/terminal/tabRegistry.js: the SURFACE REGISTRY of the Desk Terminal. Pure data + three small functions; no DOM, no fetch.
//
// THE DESIGN RULE (owner, 2026-11-13): every tab, nav link, widget, ticker segment and panel the terminal can show is a SURFACE, and every
// surface is listed here. The desk login (a second, shared password) sees only the surfaces the owner has switched on in the admin panel
// (desk-admin.html); the owner's own login sees everything. Nothing is visible to the desk login unless it is on DEFAULT_VISIBLE or switched
// on. So a surface you add and forget to register is invisible to the desk login (the safe direction), and the guard test
// (js/terminal/tabRegistry.test.mjs) FAILS until you register it.
//
//   kind   'tab'    a button in the nav (data-t) and its section
//          'nav'    a link out to another page (top bar, or the tab bar)
//          'widget' a fixed piece of the shell: a chip, the Ask pill, the clocks, the world-stress strip
//          'strip'  one kind of segment in the headline ticker
//          'panel'  a block inside a tab (an Overview card, a Charts card)
//   ownerData true  the surface shows the owner's own book, positions, analysis, P&L, ops or paid-model buttons: default OFF, and the admin
//                   panel shows an 'owner data' warning beside its switch
//   defaultVisible  true only for market data the owner is happy to show anyone with the desk login
//
// How a surface is wired in the markup: put data-surface="<id>" on the element (for a tab, on both the nav button and its <section>), or wrap
// generated HTML with sf('<id>', html) in desk-terminal.html (a display:contents wrapper). access.js hides the switched-off ids with one
// stylesheet, so content that re-renders stays hidden.
//
// Where the saved switches live: KV key desk_tab_access_v1 ({ [id]: true|false, updatedAt }), served by /api/desk-access.

export const SURFACES = [
  // ── tabs ──
  { id: 'tab.overview', kind: 'tab', label: 'Overview', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'market panels stay visible; the desk book panels inside it are separate switches' },
  { id: 'tab.ccy',      kind: 'tab', label: 'Currencies', group: 'Tabs', defaultVisible: false, ownerData: true,  note: 'the desk analysts\' bias per currency, best expressions and conviction' },
  { id: 'tab.assets',   kind: 'tab', label: 'Assets', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'market boards; the desk\'s own cards inside it only draw for the owner' },
  { id: 'tab.macro',    kind: 'tab', label: 'Macro', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'yields, credit, liquidity, central banks, macro engines, rates and policy' },
  { id: 'tab.pos',      kind: 'tab', label: 'Positioning', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'COT, futures positioning, options positioning' },
  { id: 'tab.cal',      kind: 'tab', label: 'Calendar', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'events, live surprises, expectations against reality' },
  { id: 'tab.ana',      kind: 'tab', label: 'Analytics', group: 'Tabs', defaultVisible: false, ownerData: true,  note: 'factor risk and scenarios on the book, analyst scorecard, the desk\'s days' },
  { id: 'tab.charts',   kind: 'tab', label: 'Charts', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'the book-flow and ranking-vs-realised panels inside it are separate switches' },
  { id: 'tab.today',    kind: 'tab', label: 'Chain', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'the macro chain (Live/1D/5D/20D) and its read; reads are shared once a day' },
  { id: 'tab.read',     kind: 'tab', label: 'Trader\'s read', group: 'Tabs', defaultVisible: false, ownerData: true,  note: 'the owner\'s own read of the day' },
  { id: 'tab.pair',     kind: 'tab', label: 'Pair', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'one page per market; the research it pulls is shared once a day' },
  { id: 'tab.changed',  kind: 'tab', label: 'Changed', group: 'Tabs', defaultVisible: false, ownerData: true,  note: 'what changed against the previous desk book: the book\'s cards and biases' },
  { id: 'tab.options',  kind: 'tab', label: 'Options', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'skew, dealer hedging, put/call, option lines, the VIX term' },
  { id: 'tab.news',     kind: 'tab', label: 'News', group: 'Tabs', defaultVisible: true,  ownerData: false, note: 'the wire with its reads' },
  { id: 'tab.corr',     kind: 'tab', label: 'Correlations & hedges', group: 'Tabs', defaultVisible: false, ownerData: true,  note: 'the hedge finder works from the book\'s exposure' },
  { id: 'tab.infomap',  kind: 'tab', label: 'Info map', group: 'Tabs', defaultVisible: false, ownerData: true,  note: 'the owner\'s inventory of the repo\'s data' },
  // ── navigation links out to other pages ──
  { id: 'nav.research-tab', kind: 'nav', label: 'Research link (tab bar)', group: 'Links', defaultVisible: false, ownerData: true, note: 'research.html' },
  { id: 'nav.research',     kind: 'nav', label: 'Research (top bar)', group: 'Links', defaultVisible: false, ownerData: true, note: 'research.html' },
  { id: 'nav.deskoffice',   kind: 'nav', label: 'Desk Office (top bar)', group: 'Links', defaultVisible: false, ownerData: true, note: 'desk-office.html: the desk\'s admin and ops' },
  { id: 'nav.deskrun',      kind: 'nav', label: 'Desk Run (top bar)', group: 'Links', defaultVisible: false, ownerData: true, note: 'desk-run.html: runs the desk (paid model calls)' },
  { id: 'nav.access',       kind: 'nav', label: 'Access (admin panel link)', group: 'Links', defaultVisible: false, ownerData: true, note: 'desk-admin.html: only the owner ever sees this one, whatever the switch says' },
  // ── widgets in the shell ──
  { id: 'widget.clocks',    kind: 'widget', label: 'Market clocks', group: 'Shell', defaultVisible: true,  ownerData: false, note: 'session clocks in the top bar' },
  { id: 'widget.worldstress', kind: 'widget', label: 'World stress strip', group: 'Shell', defaultVisible: true, ownerData: false, note: 'every stress input green/amber/red, pinned above the tabs' },
  { id: 'widget.bookchip',  kind: 'widget', label: 'Book chip', group: 'Shell', defaultVisible: false, ownerData: true, note: 'the date and time of the desk\'s run' },
  { id: 'widget.dqchip',    kind: 'widget', label: 'Data-quality chip', group: 'Shell', defaultVisible: false, ownerData: true, note: 'the desk\'s data health count' },
  { id: 'widget.ask',       kind: 'widget', label: 'Ask the desk (floating button)', group: 'Shell', defaultVisible: false, ownerData: true, note: 'free-form paid model calls: never for the desk login' },
  // ── ticker segments ──
  { id: 'strip.news',    kind: 'strip', label: 'Ticker: tier-1 headlines', group: 'Ticker', defaultVisible: true,  ownerData: false, note: 'wire headlines' },
  { id: 'strip.events',  kind: 'strip', label: 'Ticker: high-impact releases', group: 'Ticker', defaultVisible: true,  ownerData: false, note: 'the next 36 hours of high-impact events' },
  { id: 'strip.gpr',     kind: 'strip', label: 'Ticker: geopolitical risk', group: 'Ticker', defaultVisible: true,  ownerData: false, note: 'GPR level and trend' },
  { id: 'strip.zone',    kind: 'strip', label: 'Ticker: zone / target / invalid', group: 'Ticker', defaultVisible: false, ownerData: true, note: 'the owner\'s trade zones being hit' },
  { id: 'strip.regime',  kind: 'strip', label: 'Ticker: regime tone', group: 'Ticker', defaultVisible: false, ownerData: true, note: 'the desk book\'s global tone' },
  { id: 'strip.update',  kind: 'strip', label: 'Ticker: desk updates', group: 'Ticker', defaultVisible: false, ownerData: true, note: 'the desk\'s intraday update headlines' },
  { id: 'strip.risk',    kind: 'strip', label: 'Ticker: risk desk warnings', group: 'Ticker', defaultVisible: false, ownerData: true, note: 'the book\'s own risks' },
  // ── Overview panels ──
  { id: 'panel.ov.hero',       kind: 'panel', label: 'Overview: the globe and map', group: 'Overview', defaultVisible: true,  ownerData: false, note: 'rate cycle, bank credit, fair value layers. Its "Desk bias" layer and headline carry the Currency Manager\'s ranking: review' },
  { id: 'panel.ov.book',       kind: 'panel', label: 'Overview: today\'s book headline', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the desk\'s headline thesis' },
  { id: 'panel.ov.bookintel',  kind: 'panel', label: 'Overview: book intelligence', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the book\'s own panels (js/terminal/bookPanels.js)' },
  { id: 'panel.ov.regime',     kind: 'panel', label: 'Overview: the global ruling', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the desk debate\'s global view' },
  { id: 'panel.ov.strength',   kind: 'panel', label: 'Overview: currency strength', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the Currency Manager\'s ruling' },
  { id: 'panel.ov.exposure',   kind: 'panel', label: 'Overview: exposure chart', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the book\'s currency exposure' },
  { id: 'panel.ov.record',     kind: 'panel', label: 'Overview: the desk\'s record', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the desk\'s scored record' },
  { id: 'panel.ov.week',       kind: 'panel', label: 'Overview: this week (strategist)', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the weekly strategist\'s view' },
  { id: 'panel.ov.bestpairs',  kind: 'panel', label: 'Overview: best pairs', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the pair-selection matrix from the desk\'s biases' },
  { id: 'panel.ov.riskstate',  kind: 'panel', label: 'Overview: risk state', group: 'Overview', defaultVisible: true,  ownerData: false, note: 'the risk flags: market data' },
  { id: 'panel.ov.em',         kind: 'panel', label: 'Overview: emerging markets', group: 'Overview', defaultVisible: true,  ownerData: false, note: 'EM gauges: market data' },
  { id: 'panel.ov.alerts',     kind: 'panel', label: 'Overview: desk alerts', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the alert engine\'s status, including the Telegram mute' },
  { id: 'panel.ov.dayshape',   kind: 'panel', label: 'Overview: the day\'s shape', group: 'Overview', defaultVisible: true,  ownerData: false, note: 'the day forecaster: volatility ranges (market data)' },
  { id: 'panel.ov.tradewatch', kind: 'panel', label: 'Overview: trade watch', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the book against live prices' },
  { id: 'panel.ov.playbooks',  kind: 'panel', label: 'Overview: playbooks', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the six largest book cards' },
  { id: 'panel.ov.wire',       kind: 'panel', label: 'Overview: the wire', group: 'Overview', defaultVisible: true,  ownerData: false, note: 'tier 1-2 headlines with their reads' },
  { id: 'panel.ov.releases',   kind: 'panel', label: 'Overview: releases and playbooks', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the economist\'s release briefs: the desk\'s analysis' },
  { id: 'panel.ov.riskwarn',   kind: 'panel', label: 'Overview: risk desk warnings', group: 'Overview', defaultVisible: false, ownerData: true, note: 'the book\'s own risks' },
  // ── Overview map layers (the pills on the world map and globe; js/terminal/mapLayers.js) ──
  { id: 'widget.ovl.bias', kind: 'widget', label: 'Map layer: Desk bias', group: 'Overview map layers', defaultVisible: false, ownerData: true, note: 'the Currency Manager ranking painted on the map: the owner analysis' },
  { id: 'widget.ovl.rates', kind: 'widget', label: 'Map layer: Rate cycle', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'every BIS central bank by hiking / holding / cutting: market data' },
  { id: 'widget.ovl.level', kind: 'widget', label: 'Map layer: Policy rate', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'every BIS central bank by policy-rate level: market data' },
  { id: 'widget.ovl.priced', kind: 'widget', label: 'Map layer: Priced path', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'what the short-rate futures price for the eight banks over ~6 months: market data' },
  { id: 'widget.ovl.tone', kind: 'widget', label: 'Map layer: Bank tone', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'statement tone per bank from the Central banks board: description only (cb-tone-direction NULL)' },
  { id: 'widget.ovl.y10', kind: 'widget', label: 'Map layer: 10Y yield', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'government 10-year yields from the Global yields board: market data' },
  { id: 'widget.ovl.gap', kind: 'widget', label: 'Map layer: 2Y gap to US', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: '2-year yield gap to the US from the Global yields board: market data' },
  { id: 'widget.ovl.macro', kind: 'widget', label: 'Map layer: Macro composite', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'the macro engines composite per currency: market data, size not direction' },
  { id: 'widget.ovl.credit', kind: 'widget', label: 'Map layer: Bank credit', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'BIS cross-border bank credit growth: market data' },
  { id: 'widget.ovl.value', kind: 'widget', label: 'Map layer: Fair value', group: 'Overview map layers', defaultVisible: true, ownerData: false, note: 'BIS real effective exchange rates against their 20-year average: market data' },
  // ── Charts panels ──
  { id: 'panel.charts.bookflow', kind: 'panel', label: 'Charts: how today\'s book was built', group: 'Charts', defaultVisible: false, ownerData: true, note: 'the ruling to the currencies to every card' },
  { id: 'panel.charts.ranking',  kind: 'panel', label: 'Charts: currency ranking vs realised', group: 'Charts', defaultVisible: false, ownerData: true, note: 'the Currency Manager\'s order against how currencies finished' },
];

export const KINDS = ['tab', 'nav', 'widget', 'strip', 'panel'];
export const SURFACE_IDS = SURFACES.map(s => s.id);
export const DEFAULT_VISIBLE_IDS = SURFACES.filter(s => s.defaultVisible).map(s => s.id);
/** Surfaces only the owner ever sees, whatever the saved switches say (the admin link itself). */
export const ALWAYS_OWNER_IDS = ['nav.access'];

export const surfaceById = id => SURFACES.find(s => s.id === id) ?? null;

/**
 * The ids a session may see. role 'owner' => every id. role 'viewer' => DEFAULT_VISIBLE_IDS, overridden by the saved switches
 * (saved: { [id]: boolean }, ids not in the registry are ignored), never including ALWAYS_OWNER_IDS.
 */
export function visibleFor(role, saved) {
  if (role === 'owner') return [...SURFACE_IDS];
  const on = new Set(DEFAULT_VISIBLE_IDS);
  for (const [id, v] of Object.entries(saved ?? {})) { if (!surfaceById(id)) continue; if (v === true) on.add(id); else if (v === false) on.delete(id); }
  for (const id of ALWAYS_OWNER_IDS) on.delete(id);
  return SURFACE_IDS.filter(id => on.has(id));
}

/** Validate a POST body of switches: only known ids, only booleans. Returns { ok, clean } or { ok:false, error }. */
export function cleanSwitches(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'expected an object of { id: true|false }' };
  const clean = {};
  for (const [id, v] of Object.entries(body)) {
    if (id === 'updatedAt') continue;
    if (!surfaceById(id)) return { ok: false, error: `unknown surface id: ${id}` };
    if (typeof v !== 'boolean') return { ok: false, error: `${id} must be true or false` };
    if (ALWAYS_OWNER_IDS.includes(id)) continue;
    clean[id] = v;
  }
  return { ok: true, clean };
}
