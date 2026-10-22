// Study 3 — intraday relative value (forge/RESIDUAL_INTRADAY_PREREG.md).
// Target vs partner on 5-minute bars: causal 20-day beta, today's cumulative residual, and a
// fade of |z| >= 2 held until the gap closes, 60 minutes, or the London day end.
//   node scripts/rangebook/residual_build.mjs gold|nq|gbpusd|nzdusd
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom } from './common.mjs';
import { USD_BASKET as BASKET, partnerLog, dayBuckets, dayModel } from './relval.mjs';

const PAIRS = { gold: { partner: BASKET }, nq: { partner: [['spx500', 1, 1]] }, gbpusd: { partner: [['eurusd', 1, 1]] }, nzdusd: { partner: [['audusd', 1, 1]] } };
const TARGET = (process.argv[2] ?? 'gold').toLowerCase();
const cfg = PAIRS[TARGET]; if (!cfg) throw new Error(`unknown target ${TARGET}`);
const ASSET = assetClassFor(TARGET), COST = costForPair(TARGET, ASSET);
const WSUM = cfg.partner.reduce((a, [, w]) => a + w, 0);
const PCOST = cfg.partner.reduce((a, [k, w]) => a + w / WSUM * costForPair(k, assetClassFor(k)), 0);
const OPTS = { sym: TARGET.toUpperCase(), assetClass: ASSET, tagFor: loadCalendarProxy()(TARGET.toUpperCase()) };
const LOOKBACK = 20, r4 = x => Math.round(x * 1e4) / 1e4;

// The decision for one day: returns { trade, z, beta, sd, entry } or null.
function dayTrade(d, bk, model) {
  const unit = d.sigmaFrac * d.open, lo = d.openSec + 7 * 3600, hi = d.openSec + 16 * 3600;
  let R = 0;
  for (let j = 1; j < bk.length; j++) {
    // residual through bucket j-1 (completed before bucket j starts)
    if (j >= 2) R += Math.log(bk[j - 1].close / bk[j - 2].close) - model.beta * (bk[j - 1].p - bk[j - 2].p);
    if (bk[j].t < lo || bk[j].t > hi || j < 2) continue;
    const z = R / (model.sd * Math.sqrt(j - 1));
    if (Math.abs(z) < 2) continue;
    const dir = z > 0 ? -1 : 1, entry = bk[j].open, pEntry = bk[j - 1].p;
    let Rm = R, exitIdx = null, exitPx = null, pExit = null;
    for (let m = j; m < bk.length; m++) {
      Rm += Math.log(bk[m].close / (m === j ? bk[j - 1].close : bk[m - 1].close)) - model.beta * (bk[m].p - bk[m - 1].p);
      const crossed = Math.sign(Rm) !== Math.sign(R);
      const timeUp = m + 1 < bk.length && bk[m + 1].t >= bk[j].t + 3600;
      if ((crossed || timeUp) && m + 1 < bk.length) { exitIdx = m + 1; exitPx = bk[m + 1].open; pExit = bk[m].p; break; }
    }
    if (exitIdx == null) { exitPx = bk.at(-1).close; pExit = bk.at(-1).p; }
    const tgt = dir * (exitPx - entry) / unit;
    const hedge = -dir * model.beta * (pExit - pEntry) * entry / unit;       // partner leg in target σ units
    const cT = COST / 100 * d.open / unit, cP = PCOST / 100 * d.open / unit * Math.abs(model.beta);
    return { z: r4(z), beta: r4(model.beta), sd: model.sd, entryT: bk[j].t, entry,
             ret: r4(tgt - cT), hedged: r4(tgt + hedge - cT - cP), mins: Math.round(((exitIdx != null ? bk[exitIdx].t : bk.at(-1).t) - bk[j].t) / 60) };
  }
  return null;
}

async function loadAll() {
  const target = await loadM1ForPair(TARGET);
  const partner = [];
  for (const [k, w, s] of cfg.partner) partner.push({ k, w, s, p: await loadM1ForPair(k) });
  return { target, partner };
}
function run(target, partner) {
  const ctx = buildContext(target, OPTS), plog = partnerLog(partner);
  const bks = ctx.days.map(d => dayBuckets(d, plog));
  const out = [];
  for (let di = LOOKBACK; di < ctx.days.length; di++) {
    const model = dayModel(bks.slice(di - LOOKBACK, di));
    if (!model || bks[di].length < 100) continue;
    const tr = dayTrade(ctx.days[di], bks[di], model);
    if (tr) out.push({ date: ctx.days[di].date, ...tr });
  }
  return out;
}

const { target, partner } = await loadAll();
const rows = run(target, partner);

// Self-check: beta, sd and z from data BEFORE the entry bucket; entry = the bucket's first open.
{
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 5) === 2).slice(0, 5);
  if (picks.length < 4) { console.error('self-check sampled too few'); process.exit(2); }
  const scr = (pk, t, seed) => { let i = 0; while (i < pk.n && pk.times[i] < t) i++; return scrambleFrom(pk, i, seed); };
  for (const r of picks) {
    for (const [cut, what] of [[r.entryT, 'model'], [r.entryT + 60, 'entry']]) {
      const t2 = scr(target, cut, 81), p2 = partner.map((x, i) => ({ ...x, p: scr(x.p, cut, 91 + i) }));
      const again = run(t2, p2).find(x => x.date === r.date);
      const a = what === 'model' ? JSON.stringify([r.z, r.beta, r.sd, r.entryT]) : String(r.entry);
      const b = again && (what === 'model' ? JSON.stringify([again.z, again.beta, again.sd, again.entryT]) : String(again.entry));
      if (a !== b) { console.error(`LOOK-AHEAD ${what} ${r.date}\n ${a}\n ${b}`); process.exit(2); }
    }
  }
  console.log(`[${TARGET}] self-check: ${picks.length * 2} model/entry checks identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${TARGET}_residual.json`, JSON.stringify({ target: TARGET, partner: cfg.partner.map(x => x[0]), rows }));
console.log(`[${TARGET}] ${rows.length} trade days ${rows[0]?.date} -> ${rows.at(-1)?.date}`);
