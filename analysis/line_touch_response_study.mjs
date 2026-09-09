// Line Touch Response Study — 2026-09-09
//
// Answers "what does price actually DO after it touches one of our lines?"
// without a barrier race anywhere in it.
//
// ── WHY NOT ANOTHER BARRIER BACKTEST ─────────────────────────────────────────
// Every prior study of these lines (analysis/causal_early_reaction_study.mjs,
// hl_early_reaction_tradeable_study.mjs, p90_fade_study.mjs,
// p90_empirical_outer_backtest.mjs, and js/levelAtlasVoteReview.js itself) races
// the touch to a neighbouring rung and then DROPS every touch that never reached
// one -- `outcome !== 'neither'`. That is a look-ahead selection filter: you
// cannot know at entry whether a race will resolve. It removed 30-43% of the
// dynamic-HL population (and 62% of the p90 population), and on the HL family it
// was single-handedly responsible for a Sharpe of 5.36 that is really negative.
// js/hlSignalCore.js's header has the full account.
//
// A race also fixes the exits to the ladder geometry before you have learned
// anything -- in the HL '<15%' band that is ~0.2R of target against 1R of stop,
// which is close to a fair coin by construction and so is nearly the worst
// available instrument for detecting drift.
//
// So this study measures the RESPONSE, not a trade:
//   - every touch produces a number; there is no resolution requirement, hence
//     no survivorship, hence nothing to filter
//   - returns are signed in the CONTINUATION direction, so positive = continued
//     through the line, negative = faded off it. Fade vs continue is then just
//     the sign of a mean, against a clean null of zero.
//   - MFE/MAE are carried alongside the close-to-close return at every horizon,
//     because a level can have no drift in the mean and still be tradeable if
//     the excursion is asymmetric -- and that is what decides whether any
//     stop/target structure could harvest it. The race can never show you this.
//   - distances are normalised by the day's EX-ANTE expected range (open*sigma,
//     the same forecastSigma the ladders themselves are built from), so p90
//     extension is directly readable as "a fraction of a normal day's move" and
//     pools across instruments. Realized range is carried too but only as a
//     descriptive cross-check -- it is not knowable at the touch.
//
// ── FAMILIES ─────────────────────────────────────────────────────────────────
//   hl50 / hl75 / hl90  dynamic high-low rungs, anchored to the OPPOSITE running
//                       intraday extreme (the anchor moves bar to bar). p90 is
//                       INCLUDED here -- the race-based studies had to exclude it
//                       because it has no outer rung, which is exactly the
//                       limitation this design removes.
//   oh50 / oh75 / oh90  the static open-anchored ladder (js/levelAtlasEngine.js's
//                       buildLadder + rungLevelsForLadder) -- the vote atlas's own
//                       lines, included so the two are directly comparable.
//   dopen               daily-open retest: price breaks away from the open by the
//                       rearm distance, then comes back and touches it. Same
//                       definition as causal_early_reaction_study.mjs's
//                       processDailyOpenPair, `side` = the breakaway direction.
//
// Writes one file per pair to analysis/output/line-touch-response/. Report with
// analysis/line_touch_response_report.mjs (cheap, re-runnable, no M1 walk).
//
//   node analysis/line_touch_response_study.mjs
//   LA_PAIRS=eurusd,gold node analysis/line_touch_response_study.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { computeBands, ASSET_PARAMS } from '../js/forecastCore.js';
import { buildLadder } from '../js/forecastLadder.js';
import { rungLevelsForLadder, SESSION_BOUNDS } from '../js/levelAtlasEngine.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output', 'line-touch-response');

export const SCHEMA = 1;
const REARM_FRAC = 0.3;
const MIN_LOOKBACK = 60;
const SPLIT_FRAC = 0.6;
// BM_P90 — see analysis/dynamic_hl_level_study.mjs's header. Same constant the
// HL walk uses to place the p90 rung off the p75 correction.
const BM_P90 = 2.555;
// Horizons in minutes after the touch; 'eod' (rest of session) is appended.
export const HORIZONS = [5, 15, 30, 60, 120];

export const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

// Same boundaries as js/levelAtlasEngine.js's own private sessionOf, re-derived
// from the SESSION_BOUNDS it exports so the two cannot drift apart.
function sessionOf(hourUtc) {
  const [aFrom, aTo] = SESSION_BOUNDS.Asia, [, lTo] = SESSION_BOUNDS.London;
  if (hourUtc >= aFrom || hourUtc < aTo) return 'Asia';
  if (hourUtc < lTo) return 'London';
  return 'NY';
}

const r5 = v => (Number.isFinite(v) ? +v.toFixed(5) : null);

/**
 * Forward response from bar k, signed so POSITIVE = continued through the line.
 * `dir` is +1 when continuation means price rising, -1 when it means falling.
 * Returns close-to-close return, best (MFE) and worst (MAE) excursion at each
 * horizon, all in price units, plus the rest-of-session figures and the timing
 * of the maximum continuation excursion.
 */
function forwardResponse(bars, k, entry, dir) {
  const n = bars.length;
  if (k + 1 >= n) return null;          // touch on the last bar: no forward path to measure
  const t0 = bars[k].time;
  const ret = [], mfe = [], mae = [];
  let hi = -Infinity, lo = Infinity;          // running excursion extremes from k
  let hIdx = 0;                                // which horizon we are filling next
  let eodRet = null, maxExt = -Infinity, maxAdv = Infinity, tMaxExt = null;

  // Start at k+1, NOT k. Entry is the close of bar k, but bar k's own high/low
  // include the spike that reached the level -- which happened BEFORE the entry
  // price existed. Counting it would hand the study a favourable excursion the
  // trade could never have had.
  for (let j = k + 1; j < n; j++) {
    const b = bars[j];
    const up = (b.high - entry) * dir, dn = (b.low - entry) * dir;
    // dir flips which of high/low is the favourable side, so take both ways round
    const fav = Math.max(up, dn), adv = Math.min(up, dn);
    if (fav > hi) { hi = fav; tMaxExt = Math.round((b.time - t0) / 60); }
    if (adv < lo) lo = adv;
    // close out any horizons this bar has now reached
    const mins = (b.time - t0) / 60;
    while (hIdx < HORIZONS.length && mins >= HORIZONS[hIdx]) {
      ret.push(r5((b.close - entry) * dir));
      mfe.push(r5(hi)); mae.push(r5(lo));
      hIdx++;
    }
  }
  // horizons that run past the session close inherit the session's own end
  const last = bars[n - 1];
  eodRet = (last.close - entry) * dir;
  maxExt = hi; maxAdv = lo;
  while (hIdx < HORIZONS.length) { ret.push(r5(eodRet)); mfe.push(r5(hi)); mae.push(r5(lo)); hIdx++; }

  return { ret, mfe, mae, eodRet: r5(eodRet), maxExt: r5(maxExt), maxAdv: r5(maxAdv), tMaxExt };
}

function hlFractions(sigma, assetClass) {
  const b = computeBands(1, sigma, assetClass);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  return [b.hl50, b.hl75, BM_P90 * p.hl_75_corr * sigma];
}

const RUNG_NAMES = ['50', '75', '90'];

/**
 * Dynamic-HL touches for one side of one session. The anchor is the running
 * OPPOSITE extreme through bar k-1 (never including bar k — no lookahead), so
 * the levels move bar to bar. Unlike the race-based walks this emits p90 too.
 */
function walkDynamicHl(bars, open, fracs, isUp, out, meta) {
  const n = bars.length;
  const anchorLag = new Array(n);
  {
    let ext = open;
    for (let k = 0; k < n; k++) {
      anchorLag[k] = ext;
      if (isUp) { if (bars[k].low < ext) ext = bars[k].low; } else { if (bars[k].high > ext) ext = bars[k].high; }
    }
  }
  const sg = isUp ? 1 : -1;
  for (let ri = 0; ri < 3; ri++) {
    let armed = true;
    for (let k = 0; k < n; k++) {
      const bar = bars[k];
      const a = anchorLag[k];
      const here = a * (1 + sg * fracs[ri]);
      const inner = ri === 0 ? a : a * (1 + sg * fracs[ri - 1]);
      const rearmDist = REARM_FRAC * Math.abs(here - inner);
      if (!armed) {
        const away = isUp ? (here - bar.close) : (bar.close - here);
        if (away >= rearmDist) armed = true;
        continue;
      }
      const px = isUp ? bar.high : bar.low;
      if (!(isUp ? px >= here : px <= here)) continue;
      armed = false;
      emit(out, meta, bars, k, `hl${RUNG_NAMES[ri]}`, isUp ? 'up' : 'down', here, isUp ? 1 : -1);
    }
  }
}

/** Static open-anchored ladder touches — the vote atlas's own lines. */
function walkOhOl(bars, lv, out, meta) {
  for (const side of ['up', 'down']) {
    const levels = lv[side];
    if (!levels) continue;
    const isUp = side === 'up';
    for (let ri = 0; ri < 3; ri++) {
      const here = levels[ri + 1], inner = levels[ri];
      if (!(here > 0) || !(inner > 0)) continue;
      const rearmDist = REARM_FRAC * Math.abs(here - inner);
      let armed = true;
      for (let k = 0; k < bars.length; k++) {
        const bar = bars[k];
        if (!armed) {
          const away = isUp ? (here - bar.close) : (bar.close - here);
          if (away >= rearmDist) armed = true;
          continue;
        }
        const px = isUp ? bar.high : bar.low;
        if (!(isUp ? px >= here : px <= here)) continue;
        armed = false;
        emit(out, meta, bars, k, `oh${RUNG_NAMES[ri]}`, side, here, isUp ? 1 : -1);
      }
    }
  }
}

/**
 * Daily-open retest — price breaks away from the open by the rearm distance,
 * then returns and touches it. Same construction as
 * causal_early_reaction_study.mjs's processDailyOpenPair; `side` is the
 * BREAKAWAY direction, so continuation means resuming that way.
 */
function walkDailyOpen(bars, open, lv, out, meta) {
  const pUp = lv.up?.[1], pDown = lv.down?.[1];
  if (!(pUp > open) || !(pDown < open) || !(pDown > 0)) return;
  const rearmUp = REARM_FRAC * (pUp - open), rearmDown = REARM_FRAC * (open - pDown);
  let hasBrokenAway = false, side = null, armed = false;
  for (let k = 0; k < bars.length; k++) {
    const bar = bars[k];
    const upAway = bar.high - open, downAway = open - bar.low;
    if (!hasBrokenAway) {
      if (upAway >= rearmUp) { hasBrokenAway = true; side = 'up'; armed = true; }
      else if (downAway >= rearmDown) { hasBrokenAway = true; side = 'down'; armed = true; }
      continue;
    }
    if (!armed) {
      if (upAway >= rearmUp || downAway >= rearmDown) armed = true;
      continue;
    }
    if (!(bar.low <= open && bar.high >= open)) continue;
    armed = false;
    emit(out, meta, bars, k, 'dopen', side, open, side === 'up' ? 1 : -1);
  }
}

function emit(out, meta, bars, k, family, side, level, dir) {
  const bar = bars[k];
  const entry = bar.close;                       // the close of the touching minute
  if (!(entry > 0)) return;
  const resp = forwardResponse(bars, k, entry, dir);
  if (!resp) return;
  const d = new Date(bar.time * 1000);
  const hourUtc = d.getUTCHours();
  out.push({
    family, rung: family === 'dopen' ? 'open' : family.slice(2), side,
    t: bar.time, hourUtc, session: sessionOf(hourUtc),
    minsIn: Math.round((bar.time - meta.sessionStart) / 60),
    minsLeft: Math.round((meta.sessionEnd - bar.time) / 60),
    level: r5(level), entry: r5(entry),
    ...resp,
  });
}

export async function processPair(pair) {
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

  const days = [];
  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;

    const fracs = hlFractions(sigma, assetClass);
    if (!(fracs[0] > 0 && fracs[1] > fracs[0] && fracs[2] > fracs[1])) continue;
    const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
    const lv = lad?.oh?.p50 && lad?.ol?.p50 ? rungLevelsForLadder(lad, open) : {};

    const meta = { sessionStart: bars[0].time, sessionEnd: bars[bars.length - 1].time };
    const touches = [];
    walkDynamicHl(bars, open, fracs, true, touches, meta);
    walkDynamicHl(bars, open, fracs, false, touches, meta);
    if (lv.up || lv.down) { walkOhOl(bars, lv, touches, meta); walkDailyOpen(bars, open, lv, touches, meta); }
    if (!touches.length) continue;

    // dayScale = the day's EX-ANTE expected move (open * forecast sigma). Every
    // distance in the report is divided by this, so "0.4" means "0.4 of a normal
    // day's range for this instrument" and pools across instruments and eras.
    // realizedRange is ex-post and is carried for description only -- never as a
    // conditioner, since it is not knowable at the touch.
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    days.push({
      date, open: r5(open), sigma: +sigma.toFixed(6),
      dayScale: r5(open * sigma), realizedRange: r5(hi - lo),
      touches,
    });
  }

  if (!days.length) { console.log('  no touches, skipping'); return null; }
  const splitIdx = Math.floor(days.length * SPLIT_FRAC);
  const splitDate = days[splitIdx]?.date ?? days[days.length - 1].date;
  const nTouch = days.reduce((a, d) => a + d.touches.length, 0);
  console.log(`  ${days.length} sessions, ${nTouch} touches across all families, split ${splitDate}`);
  return {
    schema: SCHEMA, instrument: sym, pair, assetClass, pip,
    horizons: HORIZONS, splitDate, generatedAt: new Date().toISOString(),
    coverage: { from: days[0].date, to: days[days.length - 1].date, sessions: days.length },
    days,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let built = 0;
  for (const pair of PAIRS) {
    console.log(`${pair.toUpperCase()}:`);
    const r = await processPair(pair);
    if (!r) { console.log('  skipped'); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${pair}-response.json`), JSON.stringify(r));
    built++;
  }
  console.log(`\nBuilt ${built}/${PAIRS.length} pairs -> ${OUT_DIR}`);
}

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? '') === __filename) main();
