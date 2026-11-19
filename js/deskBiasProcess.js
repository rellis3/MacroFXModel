/**
 * Desk Bias Process v1 (plans/DESK_BIAS_PROCESS_SPEC.md): one systematic-discretionary daily bias per market, the same
 * six layers every day, a deterministic "system call", and an AI analyst that may accept it or override it with a
 * written reason tied to the pack. Both calls are kept and scored forward head to head (js/deskBiasH2H.js).
 *
 *   1 Event state   tier-1 (high-impact) release today for the market's currencies after the issue and before 16:00
 *                   London -> PRE-EVENT; one on the previous London weekday (or earlier today) -> POST-EVENT
 *   2 Regime        the bias engine's risk score R (on / off), the vol regime (20-day realised σ against its own last
 *                   year: calm / normal / high) and, for USD markets, the dollar-smile side
 *   3 Macro         the bias engine's market score with its trend driver taken out (renormalised)
 *   4 Structure     W1 / D1 / H4 EMA20 slope signs, the last CONFIRMED D1 fractal swing high / low (a 2-bar fractal is
 *                   confirmed only once the 2 bars after it have closed) and where price sits against them
 *   5 Positioning   COT crowding (the engine's contrarian positioning driver), as a warning flag
 *   6 Day range     the shipped vol lines (London-day high-to-low p50 / p75, % of the open) and σ_day
 *
 * Pure: no fetch, no KV, no clock (the issue time is `asOf`). The one async function, runProcessAi, takes the model
 * call as an argument (the server passes its callModel; tests pass a fake). Tested in js/deskBiasProcess.test.mjs.
 */
import { legsOf } from './terminal/pairView.js';
import { marketView, RISK_ROLE, CCYS } from './biasEngine.js';
import { checkpointed } from './deskRun.js';

export const PROCESS_VERSION = 'desk-bias-process-v1';
export const AI_PROMPT_VERSION = 'process-ai-v1';
/** The scored universe (bias scoreboard instruments, by the desk's names). */
export const PROCESS_MARKETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY', 'GOLD', 'NQ', 'SPX500', 'US30'];
export const OANDA = { EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD', USDJPY: 'USD_JPY', AUDUSD: 'AUD_USD', NZDUSD: 'NZD_USD', USDCAD: 'USD_CAD', USDCHF: 'USD_CHF',
  GBPJPY: 'GBP_JPY', EURJPY: 'EUR_JPY', GOLD: 'XAU_USD', NQ: 'NAS100_USD', SPX500: 'SPX500_USD', US30: 'US30_USD' };
/** The currencies whose releases move a non-FX market. */
const ASSET_CCYS = { GOLD: ['USD'], SILVER: ['USD'], NQ: ['USD'], SPX500: ['USD'], US30: ['USD'], US2000: ['USD'], WTI: ['USD'], COPPER: ['USD'], DE30: ['EUR'], UK100: ['GBP'] };
const CCY_COUNTRY = { USD: ['US'], EUR: ['EU', 'DE', 'FR', 'IT', 'ES'], GBP: ['GB', 'UK'], JPY: ['JP'], AUD: ['AU'], NZD: ['NZ'], CAD: ['CA'], CHF: ['CH'] };

export const TH = {
  macroMin: 0.3,            // |engine score ex-trend| >= 0.3 -> macro side
  macroStrong: 0.8,         // +1 conviction
  riskSide: 0.3,            // R >= +0.3 risk-on, <= -0.3 risk-off
  emaN: 20, emaLag: 3,      // slope = EMA20[last] - EMA20[last - 3]
  fractalK: 2,              // a swing needs 2 bars each side; confirmed when the 2 after it have closed
  invalidMaxSigma: 3,       // a swing further than 3 σ_day from price is not used
  invalidFallbackSigma: 1.5,
  volWindow: 20, volYear: 252, volCalmPct: 25, volHighPct: 75,
  eventCutoff: [16, 0],
};
const DAY = 864e5, H4 = 4 * 3600e3, WEEK = 7 * DAY, H1 = 3600e3;
const fin = x => typeof x === 'number' && Number.isFinite(x);
const r6 = x => (fin(x) ? +x.toPrecision(8) : null);
const DIRS = ['BULLISH', 'BEARISH', 'NEUTRAL'];
const dirOf = s => (s > 0 ? 'BULLISH' : s < 0 ? 'BEARISH' : 'NEUTRAL');
const sideOf = d => (d === 'BULLISH' ? 1 : d === 'BEARISH' ? -1 : 0);

// ── London clock (same arithmetic as js/directionLedger.js, kept local so this file has no ledger dependency) ─────
export function londonMs(date, hh, mm = 0) {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const h = +parts.find(p => p.type === 'hour').value, m = +parts.find(p => p.type === 'minute').value;
  return guess - ((h - hh) * 60 + (m - mm)) * 60_000;
}
export const londonDateOf = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
export function prevWeekday(date) {
  let d = new Date(`${date}T12:00:00Z`);
  do d = new Date(d.getTime() - DAY); while (d.getUTCDay() % 6 === 0);
  return d.toISOString().slice(0, 10);
}

export const ccysOf = market => {
  const m = String(market ?? '').toUpperCase();
  if (ASSET_CCYS[m]) return ASSET_CCYS[m];
  const l = legsOf(m);
  return l?.[0] && l?.[1] && CCYS.includes(l[0]) && CCYS.includes(l[1]) ? [l[0], l[1]] : [];
};
export const isFx = market => ccysOf(market).length === 2 && !ASSET_CCYS[market];

// ── bars ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Closed bars only: complete and closed at or before the issue time. Oldest first. Bars: { t (open ms), o?, h, l, c, complete? }. */
export function closedBars(bars, issueMs, durMs) {
  return (bars ?? []).filter(b => b && fin(b.c) && b.c > 0 && fin(b.t) && b.complete !== false && b.t + durMs <= issueMs).sort((a, b) => a.t - b.t);
}
const ema = (xs, n) => { const k = 2 / (n + 1), out = []; let e = null; for (const x of xs) { e = e == null ? x : e + k * (x - e); out.push(e); } return out; };
/** EMA20 slope sign of closes (oldest first): sign(EMA20[last] - EMA20[last - 3]); null with fewer than 23 closes. */
export function emaSlopeSign(closes, n = TH.emaN, lag = TH.emaLag) {
  if (!closes || closes.length < n + lag) return null;
  const e = ema(closes, n), d = e.at(-1) - e.at(-1 - lag);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/**
 * The last confirmed fractal swing high and low of closed bars (oldest first). Bar i is a swing high when its high is
 * strictly above the highs of the k bars on EACH side (ties are not swings); a swing low mirrors it. Only bars with k
 * closed bars after them are candidates, so the newest candidate is n - 1 - k: a swing
 * becomes visible exactly k bars later and never from a bar that has not happened.
 */
export function lastSwings(bars, k = TH.fractalK) {
  const n = bars.length;
  let high = null, low = null;
  for (let i = n - 1 - k; i >= k && (!high || !low); i--) {
    const b = bars[i];
    if (!high && fin(b.h)) {
      let ok = true;
      for (let j = 1; j <= k && ok; j++) ok = bars[i - j].h < b.h && bars[i + j].h < b.h;
      if (ok) high = { level: b.h, t: b.t, confirmedT: bars[i + k].t };
    }
    if (!low && fin(b.l)) {
      let ok = true;
      for (let j = 1; j <= k && ok; j++) ok = bars[i - j].l > b.l && bars[i + j].l > b.l;
      if (ok) low = { level: b.l, t: b.t, confirmedT: bars[i + k].t };
    }
  }
  return { high, low };
}

/**
 * Layer 4. `prices` = { w1, d1, h4, h1? } bar arrays (open times), all cut to closed bars at `issueMs`. Price = the last
 * closed H1 close, else H4, else D1. bos = +1 above the last confirmed D1 swing high, -1 below the swing low, 0 between.
 */
export function structureLayer(prices, issueMs) {
  const w1 = closedBars(prices?.w1, issueMs, WEEK), d1 = closedBars(prices?.d1, issueMs, DAY), h4 = closedBars(prices?.h4, issueMs, H4), h1 = closedBars(prices?.h1, issueMs, H1);
  const last = h1.at(-1) ?? h4.at(-1) ?? d1.at(-1) ?? null;
  const out = { w1: emaSlopeSign(w1.map(b => b.c)), d1: emaSlopeSign(d1.map(b => b.c)), h4: emaSlopeSign(h4.map(b => b.c)),
    swingHigh: null, swingLow: null, bos: null, price: last ? last.c : null, priceAsOf: last ? new Date(last.t + (last === h1.at(-1) ? H1 : last === h4.at(-1) ? H4 : DAY)).toISOString() : null, side: null, why: null };
  if (d1.length < 5) { out.why = 'too few closed daily bars'; return out; }
  const s = lastSwings(d1);
  out.swingHigh = s.high ? { level: s.high.level, date: new Date(s.high.t).toISOString().slice(0, 10), confirmed: new Date(s.high.confirmedT + DAY).toISOString() } : null;
  out.swingLow = s.low ? { level: s.low.level, date: new Date(s.low.t).toISOString().slice(0, 10), confirmed: new Date(s.low.confirmedT + DAY).toISOString() } : null;
  if (fin(out.price)) out.bos = s.high && out.price > s.high.level ? 1 : s.low && out.price < s.low.level ? -1 : (s.high || s.low ? 0 : null);
  out.side = structureSide(out);
  const miss = ['w1', 'd1', 'h4'].filter(k => out[k] == null);
  if (miss.length) out.why = `${miss.join(', ')} trend: too few closed bars`;
  return out;
}
/** D1 sign when D1 and H4 agree, or D1 agrees with the break-of-structure side; else none. */
export function structureSide(st) {
  const d = st?.d1;
  if (!d) return null;
  if (st.h4 === d) return d;
  if (st.bos === d) return d;
  return null;
}

// ── layer 1: event state ─────────────────────────────────────────────────────────────────────────────────────────
const countriesOf = ccys => new Set(ccys.flatMap(c => CCY_COUNTRY[c] ?? []));
const isTier1 = e => String(e?.impact ?? '').toLowerCase() === 'high';
/** True when a calendar event is a tier-1 release for one of the market's currencies (the rule eventLayer uses). */
export function eventTouches(market, e) {
  const ccys = ccysOf(market);
  return isTier1(e) && (countriesOf(ccys).has(String(e?.country ?? '').toUpperCase()) || ccys.includes(String(e?.ccy ?? '').toUpperCase()));
}
const evRow = e => ({ ccy: e.ccy ?? null, country: e.country ?? null, event: String(e.event ?? e.title ?? ''), time: new Date(e.ms).toISOString() });
/**
 * `calendar` = { ok, events: [{ country, ccy?, event, impact, ms }], source, coversFrom? (ISO date the feed starts) } as
 * known at the issue. PRE-EVENT: a tier-1 release for the market's currencies after the issue and before 16:00 London
 * today. POST-EVENT: one on the previous London weekday or earlier today before the issue. A feed that does not reach
 * back to the previous weekday leaves POST-EVENT unknown (stated), never assumed.
 */
export function eventLayer(market, calendar, date, issueMs) {
  const ccys = ccysOf(market), C = countriesOf(ccys);
  if (!calendar?.ok || !Array.isArray(calendar.events)) return { state: null, pending: null, laterToday: null, previous: null, why: `calendar unavailable${calendar?.error ? ` (${calendar.error})` : ''}` };
  const mine = calendar.events.filter(e => isTier1(e) && fin(e.ms) && (C.has(String(e.country ?? '').toUpperCase()) || ccys.includes(String(e.ccy ?? '').toUpperCase())));
  const cut = londonMs(date, ...TH.eventCutoff), dayEnd = londonMs(date, 23, 59), prev = prevWeekday(date);
  const pending = mine.filter(e => e.ms > issueMs && e.ms <= cut).map(evRow);
  const laterToday = mine.filter(e => e.ms > cut && e.ms <= dayEnd).map(evRow);
  const earlierToday = mine.filter(e => londonDateOf(e.ms) === date && e.ms <= issueMs).map(evRow);
  const covers = !calendar.coversFrom || calendar.coversFrom <= prev;
  const previous = covers ? mine.filter(e => londonDateOf(e.ms) === prev).map(evRow) : null;
  const post = earlierToday.length > 0 || (previous?.length ?? 0) > 0;
  const state = pending.length ? 'PRE-EVENT' : post ? 'POST-EVENT' : covers ? 'CLEAR' : 'CLEAR-TODAY';
  return { state, pending, laterToday, previous: previous == null ? null : [...previous, ...earlierToday], why: covers ? null : `the calendar feed starts ${calendar.coversFrom}, after the previous weekday ${prev}: POST-EVENT unknown` };
}

// ── layer 2: regime ──────────────────────────────────────────────────────────────────────────────────────────────
/** 20-day realised σ of daily log returns now, and its percentile among the last year's rolling values. */
export function volRegime(d1Closes, { win = TH.volWindow, year = TH.volYear } = {}) {
  const c = (d1Closes ?? []).filter(x => fin(x) && x > 0);
  if (c.length < win + 1) return { sigma20: null, pct1y: null, regime: null, why: 'too few daily closes' };
  const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
  const sdOf = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const roll = [];
  for (let i = win; i <= r.length; i++) roll.push(sdOf(r.slice(i - win, i)));
  const hist = roll.slice(-year), now = roll.at(-1);
  if (hist.length < 60) return { sigma20: r6(now), pct1y: null, regime: null, why: `only ${hist.length} rolling values (needs 60)` };
  const pct = 100 * hist.filter(x => x <= now).length / hist.length;
  return { sigma20: r6(now), pct1y: Math.round(pct), regime: pct < TH.volCalmPct ? 'calm' : pct > TH.volHighPct ? 'high' : 'normal', n: hist.length, why: null };
}
/** The market's risk role: the engine's RISK_ROLE, base minus quote for an FX pair. */
export function riskRoleOf(market) {
  if (market in RISK_ROLE && !isFx(market)) return RISK_ROLE[market];
  const c = ccysOf(market);
  return c.length === 2 ? (RISK_ROLE[c[0]] ?? 0) - (RISK_ROLE[c[1]] ?? 0) : null;
}
const legDataD = (rec, c) => rec?.currencies?.[c]?.drivers?.find(x => x.key === 'data')?.d ?? null;
export function regimeLayer(market, engineRec, vol) {
  const R = engineRec?.risk, ok = R && fin(R.score) && (R.coverage ?? 0) >= 0.5;
  const risk = ok ? (R.score >= TH.riskSide ? 'on' : R.score <= -TH.riskSide ? 'off' : 'neutral') : null;
  let smile = null, smileWhy = null;
  if (ccysOf(market).includes('USD')) {
    const us = legDataD(engineRec, 'USD'), peers = CCYS.filter(c => c !== 'USD').map(c => legDataD(engineRec, c)).filter(fin);
    if (!risk) smileWhy = 'risk score unavailable';
    else if (risk === 'off') smile = 'left: risk-off, USD as haven';
    else if (!fin(us) || peers.length < 4) smileWhy = 'US vs peer data momentum unavailable';
    else { const edge = us - peers.reduce((s, x) => s + x, 0) / peers.length; smile = edge > 0.5 ? 'right: US outperforming' : 'middle: USD soft'; }
  } else smileWhy = 'not a USD market (n/a)';
  return { R: ok ? R.score : null, risk, vol: vol?.regime ?? null, volPct1y: vol?.pct1y ?? null, sigma20: vol?.sigma20 ?? null, smile, role: riskRoleOf(market),
    why: [ok ? null : 'risk score unavailable', vol?.regime ? null : `vol regime: ${vol?.why ?? 'no data'}`, smile ? null : `dollar smile: ${smileWhy}`].filter(Boolean).join('; ') || null };
}
/** Regime supports a side when risk-on and the side is pro-risk, or risk-off and the side is the haven side. */
export function regimeSupports(side, regime) {
  if (!side || !regime?.risk || !fin(regime.role) || regime.role === 0) return false;
  return (regime.risk === 'on' && side * regime.role > 0) || (regime.risk === 'off' && side * regime.role < 0);
}

// ── layer 3: macro (engine score without its trend driver) ──────────────────────────────────────────────────────
function exTrend(m) {
  if (!m || !fin(m.score)) return null;
  const t = (m.drivers ?? []).filter(x => x.key === 'trend' && !x.leg), w = t.reduce((s, x) => s + (x.wNorm ?? 0), 0), c = t.reduce((s, x) => s + (x.contrib ?? 0), 0);
  return w < 1 - 1e-9 ? (m.score - c) / (1 - w) : null;
}
export function macroLayer(market, engineRec) {
  if (!engineRec) return { score: null, scoreWithTrend: null, coverage: null, dir: null, strength: null, side: null, drivers: null, why: 'no bias-engine issue' };
  const v = marketView(engineRec, market);
  if (!v) return { score: null, scoreWithTrend: null, coverage: null, dir: null, strength: null, side: null, drivers: null, why: `market not in the bias engine` };
  const l = isFx(market) ? ccysOf(market) : null;
  const s = l ? (() => { const a = exTrend(engineRec.currencies?.[l[0]]), b = exTrend(engineRec.currencies?.[l[1]]); return fin(a) && fin(b) ? (a - b) / 2 : null; })() : exTrend(v);
  const lowCov = (v.coverage ?? 0) < 0.5;
  const side = !lowCov && fin(s) && Math.abs(s) >= TH.macroMin ? Math.sign(s) : null;
  const drivers = (v.drivers ?? []).filter(x => x.key !== 'trend' && x.contrib !== 0).sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).slice(0, 6)
    .map(x => ({ key: x.key, leg: x.leg ?? null, label: x.label, d: x.d, contrib: x.contrib, reading: x.reading ?? null }));
  return { score: fin(s) ? +s.toFixed(4) : null, scoreWithTrend: v.score ?? null, coverage: v.coverage ?? null, dir: v.dir ?? null, strength: v.strength ?? null, side, drivers,
    why: lowCov ? `coverage ${v.coverage} < 0.5` : fin(s) ? null : 'no score without the trend driver' };
}

// ── layer 5: positioning ─────────────────────────────────────────────────────────────────────────────────────────
/** COT crowding from the engine's positioning driver (d = ±2 = crowded). crowdedSide +1 = the market's long side is crowded. */
export function positioningLayer(market, engineRec) {
  const pos = c => (c ? engineRec?.currencies?.[c] : engineRec?.markets?.[market])?.drivers?.find(x => x.key === 'positioning') ?? null;
  const legs = isFx(market) ? ccysOf(market) : null, sides = [], readings = [];
  if (legs) {
    legs.forEach((c, i) => { const p = pos(c); if (!p) return; readings.push(`${c}: ${p.reading}`); if (Math.abs(p.d) === 2) sides.push((p.d < 0 ? 1 : -1) * (i === 0 ? 1 : -1)); });
  } else { const p = pos(null); if (p) { readings.push(p.reading); if (Math.abs(p.d) === 2) sides.push(p.d < 0 ? 1 : -1); } }
  const uniq = [...new Set(sides)];
  return { crowdedSide: uniq.length === 1 ? uniq[0] : null, crowded: uniq.length > 0, readings: readings.length ? readings : null,
    why: readings.length ? null : engineRec ? 'no COT positioning row for this market' : 'no bias-engine issue' };
}

// ── layer 6: day range ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * `vol` = the vol forecast row for the market ({ hl_median, hl_75 (% of the open), vol_annual (%) }), `open` = the
 * London-day open, `today` = { high, low } so far. σ_day = vol_annual / √252 (as a fraction); missing -> the realised σ20.
 */
export function rangeLayer(vol, { open = null, today = null, sigma20 = null } = {}) {
  const ok = vol && !vol.stale && fin(vol.hl_median) && fin(vol.hl_75);
  const sigmaDay = vol && fin(vol.vol_annual) && vol.vol_annual > 0 ? vol.vol_annual / 100 / Math.sqrt(252) : fin(sigma20) ? sigma20 : null;
  const p50 = ok && fin(open) ? open * vol.hl_median / 100 : null, p75 = ok && fin(open) ? open * vol.hl_75 / 100 : null;
  const used = today && fin(today.high) && fin(today.low) ? today.high - today.low : null;
  return { p50Pct: ok ? vol.hl_median : null, p75Pct: ok ? vol.hl_75 : null, p50: r6(p50), p75: r6(p75), open: r6(open), usedSoFar: r6(used),
    usedOfP50: fin(used) && p50 > 0 ? +(used / p50).toFixed(3) : null, sigmaDay: fin(sigmaDay) ? +sigmaDay.toPrecision(6) : null,
    sigmaSource: vol && fin(vol.vol_annual) ? 'vol line (vol_annual / sqrt 252)' : fin(sigma20) ? 'realised 20-day σ (no vol line)' : null,
    why: [ok ? null : 'no vol line for today', fin(open) ? null : 'no London-day open', fin(sigmaDay) ? null : 'no σ_day'].filter(Boolean).join('; ') || null };
}

// ── the system call ──────────────────────────────────────────────────────────────────────────────────────────────
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** Deterministic call from the layers. Returns { dir, conviction, rule, reasons }. Conviction is null when Neutral. */
export function systemCall(L) {
  if (!L.event?.state) return { dir: 'NEUTRAL', conviction: null, rule: 'event state unknown (calendar unavailable)', reasons: ['event'] };
  if (L.event.state === 'PRE-EVENT') return { dir: 'NEUTRAL', conviction: null, rule: 'tier-1 release pending', reasons: ['event'] };
  const ms = L.macro?.side ?? null, ss = L.structure?.side ?? null;
  if (!ms && !ss) return { dir: 'NEUTRAL', conviction: null, rule: 'no macro side and no structure side', reasons: ['macro', 'structure'] };
  if (!ms) return { dir: 'NEUTRAL', conviction: null, rule: `no macro side (${L.macro?.why ?? `|score ex-trend| < ${TH.macroMin}`})`, reasons: ['macro'] };
  if (!ss) return { dir: 'NEUTRAL', conviction: null, rule: 'no structure side (D1 not confirmed by H4 or by the break of structure)', reasons: ['structure'] };
  if (ms !== ss) return { dir: 'NEUTRAL', conviction: null, rule: 'macro and structure conflict', reasons: ['macro', 'structure'] };
  const side = ms, parts = ['macro and structure agree'];
  let c = 2;
  if (L.structure.w1 === side) { c++; parts.push('W1 agrees'); }
  if (Math.abs(L.macro.score) >= TH.macroStrong) { c++; parts.push(`|engine score| >= ${TH.macroStrong}`); }
  if (regimeSupports(side, L.regime)) { c++; parts.push(`regime supports (risk-${L.regime.risk})`); }
  if (L.positioning?.crowdedSide === side) { c--; parts.push('COT crowded on the same side'); }
  return { dir: dirOf(side), conviction: clamp(c, 1, 5), rule: parts.join('; '), reasons: ['macro', 'structure'] };
}

/** Bullish: the last confirmed D1 swing low; Bearish: the swing high. Not within 3σ_day (or none) -> price ± 1.5σ_day. */
export function invalidationOf(dir, structure, range) {
  const side = sideOf(dir), p = structure?.price, sig = range?.sigmaDay;
  if (!side) return { level: null, basis: 'neutral: no invalidation', distanceSigma: null };
  if (!fin(p)) return { level: null, basis: 'no price', distanceSigma: null };
  const sw = side > 0 ? structure.swingLow : structure.swingHigh;
  const dist = sw && fin(sig) && sig > 0 ? (side > 0 ? p - sw.level : sw.level - p) / (p * sig) : null;
  if (sw && fin(dist) && dist > 0 && dist <= TH.invalidMaxSigma) return { level: sw.level, basis: `last confirmed D1 swing ${side > 0 ? 'low' : 'high'} (${sw.date})`, distanceSigma: +dist.toFixed(2) };
  if (!fin(sig) || !(sig > 0)) return sw && (side > 0 ? sw.level < p : sw.level > p) ? { level: sw.level, basis: `last confirmed D1 swing ${side > 0 ? 'low' : 'high'} (${sw.date}); σ_day unknown`, distanceSigma: null } : { level: null, basis: 'no swing on the right side and no σ_day', distanceSigma: null };
  const lvl = r6(p * (1 - side * TH.invalidFallbackSigma * sig));
  return { level: lvl, basis: `price ${side > 0 ? '−' : '+'} ${TH.invalidFallbackSigma} σ_day (${sw ? (fin(dist) && dist > 0 ? `swing ${dist.toFixed(1)} σ away, beyond ${TH.invalidMaxSigma}` : 'swing on the wrong side of price') : 'no confirmed swing'})`, distanceSigma: TH.invalidFallbackSigma };
}

/**
 * Cleanest FX expressions: crosses of the eight whose two legs' currency scores (ex-trend) point opposite ways by at
 * least TH.macroMin each, so both legs support the same pair direction. Sorted by the gap.
 */
export function cleanestPairs(engineRec, { min = TH.macroMin, top = 6 } = {}) {
  const s = Object.fromEntries(CCYS.map(c => [c, exTrend(engineRec?.currencies?.[c])]).filter(([, v]) => fin(v)));
  const out = [];
  const order = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
    const b = order[i], q = order[j];
    if (!fin(s[b]) || !fin(s[q])) continue;
    if (s[b] >= min && s[q] <= -min) out.push({ pair: b + q, dir: 'BULLISH', base: +s[b].toFixed(3), quote: +s[q].toFixed(3), gap: +(s[b] - s[q]).toFixed(3) });
    else if (s[b] <= -min && s[q] >= min) out.push({ pair: b + q, dir: 'BEARISH', base: +s[b].toFixed(3), quote: +s[q].toFixed(3), gap: +(s[q] - s[b]).toFixed(3) });
  }
  return out.sort((a, b) => b.gap - a.gap || a.pair.localeCompare(b.pair)).slice(0, top);
}
/** Per FX market: both legs' ex-trend scores and whether they back the call. */
export function expressionOf(market, dir, engineRec) {
  if (!isFx(market)) return null;
  const [b, q] = ccysOf(market), sb = exTrend(engineRec?.currencies?.[b]), sq = exTrend(engineRec?.currencies?.[q]), side = sideOf(dir);
  return { legs: { [b]: fin(sb) ? +sb.toFixed(3) : null, [q]: fin(sq) ? +sq.toFixed(3) : null }, clean: !!side && fin(sb) && fin(sq) && Math.sign(sb) === side && Math.sign(sq) === -side };
}

// ── one market, all layers ───────────────────────────────────────────────────────────────────────────────────────
/**
 * inputs: { date, asOf, market, engine (stored bias-engine record), prices { w1, d1, h4, h1 }, calendar, vol (vol line row),
 *           todayRange { open, high, low } }
 * Returns the card without the AI part: { version, date, asOf, market, system, invalidation, expression, layers }.
 */
export function buildLayers(inputs) {
  const { date, asOf, market } = inputs, issueMs = Date.parse(asOf ?? '');
  if (!Number.isFinite(issueMs)) throw new Error('asOf (the issue time) is required');
  const structure = structureLayer(inputs.prices, issueMs);
  const d1c = closedBars(inputs.prices?.d1, issueMs, DAY).map(b => b.c);
  const vol = volRegime(d1c);
  const layers = {
    event: eventLayer(market, inputs.calendar, date, issueMs),
    regime: regimeLayer(market, inputs.engine, vol),
    macro: macroLayer(market, inputs.engine),
    structure,
    positioning: positioningLayer(market, inputs.engine),
    range: rangeLayer(inputs.vol, { open: inputs.todayRange?.open ?? null, today: inputs.todayRange ?? null, sigma20: vol.sigma20 }),
  };
  const system = systemCall(layers);
  const invalidation = invalidationOf(system.dir, structure, layers.range);
  return { version: PROCESS_VERSION, date, asOf, market, system, invalidation, expression: expressionOf(market, system.dir, inputs.engine), layers };
}

// ── history for the pack: the last 5 calls of this process with their outcome (issue price -> next issue price) ──
/** `prev` = earlier stored cards for this market, any order; `priceNow` = today's price. Point-in-time: only earlier issues. */
export function historyFor(prev, date, priceNow, n = 5) {
  const rows = (prev ?? []).filter(c => c?.date && c.date < date).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-n);
  return rows.map((c, i) => {
    const p0 = c.layers?.structure?.price, p1 = i + 1 < rows.length ? rows[i + 1].layers?.structure?.price : priceNow, s = sideOf(c.call?.dir);
    const ret = fin(p0) && fin(p1) && p0 > 0 ? Math.log(p1 / p0) : null;
    return { date: c.date, dir: c.call?.dir ?? null, by: c.call?.by ?? null, conviction: c.call?.conviction ?? null, systemDir: c.system?.dir ?? null,
      outcome: ret == null ? null : !s ? 'no call' : Math.sign(ret) === s ? 'right' : ret === 0 ? 'flat' : 'wrong', moveSigma: ret != null && c.layers?.range?.sigmaDay > 0 ? +(ret / c.layers.range.sigmaDay).toFixed(2) : null };
  });
}

// ── the AI pack: the same keys every day, nulls with their reason ────────────────────────────────────────────────

/** Every number a valid AI invalidation may take: the system's and the two confirmed swings. Nothing else. */
export const allowedLevels = card => [card.invalidation?.level, card.layers.structure.swingHigh?.level, card.layers.structure.swingLow?.level].filter(fin);
export function buildPack(card, history = []) {
  const L = card.layers;
  return {
    contract: AI_PROMPT_VERSION, version: PROCESS_VERSION, date: card.date, asOf: card.asOf, market: card.market, kind: isFx(card.market) ? 'fx' : card.market === 'GOLD' ? 'metal' : 'index',
    price: { last: L.structure.price ?? null, asOf: L.structure.priceAsOf ?? null },
    layers: {
      event: { state: L.event.state ?? null, pending: L.event.pending ?? null, laterToday: L.event.laterToday ?? null, previous: L.event.previous ?? null, why: L.event.why ?? null },
      regime: { risk: L.regime.risk ?? null, R: L.regime.R ?? null, vol: L.regime.vol ?? null, volPct1y: L.regime.volPct1y ?? null, smile: L.regime.smile ?? null, riskRole: L.regime.role ?? null, why: L.regime.why ?? null },
      macro: { scoreExTrend: L.macro.score ?? null, side: L.macro.side ?? null, coverage: L.macro.coverage ?? null, engineDir: L.macro.dir ?? null, engineStrength: L.macro.strength ?? null, drivers: L.macro.drivers ?? null, why: L.macro.why ?? null },
      structure: { w1: L.structure.w1 ?? null, d1: L.structure.d1 ?? null, h4: L.structure.h4 ?? null, swingHigh: L.structure.swingHigh?.level ?? null, swingLow: L.structure.swingLow?.level ?? null,
        breakOfStructure: L.structure.bos ?? null, side: L.structure.side ?? null, why: L.structure.why ?? null },
      positioning: { crowded: L.positioning.crowded ?? null, crowdedSide: L.positioning.crowdedSide ?? null, readings: L.positioning.readings ?? null, why: L.positioning.why ?? null },
      range: { p50: L.range.p50 ?? null, p75: L.range.p75 ?? null, open: L.range.open ?? null, usedSoFar: L.range.usedSoFar ?? null, usedOfP50: L.range.usedOfP50 ?? null, sigmaDay: L.range.sigmaDay ?? null, why: L.range.why ?? null },
    },
    system: { dir: card.system.dir, conviction: card.system.conviction ?? null, rule: card.system.rule },
    invalidation: { level: card.invalidation.level ?? null, basis: card.invalidation.basis, distanceSigma: card.invalidation.distanceSigma ?? null },
    allowedInvalidations: allowedLevels(card),
    history: history.map(h => ({ date: h.date, dir: h.dir, by: h.by, conviction: h.conviction, systemDir: h.systemDir, outcome: h.outcome, moveSigma: h.moveSigma })),
  };
}
/** The fixed top-level and layer keys (the pack shape test checks these never move). */
export const PACK_KEYS = ['contract', 'version', 'date', 'asOf', 'market', 'kind', 'price', 'layers', 'system', 'invalidation', 'allowedInvalidations', 'history'];
export const LAYER_KEYS = { event: ['state', 'pending', 'laterToday', 'previous', 'why'], regime: ['risk', 'R', 'vol', 'volPct1y', 'smile', 'riskRole', 'why'],
  macro: ['scoreExTrend', 'side', 'coverage', 'engineDir', 'engineStrength', 'drivers', 'why'], structure: ['w1', 'd1', 'h4', 'swingHigh', 'swingLow', 'breakOfStructure', 'side', 'why'],
  positioning: ['crowded', 'crowdedSide', 'readings', 'why'], range: ['p50', 'p75', 'open', 'usedSoFar', 'usedOfP50', 'sigmaDay', 'why'] };

// ── the AI contract ──────────────────────────────────────────────────────────────────────────────────────────────
export const AI_TEMPERATURE = 0;
export const AI_SYSTEM_PROMPT = `You are the reviewing analyst of the desk's daily bias process (contract ${AI_PROMPT_VERSION}).
You receive ONE JSON pack for ONE market. It always has the same keys. A null value means the data is missing; its layer's "why" says why.
The pack holds six layers (event, regime, macro, structure, positioning, range), the deterministic system call with its conviction and invalidation, the levels you may use as an invalidation (allowedInvalidations), and the last five calls of this process with their outcomes.

Your job: ACCEPT the system call, or OVERRIDE it.
Rules:
1. Use only the pack. No outside knowledge, no news, no prices, no events that are not in the pack.
2. Override only for a reason tied to named pack fields, for example: COT crowded against the call (positioning.crowdedSide), event risk later today (event.laterToday), the day's range already used (range.usedOfP50), a regime against the side (regime.risk with regime.riskRole), weekly structure against the call (structure.w1), or a run of wrong calls in history.
3. Do not invent levels. "invalidation" must be null or exactly one number from allowedInvalidations, on the losing side of price.last for the direction you give. For NEUTRAL it must be null.
4. ACCEPT means the system's dir and conviction unchanged (invalidation null or the system's level). Any change of dir or conviction is an OVERRIDE.
5. conviction is an integer 1-5 (5 = strongest). For NEUTRAL give 1.
6. reason: at most 2 sentences, naming the pack fields you used. Quote no number that is not in the pack.
7. When the evidence is mixed or thin, ACCEPT. Overriding is the exception.

Reply with ONE JSON object and nothing else:
{"decision":"ACCEPT"|"OVERRIDE","dir":"BULLISH"|"BEARISH"|"NEUTRAL","conviction":1-5,"reason":"...","invalidation":number|null}`;

export const promptOf = pack => `Pack (${AI_PROMPT_VERSION}):\n${JSON.stringify(pack)}\n\nReply with the JSON object only.`;

/** Words that tie a reason to the pack (a field or layer name). */
const FIELD_WORDS = ['event', 'pending', 'later', 'release', 'regime', 'risk', 'vol', 'smile', 'macro', 'score', 'driver', 'coverage', 'structure', 'w1', 'd1', 'h4', 'weekly', 'daily',
  'swing', 'break', 'bos', 'trend', 'positioning', 'cot', 'crowd', 'range', 'p50', 'p75', 'sigma', 'σ', 'history', 'calls', 'invalidation', 'system', 'conviction', 'engine'];
const numsIn = s => (String(s).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
const sentences = s => String(s).split(/(?<=[.!?])\s+(?=[A-Z(])/).filter(x => x.trim()).length;
const sameLevel = (a, b) => fin(a) && fin(b) && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);

/**
 * Validate a parsed AI reply against the pack. Returns { ok, value, errors }. value = { decision, dir, conviction, reason,
 * invalidation } with ACCEPT normalised to the system's call.
 */
export function validateAiReply(o, pack) {
  const errors = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['reply is not a JSON object'] };
  const extra = Object.keys(o).filter(k => !['decision', 'dir', 'conviction', 'reason', 'invalidation'].includes(k));
  if (extra.length) errors.push(`unknown keys: ${extra.join(', ')}`);
  if (!['ACCEPT', 'OVERRIDE'].includes(o.decision)) errors.push('decision must be ACCEPT or OVERRIDE');
  if (!DIRS.includes(o.dir)) errors.push('dir must be BULLISH, BEARISH or NEUTRAL');
  if (!Number.isInteger(o.conviction) || o.conviction < 1 || o.conviction > 5) errors.push('conviction must be an integer 1-5');
  const reason = typeof o.reason === 'string' ? o.reason.trim() : '';
  if (!reason) errors.push('reason is required');
  else {
    if (reason.length > 400) errors.push('reason is longer than 400 characters');
    if (sentences(reason) > 2) errors.push('reason has more than 2 sentences');
    const low = reason.toLowerCase();
    if (!FIELD_WORDS.some(w => low.includes(w))) errors.push('reason names no pack field');
    const packText = JSON.stringify(pack), packNums = numsIn(packText);
    const foreign = numsIn(reason).filter(x => Math.abs(x) >= 10 || !Number.isInteger(x)).filter(x => !packNums.some(p => Math.abs(p - x) <= Math.max(1e-9, Math.abs(p) * 1e-6)) && !packText.includes(String(x)));
    if (foreign.length) errors.push(`reason quotes numbers that are not in the pack: ${foreign.slice(0, 4).join(', ')}`);
  }
  const sys = pack?.system ?? {}, sysConv = sys.dir === 'NEUTRAL' ? 1 : sys.conviction;
  let inv = o.invalidation;
  if (inv !== null && inv !== undefined && !fin(inv)) errors.push('invalidation must be a number or null');
  if (fin(inv)) {
    if (o.dir === 'NEUTRAL') errors.push('a NEUTRAL call takes no invalidation');
    else if (!(pack?.allowedInvalidations ?? []).some(l => sameLevel(inv, l))) errors.push(`invalidation ${inv} is not one of the pack's levels (${(pack?.allowedInvalidations ?? []).join(', ') || 'none'})`);
    else if (fin(pack?.price?.last) && (o.dir === 'BULLISH' ? inv >= pack.price.last : inv <= pack.price.last)) errors.push('invalidation is on the wrong side of price');
  }
  if (o.decision === 'ACCEPT' && DIRS.includes(o.dir) && Number.isInteger(o.conviction)) {
    if (o.dir !== sys.dir || o.conviction !== sysConv) errors.push(`ACCEPT must keep the system call (${sys.dir} ${sysConv}); a change is an OVERRIDE`);
    if (fin(inv) && !sameLevel(inv, pack?.invalidation?.level)) errors.push('ACCEPT must keep the system invalidation (or give null)');
  }
  if (o.decision === 'OVERRIDE' && o.dir === sys.dir && o.conviction === sysConv) errors.push('OVERRIDE changes nothing: give ACCEPT');
  if (errors.length) return { ok: false, errors };
  const value = { decision: o.decision, dir: o.dir, conviction: o.dir === 'NEUTRAL' ? null : o.conviction, reason,
    invalidation: o.dir === 'NEUTRAL' ? null : fin(inv) ? inv : o.decision === 'ACCEPT' || o.dir === sys.dir ? pack?.invalidation?.level ?? null : null };
  return { ok: true, value };
}

/** Tolerant JSON parse: the first {...} block of a reply. */
export function parseReplyJson(txt) {
  const s = String(txt ?? ''), i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

/**
 * The AI step for one pack: one call at the lowest temperature, validated; an invalid reply is retried once with the
 * errors quoted back (js/deskRun.js askValidated), then the system call stands. Never throws.
 * callModel({ task, system, prompt, maxTokens, label, temperature }) -> { text, usage?, model?, truncated? }
 */
export async function runProcessAi({ pack, callModel, parseJson = parseReplyJson, task = 'desk-analyst', maxTokens = 6000, retryDelayMs = 4000,
  system = AI_SYSTEM_PROMPT, prompt = promptOf(pack), label = `bias-process:${pack.market}` }) {
  const ask = checkpointed(null);
  let r;
  try {
    r = await ask({ callModel: a => callModel({ ...a, temperature: AI_TEMPERATURE }), parseJson: t => parseJson(t), task, system, prompt,
      maxTokens, validate: o => validateAiReply(o, pack), label, retryDelayMs });
  } catch (e) { r = { ok: false, errors: [e.message], attempts: [] }; }
  const attempts = (r.attempts ?? []).map(a => ({ ok: a.ok ?? false, errors: a.errors ?? (a.error ? [a.error] : undefined), model: a.model ?? null, usage: a.usage ?? null }));
  return r.ok ? { ok: true, ...r.value, attempts } : { ok: false, errors: r.errors ?? ['failed'], attempts };
}

/** The published card: the AI's call (or the system's when the AI failed), with the system call beside it. */
export function finishCard(card, ai) {
  const sys = card.system;
  const call = ai?.ok
    ? { dir: ai.dir, conviction: ai.conviction, by: ai.decision === 'ACCEPT' ? 'ai-accept' : 'ai-override', invalidation: ai.invalidation ?? null }
    : { dir: sys.dir, conviction: sys.conviction, by: ai ? 'system-fallback' : 'system', invalidation: card.invalidation.level ?? null };
  return { ...card, call, system: { dir: sys.dir, conviction: sys.conviction, rule: sys.rule, invalidation: card.invalidation.level ?? null },
    ai: ai ? (ai.ok ? { decision: ai.decision, reason: ai.reason, prompt: AI_PROMPT_VERSION, attempts: ai.attempts } : { decision: null, reason: null, prompt: AI_PROMPT_VERSION, error: ai.errors.join('; '), attempts: ai.attempts }) : null };
}

/** The whole day: cards for every market plus the cleanest FX expressions. */
export function dayRecord({ date, asOf, cards, engine, issuedAt = null, inputsStatus = null, code = null }) {
  return { version: PROCESS_VERSION, prompt: AI_PROMPT_VERSION, date, asOf, issuedAt, engineAsOf: engine?.asOf ?? null, engineVersion: engine?.version ?? null,
    cleanest: cleanestPairs(engine), markets: Object.fromEntries(cards.map(c => [c.market, c])), inputsStatus, code,
    note: 'Systematic-discretionary bias, scored forward head to head (process-ai and process-system); no forward record yet, not a validated trade signal.' };
}
