// S3 shadow — level scenarios (reach / which-first / time): live logger + read-only API (forge/LEVEL_SCENARIO_SHADOW_PREREG.md).
//
// Tick (server.js svcInterval 'levelScenarioShadow', every 5 min):
//   * At each London checkpoint 03/07/10/13/16 (weekdays), during h:00-h:15, once: fetch each instrument's M1 since London
//     midnight (OANDA), build the Phase 2 level set (forecast ladder, today's open, Asia/London refs, structural confluence
//     levels from KV range_line_confluence) and write ONE write-once R2 object shadow/reach_v1/<date>/<HH>.json with every
//     eligible level's frozen-model reach probabilities and the nearest-above/below race.
//   * From 22:10 London, once per day: write shadow/reach_v1/<date>/outcomes.json — first-touch minute of every logged level
//     and each race's result, from the same M1 source.
// Write-once: an existing object is never overwritten. Nothing live (page, bot, plan) reads these objects except the API below.
import { scenarios, buildLevels, END_MIN } from './levelReach.js';
import { REACH_MODEL_VERSION, REACH_PARAMS } from './levelReachParams.js';

export const REACH_PREFIX = 'shadow/reach_v1';
export const REACH_INSTRUMENTS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP',
  'AUDJPY', 'CADJPY', 'NZDJPY', 'EURAUD', 'EURCHF', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'];
const CPS = REACH_PARAMS.hours_fitted;                                       // 3, 7, 10, 13, 16

const london = (ms = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, hour: +p.hour % 24 };
};
const londonMidnightSec = date => { const g = Date.UTC(...date.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 1000; return g - (london(g * 1000).min === 60 ? 3600 : 0); };
const isWeekday = date => ![0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());
const hh = h => String(h).padStart(2, '0');

// Pure: first-touch minute (after the checkpoint, before 22:00) of each level, and the race result. Exported for tests.
export function scoreOutcomes(bars, cpSec, end22Sec, levels, race) {
  const after = bars.filter(b => b.t >= cpSec && b.t < end22Sec);
  const touch = (price, up) => { const b = after.find(x => (up ? x.high >= price : x.low <= price)); return b ? Math.round((b.t - cpSec) / 60) : null; };
  const lv = levels.map(l => ({ price: l.price, t_min: touch(l.price, l.side === 'above') }));
  let res = null;
  if (race) {
    const a = touch(race.up, true), b = touch(race.down, false);
    res = a == null && b == null ? 'neither' : a === b ? 'amb' : b == null || (a != null && a < b) ? 'up' : 'down';
  }
  return { levels: lv, race: res };
}

/**
 * deps: getJSON(key), putJSON(key,obj) (R2); fetchM1(oandaInstrument, fromISO, toISO) -> [{t, open, high, low, close}] (completed bars);
 *       getForecast() -> forecastState.latest; getConfluence() -> range_line_confluence artifact; instruments: [{name, oandaInstrument}].
 */
export function createLevelScenarioShadow({ getJSON, putJSON, fetchM1, getForecast, getConfluence, instruments, codeCommit = null, log = console, now = () => Date.now() }) {
  let running = false, last = null;
  const cfg = Object.fromEntries(instruments.filter(i => REACH_INSTRUMENTS.includes(i.name)).map(i => [i.name, i]));

  async function barsSinceMidnight(name, date, untilMs) {
    const mid = londonMidnightSec(date);
    const raw = await fetchM1(cfg[name].oandaInstrument, new Date(mid * 1000).toISOString(), new Date(untilMs).toISOString());
    return raw.map(b => ({ t: b.t, open: +b.open, high: +b.high, low: +b.low, close: +b.close })).filter(b => b.t >= mid).sort((a, b) => a.t - b.t);
  }

  async function writeCheckpoint(date, h) {
    const key = `${REACH_PREFIX}/${date}/${hh(h)}.json`;
    if (await getJSON(key)) return { key, skipped: 'exists' };
    const fc = getForecast();
    const conf = await getConfluence().catch(() => null);
    const mid = londonMidnightSec(date), cpSec = mid + h * 3600;
    const rec = { model_version: REACH_MODEL_VERSION, code_commit: codeCommit, created_utc: new Date(now()).toISOString(), session_date: date,
                  checkpoint_london: `${hh(h)}:00`, forecast: fc ? { session_date: fc.session_date, computed_at: fc.computed_at } : null,
                  confluence_generated: conf?.generatedAt ?? null, instruments: {} };
    for (const name of Object.keys(cfg)) {
      const r = { ok: false };
      try {
        const f = fc?.session_date === date ? fc.instruments?.[name] : null;
        const sig = f?.ladder?.sigma_daily_pct;
        if (!(sig > 0)) { r.why = fc?.session_date !== date ? 'forecast is not for this session' : 'no σ'; rec.instruments[name] = r; continue; }
        const bars = (await barsSinceMidnight(name, date, cpSec * 1000)).filter(b => b.t < cpSec);
        if (!bars.length) { r.why = 'no bars since London midnight'; rec.instruments[name] = r; continue; }
        const hourOf = b => (b.t - mid) / 3600;
        const ci = conf?.instruments?.[name.toLowerCase()];
        const open = bars[0].open, P0 = bars.at(-1).close;
        const levels = buildLevels({ open, bars, hourOf, nowHour: h, ladderFlat: f.ladder_flat, confLevels: ci?.levels });
        const sc = scenarios({ sym: name, open, price: P0, high: Math.max(...bars.map(b => b.high)), low: Math.min(...bars.map(b => b.low)), sigmaDailyPct: sig, londonMin: h * 60 }, levels);
        if (!sc.ok) { r.why = sc.why; rec.instruments[name] = r; continue; }
        const el = sc.levels.filter(l => l.eligible);
        Object.assign(r, { ok: true, open, P0, last_bar_time: bars.at(-1).t, input_age_s: cpSec - bars.at(-1).t, sigma_daily_pct: sig, used: sc.used, D: sc.D, h: sc.h,
          confluence_date: ci?.date ?? null, n_levels: sc.levels.length, n_eligible: el.length,
          levels: el.map(l => ({ price: l.price, family: l.family, label: l.label, dist: +l.dist.toFixed(4), side: l.side, p: Object.fromEntries(Object.entries(l.p).map(([k, v]) => [k, +v.toFixed(5)])), geo: Object.fromEntries(Object.entries(l.geo).map(([k, v]) => [k, +v.toFixed(5)])) })),
          race: sc.race });
      } catch (e) { r.ok = false; r.why = String(e.message || e).slice(0, 200); }
      rec.instruments[name] = r;
    }
    rec.n_ok = Object.values(rec.instruments).filter(x => x.ok).length;
    if (await getJSON(key)) return { key, skipped: 'exists (race)' };
    await putJSON(key, rec);
    return { key, n_ok: rec.n_ok };
  }

  async function writeOutcomes(date) {
    const key = `${REACH_PREFIX}/${date}/outcomes.json`;
    if (await getJSON(key)) return { key, skipped: 'exists' };
    const mid = londonMidnightSec(date), end22 = mid + END_MIN * 60;
    const cps = {};
    for (const h of CPS) { const o = await getJSON(`${REACH_PREFIX}/${date}/${hh(h)}.json`); if (o) cps[h] = o; }
    if (!Object.keys(cps).length) return { key, skipped: 'no checkpoints logged' };
    const out = { model_version: REACH_MODEL_VERSION, created_utc: new Date(now()).toISOString(), session_date: date, checkpoints: {} };
    const names = new Set(Object.values(cps).flatMap(c => Object.entries(c.instruments ?? {}).filter(([, r]) => r.ok).map(([n]) => n)));
    for (const name of names) {
      try {
        const bars = await barsSinceMidnight(name, date, end22 * 1000);
        for (const [h, c] of Object.entries(cps)) {
          const r = c.instruments?.[name];
          if (!r?.ok) continue;
          (out.checkpoints[hh(h)] ??= {})[name] = scoreOutcomes(bars, mid + h * 3600, end22, r.levels, r.race);
        }
      } catch (e) { (out.errors ??= {})[name] = String(e.message || e).slice(0, 200); }
    }
    await putJSON(key, out);
    return { key, n: names.size };
  }

  async function tick(reason = 'scheduled') {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const t = london(now()), done = [];
      if (isWeekday(t.date)) {
        const h = Math.floor(t.min / 60);
        if (CPS.includes(h) && t.min - h * 60 <= 15) done.push(await writeCheckpoint(t.date, h));
        if (t.min >= END_MIN + 10) done.push(await writeOutcomes(t.date));
      }
      last = { at: new Date(now()).toISOString(), reason, ok: true, done };
      return last;
    } catch (e) {
      last = { at: new Date(now()).toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[reach-shadow] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  function mount(app) {
    // Read-only: the logged objects for a date. Interim only — the registered evaluation is one look at 60 valid sessions.
    app.get('/api/level-scenario-shadow', async (req, res) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? '')) ? String(req.query.date) : london(now()).date;
      try {
        const cps = {};
        for (const h of CPS) { const o = await getJSON(`${REACH_PREFIX}/${date}/${hh(h)}.json`); if (o) cps[hh(h)] = o; }
        res.json({ date, model_version: REACH_MODEL_VERSION, registered: 'forge/LEVEL_SCENARIO_SHADOW_PREREG.md', interim_note: 'Shadow only — interim, not a decision.',
                   checkpoints: cps, outcomes: await getJSON(`${REACH_PREFIX}/${date}/outcomes.json`), lastTick: last });
      } catch (e) { res.status(503).json({ error: String(e.message || e) }); }
    });
  }
  return { tick, mount, _writeCheckpoint: writeCheckpoint, _writeOutcomes: writeOutcomes };
}
