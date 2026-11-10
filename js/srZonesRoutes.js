// S/R ZONES — routes (logic: js/srZones.js). SIDE BY SIDE with the OI tiers / Confluence Zones / OI levels exports: nothing here changes them,
// nothing here is read by a bot. Read-only: KV reads (oi_store, oi_store_cmdty via the server's helpers), the in-memory forecast, the desk book,
// and OANDA M5 candles (with tick volume) for the London-midnight open, live spot and the volume profile.
//
//   GET /api/sr-zones/export?pair=<oi key | forecast name | comma list | all>   text for pine/SR Zones.pine (parts when over 4,000 characters)
//   GET /api/sr-zones?pair=...                                                    the same as JSON, for the pages
import { oiStoreToLevels } from './oiConfluence.js';
import { oiFuturesTermsPrice } from './oi.js';
import { priceDigits } from './hedgingBooks.js';
import { tvTickers } from './deskBookPine.js';
import { londonDay, londonOpen, volumeProfileLevels, oiLegs, forecastLegs, deskLegs, profileLegs, buildSrZones, gexContext, cotContext,
  formatExport, splitParts, partsText, SRZ_HEADER, describeSrZone } from './srZones.js';

const TTL = 5 * 60_000;
const NOT_IN_ALL = /^(CORN|SOYBN|WHEAT|SUGAR|XPT|XPD)/i;   // same exclusions as the OI Profile paste's pair=all
// micro / currency futures the chart might be on, beyond js/deskBookPine.js tvTickers
const EXTRA_ALIASES = { GOLD: ['MGC1!', 'MGC'], NQ: ['MNQ1!', 'MNQ'], SPX500: ['MES1!', 'MES'], US30: ['MYM1!', 'MYM'], US2000: ['M2K1!', 'M2K'],
  SILVER: ['SIL1!', 'SIL'], WTI: ['MCL1!', 'MCL'], EURUSD: ['6E1!', '6E', 'M6E1!', 'M6E'], GBPUSD: ['6B1!', '6B', 'M6B1!', 'M6B'], AUDUSD: ['6A1!', '6A', 'M6A1!', 'M6A'] };
const oandaBase = () => ((process.env.OANDA_ENV || 'live') === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com');
const parse = raw => { if (!raw) return {}; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p ?? {}; };
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * deps: kv · getForecast() → forecastState.latest · forecastKeyForPair(pair) · oandaFor(storeKey) → OANDA symbol | null ·
 * ivLadders(store) → { forecastName: ladder } · cotForExport() · deskCards() → { date, cards: { forecastName: { rating, card|null } }, reason? }
 */
export function createSrZones({ kv, getForecast, forecastKeyForPair, oandaFor, ivLadders = async () => ({}), cotForExport = async () => null, deskCards = async () => ({ cards: {} }), fetchImpl = fetch, log = console }) {
  const barCache = new Map(), itemCache = new Map();
  let ivCache = { at: 0, v: null }, deskCache = { at: 0, v: null }, cotCache = { at: 0, v: null };

  async function m5(osym) {
    const c = barCache.get(osym); if (c && Date.now() - c.at < TTL) return c.bars;
    if (!process.env.OANDA_KEY) return null;
    const r = await fetchImpl(`${oandaBase()}/v3/instruments/${encodeURIComponent(osym)}/candles?granularity=M5&count=5000&price=M`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`OANDA ${osym} HTTP ${r.status}`);
    const all = ((await r.json()).candles || []).filter(x => x.mid).map(x => ({ time: Math.floor(Date.parse(x.time) / 1000), open: +x.mid.o, high: +x.mid.h, low: +x.mid.l, close: +x.mid.c, volume: +x.volume || 0, complete: !!x.complete }));
    barCache.set(osym, { at: Date.now(), bars: all });
    return all;
  }
  const once = async (ref, fn) => { if (ref.v && Date.now() - ref.at < TTL) return ref.v; const v = await fn(); ref.at = Date.now(); ref.v = v; return v; };

  async function loadStore() {
    const store = parse(await kv.get('oi_store').catch(() => null));
    const cm = parse(await kv.get('oi_store_cmdty').catch(() => null));
    for (const [k, v] of Object.entries(cm || {})) if (!(k in store)) store[k] = v;
    return store;
  }
  const fkOf = k => { try { return forecastKeyForPair(k); } catch { return null; } };

  function resolveKeys(store, pairQ) {
    const want = String(pairQ || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!want.length) return null;
    const keys = Object.keys(store).filter(k => oandaFor(k));
    if (want[0].toLowerCase() === 'all') return keys.filter(k => !NOT_IN_ALL.test(norm(k)));
    const aliasFk = { NQ: 'NQ', NAS100: 'NQ', GOLD: 'GOLD', XAU: 'GOLD', SPX: 'SPX500', ES: 'SPX500', DOW: 'US30', DJI: 'US30', RUT: 'US2000', RTY: 'US2000' };
    return want.map(w => keys.find(k => k === w || norm(k) === norm(w) || (fkOf(k) && (fkOf(k) === fkOf(w) || fkOf(k) === aliasFk[norm(w)])))).filter(Boolean);
  }

  async function buildItem(k, inst, ctx) {
    const missing = [];
    const fk = fkOf(k), fc = fk ? ctx.forecast?.instruments?.[fk] : null;
    const name = fk || norm(k);
    const osym = oandaFor(k);
    let bars = null;
    try { bars = osym ? await m5(osym) : null; } catch (e) { log.warn?.('[sr-zones]', k, e.message); }
    const done = (bars || []).filter(b => b.complete);
    const today = londonDay(Date.now() / 1000);
    const lastBar = (bars || [])[bars?.length - 1];
    const spot = Number.isFinite(lastBar?.close) ? lastBar.close : inst.spot;
    if (!(spot > 0)) return null;
    let sigma = fc?.ladder?.sigma_used_pct > 0 ? spot * fc.ladder.sigma_used_pct / 100 : null;
    if (!sigma && inst.expectedMove?.daily > 0) { sigma = +inst.expectedMove.daily; missing.push('forecast σ (implied daily move used)'); }
    if (!sigma) return null;
    const open = done.length ? londonOpen(done, today) : null;
    const legs = [];
    // OI + gamma
    const oi = oiLegs((oiStoreToLevels(inst) || []).filter(l => Number.isFinite(l?.price) && l.price > 0), inst);
    if (!oi.some(l => l.family === 'oi')) missing.push('oi');
    if (!oi.some(l => l.family === 'gamma')) missing.push('gamma');
    legs.push(...oi);
    // forecast + IV-adjusted ladders, anchored at the London-midnight open
    if (fc?.ladder && open > 0) legs.push(...forecastLegs(fc.ladder, open)); else missing.push(fc?.ladder ? 'forecast (no London open yet)' : 'forecast');
    const ivl = fk ? ctx.iv?.[fk] : null;
    if (ivl && open > 0) legs.push(...forecastLegs(ivl, open, 'iv')); else missing.push('iv');
    // desk
    const dk = fk ? ctx.desk?.cards?.[fk] : null;
    const dl = dk?.card ? deskLegs(dk.card) : [];
    if (dl.length) legs.push(...dl); else missing.push(dk ? 'desk (no plan levels)' : 'desk');
    // volume profile
    const vp = done.length ? volumeProfileLevels(done, { spot, sigma, today }) : { npoc: [], hvn: [], lvn: [], reason: 'no bars' };
    const pl = profileLegs(vp);
    if (pl.length) legs.push(...pl); else missing.push('profile');
    const zones = buildSrZones({ spot, sigma, legs });
    // futures basis (futures − spot) when the conversion is a plain shift; inverted (USD/JPY…) and unit-scaled (grains) books get none
    const fut = oiFuturesTermsPrice(spot, inst);
    const basisOk = Number.isFinite(inst.basis) && Number.isFinite(fut) && Math.abs(fut / spot - 1) < 0.05;
    const basis = basisOk ? fut - spot : null;
    let aliases = [...new Set([...tvTickers(name), ...(EXTRA_ALIASES[name] || []), norm(k)])];
    if (!basisOk) aliases = aliases.filter(a => !a.includes('!') && !aliases.includes(`${a}1!`));
    const basisAgeH = Number.isFinite(inst.basisAtMs) ? +((Date.now() - inst.basisAtMs) / 3.6e6).toFixed(1) : null;
    return {
      key: k, name, aliases, spot, sigma, basis, basisAgeH, date: today, digits: priceDigits(k, spot),
      gex: gexContext(inst), cot: cotContext(fk ? ctx.cot?.[fk] : null), desk: dk?.rating || null,
      open, missing, zones, profile: { npoc: vp.npoc, hvn: vp.hvn, lvn: vp.lvn, sessions: vp.sessions, binWidth: vp.binWidth, reason: vp.reason || null },
      oiSavedAt: inst.savedAt || null,
    };
  }

  async function build(pairQ) {
    const forecast = getForecast();
    const store = await loadStore();
    const keys = resolveKeys(store, pairQ);
    if (keys == null) return { error: 400, msg: 'Give ?pair=gold (or nq, XAU/USD, NAS100_USD, a comma list, or all).' };
    if (!keys.length) return { error: 404, msg: `No OI record for ${pairQ}.` };
    const ctx = { forecast };
    ctx.iv = await once(ivCache, async () => { try { return await ivLadders(store); } catch (e) { log.warn?.('[sr-zones] IV ladders:', e.message); return {}; } });
    ctx.cot = await once(cotCache, async () => (await cotForExport().catch(() => null)) || {});
    ctx.desk = await once(deskCache, async () => { try { return await deskCards(); } catch (e) { log.warn?.('[sr-zones] desk:', e.message); return { cards: {} }; } });
    const items = [];
    const one = async k => {
      const c = itemCache.get(k); if (c && Date.now() - c.at < TTL) return c.item;
      const item = await buildItem(k, store[k], ctx);
      if (item) itemCache.set(k, { at: Date.now(), item });
      return item;
    };
    const res = await Promise.race([Promise.all(keys.map(k => one(k).catch(e => { log.warn?.('[sr-zones]', k, e.message); return null; }))), new Promise(r => setTimeout(() => r(null), 45_000))]);
    for (const it of res || keys.map(k => itemCache.get(k)?.item)) if (it) items.push(it);
    if (!items.length) return { error: 404, msg: 'No zones could be built (no spot/σ for the instruments asked for).' };
    const generated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const text = formatExport(items, { generated });
    const parts = text.length > 4000 ? splitParts(text, 4000) : [text];
    return { items, text, parts, generated };
  }

  function mount(app) {
    app.get('/api/sr-zones/export', async (req, res) => {
      try {
        res.set('Cache-Control', 'no-store');
        const r = await build(req.query.pair);
        if (r.error) return res.status(r.error).type('text/plain').send(r.msg);
        res.type('text/plain').send(r.parts.length > 1 ? partsText(r.parts) : r.text);
      } catch (e) { res.status(500).type('text/plain').send(`S/R zones error: ${e.message}`); }
    });
    app.get('/api/sr-zones', async (req, res) => {
      try {
        res.set('Cache-Control', 'no-store');
        const r = await build(req.query.pair || 'all');
        if (r.error) return res.status(r.error).json({ ok: false, error: r.msg });
        res.json({ ok: true, header: SRZ_HEADER, generated: r.generated, nParts: r.parts.length,
          items: r.items.map(it => ({ ...it, notes: { support: it.zones.support.map(z => describeSrZone(z, 'S', it.digits)), resistance: it.zones.resistance.map(z => describeSrZone(z, 'R', it.digits)) } })) });
      } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
    });
  }
  return { mount, build };
}
