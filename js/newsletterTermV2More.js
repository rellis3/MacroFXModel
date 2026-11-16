/**
 * js/newsletterTermV2More.js: the teaching and reference stories of the terminal newsletter v2 that come from the daily market bundle, the desk run and the
 * terminal's own boards rather than from the desk writer: the backdrop table (what each level measures), what the fall in yields is made of, the masthead
 * strip (key markets as a multiple of their forecast median day), yesterday's review as contribution bars (helped or hurt, no direction words), today's range
 * lines for every market the desk covers, the desk read against what price did, the economist's brief for the next release, the question of the day, and
 * where each figure comes from. Pure: data in, story objects out; a missing source returns null (the caller says "not available").
 * No entry, target, stop, size, zone or plan reaches a story: contributions are labelled by market only, range lines carry no shading for a lean.
 */
import * as P from './newsletterTermV2Prose.js';
import * as G from './newsletterTermV2Svg.js';
import { groupOf } from './deskPack.js';
import { cardDrivers } from './terminal/cardExplain.js';
import { priceRead } from './liveLayerCore.js';
import { questionFor } from './questionOfDay.js';
import { QUESTIONS } from './questionBank.js';
import { WEB_QUESTIONS } from './questionBankWeb.js';

const { esc, fmt } = G;
const fin = v => typeof v === 'number' && Number.isFinite(v);
const num = x => (x == null || x === '' ? null : (Number.isFinite(+x) ? +x : null));
const f2 = (v, d = 2) => Number(v).toFixed(d);
const signed = (v, d = 2, unit = '') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}${unit}`;

/** The last two non-null values of a bundle series: { v, prev, date, i, j }. */
export function lastTwo(bundle, key) {
  const v = bundle?.series?.[key], d = bundle?.dates; if (!v || !d) return null;
  let i = v.length - 1; while (i >= 0 && num(v[i]) == null) i--; if (i < 0) return null;
  let j = i - 1; while (j >= 0 && num(v[j]) == null) j--;
  return { v: +v[i], prev: j >= 0 ? +v[j] : null, date: d[i], i, j };
}
const at = (bundle, key, i) => { const x = bundle?.series?.[key]?.[i]; return fin(+x) ? +x : null; };

// ── the backdrop table ──────────────────────────────────────────────────────────────────────────────────────────
export function backdropTable(bundle, { winds, ws, stress } = {}) {
  if (!bundle?.series) return null;
  const row = (name, key, { mult = 1, d = 2, unit = '', chgUnit = 'bp', chgMult = 100, measures }) => { const x = lastTwo(bundle, key); if (!x) return null; return { name, now: `${f2(x.v * mult, d)}${unit}`, asOf: x.date.slice(5), chg: x.prev != null ? signed((x.v - x.prev) * chgMult, chgUnit === '%' ? 2 : 0, chgUnit === '%' ? '%' : 'bp') : '', measures }; };
  const rows = [
    row('US 10-year yield', 'us10y', { unit: '%', measures: 'What the government pays to borrow for ten years.' }),
    row('Real 10-year yield', 'tips', { unit: '%', measures: 'The same, after allowing for inflation.' }),
    row('Inflation expected', 'bei', { unit: '%', measures: 'The gap between the two: what the market expects prices to do.' }),
  ];
  const a = lastTwo(bundle, 'us10y'), b = lastTwo(bundle, 'us2y');
  if (a && b && a.date === b.date) rows.push({ name: '2s10s curve', now: `${Math.round((a.v - b.v) * 100)}bp`, asOf: a.date.slice(5), chg: a.prev != null && b.prev != null ? signed(((a.v - b.v) - (a.prev - b.prev)) * 100, 0, 'bp') : '', measures: 'Long yields minus short ones. Below zero, an inverted curve, has come before past slowdowns.' });
  rows.push(row('Junk spread', 'hy', { mult: 100, d: 0, unit: 'bp', chgMult: 100, measures: 'The extra yield investors demand to hold risky company debt.' }), row('VIX', 'vix', { d: 1, chgUnit: 'pt', chgMult: 1, measures: 'The market\'s price for stock-market swings over the next month.' }));
  const dx = lastTwo(bundle, 'dxy'); if (dx) rows.push({ name: 'Dollar index', now: f2(dx.v, 1), asOf: dx.date.slice(5), chg: dx.prev ? signed((dx.v / dx.prev - 1) * 100, 2, '%') : '', measures: 'The dollar against a basket of the main currencies.' });
  if (stress) rows.push({ name: 'Risk tone', now: String(stress).toUpperCase(), asOf: 'live', chg: '', measures: 'The seven stress gauges at a glance: OK, WATCH or STRESS.' });
  if (winds?.[0]) rows.push({ name: 'Fed hike odds', now: `${Math.round(winds[0].hike)}%`, asOf: 'live', chg: fin(winds[0].hikeAgo?.d1) ? signed(winds[0].hike - winds[0].hikeAgo.d1, 0, 'pt') : '', measures: 'The futures market\'s chance of a rate rise by the next meeting window.' });
  const list = rows.filter(Boolean).map(r => ({ ...r, chg: r.chg.replace(/^([+−]?[\d.]+)pt$/, '$1pt') }));
  return list.length >= 4 ? list : null;
}

// ── what the fall (or rise) in yields is made of ─────────────────────────────────────────────────────────────────
/** 10-year yield = real yield + expected inflation. The shared-date rule: the last date on which all three series exist, and the date 20 observations earlier on which all three exist. */
export function yieldsMadeOf(bundle) {
  const s = bundle?.series; if (!s?.us10y || !s?.tips || !s?.bei) return null;
  const ok = i => num(s.us10y[i]) != null && num(s.tips[i]) != null && num(s.bei[i]) != null;
  let i = s.us10y.length - 1; while (i >= 0 && !ok(i)) i--; if (i < 0) return null;
  let j = i - 20; while (j >= 0 && !ok(j)) j--; if (j < 0) return null;
  const d10 = (s.us10y[i] - s.us10y[j]) * 100, dReal = (s.tips[i] - s.tips[j]) * 100, dBei = (s.bei[i] - s.bei[j]) * 100;
  if (Math.abs(d10) < 3) return null;
  const share = x => Math.round(x / d10 * 100);
  const lead = Math.abs(dReal) >= Math.abs(dBei) ? 'real' : 'inflation';
  const textbook = lead === 'real' ? 'Real yields leading is what a tighter policy path or stronger growth pricing looks like.' : 'Expected inflation leading is what an inflation scare looks like.';
  return { from: bundle.dates[j], to: bundle.dates[i], d10, dReal, dBei, shareReal: share(dReal), shareBei: share(dBei), lead, textbook };
}
export function yieldBar(k, y, width = 360) {
  const tot = Math.max(Math.abs(y.dReal) + Math.abs(y.dBei), 1), x0 = 16, w = width - 32, Ht = 104, o = [G.svgOpen(width, Ht, '10-year yield change split into real yield and expected inflation')];
  o.push(G.T(x0, 20, `10-year yield ${signed(y.d10, 0, 'bp')} over 20 observations`, { size: 11, weight: 700, fill: k.tx }));
  const w1 = Math.max(3, Math.abs(y.dReal) / tot * w), w2 = Math.max(3, Math.abs(y.dBei) / tot * w);
  o.push(`<rect x="${x0}" y="32" width="${w1.toFixed(1)}" height="22" rx="6" fill="${k.pur2}" fill-opacity=".9"/><rect x="${(x0 + w1 + 3).toFixed(1)}" y="32" width="${w2.toFixed(1)}" height="22" rx="6" fill="${k.gold}" fill-opacity=".9"/>`);
  o.push(`<rect x="${x0}" y="66" width="10" height="10" rx="2" fill="${k.pur2}"/>` + G.T(x0 + 16, 75, `real yield ${signed(y.dReal, 0, 'bp')}`, { size: 10, fill: k.tx2 }) + `<rect x="${x0 + 150}" y="66" width="10" height="10" rx="2" fill="${k.gold}"/>` + G.T(x0 + 166, 75, `expected inflation ${signed(y.dBei, 0, 'bp')}`, { size: 10, fill: k.tx2 }));
  o.push(G.T(x0, 94, `${y.from} to ${y.to}`, { size: 9.5, fill: k.tx3 }));
  return o.join('') + '</svg>';
}

// ── the masthead strip: key markets as a multiple of their forecast median day ─────────────────────────────────────
export const STRIP = [['NQ', 'nq', 'Nasdaq'], ['SPX500', 'spx', 'S&P 500'], ['US2000', 'r2k', 'Russell 2000'], ['DE30', 'de30', 'DAX'], ['UK100', 'uk100', 'FTSE 100'], ['GOLD', 'gold', 'Gold'], ['BTCUSD', 'btc', 'Bitcoin'],
  ['WTI', 'oil', 'Oil'], ['EURUSD', 'eurusd', 'EUR/USD'], ['GBPUSD', 'gbpusd', 'GBP/USD'], ['USDJPY', 'usdjpy', 'USD/JPY'], ['USDCAD', 'usdcad', 'USD/CAD'], ['AUDUSD', 'audusd', 'AUD/USD'], ['USDCHF', 'usdchf', 'USD/CHF']];
export function mastheadStrip(bundle, fc) {
  if (!bundle?.series || !fc?.instruments) return null;
  const rows = STRIP.map(([inst, key, name]) => { const x = lastTwo(bundle, key), med = fc.instruments[inst]?.hl_median; if (!x || x.prev == null || !(med > 0)) return null; const pct = (x.v / x.prev - 1) * 100; return { name, last: x.v, date: x.date, pct, mult: Math.abs(pct) / med }; }).filter(Boolean);
  return rows.length >= 6 ? rows : null;
}
export function biggestLine(rows) {
  if (!rows?.length) return '';
  const top = [...rows].sort((a, b) => b.mult - a.mult).slice(0, 3);
  return `The last full day: ${top.map(r => `${r.name} ${signed(r.pct, 1, '%')} (${r.mult.toFixed(1)}× a normal day)`).join(', ')}.`;
}

// ── yesterday, reviewed: contribution bars (helped / hurt), market only ─────────────────────────────────────────────
export function contributions(score) {
  const c = score?.cards; if (!c) return null;
  const rows = Object.entries(c).map(([inst, v]) => ({ inst, w: Number(v.R) * Number(v.size) })).filter(r => fin(r.w));
  if (rows.length < 4) return null;
  const mx = Math.max(...rows.map(r => Math.abs(r.w))) || 1, sorted = [...rows].sort((a, b) => b.w - a.w);
  return { rows: sorted, mx, helped: rows.filter(r => r.w > 0).length, hurt: rows.filter(r => r.w < 0).length };
}
export function contributionBars(k, ct) {
  return G.rankedBars(k, ct.rows.map(r => ({ label: r.inst, value: r.w / ct.mx, text: signed(r.w, 2), signed: true })), { width: 360, labelW: 96, textW: 56, ariaLabel: 'Each market\'s contribution to yesterday\'s score: helped or hurt' });
}

// ── today's range lines for every market the desk covers ─────────────────────────────────────────────────────────────
export const RANGE_GROUPS = [['fx_majors', 'FX majors'], ['fx_crosses', 'FX crosses'], ['indices', 'Indices'], ['metals', 'Metals'], ['energy', 'Energy'], ['ags', 'Agriculture'], ['crypto', 'Crypto']];
const px = v => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 10 ? v.toFixed(3) : v.toFixed(5));
/** One compact line diagram: down p90 ... open ... up p90 with marks at p50 and p75 on each side. No shading for a lean, no sizes, no zones. */
export function rangeLine(k, lv, width = 150, height = 18) {
  const hi = lv.up.p90, X = v => 4 + (width - 8) * (v - lv.down.p90) / (hi - lv.down.p90), y = height / 2, o = [G.svgOpen(width, height, 'Range lines: 50th, 75th and 90th percentile reach either side of the open')];
  o.push(`<line x1="${X(lv.down.p90).toFixed(1)}" x2="${X(hi).toFixed(1)}" y1="${y}" y2="${y}" stroke="${k.line}" stroke-width="2"/>`);
  for (const [v, op, h] of [[lv.down.p90, 0.4, 4], [lv.down.p75, 0.65, 5], [lv.down.p50, 0.95, 6], [lv.up.p50, 0.95, 6], [lv.up.p75, 0.65, 5], [lv.up.p90, 0.4, 4]]) o.push(`<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${y - h}" y2="${y + h}" stroke="${k.pur2}" stroke-width="2" stroke-opacity="${op}"/>`);
  o.push(`<circle cx="${X(lv.open).toFixed(1)}" cy="${y}" r="3.2" fill="${k.gold}"/>`);
  return o.join('') + '</svg>';
}
export function rangeTables(run, tiles = []) {
  const inst = run?.head?.book?.instruments; if (!inst) return null;
  const tag = Object.fromEntries((tiles ?? []).map(t => [t.sym, t.tag])), out = [];
  for (const [g, label] of RANGE_GROUPS) {
    const rows = Object.entries(inst).filter(([n, v]) => groupOf(n) === g && v?.levels?.up?.p50 != null && v.levels.down?.p50 != null && fin(v.levels.open)).map(([n, v]) => ({ name: n, lv: v.levels, tag: tag[n] ?? null }));
    if (!rows.length) continue;
    let up = 0, dn = 0; for (const r of rows) { const net = cardDrivers(run, r.name, { cap: 11 }).net; if (net > 0) up++; else if (net < 0) dn++; }
    out.push({ g, label, rows, line: `Across the ${rows.length} ${label.toLowerCase()} markets the analysts' points lean ${up} tailwind, ${dn} headwind${rows.length - up - dn ? `, ${rows.length - up - dn} neutral` : ''}.` });
  }
  return out.length ? out : null;
}

// ── desk read against what price did ────────────────────────────────────────────────────────────────────────────────
export function deskVsPrice(S, run) {
  const cur = run?.debate?.currency?.view?.currencies; if (!S?.ok || !cur) return null;
  const analyst = Object.fromEntries(Object.entries(cur).map(([c, v]) => [c, { bias: v.bias }]));
  const r = priceRead({ strength: S, analyst });
  if (!r?.ok) return { ok: false, error: r?.error ?? 'price read not available' };
  const W = { agree: 'agree', disagree: 'disagree', open: 'no clash', 'no-analyst': 'no desk read' };
  const rows = r.rows.map(x => ({ ccy: x.ccy, bias: x.analyst, s4h: x.s4h, s1d: x.s1d, read: x.read, state: W[x.state] ?? x.state }));
  return { ok: true, rows, disagree: r.disagree, line: r.line };
}

// ── the economist's brief for the next release (the desk run's own, no new model call) ──────────────────────────────
export function economistBrief(run) {
  const v = run?.economist?.view; if (!v) return null;
  const b = v.briefs?.[0], head = P.safeProse(v.headline);
  if (!b && !head) return null;
  const parts = b ? [['What is priced', b.priced], ['How big and how fast, from history', b.sizeAndSpeed], ['If hot', b.ifHot], ['If cold', b.ifCold], ['What to watch', b.watch]].map(([l, t]) => ({ label: l, text: P.sentencesUpTo(t, 420) })).filter(x => x.text) : [];
  return { headline: head, event: b ? P.clean(String(b.event ?? '').replace(/\sat\s\d{4}-.*$/, '')) : '', parts, thin: /too thin|no usable|only \d+ releases/i.test(JSON.stringify(b ?? {})) };
}

// ── question of the day ─────────────────────────────────────────────────────────────────────────────────────────────
export function questionOfDay(isoDate) {
  try { const q = questionFor([...QUESTIONS, ...WEB_QUESTIONS], isoDate, { weekly: false }); return q ? { question: q.today.question, clue: q.today.clue, prevQuestion: q.previous?.question ?? null, prevAnswer: q.previous?.answer ?? null } : null; } catch { return null; }
}

// ── where this comes from: source, as-of and a data-age dot ────────────────────────────────────────────────────────
const parseUk = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})/.exec(String(s ?? '')); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null; };
export function sources(d, nowMs) {
  const t = s => { const ms = typeof s === 'number' ? s : Date.parse(String(s ?? '')); return Number.isFinite(ms) ? ms : null; };
  const list = [
    ['Currency strength', 'live bars', t(d.S?.horizons?.['1H']?.to), 6], ['US curve history', 'official prints', t(d.CV?.frames?.at(-1)?.t), 100], ['Vol clock', 'live bars and forecast', t(d.VC?.builtAt ?? d.VC?.asOf), 6],
    ['Fed futures odds', 'laptop pull, nightly', t(d.FED?.asOf ?? d.FED?.builtAt ?? d.FED?.fetchedAt), 40], ['Stress lights', 'live feeds', t(d.WS?.builtAt ?? d.WS?.asOf ?? d.WS?.fetchedAt), 6], ['Calendar', 'vendors', t(d.CAL?.fetchedAt ?? d.CAL?.builtAt), 30],
    ['Daily market bundle', 'completed closes', t(d.BUNDLE?.to), 100], ['Credit spreads', 'FRED daily', t(d.CRED?.rows?.[0]?.asOf), 100], ['Funding and liquidity', 'Fed and Treasury', t(d.FUND?.builtAt), 30], ['Liquidity gate', 'daily model', t(d.GATE?.asOf), 100],
    ['Option levels', 'open-interest capture', parseUk(d.OI?.data?.NAS100_USD?.savedAt), 30], ['Vol forecast', 'calibrated model', t(d.FC?.computed_at), 100], ['Desk run', 'the analysts and managers', t(d.RUN?.finishedAt), 30], ['Yesterday\'s score', 'scored after the close', t(d.SCORE?.score?.runFinishedAt ?? d.SCORE?.score?.date), 100],
  ];
  return list.map(([label, via, ms, maxH]) => { if (ms == null) return { label, via, asOf: 'not available', ageH: null, dot: 'grey' }; const ageH = (nowMs - ms) / 3600e3; return { label, via, asOf: new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', ageH: Math.round(ageH), dot: ageH <= maxH ? 'green' : 'amber' }; });
}

// ── teaching strips: what you are looking at, why it matters, what it tells us, what is uncertain ─────────────────────
export const TEACH = {
  strength: { what: 'Each currency\'s move against the other seven, in units of a normal move for that window. Rows are currencies, columns are time windows.', why: 'A currency that is firm against everything is being bought for its own reasons; a pair move can hide that.', unc: 'A strong window can reverse; one week is a short record and the windows overlap.' },
  curve: { what: 'The US yield curve at the last close (gold) with its shape one week, one month and three months earlier (violet).', why: 'The slope and level of the curve is the market\'s price for money over time; shifts in it feed most other markets.', unc: 'Official prints are daily; the curve can move a lot between closes.' },
  fed: { what: 'The odds the futures market gives to a Fed rate rise by each meeting window, with where those odds stood a day, a week and a month ago.', why: 'The dollar and yields react to changes in this path more than to the level of rates.', unc: 'It is what is priced, not what the Fed will do; the odds move with every data print and speech.' },
  vol: { what: 'For each market, how much of today\'s forecast median day range has already been used, with the daily-read word and implied vol over the forecast.', why: 'It tells you whether the day is quiet, normal or already stretched, which changes how big a move is still likely.', unc: 'Range tells you how big a day is, not its direction; a used-up range does not say which way the next move goes.' },
  unusual: { what: 'Every series the terminal holds ranked by how extreme it is against its own history (a percentile), not by how big the move is.', why: 'A modest move in a quiet series can matter more than a big one in a noisy series.', unc: 'Short histories make percentiles rough, and 5- and 20-day windows overlap, so they are less independent than a daily one.' },
  range: { what: 'The forecast range of the session from its open: the median, 75th and 90th percentile reach either side, with the price now.', why: 'It sets the scale for the day: a move that is half the median range is ordinary, one past the 90th percentile is rare.', unc: 'The ladders are calibrated on history; a day with an unusual driver can fall outside them.' },
  yields: { what: 'The 10-year yield change over 20 observations split into the real yield and expected inflation (breakeven).', why: 'The split says what the market is changing its mind about: growth and policy (real) or prices (inflation).', unc: 'Breakevens carry liquidity effects, and the series do not always update on the same day, so only the shared dates are used.' },
  backdrop: { what: 'The levels the desk reads first, each with its plain meaning and its last move.', why: 'They are the common language of the day: rates, credit, fear and the dollar.', unc: 'Each is a daily close; dates differ by series and are shown.' },
};
export { esc, fmt, px, signed };
