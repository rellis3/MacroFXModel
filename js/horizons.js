/**
 * The same market over three horizons, and what the SHAPE of that tells you.
 *
 * THE GAP THIS FILLS. The board can show you a day, a week or a month — one at a
 * time. But "the Nasdaq is +5.2% over a month" and "the Nasdaq is −0.8% today" are
 * the same market telling two different stories, and the interesting information is
 * in the disagreement. A trend that is still running and a trend that rolled over
 * last Tuesday look identical on a monthly number.
 *
 * WHAT IT MEASURES. Not the sizes — the PACE. A market up 6% in twenty sessions is
 * moving 0.3% a day; if it did 1.2% yesterday it is going four times its own recent
 * speed, and that is a different fact from the 6%. Comparing per-day pace across
 * horizons is what turns three numbers into a shape.
 *
 * THE SHAPES, and each is a thing worth recognising on sight:
 *   REVERSING     the month says one way, this week and today say the other. The
 *                 trend rolled over, and a monthly number is the last to show it.
 *   ACCELERATING  same direction throughout, and getting faster. Either conviction
 *                 is building or a position is being forced.
 *   STALLING      a real month, and then nothing this week. The move is over, though
 *                 a big monthly number keeps implying it for weeks afterwards.
 *   STEADY        same direction, same pace. The boring one, and the base case.
 *
 * WHAT IT IS NOT. No forward claim whatsoever. "Accelerating" does not mean it keeps
 * going; this desk has tested direction from every angle it has and found nothing.
 * The shape describes what has already happened and nothing else.
 *
 * Pure: no fetch, no DOM. Tested in js/horizons.test.mjs.
 */

const BACK = 6;   // how far to walk back for a real print, matching the rest of the board

/** The last real value at or before i, because feed calendars disagree. */
function lastAt(series, i) {
  for (let j = i; j >= 0 && j > i - BACK; j--) { const v = series?.[j]; if (v != null) return { v, j }; }
  return null;
}

/** Change over `w` sessions, in the series' own unit. */
function move(bundle, spec, i, w) {
  const s = bundle?.series?.[spec.key];
  if (!s) return null;
  const now = lastAt(s, i); if (!now) return null;
  const then = lastAt(s, now.j - w); if (!then) return null;
  if (spec.kind === 'price') return then.v === 0 ? null : (now.v / then.v - 1) * 100;
  if (spec.kind === 'rate' || spec.kind === 'gap') return (now.v - then.v) * 100;   // -> bp
  return now.v - then.v;
}

const sign = v => (v == null || Math.abs(v) < 1e-9) ? 0 : (v > 0 ? 1 : -1);

/**
 * Classify the shape. `noise` is the market's own typical one-day move, so "meaningful"
 * means meaningful FOR THIS MARKET rather than against a fixed number.
 */
export function shapeOf({ d1, d5, d20 }, noise) {
  if (d1 == null || d5 == null || d20 == null || !(noise > 0)) return null;
  // Moves grow with the SQUARE ROOT of time, so a twenty-session move has to be
  // judged against roughly 4.5x the daily noise, not against the daily noise itself.
  // Comparing a month to a day put every one of 41 markets above the bar and left
  // NOTHING quiet -- which is the one answer a market board should give most often.
  const bigN = (v, w) => Math.abs(v) >= noise * Math.sqrt(w) * 1.5;
  const big5 = bigN(d5, 5), big20 = bigN(d20, 20);
  // per-day pace, which is the only way three windows are comparable
  const p1 = Math.abs(d1), p5 = Math.abs(d5) / 5, p20 = Math.abs(d20) / 20;

  if (!big20 && !big5 && Math.abs(d1) < noise) return { shape: 'quiet', pace: [p1, p5, p20] };
  if (sign(d20) !== 0 && sign(d5) !== 0 && sign(d20) !== sign(d5) && sign(d5) === sign(d1) && big5)
    return { shape: 'reversing', pace: [p1, p5, p20] };
  if (big20 && Math.abs(d5) < noise * Math.sqrt(5) * 0.8)
    return { shape: 'stalling', pace: [p1, p5, p20] };
  if (sign(d20) === sign(d5) && sign(d5) === sign(d1) && p1 > p5 * 1.4 && p5 > p20 * 1.1 && big5)
    return { shape: 'accelerating', pace: [p1, p5, p20] };
  return { shape: 'steady', pace: [p1, p5, p20] };
}

export const SHAPES = {
  reversing: { label: 'Reversing', tone: 'amber',
    means: 'The month says one way and this week says the other. The trend has rolled over, and a monthly number is the last place that shows up — which is exactly why one horizon on its own misleads.' },
  accelerating: { label: 'Accelerating', tone: 'blue',
    means: 'Same direction throughout, and moving faster than its own recent pace. That is either conviction building or a position being forced out, and the two look identical from here — the options book and open interest are where you tell them apart.' },
  stalling: { label: 'Stalling', tone: 'grey',
    means: 'A real move over the month, and then nothing this week. It is over. A big monthly number keeps implying a story for weeks after the story stopped, and this is the flag for that.' },
  steady: { label: 'Steady', tone: 'bull',
    means: 'Same direction, same pace, across all three windows. The boring one and the base case — a trend doing what a trend does.' },
  quiet: { label: 'Quiet', tone: 'grey',
    means: 'Nothing beyond its own ordinary movement at any horizon, on any of the three windows. This is most markets on most days, and it is worth seeing how many rows carry it — the proportion of the board doing nothing is the context every other shape is read against.' },
};

/**
 * Every market, over all three horizons.
 *
 * `noise` per market is the median absolute one-day move over the trailing quarter —
 * the only fair yardstick, since 40bp is enormous for the 2-year and nothing for
 * bitcoin.
 */
export function horizonBoard(bundle, board = [], i = (bundle?.dates?.length ?? 1) - 1) {
  const rows = [];
  for (const spec of board) {
    const s = bundle?.series?.[spec.key];
    if (!s) continue;
    const daily = [];
    for (let j = Math.max(1, i - 60); j <= i; j++) {
      const a = lastAt(s, j - 1), b = lastAt(s, j);
      if (!a || !b || a.j === b.j) continue;
      daily.push(spec.kind === 'price' ? Math.abs((b.v / a.v - 1) * 100)
        : (spec.kind === 'rate' || spec.kind === 'gap') ? Math.abs((b.v - a.v) * 100) : Math.abs(b.v - a.v));
    }
    if (daily.length < 15) continue;
    const sorted = daily.slice().sort((a, b) => a - b);
    const noise = sorted[Math.floor(sorted.length / 2)];
    const d = { d1: move(bundle, spec, i, 1), d5: move(bundle, spec, i, 5), d20: move(bundle, spec, i, 20) };
    const sh = shapeOf(d, noise);
    if (!sh) continue;
    rows.push({ key: spec.key, label: spec.label, group: spec.group, kind: spec.kind, what: spec.what,
      ...d, noise: +noise.toFixed(3), ...sh,
      // how many of its own ordinary days today was worth
      dayInNoise: noise > 0 ? +(Math.abs(d.d1) / noise).toFixed(1) : null });
  }
  return rows;
}

/**
 * What is worth saying about the shapes, as counts plus the notable names.
 *
 * Counts first because the proportion is the information: two markets reversing is
 * noise, fifteen is a turn.
 */
export function horizonFindings(rows = []) {
  const by = k => rows.filter(r => r.shape === k);
  const out = [];
  for (const k of ['reversing', 'accelerating', 'stalling']) {
    const g = by(k);
    if (!g.length) continue;
    const top = g.slice().sort((a, b) => Math.abs(b.d20) - Math.abs(a.d20)).slice(0, 4);
    out.push({
      shape: k, n: g.length, share: +(g.length / rows.length).toFixed(2),
      label: SHAPES[k].label, means: SHAPES[k].means,
      markets: top.map(r => r.label),
      // the honest scaling: a handful is weather, a third of the board is a turn
      weight: g.length / rows.length >= 0.25 ? 'broad' : g.length >= 3 ? 'several' : 'isolated',
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Today, measured in this market's own ordinary days. */
export function bigDay(rows = [], mult = 2) {
  return rows.filter(r => (r.dayInNoise ?? 0) >= mult)
    .sort((a, b) => b.dayInNoise - a.dayInNoise);
}
