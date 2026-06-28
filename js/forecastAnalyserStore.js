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

// Discover all M1 pairs on R2 (list m1/*_m1.parquet); fall back to the known list.
export async function discoverPairs() {
  try {
    const keys  = await listKeys(`${M1_PREFIX}/`);
    const pairs = keys.filter(k => k.endsWith('_m1.parquet'))
      .map(k => k.split('/').pop().replace('_m1.parquet', ''));
    if (pairs.length) return [...new Set(pairs)].sort();
  } catch { /* listing not permitted — fall through */ }
  return Object.keys(M1_DRIVE_IDS).sort();
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

// Precompute the slice rollups the dashboard exposes.
function buildAggregates(records) {
  // Vol terciles (low/mid/high σ) over this pair's windows — the regime the
  // reference study found to be the biggest driver.
  const sigmas = records.map(r => r.sigma).filter(s => s > 0).sort((a, b) => a - b);
  const q1 = sigmas[Math.floor(sigmas.length / 3)] ?? 0;
  const q2 = sigmas[Math.floor(sigmas.length * 2 / 3)] ?? 0;
  const volBucket = r => (r.sigma <= q1 ? '1·low-vol' : r.sigma <= q2 ? '2·mid-vol' : '3·high-vol');
  return {
    all:       aggregate(records, () => 'all').all,
    byRegime:  aggregate(records, r => r.regime),
    byVol:     aggregate(records, volBucket),
    bySession: aggregate(records, (r, ln) => ln.session),       // per-touch
    byBudget:  aggregate(records, (r, ln) => ln.budgetBucket),  // per-touch (range consumed at touch)
    byGap:     aggregate(records, r => r.gapBucket),
    byEvent:   aggregate(records, r => r.eventBucket),
    byPhase:   aggregate(records, r => r.monthPhase),
    byDow:     aggregate(records, r => String(r.dow)),
    byYear:    aggregate(records, r => r.date.slice(0, 4)),
    byMonth:   aggregate(records, r => r.date.slice(0, 7)),
    skill:     computeSkill(records),
    dayType:   computeDayType(records),
  };
}

// Refresh one pair across all horizons; writes raw records to R2, returns the
// aggregates + coverage for the manifest/aggregates files.
export async function refreshPair(pair, horizons = HORIZONS, onLog = () => {}) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { onLog(`${pair}: no M1 data — skipped`); return null; }
  const sessions   = bucketM1IntoSessions(packed);
  const assetClass = assetClassFor(pair);
  onLog(`${pair}: ${packed.n} M1 bars → ${sessions.size} sessions (${assetClass})`);

  const out = { pair, assetClass, horizons: {} };
  for (const h of horizons) {
    const records  = runAnalyser(sessions, assetClass, { horizon: h });
    const coverage = { from: records[0]?.date ?? null, to: records.at(-1)?.date ?? null, windows: records.length };
    await putJSON(`${PREFIX}/${pair}/${h}.json`, { pair, horizon: h, assetClass, coverage, records });
    out.horizons[h] = { coverage, aggregates: buildAggregates(records) };
    onLog(`  ${h}: ${records.length} windows (${coverage.from}→${coverage.to})`);
  }
  return out;
}

// Full / partial refresh. Writes per-pair raw + combined aggregates + manifest.
export async function runRefresh({ pairs, horizons = HORIZONS, generatedAt, onLog = () => {} } = {}) {
  if (!r2Configured()) throw new Error('R2 not configured (R2_ACCESS_KEY / R2_SECRET_KEY)');
  const list = pairs?.length ? pairs : await discoverPairs();
  onLog(`Refreshing ${list.length} pair(s): ${list.join(', ')}`);

  const manifest = {
    generatedAt: generatedAt ?? new Date().toISOString(),
    definitions: { touch: 'intrabar', revertContinue: 'ladder (next-inner vs next-outer line)',
      geometry: 'OC lines static off open; HL (Proj H/L) lines dynamic — trail the opposite running extreme (chart/Pine construction)',
      lowN: 30, sessionBoundaryUtc: 22 },
    horizons, pairs: {},
  };
  const aggregates = {};

  for (const pair of list) {
    try {
      const r = await refreshPair(pair, horizons, onLog);
      if (!r) continue;
      manifest.pairs[pair] = {
        assetClass: r.assetClass,
        horizons: Object.fromEntries(Object.entries(r.horizons).map(([h, v]) => [h, v.coverage])),
      };
      aggregates[pair] = Object.fromEntries(Object.entries(r.horizons).map(([h, v]) => [h, v.aggregates]));
    } catch (e) {
      onLog(`${pair}: ERROR ${e.message}`);
    }
  }

  await putJSON(`${PREFIX}/aggregates.json`, aggregates);
  await putJSON(`${PREFIX}/manifest.json`, manifest);
  onLog(`Done — ${Object.keys(manifest.pairs).length} pairs stored.`);
  return manifest;
}

// ── Read helpers (public API serves these) ───────────────────────────────────
export async function getManifest()              { return getJSON(`${PREFIX}/manifest.json`); }
export async function getAggregates()            { return getJSON(`${PREFIX}/aggregates.json`); }
export async function getPairData(pair, horizon) { return getJSON(`${PREFIX}/${pair}/${horizon}.json`); }

export { HORIZONS as ANALYSER_HORIZONS };
