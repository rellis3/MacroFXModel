// Stress-count shadow — API (logic: js/stressShadowCore.js; rule: forge/FORECAST_MISS_SCAN_PREREG.md A1).
//
// READ-ONLY, like the drawdown and HAR shadows. Reads vol_forecast_latest, vol_forecast_<date> and vol_session_<date>
// (kept by the Vol Forecast scheduler), OANDA daily SPX500_USD candles (S&P 5d and 60d) and Yahoo ^VIX / ^VIX3M daily
// closes (the CBOE close the scan used via FRED VIXCLS / VXVCLS, without FRED's next-day lag). Writes nothing; finished
// days live in process memory and rebuild after a redeploy. The live ladder is never modified.
//
//   GET /api/stress-shadow   today's conditions + shadow factors, and the forward scorecard since RULE.start
import { RULE, inputsAsOf, conditions, isMonthEnd, factorFor, shadowLadder, scoreRow, scorecard } from './stressShadowCore.js';
import { classOf } from './drawdownShadowCore.js';
import { auditUsable } from './harShadowCore.js';
import { flattenLadder } from './forecastLadder.js';
import { londonMidnightSec } from './volBacktestEngine.js';

const TTL_MS = 10 * 60e3, MAX_DAYS = 400;
const parse = raw => { if (!raw) return null; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p; };
const londonDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
const midnightOf = date => londonMidnightSec(new Date(`${date}T00:30:00Z`));
const liveFlat = fcI => fcI?.ladder_flat ?? (fcI?.ladder ? flattenLadder(fcI.ladder) : null);
function bizDates(from, to) {
  const out = [], d = new Date(from + 'T12:00:00Z'), end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < MAX_DAYS) { if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const oandaBase = () => ((process.env.OANDA_ENV || 'live') === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com');

async function spxDaily() {
  if (!process.env.OANDA_KEY) throw new Error('no OANDA_KEY');
  const url = `${oandaBase()}/v3/instruments/SPX500_USD/candles?granularity=D&price=M&count=150`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OANDA D SPX500 HTTP ${res.status}`);
  // OANDA stamps a daily candle at its open; it closes one day later
  return ((await res.json()).candles ?? []).filter(c => c.complete && c.mid).map(c => ({ t: Math.floor(Date.parse(c.time) / 1000) + 86400, c: +c.mid.c }));
}

// Yahoo daily bars are stamped at the US open, so the UTC date is the trading date; the bar for today is still forming
// and is dropped by inputsAsOf (date < session date only).
async function yahooDaily(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=6mo`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MacroFX/1.0)' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Yahoo ${sym} HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  const ts = res?.timestamp ?? [], cl = res?.indicators?.quote?.[0]?.close ?? [];
  const out = ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: cl[i] })).filter(x => Number.isFinite(x.value));
  if (!out.length) throw new Error(`Yahoo ${sym}: no closes`);
  return out;
}

export function createStressShadow({ kv, log = console }) {
  const scored = new Map();
  let cache = null, cacheAt = 0, building = null;

  const stateFor = (date, data) => {
    const inputs = inputsAsOf(data, date, midnightOf(date));
    return { inputs, cond: conditions(inputs), monthEnd: isMonthEnd(date) };
  };

  async function scoreDate(date, data) {
    if (scored.has(date)) return scored.get(date);
    const [sess, fc] = [parse(await kv.get(`vol_session_${date}`)), parse(await kv.get(`vol_forecast_${date}`))];
    if (!fc?.instruments) return null;
    const { cond, monthEnd } = stateFor(date, data);
    let rows = [], skipped = null;
    if (!sess?.instruments) skipped = 'no session audit';
    else if (!auditUsable(date, sess.audited_at)) skipped = `audit taken ${sess.audited_at}, after the London session ended`;
    else rows = Object.keys(fc.instruments).filter(classOf).map(s => scoreRow(s, liveFlat(fc.instruments[s]), sess.instruments[s], cond, monthEnd)).filter(Boolean);
    const day = { date, fxCount: cond.fxCount, idxCount: cond.idxCount, monthEnd, missing: cond.missing, rows, skipped };
    if (date < londonDate() && sess?.instruments) scored.set(date, day);
    return day;
  }

  async function build() {
    const [spx, vix, vix3m] = await Promise.all([spxDaily(), yahooDaily('^VIX'), yahooDaily('^VIX3M')]);
    const data = { spx, vix, vix3m };
    const fc = parse(await kv.get('vol_forecast_latest'));
    const sessionDate = fc?.session_date ?? londonDate();
    const { inputs, cond, monthEnd } = stateFor(sessionDate, data);
    const today = Object.keys(fc?.instruments ?? {}).filter(classOf).map(s => {
      const lf = liveFlat(fc.instruments[s]); const sh = shadowLadder(s, lf, cond, monthEnd);
      return sh && { sym: s, cls: classOf(s), factor: sh.factor, live: { hl_p50: lf.hl_p50, hl_p75: lf.hl_p75, hl_p90: lf.hl_p90 },
                     shadow: { hl_p50: sh.flat.hl_p50, hl_p75: sh.flat.hl_p75, hl_p90: sh.flat.hl_p90 } };
    }).filter(Boolean);
    const days = [];
    for (const d of bizDates(RULE.start, londonDate())) {
      if (d >= londonDate()) continue;                                    // finished sessions only
      try { const x = await scoreDate(d, data); if (x && x.rows.length) days.push(x); }
      catch (e) { log.warn?.(`[stress-shadow] ${d}: ${e.message}`); }
    }
    const r = v => (Number.isFinite(v) ? +v.toFixed(3) : null);
    return { builtAt: new Date().toISOString(), rule: RULE, sessionDate,
             inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, r(v)])), conditions: cond, monthEnd,
             factor: { fx: factorFor('fx', cond, monthEnd), idx: factorFor('idx', cond, monthEnd) }, today,
             scorecard: scorecard(days),
             days: days.map(d => ({ date: d.date, fxCount: d.fxCount, idxCount: d.idxCount, monthEnd: d.monthEnd, missing: d.missing, rows: d.rows.length, skipped: d.skipped })),
             evidence: 'forecast-miss-shock-fx / -idx, forecast-miss-month-end-fx (validated in-sample); this is the forward record, research only' };
  }

  function mount(app) {
    app.get('/api/stress-shadow', async (_req, res) => {
      try {
        if (!cache || Date.now() - cacheAt > TTL_MS) {
          building ??= build().finally(() => { building = null; });
          cache = await building; cacheAt = Date.now();
        }
        res.set('Cache-Control', 'no-store');
        res.json(cache);
      } catch (e) {
        res.status(503).json({ error: `stress-shadow unavailable: ${e.message}` });
      }
    });
  }
  return { mount };
}
