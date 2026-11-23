// js/terminal/dayAheadCore.js: the pure shaping behind Jarvis's DAY AHEAD hologram (js/terminal/jarvisViewDayAhead.js). No DOM, no fetch, no three.js; `now` is always passed in.
//
//   mergeDay({ feed, cal, evday, now })  today's London-date schedule from the three calendar routes, one list, de-duplicated, sorted by time
//   assignLanes(events)                   releases within LANE_MIN minutes of each other get side-by-side lanes so their pylons never stand inside each other
//   nextBig(day, now) / countdown(ms)     the next high-impact release still to come and "2h 14m"
//   hourProfile(json)                     the typical share of the day's range traded in each London hour (/api/vol-forecast/intraday-profile), averaged over the FX pairs
//   ridgeAt(prof, mins)                   that profile, smoothly interpolated around the clock (wraps midnight)
//   placeLabels(items, W, H)              greedy collision avoidance for the 2D labels
//   dayScript(day, now)                   the SHOW line read aloud
//
// Sources and what each contributes:
//   /api/calendar-feed      ahead[].events[] = ForexFactory's week (rank 3 = High only, carries forecast + previous); printed.rows[] = Nasdaq's released rows (actual, consensus, previous; no impact rating)
//   /api/calendar-events    { events: [{ ms, ccy, rank, event }] } (the CSV archive + live top-up; often empty past 2026-07, kept as a second source for medium-impact rows)
//   /api/event-day          { events: [{ id, family, name, t, released, ccys, line }] } central-bank decisions and big US releases, with the desk's Release Reaction paragraph
// Nasdaq's printed rows carry no impact rating, so a printed row is kept only when its TYPE is a high-impact one (rate decision, CPI, jobs, GDP, retail sales, PMI) and is flagged rankFrom: 'type'.
// DESCRIPTION ONLY: a schedule and a typical-activity profile. Nothing here says which way anything goes or what a release will print.
import { SESSIONS as LONDON_SESSIONS } from '../londonSession.js';

export const DAY_MIN = 1440, LANE_MIN = 15, RANK_MAX = 3;
const TAU = Math.PI * 2;
const fin = v => v != null && v !== '' && Number.isFinite(+v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── London clock ──
const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
/** London wall clock for an instant: { date 'YYYY-MM-DD', mins (minutes after London midnight), hm 'HH:MM', dow 'Fri' }. */
export function londonParts(ms) {
  const p = {}; for (const x of FMT.formatToParts(new Date(ms))) p[x.type] = x.value;
  const h = (+p.hour) % 24, m = +p.minute;
  return { date: `${p.year}-${p.month}-${p.day}`, mins: h * 60 + m, hm: `${String(h).padStart(2, '0')}:${p.minute}`, dow: p.weekday };
}
/** Angle round the clock for minutes after midnight: 0 at the top (00:00), clockwise, a full turn per day. */
export const angleOf = mins => (((mins % DAY_MIN) + DAY_MIN) % DAY_MIN) / DAY_MIN * TAU;
/** A point on the table at radius r for minutes after midnight: x to the right, z toward the viewer (00:00 is the far side, 12:00 the near side). */
export const polar = (mins, r, y = 0) => { const a = angleOf(mins); return [r * Math.sin(a), y, -r * Math.cos(a)]; };

/** The three trading sessions in London hours (js/londonSession.js, the desk's one definition), with the region colour key each one uses. */
export const SESSIONS = [
  { key: 'asia', label: 'ASIA', region: 'asia', from: LONDON_SESSIONS.asia[0] * 60, to: LONDON_SESSIONS.asia[1] * 60 },
  { key: 'london', label: 'LONDON', region: 'europe', from: LONDON_SESSIONS.london[0] * 60, to: LONDON_SESSIONS.london[1] * 60 },
  { key: 'ny', label: 'NEW YORK', region: 'americas', from: LONDON_SESSIONS.ny[0] * 60, to: LONDON_SESSIONS.ny[1] * 60 },
];

// ── currencies, regions, names ──
const COUNTRY_CCY = { 'united states': 'USD', us: 'USD', 'euro zone': 'EUR', 'euro area': 'EUR', eurozone: 'EUR', germany: 'EUR', france: 'EUR', italy: 'EUR', spain: 'EUR', eu: 'EUR', 'united kingdom': 'GBP', uk: 'GBP', gb: 'GBP',
  japan: 'JPY', jp: 'JPY', australia: 'AUD', au: 'AUD', 'new zealand': 'NZD', nz: 'NZD', canada: 'CAD', ca: 'CAD', switzerland: 'CHF', ch: 'CHF', china: 'CNY', cn: 'CNY' };
/** A Nasdaq/Finnhub country name or code -> currency code ('' when unknown). */
export const ccyOfCountry = c => COUNTRY_CCY[String(c ?? '').trim().toLowerCase()] ?? '';
const REGION = { USD: 'americas', CAD: 'americas', EUR: 'europe', GBP: 'europe', CHF: 'europe', JPY: 'asia', AUD: 'asia', NZD: 'asia', CNY: 'asia' };
/** Currency -> region key: americas | europe | asia | other. The view colours pylons (and the session arcs) by region. */
export const regionOf = ccy => REGION[String(ccy ?? '').toUpperCase()] ?? 'other';
export const REGION_LABEL = { americas: 'Americas', europe: 'Europe', asia: 'Asia-Pacific', other: 'other' };
const PREFIX = { USD: 'US', EUR: 'EZ', GBP: 'UK', JPY: 'JP', AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH', CNY: 'CN' };

const SHORT = [
  [/core.*(cpi|consumer price)/i, 'core CPI'], [/\bcpi\b|consumer price/i, 'CPI'], [/core pce/i, 'core PCE'], [/\bpce\b/i, 'PCE'], [/\bppi\b|producer price/i, 'PPI'],
  [/non.?farm|payroll/i, 'payrolls'], [/unemployment claims|jobless claims|initial claims/i, 'jobless claims'], [/unemployment rate/i, 'unemployment'], [/employment change/i, 'jobs'], [/claimant/i, 'claimant count'],
  [/fomc.*(minutes)/i, 'FOMC minutes'], [/minutes/i, 'minutes'], [/fomc|federal funds/i, 'Fed decision'], [/(rate decision|interest rate|cash rate|bank rate|policy rate|main refinancing|monetary policy statement)/i, 'rate decision'],
  [/press conference/i, 'press conf.'], [/\bgdp\b|gross domestic/i, 'GDP'], [/core retail/i, 'core retail sales'], [/retail sales/i, 'retail sales'],
  [/(flash|final)?\s*manufacturing pmi/i, 'mfg PMI'], [/(flash|final)?\s*services pmi/i, 'services PMI'], [/ism manufacturing/i, 'ISM mfg'], [/ism services|ism non/i, 'ISM services'], [/\bpmi\b/i, 'PMI'],
  [/trade balance/i, 'trade balance'], [/consumer (sentiment|confidence)/i, 'consumer sentiment'], [/\bifo\b/i, 'Ifo'], [/\bzew\b/i, 'ZEW'], [/budget|fiscal/i, 'Budget'], [/refunding/i, 'refunding'],
];
/** A short label for a release: "US CPI", "UK rate decision", "EZ mfg PMI"; a speech keeps the speaker ("Bailey speaks"). Unknown names are trimmed to 22 characters. */
export function shortName(event, ccy) {
  const s = String(event ?? '').replace(/\s+/g, ' ').trim(), pre = PREFIX[String(ccy ?? '').toUpperCase()] ?? String(ccy ?? '').toUpperCase();
  if (!s) return pre || 'release';
  const sp = s.match(/([A-Za-z]+)\s+(?:speaks|testifies)\b/i);
  if (sp) return pre ? `${pre} ${sp[1]} speaks` : `${sp[1]} speaks`;
  const sub = s.match(/\b(german|french|italian|spanish)\b/i); const pre2 = sub ? { german: 'DE', french: 'FR', italian: 'IT', spanish: 'ES' }[sub[1].toLowerCase()] : pre;
  const hit = SHORT.find(([re]) => re.test(s));
  const core = hit ? hit[1] : s.replace(/\b(m\/m|y\/y|q\/q|mom|yoy|qoq|s\.a\.|sa|prelim(inary)?|flash|final)\b/gi, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const body = core.length > 22 ? core.slice(0, 21).trimEnd() + '…' : core;
  return pre2 ? `${pre2} ${body.replace(/^(german|french|italian|spanish)\s+/i, '')}` : body;
}
/** High-impact by release TYPE (for rows with no vendor rating): the same family as the server's week-ahead list. */
export const HIGH_TYPE = /rate decision|interest rate|cash rate|bank rate|fomc|federal funds|\bcpi\b|consumer price|inflation rate|nonfarm|non-farm|payroll|employment change|unemployment rate|\bgdp\b|retail sales|\bpmi\b|\bism\b/i;

// ── the merge ──
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['m/m', 'y/y', 'the', 'and'].includes(w));
const sameName = (a, b) => {           // the same release under two vendors' names: the same short label, or most words shared
  if (shortName(a, '') === shortName(b, '') && norm(a).length && norm(b).length) return true;
  const A = new Set(norm(a)), B = new Set(norm(b)); if (!A.size || !B.size) return false; let k = 0; for (const w of B) if (A.has(w)) k++; return k / (A.size + B.size - k) >= 0.75;
};
const textOf = v => (v == null ? null : String(v).replace(/&nbsp;|&#160;| /gi, '').trim() || null);
const FAMILY_CCY = { FOMC: 'USD', NFP: 'USD', CPI: 'USD', RETAIL: 'USD', PCE: 'USD', REFUNDING: 'USD', ECB: 'EUR', BOE: 'GBP', UKFISCAL: 'GBP', BOJ: 'JPY' };
const DECISION = new Set(['FOMC', 'ECB', 'BOE', 'BOJ']);
const FAMILY_RE = { FOMC: /fomc|federal funds|fed interest/i, ECB: /ecb|main refinancing|deposit facility|monetary policy/i, BOE: /boe|bank rate|mpc/i, BOJ: /boj|policy rate|monetary policy/i,
  CPI: /\bcpi\b|consumer price/i, NFP: /non.?farm|payroll/i, RETAIL: /retail sales/i, PCE: /\bpce\b/i, UKFISCAL: /budget|fiscal|autumn statement/i, REFUNDING: /refunding/i };
const famMatch = (fam, name) => !!(fam && FAMILY_RE[fam]?.test(String(name ?? '')));

/**
 * Today's schedule (London date of `now`). Every row: { id, ms, mins, hm, ccy, region, rank 1..3, rankFrom 'vendor'|'type'|'desk', name, short, forecast, previous, actual,
 * released, decision, line (the desk's Release Reaction paragraph or null), src }. Duplicates across feeds (same currency, within 10 minutes, overlapping name words) are merged,
 * keeping the highest rank and every field any feed had. Missing or malformed payloads are skipped, never thrown on.
 */
export function mergeDay({ feed = null, cal = null, evday = null, week = null, now = Date.now() } = {}) {
  const today = londonParts(now).date, out = [];
  const add = e => {
    if (!fin(e.ms)) return; const lp = londonParts(+e.ms); if (lp.date !== today) return;
    const ccy = String(e.ccy ?? '').toUpperCase(), rank = clamp(Math.round(+e.rank || 0), 0, RANK_MAX); if (rank < 1) return;
    const twin = out.find(x => x.ccy === ccy && Math.abs(x.ms - e.ms) <= 10 * 60e3 && (sameName(x.name, e.name) || (e.family && (x.family === e.family || famMatch(e.family, x.name)))));
    if (twin) {
      if (rank > twin.rank) { twin.rank = rank; twin.rankFrom = e.rankFrom; }
      for (const k of ['forecast', 'previous', 'actual', 'line', 'family']) if (twin[k] == null && e[k] != null) twin[k] = e[k];
      twin.decision = twin.decision || !!e.decision; if (!twin.src.includes(e.src)) twin.src += ` + ${e.src}`; return;
    }
    out.push({ id: '', ms: +e.ms, mins: lp.mins, hm: lp.hm, ccy, region: regionOf(ccy), rank, rankFrom: e.rankFrom, name: String(e.name ?? '').trim() || 'release', short: '', family: e.family ?? null,
      forecast: e.forecast ?? null, previous: e.previous ?? null, actual: e.actual ?? null, released: false, decision: !!e.decision, line: e.line ?? null, src: e.src, lane: 0, lanes: 1 });
  };
  // 1. ForexFactory (vendor impact, forecast, previous)
  for (const d of Array.isArray(feed?.ahead) ? feed.ahead : []) for (const e of Array.isArray(d?.events) ? d.events : [])
    add({ ms: e?.ms, ccy: e?.ccy, rank: e?.rank, rankFrom: 'vendor', name: e?.event, forecast: textOf(e?.forecast), previous: textOf(e?.previous), src: 'ForexFactory' });
  // 1b. ForexFactory's FULL week (/api/events: high, medium and low with forecast, previous and actual; holidays skipped). calendar-feed keeps only High, so the medium releases come from here
  const IMPACT = { high: 3, medium: 2, low: 1 };
  for (const e of Array.isArray(week) ? week : []) add({ ms: e?.ms, ccy: ccyOfCountry(e?.country), rank: IMPACT[String(e?.impact ?? '').toLowerCase()] ?? 0, rankFrom: 'vendor', name: e?.event,
    forecast: textOf(e?.estimate), previous: textOf(e?.prev), actual: textOf(e?.actual), src: 'ForexFactory' });
  // 2. the calendar archive (vendor rank)
  for (const e of Array.isArray(cal?.events) ? cal.events : []) add({ ms: e?.ms, ccy: e?.ccy, rank: e?.rank, rankFrom: 'vendor', name: e?.event, src: 'calendar archive' });
  // 3. the desk's event-day list (rate decisions, big US data, fiscal): high by definition, carries the history paragraph
  for (const e of Array.isArray(evday?.events) ? evday.events : []) {
    const fam = String(e?.family ?? '').toUpperCase(), ccy = FAMILY_CCY[fam] ?? (Array.isArray(e?.ccys) ? e.ccys[0] : '');
    add({ ms: Date.parse(e?.t ?? ''), ccy, rank: 3, rankFrom: 'desk', name: e?.name, family: fam || null, decision: DECISION.has(fam), line: typeof e?.line === 'string' ? e.line : null, src: 'event-day' });
  }
  // 4. Nasdaq's printed rows: attach actual/consensus/previous to a matching release; a high-impact TYPE with no match is added (its rating inferred from the type)
  for (const r of Array.isArray(feed?.printed?.rows) ? feed.printed.rows : []) {
    if (!fin(r?.ms)) continue; const ccy = ccyOfCountry(r.country); if (!ccy) continue;
    const actual = textOf(r.raw?.actual) ?? (fin(r.actual) ? String(r.actual) : null), cons = textOf(r.raw?.consensus) ?? (fin(r.consensus) ? String(r.consensus) : null), prev = textOf(r.raw?.previous) ?? (fin(r.previous) ? String(r.previous) : null);
    const m = out.find(x => x.ccy === ccy && Math.abs(x.ms - r.ms) <= 10 * 60e3 && sameName(x.name, r.event));
    if (m) { m.actual ??= actual; m.forecast ??= cons; m.previous ??= prev; if (!m.src.includes('Nasdaq')) m.src += ' + Nasdaq'; continue; }
    const nat = { germany: 'German', france: 'French', italy: 'Italian', spain: 'Spanish' }[String(r.country).trim().toLowerCase()], nm = nat && !new RegExp(nat, 'i').test(r.event) ? `${nat} ${r.event}` : r.event;
    if (HIGH_TYPE.test(String(r.event ?? ''))) add({ ms: r.ms, ccy, rank: 3, rankFrom: 'type', name: nm, forecast: cons, previous: prev, actual, src: 'Nasdaq' });
  }
  out.sort((a, b) => a.ms - b.ms || b.rank - a.rank);
  out.forEach((e, i) => { e.id = `${e.hm}-${e.ccy}-${i}`; e.short = shortName(e.name, e.ccy); e.released = e.ms <= now || e.actual != null; });
  assignLanes(out);
  return { date: today, now, nowMins: londonParts(now).mins, events: out, high: out.filter(e => e.rank >= 3).length, ahead: out.filter(e => e.rank >= 3 && e.ms > now).length };
}

/** Lanes: releases within LANE_MIN minutes of the previous one in a run share the run; each gets lane 0..k-1 of k so the view can set them side by side. Mutates and returns the list. */
export function assignLanes(events, gap = LANE_MIN) {
  let i = 0;
  while (i < events.length) {
    let j = i; while (j + 1 < events.length && events[j + 1].mins - events[j].mins <= gap) j++;
    const run = events.slice(i, j + 1).sort((a, b) => b.rank - a.rank || a.ms - b.ms);     // the most important release takes the centre lane
    run.forEach((e, k) => { e.lane = k; e.lanes = run.length; });
    i = j + 1;
  }
  return events;
}
/** Radial offset for a lane: 0 for the centre lane, then alternating outside / inside the ring, `step` apart. */
export const laneOffset = (lane, step = 0.17) => (lane === 0 ? 0 : (lane % 2 ? 1 : -1) * Math.ceil(lane / 2) * step);
/** Pylon height for an impact rank: proportional to the rank (1, 2, 3 -> 1/3, 2/3, 1 of `full`); anything above RANK_MAX is capped and says so. */
export function pylonHeight(rank, full = 1.35) { const r = +rank || 0, capped = r > RANK_MAX; return { h: clamp(r, 0, RANK_MAX) / RANK_MAX * full, capped }; }

/** The next high-impact release still to come today, or null. */
export const nextBig = (day, now) => (day?.events ?? []).find(e => e.rank >= 3 && e.ms > now && !e.actual) ?? null;
/** "2h 14m", "45m", "under a minute"; null for a time that has passed. */
export function countdown(ms) {
  if (!fin(ms) || ms < 0) return null; const m = Math.floor(ms / 60e3); if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
}

// ── typical activity by hour ──
export const FX_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURGBP', 'EURJPY', 'GBPJPY'];
/**
 * /api/vol-forecast/intraday-profile -> { vals: Float64Array(24) scaled so the busiest hour is 1, mean: the raw average % of the day's range per hour, pairs, n (days), peak, quiet, computedAt }, or null.
 * Each instrument's hourly[] holds { hour (London), mean (% of that day's high-low traded inside the hour), n }. The FX pairs present are averaged; with none, every instrument is.
 */
export function hourProfile(json, pairs = FX_PAIRS) {
  const inst = json?.instruments; if (!inst || typeof inst !== 'object') return null;
  const ok = k => Array.isArray(inst[k]) && inst[k].length >= 20;
  let keys = pairs.filter(ok); if (!keys.length) keys = Object.keys(inst).filter(ok); if (!keys.length) return null;
  const sum = new Float64Array(24), cnt = new Float64Array(24); let n = 0;
  for (const k of keys) for (const r of inst[k]) { const h = +r?.hour; if (!(h >= 0 && h < 24) || !fin(r?.mean) || !(+r.n > 0)) continue; sum[h] += +r.mean; cnt[h]++; n = Math.max(n, +r.n); }
  const mean = new Float64Array(24); let mx = 0, have = 0;
  for (let h = 0; h < 24; h++) { mean[h] = cnt[h] ? sum[h] / cnt[h] : NaN; if (cnt[h]) { have++; mx = Math.max(mx, mean[h]); } }
  if (have < 20 || !(mx > 0)) return null;
  for (let h = 0; h < 24; h++) if (!(mean[h] === mean[h])) { const a = mean[(h + 23) % 24], b = mean[(h + 1) % 24]; mean[h] = a === a && b === b ? (a + b) / 2 : a === a ? a : b === b ? b : 0; }   // fill a lone gap
  const vals = new Float64Array(24); let peak = 0, quiet = 0;
  for (let h = 0; h < 24; h++) { vals[h] = mean[h] / mx; if (mean[h] > mean[peak]) peak = h; if (mean[h] < mean[quiet]) quiet = h; }
  return { vals, mean, pairs: keys, n, peak, quiet, computedAt: json.computed_at ?? null };
}
/** The profile at a clock time (minutes after midnight), smooth through the hour centres (cosine interpolation, wraps midnight). 0 with no profile. */
export function ridgeAt(prof, mins) {
  if (!prof) return 0; const x = (((mins / 60 - 0.5) % 24) + 24) % 24, i = Math.floor(x), f = x - i, w = (1 - Math.cos(f * Math.PI)) / 2;
  return prof.vals[i] * (1 - w) + prof.vals[(i + 1) % 24] * w;
}

// ── labels ──
/**
 * Greedy collision avoidance. items = [{ x, y, w, h, prio }] anchors (the label's preferred box is centred on x, bottom at y); higher prio is placed first.
 * Each item tries offsets (above, then higher, then to either side); the first box that overlaps nothing placed and stays on screen wins, else the label is dropped.
 * `taken` = boxes already used (panels, the centre readout). Returns an array parallel to items: { x, y } (box centre-x and baseline) or null.
 */
export function placeLabels(items, W, H, taken = [], pad = 3) {
  const res = new Array(items.length).fill(null), boxes = taken.map(b => ({ ...b }));
  const order = items.map((it, i) => i).sort((a, b) => (items[b].prio ?? 0) - (items[a].prio ?? 0));
  const OFF = [[0, 0], [0, -18], [0, -36], [1, -6], [-1, -6], [1, -26], [-1, -26], [0, -54], [1, -46], [-1, -46], [0, -72], [1, 14], [-1, 14], [0.6, -14], [-0.6, -14], [0.6, -32], [-0.6, -32]];
  for (const i of order) {
    const it = items[i]; if (!it || !fin(it.x) || !fin(it.y)) continue;
    for (const [sx, dy] of OFF) {
      const cx = clamp(it.x + sx * (it.w + 8), it.w / 2 + pad + 5, W - it.w / 2 - pad - 5), by = it.y + dy, b = { x: cx - it.w / 2 - pad, y: by - it.h - pad, w: it.w + pad * 2, h: it.h + pad * 2 };
      if (b.x < 4 || b.y < 4 || b.x + b.w > W - 4 || b.y + b.h > H - 4) continue;
      if (boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y)) continue;
      boxes.push(b); res[i] = { x: cx, y: by }; break;
    }
  }
  return res;
}

// ── words ──
const NAT = { US: 'US', EZ: 'euro area', UK: 'UK', JP: 'Japanese', AU: 'Australian', NZ: 'New Zealand', CA: 'Canadian', CH: 'Swiss', CN: 'Chinese', DE: 'German', FR: 'French', IT: 'Italian', ES: 'Spanish' };
const say = e => e.short.replace(/^[A-Z]{2} (\w+ speaks)$/, '$1').replace(/^([A-Z]{2}) /, (m, c) => `${NAT[c] ?? c} `).replace(/\bmfg\b/, 'manufacturing').replace(/\bconf\.$/, 'conference');
/** A calendar figure for the voice: "0.3%" -> "0.3 percent", "-0.1%" -> "minus 0.1 percent", "245K" -> "245 thousand", "1.2M" -> "1.2 million", "4.50%" -> "4.5 percent". */
export function sayFig(v) {
  let t = String(v ?? '').trim(); if (!t) return null;
  t = t.replace(/^[−-]\s*(?=\d)/, 'minus ').replace(/(\d)\.?0+%$/, '$1%').replace(/(\d\.\d*?)0+%$/, '$1%').replace(/%$/, ' percent').replace(/(\d)\s*K$/i, '$1 thousand').replace(/(\d)\s*M$/i, '$1 million').replace(/(\d)\s*B$/i, '$1 billion');
  return t;
}
/** The typical first-half-hour reaction out of an event-day history line ("... the typical first-30-minute move, either way, was Nasdaq 0.41%, EUR/USD 14 pips. ..."), for the voice; null when the line has none. */
export function reactionWords(line) {
  const m = /typical first-30-minute move, either way, was ([^.]+(?:\.\d[^.]*)*?)(?:\.\s|\.$|$)/.exec(String(line ?? '')); if (!m) return null;
  const n = /over the (\d+) previous/.exec(String(line))?.[1];
  const sizes = m[1].split(/,\s*/).filter(x => !/\bleg\b|note future|\(price\)/.test(x)).slice(0, 3).map(x => x.replace(/S&P 500/g, 'the S and P 500').replace(/(\d) pt\b/g, '$1 points').replace(/(\d)%/g, '$1 percent').replace(/(\d)\s*bp\b/g, '$1 basis points').replace(/\bEUR\/USD\b/g, 'euro dollar').replace(/\bUSD\/JPY\b/g, 'dollar yen').replace(/\bGBP\/USD\b/g, 'sterling'));
  return { n: n ? +n : null, sizes };
}
/** The SHOW's OUTLOOK line for today: the releases still to come with their London time, the consensus and the last print (high-impact first; medium-impact ones fill in when
 * there are fewer than `max` times to name, so a day of flash PMIs is not called quiet), then how big the first half hour has typically been on that kind of day (the Release
 * Reaction record). Releases at the same minute are read together. Schedule and history only: the expectations are the market consensus, not the desk's. */
export function outlookScript(day, now, max = 3) {
  if (!day) return null;
  const up = (day.events ?? []).filter(e => e.ms > now && !e.actual), high = up.filter(e => e.rank >= 3), med = up.filter(e => e.rank === 2);
  if (!high.length && !med.length) return dayScript(day, now);
  const one = e => { const f = sayFig(e.forecast), p = sayFig(e.previous); return `${say(e)}${f ? `: expected ${f}${p ? `, after ${p} last time` : ''}` : p ? `, last time ${p}` : ''}`; };
  const timesOf = a => new Set(a.map(e => e.hm)).size;
  const pool = (timesOf(high) >= max ? high : [...high, ...med]).sort((a, b) => a.ms - b.ms || b.rank - a.rank);
  const groups = []; for (const e of pool) { const g = groups.at(-1); if (g && g.hm === e.hm) g.ev.push(e); else groups.push({ hm: e.hm, ev: [e] }); }
  const shown = groups.slice(0, max), named = new Set(shown.flatMap(g => g.ev.slice(0, 2)));
  const lines = shown.map(g => `At ${g.hm}, ${g.ev.slice(0, 2).map(one).join(', and ')}${g.ev.length > 2 ? `, with ${g.ev.length - 2} more` : ''}.`);
  const rest = pool.filter(e => !named.has(e) && !shown.some(g => g.ev.includes(e))), bigLater = high.find(e => !named.has(e));
  if (rest.length) lines.push(pool === high ? `Plus ${rest.length} more high-impact release${rest.length === 1 ? '' : 's'} later.`
    : bigLater ? `Plus ${rest.length} more later, including ${say(bigLater)} at ${bigLater.hm}.`
    : rest.length <= 2 && new Set(rest.map(e => e.hm)).size === 1 ? `Then ${rest.map(say).join(' and ')} at ${rest[0].hm}.`
    : `Plus ${rest.length} more later, the last at ${rest.at(-1).hm}.`);
  const h = high.map(e => ({ e, r: reactionWords(e.line) })).find(x => x.r?.sizes.length);
  if (h) lines.push(`On past ${say(h.e)} days${h.r.n ? `, ${h.r.n} of them` : ''}, the first half hour typically moved ${h.r.sizes.length > 1 ? `${h.r.sizes.slice(0, -1).join(', ')} and ${h.r.sizes.at(-1)}` : h.r.sizes[0]}, either way.`);
  return `${high.length ? 'On the calendar today, London time.' : 'No top-tier releases today; the medium-impact ones, London time.'} ${lines.join(' ')}`;
}
/** The SHOW line: the high-impact releases still to come today with their London times, in plain words (at most five named), or a quiet calendar. Never a forecast. */
export function dayScript(day, now) {
  if (!day) return null;
  const left = (day.events ?? []).filter(e => e.rank >= 3 && e.ms > now && !e.actual), done = (day.events ?? []).filter(e => e.rank >= 3 && (e.ms <= now || e.actual)).length;
  if (!left.length) return `The rest of today is a quiet calendar: no high-impact releases left on the London clock${done ? `, after ${done} earlier today` : ''}. That is the schedule, not a forecast.`;
  const groups = []; for (const e of left) { const g = groups.at(-1); if (g && g.hm === e.hm) g.names.push(say(e)); else groups.push({ hm: e.hm, names: [say(e)] }); }
  const and = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a.at(-1)}` : a[0]);
  const shown = groups.slice(0, 4), more = left.length - shown.reduce((k, g) => k + g.names.length, 0);
  const list = and(shown.map(g => `${and(g.names)} at ${g.hm}`));
  return `Still to come today, London time: ${list}${more > 0 ? `, plus ${more} more` : ''}. ${left.length === 1 ? 'That is the one high-impact release left' : `That is ${left.length} high-impact releases left`}${done ? `, after ${done} earlier` : ''}. The schedule only, not a forecast.`;
}
/** SHOW camera: the clock-time the camera faces at p (0..1), sweeping from now round to the last release of the day (at least a quarter turn, at most a full one). */
export function sweepMins(nowMins, lastMins, p) {
  let span = ((lastMins ?? nowMins) - nowMins + DAY_MIN) % DAY_MIN; if (span < 360) span = 360;
  const e = clamp(p, 0, 1), s = e * e * (3 - 2 * e); return nowMins + span * s;
}
