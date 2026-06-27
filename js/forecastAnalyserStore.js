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
    byDow:     aggregate(records, r => String(r.dow)),
    byYear:    aggregate(records, r => r.date.slice(0, 4)),
    byMonth:   aggregate(records, r => r.date.slice(0, 7)),
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
    definitions: { touch: 'intrabar', revertContinue: 'ladder (next-inner vs next-outer line)', lowN: 30, sessionBoundaryUtc: 22 },
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
