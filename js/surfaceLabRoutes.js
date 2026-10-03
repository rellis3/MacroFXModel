// Surface Lab — nightly rebuild + API (page: surface-lab.html; maths: js/surfaceLabCore.js).
//
// Tick (every 30 min, server.js svcInterval 'surfaceLab'): rebuild when the stored build is older than 12 hours.
// Each field is built independently; a field that fails keeps its previous build and records why.
// Data: OANDA daily candles (27 FX pairs, gold, NAS100), OANDA 15-minute candles (8 instruments, ~300 days),
// FRED constant-maturity Treasury yields (11 tenors) and the broad dollar index. KV `surface_lab_v1`.
// Re-derivable from source, so not a permanent key: a missing build after a redeploy is rebuilt on the next tick.
import { absorption, persistence, volTime, windowShare, rates, regimeOutcomes, TENORS, PERSIST_Q } from './surfaceLabCore.js';

export const SURFACE_KV = 'surface_lab_v1';
const REBUILD_MS = 12 * 3600e3;
export const FX27 = ['AUD_CAD', 'AUD_CHF', 'AUD_JPY', 'AUD_NZD', 'AUD_USD', 'CAD_CHF', 'CAD_JPY', 'CHF_JPY', 'EUR_AUD', 'EUR_CAD', 'EUR_CHF',
  'EUR_GBP', 'EUR_JPY', 'EUR_NZD', 'EUR_USD', 'GBP_AUD', 'GBP_CAD', 'GBP_CHF', 'GBP_JPY', 'GBP_NZD', 'GBP_USD', 'NZD_CAD', 'NZD_JPY',
  'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY'];
export const INTRADAY = [['EUR_USD', 'EURUSD'], ['GBP_USD', 'GBPUSD'], ['USD_JPY', 'USDJPY'], ['AUD_USD', 'AUDUSD'],
  ['USD_CAD', 'USDCAD'], ['USD_CHF', 'USDCHF'], ['XAU_USD', 'GOLD'], ['NAS100_USD', 'NQ']];

const daysAgoISO = n => new Date(Date.now() - n * 864e5).toISOString();
const pctRank = (arr, x) => { const a = arr.filter(Number.isFinite); return a.length ? Math.round(a.filter(v => v <= x).length / a.length * 100) : null; };
const friday = d => { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + ((5 - dt.getUTCDay() + 7) % 7)); return dt.toISOString().slice(0, 10); };
const weeklyLast = m => { const out = new Map(); for (const d of [...m.keys()].sort()) out.set(friday(d), m.get(d)); return out; };

export function createSurfaceLab({ kv, fetchCandles, fetchFred, log = console }) {
  let running = false, last = null;

  async function load() { const raw = await kv.get(SURFACE_KV); if (!raw) return null; const p = JSON.parse(raw); return p.data ?? p; }
  const dailyCloses = async (inst, days) => {
    const bars = await fetchCandles(inst, 'D', daysAgoISO(days), new Date().toISOString());
    return new Map(bars.map(b => [b.datetime.slice(0, 10), +b.close]));
  };

  async function buildAbsorption() {
    const closes = {};
    for (const inst of FX27) closes[inst.replace('_', '')] = await dailyCloses(inst, 470);
    const a = absorption(closes, { window: 60, keep: 260, comps: 8 });
    const share1 = a.share.map(s => s[0]), now = share1.at(-1);
    const ld = a.loadings.at(-1).map((x, i) => [a.pairs[i], x]).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
    return { ...a, now: { date: a.dates.at(-1), pc1: now, pctile: pctRank(share1, now), dollarCorr: a.dollarCorr.at(-1),
      dollar20: Math.round(a.dollarRet.slice(-20).reduce((s, x) => s + x, 0) * 1e4) / 100, top: ld.slice(0, 6) } };
  }

  async function buildIntraday() {
    const persist = {}, vt = {}, errors = {};
    for (const [inst, sym] of INTRADAY) {
      try {
        const bars = (await fetchCandles(inst, 'M15', daysAgoISO(420), new Date().toISOString())).map(b => ({ t: b.t, close: +b.close }));
        const p = persistence(bars, { days: 20, keep: 260 });
        const v = volTime(bars, { keepWeeks: 52 });
        const vr4 = p.vr.map(x => x[3]), cur = vr4.at(-1), sorted = vr4.filter(Number.isFinite).sort((a, b) => a - b);
        const lo = sorted[Math.floor(sorted.length / 3)], hi = sorted[Math.floor(2 * sorted.length / 3)];
        persist[sym] = { ...p, now: { vr: p.vr.at(-1), vr4h: cur, regime: cur <= lo ? 'reverting' : cur >= hi ? 'trending' : 'middle', edges: [lo, hi] } };
        const recent = v.share.slice(-4), avg = Array.from({ length: 96 }, (_, s) => recent.reduce((t, w) => t + w[s], 0) / recent.length);
        const yr = Array.from({ length: 96 }, (_, s) => v.share.reduce((t, w) => t + w[s], 0) / v.share.length);
        vt[sym] = { ...v, now: { asia_london_4w: windowShare(avg, 0, 40), asia_london_52w: windowShare(yr, 0, 40), ny_4w: windowShare(avg, 54, 84), ny_52w: windowShare(yr, 54, 84) } };
      } catch (e) { errors[sym] = String(e.message || e); }
    }
    return { persistence: { qs: PERSIST_Q, byInst: persist, errors }, volTime: { byInst: vt, errors } };
  }

  async function buildRates() {
    const from = daysAgoISO(5.5 * 365).slice(0, 10), series = {};
    for (const [id] of TENORS) series[id] = await fetchFred(id, from);
    const R = rates(series, { lag: 4, smooth: 5 });
    const assets = {};
    try { assets['US dollar (broad)'] = weeklyLast(await fetchFred('DTWEXBGS', from)); } catch { /* optional */ }
    for (const [inst, name] of [['NAS100_USD', 'Nasdaq 100'], ['XAU_USD', 'Gold']]) { try { assets[name] = weeklyLast(await dailyCloses(inst, 5.5 * 365)); } catch { /* optional */ } }
    const outcomes = regimeOutcomes(R, assets, { fwd: 4 });
    return { ...R, outcomes, now: { week: R.weeks.at(-1), regime: R.regime.at(-1), factors: R.factors.at(-1), lastRegimes: R.regime.slice(-8) } };
  }

  async function tick(reason = 'scheduled', force = false) {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const prev = await load().catch(() => null);
      if (!force && prev?.builtAt && Date.now() - Date.parse(prev.builtAt) < REBUILD_MS) return { skipped: 'fresh', builtAt: prev.builtAt };
      const out = { ...(prev ?? {}), errors: {} };
      const t0 = Date.now();
      try { out.absorption = await buildAbsorption(); } catch (e) { out.errors.absorption = String(e.message || e); }
      try { Object.assign(out, await buildIntraday()); } catch (e) { out.errors.intraday = String(e.message || e); }
      try { out.rates = await buildRates(); } catch (e) { out.errors.rates = String(e.message || e); }
      out.builtAt = new Date().toISOString(); out.buildMs = Date.now() - t0;
      await kv.put(SURFACE_KV, JSON.stringify(out));
      last = { at: out.builtAt, reason, ok: true, errors: out.errors };
      log.log?.(`[surface-lab] built in ${out.buildMs} ms${Object.keys(out.errors).length ? ' with errors: ' + JSON.stringify(out.errors) : ''}`);
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[surface-lab] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  function mount(app) {
    app.get('/api/surface-lab', async (_req, res) => {
      try { const s = await load(); res.json(s ? { ok: true, ...s, running, lastTick: last } : { ok: false, running, lastTick: last, error: 'No build yet — the first build runs within 30 minutes of a deploy.' }); }
      catch (e) { res.status(503).json({ ok: false, error: `KV unavailable: ${e.message}` }); }
    });
    app.post('/api/surface-lab/rebuild', (_req, res) => {
      if (running) return res.json({ ok: true, started: false, running: true });
      tick('manual', true).catch(() => {}); res.json({ ok: true, started: true });
    });
  }
  return { tick, mount };
}
