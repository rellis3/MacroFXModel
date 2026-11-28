// js/helixMemoryRoutes.js: HELIX MEMORY on the server. The evening self-scoring job and the diary routes over the Helix daily records (helix/days/<date>.json, written by
// POST /api/helix/record in js/helixRoutes.js). The maths is pure and tested: js/terminal/helixScoreCore.js (claims, rules, Wilson), js/terminal/helixDiaryCore.js (diary, search).
//   GET  /api/helix/diary?date=YYYY-MM-DD      owner-only: one day as the diary reads it (what was said, part by part) with its score; ?before=YYYY-MM-DD gives the last stored day before it
//   GET  /api/helix/diary/search?q=&from=&to=&market=&family=&unusual=1   owner-only: keyword + filters across stored days (no model call), at most 120 days per search
//   GET  /api/helix/scores?date=YYYY-MM-DD     owner-only: the day's score file (helix/scores/<date>.json)
//   GET  /api/helix/scorecard                  owner-only: the rolling calibration (helix/scores/_summary.json): hit-rate per claim kind with n and a 95% Wilson interval
//   POST /api/helix/score?force=1              owner-only: score today now (the close is the live session, so only today's London date can be scored)
// The job (service 'helixScore'): every 10 minutes; from 22:10 London it scores the day once, from the live session's close. DESCRIPTION ONLY: calibration of what Helix said, not a
// trading record; no P&L. Caches are bounded (a 160-day LRU of parsed records, one key listing, one summary).
import { scoreDay, closeRows, mergeSummary, CLAIM_KINDS, cleanClaims } from './terminal/helixScoreCore.js';
import { diaryDay, searchDiary, dateRange } from './terminal/helixDiaryCore.js';

export const SCORE_AT_MINS = 22 * 60 + 10;      // 22:10 London: after the 22:00 FX close, before the vol forecaster's next London day
export const SUMMARY_KEY = 'helix/scores/_summary.json';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayKey = d => `helix/days/${d}.json`, scoreKey = d => `helix/scores/${d}.json`;
// one formatter, made once (Intl.DateTimeFormat holds native memory: never make one per call or per bar)
const LON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** London date and minutes past midnight at ms. */
export function londonClock(ms) {
  const o = {}; for (const p of LON.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, mins: (+o.hour % 24) * 60 + +o.minute };
}

/** A small LRU: get/set with a cap; set(k, v, ttlMs) expires an entry (today's record changes during the day). */
export function lru(cap = 160, now = () => Date.now()) {
  const m = new Map();
  return {
    get(k) { const e = m.get(k); if (!e) return undefined; if (e.exp && now() > e.exp) { m.delete(k); return undefined; } m.delete(k); m.set(k, e); return e.v; },
    set(k, v, ttlMs = 0) { m.delete(k); m.set(k, { v, exp: ttlMs ? now() + ttlMs : 0 }); while (m.size > cap) m.delete(m.keys().next().value); },
    get size() { return m.size; },
  };
}

export function mountHelixMemory(app, deps) {
  const { ownerOnly, r2GetJSON, r2PutJSON, r2ListKeys = async () => [], r2Ok = () => true, sessionStatus = async () => null, selfJson = async () => null, svcInterval = null, now = () => Date.now(), log = console } = deps;
  const cache = lru(160, now);
  const todayOf = () => londonClock(now()).date;
  const getRec = async (key, date) => {
    const hit = cache.get(key); if (hit !== undefined) return hit;
    let j = null; try { j = r2Ok() ? await r2GetJSON(key) : null; } catch (e) { j = null; }
    // a past day is settled once the next day has begun (the evening run and the score are in by then); today, and a missing file, are re-read after 2 minutes
    const settled = j && date && date < todayOf();
    cache.set(key, j ?? null, settled ? 0 : 120e3);
    return j ?? null;
  };
  let listing = { at: 0, dates: null };
  const storedDates = async () => {
    if (listing.dates && now() - listing.at < 10 * 60e3) return listing.dates;
    let keys = []; try { keys = r2Ok() ? await r2ListKeys('helix/days/') : []; } catch (e) { keys = []; }
    listing = { at: now(), dates: keys.map(k => (String(k).match(/(\d{4}-\d{2}-\d{2})\.json$/) ?? [])[1]).filter(Boolean).sort() };
    return listing.dates;
  };
  const dayOf = async date => { const rec = await getRec(dayKey(date), date); if (!rec) return null; return diaryDay(rec, await getRec(scoreKey(date), date)); };

  // ── the evening self-scoring ──
  let lastScored = null, running = null;
  async function scoreDate(date, { force = false } = {}) {
    if (!r2Ok()) return { ok: false, why: 'R2 not configured' };
    if (!force) { const have = await r2GetJSON(scoreKey(date)).catch(() => null); if (have && !have.partialDay) return { ok: true, already: true, date }; }      // a score taken early (POST before 22:10) is redone at the close
    const rec = await r2GetJSON(dayKey(date)).catch(() => null); if (!rec) return { ok: true, noRecord: true, date };
    const claims = Object.values(rec.runs ?? {}).flatMap(r => cleanClaims(r?.claims)).filter(c => c.spoken);
    const close = closeRows(await sessionStatus().catch(() => null), date);
    if (!close.ok && !force) return { ok: false, why: close.why, date };
    let events = null;
    if (claims.some(c => c.kind === 'release_vs_expected')) { try { const e = await selfJson('/api/events'); events = Array.isArray(e) ? e : Array.isArray(e?.events) ? e.events : null; } catch (e) { events = null; } }
    const bars = {};
    for (const pair of [...new Set(claims.filter(c => c.kind === 'release_reaction' && c.pair).map(c => c.pair))].slice(0, 8)) {
      try { const j = await selfJson(`/api/cog-chart/candles?asset=${encodeURIComponent(pair)}&tf=15m&count=200`); if (j?.ok && Array.isArray(j.candles)) bars[pair] = j.candles.map(c => ({ t: +c.t, o: +c.o, c: +c.c })).sort((a, b) => a.t - b.t); } catch (e) { /* that pair goes unscored */ }
    }
    const score = scoreDay(rec, { close, events, bars }, { now: now() });
    const lc = londonClock(now()); if (lc.date === date && lc.mins < SCORE_AT_MINS) score.partialDay = true;
    await r2PutJSON(scoreKey(date), score);
    const prev = await r2GetJSON(SUMMARY_KEY).catch(() => null), summary = mergeSummary(prev, score, { now: now() });
    await r2PutJSON(SUMMARY_KEY, summary);
    cache.set(scoreKey(date), score, 120e3); cache.set(SUMMARY_KEY, summary, 600e3);
    return { ok: true, date, wrote: scoreKey(date), checked: score.results.filter(r => r.hit != null).length, unscorable: score.unscorable, counts: score.counts };
  }
  async function tick() {
    const { date, mins } = londonClock(now());
    if (mins < SCORE_AT_MINS || lastScored === date) return { skipped: true };
    if (running) return running;
    running = (async () => {
      try { const r = await scoreDate(date); if (r.ok) lastScored = date; if (r.wrote) log.log?.(`[helix-score] ${date}: ${r.checked} checked, ${r.unscorable} unscorable`); return r; }
      finally { running = null; }
    })();
    return running;
  }
  if (svcInterval) svcInterval(() => tick().catch(e => log.warn?.('[helix-score]', e.message)));

  // ── routes (owner only) ──
  const bad = (res, error) => res.status(400).json({ ok: false, error });
  app.get('/api/helix/diary', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const before = String(req.query.before ?? ''), date = String(req.query.date ?? '');
      if (ISO.test(before)) {
        const dates = (await storedDates()).filter(d => d < before);
        for (const d of dates.slice(-5).reverse()) { const day = await dayOf(d); if (day) return res.json({ ok: true, ...day, close: (await getRec(scoreKey(d), d))?.close ?? null }); }
        return res.json({ ok: false, error: 'no stored day before that date' });
      }
      if (!ISO.test(date)) return bad(res, 'date=YYYY-MM-DD or before=YYYY-MM-DD');
      const day = await dayOf(date);
      const dates = await storedDates();
      res.json(day ? { ok: true, ...day, prev: dates.filter(d => d < date).at(-1) ?? null, next: dates.find(d => d > date) ?? null } : { ok: false, error: 'no record for that day', latest: dates.at(-1) ?? null });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/helix/diary/search', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const today = todayOf(), to = ISO.test(String(req.query.to ?? '')) ? String(req.query.to) : today;
      const from = ISO.test(String(req.query.from ?? '')) ? String(req.query.from) : new Date(Date.parse(`${to}T12:00:00Z`) - 59 * 864e5).toISOString().slice(0, 10);
      const span = dateRange(from, to, 120), have = new Set(await storedDates()), want = span.filter(d => have.has(d));
      const days = [];
      for (let i = 0; i < want.length; i += 8) days.push(...await Promise.all(want.slice(i, i + 8).map(dayOf)));
      const hits = searchDiary(days.filter(Boolean), { q: req.query.q, market: req.query.market, family: req.query.family, unusual: req.query.unusual === '1' || req.query.unusual === 'true', limit: 40 });
      res.json({ ok: true, from: span[0] ?? from, to, searched: want.length, clipped: span.length >= 120 && span[0] > from, hits, dates: [...have].slice(-200) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/helix/scores', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const date = String(req.query.date ?? ''); if (!ISO.test(date)) return bad(res, 'date=YYYY-MM-DD');
    try { const j = await getRec(scoreKey(date), date); res.json(j ? { ok: true, ...j } : { ok: false, error: 'not scored (the job scores each day from 22:10 London)' }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/helix/scorecard', ownerOnly, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      let j = cache.get(SUMMARY_KEY); if (j === undefined) { j = r2Ok() ? await r2GetJSON(SUMMARY_KEY).catch(() => null) : null; cache.set(SUMMARY_KEY, j, 600e3); }
      res.json({ ok: true, kinds: CLAIM_KINDS, summary: j ?? null, scoreAt: '22:10 London', lastScored });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.post('/api/helix/score', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { const date = todayOf(), r = await scoreDate(date, { force: req.query.force === '1' }); if (r.ok && !r.noRecord) lastScored = date; res.json(r); }
    catch (e) { log.warn?.('[helix-score]', e.message); res.status(500).json({ ok: false, error: e.message }); }
  });
  return { scoreDate, tick, storedDates };
}
