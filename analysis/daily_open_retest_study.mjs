// Daily-Open Retest-Continuation Study — 2026-09-01
//
// Question: does the DAILY OPEN (the Europe/London-midnight-anchored day's
// open price — the exact same anchor js/levelAtlasEngine.js's forecast ladder
// already uses as its sigma-band zero-point) work as a tradeable level in
// this specific pattern — price moves away from the open early in the day,
// later comes back and RETESTS it, then either CONTINUES in the original
// away-direction ("booms away again") or REVERSES through it?
//
// This has never been studied in this codebase before. Level Atlas
// (js/levelAtlasEngine.js's atlasWalk) already has the right MECHANICAL
// PRIMITIVES (touch/rearm/outcome-race) but its ladder assumes multiple
// rungs with natural inner/outer neighbours on EITHER side of a rung — the
// open is a single level with no natural neighbour of its own, so this is a
// purpose-built walk, not atlasWalk called with different args. It DOES
// reuse, wholesale, everything that generalizes: loadM1ForPair,
// bucketM1IntoSessions(packed, 'Europe/London'), forecastSigma/buildLadder
// (the SAME ladder atlasWalk builds, strictly causal — sigma fit on days
// BEFORE today only), rungLevelsForLadder, pipSize/assetClassFor, and the
// splitAt() IS/OOS convention every other reference book in this codebase
// uses (60% IS / 40% OOS by date, js/forecastAnalyserStore.js).
//
// ── THE WALK, PER PAIR PER DAY ──────────────────────────────────────────
//   1. open = that day's first M1 bar's open (London-midnight bucketed).
//   2. lad = buildLadder(sigma, ...) off data STRICTLY BEFORE today (same
//      no-lookahead contract as atlasWalk). pUp/pDown = that day's own p50
//      O-H / O-L rungs — the SAME numbers atlasWalk's 'up|p50'/'down|p50'
//      cells are built from, so results here are directly comparable in
//      scale to the existing vote-margin work (no arbitrary pip threshold).
//   3. rungSpanUp = pUp-open, rungSpanDown = open-pDown — this IS exactly
//      the "rungSpan" atlasWalk itself would compute for its OWN p50 cell
//      (rungSpan = |here-inner|, and for p50, inner==open) — so reusing
//      DEFAULT_REARM=0.3 (js/levelAtlasRoutes.js) against THIS span is not
//      an adapted convention, it's the literal same convention applied to
//      the literal same distance. No new threshold was invented.
//   4. BREAKAWAY: walk bars forward. The first bar where price has moved
//      away from open by >= rearmFrac*rungSpan (either direction) sets
//      `side` for the WHOLE day (fixed thereafter) — mirrors atlasWalk's
//      own re-arm control flow exactly (see the `continue` after every
//      not-armed check, below) so the breakaway bar itself can never also
//      register as a touch in the same iteration (bar 0 trivially contains
//      the open in its own [low,high] range — without this, every day would
//      spuriously self-report a "0th retest" at the open itself).
//   5. RETEST: once broken away and re-armed (same rearm distance, either
//      direction — a day can flip sides between retests; `side` from step 4
//      never changes), the first bar whose [low,high] range reaches back to
//      `open` is a retest. Ordinal increments per retest per day.
//   6. RACE (from the retest bar forward, real M1 bars only): continuation
//      = price reaches pUp/pDown on the ORIGINAL breakaway side again;
//      reversal = price reaches the p50 rung on the OTHER side (a genuine
//      flip through the open); neither = session ends unresolved. Same
//      three-way outcome convention as atlasWalk. On a same-bar tie (both
//      targets inside one M1 bar's range — rare), continuation wins, the
//      same "check the further target first" tie-break atlasWalk's own
//      race loop uses (outer checked before inner).
//   7. After a retest resolves, armed=false again — the NEXT touch of open
//      only counts once price has moved away by the rearm distance again
//      (either direction), so a genuine 2nd/3rd+ retest is a real re-arm,
//      not the same wobble re-counted.
//
// ── THE PRIOR/NULL THIS MUST BE CHECKED AGAINST ─────────────────────────
// js/sessionHandoffEngine.js already found session-to-session DIRECTIONAL
// continuation is a coin flip (48-53%) on every instrument, while
// volatility CLUSTERING is real and strong. If P(continuation | resolved)
// here lands inside/near that same 48-53% band, this is a re-discovery of
// that null, not a new finding — reported as such, not spun.
//
// Sample-size discipline: MIN_SAMPLE=30 per reported cell (matching every
// other study built this session), reported CI is the normal-approximation
// 95% CI (p ± 1.96*sqrt(p(1-p)/n)) on the SAME scale every Sharpe-CI in
// this analysis/ directory already reports, not a fresh convention.
//
// Pure historical re-walk of real M1 — no synthetic data, no lookahead.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { buildLadder } from '../js/forecastLadder.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { rungLevelsForLadder, SESSION_BOUNDS } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const REARM_FRAC = 0.3;     // DEFAULT_REARM (js/levelAtlasRoutes.js) — see header for why this is a direct, not adapted, reuse
const MIN_LOOKBACK = 60;    // same floor atlasWalk uses before trusting forecastSigma's own trailing window
const MIN_SAMPLE = 30;      // floor for any reported cell, same as every other study this session
const SPLIT_FRAC = 0.6;     // splitAt() default — same 60/40 IS/OOS convention as every other book

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }
// Same 3-way session boundary every engine in this file's lineage uses
// (js/levelAtlasEngine.js's own private `sessionOf` — re-derived here, not
// imported, same reason that module gives: it's private there too).
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
void SESSION_BOUNDS; // imported for documentation parity with levelAtlasEngine.js's own boundary table

function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }
// Normal-approximation 95% CI on a proportion — same scale every Sharpe-CI
// in analysis/ already reports (p ± 1.96*sqrt(p(1-p)/n)), not a fresh stat.
function propCI(k, n) {
  if (!(n > 0)) return null;
  const p = k / n, se = Math.sqrt(p * (1 - p) / n);
  return { p: +(p * 100).toFixed(1), lo: +Math.max(0, (p - 1.96 * se) * 100).toFixed(1), hi: +Math.min(100, (p + 1.96 * se) * 100).toFixed(1), n };
}

async function processPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data, skipping'); return null; }
  const assetClass = assetClassFor(pair);
  let pip = 1; try { pip = pipSize(pair) || 1; } catch { /* raw units */ }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= MIN_LOOKBACK) { console.log('  too little history, skipping'); return null; }

  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';

  const t0 = Date.now();
  const records = [];
  let daysWithBreakaway = 0;

  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
    if (!lad?.oh?.p50 || !lad?.ol?.p50) continue;

    const lvBySide = rungLevelsForLadder(lad, open);
    const pUp = lvBySide.up?.[1], pDown = lvBySide.down?.[1];
    if (!(pUp > open) || !(pDown < open) || !(pDown > 0)) continue;
    const rungSpanUp = pUp - open, rungSpanDown = open - pDown;
    const rearmUp = REARM_FRAC * rungSpanUp, rearmDown = REARM_FRAC * rungSpanDown;

    // Today's FORECAST vol regime — today's fitted sigma vs its own trailing
    // history, exact same formula atlasWalk's inline `dayVol` block uses
    // (r<0.85 quiet / r>1.25 heavy / else normal). Fit on data strictly
        // before today throughout — same no-lookahead contract as everywhere
    // else in this codebase.
    const dayVol = (() => {
      const hist = [];
      for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();

    const dow = dowOf(date);
    let hasBrokenAway = false, side = null, armed = false, ordinal = 0;

    for (let k = 0; k < bars.length; k++) {
      const bar = bars[k];
      const upAway = bar.high - open, downAway = open - bar.low;

      // ── Same control flow as atlasWalk's own rearm loop: whenever we are
      // NOT currently armed (either pre-breakaway, or just after a retest
      // resolved), check the away-distance and `continue` REGARDLESS of
      // whether this bar flips armed true — this is what stops the very bar
      // that (re)arms the level from also being read as a touch of it (see
      // header, step 4).
      if (!hasBrokenAway) {
        if (upAway >= rearmUp) { hasBrokenAway = true; side = 'up'; armed = true; }
        else if (downAway >= rearmDown) { hasBrokenAway = true; side = 'down'; armed = true; }
        continue;
      }
      if (!armed) {
        if (upAway >= rearmUp || downAway >= rearmDown) armed = true;
        continue;
      }

      if (!(bar.low <= open && bar.high >= open)) continue;   // hasn't retouched the open yet

      ordinal++;
      armed = false;

      const contTarget = side === 'up' ? pUp : pDown;
      const revTarget = side === 'up' ? pDown : pUp;
      let outcome = 'neither', resolveTime = null;
      for (let j = k; j < bars.length; j++) {
        const b2 = bars[j];
        const contHit = side === 'up' ? b2.high >= contTarget : b2.low <= contTarget;
        const revHit = side === 'up' ? b2.low <= revTarget : b2.high >= revTarget;
        if (contHit) { outcome = 'continuation'; resolveTime = b2.time; break; }   // checked first — same "further target wins a same-bar tie" convention as atlasWalk's own race (outer checked before inner)
        if (revHit) { outcome = 'reversal'; resolveTime = b2.time; break; }
      }
      const touchHourUtc = new Date(bar.time * 1000).getUTCHours();
      records.push({
        instrument: sym, assetClass, date, dow, ordinal, side, rearmFrac: REARM_FRAC,
        dayVol, session: sessionOf(touchHourUtc), hourUtc: touchHourUtc,
        minsIntoSession: +((bar.time - bars[0].time) / 60).toFixed(0),
        touchTime: bar.time, outcome, resolveTime,
        minsToResolve: resolveTime != null ? +((resolveTime - bar.time) / 60).toFixed(0) : null,
        contDistPips: +((side === 'up' ? rungSpanUp : rungSpanDown) / pip).toFixed(1),
        revDistPips: +((side === 'up' ? rungSpanDown : rungSpanUp) / pip).toFixed(1),
        pip,
      });
    }
    if (hasBrokenAway) daysWithBreakaway++;
  }

  if (!records.length) { console.log('  no retests found, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';

  console.log(`  ${dates.length} sessions (${dates[MIN_LOOKBACK]}→${dates.at(-1)}), ${daysWithBreakaway} days had a breakaway, ${records.length} retests total, split ${split} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { pair: sym, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records };
}

function summarizeGroup(rows) {
  const n = rows.length;
  const cont = rows.filter(r => r.outcome === 'continuation').length;
  const rev = rows.filter(r => r.outcome === 'reversal').length;
  const neither = n - cont - rev;
  const resolved = cont + rev;
  return {
    n, cont, rev, neither,
    contPct: pct(cont, n), revPct: pct(rev, n), neitherPct: pct(neither, n),
    resolved, contOfResolvedCI: propCI(cont, resolved),
    thin: n < MIN_SAMPLE || resolved < MIN_SAMPLE,
  };
}

function printGroup(label, rows) {
  const s = summarizeGroup(rows);
  const ci = s.contOfResolvedCI;
  const ciTxt = ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a';
  console.log(`  ${label.padEnd(28)} n=${String(s.n).padStart(5)}  cont=${String(s.contPct).padStart(5)}%  rev=${String(s.revPct).padStart(5)}%  neither=${String(s.neitherPct).padStart(5)}%   P(cont|resolved)=${ciTxt}${s.thin ? '  [THIN — below n=' + MIN_SAMPLE + ' floor]' : ''}`);
  return s;
}

async function main() {
  const allRecords = [];
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const r = await processPair(pair);
    if (!r) continue;
    allRecords.push(...r.records);
    perPairMeta.push({ pair: r.pair, coverage: r.coverage, splitDate: r.splitDate, nRetests: r.records.length });
  }

  const oos = allRecords.filter(r => r.isOos === 'oos');
  const is = allRecords.filter(r => r.isOos === 'is');

  console.log(`\n\n================ COVERAGE ================`);
  console.log('pair       nRetests  splitDate    coverage');
  for (const m of perPairMeta) console.log(`${m.pair.padEnd(10)} ${String(m.nRetests).padStart(8)}  ${m.splitDate}  ${m.coverage.from}→${m.coverage.to}`);
  console.log(`\nPooled: ${perPairMeta.length} pairs, ${allRecords.length} total retests (${is.length} IS, ${oos.length} OOS).`);

  console.log(`\n\n================ HEADLINE — OOS ONLY, ALL PAIRS POOLED ================`);
  const headline = printGroup('ALL retests (OOS)', oos);

  console.log(`\n================ BY ORDINAL (OOS) ================`);
  const ordinalStats = {};
  for (const ord of [1, 2, 3]) {
    const rows = ord < 3 ? oos.filter(r => r.ordinal === ord) : oos.filter(r => r.ordinal >= 3);
    ordinalStats[ord < 3 ? String(ord) : '3+'] = printGroup(`ordinal=${ord < 3 ? ord : '3+'}`, rows);
  }

  console.log(`\n================ BY SESSION OF RETEST (OOS) ================`);
  const sessionStats = {};
  for (const s of ['Asia', 'London', 'NY']) sessionStats[s] = printGroup(`session=${s}`, oos.filter(r => r.session === s));

  console.log(`\n================ BY DAYVOL REGIME (OOS) ================`);
  const dayVolStats = {};
  for (const v of ['1·quiet', '2·normal', '3·heavy']) dayVolStats[v] = printGroup(`dayVol=${v}`, oos.filter(r => r.dayVol === v));

  console.log(`\n================ BY BREAKAWAY SIDE (OOS) ================`);
  const sideStats = {};
  for (const side of ['up', 'down']) sideStats[side] = printGroup(`side=${side}`, oos.filter(r => r.side === side));

  console.log(`\n================ BY PAIR (OOS) ================`);
  const perPairStats = {};
  for (const m of perPairMeta) {
    const rows = oos.filter(r => r.instrument === m.pair);
    perPairStats[m.pair] = printGroup(m.pair, rows);
  }

  console.log(`\n================ BY ASSET CLASS (OOS) ================`);
  const assetClassStats = {};
  for (const ac of ['fx', 'commodity', 'index']) {
    const rows = oos.filter(r => r.assetClass === ac);
    if (!rows.length) continue;
    assetClassStats[ac] = printGroup(`assetClass=${ac}`, rows);
  }

  console.log(`\n\n================ COMPARISON TO sessionHandoffEngine.js's NULL ================`);
  console.log(`  sessionHandoffEngine.js found session-to-session directional continuation is a`);
  console.log(`  coin flip — 48-53% across EVERY instrument/side/giveback/travel/vol cut checked.`);
  const ci = headline.contOfResolvedCI;
  if (ci) {
    const inCoinFlipBand = ci.lo <= 53 && ci.hi >= 48;
    const clearsBand = ci.lo > 53 || ci.hi < 48;
    console.log(`  This study (OOS, pooled, all retests): P(continuation | resolved) = ${ci.p}% [${ci.lo}-${ci.hi}%], n=${ci.n}.`);
    console.log(`  => ${clearsBand ? 'CI sits fully OUTSIDE the 48-53% coin-flip band — a genuinely different read than session handoff.' : inCoinFlipBand ? 'CI OVERLAPS the 48-53% coin-flip band — indistinguishable from the existing null.' : 'CI is adjacent to but not cleanly inside/outside the band — marginal, treat with caution.'}`);
  } else {
    console.log('  Not enough resolved OOS retests to compute a CI.');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'daily_open_retest_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, rearmFrac: REARM_FRAC, splitFrac: SPLIT_FRAC, minSample: MIN_SAMPLE,
    perPairMeta,
    headline: { oos: headline, is: summarizeGroup(is) },
    byOrdinal: ordinalStats, bySession: sessionStats, byDayVol: dayVolStats, bySide: sideStats,
    byPair: perPairStats, byAssetClass: assetClassStats,
    records: allRecords,
  }));
  console.log(`\nWrote full detail to ${OUT_DIR}/daily_open_retest_study.json`);
}

main();
