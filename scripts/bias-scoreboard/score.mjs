// bias-scoreboard judgement (forge/BIAS_SCOREBOARD_PREREG.md §3.5-3.9, §5, §6, §8). Seed 20261114.
//
//   node scripts/bias-scoreboard/score.mjs --dir <folder mirroring R2 forward/direction_ledger/sameday/> --look 60|120 [--write]
//   node scripts/bias-scoreboard/score.mjs --api <server base url> --look 60|120 [--write]
//   node scripts/bias-scoreboard/score.mjs --positive-control          (§3.9; also run by score.test.mjs)
//
// Reads the same-day issue records (<D>_base|desk|max.json) and outcomes (out/<D>_<target>.json) as written, never
// re-issues anything. --write puts RESULTS.md and results.json in analysis/output/bias-scoreboard/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMEDAY_CORE, SAMEDAY_EXTENDED, SAMEDAY_TARGETS, issueSameDay, outcomeSameDay, londonMs, addWeekdays, logScore } from '../../js/directionLedger.js';

export const SEED = 20261114, B = 2000, BLOCK = { d21: 5, n07: 5, d5: 10 };
export const SCORED = ['desk-rating', 'desk-ccy', 'max-signals', 'surprise-rule'];
export const RANKABLE = ['desk-rating', 'desk-ccy', 'surprise-rule'];
export const OBF = { 1: { z: 2.797, alpha: 0.0052 }, 2: { z: 1.977, alpha: 0.048 } };
export const PASS_BAR_PP = 0.06, UNRESOLVED_MAX = 0.10, COIN_PCT = 97.5;

export function rng(seed = SEED) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (i - lo) * ((s[lo + 1] ?? s[lo]) - s[lo]); };
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const clipP = p => Math.min(0.99, Math.max(0.01, p));

/** Joined rows: one per (forecast row with a score), carrying day, model, inst, target, speaks, side, shift, p_up, b0_p, y, R, conviction, event. */
export function joinRows(recs, outs) {
  const byId = new Map(recs.flatMap(r => r.forecasts.map(f => [f.id, f])));
  const rows = [], unresolved = [];
  for (const o of outs) {
    for (const [id, s] of Object.entries(o.scores)) {
      const f = byId.get(id); if (!f) continue;
      rows.push({ day: o.issue_date, model: f.model_id, inst: f.inst, target: f.target, speaks: f.speaks, side: f.side, shift: f.shift, p_up: f.p_up, b0_p: f.b0_p,
        y: s.y, R: s.R, conviction: f.conviction, event: f.event_key ?? o.issue_date, style: f.inputs?.style ?? null });
    }
    for (const id of Object.keys(o.unresolved || {})) { const f = byId.get(id); if (f) unresolved.push({ day: o.issue_date, model: f.model_id, inst: f.inst, target: f.target, speaks: f.speaks }); }
  }
  return { rows, unresolved };
}

const ld = r => logScore(r.p_up, r.y) - logScore(r.b0_p, r.y);
const hitEx = r => (r.side > 0 ? r.y : 1 - r.y) - (r.side > 0 ? r.b0_p : 1 - r.b0_p);   // hit minus B0-implied hit on that side

/** Moving-block bootstrap over the ordered shared days: the mean of fn(row) over rows of the drawn days. */
export function blockBoot(rows, days, fn, { block = 5, b = B, seed = SEED } = {}) {
  const byDay = new Map(days.map(d => [d, []]));
  for (const r of rows) byDay.get(r.day)?.push(fn(r));
  const vals = days.map(d => byDay.get(d)), R = rng(seed), out = [], nb = Math.ceil(days.length / block);
  for (let k = 0; k < b; k++) {
    let s = 0, n = 0;
    for (let j = 0; j < nb; j++) { const st = Math.floor(R() * Math.max(1, days.length - block + 1)); for (let i = st; i < Math.min(days.length, st + block); i++) for (const v of vals[i]) { s += v; n++; } }
    out.push(n ? s / n : 0);
  }
  return out;
}

/** The primary statistic and everything §8 needs for one forecaster on one cell. */
export function cellStats(rows, days, { block = 5, seed = SEED, coinB = B } = {}) {
  const sp = rows.filter(r => r.speaks);
  if (!sp.length) return { n: 0 };
  const est = mean(sp.map(ld)), boot = blockBoot(sp, days, ld, { block, seed }), se = sd(boot), z = se > 0 ? est / se : 0;
  const mirror = sp.map(r => ({ ...r, p_up: clipP(r.b0_p - r.side * r.shift), side: -r.side })), estM = mean(mirror.map(ld)), seM = sd(blockBoot(mirror, days, ld, { block, seed }));
  const hx = mean(sp.map(hitEx)), hxBoot = blockBoot(sp, days, hitEx, { block, seed: seed + 1 });
  const R = rng(seed + 2), coin = [];
  for (let k = 0; k < coinB; k++) coin.push(mean(sp.map(r => { const s = R() < 0.5 ? 1 : -1; return logScore(clipP(r.b0_p + s * r.shift), r.y) - logScore(r.b0_p, r.y); })));
  const coinPct = 100 * coin.filter(c => c < est).length / coin.length + 50 * coin.filter(c => c === est).length / coin.length;
  const withR = sp.filter(r => Number.isFinite(r.R));
  return { n: sp.length, events: new Set(sp.map(r => r.event)).size, days: new Set(sp.map(r => r.day)).size, logdiff: est, se, z, p: 2 * (1 - Phi(Math.abs(z))),
    mirror_logdiff: estM, mirror_z: seM > 0 ? estM / seM : 0, hit_rate: mean(sp.map(r => (r.side > 0 ? r.y : 1 - r.y))), hit_excess: hx,
    hit_excess_ci: [q(hxBoot, 0.025), q(hxBoot, 0.975)], hit_excess_upper95: q(hxBoot, 0.95), coin_pct: coinPct, mean_R: withR.length ? mean(withR.map(r => r.R)) : null };
}

/** Holm step-down on nominal alpha: returns pass flags in input order. */
export function holm(ps, alpha) {
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), pass = ps.map(() => false);
  for (let k = 0; k < idx.length; k++) { if (idx[k][0] <= alpha / (idx.length - k)) pass[idx[k][1]] = true; else break; }
  return pass;
}
export function bh(ps, qv = 0.10) {
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), m = ps.length, pass = ps.map(() => false);
  let kmax = -1; idx.forEach(([p], k) => { if (p <= ((k + 1) / m) * qv) kmax = k; });
  for (let k = 0; k <= kmax; k++) pass[idx[k][1]] = true;
  return pass;
}

/** Q5: drop the weakest 30/50/70% of speaking rows by conviction; kept mean R and hit vs random drops at the same rate. */
export function abstention(sp, { seed = SEED, b = B } = {}) {
  const R = rng(seed + 3), tie = sp.map(() => R()), withR = sp.map((r, i) => ({ ...r, tie: tie[i] })).filter(r => Number.isFinite(r.R));
  const ranked = [...withR].sort((a, b2) => (+a.conviction || 0) - (+b2.conviction || 0) || a.tie - b2.tie), out = {};
  for (const drop of [0.3, 0.5, 0.7]) {
    const k = Math.floor(ranked.length * drop), kept = ranked.slice(k);
    if (!kept.length) { out[drop] = null; continue; }
    const real = mean(kept.map(r => r.R)), realHit = mean(kept.map(r => (r.side > 0 ? r.y : 1 - r.y))), rnd = [];
    for (let j = 0; j < b; j++) { const s = [...withR].map(r => [R(), r]).sort((x, y) => x[0] - y[0]).slice(k).map(x => x[1]); rnd.push(mean(s.map(r => r.R))); }
    const pct = 100 * rnd.filter(x => x < real).length / rnd.length;
    out[drop] = { kept: kept.length, mean_R: real, hit_rate: realHit, random_p50: q(rnd, 0.5), random_p975: q(rnd, 0.975), pct, p: Math.max(1 / b, 1 - pct / 100),
      hit_excess_upper95: q(blockBoot(kept, [...new Set(kept.map(r => r.day))].sort(), hitEx, { seed: seed + 4 }), 0.95) };
  }
  return out;
}

/** The judgement at look 1 (60 shared days) or look 2 (120). */
export function judge(recs, outs, { look = 1, seed = SEED, coinB = B } = {}) {
  const nDays = look === 1 ? 60 : 120, bound = OBF[look];
  const shared = [...new Set(recs.filter(r => r.source === 'base').map(r => r.issue_date))]
    .filter(d => outs.some(o => o.issue_date === d && o.target === 'd21')).sort().slice(0, nDays);
  const daySet = new Set(shared), { rows, unresolved } = joinRows(recs.filter(r => daySet.has(r.issue_date)), outs.filter(o => daySet.has(o.issue_date)));
  const core = new Set(Object.keys(SAMEDAY_CORE)), primary = rows.filter(r => r.target === 'd21' && core.has(r.inst));
  const cells = SCORED.map(m => {
    const mr = primary.filter(r => r.model === m), st = cellStats(mr, shared, { block: BLOCK.d21, seed, coinB });
    const un = unresolved.filter(u => u.model === m && u.target === 'd21' && core.has(u.inst) && u.speaks).length;
    const halves = look === 2 && st.n ? [shared.slice(0, 60), shared.slice(60)].map(h => { const s = new Set(h), x = mr.filter(r => r.speaks && s.has(r.day)); return x.length ? mean(x.map(ld)) : null; }) : null;
    return { model_id: m, ...st, unresolved: un, unresolved_share: st.n + un ? un / (st.n + un) : 0, halves };
  });
  const holmPass = holm(cells.map(c => (c.n ? c.p : 1)), bound.alpha);
  for (const [i, c] of cells.entries()) {
    const sig = holmPass[i] && c.z > 0 && Math.abs(c.z) >= bound.z, harm = c.n > 0 && c.mirror_z >= bound.z && holm(cells.map(x => (x.n ? 2 * (1 - Phi(Math.abs(x.mirror_z))) : 1)), bound.alpha)[i];
    const tooUnresolved = c.unresolved_share > UNRESOLVED_MAX;
    let verdict;
    if (!c.n || tooUnresolved) verdict = look === 2 ? 'UNDERPOWERED' : 'interim';
    else if (sig && c.coin_pct >= COIN_PCT && (look === 1 || (c.halves?.every(h => h > 0)))) verdict = 'VALIDATED';
    else if (harm) verdict = 'NULL';
    else if (look === 2 && c.hit_excess_upper95 < PASS_BAR_PP) verdict = 'NULL';
    else verdict = look === 2 ? 'UNDERPOWERED' : 'interim';
    Object.assign(c, { holm_pass: holmPass[i], boundary_z: bound.z, harm, verdict });
  }
  // descriptive: per instrument, n07 / d5, extended instruments, by style -- BH q = 0.10
  const desc = [];
  for (const m of [...SCORED, 'B0']) for (const t of SAMEDAY_TARGETS) for (const inst of [...Object.keys(SAMEDAY_CORE), ...Object.keys(SAMEDAY_EXTENDED)]) {
    if (t === 'd21' && core.has(inst) && false) continue;
    const x = rows.filter(r => r.model === m && r.target === t && r.inst === inst);
    if (!x.some(r => r.speaks)) continue;
    const s = cellStats(x, shared, { block: BLOCK[t], seed, coinB: 200 });
    desc.push({ model_id: m, target: t, inst, n: s.n, logdiff: s.logdiff, z: s.z, p: s.p, hit_rate: s.hit_rate, mean_R: s.mean_R });
  }
  bh(desc.map(d => d.p)).forEach((p, i) => { desc[i].bh_pass = p; });
  const q5 = look === 2 ? RANKABLE.map(m => ({ model_id: m, curve: abstention(primary.filter(r => r.model === m && r.speaks), { seed }) })) : null;
  if (q5) {
    const pass = holm(q5.map(x => x.curve[0.5]?.p ?? 1), 0.05);
    q5.forEach((x, i) => { const c = x.curve[0.5]; x.verdict = !c ? 'UNDERPOWERED' : pass[i] && c.pct >= COIN_PCT ? 'VALIDATED' : c.hit_excess_upper95 < PASS_BAR_PP ? 'NULL' : 'UNDERPOWERED'; });
  }
  const coverage = Object.fromEntries(SCORED.map(m => { const all = primary.filter(r => r.model === 'B0').length; return [m, all ? primary.filter(r => r.model === m && r.speaks).length / all : null]; }));
  return { prereg: 'forge/BIAS_SCOREBOARD_PREREG.md', seed, look, shared_days: shared.length, first_day: shared[0] ?? null, last_day: shared.at(-1) ?? null,
    complete: shared.length >= nDays, coverage, cells, descriptive: desc, q5 };
}

// ── §3.9 positive control: synthetic paths through the real issue / outcome / judge code ─────────────────────────
export async function positiveControl({ days = 120, hit = 0.65, coverage = 0.5, seed = SEED, coinB = 400 } = {}) {
  const R = rng(seed + 9), insts = Object.keys(SAMEDAY_CORE), base = { version: 'pc', instruments: Object.fromEntries(insts.map(i => [i, Object.fromEntries(SAMEDAY_TARGETS.map(t => [t, { p0: 0.5 }]))])) };
  const recs = [], outs = [];
  let d = '2027-01-04';
  for (let k = 0; k < days; k++, d = addWeekdays(d, 1)) {
    const y = Object.fromEntries(insts.map(i => [i, R() < 0.5 ? 1 : 0]));
    const planted = insts.map(inst => { const speaks = R() < coverage, right = R() < hit, side = (y[inst] ? 1 : -1) * (right ? 1 : -1);
      return { model_id: 'desk-rating', model_version: 'pc', inst, speaks, side: speaks ? side : 0, shift: 0.05, knowable_ms: londonMs(d, 7), conviction: R() }; });
    const coin = insts.map(inst => { const speaks = R() < coverage; return { model_id: 'desk-ccy', model_version: 'pc', inst, speaks, side: speaks ? (R() < 0.5 ? 1 : -1) : 0, shift: 0.05, knowable_ms: londonMs(d, 7), conviction: R() }; });
    const rec = issueSameDay({ date: d, source: 'base', views: [...planted, ...coin], baselines: base, sigma: Object.fromEntries(insts.map(i => [i, 0.01])), issuedAt: 'pc', withB0: true, insts });
    recs.push(rec);
    const day = d, mid = async (inst, ms) => (ms >= londonMs(day, 21) ? (y[inst] ? 1.001 : 0.999) : 1);
    outs.push(await outcomeSameDay([rec], 'd21', mid, { now: Infinity, resolvedAt: 'pc' }));
  }
  const { rows } = joinRows(recs, outs), shared = [...new Set(rows.map(r => r.day))].sort();
  const p = cellStats(rows.filter(r => r.model === 'desk-rating'), shared, { seed, coinB });
  const b0 = rows.filter(r => r.model === 'B0').map(r => logScore(r.p_up, r.y) - logScore(r.b0_p, r.y));
  const realHit = mean(rows.filter(r => r.model === 'desk-rating' && r.speaks).map(r => (r.side > 0 ? r.y : 1 - r.y)));
  return { planted: { ...p, hit_target: hit, realised_hit: realHit, ci_contains_target: p.hit_excess_ci[0] <= hit - 0.5 && hit - 0.5 <= p.hit_excess_ci[1] },
    b0_self_logdiff_max_abs: Math.max(...b0.map(Math.abs)), coin_forecaster_pct: cellStats(rows.filter(r => r.model === 'desk-ccy'), shared, { seed, coinB }).coin_pct };
}

/** Coin-control calibration: percentiles of random-sign forecasters must be uniform (KS p > 0.05 over `reps`). */
export async function coinUniformity({ reps = 200, seed = SEED } = {}) {
  const pcts = [];
  for (let k = 0; k < reps; k++) pcts.push((await positiveControl({ days: 30, seed: seed + 100 + k, coinB: 200 })).coin_forecaster_pct / 100);
  const s = pcts.sort((a, b) => a - b), n = s.length;
  const D = Math.max(...s.map((x, i) => Math.max((i + 1) / n - x, x - i / n))), lam = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D;
  let p = 0; for (let j = 1; j <= 100; j++) p += 2 * (-1) ** (j - 1) * Math.exp(-2 * j * j * lam * lam);
  return { reps, ks_D: D, ks_p: Math.min(1, Math.max(0, p)) };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function readDir(dir) {
  const recs = [], outs = [];
  for (const f of fs.readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}_(base|desk|max)\.json$/.test(f)) recs.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const od = path.join(dir, 'out');
  if (fs.existsSync(od)) for (const f of fs.readdirSync(od)) if (/^\d{4}-\d{2}-\d{2}_(d21|n07|d5)\.json$/.test(f)) outs.push(JSON.parse(fs.readFileSync(path.join(od, f), 'utf8')));
  return { recs, outs };
}
function markdown(J) {
  const f = x => (x == null || !Number.isFinite(x) ? '—' : (+x).toFixed(4));
  const lines = [`# bias-scoreboard — look ${J.look} (${J.shared_days} shared days, ${J.first_day} → ${J.last_day})`, '',
    `Prereg: \`${J.prereg}\`. Seed ${J.seed}. ${J.complete ? '' : '**Incomplete: fewer shared days than the look requires; nothing is judged.**'}`, '',
    '| forecaster | n | events | coverage | log diff vs B0 | z | boundary | Holm | coin pct | hit | hit excess [95%] | mean R | unresolved | verdict |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const c of J.cells) lines.push(`| ${c.model_id} | ${c.n} | ${c.events ?? '—'} | ${f(J.coverage[c.model_id])} | ${f(c.logdiff)} | ${f(c.z)} | ${c.boundary_z} | ${c.holm_pass ? 'pass' : '—'} | ${f(c.coin_pct)} | ${f(c.hit_rate)} | ${f(c.hit_excess)} [${f(c.hit_excess_ci?.[0])}, ${f(c.hit_excess_ci?.[1])}] | ${f(c.mean_R)} | ${c.unresolved} | ${J.complete ? c.verdict : 'not judged'} |`);
  if (J.q5) { lines.push('', '## Q5 abstention (drop the weakest 50%)', '', '| forecaster | kept | mean R | random p97.5 | pct | verdict |', '|---|---|---|---|---|---|');
    for (const x of J.q5) { const c = x.curve[0.5]; lines.push(`| ${x.model_id} | ${c?.kept ?? 0} | ${f(c?.mean_R)} | ${f(c?.random_p975)} | ${f(c?.pct)} | ${x.verdict} |`); } }
  lines.push('', `Descriptive cells: ${J.descriptive.length}; BH q = 0.10 survivors (candidates only): ${J.descriptive.filter(d => d.bh_pass).map(d => `${d.model_id}/${d.target}/${d.inst}`).join(', ') || 'none'}.`);
  return lines.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (process.argv.includes('--positive-control')) {
    console.log(JSON.stringify({ ...(await positiveControl()), ...(await coinUniformity()) }, null, 1));
  } else {
    let data;
    if (arg('--dir')) data = readDir(arg('--dir'));
    else if (arg('--api')) { const r = await fetch(`${arg('--api').replace(/\/$/, '')}/api/direction-ledger?sameday=1&dump=1`); const j = await r.json(); data = { recs: j.records, outs: j.outcomes }; }
    else { console.error('need --dir, --api or --positive-control'); process.exit(2); }
    const J = judge(data.recs, data.outs, { look: arg('--look') === '120' ? 2 : 1 });
    if (process.argv.includes('--write')) {
      const od = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../analysis/output/bias-scoreboard');
      fs.mkdirSync(od, { recursive: true });
      fs.writeFileSync(path.join(od, 'results.json'), JSON.stringify(J, null, 1));
      fs.writeFileSync(path.join(od, 'RESULTS.md'), markdown(J));
      console.log('wrote', od);
    } else process.stdout.write(markdown(J));
  }
}
