// Day reconstruction, milestone 1 (JS half): does the historical rebuild reproduce what production published?
// Uses the production functions themselves (no copies): yangZhangVolSeries (js/volForecast.js), forecastSigma,
// buildLadder, v4Days/nyCloseDailyBars (js/voteAtlasV4Lines.js).
//
//   V2  bar-source parity: production's archived `yz_vol_annual` (YZ-30 on the daily bars production fetched)
//       vs the same function on NY-close bars built from local M1, bars cut at the archive's computed_at.
//   V3  published ladders vs the repo's LADDER_PARAMS: rebuild every archived ladder from its own published
//       sigma_daily_pct + event tag and compare every rung.
//   dump v4Days sigma / tag / levels per day (FF tags) for the Python checks.
//
// Reads the archive JSONs fetched read-only from production (scratchpad), never writes anywhere but the output folder.
//   node scripts/day-reconstruction/validate_prod.mjs <archiveDir>
import fs from 'fs';
import path from 'path';

delete process.env.R2_ACCESS_KEY; delete process.env.R2_SECRET_KEY;   // local cache only
const { loadM1ForPair } = await import('../../js/volBacktestM1Engine.js');
const { yangZhangVolSeries } = await import('../../js/volForecast.js');
const { buildLadder, paramsFor, RUNGS, QUANTITIES } = await import('../../js/forecastLadder.js');
const { v4Days, nyCloseDailyBars } = await import('../../js/voteAtlasV4Lines.js');

const OUT = 'analysis/output/day-reconstruction';
const ARCH = process.argv[2];
const INST = [['GOLD', 'gold', 'commodity'], ['NQ', 'nq', 'index'], ['EURUSD', 'eurusd', 'fx']];
const LAST = '2026-08-20';
const ff = JSON.parse(fs.readFileSync(`${OUT}/ff_tags.json`, 'utf8'));
const archive = fs.readdirSync(ARCH).filter(f => f.endsWith('.json')).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(ARCH, f), 'utf8')));
const res = { V2: {}, V3: {}, generatedAt: new Date().toISOString() };

for (const [NAME, key, cls] of INST) {
  const packed = await loadM1ForPair(key);
  const ny = nyCloseDailyBars(packed).filter(b => b.n >= 60);

  // ── V2: bar-source parity on every archived date the M1 history covers ──────
  const rows = [];
  for (const a of archive) {
    const f = a.instruments?.[NAME];
    if (!f || !(f.yz_vol_annual > 0) || !a.computed_at) continue;
    const cut = Date.parse(a.computed_at) / 1000;
    const bars = ny.filter(b => b.endSec <= cut);
    if (!bars.length || bars.at(-1).endSec < cut - 4 * 86400) continue;   // M1 history ends before this date
    if (Date.parse(LAST + 'T23:59:59Z') / 1000 < cut - 86400) continue;
    const yz = yangZhangVolSeries(bars).at(-1);
    const mine = Math.round(yz * 100 * Math.sqrt(252) * 100) / 100;
    rows.push({ date: a.session_date, computed_at: a.computed_at, lastBar: bars.at(-1).key,
      published: f.yz_vol_annual, rebuilt: mine, relDiff: mine / f.yz_vol_annual - 1 });
  }
  const rd = rows.map(r => Math.abs(r.relDiff)).sort((x, y) => x - y);
  res.V2[NAME] = { n: rows.length, medianAbsRelDiff: rd[rd.length >> 1], maxAbsRelDiff: rd.at(-1),
    within1pct: rows.filter(r => Math.abs(r.relDiff) <= 0.01).length, rows };
  console.log(`V2 ${NAME}: n ${rows.length}, median |rel diff| ${(100 * rd[rd.length >> 1]).toFixed(2)}%, max ${(100 * rd.at(-1)).toFixed(2)}%, within 1%: ${res.V2[NAME].within1pct}`);

  // ── V3: every published ladder vs the repo params, from its own sigma + tag ──
  const v3 = [];
  for (const a of archive) {
    const L = a.instruments?.[NAME]?.ladder;
    if (!L) continue;
    const re = buildLadder(L.sigma_daily_pct / 100, { instrument: NAME, assetClass: cls, eventTag: L.event_tag, horizon: 'daily' });
    let maxDiff = 0;
    for (const q of QUANTITIES) for (const r of RUNGS) {
      if (L[q]?.[r] == null || re[q]?.[r] == null) continue;
      maxDiff = Math.max(maxDiff, Math.abs(L[q][r] - re[q][r]));
    }
    v3.push({ date: a.session_date, estimator: L.estimator, repoEstimator: paramsFor(NAME, cls).estimator,
      tag: L.event_tag, mult: L.event_mult, repoMult: re.event_mult, maxRungDiff: +maxDiff.toFixed(3),
      sigma_daily_pct: L.sigma_daily_pct });
  }
  res.V3[NAME] = v3;
  const ok = v3.filter(r => r.maxRungDiff <= 0.02 && r.estimator === r.repoEstimator && Math.abs(r.mult - r.repoMult) < 0.0015);
  console.log(`V3 ${NAME}: ${v3.length} published ladders, ${ok.length} reproduce with repo params (first ${ok[0]?.date}); mismatches: ${v3.filter(r => !ok.includes(r)).map(r => r.date).join(' ')}`);

  // ── dump v4Days sigma + tag per London date (FF tags; uncovered dates -> null = x1.0) ──
  const cover = ff.coverage, tags = ff.tags[NAME] ?? {};
  const tagFor = d => (d < cover[0] || d > cover[1]) ? null : (tags[d] ?? 'none');
  const days = v4Days(packed, { instrument: NAME, assetClass: cls, eventTagFor: tagFor })
    .filter(d => d.date <= LAST)
    .map(d => ({ date: d.date, open: d.open, lastNy: d.lastNyKey, sigma_daily_pct: d.ladder.sigma_daily_pct,
      tag: d.eventTag, mult: d.ladder.event_mult, oh: d.ladder.oh, ol: d.ladder.ol, oc: d.ladder.oc, hl: d.ladder.hl }));
  fs.writeFileSync(`${OUT}/v4days_${NAME}.json`, JSON.stringify(days));
  console.log(`dump ${NAME}: ${days.length} days ${days[0].date} -> ${days.at(-1).date}`);
}
fs.writeFileSync(`${OUT}/validate_prod.json`, JSON.stringify(res, null, 1));
