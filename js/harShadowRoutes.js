// HAR Shadow — API for har-shadow.html (logic: js/harShadowCore.js).
//
// READ-ONLY. Reads vol_forecast_latest, vol_forecast_<date> and vol_session_<date> — the keys the Vol Forecast and
// Daily Read already maintain — and, for layer 5 (remaining travel), OANDA hourly candles since the shadow started.
// Writes nothing: no KV, no orders, no alerts, no scheduler. Finished days are kept in process memory only (a finished
// session never changes), so a redeploy simply rebuilds them on the next request.
//
//   GET /api/har-shadow            layer 3 (ladders + scorecard) and layer 5 (remaining travel) side by side
//   GET /api/har-shadow?indices=1  also count the indices (provisional: live index σ comes from Yahoo bars)
import { ladders, scoreInstrument, scorecard, harParamsFor, auditUsable, harSigmaDailyPct, SHADOW_START,
         travelClass, travelRows, travelLevels, travelScorecard, CHECKPOINTS } from './harShadowCore.js';
import { INSTRUMENTS } from './volForecastScheduler.js';
import { londonMidnightSec } from './volBacktestEngine.js';

const TTL_MS = 10 * 60e3, MAX_DAYS = 400;
const parse = raw => { if (!raw) return null; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p; };
const londonDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
const midnightOf = date => londonMidnightSec(new Date(`${date}T00:30:00Z`));
const nextDate = date => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
function bizDates(from, to) {
  const out = [], d = new Date(from + 'T12:00:00Z'), end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < MAX_DAYS) { if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const oandaBase = () => ((process.env.OANDA_ENV || 'live') === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com');

async function fetchH1(instrument, fromSec) {
  const url = `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=H1&price=M&count=5000`
            + `&from=${encodeURIComponent(new Date(fromSec * 1000).toISOString())}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OANDA H1 ${instrument} HTTP ${res.status}`);
  return ((await res.json()).candles ?? []).filter(c => c.mid).map(c => ({
    t: Math.floor(Date.parse(c.time) / 1000), o: +c.mid.o, h: +c.mid.h, l: +c.mid.l, c: +c.mid.c, complete: !!c.complete }));
}

export function createHarShadow({ kv, log = console }) {
  const scored = new Map();          // date -> finished day (ladder rows + travel rows)
  let cache = null, cacheAt = 0, building = null;

  async function loadH1(syms) {
    const h1 = new Map();
    if (!process.env.OANDA_KEY) return { h1, error: 'no OANDA_KEY' };
    const byName = new Map(INSTRUMENTS.map(c => [c.name, c.oandaInstrument]));
    const from = midnightOf(SHADOW_START);
    const list = syms.filter(s => byName.has(s) && travelClass(s));
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async s => {
        try { h1.set(s, await fetchH1(byName.get(s), from)); }
        catch (e) { log.warn?.(`[har-shadow] ${e.message}`); }
      }));
    }
    return { h1, error: null };
  }
  const sessionBars = (bars, date) => {
    const a = midnightOf(date), b = midnightOf(nextDate(date));
    return (bars ?? []).filter(x => x.t >= a && x.t < b);
  };

  async function scoreDate(date, h1) {
    if (scored.has(date)) return scored.get(date);
    const [sess, fc] = [parse(await kv.get(`vol_session_${date}`)), parse(await kv.get(`vol_forecast_${date}`))];
    if (!fc?.instruments) return null;
    const syms = Object.keys(fc.instruments);
    // layer 5 — needs only that day's σ and the hourly candles, so it scores even when the session audit was bad
    const travel = [];
    for (const s of syms) {
      const bars = sessionBars(h1.get(s), date);
      if (bars.length < 18) continue;
      for (const row of travelRows(s, bars, midnightOf(date), harSigmaDailyPct(fc.instruments[s]))) travel.push({ sym: s, ...row });
    }
    // layer 3 — needs the session audit
    let rows = [], skipped = null;
    if (!sess?.instruments) skipped = 'no session audit';
    else if (!auditUsable(date, sess.audited_at)) skipped = `audit taken ${sess.audited_at}, after the London session ended`;
    else rows = syms.filter(harParamsFor).map(s => scoreInstrument(s, fc.instruments[s], sess.instruments[s])).filter(Boolean);
    if (!rows.length && !travel.length) return null;
    const day = { rows, travel, skipped, auditedAt: sess?.audited_at ?? null, forecastAt: fc.computed_at ?? null };
    if (date < londonDate() && (travel.length || !h1.size)) scored.set(date, day);   // finished days only
    return day;
  }

  async function build() {
    const fc = parse(await kv.get('vol_forecast_latest'));
    const today = (fc?.instruments ? Object.keys(fc.instruments) : []).filter(harParamsFor)
      .map(s => ladders(s, fc.instruments[s])).filter(Boolean);
    const syms = Object.keys(fc?.instruments ?? {});
    const needH1 = bizDates(SHADOW_START, londonDate()).some(d => !scored.has(d));
    const { h1, error: h1Error } = needH1 ? await loadH1(syms) : { h1: new Map(), error: null };
    const days = {};
    for (const d of bizDates(SHADOW_START, londonDate())) {
      try { const x = await scoreDate(d, h1); if (x) days[d] = x; }
      catch (e) { log.warn?.(`[har-shadow] ${d}: ${e.message}`); }
    }
    // today's remaining-travel levels from the latest checkpoint already passed
    const tDate = londonDate(), fcToday = parse(await kv.get(`vol_forecast_${tDate}`));
    const nowSec = Date.now() / 1000, mid = midnightOf(tDate);
    const hNow = [...CHECKPOINTS].reverse().find(h => mid + h * 3600 <= nowSec) ?? null;
    const travelToday = [];
    if (hNow != null && fcToday?.instruments) for (const s of Object.keys(fcToday.instruments)) {
      const bars = sessionBars(h1.get(s), tDate).filter(b => b.t < mid + hNow * 3600);
      if (!bars.length) continue;
      const lv = travelLevels(s, bars[bars.length - 1].c, bars[0].o, harSigmaDailyPct(fcToday.instruments[s]), hNow);
      if (lv) travelToday.push({ sym: s, ...lv });
    }
    return { builtAt: new Date().toISOString(), sessionDate: fc?.session_date ?? null, forecastAt: fc?.computed_at ?? null,
             shadowStart: SHADOW_START, today, days, travelToday, travelTodayDate: tDate, h1Error };
  }

  function mount(app) {
    app.get('/api/har-shadow', async (req, res) => {
      try {
        if (!cache || Date.now() - cacheAt > TTL_MS) {
          building ??= build().finally(() => { building = null; });
          cache = await building; cacheAt = Date.now();
        }
        const withIdx = String(req.query.indices) === '1';
        res.json({ ...cache, scorecard: scorecard(cache.days, { includeProvisional: withIdx }),
                   travelScore: travelScorecard(cache.days), includesIndices: withIdx });
      } catch (e) {
        res.status(503).json({ error: `har-shadow unavailable: ${e.message}` });
      }
    });
  }
  return { mount };
}
