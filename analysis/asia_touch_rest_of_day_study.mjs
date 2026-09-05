// Asia-Touch Rest-of-Day Study — 2026-09-01
//
// Question this answers (the user's own reference-tool comparison — a "Band
// Read" card that shows genuinely CONDITIONAL analysis, e.g. "when Gold had
// travelled most of the way to the lower band by 07:00 London it reached the
// 75th 40% of the time vs a 24% base"): does an ASIA-SESSION touch of a rung
// (any rung, any side) change what happens for the REST of that trading day
// (London+NY), compared to a day where Asia stayed quiet?
//
//   Q1 — is a same-day margin>=3 signal (the bot's own live threshold, ANY
//        rung/side, restricted to the LIVE rungs p50/p75 same as the live
//        plan — p90 is excluded from the live plan per server.js's
//        excludeRungs convention) more or less likely in the REMAINDER of the
//        day (London+NY) once Asia has already touched a rung, vs a day
//        where Asia touched nothing?
//   Q2 — conditional on Asia touching a rung, does the day's REST-OF-DAY
//        realized range (London+NY combined high-low, in pips) or the day's
//        FORECAST dayVol regime skew differently than an Asia-quiet day?
//   Q3 — if a specific (side,rung) got touched in Asia, is the OTHER SIDE of
//        that SAME rung, or an OUTER rung on the SAME side, more or less
//        likely to be touched later that day, vs the unconditional
//        (baseline) rate of that same event on days Asia did NOT touch that
//        specific (side,rung)? (continuation vs exhaustion, the same
//        framing as the Gold reference card)
//
// ── METHOD — reuses js/levelAtlasEngine.js's atlasWalk() wholesale ─────────
// No touch-detection, ladder, or session-classification math is reimplemented
// here — this only slices/aggregates what atlasWalk already produces
// (session, hourUtc, dayVol, per-touch outcome), following the SAME M1
// loading pattern as analysis/dayvol_regime_breakdown.mjs and
// analysis/neither_population_live_gap_study.mjs (js/volBacktestM1Engine.js's
// loadM1ForPair). rearmFracs is narrowed to [0.3] (DEFAULT_REARM, matching
// the live re-arm definition) so a single physical touch isn't counted 3x
// under 3 different re-arm definitions. margin/vote decisions use
// buildAtlasBook + voteDecision exactly as the live plan and every other
// vote-review script do; results are restricted to date >= book.splitDate
// (OOS only) throughout, so the "signal probability" numbers in Q1 are never
// read off the same data the book's own dimension-holds were fit on.
//
// ── THE ONE SUBTLE CORRECTNESS ISSUE THIS SCRIPT HAD TO GET RIGHT ──────────
// atlasWalk's `date` field comes from bucketM1IntoSessions(packed,
// 'Europe/London') — a pure LONDON-MIDNIGHT calendar-day bucket
// (js/forecastAnalyser.js's _londonDateKey), which is NOT the same thing as
// "one trading day's Asia session". Because Asia (hourUtc>=22 or <7) straddles
// that midnight boundary, a single date-key D's 'Asia'-tagged touches are
// actually TWO physically distinct sessions: the tail of the overnight
// session that started the PREVIOUS evening (hourUtc<7, chronologically
// BEFORE London(D) opens) and the head of the NEW overnight session that
// starts THAT evening (hourUtc>=22, chronologically AFTER NY(D) already
// closed — this is really the start of date-key D+1's overnight session, not
// a predictor of D's own London/NY, which already happened earlier that same
// day). Naively grouping by `touch.date === D` for "Asia(D)" would silently
// mix in the AFTER-NY-close evening touches as if they preceded London(D) —
// backwards causality. Fixed by reconstructing each trading day's REAL
// preceding Asia session as the union of {date=prevDate(D), hourUtc>=22} and
// {date=D, hourUtc<7} — verified directly against _londonDateKey's actual
// bucketing (js/forecastAnalyser.js), not assumed from a comment elsewhere.
//
// Sample-size discipline: every conditional slice reports its own n; any
// slice with n<MIN_SAMPLE (30, matching the floor used elsewhere today, e.g.
// book_health_check.mjs's MIN_LIVE_SAMPLE=20 for a live sample, slightly
// tighter here since this is a full historical re-walk) is flagged as
// too-thin rather than reported as a finding.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { voteDecision } from '../js/levelAtlasVoteReview.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const REARM = 0.3;                          // DEFAULT_REARM, same as every other live-matching script today
const MIN_MARGIN = 3;                        // VOLATILITY_V2_MIN_MARGIN, server.js
const LIVE_RUNGS = new Set(['p50', 'p75']);  // p90 excluded from the live plan (excludeRungs default)
const MIN_SAMPLE = 30;
const RUNGS = ['p50', 'p75', 'p90'];
const RUNG_IDX = { p50: 0, p75: 1, p90: 2 };
const SIDES = ['up', 'down'];

// server.js VOLATILITY_V2_DEFAULT_PAIRS (the 17-pair "Select recommended" set).
// LA_PAIRS env override lets a pilot run cover a subset without editing this file.
const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }
function pushMap(map, key, val) { const a = map.get(key); if (a) a.push(val); else map.set(key, [val]); }

// Exact replica of atlasWalk's own dayVol classification (js/levelAtlasEngine.js,
// same forecastSigma/LADDER_PARAMS estimator selection, same r<0.85/r>1.25
// thresholds) — a per-day FORECAST regime label (fit on data strictly before
// today), independent of whether any touch happened that day, so an
// Asia-quiet day still gets a label.
function dayVolByDate(sessions, dates, sym, assetClass) {
  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';
  const out = new Map();
  for (let i = 0; i < dates.length; i++) {
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const hist = [];
    for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
    if (hist.length < 8) continue;
    const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    if (!(med > 0)) continue;
    const r = sigma / med;
    out.set(dates[i], r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal');
  }
  return out;
}

async function processPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data, skipping'); return null; }
  const assetClass = assetClassFor(pair);

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const allDates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (allDates.length < 60) { console.log('  too little history, skipping'); return null; }

  const t0 = Date.now();
  const { touches, coverage } = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM] });
  if (!touches.length || !coverage) { console.log('  no touches, skipping'); return null; }
  const book = buildAtlasBook(touches, { rearmFrac: REARM });
  if (!book) { console.log('  no book, skipping'); return null; }
  console.log(`  ${touches.length.toLocaleString()} touches, ${coverage.sessions} sessions (${coverage.from}→${coverage.to}), split ${book.splitDate} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  let pip = 1; try { pip = pipSize(sym) || 1; } catch {}

  const dayVolMap = dayVolByDate(sessions, allDates, sym, assetClass);

  // Bucket touches by their REAL role: Asia-morning (hourUtc<7, precedes
  // London/NY of the SAME date-key), Asia-evening (hourUtc>=22, precedes
  // London/NY of the NEXT date-key), or rest-of-day (London/NY, unambiguous).
  const byDateAsiaMorning = new Map();
  const byDateAsiaEvening = new Map();
  const byDateRestOfDay = new Map();
  for (const t of touches) {
    if (t.session === 'Asia') {
      if (t.hourUtc < 7) pushMap(byDateAsiaMorning, t.date, t);
      else pushMap(byDateAsiaEvening, t.date, t);
    } else {
      pushMap(byDateRestOfDay, t.date, t);
    }
  }

  const dayRows = [];   // Q1 + Q2, one row per OOS trading day
  const comboRows = []; // Q3, one row per (day, side, rung) combo

  for (let i = 1; i < allDates.length; i++) {   // i=1: skip the very first day, no prevDate
    const D = allDates[i];
    if (D < book.splitDate) continue;
    const prevD = allDates[i - 1];
    const asiaTouches = [...(byDateAsiaEvening.get(prevD) ?? []), ...(byDateAsiaMorning.get(D) ?? [])];
    const restTouches = byDateRestOfDay.get(D) ?? [];
    const asiaTouched = asiaTouches.length > 0;

    // ── Q1: margin>=3 live-rung signal anywhere in the rest of the day
    let hadSignal = false;
    for (const t of restTouches) {
      if (!LIVE_RUNGS.has(t.rung)) continue;
      const vd = voteDecision(book, t);
      if (vd && vd.margin >= MIN_MARGIN) { hadSignal = true; break; }
    }

    // ── Q2: rest-of-day (London+NY, hourUtc 7-22) realized range in pips
    const bars = sessions.get(D) ?? [];
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) {
      const h = new Date(b.time * 1000).getUTCHours();
      if (h >= 7 && h < 22) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    }
    const restRangePips = (hi > -Infinity && lo < Infinity) ? +((hi - lo) / pip).toFixed(1) : null;
    const dayVolRegime = dayVolMap.get(D) ?? null;

    dayRows.push({ pair: sym, date: D, asiaTouched, asiaTouchCount: asiaTouches.length, hadSignal, restRangePips, dayVolRegime });

    // ── Q3: per (side,rung) combo — did Asia touch it, and did the rest of
    // the day touch the OTHER side of the same rung, or an outer rung same side?
    for (const side of SIDES) {
      const otherSide = side === 'up' ? 'down' : 'up';
      for (const rung of RUNGS) {
        const rIdx = RUNG_IDX[rung];
        const asiaTouchedCombo = asiaTouches.some(t => t.side === side && t.rung === rung);
        const restOtherSideTouched = restTouches.some(t => t.side === otherSide && t.rung === rung);
        const restOuterTouched = rIdx < 2 ? restTouches.some(t => t.side === side && RUNG_IDX[t.rung] > rIdx) : null;
        comboRows.push({ pair: sym, date: D, side, rung, asiaTouchedCombo, restOtherSideTouched, restOuterTouched });
      }
    }
  }

  return { pair: sym, coverage, splitDate: book.splitDate, dayRows, comboRows };
}

async function main() {
  const allDayRows = [];
  const allComboRows = [];
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const r = await processPair(pair);
    if (!r) continue;
    allDayRows.push(...r.dayRows);
    allComboRows.push(...r.comboRows);
    perPairMeta.push({ pair: r.pair, coverage: r.coverage, splitDate: r.splitDate, oosDays: r.dayRows.length });
    const asiaN = r.dayRows.filter(d => d.asiaTouched).length;
    console.log(`  OOS days: ${r.dayRows.length}  (Asia touched: ${asiaN}, ${pct(asiaN, r.dayRows.length)}%)`);
  }

  console.log(`\n\n================ COVERAGE ================`);
  console.log('pair       OOS days  splitDate    coverage');
  for (const m of perPairMeta) console.log(`${m.pair.padEnd(10)} ${String(m.oosDays).padStart(8)}  ${m.splitDate}  ${m.coverage.from}→${m.coverage.to}`);
  const totalDays = allDayRows.length;
  console.log(`\nPooled: ${perPairMeta.length} pairs, ${totalDays} pair-days (OOS only, date >= each pair's own book.splitDate).`);

  // ═══════════════════════════ Q1 ═══════════════════════════
  console.log(`\n\n================ Q1: margin>=${MIN_MARGIN} live-rung (p50/p75) signal in London+NY, by whether Asia touched anything ================`);
  const touchedRows = allDayRows.filter(d => d.asiaTouched);
  const quietRows = allDayRows.filter(d => !d.asiaTouched);
  const touchedSig = touchedRows.filter(d => d.hadSignal).length;
  const quietSig = quietRows.filter(d => d.hadSignal).length;
  const pTouched = pct(touchedSig, touchedRows.length);
  const pQuiet = pct(quietSig, quietRows.length);
  console.log(`  Asia touched : n=${touchedRows.length}  P(signal in rest of day)=${pTouched}%  (${touchedSig}/${touchedRows.length})`);
  console.log(`  Asia quiet   : n=${quietRows.length}  P(signal in rest of day)=${pQuiet}%  (${quietSig}/${quietRows.length})`);
  const liftQ1 = (pTouched != null && pQuiet != null && pQuiet > 0) ? +(pTouched / pQuiet).toFixed(2) : null;
  console.log(`  Lift = ${liftQ1}x` + ((touchedRows.length < MIN_SAMPLE || quietRows.length < MIN_SAMPLE) ? '  [BELOW n>=' + MIN_SAMPLE + ' FLOOR — not reportable]' : ''));

  console.log(`\n  Per-pair breakdown:`);
  console.log('  pair       touchedN  touchedSig%  quietN  quietSig%  lift');
  const byPair = new Map();
  for (const d of allDayRows) pushMap(byPair, d.pair, d);
  for (const [p, rows] of byPair) {
    const t = rows.filter(d => d.asiaTouched), q = rows.filter(d => !d.asiaTouched);
    const tS = pct(t.filter(d => d.hadSignal).length, t.length), qS = pct(q.filter(d => d.hadSignal).length, q.length);
    const lift = (tS != null && qS != null && qS > 0) ? +(tS / qS).toFixed(2) : null;
    const flag = (t.length < MIN_SAMPLE || q.length < MIN_SAMPLE) ? '  (thin)' : '';
    console.log(`  ${p.padEnd(10)} ${String(t.length).padStart(8)}  ${String(tS).padStart(10)}%  ${String(q.length).padStart(6)}  ${String(qS).padStart(8)}%  ${String(lift).padStart(5)}${flag}`);
  }

  // ═══════════════════════════ Q2 ═══════════════════════════
  console.log(`\n\n================ Q2a: rest-of-day (London+NY) realized range, by whether Asia touched anything ================`);
  const touchedRange = touchedRows.map(d => d.restRangePips).filter(x => x != null);
  const quietRange = quietRows.map(d => d.restRangePips).filter(x => x != null);
  console.log(`  Asia touched : n=${touchedRange.length}  mean=${mean(touchedRange)?.toFixed(1)} pips  median=${median(touchedRange)?.toFixed(1)} pips`);
  console.log(`  Asia quiet   : n=${quietRange.length}  mean=${mean(quietRange)?.toFixed(1)} pips  median=${median(quietRange)?.toFixed(1)} pips`);
  const rangeLift = (mean(touchedRange) != null && mean(quietRange) != null && mean(quietRange) > 0) ? +(mean(touchedRange) / mean(quietRange)).toFixed(2) : null;
  console.log(`  Mean ratio = ${rangeLift}x` + ((touchedRange.length < MIN_SAMPLE || quietRange.length < MIN_SAMPLE) ? '  [BELOW n>=' + MIN_SAMPLE + ' FLOOR]' : ''));

  console.log(`\n================ Q2b: FORECAST dayVol regime distribution, by whether Asia touched anything ================`);
  const regimes = ['1·quiet', '2·normal', '3·heavy'];
  console.log('  group          ' + regimes.map(r => r.padEnd(12)).join(''));
  for (const [label, rows] of [['Asia touched', touchedRows], ['Asia quiet', quietRows]]) {
    const withRegime = rows.filter(d => d.dayVolRegime != null);
    const cells = regimes.map(r => { const n = withRegime.filter(d => d.dayVolRegime === r).length; return `${pct(n, withRegime.length)}% (n=${n})`.padEnd(12); });
    console.log(`  ${label.padEnd(14)} ${cells.join('')}  [total n=${withRegime.length}]`);
  }

  // ═══════════════════════════ Q3 ═══════════════════════════
  console.log(`\n\n================ Q3: continuation vs exhaustion — given Asia touched a specific (side,rung), what happens to that SAME rung/side pair in the rest of the day? ================`);
  function reportQ3(rows, label) {
    const on = rows.filter(r => r.asiaTouchedCombo);
    const off = rows.filter(r => !r.asiaTouchedCombo);
    const onOther = on.filter(r => r.restOtherSideTouched).length;
    const offOther = off.filter(r => r.restOtherSideTouched).length;
    const pOnOther = pct(onOther, on.length), pOffOther = pct(offOther, off.length);
    const liftOther = (pOnOther != null && pOffOther != null && pOffOther > 0) ? +(pOnOther / pOffOther).toFixed(2) : null;
    const onOuterElig = on.filter(r => r.restOuterTouched != null);
    const offOuterElig = off.filter(r => r.restOuterTouched != null);
    const onOuter = onOuterElig.filter(r => r.restOuterTouched).length;
    const offOuter = offOuterElig.filter(r => r.restOuterTouched).length;
    const pOnOuter = pct(onOuter, onOuterElig.length), pOffOuter = pct(offOuter, offOuterElig.length);
    const liftOuter = (pOnOuter != null && pOffOuter != null && pOffOuter > 0) ? +(pOnOuter / pOffOuter).toFixed(2) : null;
    console.log(`\n  -- ${label} --`);
    console.log(`  P(OTHER side of same rung touched in rest of day | Asia touched this combo) = ${pOnOther}% (n=${on.length}) vs baseline ${pOffOther}% (n=${off.length})  lift=${liftOther}x` + ((on.length < MIN_SAMPLE || off.length < MIN_SAMPLE) ? '  [thin]' : ''));
    console.log(`  P(OUTER rung same side touched in rest of day     | Asia touched this combo) = ${pOnOuter}% (n=${onOuterElig.length}) vs baseline ${pOffOuter}% (n=${offOuterElig.length})  lift=${liftOuter}x` + ((onOuterElig.length < MIN_SAMPLE || offOuterElig.length < MIN_SAMPLE) ? '  [thin, or p90 has no outer rung]' : ''));
  }
  reportQ3(allComboRows, 'POOLED — all pairs, sides, rungs');
  for (const rung of RUNGS) reportQ3(allComboRows.filter(r => r.rung === rung), `rung=${rung}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'asia_touch_rest_of_day_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, rearm: REARM, minMargin: MIN_MARGIN,
    liveRungs: [...LIVE_RUNGS], minSample: MIN_SAMPLE, perPairMeta, dayRows: allDayRows, comboRows: allComboRows,
  }));
  console.log(`\nWrote full detail to ${OUT_DIR}/asia_touch_rest_of_day_study.json`);
}

main();
