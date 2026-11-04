/**
 * The Desk Pack: one dated snapshot of every feed the desk reads, built once a day before London.
 *
 * WHY. The plan in plans/DESK_ANALYST_PIPELINE.md runs the day's analysis as a chain of skills (analysts →
 * debate → risk desk → writers), modelled on TradingAgents' structure but fed with this desk's own data. Every
 * skill must read the SAME morning: if the newsletter writer and the directional analyst each fetched their own
 * feeds at different minutes, they would disagree for reasons that have nothing to do with judgement, and
 * nothing could be graded afterwards because nobody would know what each one saw. So Phase 0 is this: call
 * every feed once, stamp what each one is and how old its data is, mark the gaps, and save it under the date.
 *
 * ORDER FOLLOWS THE OWNER'S METHOD: global market first, then what it means for each currency, then the
 * assets (FX, indices, commodities). The `layer` of each skill says where it sits in that order.
 *
 * WHAT A FEED'S STATUS MEANS
 *   ok       answered, has content, and its data is no older than the feed's maxAgeH (or carries no date)
 *   stale    answered with content, but its newest date is older than maxAgeH -- the skill must say so
 *   empty    answered but with nothing in it (null, {}, [], or ok:false) -- a GAP, never read as "nothing happened"
 *   error    non-2xx or the request threw
 *   timeout  no answer inside the time limit
 *   oversize answered, but still too big after slimming; only its shape is kept
 * A gap is information: the Fed Path card that says "the odds are not loaded right now" must reach the
 * analyst as a gap, not as silence.
 *
 * SLIMMING. Some routes return years of history. The pack keeps the shape of every payload but cuts long arrays
 * to the most recent `maxArray` items (or the first ones for calendars, `keep: 'first'`) and long strings, and
 * records every cut in `truncated`, so a skill knows it is looking at a window. Phase 1 replaces this generic
 * cut with a hand-written slice per skill.
 *
 * Pure: no fetch, no KV, no clock reads (pass `now`). The server does the requests (server.js, "Desk Pack").
 * Tested in js/deskPack.test.mjs.
 */

export const DESK_PACK_VERSION = 1;

/**
 * The instruments the asset layer covers: every instrument the vol forecast covers (js/volForecastScheduler.js
 * INSTRUMENTS, 41 names, owner's choice 2026-11-03), grouped the way the asset layer batches them. A test keeps
 * this list equal to the scheduler's, so adding an instrument there without adding it here fails the build.
 */
export const DESK_UNIVERSE = {
  fx_majors: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'],
  fx_crosses: ['GBPJPY', 'EURGBP', 'EURJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'AUDCAD', 'NZDCAD', 'NZDJPY'],
  indices: ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'],
  metals: ['GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM'],
  energy: ['WTI', 'BRENT', 'NATGAS'],
  ags: ['SOYBEAN', 'WHEAT', 'CORN', 'SUGAR'],
  crypto: ['BTCUSD'],
};
/** Instruments some feeds only serve for a subset of the universe (swing map, trade decision engine). */
export const DESK_SUBSETS = {
  swingMap: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'GOLD', 'NQ', 'SPX500'],   // SWING_MAP_INSTRUMENTS in server.js
  tde: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY'],
};
export const DESK_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const allInstruments = (u = DESK_UNIVERSE) => Object.values(u).flat();
export const groupOf = name => Object.keys(DESK_UNIVERSE).find(g => DESK_UNIVERSE[g].includes(name)) ?? null;

// Equity indices map to the currency of their home market; commodities and crypto are priced in USD.
const INDEX_CCY = { NQ: 'USD', SPX500: 'USD', US30: 'USD', US2000: 'USD', DE30: 'EUR', UK100: 'GBP' };
/**
 * Which currency views an instrument is read from in the asset layer (top-down: global, then currency, then
 * asset). An FX pair has two legs, base then quote; everything else has one.
 */
export function instrumentLegs(name) {
  const g = groupOf(name);
  if (g === 'fx_majors' || g === 'fx_crosses') return [name.slice(0, 3), name.slice(3, 6)];
  if (g === 'indices') return [INDEX_CCY[name]];
  if (g) return ['USD'];
  return null;
}

/**
 * The analyst skills, in the owner's top-down order. Each one becomes a role prompt in Phase 1
 * (desk/roles/<id>.md); here it only names which feeds that role will read.
 */
export const DESK_SKILLS = [
  { id: 'global_market',   layer: 'global',   label: 'Global market and cross-asset tone', pages: 'Market View, Terminal, Surface Lab, Market State, Regime, Spread-turn episodes, Market-Sense' },
  { id: 'credit_funding',  layer: 'global',   label: 'Credit, banking and funding',        pages: 'Stocks/bonds & credit, Bank credit & funding, Book Stress, Global Liquidity' },
  { id: 'events_news',     layer: 'global',   label: 'Events and news',                    pages: 'Event Book, Release why, Release reaction, Labour market due, The Feed, Fiscal events' },
  { id: 'rates_cb',        layer: 'currency', label: 'Central banks and rates',            pages: 'Rates & Policy, Fed Path Odds, 8 CB Sentiment pages, Rate Matrix, Beige Book, Treasury auctions' },
  { id: 'yields_curve',    layer: 'currency', label: 'Yields and curve',                   pages: 'Yield Curve, Real Yield, Yield-Shape Regime, Rate legs vs price, Rates vs Nasdaq' },
  { id: 'macro_economy',   layer: 'currency', label: 'Macro economy',                    pages: 'CPI..Consumer Confidence, Macro Scorecard, The Economies, The Week Scored' },
  { id: 'cot_positioning', layer: 'currency', label: 'COT and retail positioning',         pages: 'COT Extremes, OANDA book' },
  { id: 'vol_iv',          layer: 'asset',    label: 'Volatility and implied vol',         pages: 'Vol Forecast v2/v3, Expected Moves, Daily Read, Exhaustion research, Forecast Path, Live Range' },
  { id: 'options_oi',      layer: 'asset',    label: 'Options open interest and dealer gamma', pages: 'OI Analytics, OI Lab (v2), Open interest, Swing Map' },
  { id: 'levels_structure', layer: 'asset',   label: 'Levels and structure',               pages: 'Level Scenarios, Level/Fib Atlas vote portfolios, Asia Fib Atlas Live, Daily Plan, Trade Decision' },
  { id: 'evidence_memory', layer: 'evidence', label: 'Evidence clerk and memory',          pages: 'Evidence Book, Chapters, direction ledger, forward track, yesterday\'s brief and review' },
];

// maxAgeH: how old the newest date in the payload may be before the feed counts as stale. Monthly macro prints
// are allowed weeks; intraday reads a few hours. null = the payload carries no usable date, so freshness is not
// judged (the status stays ok and asOf stays null -- "undated", which the skills are told).
const H = 1, D = 24 * H;
const F = (skill, path, maxAgeH, extra = {}) => ({ id: path.replace(/\?.*$/, ''), skill, path, maxAgeH, ...extra });

export const DESK_FEEDS = [
  // ── global ──────────────────────────────────────────────────────────────────
  F('global_market', 'global-read', 2 * H),
  F('global_market', 'wider-market', 1 * D),
  F('global_market', 'risk-flags', 4 * D),   // US daily closes: a Monday read is ~3 days old by construction
  F('global_market', 'regime', 45 * D),
  F('global_market', 'hmm/regimes', 1 * D),
  F('global_market', 'macro-regime-fx', 45 * D),
  F('global_market', 'gpr', 10 * D),
  F('global_market', 'crack', 10 * D),
  F('global_market', 'gold-etf-flow', 5 * D),
  F('global_market', 'desk-watch', 1 * D),
  F('global_market', 'spread-episodes/live', 3 * D),
  F('global_market', 'trend-basket', 3 * D),
  F('global_market', 'daily-snapshot?days=2', 3 * D),
  F('global_market', 'market-sense/last', 10 * D),
  F('global_market', 'world-stress', 1 * D),     // §9ag: one line across risk, credit, funding, basis, EM, liquidity, term premium, rate cycle
  F('global_market', 'em-gauges', 3 * D),
  F('global_market', 'copper-gold', 4 * D),     // growth against fear and Brent less WTI (js/globalBoards.js)
  F('global_market', 'commodity-fx', 100 * D),  // AUD, CAD, NOK against the commodity baskets they export (monthly)
  F('macro_economy', 'leading-indicators', 100 * D),   // OECD leading indicators by cycle phase (monthly, ~6-week lag)
  F('macro_economy', 'fair-value', 100 * D),    // BIS real effective rates against their 20-year average (monthly)
  F('rates_cb', 'carry-vol', 1 * D),            // carry against realised vol for all 28 pairs       // §9af: USD/CNH, USD/MXN, USD/ZAR, USD/TRY and the carry-stress read (gauges, not trades)
  F('global_market', 'chain-extra', 3 * D),     // §9af: EM dollar index and EM corporate spreads, MOVE, CCC, sector ETFs
  // the credit composite is read two days behind on purpose (point-in-time, js/creditStressEngine.js lagDays) and FRED's
  // Moody's series land a day or two late, so over a weekend the newest row is ~4-5 days old while the feed is healthy
  F('credit_funding', 'credit-stress', 6 * D),
  F('credit_funding', 'credit-quality', 6 * D),
  F('credit_funding', 'credit-board', 4 * D),     // §9ag: IG / BBB / HY / CCC, euro HY, EM corporate spreads with percentiles
  F('credit_funding', 'liquidity-board', 10 * D), // §9ag: Fed net liquidity, TGA, reverse repo, reserves
  F('credit_funding', 'xccy-basis', 4 * D),       // §9ag: EUR/GBP/JPY/CHF cross-currency basis (dollar shortage)
  F('credit_funding', 'bank-credit', 120 * D),
  F('credit_funding', 'funding-read?spark=0', 4 * D),
  F('credit_funding', 'liquidity-pulse/data', 10 * D),
  F('credit_funding', 'liquidity-gate/live', 4 * D),
  F('events_news', 'calendar-ahead', 1 * D, { keep: 'first', timeoutMs: 150_000 }),   // cold cache = 9 sequential Nasdaq calls
  F('events_news', 'events', 1 * D, { keep: 'first' }),
  F('events_news', 'event-day', 1 * D, { keep: 'first' }),
  F('events_news', 'release-calls', 4 * D),
  F('events_news', 'news-outcome', 4 * D),
  F('events_news', 'desk-news?pack=1', 1 * D),   // agent 21: the last 18 h of tier-1/2 headlines, tagged and read (context, never a signal)
  F('events_news', 'earnings-ahead', 4 * D, { keep: 'first' }),
  F('events_news', 'fiscal/events', 30 * D, { keep: 'first' }),
  // ── currency ────────────────────────────────────────────────────────────────
  F('rates_cb', 'rates', 4 * D),
  F('rates_cb', 'rate-diff', 4 * D),
  F('rates_cb', 'rates-regime', 4 * D),
  F('rates_cb', 'fed-path', 6 * D),   // the Atlanta Fed tracker publishes ~2 business days late (asOf); the fresh leg is zq (fed funds futures, nightly)
  F('rates_cb', 'fed-speakers', 7 * D),
  F('rates_cb', 'speech-drift', null),          // build list 4: each bank's speakers against its last statement (js/cbSpeeches.js); dated per speech inside
  ...['fomc', 'ecb', 'boe', 'boj', 'boc', 'rba', 'rbnz', 'snb'].map(b => F('rates_cb', `${b}/latest`, null)),
  F('rates_cb', 'beigebook/latest', null),
  F('rates_cb', 'policy-rates', 4 * D),        // §9aa: every bank's own policy rate with its date (not the 3m interbank rate)
  F('rates_cb', 'cb-expectations', 3 * D),     // §9aa: what short-rate futures price for every bank (laptop IBKR pull)
  F('rates_cb', 'world-rates', 100 * D),   // dated by the month's first day and published weeks after the month ends        // §9af: the world's policy-rate cycle (BIS, ~39 banks, monthly): who is hiking, who is cutting
  F('rates_cb', 'rbnz/decisions', 120 * D),   // OCR decisions from RSS headlines: the RBNZ statements are firewalled from the server
  F('rates_cb', 'treasury-auctions', 10 * D, { keep: 'first' }),
  F('yields_curve', 'yield-curve', 4 * D),
  F('yields_curve', 'intl-yields', 4 * D),
  F('yields_curve', 'global-yields', 4 * D),     // §9ag: 2y/10y for US, DE, UK (5y), JP, CA, AU; 2y gap to the US and its link to each currency
  F('yields_curve', 'term-premium', 7 * D),      // §9ag: Kim-Wright 10y term premium vs the expectations part of the 10y
  F('yields_curve', 'real-yield', 4 * D),
  F('yields_curve', 'yield-context', 4 * D),
  F('yields_curve', 'yield-coupling', 4 * D),
  F('yields_curve', 'yield-spread/plan', 4 * D),
  ...['cpi', 'ppi', 'gdp', 'ism', 'labor-market', 'retail-sales', 'trade-balance', 'consumer-confidence'].map(p => F('macro_economy', p, 100 * D)),
  F('macro_economy', 'econ-surprise', 7 * D, { maxBytes: 400_000 }),   // oversize at 150 KB on the first Railway pack
  F('macro_economy', 'econ-trend', 45 * D),
  F('macro_economy', 'nowcast', 10 * D),
  F('macro_economy', 'macro-scorecard', 4 * D),
  F('macro_economy', 'macro-changes', 7 * D),
  F('cot_positioning', 'cot-state', 10 * D),
  F('cot_positioning', 'cot-extremes', 10 * D),
  F('cot_positioning', 'oanda-book/history', 2 * D),
  // ── asset ───────────────────────────────────────────────────────────────────
  F('vol_iv', 'vol-forecast', 1 * D, { maxBytes: 400_000 }),   // the core vol feed: every instrument's lines; ~200 KB raw
  F('vol_iv', 'vol-forecast/session', 1 * D),
  F('vol_iv', 'vol-forecast/weekly', 7 * D),
  F('vol_iv', 'vol-forecast/intelligence', 1 * D),
  F('vol_iv', 'cvol', 3 * D),
  F('vol_iv', 'forecast-path/summary', 3 * D),
  F('vol_iv', 'forecast-path/iv', 3 * D),
  F('vol_iv', 'exhaustion-ladder', 8 * D),
  F('vol_iv', 'options-skew', 4 * D),           // risk reversals, butterflies, ATM vol (laptop IBKR pull, js/optionsSkew.js)   // a weekly refit (serviceFlags exhaustionLadder)
  F('vol_iv', 'daily-read', 3 * D),
  F('vol_iv', 'today-reads', 1 * D),
  F('options_oi', 'oi-today', 3 * D),
  F('options_oi', 'oi-levels', 3 * D),
  F('options_oi', 'chain-read', 3 * D),
  F('options_oi', 'hedging-summary', 2 * D),   // §9af: dealer gamma state per market, switch point, walls, hedge flow per 1% move
  F('levels_structure', 'levels', 1 * D),
  F('levels_structure', 'asia-today', 1 * D),
  F('levels_structure', 'weekmap', 7 * D),
  F('levels_structure', 'range-calls', 3 * D),
  F('levels_structure', 'daily-open-fib', 3 * D),
  // ── evidence & memory ───────────────────────────────────────────────────────
  F('evidence_memory', 'ledger', 7 * D),
  F('evidence_memory', 'direction-ledger', 7 * D),
  F('evidence_memory', 'data-health', 1 * D),
  F('evidence_memory', 'morning-brief', 3 * D),
  F('evidence_memory', 'eod-review', 3 * D),
  F('evidence_memory', 'desk-memory', 5 * D),
  F('evidence_memory', 'desk-weekly', 8 * D),   // agent 19: the Sunday week view (context for the week, labelled; never a card)   // Phase 4: the desk's own end-of-day reflections (one-day anecdotes, labelled)
];

/** Feeds read once per instrument. `{inst}` is the upper-case key, `{lower}` the lower-case one. */
export const DESK_INSTRUMENT_FEEDS = [
  { skill: 'options_oi', tpl: 'swing-map?inst={inst}', base: 'swing-map', maxAgeH: 3 * D, subset: 'swingMap' },
  { skill: 'levels_structure', tpl: 'trade-decision/state/{lower}', base: 'trade-decision/state', maxAgeH: 1 * D, subset: 'tde' },
];

/** The full list of requests for one build, instrument feeds expanded. */
export function expandFeeds(feeds = DESK_FEEDS, instFeeds = DESK_INSTRUMENT_FEEDS, universe = DESK_UNIVERSE, subsets = DESK_SUBSETS) {
  const out = feeds.map(f => ({ ...f }));
  for (const t of instFeeds) {
    const all = allInstruments(universe);
    const list = t.subset ? (subsets[t.subset] ?? []).filter(x => all.includes(x)) : all;
    for (const inst of list) {
      const path = t.tpl.replace('{inst}', inst).replace('{lower}', inst.toLowerCase());
      out.push({ id: `${t.base}:${inst}`, skill: t.skill, path, maxAgeH: t.maxAgeH, instrument: inst, ...(t.keep ? { keep: t.keep } : {}) });
    }
  }
  const ids = new Set();
  for (const f of out) { if (ids.has(f.id)) throw new Error(`duplicate desk feed id ${f.id}`); ids.add(f.id); }
  return out;
}

// ── dates ─────────────────────────────────────────────────────────────────────

/** The London calendar date of `now` (ms), YYYY-MM-DD: the desk's day. */
export function londonDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(now));
}
/** London hour and minute of `now`, and whether it is a weekday there. */
export function londonClock(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const hour = Number(parts.hour) % 24, minute = Number(parts.minute);
  return { hour, minute, weekday: !['Sat', 'Sun'].includes(parts.weekday) };
}

// Field names that say when a payload's data is from, in priority order. A top-level hit wins; otherwise the
// newest hit one level down (payloads keyed by instrument or by series).
const ASOF_KEYS = ['asOf', 'as_of', 'asof', 'dataAsOf', 'latestDate', 'lastDate', 'last_date', 'updatedAt', 'updated_at', 'lastUpdated',
  'updated', 'generatedAt', 'generated_at', 'builtAt', 'fetchedAt', 'computedAt', 'ts', 'timestamp', 'date', 'day'];

/** A date-like value as ms, or null. Numbers below 1e11 are taken as seconds. */
export function toMs(v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') { if (!Number.isFinite(v) || v <= 0) return null; return v < 1e11 ? v * 1000 : v; }
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}(-\d{2})?/.test(v)) return null;           // only ISO-shaped strings; "Tue 03:30" is not a date
  const ms = Date.parse(v.length === 7 ? `${v}-01` : v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * When a payload's data is from, as { ms, key } or null. Times more than a day in the future are ignored (a
 * calendar's next event is not the feed's as-of).
 */
export function findAsOf(json, now) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    if (Array.isArray(json)) {               // an array of rows: the newest dated row
      let best = null;
      for (const row of json.slice(-200)) { const h = findAsOf(row, now); if (h && (!best || h.ms > best.ms)) best = h; }
      return best;
    }
    return null;
  }
  const ok = ms => ms != null && ms <= now + D * 3600e3;
  for (const k of ASOF_KEYS) { const ms = toMs(json[k]); if (ok(ms)) return { ms, key: k }; }
  let best = null;
  for (const [k1, v] of Object.entries(json)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    for (const k of ASOF_KEYS) { const ms = toMs(v[k]); if (ok(ms) && (!best || ms > best.ms)) best = { ms, key: `${k1}.${k}` }; }
  }
  return best;
}

/** Whether a payload has nothing in it. `{ ok: false, ... }` counts as empty: the route said it has no data. */
export function isEmptyPayload(json) {
  if (json == null) return true;
  if (Array.isArray(json)) return json.length === 0;
  if (typeof json !== 'object') return json === '';
  if (json.ok === false) return true;
  const keys = Object.keys(json).filter(k => !['ok', 'cached', 'error', 'note'].includes(k));
  if (!keys.length) return true;
  return keys.every(k => { const v = json[k]; return v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length); });
}

/**
 * Cut a payload down to fit the pack. Arrays over `maxArray` keep their last (or first, keep:'first') items;
 * strings over `maxString` chars are cut. Every cut is listed in `truncated` as { path, total, kept }.
 */
export function slimPayload(json, { maxArray = 60, maxString = 4000, maxDepth = 8, keep = 'last' } = {}) {
  const truncated = [];
  const walk = (v, path, depth) => {
    if (typeof v === 'string') { if (v.length > maxString) { truncated.push({ path, total: v.length, kept: maxString }); return v.slice(0, maxString) + '…'; } return v; }
    if (!v || typeof v !== 'object') return v;
    if (depth >= maxDepth) { truncated.push({ path, total: null, kept: 0, note: 'depth' }); return Array.isArray(v) ? `[array ${v.length}]` : '[object]'; }
    if (Array.isArray(v)) {
      let arr = v;
      if (v.length > maxArray) { truncated.push({ path, total: v.length, kept: maxArray, from: keep }); arr = keep === 'first' ? v.slice(0, maxArray) : v.slice(-maxArray); }
      return arr.map((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    }
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = walk(x, path ? `${path}.${k}` : k, depth + 1);
    return o;
  };
  return { data: walk(json, '', 0), truncated };
}

const bytesOf = v => { try { return Buffer.byteLength(JSON.stringify(v) ?? ''); } catch { return Infinity; } };

/** A payload's shape only (top-level keys and their types), for oversize feeds. */
export function shapeOf(json) {
  if (Array.isArray(json)) return { type: 'array', length: json.length };
  if (!json || typeof json !== 'object') return { type: typeof json };
  return { type: 'object', keys: Object.fromEntries(Object.entries(json).slice(0, 60).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v])) };
}

/**
 * One feed's entry in the pack, from what the request returned.
 * result: { json, httpStatus, error, timedOut, ms } as the server measured it.
 */
export function packEntry(feed, result, now, { maxBytes = feed.maxBytes ?? 150_000 } = {}) {
  const base = { id: feed.id, skill: feed.skill, path: feed.path, ...(feed.instrument ? { instrument: feed.instrument } : {}), ms: result.ms ?? null };
  if (result.timedOut) return { ...base, status: 'timeout', error: result.error ?? 'timed out', asOf: null, data: null };
  if (result.error || (result.httpStatus && (result.httpStatus < 200 || result.httpStatus >= 300))) {
    const err = result.error ?? (typeof result.json?.error === 'string' ? result.json.error : `HTTP ${result.httpStatus}`);
    return { ...base, status: 'error', httpStatus: result.httpStatus ?? null, error: String(err).slice(0, 300), asOf: null, data: null };
  }
  const json = result.json;
  if (isEmptyPayload(json)) {
    const why = ['error', 'message', 'reason', 'note'].map(k => json?.[k]).find(v => typeof v === 'string' && v) ?? null;
    return { ...base, status: 'empty', ...(why ? { error: why.slice(0, 300) } : {}), asOf: null, data: null };
  }
  const hit = findAsOf(json, now);
  const asOf = hit ? new Date(hit.ms).toISOString() : null;
  const ageH = hit ? Math.round(((now - hit.ms) / 3600e3) * 10) / 10 : null;
  const stale = feed.maxAgeH != null && ageH != null && ageH > feed.maxAgeH;
  const rawBytes = bytesOf(json);
  let { data, truncated } = slimPayload(json, { keep: feed.keep ?? 'last' });
  let bytes = bytesOf(data);
  if (bytes > maxBytes) { ({ data, truncated } = slimPayload(json, { keep: feed.keep ?? 'last', maxArray: 15, maxString: 1500, maxDepth: 6 })); bytes = bytesOf(data); }
  if (bytes > maxBytes) return { ...base, status: 'oversize', asOf, asOfKey: hit?.key ?? null, ageH, rawBytes, data: null, shape: shapeOf(json) };
  return {
    ...base, status: stale ? 'stale' : 'ok', asOf, asOfKey: hit?.key ?? null, ageH, maxAgeH: feed.maxAgeH ?? null,
    rawBytes, bytes, ...(truncated.length ? { truncated: truncated.slice(0, 40), truncatedCount: truncated.length } : {}), data,
  };
}

/** Counts by status, overall and per skill, plus the list of gaps. */
export function packHealth(entries) {
  const blank = () => ({ ok: 0, stale: 0, empty: 0, error: 0, timeout: 0, oversize: 0, total: 0 });
  const all = blank(), bySkill = {};
  const gaps = [];
  for (const e of entries) {
    const s = (bySkill[e.skill] ??= blank());
    all[e.status]++; all.total++; s[e.status]++; s.total++;
    if (e.status !== 'ok') gaps.push({ id: e.id, skill: e.skill, status: e.status, ...(e.ageH != null ? { ageH: e.ageH } : {}), ...(e.error ? { error: e.error } : {}) });
  }
  return { ...all, usable: all.ok + all.stale, bySkill, gaps };
}

/**
 * Assemble the pack from the measured results.
 * results: array of { feed, result } in any order.
 */
export function buildDeskPack(results, { now, startedAt = now, trigger = 'manual' } = {}) {
  const entries = results.map(({ feed, result }) => packEntry(feed, result, now));
  const order = new Map(DESK_SKILLS.map((s, i) => [s.id, i]));
  entries.sort((a, b) => (order.get(a.skill) ?? 99) - (order.get(b.skill) ?? 99) || a.id.localeCompare(b.id));
  const skills = {};
  for (const s of DESK_SKILLS) skills[s.id] = { layer: s.layer, label: s.label, feeds: {} };
  for (const e of entries) (skills[e.skill] ??= { layer: 'unknown', label: e.skill, feeds: {} }).feeds[e.id] = e;
  return {
    version: DESK_PACK_VERSION,
    date: londonDate(now),
    builtAt: new Date(now).toISOString(),
    buildMs: now - startedAt,
    trigger,
    universe: DESK_UNIVERSE,
    currencies: DESK_CCYS,
    layers: ['global', 'currency', 'asset', 'evidence'],
    health: packHealth(entries),
    skills,
  };
}

/**
 * Is a saved pack still the right one to run the desk on? A run reads the morning as it is now, so a pack more
 * than `maxAgeMs` old is rebuilt, and so is one built from an older feed list (feeds added or dropped since).
 * On 2026-11-03 the 13:08 run read the 04:46 pack: eight hours old, and from before that morning's feed fixes.
 */
export function packFresh(pack, now, { maxAgeMs = 90 * 60_000 } = {}) {
  if (!pack?.skills) return { fresh: false, reason: 'no pack' };
  if (pack.date !== londonDate(now)) return { fresh: false, reason: `pack is for ${pack.date}` };
  const ageMs = now - Date.parse(pack.builtAt);
  if (!(ageMs <= maxAgeMs)) return { fresh: false, reason: `pack is ${Math.round(ageMs / 60_000)} minutes old` };
  const have = new Set(Object.values(pack.skills).flatMap(s => Object.keys(s.feeds ?? {})));
  const want = expandFeeds().map(f => f.id);
  const missing = want.filter(id => !have.has(id)), extra = [...have].filter(id => !want.includes(id));
  if (missing.length || extra.length) return { fresh: false, reason: `feed list changed (${[...missing.map(x => `+${x}`), ...extra.map(x => `-${x}`)].slice(0, 6).join(', ')})` };
  return { fresh: true, reason: null };
}

/** One skill's part of a pack (what that analyst will be handed in Phase 1), with the pack's header. */
export function packForSkill(pack, skillId) {
  const s = pack?.skills?.[skillId];
  if (!s) return null;
  return { version: pack.version, date: pack.date, builtAt: pack.builtAt, skill: skillId, ...s, health: pack.health?.bySkill?.[skillId] ?? null };
}

/** A pack without payloads: health, and per feed its status, date and size. For the index and quick checks. */
export function packSummary(pack) {
  if (!pack) return null;
  const feeds = {};
  for (const [sid, s] of Object.entries(pack.skills ?? {})) for (const [fid, e] of Object.entries(s.feeds)) {
    feeds[fid] = { skill: sid, status: e.status, asOf: e.asOf ?? null, ageH: e.ageH ?? null, bytes: e.bytes ?? null, ms: e.ms ?? null, ...(e.error ? { error: e.error } : {}) };
  }
  return { version: pack.version, date: pack.date, builtAt: pack.builtAt, buildMs: pack.buildMs, trigger: pack.trigger, health: pack.health, feeds };
}

/** The index row kept for each saved pack. */
export function indexRow(pack, storedBytes) {
  const h = pack.health;
  return { date: pack.date, builtAt: pack.builtAt, trigger: pack.trigger, ok: h.ok, stale: h.stale, gaps: h.total - h.usable, total: h.total, storedBytes };
}

/** Add or replace a day's row, newest last, keeping `keepDays`. */
export function upsertIndex(index, row, keepDays = 400) {
  const rows = (Array.isArray(index) ? index : []).filter(r => r.date !== row.date);
  rows.push(row);
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows.slice(-keepDays);
}

/**
 * Whether the scheduler should build now: a London weekday, at or after the build time, and no pack for today
 * yet. Weekends are skipped on purpose -- the desk's day is a trading day.
 */
export function shouldBuild(now, haveDate, { hour = 6, minute = 40 } = {}) {
  const c = londonClock(now);
  if (!c.weekday) return false;
  if (c.hour < hour || (c.hour === hour && c.minute < minute)) return false;
  return haveDate !== londonDate(now);
}
