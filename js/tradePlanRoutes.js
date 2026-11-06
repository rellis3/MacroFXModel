// Trade-plan shadow — forward job + API (rule: js/tradePlanCore.js; prereg: forge/TRADE_PLAN_SHADOW_PREREG.md).
//
// DISPLAY ONLY. No orders, no bots, no alerts. Reads the direction ledger / Global Read (direction layer), the live
// ladder in KV and /api/stress-shadow (vol layer), and OANDA M1 mid bars (entry open and outcome). Never edits any of them.
//
// Tick (every 10 min, server.js svcInterval 'tradePlan'):
//   1. 22:15-23:59 London: snapshot the pre-open direction scores for the next London session from the Global Read
//      (R2 forward/trade_plan/pre/<D>.json, the latest one before the open wins).
//   2. From 00:00 London on a weekday D >= RULE.start: write the session's plan once (forward/trade_plan/<D>.json).
//      Every input is fixed before the open; a late write (restart) changes nothing but written_at. Never overwritten.
//   3. After 21:55 London: score both sides of every row on the session's M1 bars once (forward/trade_plan/out/<D>.json).
//   A session the job missed stays a gap; plans are never back-filled.
//
//   GET /api/trade-plan[?history=1]   today's plan (from the record, or a labelled preview), vol state, record summary
import { RULE, decisionOf, coinSide, b0Side, buildPlans, scoreSide, summarise } from './tradePlanCore.js';
import { marketScore } from './directionScore.js';
import { costForPair } from './perLineStrategy.js';
import { oandaCandles, londonDate, midnightOf } from './volStateRoutes.js';

const PREFIX = 'forward/trade_plan/';
const DL_PREFIX = 'forward/direction_ledger/';
const GR_MAX_AGE_MS = 3 * 3600e3;
const parse = raw => { if (!raw) return null; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p; };
const londonMin = (ms = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return (+p.hour % 24) * 60 + +p.minute;
};
const isWeekday = date => ![0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());
const nextWeekday = date => { const d = new Date(date + 'T12:00:00Z'); do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); };
const prevWeekday = date => { const d = new Date(date + 'T12:00:00Z'); do d.setUTCDate(d.getUTCDate() - 1); while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); };
const endSecOf = date => midnightOf(date) + RULE.exitMinLondon * 60;
const assetClass = sym => (sym === 'GOLD' ? 'commodity' : ['NQ', 'SPX500'].includes(sym) ? 'index' : 'fx');

function scoresFromGr(gr) {
  const out = {};
  for (const sym of RULE.markets) {
    const s = marketScore(sym, gr?.cards?.[sym]);
    if (s) out[sym] = { score: s.score, band: s.band, strength: s.strength, u: s.u, live: s.live };
  }
  return out;
}

export function createTradePlan({ store, kv, volState = null, getGr = () => null, fetchLocal = async () => null, fetchImpl = fetch, log = console }) {
  const fileCache = new Map();     // immutable plan / outcome files
  const written = new Set();
  let last = null, running = false, histCache = null, histAt = 0;

  const getFile = async key => {
    if (fileCache.has(key)) return fileCache.get(key);
    const v = await store.getJSON(key).catch(() => null);
    if (v) fileCache.set(key, v);
    return v;
  };

  // true / false, or null when R2 could not be read (then nothing is written: a failed read must never become an overwrite)
  const exists = async key => { try { return !!(await store.getJSON(key)); } catch { return null; } };

  /** The direction layer for session D: ledger record if issued before the open, else the pre-open snapshot, else none. */
  async function directionFor(D, { preview = false } = {}) {
    const cut = midnightOf(D) * 1000, close = prevWeekday(D);
    const rec = await getFile(`${DL_PREFIX}${close}.json`);
    const pre = await store.getJSON(`${PREFIX}pre/${D}.json`).catch(() => null);
    const out = {};
    for (const sym of RULE.markets) {
      const f = rec?.forecasts?.find(x => x.model_id === 'direction-score' && x.inst === RULE.ledgerKey[sym] && x.h === 1);
      if (f && Date.parse(rec.issued_at) <= cut) {
        out[sym] = { score: f.inputs?.score ?? null, band: f.inputs?.band ?? null, strength: f.inputs?.strength ?? '', u: f.inputs?.u ?? null,
                     source: `direction ledger ${close} (issued ${rec.issued_at})`, asOf: close };
      } else if (pre?.scores?.[sym]) {
        out[sym] = { ...pre.scores[sym], source: `pre-open Global Read snapshot (read ${pre.gr_asOf}, taken ${pre.taken_at})`, asOf: pre.gr_asOf };
      } else if (preview) {
        const g = getGr(), s = g?.cards ? scoresFromGr(g)[sym] : null;
        out[sym] = s ? { ...s, source: `PREVIEW ONLY: live Global Read now (${g.meta?.asOf ?? '?'}), not the frozen pre-open source`, asOf: g.meta?.asOf ?? null, previewOnly: true }
                     : { score: null, source: null, reason: 'no direction score available' };
      } else {
        out[sym] = { score: null, source: null, reason: rec && f ? `ledger record for ${close} issued after the London open and no pre-open snapshot` : 'no direction score before the London open' };
      }
    }
    return out;
  }

  /** Build the six rows for session D. Returns { rows, missing } (missing = why the plan cannot be written yet). */
  async function buildRows(D, { preview = false } = {}) {
    let fc = parse(await kv.get(`vol_forecast_${D}`).catch(() => null));
    if (!fc?.instruments) { const l = parse(await kv.get('vol_forecast_latest').catch(() => null)); if (l?.session_date === D) fc = l; }
    if (!fc?.instruments) return { rows: null, missing: `no vol forecast for ${D}` };
    const stress = await fetchLocal('/api/stress-shadow').catch(() => null);
    const stressBy = stress?.sessionDate === D ? Object.fromEntries((stress.today ?? []).map(x => [x.sym, x.factor])) : {};
    const dir = await directionFor(D, { preview });
    const cut = midnightOf(D);
    const rows = [];
    for (const sym of RULE.markets) {
      const fi = fc.instruments[sym], d = dir[sym];
      const row = { sym, date: D, score: d.score, band: d.band ?? null, strength: d.strength ?? '', u: d.u ?? null, direction_source: d.source, direction_asOf: d.asOf ?? null,
                    direction_reason: d.reason ?? null, previewOnly: !!d.previewOnly, decision: decisionOf(d.score), coin: coinSide(D, sym), b0: b0Side(sym),
                    forecast_session: fc.session_date, forecast_computed_at: fc.computed_at, cost_pct: costForPair(RULE.costKey[sym], assetClass(sym)) };
      try {
        if (!fi?.ladder_flat || !fi?.ladder) throw new Error('no daily ladder for this instrument');
        if (fi.stale) row.forecast_stale = fi.carried_from ?? true;
        const bars = await oandaCandles(RULE.oanda[sym], `granularity=M1&from=${encodeURIComponent(new Date(cut * 1000).toISOString())}&count=3`, fetchImpl);
        const first = bars.find(b => b.t >= cut);
        if (!first) throw new Error('no M1 bar at or after the London open yet');
        const plans = buildPlans({ open: first.o, flat: fi.ladder_flat, sigmaPct: fi.ladder.sigma_used_pct, stressFactor: Number.isFinite(stressBy[sym]) ? stressBy[sym] : null });
        if (!plans) throw new Error('ladder is missing a p75/p90 rung');
        Object.assign(row, { open: first.o, open_time: new Date(first.t * 1000).toISOString(), sigmaPct: plans.sigmaPct, lines: plans.lines, stressFactor: plans.stressFactor,
                             used: plans.used, LONG: plans.LONG, SHORT: plans.SHORT });
      } catch (e) { row.skipped = String(e.message || e); }
      rows.push(row);
    }
    return { rows, missing: null };
  }

  async function snapshotPre(now) {
    const D = nextWeekday(londonDate(now));
    const g = getGr(), age = g?.meta?.asOf ? now - Date.parse(g.meta.asOf) : Infinity;
    if (!g?.cards || age > GR_MAX_AGE_MS) return `pre-open snapshot skipped: Global Read ${g?.cards ? 'stale' : 'not built'}`;
    if (Date.parse(g.meta.asOf) >= midnightOf(D) * 1000) return 'pre-open snapshot skipped: read is after the open';
    await store.putJSON(`${PREFIX}pre/${D}.json`, { v: 1, session: D, taken_at: new Date(now).toISOString(), gr_asOf: g.meta.asOf, scores: scoresFromGr(g) });
    return `pre-open snapshot for ${D}`;
  }

  async function writePlan(D) {
    const key = `${PREFIX}${D}.json`;
    if (written.has(key)) return null;
    const have = await exists(key);
    if (have === null) return `plan for ${D}: R2 read failed, not writing (write-once)`;
    if (have) { written.add(key); return null; }
    const { rows, missing } = await buildRows(D);
    if (!rows) return `plan for ${D} waiting: ${missing}`;
    if (rows.every(r => r.skipped)) return `plan for ${D} waiting: ${rows[0].skipped}`;
    await store.putJSON(key, { v: 1, rule: RULE.version, prereg: 'forge/TRADE_PLAN_SHADOW_PREREG.md', session: D, written_at: new Date().toISOString(),
                               code: process.env.RAILWAY_GIT_COMMIT_SHA || null, rows });
    written.add(key);
    return `plan written for ${D}`;
  }

  async function scoreOutcome(D) {
    const ok = `${PREFIX}out/${D}.json`;
    if (written.has(ok)) return null;
    const have = await exists(ok);
    if (have === null) return `outcome for ${D}: R2 read failed, not writing (write-once)`;
    if (have) { written.add(ok); return null; }
    const plan = await getFile(`${PREFIX}${D}.json`);
    if (!plan) return null;
    const cut = midnightOf(D), end = endSecOf(D), rows = {};
    for (const r of plan.rows) {
      if (r.skipped) { rows[r.sym] = { skipped: r.skipped }; continue; }
      try {
        const bars = (await oandaCandles(RULE.oanda[r.sym], `granularity=M1&from=${encodeURIComponent(new Date(cut * 1000).toISOString())}&to=${encodeURIComponent(new Date(end * 1000).toISOString())}`, fetchImpl))
          .filter(b => b.t >= cut && b.t < end);
        if (!bars.length) throw new Error('no M1 bars for the session');
        rows[r.sym] = { LONG: scoreSide(r.LONG, r.open, bars, end, r.cost_pct), SHORT: scoreSide(r.SHORT, r.open, bars, end, r.cost_pct), bars: bars.length,
                        firstBar: new Date(bars[0].t * 1000).toISOString(), lastBar: new Date(bars.at(-1).t * 1000).toISOString() };
      } catch (e) { rows[r.sym] = { error: String(e.message || e) }; }
    }
    if (Object.values(rows).some(x => x.error)) return `outcome for ${D} waiting: ${Object.entries(rows).filter(([, x]) => x.error).map(([k, x]) => `${k} ${x.error}`).join('; ')}`;
    await store.putJSON(ok, { v: 1, session: D, scored_at: new Date().toISOString(), rows });
    written.add(ok);
    return `outcome scored for ${D}`;
  }

  async function tick(reason = 'scheduled') {
    if (running || !store.ok()) return { skipped: running ? 'already running' : 'R2 not configured' };
    running = true;
    const notes = [];
    try {
      const now = Date.now(), D = londonDate(now), min = londonMin(now);
      if (min >= 22 * 60 + 15) notes.push(await snapshotPre(now));
      if (isWeekday(D) && D >= RULE.start && min < RULE.exitMinLondon) notes.push(await writePlan(D));
      const keys = (await store.listKeys(PREFIX)).filter(k => /trade_plan\/\d{4}-\d{2}-\d{2}\.json$/.test(k)).sort().slice(-10);
      for (const k of keys) {
        const d = k.match(/(\d{4}-\d{2}-\d{2})\.json$/)[1];
        if (d < D || (d === D && min >= RULE.exitMinLondon + 5)) notes.push(await scoreOutcome(d));
      }
      last = { at: new Date().toISOString(), reason, ok: true, notes: notes.filter(Boolean) };
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e), notes: notes.filter(Boolean) };
      log.warn?.(`[trade-plan] tick failed: ${last.error}`);
    } finally { running = false; }
    return last;
  }

  async function history() {
    if (histCache && Date.now() - histAt < 10 * 60e3) return histCache;
    const keys = (await store.listKeys(PREFIX)).sort();
    const plans = keys.filter(k => /trade_plan\/\d{4}-\d{2}-\d{2}\.json$/.test(k));
    const rows = [], table = [];
    for (const k of plans.slice(-800)) {
      const d = k.match(/(\d{4}-\d{2}-\d{2})\.json$/)[1];
      const plan = await getFile(k); if (!plan) continue;
      const out = keys.includes(`${PREFIX}out/${d}.json`) ? await getFile(`${PREFIX}out/${d}.json`) : null;
      for (const r of plan.rows) {
        const o = out?.rows?.[r.sym];
        const row = { date: d, sym: r.sym, score: r.score, decision: r.decision, coin: r.coin, b0: r.b0, lines: r.lines ?? null, skipped: r.skipped ?? null,
                      out: o && o.LONG && o.SHORT ? { LONG: o.LONG, SHORT: o.SHORT } : null };
        table.push(row);
        if (row.out) rows.push(row);
      }
    }
    histCache = { sessions: plans.length, first: plans[0]?.match(/(\d{4}-\d{2}-\d{2})/)[1] ?? null, last: plans.at(-1)?.match(/(\d{4}-\d{2}-\d{2})/)[1] ?? null,
                  summary: summarise(rows, londonDate()), recent: table.slice(-120).reverse() };
    histAt = Date.now();
    return histCache;
  }

  function mount(app) {
    app.get('/api/trade-plan', async (req, res) => {
      try {
        const D = londonDate();
        let today = null;
        if (store.ok() && isWeekday(D)) {
          const rec = await store.getJSON(`${PREFIX}${D}.json`).catch(() => null);
          if (rec) today = { ...rec, inRecord: true };
        }
        if (!today && isWeekday(D)) {
          const { rows, missing } = await buildRows(D, { preview: true });
          today = { session: D, inRecord: false, preview: true, rows, missing,
                    note: D < RULE.start ? `Preview: the forward record starts ${RULE.start}; this plan is computed now and not recorded.` : 'Preview: not yet written to the record (it is written once after 00:00 London).' };
        }
        let vol = null;
        try { vol = volState ? await volState.get() : null; } catch (e) { vol = { error: e.message }; }
        const volSix = vol?.vectors ? Object.fromEntries(RULE.markets.map(s => [s, vol.vectors[s] ?? null])) : null;
        res.set('Cache-Control', 'no-store');
        res.json({ rule: RULE, prereg: 'forge/TRADE_PLAN_SHADOW_PREREG.md', londonDate: D, today, volState: vol?.vectors ? { sessionDate: vol.sessionDate, builtAt: vol.builtAt, vectors: volSix } : vol,
                   history: req.query.history === '1' && store.ok() ? await history() : (store.ok() ? 'add ?history=1' : 'R2 not configured'), lastTick: last,
                   label: 'Display only. Not a trading signal; no bot reads this. R multiples, no money.' });
      } catch (e) { res.status(503).json({ error: `trade-plan unavailable: ${e.message}` }); }
    });
    app.post('/api/trade-plan/tick', async (_req, res) => res.json(await tick('manual')));
  }
  return { mount, tick, buildRows, history };
}
