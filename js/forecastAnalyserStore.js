/**
 * Forecast Level Analyser — storage & refresh pipeline (Phase 2).
 *
 * Loops the R2 M1 parquet pairs, runs the measurement engine per horizon, and
 * writes the precomputed dataset to R2 so the public page reads it instantly.
 * Reuses the lego: loadM1ForPair (M1), forecastAnalyser (measurement), r2Store
 * (persistence). No vol math copied, no trade sim.
 *
 * R2 layout (under the same bucket as the M1 parquets):
 *   forecast-analysis/manifest.json        — coverage + last-refresh + knobs
 *   forecast-analysis/aggregates.json      — { pair: { horizon: {slices} } }
 *   forecast-analysis/{pair}/{horizon}.json — raw window records (drilldown)
 */

import { loadM1ForPair, M1_DRIVE_IDS } from './volBacktestM1Engine.js';
import { bucketM1IntoSessions, runAnalyser, aggregate } from './forecastAnalyser.js';
import { putJSON, getJSON, listKeys, r2Configured } from './r2Store.js';
import { pipSize, oandaSymbol, resolveKey } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { extractTouches, runPerLine, runRigor, runSensitivity, runExitStudy, runDayTypeStudy, runStopStudy, costForPair, DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { deflatedSharpe } from './backtestStats.js';
import { computeBands, HORIZONS as FC_HORIZONS } from './forecastCore.js';
import { resampleTo } from './barUtils.js';

const PREFIX   = 'forecast-analysis';
const M1_PREFIX = process.env.R2_KEY_PREFIX || 'm1';
const HORIZONS  = ['daily', 'weekly', 'monthly'];

// Resolve asset class for the band corrections (fx default).
export function assetClassFor(pair) {
  const p = String(pair).toLowerCase();
  if (/xau|gold|xag|silver|wti|brent|oil|xpt|xpd|copper|natgas/.test(p)) return 'commodity';
  if (/nas|ndx|dax|spx|sp500|us30|us500|us2000|de30|de40|ftse|uk100|nikkei|jp225|hk50|esp35|index/.test(p)) return 'index';
  return 'fx';
}

// Collapse parquet names that are the SAME instrument so the book doesn't
// double-count one (e.g. 'spx' AND 'spx500' both resolve to SPX500_USD; 'dow' AND
// 'us30' both to US30_USD). Keeps the entry whose name IS the canonical key (so
// 'spx' over 'spx500', 'dow' over 'us30' — which is also the richer dataset here);
// unknown names are kept as-is (fail-open). Pure + exported for unit testing.
export function dedupePairsByInstrument(pairs) {
  const byKey = new Map();                      // canonicalKey → chosen parquet name
  const kept  = [];                             // unknown names (no canonical) kept verbatim
  for (const p of [...new Set(pairs)].sort()) {
    let key = null;
    try { key = resolveKey(p); } catch { /* fail-open */ }
    if (!key) { kept.push(p); continue; }
    const existing = byKey.get(key);
    if (!existing || p.toLowerCase() === key) byKey.set(key, p);   // prefer the canonical-named one
  }
  return [...byKey.values(), ...kept].sort();
}

// Discover all M1 pairs on R2 (list m1/*_m1.parquet); fall back to the known list.
// Deduped by instrument so two parquet names for one symbol aren't both analysed.
export async function discoverPairs() {
  try {
    const keys  = await listKeys(`${M1_PREFIX}/`);
    const pairs = keys.filter(k => k.endsWith('_m1.parquet'))
      .map(k => k.split('/').pop().replace('_m1.parquet', ''));
    if (pairs.length) return dedupePairsByInstrument(pairs);
  } catch { /* listing not permitted — fall through */ }
  return dedupePairsByInstrument(Object.keys(M1_DRIVE_IDS));
}

// Forecast-range skill: how well the forecast median/75p range matched the
// realized daily range (vol-forecast quality, independent of any trading edge).
function computeSkill(records) {
  let n = 0, fcMed = 0, fc75 = 0, real = 0, exceed = 0;
  for (const r of records) {
    const hl50 = r.lines.find(l => l.name === 'HL50')?.distPct;
    const hl75 = r.lines.find(l => l.name === 'HL75')?.distPct;
    if (hl50 == null || hl75 == null || !r.realized || !r.open) continue;
    // BM_P50/BM_P75 ARE the range (high−low) percentiles, so hl50 = the median
    // realized-range forecast and hl75 = the 75th-pct range forecast directly.
    // (The ±hl50 *lines* span 2·hl50, but that band is two one-sided ~12% reach
    //  lines, NOT a range prediction — don't double it here.)
    const fcMedRange = hl50, fc75Range = hl75;                    // % of price
    const realRange  = (r.realized.high - r.realized.low) / r.open * 100;
    n++; fcMed += fcMedRange; fc75 += fc75Range; real += realRange;
    if (realRange > fc75Range) exceed++;
  }
  if (!n) return null;
  const avgFcMed = fcMed / n, avgReal = real / n;
  return {
    windows: n,
    avgFcMedRange: +avgFcMed.toFixed(4),
    avgFc75Range:  +(fc75 / n).toFixed(4),
    avgRealRange:  +avgReal.toFixed(4),
    medianBiasPct: +((avgReal - avgFcMed) / avgFcMed * 100).toFixed(1),  // + = realized wider than forecast
    exceed75Rate:  +(exceed / n * 100).toFixed(1),                       // target ≈ 25% if 75p is honest
  };
}

// ── Day-type analysis (DAYTYPE_ANALYSIS_BRIEF.md) ────────────────────────────
// Tests whether the day-type lean (signedT) predicts realized continuation vs
// reversion, and whether its magnitude is real confidence (AUC + reliability).
function aucOf(rows) {
  const pos = rows.filter(r => r.cont).length, neg = rows.length - pos;
  if (!pos || !neg) return 0.5;
  const sorted = [...rows].sort((a, b) => a.s - b.s);
  let i = 0, rankSumPos = 0;
  while (i < sorted.length) {
    let j = i; while (j < sorted.length && sorted[j].s === sorted[i].s) j++;
    const avgRank = (i + 1 + j) / 2;               // average rank for ties
    for (let k = i; k < j; k++) if (sorted[k].cont) rankSumPos += avgRank;
    i = j;
  }
  return +(((rankSumPos - pos * (pos + 1) / 2) / (pos * neg))).toFixed(3);
}
function dayTypeStats(recs) {
  const rows = recs.filter(r => r.signedT != null && r.realizedDir)
    .map(r => ({ s: r.signedT, cont: r.realizedDir === 'CONTINUATION' ? 1 : 0, follow: r.dirAction === 'follow' }));
  const n = rows.length;
  if (n < 20) return null;
  const mean = a => a.length ? +(a.reduce((s, r) => s + r.s, 0) / a.length).toFixed(3) : 0;
  const cont = rows.filter(r => r.cont), rev = rows.filter(r => !r.cont);
  // (a)+(b) bins of signedT [-1,1] → counts + P(continuation)
  const NB = 10, bins = Array.from({ length: NB }, (_, i) => ({ lo: +(-1 + i * 0.2).toFixed(1), contN: 0, revN: 0 }));
  for (const r of rows) { const bi = Math.min(NB - 1, Math.max(0, Math.floor((r.s + 1) / 0.2))); r.cont ? bins[bi].contN++ : bins[bi].revN++; }
  // (c) cross-tab: lean sign × selector action; hit = realized matched the bet
  const cell = (leanFollow, actFollow) => {
    const sub = rows.filter(r => (r.s > 0) === leanFollow && r.follow === actFollow);
    const hit = sub.filter(r => r.follow ? r.cont : !r.cont).length;
    return { n: sub.length, hitRate: sub.length ? +(hit / sub.length * 100).toFixed(1) : 0 };
  };
  return {
    n, contPct: +(cont.length / n * 100).toFixed(1),
    meanSignedT_cont: mean(cont), meanSignedT_rev: mean(rev),
    auc: aucOf(rows),
    bins: bins.map(b => ({ lo: b.lo, n: b.contN + b.revN, pCont: (b.contN + b.revN) ? +(b.contN / (b.contN + b.revN) * 100).toFixed(1) : null })),
    crosstab: { agreeFade: cell(false, false), sysFollowLeanFade: cell(false, true),
                sysFadeLeanFollow: cell(true, false), agreeFollow: cell(true, true) },
  };
}
function computeDayType(records, oosFrac = 0.4) {
  const all = records.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!all.length) return null;
  const cut = Math.floor(all.length * (1 - oosFrac));
  const splitDate = all[cut]?.date ?? null;
  const isRec  = splitDate ? records.filter(r => r.date < splitDate) : records;
  const oosRec = splitDate ? records.filter(r => r.date >= splitDate) : [];
  return { splitDate, full: dayTypeStats(records), is: dayTypeStats(isRec), oos: dayTypeStats(oosRec) };
}

// The full set of slice rollups the Conditioning/Drivers/Candidates tabs expose.
// Vol terciles use FIXED thresholds (q1/q2 from the full sample) so the same
// bucket means the same σ band in the full set and the OOS subset.
function sliceSet(records, q1, q2) {
  const volBucket = r => (r.sigma <= q1 ? '1·low-vol' : r.sigma <= q2 ? '2·mid-vol' : '3·high-vol');
  return {
    all:       aggregate(records, () => 'all').all,
    byRegime:  aggregate(records, r => r.regime),
    byVol:     aggregate(records, volBucket),
    bySession: aggregate(records, (r, ln) => ln.session),       // per-touch
    byBudget:  aggregate(records, (r, ln) => ln.budgetBucket),  // per-touch (range consumed at touch)
    byApproachER:  aggregate(records, (r, ln) => ln.approachER),   // per-touch intraday approach efficiency
    byApproachVel: aggregate(records, (r, ln) => ln.approachVel),  // per-touch approach velocity (σ-units)
    byWtState:     aggregate(records, (r, ln) => ln.wtState),      // per-touch WaveTrend extension
    byVolClimax:   aggregate(records, (r, ln) => ln.volClimax),    // per-touch volume climax vs baseline
    byCandleReject:aggregate(records, (r, ln) => ln.candleReject), // per-touch wick rejection at the level
    byRoundNum:    aggregate(records, (r, ln) => ln.roundNum),     // line distance to nearest round number
    byGap:     aggregate(records, r => r.gapBucket),
    byEvent:   aggregate(records, r => r.eventBucket),
    byPhase:   aggregate(records, r => r.monthPhase),
    byDow:     aggregate(records, r => String(r.dow)),
    byYear:    aggregate(records, r => r.date.slice(0, 4)),
    byMonth:   aggregate(records, r => r.date.slice(0, 7)),
  };
}

// Precompute the slice rollups the dashboard exposes — full sample plus an
// out-of-sample copy (last 40% by date, matching the day-type split) so the
// Drivers tab can confirm a driver survives OOS, not just in-sample.
function buildAggregates(records, oosFrac = 0.4) {
  const sigmas = records.map(r => r.sigma).filter(s => s > 0).sort((a, b) => a - b);
  const q1 = sigmas[Math.floor(sigmas.length / 3)] ?? 0;
  const q2 = sigmas[Math.floor(sigmas.length * 2 / 3)] ?? 0;
  const sorted    = records.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const splitDate = sorted[Math.floor(sorted.length * (1 - oosFrac))]?.date ?? null;
  const oosRec    = splitDate ? records.filter(r => r.date >= splitDate) : [];
  return {
    ...sliceSet(records, q1, q2),
    skill:     computeSkill(records),
    dayType:   computeDayType(records),
    oos:       { splitDate, ...sliceSet(oosRec, q1, q2) },
  };
}

// Refresh one pair across all horizons; writes raw records to R2, returns the
// aggregates + coverage for the manifest/aggregates files.
export async function refreshPair(pair, horizons = HORIZONS, onLog = () => {}, opts = {}) {
  let packed = await loadM1ForPair(pair);
  if (!packed?.n) { onLog(`${pair}: no M1 data — skipped`); return null; }
  // Optional gap-fill: top the frozen R2 parquet up to "now" from OANDA M1 so a
  // rebuilt book includes the most recent sessions (the parquet itself is static).
  // Opt-in — `fetchCandles` is injected by the caller; no fetch = unchanged.
  if (opts.gapFill && typeof opts.fetchCandles === 'function') {
    try {
      const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
      packed = await gapFillPacked(packed, oandaSymbol(pair), opts.fetchCandles, { nowSec, onLog });
    } catch (e) { onLog(`${pair}: gap-fill failed (${e.message}) — using stored M1`); }
  }
  // Sessions anchored at MIDNIGHT EUROPE/LONDON — the day the volatility forecast
  // trades on (the live bot anchors there too). Was 22:00 UTC (broker day).
  const sessions   = bucketM1IntoSessions(packed, 'Europe/London');
  const assetClass = assetClassFor(pair);
  let pip = 0; try { pip = pipSize(pair) || 0; } catch { /* unknown symbol → round-number feature off */ }
  onLog(`${pair}: ${packed.n} M1 bars → ${sessions.size} sessions (${assetClass}, pip ${pip || 'n/a'})`);

  const out = { pair, assetClass, horizons: {} };
  for (const h of horizons) {
    const records  = runAnalyser(sessions, assetClass, { horizon: h, pip });
    const coverage = { from: records[0]?.date ?? null, to: records.at(-1)?.date ?? null, windows: records.length };
    await putJSON(`${PREFIX}/${pair}/${h}.json`, { pair, horizon: h, assetClass, coverage, records });
    out.horizons[h] = { coverage, aggregates: buildAggregates(records) };
    onLog(`  ${h}: ${records.length} windows (${coverage.from}→${coverage.to})`);
  }
  return out;
}

// Full / partial refresh. Writes per-pair raw + combined aggregates + manifest.
// Manifest + aggregates are persisted INCREMENTALLY (after each pair) and MERGED
// onto any existing dataset, so a crash/restart mid-run (e.g. OOM on a heavy
// pair) keeps every pair finished so far instead of losing the whole batch — and
// a daily-only refresh never wipes a pair's stored weekly/monthly coverage.
export async function runRefresh({ pairs, horizons = HORIZONS, generatedAt, onLog = () => {},
                                   gapFill = false, fetchCandles, nowSec } = {}) {
  if (!r2Configured()) throw new Error('R2 not configured (R2_ACCESS_KEY / R2_SECRET_KEY)');
  const list = pairs?.length ? pairs : await discoverPairs();
  onLog(`Refreshing ${list.length} pair(s)${gapFill ? ' [gap-fill ON]' : ''}: ${list.join(', ')}`);
  const pairOpts = { gapFill, fetchCandles, nowSec };

  // Start from the existing dataset so partial/subset refreshes accumulate.
  const prevManifest = await getManifest();
  const aggregates   = (await getAggregates()) || {};
  const manifest = {
    generatedAt: generatedAt ?? new Date().toISOString(),
    definitions: { touch: 'intrabar', revertContinue: 'ladder (next-inner vs next-outer line)',
      geometry: 'OC lines static off open; HL (Proj H/L) lines dynamic — trail the opposite running extreme (chart/Pine construction)',
      lowN: 30, sessionBoundary: 'midnight Europe/London (DST-aware)' },
    horizons,
    pairs: prevManifest?.pairs ? { ...prevManifest.pairs } : {},
  };

  let done = 0, failed = 0;
  for (const pair of list) {
    try {
      const r = await refreshPair(pair, horizons, onLog, pairOpts);
      if (!r) continue;
      // Merge per-horizon so a subset-horizon refresh keeps the other horizons.
      const prevCov = manifest.pairs[pair]?.horizons || {};
      manifest.pairs[pair] = {
        assetClass: r.assetClass,
        horizons: { ...prevCov, ...Object.fromEntries(Object.entries(r.horizons).map(([h, v]) => [h, v.coverage])) },
      };
      aggregates[pair] = { ...(aggregates[pair] || {}),
        ...Object.fromEntries(Object.entries(r.horizons).map(([h, v]) => [h, v.aggregates])) };
      done++;
      // Persist progress after EVERY pair — survives a mid-run restart.
      manifest.generatedAt = new Date().toISOString();
      await putJSON(`${PREFIX}/aggregates.json`, aggregates);
      await putJSON(`${PREFIX}/manifest.json`, manifest);
      onLog(`  ✓ saved progress (${done}/${list.length} pairs done${failed ? `, ${failed} failed` : ''})`);
    } catch (e) {
      failed++;
      onLog(`${pair}: ERROR ${e.message}`);
    }
  }

  onLog(`Done — ${done}/${list.length} pair(s) refreshed${failed ? ` (${failed} failed)` : ''}; ${Object.keys(manifest.pairs).length} total in dataset.`);
  return manifest;
}

// ── Per-line confidence book — pooled-IS policy applied OOS across all pairs ──
// Loads the stored per-pair touch records, pools them, learns the fade/follow/
// skip policy on in-sample, applies it out-of-sample, and writes the book result
// (equity curve + per-pair OOS perf + the policy table) to R2.
export async function runPerLineBook({ horizon = 'daily', conditions = ['approachVel'],
                                       minN = 50, splitFrac = 0.6, marginPct = 0.01,
                                       survivorMargin = 0.5, minSurvivorTrades = 30, onLog = () => {} } = {}) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const manifest = await getManifest();
  if (!manifest) throw new Error('No dataset — run a refresh first');
  const pairs = Object.keys(manifest.pairs || {});
  onLog(`Building book from ${pairs.length} pairs (${horizon}, conditions: ${conditions.join('+')})`);

  const touchesByPair = {}, costByPair = {}, slipByPair = {};
  let withBarriers = 0, total = 0;
  for (const pair of pairs) {
    if (!manifest.pairs[pair]?.horizons?.[horizon]) continue;
    const data = await getPairData(pair, horizon);
    if (!data?.records?.length) { onLog(`${pair}: no records`); continue; }
    const touches = extractTouches(data.records, { conditions });
    total += data.records.length;
    if (touches.length) {
      withBarriers++;
      touchesByPair[pair] = touches;
      const ac = assetClassFor(pair);
      costByPair[pair] = costForPair(pair, ac);              // realistic per-pair round-trip spread
      slipByPair[pair] = DEFAULT_SLIP_PCT[ac] ?? DEFAULT_SLIP_PCT.fx;
    }
    onLog(`${pair}: ${touches.length} tradeable touches`);
  }
  if (!withBarriers) throw new Error('No tradeable touches — re-refresh (records need innerLvl/outerLvl + features)');

  const result = runPerLine(touchesByPair, { splitFrac, minN, marginPct, costByPair, slipByPair, survivorMargin, minSurvivorTrades });
  // Rigor battery (walk-forward / per-year / cost-sensitivity / IS-vs-OOS) on the
  // same pooled touches — the "serious backtest" checks.
  const rigor = runRigor(touchesByPair, { splitFrac, minN, marginPct, costByPair, slipByPair });
  // Parameter-sensitivity grid + deflated Sharpe (multiple-testing correction):
  // is the edge perched on one lucky setting, and does it survive the search?
  const sensitivity = runSensitivity(touchesByPair, { base: { splitFrac, minN, marginPct, survivorMargin },
                                                      costByPair, slipByPair, minSurvivorTrades });
  const deflated = sensitivity ? deflatedSharpe(result.equity.map(e => e.pnl), sensitivity.trialSharpesRaw) : null;
  const generatedAt = new Date().toISOString();
  // Store each pair's trade log separately (loaded on demand by the Book tab /
  // the M1 chart drill-down) so the headline book JSON stays small.
  const { tradesByPair, ...summary } = result;
  let logged = 0;
  for (const [pair, log] of Object.entries(tradesByPair || {})) {
    if (!log.length) continue;
    await putJSON(`${PREFIX}/per-line-trades/${pair}-${horizon}.json`, { pair, horizon, generatedAt, splitDate: result.splitDate, trades: log });
    logged += log.length;
  }
  const out = { generatedAt, horizon, conditions, minN, splitFrac, marginPct, survivorMargin, minSurvivorTrades, ...summary, rigor, sensitivity, deflated };
  await putJSON(`${PREFIX}/per-line-${horizon}.json`, out);
  const sv = result.survivors;
  onLog(`Book: ${result.nTrades} OOS trades (${logged} logged) · Sharpe ${result.book.sharpe} · CAGR ${result.book.cagr}% · maxDD ${result.book.maxDD}% · ` +
        `cells fade/follow/skip ${result.coverage.fadeCells}/${result.coverage.followCells}/${result.coverage.skipCells}` +
        (sv ? ` · live universe ${sv.count}/${sv.total} pairs (Sharpe ${sv.portfolio?.sharpe})` : '') +
        (deflated ? ` · DSR ${(deflated.dsr * 100).toFixed(0)}% (${deflated.nTrials} trials)` : '') +
        (result.missed ? ` · took ${result.missed.takenRate}% of touches` : ''));
  return out;
}
// ── Exit study — fixed vs chandelier vs walk-forward stop, IS/OOS × fade/follow ─
// Loads the stored per-pair records for a horizon, flattens to touches (carrying
// the six analyser-simulated exit PnLs), and runs runExitStudy. Returns null if
// no dataset / no records for the horizon (route → 404). Numbers require the
// records to carry the ex* fields (a post-exit-study Refresh) — older records are
// counted in study.missing.
export async function buildExitStudy({ horizon = 'daily', conditions = ['approachVel'],
                                       minN = 50, splitFrac = 0.6, marginPct = 0.01 } = {}) {
  const manifest = await getManifest();
  if (!manifest) return null;
  const pairs = Object.keys(manifest.pairs || {});
  const touchesByPair = {}, costByPair = {}, slipByPair = {};
  for (const pair of pairs) {
    if (!manifest.pairs[pair]?.horizons?.[horizon]) continue;
    const data = await getPairData(pair, horizon);
    if (!data?.records?.length) continue;
    const touches = extractTouches(data.records, { conditions });
    if (!touches.length) continue;
    touchesByPair[pair] = touches;
    const ac = assetClassFor(pair);
    costByPair[pair] = costForPair(pair, ac);
    slipByPair[pair] = DEFAULT_SLIP_PCT[ac] ?? DEFAULT_SLIP_PCT.fx;
  }
  if (!Object.keys(touchesByPair).length) return null;
  return runExitStudy(touchesByPair, { splitFrac, minN, marginPct, costByPair, slipByPair });
}

// ── Day-type gate A/B study — velocity-only vs velocity×ex-ante-day-type ──────
// Loads the stored per-pair records for a horizon, flattens to touches with the
// DEPLOYED baseline conditions (['approachVel']) — each touch also carries its
// ex-ante `dayType` bucket (from the window's signedT, already stored, so NO
// Refresh is needed) — and runs runDayTypeStudy to A/B the velocity-only book
// against the same book gated on the day-type forecast. Per-pair costs mirror the
// deployed book (costForPair). Returns null if no dataset / no records (→ 404).
export async function buildDayTypeStudy({ horizon = 'daily', minN = 50, splitFrac = 0.6,
                                          marginPct = 0.01, dtThresh = 0.33 } = {}) {
  const manifest = await getManifest();
  if (!manifest) return null;
  const pairs = Object.keys(manifest.pairs || {});
  const touchesByPair = {}, costByPair = {}, slipByPair = {};
  for (const pair of pairs) {
    if (!manifest.pairs[pair]?.horizons?.[horizon]) continue;
    const data = await getPairData(pair, horizon);
    if (!data?.records?.length) continue;
    // Baseline (deployed) conditions; dtThresh sets the ex-ante day-type bucket
    // attached to every touch (used only by the gated view + the diagnostic).
    const touches = extractTouches(data.records, { conditions: ['approachVel'], dtThresh });
    if (!touches.length) continue;
    touchesByPair[pair] = touches;
    const ac = assetClassFor(pair);
    costByPair[pair] = costForPair(pair, ac);
    slipByPair[pair] = DEFAULT_SLIP_PCT[ac] ?? DEFAULT_SLIP_PCT.fx;
  }
  if (!Object.keys(touchesByPair).length) return null;
  return runDayTypeStudy(touchesByPair, { splitFrac, minN, marginPct, dtThresh, costByPair, slipByPair });
}

// ── Stop-loss study — per-pair optimal SL from winners' MAE, OOS ──────────────
// Loads the stored per-pair records for a horizon, flattens to touches (which
// already carry extPct/reverted/innerLvl/outerLvl), and runs runStopStudy. Runs on
// the EXISTING records — extPct is already stored, so NO Refresh is needed. Per-pair
// costs mirror the deployed book (costForPair); the asset class per pair feeds the
// asset-class-optimal variant. Returns null if no dataset / no records (route → 404).
export async function buildStopStudy({ horizon = 'daily', conditions = ['approachVel'],
                                       minN = 50, splitFrac = 0.6, marginPct = 0.01 } = {}) {
  const manifest = await getManifest();
  if (!manifest) return null;
  const pairs = Object.keys(manifest.pairs || {});
  const touchesByPair = {}, costByPair = {}, slipByPair = {}, classByPair = {};
  for (const pair of pairs) {
    if (!manifest.pairs[pair]?.horizons?.[horizon]) continue;
    const data = await getPairData(pair, horizon);
    if (!data?.records?.length) continue;
    const touches = extractTouches(data.records, { conditions });
    if (!touches.length) continue;
    touchesByPair[pair] = touches;
    const ac = assetClassFor(pair);
    costByPair[pair]  = costForPair(pair, ac);
    slipByPair[pair]  = DEFAULT_SLIP_PCT[ac] ?? DEFAULT_SLIP_PCT.fx;
    classByPair[pair] = ac;
  }
  if (!Object.keys(touchesByPair).length) return null;
  return runStopStudy(touchesByPair, { splitFrac, minN, marginPct, costByPair, slipByPair, classByPair });
}

export async function getPerLineBook(horizon = 'daily')        { return getJSON(`${PREFIX}/per-line-${horizon}.json`); }
export async function getPerLineTrades(pair, horizon = 'daily') { return getJSON(`${PREFIX}/per-line-trades/${pair}-${horizon}.json`); }

// ── M1 chart drill-down for one trade's session (Book tab trade viewer) ──────
// Returns the session's M1 candles plus the forecast geometry — static OC price
// levels and the DYNAMIC HL line series (trailing the opposite running extreme,
// the exact construction analyseWindow.levelAt uses) — so the levelChart brick
// can render a trade with its forecast lines + entry/TP/SL. Packed M1 is cached
// per pair (LRU 2) because loadM1ForPair pulls the whole parquet (~heavy); a
// viewer drills one pair at a time so two slots cover the common case.
const _m1ChartCache = new Map();
async function _loadM1Cached(pair) {
  const key = String(pair).toLowerCase();
  if (_m1ChartCache.has(key)) { const v = _m1ChartCache.get(key); _m1ChartCache.delete(key); _m1ChartCache.set(key, v); return v; }
  const packed = await loadM1ForPair(key);
  _m1ChartCache.set(key, packed);
  while (_m1ChartCache.size > 2) _m1ChartCache.delete(_m1ChartCache.keys().next().value);
  return packed;
}

export async function getSessionChart(pair, horizon = 'daily', date = '') {
  const key = String(pair).toLowerCase();
  if (!date) throw new Error('date required');
  // The stored record gives open + σ (already horizon-scaled, as % of price) so
  // we rebuild the bands exactly as the analyser did — no σ recomputation.
  const data = await getPairData(key, horizon);
  const rec  = data?.records?.find(r => r.date === date);
  if (!rec) return null;
  const assetClass = data.assetClass || assetClassFor(key);
  const packed = await _loadM1Cached(key);
  if (!packed?.n) throw new Error('no M1 data for pair');
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');  // match the book's session anchor
  const dates = [...sessions.keys()].sort();
  const idx = dates.indexOf(date);
  if (idx < 0) return null;
  const H = FC_HORIZONS[horizon] ?? FC_HORIZONS.daily;
  let bars = [];
  if (horizon === 'daily') bars = (sessions.get(date) || []).slice();
  else for (let k = idx; k < Math.min(idx + H.windowDays, dates.length); k++) bars.push(...(sessions.get(dates[k]) || []));
  if (bars.length < 2) return null;
  bars.sort((a, b) => a.time - b.time);
  const open = bars[0].open;
  const fr = computeBands(open, (rec.sigma || 0) / 100, assetClass);   // { hl50, hl75, ocMed, oc75 }

  // Compact the candle payload for long (weekly/20-day) windows — the dynamic HL
  // series is computed on the SAME grid we return so the lines match the candles.
  let cb = bars, resampledTo = null;
  if (bars.length > 2000) { resampledTo = Math.ceil(bars.length / 1500); cb = resampleTo(bars, resampledTo); }

  // Dynamic HL line series — trail the opposite running extreme (analyseWindow.levelAt).
  const hl = { HL50up: [], HL50dn: [], HL75up: [], HL75dn: [] };
  let rh = -Infinity, rl = Infinity;
  for (const b of cb) {
    if (b.high > rh) rh = b.high;
    if (b.low  < rl) rl = b.low;
    hl.HL50up.push({ time: b.time, value: +(rl * (1 + fr.hl50)).toFixed(6) });
    hl.HL50dn.push({ time: b.time, value: +(rh * (1 - fr.hl50)).toFixed(6) });
    hl.HL75up.push({ time: b.time, value: +(rl * (1 + fr.hl75)).toFixed(6) });
    hl.HL75dn.push({ time: b.time, value: +(rh * (1 - fr.hl75)).toFixed(6) });
  }
  // Static OC lines off the open.
  const oc = {
    OC50up: +(open * (1 + fr.ocMed)).toFixed(6), OC50dn: +(open * (1 - fr.ocMed)).toFixed(6),
    OC75up: +(open * (1 + fr.oc75)).toFixed(6),  OC75dn: +(open * (1 - fr.oc75)).toFixed(6),
  };
  return {
    pair: key, horizon, date, assetClass, open: +open.toFixed(6),
    bars: cb.map(b => ({ time: b.time, open: +(+b.open).toFixed(6), high: +(+b.high).toFixed(6),
                         low: +(+b.low).toFixed(6), close: +(+b.close).toFixed(6) })),
    oc, hl, frac: { hl50: fr.hl50, hl75: fr.hl75, ocMed: fr.ocMed, oc75: fr.oc75 },
    barCount: bars.length, resampledTo,
  };
}

// ── Read helpers (public API serves these) ───────────────────────────────────
export async function getManifest()              { return getJSON(`${PREFIX}/manifest.json`); }
export async function getAggregates()            { return getJSON(`${PREFIX}/aggregates.json`); }
export async function getPairData(pair, horizon) { return getJSON(`${PREFIX}/${pair}/${horizon}.json`); }

export { HORIZONS as ANALYSER_HORIZONS };
