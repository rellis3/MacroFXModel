/**
 * A composite gauge that shows its working.
 *
 * WHERE THIS CAME FROM. The owner's educator publishes reads like "the inflation gauge
 * reads +0.12 on 100% coverage, with 6 of 10 members on the same side... the loudest
 * member is PPI final demand, at +3.32 z, carrying +0.21 of the score... average hourly
 * earnings reads -3.16 and dissents." That is the best idea on his page, and this desk
 * was missing it in the places it matters most: today.html's risk panel says
 * "Liquidity: expanding, 3/3 central banks agree" and cannot tell you that one bank is
 * carrying the entire reading.
 *
 * THE POINT IS NOT THE NUMBER, IT IS THE FRAGILITY. A composite at +0.6 built from six
 * legs all leaning the same way is a different animal from a composite at +0.6 that is
 * one leg at +3 z and five at zero. Both print the same verdict. Only the second falls
 * over when that one series revises. This desk has already been bitten by the general
 * form of that -- a label that fires on most of the board describes nothing -- and this
 * is the same lesson one level down, inside the label.
 *
 * WHAT IT REPORTS, and why each piece earns its place:
 *   score      the mean of the members that actually printed, never of the full list
 *   coverage   how many printed. A gauge at 40% coverage is a different claim from the
 *              same number at 100%, and averaging over absent members silently pretends
 *              they agreed with the ones present.
 *   agree      how many of the present members share the composite's sign
 *   loudest    the member furthest from zero, and HOW MUCH of the score it carries
 *   dissent    members leaning the other way, loudest first -- the ones a story about
 *              this gauge has to explain away rather than quietly drop
 *   concentrated  true when one member carries most of the reading. That is the flag
 *              worth acting on: it means "this is one series wearing a composite's hat"
 *
 * A WATCH, separately, with TWO thresholds. Arming and standing down at the same level
 * makes a trigger chatter across it; a gap means it has to travel to change state. The
 * caller keeps the returned state and hands it back next time.
 *
 * Pure: no fetch, no DOM, no clock beyond what is passed in. Tested in js/gaugeRead.test.mjs.
 */

/** A member that did not print is absent, not zero. */
const present = m => m && Number.isFinite(m.z);

/**
 * Read a composite from its members.
 *
 * `members`: [{ key, label, z, weight? }] -- z is the member's standardised reading,
 * weight defaults to 1. A member with a null/undefined z is treated as absent.
 */
export function gauge(members = [], { minCoverage = 0.5 } = {}) {
  const all = Array.isArray(members) ? members.filter(m => m && m.key) : [];
  const live = all.filter(present);
  const n = all.length, k = live.length;
  if (!n) return { score: null, n: 0, present: 0, coverage: null, verdict: 'EMPTY' };

  const coverage = k / n;
  if (!k) return { score: null, n, present: 0, coverage: 0, verdict: 'NO DATA', members: [] };

  const wsum = live.reduce((s, m) => s + (m.weight ?? 1), 0) || 1;
  const score = live.reduce((s, m) => s + m.z * (m.weight ?? 1), 0) / wsum;

  // Each member's signed contribution to the score. These sum to the score exactly, so
  // "carrying +0.21 of +0.12" is a statement that can be checked rather than asserted.
  const contrib = live.map(m => ({
    ...m, share: (m.z * (m.weight ?? 1)) / wsum,
  })).sort((a, b) => Math.abs(b.share) - Math.abs(a.share));

  const sign = Math.sign(score);
  const agree = live.filter(m => Math.sign(m.z) === sign && sign !== 0).length;
  const dissent = contrib.filter(m => Math.sign(m.z) === -sign && sign !== 0);
  const loudest = contrib[0] ?? null;

  // How much of the gauge's own magnitude rests on its biggest member. Measured against
  // the sum of absolute contributions, not against the score: a score near zero would
  // otherwise make every share look enormous by division.
  const gross = contrib.reduce((s, m) => s + Math.abs(m.share), 0);
  const concentration = gross > 0 && loudest ? Math.abs(loudest.share) / gross : null;

  return {
    score: +score.toFixed(3),
    n, present: k, coverage: +coverage.toFixed(3),
    thin: coverage < minCoverage,
    agree, agreeOf: k,
    loudest: loudest ? { key: loudest.key, label: loudest.label, z: +loudest.z.toFixed(2), share: +loudest.share.toFixed(3) } : null,
    dissent: dissent.map(m => ({ key: m.key, label: m.label, z: +m.z.toFixed(2), share: +m.share.toFixed(3) })),
    concentration: concentration == null ? null : +concentration.toFixed(3),
    // one member carrying more than half the gross movement is a composite in name only
    concentrated: concentration != null && concentration > 0.5,
    members: contrib.map(m => ({ key: m.key, label: m.label, z: +m.z.toFixed(2), share: +m.share.toFixed(3) })),
    absent: all.filter(m => !present(m)).map(m => m.key),
  };
}

/** The gauge in one sentence, with its own receipts. Returns null when there is nothing to say. */
export function gaugeSentence(g, name = 'the gauge') {
  if (!g || g.score == null) return null;
  const bits = [`${name} reads ${g.score >= 0 ? '+' : ''}${g.score} on ${Math.round(g.coverage * 100)}% coverage`];
  if (g.agreeOf) bits.push(`${g.agree} of ${g.agreeOf} members on the same side`);
  let s = bits.join(', with ') + '.';
  if (g.loudest) s += ` The loudest member is ${g.loudest.label}, at ${g.loudest.z >= 0 ? '+' : ''}${g.loudest.z} z, carrying ${g.loudest.share >= 0 ? '+' : ''}${g.loudest.share} of the score.`;
  if (g.concentrated) s += ` That one member is most of the reading, so treat this as a single series rather than a consensus.`;
  if (g.dissent.length) {
    const d = g.dissent[0];
    s += ` Against that, ${d.label} reads ${d.z >= 0 ? '+' : ''}${d.z} and dissents${g.dissent.length > 1 ? `, along with ${g.dissent.length - 1} other${g.dissent.length > 2 ? 's' : ''}` : ''}.`;
  }
  if (g.thin) s += ` Coverage is thin, so this is a partial read.`;
  return s;
}

/**
 * A two-threshold watch. `arm` and `standDown` must differ, or the state chatters across
 * one level and the "armed for 2 weeks" line becomes meaningless.
 *
 * `prev` is whatever this returned last time, or null on the first call.
 */
export function watch(value, { arm, standDown, prev = null, at = 0, label = 'watch' } = {}) {
  if (!Number.isFinite(arm) || !Number.isFinite(standDown)) throw new TypeError('watch needs both thresholds');
  if (Math.abs(arm) <= Math.abs(standDown)) throw new RangeError('arm must be further from zero than standDown, or the watch chatters');
  const was = prev?.armed === true;
  const v = Number.isFinite(value) ? value : null;
  // No reading holds the previous state rather than inventing a stand-down: absence of
  // data is not evidence the condition passed.
  const armed = v == null ? was : (was ? Math.abs(v) >= Math.abs(standDown) : Math.abs(v) >= Math.abs(arm));
  const changedAt = armed === was ? (prev?.changedAt ?? at) : at;
  return {
    label, armed, value: v, arm, standDown, changedAt,
    sinceDays: at && changedAt ? Math.floor((at - changedAt) / 864e5) : 0,
    stale: v == null,
    // how many times it has armed, so the watch itself can be calibrated later
    arms: (prev?.arms ?? 0) + (armed && !was ? 1 : 0),
  };
}

/** The watch in one sentence. */
export function watchSentence(w) {
  if (!w) return null;
  const d = w.sinceDays;
  const since = d >= 1 ? `, and has been for ${d} day${d === 1 ? '' : 's'}` : '';
  return `The ${w.label} is ${w.armed ? 'ARMED' : 'dormant'}${since}${w.stale ? ' (on a stale reading)' : ''};`
    + ` it arms above ${w.arm} and stands down below ${w.standDown}.`;
}
