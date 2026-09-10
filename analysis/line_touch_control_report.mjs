// Line Touch Control Report — 2026-09-10
//
// Pools the per-pair paired-control results from
// analysis/line_touch_control_study.mjs and gives the verdict on the one
// positive result the response study produced: is the MFE-|MAE| asymmetry at a
// line touch actually ABOUT the line?
//
// Pooling is inverse-variance weighted across instruments rather than a plain
// average of per-pair means, because SPX and DOW carry roughly half the history
// of the FX pairs and a plain average would let the two thinnest instruments
// swing the answer as hard as EURUSD.
//
//   node analysis/line_touch_control_report.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'line-touch-control');
const FAMILIES = ['hl50', 'hl75', 'hl90', 'oh50', 'oh75', 'oh90', 'dopen'];

if (!fs.existsSync(DIR)) { console.error(`no ${DIR} — run analysis/line_touch_control_study.mjs first`); process.exit(1); }
const files = fs.readdirSync(DIR).filter(f => f.endsWith('-control.json')).sort();
if (!files.length) { console.error('no control files'); process.exit(1); }
const all = files.map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

const f4 = v => (v == null ? '     — ' : (v >= 0 ? '+' : '') + v.toFixed(4));
const f2 = v => (v == null ? ' — ' : v.toFixed(2));

// Recover each pair's standard error from its own mean and t, then combine
// inverse-variance. Also carries a sign count, because a real effect should show
// up on most instruments rather than being one pair's outlier.
function pool(rows) {
  const use = rows.filter(r => r && r.n >= 30 && r.t != null && r.t !== 0 && Number.isFinite(r.meanDiff));
  if (!use.length) return null;
  let wsum = 0, wxsum = 0, nsum = 0, pos = 0;
  for (const r of use) {
    const se = Math.abs(r.meanDiff / r.t);
    if (!(se > 0) || !Number.isFinite(se)) continue;
    const w = 1 / (se * se);
    wsum += w; wxsum += w * r.meanDiff; nsum += r.n;
    if (r.meanDiff > 0) pos++;
  }
  if (!(wsum > 0)) return null;
  const m = wxsum / wsum, se = Math.sqrt(1 / wsum);
  return { mean: m, t: m / se, n: nsum, k: use.length, pos };
}

for (const ctl of ['A', 'B']) {
  console.log('='.repeat(100));
  console.log(ctl === 'A'
    ? 'CONTROL A — touch vs a RANDOM MOMENT on a different day (runway-matched, same side)'
    : 'CONTROL B — touch vs a random OTHER TIME in the SAME day (same side)');
  console.log(ctl === 'A'
    ? '  This is the tradeability test: a p90 touch is observable in real time, so "the day was'
    : '  This is a mechanism probe, NOT a tradeable alternative — you cannot know in advance that a');
  console.log(ctl === 'A'
    ? '  directional" is part of the signal, not a bias. Positive diff = the touch beat random.'
    : '  day will trend. Read controlEntryOffset before reading anything else in this block.');
  console.log('='.repeat(100));
  console.log('family   pairs  totalN   touchEdge  ctrlEdge    diff    t(pooled)  pairs+' +
    (ctl === 'B' ? '   ctrlEntryOff' : ''));
  for (const fam of FAMILIES) {
    const rows = all.map(a => a[ctl]?.[fam]).filter(Boolean);
    if (!rows.length) continue;
    const p = pool(rows);
    if (!p) continue;
    const wm = key => {
      let w = 0, x = 0;
      for (const r of rows) { if (r.n >= 30) { w += r.n; x += r.n * (r[key] ?? 0); } }
      return w > 0 ? x / w : null;
    };
    console.log(
      fam.padEnd(8) + String(p.k).padStart(5) + String(p.n).padStart(9) + '  ' +
      f4(wm('touchEdge')).padStart(10) + f4(wm('controlEdge')).padStart(10) +
      f4(p.mean).padStart(9) + ('t' + f2(p.t)).padStart(11) +
      `${p.pos}/${p.k}`.padStart(8) +
      (ctl === 'B' ? f4(wm('controlEntryOffset')).padStart(15) : ''));
  }
  console.log('');
}

console.log('HOW TO READ THIS');
console.log('  diff  = mean(touch asymmetry - its own paired control asymmetry), in expected-day-ranges.');
console.log('  |t| under ~2.5 after pooling 17 instruments is not an effect, whatever one pair showed.');
console.log('  pairs+ counts instruments with a positive diff — a real effect should be most of them,');
console.log('  not 9/17 with one large outlier carrying the pooled mean.');
console.log('  In control B, controlEntryOffset < 0 means the control entered BEHIND the touch in the');
console.log('  trade\'s direction. A touch sits at a local extreme by construction, so a nearby random');
console.log('  bar starts with more room to run. That is a structural head start for the control, not');
console.log('  evidence the line is bad — which is why B cannot be read as a tradeability result.');
