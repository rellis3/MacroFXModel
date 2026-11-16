// js/terminal/commandCore.js: the COMMANDS of the Desk Terminal's command line, and how a typed line is matched to them. Pure: no DOM, no fetch.
//
// Owner build list 2026-11-15: "if we do the command line we need explanations behind every option". So a command CANNOT exist without
//   help      one plain sentence: what it is
//   example   something you can type that really resolves to this command (the guard test types it)
//   opens     where it takes you (shown beside the match)
// and the commands are GENERATED from the surface registry (js/terminal/tabRegistry.js) and the Macro section list (macroSubtabs.js), so a new
// tab or Macro board gets a command, with help taken from its registry note, the moment it is registered. Hand-kept here: the aliases (FED, VIX,
// CPI ...), the instrument names and the few commands that take arguments (REPLAY NQ 12 NOV, THEME amber, TF 5m, LINK off).
// A command whose surface is switched off for the session is not offered (a desk login never sees a hidden tab's command): commandsFor(isOn).
//
// A command's `run(args)` (only the ones that take arguments) returns { action, summary } or { error }. An action is data, never a function:
//   { kind:'tab', t }  { kind:'macro', sub?, block?, ccy? }  { kind:'pair', inst }  { kind:'replay', inst, ts }  { kind:'theme', id }
//   { kind:'tf', tf }  { kind:'link', on }  { kind:'help' }
// js/terminal/commandLine.js is the DOM half: the box, the keys and doing the action. Tested by commandCore.test.mjs.
import { SURFACES, surfaceById } from './tabRegistry.js';
import { DEEP_SECTIONS, sectionOf } from './deepDive.js';
import { MACRO_SUBS, ALL_BLOCKS, BLOCK_SUB, subById } from './macroSubtabs.js';
import { THEMES } from './themes.js';
import { TF_KEYS } from '../deskBarsCore.js';
import { ASSET_WORDS } from './pairView.js';
import { STARTERS as MON_STARTERS } from './monitorCore.js';
import { STARTERS as WS_STARTERS, cleanName as wsCleanName } from './workspaceCore.js';
import { KINDS as AL_KINDS, FEEDS as AL_FEEDS } from '../deskAlertRulesCore.js';
import { VISUALS as REPLAY_VISUALS, vizByWord } from '../replayVizCore.js';
import { parseOffset as parseAsofOffset, parseAsofValue, formatClock as formatAsofClock } from '../asofCore.js';
import { INSTRUMENTS as REPLAY_INSTRUMENTS, validDate, londonDate, londonWall } from '../replayCore.js';
import { GHOST_MARKETS } from '../ghostWalkCore.js';

// ── markets (a copy of the page's UNIVERSE and NAME; commandCore.test.mjs fails if desk-terminal.html drifts from it) ──
export const UNIVERSE = {
  fx_majors: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'],
  fx_crosses: ['GBPJPY', 'EURGBP', 'EURJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'AUDCAD', 'NZDCAD', 'NZDJPY', 'GBPNZD', 'AUDNZD', 'AUDCHF', 'NZDCHF', 'CADCHF', 'CHFJPY', 'EURNOK', 'EURSEK', 'USDNOK', 'USDSEK'],
  indices: ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'], metals: ['GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM'], energy: ['WTI', 'BRENT', 'NATGAS'],
  ags: ['SOYBEAN', 'WHEAT', 'CORN', 'SUGAR'], crypto: ['BTCUSD'],
};
export const NAME = { NQ: 'Nasdaq 100', SPX500: 'S&P 500', US30: 'Dow 30', US2000: 'Russell 2000', DE30: 'DAX', UK100: 'FTSE 100', GOLD: 'Gold', SILVER: 'Silver', COPPER: 'Copper', PLATINUM: 'Platinum', PALLADIUM: 'Palladium', WTI: 'WTI crude', BRENT: 'Brent crude', NATGAS: 'Natural gas', SOYBEAN: 'Soybeans', WHEAT: 'Wheat', CORN: 'Corn', SUGAR: 'Sugar', BTCUSD: 'Bitcoin' };
export const ALL_INSTRUMENTS = Object.values(UNIVERSE).flat();
export const instLabel = k => NAME[k] ?? (k.length === 6 ? `${k.slice(0, 3)}/${k.slice(3)}` : k);

/** Typed word -> desk market key, or null: the key itself, EUR/USD, or a plain word (gold, nasdaq, oil, btc). */
export function resolveInstrument(word) {
  const w = String(word ?? '').trim().toUpperCase().replace('/', '');
  if (!w) return null;
  if (ALL_INSTRUMENTS.includes(w)) return w;
  const lw = w.toLowerCase();
  for (const k of ALL_INSTRUMENTS) if ((ASSET_WORDS[k] ?? []).some(x => x === lw)) return k;
  return null;
}

// ── tabs: every registered tab has its words here, and a test fails if one does not ──
const TAB_WORDS = {
  overview: ['OVERVIEW', ['HOME', 'MAP'], 'The Overview tab: the day\'s headline, the regime, currency strength, the risk state and the map.'],
  ccy: ['CURRENCIES', ['CCY', 'CURRENCY'], 'The Currencies tab: the desk\'s lean on each currency, and the drivers behind it.'],
  assets: ['ASSETS', ['MARKETS', 'CARDS'], 'The Assets tab: a card per market, the vol clock and the market boards.'],
  macro: ['MACRO', [], 'The Macro tab: policy, rates, economy, credit and markets, in five sections.'],
  pos: ['POSITIONING', ['POS', 'COT'], 'The Positioning tab: COT, futures positioning and options positioning.'],
  cal: ['CALENDAR', ['CAL', 'EVENTS'], 'The Calendar tab: this week\'s events, live surprises and expectations against reality.'],
  ana: ['ANALYTICS', ['ANA'], 'The Analytics tab: the book\'s correlation web, factor risk, scenarios and release reactions.'],
  charts: ['HISTORY', ['CHARTS'], 'The History tab (it was called Charts, and CHARTS still works): macro regime, data surprises, seasonality and how the book was built. Positioning history is on the Positioning tab.'],
  today: ['CHAIN', ['TODAY'], 'The Chain tab: the macro chain (live, 1, 5 or 20 days) and its read.'],
  read: ['READ', ['TRADERS'], 'The Trader\'s read tab (owner only unless switched on).'],
  pair: ['PAIR', [], 'The Pair tab: one page per market. Type a market name instead to open that one.'],
  changed: ['CHANGED', ['CHANGES'], 'The Changed tab: what moved in the bias, the tone, world stress and the chain since the last book.'],
  replay: ['REPLAY', ['TIME'], 'The Replay tab: play a past London session forward. Add a market and a date to jump straight to a moment.'],
  options: ['OPTIONS', ['OPT', 'GEX'], 'The Options tab: skew, dealer hedging, put/call, option lines and the VIX term.'],
  news: ['NEWS', ['WIRE'], 'The News tab: the wire, with its reads.'],
  corr: ['CORRELATIONS', ['CORR', 'HEDGES'], 'The Correlations tab: the matrix, rolling correlations, factors and regimes.'],
  kchart: ['CHART', ['KLINE', 'CANDLES', 'PRO'], 'The Chart tab (preview): a candle chart with indicators (each with its own settings) and the day\'s lines. Add a market and a candle size: CHART NQ 15M.'],
  monitor: ['MONITOR', ['MON', 'WATCHLIST', 'MONITORS'], 'The Monitor tab (preview): a table of the markets you pick with live columns. Add a name to open a saved monitor: MONITOR INDICES.'],
  deep: ['DEEP', ['DEEPDIVE', 'DIVE'], 'The Deep dive tab (preview): the reference cards for one market (rates, positioning, behaviour, context). DEEP GOLD RATES opens it on that market and section.'],
  workspace: ['WORKSPACE', ['WS', 'LAYOUT', 'WORKSPACES'], 'The Workspace tab (preview): drag and resize the terminal panels into a screen of your own. Add a name to load a saved layout: WORKSPACE RATES.'],
  insight: ['INSIGHT', ['BOARDS'], 'The Insight tab (preview): boards that read what we already hold in a new way, starting with what is unusual right now.'],
  infomap: ['INFO', ['INFOMAP', 'SWITCHES'], 'The Info map tab (owner only): what data the repo holds, and the preview-feature switches.'],
};
export const TAB_WORD_IDS = Object.keys(TAB_WORDS);

// ── the Insight boards (preview): name, aliases, one line of help; a board without a row here fails the Insight guard test ──
export const INSIGHT_WORDS = {
  matrix: ['MATRIX', ['CROSSASSET', 'CORRELATION', 'CROSS'], 'The cross-asset board: the 1, 5 and 20 session move of every market, and how markets have been moving together lately.'],
  rotation: ['ROTATION', ['SECTORS', 'SECTOR'], 'US sector rotation: the 11 sectors against the S&P 500 over 20 sessions, on a map with a four-week trail.'],
  fxmatrix: ['FXMATRIX', ['CURRENCYMATRIX', 'STRENGTHMATRIX', 'FXC'], 'The currency matrix: the eight currencies across four windows, and who has out-run whom.'],
  gold: ['GOLDBOARD', ['XAUBOARD', 'GOLDVIEW'], 'The gold board: gold against real yields, the dollar and its own implied vol, with positioning and ETF holdings.'],
  reach: ['REACH', ['TOUCH', 'LEVELCHANCE', 'CHANCE'], 'The level-reach calculator: type a price and get the chance price touches it by the end of the London day and over the whole session.'],
  flags: ['FLAGS', ['RISKFLAGS', 'LIGHTS'], 'The risk flags: the six market-stress lights now, each beside what the Evidence Book found for it.'],
  economies: ['ECONOMIES', ['ECONOMY', 'WORLD', 'COUNTRIES'], 'The eight economies side by side: growth, prices, jobs and spending, each with an arrow and a word.'],
  unusual: ['UNUSUAL', ['MOVERS', 'EXTREME', 'WHATSUNUSUAL'], 'What is unusual right now: every series ranked by how extreme it is against its own history, with the working and the odds it is just chance.'],
};

// ── short names for the Macro boards people will actually type ──
const BOARD_ALIASES = {
  'panel.macro.fedyields': ['FED', 'FEDPATH', 'FEDWATCH'], 'panel.macro.globalyields': ['YIELDS', 'GLOBALYIELDS'], 'panel.macro.curve': ['CURVE'],
  'panel.macro.vol': ['VIX', 'FEAR'], 'panel.macro.skewhist': ['SKEW'], 'panel.macro.jgb': ['JGB', 'JAPAN'], 'panel.macro.inflation': ['INFLATION', 'PCE'],
  'panel.macro.fedliq': ['LIQUIDITY', 'RESERVES'], 'panel.macro.nowcasts': ['NOWCAST', 'GDPNOW'], 'panel.macro.carry': ['CARRY'], 'panel.macro.gpr': ['GPR', 'GEOPOLITICS'],
  'panel.macro.fomcstrip': ['FOMC'], 'panel.macro.fiscalauct': ['AUCTIONS', 'FISCAL'], 'panel.macro.creditspreads': ['CREDIT', 'SPREADS'], 'panel.macro.cbboard': ['CBS', 'BANKS'],
  'panel.macro.engines': ['ENGINES'], 'panel.macro.scorecard': ['SCORECARD'], 'panel.macro.termprem': ['TERMPREMIUM', 'ACM'], 'panel.macro.xccy': ['BASIS', 'XCCY'],
  'panel.macro.rangecoverage': ['RANGES'], 'panel.macro.uncertainty': ['EPU', 'UNCERTAINTY'], 'panel.macro.regime': ['REGIME'], 'panel.macro.fairvalue': ['FAIRVALUE'], 'panel.macro.copper': ['COPPERGOLD', 'GROWTHFEAR'],
};

const firstSentence = (t, max = 150) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  const cut = s.search(/[.;](\s|$)/);
  const x = cut > 20 ? s.slice(0, cut) : s;
  if (x.length <= max) return x;
  const w = x.slice(0, max).replace(/\s+\S*$/, '');
  return `${w}…`;
};
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ── a date and time said the way a person says them (REPLAY NQ 12 NOV 14:30) ──
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const monthOf = w => (/^[A-Z]{3,9}$/.test(w) ? MONTHS.findIndex(m => m.startsWith(w)) : -1);
const p2 = n => String(n).padStart(2, '0');

/** Tokens like ['12','NOV'] / ['NOV','12','2026'] / ['2026-11-12','14:30'] / ['YESTERDAY'] -> { date, hh, mm } | { error } | null (no tokens). */
export function parseWhen(tokens, now = Date.now()) {
  const t = tokens.map(x => String(x).toUpperCase()).filter(Boolean);
  if (!t.length) return null;
  const today = londonDate(now);
  let date = null, hh = null, mm = null;
  const rest = [];
  for (const x of t) {
    const tm = /^(\d{1,2}):(\d{2})$/.exec(x);
    if (tm) { hh = +tm[1]; mm = +tm[2]; if (hh > 23 || mm > 59) return { error: `"${x}" is not a time. Use 14:30 (London).` }; continue; }
    rest.push(x);
  }
  if (rest.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(rest[0])) date = rest[0];
  else if (rest.length === 1 && rest[0] === 'TODAY') date = today;
  else if (rest.length === 1 && rest[0] === 'YESTERDAY') date = londonDate(now - 86_400_000);
  else if (rest.length) {
    let d = null, m = -1, y = null;
    for (const x of rest) {
      const dm = /^(\d{1,2})(ST|ND|RD|TH)?$/.exec(x);
      if (dm && d == null) { d = +dm[1]; continue; }
      if (/^\d{4}$/.test(x) && +x >= 2000 && +x <= 2100 && y == null) { y = +x; continue; }
      const mo = monthOf(x); if (mo >= 0 && m < 0) { m = mo; continue; }
      return { error: `Could not read "${x}" as part of a date. Try 12 NOV, 12 NOV 2026 or 2026-11-12.` };
    }
    if (d == null || m < 0) return { error: 'A date needs a day and a month: 12 NOV, or 2026-11-12.' };
    const ty = +today.slice(0, 4);
    let cand = `${y ?? ty}-${p2(m + 1)}-${p2(d)}`;
    if (!validDate(cand)) return { error: `${d} ${MONTHS[m].slice(0, 3)} is not a real date.` };
    if (y == null && cand > today) cand = `${ty - 1}-${p2(m + 1)}-${p2(d)}`;   // no year given and it is still ahead: it means last year
    date = cand;
  }
  if (date == null && hh != null) date = today;   // "REPLAY NQ 14:30" = today at 14:30
  if (!validDate(date)) return { error: `${date} is not a real date.` };
  if (date > today) return { error: `${date} has not happened yet: the Replay plays past sessions.` };
  return { date, hh, mm };
}

const COUNTRY_CCY = { US: 'USD', USA: 'USD', USD: 'USD', EU: 'EUR', EZ: 'EUR', EUR: 'EUR', EUROZONE: 'EUR', UK: 'GBP', GB: 'GBP', GBP: 'GBP', JP: 'JPY', JPN: 'JPY', JPY: 'JPY', JAPAN: 'JPY',
  AU: 'AUD', AUS: 'AUD', AUD: 'AUD', NZ: 'NZD', NZD: 'NZD', CA: 'CAD', CAN: 'CAD', CAD: 'CAD', CH: 'CHF', CHF: 'CHF', SWISS: 'CHF' };
const INDICATORS = [
  ['CPI', 'Inflation (CPI): the macro engines heatmap, where each currency\'s latest print is set against its forecast.'],
  ['GDP', 'Growth (GDP): the macro engines heatmap with each currency\'s latest print.'],
  ['LABOUR', 'Labour market: the macro engines heatmap with each currency\'s latest jobs print.'],
  ['PPI', 'Pipeline inflation (PPI): the macro engines heatmap with each currency\'s latest print.'],
  ['RETAIL', 'Retail sales: the macro engines heatmap with each currency\'s latest print.'],
  ['ISM', 'Business activity (ISM and its proxies): the macro engines heatmap.'],
];

// ── building the list ──
const ASOF_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "12 nov 14:30", "12 nov", "2026-11-12 14:30", "2026-11-12" -> UTC ms (a date alone is 12:00; no year means the year of now). null when unreadable. */
export function parseAsofText(text, nowMs = Date.now()) {
  const s = String(text ?? '').trim().toLowerCase();
  const iso = parseAsofValue((s.replace(/\s+/, 't').replace(/z$/, '') + (/\d:\d\d/.test(s) ? 'Z' : '')).toUpperCase());
  if (iso != null && /^\d{4}-/.test(s)) return iso;
  const m = /^(\d{1,2})\s+([a-z]{3})[a-z]*(?:\s+(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (!m) return null;
  const mon = ASOF_MONTHS.indexOf(m[2]); if (mon < 0) return null;
  const y = m[3] ? Number(m[3]) : new Date(nowMs).getUTCFullYear();
  const t = Date.UTC(y, mon, Number(m[1]), m[4] ? Number(m[4]) : 12, m[5] ? Number(m[5]) : 0);
  return Number.isFinite(t) && new Date(t).getUTCMonth() === mon ? t : null;
}

/**
 * Every command the session may use. isOn(surfaceId) -> bool says which surfaces this session can see (the owner: all; a desk login: the switched-on ones).
 * A command whose surface is off is left out. now() is only used to resolve dates.
 */
export function buildCommands({ isOn = () => true, now = () => Date.now(), workspaceNames = () => [], monitorNames = () => [], newsSearchNames = () => [] } = {}) {
  const out = [];
  const add = c => { if ([c.surface, ...(c.needs ?? [])].every(id => !id || isOn(id))) out.push({ aliases: [], ...c }); };

  // tabs
  for (const s of SURFACES.filter(x => x.kind === 'tab')) {
    const key = s.id.slice(4), w = TAB_WORDS[key];
    if (!w) continue;   // the guard test names the missing one
    const [name, aliases, help] = w;
    const c = { id: `tab.${key}`, group: 'Go to a tab', name, aliases, help, example: name.toLowerCase(), opens: `The ${s.label} tab`, surface: s.id, action: { kind: 'tab', t: key } };
    if (key === 'replay') {
      c.args = '[market] [date] [time]';
      c.run = args => replayRun(args, now);
      c.example = 'replay';
    }
    if (key === 'kchart') {
      c.args = `[market] [${TF_KEYS.join('|')}]`;
      c.run = args => chartRun(args);
      c.example = 'chart nq 15m';
    }
    if (key === 'news') {
      c.args = '[saved search]';
      c.run = args => newsRun(args);
      c.example = 'news';
    }
    if (key === 'monitor') {
      c.args = '[name]';
      c.run = args => monitorRun(args);
      c.example = 'monitor indices';
    }
    if (key === 'deep') {
      c.args = `[market] [${DEEP_SECTIONS.map(x => x.key).join('|')}]`;
      c.run = args => deepRun(args);
      c.example = 'deep gold rates';
    }
    if (key === 'workspace') {
      c.args = '[name]';
      c.run = args => workspaceRun(args);
      c.example = 'workspace rates';
    }
    add(c);
  }
  // markets
  for (const k of ALL_INSTRUMENTS) {
    const label = instLabel(k);
    add({ id: `inst.${k}`, group: 'Markets', name: k, aliases: [label.toUpperCase().replace('/', ''), ...(ASSET_WORDS[k] ?? []).map(x => x.toUpperCase())].filter((x, i, a) => x !== k && a.indexOf(x) === i),
      help: `Open ${label} on the Pair page: its card, the chart, the drivers, rates, positioning and research.`, example: k.toLowerCase(), opens: `Pair page for ${label}`, surface: 'tab.pair', action: { kind: 'pair', inst: k } });
  }
  // Macro sections and boards
  for (const sub of MACRO_SUBS) {
    const blocks = sub.blocks.filter(b => surfaceById(b));
    add({ id: `macro.${sub.id}`, group: 'Macro sections', name: `MACRO ${sub.alias.toUpperCase()}`,
      help: `The ${sub.label} section of the Macro tab: ${blocks.length} boards.`, example: `macro ${sub.alias}`, opens: `Macro › ${sub.label}`, surface: 'tab.macro', action: { kind: 'macro', sub: sub.id } });
  }
  for (const b of ALL_BLOCKS) {
    const row = surfaceById(b); if (!row) continue;
    const short = b.replace(/^panel\.macro\./, ''), sub = subById(BLOCK_SUB[b]);
    const al = BOARD_ALIASES[b] ?? [];
    const name = al[0] ?? short.toUpperCase();
    add({ id: `board.${short}`, group: 'Macro boards', name, aliases: [`MACRO ${short.toUpperCase()}`, short.toUpperCase(), ...al.slice(1)].filter((x, i, a) => x !== name && a.indexOf(x) === i && !ALL_INSTRUMENTS.includes(x)),
      help: `${cap(firstSentence(row.note))}.`.replace(/\.\.+$/, '.'), example: name.toLowerCase(), opens: `Macro › ${sub?.label ?? ''} › ${row.label.replace(/^Macro:\s*/, '')}`, surface: b, needs: ['tab.macro'], action: { kind: 'macro', block: b } });
  }
  // Insight boards (preview)
  for (const [key, [name, aliases, help]] of Object.entries(INSIGHT_WORDS)) {
    const id = `panel.insight.${key}`, row = surfaceById(id); if (!row) continue;
    add({ id: `insight.${key}`, group: 'Insight boards', name, aliases, help, example: name.toLowerCase(), opens: `Insight > ${row.label.replace(/^Insight:\s*/, '')}`, surface: id, needs: ['tab.insight'], action: { kind: 'insight', panel: key } });
  }
  // releases by country
  for (const [word, help] of INDICATORS) {
    add({ id: `ind.${word.toLowerCase()}`, group: 'Releases', name: word, args: '[country]', help, example: `${word.toLowerCase()} us`, opens: 'Macro › Economy › the macro engines heatmap, then the currency card if a country is named',
      surface: 'panel.macro.engines', needs: ['tab.macro'], run: args => indicatorRun(word, args) });
  }
  // look and feel, links
  add({ id: 'theme', group: 'Look and feel', name: 'THEME', args: '<name>', help: `Change the colour theme (${THEMES.map(t => t.id).join(', ')}). It is remembered in this browser.`, example: 'theme amber', opens: 'The whole terminal, in that theme', surface: 'widget.themepicker', run: themeRun });
  add({ id: 'tf', group: 'Look and feel', name: 'TF', aliases: ['TIMEFRAME'], args: `<${TF_KEYS.join('|')}>`, help: 'Set the candle size on every chart that offers one (Pair page and asset cards).', example: 'tf 15m', opens: 'The candle-size pills on the charts', surface: 'widget.linked', run: tfRun });
  add({ id: 'link', group: 'Look and feel', name: 'LINK', args: '<on|off>', help: "Switch linked selection on or off. On: picking a market in one place (an asset card, a vol-clock tile or row, the Pair page or the Replay) moves the Pair page, Replay, strength board, candle-size buttons and vol clock with it, and that market's cards glow. Off: every panel keeps its own market again. The chip in the top bar shows which, and the ? beside it explains it. Kept in this browser only.", example: 'link off', opens: 'The linked chip in the top bar', surface: 'widget.linked', run: linkRun });
  add({ id: 'export', group: 'Look and feel', name: 'EXPORT', aliases: ['CSV', 'DOWNLOAD'], args: '[png]', help: 'Save the biggest table on the open tab as a CSV file; EXPORT PNG saves its first chart as an image. Made in this browser from what the page shows.', example: 'export',
    opens: 'A download of the open tab (nothing is sent anywhere)', surface: 'widget.export', run: args => exportRun(args) });
  add({ id: 'newsletter', group: 'Owner tools', name: 'NEWSLETTER', aliases: ['NEWS-PDF', 'ISSUE'], help: 'Open the Atlas page where the terminal newsletter is built: a written issue (yesterday, today, what could happen) with the terminal charts beside the paragraphs, saved as a PDF, plus a one-page pictogram of the key points. Owner only.',
    example: 'newsletter', opens: 'The Atlas page, Newsletter section (a new tab)', surface: 'nav.deskoffice', action: { kind: 'page', href: 'atlas.html#newsletter' }, summary: 'Opens the Atlas newsletter page in a new tab.' });
  add({ id: 'asof', group: 'Look and feel', name: 'ASOF', aliases: ['TIMEMACHINE', 'WAYBACK'], args: '<date time | live | +1h | -1d>',
    help: 'See the whole terminal as the saved snapshots showed it at an earlier moment (UTC). ASOF 12 nov 14:30 jumps there, ASOF +1h or ASOF -1d moves from where you are, ASOF live comes back, bare ASOF opens the time controls. A board with no record at that time says so; nothing live is shown in a past view. Snapshots start on 14 Nov 2026.',
    example: 'asof 15 nov 09:30', opens: 'The whole page, redrawn as it was then (a banner says so; Back to live returns)', surface: 'widget.asof', action: { kind: 'asof', op: 'open' }, run: args => asofRun(args) });
  add({ id: 'replay.viz', group: 'Look and feel', name: 'PLAY', aliases: ['PLAYBACK'], args: `<${REPLAY_VISUALS.map(v => v.id).join('|')}>`,
    help: `Replay one visualisation's own history in a window over the page: ${REPLAY_VISUALS.map(v => `${v.id} is ${v.what}`).join('; ')}. Play, pause, step, x1 x4 x16, loop and a scrubber; it says how much history is held. Also works as REPLAY <visual>.`,
    example: `play ${REPLAY_VISUALS[0].id}`, opens: 'A replay window over the page (a description of the history, not a forecast)', surface: 'widget.replayviz', run: args => vizRun(args) });
  add({ id: 'ghost', group: 'Look and feel', name: 'GHOST', aliases: ['GHOSTWALK'], args: '<market> [date]',
    help: `Ghost walk: one day of a market drawn in units of its own forecast median range from the open, over the faint paths of earlier days, with that day's option levels from the time they were saved and a ring where price touched one. Play it forward with the shared player. Only the markets with an option-OI capture (the ones on the OI terrain); it goes back as far as that capture. It shows where price was against the levels, not where it will go.`,
    example: 'ghost nq', opens: 'A replay window over the page: the day against its own expected range and the earlier days', surface: 'widget.ghostwalk', run: args => ghostRun(args, now) });
  add({ id: 'fav.show', group: 'Look and feel', name: 'FAV', aliases: ['FAVS', 'FAVOURITES', 'FAVORITES'], help: 'Open the Assets tab with only your starred markets (the Favourites filter). Star a market with the ☆ on its card, beside its name on the Pair page, or with STAR. They are kept in this browser only.', example: 'fav',
    opens: 'The Assets tab, filtered to your favourites', surface: 'panel.asset.favourites', needs: ['tab.assets'], action: { kind: 'fav', on: true }, summary: 'Opens the Assets tab with the Favourites filter on.' });
  add({ id: 'fav.star', group: 'Look and feel', name: 'STAR', aliases: [], args: '<market>', help: 'Star a market so it appears under Favourites on the Pair page and starts a new Monitor. Kept in this browser only.', example: 'star gold',
    opens: 'Your favourites list (nothing opens)', surface: 'panel.pair.favourites', run: args => favRun(args, true) });
  add({ id: 'fav.unstar', group: 'Look and feel', name: 'UNSTAR', aliases: [], args: '<market>', help: 'Take a market off your favourites.', example: 'unstar gold',
    opens: 'Your favourites list (nothing opens)', surface: 'panel.pair.favourites', run: args => favRun(args, false) });
  add({ id: 'mon.add', group: 'Look and feel', name: 'ADD', aliases: [], args: '<market>', help: 'Add a market to the open Monitor (the table of markets you picked). Save the monitor to keep it for the desk.', example: 'add eurusd',
    opens: 'The Monitor tab, with that market added', surface: 'tab.monitor', run: args => monitorAddRun(args) });
  add({ id: 'ws.save', group: 'Look and feel', name: 'SAVE', aliases: ['SAVEWORKSPACE'], args: 'workspace <name>', help: 'Save the Workspace tab layout as it is now under a name, shared with the desk. A built-in starter name makes you pick your own.', example: 'save workspace my morning',
    opens: 'The Workspace tab, saved under that name', surface: 'tab.workspace', run: args => workspaceSaveRun(args) });
  add({ id: 'alerts', group: 'Alerts', name: 'ALERTS', aliases: ['ALERT', 'BELL'], args: '[range <market> [%] | fed [bp] | stale [feed] | touch <market> | gap <market> [%] | news <words>]', help: 'Open the alerts panel; or set one in a line: ALERT RANGE <market> 80, ALERT FED 5, ALERT STALE, ALERT TOUCH <market>, ALERT GAP <market> 0.3, ALERT NEWS <words> (a new headline matching your words). A note goes to the desk Telegram once per episode. Only the owner can add, mute or delete alerts: each one writes to the one shared Telegram chat.',
    example: 'alerts', opens: 'The alerts panel (only the owner can add, mute and delete; the desk login sees the list once switched on)', surface: 'widget.alerts', run: args => alertRun(args) });
  add({ id: 'help', group: 'Help', name: 'HELP', aliases: ['?', 'COMMANDS'], help: 'List every command with what it does and an example.', example: '?', opens: 'This list', action: { kind: 'help' } });
  return out;

  // ── commands with arguments ──
  function replayRun(args, nowFn) {
    const toks = String(args ?? '').trim().split(/\s+/).filter(Boolean);
    if (toks.length && vizByWord(toks[0]) && isOn('widget.replayviz')) return vizRun(toks[0]);   // REPLAY CURVE: one visual's own history (preview)
    if (!toks.length) return { action: { kind: 'tab', t: 'replay' }, summary: 'Opens the Replay tab.' };
    const inst = resolveInstrument(toks[0]);
    if (!inst) return { error: `"${toks[0]}" is not a market I know. Try NQ, EURUSD or GOLD.` };
    if (!REPLAY_INSTRUMENTS[inst]) return { error: `Replay covers ${Object.keys(REPLAY_INSTRUMENTS).join(', ')}. ${inst} is not one of them.` };
    const when = parseWhen(toks.slice(1), nowFn());
    if (when?.error) return { error: when.error };
    if (!when) return { action: { kind: 'replay', inst, ts: null }, summary: `Opens the Replay on ${instLabel(inst)}, last session.` };
    const ts = londonWall(when.date, when.hh ?? 7, when.mm ?? 0);
    return { action: { kind: 'replay', inst, ts }, summary: `Opens the Replay on ${instLabel(inst)}, ${when.date} at ${p2(when.hh ?? 7)}:${p2(when.mm ?? 0)} London.` };
  }
  function alertRun(args) {
    const t = String(args ?? '').trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { action: { kind: 'alerts' }, summary: 'Opens the alerts panel.' };
    const w = t[0].toLowerCase(), build = (kind, params) => { const p = AL_KINDS[kind].check(params); return p ? { action: { kind: 'alert-add', body: { kind, params: p } }, summary: `Adds the alert: ${AL_KINDS[kind].describe(p)}.` } : { error: `Those settings do not make a "${AL_KINDS[kind].label}" alert: ${AL_KINDS[kind].help}` }; };
    if (w === 'range') return t[1] ? build('range_used', { market: t[1], pct: t[2] ?? 80 }) : { error: 'Say which market: ALERT RANGE EURUSD 80.' };
    if (w === 'fed') return build('fed_move', { bp: t[1] ?? 5 });
    if (w === 'stale') return build('data_stale', { feed: (t[1] ?? 'fed-zq').toLowerCase() });
    if (w === 'touch') return t[1] ? build('level_touch', { market: t[1], which: (t[2] ?? 'any').toLowerCase() }) : { error: 'Say which market: ALERT TOUCH NQ.' };
    if (w === 'gap') return t[1] ? build('gap_closed', { market: t[1], minPct: t[2] ?? 0.3 }) : { error: 'Say which market: ALERT GAP NQ 0.3.' };
    if (w === 'news') return t[1] ? build('news_keyword', { q: t.slice(1).join(' '), tier: 2 }) : { error: 'Say which words to watch for: ALERT NEWS ecb hawkish.' };
    return { error: `Say RANGE, FED, STALE, TOUCH, GAP or NEWS (or nothing to open the panel). Feeds for STALE: ${Object.keys(AL_FEEDS).join(', ')}.` };
  }
  function chartRun(args) {
    const t = String(args ?? '').trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { action: { kind: 'kchart', inst: null, tf: null }, summary: 'Opens the Chart tab.' };
    let inst = null, tf = null;
    for (const w of t) {
      const lw = w.toLowerCase();
      if (TF_KEYS.includes(lw) && !tf) { tf = lw; continue; }
      const m = resolveInstrument(w);
      if (m && !inst) { inst = m; continue; }
      return { error: `"${w}" is not a market or a candle size I know. Try CHART NQ 15M (sizes: ${TF_KEYS.join(', ')}).` };
    }
    return { action: { kind: 'kchart', inst, tf }, summary: `Opens the Chart tab${inst ? ` on ${instLabel(inst)}` : ''}${tf ? ` at ${tf} candles` : ''}.` };
  }
  function asofRun(args) {
    const a = String(args ?? '').trim();
    if (!a) return { action: { kind: 'asof', op: 'open' }, summary: 'Opens the time controls.' };
    if (/^(live|now|off|back)$/i.test(a)) return { action: { kind: 'asof', op: 'live' }, summary: 'Goes back to the live terminal.' };
    const off = parseAsofOffset(a);
    if (off != null) return { action: { kind: 'asof', op: 'step', ms: off }, summary: `Moves the time ${a} ${a.startsWith('-') ? 'earlier' : 'later'}.` };
    const t = parseAsofText(a, now());
    if (t == null) return { error: `I could not read "${a}" as a time. Try ASOF 12 nov 14:30, ASOF 2026-11-12 14:30, ASOF +1h, ASOF -1d or ASOF live (times are UTC).` };
    return { action: { kind: 'asof', op: 'set', t }, summary: `Shows the terminal as it was at ${formatAsofClock(t)}.` };
  }
  function vizRun(args) {
    const w = String(args ?? '').trim().split(/\s+/)[0], v = vizByWord(w);
    if (!w) return { error: `Say which visual: ${REPLAY_VISUALS.map(x => x.id).join(', ')}. For example PLAY ${REPLAY_VISUALS[0].id}.` };
    if (!v) return { error: `"${w}" is not a visual I can replay yet. Try ${REPLAY_VISUALS.map(x => x.id).join(', ')}.` };
    return { action: { kind: 'replay-viz', id: v.id }, summary: `Replays ${v.name.toLowerCase()}: ${v.what}.` };
  }
  function ghostRun(args, nowFn) {
    const toks = String(args ?? '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return { error: `Say which market: ${GHOST_MARKETS.join(', ')}. For example GHOST NQ, or GHOST GOLD 12 NOV.` };
    const inst = resolveInstrument(toks[0]);
    if (!inst) return { error: `"${toks[0]}" is not a market I know. Try GHOST NQ or GHOST GOLD.` };
    if (!GHOST_MARKETS.includes(inst)) return { error: `The ghost walk covers ${GHOST_MARKETS.join(', ')}: the markets with an option-OI capture. ${inst} is not one of them.` };
    const when = parseWhen(toks.slice(1), nowFn());
    if (when?.error) return { error: when.error };
    return { action: { kind: 'ghost', inst, date: when?.date ?? null }, summary: `Opens the ghost walk on ${instLabel(inst)}, ${when?.date ?? 'today so far'}.` };
  }
  function exportRun(args) {
    const a = String(args ?? '').trim().toLowerCase();
    if (!a || a === 'csv') return { action: { kind: 'export', what: 'csv' }, summary: 'Saves the biggest table on the open tab as a CSV file.' };
    if (a === 'png' || a === 'image' || a === 'chart') return { action: { kind: 'export', what: 'png' }, summary: 'Saves the first chart on the open tab as a PNG image.' };
    return { error: 'Say EXPORT for a CSV of the table, or EXPORT PNG for the chart.' };
  }
  function newsRun(args) {
    const a = String(args ?? '').trim();
    if (!a) return { action: { kind: 'tab', t: 'news' }, summary: 'Opens the News tab.' };
    const names = newsSearchNames();
    const hit = names.find(n => n.toLowerCase() === a.toLowerCase()) ?? names.find(n => n.toLowerCase().startsWith(a.toLowerCase()));
    if (!hit) return { error: names.length ? `No saved search called "${a}". Try ${names.join(', ')}.` : 'No saved searches yet. Save one on the News tab first.' };
    return { action: { kind: 'news-search', name: hit }, summary: `Opens the News tab with the saved search "${hit}".` };
  }
  function monitorRun(args) {
    const a = String(args ?? '').trim();
    if (!a) return { action: { kind: 'monitor', name: null }, summary: 'Opens the Monitor tab.' };
    const names = [...MON_STARTERS.map(s => s.name), ...monitorNames()];
    const hit = names.find(n => n.toLowerCase() === a.toLowerCase()) ?? names.find(n => n.toLowerCase().startsWith(a.toLowerCase()));
    if (!hit) return { error: `No monitor called "${a}". Try ${names.join(', ')}.` };
    return { action: { kind: 'monitor', name: hit }, summary: `Opens the Monitor tab with "${hit}".` };
  }
  function favRun(args, on) {
    const w = String(args ?? '').trim();
    if (!w) return { error: `Say which market to ${on ? 'star' : 'unstar'}: ${on ? 'STAR GOLD' : 'UNSTAR GOLD'}.` };
    const inst = resolveInstrument(w.split(/\s+/)[0]);
    if (!inst) return { error: `"${w}" is not a market on this terminal.` };
    return { action: { kind: on ? 'star' : 'unstar', inst }, summary: `${on ? 'Adds' : 'Removes'} ${instLabel(inst)} ${on ? 'to' : 'from'} your favourites.` };
  }
  function monitorAddRun(args) {
    const w = String(args ?? '').trim().replace(/^to\s+monitor\s*/i, '');
    if (!w) return { error: 'Say which market to add: ADD EURUSD.' };
    const inst = resolveInstrument(w.split(/\s+/)[0]);
    if (!inst) return { error: `"${w}" is not a market on this terminal.` };
    return { action: { kind: 'monitor-add', inst }, summary: `Adds ${instLabel(inst)} to the open Monitor.` };
  }
  function deepRun(args) {
    const toks = String(args ?? '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return { action: { kind: 'tab', t: 'deep' }, summary: 'Opens the Deep dive tab.' };
    let inst = null, section = null;
    for (const t of toks) { const sec = sectionOf(t); if (sec && !section) { section = sec.key; continue; } const i = resolveInstrument(t); if (i && !inst) inst = i; else return { error: `"${t}" is not a market or a section. Sections: ${DEEP_SECTIONS.map(x => x.key).join(', ')}.` }; }
    const label = inst ? instLabel(inst) : 'the current market', sec = DEEP_SECTIONS.find(x => x.key === section);
    return { action: { kind: 'deep', inst, section }, summary: `Opens the Deep dive on ${label}${sec ? `, ${sec.label}` : ''}.` };
  }
  function workspaceRun(args) {
    const a = String(args ?? '').trim();
    if (!a) return { action: { kind: 'workspace', name: null }, summary: 'Opens the Workspace tab.' };
    const names = [...WS_STARTERS.map(s => s.name), ...workspaceNames()];
    const hit = names.find(n => n.toLowerCase() === a.toLowerCase()) ?? names.find(n => n.toLowerCase().startsWith(a.toLowerCase()));
    if (!hit) return { error: `No workspace called "${a}". Try ${names.join(', ')}.` };
    return { action: { kind: 'workspace', name: hit }, summary: `Opens the Workspace tab with "${hit}".` };
  }
  function workspaceSaveRun(args) {
    const a = wsCleanName(String(args ?? '').replace(/^\s*workspace\b/i, ''));
    if (!a) return { error: 'Say what to call it: SAVE WORKSPACE my morning.' };
    if (WS_STARTERS.some(s => s.name.toLowerCase() === a.toLowerCase())) return { error: `"${a}" is a built-in starter. Pick your own name.` };
    return { action: { kind: 'workspace-save', name: a }, summary: `Saves the Workspace as "${a}".` };
  }
  function indicatorRun(word, args) {
    const a = String(args ?? '').trim().split(/\s+/).filter(Boolean)[0];
    if (!a) return { action: { kind: 'macro', block: 'panel.macro.engines' }, summary: `Opens the macro engines heatmap (${word}).` };
    const ccy = COUNTRY_CCY[a.toUpperCase()];
    if (!ccy) return { error: `"${a}" is not a country I know. Try US, EU, UK, JP, AU, NZ, CA or CH.` };
    return { action: { kind: 'macro', block: 'panel.macro.engines', ccy }, summary: `Opens the macro engines heatmap, then the ${ccy} card (${word}).` };
  }
  function themeRun(args) {
    const a = String(args ?? '').trim().toLowerCase();
    if (!a) return { error: `Name a theme: ${THEMES.map(t => t.id).join(', ')}.` };
    const t = THEMES.find(x => x.id === a) ?? THEMES.find(x => x.id.startsWith(a) || x.label.toLowerCase().startsWith(a));
    return t ? { action: { kind: 'theme', id: t.id }, summary: `Switches the colours to ${t.label}.` } : { error: `No theme called "${a}". Try ${THEMES.map(x => x.id).join(', ')}.` };
  }
  function tfRun(args) {
    const a = String(args ?? '').trim().toLowerCase();
    return TF_KEYS.includes(a) ? { action: { kind: 'tf', tf: a }, summary: `Sets the candle size to ${a} on every chart that has the pills.` } : { error: `Candle sizes are ${TF_KEYS.join(', ')}.` };
  }
  function linkRun(args) {
    const a = String(args ?? '').trim().toLowerCase();
    if (a === 'on' || a === 'off') return { action: { kind: 'link', on: a === 'on' }, summary: `Linked selection ${a}.` };
    return { error: 'Say LINK ON or LINK OFF.' };
  }
}

// ── matching ──
const norm = s => String(s ?? '').toUpperCase().replace(/^[/`\s]+/, '').replace(/\s+/g, ' ').trim();
const isSubseq = (q, s) => { let i = 0; for (const ch of s) if (ch === q[i]) i++; return i === q.length; };

/** How well a typed query matches one name: exact 1000, prefix 800, a word starts with it 600, contains 400, letters in order 150, else 0. */
export function nameScore(q, name) {
  const n = norm(name);
  if (!q || !n) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 800 - Math.min(200, n.length - q.length);
  if (n.split(' ').some(w => w.startsWith(q))) return 600;
  if (n.includes(q)) return 400;
  if (q.length >= 3 && isSubseq(q, n)) return 150;
  return 0;
}
const GROUP_RANK = { 'Go to a tab': 0, Markets: 1, 'Macro sections': 2, 'Macro boards': 3, Releases: 4, 'Look and feel': 5, Alerts: 5, Help: 6 };

/**
 * search(commands, line) -> up to `limit` results [{ cmd, score, action?, summary?, error?, args? }], best first.
 * A line like "replay nq 12 nov" whose first word is a command that takes arguments resolves to that command's action (or its error, shown in words).
 * "?" or "help" lists everything (the caller shows the grouped list).
 */
export function search(commands, line, { limit = 10 } = {}) {
  const q = norm(line);
  if (!q) return [];
  const res = [], order = new Map(commands.map((c, i) => [c.id, i]));
  const sp = q.indexOf(' ');
  if (sp > 0) {
    const head = q.slice(0, sp), rest = q.slice(sp + 1);
    const rawLine = String(line ?? '').replace(/^[/`\s]+/, '').replace(/\s+/g, ' ').trim(), rawRest = rawLine.slice(rawLine.indexOf(' ') + 1);   // the words as typed: a saved workspace keeps its capitals
    for (const c of commands) {
      if (!c.run) continue;
      if (![c.name, ...c.aliases].some(n => norm(n) === head)) continue;
      const r = c.run(rawRest);
      res.push(r.error ? { cmd: c, score: 900, error: r.error, args: rest } : { cmd: c, score: 1100, action: r.action, summary: r.summary, args: rest });
    }
  }
  const seen = new Set(res.map(r => r.cmd.id));
  for (const c of commands) {
    if (seen.has(c.id)) continue;
    let s = Math.max(nameScore(q, c.name), ...c.aliases.map(a => nameScore(q, a) - 10));
    if (s <= 0 && q.length >= 3 && norm(c.help).includes(q)) s = 60;
    if (s <= 0 && q.length >= 3 && norm(c.opens).includes(q)) s = 50;
    if (s > 0) res.push({ cmd: c, score: s });
  }
  res.sort((a, b) => b.score - a.score || (GROUP_RANK[a.cmd.group] ?? 9) - (GROUP_RANK[b.cmd.group] ?? 9) || a.cmd.name.length - b.cmd.name.length || order.get(a.cmd.id) - order.get(b.cmd.id));   // then the list's own order: EUR finds EURUSD first
  return res.slice(0, limit);
}

/** The action for a plain command (no arguments typed), or null when it needs some. */
export function plainAction(cmd) {
  if (cmd.action) return { action: cmd.action, summary: cmd.opens };
  if (cmd.run) { const r = cmd.run(''); return r.action ? { action: r.action, summary: r.summary } : null; }
  return null;
}

/** All commands grouped for the "?" list: [{ group, items }]. */
export function grouped(commands) {
  const by = new Map();
  for (const c of commands) { if (!by.has(c.group)) by.set(c.group, []); by.get(c.group).push(c); }
  return [...by.entries()].sort((a, b) => (GROUP_RANK[a[0]] ?? 9) - (GROUP_RANK[b[0]] ?? 9)).map(([group, items]) => ({ group, items }));
}
