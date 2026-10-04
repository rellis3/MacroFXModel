// Surface Lab — nightly rebuild + API (page: surface-lab.html; maths: js/surfaceLabCore.js).
//
// Tick (every 30 min, server.js svcInterval 'surfaceLab'): rebuild when the stored build is older than 12 hours.
// Each field is built independently; a field that fails keeps its previous build and records why.
// Data: OANDA daily candles (27 FX pairs, gold, NAS100), OANDA 15-minute candles (8 instruments, ~300 days),
// FRED constant-maturity Treasury yields (11 tenors) and the broad dollar index. KV `surface_lab_v1`.
// Re-derivable from source, but kept as a permanent key so a deploy or a failed fetch still shows the last build.
import { absorption, persistence, volTime, windowShare, rates, regimeOutcomes, currencyFactors, volClock, volTerm, CCYS, TENORS, PERSIST_Q, TERM_TENORS } from './surfaceLabCore.js';
import { DAILY_READ_KV } from './dailyReadCore.js';

export const SURFACE_KV = 'surface_lab_v1';
const REBUILD_MS = 12 * 3600e3;
export const FX27 = ['AUD_CAD', 'AUD_CHF', 'AUD_JPY', 'AUD_NZD', 'AUD_USD', 'CAD_CHF', 'CAD_JPY', 'CHF_JPY', 'EUR_AUD', 'EUR_CAD', 'EUR_CHF',
  'EUR_GBP', 'EUR_JPY', 'EUR_NZD', 'EUR_USD', 'GBP_AUD', 'GBP_CAD', 'GBP_CHF', 'GBP_JPY', 'GBP_NZD', 'GBP_USD', 'NZD_CAD', 'NZD_JPY',
  'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY'];
// Persistence + vol time: every FX pair, gold and the indices (about 6 OANDA requests each per build).
export const INTRADAY = [...FX27.map(i => [i, i.replace('_', '')]), ['XAU_USD', 'GOLD'], ['NAS100_USD', 'NQ'], ['SPX500_USD', 'SPX'],
  ['US30_USD', 'DOW'], ['US2000_USD', 'US2000'], ['DE30_EUR', 'DAX'], ['UK100_GBP', 'FTSE']];
// Cross-asset absorption: is everything one risk-on/risk-off trade? Members that fail to load are skipped.
export const CROSS = [['EUR_USD', 'EURUSD'], ['GBP_USD', 'GBPUSD'], ['USD_JPY', 'USDJPY'], ['AUD_USD', 'AUDUSD'], ['USD_CAD', 'USDCAD'],
  ['USD_CHF', 'USDCHF'], ['NZD_USD', 'NZDUSD'], ['XAU_USD', 'GOLD'], ['XAG_USD', 'SILVER'], ['WTICO_USD', 'WTI'], ['NAS100_USD', 'NQ'],
  ['SPX500_USD', 'SPX'], ['US30_USD', 'DOW'], ['US2000_USD', 'US2000'], ['DE30_EUR', 'DAX'], ['UK100_GBP', 'FTSE'], ['JP225_USD', 'NIKKEI'],
  ['USB10Y_USD', 'UST10Y']];

const daysAgoISO = n => new Date(Date.now() - n * 864e5).toISOString();
const pctRank = (arr, x) => { const a = arr.filter(Number.isFinite); return a.length ? Math.round(a.filter(v => v <= x).length / a.length * 100) : null; };
const friday = d => { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + ((5 - dt.getUTCDay() + 7) % 7)); return dt.toISOString().slice(0, 10); };
const weeklyLast = m => { const out = new Map(); for (const d of [...m.keys()].sort()) out.set(friday(d), m.get(d)); return out; };

const CBOE_CSV = s => `https://cdn.cboe.com/api/global/us_indices/daily_prices/${s}_History.csv`;
async function cboeSeries(sym, fetchImpl) {
  const r = await fetchImpl(CBOE_CSV(sym), { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`CBOE ${sym} HTTP ${r.status}`);
  const m = new Map();
  for (const line of (await r.text()).split(/\r?\n/).slice(1)) {
    const [d, , , , c] = line.split(','); if (!d || !c) continue;
    const [mm, dd, yy] = d.split('/'); const v = parseFloat(c);
    if (yy && Number.isFinite(v)) m.set(`${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`, v);
  }
  return m;
}

export function createSurfaceLab({ kv, fetchCandles, fetchFred, getSession = async () => null, fetchImpl = fetch, log = console }) {
  let running = false, last = null, memo = null;      // memo: parsed build, so field and summary reads don't re-parse ~2 MB

  async function load() {
    if (memo) return memo;
    const raw = await kv.get(SURFACE_KV); if (!raw) return null; const p = JSON.parse(raw); memo = p.data ?? p; return memo;
  }
  const dailyCloses = async (inst, days) => {
    const bars = await fetchCandles(inst, 'D', daysAgoISO(days), new Date().toISOString());
    return new Map(bars.map(b => [b.datetime.slice(0, 10), +b.close]));
  };

  const summarise = a => {
    const share1 = a.share.map(s => s[0]), now = share1.at(-1);
    const ld = a.loadings.at(-1).map((x, i) => [a.pairs[i], x]).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
    return { date: a.dates.at(-1), pc1: now, pctile: pctRank(share1, now), dollarCorr: a.dollarCorr.at(-1),
      dollar20: Math.round(a.dollarRet.slice(-20).reduce((s, x) => s + x, 0) * 1e4) / 100, top: ld.slice(0, 6) };
  };
  async function buildCross() {
    const closes = {}, skipped = [];
    for (const [inst, sym] of CROSS) { try { closes[sym] = await dailyCloses(inst, 470); } catch (e) { skipped.push(sym); } }
    if (Object.keys(closes).length < 5) throw new Error(`only ${Object.keys(closes).length} markets loaded (skipped: ${skipped.join(', ')})`);
    const a = absorption(closes, { window: 60, keep: 260, comps: 8, anchor: 'NQ' });
    return { ...a, skipped, now: summarise(a) };
  }
  async function buildAbsorption() {
    const closes = {};
    for (const inst of FX27) closes[inst.replace('_', '')] = await dailyCloses(inst, 470);
    const a = absorption(closes, { window: 60, keep: 260, comps: 8 });
    return { ...a, now: summarise(a), currencies: currencyFactors(closes, { window: 60, recent: 20 }) };
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
        // Each horizon judged against its own last year: bottom third = giving back, top third = extending.
        const byHorizon = Object.fromEntries(PERSIST_Q.map((q, h) => {
          const xs = p.vr.map(v => v[h]).filter(Number.isFinite).sort((a, b) => a - b), v = p.vr.at(-1)[h];
          const a = xs[Math.floor(xs.length / 3)], b = xs[Math.floor(2 * xs.length / 3)];
          return [({ 2: '30m', 4: '1h', 8: '2h', 16: '4h', 32: '8h' })[q] ?? q * 15 + 'm', { vr: v, state: v <= a ? 'giving back' : v >= b ? 'extending' : 'middle' }];
        }));
        persist[sym] = { ...p, now: { vr: p.vr.at(-1), vr4h: cur, regime: cur <= lo ? 'reverting' : cur >= hi ? 'trending' : 'middle', edges: [lo, hi], byHorizon } };
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

  async function buildVolTerm() {
    const series = {};
    for (const s of [...TERM_TENORS.map(t => t[0]), 'VXN']) { try { series[s] = await cboeSeries(s, fetchImpl); } catch (e) { if (s === 'VIX') throw e; } }
    return volTerm(series, { keepDays: 780 });
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
      try { out.crossAsset = await buildCross(); } catch (e) { out.errors.crossAsset = String(e.message || e); }
      try { Object.assign(out, await buildIntraday()); } catch (e) { out.errors.intraday = String(e.message || e); }
      try { out.rates = await buildRates(); } catch (e) { out.errors.rates = String(e.message || e); }
      try { out.volTerm = await buildVolTerm(); } catch (e) { out.errors.volTerm = String(e.message || e); }
      out.builtAt = new Date().toISOString(); out.buildMs = Date.now() - t0;
      await kv.put(SURFACE_KV, JSON.stringify(out)); memo = out;
      last = { at: out.builtAt, reason, ok: true, errors: out.errors };
      log.log?.(`[surface-lab] built in ${out.buildMs} ms${Object.keys(out.errors).length ? ' with errors: ' + JSON.stringify(out.errors) : ''}`);
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[surface-lab] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  // The compact read today.html uses (~10 KB): every "now" reading, currency factors, per-currency persistence,
  // the Daily Read's tags for the next/current session, and a live vol clock per instrument.
  async function todayReads() {
    const s = await load(); if (!s) return null;
    let dr = null; try { const raw = await kv.get(DAILY_READ_KV); dr = raw ? (JSON.parse(raw).data ?? JSON.parse(raw)) : null; } catch { /* optional */ }
    const days = Object.keys(dr?.days ?? {}).filter(d => dr.days[d].setup).sort();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const tagDay = days.filter(d => d <= today).at(-1) ?? null, nextDay = days.find(d => d > today) ?? null;
    const tagsOf = d => d ? Object.fromEntries(dr.days[d].setup.rows.map(r => [r.sym, { tag: r.tag, ratio: r.ratio, provisional: !!r.provisional }])) : {};
    const P = s.persistence?.byInst ?? {}, V = s.volTime?.byInst ?? {};
    const pairRead = Object.fromEntries(Object.entries(P).map(([sym, x]) => [sym, { state: x.now.regime === 'reverting' ? 'giving back' : x.now.regime === 'trending' ? 'extending' : 'middle', vr4h: x.now.vr4h, byHorizon: x.now.byHorizon ?? null }]));
    const ccyPersist = Object.fromEntries(CCYS.map(c => { const xs = Object.entries(P).filter(([k]) => /^[A-Z]{6}$/.test(k) && k.includes(c)).map(([, x]) => x.now.vr4h).filter(Number.isFinite);
      return [c, xs.length ? { vr4hMean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 1000) / 1000, pairs: xs.length } : null]; }));
    // live vol clock from the vol forecast's session status (range so far vs the forecast median line)
    let clock = {}; const sess = await getSession().catch(() => null);
    const nowSec = Math.floor(Date.now() / 1000), lt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const slot = (+lt.find(x => x.type === 'hour').value % 24) * 4 + Math.floor(+lt.find(x => x.type === 'minute').value / 15);
    const ALIAS = { SPX: ['SPX', 'SPX500', 'US500'], DOW: ['DOW', 'US30'], DAX: ['DAX', 'DE30', 'GER40'], FTSE: ['FTSE', 'UK100'], NQ: ['NQ', 'NAS100'] };
    for (const [sym, v] of Object.entries(V)) {
      const recent = v.share.slice(-4), prof = Array.from({ length: 96 }, (_, k) => recent.reduce((t, w) => t + (w[k] ?? 0), 0) / recent.length);
      const si = (ALIAS[sym] ?? [sym]).map(n => sess?.instruments?.[n]).find(x => x && !x.error);
      clock[sym] = volClock(prof, slot, si?.hl, si?.forecast?.hl_median);
    }
    const ra = s.rates?.now, cr = s.crossAsset, fx = s.absorption;
    const side = name => { const i = cr?.pairs?.indexOf(name) ?? -1; return i < 0 ? null : (cr.loadings.at(-1)[i] >= 0 ? 'risk-on' : 'risk-off'); };
    return {
      builtAt: s.builtAt, asOfSlot: slot, nowSec,
      global: {
        fxConcentration: fx?.now ?? null,
        crossAsset: cr ? { ...cr.now, sides: Object.fromEntries((cr.pairs ?? []).map(p => [p, side(p)])) } : null,
        rates: ra ? { regime: ra.regime, factors: ra.factors, lastRegimes: ra.lastRegimes, week: ra.week } : null,
        volTerm: s.volTerm?.now ?? null,
        tags: { today: tagDay, next: nextDay, counts: Object.values(tagsOf(nextDay ?? tagDay)).reduce((a, x) => (x.tag && (a[x.tag] = (a[x.tag] ?? 0) + 1), a), {}) },
      },
      currency: { factors: fx?.currencies ?? null, persistence: ccyPersist },
      pair: { tagsToday: tagsOf(tagDay), tagsNext: tagsOf(nextDay), persistence: pairRead, clock,
        pc1Loading: fx ? Object.fromEntries(fx.pairs.map((p, i) => [p, fx.loadings.at(-1)[i]])) : {} },
    };
  }

  function mount(app) {
    // ?field=absorption|crossAsset|persistence|volTime|rates returns one field, so the page loads ~0.2-1 MB, not ~2 MB.
    app.get('/api/surface-lab', async (req, res) => {
      try {
        const s = await load();
        if (!s) return res.json({ ok: false, running, lastTick: last, error: 'No build yet — the first build runs within 30 minutes of a deploy.' });
        const f = req.query.field, meta = { ok: true, builtAt: s.builtAt, buildMs: s.buildMs, errors: s.errors, running, lastTick: last };
        if (!f) return res.json({ ...meta, ...s });
        if (!['absorption', 'crossAsset', 'persistence', 'volTime', 'rates', 'volTerm'].includes(f)) return res.status(400).json({ ok: false, error: `unknown field ${f}` });
        res.json({ ...meta, [f]: s[f] ?? null });
      } catch (e) { res.status(503).json({ ok: false, error: `KV unavailable: ${e.message}` }); }
    });
    app.get('/api/today-reads', async (_req, res) => {
      try { const t = await todayReads(); res.json(t ? { ok: true, ...t } : { ok: false, error: 'Surface Lab has not built yet.' }); }
      catch (e) { res.status(503).json({ ok: false, error: e.message }); }
    });
    app.post('/api/surface-lab/rebuild', (_req, res) => {
      if (running) return res.json({ ok: true, started: false, running: true });
      tick('manual', true).catch(() => {}); res.json({ ok: true, started: true });
    });
  }
  return { tick, mount, todayReads };
}
