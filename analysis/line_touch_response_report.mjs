// Line Touch Response Report — 2026-09-09
//
// Reads the per-pair files analysis/line_touch_response_study.mjs writes and
// answers three questions. Cheap and re-runnable: no M1 walk.
//
//   1. DRIFT      after a touch, does price continue through the line or fade
//                 off it? Signed in the continuation direction, so the answer is
//                 the sign of a mean against a null of zero. t-stats throughout,
//                 because on 20k+ touches a "meaningful-looking" mean of 0.01
//                 expected-ranges is usually nothing.
//   2. ASYMMETRY  MFE vs |MAE|. A line with no drift in the mean can still be
//                 tradeable if the excursion is lopsided, and that is what
//                 decides whether any stop/target could harvest it. The old
//                 barrier-race studies structurally could not see this.
//   3. p90 EXTENT when price DOES continue through p90, how far does it go, in
//                 fractions of the day's ex-ante expected range -- broken out by
//                 session and by hour, and paired with how often it happens.
//                 "Continued" is a threshold on the maximum continuation
//                 excursion, swept rather than fixed, so the answer is a curve
//                 and not one number resting on an arbitrary cutoff.
//
// Everything is normalised by each day's dayScale (open * ex-ante forecast
// sigma), so a printed 0.35 reads as "0.35 of a normal day's move for this
// instrument" and pools across instruments and eras.
//
//   node analysis/line_touch_response_report.mjs
//   LA_SEG=oos node analysis/line_touch_response_report.mjs   # is | oos | all (default all)
//   LA_FAM=hl90 node analysis/line_touch_response_report.mjs  # restrict families
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'line-touch-response');
const SEG = (process.env.LA_SEG || 'all').toLowerCase();
const FAM_FILTER = process.env.LA_FAM ? new Set(process.env.LA_FAM.split(',').map(s => s.trim())) : null;
const HORIZ_LABELS = ['5m', '15m', '30m', '60m', '120m'];

if (!fs.existsSync(DIR)) { console.error(`no ${DIR} — run analysis/line_touch_response_study.mjs first`); process.exit(1); }
const files = fs.readdirSync(DIR).filter(f => f.endsWith('-response.json')).sort();
if (!files.length) { console.error('no response files'); process.exit(1); }

// Flatten to one row per touch, with every distance already divided by that
// day's expected range.
const rows = [];
const instruments = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  instruments.push(j.instrument);
  for (const d of j.days) {
    if (SEG === 'is' && d.date >= j.splitDate) continue;
    if (SEG === 'oos' && d.date < j.splitDate) continue;
    const s = d.dayScale;
    if (!(s > 0)) continue;
    for (const t of d.touches) {
      if (FAM_FILTER && !FAM_FILTER.has(t.family)) continue;
      rows.push({
        instrument: j.instrument, date: d.date, family: t.family, side: t.side,
        session: t.session, hourUtc: t.hourUtc, minsLeft: t.minsLeft,
        ret: t.ret.map(v => (v == null ? null : v / s)),
        mfe: t.mfe.map(v => (v == null ? null : v / s)),
        mae: t.mae.map(v => (v == null ? null : v / s)),
        eod: t.eodRet == null ? null : t.eodRet / s,
        maxExt: t.maxExt == null ? null : t.maxExt / s,
        maxAdv: t.maxAdv == null ? null : t.maxAdv / s,
        tMaxExt: t.tMaxExt,
      });
    }
  }
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function tstat(a) {
  const n = a.length; if (n < 3) return null;
  const m = mean(a);
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1));
  return sd > 0 ? m / (sd / Math.sqrt(n)) : null;
}
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = p * (sorted.length - 1), lo = Math.floor(pos), frac = pos - lo;
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * frac;
}
const f3 = v => (v == null ? '   —  ' : (v >= 0 ? '+' : '') + v.toFixed(3));
const f2 = v => (v == null ? '  — ' : v.toFixed(2));

const FAMILIES = ['hl50', 'hl75', 'hl90', 'oh50', 'oh75', 'oh90', 'dopen'];
const present = FAMILIES.filter(fam => rows.some(r => r.family === fam));

console.log(`Line Touch Response Report — segment=${SEG.toUpperCase()}, ${instruments.length} instruments, ${rows.length} touches`);
console.log(`All distances are fractions of the day's EX-ANTE expected range (open x forecast sigma).`);
console.log(`Positive = price CONTINUED through the line. Negative = it FADED off it.\n`);

// ── 1. DRIFT ────────────────────────────────────────────────────────────────
console.log('='.repeat(104));
console.log('1. DRIFT — mean signed continuation return by horizon (t-stat beneath). |t| under ~3 on these n is noise.');
console.log('='.repeat(104));
console.log('family      n     ' + HORIZ_LABELS.map(h => h.padStart(9)).join('') + '      eod');
for (const fam of present) {
  const sub = rows.filter(r => r.family === fam);
  const cells = [], tcells = [];
  for (let i = 0; i < HORIZ_LABELS.length; i++) {
    const v = sub.map(r => r.ret[i]).filter(x => x != null);
    cells.push(f3(mean(v)).padStart(9)); tcells.push(('t' + f2(tstat(v))).padStart(9));
  }
  const eod = sub.map(r => r.eod).filter(x => x != null);
  console.log(fam.padEnd(8) + String(sub.length).padStart(7) + '  ' + cells.join('') + f3(mean(eod)).padStart(9));
  console.log(' '.repeat(17) + tcells.join('') + ('t' + f2(tstat(eod))).padStart(9));
}

// ── 2. ASYMMETRY ────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(104));
console.log('2. ASYMMETRY — mean best (MFE) vs worst (MAE) excursion in the continuation direction, rest of session.');
console.log('   edge = MFE - |MAE|. Positive means the line offers more room forward than against, before any exit rule.');
console.log('='.repeat(104));
console.log('family      n      MFE     |MAE|     edge    t(edge)   medExt   p75Ext   p90Ext');
for (const fam of present) {
  const sub = rows.filter(r => r.family === fam && r.maxExt != null && r.maxAdv != null);
  const per = sub.map(r => r.maxExt - Math.abs(r.maxAdv));
  const ext = sub.map(r => r.maxExt).sort((a, b) => a - b);
  console.log(
    fam.padEnd(8) + String(sub.length).padStart(7) +
    f3(mean(sub.map(r => r.maxExt))).padStart(9) +
    f3(mean(sub.map(r => Math.abs(r.maxAdv)))).padStart(10) +
    f3(mean(per)).padStart(9) + ('t' + f2(tstat(per))).padStart(11) +
    f3(quantile(ext, 0.5)).padStart(9) + f3(quantile(ext, 0.75)).padStart(9) + f3(quantile(ext, 0.9)).padStart(9));
}

// ── 3. p90 CONTINUATION EXTENT ──────────────────────────────────────────────
const P90 = rows.filter(r => (r.family === 'hl90' || r.family === 'oh90') && r.maxExt != null);
if (P90.length) {
  for (const fam of ['hl90', 'oh90']) {
    const sub = P90.filter(r => r.family === fam);
    if (!sub.length) continue;
    console.log('\n' + '='.repeat(104));
    console.log(`3. ${fam.toUpperCase()} CONTINUATION EXTENT — when price pushes THROUGH the line, how far does it go?`);
    console.log('='.repeat(104));

    // (a) threshold sweep — the answer as a curve, not one arbitrary cutoff
    console.log('\n (a) by "continued at least X" threshold, X in expected-day-ranges:');
    console.log('   thresh    hitRate      n    meanExt    medExt    p90Ext   medMins   meanAdverseFirst');
    for (const th of [0.05, 0.1, 0.15, 0.2, 0.3, 0.5]) {
      const hit = sub.filter(r => r.maxExt >= th);
      if (!hit.length) continue;
      const ext = hit.map(r => r.maxExt).sort((a, b) => a - b);
      const mins = hit.map(r => r.tMaxExt).filter(x => x != null).sort((a, b) => a - b);
      console.log(
        '   ' + th.toFixed(2).padStart(6) + (100 * hit.length / sub.length).toFixed(1).padStart(10) + '%' +
        String(hit.length).padStart(7) + f3(mean(ext)).padStart(11) + f3(quantile(ext, 0.5)).padStart(10) +
        f3(quantile(ext, 0.9)).padStart(10) + String(quantile(mins, 0.5) ?? '—').padStart(10) +
        f3(mean(hit.map(r => Math.abs(r.maxAdv)))).padStart(19));
    }

    // (b) by session — RUNWAY-CONTROLLED.
    // A raw session cut is badly confounded: a touch at 20:00 has ~2h of session
    // left and a touch at 12:00 has ~10h, so later touches post smaller extents
    // for a reason that has nothing to do with the session's character. Two
    // columns fix it. `extPerHr` divides the extent by the hours of session
    // actually remaining. `ext@120m` measures every touch over the SAME fixed
    // 120-minute window (MFE at the 120m horizon) and drops touches with less
    // than that left, so all rows are finally comparable like for like.
    const H120 = HORIZ_LABELS.indexOf('120m');
    console.log('\n (b) by session (threshold 0.10) — runway-controlled:');
    console.log('   session       n   hitRate   meanExt    medExt    p90Ext   medMins  medMinsLeft   extPerHr   ext@120m    n@120m');
    for (const ses of ['Asia', 'London', 'NY']) {
      const all = sub.filter(r => r.session === ses);
      if (!all.length) continue;
      const hit = all.filter(r => r.maxExt >= 0.1);
      const ext = hit.map(r => r.maxExt).sort((a, b) => a - b);
      const mins = hit.map(r => r.tMaxExt).filter(x => x != null).sort((a, b) => a - b);
      const left = all.map(r => r.minsLeft).sort((a, b) => a - b);
      const perHr = hit.map(r => (r.minsLeft > 30 ? r.maxExt / (r.minsLeft / 60) : null)).filter(x => x != null);
      const fixed = all.filter(r => r.minsLeft >= 120 && r.mfe[H120] != null).map(r => r.mfe[H120]);
      console.log('   ' + ses.padEnd(9) + String(all.length).padStart(6) +
        (100 * hit.length / all.length).toFixed(1).padStart(9) + '%' +
        f3(mean(ext)).padStart(10) + f3(quantile(ext, 0.5)).padStart(10) +
        f3(quantile(ext, 0.9)).padStart(10) + String(quantile(mins, 0.5) ?? '—').padStart(10) +
        String(quantile(left, 0.5)).padStart(13) + f3(mean(perHr)).padStart(11) +
        f3(mean(fixed)).padStart(11) + String(fixed.length).padStart(10));
    }

    // (c) by hour — where the continuation actually lives
    // (c) by hour — same control. `ext@120m` is the column to read across rows;
    // `meanExt` is kept alongside only to show how much of the raw hourly
    // gradient was runway rather than behaviour.
    console.log('\n (c) by UTC hour of the touch (threshold 0.10) — read ext@120m across rows, not meanExt:');
    console.log('   hour      n   hitRate   meanExt   medMins  medMinsLeft   extPerHr   ext@120m   adv@120m    n@120m');
    for (let h = 0; h < 24; h++) {
      const all = sub.filter(r => r.hourUtc === h);
      if (all.length < 30) continue;
      const hit = all.filter(r => r.maxExt >= 0.1);
      const ext = hit.map(r => r.maxExt).sort((a, b) => a - b);
      const mins = hit.map(r => r.tMaxExt).filter(x => x != null).sort((a, b) => a - b);
      const left = all.map(r => r.minsLeft).sort((a, b) => a - b);
      const perHr = hit.map(r => (r.minsLeft > 30 ? r.maxExt / (r.minsLeft / 60) : null)).filter(x => x != null);
      const win = all.filter(r => r.minsLeft >= 120 && r.mfe[H120] != null && r.mae[H120] != null);
      console.log('   ' + String(h).padStart(4) + String(all.length).padStart(7) +
        (100 * hit.length / all.length).toFixed(1).padStart(9) + '%' +
        f3(mean(ext)).padStart(10) + String(quantile(mins, 0.5) ?? '—').padStart(10) +
        String(quantile(left, 0.5)).padStart(13) + f3(mean(perHr)).padStart(11) +
        f3(mean(win.map(r => r.mfe[H120]))).padStart(11) +
        f3(mean(win.map(r => Math.abs(r.mae[H120])))).padStart(11) +
        String(win.length).padStart(10));
    }
  }
}

console.log('\nNOTE: hitRate and extent are NOT a strategy. They say how often and how far price runs past');
console.log('the line; a trade also has to survive the adverse excursion column and the spread. Pair them.');
