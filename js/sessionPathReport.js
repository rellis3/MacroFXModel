/**
 * Session Path — report layer. Turns `sessionPathEngine.js`'s per-checkpoint
 * rows into the SAME shape of reference book `js/levelAtlasReport.js` builds
 * for touch-level data, deliberately mirrored rather than reinvented:
 *
 *   Level Atlas cell   = (side, rung)                          — base rate: continue/reverse
 *   Session Path cell  = (side, rung, checkpointHour, progress, shape) — base rate: reaches the band later
 *
 * `progress`/`shape` are the PRIMARY axis — the whole reason this engine
 * exists (see sessionPathEngine.js's header on the reversal trap) — so they
 * define the cell, not a context dimension tested against it. Everything
 * else (day of week, the overnight gap, today's vol regime, whether the
 * OPPOSITE side has also moved) is a SESSION_DIMENSIONS entry: additional
 * context checked against that cell's own base rate, exactly like Level
 * Atlas's VWAP/VuManChu/session dimensions are checked against a touch's
 * (side, rung) base rate. Same IS/OOS-holding gate throughout (n≥30 both
 * halves, same sign both halves, |Δ|≥3pp both halves) — a dimension never
 * gets shown as a reason unless it survived a check on data it wasn't built
 * from.
 */

const N_FLOOR = 30;
const DELTA_FLOOR = 3;   // percentage points

export const SESSION_DIMENSIONS = [
  ['dow', 'Day of week'],
  ['gapBucket', "Gap from prior day's close"],
  ['dayVol', "Today's volatility vs its own trailing"],
  ['asiaVol', "Asia session volatility vs its own trailing"],
  ['londonVol', "London session volatility vs its own trailing"],
  ['prevCloseLoc', "Yesterday's close vs ITS OWN forecast bands (exhaustion carried over)"],
  ['otherSideProgress', 'Has the OPPOSITE side also moved today (two-way vs one-way so far)'],
  ['wtState', 'WaveTrend state at the checkpoint'],
  ['wtMtf', 'Multi-timeframe WaveTrend alignment at the checkpoint'],
  ['wtSlow', 'Slow-timeframe WaveTrend stretch at the checkpoint'],
  ['momAdx', 'Slow-timeframe trend strength (ADX) at the checkpoint'],
  ['htfTrend', 'Higher-timeframe trend backdrop at the checkpoint'],
  ['vwapSide', 'Band distance beyond session VWAP at the checkpoint'],
  ['confluence', 'Structural confluence near the band at the checkpoint'],
];
const DIM_LABEL = new Map(SESSION_DIMENSIONS);

function rate(rows) {
  if (!rows.length) return null;
  return +(rows.filter(r => r.reachedLater).length / rows.length * 100).toFixed(1);
}

function cellKey(r) { return `${r.side}|${r.rung}|${r.checkpointHour}|${r.progress}|${r.shape}`; }

/**
 * Chronological IS/OOS split (same convention as buildAtlasBook) + one cell
 * per (side, rung, checkpointHour, progress, shape), each with its own base
 * rate plus every SESSION_DIMENSIONS bucket tested against that base rate.
 *
 *   buildSessionPathBook(rows) -> { oosStart, cells: { "up|p75|7|3·most-of-the-way|2·extending": {...} } }
 */
export function buildSessionPathBook(rows, { oosFrac = 0.4 } = {}) {
  if (!rows?.length) return null;
  const dates = [...new Set(rows.map(r => r.date))].sort();
  if (dates.length < 20) return null;
  const oosStart = dates[Math.floor(dates.length * (1 - oosFrac))];
  const isRows = rows.filter(r => r.date < oosStart);
  const oosRows = rows.filter(r => r.date >= oosStart);

  const cells = {};
  const cellGroupsIS = new Map(), cellGroupsOOS = new Map();
  for (const r of isRows) { const k = cellKey(r); if (!cellGroupsIS.has(k)) cellGroupsIS.set(k, []); cellGroupsIS.get(k).push(r); }
  for (const r of oosRows) { const k = cellKey(r); if (!cellGroupsOOS.has(k)) cellGroupsOOS.set(k, []); cellGroupsOOS.get(k).push(r); }

  for (const [key, cellIS] of cellGroupsIS) {
    if (cellIS.length < N_FLOOR) continue;
    const cellOOS = cellGroupsOOS.get(key) ?? [];
    const [side, rung, hourStr, progress, shape] = key.split('|');
    const baseIS = rate(cellIS), baseOOS = rate(cellOOS);

    const dims = {};
    for (const [dimKey] of SESSION_DIMENSIONS) {
      const bucketsIS = new Map();
      for (const r of cellIS) { const v = r[dimKey]; if (v == null) continue; if (!bucketsIS.has(v)) bucketsIS.set(v, []); bucketsIS.get(v).push(r); }
      if (!bucketsIS.size) continue;
      const dim = {};
      for (const [bucket, bIS] of bucketsIS) {
        if (bIS.length < N_FLOOR) continue;
        const bOOS = cellOOS.filter(r => r[dimKey] === bucket);
        const rIS = rate(bIS), rOOS = rate(bOOS);
        if (rIS == null) continue;
        const deltaIS = +(rIS - baseIS).toFixed(1);
        const deltaOOS = rOOS != null && baseOOS != null ? +(rOOS - baseOOS).toFixed(1) : null;
        const holds = bOOS.length >= N_FLOOR && deltaOOS != null && Math.sign(deltaIS) === Math.sign(deltaOOS)
          && Math.abs(deltaIS) >= DELTA_FLOOR && Math.abs(deltaOOS) >= DELTA_FLOOR;
        dim[bucket] = { rateIS: rIS, rateOOS: rOOS, deltaIS, deltaOOS, n: { is: bIS.length, oos: bOOS.length }, holds };
      }
      if (Object.keys(dim).length) dims[dimKey] = dim;
    }

    cells[key] = {
      side, rung, checkpointHour: Number(hourStr), progress, shape,
      base: { is: baseIS, oos: baseOOS, n: { is: cellIS.length, oos: cellOOS.length } },
      dims,
    };
  }
  return { oosStart, cells };
}

/** Every held (dimension, bucket) pair across the whole book, sorted by |Δ IS| descending. */
export function extractHeldSessionFindings(book) {
  if (!book) return [];
  const out = [];
  for (const cell of Object.values(book.cells)) {
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim)) {
        if (g.holds) out.push({ side: cell.side, rung: cell.rung, checkpointHour: cell.checkpointHour, progress: cell.progress, shape: cell.shape,
          base: cell.base, dimKey, dimLabel: DIM_LABEL.get(dimKey) ?? dimKey, bucket, ...g });
      }
    }
  }
  return out.sort((a, c) => Math.abs(c.deltaIS) - Math.abs(a.deltaIS));
}

/**
 * Look up TODAY's live (side, rung, checkpointHour, progress, shape) cell
 * against the book, and check every SESSION_DIMENSIONS field the live row
 * has a reading for — same "no unconfirmed reason shown" contract
 * `matchLiveContext` follows for Level Atlas.
 */
export function matchSessionPath(book, live) {
  if (!book || !live) return null;
  const key = cellKey(live);
  const cell = book.cells[key];
  if (!cell) return null;
  const matched = [];
  for (const [dimKey, dim] of Object.entries(cell.dims)) {
    const liveVal = live[dimKey];
    if (liveVal == null) continue;
    const g = dim[String(liveVal)];
    if (!g || !g.holds) continue;
    matched.push({ dimKey, dimLabel: DIM_LABEL.get(dimKey) ?? dimKey, bucket: liveVal,
      deltaIS: g.deltaIS, deltaOOS: g.deltaOOS, n: g.n, favors: g.deltaIS > 0 ? 'reach' : 'no-reach' });
  }
  matched.sort((a, c) => Math.abs(c.deltaIS) - Math.abs(a.deltaIS));
  return { side: live.side, rung: live.rung, checkpointHour: live.checkpointHour, progress: live.progress, shape: live.shape,
    base: cell.base, matched };
}
