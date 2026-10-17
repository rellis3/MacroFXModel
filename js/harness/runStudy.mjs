/**
 * runStudy — the one entry point every study calls (forge/HARNESS_REGISTRY_PREREG.md, Part A).
 *
 * A study supplies WHAT it believes: a universe, a horizon, a rebalance rule, a signal that
 * reads features through the point-in-time store, a sample split and the list of every
 * cell it will report. The harness supplies HOW it is scored, and the study cannot change
 * that: position scaling, costs, carry, the bootstrap, clustering, walk-forward, FDR,
 * deflation, PBO and the shape of the output. A study that bypasses this file is not
 * eligible for deskEvidence.js.
 *
 * TIME. A decision at date D is taken at D 22:00Z — one hour after the OANDA daily close,
 * which is exactly the asof the store stamps on that day's close. The signal sees every
 * feature knowable by then and nothing else; the position is held from close D to the
 * next decision. Forward returns for the IC are log(close[D+h] / close[D]).
 *
 * FIXED RULES (the table in the prereg):
 *   scaling     10% annualised vol target per instrument, 60-day EWMA of daily returns
 *               (fxFactorSignals.ewmaVolSeries), leverage capped at 3×
 *   costs       round-trip spread from the measured spread profile at the study's entry
 *               hour (default 22 UTC — the first hour a close-based signal can be filled);
 *               half a spread per unit of turnover; indices are unmeasured and charged the
 *               worst store-priced FX pair at that hour (see costs.mjs)
 *   carry       accrued daily from the 3-month rate legs in the store (rate3m_<ccy>) for a
 *               six-letter FX pair; gold and indices carry nothing (stated, not hidden)
 *   bootstrap   moving-block bootstrap of DATE CLUSTERS (stats.clusteredBlockBootstrap),
 *               block = 5 trading days × ceil(h/5) expressed in decision steps, 1,000
 *               draws, seeded; the brick's row-block p is reported beside it for comparison
 *   dependence  pooled rows are clustered by date before resampling; PCA share of the first
 *               factor across the universe is reported as the effective-N haircut
 *   walk-forward  only if the study has fitted parameters (`fit` hook): expanding window,
 *               minimum 2 years, refit at each calendar year; otherwise stated as n/a
 *   cells       BH-FDR at 10% across every cell the study reports, on its primary p
 *   Sharpe-type deflated Sharpe with N = cells + 1; PBO by CSCV (16 splits) when `tuned`
 *   output      one object → analysis/output/harness/<id>.json, plus toEvidence() for the
 *               ledger entry and POWER row — written by code, not transcribed by hand
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './features.mjs';
import { ewmaVolSeries } from '../fxFactorSignals.js';
import { spearman, blockBootstrapIC, mean, stdev } from '../statsCore.js';
import { clusteredBlockBootstrap, clusterBy, bhFdr, deflatedSharpe, pbo, pcaShare, sharpeAnn, skewKurt, profitFactor, maxDrawdown } from './stats.mjs';
import { CostModel } from './costs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUTPUT_DIR = path.join(ROOT, 'analysis', 'output', 'harness');

export const FIXED = Object.freeze({
  volTarget: 0.10, volSpan: 60, maxLeverage: 3,
  entryHourUtc: 22, closeAsofHour: '22:00:00Z',
  nBoot: 1000, seed: 0x9e3779b9, fdrQ: 0.10, pboSplits: 16, minIsYears: 2,
  warmupDays: 400,          // extra history loaded before `sample.from` so vol and lookbacks are warm
});

const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const yearOf = d => Number(String(d).slice(0, 4));
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const isoWeek = d => { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const w1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-${1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)}`; };

/** The view of the store a signal gets: everything is cut at `t`. */
function featuresAt(store, t) {
  return {
    t,
    at: id => store.at(id, t),
    series: (id, opts = {}) => store.series(id, { ...opts, asofBefore: t }),
    events: (id, opts = {}) => store.events(id, { ...opts, to: t }),
    profile: id => store.profile(id),
    has: id => store.byId.has(id) && store.byId.get(id).status !== 'gap',
  };
}

function validateSpec(s) {
  const need = ['id', 'universe', 'horizonDays', 'signal', 'sample'];
  for (const k of need) if (s[k] == null) throw new Error(`runStudy: spec.${k} is required`);
  if (!Array.isArray(s.universe) || !s.universe.length) throw new Error('runStudy: universe must be a non-empty array of instrument keys (eurusd, xauusd, nas100 …)');
  if (!(s.horizonDays >= 1)) throw new Error('runStudy: horizonDays must be >= 1');
  if (!(s.rebalanceDays >= 1) && s.rebalance !== 'weekly') throw new Error('runStudy: rebalanceDays (>=1) or rebalance:"weekly" is required');
  for (const k of ['from', 'to', 'isEnd']) if (!/^\d{4}-\d{2}-\d{2}$/.test(s.sample[k] ?? '')) throw new Error(`runStudy: sample.${k} must be YYYY-MM-DD`);
  if (!(s.sample.from < s.sample.isEnd && s.sample.isEnd <= s.sample.to)) throw new Error('runStudy: need sample.from < isEnd <= to');
  if (s.primary && !['ic', 'pnl'].includes(s.primary)) throw new Error('runStudy: primary must be "ic" or "pnl"');
  if (typeof s.signal !== 'function') throw new Error('runStudy: signal must be a function (featuresAt, t, inst, cell) => number | {pos, score} | null');
}

/** Decision dates for one instrument's trading calendar. */
function decisionMask(dates, spec) {
  const from = spec.sample.from, to = spec.sample.to;
  const mask = new Array(dates.length).fill(false);
  if (spec.rebalance === 'weekly') {
    // last trading day of each ISO week — a Friday normally, Thursday when Friday is a holiday
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] < from || dates[i] > to) continue;
      mask[i] = i + 1 >= dates.length || isoWeek(dates[i + 1]) !== isoWeek(dates[i]);
    }
    return mask;
  }
  let k = 0;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] < from || dates[i] > to) continue;
    if (k % spec.rebalanceDays === 0) mask[i] = true;
    k++;
  }
  return mask;
}

/** Trade episodes from a position path — PF and win rate need trades, not days. */
function episodes(pos, netRet) {
  const out = [];
  let cur = null;
  for (let i = 1; i < pos.length; i++) {
    const prev = pos[i - 1], now = pos[i];
    if (cur) cur.ret += netRet[i];
    const opened = prev === 0 && now !== 0, closed = prev !== 0 && now === 0, flipped = prev !== 0 && now !== 0 && Math.sign(prev) !== Math.sign(now);
    if (cur && (closed || flipped)) { cur.exitIdx = i; out.push(cur); cur = null; }
    if (opened || flipped) cur = { entryIdx: i, dir: Math.sign(now), ret: 0 };
  }
  if (cur) { cur.exitIdx = pos.length - 1; cur.open = true; out.push(cur); }
  return out;
}

/**
 * Run one study. Returns the result object and (unless write:false) saves it.
 *
 * spec = {
 *   id, universe, horizonDays, rebalanceDays | rebalance:'weekly',
 *   signal(featuresAt, t, inst, cell) → number in [-1,1] | { pos, score } | null,
 *   sample: { from, to, isEnd }, cells: [{ key, ...params }], tuned: bool,
 *   primary: 'ic' | 'pnl', entryHourUtc, fit(featuresAt, window) → params (optional),
 *   doc, claim, domain, instrumentsLabel
 * }
 */
export async function runStudy(spec, { store = null, write = true, log = () => {} } = {}) {
  validateSpec(spec);
  store = store ?? await openStore();
  const cells = (spec.cells && spec.cells.length ? spec.cells : [{ key: 'base' }]).map((c, i) => ({ key: c.key ?? `cell${i + 1}`, ...c }));
  const primary = spec.primary ?? 'ic';
  const h = spec.horizonDays;
  const meanBlockDays = 5 * Math.ceil(h / 5);
  const stepDays = spec.rebalance === 'weekly' ? 5 : spec.rebalanceDays;
  const meanBlockSteps = Math.max(1, Math.ceil(meanBlockDays / stepDays));
  const notes = [];

  // ── prices, returns, vol, carry legs ──
  const px = {};
  for (const inst of spec.universe) {
    const id = `px_d1_${inst}`;
    const rows = await store.series(id, { from: addDays(spec.sample.from, -FIXED.warmupDays), to: spec.sample.to });
    if (rows.length < 260) throw new Error(`runStudy: ${id} has ${rows.length} rows in window — too few`);
    const dates = rows.map(r => String(r.date)), closes = rows.map(r => Number(r.value));
    const rets = closes.map((c, i) => (i ? c / closes[i - 1] - 1 : NaN));
    const vol = ewmaVolSeries(rets, FIXED.volSpan);
    const legs = /^[a-z]{6}$/.test(inst) ? { base: inst.slice(0, 3), quote: inst.slice(3, 6) } : null;
    const carryIds = legs ? [`rate3m_${legs.base}`, `rate3m_${legs.quote}`].map(k => (store.byId.has(k) && store.byId.get(k).status !== 'gap' ? k : null)) : [null, null];
    if (legs && carryIds.some(x => !x)) notes.push(`${inst}: carry leg missing (${carryIds.join(',')}) — carry set to 0`);
    if (!legs) notes.push(`${inst}: no rate legs (not a six-letter FX pair) — carry 0`);
    px[inst] = { dates, closes, rets, vol, legs, carryIds, mask: decisionMask(dates, spec) };
  }
  const costs = await CostModel.open(store, { entryHourUtc: spec.entryHourUtc ?? FIXED.entryHourUtc, universe: spec.universe, px });
  notes.push(...costs.notes);

  // ── walk-forward fits (only when the study fits anything) ──
  const fits = {};
  let walkForward = { applied: false, reason: 'no fitted parameters (spec.fit absent)' };
  if (typeof spec.fit === 'function') {
    const y0 = yearOf(spec.sample.from) + FIXED.minIsYears, y1 = yearOf(spec.sample.to);
    for (let y = y0; y <= y1; y++) {
      const t = `${y}-01-01T00:00:00Z`;
      fits[y] = await spec.fit(featuresAt(store, t), { from: spec.sample.from, to: `${y - 1}-12-31` });
    }
    walkForward = { applied: true, firstYear: y0, lastYear: y1, note: 'expanding window, refit each 1 Jan, decisions before the first fit year take no position' };
  }

  // ── run every cell ──
  const cellResults = [];
  const cellDailyPortfolio = [];   // for PBO: aligned portfolio daily returns per cell
  const allDates = [...new Set(Object.values(px).flatMap(p => p.dates))].sort().filter(d => d >= spec.sample.from && d <= spec.sample.to);
  const dateIdx = new Map(allDates.map((d, i) => [d, i]));

  for (const cell of cells) {
    log(`cell ${cell.key}`);
    const icRows = [];
    const legStats = {};
    const portGross = new Array(allDates.length).fill(0), portNet = new Array(allDates.length).fill(0), portN = new Array(allDates.length).fill(0);
    let costSum = 0, carrySum = 0, turnoverSum = 0, nDecisions = 0, nNull = 0;

    for (const inst of spec.universe) {
      const P = px[inst];
      const n = P.dates.length;
      const pos = new Array(n).fill(0), net = new Array(n).fill(0), gross = new Array(n).fill(0);
      let target = 0;
      for (let i = 0; i < n; i++) {
        const d = P.dates[i];
        // P&L for today from yesterday's position
        if (i > 0 && d >= spec.sample.from) {
          const r = P.rets[i];
          const g = Number.isFinite(r) ? pos[i - 1] * r : 0;
          let carry = 0;
          if (pos[i - 1] !== 0 && P.carryIds[0] && P.carryIds[1]) {
            const t = `${P.dates[i - 1]}T${FIXED.closeAsofHour}`;
            const [rb, rq] = await Promise.all([store.at(P.carryIds[0], t), store.at(P.carryIds[1], t)]);
            if (rb && rq) { const gap = (Date.parse(d) - Date.parse(P.dates[i - 1])) / 86400000; carry = pos[i - 1] * ((Number(rb.value) - Number(rq.value)) / 100) * (gap / 365); }
          }
          gross[i] = g + carry;
          carrySum += carry;
        }
        // decision at today's close
        pos[i] = target;
        if (P.mask[i]) {
          const t = `${d}T${FIXED.closeAsofHour}`;
          const params = walkForward.applied ? fits[yearOf(d)] : null;
          if (walkForward.applied && !params) { target = 0; pos[i] = 0; continue; }
          const out = await spec.signal(featuresAt(store, t), t, inst, params ? { ...cell, ...params } : cell);
          nDecisions++;
          let p = null, score = null;
          if (out == null) nNull++;
          else if (typeof out === 'number') { p = Number.isFinite(out) ? clip(out, -1, 1) : null; score = Number.isFinite(out) ? out : null; }
          else { p = Number.isFinite(out.pos) ? clip(out.pos, -1, 1) : null; score = Number.isFinite(out.score) ? out.score : (Number.isFinite(out.pos) ? out.pos : null); }
          const v = P.vol[i];
          target = (p == null || !(v > 0)) ? 0 : clip(p * FIXED.volTarget / v, -FIXED.maxLeverage, FIXED.maxLeverage);
          pos[i] = target;
          if (score != null && i + h < n) icRows.push({ date: d, inst, x: score, y: Math.log(P.closes[i + h] / P.closes[i]), oos: d >= spec.sample.isEnd });
        }
        // cost on the change of position taken today
        if (i > 0 && d >= spec.sample.from) {
          const dPos = Math.abs(pos[i] - pos[i - 1]);
          const c = dPos * 0.5 * costs.fraction(inst, d, P.closes[i]);
          costSum += c; turnoverSum += dPos;
          net[i] = gross[i] - c;
        }
        const k = dateIdx.get(d);
        if (k != null) { portGross[k] += gross[i]; portNet[k] += net[i]; portN[k]++; }
      }
      const eps = episodes(pos, net).filter(e => P.dates[e.entryIdx] >= spec.sample.from);
      const oosEps = eps.filter(e => P.dates[e.entryIdx] >= spec.sample.isEnd);
      const oosIdx = P.dates.map((d, i) => (d >= spec.sample.isEnd ? i : -1)).filter(i => i >= 0);
      legStats[inst] = {
        trades: eps.length, tradesOos: oosEps.length,
        winOos: oosEps.length ? +(oosEps.filter(e => e.ret > 0).length / oosEps.length).toFixed(3) : null,
        pfOos: oosEps.length ? +profitFactor(oosEps.map(e => e.ret)).toFixed(3) : null,
        sharpeOos: +sharpeAnn(oosIdx.map(i => net[i])).sr.toFixed(3),
        meanTradeOosPct: oosEps.length ? +(mean(oosEps.map(e => e.ret)) * 100).toFixed(4) : null,
        icOos: (() => { const r = icRows.filter(r => r.inst === inst && r.oos); return r.length >= 30 ? +spearman(r.map(r => r.x), r.map(r => r.y)).toFixed(4) : null; })(),
      };
      legStats[inst]._episodes = eps.map(e => ({ entry: P.dates[e.entryIdx], exit: P.dates[e.exitIdx], dir: e.dir, ret: e.ret }));
    }

    // equal-weight portfolio of vol-targeted legs
    const port = allDates.map((d, k) => (portN[k] ? portNet[k] / portN[k] : 0));
    const portG = allDates.map((d, k) => (portN[k] ? portGross[k] / portN[k] : 0));
    const oosK = allDates.map((d, k) => (d >= spec.sample.isEnd ? k : -1)).filter(k => k >= 0);
    const isK = allDates.map((d, k) => (d < spec.sample.isEnd ? k : -1)).filter(k => k >= 0);
    cellDailyPortfolio.push(port);

    // IC: pooled OOS, date-clustered block bootstrap; the brick on rows for comparison
    const oosRows = icRows.filter(r => r.oos).sort((a, b) => a.date.localeCompare(b.date));
    const icStat = rows => spearman(rows.map(r => r.x), rows.map(r => r.y));
    const icBoot = oosRows.length ? clusteredBlockBootstrap(clusterBy(oosRows, r => r.date), icStat, { meanBlock: meanBlockSteps, nBoot: FIXED.nBoot, seed: FIXED.seed }) : { ok: false, error: 'no IC rows' };
    const brick = oosRows.length ? blockBootstrapIC(oosRows.map(r => r.x), oosRows.map(r => r.y), { meanBlock: meanBlockDays, nBoot: FIXED.nBoot, seed: FIXED.seed }) : { ok: false };
    const isRows = icRows.filter(r => !r.oos);
    const oosDates = [...new Set(oosRows.map(r => r.date))].sort();
    const mid = oosDates[Math.floor(oosDates.length / 2)];
    const half = rows => (rows.length >= 30 ? +icStat(rows).toFixed(4) : null);
    const ic = {
      oos: icBoot, brickRowBlocks: brick.ok ? { ic: brick.ic, pValue: brick.pValue, meanBlockRows: brick.meanBlock } : null,
      is: isRows.length >= 30 ? +icStat(isRows).toFixed(4) : null,
      oosHalves: { firstHalf: half(oosRows.filter(r => r.date < mid)), secondHalf: half(oosRows.filter(r => r.date >= mid)), splitAt: mid ?? null },
      nRowsOos: oosRows.length, nDatesOos: oosDates.length,
    };

    // P&L: OOS net, date-block bootstrap of the daily mean
    const pnlOos = oosK.map(k => port[k]);
    const pnlBoot = clusteredBlockBootstrap(pnlOos.map(v => [v]), rows => mean(rows), { meanBlock: meanBlockDays, nBoot: FIXED.nBoot, seed: FIXED.seed, minClusters: 60 });
    const shOos = sharpeAnn(pnlOos), shIs = sharpeAnn(isK.map(k => port[k])), shAll = sharpeAnn(port);
    const shGrossOos = sharpeAnn(oosK.map(k => portG[k]));
    const mom = skewKurt(pnlOos);
    const allEps = Object.values(legStats).flatMap(s => s._episodes.filter(e => e.entry >= spec.sample.isEnd));
    const perYear = {};
    for (const k of oosK) { const y = yearOf(allDates[k]); perYear[y] = +(((perYear[y] ?? 0) + port[k] * 100)).toFixed(3); }
    const pnl = {
      sharpeOos: +shOos.sr.toFixed(3), sharpeIs: +shIs.sr.toFixed(3), sharpeAll: +shAll.sr.toFixed(3), sharpeGrossOos: +shGrossOos.sr.toFixed(3),
      meanDailyOos: pnlBoot.ok ? pnlBoot.obs : null, meanDailyOosCi95: pnlBoot.ok ? pnlBoot.ci95 : null, pValueOos: pnlBoot.ok ? pnlBoot.pValue : null,
      tradesOos: allEps.length, winOos: allEps.length ? +(allEps.filter(e => e.ret > 0).length / allEps.length).toFixed(3) : null,
      pfOos: allEps.length ? +profitFactor(allEps.map(e => e.ret)).toFixed(3) : null,
      meanTradeOosPct: allEps.length ? +(mean(allEps.map(e => e.ret)) * 100).toFixed(4) : null,
      maxDrawdownOosPct: +(maxDrawdown(pnlOos) * 100).toFixed(2),
      perYearOosPct: perYear, yearsPositiveOos: `${Object.values(perYear).filter(v => v > 0).length}/${Object.keys(perYear).length}`,
      costDragAnnBp: +((costSum / Math.max(1, allDates.length)) * 252 * 1e4 / spec.universe.length).toFixed(2),
      carryAnnBp: +((carrySum / Math.max(1, allDates.length)) * 252 * 1e4 / spec.universe.length).toFixed(2),
      turnoverPerYear: +((turnoverSum / Math.max(1, allDates.length)) * 252 / spec.universe.length).toFixed(2),
      skewOos: +mom.skew.toFixed(3), kurtOos: +mom.kurt.toFixed(3), nDaysOos: pnlOos.length,
      decisions: nDecisions, nullSignals: nNull,
    };
    for (const s of Object.values(legStats)) delete s._episodes;
    cellResults.push({ key: cell.key, params: Object.fromEntries(Object.entries(cell).filter(([k]) => k !== 'key')), ic, pnl, legs: legStats, _port: port });
  }

  // ── across cells: BH-FDR on the primary p, DSR with N = cells + 1, PBO if tuned ──
  const pPrimary = cellResults.map(c => (primary === 'ic' ? c.ic.oos?.pValue : c.pnl.pValueOos) ?? NaN);
  const fdr = bhFdr(pPrimary, FIXED.fdrQ);
  const srPeriods = cellResults.map(c => sharpeAnn(c._port.filter((_, k) => allDates[k] >= spec.sample.isEnd)).srPeriod);
  const varTrial = srPeriods.length >= 2 ? Math.pow(stdev(srPeriods.filter(Number.isFinite), 1), 2) : undefined;
  cellResults.forEach((c, i) => {
    c.primary = { kind: primary, pValue: pPrimary[i], passesFdr: fdr.pass[i] };
    c.dsr = deflatedSharpe({ srPeriod: srPeriods[i], n: c.pnl.nDaysOos, skew: c.pnl.skewOos, kurt: c.pnl.kurtOos, nTrials: cells.length + 1, varTrialSr: varTrial });
  });
  let pboRes = { ok: false, reason: spec.tuned ? 'fewer than 2 cells' : 'study declares no tuned parameter' };
  if (spec.tuned && cellResults.length >= 2) {
    const T = allDates.length;
    const M = []; for (let t = 0; t < T; t++) M.push(cellResults.map(c => c._port[t]));
    pboRes = pbo(M, { splits: FIXED.pboSplits, seed: FIXED.seed });
  }
  for (const c of cellResults) delete c._port;

  // ── dependence across the universe ──
  const retsByInst = {};
  for (const inst of spec.universe) { const m = new Map(px[inst].dates.map((d, i) => [d, px[inst].rets[i]])); retsByInst[inst] = allDates.map(d => m.get(d) ?? NaN); }
  const dep = spec.universe.length >= 2 ? pcaShare(retsByInst) : { ok: false, error: 'single instrument' };

  const result = {
    id: spec.id, ranAt: new Date().toISOString(), doc: spec.doc ?? null, claim: spec.claim ?? null, domain: spec.domain ?? null,
    spec: { universe: spec.universe, horizonDays: h, rebalance: spec.rebalance === 'weekly' ? 'weekly (last trading day)' : `${spec.rebalanceDays}d`, sample: spec.sample, primary, tuned: !!spec.tuned, cells: cells.map(c => c.key), entryHourUtc: spec.entryHourUtc ?? FIXED.entryHourUtc },
    fixed: { ...FIXED, meanBlockDays, meanBlockSteps },
    costs: costs.summary(),
    walkForward,
    dependence: dep,
    fdr: { q: fdr.q, m: fdr.m, rejected: fdr.k, threshold: fdr.threshold },
    pbo: pboRes,
    cells: cellResults,
    notes,
  };
  if (write) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(path.join(OUTPUT_DIR, `${spec.id}.json`), JSON.stringify(result, null, 1));
  }
  return result;
}

/**
 * The ledger entry and POWER row for a result — the harness writes the words the ledger
 * carries, so numbers are not transcribed by hand. `verdict`, `claim` and `use` come from
 * the study (verdict decided against ITS registered bar; the harness does not know the
 * bar). The result text is built from the primary cell.
 */
export function toEvidence(result, { verdict, claim, use, domain, doc, date = result.ranAt.slice(0, 10), instruments, primaryCell = null }) {
  const c = result.cells.find(x => x.key === primaryCell) ?? result.cells[0];
  const n = result.spec.primary === 'ic'
    ? `${c.ic.nRowsOos.toLocaleString()} OOS rows (${c.ic.nDatesOos} dates), ${result.spec.universe.length} instruments`
    : `${c.pnl.tradesOos} OOS trades, ${c.pnl.nDaysOos} days, ${result.spec.universe.length} instruments`;
  const icTxt = c.ic.oos?.ok ? `pooled OOS rank-IC ${c.ic.oos.obs} [${c.ic.oos.ci95.join(', ')}], p=${c.ic.oos.pValue} (date-clustered weekly blocks)` : 'IC not computable';
  const pnlTxt = `OOS net Sharpe ${c.pnl.sharpeOos} (gross ${c.pnl.sharpeGrossOos}), PF ${c.pnl.pfOos}, win ${c.pnl.winOos != null ? Math.round(c.pnl.winOos * 100) + '%' : 'n/a'}, years positive ${c.pnl.yearsPositiveOos}, mean daily p=${c.pnl.pValueOos}`;
  const defl = `DSR ${c.dsr.dsr} (N=${result.spec.cells.length + 1})${result.pbo.ok ? `, PBO ${result.pbo.pbo}` : ''}; BH-FDR 10% across ${result.fdr.m} cells: ${result.fdr.rejected} pass`;
  const dep = result.dependence.ok ? `PC1 share ${result.dependence.pc1Share}, effective N ${result.dependence.effN}` : '';
  const resultText = `Harness run ${date} (${result.spec.sample.isEnd}→${result.spec.sample.to} OOS). ${icTxt}. ${pnlTxt}. ${defl}. ${dep}. Costs ${result.costs.rule}.`;
  return {
    entry: { id: result.id, domain, verdict, date, doc, claim, result: resultText, use, instruments: instruments ?? result.spec.universe.map(s => s.toUpperCase()), harness: true },
    power: { id: result.id, n, note: `${result.spec.primary === 'ic' ? icTxt : pnlTxt}; ${defl}` },
  };
}
