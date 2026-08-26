/**
 * Session Handoff — report layer. Same IS/OOS-holding architecture as
 * `js/sessionPathReport.js` (n≥30 both halves, same sign both halves, |Δ|≥3pp
 * both halves before a dimension is ever shown as a reason) — but TWO books,
 * not one, because `sessionHandoffEngine.js` genuinely found two separate
 * questions with two separate answers on the same rows:
 *
 *   CONTINUATION book — cell (transition, side, giveback), outcome `continued`
 *     Checked on real EURUSD/GOLD/GBPUSD/US30/NQ: a clean 48-53% coin flip
 *     everywhere. Built for completeness/honesty (a reference book records a
 *     null exactly like a positive — see the project's "no signal search"
 *     ethos) — do not expect this book to surface many/any held findings.
 *
 *   VOL-CLUSTER book — cell (transition, vol), outcome `nextVol === '3·wild'`
 *     Checked on the same instruments: a real, strong, monotonic effect
 *     (quiet-closing → next-wild ~11-17%, wild-closing → next-wild ~33-41%).
 *     This is THE finding this engine exists to surface.
 *
 * Both books share one generic builder (`buildBook`) parameterised by a
 * cell-key function and an outcome-predicate — not two copies of the same
 * IS/OOS-splitting logic.
 */

const N_FLOOR = 30;
const DELTA_FLOOR = 3;   // percentage points

export const CONTINUATION_DIMENSIONS = [
  ['travel', "The closing session's own one-sidedness (churned vs driven)"],
  ['vol', "The closing session's volatility vs its own trailing"],
  ['dow', 'Day of week'],
];
export const VOL_CLUSTER_DIMENSIONS = [
  ['side', 'Which direction the closing session leaned'],
  ['giveback', 'How much of its own move the closing session gave back by its close'],
  ['travel', "The closing session's own one-sidedness (churned vs driven)"],
  ['dow', 'Day of week'],
  // Persistence check (#4): the cell is already conditioned on `vol` (the
  // IMMEDIATE predecessor's regime) — testing `prevVol` (one hop further
  // back) against that SAME cell's base rate asks whether the clustering
  // effect has memory beyond a single handoff, not just whether volatility
  // clusters at all (already established by the cell's own base rate).
  ['prevVol', 'The session BEFORE the one that just closed — its volatility vs its own trailing'],
];
const DIM_LABEL = new Map([...CONTINUATION_DIMENSIONS, ...VOL_CLUSTER_DIMENSIONS]);

function rate(rows, outcomeFn) {
  if (!rows.length) return null;
  return +(rows.filter(outcomeFn).length / rows.length * 100).toFixed(1);
}

/**
 * Generic IS/OOS book builder — one cell per `cellKeyFn(row)`, outcome rate
 * per cell from `outcomeFn(row)`, every `dimensions` bucket tested against
 * that cell's own base rate. Same convention as `buildSessionPathBook`.
 */
function buildBook(rows, { cellKeyFn, outcomeFn, dimensions, oosFrac = 0.4 }) {
  if (!rows?.length) return null;
  const dates = [...new Set(rows.map(r => r.date))].sort();
  if (dates.length < 20) return null;
  const oosStart = dates[Math.floor(dates.length * (1 - oosFrac))];
  const isRows = rows.filter(r => r.date < oosStart);
  const oosRows = rows.filter(r => r.date >= oosStart);

  const cells = {};
  const cellGroupsIS = new Map(), cellGroupsOOS = new Map();
  for (const r of isRows) { const k = cellKeyFn(r); if (!cellGroupsIS.has(k)) cellGroupsIS.set(k, []); cellGroupsIS.get(k).push(r); }
  for (const r of oosRows) { const k = cellKeyFn(r); if (!cellGroupsOOS.has(k)) cellGroupsOOS.set(k, []); cellGroupsOOS.get(k).push(r); }

  for (const [key, cellIS] of cellGroupsIS) {
    if (cellIS.length < N_FLOOR) continue;
    const cellOOS = cellGroupsOOS.get(key) ?? [];
    const baseIS = rate(cellIS, outcomeFn), baseOOS = rate(cellOOS, outcomeFn);

    const dims = {};
    for (const [dimKey] of dimensions) {
      const bucketsIS = new Map();
      for (const r of cellIS) { const v = r[dimKey]; if (v == null) continue; if (!bucketsIS.has(v)) bucketsIS.set(v, []); bucketsIS.get(v).push(r); }
      if (!bucketsIS.size) continue;
      const dim = {};
      for (const [bucket, bIS] of bucketsIS) {
        if (bIS.length < N_FLOOR) continue;
        const bOOS = cellOOS.filter(r => r[dimKey] === bucket);
        const rIS = rate(bIS, outcomeFn), rOOS = rate(bOOS, outcomeFn);
        if (rIS == null) continue;
        const deltaIS = +(rIS - baseIS).toFixed(1);
        const deltaOOS = rOOS != null && baseOOS != null ? +(rOOS - baseOOS).toFixed(1) : null;
        const holds = bOOS.length >= N_FLOOR && deltaOOS != null && Math.sign(deltaIS) === Math.sign(deltaOOS)
          && Math.abs(deltaIS) >= DELTA_FLOOR && Math.abs(deltaOOS) >= DELTA_FLOOR;
        dim[bucket] = { rateIS: rIS, rateOOS: rOOS, deltaIS, deltaOOS, n: { is: bIS.length, oos: bOOS.length }, holds };
      }
      if (Object.keys(dim).length) dims[dimKey] = dim;
    }

    cells[key] = { base: { is: baseIS, oos: baseOOS, n: { is: cellIS.length, oos: cellOOS.length } }, dims };
  }
  return { oosStart, cells };
}

const continuationCellKey = r => `${r.transition}|${r.side}|${r.giveback}`;
const continuationOutcome = r => r.continued === true;
export function buildContinuationBook(rows, opts = {}) {
  const book = buildBook(rows, { cellKeyFn: continuationCellKey, outcomeFn: continuationOutcome, dimensions: CONTINUATION_DIMENSIONS, ...opts });
  if (book) for (const [key, cell] of Object.entries(book.cells)) { const [transition, side, giveback] = key.split('|'); Object.assign(cell, { transition, side, giveback }); }
  return book;
}

const volClusterCellKey = r => `${r.transition}|${r.vol}`;
const volClusterOutcome = r => r.nextVol === '3·wild';
function meanOf(arr) { return arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(3) : null; }
export function buildVolClusterBook(rows, opts = {}) {
  const book = buildBook(rows, { cellKeyFn: volClusterCellKey, outcomeFn: volClusterOutcome, dimensions: VOL_CLUSTER_DIMENSIONS, ...opts });
  if (!book) return book;
  // `meanNextRatio` — the continuous companion to the `3·wild` THRESHOLD
  // outcome above: the average of the next session's own range ÷ its
  // trailing median (nextRatio, already computed by the engine), not just
  // whether it crossed the wild cutoff. A cell can show a rising mean even
  // when the wild-rate itself doesn't move much, or vice versa — reported
  // descriptively (a mean needs no OOS-holds gate to be meaningful the way a
  // rate-delta does), not folded into the holds-gated dimension logic above.
  for (const [key, cell] of Object.entries(book.cells)) {
    const [transition, vol] = key.split('|');
    const cellRows = rows.filter(r => r.transition === transition && r.vol === vol && r.nextRatio != null);
    const isRows = cellRows.filter(r => r.date < book.oosStart), oosRows = cellRows.filter(r => r.date >= book.oosStart);
    cell.meanNextRatio = { is: meanOf(isRows.map(r => r.nextRatio)), oos: meanOf(oosRows.map(r => r.nextRatio)) };
    Object.assign(cell, { transition, vol });
  }
  return book;
}

/** Every held (dimension, bucket) pair across a book, sorted by |Δ IS| descending. */
export function extractHeldHandoffFindings(book) {
  if (!book) return [];
  const out = [];
  for (const cell of Object.values(book.cells)) {
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim)) {
        if (g.holds) out.push({ transition: cell.transition, side: cell.side, giveback: cell.giveback, vol: cell.vol,
          base: cell.base, dimKey, dimLabel: DIM_LABEL.get(dimKey) ?? dimKey, bucket, ...g });
      }
    }
  }
  return out.sort((a, c) => Math.abs(c.deltaIS) - Math.abs(a.deltaIS));
}

/** Look up a live row's cell in a book (either book — same key shape as its own builder) and check held dimensions. */
function matchHandoff(book, live, cellKeyFn) {
  if (!book || !live) return null;
  const key = cellKeyFn(live);
  const cell = book.cells[key];
  if (!cell) return null;
  const matched = [];
  for (const [dimKey, dim] of Object.entries(cell.dims)) {
    const liveVal = live[dimKey];
    if (liveVal == null) continue;
    const g = dim[String(liveVal)];
    if (!g || !g.holds) continue;
    matched.push({ dimKey, dimLabel: DIM_LABEL.get(dimKey) ?? dimKey, bucket: liveVal,
      deltaIS: g.deltaIS, deltaOOS: g.deltaOOS, n: g.n, favors: g.deltaIS > 0 ? 'yes' : 'no' });
  }
  matched.sort((a, c) => Math.abs(c.deltaIS) - Math.abs(a.deltaIS));
  return { base: cell.base, meanNextRatio: cell.meanNextRatio ?? null, matched };
}
export const matchContinuation = (book, live) => matchHandoff(book, live, continuationCellKey);
export const matchVolCluster = (book, live) => matchHandoff(book, live, volClusterCellKey);
