/**
 * Event-day context: when a release, rate decision, Budget or refunding is today (or due within a day), what the same kind of
 * event did before, measured by Release Reaction (Layer 1, analysis/output/release_layer1/, KV release_layer1_v1), and what
 * this desk has tested about it. Plus the rate-legs line: which country's front end and which bond futures moved in the latest
 * session (the cog-chart legs, analysis/output/cog_chart/).
 *
 * Shared by the morning brief, the per-pair analysis, today.html and atlas.html through /api/event-day, so every paragraph
 * that mentions an event quotes the same numbers. Sizes and continuation shares only: Release Reaction is descriptive
 * (register row release-layer1), and every tested direction claim on these events is null or underpowered, so no line here
 * says which way anything goes.
 *
 * Pure. Tested in js/eventDayContext.test.mjs.
 */
const MINUS = '−';
const UNIT = { sofr: 'bp', eur: 'bp', spr: 'bp', zt: '%', zn: '%', dx: '%', nq: '%', es: '%', eurusd: '%', gbpusd: '%', usdjpy: '%', gold: '%', vix: 'pt', vxn: 'pt', gilt: '%', bund: '%', ftse: '%', dax: '%', nikkei: '%' };
const LABEL = { sofr: 'SOFR Sep26 leg', eur: 'Euribor Mar27 leg', zt: 'US 2y note future', zn: 'US 10y note future', dx: 'dollar index', nq: 'Nasdaq', es: 'S&P 500',
  eurusd: 'EUR/USD', gbpusd: 'GBP/USD', usdjpy: 'USD/JPY', gold: 'gold', vix: 'VIX', vxn: 'VXN', gilt: '10y gilt (price)', bund: '10y Bund (price)', ftse: 'FTSE 100', dax: 'DAX', nikkei: 'Nikkei 225' };

const US_ASSETS = ['zn', 'dx', 'eurusd', 'usdjpy', 'gold', 'nq'];
// What each family's evidence says, in the ledger's own words (js/deskEvidence.js). Ids are quoted so the reader can look them up.
const US_DATA = 'Tested here: the surprise explains the first 15 minutes and gives no evidence on the next hour to five days (rate-surprise-eurusd, rate-surprise-nq, underpowered); the surprise SIZE widens the session (surprise-size, validated), never a direction.';
const CB = 'Tested here: a rate decision widens the session (surprise-size, validated: rate decisions widened EUR/USD +0.38 ATR on the day and GBP/USD +0.38 the session after); no direction rule has passed.';
export const FAMILIES = {
  NFP: { name: 'US payrolls', ccys: ['USD'], assets: US_ASSETS, evidence: US_DATA },
  CPI: { name: 'US CPI', ccys: ['USD'], assets: US_ASSETS, evidence: US_DATA },
  RETAIL: { name: 'US retail sales', ccys: ['USD'], assets: US_ASSETS, evidence: US_DATA },
  PCE: { name: 'US PCE inflation', ccys: ['USD'], assets: US_ASSETS, evidence: US_DATA },
  FOMC: { name: 'FOMC decision', ccys: ['USD'], assets: [...US_ASSETS, 'vix'], evidence: US_DATA },
  ECB: { name: 'ECB decision', ccys: ['EUR'], assets: ['eurusd', 'bund', 'dax', 'eur'], evidence: CB },
  BOE: { name: 'BoE decision', ccys: ['GBP'], assets: ['gbpusd', 'gilt', 'ftse'], evidence: CB },
  BOJ: { name: 'BoJ decision', ccys: ['JPY'], assets: ['usdjpy', 'nikkei'], evidence: CB + ' The BoJ minute is found from the largest USD/JPY move, which flatters the first minutes but not the 30-minute figure.' },
  UKFISCAL: { name: 'UK Budget / fiscal statement', ccys: ['GBP'], assets: ['gilt', 'gbpusd', 'ftse'],
    evidence: 'Tested here (fiscal-reaction-uk-size, underpowered; 32 events 2010-2026): a Budget widens the gilt swing while it is read (high-to-low 1.6x an ordinary day, described) but has not left a bigger net move by the end of the window; no direction from gilt-sales revisions (fiscal-reaction-uk-direction, underpowered).' },
  REFUNDING: { name: 'US Treasury refunding', ccys: ['USD'], assets: ['zn', 'dx', 'nq'],
    evidence: 'Tested here (fiscal-reaction-us-size, null; 75 statements 2008-2026): a refunding statement is not a market event for the 10y on the day, and coupon-size changes give no direction (fiscal-reaction-us-direction, null).' },
};

const fmt = (v, unit, dp) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(dp ?? (unit === 'bp' ? 1 : 2))}${unit === 'pt' ? ' pt' : unit}`;
const size = (v, unit) => `${Math.abs(v).toFixed(unit === 'bp' ? 1 : 2)}${unit === 'pt' ? ' pt' : unit}`;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const londonDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
const londonClock = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

/** Past events of one family before `beforeMs`: per asset, the median 30-minute size, the median 4-hour size and how often the 4-hour move kept the 30-minute sign. */
export function familyHistory(rows, family, beforeMs) {
  const fam = FAMILIES[family]; if (!fam) return null;
  const past = rows.filter(r => r.family === family && Date.parse(r.t) < beforeMs && r.M);
  const assets = {};
  for (const k of fam.assets) {
    const m30 = [], m240 = [], keep = [];
    for (const r of past) {
      const m = r.M[k]; if (!m || m.m30 == null) continue;
      m30.push(Math.abs(m.m30));
      if (m.m240 != null) { m240.push(Math.abs(m.m240)); if (Math.abs(m.m30) > 1e-9) keep.push(Math.sign(m.m240) === Math.sign(m.m30)); }
    }
    if (m30.length) assets[k] = { n: m30.length, med30: median(m30), med240: median(m240), keepN: keep.length, keep: keep.filter(Boolean).length, all30: m30 };
  }
  const first = past.length ? past.map(r => r.t).sort()[0].slice(0, 7) : null;
  return { family, n: past.length, first, assets };
}

/** The events on today's London date, plus anything due within the next 24 hours. `rows` = Release Reaction rows (history and live), `ahead` = the live push's schedule. */
export function eventsToday(rows = [], ahead = [], now = Date.now()) {
  const today = londonDate(now), seen = new Map();
  for (const e of [...rows, ...ahead]) {
    const t = Date.parse(e.t); if (!Number.isFinite(t) || !FAMILIES[e.family]) continue;
    if (!(londonDate(t) === today || (t > now && t - now <= 24 * 3600e3))) continue;
    const key = `${londonDate(t)}|${e.family}`, had = seen.get(key);      // one event per family per London day: a measured row beats a schedule entry
    if (!had || (e.M && !had.M)) seen.set(key, { ...e, id: `${e.t}|${e.family}`, ms: t });
  }
  return [...seen.values()].sort((a, b) => a.ms - b.ms);
}

/** One event's paragraph: what the previous ones did, what this one has done so far (once 30 minutes have passed), and the evidence. */
export function eventLine(ev, hist, now = Date.now()) {
  const fam = FAMILIES[ev.family], released = ev.ms <= now;
  const day = londonDate(ev.ms) === londonDate(now) ? 'today' : 'tomorrow', clockFree = ev.family === 'BOJ' && !ev.M;      // a BoJ statement has no fixed time until it lands
  const when = clockFree ? `due ${day} in the Tokyo morning, usually 02:30-04:00 UTC` : released ? `released ${londonClock(ev.ms)} London` : `due ${londonClock(ev.ms)} London ${day}`;
  const parts = [`${ev.name ?? fam.name} (${when})`];
  const A = Object.entries(hist?.assets ?? {}).filter(([, a]) => a.n >= 3);
  if (A.length) {
    const n = Math.max(...A.map(([, a]) => a.n));
    parts.push(`: over the ${n} previous ${fam.name} events in the Release Reaction record (from ${hist.first}${n < 8 ? ', a small sample' : ''}), the typical first-30-minute move, either way, was `
      + A.map(([k, a]) => `${LABEL[k]} ${size(a.med30, UNIT[k])}`).join(', '));
    const kept = A.filter(([, a]) => a.keepN >= 3).map(([k, a]) => `${LABEL[k]} ${a.keep} of ${a.keepN}`);
    if (kept.length) parts.push(`. The 4-hour move pointed the same way as the 30-minute move in: ${kept.join(', ')}`);
  } else parts.push(': too few earlier events of this kind in the Release Reaction record to summarise');
  if (released && now - ev.ms >= 30 * 60e3 && ev.M) {
    const today = A.map(([k, a]) => { const v = ev.M[k]?.m30; if (v == null) return null; const below = a.all30.filter(x => x < Math.abs(v)).length;
      return `${LABEL[k]} ${fmt(v, UNIT[k])} (${below === 0 ? `smaller than all ${a.n} before it` : below === a.n ? `bigger than all ${a.n} before it` : `bigger than ${below} of ${a.n}`})`; }).filter(Boolean);
    if (today.length) parts.push(`. This one, at 30 minutes: ${today.join(', ')}`);
  }
  parts.push(`. Descriptive history, not a forecast. ${fam.evidence}`);
  return parts.join('');
}

/** Everything for a page or a prompt. `ccys` (optional) keeps only the events for those currencies. */
export function eventDay(rows = [], ahead = [], { now = Date.now(), ccys = null } = {}) {
  const want = ccys ? new Set(ccys.map(c => String(c).toUpperCase())) : null;
  const events = eventsToday(rows, ahead, now).filter(e => !want || FAMILIES[e.family].ccys.some(c => want.has(c)));
  return events.map(ev => {
    const hist = familyHistory(rows, ev.family, ev.ms);
    return { id: ev.id, family: ev.family, name: ev.name ?? FAMILIES[ev.family].name, t: ev.t, released: ev.ms <= now, ccys: FAMILIES[ev.family].ccys, line: eventLine(ev, hist, now) };
  });
}

// ── The schedule when the laptop's live push (which carries what is ahead) is not running: the desk's hand-kept calendars ──
/** UTC ms of a wall-clock time in a zone (two passes cover a DST edge). */
export function zonedMs(date, hhmm, tz) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number), want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    t += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return t;
}
const US_DATA_NAMES = [['NFP', /non.?farm/i], ['CPI', /CPI|consumer price/i], ['RETAIL', /retail sales/i], ['PCE', /PCE/i]];
/** Schedule entries ({t, family, name}) from js/fomcCalendar.js, ecbCalendar, boeCalendar, bojCalendar, fiscalEvents and the calendar feed (US data releases only).
 *  Times by the same rules as scripts/release_layer1/cb_schedule.py: ECB 14:15 Frankfurt, BoE 12:00 London, BoJ 03:00 UTC (placeholder: the statement has no fixed time), FOMC 14:00 New York. */
export function scheduleFromCalendars({ fomc = [], ecb = [], boe = [], boj = [], fiscal = [], calendar = [] } = {}) {
  const iso = ms => new Date(ms).toISOString().slice(0, 19) + 'Z', out = [];
  for (const m of fomc) out.push({ t: iso(zonedMs(m.date, '14:00', 'America/New_York')), family: 'FOMC', name: 'FOMC decision' });
  for (const m of ecb) out.push({ t: iso(zonedMs(m.date, '14:15', 'Europe/Berlin')), family: 'ECB', name: 'ECB rate decision' });
  for (const m of boe) out.push({ t: iso(zonedMs(m.date, '12:00', 'Europe/London')), family: 'BOE', name: 'BoE rate decision' });
  for (const m of boj) out.push({ t: `${m.date}T03:00:00Z`, family: 'BOJ', name: 'BoJ rate decision' });
  for (const f of fiscal) if (Number.isFinite(f.ms)) out.push({ t: iso(f.ms), family: f.kind === 'refunding' ? 'REFUNDING' : 'UKFISCAL', name: f.title });
  for (const e of calendar) {
    if (String(e.country).toUpperCase() !== 'US' || String(e.impact).toLowerCase() !== 'high' || !Number.isFinite(e.ms)) continue;
    const hit = US_DATA_NAMES.find(([, re]) => re.test(e.event ?? '')); if (hit) out.push({ t: iso(e.ms), family: hit[0], name: e.event });
  }
  return out;
}

// ── Rate legs: the latest session's move in each country's front end and bond futures ──
export const FRONT_LEGS = [
  ['SR3Z6', 'SOFR Dec26', 'US'], ['SR3H7', 'SOFR Mar27', 'US'], ['ZTZ6', 'US 2y note future', 'US'], ['ZNZ6', 'US 10y note future', 'US'],
  ['ER3Z6', '€STR Dec26', 'euro area'], ['IZ6', 'Euribor Dec26', 'euro area'], ['FGBS2612', 'Schatz (German 2y) future', 'euro area'], ['FGBL2612', 'Bund future', 'euro area'], ['FBTP2612', 'BTP (Italy 10y) future', 'euro area'],
];
const sessionsOf = t => { const out = new Map(); t.forEach((s, i) => { const d = londonDate(s * 1000); out.set(d, i); }); return [...out]; };   // [London date, index of its last bar]

/** legs: { name: { kind: 'rate'|'price', m5: { t: [epoch s], c: [] } } }. Rate legs are prices too (100 − rate), so a move in bp = −Δprice × 100. */
export function frontEnds(legs = {}, { now = Date.now(), maxAgeH = 30 } = {}) {
  const rows = [];
  for (const [name, label, area] of FRONT_LEGS) {
    const L = legs[name]; const t = L?.m5?.t, c = L?.m5?.c; if (!t?.length) continue;
    const ok = t.map((_, i) => i).filter(i => c[i] != null); if (ok.length < 2) continue;
    const tt = ok.map(i => t[i]), cc = ok.map(i => c[i]), S = sessionsOf(tt); if (S.length < 2) continue;
    const last = S.at(-1)[1], base1 = S.at(-2)[1], base5 = S.at(-Math.min(6, S.length))[1];
    const ch = b => L.kind === 'rate' ? -(cc[last] - cc[b]) * 100 : (cc[last] / cc[b] - 1) * 100;
    rows.push({ name, label, area, unit: L.kind === 'rate' ? 'bp' : '%', session: S.at(-1)[0], asOf: tt[last] * 1000, d1: ch(base1), d5: S.length >= 6 ? ch(base5) : null });
  }
  if (!rows.length) return { rows, line: null, stale: null };
  const asOf = Math.max(...rows.map(r => r.asOf)), stale = now - asOf > maxAgeH * 3600e3;
  const one = r => `${r.label} ${fmt(r.d1, r.unit, r.unit === 'bp' ? 1 : 2)}${r.d5 != null ? ` (5 sessions ${fmt(r.d5, r.unit, r.unit === 'bp' ? 1 : 2)})` : ''}`;
  const usBp = rows.find(r => r.name === 'SR3Z6'), euBp = rows.find(r => r.name === 'IZ6') ?? rows.find(r => r.name === 'ER3Z6');
  const lead = usBp && euBp ? ` The US front end moved ${size(usBp.d1, 'bp')} against the euro front end's ${size(euBp.d1, 'bp')}, so ${Math.max(Math.abs(usBp.d1), Math.abs(euBp.d1)) < 2 ? 'neither moved much' : Math.abs(usBp.d1) > 1.5 * Math.abs(euBp.d1) ? 'the US side did the moving' : Math.abs(euBp.d1) > 1.5 * Math.abs(usBp.d1) ? 'the euro side did the moving' : 'neither side clearly led'}.` : '';
  const line = `RATE LEGS, latest session ${rows[0].session} (futures, last bar ${londonClock(asOf)} London${stale ? `; NOT UPDATED for ${Math.round((now - asOf) / 3600e3)} hours, so this is not today` : ''}). Short-rate legs in bp of implied rate; bond futures as PRICE change (price down = yields up): `
    + rows.map(one).join('; ') + `.${lead} Context only: these move with FX and the indices in the same bar, and no lead from them survived testing (stir-composite-nq, stir-wide-scan, spread-episodes-eurusd, all null).`;
  return { rows, line, stale, asOf };
}
