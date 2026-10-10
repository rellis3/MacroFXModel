// S1 shadow — time-aware intraday probabilities: live logger + read-only API (forge/VF3_SHADOW_P1_PREREG.md).
//
// Tick (server.js svcInterval 'ipsShadow', every 5 min):
//   * At each London hour h in 02..20 (weekdays), during h:00-h:15, once: fetch each instrument's M1 since London midnight (OANDA),
//     read today's production forecast (export ladder_flat + incumbent hl_median), and write ONE write-once R2 object
//     shadow/ips_v1/<date>/<HH>.json with every instrument's T2 predictions at h and the T1 next-line events touched in the past hour.
//   * From 22:10 London, once per day: write shadow/ips_v1/<date>/outcomes.json from the same M1 source.
// Write-once: an existing object is never overwritten (checked before every write). Nothing live reads these objects.
import { CHECK_HOURS, END_MIN, sessionState, t2Predictions, firstTouches, t1Events, outcomes } from './intradayProbShadowCore.js';
import { IPS_MODEL_VERSION } from './intradayProbShadowParams.js';

export const IPS_PREFIX = 'shadow/ips_v1';
// Research instruments that the production forecast also carries (AUDCHF, AUDNZD, CADCHF, CHFJPY, GBPNZD have no production forecast).
export const IPS_INSTRUMENTS = ['AUDCAD', 'AUDJPY', 'AUDUSD', 'CADJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD',
  'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPJPY', 'GBPUSD', 'NZDCAD', 'NZDJPY', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY',
  'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'];

const london = (ms = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, hour: +p.hour % 24 };
};
export const londonMidnightSec = date => { const g = Date.UTC(...date.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 1000; return g - (london(g * 1000).min === 60 ? 3600 : 0); };
const isWeekday = date => ![0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());
const hh = h => String(h).padStart(2, '0');

/**
 * deps: getJSON(key), putJSON(key,obj) (R2); fetchM1(oandaInstrument, fromISO, toISO) -> [{t, open, high, low, close}] (completed bars);
 *       getForecast() -> forecastState.latest; instruments: [{name, oandaInstrument}]; oosFor(name) -> oos_exceed map; codeCommit.
 */
export function createIpsShadow({ getJSON, putJSON, fetchM1, getForecast, instruments, oosFor, codeCommit = null, log = console, now = () => Date.now() }) {
  let running = false, last = null;
  const cfg = Object.fromEntries(instruments.filter(i => IPS_INSTRUMENTS.includes(i.name)).map(i => [i.name, i]));

  async function barsSinceMidnight(name, date, untilMs) {
    const mid = londonMidnightSec(date);
    const raw = await fetchM1(cfg[name].oandaInstrument, new Date(mid * 1000).toISOString(), new Date(untilMs).toISOString());
    return raw.map(b => ({ t: b.t, open: +b.open, high: +b.high, low: +b.low, close: +b.close })).filter(b => b.t >= mid).sort((a, b) => a.t - b.t);
  }

  async function writeCheckpoint(date, h) {
    const key = `${IPS_PREFIX}/${date}/${hh(h)}.json`;
    if (await getJSON(key)) return { key, skipped: 'exists' };
    const fc = getForecast();
    const mid = londonMidnightSec(date), cpSec = mid + h * 3600, created = new Date(now()).toISOString();
    const utc = new Date(cpSec * 1000), utcFrac = Math.min(0.99, (utc.getUTCHours() * 60 + utc.getUTCMinutes()) / 1440);
    const rec = { model_version: IPS_MODEL_VERSION, code_commit: codeCommit, created_utc: created, session_date: date, checkpoint_london: `${hh(h)}:00`,
                  checkpoint_utc: utc.toISOString(), forecast: fc ? { session_date: fc.session_date, computed_at: fc.computed_at } : null, instruments: {} };
    for (const name of Object.keys(cfg)) {
      const f = fc?.session_date === date ? fc.instruments?.[name] : null;
      const r = { ok: false };
      try {
        if (!f?.ladder_flat || !(f.hl_median > 0)) { r.why = fc?.session_date !== date ? 'forecast is not for this session' : 'no ladder / hl_median'; rec.instruments[name] = r; continue; }
        const bars = await barsSinceMidnight(name, date, cpSec * 1000);
        const s = sessionState(bars, cpSec);
        if (!s) { r.why = 'no bars since London midnight'; rec.instruments[name] = r; continue; }
        const flat = f.ladder_flat;
        Object.assign(r, { ok: true, open: s.open, open_time: s.openTime, high: s.high, low: s.low, last_bar_time: s.lastBarTime, input_age_s: cpSec - s.lastBarTime,
          run_hl_pct: +s.runHLpct.toFixed(4), lines: { ...flat, hl_median_incumbent: f.hl_median }, data_source: f.data_source ?? null, stale_forecast: !!f.stale });
        r.T2 = t2Predictions({ hour: h, runHLpct: s.runHLpct, lines: { L_A: f.hl_median, L_B: flat.hl_p50 }, utcFrac });
        const { ft } = firstTouches(bars, s.open, flat, cpSec);
        const from = h === CHECK_HOURS[0] ? mid : cpSec - 3600;
        r.T1 = t1Events({ ft, fromSec: from, toSec: cpSec, londonHourOf: sec => london(sec * 1000).hour, oosExceed: oosFor(name) })
          .map(e => ({ ...e, write_delay_min: Math.round((Date.parse(created) / 1000 - e.touch_sec) / 60) }));
      } catch (e) { r.ok = false; r.why = String(e.message || e).slice(0, 200); }
      rec.instruments[name] = r;
    }
    rec.n_ok = Object.values(rec.instruments).filter(x => x.ok).length;
    if (await getJSON(key)) return { key, skipped: 'exists (race)' };
    await putJSON(key, rec);
    return { key, n_ok: rec.n_ok };
  }

  async function writeOutcomes(date) {
    const key = `${IPS_PREFIX}/${date}/outcomes.json`;
    if (await getJSON(key)) return { key, skipped: 'exists' };
    const mid = londonMidnightSec(date), end22 = mid + END_MIN * 60;
    const out = { model_version: IPS_MODEL_VERSION, created_utc: new Date(now()).toISOString(), session_date: date, instruments: {} };
    let anyCp = false;
    const opens = {}, flats = {};
    for (const h of CHECK_HOURS) {                                       // the open and lines exactly as logged at the checkpoints
      const cp = await getJSON(`${IPS_PREFIX}/${date}/${hh(h)}.json`);
      if (!cp) continue;
      anyCp = true;
      for (const [n, r] of Object.entries(cp.instruments ?? {})) if (r.ok && opens[n] == null) { opens[n] = r.open; flats[n] = r.lines; }
    }
    if (!anyCp) return { key, skipped: 'no checkpoints logged' };
    for (const name of Object.keys(opens)) {
      try {
        const bars = await barsSinceMidnight(name, date, end22 * 1000);
        out.instruments[name] = outcomes({ bars, end22Sec: end22, open: opens[name], flat: flats[name] });
      } catch (e) { out.instruments[name] = { error: String(e.message || e).slice(0, 200) }; }
    }
    await putJSON(key, out);
    return { key, n: Object.keys(out.instruments).length };
  }

  async function tick(reason = 'scheduled') {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const t = london(now()), done = [];
      if (isWeekday(t.date)) {
        const h = Math.floor(t.min / 60);
        if (CHECK_HOURS.includes(h) && t.min - h * 60 <= 15) done.push(await writeCheckpoint(t.date, h));
        if (t.min >= END_MIN + 10) done.push(await writeOutcomes(t.date));
      }
      last = { at: new Date(now()).toISOString(), reason, ok: true, done };
      return last;
    } catch (e) {
      last = { at: new Date(now()).toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[ips-shadow] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  function mount(app) {
    // Read-only: returns the logged objects for a date. Interim only — the registered evaluation is one look at 60 valid sessions.
    app.get('/api/ips-shadow', async (req, res) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? '')) ? String(req.query.date) : london(now()).date;
      try {
        const cps = {};
        for (const h of CHECK_HOURS) { const o = await getJSON(`${IPS_PREFIX}/${date}/${hh(h)}.json`); if (o) cps[hh(h)] = o; }
        res.json({ date, model_version: IPS_MODEL_VERSION, registered: 'forge/VF3_SHADOW_P1_PREREG.md', interim_note: 'Shadow only — interim, not a decision.',
                   checkpoints: cps, outcomes: await getJSON(`${IPS_PREFIX}/${date}/outcomes.json`), lastTick: last });
      } catch (e) { res.status(503).json({ error: String(e.message || e) }); }
    });
  }
  return { tick, mount, _writeCheckpoint: writeCheckpoint, _writeOutcomes: writeOutcomes };
}
