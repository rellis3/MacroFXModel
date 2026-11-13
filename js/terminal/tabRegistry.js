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
//   class           'analytic' | 'signal' | 'private' (see CLASS below): decides the defaults
//   ownerData       true for 'signal' and 'private' (derived from the class): default OFF, with a warning beside its switch in the admin panel
//   defaultVisible  true only for 'analytic' (derived from the class)
//
// How a surface is wired in the markup: put data-surface="<id>" on the element (for a tab, on both the nav button and its <section>), or wrap
// generated HTML with sf('<id>', html) in desk-terminal.html (a display:contents wrapper). access.js hides the switched-off ids with one
// stylesheet, so content that re-renders stays hidden.
//
// Where the saved switches live: KV key desk_tab_access_v1 ({ [id]: true|false, updatedAt }), served by /api/desk-access.

// CLASS (owner, 2026-11-13, the lens): every surface is one of three classes, and the class decides its default.
//   'analytic' ANALYSIS: model-made analytics on model data (the bias of the day, risk state, regime, currency strength, correlations, surprises,
//              forecast ranges, what the data is showing). Shown to the desk login by default.
//   'signal'   A TRADE SIGNAL, or anything that can be read as one: "this is a trade", buy here / short there, entries, stops, targets, invalidation levels
//              as a plan, position size, best expressions, playbooks, trade watch, hedge recommendations. Hidden by default.
//   'private'  The owner's own area: his book, exposure, record, journal, research, bots, ops, paid-model buttons, admin. Hidden by default.
// How to classify a new surface: could a reader take it as an instruction to place a trade at a level? Yes -> 'signal'. Is it the owner's own working
// area, or does it spend money? -> 'private'. Otherwise it is analysis -> 'analytic'. The guard test enforces the defaults.
export const CLASSES = ['analytic', 'signal', 'private'];
const mk = (id, kind, label, group, cls, note) => ({ id, kind, label, group, class: cls, defaultVisible: cls === 'analytic', ownerData: cls !== 'analytic', note });
const A = 'analytic', S = 'signal', P = 'private';

export const SURFACES = [
  // ── tabs ──
  mk('tab.overview', 'tab', 'Overview', 'Tabs', A, 'market panels, the bias of the day, risk state; the trade-like panels inside it are separate switches'),
  mk('tab.ccy', 'tab', 'Currencies', 'Tabs', A, 'the desk\'s bias per currency and its drivers; "best expressions" inside it is a separate switch'),
  mk('tab.assets', 'tab', 'Assets', 'Tabs', A, 'market boards and the bias on each market; entry, target, invalidation and size lines are separate switches'),
  mk('tab.macro', 'tab', 'Macro', 'Tabs', A, 'yields, credit, liquidity, central banks, macro engines, rates and policy'),
  mk('tab.pos', 'tab', 'Positioning', 'Tabs', A, 'COT, futures positioning, options positioning'),
  mk('tab.cal', 'tab', 'Calendar', 'Tabs', A, 'events, live surprises, expectations against reality'),
  mk('tab.ana', 'tab', 'Analytics', 'Tabs', A, 'currency strength over time, vol forecast vs realised, release reactions; the panels on the book are separate switches'),
  mk('tab.charts', 'tab', 'Charts', 'Tabs', A, 'ranking vs realised, macro regime, data surprises, positioning history, seasonality; the book flow is a separate switch'),
  mk('tab.today', 'tab', 'Chain', 'Tabs', A, 'the macro chain (Live/1D/5D/20D) and its read; reads are shared once a day'),
  mk('tab.read', 'tab', 'Trader\'s read', 'Tabs', P, 'the owner\'s own read of the day'),
  mk('tab.pair', 'tab', 'Pair', 'Tabs', A, 'one page per market; the research it pulls is shared once a day; entry, target and size lines are separate switches'),
  mk('tab.changed', 'tab', 'Changed', 'Tabs', A, 'what changed in the bias, the tone, world stress and the chain; card flips and the paper record are separate switches'),
  mk('tab.options', 'tab', 'Options', 'Tabs', A, 'skew, dealer hedging, put/call, option lines, the VIX term'),
  mk('tab.news', 'tab', 'News', 'Tabs', A, 'the wire with its reads'),
  mk('tab.corr', 'tab', 'Correlations & hedges', 'Tabs', A, 'matrix, rolling, factors and regimes; the hedge finder is a separate switch'),
  mk('tab.infomap', 'tab', 'Info map', 'Tabs', P, 'the owner\'s inventory of the repo\'s data'),
  // ── navigation links out to other pages ──
  mk('nav.research-tab', 'nav', 'Research link (tab bar)', 'Links', P, 'research.html'),
  mk('nav.research', 'nav', 'Research (top bar)', 'Links', P, 'research.html'),
  mk('nav.deskoffice', 'nav', 'Desk Office (top bar)', 'Links', P, 'desk-office.html: the desk\'s admin and ops'),
  mk('nav.deskrun', 'nav', 'Desk Run (top bar)', 'Links', P, 'desk-run.html: runs the desk (paid model calls)'),
  mk('nav.access', 'nav', 'Access (admin panel link)', 'Links', P, 'desk-admin.html: only the owner ever sees this one, whatever the switch says'),
  // ── widgets in the shell ──
  mk('widget.clocks', 'widget', 'Market clocks', 'Shell', A, 'session clocks in the top bar'),
  mk('widget.worldstress', 'widget', 'World stress strip', 'Shell', A, 'every stress input green/amber/red, pinned above the tabs'),
  mk('widget.bookchip', 'widget', 'Analysis date chip', 'Shell', A, 'the date and time of the morning analysis'),
  mk('widget.dqchip', 'widget', 'Data-quality chip', 'Shell', P, 'the desk\'s data health count (ops)'),
  mk('widget.ask', 'widget', 'Ask the desk (floating button)', 'Shell', P, 'free-form paid model calls: never for the desk login'),
  mk('widget.disclaimer', 'widget', 'Educational notice (desk login only)', 'Shell', A, 'one line under the tabs for the desk login: educational and informational macro analysis, not advice and not a trade signal'),
  mk('widget.signout', 'widget', 'Sign out (top bar)', 'Shell', A, 'shows the session (owner or desk) and signs out; always visible, never a switch'),
  // ── ticker segments ──
  mk('strip.news', 'strip', 'Ticker: tier-1 headlines', 'Ticker', A, 'wire headlines'),
  mk('strip.events', 'strip', 'Ticker: high-impact releases', 'Ticker', A, 'the next 36 hours of high-impact events'),
  mk('strip.gpr', 'strip', 'Ticker: geopolitical risk', 'Ticker', A, 'GPR level and trend'),
  mk('strip.zone', 'strip', 'Ticker: zone / target / invalid', 'Ticker', S, 'the trade watcher: "in zone", "target", "invalid" at a price'),
  mk('strip.regime', 'strip', 'Ticker: regime tone', 'Ticker', A, 'risk-on / risk-off tone of the day'),
  mk('strip.update', 'strip', 'Ticker: session updates', 'Ticker', A, 'the intraday update headlines (what changed in the read)'),
  mk('strip.risk', 'strip', 'Ticker: risk warnings', 'Ticker', A, 'the risks to the day\'s read'),
  // ── Overview panels ──
  mk('panel.ov.hero', 'panel', 'Overview: the globe and map', 'Overview', A, 'rate cycle, bank credit, fair value and the desk\'s currency bias layers'),
  mk('panel.ov.book', 'panel', 'Overview: today\'s headline', 'Overview', A, 'the one-sentence read of the day'),
  mk('panel.ov.bookintel', 'panel', 'Overview: book intelligence', 'Overview', P, 'the book\'s own concentration and exposure panels (js/terminal/bookPanels.js)'),
  mk('panel.ov.regime', 'panel', 'Overview: market regime', 'Overview', A, 'risk-on / risk-off tone, the summary, the drivers, what would flip it'),
  mk('panel.ov.regime-lists', 'panel', 'Overview: regime Buy / Sell lists', 'Overview', S, 'the Buy and Sell lists inside the regime card: these read as a recommendation'),
  mk('panel.ov.strength', 'panel', 'Overview: currency strength', 'Overview', A, 'the Currency Manager\'s ranking, strongest to weakest'),
  mk('panel.ov.exposure', 'panel', 'Overview: exposure chart', 'Overview', P, 'the book\'s currency exposure'),
  mk('panel.ov.record', 'panel', 'Overview: the desk\'s record', 'Overview', P, 'the desk\'s scored record'),
  mk('panel.ov.week', 'panel', 'Overview: this week', 'Overview', A, 'the weekly strategist\'s view: themes, key dates, what would change the week'),
  mk('panel.ov.bestpairs', 'panel', 'Overview: best pairs', 'Overview', S, 'the pair-selection matrix: how the view is best traded'),
  mk('panel.ov.riskstate', 'panel', 'Overview: risk state', 'Overview', A, 'the risk flags: market data'),
  mk('panel.ov.em', 'panel', 'Overview: emerging markets', 'Overview', A, 'EM gauges: market data'),
  mk('panel.ov.alerts', 'panel', 'Overview: desk alerts', 'Overview', P, 'the alert engine\'s status, including the Telegram mute'),
  mk('panel.ov.dayshape', 'panel', 'Overview: the day\'s shape', 'Overview', A, 'the day forecaster: volatility ranges (market data)'),
  mk('panel.ov.tradewatch', 'panel', 'Overview: trade watch', 'Overview', S, 'the book against live prices: zone, target, invalidation'),
  mk('panel.ov.playbooks', 'panel', 'Overview: playbooks', 'Overview', S, 'the six largest cards with entry, target, invalid and size'),
  mk('panel.ov.wire', 'panel', 'Overview: the wire', 'Overview', A, 'tier 1-2 headlines with their reads'),
  mk('panel.ov.releases', 'panel', 'Overview: releases ahead', 'Overview', A, 'the economist\'s release briefs: typical move, what to watch'),
  mk('panel.ov.riskwarn', 'panel', 'Overview: risk warnings', 'Overview', A, 'the risks to the day\'s read'),
  // ── Overview map layers (the pills on the world map and globe; js/terminal/mapLayers.js) ──
  mk('widget.ovl.bias', 'widget', 'Map layer: Desk bias', 'Overview map layers', A, 'the Currency Manager\'s ranking painted on the map: the desk\'s bias, an analysis layer'),
  mk('widget.ovl.rates', 'widget', 'Map layer: Rate cycle', 'Overview map layers', A, 'every BIS central bank by hiking / holding / cutting: market data'),
  mk('widget.ovl.level', 'widget', 'Map layer: Policy rate', 'Overview map layers', A, 'every BIS central bank by policy-rate level: market data'),
  mk('widget.ovl.priced', 'widget', 'Map layer: Priced path', 'Overview map layers', A, 'what the short-rate futures price for the eight banks over ~6 months: market data'),
  mk('widget.ovl.tone', 'widget', 'Map layer: Bank tone', 'Overview map layers', A, 'statement tone per bank from the Central banks board: description only (cb-tone-direction NULL)'),
  mk('widget.ovl.y10', 'widget', 'Map layer: 10Y yield', 'Overview map layers', A, 'government 10-year yields from the Global yields board: market data'),
  mk('widget.ovl.gap', 'widget', 'Map layer: 2Y gap to US', 'Overview map layers', A, '2-year yield gap to the US from the Global yields board: market data'),
  mk('widget.ovl.macro', 'widget', 'Map layer: Macro composite', 'Overview map layers', A, 'the macro engines composite per currency: market data, size not direction'),
  mk('widget.ovl.credit', 'widget', 'Map layer: Bank credit', 'Overview map layers', A, 'BIS cross-border bank credit growth: market data'),
  mk('widget.ovl.value', 'widget', 'Map layer: Fair value', 'Overview map layers', A, 'BIS real effective exchange rates against their 20-year average: market data'),
  // ── Currencies, Assets, Pair: the trade-level lines inside an otherwise analytic card ──
  mk('panel.ccy.expressions', 'panel', 'Currency card: best expressions', 'Currencies', S, 'the book\'s cards on a currency, with size'),
  mk('panel.asset.plan', 'panel', 'Market card: entry, target, invalid, timing', 'Markets', S, 'the plan lines on a card, and the entry zone / invalidation lines on the charts'),
  mk('panel.asset.size', 'panel', 'Market card: size and grade', 'Markets', S, 'the position size and the conviction grade derived from it'),
  // ── Analytics panels ──
  mk('panel.ana.web', 'panel', 'Analytics: correlation web of the book', 'Analytics', P, 'today\'s cards as held'),
  mk('panel.ana.strength', 'panel', 'Analytics: currency strength over time', 'Analytics', A, 'the Currency Manager\'s bias each morning'),
  mk('panel.ana.track', 'panel', 'Analytics: the desk\'s track record', 'Analytics', P, 'day score, cumulative, against the controls'),
  mk('panel.ana.fall', 'panel', 'Analytics: which layer earned it', 'Analytics', P, 'the attribution waterfall'),
  mk('panel.ana.volfc', 'panel', 'Analytics: vol forecast against what happened', 'Analytics', A, 'forecast range against the realised range'),
  mk('panel.ana.days', 'panel', 'Analytics: the desk\'s days', 'Analytics', P, 'each scored day'),
  mk('panel.ana.fans', 'panel', 'Analytics: release reactions', 'Analytics', A, 'how markets moved after past releases'),
  mk('panel.ana.analysts', 'panel', 'Analytics: analyst scorecard', 'Analytics', P, 'each analyst\'s calls scored'),
  mk('panel.ana.risk', 'panel', 'Analytics: factor risk and scenarios', 'Analytics', P, 'the book\'s VaR, factor bets and scenario P&L'),
  mk('panel.ana.scenmap', 'panel', 'Analytics: scenario map', 'Analytics', P, 'every scenario against every card'),
  // ── Charts, Changed, Correlations, Macro ──
  mk('panel.charts.bookflow', 'panel', 'Charts: how today\'s book was built', 'Charts', S, 'the ruling to the currencies to every card'),
  mk('panel.charts.ranking', 'panel', 'Charts: currency ranking vs realised', 'Charts', A, 'the Currency Manager\'s order against how currencies finished'),
  mk('panel.changed.cards', 'panel', 'Changed: card flips', 'Changed', S, 'a card added, removed or flipped, with its size'),
  mk('panel.changed.thesis', 'panel', 'Changed: thesis against reality', 'Changed', P, 'the book\'s claims laid against the evening score'),
  mk('panel.changed.paper', 'panel', 'Changed: paper trades', 'Changed', P, 'the paper-trade running total'),
  mk('panel.corr.hedges', 'panel', 'Correlations: the hedge finder', 'Correlations', S, 'ranked hedges for a market or a book card'),
  mk('panel.macro.carryside', 'panel', 'Macro: carry board "side" column', 'Macro', S, 'which side of a pair earns the carry'),
];

export const KINDS = ['tab', 'nav', 'widget', 'strip', 'panel'];
export const SURFACE_IDS = SURFACES.map(s => s.id);
export const DEFAULT_VISIBLE_IDS = SURFACES.filter(s => s.defaultVisible).map(s => s.id);
/** Surfaces only the owner ever sees, whatever the saved switches say: every link out to another page (it would bounce a desk login to the main login)
    and every PRIVATE surface (the owner's own area: its data routes are withheld from the desk login, so switching one on could only show an empty shell).
    They are not listed in the admin panel and are never in a viewer's visible list. Derived from the registry, so a new private surface or link is covered automatically. */
export const ALWAYS_OWNER_IDS = SURFACES.filter(s => s.kind === 'nav' || s.class === 'private').map(s => s.id);
/** Surfaces every session always sees, whatever the saved switches say (Sign out: a viewer must always be able to leave). */
export const ALWAYS_VISIBLE_IDS = ['widget.signout'];

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
  for (const id of ALWAYS_VISIBLE_IDS) on.add(id);
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
    if (ALWAYS_OWNER_IDS.includes(id) || ALWAYS_VISIBLE_IDS.includes(id)) continue;
    clean[id] = v;
  }
  return { ok: true, clean };
}
