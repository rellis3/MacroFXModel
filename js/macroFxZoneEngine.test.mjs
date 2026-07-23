/**
 * MacroFX Decision-Zone engine — synthetic unit tests (no network).
 * Run: node js/macroFxZoneEngine.test.mjs
 *
 * These prove the ENGINE is sound (no lookahead, honest fills, confluence gate
 * actually gates, MAE read off the path, records well-formed). They do NOT and
 * cannot prove edge — edge only comes from running runZoneSuite on real OANDA
 * data with a true OOS split (CLAUDE.md: "Built ≠ works ≠ has edge").
 */

import assert from 'node:assert';
import { buildZones, runZoneMode, compareZones, asiaExtensionLevels, ASIA_EXT_RATIOS, regressionLevels, groupM1ByDate } from './macroFxZoneEngine.js';

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ✓', msg); passed++; };

// ── Synthetic D1 series: a gently mean-reverting FX-like walk (deterministic) ─
function synthD1(n = 600, start = 1.1000) {
  const bars = [];
  let px = start;
  const t0 = Date.UTC(2018, 0, 1) / 1000;
  for (let i = 0; i < n; i++) {
    // deterministic pseudo-noise + mild reversion toward start
    const noise = Math.sin(i * 0.7) * 0.0018 + Math.cos(i * 0.29) * 0.0011;
    const revert = (start - px) * 0.03;
    const open = px;
    const close = px + noise + revert;
    const high = Math.max(open, close) + 0.0009 + Math.abs(Math.sin(i * 1.3)) * 0.0006;
    const low  = Math.min(open, close) - 0.0009 - Math.abs(Math.cos(i * 1.1)) * 0.0006;
    const date = new Date((t0 + i * 86400) * 1000).toISOString().substring(0, 10);
    bars.push({ date, open: +open.toFixed(5), high: +high.toFixed(5), low: +low.toFixed(5), close: +close.toFixed(5) });
    px = close;
  }
  return bars;
}

console.log('MacroFX Decision-Zone engine tests\n');
const d1 = synthD1();

// 1) buildZones is deterministic, no lookahead (only prior bars in), well-formed.
{
  const prior = d1.slice(0, 200).map(b => ({ ...b, time: Math.floor(Date.parse(b.date) / 1000) }));
  const { zones, bands } = buildZones(prior, d1[200].open, 0.006, 'fx', 'EURUSD', { clusterPips: 10 });
  ok(zones.length > 0, `buildZones emits zones (${zones.length})`);
  ok(zones.every(z => Number.isFinite(z.price) && z.distinctSources >= 1), 'every zone has finite price + distinctSources');
  ok(zones.some(z => z.distinctSources >= 2), 'at least one multi-source confluence zone exists');
  ok(bands.up75 > bands.up50 && bands.up50 > d1[200].open, 'vol bands ordered above open (up75>up50>open)');
}

// 2) Confluence gate actually gates: isolated (gate=1) trades ≥ zone (gate=2).
{
  const zoneRecs     = runZoneMode(d1, null, 'fx', 'EURUSD', 'zone',     { minLookback: 80 });
  const isolatedRecs = runZoneMode(d1, null, 'fx', 'EURUSD', 'isolated', { minLookback: 80 });
  ok(isolatedRecs.length >= zoneRecs.length,
     `isolated (${isolatedRecs.length}) trades ≥ zone (${zoneRecs.length}) — confluence gate reduces count`);
  ok(zoneRecs.every(r => r.distinctSources >= 2), 'every zone-mode trade used ≥2 distinct sources');
  ok(isolatedRecs.some(r => r.distinctSources === 1) || isolatedRecs.length > zoneRecs.length,
     'isolated mode admits single-source levels');
}

// 3) Records are well-formed for the 3 CSV exports (%, R, $).
{
  const recs = runZoneMode(d1, null, 'fx', 'EURUSD', 'zone', { minLookback: 80, accountSize: 10000, riskPct: 1 });
  ok(recs.length > 0, `zone mode produced trades (${recs.length})`);
  const r = recs[0];
  for (const k of ['date', 'pnl_pct', 'mae_pct', 'stop_pct', 'R', 'risk_dollar', 'pnl_dollar', 'side', 'outcome'])
    assert.ok(k in r, `record missing ${k}`);
  ok(true, 'records carry Date/Return%/MAE%/R/stop/$ fields for CSV schemas');
  ok(recs.every(r => r.mae_pct >= 0), 'MAE is non-negative (adverse excursion off the path)');
  // R and %Return are NOT identical (per-trade vol-scaled stop → non-degenerate)
  const ratios = recs.filter(r => Math.abs(r.pnl_pct) > 1e-6).map(r => r.R / r.pnl_pct);
  const allSame = ratios.every(x => Math.abs(x - ratios[0]) < 1e-9);
  ok(!allSame, 'R-multiple ≠ %Return (vol-scaled stop varies per trade — not the degenerate case)');
  ok(recs.every(r => r.risk_dollar === 100), 'risk $ = 1% of $10k = $100 (stated R-unit)');
}

// 4) No-lookahead guard: a trade dated D never depends on data at/after D.
//    Truncating the series at a trade's date must not change that trade's record.
{
  const full = runZoneMode(d1, null, 'fx', 'EURUSD', 'zone', { minLookback: 80 });
  assert.ok(full.length > 5, 'need trades to test causality');
  const probe = full[Math.floor(full.length / 2)];
  const cutIdx = d1.findIndex(b => b.date === probe.date);
  const truncated = runZoneMode(d1.slice(0, cutIdx + 1), null, 'fx', 'EURUSD', 'zone', { minLookback: 80 });
  const same = truncated.find(r => r.date === probe.date);
  ok(same && Math.abs(same.pnl_pct - probe.pnl_pct) < 1e-9 && same.side === probe.side,
     'trade record is identical when future bars are removed → no lookahead');
}

// 5) compareZones returns all four modes with IS/OOS splits.
{
  const { modes } = compareZones(d1, null, 'fx', 'EURUSD', { minLookback: 80, oosFrac: 0.4 });
  for (const m of ['zone', 'isolated', 'zone_fade', 'zone_follow'])
    assert.ok(modes[m]?.is && modes[m]?.oos && modes[m]?.full, `mode ${m} has is/oos/full`);
  ok(true, 'compareZones returns zone/isolated/zone_fade/zone_follow with IS/OOS/full');
}

// ── Synthetic intraday M1 (real 00:00–06:00 Asia window + post-Asia path) ────
// Builds a Map(date → m1 bars) covering the trade dates in `d1`, so asiaAnchor
// mode has genuine intraday structure to work off.
function synthM1(d1) {
  const map = new Map();
  for (const b of d1) {
    const dayEpoch = Math.floor(Date.parse(b.date) / 1000);
    const bars = [];
    // 24h of 30-min bars (48 bars) — enough for a 00:00–06:00 Asia window (12
    // bars) + a post-Asia path. Price wanders around the D1 open→close line.
    for (let k = 0; k < 48; k++) {
      const frac = k / 47;
      const mid = b.open + (b.close - b.open) * frac;
      const wobble = Math.sin(k * 0.9) * (b.high - b.low) * 0.35;
      const o = mid, c = mid + wobble * 0.2;
      const hi = Math.max(o, c) + (b.high - b.low) * 0.15;
      const lo = Math.min(o, c) - (b.high - b.low) * 0.15;
      bars.push({ time: dayEpoch + k * 1800, open: +o.toFixed(5), high: +hi.toFixed(5), low: +lo.toFixed(5), close: +c.toFixed(5) });
    }
    map.set(b.date, bars);
  }
  return map;
}

// 6) Asia extension family: M1-only, built from the session window via the bricks.
{
  const dayEpoch = Math.floor(Date.parse(d1[0].date) / 1000);
  const asiaBars = synthM1([d1[0]]).get(d1[0].date).filter(x => x.time < dayEpoch + 6 * 3600);
  const res = asiaExtensionLevels(asiaBars, 5, ASIA_EXT_RATIOS);
  ok(res && res.levels.length === ASIA_EXT_RATIOS.length, `asiaExtensionLevels emits ${res?.levels.length} levels from M1 range`);
  ok(res.levels.every(l => l.source === 'asia_ext' && Number.isFinite(l.price)), 'Asia levels tagged asia_ext with finite prices');
  ok(res.range.high > res.range.low, 'Asia session range high>low from bodyRange');
  ok(asiaExtensionLevels([], 5) === null, 'no Asia bars → null (weekend/holiday → skip the day)');
}

// 7) Asia-anchored mode trades ONLY the post-Asia path, includes asia_ext, no lookahead.
{
  const m1 = synthM1(d1);
  const recs = runZoneMode(d1, m1, 'fx', 'EURUSD', 'zone', { minLookback: 80, asiaAnchor: true, minSources: 2 });
  ok(recs.length > 0, `asiaAnchor zone mode produced trades (${recs.length})`);
  ok(recs.some(r => r.sources.includes('asia_ext')), 'at least one asia-anchored zone used the asia_ext family');
  // causality: truncating the D1 series at a trade's date can't change it.
  const probe = recs[Math.floor(recs.length / 2)];
  const cutIdx = d1.findIndex(b => b.date === probe.date);
  const m1cut = synthM1(d1.slice(0, cutIdx + 1));
  const same = runZoneMode(d1.slice(0, cutIdx + 1), m1cut, 'fx', 'EURUSD', 'zone', { minLookback: 80, asiaAnchor: true, minSources: 2 })
    .find(r => r.date === probe.date);
  ok(same && Math.abs(same.pnl_pct - probe.pnl_pct) < 1e-9 && same.side === probe.side,
     'asia-anchored trade identical when future bars removed → no lookahead');
  // asiaAnchor requires M1: with none, zero trades.
  const noM1 = runZoneMode(d1, null, 'fx', 'EURUSD', 'zone', { minLookback: 80, asiaAnchor: true });
  ok(noM1.length === 0, 'asiaAnchor with no M1 → no trades (Asia range needs intraday)');
}

// 8) Regression fair-value family (Ch 10): fitted FV + ±σ bands, no lookahead.
{
  const prior = d1.slice(0, 200).map(b => ({ ...b, time: Math.floor(Date.parse(b.date) / 1000) }));
  const lv = regressionLevels(prior, { regrLookback: 80, regrSds: [1, 2] });
  ok(lv.length === 5, `regressionLevels emits fair value + ±1σ/±2σ (${lv.length})`);
  ok(lv.filter(x => x.kind === 'regr_fv').length === 1, 'exactly one fair-value level');
  ok(lv.every(x => x.source === 'regr_band' && Number.isFinite(x.price)), 'regr levels tagged regr_band, finite');
  const fv = lv.find(x => x.kind === 'regr_fv').price;
  const up2 = lv.find(x => x.meta.sd === 2).price, dn2 = lv.find(x => x.meta.sd === -2).price;
  ok(up2 > fv && fv > dn2, 'band ordering: +2σ > fair value > -2σ');
  ok(regressionLevels(prior.slice(0, 5), {}).length === 0, 'too few bars → no regression levels (guarded)');
  // regrBands flows through buildZones as a distinct source.
  const withR  = buildZones(prior, d1[200].open, 0.006, 'fx', 'EURUSD', { clusterPips: 10, regrBands: true, regrLookback: 80 });
  const noR    = buildZones(prior, d1[200].open, 0.006, 'fx', 'EURUSD', { clusterPips: 10, regrBands: false });
  ok(withR.zones.some(z => z.sources.includes('regr_band')) && !noR.zones.some(z => z.sources.includes('regr_band')),
     'regrBands toggles the regr_band evidence family in the zone builder');
}

// 9) Diagnostics: per-year stability + Monte Carlo on the OOS book.
{
  const { diagnostics } = compareZones(d1, null, 'fx', 'EURUSD', { minLookback: 80, oosFrac: 0.4 });
  ok(Array.isArray(diagnostics.perYear) && diagnostics.perYear.length >= 1, `perYear breakdown present (${diagnostics.perYear.length} years)`);
  ok(diagnostics.perYear.every(y => 'sharpe' in y && 'trades' in y && /^\d{4}$/.test(y.year)), 'per-year rows carry year/trades/sharpe');
  ok(diagnostics.mc && diagnostics.mc.bootstrap && diagnostics.mc.montecarlo, 'Monte Carlo block (bootstrap CI + shuffle drawdown) present');
  ok(/expectation-setting/i.test(diagnostics.mcNote), 'MC is labelled expectation-setting, not OOS evidence');
}

// 10) REGRESSION: packed M1 from loadM1ForPair uses epoch SECONDS (Int32Array).
//     groupM1ByDate must file bars under the correct calendar date (not 1970)
//     and keep `.time` in seconds — the bug that zeroed out Asia-anchored mode.
{
  // Build a packed struct exactly like loadM1ForPair: times = epoch SECONDS.
  const days = d1.slice(0, 40);
  const rows = [];
  for (const b of days) {
    const dayEpoch = Math.floor(Date.parse(b.date) / 1000);
    for (let k = 0; k < 48; k++) {
      const frac = k / 47, mid = b.open + (b.close - b.open) * frac;
      const wob = Math.sin(k * 0.9) * (b.high - b.low) * 0.35;
      rows.push([dayEpoch + k * 1800, mid, Math.max(mid, mid + wob * 0.2) + (b.high - b.low) * 0.1, Math.min(mid, mid + wob * 0.2) - (b.high - b.low) * 0.1, mid + wob * 0.2]);
    }
  }
  const n = rows.length;
  const packed = {
    n,
    times:  Int32Array.from(rows.map(r => r[0])),   // epoch SECONDS, as loadM1ForPair emits
    opens:  Float32Array.from(rows.map(r => r[1])),
    highs:  Float32Array.from(rows.map(r => r[2])),
    lows:   Float32Array.from(rows.map(r => r[3])),
    closes: Float32Array.from(rows.map(r => r[4])),
  };
  const map = groupM1ByDate(packed);
  ok(map.has(days[0].date), `groupM1ByDate files bars under the real date ${days[0].date} (not 1970)`);
  const firstBar = map.get(days[0].date)[0];
  ok(firstBar.time === Math.floor(Date.parse(days[0].date) / 1000), 'bar .time stays in epoch seconds (matches dayEpoch scale)');
  // The end-to-end proof: Asia-anchored mode over this loader-shaped M1 trades.
  const recs = runZoneMode(days, map, 'fx', 'EURUSD', 'zone', { minLookback: 20, asiaAnchor: true, minSources: 2 });
  ok(recs.length > 0, `asiaAnchor over loader-shaped (epoch-seconds) M1 produces trades (${recs.length}) — regression guard`);
}

console.log(`\n${passed} checks passed.`);
