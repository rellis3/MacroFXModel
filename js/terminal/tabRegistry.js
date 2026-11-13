// js/terminal/tabRegistry.js: the SURFACE REGISTRY of the Desk Terminal. Pure data + three small functions; no DOM, no fetch.
//
// THE DESIGN RULE (owner, 2026-11-13): every tab, nav link, widget, ticker segment and panel the terminal can show is a SURFACE, and every
// surface is listed here, so the owner can switch it for the desk login in the admin panel (desk-admin.html). The guard test
// (js/terminal/tabRegistry.test.mjs) FAILS until a new surface is registered.
//
// THE THREE RULES (owner, 2026-11-13, after the first two builds hid far too much). The desk login is an education tool and a macro dashboard.
//   Hide ONLY these, each with a reason on its row:
//     'trade'     anything that is, or can be read as, a TRADE INSTRUCTION, so nobody can say "Richard told me to trade": Trade Watch, playbooks,
//                 best pairs / best expressions, entry / stop / target / invalidation / size lines on a card, the ticker's zone / target / invalid,
//                 the Trader's read tab, the hedge finder.
//     'cost'      anything that costs money: Research, Ask the desk, every free-form or paid model button. (The shared once-a-day reads STAY.)
//     'internal'  the owner's own tooling: Info map, Desk Office, Desk Run, Access, the data-quality chip, alerts, links to pages outside the desk zone.
//     'pnl'       real P&L, accounts, bots, journal, paper trades, and the desk's track record. Hidden by default, switchable.
//   EVERYTHING ELSE IS SHOWN, including the directional analysis and why (which currencies the desk leans bullish or bearish, the reasons),
//   book intelligence, net currency exposure, scenarios, strength, scores, ratings, drivers, risk, regime, correlations.
//   A surface with a `hidden` reason is OFF by default; a surface without one is ON by default. The guard test enforces both.
//
//   kind   'tab'    a button in the nav (data-t) and its section
//          'nav'    a link out to another page (top bar, or the tab bar). LOCKED hidden for the desk login (it would bounce to the main login).
//          'widget' a fixed piece of the shell: a chip, the Ask pill, the clocks, the world-stress strip, a map layer
//          'strip'  one kind of segment in the headline ticker
//          'panel'  a block inside a tab (an Overview card, a Charts card)
//
// How a surface is wired in the markup: put data-surface="<id>" on the element (for a tab, on both the nav button and its <section>), or wrap
// generated HTML with sf('<id>', html) in desk-terminal.html (a display:contents wrapper). access.js hides the switched-off ids with one
// stylesheet, so content that re-renders stays hidden.
//
// Where the saved switches live: KV key desk_tab_access_v1 ({ schema, [id]: true|false, updatedAt }), served by /api/desk-access. `schema` is
// SCHEMA below: when the rules change, bump it and every old saved override is ignored (the new defaults apply until the owner saves again).

/** Bump when the defaults or the rules change: old saved switches are then ignored (the admin page says so). */
export const SCHEMA = 2;

export const HIDDEN_REASONS = ['trade', 'cost', 'internal', 'pnl'];
export const REASON_LABEL = { trade: 'trade', cost: 'cost', internal: 'internal', pnl: 'P&L' };
/** One line shown beside a switch when the owner turns a hidden-by-reason surface ON for the desk login. */
export const REASON_WARNING = {
  trade: 'Reads as a trade instruction. Switching it on shows trade-level lines to the desk login.',
  cost: 'Costs money (paid model calls). Switching it on shows the control; the server still refuses paid calls from the desk login.',
  internal: 'Your own tooling. Switching it on shows it to the desk login; its data routes are still refused, so it may show empty.',
  pnl: 'Real or scored P&L, the desk\'s record. Switching it on shows it to the desk login.',
};

// mk(id, kind, label, group, hidden, note): hidden is null (shown) or one of HIDDEN_REASONS (off by default).
const mk = (id, kind, label, group, hidden, note) => ({ id, kind, label, group, hidden, defaultVisible: !hidden, note });
const T = 'trade', C = 'cost', I = 'internal', M = 'pnl';

export const SURFACES = [
  // ── tabs ──
  mk('tab.overview', 'tab', 'Overview', 'Tabs', null, 'market panels, the bias of the day, risk state, regime, book intelligence and exposure; the trade-like panels inside it are separate switches'),
  mk('tab.ccy', 'tab', 'Currencies', 'Tabs', null, 'the desk\'s bias per currency and its drivers; "best expressions" inside it is a separate switch'),
  mk('tab.assets', 'tab', 'Assets', 'Tabs', null, 'market boards and the bias on each market; entry, target, invalidation and size lines are separate switches'),
  mk('tab.macro', 'tab', 'Macro', 'Tabs', null, 'yields, credit, liquidity, central banks, macro engines, rates and policy'),
  mk('tab.pos', 'tab', 'Positioning', 'Tabs', null, 'COT, futures positioning, options positioning'),
  mk('tab.cal', 'tab', 'Calendar', 'Tabs', null, 'events, live surprises, expectations against reality'),
  mk('tab.ana', 'tab', 'Analytics', 'Tabs', null, 'the book\'s correlation web, factor risk and scenarios, currency strength over time, vol forecast vs realised, release reactions; the desk\'s record panels are separate switches'),
  mk('tab.charts', 'tab', 'Charts', 'Tabs', null, 'macro regime, data surprises, positioning history, seasonality, how the book was built; ranking vs realised is a separate switch'),
  mk('tab.today', 'tab', 'Chain', 'Tabs', null, 'the macro chain (Live/1D/5D/20D) and its read; reads are shared once a day'),
  mk('tab.read', 'tab', 'Trader\'s read', 'Tabs', T, 'the owner\'s own read of the day: marking up a trade'),
  mk('tab.pair', 'tab', 'Pair', 'Tabs', null, 'one page per market; the research it pulls is shared once a day; entry, target and size lines are separate switches'),
  mk('tab.changed', 'tab', 'Changed', 'Tabs', null, 'what changed in the bias, the tone, world stress and the chain; the thesis check and the paper record are separate switches'),
  mk('tab.options', 'tab', 'Options', 'Tabs', null, 'skew, dealer hedging, put/call, option lines, the VIX term'),
  mk('tab.news', 'tab', 'News', 'Tabs', null, 'the wire with its reads'),
  mk('tab.corr', 'tab', 'Correlations & hedges', 'Tabs', null, 'matrix, rolling, factors and regimes; the hedge finder is a separate switch'),
  mk('tab.infomap', 'tab', 'Info map', 'Tabs', I, 'the owner\'s inventory of the repo\'s data'),
  // ── navigation links out to other pages (locked hidden: they would bounce a desk login to the main login) ──
  mk('nav.research-tab', 'nav', 'Research link (tab bar)', 'Links', C, 'research.html: expensive paid model work'),
  mk('nav.research', 'nav', 'Research (top bar)', 'Links', C, 'research.html: expensive paid model work'),
  mk('nav.deskoffice', 'nav', 'Desk Office (top bar)', 'Links', I, 'desk-office.html: the desk\'s admin and ops'),
  mk('nav.deskrun', 'nav', 'Desk Run (top bar)', 'Links', I, 'desk-run.html: runs the desk (paid model calls)'),
  mk('nav.access', 'nav', 'Access (admin panel link)', 'Links', I, 'desk-admin.html: only the owner ever sees this one'),
  // ── widgets in the shell ──
  mk('widget.clocks', 'widget', 'Market clocks', 'Shell', null, 'session clocks in the top bar'),
  mk('widget.worldstress', 'widget', 'World stress strip', 'Shell', null, 'every stress input green/amber/red, pinned above the tabs'),
  mk('widget.bookchip', 'widget', 'Analysis date chip', 'Shell', null, 'the date and time of the morning analysis'),
  mk('widget.dqchip', 'widget', 'Data-quality chip', 'Shell', I, 'the desk\'s data health count (ops)'),
  mk('widget.ask', 'widget', 'Ask the desk (floating button)', 'Shell', C, 'free-form paid model calls'),
  mk('widget.disclaimer', 'widget', 'Educational notice (desk login only)', 'Shell', null, 'one line under the tabs for the desk login: educational and informational macro analysis, not advice and not a trade signal'),
  mk('widget.signout', 'widget', 'Sign out (top bar)', 'Shell', null, 'shows the session (owner or desk) and signs out; always shown, so a desk user can always leave'),
  mk('widget.themepicker', 'widget', 'Colour theme picker (top bar)', 'Shell', null, 'swatches that change the colours, the glow and the fonts; remembered in this browser; changes nothing else'),
  // ── ticker segments ──
  mk('strip.news', 'strip', 'Ticker: tier-1 headlines', 'Ticker', null, 'wire headlines'),
  mk('strip.events', 'strip', 'Ticker: high-impact releases', 'Ticker', null, 'the next 36 hours of high-impact events'),
  mk('strip.gpr', 'strip', 'Ticker: geopolitical risk', 'Ticker', null, 'GPR level and trend'),
  mk('strip.zone', 'strip', 'Ticker: zone / target / invalid', 'Ticker', T, 'the trade watcher: "in zone", "target", "invalid" at a price'),
  mk('strip.regime', 'strip', 'Ticker: regime tone', 'Ticker', null, 'risk-on / risk-off tone of the day'),
  mk('strip.update', 'strip', 'Ticker: session updates', 'Ticker', null, 'the intraday update headlines (what changed in the read)'),
  mk('strip.risk', 'strip', 'Ticker: risk warnings', 'Ticker', null, 'the risks to the day\'s read'),
  // ── Overview panels ──
  mk('panel.ov.hero', 'panel', 'Overview: the globe and map', 'Overview', null, 'rate cycle, bank credit, fair value and the desk\'s currency bias layers'),
  mk('panel.ov.book', 'panel', 'Overview: today\'s headline', 'Overview', null, 'the one-sentence read of the day'),
  mk('panel.ov.bookintel', 'panel', 'Overview: book intelligence', 'Overview', null, 'the global call, risk-off, the largest net currency, scenario loss, concentration (js/terminal/bookPanels.js)'),
  mk('panel.ov.regime', 'panel', 'Overview: market regime', 'Overview', null, 'risk-on / risk-off tone, the summary, the drivers, what would flip it, and the currencies the desk leans bullish or bearish'),
  mk('panel.ov.regime-lists', 'panel', 'Overview: regime lean lists', 'Overview', null, 'the currencies the desk leans bullish and bearish inside the regime card, shown to the desk login as "bullish lean / bearish lean" with the reasons'),
  mk('panel.ov.strength', 'panel', 'Overview: currency strength', 'Overview', null, 'the Currency Manager\'s ranking, strongest to weakest'),
  mk('panel.ov.exposure', 'panel', 'Overview: net currency exposure', 'Overview', null, 'the book\'s net exposure by currency'),
  mk('panel.ov.record', 'panel', 'Overview: the desk\'s record', 'Overview', M, 'the desk\'s scored record'),
  mk('panel.ov.week', 'panel', 'Overview: this week', 'Overview', null, 'the weekly strategist\'s view: themes, key dates, what would change the week'),
  mk('panel.ov.bestpairs', 'panel', 'Overview: best pairs', 'Overview', T, 'the pair-selection matrix: how the view is best traded'),
  mk('panel.ov.riskstate', 'panel', 'Overview: risk state', 'Overview', null, 'the risk flags: market data'),
  mk('panel.ov.em', 'panel', 'Overview: emerging markets', 'Overview', null, 'EM gauges: market data'),
  mk('panel.ov.alerts', 'panel', 'Overview: desk alerts', 'Overview', I, 'the alert engine\'s status, including the Telegram mute'),
  mk('panel.ov.dayshape', 'panel', 'Overview: the day\'s shape', 'Overview', null, 'the day forecaster: volatility ranges (market data)'),
  mk('panel.ov.tradewatch', 'panel', 'Overview: trade watch', 'Overview', T, 'the book against live prices: zone, target, invalidation'),
  mk('panel.ov.playbooks', 'panel', 'Overview: playbooks', 'Overview', T, 'the six largest cards with entry, target, invalid and size'),
  mk('panel.ov.wire', 'panel', 'Overview: the wire', 'Overview', null, 'tier 1-2 headlines with their reads'),
  mk('panel.ov.releases', 'panel', 'Overview: releases ahead', 'Overview', null, 'the economist\'s release briefs: typical move, what to watch'),
  mk('panel.ov.riskwarn', 'panel', 'Overview: risk warnings', 'Overview', null, 'the risks to the day\'s read'),
  // ── Overview map layers (the pills on the world map and globe; js/terminal/mapLayers.js) ──
  mk('widget.ovl.bias', 'widget', 'Map layer: Desk bias', 'Overview map layers', null, 'the Currency Manager\'s ranking painted on the map: the desk\'s bias, an analysis layer'),
  mk('widget.ovl.rates', 'widget', 'Map layer: Rate cycle', 'Overview map layers', null, 'every BIS central bank by hiking / holding / cutting: market data'),
  mk('widget.ovl.level', 'widget', 'Map layer: Policy rate', 'Overview map layers', null, 'every BIS central bank by policy-rate level: market data'),
  mk('widget.ovl.priced', 'widget', 'Map layer: Priced path', 'Overview map layers', null, 'what the short-rate futures price for the eight banks over ~6 months: market data'),
  mk('widget.ovl.tone', 'widget', 'Map layer: Bank tone', 'Overview map layers', null, 'statement tone per bank from the Central banks board: description only (cb-tone-direction NULL)'),
  mk('widget.ovl.y10', 'widget', 'Map layer: 10Y yield', 'Overview map layers', null, 'government 10-year yields from the Global yields board: market data'),
  mk('widget.ovl.gap', 'widget', 'Map layer: 2Y gap to US', 'Overview map layers', null, '2-year yield gap to the US from the Global yields board: market data'),
  mk('widget.ovl.macro', 'widget', 'Map layer: Macro composite', 'Overview map layers', null, 'the macro engines composite per currency: market data, size not direction'),
  mk('widget.ovl.credit', 'widget', 'Map layer: Bank credit', 'Overview map layers', null, 'BIS cross-border bank credit growth: market data'),
  mk('widget.ovl.value', 'widget', 'Map layer: Fair value', 'Overview map layers', null, 'BIS real effective exchange rates against their 20-year average: market data'),
  // ── Currencies, Assets, Pair: the trade-level lines inside an otherwise analytic card ──
  mk('panel.ccy.expressions', 'panel', 'Currency card: best expressions', 'Currencies', T, 'the book\'s cards on a currency, with size: how to trade the view'),
  mk('panel.asset.plan', 'panel', 'Market card: entry, target, invalid, timing', 'Markets', T, 'the plan lines on a card, and the entry zone / invalidation lines on the charts'),
  mk('panel.asset.size', 'panel', 'Market card: size and grade', 'Markets', T, 'the position size and the conviction grade derived from it'),
  // ── Analytics panels ──
  mk('panel.ana.web', 'panel', 'Analytics: correlation web of the book', 'Analytics', null, 'today\'s cards as held, joined by how they move together'),
  mk('panel.ana.strength', 'panel', 'Analytics: currency strength over time', 'Analytics', null, 'the Currency Manager\'s bias each morning'),
  mk('panel.ana.track', 'panel', 'Analytics: the desk\'s track record', 'Analytics', M, 'day score, cumulative, against the controls'),
  mk('panel.ana.fall', 'panel', 'Analytics: which layer earned it', 'Analytics', M, 'the attribution waterfall of the desk\'s scored days'),
  mk('panel.ana.volfc', 'panel', 'Analytics: vol forecast against what happened', 'Analytics', null, 'forecast range against the realised range'),
  mk('panel.ana.days', 'panel', 'Analytics: the desk\'s days', 'Analytics', M, 'each scored day'),
  mk('panel.ana.fans', 'panel', 'Analytics: release reactions', 'Analytics', null, 'how markets moved after past releases'),
  mk('panel.ana.analysts', 'panel', 'Analytics: analyst scorecard', 'Analytics', null, 'each analyst\'s calls scored'),
  mk('panel.ana.risk', 'panel', 'Analytics: factor risk and scenarios', 'Analytics', null, 'the book as dollar, carry, risk-on, commodity and US-rates bets, its VaR and what a shock does to it'),
  mk('panel.ana.scenmap', 'panel', 'Analytics: scenario map', 'Analytics', null, 'every scenario against every card'),
  // ── Charts, Changed, Correlations, Macro ──
  mk('panel.charts.bookflow', 'panel', 'Charts: how today\'s book was built', 'Charts', null, 'the ruling to the currencies to every card'),
  mk('panel.charts.ranking', 'panel', 'Charts: currency ranking vs realised', 'Charts', M, 'the Currency Manager\'s order against how currencies finished: the desk\'s accuracy record'),
  mk('panel.changed.cards', 'panel', 'Changed: card flips', 'Changed', null, 'a card added, removed or flipped: what changed in the lean'),
  mk('panel.changed.thesis', 'panel', 'Changed: thesis against reality', 'Changed', M, 'the book\'s claims laid against the evening score'),
  mk('panel.changed.paper', 'panel', 'Changed: paper trades', 'Changed', M, 'the paper-trade running total'),
  mk('panel.corr.hedges', 'panel', 'Correlations: the hedge finder', 'Correlations', T, 'ranked hedges for a market or a book card: what to put on'),
  mk('panel.macro.fedyields', 'panel', 'Macro: the Fed path against the yields', 'Macro', null, 'the priced fed funds path (December, June) beside the 2Y, 2s10s and 10Y over the same 1D/5D/20D dates, how much of the 2Y the futures path accounts for, and the Atlanta Fed window odds'),
  mk('panel.macro.creditliq', 'panel', 'Macro: credit & liquidity', 'Macro', null, 'the Credit Stress Index, the long-history Baa-10Y spread against 5 and 20 years, global central-bank liquidity (level, impulse, by bank) and the liquidity conditions z-scores'),
  mk('panel.macro.carryside', 'panel', 'Macro: carry board "side" column', 'Macro', null, 'which side of a pair earns the carry'),
];

export const KINDS = ['tab', 'nav', 'widget', 'strip', 'panel'];
export const SURFACE_IDS = SURFACES.map(s => s.id);
export const DEFAULT_VISIBLE_IDS = SURFACES.filter(s => s.defaultVisible).map(s => s.id);
/** Surfaces that stay hidden from the desk login whatever the switches say: every link out to another page (it would bounce a desk login to the main
    login). They ARE listed in the admin panel, with a lock. Derived from the registry, so a new link is covered automatically. */
export const LOCKED_HIDDEN_IDS = SURFACES.filter(s => s.kind === 'nav').map(s => s.id);
/** Surfaces every session always sees, whatever the saved switches say (Sign out: a desk user must always be able to leave). */
export const ALWAYS_VISIBLE_IDS = ['widget.signout'];

export const surfaceById = id => SURFACES.find(s => s.id === id) ?? null;

/**
 * The ids a session may see. role 'owner' => every id. role 'viewer' => DEFAULT_VISIBLE_IDS, overridden by the saved switches
 * (saved: { [id]: boolean }, ids not in the registry are ignored), never including LOCKED_HIDDEN_IDS. The caller drops `saved` whole when
 * saved.schema !== SCHEMA (see savedFor).
 */
export function visibleFor(role, saved) {
  if (role === 'owner') return [...SURFACE_IDS];
  const on = new Set(DEFAULT_VISIBLE_IDS);
  for (const [id, v] of Object.entries(saved ?? {})) { if (!surfaceById(id)) continue; if (v === true) on.add(id); else if (v === false) on.delete(id); }
  for (const id of LOCKED_HIDDEN_IDS) on.delete(id);
  for (const id of ALWAYS_VISIBLE_IDS) on.add(id);
  return SURFACE_IDS.filter(id => on.has(id));
}

/** The saved switches that still apply: an object saved under another schema is ignored whole (the rules changed). */
export function savedFor(stored) {
  if (!stored || typeof stored !== 'object') return { saved: {}, reset: false };
  const old = stored.schema !== SCHEMA;
  const hasSwitches = Object.keys(stored).some(k => k !== 'updatedAt' && k !== 'schema');
  return old ? { saved: {}, reset: hasSwitches } : { saved: stored, reset: false };
}

/** Validate a POST body of switches: only known ids, only booleans. Returns { ok, clean } or { ok:false, error }. */
export function cleanSwitches(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'expected an object of { id: true|false }' };
  const clean = {};
  for (const [id, v] of Object.entries(body)) {
    if (id === 'updatedAt' || id === 'schema') continue;
    if (!surfaceById(id)) return { ok: false, error: `unknown surface id: ${id}` };
    if (typeof v !== 'boolean') return { ok: false, error: `${id} must be true or false` };
    if (LOCKED_HIDDEN_IDS.includes(id) || ALWAYS_VISIBLE_IDS.includes(id)) continue;
    clean[id] = v;
  }
  return { ok: true, clean };
}
