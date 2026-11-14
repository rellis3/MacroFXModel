/**
 * Routes behind the Desk Terminal boards from the paper-ideas pass (2026-11-14). Four small DATA routes (new free feeds) and three BOARD routes
 * (one per Macro section the boards sit in, so each section loads its own feed when opened). Everything is read-only, cached in memory, and falls
 * back to the last good copy if a rebuild fails; nothing here calls a paid feed, a model or a backtest. The shaping is in js/paperBoardsCore.js.
 *
 *   GET /api/jgb-curve               JGB 2/10/20/30/40y (Japan MoF file the global-yields feed already reads) + the shock card
 *   GET /api/fomc-event-times        statement and press-conference times per FOMC meeting (standard 14:00 / 14:30 ET schedule)
 *   GET /api/policy-uncertainty      EPU (US daily + monthly, global) and the trade-policy EPU category, from FRED
 *   GET /api/treasury-auction-results  TreasuryDirect notes and bonds: high yield, bid-to-cover, who took it, change vs the previous same-term auction
 *   GET /api/policy-extra | /api/rates-extra | /api/markets-extra   the boards' own feeds
 */
import * as C from './paperBoardsCore.js';
import { FOMC_MEETINGS } from './fomcCalendar.js';
import { zonedEpoch } from './yieldLegs.js';
import { computeBands, volSigmaSeries } from './forecastCore.js';
import { INSTRUMENTS as BT_INSTRUMENTS, fetchD1 } from './volBacktestEngine.js';

const MOF = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
const TD = 'https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MacroFXModel/1.0)' };
const text = async (url, ms = 45_000) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`); return r.text(); };

/** The series the connectedness board uses, by chapters key: how a daily move is measured (log return or level difference). */
export const CONNECT_SERIES = { EURUSD: ['eurusd', 'ret'], USDJPY: ['usdjpy', 'ret'], AUDUSD: ['audusd', 'ret'], USDCAD: ['usdcad', 'ret'], GOLD: ['gold', 'ret'], OIL: ['oil', 'ret'], COPPER: ['copper', 'ret'], SPX: ['spx', 'ret'], US10Y: ['us10y', 'diff'], VIX: ['vix', 'ret'], HY: ['hy', 'diff'], BTC: ['btc', 'ret'] };
export const COUPLING = [{ ccy: 'AUD', fx: 'audusd', com: 'copper', comLabel: 'copper', sign: 1 }, { ccy: 'NZD', fx: 'nzdusd', com: 'copper', comLabel: 'copper', sign: 1 }, { ccy: 'CAD', fx: 'usdcad', com: 'oil', comLabel: 'oil', sign: -1 }];

export function mountPaperBoards(app, d) {
  const cache = new Map();
  const memo = async (key, hours, build) => {
    const c = cache.get(key); if (c && Date.now() - c.at < hours * 3600e3) return c.data;
    try { const data = await build(); cache.set(key, { at: Date.now(), data }); return data; }
    catch (e) { if (c) return { ...c.data, warning: e.message }; throw e; }
  };
  const route = (path, key, hours, build) => app.get(path, async (_q, res) => { try { res.set('Cache-Control', 'no-store'); res.json(await memo(key, hours, build)); } catch (e) { res.status(502).json({ ok: false, error: e.message }); } });
  const self = async p => { try { return await d.selfJson(p); } catch { return null; } };

  // ── data feeds ──────────────────────────────────────────────────────────────────────────────────────────────
  const jgb = async () => {
    const cur = await text(MOF + 'jgbcme.csv'), all = await text(MOF + 'historical/jgbcme_all.csv', 60_000).catch(() => '');
    const merged = new Map([...C.parseMofCurve(all), ...C.parseMofCurve(cur)].map(r => [r.date, r])), rows = [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    return { ok: true, at: new Date().toISOString(), source: 'Japan Ministry of Finance, JGB interest rates (jgbcme)', fileTenors: C.mofTenors(cur), asOf: rows.at(-1)?.date ?? null, n: rows.length, rows: rows.slice(-400), shock: C.jgbShock(rows) };
  };
  route('/api/jgb-curve', 'jgb', 6, jgb);

  route('/api/fomc-event-times', 'fomctimes', 12, async () => ({ ok: true, at: new Date().toISOString(), ...C.fomcEventTimes(FOMC_MEETINGS, Date.now(), zonedEpoch),
    // the statement-window vs press-conference-window range share is a study in progress: nothing is shown until a verdict is banked and this flag is set by hand
    rangeShare: { available: false, verdict: null, note: 'The range share by window is being measured; no number is shown until the result is banked.' },
    note: 'Times follow the standard schedule (statement 14:00 ET, press conference 14:30 ET). A schedule, not a forecast.' }));

  const EPU = [{ id: 'USEPUINDXD', label: 'US economic policy uncertainty (daily news index)', freq: 'daily' }, { id: 'USEPUINDXM', label: 'US economic policy uncertainty (monthly)', freq: 'monthly' }, { id: 'GEPUCURRENT', label: 'Global economic policy uncertainty (monthly)', freq: 'monthly' }, { id: 'EPUTRADE', label: 'Trade-policy uncertainty (EPU category, monthly)', freq: 'monthly' }];
  route('/api/policy-uncertainty', 'epu', 6, async () => {
    const errors = {}, series = [];
    for (const s of EPU) { try { series.push({ ...s, pts: await d.fredCsv(s.id) }); } catch (e) { errors[s.id] = e.message; } }
    const rows = C.policyUncertainty(series);
    return { ok: rows.some(r => r.ok), at: new Date().toISOString(), source: 'FRED (policyuncertainty.com, Baker, Bloom and Davis)', rows, errors };
  });

  route('/api/treasury-auction-results', 'auctres', 1, async () => {
    const got = await Promise.all(['Note', 'Bond'].map(t => text(`${TD}&type=${t}&days=400&pagesize=400`).then(JSON.parse).catch(e => ({ error: e.message }))));
    const raw = got.flatMap(g => (Array.isArray(g) ? g : [])); if (!raw.length) throw new Error(got.map(g => g?.error).filter(Boolean).join('; ') || 'no auction rows');
    return { ok: true, at: new Date().toISOString(), source: 'TreasuryDirect auction results', rows: C.auctionResults(raw, { limit: 16 }),
      note: 'High yield, bid-to-cover and the share taken by each bidder group. A tail needs the when-issued yield at the bid deadline, which TreasuryDirect does not publish, so no tail is shown.' };
  });

  // ── board feeds ─────────────────────────────────────────────────────────────────────────────────────────────
  route('/api/policy-extra', 'policyextra', 0.5, async () => {
    const [cb, fomc] = await Promise.all([self('/api/cb-expectations'), self('/api/fomc-event-times')]);
    return { ok: true, at: new Date().toISOString(), fomc, pathDiff: cb?.ok ? C.pathDifferential(cb) : null, errors: { cb: cb ? null : 'cb-expectations unavailable' } };
  });

  route('/api/rates-extra', 'ratesextra', 1, async () => {
    const [jg, ch, fiscal, upcoming, results] = await Promise.all([self('/api/jgb-curve'), self('/api/chapters'), self('/api/fiscal/events'), self('/api/treasury-auctions'), self('/api/treasury-auction-results')]);
    return { ok: true, at: new Date().toISOString(),
      jgb: jg?.ok ? { shock: jg.shock, fileTenors: jg.fileTenors, asOf: jg.asOf, curve: (jg.rows ?? []).slice(-1).map(r => r)[0] ?? null } : null,
      inflation: ch?.series ? C.inflationBoard(ch.series) : null,
      fiscal: (fiscal?.events ?? []).map(e => ({ id: e.id, country: e.country, ccy: e.ccy, kind: e.kind, title: e.title, date: e.date, status: e.status, headline: e.analysis?.headline ?? null, rows: (e.rows ?? []).slice(0, 4) })),
      upcoming: (upcoming?.rows ?? []).filter(r => r.type !== 'Bill').slice(0, 10), auctionResults: results?.ok ? results.rows : null,
      errors: { jgb: jg?.ok ? null : 'jgb-curve unavailable', chapters: ch?.series ? null : 'chapters unavailable', auctions: results?.ok ? null : 'auction results unavailable' } };
  });

  route('/api/markets-extra', 'marketsextra', 4, async () => {
    const [ch, epu, tb, oi] = await Promise.all([self('/api/chapters'), self('/api/policy-uncertainty'), self('/api/trend-basket'), self('/api/oi-store')]);
    const S = ch?.series ?? {}, errors = {};
    const connected = (() => { try { return C.connectedness(Object.fromEntries(Object.entries(CONNECT_SERIES).map(([n, [k, kind]]) => [n, { kind, pts: S[k] ?? [] }]))); } catch (e) { errors.connected = e.message; return null; } })();
    const coupling = (() => { try { return C.couplingRing(COUPLING.map(c => ({ ...c, fx: S[c.fx] ?? [], com: S[c.com] ?? [] }))); } catch (e) { errors.coupling = e.message; return null; } })();
    let coverage = null;
    try {
      if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not configured');
      const st = C.stressDates(S.vix ?? [], 0.8), hits = {};
      for (let i = 0; i < BT_INSTRUMENTS.length; i += 4) await Promise.all(BT_INSTRUMENTS.slice(i, i + 4).map(async inst => {
        try { const bars = (await fetchD1(inst.oanda, 900)).sort((a, b) => (a.date < b.date ? -1 : 1)); if (bars.length >= 200) hits[inst.name] = C.dailyHits(bars, inst.assetClass, { computeBands, volSigmaSeries }); } catch (e) { errors['cov ' + inst.name] = e.message; }
      }));
      if (Object.keys(hits).length) coverage = { ...C.coverageByState(hits, st.set), stressRule: `the previous day's VIX close at or above ${st.threshold} (its own 80th percentile over five years)`, asOf: Object.values(hits)[0].at(-1)?.date ?? null };
    } catch (e) { errors.coverage = e.message; }
    return { ok: true, at: new Date().toISOString(), connected, coupling, coverage, uncertainty: epu?.ok ? epu.rows : null,
      stress: await self('/api/world-stress').then(w => w ? { overall: w.overall ?? w.state ?? null } : null), gpr: await self('/api/gpr').then(g => (g?.ok ? { level: g.level, z: g.z, trend: g.trend, asOf: g.asOfDate } : null)),
      skew: C.skewHistory(S.skew ?? []), trend: C.trendBasket(tb), walls: oi?.data ? C.oiWallDistance(oi.data) : null, chaptersAsOf: ch?.to ?? null, errors };
  });
  /** For /api/data-health: the date each feed's own data runs to (not when we built it, so a quiet server never reads as a dead feed). null = not built since boot. */
  const get = k => cache.get(k)?.data ?? null;
  const status = () => ({
    jgb: get('jgb')?.asOf ?? null,
    fomc: get('fomctimes')?.next ? new Date().toISOString() : (get('fomctimes') ? 0 : null),
    epu: get('epu')?.rows?.find(r => r.ok && r.freq === 'daily')?.asOf ?? get('epu')?.rows?.find(r => r.ok)?.asOf ?? null,
    auctions: get('auctres')?.rows?.[0]?.date ?? null,
    errors: { epu: get('epu')?.errors ?? null },
  });
  return { status };
}
