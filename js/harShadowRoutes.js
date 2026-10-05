// HAR Shadow — API for har-shadow.html (logic: js/harShadowCore.js).
//
// READ-ONLY. Reads vol_forecast_latest, vol_forecast_<date> and vol_session_<date> — the keys the Vol Forecast and
// Daily Read already maintain — and writes nothing: no KV, no orders, no alerts, no scheduler. Scored days are kept in
// process memory only (a finished session never changes), so a redeploy simply rebuilds them on the next request.
//
//   GET /api/har-shadow            today's two ladders per instrument + the running scorecard + per-day rows
//   GET /api/har-shadow?indices=1  also count the indices (provisional: live index σ comes from Yahoo bars)
import { ladders, scoreInstrument, scorecard, harParamsFor, auditUsable, SHADOW_START } from './harShadowCore.js';

const TTL_MS = 10 * 60e3, MAX_DAYS = 400;
const parse = raw => { if (!raw) return null; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p; };
const londonDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
function bizDates(from, to) {
  const out = [], d = new Date(from + 'T12:00:00Z'), end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < MAX_DAYS) { if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

export function createHarShadow({ kv, log = console }) {
  const scored = new Map();          // date -> { rows, auditedAt } (only complete, final sessions are kept)
  let cache = null, cacheAt = 0, building = null;

  async function scoreDate(date) {
    if (scored.has(date)) return scored.get(date);
    const [sess, fc] = [parse(await kv.get(`vol_session_${date}`)), parse(await kv.get(`vol_forecast_${date}`))];
    if (!sess?.instruments || !fc?.instruments) return null;
    if (!auditUsable(date, sess.audited_at)) {                // captured after the session ended: skip, and say so
      const day = { rows: [], skipped: `audit taken ${sess.audited_at}, after the London session ended` };
      if (date < londonDate()) scored.set(date, day);
      return day;
    }
    const rows = Object.keys(fc.instruments).filter(harParamsFor)
      .map(s => scoreInstrument(s, fc.instruments[s], sess.instruments[s])).filter(Boolean);
    if (!rows.length) return null;
    const day = { rows, auditedAt: sess.audited_at ?? null, forecastAt: fc.computed_at ?? null };
    if (date < londonDate()) scored.set(date, day);       // today's session can still change; past ones cannot
    return day;
  }

  async function build() {
    const fc = parse(await kv.get('vol_forecast_latest'));
    const today = (fc?.instruments ? Object.keys(fc.instruments) : []).filter(harParamsFor)
      .map(s => ladders(s, fc.instruments[s])).filter(Boolean);
    const days = {};
    for (const d of bizDates(SHADOW_START, londonDate())) {
      try { const x = await scoreDate(d); if (x) days[d] = x; }
      catch (e) { log.warn?.(`[har-shadow] ${d}: ${e.message}`); }
    }
    return { builtAt: new Date().toISOString(), sessionDate: fc?.session_date ?? null, forecastAt: fc?.computed_at ?? null,
             shadowStart: SHADOW_START, today, days };
  }

  function mount(app) {
    app.get('/api/har-shadow', async (req, res) => {
      try {
        if (!cache || Date.now() - cacheAt > TTL_MS) {
          building ??= build().finally(() => { building = null; });
          cache = await building; cacheAt = Date.now();
        }
        const withIdx = String(req.query.indices) === '1';
        res.json({ ...cache, scorecard: scorecard(cache.days, { includeProvisional: withIdx }), includesIndices: withIdx });
      } catch (e) {
        res.status(503).json({ error: `har-shadow unavailable: ${e.message}` });
      }
    });
  }
  return { mount };
}
