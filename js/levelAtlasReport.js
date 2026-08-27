/**
 * Level Atlas Report — turns `atlasWalk()`'s raw touch records into the
 * systematic reference tables. Deliberately NOT a screen: every dimension is
 * reported against every outcome the SAME way every time, whether or not the
 * number is "interesting" or "tradeable". A 38%-of-the-time entry is a complete
 * answer here, not a rejected hypothesis — see js/levelAtlasEngine.js's header
 * for why this engine exists separately from the trading-gated ones
 * (perLineStrategy, forecastAnalyser's Drivers tab).
 *
 * IS/OOS split is still reported — not as a pass/fail gate, but because "does
 * this generalize" is itself part of the honest reference (a cell that only
 * existed in 2018 is a different fact than one that recurs every year).
 *
 * Pure: touches[] in, tables out. No network, no filtering by economic value.
 */

export const DIMENSIONS = [
  ['session', 'Session (Asia/London/NY)'],
  ['dowSession', 'Day of week × session'],
  ['dow', 'Day of week'],
  ['sessionPos', 'Position within the session (early/mid/late)'],
  ['gapBucket', "Gap from prior day's close"],
  ['dayVol', "Today's volatility vs its own trailing"],
  ['asiaVol', "Asia session volatility vs its own trailing"],
  ['londonVol', "London session volatility vs its own trailing"],
  // Cross-reference from Session Handoff's own validated finding (a wild
  // closing session hands off into another wild session 2-4x more often —
  // see js/sessionHandoffEngine.js): the vol regime of WHATEVER session most
  // recently closed, regardless of which one that is. Fills the gap
  // asiaVol/londonVol leave for an Asia-session touch (neither is available
  // yet) — this is causal for every session by construction.
  ['prevSessionVol', 'The session that just closed (whichever it was) — its volatility vs its own trailing'],
  // churn is reported FIRST among the price-action features — this was the
  // single largest effect measured across the whole session (a speed-matched
  // control found one-sided arrivals running 1.2-1.8x, two-sided/churned
  // arrivals to the SAME distance running 0.16-0.43x — opposite verdicts at
  // equal speed) — see js/levelAtlasEngine.js's header for the mechanism.
  ['churn', 'How the price got here: one-sided drive vs two-sided churn'],
  ['otherSideTouchedBefore', 'Was the OPPOSITE line already tagged today (two-way day)'],
  ['approachVel', 'Approach velocity into the line'],
  ['approachER', 'Approach efficiency (driven vs choppy)'],
  ['wtState', 'WaveTrend state at touch (session TF)'],
  ['wtMtf', 'WaveTrend MTF agreement (15m/1h/4h)'],
  ['wtSlow', 'WaveTrend 1h stretch'],
  ['vwapSide', 'Distance beyond session VWAP'],
  ['momAdx', '1h ADX trend/range'],
  ['htfTrend', '4h EMA trend vs the touch direction'],
  ['volClimax', 'Touch-bar tick-volume spike vs its own trailing average'],
  ['roundNum', "The level's own distance to the nearest round number"],
  ['prevCloseLoc', "Yesterday's close vs ITS OWN forecast bands (exhaustion carried over)"],
  ['overlapWindow', 'London/NY overlap (12:00-16:00 UTC), the deepest-liquidity window'],
  // CVOL (CME implied vol) — the one FORWARD-LOOKING signal in the whole book;
  // everything else here is realized. One-day settle lag, see levelAtlasEngine.js.
  ['ivRegime', "Yesterday's implied-vol level vs its own trailing history"],
  ['vrp', 'Implied vol vs realized (variance risk premium) — rich, cheap, or fair'],
  ['ivSkewDir', "Options-market directional skew, oriented to the touch"],
  ['confluence', 'Structural confluence count'],
  ['candleReject', 'Touch-bar wick rejection'],
  ['ordinal', 'Test number (1st/2nd/3rd…)'],
  // Split, not raw `prevOutcome` — found (2026-08) that pooling same-day and
  // cross-day visits into one dimension is actively misleading: the same-day
  // 'neither' bucket is close to a mathematical certainty (a later touch that
  // day has strictly less remaining time than the one that already proved
  // nothing resolves for the rest of the session), which manufactured a false
  // headline effect. Split cleanly: same-day is the single strongest, cleanest
  // finding in the book (session character persists through a retest); cross-
  // day carries ~nothing. See js/levelAtlasEngine.js's comment at their
  // assignment for the full mechanism.
  ['prevOutcomeSameDay', 'Same-session retest: what the last visit to this rung did'],
  ['prevOutcomeCrossDay', 'A different day\'s prior visit to this rung'],
];

const OUTCOMES = ['out', 'back', 'neither'];
// Reused by `matchLiveContext` so a UI never needs its own copy of these
// labels — one definition, DIMENSIONS above.
const DIM_LABEL = new Map(DIMENSIONS);

// Exported (2026-08, alongside asiaFibAtlasEngine's report): these three are
// generic over ANY touch-shaped record carrying {date, outcome, fadePips,
// runPips, pullbackFrac, minsToResolve} — nothing here is forecast-ladder
// specific. asiaFibAtlasReport.js imports them rather than re-deriving the
// same table-building logic a second time (Lego Principle, MD files/CLAUDE.md
// §1) — the two engines' outcome records are the SAME shape by deliberate
// design (see asiaFibAtlasEngine.js's header), so this is a real shared
// computation, not a coincidental resemblance.
export function splitAt(touches, frac = 0.6) {
  const sorted = [...touches].sort((a, b) => a.date.localeCompare(b.date));
  const cut = sorted[Math.floor(sorted.length * frac)]?.date;
  return { split: cut, is: touches.filter(t => t.date < cut), oos: touches.filter(t => t.date >= cut) };
}

// Percentiles of a numeric array — a mean hides whether an outcome is "usually
// fast, occasionally very slow" vs uniformly middling; the book should show both.
export function pctiles(arr, ps = [25, 50, 75]) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const out = {};
  for (const p of ps) out[`p${p}`] = +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(0);
  return out;
}

// One dimension's table for one (side, rung, rearmFrac) cell: bucket -> {n, out%, back%, neither%},
// plus the numeric outcomes (fadePips/runPips/pullbackFrac/minsToResolve — mean AND spread).
export function tableFor(touches, dimKey) {
  const groups = {};
  for (const t of touches) {
    const b = t[dimKey]; if (b == null) continue;
    const g = (groups[b] ??= { n: 0, out: 0, back: 0, neither: 0, fadeSum: 0, runSum: 0, pb: [], mtr: [] });
    g.n++; g[t.outcome]++;
    g.fadeSum += t.fadePips; g.runSum += t.runPips;
    if (t.pullbackFrac != null) g.pb.push(t.pullbackFrac * 100);
    if (t.minsToResolve != null) g.mtr.push(t.minsToResolve);
  }
  const out = {};
  for (const [b, g] of Object.entries(groups)) {
    out[b] = {
      n: g.n,
      outPct: +(g.out / g.n * 100).toFixed(1), backPct: +(g.back / g.n * 100).toFixed(1), neitherPct: +(g.neither / g.n * 100).toFixed(1),
      avgFadePips: +(g.fadeSum / g.n).toFixed(1), avgRunPips: +(g.runSum / g.n).toFixed(1),
      avgPullback: g.pb.length ? +(g.pb.reduce((s, v) => s + v, 0) / g.pb.length).toFixed(0) : null,
      pullbackPctiles: pctiles(g.pb),
      avgMinsToResolve: g.mtr.length ? +(g.mtr.reduce((s, v) => s + v, 0) / g.mtr.length).toFixed(0) : null,
      resolvePctiles: pctiles(g.mtr),
    };
  }
  return out;
}

// Verdict floor for a dimension BUCKET (not the cell's own headline lean, which
// uses its own floor in buildAtlasCard). A bucket "holds" only if its lift vs
// the cell's own base rate clears `minDelta` points AND keeps the SAME SIGN in
// BOTH halves AND both halves clear `minN`. This exists specifically so a UI
// can auto-pick "interesting" chips from ~16 dimensions × several buckets each
// per cell WITHOUT that auto-pick turning into a fishing expedition — every
// render would otherwise be free to surface whichever of ~50+ cells looks
// biggest that day, with no check it ever survived a split. `holdsOOS` is the
// gate; nothing downstream should present a chip that fails it as a reason.
// Exported (2026-08): the OOS-holding gate is THE shared function every
// reference book must go through identically (REFERENCE_ENGINE_PLAYBOOK.md
// §3.2) — vwapFixedSigmaReport.js imports it rather than growing a copy.
export function annotateHolds(dims, baseIS, baseOOS, { minN = 30, minDelta = 3 } = {}) {
  for (const dim of Object.values(dims)) {
    for (const bucket of Object.keys(dim.is)) {
      const bi = dim.is[bucket], bo = dim.oos[bucket];
      const dIS = +(bi.outPct - baseIS.outPct).toFixed(1);
      const dOOS = bo ? +(bo.outPct - baseOOS.outPct).toFixed(1) : null;
      bi.deltaOut = dIS;
      const holds = bo != null && bi.n >= minN && bo.n >= minN
        && Math.abs(dIS) >= minDelta && Math.abs(dOOS) >= minDelta
        && Math.sign(dIS) === Math.sign(dOOS);
      bi.holdsOOS = holds;
      if (bo) { bo.deltaOut = dOOS; bo.holdsOOS = holds; }
    }
  }
}

/**
 * Build the full book for one instrument's touches: every (side, rung) cell at
 * a chosen re-arm definition, every dimension, IS and OOS.
 *
 *   buildAtlasBook(touches, { rearmFrac: 0.3 })
 *     -> { instrument, splitDate, cells: { 'up|p50': { base:{is,oos}, dims:{approachVel:{is,oos}, ...} }, ... } }
 *
 * Every dimension bucket also carries `deltaOut` (lift in continuation-rate vs
 * this CELL's own base, not the raw outPct — so a dimension that's just
 * re-deriving the cell's known lean doesn't look "interesting" on its own) and
 * `holdsOOS` (see `annotateHolds`).
 */
export function buildAtlasBook(touches, { rearmFrac = 0.3 } = {}) {
  const pool = touches.filter(t => t.rearmFrac === rearmFrac);
  if (!pool.length) return null;
  const { split, is, oos } = splitAt(pool);
  const instrument = pool[0].instrument;

  const cells = {};
  for (const side of ['up', 'down']) {
    for (const rung of ['p50', 'p75', 'p90']) {
      const key = `${side}|${rung}`;
      const cellIS = is.filter(t => t.side === side && t.rung === rung);
      const cellOOS = oos.filter(t => t.side === side && t.rung === rung);
      if (!cellIS.length) continue;
      const base = { is: summarizeAll(cellIS), oos: cellOOS.length ? summarizeAll(cellOOS) : null };
      const dims = {};
      for (const [dimKey] of DIMENSIONS) {
        const tIs = tableFor(cellIS, dimKey), tOos = tableFor(cellOOS, dimKey);
        if (!Object.keys(tIs).length) continue;
        dims[dimKey] = { is: tIs, oos: tOos };
      }
      if (base.oos) annotateHolds(dims, base.is, base.oos);
      cells[key] = { n: { is: cellIS.length, oos: cellOOS.length }, base, dims };
    }
  }
  return { instrument, splitDate: split, cells };
}

/**
 * Every dimension-bucket entry across the whole book that clears `holdsOOS`,
 * flattened and sorted by |effect size|. This IS "read the book for real
 * findings" made mechanical: instead of eyeballing 6 cells × 16 dimensions ×
 * several buckets of tables, pull only what survived the split, biggest first.
 * Also the exact list a live evaluator will later intersect against today's
 * actual state to decide which context chips to show.
 */
export function extractHeldFindings(book, { limit = 50 } = {}) {
  if (!book) return [];
  const out = [];
  for (const [cellKey, cell] of Object.entries(book.cells)) {
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim.is)) {
        if (!g.holdsOOS) continue;
        const o = dim.oos[bucket];
        out.push({ cellKey, dimKey, bucket, n: { is: g.n, oos: o.n },
          deltaOutIS: g.deltaOut, deltaOutOOS: o.deltaOut,
          outPctIS: g.outPct, outPctOOS: o.outPct, avgFadePips: g.avgFadePips });
      }
    }
  }
  return out.sort((a, b) => Math.abs(b.deltaOutIS) - Math.abs(a.deltaOutIS)).slice(0, limit);
}

export function summarizeAll(touches) {
  const fake = touches.map(t => ({ ...t, _all: 'all' }));
  return tableFor(fake, '_all').all;
}

/**
 * Session-to-session linkage: does a quiet/wild Asia predict a quiet/wild
 * London? A direct answer to "volatility of the session vs the next session" —
 * distinct from using asiaVol as CONTEXT for a touch's outcome (that's a
 * DIMENSIONS row); this is the transition itself, read once per day (not once
 * per touch, so a busy day with many touches doesn't over-weight the vote).
 *
 *   sessionTransitionTable(touches, 'asiaVol', 'londonVol')
 *     -> { '1·quiet': { n, '1·quiet':pct, '2·normal':pct, '3·wild':pct }, ... }
 */
export function sessionTransitionTable(touches, fromKey = 'asiaVol', toKey = 'londonVol') {
  const byDate = new Map();
  for (const t of touches) {
    if (byDate.has(t.date)) continue;   // one vote per day — asiaVol/londonVol are day-level facts anyway
    const from = t[fromKey], to = t[toKey];
    if (from == null || to == null) continue;
    byDate.set(t.date, { from, to });
  }
  const groups = {};
  for (const { from, to } of byDate.values()) { const g = (groups[from] ??= {}); g[to] = (g[to] ?? 0) + 1; }
  const out = {};
  for (const [from, tos] of Object.entries(groups)) {
    const n = Object.values(tos).reduce((s, v) => s + v, 0);
    out[from] = { n, ...Object.fromEntries(Object.entries(tos).map(([to, c]) => [to, +(c / n * 100).toFixed(1)])) };
  }
  return out;
}

/**
 * Compact, JSON-only "card" for one instrument — the shape a UI (today.html's
 * per-pair pcard, or any future analysis panel) can fetch and render directly:
 * one headline per (side, rung), each a chip-ready { label, value, detail,
 * n, sameSignOOS } with the tooltip text pre-written, PLUS the full book for a
 * drill-down. No text formatting, no HTML — the caller decides presentation.
 *
 * `sameSignOOS` marks whether the IS lean (out-favoured vs back-favoured, or
 * vice versa) held in OOS — a UI can use it to grey out a chip that hasn't
 * been shown to generalize, without this module making that call for it.
 */
// A lean is only reported as directional when the gap clears NOISE_FLOOR
// percentage points — an out/back split of 33.2%/33.5% is a coin flip, and
// labelling it "reversion" would overclaim exactly what this whole engine
// exists to avoid. Below the floor, callers should say 'neutral' instead of
// picking whichever side is numerically (and meaninglessly) larger. Module
// scope so `buildAtlasCard` and `matchLiveContext` share ONE definition —
// they'd otherwise be two copies of the same threshold that could drift.
export const NOISE_FLOOR = 3;
export const leanOf = (out, back) => Math.abs(out - back) < NOISE_FLOOR ? 'neutral' : (out >= back ? 'continuation' : 'reversion');

export function buildAtlasCard(book) {
  if (!book) return null;
  const headline = [];
  for (const [key, cell] of Object.entries(book.cells)) {
    const [side, rung] = key.split('|');
    const b = cell.base;
    const lean = leanOf(b.is.outPct, b.is.backPct);
    const leanOOS = b.oos ? leanOf(b.oos.outPct, b.oos.backPct) : null;
    // Every OOS-confirmed context chip available for THIS cell, biggest effect
    // first — the live evaluator's job is to intersect this against today's
    // actual state; a static UI (or a first pass without live data) can just
    // show the top N as "known context for this rung", clearly labelled as
    // historical rather than "happening now".
    const context = [];
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim.is)) {
        if (!g.holdsOOS) continue;
        context.push({ dimKey, bucket, deltaOutIS: g.deltaOut, deltaOutOOS: dim.oos[bucket].deltaOut, n: { is: g.n, oos: dim.oos[bucket].n } });
      }
    }
    context.sort((a, b2) => Math.abs(b2.deltaOutIS) - Math.abs(a.deltaOutIS));
    headline.push({
      side, rung, key,
      label: `${side === 'up' ? '▲' : '▼'} ${rung}`,
      lean,
      // 'neutral' vs anything is not a meaningful agreement/disagreement — only
      // score sameSignOOS when BOTH halves cleared the noise floor.
      sameSignOOS: (leanOOS != null && lean !== 'neutral' && leanOOS !== 'neutral') ? (lean === leanOOS) : null,
      n: cell.n,
      out: b.is.outPct, back: b.is.backPct, neither: b.is.neitherPct,
      outOOS: b.oos?.outPct ?? null, backOOS: b.oos?.backPct ?? null,
      avgFadePips: b.is.avgFadePips, avgRunPips: b.is.avgRunPips, avgPullback: b.is.avgPullback,
      detail: `${side === 'up' ? 'Upper' : 'Lower'} ${rung}: reaches the next rung out ${b.is.outPct}% of the time, `
        + `falls back ${b.is.backPct}%` + (b.oos ? ` (OOS ${b.oos.outPct}% / ${b.oos.backPct}%)` : '')
        + `. Average pullback after a touch is ${b.is.avgPullback}% of the way back.`,
      context,
    });
  }
  return { instrument: book.instrument, splitDate: book.splitDate, headline, cells: book.cells };
}

/**
 * The live-card assembly step: intersect ONE live touch (from
 * `levelAtlasEngine.atlasLiveToday` — context fields only, no outcome, since
 * it hasn't resolved yet) against the STORED historical book for that same
 * (side, rung), and produce the drawer's own "supports / challenges / context"
 * shape (`today.html`'s `drThesisSec` / `.th-row` pattern) so a UI can render
 * it with zero new visual language.
 *
 * For every dimension the book tracked, if the LIVE touch's OWN value for that
 * dimension matches a bucket that `holdsOOS` in the stored book, it becomes one
 * matched context row — SUPPORTS the cell's lean if it points the same way,
 * CHALLENGES it if the opposite way. A dimension the live touch has no reading
 * for (null — e.g. CVOL not covering this instrument) is silently skipped, not
 * asserted as neutral; a `context`-only row when the CELL's own lean is
 * 'neutral' (nothing to support or challenge, by definition).
 *
 *   matchLiveContext(book, liveTouch)
 *     -> { key, lean, sameSignOOS, base:{is,oos}, supports:[...], challenges:[...], liveTouch }
 *     -> null if the book has no data for this (side, rung) cell
 */
export function matchLiveContext(book, liveTouch) {
  if (!book || !liveTouch) return null;
  const key = `${liveTouch.side}|${liveTouch.rung}`;
  const cell = book.cells?.[key];
  if (!cell) return null;
  const b = cell.base;
  const lean = leanOf(b.is.outPct, b.is.backPct);
  const leanOOS = b.oos ? leanOf(b.oos.outPct, b.oos.backPct) : null;
  const sameSignOOS = (leanOOS != null && lean !== 'neutral' && leanOOS !== 'neutral') ? (lean === leanOOS) : null;

  const matched = [];
  for (const [dimKey, dim] of Object.entries(cell.dims)) {
    const liveValue = liveTouch[dimKey];
    if (liveValue == null) continue;
    // Booleans (e.g. otherSideTouchedBefore) become object keys as their
    // string form when the book was built — match on the SAME coercion.
    const bucketKey = String(liveValue);
    const g = dim.is[bucketKey];
    if (!g || !g.holdsOOS) continue;
    const o = dim.oos[bucketKey];
    matched.push({
      dimKey, dimLabel: DIM_LABEL.get(dimKey) ?? dimKey, bucket: liveValue,
      deltaOutIS: g.deltaOut, deltaOutOOS: o?.deltaOut ?? null,
      n: { is: g.n, oos: o?.n ?? 0 },
      favors: g.deltaOut > 0 ? 'out' : 'back',
    });
  }
  matched.sort((a, c) => Math.abs(c.deltaOutIS) - Math.abs(a.deltaOutIS));

  const favorsOut = m => m.favors === 'out';
  const supports = lean === 'neutral' ? []
    : matched.filter(m => favorsOut(m) === (lean === 'continuation'));
  const challenges = lean === 'neutral' ? []
    : matched.filter(m => favorsOut(m) !== (lean === 'continuation'));
  const context = lean === 'neutral' ? matched : [];

  return {
    instrument: liveTouch.instrument, side: liveTouch.side, rung: liveTouch.rung, key,
    ordinal: liveTouch.ordinal, date: liveTouch.date,
    lean, sameSignOOS,
    base: { out: b.is.outPct, back: b.is.backPct, neither: b.is.neitherPct,
            outOOS: b.oos?.outPct ?? null, backOOS: b.oos?.backPct ?? null,
            avgPullback: b.is.avgPullback },
    supports, challenges, context,
    liveTouch,
  };
}

// ── Plain-text renderer — one instrument's book as a readable reference page ──
export function renderBookText(book) {
  if (!book) return '(no data)';
  const lines = [];
  lines.push(`${book.instrument} — Level Atlas  (OOS split ${book.splitDate})`);
  lines.push('='.repeat(70));
  for (const [key, cell] of Object.entries(book.cells)) {
    const [side, rung] = key.split('|');
    lines.push('');
    lines.push(`── ${side.toUpperCase()} ${rung}  (n IS=${cell.n.is} OOS=${cell.n.oos}) ${'─'.repeat(Math.max(0, 30 - key.length))}`);
    const b = cell.base;
    lines.push(`  base:  IS  out ${b.is.outPct}% / back ${b.is.backPct}% / neither ${b.is.neitherPct}%   avg fade ${b.is.avgFadePips}p, run ${b.is.avgRunPips}p, pullback ${b.is.avgPullback}%, resolve ${b.is.avgMinsToResolve}min`);
    if (b.oos) lines.push(`         OOS out ${b.oos.outPct}% / back ${b.oos.backPct}% / neither ${b.oos.neitherPct}%   avg fade ${b.oos.avgFadePips}p, run ${b.oos.avgRunPips}p, pullback ${b.oos.avgPullback}%, resolve ${b.oos.avgMinsToResolve}min`);
    for (const [dimKey, dimLabel] of DIMENSIONS) {
      const d = cell.dims[dimKey]; if (!d) continue;
      lines.push(`  · ${dimLabel}:`);
      for (const bucket of Object.keys(d.is).sort()) {
        const i = d.is[bucket], o = d.oos[bucket];
        lines.push(`      ${String(bucket).padEnd(14)} n=${String(i.n).padStart(4)}  out ${String(i.outPct).padStart(5)}%/back ${String(i.backPct).padStart(5)}%  fade ${String(i.avgFadePips).padStart(6)}p` +
          (o ? `   |  OOS n=${String(o.n).padStart(4)}  out ${String(o.outPct).padStart(5)}%/back ${String(o.backPct).padStart(5)}%  fade ${String(o.avgFadePips).padStart(6)}p` : '   |  OOS —'));
      }
    }
  }
  return lines.join('\n');
}
