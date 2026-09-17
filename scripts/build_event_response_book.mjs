#!/usr/bin/env node
/**
 * Build the Event Response Book — the narrow slice registered in
 * `MD files/EVENT_RESPONSE_BOOK.md` §8 steps 1–2: FOMC / US CPI y/y / US NFP,
 * across the seven USD pairs plus gold, conditioned on what the front end of
 * the curve did INTO each event.
 *
 * Runs entirely offline. Every input is already on disk:
 *   M1 bars     VolRangeForecaster/data/m1/<pair>_m1.parquet   (untracked, ~1.6GB)
 *   yields      analysis/output/yield_coupling/yields.csv      (tracked)
 *   releases    backfill/surprise_backfill.json                (tracked)
 *   FOMC dates  js/fomcHistory.js                              (Stage-1 validated)
 *   FOMC tone   analysis/fomc_event_study/fomc_lexicon_scores.json
 *
 * Same build-here / run-there split as `build_surprise_backfill.mjs`: the M1 set
 * is not on Railway, so the book is built locally and the small JSON is what
 * ships. The server merges releases newer than the archive's 2025-04 cutoff from
 * KV at read time — the archive end date is carried in the output so nothing
 * silently stitches two coverage windows together.
 *
 * One pair is held in memory at a time (a single M1 parquet is ~90MB packed and
 * several times that while decoding), so this is slow-ish and steady rather than
 * parallel. Budget a few minutes:
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
const RELEASES = path.join(ROOT, 'backfill', 'surprise_backfill.json');
const FOMC_SCORES = path.join(ROOT, 'analysis', 'fomc_event_study', 'fomc_lexicon_scores.json');
const OUT = path.join(ROOT, 'backfill', 'event_response_book.json');

// The narrow slice. Legs decide only which side of the pair the releasing
// currency sits on; returns stay in the instrument's own terms. Gold is quoted
// in dollars, so USD is its quote leg — a stronger dollar is gold-negative, the
// same convention `buildEventStudy` uses for USD-quote pairs.
const INSTRUMENTS = {
  eurusd: ['EUR', 'USD'], gbpusd: ['GBP', 'USD'], audusd: ['AUD', 'USD'], nzdusd: ['NZD', 'USD'],
  usdjpy: ['USD', 'JPY'], usdcad: ['USD', 'CAD'], usdchf: ['USD', 'CHF'], gold: ['XAU', 'USD'],
};

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};

/**
 * The release archive's timestamps do not point at the release.
 *
 * `backfill/surprise_backfill.json` carries US 08:30 ET releases at 19:30/20:30
 * UTC on the day BEFORE the print (checked by hand: December 2023 CPI, released
 * 2024-01-11 08:30 ET, is stored as 2024-01-10 20:30Z). Against the M1 tape the
 * error is a uniform +17h for every US morning series tested. That is harmless
 * for the surprise INDEX, whose only use of `ms` is an age-decay weight, which
 * is presumably why it has never surfaced — but an event window built on it
 * measures the wrong day entirely.
 *
 * So the offset is not hardcoded from that reasoning: it is CALIBRATED against
 * the market for each family and then has to clear the join proof. `calibrate`
 * scans whole-hour shifts and takes the one that maximises the median
 * 30-minute move against the same clock on ordinary days. A correctly-timed
 * release stands well clear of its neighbours (CPI and NFP both peak at +17h,
 * ≈2.5x, with every other hour ≈1.0x); if no shift clears `MIN_SPIKE`, the
 * family is written with `joinProof.pass:false` and must be read as suspect
 * rather than quietly shifted onto the best-looking hour.
 */
const OFFSET_SCAN_HOURS = 24;
const MIN_SPIKE = 2;

function calibrateOffset(bars, eventMsList, { scan = OFFSET_SCAN_HOURS } = {}) {
  const tried = [];
  for (let h = 0; h < scan; h++) {
    const shifted = eventMsList.map(ms => ms + h * 3600e3);
    const ratios = [];
    for (const ms of shifted) {
      const w = eventWindows(bars, ms);
      const b = baselineFor(bars, ms, shifted);
      if (w.r0 != null && b.absR0 > 0) ratios.push(Math.abs(w.r0) / b.absR0);
    }
    const m = median(ratios);
    if (m != null) tried.push({ hours: h, spike: +m.toFixed(2), n: ratios.length });
  }
  if (!tried.length) return { hours: 0, spike: null, pass: null, scan: [] };
  const best = tried.reduce((a, b) => (b.spike > a.spike ? b : a));
  const runnerUp = tried.filter(t => t.hours !== best.hours).reduce((a, b) => (b.spike > a.spike ? b : a));
  return {
    hours: best.spike >= MIN_SPIKE ? best.hours : 0,
    spike: best.spike, runnerUpSpike: runnerUp.spike, pass: best.spike >= MIN_SPIKE,
    scan: tried.sort((a, b) => b.spike - a.spike).slice(0, 4),
  };
}

// ── inputs ────────────────────────────────────────────────────────────────────

function readYields(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',').map(s => s.trim());
  const col = k => head.indexOf(k);
  const [i2, i10, i30] = [col('y2'), col('y10'), col('y30')];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(',');
    const date = (f[0] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const num = j => (j >= 0 && f[j] !== undefined && f[j].trim() !== '' ? Number(f[j]) : null);
    rows.push({ date, y2: num(i2), y10: num(i10), y30: num(i30) });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

/** The FF archive → the normalized release shape `econSurprise` scores. */
function readReleases(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const [iC, iE, iI, iMs, iEst, iPrev, iAct] = ['country', 'event', 'impact', 'ms', 'estimate', 'prev', 'actual'].map(k => j.cols.indexOf(k));
  return {
    from: j.from, to: j.to,
    rows: j.rows.map(r => ({
      country: r[iC], event: r[iE], impact: r[iI], ms: r[iMs],
      estimate: r[iEst], prev: r[iPrev], actual: r[iAct],
    })),
  };
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

/**
 * Gaps in a series that are more than twice its own median spacing — a silent
 * ForexFactory rename splits a sample in half and nothing else would say so.
 */
function cadenceGaps(events) {
  if (events.length < 4) return [];
  const gaps = events.slice(1).map((e, i) => (e.ms - events[i].ms) / 864e5);
  const sorted = [...gaps].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  return gaps.map((g, i) => ({ g, i })).filter(x => x.g > 2 * med)
    .map(x => ({ afterDate: new Date(events[x.i].ms).toISOString().slice(0, 10), gapDays: Math.round(x.g), medianDays: Math.round(med) }));
}

// ── families ──────────────────────────────────────────────────────────────────

function buildFamilies(releases, scores) {
  const fams = [];

  for (const [key, country, title, label] of [
    ['cpi', 'US', 'CPI y/y', 'US CPI y/y'],
    ['nfp', 'US', 'Non-Farm Employment Change', 'US Non-Farm Payrolls'],
  ]) {
    const events = zSeriesFromReleases(releases.rows, country, title);
    fams.push({ key, label, ccy: 'USD', events, source: `ForexFactory archive · ${country} | ${title}`, gaps: cadenceGaps(events), trustedClock: false });
  }

  // FOMC: the market-validated date list, timed at 14:00 ET, scored by the frozen
  // lexicon. The rate "surprise" the calendar carries is near-always zero (the
  // decision itself is priced), which is exactly why the tone score is the outcome
  // variable here — and why its own predictive nulls are already banked.
  const byDate = new Map((scores.meetings ?? []).map(m => [m.date, m]));
  const fomc = [];
  const rawD = [];
  for (const { date } of FOMC_MEETINGS_HISTORICAL) {
    const m = byDate.get(date);
    if (!m || !Number.isFinite(m.dScore)) continue;
    rawD.push(m.dScore);
    fomc.push({ date, ms: etToUtcMs(date, 14, 0), dScore: m.dScore });
  }
  const z = standardize(rawD);
  fams.push({
    key: 'fomc', label: 'FOMC statement', ccy: 'USD',
    events: fomc.map(e => ({ ms: e.ms, z: z(e.dScore) })),
    source: 'js/fomcHistory.js dates @ 14:00 ET · cb-lexicon-v1 Δscore, standardised',
    gaps: cadenceGaps(fomc),
    // The only family whose clock is not the archive's: these are the Stage-1
    // market-validated decision days, timed at 14:00 ET through Intl, so they
    // are join-PROVEN rather than join-calibrated.
    trustedClock: true,
    outcomeNote: 'beat/miss here mean HAWKISH/DOVISH versus the previous statement, not a data surprise.',
  });
  return fams;
}

// ── run ───────────────────────────────────────────────────────────────────────

const only = (arg('--pairs') || '').split(',').map(s => s.trim()).filter(Boolean);
const pairs = Object.keys(INSTRUMENTS).filter(p => !only.length || only.includes(p));

console.log('[event-response] reading inputs…');
const yields = readYields(YIELDS);
const releases = readReleases(RELEASES);
const scores = JSON.parse(fs.readFileSync(FOMC_SCORES, 'utf8'));
const families = buildFamilies(releases, scores);
for (const f of families) {
  console.log(`  ${f.key}: ${f.events.length} scored events` + (f.gaps.length ? ` · ${f.gaps.length} cadence gap(s)` : ''));
}

// Calibrate the archive's clock against one reference instrument before any
// cell is computed — a family whose timestamps are wrong produces a full grid
// of confident-looking numbers about the wrong half-hour.
const REF = 'eurusd';
console.log(`[event-response] calibrating release clocks against ${REF} …`);
const refBars = await loadM1ForPairLocal(REF);
if (!refBars?.n) throw new Error(`no local M1 for ${REF} — cannot calibrate`);
for (const fam of families) {
  if (fam.trustedClock) {
    const ratios = [];
    const msList = fam.events.map(e => e.ms);
    for (const ms of msList) {
      const w = eventWindows(refBars, ms), b = baselineFor(refBars, ms, msList);
      if (w.r0 != null && b.absR0 > 0) ratios.push(Math.abs(w.r0) / b.absR0);
    }
    const m = median(ratios);
    fam.clock = { hours: 0, spike: m == null ? null : +m.toFixed(2), pass: m != null && m >= MIN_SPIKE, calibrated: false };
  } else {
    fam.clock = { ...calibrateOffset(refBars, fam.events.map(e => e.ms)), calibrated: true };
    if (fam.clock.hours) fam.events = fam.events.map(e => ({ ...e, ms: e.ms + fam.clock.hours * 3600e3 }));
  }
  const c = fam.clock;
  console.log(`  ${fam.key}: ${c.calibrated ? `shift ${c.hours >= 0 ? '+' : ''}${c.hours}h` : 'clock from source'} · spike ${c.spike ?? 'n/a'}x`
    + (c.runnerUpSpike ? ` (next best ${c.runnerUpSpike}x)` : '') + (c.pass ? '' : '  ← JOIN PROOF FAILED, rows are suspect'));
}

const merged = { families: {}, meta: null };
for (const pair of pairs) {
  process.stdout.write(`[event-response] ${pair} … `);
  const bars = await loadM1ForPairLocal(pair);
  if (!bars?.n) { console.log('no local M1 — skipped'); continue; }
  const book = buildEventResponseBook({
    instruments: { [pair]: { bars, legs: INSTRUMENTS[pair] } },
    families, yields,
  });
  merged.meta ??= book.meta;
  let cells = 0;
  for (const [key, fam] of Object.entries(book.families)) {
    const dst = (merged.families[key] ??= { ...fam, instruments: {} });
    Object.assign(dst.instruments, fam.instruments);
    cells += Object.values(fam.instruments).reduce((s, i) => s + Object.keys(i.cells).length, 0);
  }
  console.log(`${bars.n.toLocaleString()} bars · ${cells} cell(s) above the bar`);
}

// Provenance the reader needs to judge the numbers: which archive, how far it
// runs, and the fact that the conditioning is daily while the windows are M1.
const out = {
  builtAt: new Date().toISOString(),
  spec: 'MD files/EVENT_RESPONSE_BOOK.md §4 (design frozen 2026-09-17)',
  status: 'DESCRIPTIVE — history with sample sizes. Not a forecast, not a signal. '
        + 'The confirmatory test registered in §6 is separate and is not run here.',
  releaseArchive: { source: RELEASES.replace(ROOT + '/', ''), from: releases.from, to: releases.to },
  yieldSource: { source: YIELDS.replace(ROOT + '/', ''), from: yields[0]?.date, to: yields.at(-1)?.date, cadence: 'daily closes (no intraday yield series exists offline)' },
  instruments: pairs,
  families: Object.fromEntries(families.map(f => [f.key, {
    label: f.label, source: f.source, events: f.events.length, gaps: f.gaps,
    outcomeNote: f.outcomeNote ?? null,
    // How this family's release clock was established, and what the market said
    // about it. `clockShiftHours` non-zero means the archive's timestamps were
    // corrected — see the calibration note at the top of this script.
    clockShiftHours: f.clock?.hours ?? 0,
    clockCalibrated: f.clock?.calibrated ?? null,
    joinProof: { spikeRatioR0: f.clock?.spike ?? null, runnerUpSpike: f.clock?.runnerUpSpike ?? null, pass: f.clock?.pass ?? null },
  }])),
  meta: merged.meta,
  book: merged.families,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`[event-response] wrote ${OUT.replace(ROOT + '/', '')} (${kb}KB)`);
