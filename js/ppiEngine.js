// js/ppiEngine.js — Producer Price Index (Pipeline Inflation) Numeric-Composition Engine.
//
// Same shape and philosophy as js/cpiEngine.js/js/retailSalesEngine.js: a
// pure numeric score from FRED series, not a text-reading engine.
//
// USD-ONLY, DELIBERATELY. Research confirmed `PPIFIS` (BLS's actual
// headline PPI print — Final Demand, the number desks quote as "PPI m/m")
// and `PPIFES` (Final Demand Less Foods and Energy, standard core PPI) are
// both real, live, monthly index levels on FRED. But every non-US PPI
// series checked (Germany/UK/Japan/Canada/Switzerland/Australia/New
// Zealand, both the OECD `PIEATI01{cc}{freq}661N` index-level and
// `PIEAMP02{cc}{freq}659N` growth-rate families) is REAL but appears to
// have stopped receiving new observations on FRED around December 2022 —
// three-plus years stale — even though the national statistical offices
// themselves are still publishing PPI live through 2026 (confirmed via
// search: Germany PPI May 2026 +2.2% YoY, UK PPI May 2026 +2.8% YoY,
// Canada IPPI June 2026 +12.4% YoY). Building against those frozen FRED
// IDs would silently present stale data as live on the dashboard — worse
// than not covering those 7 currencies at all. If a live FRED ingestion of
// national PPI resumes (or a working per-country statistical-office API
// becomes reachable from this sandbox — none of the 7 national stats
// sites, e.g. Destatis/ONS/e-Stat/StatCan, were reachable when checked;
// same egress constraint as every other fetch module here), extend
// PPI_UNIVERSE the same way CPI_UNIVERSE covers all 8 — until then this
// stays USD-only rather than guessing or shipping frozen data as live.
//
// PPI is a leading indicator for CPI — it captures pipeline/input cost
// pressure before it passes through to consumer prices, so a PPI
// acceleration with CPI still calm is a legitimate early-warning signal.
// Scored the same "trend vs. own trailing history" way retailSalesEngine
// scores consumer spending (no fixed target the way CPI has ~2%, since
// there's no widely-quoted PPI target) — is pipeline pressure building or
// easing relative to this economy's own recent norm.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const PPI_UNIVERSE = {
  USD: { headline: { series: 'PPIFIS', isIndex: true }, core: { series: 'PPIFES', isIndex: true } },
};

// ── Pure stats helpers (identical shape to retailSalesEngine.js's) ─────────

export function toSeries(obsMap) {
  if (!obsMap) return [];
  return [...obsMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export function yoyPct(series, periodsBack = 12) {
  return series.map((pt, i) => {
    const ref = series[i - periodsBack];
    if (!ref || ref.value === 0) return { ...pt, yoy: null };
    return { ...pt, yoy: +((pt.value / ref.value - 1) * 100).toFixed(2) };
  });
}

export function latestZScore(values, lookback = 24, minBaseline = 6) {
  const clean = values.filter(v => v != null && Number.isFinite(v));
  if (clean.length < minBaseline + 1) return null;
  const latest = clean.at(-1);
  const baseline = clean.slice(Math.max(0, clean.length - 1 - lookback), clean.length - 1);
  if (baseline.length < minBaseline) return null;
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const sd = Math.sqrt(variance);
  const flatFloor = Math.max(1e-9, Math.abs(mean) * 1e-9);
  if (sd < flatFloor) return Math.abs(latest - mean) < flatFloor ? 0 : (latest > mean ? 4 : -4);
  return +((latest - mean) / sd).toFixed(2);
}

const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const zToScore = z => (z == null ? null : clip(z / 2.5));
const round2 = v => (v == null ? null : +v.toFixed(2));

function toYoySeries(obsMap, meta) {
  const series = toSeries(obsMap);
  return meta?.isIndex ? yoyPct(series) : series.map(pt => ({ ...pt, yoy: pt.value == null ? null : round2(pt.value) }));
}

// ── Named dimension ──────────────────────────────────────────────────────

// Pipeline-pressure trend: is the latest YoY PPI print running hot or cold
// relative to its OWN trailing history — same framing retailSalesEngine
// gives consumer spending, applied here to producer/input costs instead.
export function ppiScore(obsMap, meta) {
  const series = toYoySeries(obsMap, meta);
  const yoys = series.map(p => p.yoy);
  const z = latestZScore(yoys);
  const latest = series.at(-1);
  return { latestYoy: latest?.yoy ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Composite read for one currency. `data` = { headline?, core? }. Composite
// IS the headline score directly; core is reported standalone, same
// "report it, don't blend it" treatment CPI gives its core dimension.
export function ppiCompositeScore(data = {}, universe = {}) {
  const dims = {};
  if (data.headline) dims.headline = ppiScore(data.headline, universe.headline);
  if (data.core) dims.core = ppiScore(data.core, universe.core);
  return { dims, pressure: dims.headline?.score ?? null, coverage: Object.keys(dims) };
}

// Fetch every configured series for one currency. Never throws on a single
// missing/failed series, same availability-reporting pattern as every
// other engine here.
export async function fetchPpiData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = PPI_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No PPI series configured for ${ccy}`);
  const data = {}, availability = [];
  await Promise.all(Object.entries(cfg).map(async ([factor, meta]) => {
    try {
      const obs = await fetchFredObservations(meta.series, fromDate, fredKey);
      data[factor] = obs;
      availability.push({ factor, series: meta.series, n: obs.size });
    } catch (e) {
      availability.push({ factor, series: meta.series, n: 0, error: e.message });
    }
  }));
  return { data, availability };
}
