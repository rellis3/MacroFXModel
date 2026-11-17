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
//     'preview'   (2026-11-15) a NEW terminal feature the owner is still trying out (command line, linked selection). The owner always sees it; the desk login sees it only when the owner flips it on.
//   EVERYTHING ELSE IS SHOWN, including the directional analysis and why (which currencies the desk leans bullish or bearish, the reasons),
//   book intelligence, net currency exposure, scenarios, strength, scores, ratings, drivers, risk, regime, correlations.
//   A surface with a `hidden` reason is OFF by default; a surface without one is ON by default. The guard test enforces both.
//
//   kind   'tab'    a button in the nav (data-t) and its section
//          'nav'    a link out to another page (top bar, or the tab bar). LOCKED hidden for the desk login (it would bounce to the main login).
//          'widget' a fixed piece of the shell: a chip, the Ask pill, the clocks, the world-stress strip, a map layer
//          'strip'  one kind of segment in the headline ticker
//          'panel'  a block inside a tab (an Overview card, a History card)
//
// How a surface is wired in the markup: put data-surface="<id>" on the element (for a tab, on both the nav button and its <section>), or wrap
// generated HTML with sf('<id>', html) in desk-terminal.html (a display:contents wrapper). access.js hides the switched-off ids with one
// stylesheet, so content that re-renders stays hidden.
//
// Where the saved switches live: KV key desk_tab_access_v1 ({ schema, [id]: true|false, updatedAt }), served by /api/desk-access. `schema` is
// SCHEMA below: when the rules change, bump it and every old saved override is ignored (the new defaults apply until the owner saves again).

/** Bump when the defaults or the rules change: old saved switches are then ignored (the admin page says so). */
export const SCHEMA = 2;

export const HIDDEN_REASONS = ['trade', 'cost', 'internal', 'pnl', 'preview'];
export const REASON_LABEL = { trade: 'trade', cost: 'cost', internal: 'internal', pnl: 'P&L', preview: 'preview' };
/** One line shown beside a switch when the owner turns a hidden-by-reason surface ON for the desk login. */
export const REASON_WARNING = {
  trade: 'Reads as a trade instruction. Switching it on shows trade-level lines to the desk login.',
  cost: 'Costs money (paid model calls). Switching it on shows the control; the server still refuses paid calls from the desk login.',
  internal: 'Your own tooling. Switching it on shows it to the desk login; its data routes are still refused, so it may show empty.',
  pnl: 'Real or scored P&L, the desk\'s record. Switching it on shows it to the desk login.',
  preview: 'A new feature you are still trying out. Switching it on shows it to everyone on the desk login.',
};

// mk(id, kind, label, group, hidden, note): hidden is null (shown) or one of HIDDEN_REASONS (off by default).
const mk = (id, kind, label, group, hidden, note) => ({ id, kind, label, group, hidden, defaultVisible: !hidden, note });
const T = 'trade', C = 'cost', I = 'internal', M = 'pnl', P = 'preview';

export const SURFACES = [
  // ── tabs ──
  mk('tab.overview', 'tab', 'Overview', 'Tabs', null, 'market panels, the bias of the day, risk state, regime, book intelligence and exposure; the trade-like panels inside it are separate switches'),
  mk('tab.ccy', 'tab', 'Currencies', 'Tabs', null, 'the desk\'s bias per currency and its drivers; "best expressions" inside it is a separate switch'),
  mk('tab.assets', 'tab', 'Assets', 'Tabs', null, 'market boards and the bias on each market; entry, target, invalidation and size lines are separate switches'),
  mk('tab.macro', 'tab', 'Macro', 'Tabs', null, 'yields, credit, liquidity, central banks, macro engines, rates and policy'),
  mk('tab.pos', 'tab', 'Positioning', 'Tabs', null, 'COT, futures positioning, options positioning, positioning history'),
  mk('tab.cal', 'tab', 'Calendar', 'Tabs', null, 'events, live surprises, expectations against reality'),
  mk('tab.ana', 'tab', 'Analytics', 'Tabs', null, 'the book\'s correlation web, factor risk and scenarios, currency strength over time, vol forecast vs realised, release reactions; the desk\'s record panels are separate switches'),
  mk('tab.charts', 'tab', 'History', 'Tabs', null, 'was Charts: macro regime, data surprises, seasonality, how the book was built; ranking vs realised is a separate switch. Positioning history moved to the Positioning tab'),
  mk('tab.today', 'tab', 'Chain', 'Tabs', null, 'the macro chain (Live/1D/5D/20D) and its read; reads are shared once a day'),
  mk('tab.read', 'tab', 'Trader\'s read', 'Tabs', T, 'the owner\'s own read of the day: marking up a trade'),
  mk('tab.deep', 'tab', 'Deep dive', 'Tabs', P, 'the 13 reference cards that sit under a market on the Pair page (rates, fair value, positioning, options, hours, lead-lag, news, precedent, research), in four sections, one market at a time. While this is off, the Pair page keeps all 13 cards exactly as before; switched on, the Pair page is slim and the cards live here'),
  mk('tab.pair', 'tab', 'Pair', 'Tabs', null, 'one page per market; the research it pulls is shared once a day; entry, target and size lines are separate switches'),
  mk('tab.changed', 'tab', 'Changed', 'Tabs', null, 'what changed in the bias, the tone, world stress and the chain; the thesis check and the paper record are separate switches'),
  mk('tab.replay', 'tab', 'Replay', 'Tabs', null, 'play a past session forward: candles, the option levels as published then, touches of them, strength and the desk\'s book as of the moment; it describes, it never predicts'),
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
  mk('widget.mktchip', 'widget', 'Market-closed chip', 'Shell', null, 'top-bar chip while the FX week is shut ("closed · as at Fri 22:00 UTC"), and a note on a US/UK/euro holiday; the live boards show the close instead of going flat'),
  mk('widget.terrainlive', 'widget', 'Terrain live price line', 'Options', null, 'on the OI terrain chart (Options tab): a violet line for the price now with its age ("at close" while the market is shut) and the distance to the nearest labelled level above and below, in points and in expected-move units; the white snapshot line is relabelled; where price is, not where it will go'),
  mk('widget.dqchip', 'widget', 'Data-quality chip', 'Shell', I, 'the desk\'s data health count (ops)'),
  mk('widget.ask', 'widget', 'Ask the desk (floating button)', 'Shell', C, 'free-form paid model calls'),
  mk('widget.disclaimer', 'widget', 'Educational notice (desk login only)', 'Shell', null, 'one line under the tabs for the desk login: educational and informational macro analysis, not advice and not a trade signal'),
  mk('widget.signout', 'widget', 'Sign out (top bar)', 'Shell', null, 'shows the session (owner or desk) and signs out; always shown, so a desk user can always leave'),
  mk('widget.themepicker', 'widget', 'Colour theme picker (top bar)', 'Shell', null, 'swatches that change the colours, the glow and the fonts; remembered in this browser; changes nothing else'),
  mk('widget.phonemenu', 'widget', 'Phone menu button (top bar)', 'Shell', null, 'on a phone the top bar is one slim bar and this More button opens the rest (theme, status chips, links); always shown, so no control is left unreachable'),
  // ── preview features: the owner always sees them, the desk login only once the owner switches them on (shortcut under the Info map tab) ──
  mk('widget.cmdline', 'widget', 'Command line (press / or `)', 'Terminal features (preview)', P, 'type a market, a board or a command (EURUSD, FED, MACRO RATES, REPLAY NQ 12 NOV) and jump straight there; every command has its own help line and ? lists them all'),
  mk('panel.cal.drills', 'panel', 'Calendar: drills', 'Terminal features (preview)', P, 'on the Calendar tab: the big earnings this week, the scorecards of the latest releases (how big each market moved against a normal half-hour), and on every release row a drill with what the release has done to markets before (size, not direction) and the nowcast gap for the matching US rows'),
  mk('widget.export', 'widget', 'Export (CSV and PNG)', 'Terminal features (preview)', P, 'a CSV button on the tables and a PNG button on the charts of the Monitor, Insight, Calendar and Currencies tabs, and the EXPORT command; the file is made in this browser from what the page shows, nothing is sent anywhere'),
  mk('panel.news.saved', 'panel', 'News: saved searches', 'Terminal features (preview)', P, 'keep the News tab filter (words, tier, currency or asset) under a name and apply it in one click. The desk login keeps its own searches in its own browser only, shared with no one; the owner keeps theirs on the server. Only the owner sees the Alert me button (it sends the one Telegram chat a note per episode when a NEW headline matches)'),
  mk('tab.monitor', 'tab', 'Monitor', 'Tabs', P, 'a dense table of the markets you pick (add, remove, reorder, sort) with last price, 24h change, range used against the forecast, implied vol over sigma, the morning read, the next release and the quote age; named monitors are saved for the desk'),
  mk('tab.workspace', 'tab', 'Workspace', 'Tabs', P, 'a grid of this terminal panels you drag and resize into a screen of your own, saved under a name (Morning, Rates, Event day) and shared by the desk; export and import as a file'),
  mk('tab.kchart', 'tab', 'Chart', 'Tabs', P, 'a candle chart with built-in indicators (moving averages, Bollinger bands, RSI, MACD; each has settings you can change) on the terminal\'s own bars, with the day\'s forecast lines, option walls near price and the session range laid over it; beside the glow charts, replaces none'),
  mk('tab.insight', 'tab', 'Insight', 'Tabs', P, 'boards that read the data the terminal already holds in a new way: what is unusual right now against its own history, and more as they are added; each says how far to trust it'),
  mk('panel.insight.unusual', 'panel', 'Insight: what is unusual right now', 'Insight (preview)', null, 'every series in the daily market bundle ranked by how extreme its latest reading is against its own history (a percentile, not a size), with a sky map, the plain-words reason, the working and how many readings would be extreme by chance alone'),
  mk('panel.insight.matrix', 'panel', 'Insight: cross-asset moves and correlations', 'Insight (preview)', null, 'every market in a basket of 23 with its 1, 5 and 20 session move (colour = direction, brightness = how unusual for that market), and a correlation matrix of daily moves over 20 and 120 sessions with the pairs whose link has changed by more than noise explains'),
  mk('panel.insight.rotation', 'panel', 'Insight: US sector rotation', 'Insight (preview)', null, 'the 11 US sector ETFs against the S&P 500 over 20 sessions: relative strength and its momentum on a glowing map with a four-week trail, and which quadrant each sector sits in; describes what happened, not a forecast'),
  mk('panel.insight.fxmatrix', 'panel', 'Insight: currency matrix', 'Insight (preview)', null, 'the eight currencies across the 1H, 4H, 1D and 1W windows (strength in sigma, rank, and whether each is stronger or weaker lately than over the longer windows) and an 8 by 8 grid of how far each has out-run each other; live from the price bars, anchored to the last close when the market is shut; ordering and size only'),
  mk('panel.insight.gold', 'panel', 'Insight: gold board', 'Insight (preview)', null, 'gold with the things it is read against on one page: the 10-year real yield, the dollar index, gold implied vol against its own realised vol, speculative positioning, the gold ETF holdings, and how much of the recent move in gold the dollar and real yields usually account for; descriptive, not a forecast'),
  mk('panel.insight.reach', 'panel', 'Insight: level reach', 'Insight (preview)', null, 'type a price level on a market and get the chance price touches it by the end of the London day (the remaining-travel model) and over the whole session (the forecast ladder), each with a likely range, the calibration note and the forecast lines the chance is read from; how likely price is to reach a level, never whether it holds or which way it goes'),
  mk('panel.insight.flags', 'panel', 'Insight: risk flags with their evidence', 'Insight (preview)', null, 'the six market-stress lights as they stand now, each beside what the Evidence Book found for it: only a flag with a validated range finding is presented as one that says something (the next days or weeks run wider, never which way); the others are labelled as lights'),
  mk('panel.insight.economies', 'panel', 'Insight: world economies', 'Insight (preview)', null, 'a tile for each of the eight economies with growth, prices, jobs and spending, each with an arrow and a word and the month it describes; the arrows compare a reading with its own anchor, they are levels not trends; missing feeds say so'),
  mk('panel.insight.bis', 'panel', 'Insight: bank credit heat strip (BIS)', 'Insight (preview)', P, 'five series of cross-border bank-claim growth from 1999 to the latest quarter as heat strips against the bank-credit study bands (fast above 7.6 percent, slow below 2.68), the 2000-02 and 2008-09 busts shaded, and a table of 14 borrowers (a year ago, last quarter, the latest). Context only: the dollar link is underpowered and the Nasdaq link rests on those two busts'),
  mk('panel.insight.spreads', 'panel', 'Insight: spreads and ratios (educator pairs, X versus Y)', 'Insight (preview)', P, 'the pairs the educators read as X versus Y or X minus Y (equal-weight against cap-weight, small against large caps, credit, the curve, VIX against its 3-month, copper against gold...) ranked by how stretched each is against its own history, with what the educators said beside what the Evidence Book found, a wall of the twelve most-mentioned pairs, and an X-versus-Y picker whose scatter plays through time; it describes state, never direction'),
  mk('panel.insight.roc', 'panel', 'Insight: momentum and rate of change', 'Insight (preview)', P, 'where the 50-session rate of change of each price series sits in its own history (and where it stood 50 sessions ago), whether the rate of change is falling or rising hard, the lists the educators talk about (stalled leaders, stalled laggards, decelerating and accelerating hardest) and a hero chart per series; beside it, what the Evidence Book found when the stall-after-a-run idea was tested on 30 markets over 13 years; it describes state, never direction'),
  mk('widget.asof', 'widget', 'Time machine (whole-terminal as-of clock)', 'Terminal features (preview)', P, 'a Time machine button in the top bar: pick a date and time (or drag the scrubber, or press play at x2 to x300) and the whole terminal redraws as the saved snapshots showed it then, under a "Viewing ..., not live" banner with Back to live. Boards with no record at that time say so; nothing live is shown in a past view. Goes back only to when snapshots began (14 Nov 2026).'),
  mk('widget.replayviz', 'widget', 'Replay on a visualisation', 'Terminal features (preview)', P, 'a small Replay button on a chart or board that plays the history of that one chart back: the Treasury curve morphing day by day with ghosts of earlier shapes and the 2y to 10y slope, the eight currencies racing through a London session on the 1H, 4H or 1D window, the priced Fed path odds day by day, the cross-asset correlation matrix session by session, the growth and inflation regime month by month, and the range used through a London session (the vol clock played back); play, pause, step, x1 x4 x16, loop and a scrubber; it says plainly how much history is held and describes what happened, never what comes next'),
  mk('widget.ghostwalk', 'widget', 'Ghost walk', 'Terminal features (preview)', P, 'a day of one market drawn in units of its own forecast median range from the open, over the faint paths of earlier days, with that day\'s option levels from the time they were saved and a ring where price touched one; a Ghost walk button on the OI terrain card (Options tab) and the GHOST command. It only goes back as far as the option-OI capture. It shows where price was against the levels, not where it will go'),
  mk('widget.oitime', 'widget', 'OI over time (terrain, level walk, gauge)', 'Terminal features (preview)', P, 'four replays of the stored option-OI data: on the OI terrain card (Options tab) the strike profile with max pain, the gamma flip and price day by day or within a day; one level held fixed and followed as its expiry nears with the touch tally against a mirrored placebo; and the calls-against-puts gauge tinted by what price did. It goes back only as far as the OI capture. It shows where price was against the levels, not where it will go'),
  mk('widget.eventreplay', 'widget', 'Event replay (a release, minute by minute)', 'Terminal features (preview)', P, 'an Event replay button at the top of the Calendar tab and the EVENTREPLAY command: a past CPI, payrolls or central-bank decision played minute by minute from 30 minutes before to 4 hours after, in units of the typical 30-minute reaction of that market, over the faint paths of the last five releases of the same kind. It shows how big and how fast past releases moved markets; which way a release moves a market is not predictable from the release alone, so it never says where the next one will go'),
  mk('panel.changed.since', 'panel', 'Changed: since you last looked', 'Terminal features (preview)', P, 'a card at the top of the Changed tab that compares saved snapshots of the terminal at your last visit (or one hour, four hours or a day ago) with the latest and lists what moved, ranked, in plain sentences: stress lights, risk flags, currency strength leaders, the Fed path, the regime, central-bank statements, the curve, vol gauges, feeds that went missing, and the releases that printed in between with the move in the 30 minutes after. It describes changes between saved snapshots and never says what they mean for direction'),
  mk('panel.risk.strip', 'panel', 'Risk flags over time (history ribbons)', 'Terminal features (preview)', P, 'the six stress lights as ribbons over the days of saved snapshots: on the Insight tab under Risk flags (with how often each was on, how many separate episodes, when it last changed, and the Evidence Book verdict of each) and as a slim card at the top of the Overview. A flag that could not be read is hatched, never shown as off. Only a flag with a validated range finding says the days ahead run wider; none says which way'),
  mk('widget.oidrill', 'widget', 'OI drills (one level through time)', 'Terminal features (preview)', P, 'a Drill a level button in the heading of the OI terrain card (Options tab) and the OIDRILL command: follow the biggest call strike, the biggest put strike, max pain or the gamma flip of a market back through the stored option-OI captures: days held, open interest and rank, distance from each close in average daily ranges, whether price traded through it, with links into the level walk and Path replays. It describes where a level was; the Evidence Book found walls no better than a mirrored placebo'),
  mk('widget.smile', 'widget', 'IV smile replay (the quoted vol by strike through time)', 'Terminal features (preview)', P, 'an IV smile replay button in the heading of the OI terrain card (Options tab) and the SMILE command: the implied-vol smile of a symbol nearest expiries from the Cboe option chains the server keeps (puts below spot, calls above), day by day from 16 Oct 2026 or within a day in 15-minute steps for SPX, NDX, SPY and QQQ from 1 Nov 2026, with the at-the-money vol, a 5 percent skew and the same expiry one step earlier as a ghost. It shows how the quoted smile looked and changed, not where price goes'),
  mk('widget.alerts', 'widget', 'Alerts (bell)', 'Terminal features (preview)', P, 'alerts you set on numbers the terminal already computes (range used, Fed path move, data gone stale, a level touched, a weekend gap closed); one Telegram note per episode. Only the owner can change them; the desk login sees the list'),
  mk('widget.linked', 'widget', 'Linked selection', 'Terminal features (preview)', P, 'pick a market once and the Pair page, the Replay, the strength board, the vol clock and the asset cards follow it; one chip in the top bar shows it is linked and switches it off'),
  mk('panel.ov.glance', 'panel', 'Overview: at a glance', 'Terminal features (preview)', P, 'a compact block at the very top of Overview: the regime, the stress lights, the strongest and weakest currency (price read and desk read, said apart), the most unusual reading against its own history, the next high-impact release with a countdown, the desk ruling in one line and how fresh the data is; each tile opens the board behind it'),
  mk('panel.flow.promos', 'panel', 'Links to the Insight boards', 'Terminal features (preview)', P, 'small links that open an Insight board from where it belongs: the gold board on Assets, level reach on the Pair page, the risk-flag evidence on the stress strip, the currency matrix on the strength card, world economies on Macro; nothing is drawn twice'),
  mk('panel.pair.driveshort', 'panel', 'Pair: short What drives this', 'Terminal features (preview)', P, 'the Pair page shows the net push, a one-line summary and the two strongest tailwinds and headwinds first, with a button to read the full analysis; the choice is remembered in this browser'),
  mk('widget.density', 'widget', 'Dense mode (Monitor and tables)', 'Terminal features (preview)', P, 'a Density button on the Monitor (and DENSE on the command line) that tightens the rows and shrinks the type of the Monitor and of every table in a card; remembered in this browser'),
  mk('widget.ov.sections', 'widget', 'Overview: sections (pill row)', 'Terminal features (preview)', P, 'the Overview in five sections behind a pill row under the At a glance block: Today, Currencies, Risk and markets, News and events, The desk; every block keeps its own switch, a section with nothing switched on is not offered, the choice is remembered in this browser and shared as #overview/currencies; with this off the Overview is one long page as before'),
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
  mk('panel.ov.ccystrength', 'panel', 'Overview: currency strength (σ), price-based and live', 'Overview', null, 'eight currencies as bars from a centre line over 1H, 4H, 1D and 1W, in units of each window\'s normal move, refreshed every minute or two while on screen; ordering only, and separate from the analyst strength strip'),
  mk('panel.ov.priceread', 'panel', 'Overview: analyst read vs price read', 'Overview', null, 'the desk\'s dawn bias per currency beside a rule over the last four hours and day of prices (firm, soft or mixed), with a flag where they disagree; descriptive, never a trade instruction and never written into the book'),
  mk('panel.ov.alerts', 'panel', 'Overview: desk alerts', 'Overview', I, 'the alert engine\'s status, including the Telegram mute'),
  mk('panel.ov.dayshape', 'panel', 'Overview: the day\'s shape', 'Overview', null, 'the day forecaster: volatility ranges (market data)'),
  mk('panel.ov.tradewatch', 'panel', 'Overview: trade watch', 'Overview', T, 'the book against live prices: zone, target, invalidation'),
  mk('panel.ov.playbooks', 'panel', 'Overview: playbooks', 'Overview', T, 'the six largest cards with entry, target, invalid and size'),
  mk('panel.ov.wire', 'panel', 'Overview: the wire', 'Overview', null, 'tier 1-2 headlines with their reads'),
  mk('panel.ov.releases', 'panel', 'Overview: releases ahead', 'Overview', null, 'the economist\'s release briefs: typical move, what to watch'),
  mk('panel.ov.riskwarn', 'panel', 'Overview: risk warnings', 'Overview', null, 'the risks to the day\'s read'),
  mk('panel.ov.engine', 'panel', 'Overview: bias engine currency ranking', 'Overview', P, 'the rule-based bias engine\'s eight-currency ranking (js/biasEngine.js, weights theory-v1) beside the desk\'s, and "engine vs desk agree on X of Y markets"; directional analysis, scored forward on the bias scoreboard, not a trade signal'),
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
  mk('panel.ccy.tone', 'panel', 'Currency card: central-bank tone timeline', 'Currencies', null, 'how the bank\'s statement tone has moved over its last ten meetings, and the wording that changed: context for tone and timing (cb-tone-direction NULL), not a signal'),
  mk('panel.ccy.macrostrip', 'panel', 'Currency card: macro picture', 'Currencies', null, 'per-currency macro prints against expectations, the next release, a 12-month ribbon and the six scorecard factors behind the composite'),
  mk('panel.asset.plan', 'panel', 'Market card: entry, target, invalid, timing', 'Markets', T, 'the plan lines on a card, and the entry zone / invalidation lines on the charts'),
  mk('panel.asset.size', 'panel', 'Market card: size and grade', 'Markets', T, 'the position size and the conviction grade derived from it'),
  mk('panel.ccy.engine', 'panel', 'Currency card: bias engine score and drivers', 'Currencies', P, 'the bias engine\'s score beside the desk\'s ring on each card, and its full driver table (reading, d, weight, contribution, source, as of, coverage) in the currency pop-up; a rule-based macro checklist, not a trade signal'),
  mk('panel.asset.engine', 'panel', 'Market card: bias engine read and key drivers', 'Markets', P, 'the "Macro tilt: Bearish 7/10" chip beside the desk call, a "tilt differs" chip when they differ (preview since 2026-11-16: bias-engine-backtest found no direction skill at 1, 5 or 20 days, plans/ONE_DESK_BIAS.md), the top three driver contributions on the card and the full driver table in the full view; directional analysis, not a trade signal'),
  mk('panel.pair.engine', 'panel', 'Pair: bias engine pair score', 'Pair', P, 'the bias engine\'s score for any cross of the eight, (base minus quote) / 2, with both legs\' drivers side by side; or an asset\'s driver table'),
  mk('panel.deep.gr', 'panel', 'Market reference: Global Read', 'Deep dive', null, 'the global read card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.rates', 'panel', 'Market reference: Rates', 'Deep dive', null, 'the rates card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.fv', 'panel', 'Market reference: Fair value', 'Deep dive', null, 'the fair value card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.stfv', 'panel', 'Market reference: Short-term fair value', 'Deep dive', null, 'the short-term fair value card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.pos', 'panel', 'Market reference: Positioning', 'Deep dive', null, 'the positioning card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.carry', 'panel', 'Market reference: Carry and options', 'Deep dive', null, 'the carry and options card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.hours', 'panel', 'Market reference: Session hours and seasonality', 'Deep dive', null, 'the session hours and seasonality card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.ac', 'panel', 'Market reference: Autocorrelation', 'Deep dive', null, 'the autocorrelation card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.ll', 'panel', 'Market reference: Lead-lag', 'Deep dive', null, 'the lead-lag card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.opt', 'panel', 'Market reference: Options', 'Deep dive', null, 'the options card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.news', 'panel', 'Market reference: News', 'Deep dive', null, 'the news card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.prec', 'panel', 'Market reference: Precedent and the chain', 'Deep dive', null, 'the precedent and the chain card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.deep.res', 'panel', 'Market reference: Research', 'Deep dive', null, 'the research card for a market; on the Pair page until the Deep dive is switched on, then in the Deep dive'),
  mk('panel.replay.engine', 'panel', 'Replay: the bias engine\'s read that day', 'Replay', P, 'the engine\'s stored morning issue for the replayed day and market, when one was written (never back-issued)'),
  mk('panel.asset.beflip', 'panel', 'Bias engine: what would flip it', 'Markets', T, 'the engine\'s flip line (how far the score is from turning Neutral or the other side, and its largest support): reads as an invalidation line'),
  mk('panel.pair.favourites', 'panel', 'Pair: favourites', 'Markets', null, 'a star on each market, a Favourites filter pill and copy / paste of your list; a display preference kept in this browser only'),
  mk('panel.asset.favourites', 'panel', 'Assets: favourites', 'Markets', null, 'a star on each market card and a Favourites filter pill in the Assets tab, with copy / paste of your list; the same list as the Pair page, a display preference kept in this browser only'),
  mk('panel.asset.volclock', 'panel', 'Assets: implied vol against the forecast (vol clock)', 'Markets', null, 'options-implied sigma over the forecast sigma per market, how much of the day\'s range is used, the vol ranking and the Daily Read\'s forward record: size, never direction'),
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
  mk('panel.ana.pills', 'panel', 'Analytics: section pills', 'Analytics', null, 'the pill row that splits Analytics into Market behaviour and The desks record; each block keeps its own switch, and a section with no block switched on is not offered'),
  // ── Charts, Changed, Correlations, Macro ──
  mk('panel.pos.history', 'panel', 'Positioning: history', 'Positioning', null, 'speculators\' net share of open interest over 3 years, the top and bottom 10% shaded (moved here from the History tab; shown to the desk login as before)'),
  mk('panel.charts.bookflow', 'panel', 'History: how today\'s book was built', 'History', null, 'the ruling to the currencies to every card'),
  mk('panel.charts.ranking', 'panel', 'History: currency ranking vs realised', 'History', M, 'the Currency Manager\'s order against how currencies finished: the desk\'s accuracy record'),
  mk('panel.changed.cards', 'panel', 'Changed: card flips', 'Changed', null, 'a card added, removed or flipped: what changed in the lean'),
  mk('panel.changed.thesis', 'panel', 'Changed: thesis against reality', 'Changed', M, 'the book\'s claims laid against the evening score'),
  mk('panel.changed.paper', 'panel', 'Changed: paper trades', 'Changed', M, 'the paper-trade running total'),
  mk('panel.corr.hedges', 'panel', 'Correlations: the hedge finder', 'Correlations', T, 'ranked hedges for a market or a book card: what to put on'),
  mk('panel.macro.boepath', 'panel', 'Macro: the Bank of England priced path', 'Macro', null, 'what the market has priced for Bank Rate at each coming MPC meeting, from the Bank of England\'s own OIS curve: the running Bank Rate, the chance of a 25bp step, and how the pricing moved over a day, a week and a month'),
  mk('panel.macro.fedyields', 'panel', 'Macro: the Fed path against the yields', 'Macro', null, 'the priced fed funds path (December, June) beside the 2Y, 2s10s and 10Y over the same 1D/5D/20D dates, how much of the 2Y the futures path accounts for, and the Atlanta Fed window odds'),
  mk('panel.macro.creditliq', 'panel', 'Macro: credit & liquidity', 'Macro', null, 'the Credit Stress Index, the long-history Baa-10Y spread against 5 and 20 years, global central-bank liquidity (level, impulse, by bank) and the liquidity conditions z-scores'),
  mk('panel.macro.curve', 'panel', 'Macro: the curve through time', 'Macro', null, 'the Treasury curve drawn through 36 month-ends, six slopes against their 3y and 5y history, three years of curve shape, the yield-to-EURUSD coupling and the SOFR-Euribor spread-turn log'),
  mk('panel.macro.regime', 'panel', 'Macro: where the market is (regime stack)', 'Macro', null, 'the growth x inflation quadrant, seven regime lenses, the correlation regime, risk-state flags and which markets are quiet or active over 30 days, plus the registered range edges'),
  mk('panel.macro.releases', 'panel', 'Macro: releases and who is positioned', 'Macro', null, 'the week\'s high-impact releases against the leveraged-fund crowd in each currency, the usual size of the 30-minute move, what the last releases did, how releases ran by volatility regime and the front-end rate legs'),
  mk('panel.macro.vol', 'panel', 'Macro: the fear complex (vol)', 'Macro', null, 'VIX, VVIX, SKEW, MOVE, OVX, GVZ, VXEEM and VXTLT against their own five-year history as a radar and a year of closes, the VIX curve, realised volatility across 51 markets and the FX risk reversals'),
  mk('panel.macro.livelayer', 'panel', 'Macro: live layer (implied yields, indices, range used, correlation)', 'Macro', null, 'the daily boards moved on by live prices: implied intraday US and Bund yields beside the official prints, equity indices since the close, range used so far against the forecast day, the majors\' correlation regime; price-based and descriptive'),
  mk('panel.macro.fomcstrip', 'panel', 'Macro: FOMC day, the two windows', 'Macro', null, 'the next FOMC meeting’s statement (14:00 ET) and press conference (14:30 ET) as two windows on a clock, in London time, with the schedule; the range share by window only once a result is banked'),
  mk('panel.macro.pathdiff', 'panel', 'Macro: the priced policy path, pair by pair', 'Macro', null, 'base minus quote currency of the futures-implied policy path at 3, 6 and 12 months for twelve pairs, and the week’s change; context, not a lead'),
  mk('panel.macro.jgb', 'panel', 'Macro: Japan, the JGB shock card', 'Macro', null, 'JGB 2, 10, 20, 30 and 40 year yields with three condition lights (short-end shock, high-vol state, where on the curve); conditions only'),
  mk('panel.macro.inflation', 'panel', 'Macro: 5y5y and core PCE', 'Macro', null, 'the 5y5y forward breakeven against its five years, and core PCE year on year and three-month annualised'),
  mk('panel.macro.fiscalauct', 'panel', 'Macro: fiscal events and Treasury auctions', 'Macro', null, 'budgets and refundings read from their documents, the next coupon auctions, and how recent auctions went (high yield, bid-to-cover, who took them)'),
  mk('panel.macro.rangecoverage', 'panel', 'Macro: did the range lines hold?', 'Macro', null, 'how often the forecast range lines held over the last 60 sessions across ten markets, and after a stress day; a record of the ruler'),
  mk('panel.macro.connected', 'panel', 'Macro: how tightly the markets are moving together', 'Macro', null, 'Diebold-Yilmaz spillover across twelve markets: a network of who moves whom, a dial with its history, net senders and receivers'),
  mk('panel.macro.coupling', 'panel', 'Macro: commodity currencies and their commodity', 'Macro', null, '60-day coupling of AUD and NZD with copper and CAD with oil against their own five years, with the world-stress and geopolitical state line'),
  mk('panel.macro.uncertainty', 'panel', 'Macro: policy uncertainty', 'Macro', null, 'US, global and trade-policy economic uncertainty indices against their own five years'),
  mk('panel.macro.skewhist', 'panel', 'Macro: the SKEW index and the 2022 break', 'Macro', null, 'Cboe SKEW since 2020 with the May 2022 daily-expiry break marked and the means either side'),
  mk('panel.macro.trendbasket', 'panel', 'Macro: the trend basket', 'Macro', null, 'the 12-month trend rule across seven currencies: equity curve, current trend signs and the out-of-sample record, beside the banked null'),
  mk('panel.macro.walls', 'panel', 'Macro: option walls in expected moves', 'Macro', null, 'distance from the futures price to the biggest call and put walls and the gamma flip, in the market’s expected daily move'),
  mk('panel.macro.cbcards', 'panel', 'Macro: central banks, eight cards', 'Macro', null, 'the policy rate, stance chip, hawkishness bar and real 10y yield for each of the eight central banks'),
  mk('panel.macro.cbboard', 'panel', 'Macro: central bank statements board', 'Macro', null, 'tone, vote, dimensions and next meeting per bank, and the hawk-dove ranking'),
  mk('panel.macro.cbfutures', 'panel', 'Macro: what the futures price', 'Macro', null, 'the change priced against today\'s policy rate at about 3, 6 and 12 months for each bank'),
  mk('panel.macro.ratediff', 'panel', 'Macro: policy-rate differential', 'Macro', null, 'the eight-by-eight policy-rate gap table'),
  mk('panel.macro.speakers', 'panel', 'Macro: central-bank speakers this week', 'Macro', null, 'every scheduled speech this week with the bank\'s stance and the speech\'s own score'),
  mk('panel.macro.speechdrift', 'panel', 'Macro: speech drift', 'Macro', null, 'each bank\'s speakers since its last statement, on the statement\'s scale'),
  mk('panel.macro.ratecycle', 'panel', 'Macro: the world rate cycle pointer', 'Macro', null, 'the one-line summary and the button that opens the rate cycle on the Overview map'),
  mk('panel.macro.ratesboard', 'panel', 'Macro: rates and policy board', 'Macro', null, 'the curve now against a week and a month ago, slopes, the policy path beside the curve and the 2Y-proxy reconciliation'),
  mk('panel.macro.globalyields', 'panel', 'Macro: global yields', 'Macro', null, '2-year and 10-year government yields by country, changes and the 2y gap to the US'),
  mk('panel.macro.termprem', 'panel', 'Macro: US 10-year term premium', 'Macro', null, 'the ACM split of the 10-year into expected rates and term premium'),
  mk('panel.macro.engines', 'panel', 'Macro: macro engines heatmap', 'Macro', null, 'eight currencies by eight indicators (labour, inflation, growth and more), with a drawer per reading'),
  mk('panel.macro.scorecard', 'panel', 'Macro: macro scorecard', 'Macro', null, 'the composite of rates, inflation, growth and labour by currency'),
  mk('panel.macro.nowcasts', 'panel', 'Macro: nowcasts', 'Macro', null, 'Cleveland Fed CPI and PCE nowcasts and the Atlanta Fed GDPNow'),
  mk('panel.macro.cli', 'panel', 'Macro: leading indicators (OECD)', 'Macro', null, 'the OECD composite leading indicator, its 3-month change and cycle phase by economy'),
  mk('panel.macro.creditspreads', 'panel', 'Macro: credit spreads', 'Macro', null, 'IG, BBB, HY, CCC, euro HY and EM spreads with 20-day change and percentiles'),
  mk('panel.macro.fedliq', 'panel', 'Macro: Fed liquidity', 'Macro', null, 'reserves, reverse repo and the Treasury account, with 4 and 13-week changes'),
  mk('panel.macro.plumbing', 'panel', 'Macro: dollar plumbing', 'Macro', null, 'the dollar funding rows with their state, 20-day change and percentile'),
  mk('panel.macro.xccy', 'panel', 'Macro: cross-currency basis', 'Macro', null, 'how dear dollars are to borrow through the FX swap market, per currency'),
  mk('panel.macro.bankcredit', 'panel', 'Macro: global bank credit (BIS)', 'Macro', null, 'cross-border bank lending growth, in dollars, to non-banks and in offshore yen, with dollar borrowers by country'),
  mk('panel.macro.fairvalue', 'panel', 'Macro: fair value (BIS)', 'Macro', null, 'each currency\'s real effective exchange rate against its own 20-year average'),
  mk('panel.macro.fxfv', 'panel', 'Macro: FX fair value (short-term)', 'Macro', null, 'the short-horizon fair value of each pair'),
  mk('panel.macro.carry', 'panel', 'Macro: carry against volatility', 'Macro', null, 'the best-paid carry for its risk, pair by pair'),
  mk('panel.macro.commodfx', 'panel', 'Macro: commodity currencies against their exports', 'Macro', null, 'AUD, CAD, NOK, NZD and others against the commodity basket they earn from'),
  mk('panel.macro.copper', 'panel', 'Macro: growth against fear', 'Macro', null, 'the copper-gold ratio and the Brent-WTI spread'),
  mk('panel.macro.gpr', 'panel', 'Macro: geopolitical risk index', 'Macro', null, 'the geopolitical risk level, trend and z-score'),
  mk('panel.macro.biasengine', 'panel', 'Macro: bias engine (currencies x drivers)', 'Macro', null, 'the bias engine\'s full grid of eight currencies by eight drivers as contribution heat, the assets by their drivers, the global risk score, the theory-v1 weights, coverage and the gaps list'),
  mk('panel.macro.carryside', 'panel', 'Macro: carry board "side" column', 'Macro', null, 'which side of a pair earns the carry'),
  // ── the Bias process tab (plans/DESK_BIAS_PROCESS_SPEC.md "Desk Terminal"; js/terminal/deskBiasProcessView.js) ──
  mk('tab.bprocess', 'tab', 'Bias process', 'Tabs', P, 'one card per market every weekday (FundaBias layout): the Desk Bias Process call and conviction, who made it (AI accept, AI override or the rules), the reason line and the six layers (event, regime, macro, structure, positioning, day range); a direction read with no forward record yet (owner rule 2026-11-16), so preview'),
  mk('panel.bp.invalid', 'panel', 'Bias process: invalidation line on each card', 'Bias process', T, 'the level that would invalidate each card\'s call (a confirmed swing or 1.5 sigma_day): reads as a stop'),
  mk('panel.bp.h2h', 'panel', 'Bias process: head to head', 'Bias process', M, 'every competitor (process AI, process rules, Max, FundaBias, desk, engine, H4 trend) scored the same way: hit rate against the base rate with intervals, R under one fixed trade rule, Neutral share, calibration by conviction and the AI override record; the track record'),
  mk('panel.bp.review', 'panel', 'Bias process: weekly review of wrong calls', 'Bias process', M, 'the last seven days\' wrong calls: which layer pointed the wrong way, whether an AI override helped or hurt, whether an event landed after the call; the process\'s scored record'),
  mk('panel.bp.fundabias', 'panel', 'Bias process: FundaBias log form', 'Bias process', I, 'the owner logs FundaBias\'s reading per market (direction and score out of 10), write-once per day; owner only on the server too'),
];

export const KINDS = ['tab', 'nav', 'widget', 'strip', 'panel'];
export const SURFACE_IDS = SURFACES.map(s => s.id);
export const DEFAULT_VISIBLE_IDS = SURFACES.filter(s => s.defaultVisible).map(s => s.id);
/** Surfaces that stay hidden from the desk login whatever the switches say: every link out to another page (it would bounce a desk login to the main
    login). They ARE listed in the admin panel, with a lock. Derived from the registry, so a new link is covered automatically. */
export const LOCKED_HIDDEN_IDS = SURFACES.filter(s => s.kind === 'nav').map(s => s.id);
/** Surfaces every session always sees, whatever the saved switches say (Sign out: a desk user must always be able to leave). */
export const ALWAYS_VISIBLE_IDS = ['widget.signout', 'widget.phonemenu'];

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
