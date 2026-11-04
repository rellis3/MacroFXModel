/**
 * More world data for the Desk Terminal and the desk's analysts (owner, 2026-11-04: "what other cool data can we show
 * on the new terminal? There has to be more"). Pure parsers and boards, each fed by a free source:
 *
 *   fairValue     BIS real effective exchange rates (WS_EER, monthly, broad basket): how far each currency sits from
 *                 its own 20-year average, the slow anchor a fair-value view starts from
 *   cliBoard      OECD composite leading indicators (DF_CLI, monthly): whose economy is turning up or down, by phase
 *   commodityFx   the commodity basket behind a commodity currency (RBA index for AUD, the BoC BCPI for CAD, Brent for
 *                 NOK) set against the currency itself: a gap is a currency lagging or running ahead of its exports
 *   carryVol      every pair of the eight: policy-rate carry against 20-day realised volatility, the carry trade's
 *                 pay for its risk
 *   sessionHeat   which London hours each market actually moves in, from hourly bars
 *   ratioBoard    one market against another over time (copper/gold, the growth-against-fear ratio; Brent less WTI)
 *
 * Pure. Tested in js/globalBoards.test.mjs against saved responses in tests/fixtures/global_boards/.
 */
export const G8 = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
// the market's quoting order: the earlier currency is the base
const ORDER = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
export const PAIRS = ORDER.flatMap((a, i) => ORDER.slice(i + 1).map(b => ({ id: a + b, base: a, quote: b, oanda: `${a}_${b}` })));
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/** CSV with quoted fields → rows of strings. */
export function csvRows(text) {
  const rows = [], s = String(text ?? '').replace(/^﻿/, '');
  let field = '', row = [], q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
/** An SDMX CSV (BIS or OECD) → { REF_AREA: [{ period, value }] } sorted by period. */
export function parseSdmx(text) {
  const rows = csvRows(text), head = rows[0] ?? [], A = head.indexOf('REF_AREA'), T = head.indexOf('TIME_PERIOD'), V = head.indexOf('OBS_VALUE');
  if (A < 0 || T < 0 || V < 0) throw new Error('SDMX CSV: unexpected header');
  const out = {};
  for (const r of rows.slice(1)) { const v = parseFloat(r[V]); if (!r[A] || !/^\d{4}-\d{2}$/.test(r[T] ?? '') || !Number.isFinite(v)) continue; (out[r[A]] ??= []).push({ period: r[T], value: v }); }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.period.localeCompare(b.period));
  return out;
}
export const parseEer = parseSdmx;
export const parseOecdCli = parseSdmx;

// BIS and OECD area codes → the currency they price (XM / EA20 = the euro area)
export const AREA_CCY = { US: 'USD', USA: 'USD', XM: 'EUR', EA20: 'EUR', GB: 'GBP', GBR: 'GBP', JP: 'JPY', JPN: 'JPY', AU: 'AUD', AUS: 'AUD', NZ: 'NZD', NZL: 'NZD', CA: 'CAD', CAN: 'CAD', CH: 'CHF', CHE: 'CHF', CN: 'CNY', CHN: 'CNY', NO: 'NOK', SE: 'SEK', MX: 'MXN', ZA: 'ZAR', BR: 'BRL', IN: 'INR', KR: 'KRW', IND: 'INR', KOR: 'KRW', MEX: 'MXN', BRA: 'BRL', DEU: 'EUR', NOR: 'NOK', SWE: 'SEK', ZAF: 'ZAR' };
const AREA_NAME = { US: 'United States', USA: 'United States', XM: 'Euro area', EA20: 'Euro area', GB: 'United Kingdom', GBR: 'United Kingdom', JP: 'Japan', JPN: 'Japan', AU: 'Australia', AUS: 'Australia', NZ: 'New Zealand', NZL: 'New Zealand', CA: 'Canada', CAN: 'Canada', CH: 'Switzerland', CHE: 'Switzerland', CN: 'China', CHN: 'China', NO: 'Norway', SE: 'Sweden', MX: 'Mexico', ZA: 'South Africa', BR: 'Brazil', IN: 'India', KR: 'South Korea', DEU: 'Germany', IND: 'India', KOR: 'South Korea', MEX: 'Mexico', BRA: 'Brazil', NOR: 'Norway', SWE: 'Sweden', ZAF: 'South Africa' };

/**
 * Fair value from the real effective exchange rate: the latest month against its own average over `years`.
 * Above the average = dearer in real terms than usual (a headwind for exports, a slow pull back); below = cheaper.
 */
export function fairValue(byArea, { years = 20 } = {}) {
  const rows = [];
  for (const [area, s] of Object.entries(byArea ?? {})) {
    if (s.length < 36) continue;
    const last = s.at(-1), win = s.slice(-years * 12).map(x => x.value), avg = mean(win), dev = (last.value / avg - 1) * 100;
    const z = (last.value - avg) / (sd(win) || 1), y1 = s.length > 12 ? s.at(-13).value : null;
    rows.push({ area, ccy: AREA_CCY[area] ?? area, name: AREA_NAME[area] ?? area, period: last.period, reer: r2(last.value), avg: r2(avg), devPct: r2(dev), z: r2(z), chg12m: y1 ? r2((last.value / y1 - 1) * 100) : null,
      years: r2(win.length / 12), label: dev >= 10 ? 'expensive' : dev >= 5 ? 'rich' : dev <= -10 ? 'very cheap' : dev <= -5 ? 'cheap' : 'near fair', spark: s.slice(-60).map(x => x.value) });
  }
  return { rows: rows.sort((a, b) => b.devPct - a.devPct), asOf: rows.map(r => r.period).sort().at(-1) ?? null,
    label: 'BIS real effective exchange rate (broad basket, CPI-based) against its own 20-year average: above = dearer than usual, below = cheaper. A slow anchor, not a timing signal.' };
}

/** OECD leading indicators: level (100 = trend), 1- and 3-month change and the cycle phase. */
export function cliBoard(byArea) {
  const rows = [];
  for (const [area, s] of Object.entries(byArea ?? {})) {
    if (s.length < 4) continue;
    const last = s.at(-1), m1 = last.value - s.at(-2).value, m3 = last.value - s.at(-4).value, up = m3 > 0;
    const phase = last.value >= 100 ? (up ? 'expansion' : 'slowdown') : up ? 'recovery' : 'contraction';
    rows.push({ area, ccy: AREA_CCY[area] ?? area, name: AREA_NAME[area] ?? area, period: last.period, cli: r2(last.value), chg1m: r2(m1), chg3m: r2(m3), phase, spark: s.slice(-24).map(x => x.value) });
  }
  const order = { expansion: 0, recovery: 1, slowdown: 2, contraction: 3 };
  return { rows: rows.sort((a, b) => order[a.phase] - order[b.phase] || b.chg3m - a.chg3m), asOf: rows.map(r => r.period).sort().at(-1) ?? null,
    label: 'OECD composite leading indicators (amplitude adjusted, 100 = trend): above 100 and rising = expansion, above and falling = slowdown, below and falling = contraction, below and rising = recovery. They lead the economy by about six months.' };
}

const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
/** RBA statistical table I2 (commodity prices) → [{ date: 'YYYY-MM', value }] for one column. */
export function parseRbaI2(csv, column = 'Commodity prices – US$') {
  const rows = csvRows(csv), head = rows.find(r => r[0] === 'Title'); if (!head) return [];
  const col = head.indexOf(column); if (col < 1) return [];
  return rows.filter(r => DMY.test(r[0] ?? '') && Number.isFinite(parseFloat(r[col]))).map(r => { const [, , m, y] = DMY.exec(r[0]); return { date: `${y}-${m}`, value: parseFloat(r[col]) }; })
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** Daily [{date, close}] → month-end values [{ date: 'YYYY-MM', value }]. */
export function monthly(daily) {
  const m = new Map(); for (const x of daily ?? []) if (x?.date && Number.isFinite(x.close ?? x.value)) m.set(String(x.date).slice(0, 7), x.close ?? x.value);
  return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}
const chg = (s, n) => (s.length > n && s.at(-1 - n).value ? (s.at(-1).value / s.at(-1 - n).value - 1) * 100 : null);
/**
 * A commodity currency against its exports. commodity and fx are monthly [{date:'YYYY-MM', value}]; fxInverted when
 * the pair quotes the dollar first (USD/CAD up = CAD weaker), so the currency's own strength is the inverse.
 */
export function commodityFx({ ccy, basket, commodity, fx, fxInverted = false }) {
  const cur = (fx ?? []).map(x => ({ date: x.date, value: fxInverted ? 1 / x.value : x.value }));
  const by = new Map(cur.map(x => [x.date, x.value])), both = (commodity ?? []).filter(x => by.has(x.date));
  if (both.length < 14) return { ccy, basket, ok: false, error: `only ${both.length} overlapping months` };
  const c = both.map(x => ({ date: x.date, value: x.value })), f = both.map(x => ({ date: x.date, value: by.get(x.date) }));
  const dc = c.slice(1).map((x, i) => Math.log(x.value / c[i].value)), df = f.slice(1).map((x, i) => Math.log(x.value / f[i].value)), k = Math.min(36, dc.length);
  const a = dc.slice(-k), b = df.slice(-k), ma = mean(a), mb = mean(b), corr = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0) || 1);
  const c12 = chg(c, 12), f12 = chg(f, 12), gap = c12 != null && f12 != null ? c12 - f12 : null;
  return { ccy, basket, ok: true, asOf: c.at(-1).date, commodity3m: r2(chg(c, 3)), commodity12m: r2(c12), ccy3m: r2(chg(f, 3)), ccy12m: r2(f12), gap12m: r2(gap), corr36m: r2(corr),
    read: gap == null ? '' : gap >= 8 ? `${ccy} has lagged its commodity basket by ${gap.toFixed(1)}pp over a year: cheap against its exports` : gap <= -8 ? `${ccy} has run ${(-gap).toFixed(1)}pp ahead of its commodity basket over a year: rich against its exports` : `${ccy} is moving roughly with its commodity basket`,
    spark: { commodity: c.slice(-36).map(x => x.value), ccy: f.slice(-36).map(x => x.value) } };
}

/** Annualised realised volatility (%) of the last n daily log returns. */
export function realisedVol(closes, n = 20) {
  const c = (closes ?? []).filter(x => x > 0); if (c.length < n + 1) return null;
  const w = c.slice(-n - 1), lr = w.slice(1).map((x, i) => Math.log(x / w[i]));
  return sd(lr) * Math.sqrt(252) * 100;
}
/**
 * Carry against volatility for every pair of the eight. rates: { CCY: % }; closes: { PAIRID: [close…] } oldest first.
 * carry = base rate − quote rate (what holding the pair long earns a year); ratio = carry ÷ realised vol.
 */
export function carryVol(rates, closes, { n = 20 } = {}) {
  const rows = [];
  for (const p of PAIRS) {
    const rb = rates?.[p.base], rq = rates?.[p.quote], vol = realisedVol(closes?.[p.id], n);
    if (!Number.isFinite(rb) || !Number.isFinite(rq) || !vol) continue;
    const carry = rb - rq, ratio = carry / vol;
    rows.push({ pair: p.id, base: p.base, quote: p.quote, carry: r2(carry), vol: r2(vol), ratio: r2(ratio), side: carry >= 0 ? 'long' : 'short', earn: r2(Math.abs(carry)), payRatio: r2(Math.abs(ratio)) });
  }
  return { rows: rows.sort((a, b) => b.payRatio - a.payRatio), label: `carry = the policy-rate gap a year (long the higher-yielding side), vol = ${n}-day realised, annualised; the ratio is the carry earned per unit of risk. Above ~0.5 a carry trade pays well for its risk; carry trades unwind together in risk-off.` };
}

const londonHour = ms => Number(new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' })) % 24;
/**
 * Which London hours each market moves in. bars: { INST: [{ time (ISO or unix s), open, high, low }] } hourly.
 * Per hour: the mean high-to-low as % of the open, and its share of the day's total.
 */
export function sessionHeat(bars) {
  const rows = [];
  for (const [inst, bs] of Object.entries(bars ?? {})) {
    const sum = Array(24).fill(0), n = Array(24).fill(0);
    for (const b of bs ?? []) { const t = typeof b.time === 'number' ? b.time * 1000 : Date.parse(b.time); if (!Number.isFinite(t) || !(b.open > 0)) continue; const h = londonHour(t); sum[h] += (b.high - b.low) / b.open * 100; n[h]++; }
    const hours = sum.map((s, h) => (n[h] ? s / n[h] : 0)), tot = hours.reduce((a, b) => a + b, 0) || 1, peak = hours.indexOf(Math.max(...hours));
    if (n.every(x => !x)) continue;
    rows.push({ inst, hours: hours.map(r2), share: hours.map(h => r2((h / tot) * 100)), peakHour: peak, days: Math.round(n.reduce((a, b) => a + b, 0) / 24) });
  }
  return { rows, label: 'mean hourly high-to-low (% of the open) by London hour over the window; the brightest hours are when the market does its moving.' };
}

/** One market against another: { date, a, b } aligned daily → the ratio, its 20/60-day change and its z over a year. */
export function ratioBoard(a, b, { label = '', diff = false } = {}) {
  const bm = new Map((b ?? []).map(x => [x.date, x.close])), s = (a ?? []).filter(x => bm.has(x.date) && x.close > 0 && bm.get(x.date) > 0).map(x => ({ date: x.date, v: diff ? x.close - bm.get(x.date) : x.close / bm.get(x.date) }));
  if (s.length < 30) return { ok: false, label, error: `only ${s.length} aligned days` };
  const last = s.at(-1).v, at = n => (s.length > n ? s.at(-1 - n).v : null), pc = n => { const o = at(n); return o == null ? null : diff ? last - o : (last / o - 1) * 100; };
  const yr = s.slice(-252).map(x => x.v);
  return { ok: true, label, date: s.at(-1).date, value: +last.toPrecision(5), chg20: r2(pc(20)), chg60: r2(pc(60)), z1y: r2((last - mean(yr)) / (sd(yr) || 1)), unit: diff ? '$' : '%', spark: s.slice(-120).map(x => +x.v.toPrecision(5)) };
}
