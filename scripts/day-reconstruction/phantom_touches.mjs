// Day reconstruction, milestone 3 baseline: the same first-touch archive for PHANTOM ladders -- every rung of the day's
// existing ladder scaled by a fixed factor (0.85 and 1.15, fixed before any outcome was looked at). Same days, same open,
// same session bars, same buildDay rules (scripts/day-reconstruction/build_archive.mjs); only the distance of the lines
// differs. Their average answers "what does a line at about this distance do when it is NOT the forecast's line?".
// Reads the archive's day rows (rungs as built) -- no forecast is recomputed.
//   node scripts/day-reconstruction/phantom_touches.mjs NAME
import fs from 'fs';
delete process.env.R2_ACCESS_KEY; delete process.env.R2_SECRET_KEY;
const { buildDay, INST } = await import('./build_archive.mjs');
const { loadM1ForPair } = await import('../../js/volBacktestM1Engine.js');
const { bucketM1IntoSessions } = await import('../../js/forecastAnalyser.js');
const ARC = 'analysis/output/day-reconstruction/archive', OUT = 'analysis/output/day-reconstruction/m3';
const FACTORS = process.env.PH_FACTORS ? process.env.PH_FACTORS.split(',').map(Number) : [0.85, 1.15];
const NAME = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const days = fs.readFileSync(`${ARC}/${NAME}_days.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const sessions = bucketM1IntoSessions(await loadM1ForPair(INST[NAME][0]), 'Europe/London');
const fd = fs.openSync(`${OUT}/${NAME}_phantom_touches${process.env.PH_FACTORS ? '_f' + process.env.PH_FACTORS : ''}.jsonl`, 'w');
let n = 0, misaligned = 0;
for (const d of days) {
  const bars = (sessions.get(d.date) ?? []).filter(b => b.time >= d.t_open && b.time <= d.t_last);
  if (bars.length !== d.n_bars || bars[0]?.time !== d.t_open) { misaligned++; continue; }
  for (const f of FACTORS) {
    const sc = r => ({ p50: r.p50 * f, p75: r.p75 * f, p90: r.p90 * f });
    const ladder = { hl: sc({ p50: d.hl_p50, p75: d.hl_p75, p90: d.hl_p90 }), oc: sc({ p50: d.oc_p50, p75: d.oc_p75, p90: d.oc_p90 }),
      oh: sc({ p50: d.oh_p50_pct, p75: d.oh_p75_pct, p90: d.oh_p90_pct }), ol: sc({ p50: d.ol_p50_pct, p75: d.ol_p75_pct, p90: d.ol_p90_pct }) };
    const { touches } = buildDay({ open: d.open, ladder, scale: d.scale }, bars);
    for (const t of touches) {
      fs.writeSync(fd, JSON.stringify({ instrument: NAME, date: d.date, era: d.era, tag_status: d.tag_status, factor: f,
        scale: d.scale, open: d.open, ...t }) + '\n');
      n++;
    }
  }
}
fs.closeSync(fd);
console.log(JSON.stringify({ NAME, phantom_touches: n, misaligned_days: misaligned, days: days.length }));
