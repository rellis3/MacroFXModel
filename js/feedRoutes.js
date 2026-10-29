// The Feed — rebuild + API (page: feed.html; maths: js/feedCore.js).
//
// Tick (every 30 min, server.js svcInterval 'feed'): rebuild when the stored build is older than 12 hours.
// Each panel is built independently; a panel that fails keeps its previous build and records why.
// Data: FRED (keyed API when FRED_KEY is set, else the graph CSV) for the H.4.1 legs, SOFR/IORB, the 10y and the broad dollar, and the three
// FRED energy spot series; OANDA daily candles (~4 years) for the commodity CFDs, the S&P 500 and gold.
// KV `feed_v1`: re-derivable from source, kept so a deploy or a failed fetch still shows the last build.
//
// Rates and options are not rebuilt here: feed.html reads them from Surface Lab (/api/surface-lab?field=rates|volTerm)
// and links to the OI dashboard.
import { liquidity, crossAsset, commodities } from './feedCore.js';

export const FEED_KV = 'feed_v1';
// The weekly notebook on feed.html: one note per week (what moved / what it might mean / what would prove me wrong),
// marked later as right / partly / wrong. A permanent key: these are the owner's own words, not re-derivable.
// Written only when Save is pressed (about once a week), so it is not a churny key.
export const FEED_NOTES_KV = 'feed_notes_v1';
const NOTE_FIELDS = ['moved', 'meaning', 'wrong', 'outcome'];
const VERDICTS = ['', 'right', 'partly', 'wrong'];
const REBUILD_MS = 12 * 3600e3;
const DAYS = 4.3 * 365;                                // 104-week window + 104 weeks of coloured history, plus slack

// Sixteen rows: fifteen markets plus the equal-weight basket feedCore adds. OANDA CFDs track the front future;
// the three FRED rows are physical spot prices (the refined legs and the US gas hub), weekly-sampled like the rest.
export const COMMODITIES = [
  ['XAU_USD', 'gold', 'Gold', 'metals'], ['XAG_USD', 'silver', 'Silver', 'metals'], ['XPT_USD', 'platinum', 'Platinum', 'metals'],
  ['XPD_USD', 'palladium', 'Palladium', 'metals'], ['XCU_USD', 'copper', 'Copper', 'metals'],
  ['WTICO_USD', 'wti', 'WTI crude', 'energy'], ['BCO_USD', 'brent', 'Brent crude', 'energy'], ['NATGAS_USD', 'natgas', 'Natural gas', 'energy'],
  ['fred:DHOILNYH', 'heatoil', 'Heating oil (NYH)', 'energy'], ['fred:DGASNYH', 'gasoline', 'Gasoline (NYH)', 'energy'],
  ['fred:DHHNGSP', 'henryhub', 'Henry Hub gas', 'energy'],
  ['CORN_USD', 'corn', 'Corn', 'grains'], ['WHEAT_USD', 'wheat', 'Wheat', 'grains'], ['SOYBN_USD', 'soybeans', 'Soybeans', 'grains'],
  ['SUGAR_USD', 'sugar', 'Sugar', 'softs'],
];

const daysAgoISO = n => new Date(Date.now() - n * 864e5).toISOString();

export function createFeed({ kv, fetchCandles, fetchFred = null, fredCsv, log = console }) {
  let running = false, last = null, memo = null;
  async function load() {
    if (memo) return memo;
    const raw = await kv.get(FEED_KV); if (!raw) return null; memo = JSON.parse(raw); return memo;
  }
  const since = daysAgoISO(DAYS).slice(0, 10);
  // FRED's graph CSV answers 503 to bursts; three tries with a growing pause, then give up on that series only
  const fred = async (id, scale = 1) => {
    for (let k = 0; ; k++) {
      try {
        // the keyed API (same as Surface Lab) when there is a key; the no-key graph CSV otherwise
        const rows = fetchFred ? [...(await fetchFred(id, since))] : (await fredCsv(id)).filter(o => o.date >= since).map(o => [o.date, o.value]);
        return new Map(rows.map(([d, v]) => [d, v * scale]));
      }
      catch (e) { if (k >= 2) throw e; await new Promise(r => setTimeout(r, 2000 * 2 ** k)); }
    }
  };
  const oandaCache = new Map();                        // gold and WTI are read by two panels in one build
  const daily = async inst => {
    if (!oandaCache.has(inst)) {
      const bars = await fetchCandles(inst, 'D', daysAgoISO(DAYS), new Date().toISOString());
      oandaCache.set(inst, new Map(bars.map(b => [b.datetime.slice(0, 10), +b.close])));
    }
    return oandaCache.get(inst);
  };

  async function buildLiquidity() {
    // WALCL, WDTGAL and WRESBAL are $m; RRPONTSYD is already $bn
    // one at a time: six parallel hits on FRED is the shape that gets a 503
    const walcl = await fred('WALCL', 1e-3), tga = await fred('WDTGAL', 1e-3), reserves = await fred('WRESBAL', 1e-3);
    const rrp = await fred('RRPONTSYD'), sofr = await fred('SOFR'), iorb = await fred('IORB');
    return liquidity({ walcl, tga, rrp, reserves, sofr, iorb });
  }
  async function buildCross() {
    const legs = [], fail = {};
    const add = async (key, label, kind, get) => { try { legs.push({ key, label, kind, map: await get() }); } catch (e) { fail[key] = String(e.message || e); legs.push({ key, label, kind, map: new Map() }); } };
    await add('spx', 'S&P 500', 'price', () => daily('SPX500_USD'));
    await add('ust10', 'UST 10Y yield', 'yield', () => fred('DGS10'));
    await add('dollar', 'Broad dollar index', 'price', () => fred('DTWEXBGS'));
    await add('wti', 'WTI crude', 'price', () => daily('WTICO_USD'));
    await add('gold', 'Gold', 'price', () => daily('XAU_USD'));
    const out = crossAsset(legs, { window: 63, keepWeeks: 156 });
    if (out.pairs.length < 3) throw new Error(`only ${out.pairs.length} pairs (failed: ${JSON.stringify(fail)})`);
    return { ...out, fail };
  }
  async function buildCommodities() {
    const markets = [], fail = {};
    for (const [src, key, label, group] of COMMODITIES) {
      try { markets.push({ key, label, group, src, map: src.startsWith('fred:') ? await fred(src.slice(5)) : await daily(src) }); }
      catch (e) { fail[key] = String(e.message || e); }
    }
    if (markets.length < 8) throw new Error(`only ${markets.length} markets loaded (failed: ${Object.keys(fail).join(', ')})`);
    const out = commodities(markets, { window: 104, keepWeeks: 104 });
    return { ...out, fail, sources: Object.fromEntries(COMMODITIES.map(([src, key]) => [key, src.startsWith('fred:') ? 'FRED ' + src.slice(5) : 'OANDA ' + src])) };
  }

  async function tick(reason = 'scheduled', force = false) {
    if (running) return { skipped: 'already running' };
    running = true; oandaCache.clear();
    try {
      const prev = await load().catch(() => null);
      if (!force && prev?.builtAt && Date.now() - Date.parse(prev.builtAt) < REBUILD_MS) return { skipped: 'fresh', builtAt: prev.builtAt };
      const out = { ...(prev ?? {}), errors: {} }, t0 = Date.now();
      try { out.liquidity = await buildLiquidity(); } catch (e) { out.errors.liquidity = String(e.message || e); }
      try { out.crossAsset = await buildCross(); } catch (e) { out.errors.crossAsset = String(e.message || e); }
      try { out.commodities = await buildCommodities(); } catch (e) { out.errors.commodities = String(e.message || e); }
      out.builtAt = new Date().toISOString(); out.buildMs = Date.now() - t0;
      await kv.put(FEED_KV, JSON.stringify(out)); memo = out;
      last = { at: out.builtAt, reason, ok: true, errors: out.errors };
      log.log?.(`[feed] built in ${out.buildMs} ms${Object.keys(out.errors).length ? ' with errors: ' + JSON.stringify(out.errors) : ''}`);
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[feed] tick failed: ${last.error}`);
      return last;
    } finally { running = false; oandaCache.clear(); }
  }

  function mount(app) {
    // ?panel=liquidity|crossAsset|commodities returns one panel; no panel returns all three (~150 KB).
    app.get('/api/feed', async (req, res) => {
      try {
        const s = await load();
        if (!s) return res.json({ ok: false, running, lastTick: last, error: 'No build yet — the first build runs within a few minutes of a deploy.' });
        const p = req.query.panel, meta = { ok: true, builtAt: s.builtAt, buildMs: s.buildMs, errors: s.errors, running, lastTick: last };
        res.set('Cache-Control', 'public, max-age=900');
        if (!p) return res.json({ ...meta, liquidity: s.liquidity ?? null, crossAsset: s.crossAsset ?? null, commodities: s.commodities ?? null });
        if (!['liquidity', 'crossAsset', 'commodities'].includes(p)) return res.status(400).json({ ok: false, error: `unknown panel ${p}` });
        res.json({ ...meta, [p]: s[p] ?? null });
      } catch (e) { res.status(503).json({ ok: false, error: `KV unavailable: ${e.message}` }); }
    });
    const loadNotes = async () => { const raw = await kv.get(FEED_NOTES_KV); return raw ? JSON.parse(raw) : {}; };
    app.get('/api/feed/notes', async (_req, res) => {
      try { const n = await loadNotes(); res.set('Cache-Control', 'no-store'); res.json({ ok: true, notes: n }); }
      catch (e) { res.status(503).json({ ok: false, error: `KV unavailable: ${e.message}` }); }
    });
    // body: { moved, meaning, wrong, outcome, verdict } for the week ending :week (a Friday, YYYY-MM-DD). Merged, so
    // marking last week's verdict does not wipe its text.
    app.put('/api/feed/notes/:week', async (req, res) => {
      const week = req.params.week, b = req.body ?? {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ ok: false, error: 'week must be YYYY-MM-DD' });
      if (b.verdict != null && !VERDICTS.includes(b.verdict)) return res.status(400).json({ ok: false, error: `verdict must be one of ${VERDICTS.join(', ')}` });
      try {
        const notes = await loadNotes(), cur = notes[week] ?? {};
        for (const f of NOTE_FIELDS) if (typeof b[f] === 'string') cur[f] = b[f].slice(0, 4000);
        if (b.verdict != null) cur.verdict = b.verdict;
        cur.savedAt = new Date().toISOString(); notes[week] = cur;
        await kv.put(FEED_NOTES_KV, JSON.stringify(notes));
        res.json({ ok: true, week, note: cur });
      } catch (e) { res.status(503).json({ ok: false, error: `KV unavailable: ${e.message}` }); }
    });
    app.post('/api/feed/rebuild', (_req, res) => {
      if (running) return res.json({ ok: true, started: false, running: true });
      tick('manual', true).catch(() => {}); res.json({ ok: true, started: true });
    });
  }
  return { tick, mount };
}
