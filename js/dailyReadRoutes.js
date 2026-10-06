// Daily Read — live job + API (page: daily-read.html; logic and evidence: js/dailyReadCore.js).
//
// Tick (every 5 min, server.js svcInterval 'dailyRead'):
//   1. SETUP: once the Vol Forecast for the next session exists (22:00 UTC run), tag each instrument from the
//      paper record's implied vol (set from 21:00 London) ÷ the forecast's own σ. Rebuilt on each tick until
//      the session starts, so a late IV capture still lands.
//   2. SCORE: every recent session with a vol_session_<date> audit is scored against vol_forecast_<date>.
//   3. LESSON: the newest scored day gets one lesson picked from what happened.
// Storage: KV `daily_read_v1` = { days: { 'YYYY-MM-DD': { setup:{at,rows}, score:{at,rows}, lesson } }, log: [] }.
// Reads only: vol_forecast_latest, vol_forecast_<date>, vol_session_<date>, paper_record_v1. No orders, no alerts.
import { DAILY_READ_KV, TAGS, EXPECT_P75, setupRow, scoreRow, tally, pickLesson, auditUsable } from './dailyReadCore.js';
import { INSTRUMENTS as PAPER_INSTRUMENTS } from './paperRecordCore.js';
import { PAPER_KV } from './paperRecordRoutes.js';

const KEEP_DAYS = 400, SCORE_LOOKBACK = 12, RETRY_MS = 60 * 60e3;
const parse = raw => { if (!raw) return null; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p; };
const londonDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
const bizDaysBefore = (date, n) => {
  const out = [], d = new Date(date + 'T12:00:00Z');
  while (out.length < n) { d.setUTCDate(d.getUTCDate() - 1); if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); }
  return out;
};

export function createDailyRead({ kv, log = console }) {
  let running = false, last = null;
  const tried = new Map();                               // date -> ms of last failed score attempt (missing audit)

  async function load() {
    const raw = await kv.getStrict(DAILY_READ_KV);       // throws on backend failure -> the tick refuses to write
    return parse(raw) ?? { days: {}, log: [] };
  }
  const note = (store, msg) => { store.log = [{ at: new Date().toISOString(), msg }, ...(store.log ?? [])].slice(0, 100); };
  const syms = fc => Object.keys(fc?.instruments ?? {}).filter(s => PAPER_INSTRUMENTS.some(i => i.sym === s));
  const flagsFor = (paper, date) => {
    const f = paper?.days?.[date]?.flags ?? {};
    return Object.fromEntries(PAPER_INSTRUMENTS.map(i => [i.sym, f[i.key] ?? null]));
  };

  async function buildSetup(store, paper, today) {
    const fc = parse(await kv.get('vol_forecast_latest'));
    const target = fc?.session_date;
    if (!target || target <= today) return;              // the next session's forecast is not out yet
    const flags = flagsFor(paper, target);
    const rows = syms(fc).map(s => setupRow(s, fc.instruments[s], flags[s]));
    const prev = store.days[target]?.setup;
    if (prev && JSON.stringify(prev.rows) === JSON.stringify(rows)) return;
    store.days[target] = { ...(store.days[target] ?? {}), setup: { at: new Date().toISOString(), forecastAt: fc.computed_at, rows } };
    if (!prev) note(store, `setup for ${target}: ${rows.filter(r => r.tag).length} of ${rows.length} instruments tagged`);
  }

  async function scoreDay(store, date) {
    if (store.days[date]?.score || store.days[date]?.skipped) return false;
    if (Date.now() - (tried.get(date) ?? 0) < RETRY_MS) return false;
    const [sess, fc] = [parse(await kv.get(`vol_session_${date}`)), parse(await kv.get(`vol_forecast_${date}`))];
    if (!sess?.instruments || !fc?.instruments) { tried.set(date, Date.now()); return false; }
    if (!auditUsable(date, sess.audited_at)) {             // audit measured the next session: never score it
      store.days[date] = { ...(store.days[date] ?? {}), skipped: { at: new Date().toISOString(), auditedAt: sess.audited_at,
        why: 'session audit taken after the London session ended (it measured the next session)' } };
      note(store, `skipped ${date}: late session audit (${sess.audited_at})`);
      return true;
    }
    const setupBy = Object.fromEntries((store.days[date]?.setup?.rows ?? []).map(r => [r.sym, r]));
    const rows = syms(fc).map(s => scoreRow(s, fc.instruments[s], sess.instruments[s], setupBy[s])).filter(Boolean);
    if (!rows.length) { tried.set(date, Date.now()); return false; }
    store.days[date] = { ...(store.days[date] ?? {}), score: { at: new Date().toISOString(), auditedAt: sess.audited_at ?? null, rows } };
    note(store, `scored ${date}: ${rows.length} instruments`);
    return true;
  }

  async function tick(reason = 'scheduled') {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const today = londonDate(), store = await load();
      const paper = parse(await kv.get(PAPER_KV));
      await buildSetup(store, paper, today);
      // Days scored before the late-audit check existed: move any built on a late audit out of the scores.
      for (const [d, day] of Object.entries(store.days)) {
        if (day.score?.auditedAt && !auditUsable(d, day.score.auditedAt)) {
          day.skipped = { at: new Date().toISOString(), auditedAt: day.score.auditedAt,
            why: 'session audit taken after the London session ended (it measured the next session)' };
          delete day.score; delete day.lesson;
          note(store, `unscored ${d}: late session audit (${day.skipped.auditedAt})`);
        }
      }
      for (const d of [today, ...bizDaysBefore(today, SCORE_LOOKBACK)]) await scoreDay(store, d);
      const scored = Object.keys(store.days).filter(d => store.days[d].score).sort();
      const newest = scored.at(-1);
      if (newest && !store.days[newest].lesson) {
        const recent = scored.slice(0, -1).reverse().map(d => store.days[d].lesson?.id).filter(Boolean);
        const next = Object.keys(store.days).filter(d => d > newest && store.days[d].setup).sort()[0];
        store.days[newest].lesson = pickLesson({ rows: store.days[newest].score.rows, setup: next ? store.days[next].setup.rows : [], tallyAll: tally(store.days), recent });
      }
      const dates = Object.keys(store.days).sort(); for (const old of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete store.days[old];
      store.updatedAt = new Date().toISOString();
      await kv.put(DAILY_READ_KV, JSON.stringify(store));
      last = { at: store.updatedAt, reason, ok: true };
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[daily-read] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  function mount(app) {
    app.get('/api/daily-read', async (_req, res) => {
      try { const store = await load(); res.json({ ...store, tally: tally(store.days), tags: TAGS, expectP75: EXPECT_P75, lastTick: last }); }
      catch (e) { res.status(503).json({ error: `KV unavailable: ${e.message}` }); }
    });
    app.post('/api/daily-read/tick', async (_req, res) => res.json(await tick('manual')));
  }
  return { tick, mount };
}
