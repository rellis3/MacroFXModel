// js/sourceConflict.js — when two feeds for the same thing disagree, which one is wrong?
//
// WHY. The brief compares FRED's DCOILWTICO against OANDA's WTICO_USD on a shared date and
// calls anything past 4% a DATA CONFLICT, which blocks every oil-driven read and feeds the
// board's trade gate. Two things are wrong with that.
//
// ONE: a flat threshold on the LEVEL measures structure, not disagreement. The two are
// different instruments -- FRED is the spot Cushing settle, OANDA a front-month CFD -- and
// FRED sat 1.0% to 3.4% ABOVE OANDA on every quiet day of the week checked. A 4% line only
// needs that basis to drift a little to trip, which is a fixed offset being reported as a
// fault. What matters is the gap moving away from ITS OWN usual level.
//
// TWO: "the sources disagree, so treat oil as unsupported" throws away a working number.
// Over 125 shared dates FRED printed 2 days beyond 4 robust standard deviations of its own
// daily move with no matching move in OANDA (-16.1% on 2026-04-08, +16.6% on 2026-09-28);
// OANDA printed none. A jump one series shows and the other does not is a bad print, and
// the desk still had a perfectly good oil price -- just not FRED's.
//
// (FRED leaves holidays EMPTY, not zero, and _fredCsv already drops them via parseFloat.
// An earlier pass of this analysis coerced "" with unary + instead, read it as 0, and
// invented four zero-price days that do not exist. Hence the explicit a > 0 guard below
// and nothing more dramatic.)
//
// So: judge the basis against its own distribution, and name the series that moved
// implausibly. Both are robust (median/MAD) because the thing being detected is an
// outlier, and a mean would be dragged by the very print being hunted.
//
// Pure: arrays in, plain object out. No fetch, no DOM.

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** Median absolute deviation, scaled to compare with a standard deviation. */
export function mad(values) {
  const m = median(values);
  if (m == null) return null;
  const d = median(values.map(v => Math.abs(v - m)));
  return d == null ? null : d * 1.4826;
}

/** Percent changes of a series, oldest first. */
const changes = vals => vals.slice(1).map((v, i) => (vals[i] ? (v - vals[i]) / vals[i] * 100 : null)).filter(Number.isFinite);

/**
 * How far today's gap sits from the gap these two feeds normally run.
 *
 * @param {Array} rows [{date, a, b}] oldest first, one row per SHARED date
 * @returns {{n, basis, spread, latest, gap, z, diverged}|null}
 */
export function basisStats(rows, { k = 3, exclude = null } = {}) {
  const usable = (rows ?? []).filter(r => r && Number.isFinite(r.a) && Number.isFinite(r.b) && r.a > 0);
  if (usable.length < 6) return null;             // too few shared dates to know what normal is
  const latest = usable[usable.length - 1];
  // Estimate "normal" from days that are NOT suspect, or a bad print widens the spread it
  // is supposed to stand out against -- on a ten-day window the two WTI outliers lifted the
  // robust spread to 2.49% and buried a real divergence at z = -1.1.
  const base = exclude?.size ? usable.filter(r => !exclude.has(r.date)) : usable;
  const clean = base.length >= 6 ? base : usable;
  const gaps = clean.map(r => (r.b - r.a) / r.a * 100);
  const basis = median(gaps);
  // A floor on the spread: two feeds that have agreed to the decimal all week would
  // otherwise make any difference at all look infinitely significant.
  const spread = Math.max(mad(gaps) ?? 0, 0.25);
  const gap = (latest.b - latest.a) / latest.a * 100;
  const z = (gap - basis) / spread;
  return { n: clean.length, basis: +basis.toFixed(2), spread: +spread.toFixed(2),
           latest, gap: +gap.toFixed(2), z: +z.toFixed(2),
           diverged: Math.abs(z) >= k };
}

/**
 * A print that is an outlier in ONE series and not the other, and that comes straight
 * back. That shape is a bad print; a real move shows up in both and tends to stay.
 *
 * @returns {Array} [{date, series, move, z, reversed}] worst first
 */
export function implausiblePrints(rows, { z = 4, revFrac = 0.5 } = {}) {
  const clean = (rows ?? []).filter(r => r && Number.isFinite(r.a) && Number.isFinite(r.b));
  if (clean.length < 6) return [];
  const out = [];
  for (const key of ['a', 'b']) {
    const vals = clean.map(r => r[key]);
    const ch = changes(vals);
    const sigma = mad(ch);
    if (!sigma) continue;
    for (let i = 0; i < ch.length; i++) {
      const score = Math.abs(ch[i]) / sigma;
      if (score < z) continue;
      // did it come back? the next change reverses at least half of it
      const next = ch[i + 1];
      const reversed = Number.isFinite(next) && Math.sign(next) !== Math.sign(ch[i]) && Math.abs(next) >= Math.abs(ch[i]) * revFrac;
      // and did the OTHER series do the same thing on the same day? then it is a real move
      const otherCh = changes(clean.map(r => r[key === 'a' ? 'b' : 'a']));
      const otherSigma = mad(otherCh) || Infinity;
      const otherScore = Number.isFinite(otherCh[i]) ? Math.abs(otherCh[i]) / otherSigma : 0;
      if (otherScore >= z * 0.5) continue;        // both jumped -- that is the market
      out.push({ date: clean[i + 1]?.date ?? null, series: key, move: +ch[i].toFixed(2), z: +score.toFixed(1), reversed });
    }
  }
  return out.sort((x, y) => y.z - x.z);
}

/**
 * The whole read: is this a conflict, and if so whose fault is it?
 *
 * `verdict` is one of:
 *   agree     the gap is where it usually is and neither feed has printed anything odd
 *   suspect   ONE feed has printed something implausible in the last few sessions -- name
 *             it, say the other is still usable, and let the desk carry on. This is the
 *             actionable case and the one the old flat-threshold check could never reach.
 *   conflict  the gap has moved well off its normal level and NEITHER feed looks faulty.
 *             Genuinely unresolved, and the only case that should stop a read.
 *
 * A recent bad print outranks the gap test on purpose: "FRED jumped 16.6% on a day OANDA
 * moved 0.5%" is a better reason to distrust FRED than any distance between the two, and
 * it survives the gap having partly closed again by the time anyone looks.
 */
export function crossSourceRead(rows, { aName = 'A', bName = 'B', unit = '', k = 3, recent = 4 } = {}) {
  const bad = implausiblePrints(rows);
  const stats = basisStats(rows, { k, exclude: new Set(bad.map(b => b.date)) });
  if (!stats) return null;
  const name = s => (s === 'a' ? aName : bName);
  const fmt = v => (v == null ? '—' : v.toFixed(2));
  const { latest } = stats;
  const dates = (rows ?? []).filter(r => r && Number.isFinite(r.a) && Number.isFinite(r.b) && r.a > 0).map(r => r.date);
  const tail = new Set(dates.slice(-recent));
  const fresh = bad.filter(b => tail.has(b.date));
  const sides = new Set(fresh.map(b => b.series));

  if (fresh.length && sides.size === 1) {
    const c = fresh[0], other = c.series === 'a' ? bName : aName;
    return { verdict: 'suspect', stats, bad, suspect: name(c.series), usable: other,
      line: `${aName} ${fmt(latest.a)}${unit} vs ${bName} ${fmt(latest.b)}${unit} for ${latest.date}, a ${stats.gap >= 0 ? '+' : ''}${stats.gap}% gap where these two normally run ${stats.basis >= 0 ? '+' : ''}${stats.basis}%. `
        + `The problem is ${name(c.series)}: it printed ${c.move >= 0 ? '+' : ''}${c.move}% on ${c.date}${c.reversed ? ' and came straight back' : ''} — ${c.z}× its own typical day, with no matching move in ${other}. `
        + `That is a bad print, not a market move. Use ${other} for anything about this; ${name(c.series)}-derived reads are unsupported until it corrects.` };
  }
  if (stats.diverged) {
    return { verdict: 'conflict', stats, bad,
      line: `DATA CONFLICT — ${aName} reads ${fmt(latest.a)}${unit} for ${latest.date} while ${bName} reads ${fmt(latest.b)}${unit}: a ${stats.gap >= 0 ? '+' : ''}${stats.gap}% gap against a normal ${stats.basis >= 0 ? '+' : ''}${stats.basis}% (${stats.z} robust sd), and neither series shows a print that explains it. `
        + `Both are moving plausibly and they still disagree, so this is unresolved — lead with it and treat reads built on either as unsupported.` };
  }
  return { verdict: 'agree', stats, bad,
    line: `${aName} ${fmt(latest.a)}${unit} and ${bName} ${fmt(latest.b)}${unit} agree for ${latest.date} — a ${stats.gap >= 0 ? '+' : ''}${stats.gap}% gap against the ${stats.basis >= 0 ? '+' : ''}${stats.basis}% these two normally run. They are different contracts, so a steady offset is the instrument, not a fault.` };
}
