#!/usr/bin/env node
/**
 * Build the Event Response Book — `MD files/EVENT_RESPONSE_BOOK.md` §8 steps 1–2,
 * widened from the first narrow slice to EVERY news family the platform tracks:
 * the macro releases behind the dashboard's own engines (inflation, labour,
 * growth, business activity, retail, trade, housing, confidence), the central
 * bank decisions, and the Beige Book — across all 26 instruments including gold,
 * each conditioned on what the US front end had already done INTO the event.
 *
 * Runs entirely offline. Every input is already on disk:
 *   M1 bars     VolRangeForecaster/data/m1/<pair>_m1.parquet   (untracked, ~1.6GB)
 *   yields      analysis/output/yield_coupling/yields.csv      (tracked)
 *   releases    calendar_events.csv  +  backfill/surprise_backfill.json (tracked)
 *   FOMC dates  js/fomcHistory.js                              (Stage-1 validated)
 *   FOMC tone   analysis/fomc_event_study/fomc_lexicon_scores.json
 *
 * TWO release archives, because neither is sufficient and they fail differently:
 *
 *   `calendar_events.csv` (vendor 2, 2014→2026-07) has TRUSTWORTHY timestamps —
 *   spot-checked against known prints on both sides of the DST switch (US CPI
 *   2024-01-11 13:30Z in EST, 2024-03-12 12:30Z in EDT) — but carries a
 *   consensus only for USD, EUR and GBP.
 *
 *   `backfill/surprise_backfill.json` (ForexFactory, 2007→2025-04) covers all
 *   eight economies, but its timestamps are wrong ROW BY ROW, in at least three
 *   regimes mixed inside one series: exact, an hour early, and seventeen hours
 *   early (the previous day). Canada's Labour Force Survey publishes Employment
 *   Change and the Unemployment Rate in the same instant and the archive stores
 *   them 17 hours apart, which is how the error was caught. An earlier pass of
 *   this script concluded the shift was a uniform +17h: that holds for US CPI
 *   and NFP and is NOT true in general.
 *
 * So the MARKET arbitrates every family's clock, whatever its source: a
 * whole-hour scan across ±23h takes the shift that maximises the 30-minute move
 * against the same clock on ordinary days, and a family enters the book only if
 * its peak is both big (>=2x) and DECISIVE (>=1.5x the next-best hour). Families
 * that cannot prove their own timestamps are recorded and excluded rather than
 * shifted onto the best-looking hour. Vendor-2 families calibrating to +0h is
 * the control that says the method works.
 *
 * One pair is held in memory at a time (a single M1 parquet is ~90MB packed and
 * several times that while decoding). Budget ~45 minutes for a full run:
 *
 *   node --max-old-space-size=8192 scripts/build_event_response_book.mjs
 *   node --max-old-space-size=8192 scripts/build_event_response_book.mjs --pairs eurusd,gold
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPairLocal } from '../js/localM1Loader.js';
import { buildEventResponseBook, zSeriesFromReleases, eventWindows, baselineFor, median } from '../js/eventResponseCore.js';
import { FOMC_MEETINGS_HISTORICAL } from '../js/fomcHistory.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YIELDS = path.join(ROOT, 'analysis', 'output', 'yield_coupling', 'yields.csv');
const FF_ARCHIVE = path.join(ROOT, 'backfill', 'surprise_backfill.json');
const VENDOR2 = path.join(ROOT, 'calendar_events.csv');
const FOMC_SCORES = path.join(ROOT, 'analysis', 'fomc_event_study', 'fomc_lexicon_scores.json');
const OUT = path.join(ROOT, 'backfill', 'event_response_book.json');
const CLOCKS = path.join(ROOT, 'backfill', 'event_response_clocks.json');

// Every instrument with local M1. Legs decide only which side of the pair the
// releasing currency sits on; returns stay in the instrument's own terms. Gold is
// quoted in dollars, so USD is its quote leg — a stronger dollar is gold-negative,
// the same convention `buildEventStudy` uses for USD-quote pairs.
const PAIRS = [
  'eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdjpy', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
  'gbpjpy', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd',
  'audjpy', 'audcad', 'audchf', 'audnzd',
  'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
];
const INSTRUMENTS = Object.fromEntries(PAIRS.map(p => [p,
  p === 'gold' ? ['XAU', 'USD'] : [p.slice(0, 3).toUpperCase(), p.slice(3).toUpperCase()]]));

const COUNTRY_TO_CCY = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF' };
const CCY_TO_COUNTRY = Object.fromEntries(Object.entries(COUNTRY_TO_CCY).map(([k, v]) => [v, k]));
// Which economy is probed on which pair: an Australian jobs print does not move
// the euro, and a clock calibrated on a pair that ignores the release reads null.
const PROBE_REF = { US: 'eurusd', EU: 'eurusd', GB: 'gbpusd', CA: 'usdcad', AU: 'audusd', NZ: 'nzdusd', CH: 'usdchf', JP: 'usdjpy' };

const M1_FROM = Date.parse('2016-01-04T00:00:00Z');
const MIN_FAMILY_EVENTS = 40;       // scorable prints inside the M1 window
const MIN_SPIKE = 2;                // the join-proof bar (the Stage-1 FOMC study's shape)
const MIN_DECISIVENESS = 1.5;       // winning hour ÷ next-best hour
const SCAN_HOURS = 23;              // ±, whole hours, for the untrusted archive
const TRUSTED_SCAN_HOURS = 3;       // sanity check only, for a source whose clock is verified
const CAL_OPTS = { baselineDays: 10 };
const CAL_MAX_EVENTS = 80;

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};

// The site's own news taxonomy (the button row on the sentiment pages), so the
// book can be read the way the dashboard groups it rather than as 200 titles.
const CATEGORIES = [
  [/rate decision|bank rate|cash rate|overnight rate|refinancing rate|policy rate|funds rate|rate votes|asset purchase|interest rate/i, 'rates'],
  [/\bcpi\b|inflation|price index|\bpce\b|\bppi\b|\brpi\b|prices|deflator/i, 'inflation'],
  [/employment|payroll|unemployment|jobless|claimant|earnings|jolts|labou?r|challenger/i, 'labor'],
  [/\bgdp\b|growth rate|industrial production|manufacturing production|factory output/i, 'growth'],
  [/\bpmi\b|\bism\b|business climate|ifo|\bzew\b|philly|empire|richmond|chicago|ivey|\bkof\b|barometer|sentiment index|business survey/i, 'business-activity'],
  [/retail sales|consumer spending|personal spending|redbook/i, 'retail'],
  [/trade balance|current account|exports|imports/i, 'trade'],
  [/consumer confidence|consumer sentiment|michigan|\bgfk\b/i, 'consumer-confidence'],
  [/home sales|building permits|building approvals|housing|construction|mortgage/i, 'housing'],
  [/durable goods|factory orders|net borrowing|budget|\brmpi\b/i, 'orders-fiscal'],
  [/crude oil|inventories|gasoline|natural gas|distillate|\bapi\b|\beia\b/i, 'energy'],
];
const categoryFor = title => (CATEGORIES.find(([re]) => re.test(title)) ?? [null, 'other'])[1];

// How many series to keep per (economy × category). The archives carry 200+
// series; the book covers the TYPES of news the site tracks, not every variant
// of every print, and each extra family is another row in the multiple-testing
// arithmetic of EVENT_RESPONSE_BOOK.md §5.
const PER_CATEGORY_CAP = 3;

// ── inputs ────────────────────────────────────────────────────────────────────

function readYields(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',').map(s => s.trim());
  const [i2, i10, i30] = ['y2', 'y10', 'y30'].map(k => head.indexOf(k));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(',');
    const date = (f[0] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const num = j => (j >= 0 && f[j] !== undefined && f[j].trim() !== '' ? Number(f[j]) : null);
    rows.push({ date, y2: num(i2), y10: num(i10), y30: num(i30) });
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The FF archive → the normalized release shape `econSurprise` scores. */
function readFfArchive(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ix = Object.fromEntries(['country', 'event', 'impact', 'ms', 'estimate', 'prev', 'actual'].map(k => [k, j.cols.indexOf(k)]));
  return {
    name: 'ForexFactory archive', from: j.from, to: j.to,
    rows: j.rows.map(r => ({
      country: r[ix.country], event: r[ix.event], impact: r[ix.impact], ms: r[ix.ms],
      estimate: r[ix.estimate], prev: r[ix.prev], actual: r[ix.actual],
    })),
  };
}

/**
 * Vendor 2 (`calendar_events.csv`) → the same shape. `datetime_raw` is UTC and,
 * unlike the FF archive, it is right. Impact tiers are Standard < Moderate < Major.
 */
function readVendor2(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const rows = [];
  let first = null, last = null;
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(',');
    if (f.length < 9) continue;
    const dt = (f[1] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dt)) continue;
    const ms = Date.parse(dt.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(ms)) continue;
    const country = CCY_TO_COUNTRY[(f[3] || '').trim().toUpperCase()];
    if (!country) continue;
    first ??= dt; last = dt;
    rows.push({
      country, event: (f[5] || '').trim(),
      impact: (f[4] || '').trim() === 'Major' ? 'high' : 'medium',
      ms, actual: (f[6] || '').trim(), prev: (f[7] || '').trim(), estimate: (f[8] || '').trim(),
    });
  }
  return { name: 'calendar_events.csv (vendor 2)', from: first, to: last, rows };
}

/**
 * 14:00 America/New_York on `day` as epoch ms. November meetings straddle the
 * DST switch, so the offset is resolved per date through Intl rather than
 * assumed — the same correction `fomcHistory.js`'s header calls out.
 */
function etToUtcMs(day, hour = 14, minute = 0) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess)).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return guess - (asUtc - guess);
}

/** Mean/sd standardisation — the FOMC tone score is not on the surprise scale. */
function standardize(values) {
  const a = values.filter(Number.isFinite);
  if (a.length < 2) return () => null;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  return v => (Number.isFinite(v) && sd > 0 ? (v - m) / sd : null);
}

/** Gaps beyond twice a series' own median spacing — a silent rename splits a sample. */
function cadenceGaps(events) {
  if (events.length < 4) return [];
  const gaps = events.slice(1).map((e, i) => (e.ms - events[i].ms) / 864e5);
  const med = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
  return gaps.map((g, i) => ({ g, i })).filter(x => x.g > 2 * med)
    .map(x => ({ afterDate: new Date(events[x.i].ms).toISOString().slice(0, 10), gapDays: Math.round(x.g), medianDays: Math.round(med) }));
}

// ── the clock: the market arbitrates, for every family, whatever the source ───

function calibrateClock(bars, eventMsList, scanHours = SCAN_HOURS) {
  const tried = [];
  for (let h = -scanHours; h <= scanHours; h++) {
    const shifted = eventMsList.map(ms => ms + h * 3600e3);
    const ratios = [];
    for (const ms of shifted) {
      const w = eventWindows(bars, ms);
      const b = baselineFor(bars, ms, shifted, CAL_OPTS);
      if (w.r0 != null && b.absR0 > 0) ratios.push(Math.abs(w.r0) / b.absR0);
    }
    const m = median(ratios);
    if (m != null) tried.push({ hours: h, spike: +m.toFixed(2), n: ratios.length });
  }
  if (!tried.length) return { hours: 0, spike: null, pass: false, reason: 'no windows' };
  const best = tried.reduce((a, b) => (b.spike > a.spike ? b : a));
  const next = tried.filter(t => t.hours !== best.hours).reduce((a, b) => (b.spike > a.spike ? b : a));
  const decisiveness = next.spike > 0 ? best.spike / next.spike : Infinity;
  const pass = best.spike >= MIN_SPIKE && decisiveness >= MIN_DECISIVENESS;
  return {
    hours: pass ? best.hours : 0, spike: best.spike, runnerUpSpike: next.spike,
    spikeAtZero: tried.find(t => t.hours === 0)?.spike ?? null,
    decisiveness: +decisiveness.toFixed(2), pass,
    reason: pass ? null
      : best.spike < MIN_SPIKE ? `peak ${best.spike}x below the ${MIN_SPIKE}x bar`
      : `peak only ${decisiveness.toFixed(2)}x the next hour — not decisive`,
  };
}

// ── families ──────────────────────────────────────────────────────────────────

/**
 * Candidate series per economy, from whichever archive covers it: vendor 2 for
 * USD/EUR/GBP (its timestamps can be trusted), the FF archive for the other five
 * (the only source that carries them at all — and every one of those families
 * has to earn its clock from the market before it is published).
 */
function discoverSeries(source, countries) {
  const m = new Map();
  for (const r of source.rows) {
    if (r.ms < M1_FROM) continue;
    if (!countries.includes(r.country)) continue;
    const scorable = r.actual !== '' && r.actual != null && r.estimate !== '' && r.estimate != null;
    const k = `${r.country}|${r.event}`;
    const o = m.get(k) ?? { country: r.country, title: r.event, n: 0, scorable: 0, impact: r.impact };
    o.n++; if (scorable) o.scorable++;
    if (r.impact === 'high') o.impact = 'high';
    m.set(k, o);
  }
  const all = [...m.values()].filter(x => x.scorable >= MIN_FAMILY_EVENTS);
  const kept = [], seen = new Map();
  for (const s of all.sort((a, b) => (a.impact === b.impact ? b.scorable - a.scorable : a.impact === 'high' ? -1 : 1))) {
    const cat = categoryFor(s.title);
    const k = `${s.country}|${cat}`;
    const n = seen.get(k) ?? 0;
    if (n >= PER_CATEGORY_CAP) continue;
    seen.set(k, n + 1);
    kept.push({ ...s, category: cat });
  }
  return kept;
}

function buildFamilies(sources, scores) {
  const fams = [];
  for (const { source, countries } of sources) {
    for (const s of discoverSeries(source, countries)) {
      const events = zSeriesFromReleases(source.rows, s.country, s.title);
      if (events.length < MIN_FAMILY_EVENTS) continue;          // the dispersion guard dropped it
      fams.push({
        key: `${s.country}|${s.title}`.toLowerCase().replace(/[^a-z0-9|]+/g, '-'),
        label: `${s.country} ${s.title}`, ccy: COUNTRY_TO_CCY[s.country], country: s.country,
        category: s.category, impact: s.impact, events,
        source: `${source.name} · ${s.country} | ${s.title}`, gaps: cadenceGaps(events),
        trustedClock: !!source.trustedClock,
      });
    }
  }

  // FOMC: the market-validated date list, timed at 14:00 ET, scored by the frozen
  // lexicon. The rate "surprise" a calendar carries is near-always zero (the
  // decision itself is priced), which is why the tone score is the outcome
  // variable here — and why its own predictive nulls are already banked.
  const byDate = new Map((scores.meetings ?? []).map(m => [m.date, m]));
  const fomc = [], rawD = [];
  for (const { date } of FOMC_MEETINGS_HISTORICAL) {
    const m = byDate.get(date);
    if (!m || !Number.isFinite(m.dScore)) continue;
    rawD.push(m.dScore);
    fomc.push({ date, ms: etToUtcMs(date, 14, 0), dScore: m.dScore });
  }
  const z = standardize(rawD);
  fams.push({
    key: 'fomc', label: 'US FOMC statement (tone)', ccy: 'USD', country: 'US', category: 'rates', impact: 'high',
    events: fomc.map(e => ({ ms: e.ms, z: z(e.dScore) })),
    source: 'js/fomcHistory.js dates @ 14:00 ET · cb-lexicon-v1 Δscore, standardised',
    gaps: cadenceGaps(fomc), trustedClock: true,
    outcomeNote: 'beat/miss here mean HAWKISH/DOVISH versus the previous statement, not a data surprise.',
  });

  // Beige Book: two weeks before each FOMC meeting at 14:00 ET, the rule
  // `js/beigeBookCalendar.js` already encodes. No offline tone score (the
  // sentiment engine's output lives in server KV), so it carries no outcome and
  // fills only the lead-up marginal — which still answers the first question
  // worth asking about it: does it move FX at all?
  fams.push({
    key: 'beige-book', label: 'US Beige Book', ccy: 'USD', country: 'US', category: 'rates', impact: 'medium',
    events: FOMC_MEETINGS_HISTORICAL.map(({ date }) => {
      const [y, m, d] = date.split('-').map(Number);
      return { ms: etToUtcMs(new Date(Date.UTC(y, m - 1, d - 14)).toISOString().slice(0, 10), 14, 0), z: null };
    }),
    source: 'js/beigeBookCalendar.js rule (FOMC date − 14d @ 14:00 ET); no offline tone score',
    gaps: [], trustedClock: true,
    outcomeNote: 'no outcome score offline — lead-up marginal only.',
  });
  return fams;
}

// ── run ───────────────────────────────────────────────────────────────────────

const only = (arg('--pairs') || '').split(',').map(s => s.trim()).filter(Boolean);
const pairs = PAIRS.filter(p => !only.length || only.includes(p));

console.log('[event-response] reading inputs…');
const yields = readYields(YIELDS);
const ff = readFfArchive(FF_ARCHIVE);
const v2 = readVendor2(VENDOR2);
const scores = JSON.parse(fs.readFileSync(FOMC_SCORES, 'utf8'));
console.log(`  vendor 2: ${v2.rows.length.toLocaleString()} rows ${v2.from} → ${v2.to}`);
console.log(`  FF archive: ${ff.rows.length.toLocaleString()} rows ${ff.from} → ${ff.to}`);

const families = buildFamilies([
  { source: { ...v2, trustedClock: true }, countries: ['US', 'EU', 'GB'] },   // trustworthy clocks
  { source: ff, countries: ['AU', 'NZ', 'CA', 'CH', 'JP'] },    // the only source that carries them
], scores);
const catCount = {};
for (const f of families) (catCount[f.category] ??= []).push(f.key);
console.log(`  ${families.length} candidate families across ${new Set(families.map(f => f.country)).size} economies`);
console.log('  ' + Object.entries(catCount).sort((a, b) => b[1].length - a[1].length).map(([c, k]) => `${c} ${k.length}`).join(' · '));

// Two different questions, kept apart.
//
//   A family from the FF archive has to EARN its clock: that source is wrong row
//   by row, so a full ±23h scan must find a big, decisive peak or the family is
//   dropped. No peak means we do not know when the release happened, and a grid
//   built on that is fiction.
//
//   A family from vendor 2 (or from the repo's own FOMC/Beige Book calendars)
//   already HAS a verified clock. It faces a ±3h sanity check only — enough to
//   catch a series whose stored time is an hour or two out — and is never
//   dropped for being a small mover. Conflating the two questions is what an
//   earlier pass of this script did, and it threw away 45 of 58 US/EU/GB
//   families whose timestamps were never in doubt: "this release barely moves
//   FX" is a RESULT, not a data fault, and the book should say so out loud
//   rather than hide the row.
console.log('[event-response] verifying release clocks…');
const byRef = {};
for (const f of families) (byRef[PROBE_REF[f.country] ?? 'eurusd'] ??= []).push(f);
const clockLog = [];
for (const [ref, list] of Object.entries(byRef)) {
  const bars = await loadM1ForPairLocal(ref);
  if (!bars?.n) {
    console.log(`  ${ref}: no local M1 — ${list.length} families cannot be checked, dropped`);
    list.forEach(f => (f.clock = { pass: false, reason: 'no reference M1' }));
    continue;
  }
  for (const fam of list) {
    const ms = fam.events.map(e => e.ms).slice(-CAL_MAX_EVENTS);
    if (fam.trustedClock) {
      const c = calibrateClock(bars, ms, TRUSTED_SCAN_HOURS);
      // Flagged, never dropped: the clock came from a source that has been
      // checked against known prints, so a nonzero argmax here is a warning to
      // the reader, not grounds to re-time the series on one noisy scan.
      fam.clock = { hours: 0, pass: true, trusted: true, spike: c.spikeAtZero, bestShift: c.hours, bestSpike: c.spike, suspect: c.pass && c.hours !== 0, ref };
    } else {
      fam.clock = { ...calibrateClock(bars, ms, SCAN_HOURS), trusted: false, ref };
      if (fam.clock.pass && fam.clock.hours) fam.events = fam.events.map(e => ({ ...e, ms: e.ms + fam.clock.hours * 3600e3 }));
    }
    clockLog.push({ family: fam.key, label: fam.label, ref, ...fam.clock });
  }
  const t = list.filter(f => f.trustedClock).length;
  const earned = list.filter(f => !f.trustedClock && f.clock.pass).length;
  const susp = list.filter(f => f.clock.suspect).length;
  console.log(`  ${ref}: ${t} trusted-clock famil${t === 1 ? 'y' : 'ies'}${susp ? ` (${susp} flagged suspect)` : ''}`
    + (list.length - t ? ` · ${earned}/${list.length - t} archive families proved their clock` : ''));
}
const verified = families.filter(f => f.clock?.pass);
const shiftHist = {};
for (const f of verified.filter(f => !f.trustedClock)) shiftHist[f.clock.hours] = (shiftHist[f.clock.hours] ?? 0) + 1;
console.log(`  → ${verified.length}/${families.length} families in the book`
  + ` · archive shifts ` + (Object.keys(shiftHist).length
    ? Object.entries(shiftHist).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h >= 0 ? '+' : ''}${h}h x${n}`).join(' ')
    : 'none'));
fs.writeFileSync(CLOCKS, JSON.stringify({
  builtAt: new Date().toISOString(),
  bar: { minSpike: MIN_SPIKE, minDecisiveness: MIN_DECISIVENESS, scanHours: SCAN_HOURS, trustedScanHours: TRUSTED_SCAN_HOURS },
  families: clockLog,
}, null, 1));

const merged = { families: {}, meta: null };
for (const pair of pairs) {
  process.stdout.write(`[event-response] ${pair} … `);
  const bars = await loadM1ForPairLocal(pair);
  if (!bars?.n) { console.log('no local M1 — skipped'); continue; }
  const book = buildEventResponseBook({
    instruments: { [pair]: { bars, legs: INSTRUMENTS[pair] } },
    families: verified, yields,
  });
  merged.meta ??= book.meta;
  let cells = 0;
  for (const [key, fam] of Object.entries(book.families)) {
    const dst = (merged.families[key] ??= { ...fam, instruments: {} });
    Object.assign(dst.instruments, fam.instruments);
    cells += Object.values(fam.instruments).reduce((s, i) => s + Object.keys(i.cells).length, 0);
  }
  console.log(`${bars.n.toLocaleString()} bars · ${cells} joint cell(s) above the bar`);
}

// Compaction. The full brick output carries n, median, mean and up-rate on four
// windows for every cell; at 86 families x 26 instruments that is an 10MB file
// nobody wants in git. Cells become fixed-position arrays under a schema
// declared in the output itself, which is ~4x smaller than the keyed objects
// and still self-describing. `all` keeps the readable shape — it is the row a
// human reads first.
const CELL_SCHEMA = ['n', 'pre5Median', 'r0Median', 'r1Median', 'r1UpPct', 'r5Median', 'leadMedianBp', 'earlyR1Median', 'lateR1Median', 'unstableR1'];
const compactCell = c => [
  c.n, c.pre5?.median ?? null, c.r0?.median ?? null, c.r1?.median ?? null, c.r1?.upPct ?? null,
  c.r5?.median ?? null, c.leadMedianBp, c.halves.earlyR1Median, c.halves.lateR1Median,
  c.unstable?.r1 === true ? 1 : c.unstable?.r1 === false ? 0 : null,
];
// Short keys for the same reason: 'priced-hawkish|beat' x 20k cells is a
// megabyte of repeated string. h/f/d = hawkish/flat/dovish, b/i/m = beat/inline/miss.
const SHORT = { 'priced-hawkish': 'h', flat: 'f', 'priced-dovish': 'd', beat: 'b', inline: 'i', miss: 'm' };
const shortKey = k => k.split('|').map(x => SHORT[x] ?? x).join('');
const compactCells = obj => Object.fromEntries(Object.entries(obj).map(([k, c]) => [shortKey(k), compactCell(c)]));
const compactInst = i => ({
  n: i.all.n, side: i.all.side,
  pre5: [i.all.pre5.median, i.all.pre5.upPct], r0: [i.all.r0.median, i.all.r0.upPct],
  r1: [i.all.r1.median, i.all.r1.mean, i.all.r1.upPct], r5: [i.all.r5.median, i.all.r5.upPct],
  absR1Median: i.all.absR1Median, baselineAbsR1: i.all.baselineAbsR1Median,
  moveMultiple: i.all.moveMultiple, spikeR0: i.all.joinProof.spikeRatioR0, spikePass: i.all.joinProof.pass,
  cells: compactCells(i.cells), lead: compactCells(i.leadCells), outcome: compactCells(i.outcomeCells),
  cellsOmitted: i.cellsOmitted,
});

/** A family's join proof across the instruments that actually traded it. */
function familyJoinProof(famKey) {
  const insts = Object.values(merged.families[famKey]?.instruments ?? {});
  const ratios = insts.map(i => i.all?.joinProof?.spikeRatioR0).filter(Number.isFinite);
  return {
    medianSpikeR0: ratios.length ? +median(ratios).toFixed(2) : null,
    instrumentsPassing: insts.filter(i => i.all?.joinProof?.pass).length, instruments: insts.length,
  };
}

const out = {
  builtAt: new Date().toISOString(),
  spec: 'MD files/EVENT_RESPONSE_BOOK.md §4 (design frozen 2026-09-17)',
  status: 'DESCRIPTIVE — history with sample sizes. Not a forecast, not a signal. '
        + 'The confirmatory test registered in §6 is separate and is not run here.',
  sources: {
    'US/EU/GB releases': { source: 'calendar_events.csv', from: v2.from, to: v2.to, clocks: 'trusted (spot-checked incl. the DST switch)' },
    'AU/NZ/CA/CH/JP releases': { source: 'backfill/surprise_backfill.json', from: ff.from, to: ff.to, clocks: 'UNRELIABLE row-by-row — every family re-timed against the market, dropped if it cannot prove its clock' },
    'FOMC + Beige Book': { source: 'js/fomcHistory.js + js/beigeBookCalendar.js rule', clocks: '14:00 ET resolved per date through Intl' },
  },
  yieldSource: {
    source: 'analysis/output/yield_coupling/yields.csv', from: yields[0]?.date, to: yields.at(-1)?.date,
    cadence: 'daily closes (no intraday yield series exists offline)',
    caveat: "The lead-up state is the US 2y for EVERY family. For a non-US release that is a "
          + "global-rates proxy, NOT that economy's own curve — no offline series carries Bund, "
          + "Gilt, JGB or ACGB yields.",
  },
  clockVerification: {
    trustedSources: 'clock taken as given (vendor 2, and the repo FOMC/Beige Book calendars); ±3h sanity check only, flagged not dropped',
    untrustedSource: `FF archive families must show a peak >=${MIN_SPIKE}x an ordinary day AND >=${MIN_DECISIVENESS}x the next-best hour across a ±${SCAN_HOURS}h scan, or they are dropped`,
    inBook: verified.length, candidates: families.length,
    archiveShiftHistogram: shiftHist,
    suspectTrustedClocks: verified.filter(f => f.clock.suspect).map(f => ({ label: f.label, bestShift: f.clock.bestShift, bestSpike: f.clock.bestSpike, spikeAtZero: f.clock.spike })),
    detail: 'backfill/event_response_clocks.json',
  },
  instruments: pairs,
  families: Object.fromEntries(verified.map(f => [f.key, {
    label: f.label, category: f.category, ccy: f.ccy, country: f.country, impact: f.impact,
    source: f.source, events: f.events.length, outcomeNote: f.outcomeNote ?? null,
    // The three worst schedule gaps plus a count — the full list on a weekly
    // series is hundreds of holiday rows and was 80% of this file.
    gapCount: f.gaps.length, worstGaps: f.gaps.sort((a, b) => b.gapDays - a.gapDays).slice(0, 3),
    clockSource: f.trustedClock ? 'trusted' : 'earned from the market', clockShiftHours: f.clock.hours,
    clockSpike: f.clock.spike, clockSuspect: f.clock.suspect ?? false,
    joinProof: familyJoinProof(f.key),
  }])),
  droppedFamilies: families.filter(f => !f.clock?.pass).map(f => ({
    label: f.label, country: f.country, category: f.category, events: f.events.length,
    reason: f.clock?.reason ?? 'unverified', peak: f.clock?.spike ?? null,
  })),
  meta: merged.meta,
  cellSchema: CELL_SCHEMA,
  cellKeys: { h: 'priced-hawkish', f: 'flat', d: 'priced-dovish', b: 'beat', i: 'inline', m: 'miss', note: 'joint keys concatenate lead+outcome, e.g. "hb" = priced-hawkish + beat' },
  allSchema: { pre5: ['median', 'upPct'], r0: ['median', 'upPct'], r1: ['median', 'mean', 'upPct'], r5: ['median', 'upPct'], units: 'basis points of log return' },
  book: Object.fromEntries(Object.entries(merged.families).map(([k, fam]) => [k, {
    label: fam.label, ccy: fam.ccy, events: fam.events, from: fam.from, to: fam.to,
    instruments: Object.fromEntries(Object.entries(fam.instruments).map(([n, i]) => [n, compactInst(i)])),
  }])),
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`[event-response] wrote ${OUT.replace(ROOT + '/', '')} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`
  + ` · ${verified.length} families · ${families.length - verified.length} dropped for unproven clocks`);
