/**
 * Range-Line ZONES view-model — joins the three live artifacts into the per-pair
 * "today's tradeable zones" the range-zones page renders:
 *   • range_line_bot_status.lines  — today's Asia/Monday ladders + live price (what
 *     the bot actually built),
 *   • range_line_bot_plan          — the frozen fade/follow/skip decision per cell,
 *   • range_line_confluence        — today's structural level prices + which source,
 *
 * For each ladder level it emits: the decision, the confluence strength (distinct
 * sources within tolerance → 1·none/2·single/3·multi) + WHICH sources, and the
 * SL/target geometry (SL = the protective stop one rung behind; the exit is a
 * chandelier TRAIL, so `target` is the first level the trade rides toward, not a
 * fixed TP). Pure — takes the parsed artifacts, returns a plain object; no network.
 */

const RANK = { '3·multi': 2, '2·single': 1, '1·none': 0 };

// Confluence at a price: distinct sources within `tol`, the bucket + the source list.
function confAt(level, confLevels, tol) {
  const srcs = new Set();
  if (confLevels && tol > 0) for (const lv of confLevels) if (Math.abs(lv.price - level) <= tol) srcs.add(lv.source || lv.kind);
  const n = srcs.size;
  const bucket = n >= 2 ? '3·multi' : n === 1 ? '2·single' : '1·none';
  return { bucket, count: n, rank: RANK[bucket], sources: [...srcs].sort() };
}

// Inner (toward mid) / outer (away) neighbour among the ladder prices for a side.
function neighbours(level, side, prices) {
  let below = null, above = null;
  for (const p of prices) { if (p < level - 1e-12) below = p; else if (p > level + 1e-12 && above == null) above = p; }
  return side === 'up' ? { inner: below, outer: above } : { inner: above, outer: below };
}

// Build the per-pair zone view-model. `opts.confluenceMin` (default 2) marks which
// zones the live gate would actually take (`gated`). `opts.pipFor(pair)` → pip size
// for distance-in-pips (optional).
export function buildRangeZones({ status, plan, confluence } = {}, opts = {}) {
  const confluenceMin = opts.confluenceMin ?? 2;
  const pipFor = opts.pipFor || (() => 0);
  const lines = status?.lines || [];
  const planInst = plan?.instruments || {};
  const confInst = confluence?.instruments || {};
  const tolFrac = confluence?.tolFrac ?? 0.1;

  const pairs = [];
  for (const ln of lines) {
    const pair = String(ln.instrument || '').toLowerCase();
    const price = ln.price ?? null;
    const pip = pipFor(pair) || confInst[pair]?.pip || 0;
    const policy = planInst[pair]?.policy || {};
    const confLevels = confInst[pair]?.levels || [];
    const takenSet = new Set(ln.taken || []);            // "A|up" style tags
    const zones = [];

    for (const [srcTag, lad] of Object.entries(ln.ladders || {})) {
      const prices = (lad.levels || []).map(l => l.level).sort((a, b) => a - b);
      const tol = tolFrac * ((lad.high - lad.low) || 0);
      for (const lv of lad.levels || []) {
        const cell = `${lv.label}_${lv.side}|`;
        const decision = policy[cell]?.decision || 'skip';
        const { inner, outer } = neighbours(lv.level, lv.side, prices);
        const conf = confAt(lv.level, confLevels, tol);
        const tradeable = decision === 'fade' || decision === 'follow';
        // SL = protective stop (follow: inner / fade: outer); target = the level the
        // trade rides toward (follow: outer/away; fade: inner/toward-mid). The exit is
        // a chandelier trail from there, not a fixed TP.
        const sl = decision === 'follow' ? inner : decision === 'fade' ? outer : null;
        const target = decision === 'follow' ? outer : decision === 'fade' ? inner : null;
        const rung = (inner != null && outer != null) ? Math.abs(outer - lv.level) : null;
        zones.push({
          src: srcTag, label: lv.label, side: lv.side, level: lv.level,
          decision, tradeable,
          confluence: conf,
          gated: tradeable && conf.rank >= confluenceMin,   // would the live ≥N gate take it?
          sl, target, rung,
          taken: takenSet.has(`${srcTag}|${lv.side}`),
          distPips: (price != null && pip > 0) ? +((lv.level - price) / pip).toFixed(1) : null,
        });
      }
    }
    // Nearest-first (by absolute distance to price when known, else by price).
    zones.sort((a, b) => Math.abs(a.distPips ?? (a.level - (price ?? 0))) - Math.abs(b.distPips ?? (b.level - (price ?? 0))));
    pairs.push({
      pair, price, pip,
      asia: ln.ladders?.A ? { low: ln.ladders.A.low, high: ln.ladders.A.high } : null,
      monday: ln.ladders?.M ? { low: ln.ladders.M.low, high: ln.ladders.M.high } : null,
      counts: {
        tradeable: zones.filter(z => z.tradeable).length,
        strong: zones.filter(z => z.gated).length,
      },
      zones,
    });
  }
  pairs.sort((a, b) => (a.pair < b.pair ? -1 : 1));
  return { confluenceMin, tolFrac, pairs };
}
