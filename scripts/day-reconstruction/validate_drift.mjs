// Day reconstruction, milestone 1: does computeForecast on M1-built NY-close bars reproduce production's published
// drift_d (the export's "Drift (d=μ/σ)" row) on the archived days the M1 history covers?
//   node scripts/day-reconstruction/validate_drift.mjs <archiveDir>
import fs from 'fs';
import path from 'path';
delete process.env.R2_ACCESS_KEY; delete process.env.R2_SECRET_KEY;
const { loadM1ForPair } = await import('../../js/volBacktestM1Engine.js');
const { computeForecast } = await import('../../js/volForecast.js');
const { nyCloseDailyBars } = await import('../../js/voteAtlasV4Lines.js');
const ARCH = process.argv[2];
const archive = fs.readdirSync(ARCH).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(fs.readFileSync(path.join(ARCH, f), 'utf8')));
const out = {};
for (const [NAME, key, cls] of [['GOLD', 'gold', 'commodity'], ['NQ', 'nq', 'index'], ['EURUSD', 'eurusd', 'fx']]) {
  const ny = nyCloseDailyBars(await loadM1ForPair(key)).filter(b => b.n >= 60);
  const rows = [];
  for (const a of archive) {
    const f = a.instruments?.[NAME];
    if (!f || f.drift_d == null || !a.computed_at || a.session_date > '2026-08-21') continue;
    const cut = Date.parse(a.computed_at) / 1000;
    const bars = ny.filter(b => b.endSec <= cut).slice(-800).map(b => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
    const fc = computeForecast(bars, cls, f.news_mult ?? 1, { instrument: NAME });
    rows.push({ date: a.session_date, published: f.drift_d, rebuilt: fc.drift_d, diff: fc.drift_d - f.drift_d });
  }
  const ad = rows.map(r => Math.abs(r.diff)).sort((x, y) => x - y);
  out[NAME] = { n: rows.length, medianAbsDiff: ad[ad.length >> 1], maxAbsDiff: ad.at(-1), rows };
  console.log(`${NAME} drift_d: n ${rows.length}, median |diff| ${ad[ad.length >> 1]?.toFixed(4)}, max ${ad.at(-1)?.toFixed(4)}`);
}
fs.writeFileSync('analysis/output/day-reconstruction/validate_drift.json', JSON.stringify(out, null, 1));
